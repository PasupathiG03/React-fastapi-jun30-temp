import asyncio
import time
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
import openpyxl
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.core.logger import logger
from app.models.api_usage import ApiUsageLog
from app.models.bigbasket import (
    BatchImage,
    ImageBatch,
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

            # Record batch event in logs
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

            # Auto-generate export reports (saved directly to batch.zip_export_path and batch.excel_report_path)
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
        try:
            # Read original image file
            orig_path = Path(img.original_file_path)
            if not orig_path.is_absolute() or not orig_path.exists():
                b_dir = BigBasketStorage.get_batch_dir(batch)
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
                bbid=img.bbid,
                threshold=cfg.get("confidence_threshold", 0.95),
                batch_id=batch.id,
                image_id=img.id,
            )

            # Authoritative visual classification from Gemini Multimodal Vision AI
            ai_img_type = (prediction.get("predicted_category") or "").lower().strip()
            if ai_img_type and ai_img_type != "unknown":
                effective_type = ai_img_type
                img.image_type = effective_type
            else:
                effective_type = (img.image_type or "fop").lower().strip()

            # 2. Pipeline Execution (u2net / photoroom, padding, inpainting, validation)
            cfg_with_sku = dict(cfg)
            cfg_with_sku["bbid"] = img.bbid
            cfg_with_sku["filename"] = img.original_filename
            batch_cat = cfg.get("product_category")
            if not batch_cat or batch_cat == "auto":
                cfg_with_sku["product_category"] = prediction.get("primary_category") or prediction.get("product_category") or "UNKNOWN"
            else:
                cfg_with_sku["product_category"] = batch_cat

            # If image classification is uncertain, route it for manual review instead of automatically removing the background
            is_uncertain = (
                prediction.get("requires_manual_review", False)
                or prediction.get("confidence_score", 1.0) < cfg.get("confidence_threshold", 0.95)
                or prediction.get("primary_category") in ("UNKNOWN", None)
                or prediction.get("predicted_category") in ("unknown", None)
            )
            cfg_with_sku["is_uncertain"] = is_uncertain
            cfg_with_sku["requires_manual_review"] = is_uncertain

            result = ImageProcessingPipeline.process_image(
                image_bytes=raw_bytes,
                image_type=effective_type,
                config=cfg_with_sku,
                auto_inpaint_mrp=cfg.get("auto_inpaint_mrp", True),
            )

            # 3. Save versions & final output directly into Model 2 (BatchImage)
            seg_path = BigBasketStorage.save_version_file(
                batch, img.id, "segmented", result["segmented_image_bytes"]
            )
            img.segmented_file_path = str(seg_path)

            final_path = BigBasketStorage.save_final_output(
                batch, img.bbid, img.sequence_order, result["final_image_bytes"]
            )
            img.final_output_path = str(final_path)

            # 4. Embedded validation results, Gemini classification & status
            val = dict(result["validation"] or {})
            val["gemini_classification"] = {
                "primary_category": prediction.get("primary_category"),
                "subcategory": prediction.get("subcategory"),
                "product_type": prediction.get("product_type"),
                "image_type": (prediction.get("predicted_category") or img.image_type or "FOP").upper(),
                "is_multi_product_image": prediction.get("is_multi_product_image", False),
                "total_detected_products": prediction.get("total_detected_products", 1),
                "detected_products": prediction.get("detected_products", []),
                "materials": prediction.get("materials", []),
                "components": prediction.get("components", []),
                "visual_properties": prediction.get("visual_properties", []),
                "matched_rules": prediction.get("matched_rules", []),
                "reasoning": prediction.get("reasoning"),
            }
            val["product_category"] = prediction.get("primary_category") or val.get("product_category") or "UNKNOWN"
            val["matched_rules"] = prediction.get("matched_rules", [])
            img.validation_results = val
            img.status = result["status"]
            img.confidence_score = result["confidence_score"]
            img.original_width = result["original_width"]
            img.original_height = result["original_height"]
            img.file_size_bytes = len(result["final_image_bytes"])
            img.error_message = None

            # Log internal API request audit record
            try:
                user_id = img.created_by_id or batch.created_by_id or (getattr(batch, "updated_by_id", None)) or 2
                is_success = result["status"] in ("auto_approved", "needs_review", "manually_approved")
                db.add(ApiUsageLog(
                    user_id=user_id,
                    batch_id=batch.id,
                    image_id=img.id,
                    service_name="Classic background remover",
                    provider="photoroom",
                    status="success" if is_success else "failed",
                    response_code=200 if is_success else 500,
                    latency_ms=int((time.perf_counter() - t0) * 1000),
                    credits=1,
                ))
            except Exception as log_err:
                logger.warning(f"Failed to record API usage log: {log_err}")

            # 5. Information Sections Detection for Back-of-Pack (BOP) images
            fname_lower = (img.original_filename or "").lower()
            img_type_lower = (img.image_type or "").lower().strip()
            is_bop = (
                img_type_lower in ("bop", "back", "back of pack")
                and img_type_lower not in ("lifestyle", "infographic", "fop")
                and not any(k in img_type_lower for k in ("lifestyle", "infographic", "fop"))
            )
            if is_bop:
                # Detect and store packaging information sections as metadata on the parent BOP image
                info_sections = SubRegionExtractor.detect_information_sections(raw_bytes)
                if not img.validation_results:
                    img.validation_results = {}
                img.validation_results["detected_sections"] = info_sections
                db.commit()

                # Standalone information crops are only extracted if explicitly enabled in batch configuration
                if cfg.get("extract_standalone_info_images", False) or cfg.get("extract_sub_regions", False):
                    cls._extract_and_register_bop_sub_regions(db, img, batch, raw_bytes, cfg)
        except Exception as e:
            logger.error(f"Failed processing image {img.id}: {e}")
            img.status = "failed"
            img.error_message = str(e)

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
                    BatchImage.image_type.in_(["ingredient", "nutritional", "manufactured_by", "fssai", "barcode", "caution"]),
                )
                .all()
            )
            for s in stale_sub_imgs:
                db.delete(s)
            db.flush()

            # Determine product category (FOOD, NON_FOOD, or KITCHEN_ITEMS)
            batch_cat = (batch.config or {}).get("product_category") or (batch.config or {}).get("category")
            if not batch_cat or batch_cat == "auto":
                product_cat = (parent_img.validation_results or {}).get("product_category") or "UNKNOWN"
            else:
                product_cat = batch_cat

            sub_items = SubRegionExtractor.detect_and_extract_sub_regions(
                image_bytes=raw_bytes,
                bbid=parent_img.bbid,
                category=product_cat,
                canvas_width=cfg.get("canvas_width", 2000),
                canvas_height=cfg.get("canvas_height", 2000),
                dpi=cfg.get("dpi", 150),
            )

            b_dir = BigBasketStorage.get_batch_dir(batch)
            orig_dir = b_dir / "original"

            for sub in sub_items:
                # 1. Save unscaled original crop file
                crop_orig_path = orig_dir / sub["filename"]
                with open(crop_orig_path, "wb") as f:
                    f.write(sub["original_crop_bytes"])

                # 2. Save final 2000x2000 output canvas
                final_path = BigBasketStorage.save_final_output(
                    batch, parent_img.bbid, sub["sequence_order"], sub["canvas_bytes"]
                )

                # 3. Register as new BatchImage in database (Model 2)
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
                    validation_results={
                        "passed": True,
                        "dimension_valid": True,
                        "dpi_valid": True,
                        "alpha_valid": True,
                        "padding_valid": True,
                        "aspect_ratio_valid": True,
                        "failure_reasons": [],
                    },
                )
                db.add(sub_img)
                db.flush()

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
    async def generate_export_package(cls, batch_id: int, db: Session) -> Optional[Dict[str, Any]]:
        batch = db.query(ImageBatch).filter(ImageBatch.id == batch_id).first()
        if not batch:
            return None

        export_dir = BigBasketStorage.get_export_dir(batch)
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
            val = img.validation_results or {}
            trans_ok = val.get("alpha_valid", False)
            fail_reasons = val.get("failure_reasons", [])
            err = img.error_message or (", ".join(fail_reasons) if fail_reasons else "")
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

        # Update batch record directly (Model 1)
        batch.zip_export_path = str(zip_path)
        batch.excel_report_path = str(excel_path)
        db.commit()

        return {
            "zip_file_path": str(zip_path),
            "excel_report_path": str(excel_path),
            "exported_count": exported_count,
        }

    @classmethod
    async def retry_single_image(cls, db: Session, image_id: int) -> BatchImage:
        """
        Retries Photoroom AI and image standardization for an individual image.
        """
        img = db.query(BatchImage).filter(BatchImage.id == image_id).first()
        if not img:
            raise ValueError(f"Image {image_id} not found")

        batch = db.query(ImageBatch).filter(ImageBatch.id == img.batch_id).first()
        if not batch:
            raise ValueError(f"Batch {img.batch_id} not found")

        ai_manager = HybridAiManager()
        cfg = batch.config or {}

        # Reset status to processing temporarily
        img.status = "processing"
        db.commit()

        # Re-run processing pipeline through Photoroom AI
        await cls._process_single_image(db, img, batch, ai_manager, cfg)

        # Update batch counters
        batch.processed_images = db.query(BatchImage).filter(
            BatchImage.batch_id == batch.id,
            BatchImage.status.in_(["auto_approved", "needs_review", "manually_approved", "rejected"]),
        ).count()
        batch.approved_images = db.query(BatchImage).filter(
            BatchImage.batch_id == batch.id,
            BatchImage.status.in_(["auto_approved", "manually_approved"]),
        ).count()
        batch.review_needed_images = db.query(BatchImage).filter(
            BatchImage.batch_id == batch.id,
            BatchImage.status == "needs_review",
        ).count()
        batch.failed_images = db.query(BatchImage).filter(
            BatchImage.batch_id == batch.id,
            BatchImage.status == "failed",
        ).count()
        db.commit()

        # Notify via SSE broadcaster
        await BigBasketEventBroadcaster.publish_event({
            "type": "image_progress",
            "batch_id": batch.id,
            "image_id": img.id,
            "status": img.status,
            "processed_count": batch.processed_images,
            "total_count": batch.total_images,
            "progress_pct": int((batch.processed_images / max(1, batch.total_images)) * 100),
        })

        return img

    @classmethod
    async def retry_batch_failed_images(cls, db: Session, batch_id: int) -> List[BatchImage]:
        """
        Retries all images in a batch currently in 'needs_review' or 'failed' status with Photoroom AI.
        """
        batch = db.query(ImageBatch).filter(ImageBatch.id == batch_id).first()
        if not batch:
            raise ValueError(f"Batch {batch_id} not found")

        images = db.query(BatchImage).filter(
            BatchImage.batch_id == batch_id,
            BatchImage.status.in_(["needs_review", "failed"]),
        ).all()

        ai_manager = HybridAiManager()
        cfg = batch.config or {}

        for img in images:
            img.status = "processing"
            db.commit()
            await cls._process_single_image(db, img, batch, ai_manager, cfg)

        # Update batch counters
        batch.processed_images = db.query(BatchImage).filter(
            BatchImage.batch_id == batch.id,
            BatchImage.status.in_(["auto_approved", "needs_review", "manually_approved", "rejected"]),
        ).count()
        batch.approved_images = db.query(BatchImage).filter(
            BatchImage.batch_id == batch.id,
            BatchImage.status.in_(["auto_approved", "manually_approved"]),
        ).count()
        batch.review_needed_images = db.query(BatchImage).filter(
            BatchImage.batch_id == batch.id,
            BatchImage.status == "needs_review",
        ).count()
        batch.failed_images = db.query(BatchImage).filter(
            BatchImage.batch_id == batch.id,
            BatchImage.status == "failed",
        ).count()
        db.commit()

        await BigBasketEventBroadcaster.publish_event({
            "type": "batch_status",
            "batch_id": batch.id,
            "status": batch.status,
            "progress_pct": 100,
        })

        return images

    @staticmethod
    def _log_event(db: Session, batch_id: int, event_type: str, message: str, details: Optional[Dict] = None):
        logger.info(f"[BatchEvent batch_id={batch_id} type={event_type}] {message} {details or ''}")
