"""
Activity log routes — paginated, filterable view of all DBAssignmentLog entries.
Covers: Assign, Return, Create, Update, and any other logged actions.

Endpoints:
  GET /api/activity        — paginated + filtered log
  GET /api/activity/export — CSV download of filtered log (no pagination)
"""

import csv
import io
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import or_, func

from database import get_db
from models_db import DBAssignmentLog, DBAsset, DBEmployee

router = APIRouter(prefix="/api", tags=["activity"])


# ── helpers ───────────────────────────────────────────────────────────────────

def _build_query(
    db: Session,
    action: str,
    employee: str,
    asset_id: str,
    from_date: str,
    to_date: str,
    q: str,
):
    """Build a filtered, ordered query against DBAssignmentLog (all params optional)."""
    query = db.query(DBAssignmentLog)

    if action:
        query = query.filter(DBAssignmentLog.action.ilike(f"%{action}%"))

    if employee:
        pattern = f"%{employee}%"
        emp_subq = (
            db.query(DBEmployee.email).filter(
                or_(
                    DBEmployee.email.ilike(pattern),
                    DBEmployee.full_name.ilike(pattern),
                    DBEmployee.employee_id.ilike(pattern),
                    DBEmployee.employee_display.ilike(pattern),
                )
            ).subquery()
        )
        query = query.filter(
            or_(
                DBAssignmentLog.employee_email.ilike(pattern),
                DBAssignmentLog.employee_email.in_(emp_subq),
            )
        )

    if asset_id:
        # Strip hyphens so "LT25120001" matches "LT-2512-0001"
        clean = asset_id.replace("-", "")
        query = query.filter(
            or_(
                DBAssignmentLog.asset_id.ilike(f"%{asset_id}%"),
                func.replace(DBAssignmentLog.asset_id, "-", "").ilike(f"%{clean}%"),
            )
        )

    if from_date:
        try:
            from_dt = datetime.fromisoformat(from_date).replace(tzinfo=timezone.utc)
            query = query.filter(DBAssignmentLog.timestamp >= from_dt)
        except ValueError:
            pass
    if to_date:
        try:
            to_dt = datetime.fromisoformat(to_date).replace(tzinfo=timezone.utc)
            query = query.filter(DBAssignmentLog.timestamp <= to_dt)
        except ValueError:
            pass

    if q:
        pattern = f"%{q}%"
        clean_q = q.replace("-", "")
        emp_name_subq = (
            db.query(DBEmployee.email).filter(
                or_(
                    DBEmployee.full_name.ilike(pattern),
                    DBEmployee.employee_id.ilike(pattern),
                    DBEmployee.employee_display.ilike(pattern),
                )
            ).subquery()
        )
        query = query.filter(
            or_(
                DBAssignmentLog.asset_id.ilike(pattern),
                func.replace(DBAssignmentLog.asset_id, "-", "").ilike(f"%{clean_q}%"),
                DBAssignmentLog.asset_label.ilike(pattern),
                DBAssignmentLog.employee_email.ilike(pattern),
                DBAssignmentLog.employee_email.in_(emp_name_subq),
                DBAssignmentLog.action.ilike(pattern),
                DBAssignmentLog.notes.ilike(pattern),
                DBAssignmentLog.asset_type.ilike(pattern),
            )
        )

    return query.order_by(DBAssignmentLog.timestamp.desc())


def _enrich(log: DBAssignmentLog, db: Session) -> dict:
    """Resolve employee display name and asset label for a single log row."""
    emp = (
        db.query(DBEmployee).filter(DBEmployee.email == log.employee_email).first()
        if log.employee_email else None
    )
    emp_name = (
        (emp.employee_display or emp.full_name) if emp else (log.employee_email or "—")
    )

    # Use stored label when available (populated from v1.2.0+), else resolve from DB
    if log.asset_label:
        asset_label = log.asset_label
    else:
        asset = db.query(DBAsset).filter(DBAsset.asset_id == log.asset_id).first()
        asset_label = (
            f"{asset.brand or ''} {asset.model or ''} {log.asset_id}".strip()
            if asset else log.asset_id
        )

    asset_type = log.asset_type or ""
    if not asset_type:
        asset = db.query(DBAsset).filter(DBAsset.asset_id == log.asset_id).first()
        asset_type = asset.asset_type if asset else ""

    return {
        "id":             log.id,
        "asset_id":       log.asset_id or "",
        "asset_label":    asset_label,
        "asset_type":     asset_type,
        "action":         log.action or "",
        "employee_email": log.employee_email or "",
        "employee_name":  emp_name,
        "timestamp":      log.timestamp.isoformat() if log.timestamp else "",
        "notes":          log.notes or "",
        "old_status":     log.old_status or "",
        "new_status":     log.new_status or "",
        "changed_fields": log.changed_fields or "",   # raw JSON string
    }


# ── endpoints ─────────────────────────────────────────────────────────────────

@router.get("/activity")
def list_activity(
    page:      int = Query(default=1,   ge=1),
    page_size: int = Query(default=50,  ge=1, le=200),
    action:    str = Query(default=""),
    employee:  str = Query(default=""),
    asset_id:  str = Query(default=""),
    from_date: str = Query(default=""),
    to_date:   str = Query(default=""),
    q:         str = Query(default=""),
    db: Session = Depends(get_db),
):
    """
    Paginated, filterable activity log.

    Returns:
      { total, page, page_size, pages, items: [ActivityLogItem] }
    """
    base  = _build_query(db, action, employee, asset_id, from_date, to_date, q)
    total = base.count()
    rows  = base.offset((page - 1) * page_size).limit(page_size).all()

    return {
        "total":     total,
        "page":      page,
        "page_size": page_size,
        "pages":     max(1, (total + page_size - 1) // page_size),
        "items":     [_enrich(r, db) for r in rows],
    }


@router.get("/activity/export")
def export_activity_csv(
    action:    str = Query(default=""),
    employee:  str = Query(default=""),
    asset_id:  str = Query(default=""),
    from_date: str = Query(default=""),
    to_date:   str = Query(default=""),
    q:         str = Query(default=""),
    db: Session = Depends(get_db),
):
    """
    Export the full filtered activity log as CSV (no pagination).
    Response: text/csv with Content-Disposition: attachment.
    """
    rows = _build_query(db, action, employee, asset_id, from_date, to_date, q).all()

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "ID", "Timestamp", "Action",
        "Asset ID", "Asset Type", "Asset Label",
        "Employee Email", "Employee Name",
        "Old Status", "New Status",
        "Changed Fields", "Notes",
    ])
    for row in rows:
        e = _enrich(row, db)
        writer.writerow([
            e["id"], e["timestamp"], e["action"],
            e["asset_id"], e["asset_type"], e["asset_label"],
            e["employee_email"], e["employee_name"],
            e["old_status"], e["new_status"],
            e["changed_fields"], e["notes"],
        ])

    buf.seek(0)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="activity_log_{ts}.csv"'},
    )
