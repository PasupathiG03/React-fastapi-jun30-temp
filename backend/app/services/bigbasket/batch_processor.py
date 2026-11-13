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
from app.services.bigbasket.events import BigBasketEventBroadcaster, REDIS_URL
from app.services.bigbasket.pipeline import ImageProcessingPipeline
from app.services.bigbasket.storage import BigBasketStorage
from app.services.bigbasket.sub_region_extractor import OcrError, SubRegionExtractor


class BatchProcessor:
    """Orchestrates chunked batch image processing, background execution, and report generation."""

    # In-memory and Redis-backed state for cross-process synchronization (Celery worker <-> FastAPI)
    _PAUSE_REQUESTS = set()
    _CANCEL_REQUESTS = set()

    @classmethod
    def request_pause(cls, batch_id: int):
        cls._PAUSE_REQUESTS.add(batch_id)
        try:
            import redis
            r = redis.from_url(REDIS_URL)
            r.set(f"batch:pause:{batch_id}", "1", ex=86400)
            r.close()
        except Exception:
            pass

    @classmethod
    def request_cancel(cls, batch_id: int):
        cls._CANCEL_REQUESTS.add(batch_id)
        try:
            import redis
            r = redis.from_url(REDIS_URL)
            r.set(f"batch:cancel:{batch_id}", "1", ex=86400)
            r.delete(f"batch:pause:{batch_id}")
            r.close()
        except Exception:
            pass

    @classmethod
    def resume(cls, batch_id: int):
        cls._PAUSE_REQUESTS.discard(batch_id)
        cls._CANCEL_REQUESTS.discard(batch_id)
        try:
            import redis
            r = redis.from_url(REDIS_URL)
            r.delete(f"batch:pause:{batch_id}")
            r.delete(f"batch:cancel:{batch_id}")
            r.close()
        except Exception:
            pass

    @classmethod
    def is_cancelled(cls, batch_id: int) -> bool:
        if batch_id in cls._CANCEL_REQUESTS:
            return True
        try:
            import redis
            r = redis.from_url(REDIS_URL)
            res = bool(r.exists(f"batch:cancel:{batch_id}"))
            r.close()
            return res
        except Exception:
            return False

    @classmethod
    def is_paused(cls, batch_id: int) -> bool:
        if batch_id in cls._PAUSE_REQUESTS:
            return True
        try:
            import redis
            r = redis.from_url(REDIS_URL)
            res = bool(r.exists(f"batch:pause:{batch_id}"))
            r.close()
            return res
        except Exception:
            return False

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
                # Check pause / cancel requests (cross-process via Redis + local memory)
                if cls.is_cancelled(batch_id):
                    batch.status = "cancelled"
                    cls._log_event(db, batch_id, "cancelled", "Batch processing was cancelled by user.")
                    db.commit()
                    await BigBasketEventBroadcaster.publish_event({
                        "type": "batch_status",
                        "batch_id": batch_id,
                        "status": "cancelled",
                    })
                    return

                while cls.is_paused(batch_id):
                    if cls.is_cancelled(batch_id):
                        batch.status = "cancelled"
                        cls._log_event(db, batch_id, "cancelled", "Batch processing was cancelled by user while paused.")
                        db.commit()
                        await BigBasketEventBroadcaster.publish_event({
                            "type": "batch_status",
                            "batch_id": batch_id,
                            "status": "cancelled",
                        })
                        return
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

            # Note: ZIP and Excel export packages are generated on-demand only when user clicks Export/Download in reports.py

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

            # Authoritative visual classification dynamically determined by Gemini Multimodal Vision AI
            # Works dynamically across any packaging format, material, color, and angle without filename heuristics
            ai_img_type = (prediction.get("predicted_category") or "").lower().strip()
            if ai_img_type and ai_img_type != "unknown":
                effective_type = ai_img_type
                img.image_type = effective_type
            else:
                effective_type = (img.image_type or "unknown").lower().strip()

            # 2. Pipeline Execution (u2net / photoroom, padding, inpainting, validation)
            cfg_with_sku = dict(cfg)
            cfg_with_sku["bbid"] = img.bbid
            cfg_with_sku["filename"] = img.original_filename
            cfg_with_sku["batch_id"] = batch.id
            cfg_with_sku["image_id"] = img.id
            batch_cat = cfg.get("product_category")
            if not batch_cat or batch_cat == "auto":
                cfg_with_sku["product_category"] = prediction.get("primary_category") or prediction.get("product_category") or "UNKNOWN"
            else:
                cfg_with_sku["product_category"] = batch_cat

            # If image classification is uncertain, route it for manual review instead of automatically removing the background.
            # Uses its own threshold, not "confidence_threshold": that one is the QC auto-approval score (often 1.0), and
            # comparing Gemini's 0.99 against 1.0 would randomly skip background removal on clearly-classified images.
            is_uncertain = (
                prediction.get("requires_manual_review", False)
                or prediction.get("confidence_score", 1.0) < cfg.get("classification_confidence_threshold", 0.90)
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
            # Remove any stale final output file if sequence or BBID changed
            if img.final_output_path:
                try:
                    old_final = Path(img.final_output_path)
                    if old_final.exists() and old_final.name != f"{img.bbid}_{img.sequence_order}.png":
                        old_final.unlink()
                except Exception:
                    pass

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
            val["inpaint_applied"] = result.get("inpaint_applied", False)
            val["inpaint_notes"] = result.get("inpaint_notes", [])
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
            img.error_message = result.get("bg_removal_error")

            # Log internal API request audit record ONLY when Photoroom API was actually called and credits consumed
            if result.get("photoroom_called", False):
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
            # Secondary packaging photos (e.g. batch code, MRP, expiry closeups) should not run sub-region extraction
            is_secondary_bop = any(k in fname_lower for k in ("batch", "code", "mrp", "exp", "stamp", "detail"))
            is_bop = (
                img_type_lower in ("bop", "back", "back of pack")
                and img_type_lower not in ("lifestyle", "infographic", "fop")
                and not any(k in img_type_lower for k in ("lifestyle", "infographic", "fop"))
                and not is_secondary_bop
            )
            if is_bop:
                # Detect and store packaging information sections as metadata on the parent BOP image
                info_sections = SubRegionExtractor.detect_information_sections(
                    raw_bytes,
                    bbid=img.bbid,
                    category=getattr(img, "category", "") or "FOOD",
                    batch_id=batch.id,
                    image_id=img.id,
                )
                if not img.validation_results:
                    img.validation_results = {}
                img.validation_results["detected_sections"] = info_sections
                ocr_ok = info_sections.get("ocr_available", True)
                if not ocr_ok:
                    cls._mark_ocr_unavailable(img, info_sections.get("ocr_error"))
                db.commit()

                # Standalone information crops (Ingredients, Nutritional, Marketed/Manufactured By, FSSAI) are extracted
                # by default; a batch can opt out with extract_sub_regions=false.
                if ocr_ok and (cfg.get("extract_standalone_info_images", False) or cfg.get("extract_sub_regions", True)):
                    cls._extract_and_register_bop_sub_regions(db, img, batch, raw_bytes, cfg)
        except Exception as e:
            # A failed flush leaves the session unusable; roll back first so this image is marked failed and the
            # rest of the batch keeps processing instead of the whole batch failing.
            db.rollback()
            logger.error(f"Failed processing image {img.id}: {e}")
            img.status = "failed"
            img.error_message = str(e)

    @staticmethod
    def _mark_ocr_unavailable(img: BatchImage, error: Optional[str]) -> None:
        """OCR failure means the pack text is unknown, not absent: route the image to a human."""
        reason = "OCR unavailable: packaging text could not be read; manual review required."
        val = dict(img.validation_results or {})  # new dict so SQLAlchemy sees the JSON change
        reasons = list(val.get("failure_reasons") or [])
        if reason not in reasons:
            reasons.append(reason)
        val["failure_reasons"] = reasons
        val["passed"] = False
        val["ocr_status"] = {"available": False, "error": error}
        img.validation_results = val
        if img.status in ("auto_approved", None):
            img.status = "needs_review"

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
            # Clear only the crops previously auto-extracted from THIS parent image. They are identified by the
            # "auto_extracted_from" marker, never by image type: a nutritional/ingredient image the user uploaded
            # for the same SKU has the same type and must not be deleted.
            same_sku_imgs = (
                db.query(BatchImage)
                .filter(
                    BatchImage.batch_id == batch.id,
                    BatchImage.bbid == parent_img.bbid,
                    BatchImage.id != parent_img.id,
                )
                .all()
            )
            for s in same_sku_imgs:
                if (s.validation_results or {}).get("auto_extracted_from") == parent_img.id:
                    db.delete(s)
            db.flush()

            # Crops take the next free sequence numbers for this SKU, after every image already in the batch
            # (uploaded images keep their numbers; uq_batch_images_bbid_sequence can't be violated).
            used_seqs = [
                s.sequence_order for s in same_sku_imgs
                if (s.validation_results or {}).get("auto_extracted_from") != parent_img.id and s.sequence_order
            ]
            next_seq = max(used_seqs + [parent_img.sequence_order or 0]) + 1

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

            # Find existing images / crops for this SKU to prevent duplicate images per SRS Section 6 & 8
            existing_crops_by_type = {}
            for s in same_sku_imgs:
                img_t = (s.image_type or "").lower().strip()
                if img_t:
                    existing_crops_by_type[img_t] = s

            for sub in sub_items:
                cat = sub["category"]
                # Deduplication: an SKU should only have ONE crop per sub-region category (FSSAI, Nutritional, etc.)
                if cat in existing_crops_by_type:
                    existing = existing_crops_by_type[cat]
                    new_area = sub["crop_width"] * sub["crop_height"]
                    old_area = (existing.original_width or 0) * (existing.original_height or 0)
                    if new_area > old_area:
                        # Update existing crop file with the more complete/higher resolution extraction
                        try:
                            crop_orig_path = Path(existing.original_file_path)
                            with open(crop_orig_path, "wb") as f:
                                f.write(sub["original_crop_bytes"])
                            final_path = Path(existing.final_output_path)
                            with open(final_path, "wb") as f:
                                f.write(sub["canvas_bytes"])
                            existing.original_width = sub["crop_width"]
                            existing.original_height = sub["crop_height"]
                            existing.file_size_bytes = len(sub["canvas_bytes"])
                            val = dict(existing.validation_results or {})
                            val["auto_extracted_from"] = parent_img.id
                            existing.validation_results = val
                            db.commit()
                        except Exception as upd_err:
                            logger.warning(f"Failed to update existing crop with better version: {upd_err}")
                    # Skip inserting a duplicate image row into the batch table
                    continue

                seq = next_seq
                next_seq += 1
                sub["sequence_order"] = seq
                sub["filename"] = f"{parent_img.bbid}_{seq}_crop.png"

                # 1. Save unscaled original crop file. The "_crop" suffix keeps it from ever overwriting an
                #    uploaded original, whose files are named <bbid>_<seq>.<ext>.
                crop_orig_path = orig_dir / sub["filename"]
                with open(crop_orig_path, "wb") as f:
                    f.write(sub["original_crop_bytes"])

                # 2. Save final 2000x2000 output canvas
                final_path = BigBasketStorage.save_final_output(
                    batch, parent_img.bbid, seq, sub["canvas_bytes"]
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
                        "auto_extracted_from": parent_img.id,
                    },
                )
                db.add(sub_img)
                db.flush()

                batch.total_images = (batch.total_images or 0) + 1
                batch.processed_images = (batch.processed_images or 0) + 1
                batch.approved_images = (batch.approved_images or 0) + 1
                db.commit()

                existing_crops_by_type[cat] = sub_img

                cls._log_event(
                    db,
                    batch.id,
                    "sub_region_extracted",
                    f"Auto-extracted {sub['display_name']} ({sub['filename']}) from BOP for BBID {parent_img.bbid}."
                )
        except OcrError as e:
            logger.error(f"OCR unavailable during sub-region extraction for BOP image {parent_img.id}: {e}")
            db.rollback()
            cls._mark_ocr_unavailable(parent_img, str(e))
            db.commit()
        except Exception as e:
            # Roll back so one failed crop can't leave the session unusable and fail the whole batch.
            db.rollback()
            logger.error(f"Failed sub-region extraction for BOP image {parent_img.id}: {e}")

    @classmethod
    async def generate_export_package(cls, batch_id: int, db: Session, include_all: bool = False) -> Optional[Dict[str, Any]]:
        batch = db.query(ImageBatch).filter(ImageBatch.id == batch_id).first()
        if not batch:
            return None

        export_dir = BigBasketStorage.get_export_dir(batch)
        zip_filename = f"{batch.batch_code}_all_images.zip" if include_all else f"{batch.batch_code}_output_images.zip"
        zip_path = export_dir / zip_filename
        excel_path = export_dir / f"{batch.batch_code}_processing_report.xlsx"

        images = db.query(BatchImage).filter(BatchImage.batch_id == batch_id).order_by(BatchImage.sequence_order).all()

        # 1. Build ZIP package of outputs (approved only by default, or all processed images including needs_review)
        exported_count = 0
        seen_arcnames = set()
        allowed_statuses = ("auto_approved", "manually_approved", "needs_review") if include_all else ("auto_approved", "manually_approved")
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for img in images:
                if img.status in allowed_statuses and img.final_output_path:
                    p = Path(img.final_output_path)
                    if p.exists() and p.name not in seen_arcnames:
                        # Standard BigBasket naming: {BBID}_{sequence}.png
                        zf.write(p, arcname=p.name)
                        seen_arcnames.add(p.name)
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
    async def retry_single_image(cls, db: Session, image_id: int, provider: str = "photoroom") -> BatchImage:
        """
        Retries background removal and image standardization for an individual image
        using the specified provider ('photoroom' or 'rmbg2').
        """
        img = db.query(BatchImage).filter(BatchImage.id == image_id).first()
        if not img:
            raise ValueError(f"Image {image_id} not found")

        batch = db.query(ImageBatch).filter(ImageBatch.id == img.batch_id).first()
        if not batch:
            raise ValueError(f"Batch {img.batch_id} not found")

        ai_manager = HybridAiManager()
        cfg = {**(batch.config or {}), "bg_removal_provider": provider}

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
        cfg = {**(batch.config or {}), "bg_removal_provider": "photoroom"}

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
