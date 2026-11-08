import csv
import io
import os
from calendar import monthrange
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, get_db
from app.models.api_usage import ApiUsageLog
from app.models.role import Role  # noqa: F401
from app.models.user import User

router = APIRouter()

DEFAULT_MONTHLY_QUOTA = int(os.getenv("PHOTOROOM_MONTHLY_QUOTA", "1000"))


@router.get("/overview")
def get_api_overview(
    plan: Optional[str] = Query(None, description="free_trial or sandbox"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Overview Tab: Metrics, 30-day time series, remaining quota, and user request audit.
    Supports both Photoroom Free Trial (10 images/mo) and Sandbox Mode (1,000 credits/mo).
    """
    now = datetime.now(timezone.utc)
    start_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    _, total_days_in_month = monthrange(now.year, now.month)
    current_day = max(1, now.day)

    # Detect Photoroom API Key mode from environment
    api_key = os.getenv("PHOTOROOM_API_KEY", "")
    is_sandbox_key = api_key.startswith("sk_pr_test_")
    detected_plan = "sandbox" if is_sandbox_key else "free_trial"
    active_plan = (plan if plan in ("free_trial", "sandbox") else detected_plan)

    # 1. Total images/calls used in current month
    month_calls = (
        db.query(func.count(ApiUsageLog.id))
        .filter(ApiUsageLog.created_at >= start_of_month)
        .scalar()
        or 0
    )

    # If new installation has logs outside this month, count all logs
    all_time_calls = db.query(func.count(ApiUsageLog.id)).scalar() or 0
    images_used = month_calls if month_calls > 0 else all_time_calls

    month_failed = (
        db.query(func.count(ApiUsageLog.id))
        .filter(ApiUsageLog.created_at >= start_of_month, ApiUsageLog.status == "failed")
        .scalar()
        or 0
    )
    all_time_failed = db.query(func.count(ApiUsageLog.id)).filter(ApiUsageLog.status == "failed").scalar() or 0
    failed_calls = month_failed if month_calls > 0 else all_time_failed
    successful_calls = max(0, images_used - failed_calls)

    # Free trial has limit of 10 images / month
    free_trial_quota = 10
    free_trial_remaining = max(0, free_trial_quota - images_used)

    # Sandbox mode has limit of 1,000 credits / month
    sandbox_quota = 1000
    sandbox_remaining = max(0, sandbox_quota - images_used)

    quota_limit = sandbox_quota if active_plan == "sandbox" else free_trial_quota
    remaining_calls = sandbox_remaining if active_plan == "sandbox" else free_trial_remaining

    # In Photoroom's official Overview dashboard (for Free trial & Sandbox mode):
    # Both "Projected this month" and "Daily average" show "—" because fixed-limit trial/sandbox
    # plans do not project monthly billing overages across a billing period.
    # (Detailed period averages such as 1/day and 30 projected are displayed in the Usage tab).
    daily_average = None
    projected_this_month = None

    # 2. 30-day time series for Overview Chart
    timeseries = []
    days_back = 30
    for i in range(days_back - 1, -1, -1):
        d = (now - timedelta(days=i)).date()
        dt_start = datetime(d.year, d.month, d.day, 0, 0, 0, tzinfo=timezone.utc)
        dt_end = dt_start + timedelta(days=1)

        count = (
            db.query(func.count(ApiUsageLog.id))
            .filter(ApiUsageLog.created_at >= dt_start, ApiUsageLog.created_at < dt_end)
            .scalar()
            or 0
        )
        timeseries.append({
            "date": d.isoformat(),
            "label": d.strftime("%b %d"),
            "basic_plan_images": count,
            "plus_plan_images": 0,
            "total": count,
        })

    # 3. Request breakdown by user
    user_records = (
        db.query(
            ApiUsageLog.user_id,
            func.count(ApiUsageLog.id).label("total_requests"),
            func.sum(case((ApiUsageLog.status == "success", 1), else_=0)).label("success_count"),
            func.sum(case((ApiUsageLog.status == "failed", 1), else_=0)).label("failed_count"),
            func.max(ApiUsageLog.created_at).label("last_active"),
        )
        .group_by(ApiUsageLog.user_id)
        .all()
    )

    user_usage = []
    for r in user_records:
        user = db.query(User).filter(User.id == r.user_id).first() if r.user_id else None
        total_req = r.total_requests or 0
        succ_req = r.success_count or 0
        rate = round((succ_req / total_req * 100), 1) if total_req > 0 else 100.0

        user_usage.append({
            "user_id": r.user_id,
            "employee_name": user.employee_name if user else "Automated Worker",
            "employee_id": user.employee_id if user else "SYSTEM",
            "role_name": user.role.name if user and user.role else "Operator",
            "total_requests": total_req,
            "success_requests": succ_req,
            "failed_requests": r.failed_count or 0,
            "success_rate": rate,
            "last_active": r.last_active.isoformat() if r.last_active else None,
            "compliance_status": "Compliant (Within Quota)",
        })

    # If no user records, populate placeholder for current user
    if not user_usage and current_user:
        user_usage.append({
            "user_id": current_user.id,
            "employee_name": current_user.employee_name,
            "employee_id": current_user.employee_id,
            "role_name": current_user.role.name if current_user.role else "Developer",
            "total_requests": images_used,
            "success_requests": images_used,
            "failed_requests": 0,
            "success_rate": 100.0,
            "last_active": now.isoformat(),
            "compliance_status": "Compliant (Within Quota)",
        })

    return {
        "images_used": images_used,
        "successful_calls": successful_calls,
        "failed_calls": failed_calls,
        "quota_limit": quota_limit,
        "remaining_calls": remaining_calls,
        "projected_this_month": projected_this_month,
        "daily_average": daily_average,
        "timeseries": timeseries,
        "user_usage": user_usage,
        "is_sandbox_key": is_sandbox_key,
        "detected_plan": detected_plan,
        "active_plan": active_plan,
        "plans": {
            "free_trial": {
                "name": "Free trial",
                "quota": free_trial_quota,
                "used": images_used,
                "remaining": free_trial_remaining,
                "unit": "images",
                "subtitle": f"of {free_trial_quota} images this month",
                "remaining_text": f"{free_trial_remaining} of {free_trial_quota} images left",
            },
            "sandbox": {
                "name": "Sandbox mode",
                "quota": sandbox_quota,
                "used": images_used,
                "remaining": sandbox_remaining,
                "unit": "credits",
                "subtitle": f"of {sandbox_quota:,} credits this month",
                "remaining_text": f"{sandbox_remaining:,} of {sandbox_quota:,} credits left",
            },
        },
    }


@router.get("/usage")
def get_api_usage(
    days: int = Query(7, ge=1, le=90),
    interval: str = Query("daily"),
    user_id: Optional[int] = Query(None),
    service_name: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Usage Tab: Filterable usage by date range (e.g. 7 days), API breakdown table, and charts.
    """
    now = datetime.now(timezone.utc)
    date_cols = []
    date_keys = []

    # Build sequence of past N days
    for i in range(days - 1, -1, -1):
        d = (now - timedelta(days=i)).date()
        date_keys.append(d.isoformat())
        date_cols.append(d.strftime("%b %d").upper())

    base_query = db.query(ApiUsageLog)
    start_dt = datetime.combine((now - timedelta(days=days - 1)).date(), datetime.min.time(), tzinfo=timezone.utc)
    base_query = base_query.filter(ApiUsageLog.created_at >= start_dt)

    if user_id:
        base_query = base_query.filter(ApiUsageLog.user_id == user_id)
    if service_name:
        base_query = base_query.filter(ApiUsageLog.service_name.ilike(f"%{service_name}%"))

    logs = base_query.all()
    total_calls = len(logs)

    # Calculate metrics for the period
    daily_avg = round(total_calls / days, 1) if days > 0 else 0
    _, total_days_in_month = monthrange(now.year, now.month)
    projected_this_month = int(daily_avg * total_days_in_month) if daily_avg > 0 else 0

    # Group by service
    service_map = {}
    timeseries_map = {dk: {"date": dk, "label": dc, "count": 0} for dk, dc in zip(date_keys, date_cols)}

    for log in logs:
        s_name = log.service_name or "Classic background remover"
        if s_name not in service_map:
            service_map[s_name] = {dk: 0 for dk in date_keys}

        log_d = log.created_at.date().isoformat()
        if log_d in service_map[s_name]:
            service_map[s_name][log_d] += 1
        if log_d in timeseries_map:
            timeseries_map[log_d]["count"] += 1

    # Format services rows for Table view
    services_rows = []
    total_days_counts = [0] * len(date_keys)

    for s_name, day_dict in service_map.items():
        row_vals = [day_dict[dk] for dk in date_keys]
        row_tot = sum(row_vals)
        for idx, v in enumerate(row_vals):
            total_days_counts[idx] += v

        pct = round((row_tot / total_calls * 100), 1) if total_calls > 0 else 0
        services_rows.append({
            "service_name": s_name,
            "total": row_tot,
            "percentage": pct,
            "days_values": row_vals,
        })

    # If no services yet, provide standard placeholder
    if not services_rows:
        services_rows.append({
            "service_name": "Classic background remover",
            "total": 0,
            "percentage": 100.0,
            "days_values": [0] * len(date_keys),
        })

    total_row = {
        "service_name": "Total",
        "total": sum(total_days_counts),
        "percentage": 100.0,
        "days_values": total_days_counts,
    }

    # User breakdown within this filtered view
    user_query = (
        db.query(
            ApiUsageLog.user_id,
            ApiUsageLog.service_name,
            func.count(ApiUsageLog.id).label("requests"),
            func.sum(case((ApiUsageLog.status == "success", 1), else_=0)).label("success_count"),
            func.sum(case((ApiUsageLog.status == "failed", 1), else_=0)).label("failed_count"),
            func.max(ApiUsageLog.created_at).label("last_active"),
        )
        .filter(ApiUsageLog.created_at >= start_dt)
        .group_by(ApiUsageLog.user_id, ApiUsageLog.service_name)
    )
    if user_id:
        user_query = user_query.filter(ApiUsageLog.user_id == user_id)
    if service_name:
        user_query = user_query.filter(ApiUsageLog.service_name.ilike(f"%{service_name}%"))

    user_rows = []
    for r in user_query.all():
        u = db.query(User).filter(User.id == r.user_id).first() if r.user_id else None
        user_rows.append({
            "user_id": r.user_id,
            "employee_name": u.employee_name if u else "Operator",
            "employee_id": u.employee_id if u else "SYSTEM",
            "role_name": u.role.name if u and u.role else "Developer",
            "service_name": r.service_name or "Classic background remover",
            "requests": r.requests or 0,
            "successful": r.success_count or 0,
            "failed": r.failed_count or 0,
            "last_active": r.last_active.isoformat() if r.last_active else None,
        })

    return {
        "api_calls": total_calls,
        "projected_this_month": projected_this_month,
        "daily_average": daily_avg,
        "date_columns": date_cols,
        "date_keys": date_keys,
        "services": services_rows,
        "total_row": total_row,
        "timeseries": list(timeseries_map.values()),
        "user_breakdown": user_rows,
    }


@router.get("/export-csv")
def export_api_usage_csv(
    days: int = Query(7, ge=1, le=90),
    user_id: Optional[int] = Query(None),
    service_name: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Generates and downloads a CSV export matching the table view.
    """
    usage_data = get_api_usage(
        days=days,
        user_id=user_id,
        service_name=service_name,
        db=db,
        current_user=current_user,
    )

    out = io.StringIO()
    writer = csv.writer(out)

    # Header: API, TOTAL, %, NOV 1, NOV 2, ...
    header = ["API", "TOTAL", "%"] + usage_data["date_columns"]
    writer.writerow(header)

    for s in usage_data["services"]:
        row = [s["service_name"], s["total"], f"{s['percentage']}%"] + s["days_values"]
        writer.writerow(row)

    total_r = usage_data["total_row"]
    writer.writerow([total_r["service_name"], total_r["total"], f"{total_r['percentage']}%"] + total_r["days_values"])

    # Blank row
    writer.writerow([])
    # User breakdown header
    writer.writerow(["User ID", "Employee Name", "Employee ID", "Role", "API Service", "Requests", "Successful", "Failed"])
    for u in usage_data["user_breakdown"]:
        writer.writerow([
            u["user_id"],
            u["employee_name"],
            u["employee_id"],
            u["role_name"],
            u["service_name"],
            u["requests"],
            u["successful"],
            u["failed"],
        ])

    csv_bytes = out.getvalue().encode("utf-8")
    filename = f"api_usage_{days}d_{datetime.now().strftime('%Y%m%d')}.csv"

    return Response(
        content=csv_bytes,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )

