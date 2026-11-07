import asyncio
import io
import os
import time
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
import openpyxl
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.core.logger import logger
from app.models.bigbasket import (
    BatchEvent,
    BatchExport,
    BatchFileMapping,
    BatchImage,
    BatchSource,
    ImageAiPrediction,
    ImageBatch,
    ImageValidationResult,
    ImageVersion,
    ProcessingAttempt,
)
from app.services.bigbasket.ai_provider import HybridAiManager
from app.services.bigbasket.events import BigBasketEventBroadcaster
from app.services.bigbasket.pipeline import ImageProcessingPipeline
from app.services.bigbasket.storage import BigBasketStorage
from app.services.bigbasket.sub_region_extractor import SubRegionExtractor


class BatchProcessor:
    """Orchestrates chunked batch image processing, background execution, and report generation."""

    # Set of batch IDs requested to pause or cancel
    _PAUSE_REQUESTS = set()
    _CANCEL_REQUESTS = set()

    @classmethod
    def request_pause(cls, batch_id: int):
        cls._PAUSE_REQUESTS.add(batch_id)

    @classmethod
    def request_cancel(cls, batch_id: int):
        cls._CANCEL_REQUESTS.add(batch_id)

    @classmethod
    def resume(cls, batch_id: int):
        cls._PAUSE_REQUESTS.discard(batch_id)
        cls._CANCEL_REQUESTS.discard(batch_id)

    @classmethod
    async def process_batch_background(cls, batch_id: int):
        """Asynchronous execution worker for an image batch."""
        db: Session = SessionLocal()
        try:
            batch = db.query(ImageBatch).filter(ImageBatch.id == batch_id).first()
            if not batch:
                return

            batch.status = "processing"
            db.commit()

            # Record batch event
            cls._log_event(db, batch_id, "started", f"Batch {batch.batch_code} processing started.")

            await BigBasketEventBroadcaster.publish_event({
                "type": "batch_status",
                "batch_id": batch_id,
                "status": "processing",
                "progress_pct": 0,
            })

            ai_manager = HybridAiManager()
            cfg = batch.config or {}
            chunk_size = cfg.get("chunk_size", 10)

            # Query all pending or failed images
            images = (
                db.query(BatchImage)
                .filter(
                    BatchImage.batch_id == batch_id,
                    BatchImage.status.in_(["pending", "failed"]),
                )
                .order_by(BatchImage.id)
                .all()
            )

            total = len(images)
            for idx, img in enumerate(images, start=1):
                # Check pause / cancel requests
                if batch_id in cls._CANCEL_REQUESTS:
                    batch.status = "cancelled"
                    cls._log_event(db, batch_id, "cancelled", "Batch processing was cancelled by user.")
                    db.commit()
                    await BigBasketEventBroadcaster.publish_event({
                        "type": "batch_status",
                        "batch_id": batch_id,
                        "status": "cancelled",
                    })
                    return

                while batch_id in cls._PAUSE_REQUESTS:
                    batch.status = "paused"
                    db.commit()
                    await BigBasketEventBroadcaster.publish_event({
                        "type": "batch_status",
                        "batch_id": batch_id,
                        "status": "paused",
                    })
                    await asyncio.sleep(2.0)

                # Process single image item
                await cls._process_single_image(db, img, batch, ai_manager, cfg)

                # Update batch progress counters
                batch.processed_images = db.query(BatchImage).filter(
                    BatchImage.batch_id == batch_id,
                    BatchImage.status.in_(["auto_approved", "needs_review", "manually_approved", "rejected"]),
                ).count()
                batch.approved_images = db.query(BatchImage).filter(
                    BatchImage.batch_id == batch_id,
                    BatchImage.status.in_(["auto_approved", "manually_approved"]),
                ).count()
                batch.review_needed_images = db.query(BatchImage).filter(
                    BatchImage.batch_id == batch_id,
                    BatchImage.status == "needs_review",
                ).count()
                batch.failed_images = db.query(BatchImage).filter(
                    BatchImage.batch_id == batch_id,
                    BatchImage.status == "failed",
                ).count()
                db.commit()

                # Broadcast live progress
                pct = int((idx / total) * 100) if total > 0 else 100
                await BigBasketEventBroadcaster.publish_event({
                    "type": "image_progress",
                    "batch_id": batch_id,
                    "image_id": img.id,
                    "status": img.status,
                    "processed_count": batch.processed_images,
                    "total_count": batch.total_images,
                    "progress_pct": pct,
                })

                # Yield control briefly every chunk to keep async loop responsive
                if idx % chunk_size == 0:
                    await asyncio.sleep(0.05)

            # Recalculate final totals and counters upon completion
            batch.total_images = db.query(BatchImage).filter(BatchImage.batch_id == batch_id).count()
            batch.processed_images = db.query(BatchImage).filter(
                BatchImage.batch_id == batch_id,
                BatchImage.status.in_(["auto_approved", "needs_review", "manually_approved", "rejected"]),
            ).count()
            batch.approved_images = db.query(BatchImage).filter(
                BatchImage.batch_id == batch_id,
                BatchImage.status.in_(["auto_approved", "manually_approved"]),
            ).count()
            batch.review_needed_images = db.query(BatchImage).filter(
                BatchImage.batch_id == batch_id,
                BatchImage.status == "needs_review",
            ).count()
            batch.failed_images = db.query(BatchImage).filter(
                BatchImage.batch_id == batch_id,
                BatchImage.status == "failed",
            ).count()

            batch.status = "completed"
            cls._log_event(db, batch_id, "completed", f"Batch {batch.batch_code} completed all {batch.processed_images} items.")
            db.commit()

            # Auto-generate export reports
            await cls.generate_export_package(batch_id, db)

            await BigBasketEventBroadcaster.publish_event({
                "type": "batch_status",
                "batch_id": batch_id,
                "status": "completed",
                "progress_pct": 100,
            })
        except Exception as e:
            logger.exception(f"Error processing batch {batch_id}")
            db.rollback()
            b = db.query(ImageBatch).filter(ImageBatch.id == batch_id).first()
            if b:
                b.status = "failed"
                cls._log_event(db, batch_id, "failed", f"Batch processing failed: {str(e)}")
                db.commit()
        finally:
            cls._PAUSE_REQUESTS.discard(batch_id)
            cls._CANCEL_REQUESTS.discard(batch_id)
            db.close()

    @classmethod
    async def _process_single_image(
        cls,
        db: Session,
        img: BatchImage,
        batch: ImageBatch,
        ai_manager: HybridAiManager,
        cfg: Dict[str, Any],
    ):
        t0 = time.perf_counter()
        attempt_num = len(img.attempts) + 1
        attempt = ProcessingAttempt(
            image_id=img.id,
            attempt_number=attempt_num,
            worker_id="local_worker_1",
            status="started",
            started_at=datetime.now(timezone.utc),
        )
        db.add(attempt)
        db.flush()

        try:
            # Read original image file
            orig_path = Path(img.original_file_path)
            if not orig_path.is_absolute() or not orig_path.exists():
                b_dir = BigBasketStorage.get_batch_dir(batch.batch_code)
                cand1 = b_dir / "original" / Path(img.original_filename).name
                cand2 = b_dir / "original" / orig_path.name
                if cand1.exists():
                    orig_path = cand1
                elif cand2.exists():
                    orig_path = cand2

            if not orig_path.exists():
                raise FileNotFoundError(f"Original image file missing: {orig_path}")

            with open(orig_path, "rb") as f:
                raw_bytes = f.read()

            # 1. Classification & AI Inference
            prediction = await ai_manager.analyze_image(
                raw_bytes,
                img.original_filename,
                threshold=cfg.get("confidence_threshold", 0.95),
            )
            ai_pred = ImageAiPrediction(
                image_id=img.id,
                attempt_id=attempt.id,
                provider=prediction["provider"],
                predicted_category=prediction["predicted_category"],
                confidence_score=prediction["confidence_score"],
                tokens_used=prediction.get("tokens_used", 0),
                latency_ms=prediction.get("latency_ms", 0),
                raw_response=prediction.get("raw_response"),
            )
            db.add(ai_pred)

            effective_type = img.image_type
            if effective_type == "unknown" or not effective_type:
                effective_type = prediction["predicted_category"]
                img.image_type = effective_type

            # 2. Pipeline Execution (u2net, padding, inpainting, validation)
            result = ImageProcessingPipeline.process_image(
                image_bytes=raw_bytes,
                image_type=effective_type,
                config=cfg,
                auto_inpaint_mrp=cfg.get("auto_inpaint_mrp", True),
            )

            # 3. Save versions & final output
            seg_path = BigBasketStorage.save_version_file(
                batch.batch_code, img.id, "segmented", result["segmented_image_bytes"]
            )
            v_seg = ImageVersion(
                image_id=img.id,
                version_type="segmented",
                file_path=seg_path,
                is_current=False,
            )
            db.add(v_seg)

            final_path = BigBasketStorage.save_final_output(
                batch.batch_code, img.bbid, img.sequence_order, result["final_image_bytes"]
            )
            v_final = ImageVersion(
                image_id=img.id,
                version_type="final_output",
                file_path=final_path,
                width=result["final_width"],
                height=result["final_height"],
                file_size_bytes=len(result["final_image_bytes"]),
                is_current=True,
            )
            db.add(v_final)

            # 4. Validation results
            val = result["validation"]
            val_record = ImageValidationResult(
                image_id=img.id,
                attempt_id=attempt.id,
                passed=val["passed"],
                dimension_valid=val["dimension_valid"],
                dpi_valid=val["dpi_valid"],
                alpha_valid=val["alpha_valid"],
                padding_valid=val["padding_valid"],
                aspect_ratio_valid=val["aspect_ratio_valid"],
                failure_reasons=val.get("failure_reasons"),
            )
            db.add(val_record)

            # 5. Update image state
            img.status = result["status"]
            img.confidence_score = result["confidence_score"]
            img.final_output_path = final_path
            img.original_width = result["original_width"]
            img.original_height = result["original_height"]

            attempt.status = "success"
            attempt.execution_time_ms = result["execution_time_ms"]
            attempt.ended_at = datetime.now(timezone.utc)

            # 6. Automatic Sub-Region Extraction for Back-of-Pack (BOP) images (Way 2)
            fname_lower = (img.original_filename or "").lower()
            img_type_lower = (img.image_type or "").lower().strip()
            is_bop = (
                img_type_lower in ("bop", "back", "back of pack")
                or (img.sequence_order is not None and img.sequence_order >= 2)
                or any(k in fname_lower for k in ["(2)", "(10)", "back", "bop", "rear", "panel"])
            )
            if is_bop:
                cls._extract_and_register_bop_sub_regions(db, img, batch, raw_bytes, cfg)
        except Exception as e:
            logger.error(f"Failed processing image {img.id}: {e}")
            img.status = "failed"
            img.error_message = str(e)
            attempt.status = "failed"
            attempt.error_type = type(e).__name__
            attempt.error_message = str(e)
            attempt.ended_at = datetime.now(timezone.utc)
            attempt.execution_time_ms = (time.perf_counter() - t0) * 1000

    @classmethod
    def _extract_and_register_bop_sub_regions(
        cls,
        db: Session,
        parent_img: BatchImage,
        batch: ImageBatch,
        raw_bytes: bytes,
        cfg: Dict[str, Any],
    ):
        """
        Way 2: Automated extraction of Nutritional, Ingredients, Manufactured By,
        FSSAI, and Barcode sub-regions from a Back-of-Pack (BOP) image.
        """
        try:
            # Clear only previously auto-generated sub-regions (NEVER delete the parent BOP image itself!)
            stale_sub_imgs = (
                db.query(BatchImage)
                .filter(
                    BatchImage.batch_id == batch.id,
                    BatchImage.bbid == parent_img.bbid,
                    BatchImage.id != parent_img.id,
                    BatchImage.image_type.in_(["ingredient", "nutritional", "manufactured_by", "fssai", "barcode"]),
                )
                .all()
            )
            for s in stale_sub_imgs:
                db.delete(s)
            db.flush()

            # Determine product category (e.g. Hair Care vs Food) from manifest records
            product_cat = "general"
            try:
                source_record = db.query(BatchSource).filter(BatchSource.batch_id == batch.id).first()
                mapping_record = db.query(BatchFileMapping).filter(BatchFileMapping.batch_id == batch.id).first()
                if source_record and mapping_record and source_record.excel_file_path and Path(source_record.excel_file_path).exists():
                    with open(source_record.excel_file_path, "rb") as mf:
                        m_content = mf.read()
                    from app.services.bigbasket.manifest import ManifestParser
                    col_map = mapping_record.excel_column_map or {}
                    records = ManifestParser.parse_records(m_content, source_record.excel_filename, col_map)
                    for r in records:
                        if str(r.get("bbid", "")).strip() == str(parent_img.bbid).strip():
                            product_cat = r.get("category") or product_cat
                            break
            except Exception as cat_err:
                logger.warning(f"Could not load category from manifest: {cat_err}")

            sub_items = SubRegionExtractor.detect_and_extract_sub_regions(
                image_bytes=raw_bytes,
                bbid=parent_img.bbid,
                category=product_cat,
                canvas_width=cfg.get("canvas_width", 2000),
                canvas_height=cfg.get("canvas_height", 2000),
                dpi=cfg.get("dpi", 150),
            )

            b_dir = BigBasketStorage.get_batch_dir(batch.batch_code)
            orig_dir = b_dir / "original"

            for sub in sub_items:
                # 1. Save unscaled original crop file
                crop_orig_path = orig_dir / sub["filename"]
                with open(crop_orig_path, "wb") as f:
                    f.write(sub["original_crop_bytes"])

                # 2. Save final 2000x2000 output canvas
                final_path = BigBasketStorage.save_final_output(
                    batch.batch_code, parent_img.bbid, sub["sequence_order"], sub["canvas_bytes"]
                )

                # 3. Register as new BatchImage in database
                sub_img = BatchImage(
                    batch_id=batch.id,
                    bbid=parent_img.bbid,
                    original_filename=sub["filename"],
                    original_file_path=str(crop_orig_path),
                    final_output_path=str(final_path),
                    image_type=sub["category"],
                    sequence_order=sub["sequence_order"],
                    status="auto_approved",
                    confidence_score=1.0,
                    original_width=sub["crop_width"],
                    original_height=sub["crop_height"],
                    file_size_bytes=len(sub["canvas_bytes"]),
                )
                db.add(sub_img)
                db.flush()

                # Add version record for inspection
                v_final = ImageVersion(
                    image_id=sub_img.id,
                    version_type="final_output",
                    file_path=str(final_path),
                    width=2000,
                    height=2000,
                    file_size_bytes=len(sub["canvas_bytes"]),
                    is_current=True,
                )
                db.add(v_final)

                batch.total_images = (batch.total_images or 0) + 1
                batch.processed_images = (batch.processed_images or 0) + 1
                batch.approved_images = (batch.approved_images or 0) + 1
                db.commit()

                cls._log_event(
                    db,
                    batch.id,
                    "sub_region_extracted",
                    f"Auto-extracted {sub['display_name']} ({sub['filename']}) from BOP for BBID {parent_img.bbid}."
                )
        except Exception as e:
            logger.error(f"Failed sub-region extraction for BOP image {parent_img.id}: {e}")

    @classmethod
    async def generate_export_package(cls, batch_id: int, db: Session) -> Optional[BatchExport]:
        batch = db.query(ImageBatch).filter(ImageBatch.id == batch_id).first()
        if not batch:
            return None

        export_dir = BigBasketStorage.get_export_dir(batch.batch_code)
        zip_path = export_dir / f"{batch.batch_code}_output_images.zip"
        excel_path = export_dir / f"{batch.batch_code}_processing_report.xlsx"

        images = db.query(BatchImage).filter(BatchImage.batch_id == batch_id).order_by(BatchImage.sequence_order).all()

        # 1. Build ZIP package of approved outputs
        exported_count = 0
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for img in images:
                if img.status in ("auto_approved", "manually_approved") and img.final_output_path:
                    p = Path(img.final_output_path)
                    if p.exists():
                        # Standard BigBasket naming: {BBID}_{sequence}.png
                        zf.write(p, arcname=p.name)
                        exported_count += 1

        # 2. Build Excel Exception & Summary Report
        wb = openpyxl.Workbook()
        ws_summary = wb.active
        ws_summary.title = "Batch Summary"

        ws_summary.append(["Batch Code", batch.batch_code])
        ws_summary.append(["Batch Name", batch.name])
        ws_summary.append(["Total Images", batch.total_images])
        ws_summary.append(["Approved Images", batch.approved_images])
        ws_summary.append(["Awaiting Review", batch.review_needed_images])
        ws_summary.append(["Failed Images", batch.failed_images])
        ws_summary.append(["Generated At", datetime.now(timezone.utc).isoformat()])

        ws_details = wb.create_sheet(title="Image Audit Log")
        ws_details.append([
            "Image ID", "BBID", "Original Filename", "Classification",
            "Status", "Confidence", "Width", "Height", "Transparency Valid", "Error Notes"
        ])

        for img in images:
            latest_val = img.validation_results[-1] if img.validation_results else None
            trans_ok = latest_val.alpha_valid if latest_val else False
            err = img.error_message or (", ".join(latest_val.failure_reasons) if latest_val and latest_val.failure_reasons else "")
            ws_details.append([
                img.id,
                img.bbid,
                img.original_filename,
                img.image_type,
                img.status,
                f"{img.confidence_score:.2%}" if img.confidence_score else "N/A",
                img.original_width or 2000,
                img.original_height or 2000,
                "YES" if trans_ok else "NO",
                err,
            ])

        wb.save(excel_path)

        export = BatchExport(
            batch_id=batch_id,
            zip_file_path=str(zip_path),
            excel_report_path=str(excel_path),
            exported_count=exported_count,
        )
        db.add(export)
        db.commit()
        return export

    @staticmethod
    def _log_event(db: Session, batch_id: int, event_type: str, message: str, details: Optional[Dict] = None):
        ev = BatchEvent(
            batch_id=batch_id,
            event_type=event_type,
            message=message,
            details=details,
        )
        db.add(ev)

