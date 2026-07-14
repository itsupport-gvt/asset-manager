from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse, Response
from sqlalchemy.orm import Session
from sqlalchemy import func
from database import get_db
from models_db import DBAsset, DBEmployee, DBAssignmentLog
from datetime import datetime, timedelta, timezone
from routes.assets import _make_xlsx

router = APIRouter(prefix="/api")


@router.get("/stats")
async def get_stats(
    from_date: str = Query(default=""),
    to_date:   str = Query(default=""),
    db: Session = Depends(get_db),
):
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

    # ── Recent Activity (last 10 log entries, with optional date range filter) ──
    recent_query = db.query(DBAssignmentLog)
    if from_date:
        try:
            from_dt = datetime.fromisoformat(from_date).replace(tzinfo=timezone.utc)
            recent_query = recent_query.filter(DBAssignmentLog.timestamp >= from_dt)
        except ValueError:
            pass
    if to_date:
        try:
            to_dt = datetime.fromisoformat(to_date).replace(tzinfo=timezone.utc)
            recent_query = recent_query.filter(DBAssignmentLog.timestamp <= to_dt)
        except ValueError:
            pass
    recent_logs = recent_query.order_by(DBAssignmentLog.timestamp.desc()).limit(10).all()
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


@router.get("/stats/export")
async def export_stats(
    from_date: str = Query(default=""),
    to_date:   str = Query(default=""),
    fmt:       str = Query(default="csv", alias="format"),
    db: Session = Depends(get_db),
):
    """Export a stats summary snapshot as CSV or XLSX."""
    import csv, io
    ts_label = datetime.now().strftime("%Y-%m-%d %H:%M")
    ts_file  = datetime.now().strftime("%Y%m%d_%H%M%S")

    total_assets     = db.query(DBAsset).count()
    total_employees  = db.query(DBEmployee).filter(DBEmployee.is_room == False).count()
    assigned_count   = db.query(DBAsset).filter(
        DBAsset.assigned_to_email.isnot(None), DBAsset.assigned_to_email != ""
    ).count()
    unassigned_count = total_assets - assigned_count

    by_status = dict(
        db.query(DBAsset.status, func.count(DBAsset.id)).group_by(DBAsset.status).all()
    )
    by_type = db.query(DBAsset.asset_type, func.count(DBAsset.id)).group_by(DBAsset.asset_type)\
               .order_by(func.count(DBAsset.id).desc()).all()
    by_condition = dict(
        db.query(DBAsset.condition, func.count(DBAsset.id)).group_by(DBAsset.condition).all()
    )
    top_assignees = db.query(DBAsset.assigned_to_email, func.count(DBAsset.id))\
        .filter(DBAsset.assigned_to_email.isnot(None), DBAsset.assigned_to_email != "")\
        .group_by(DBAsset.assigned_to_email).order_by(func.count(DBAsset.id).desc()).limit(20).all()

    def _build_rows():
        rows = []
        rows.append(["Report Generated", ts_label, "", ""])
        if from_date or to_date:
            rows.append(["Date Filter", f"{from_date or 'start'} → {to_date or 'now'}", "", ""])
        rows.append(["", "", "", ""])
        rows.append(["── SUMMARY ──", "", "", ""])
        rows.append(["Total Assets",     str(total_assets),     "", ""])
        rows.append(["Total People",     str(total_employees),  "", ""])
        rows.append(["Assigned",         str(assigned_count),   "", ""])
        rows.append(["Unassigned",       str(unassigned_count), "", ""])
        assignment_rate = f"{assigned_count/total_assets*100:.1f}%" if total_assets else "0%"
        rows.append(["Assignment Rate",  assignment_rate,       "", ""])
        rows.append(["", "", "", ""])
        rows.append(["── BY STATUS ──", "", "", ""])
        rows.append(["Status", "Count", "", ""])
        for s, c in sorted(by_status.items(), key=lambda x: -x[1]):
            rows.append([s or "Unknown", str(c), "", ""])
        rows.append(["", "", "", ""])
        rows.append(["── BY ASSET TYPE ──", "", "", ""])
        rows.append(["Asset Type", "Count", "", ""])
        for t, c in by_type:
            rows.append([t or "Unknown", str(c), "", ""])
        rows.append(["", "", "", ""])
        rows.append(["── BY CONDITION ──", "", "", ""])
        rows.append(["Condition", "Count", "", ""])
        for cond, c in sorted(by_condition.items(), key=lambda x: -x[1]):
            rows.append([cond or "Unknown", str(c), "", ""])
        rows.append(["", "", "", ""])
        rows.append(["── TOP ASSIGNEES ──", "", "", ""])
        rows.append(["Email", "Assets", "", ""])
        for email, count in top_assignees:
            emp = db.query(DBEmployee).filter(DBEmployee.email == email).first()
            name = (emp.employee_display or emp.full_name) if emp else email
            rows.append([name, str(count), "", ""])
        return rows

    HEADERS = ["Category", "Value", "", ""]
    data = _build_rows()

    if fmt == "xlsx":
        xlsx_bytes = _make_xlsx(f"Stats ({ts_label})", HEADERS, data)
        return Response(
            content=xlsx_bytes,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="stats_summary_{ts_file}.xlsx"'},
        )

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(HEADERS)
    for row in data:
        writer.writerow(row)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="stats_summary_{ts_file}.csv"'},
    )
