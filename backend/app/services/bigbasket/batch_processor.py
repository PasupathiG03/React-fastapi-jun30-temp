import asyncio
import os
import time
import zipfile
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Dict, List, Optional, Tuple
import openpyxl
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.core.logger import logger
from app.models.api_usage import ApiUsageLog
from app.models.bigbasket import (
    BatchImage,
    ImageBatch,
)
from app.services.bigbasket.ai_provider import HybridAiManager
from app.services.bigbasket.classification_guard import ConsensusAiManager
from app.services.bigbasket.events import (
    REDIS_CONNECT_TIMEOUT,
    REDIS_URL,
    BigBasketEventBroadcaster,
    mark_redis_down,
    mark_redis_up,
    redis_usable,
)
from app.services.bigbasket.pipeline import ImageProcessingPipeline
from app.services.bigbasket.storage import BigBasketStorage
from app.services.bigbasket.sub_region_extractor import OcrError, SubRegionExtractor

# Statuses that count as "processed" / "approved" in the batch progress counters.
_PROCESSED_STATUSES = ("auto_approved", "needs_review", "manually_approved", "rejected")
_APPROVED_STATUSES = ("auto_approved", "manually_approved")

# Hard ceiling for parallel image workers regardless of config (memory: each in-flight image holds several
# full-resolution arrays).
_MAX_PARALLEL_IMAGES = 8


class BatchProcessor:
    """Orchestrates chunked batch image processing, background execution, and report generation."""

    # In-memory and Redis-backed state for cross-process synchronization (Celery worker <-> FastAPI)
    _PAUSE_REQUESTS = set()
    _CANCEL_REQUESTS = set()

    # ── Redis control flags ────────────────────────────────────────────────────────────────────────────────
    # All Redis access is fail-fast (short connect timeout + circuit breaker in events.py) so an offline Redis
    # never stalls image processing.

    @staticmethod
    def _redis_call(fn, force: bool = False):
        """Runs fn(redis_client) and returns its result, or None if Redis is down/unreachable.

        force=True ignores the circuit breaker; used for pause/cancel/resume writes, which must never be dropped
        just because an earlier check failed.
        """
        if not force and not redis_usable():
            return None
        try:
            import redis
            r = redis.from_url(REDIS_URL, socket_connect_timeout=REDIS_CONNECT_TIMEOUT, socket_timeout=1.0)
            try:
                res = fn(r)
            finally:
                r.close()
            mark_redis_up()
            return res
        except Exception:
            mark_redis_down()
            return None

    @classmethod
    def request_pause(cls, batch_id: int):
        cls._PAUSE_REQUESTS.add(batch_id)
        cls._redis_call(lambda r: r.set(f"batch:pause:{batch_id}", "1", ex=86400), force=True)

    @classmethod
    def request_cancel(cls, batch_id: int):
        cls._CANCEL_REQUESTS.add(batch_id)

        def _set(r):
            r.set(f"batch:cancel:{batch_id}", "1", ex=86400)
            r.delete(f"batch:pause:{batch_id}")

        cls._redis_call(_set, force=True)

    @classmethod
    def resume(cls, batch_id: int):
        cls._PAUSE_REQUESTS.discard(batch_id)
        cls._CANCEL_REQUESTS.discard(batch_id)
        cls._redis_call(lambda r: r.delete(f"batch:pause:{batch_id}", f"batch:cancel:{batch_id}"), force=True)

    @classmethod
    def control_state(cls, batch_id: int) -> Tuple[bool, bool]:
        """Returns (cancelled, paused) from local memory and Redis in a single round trip."""
        cancelled = batch_id in cls._CANCEL_REQUESTS
        paused = batch_id in cls._PAUSE_REQUESTS
        if not (cancelled and paused):
            vals = cls._redis_call(
                lambda r: r.mget(f"batch:cancel:{batch_id}", f"batch:pause:{batch_id}")
            )
            if vals:
                cancelled = cancelled or bool(vals[0])
                paused = paused or bool(vals[1])
        return cancelled, paused

    # ── Counters ───────────────────────────────────────────────────────────────────────────────────────────

    @staticmethod
    def _refresh_batch_counters(db: Session, batch: ImageBatch, include_total: bool = False) -> None:
        """Recomputes the batch progress counters with ONE grouped query (was four COUNT queries)."""
        rows = (
            db.query(BatchImage.status, func.count(BatchImage.id))
            .filter(BatchImage.batch_id == batch.id)
            .group_by(BatchImage.status)
            .all()
        )
        by_status = {status: count for status, count in rows}
        batch.processed_images = sum(by_status.get(s, 0) for s in _PROCESSED_STATUSES)
        batch.approved_images = sum(by_status.get(s, 0) for s in _APPROVED_STATUSES)
        batch.review_needed_images = by_status.get("needs_review", 0)
        batch.failed_images = by_status.get("failed", 0)
        if include_total:
            batch.total_images = sum(by_status.values())

    @staticmethod
    def _resolve_workers(cfg: Dict[str, Any]) -> int:
        try:
            requested = int(cfg.get("max_workers") or 4)
        except (TypeError, ValueError):
            requested = 4
        return max(1, min(requested, _MAX_PARALLEL_IMAGES, os.cpu_count() or 4))

    # ── Batch execution ────────────────────────────────────────────────────────────────────────────────────

    @classmethod
    async def process_batch_background(cls, batch_id: int):
        """Asynchronous execution worker for an image batch.

        Images are processed by a small pool of worker threads (config ``max_workers``). The workers only do
        the slow, database-free work (Gemini calls, background removal, framing, validation, file writes); every
        database read/write stays on this coroutine, so the SQLAlchemy session is never shared between threads.
        """
        db: Session = SessionLocal()
        executor: Optional[ThreadPoolExecutor] = None
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

            ai_manager = ConsensusAiManager()
            cfg = batch.config or {}

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
            workers = cls._resolve_workers(cfg)
            executor = ThreadPoolExecutor(max_workers=workers, thread_name_prefix=f"batch{batch_id}")
            loop = asyncio.get_running_loop()
            logger.info(f"[Batch {batch_id}] processing {total} image(s) with {workers} parallel worker(s).")

            pending: Dict[asyncio.Future, Tuple[BatchImage, int]] = {}
            next_idx = 0
            done = 0
            cancelled = False

            while True:
                # 1) Keep the worker pool full (unless cancelled / paused).
                paused = False
                while not cancelled and next_idx < total and len(pending) < workers:
                    cancelled, paused = cls.control_state(batch_id)
                    if cancelled or paused:
                        break

                    # Check if batch record was removed from DB mid-processing
                    if not db.query(ImageBatch.id).filter(ImageBatch.id == batch_id).first():
                        logger.warning(f"Batch {batch_id} was removed from database during execution. Halting processing worker.")
                        db.rollback()
                        return

                    img = images[next_idx]
                    next_idx += 1
                    job = cls._make_job(img, batch)
                    fut = loop.run_in_executor(executor, cls._compute_image, job, cfg, ai_manager)
                    # keep the id: reading it later from a row deleted meanwhile would raise
                    pending[fut] = (img, job.image_id)

                # 2) Nothing running: finished, cancelled, or paused.
                if not pending:
                    if cancelled:
                        break
                    if paused:
                        batch.status = "paused"
                        db.commit()
                        await BigBasketEventBroadcaster.publish_event({
                            "type": "batch_status",
                            "batch_id": batch_id,
                            "status": "paused",
                        })
                        await asyncio.sleep(2.0)
                        continue
                    break  # all images done

                # 3) Wait for at least one image to finish, then commit its result.
                finished, _ = await asyncio.wait(list(pending), return_when=asyncio.FIRST_COMPLETED)
                for fut in finished:
                    img, img_id = pending.pop(fut)
                    outcome = fut.result()
                    done += 1

                    batch_exists = db.query(ImageBatch.id).filter(ImageBatch.id == batch_id).first()
                    img_exists = db.query(BatchImage.id).filter(BatchImage.id == img_id).first()
                    if not batch_exists or not img_exists:
                        logger.warning(f"Batch {batch_id} or image {img_id} was deleted during processing. Skipping DB commit.")
                        db.rollback()
                        if not batch_exists:
                            return
                        continue

                    cls._apply_outcome(db, img, batch, outcome, cfg)

                    # Update batch progress counters
                    cls._refresh_batch_counters(db, batch)
                    try:
                        db.commit()
                    except Exception as commit_err:
                        db.rollback()
                        if "StaleDataError" in type(commit_err).__name__:
                            logger.warning(f"StaleDataError updating batch {batch_id} / image {img_id}. Record was deleted concurrently.")
                            if not db.query(ImageBatch.id).filter(ImageBatch.id == batch_id).first():
                                return
                            continue
                        raise

                    # Broadcast live progress
                    pct = int((done / total) * 100) if total > 0 else 100
                    await BigBasketEventBroadcaster.publish_event({
                        "type": "image_progress",
                        "batch_id": batch_id,
                        "image_id": img_id,
                        "status": img.status,
                        "processed_count": batch.processed_images,
                        "total_count": batch.total_images,
                        "progress_pct": pct,
                    })

            if cancelled:
                batch.status = "cancelled"
                cls._log_event(db, batch_id, "cancelled", "Batch processing was cancelled by user.")
                db.commit()
                await BigBasketEventBroadcaster.publish_event({
                    "type": "batch_status",
                    "batch_id": batch_id,
                    "status": "cancelled",
                })
                return

            # Recalculate final totals and counters upon completion
            cls._refresh_batch_counters(db, batch, include_total=True)

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
            if "StaleDataError" in type(e).__name__:
                logger.warning(f"Batch {batch_id} processing halted due to StaleDataError (record deleted concurrently).")
            else:
                logger.exception(f"Error processing batch {batch_id}")
            db.rollback()
            try:
                b = db.query(ImageBatch).filter(ImageBatch.id == batch_id).first()
                if b:
                    b.status = "failed"
                    cls._log_event(db, batch_id, "failed", f"Batch processing failed: {str(e)}")
                    db.commit()
            except Exception:
                db.rollback()
        finally:
            if executor is not None:
                executor.shutdown(wait=False, cancel_futures=True)
            cls._PAUSE_REQUESTS.discard(batch_id)
            cls._CANCEL_REQUESTS.discard(batch_id)
            db.close()

    # ── Single image: compute (thread, no DB) + apply (event loop, DB) ───────────────────────────────────────

    @staticmethod
    def _make_job(img: BatchImage, batch: ImageBatch) -> SimpleNamespace:
        """Plain-data snapshot of everything the worker thread needs, so it never touches ORM objects."""
        return SimpleNamespace(
            image_id=img.id,
            bbid=img.bbid,
            filename=img.original_filename,
            original_file_path=img.original_file_path,
            image_type=img.image_type,
            sequence_order=img.sequence_order,
            final_output_path=img.final_output_path,
            category=getattr(img, "category", "") or "FOOD",
            batch_id=batch.id,
            # Stand-in for the ORM batch: BigBasketStorage only reads batch_code / name / created_at.
            batch=SimpleNamespace(batch_code=batch.batch_code, name=batch.name, created_at=batch.created_at),
        )

    @classmethod
    async def _process_single_image(
        cls,
        db: Session,
        img: BatchImage,
        batch: ImageBatch,
        ai_manager: HybridAiManager,
        cfg: Dict[str, Any],
    ):
        """Processes one image end to end (used by the retry endpoints)."""
        job = cls._make_job(img, batch)
        outcome = await asyncio.to_thread(cls._compute_image, job, cfg, ai_manager)
        cls._apply_outcome(db, img, batch, outcome, cfg)

    @classmethod
    def _compute_image(
        cls,
        job: SimpleNamespace,
        cfg: Dict[str, Any],
        ai_manager: HybridAiManager,
    ) -> Dict[str, Any]:
        """Slow, database-free part of processing one image. Runs in a worker thread.

        Returns {"ok": False, "error": ...} on failure, otherwise everything _apply_outcome needs.
        """
        t0 = time.perf_counter()
        try:
            # Read original image file
            orig_path = Path(job.original_file_path)
            if not orig_path.is_absolute() or not orig_path.exists():
                b_dir = BigBasketStorage.get_batch_dir(job.batch)
                cand1 = b_dir / "original" / Path(job.filename).name
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
            prediction = ai_manager.analyze_image_sync(
                raw_bytes,
                job.filename,
                bbid=job.bbid,
                batch_id=job.batch_id,
                image_id=job.image_id,
            )

            # Authoritative visual classification dynamically determined by Gemini Multimodal Vision AI
            # Works dynamically across any packaging format, material, color, and angle without filename heuristics
            ai_img_type = (prediction.get("predicted_category") or "").lower().strip()
            ai_type_valid = bool(ai_img_type and ai_img_type != "unknown")
            if ai_type_valid:
                effective_type = ai_img_type
            else:
                effective_type = (job.image_type or "unknown").lower().strip()

            # 2. Pipeline Execution (u2net / photoroom, padding, inpainting, validation)
            cfg_with_sku = dict(cfg)
            cfg_with_sku["bbid"] = job.bbid
            cfg_with_sku["filename"] = job.filename
            cfg_with_sku["batch_id"] = job.batch_id
            cfg_with_sku["image_id"] = job.image_id
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

            # 3. Save versions & final output
            # Remove any stale final output file if sequence or BBID changed
            if job.final_output_path:
                try:
                    old_final = Path(job.final_output_path)
                    if old_final.exists() and old_final.name != f"{job.bbid}_{job.sequence_order}.png":
                        old_final.unlink()
                except Exception:
                    pass

            seg_path = BigBasketStorage.save_version_file(
                job.batch, job.image_id, "segmented", result["segmented_image_bytes"]
            )
            final_path = BigBasketStorage.save_final_output(
                job.batch, job.bbid, job.sequence_order, result["final_image_bytes"]
            )

            # 4. Embedded validation results & Gemini classification
            val = dict(result["validation"] or {})
            val["inpaint_applied"] = result.get("inpaint_applied", False)
            val["inpaint_notes"] = result.get("inpaint_notes", [])
            val["gemini_classification"] = {
                "primary_category": prediction.get("primary_category"),
                "subcategory": prediction.get("subcategory"),
                "product_type": prediction.get("product_type"),
                "image_type": (prediction.get("predicted_category") or job.image_type or "FOP").upper(),
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

            outcome: Dict[str, Any] = {
                "ok": True,
                "elapsed_s": 0.0,
                "effective_type": effective_type,
                "ai_type_valid": ai_type_valid,
                "validation_results": val,
                "status": result["status"],
                "confidence_score": result["confidence_score"],
                "original_width": result["original_width"],
                "original_height": result["original_height"],
                "file_size_bytes": len(result["final_image_bytes"]),
                "bg_removal_error": result.get("bg_removal_error"),
                "photoroom_called": result.get("photoroom_called", False),
                "segmented_file_path": str(seg_path),
                "final_output_path": str(final_path),
                "info_sections": None,
                "sub_items": None,
                "sub_ocr_error": None,
            }

            # 5. Information Sections Detection for Back-of-Pack (BOP) images
            fname_lower = (job.filename or "").lower()
            img_type_lower = effective_type
            # Secondary packaging photos (e.g. batch code, MRP, expiry closeups) should not run sub-region extraction
            is_secondary_bop = any(k in fname_lower for k in ("batch", "code", "mrp", "exp", "stamp", "detail"))
            is_bop = (
                img_type_lower in ("bop", "back", "back of pack")
                and img_type_lower not in ("lifestyle", "infographic", "fop")
                and not any(k in img_type_lower for k in ("lifestyle", "infographic", "fop"))
                and not is_secondary_bop
            )
            if is_bop:
                # Detect packaging information sections as metadata on the parent BOP image
                info_sections = SubRegionExtractor.detect_information_sections(
                    raw_bytes,
                    bbid=job.bbid,
                    category=job.category,
                    batch_id=job.batch_id,
                    image_id=job.image_id,
                )
                outcome["info_sections"] = info_sections

                # Standalone information crops (Ingredients, Nutritional, Marketed/Manufactured By, FSSAI) are extracted
                # by default; a batch can opt out with extract_sub_regions=false.
                ocr_ok = info_sections.get("ocr_available", True)
                if ocr_ok and (cfg.get("extract_standalone_info_images", False) or cfg.get("extract_sub_regions", True)):
                    try:
                        if not batch_cat or batch_cat == "auto":
                            product_cat = val.get("product_category") or "UNKNOWN"
                        else:
                            product_cat = batch_cat
                        outcome["sub_items"] = SubRegionExtractor.detect_and_extract_sub_regions(
                            image_bytes=raw_bytes,
                            bbid=job.bbid,
                            category=product_cat,
                            canvas_width=cfg.get("canvas_width", 2000),
                            canvas_height=cfg.get("canvas_height", 2000),
                            dpi=cfg.get("dpi", 150),
                        )
                    except OcrError as ocr_err:
                        logger.error(f"OCR unavailable during sub-region extraction for BOP image {job.image_id}: {ocr_err}")
                        outcome["sub_ocr_error"] = str(ocr_err)
                    except Exception as sub_err:
                        # One failed extraction must not fail the whole image.
                        logger.error(f"Failed sub-region extraction for BOP image {job.image_id}: {sub_err}")

            outcome["elapsed_s"] = time.perf_counter() - t0
            logger.info(
                f"[Image {job.image_id}] {job.bbid} {effective_type} -> {outcome['status']} in {outcome['elapsed_s']:.1f}s"
            )
            return outcome
        except Exception as e:
            logger.error(f"Failed processing image {job.image_id}: {e}")
            return {"ok": False, "error": str(e)}

    @classmethod
    def _apply_outcome(
        cls,
        db: Session,
        img: BatchImage,
        batch: ImageBatch,
        outcome: Dict[str, Any],
        cfg: Dict[str, Any],
    ) -> None:
        """Writes a worker's result to the database. Must run on the thread that owns `db`."""
        if not outcome.get("ok"):
            # A failed flush leaves the session unusable; roll back first so this image is marked failed and the
            # rest of the batch keeps processing instead of the whole batch failing.
            db.rollback()
            img.status = "failed"
            img.error_message = outcome.get("error")
            return

        try:
            if outcome["ai_type_valid"]:
                img.image_type = outcome["effective_type"]
            img.segmented_file_path = outcome["segmented_file_path"]
            img.final_output_path = outcome["final_output_path"]
            img.validation_results = outcome["validation_results"]
            img.status = outcome["status"]
            img.confidence_score = outcome["confidence_score"]
            img.original_width = outcome["original_width"]
            img.original_height = outcome["original_height"]
            img.file_size_bytes = outcome["file_size_bytes"]
            img.error_message = outcome["bg_removal_error"]

            # Log internal API request audit record ONLY when Photoroom API was actually called and credits consumed
            if outcome["photoroom_called"]:
                try:
                    user_id = img.created_by_id or batch.created_by_id or (getattr(batch, "updated_by_id", None)) or 2
                    is_success = outcome["status"] in ("auto_approved", "needs_review", "manually_approved")
                    db.add(ApiUsageLog(
                        user_id=user_id,
                        batch_id=batch.id,
                        image_id=img.id,
                        service_name="Classic background remover",
                        provider="photoroom",
                        status="success" if is_success else "failed",
                        response_code=200 if is_success else 500,
                        latency_ms=int(outcome["elapsed_s"] * 1000),
                        credits=1,
                    ))
                except Exception as log_err:
                    logger.warning(f"Failed to record API usage log: {log_err}")

            info_sections = outcome["info_sections"]
            if info_sections is not None:
                img.validation_results["detected_sections"] = info_sections
                ocr_ok = info_sections.get("ocr_available", True)
                if not ocr_ok:
                    cls._mark_ocr_unavailable(img, info_sections.get("ocr_error"))
                db.commit()

                if outcome["sub_ocr_error"] is not None:
                    cls._mark_ocr_unavailable(img, outcome["sub_ocr_error"])
                    db.commit()
                elif outcome["sub_items"] is not None:
                    cls._register_bop_sub_regions(db, img, batch, outcome["sub_items"])
        except Exception as e:
            db.rollback()
            logger.error(f"Failed saving result for image {img.id}: {e}")
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
    def _register_bop_sub_regions(
        cls,
        db: Session,
        parent_img: BatchImage,
        batch: ImageBatch,
        sub_items: List[Dict[str, Any]],
    ):
        """
        Way 2: registers the Nutritional, Ingredients, Manufactured By, FSSAI and Barcode sub-regions that were
        extracted from a Back-of-Pack (BOP) image by the worker thread (the slow Gemini / OCR / crop work).
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

            # Keep only retained images in memory so deduplication check doesn't block newly extracted crops
            same_sku_imgs = [
                s for s in same_sku_imgs
                if (s.validation_results or {}).get("auto_extracted_from") != parent_img.id
            ]

            # Crops take the next free sequence numbers for this SKU, after every image already in the batch
            # (uploaded images keep their numbers; uq_batch_images_bbid_sequence can't be violated).
            used_seqs = [
                s.sequence_order for s in same_sku_imgs
                if s.sequence_order
            ]
            next_seq = max(used_seqs + [parent_img.sequence_order or 0]) + 1

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
        except Exception as e:
            # Roll back so one failed crop can't leave the session unusable and fail the whole batch.
            db.rollback()
            logger.error(f"Failed registering sub-regions for BOP image {parent_img.id}: {e}")

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
        using the specified provider ('photoroom' or 'birefnet').
        """
        img = db.query(BatchImage).filter(BatchImage.id == image_id).first()
        if not img:
            raise ValueError(f"Image {image_id} not found")

        batch = db.query(ImageBatch).filter(ImageBatch.id == img.batch_id).first()
        if not batch:
            raise ValueError(f"Batch {img.batch_id} not found")

        ai_manager = ConsensusAiManager(fresh=True)
        cfg = {**(batch.config or {}), "bg_removal_provider": provider}

        # Reset status to processing temporarily
        img.status = "processing"
        db.commit()

        # Re-run processing pipeline through Photoroom AI
        await cls._process_single_image(db, img, batch, ai_manager, cfg)

        # Update batch counters
        cls._refresh_batch_counters(db, batch, include_total=True)
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

        ai_manager = ConsensusAiManager(fresh=True)
        cfg = {**(batch.config or {}), "bg_removal_provider": "photoroom"}

        for img in images:
            img.status = "processing"
            db.commit()
            await cls._process_single_image(db, img, batch, ai_manager, cfg)

        # Update batch counters
        cls._refresh_batch_counters(db, batch, include_total=True)
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
