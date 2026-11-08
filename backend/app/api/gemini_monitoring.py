import csv
import io
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import case, desc, func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.dependencies import get_current_user, get_db
from app.models.gemini_usage import GeminiApiLog
from app.models.role import Role  # noqa: F401
from app.models.user import User
from app.services.bigbasket.forex_service import ForexService

router = APIRouter()


@router.get("/exchange-rate")
def get_exchange_rate(
    refresh: bool = Query(False),
    current_user: User = Depends(get_current_user),
):
    """
    Fetches real-time live USD to INR exchange rate from official forex feeds with in-memory caching.
    """
    return ForexService.get_usd_to_inr(force_refresh=refresh)


@router.get("/overview")
def get_gemini_overview(
    days: int = Query(30, ge=0, le=365),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns high-level KPI metrics, token counters, dual USD & INR costs,
    and category breakdown for Google Gemini Vision API calls.
    Supports All Day (days=1), All Days/All Time (days=0), or multi-day window (days=7, 14, 30, 90).
    """
    now = datetime.now(timezone.utc)
    days_val = days if isinstance(days, int) else getattr(days, "default", 30)
    if not isinstance(days_val, int):
        days_val = 30

    fx = ForexService.get_usd_to_inr()
    inr_rate = float(fx.get("rate", 94.11))

    # Determine date cutoff based on days parameter
    query = db.query(GeminiApiLog)
    since_date = None
    if days_val == 1:
        # All Day (Today: starting 00:00:00 UTC)
        since_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
        query = query.filter(GeminiApiLog.created_at >= since_date)
    elif days_val > 1:
        since_date = now - timedelta(days=days_val)
        query = query.filter(GeminiApiLog.created_at >= since_date)
    # If days_val == 0: All Days / All Time (since_date remains None)

    total_requests = query.count()
    success_requests = query.filter(GeminiApiLog.status == "SUCCESS").count()
    cache_hits = query.filter(GeminiApiLog.status == "CACHE_HIT").count()
    fallback_requests = query.filter(GeminiApiLog.status == "FALLBACK").count()
    error_requests = query.filter(GeminiApiLog.status == "ERROR").count()

    # Sum official tokens
    sum_query = db.query(
        func.coalesce(func.sum(GeminiApiLog.prompt_tokens), 0).label("prompt"),
        func.coalesce(func.sum(GeminiApiLog.candidates_tokens), 0).label("candidates"),
        func.coalesce(func.sum(GeminiApiLog.thoughts_tokens), 0).label("thoughts"),
        func.coalesce(func.sum(GeminiApiLog.total_tokens), 0).label("total"),
        func.coalesce(func.sum(GeminiApiLog.cached_tokens), 0).label("cached"),
        func.coalesce(func.sum(GeminiApiLog.estimated_cost_usd), 0.0).label("cost"),
        func.coalesce(func.sum(GeminiApiLog.cost_saved_usd), 0.0).label("savings"),
        func.coalesce(func.avg(GeminiApiLog.latency_ms), 0.0).label("avg_latency"),
    )
    if since_date is not None:
        sum_query = sum_query.filter(GeminiApiLog.created_at >= since_date)
    token_sums = sum_query.first()

    prompt_tokens = int(token_sums.prompt) if token_sums else 0
    candidates_tokens = int(token_sums.candidates) if token_sums else 0
    thoughts_tokens = int(token_sums.thoughts) if token_sums else 0
    total_tokens = int(token_sums.total) if token_sums else 0
    cached_tokens = int(token_sums.cached) if token_sums else 0
    total_cost_usd = float(token_sums.cost) if token_sums else 0.0
    total_cost_saved_usd = float(token_sums.savings) if token_sums else 0.0
    avg_latency_ms = float(token_sums.avg_latency) if token_sums else 0.0

    cache_hit_rate = round((cache_hits / total_requests * 100), 1) if total_requests > 0 else 0.0
    success_rate = round((success_requests / total_requests * 100), 1) if total_requests > 0 else 100.0

    # Category breakdown
    cat_query = db.query(GeminiApiLog.primary_category, func.count(GeminiApiLog.id))
    if since_date is not None:
        cat_query = cat_query.filter(GeminiApiLog.created_at >= since_date)
    category_counts_rows = cat_query.group_by(GeminiApiLog.primary_category).all()

    category_distribution = {
        "FOOD": 0,
        "NON_FOOD": 0,
        "KITCHEN_ITEMS": 0,
        "UNKNOWN": 0,
    }
    for cat, cnt in category_counts_rows:
        if cat in category_distribution:
            category_distribution[cat] = cnt
        elif cat:
            category_distribution[cat.upper()] = cnt

    return {
        "model_name": (getattr(settings, "GEMINI_MODEL", "") or os.getenv("GEMINI_MODEL", "")).strip(),
        "api_configured": bool(getattr(settings, "GEMINI_API_KEY", "")),
        "days_window": days_val,
        "window_label": "All Day (Today)" if days_val == 1 else "All Days (All Time)" if days_val == 0 else f"{days_val} Days",
        "exchange_rate": fx,
        "pricing_rates": {
            "input_per_million_usd": 0.30,
            "output_per_million_usd": 2.50,
            "input_per_million_inr": round(0.30 * inr_rate, 2),
            "output_per_million_inr": round(2.50 * inr_rate, 2),
            "exchange_rate": inr_rate,
            "image_tile_tokens": 258,
            "tile_dimensions": "384x384 or 768x768 tiles",
        },
        "summary": {
            "total_requests": total_requests,
            "success_requests": success_requests,
            "cache_hits": cache_hits,
            "fallback_requests": fallback_requests,
            "error_requests": error_requests,
            "cache_hit_rate": cache_hit_rate,
            "success_rate": success_rate,
            "avg_latency_ms": round(avg_latency_ms, 1),
        },
        "tokens": {
            "prompt_tokens": prompt_tokens,
            "candidates_tokens": candidates_tokens,
            "thoughts_tokens": thoughts_tokens,
            "total_tokens": total_tokens,
            "cached_tokens": cached_tokens,
        },
        "costs": {
            "total_cost_usd": round(total_cost_usd, 6),
            "total_cost_inr": round(total_cost_usd * inr_rate, 4),
            "total_cost_saved_usd": round(total_cost_saved_usd, 6),
            "total_cost_saved_inr": round(total_cost_saved_usd * inr_rate, 4),
            "net_roi_percent": round((total_cost_saved_usd / (total_cost_usd + 0.0001)) * 100, 1),
        },
        "category_distribution": category_distribution,
    }


@router.get("/timeseries")
def get_gemini_timeseries(
    days: int = Query(7, ge=0, le=365),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns time-series token usage, cost in USD & INR, and request counts.
    Supports All Day hourly display (days=1), All Days history (days=0), or multi-day daily aggregation.
    """
    now = datetime.now(timezone.utc)
    days_val = days if isinstance(days, int) else getattr(days, "default", 7)
    if not isinstance(days_val, int):
        days_val = 7

    fx = ForexService.get_usd_to_inr()
    inr_rate = float(fx.get("rate", 94.11))

    if days_val == 1:
        # All Day Hourly aggregation
        since_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
        hour_slot = func.to_char(GeminiApiLog.created_at, "HH24:00").label("time_slot")
        rows = (
            db.query(
                hour_slot,
                func.count(GeminiApiLog.id).label("requests"),
                func.coalesce(func.sum(GeminiApiLog.prompt_tokens), 0).label("prompt_tokens"),
                func.coalesce(func.sum(GeminiApiLog.candidates_tokens), 0).label("candidates_tokens"),
                func.coalesce(func.sum(GeminiApiLog.thoughts_tokens), 0).label("thoughts_tokens"),
                func.coalesce(func.sum(GeminiApiLog.estimated_cost_usd), 0.0).label("cost_usd"),
                func.coalesce(func.sum(case((GeminiApiLog.status == "CACHE_HIT", 1), else_=0)), 0).label("cache_hits"),
            )
            .filter(GeminiApiLog.created_at >= since_date)
            .group_by(hour_slot)
            .order_by(hour_slot)
            .all()
        )
        result = []
        for r in rows:
            c_usd = float(r.cost_usd)
            result.append({
                "date": str(r.time_slot),
                "time_slot": str(r.time_slot),
                "requests": int(r.requests),
                "prompt_tokens": int(r.prompt_tokens),
                "candidates_tokens": int(r.candidates_tokens),
                "thoughts_tokens": int(r.thoughts_tokens),
                "total_tokens": int(r.prompt_tokens) + int(r.candidates_tokens) + int(r.thoughts_tokens),
                "cost_usd": round(c_usd, 6),
                "cost_inr": round(c_usd * inr_rate, 5),
                "cache_hits": int(r.cache_hits),
            })
        return {
            "days": days_val,
            "mode": "hourly",
            "exchange_rate": inr_rate,
            "points": result,
        }

    # Daily aggregation for multi-day or all time
    date_slot = func.date(GeminiApiLog.created_at).label("day_slot")
    query = db.query(
        date_slot,
        func.count(GeminiApiLog.id).label("requests"),
        func.coalesce(func.sum(GeminiApiLog.prompt_tokens), 0).label("prompt_tokens"),
        func.coalesce(func.sum(GeminiApiLog.candidates_tokens), 0).label("candidates_tokens"),
        func.coalesce(func.sum(GeminiApiLog.thoughts_tokens), 0).label("thoughts_tokens"),
        func.coalesce(func.sum(GeminiApiLog.estimated_cost_usd), 0.0).label("cost_usd"),
        func.coalesce(func.sum(case((GeminiApiLog.status == "CACHE_HIT", 1), else_=0)), 0).label("cache_hits"),
    )
    if days_val > 1:
        since_date = now - timedelta(days=days_val)
        query = query.filter(GeminiApiLog.created_at >= since_date)

    rows = query.group_by(date_slot).order_by(date_slot).all()

    result = []
    for r in rows:
        c_usd = float(r.cost_usd)
        result.append({
            "date": str(r.day_slot),
            "requests": int(r.requests),
            "prompt_tokens": int(r.prompt_tokens),
            "candidates_tokens": int(r.candidates_tokens),
            "thoughts_tokens": int(r.thoughts_tokens),
            "total_tokens": int(r.prompt_tokens) + int(r.candidates_tokens) + int(r.thoughts_tokens),
            "cost_usd": round(c_usd, 6),
            "cost_inr": round(c_usd * inr_rate, 5),
            "cache_hits": int(r.cache_hits),
        })

    return {
        "days": days_val,
        "mode": "daily",
        "exchange_rate": inr_rate,
        "points": result,
    }


@router.get("/logs")
def list_gemini_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    search: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    days: Optional[int] = Query(30, ge=0, le=365),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Paginated, searchable audit table of Gemini AI API requests, tokens, and dual USD/INR costs.
    """
    now = datetime.now(timezone.utc)
    query = db.query(GeminiApiLog)

    fx = ForexService.get_usd_to_inr()
    inr_rate = float(fx.get("rate", 94.11))

    days_val = days if isinstance(days, int) else getattr(days, "default", 30)
    if not isinstance(days_val, int):
        days_val = 30

    if days_val == 1:
        # All Day (Today: starting 00:00:00 UTC)
        since = now.replace(hour=0, minute=0, second=0, microsecond=0)
        query = query.filter(GeminiApiLog.created_at >= since)
    elif days_val > 1:
        since = now - timedelta(days=days_val)
        query = query.filter(GeminiApiLog.created_at >= since)
    # If days_val == 0: All Days / All Time (no date restriction)

    if isinstance(status, str) and status.upper() != "ALL":
        query = query.filter(GeminiApiLog.status == status.upper())

    if isinstance(category, str) and category.upper() != "ALL":
        query = query.filter(GeminiApiLog.primary_category == category.upper())

    if isinstance(search, str) and search.strip():
        term = f"%{search.strip().lower()}%"
        query = query.filter(
            func.lower(GeminiApiLog.bbid).like(term)
            | func.lower(GeminiApiLog.filename).like(term)
            | func.lower(GeminiApiLog.product_type).like(term)
            | func.lower(GeminiApiLog.subcategory).like(term)
        )

    total = query.count()
    items = (
        query.order_by(desc(GeminiApiLog.created_at))
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    serialized = []
    for log in items:
        cost_usd = float(log.estimated_cost_usd or 0.0)
        saved_usd = float(log.cost_saved_usd or 0.0)
        serialized.append({
            "id": log.id,
            "request_id": log.request_id,
            "timestamp": log.created_at.isoformat() if log.created_at else None,
            "bbid": log.bbid,
            "filename": log.filename,
            "model_name": log.model_name,
            "status": log.status,
            "status_code": log.status_code,
            "prompt_tokens": log.prompt_tokens,
            "candidates_tokens": log.candidates_tokens,
            "thoughts_tokens": log.thoughts_tokens,
            "total_tokens": log.total_tokens,
            "cached_tokens": log.cached_tokens,
            "estimated_cost_usd": round(cost_usd, 6),
            "estimated_cost_inr": round(cost_usd * inr_rate, 4),
            "cost_saved_usd": round(saved_usd, 6),
            "cost_saved_inr": round(saved_usd * inr_rate, 4),
            "exchange_rate": inr_rate,
            "latency_ms": log.latency_ms,
            "primary_category": log.primary_category,
            "subcategory": log.subcategory,
            "product_type": log.product_type,
            "classification_confidence": log.classification_confidence,
            "image_type": log.image_type,
            "requires_manual_review": bool(log.requires_manual_review),
            "materials": log.materials or [],
            "components": log.components or [],
            "visual_properties": log.visual_properties or [],
            "error_message": log.error_message,
            "detected_products": (log.metadata_payload or {}).get("detected_products", []),
            "is_multi_product_image": bool((log.metadata_payload or {}).get("is_multi_product_image")),
        })

    total_pages = max(1, (total + page_size - 1) // page_size)
    return {
        "items": serialized,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
        "exchange_rate": fx,
    }


@router.get("/export-csv")
def export_gemini_logs_csv(
    search: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    days: Optional[int] = Query(30, ge=0, le=365),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Exports filtered Gemini AI usage and token logs with both USD and INR pricing as CSV.
    """
    now = datetime.now(timezone.utc)
    query = db.query(GeminiApiLog)

    fx = ForexService.get_usd_to_inr()
    inr_rate = float(fx.get("rate", 94.11))

    days_val = days if isinstance(days, int) else getattr(days, "default", 30)
    if not isinstance(days_val, int):
        days_val = 30

    if days_val == 1:
        # All Day (Today)
        since = now.replace(hour=0, minute=0, second=0, microsecond=0)
        query = query.filter(GeminiApiLog.created_at >= since)
    elif days_val > 1:
        since = now - timedelta(days=days_val)
        query = query.filter(GeminiApiLog.created_at >= since)

    if isinstance(status, str) and status.upper() != "ALL":
        query = query.filter(GeminiApiLog.status == status.upper())

    if isinstance(category, str) and category.upper() != "ALL":
        query = query.filter(GeminiApiLog.primary_category == category.upper())

    if isinstance(search, str) and search.strip():
        term = f"%{search.strip().lower()}%"
        query = query.filter(
            func.lower(GeminiApiLog.bbid).like(term)
            | func.lower(GeminiApiLog.filename).like(term)
        )

    logs = query.order_by(desc(GeminiApiLog.created_at)).limit(5000).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "ID",
        "Timestamp (UTC)",
        "SKU / BBID",
        "Original Filename",
        "Model",
        "Status",
        "Primary Category",
        "Subcategory",
        "Product Type",
        "Image Type",
        "Prompt Tokens (Input)",
        "Candidates Tokens (Output)",
        "Thinking Tokens",
        "Total Tokens",
        "Estimated Cost ($ USD)",
        f"Estimated Cost (₹ INR @ {inr_rate})",
        "Cost Saved ($ USD)",
        f"Cost Saved (₹ INR @ {inr_rate})",
        "Latency (ms)",
        "Confidence Score",
        "Error Message",
    ])

    for log in logs:
        cost_usd = float(log.estimated_cost_usd or 0.0)
        saved_usd = float(log.cost_saved_usd or 0.0)
        writer.writerow([
            log.id,
            log.created_at.strftime("%Y-%m-%d %H:%M:%S") if log.created_at else "",
            log.bbid or "",
            log.filename or "",
            log.model_name or "",
            log.status or "",
            log.primary_category or "",
            log.subcategory or "",
            log.product_type or "",
            log.image_type or "",
            log.prompt_tokens,
            log.candidates_tokens,
            log.thoughts_tokens,
            log.total_tokens,
            f"{cost_usd:.6f}",
            f"{(cost_usd * inr_rate):.4f}",
            f"{saved_usd:.6f}",
            f"{(saved_usd * inr_rate):.4f}",
            f"{log.latency_ms:.1f}",
            f"{log.classification_confidence:.2f}" if log.classification_confidence is not None else "",
            log.error_message or "",
        ])

    csv_data = output.getvalue()
    filename = f"gemini_api_monitoring_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.csv"
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
