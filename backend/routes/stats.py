from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from database import get_db
from models_db import DBAsset, DBEmployee, DBAssignmentLog
from datetime import datetime, timedelta, timezone

router = APIRouter(prefix="/api")


@router.get("/stats")
async def get_stats(db: Session = Depends(get_db)):
    # ── Totals ────────────────────────────────────────────────────────────────
    total_assets = db.query(DBAsset).count()
    total_employees = db.query(DBEmployee).filter(DBEmployee.is_room == False).count()

    # ── By Status ─────────────────────────────────────────────────────────────
    status_rows = (
        db.query(DBAsset.status, func.count(DBAsset.id))
        .group_by(DBAsset.status)
        .all()
    )
    by_status = {s: c for s, c in status_rows if s}

    # ── By Asset Type ─────────────────────────────────────────────────────────
    type_rows = (
        db.query(DBAsset.asset_type, func.count(DBAsset.id))
        .group_by(DBAsset.asset_type)
        .order_by(func.count(DBAsset.id).desc())
        .all()
    )
    by_type = [{"type": t, "count": c} for t, c in type_rows if t]

    # ── By Condition ──────────────────────────────────────────────────────────
    cond_rows = (
        db.query(DBAsset.condition, func.count(DBAsset.id))
        .group_by(DBAsset.condition)
        .all()
    )
    by_condition = {c: n for c, n in cond_rows if c}

    # ── Assignment Rate ────────────────────────────────────────────────────────
    assigned_count = db.query(DBAsset).filter(
        DBAsset.assigned_to_email.isnot(None),
        DBAsset.assigned_to_email != ""
    ).count()
    unassigned_count = total_assets - assigned_count

    # ── Top Assignees (top 8 by asset count) ─────────────────────────────────
    top_assignee_rows = (
        db.query(DBAsset.assigned_to_email, func.count(DBAsset.id))
        .filter(DBAsset.assigned_to_email.isnot(None), DBAsset.assigned_to_email != "")
        .group_by(DBAsset.assigned_to_email)
        .order_by(func.count(DBAsset.id).desc())
        .limit(8)
        .all()
    )
    top_assignees = []
    for email, count in top_assignee_rows:
        emp = db.query(DBEmployee).filter(DBEmployee.email == email).first()
        name = emp.employee_display or emp.full_name if emp else email
        top_assignees.append({"name": name, "email": email, "count": count})

    # ── Recent Activity (last 10 log entries) ─────────────────────────────────
    recent_logs = (
        db.query(DBAssignmentLog)
        .order_by(DBAssignmentLog.timestamp.desc())
        .limit(10)
        .all()
    )
    recent_activity = []
    for log in recent_logs:
        emp = db.query(DBEmployee).filter(DBEmployee.email == log.employee_email).first() if log.employee_email else None
        emp_name = emp.employee_display or emp.full_name if emp else log.employee_email or "—"
        asset = db.query(DBAsset).filter(DBAsset.asset_id == log.asset_id).first()
        asset_label = f"{asset.brand} {asset.model}" if asset and asset.brand else log.asset_id
        recent_activity.append({
            "asset_id": log.asset_id,
            "asset_label": asset_label,
            "action": log.action,
            "employee": emp_name,
            "timestamp": log.timestamp.isoformat() if log.timestamp else "",
        })

    # ── Pending Sync ──────────────────────────────────────────────────────────
    pending_sync = db.query(DBAsset).filter(DBAsset.needs_sync == True).count()

    return {
        "total_assets": total_assets,
        "total_employees": total_employees,
        "assigned_count": assigned_count,
        "unassigned_count": unassigned_count,
        "pending_sync": pending_sync,
        "by_status": by_status,
        "by_type": by_type,
        "by_condition": by_condition,
        "top_assignees": top_assignees,
        "recent_activity": recent_activity,
    }
