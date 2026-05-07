import json
import random
import traceback
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from datetime import datetime, timezone

from config import MASTER_TABLE, EMP_TABLE, LOG_TABLE
from graph_client import graph, _excel_serial_to_str
from models_db import DBAsset, DBEmployee, DBAssignmentLog


import re

def _normalize_storage(val: str) -> str:
    """
    Normalize messy storage strings from Excel.
    Examples: '256' → '256 GB SSD', '1TB' → '1 TB SSD', '128 SSD' → '128 GB SSD',
              '512GB SSD' → '512 GB SSD', '1TB HDD' → '1 TB HDD'
    Rule: missing unit → GB; missing drive type → SSD.
    """
    if not val:
        return ""
    v = val.strip()
    m = re.match(
        r'^(\d+(?:\.\d+)?)\s*(GB|TB|MB)?\s*(NVMe SSD|NVMe|SSD|HDD|eMMC|Flash)?\s*$',
        v, re.IGNORECASE
    )
    if not m:
        return v
    num   = m.group(1)
    unit  = (m.group(2) or 'GB').upper()
    drive_raw = (m.group(3) or 'SSD')
    drive_map = {
        'NVME SSD': 'NVMe SSD', 'NVME': 'NVMe', 'SSD': 'SSD',
        'HDD': 'HDD', 'EMMC': 'eMMC', 'FLASH': 'Flash',
    }
    drive = drive_map.get(drive_raw.upper(), drive_raw)
    return f"{num} {unit} {drive}"


def _normalize_ram(val: str) -> str:
    """
    Normalize RAM strings: '8' → '8 GB', '16 GB' → '16 GB', '32' → '32 GB'.
    """
    if not val:
        return ""
    v = val.strip()
    m = re.match(r'^(\d+(?:\.\d+)?)\s*(GB|MB)?\s*$', v, re.IGNORECASE)
    if not m:
        return v
    num  = m.group(1)
    unit = (m.group(2) or 'GB').upper()
    return f"{num} {unit}"


def _normalize_date(val: str) -> str:
    """
    Convert Excel serial date numbers to ISO date strings (YYYY-MM-DD).
    '46092' → '2026-01-03'. Leaves existing date strings unchanged.
    """
    if not val:
        return ""
    v = val.strip()
    try:
        n = float(v)
        if 30000 < n < 60000:  # plausible Excel date range (~1982–2064)
            iso = _excel_serial_to_str(n)
            if iso:
                return iso[:10]
    except (ValueError, TypeError):
        pass
    return v


_sync_status = {
    "status": "idle",
    "last_sync": None,
    "error": None,
    "details": None
}

def get_current_sync_status():
    return _sync_status

def sync_from_excel(db: Session):
    """
    Pulls the two main tables (MasterTable and tbl_Employees) from Excel via Graph API
    and updates the local SQLite DB.
    """
    global _sync_status
    _sync_status["status"] = "syncing"
    _sync_status["error"] = None
    _sync_status["details"] = "Starting sync..."

    try:
        print("[sync_from_excel] Fetching employees...")
        emp_rows = graph.get_table_rows(EMP_TABLE)

        print(f"[sync_from_excel] Found {len(emp_rows)} raw employee rows. Processing...")
        new_emps = 0
        updated_emps = 0
        skipped_emps = 0

        room_names = [
            "Workspace", "Chamber Room", "HR Room", "Engineering Room",
            "Main Hall", "Proposal Eng Dept.", "Not Assigned", "Proposal Server"
        ]

        for idx, row in enumerate(emp_rows):
            name = str(row.get("FullName", row.get("Full Name", ""))).strip()
            if not name or name == "None":
                continue

            if name in room_names or "Room" in name or "Hall" in name or "Server" in name or name == "Workspace" or name == "Not Assigned" or name == "Proposal Eng Dept.":
                synthetic_email = f"room:{name.lower().replace(' ', '_')}@local"
                emp_id = None
                email = synthetic_email
                designation = "Office Location"
                is_room = True
            else:
                email = str(row.get("Email", row.get("Email Address", ""))).strip()
                if not email or "@" not in email:
                    print(f"  Skipping row {idx} with invalid/missing email: {row}")
                    skipped_emps += 1
                    continue
                emp_id = str(row.get("EmployeeID", row.get("Employee ID", ""))).strip()
                if not emp_id or emp_id == "None":
                    emp_id = None
                designation = str(row.get("Designation", "")).strip()
                is_room = False

            emp_display = f"{emp_id} - {name}" if emp_id else name
            try:
                existing = db.query(DBEmployee).filter(DBEmployee.email == email).first()
                if existing:
                    existing.full_name = name
                    existing.employee_id = emp_id
                    existing.designation = designation
                    existing.is_room = is_room
                    existing.employee_display = emp_display
                    updated_emps += 1
                else:
                    db.add(DBEmployee(
                        email=email, full_name=name, employee_id=emp_id,
                        designation=designation, is_room=is_room, employee_display=emp_display,
                    ))
                    new_emps += 1
                db.commit()
            except IntegrityError as e:
                db.rollback()
                print(f"  Integrity error on row {idx} (email={email}): {e}")
                skipped_emps += 1
            except Exception as e:
                db.rollback()
                print(f"  Error processing row {idx}: {e}")
                skipped_emps += 1

        print(f"[sync_from_excel] Employees: {new_emps} added, {updated_emps} updated, {skipped_emps} skipped.")

        print("[sync_from_excel] Fetching assets...")
        asset_rows = graph.get_table_rows(MASTER_TABLE)
        print(f"[sync_from_excel] Found {len(asset_rows)} raw asset rows. Processing...")

        new_assets = 0
        updated_assets = 0
        skipped_assets = 0

        for idx, row in enumerate(asset_rows):
            asset_id = str(row.get("Asset ID", row.get("AssetID", row.get("AssetId", "")))).strip()
            if not asset_id or asset_id == "None":
                skipped_assets += 1
                continue

            if idx == 0:
                print(f"  [DEBUG] MasterTable columns: {list(row.keys())}")

            username_raw = str(row.get("Username", "")).strip()
            assigned_email = None
            NOT_ASSIGNED_VALUES = {"", "none", "not assigned", "n/a", "-"}
            if username_raw.lower() not in NOT_ASSIGNED_VALUES:
                if "@" in username_raw:
                    emp = db.query(DBEmployee).filter(DBEmployee.email.ilike(username_raw)).first()
                    assigned_email = emp.email if emp else username_raw
                    if not emp:
                        print(f"  [WARN] Email '{username_raw}' not in employees for asset {asset_id} — storing raw")
                else:
                    synthetic = f"room:{username_raw.lower().replace(' ', '_')}@local"
                    emp = db.query(DBEmployee).filter(DBEmployee.email == synthetic).first()
                    if not emp:
                        emp = db.query(DBEmployee).filter(DBEmployee.full_name.ilike(username_raw)).first()
                    if emp:
                        assigned_email = emp.email
                    else:
                        print(f"  [WARN] Cannot resolve '{username_raw}' for asset {asset_id}")

            try:
                def _get(r, *keys, fallback=""):
                    for k in keys:
                        v = r.get(k)
                        if v is not None and str(v).strip() not in ("", "None"):
                            return str(v).strip()
                    return str(fallback) if fallback is not None else ""

                existing = db.query(DBAsset).filter(DBAsset.asset_id == asset_id).first()
                if existing:
                    existing.asset_type   = _get(row, "Asset_Type", "Asset Type", "Item Type", fallback=existing.asset_type)
                    existing.status       = _get(row, "Status", fallback=existing.status)
                    existing.condition    = _get(row, "Condition", fallback=existing.condition)
                    existing.brand        = _get(row, "Brand", fallback=existing.brand)
                    existing.model        = _get(row, "Model", fallback=existing.model)
                    existing.serial_number = _get(row, "Serial_Number", "Serial Number", "SerialNumber", fallback=existing.serial_number)
                    existing.assigned_to_email = assigned_email
                    existing.location     = _get(row, "Location", fallback=existing.location)
                    existing.notes        = _get(row, "Notes", fallback=existing.notes)
                    existing.storage      = _normalize_storage(_get(row, "Storage", fallback=existing.storage))
                    existing.storage_2    = _normalize_storage(_get(row, "Storage_2", "Secondary Storage", fallback=existing.storage_2))
                    existing.memory_ram   = _normalize_ram(_get(row, "Memory(RAM)", "RAM", fallback=existing.memory_ram))
                    existing.purchase_date  = _normalize_date(_get(row, "Purchase_Date", "Purchase Date", fallback=existing.purchase_date))
                    existing.purchase_price = _get(row, "Purchase_Price", "Purchase Price", fallback=existing.purchase_price)
                    existing.vendor       = _get(row, "Vendor", fallback=existing.vendor)
                    existing.invoice_ref  = _get(row, "Invoice Reference", "Invoice Ref", fallback=existing.invoice_ref)
                    existing.warranty_end = _get(row, "Warranty_End", "Warranty End", fallback=existing.warranty_end)
                    existing.pin_password = _get(row, "Pin/Password", "PIN/Password", fallback=existing.pin_password)
                    existing.charger_model  = _get(row, "Charger_Model", "Charger Model", fallback=existing.charger_model)
                    existing.charger_serial = _get(row, "Charger_Serial", "Charger Serial", fallback=existing.charger_serial)
                    existing.charger_notes  = _get(row, "Charger_Notes", "Charger Notes", fallback=existing.charger_notes)
                    existing.processor    = _get(row, "Processor", fallback=existing.processor)
                    existing.graphics     = _get(row, "Graphics", fallback=existing.graphics)
                    existing.screen_size  = _get(row, "Screen_Size", "Screen Size", fallback=existing.screen_size)
                    existing.os           = _get(row, "OS", "Operating System", fallback=existing.os)
                    qr_from_excel = str(row.get("Asset_ID_QR", row.get("AssetIDQR", ""))).strip()
                    existing.asset_id_qr = qr_from_excel if qr_from_excel and qr_from_excel != "None" else asset_id.replace("-", "")
                    existing.needs_sync = False
                    updated_assets += 1
                else:
                    qr_from_excel = str(row.get("Asset_ID_QR", row.get("AssetIDQR", ""))).strip()
                    db.add(DBAsset(
                        asset_id=asset_id,
                        asset_id_qr=qr_from_excel if qr_from_excel and qr_from_excel != "None" else asset_id.replace("-", ""),
                        asset_type=_get(row, "Asset_Type", "Asset Type", "Item Type"),
                        status=_get(row, "Status", fallback="In Stock"),
                        condition=_get(row, "Condition"),
                        brand=_get(row, "Brand"),
                        model=_get(row, "Model"),
                        serial_number=_get(row, "Serial_Number", "Serial Number", "SerialNumber"),
                        assigned_to_email=assigned_email,
                        location=_get(row, "Location"),
                        notes=_get(row, "Notes"),
                        storage=_normalize_storage(_get(row, "Storage")),
                        storage_2=_normalize_storage(_get(row, "Storage_2", "Secondary Storage")),
                        memory_ram=_normalize_ram(_get(row, "Memory(RAM)", "RAM")),
                        purchase_date=_normalize_date(_get(row, "Purchase_Date", "Purchase Date")),
                        purchase_price=_get(row, "Purchase_Price", "Purchase Price"),
                        vendor=_get(row, "Vendor"),
                        invoice_ref=_get(row, "Invoice Reference", "Invoice Ref"),
                        warranty_end=_get(row, "Warranty_End", "Warranty End"),
                        pin_password=_get(row, "Pin/Password", "PIN/Password"),
                        charger_model=_get(row, "Charger_Model", "Charger Model"),
                        charger_serial=_get(row, "Charger_Serial", "Charger Serial"),
                        charger_notes=_get(row, "Charger_Notes", "Charger Notes"),
                        processor=_get(row, "Processor"),
                        graphics=_get(row, "Graphics"),
                        screen_size=_get(row, "Screen_Size", "Screen Size"),
                        os=_get(row, "OS", "Operating System"),
                        needs_sync=False
                    ))
                    new_assets += 1

                db.commit()
            except Exception as e:
                db.rollback()
                print(f"  Error processing asset {asset_id}: {e}")
                skipped_assets += 1

        print(f"[sync_from_excel] Assets: {new_assets} added, {updated_assets} updated, {skipped_assets} skipped.")

        _sync_status["status"] = "idle"
        _sync_status["last_sync"] = datetime.now().isoformat()
        _sync_status["details"] = f"Success. Employees: {new_emps + updated_emps}. Assets: {new_assets + updated_assets}."

    except Exception as e:
        traceback.print_exc()
        _sync_status["status"] = "error"
        _sync_status["error"] = str(e)
        _sync_status["details"] = "Failed during sync process."
        db.rollback()


def _parse_excel_timestamp(raw: str):
    """Try to parse a timestamp string from Excel in various formats."""
    if not raw or raw in ("None", "", "0"):
        return None
    for fmt in [
        None,  # fromisoformat
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S",
        "%m/%d/%Y %H:%M:%S",
        "%m/%d/%Y",
        "%d/%m/%Y",
        "%Y-%m-%d",
    ]:
        try:
            if fmt is None:
                return datetime.fromisoformat(raw)
            return datetime.strptime(raw, fmt)
        except (ValueError, TypeError):
            continue
    try:
        serial = float(raw)
        result = _excel_serial_to_str(serial)
        if result:
            return datetime.fromisoformat(result)
    except (ValueError, TypeError):
        pass
    return None


def sync_logs_from_excel(db: Session) -> dict:
    """
    Pulls the Assignment_Log table from Excel and imports entries not already
    present locally. Deduplicates via source_log_id (Excel LogID) when available;
    falls back to asset_id + action + date match.

    Returns {"imported": N, "skipped": N, "total": N}.
    """
    try:
        print("[sync_logs_from_excel] Fetching Assignment_Log from Excel...")
        log_rows = graph.get_table_rows(LOG_TABLE)
        print(f"[sync_logs_from_excel] Found {len(log_rows)} log rows.")

        if not log_rows:
            return {"imported": 0, "skipped": 0, "total": 0}

        print(f"[sync_logs_from_excel] Columns: {list(log_rows[0].keys())}")

        NOT_EMPTY = {"", "none", "not assigned", "n/a", "-"}
        imported = 0
        skipped  = 0

        for row in log_rows:
            def _s(*keys):
                for k in keys:
                    v = row.get(k)
                    if v is not None and str(v).strip() not in ("", "None"):
                        return str(v).strip()
                return ""

            excel_log_id = _s("LogID", "Log ID")

            # ── Dedup by LogID (primary) ───────────────────────────────────────
            if excel_log_id:
                if db.query(DBAssignmentLog).filter(
                    DBAssignmentLog.source_log_id == excel_log_id
                ).first():
                    skipped += 1
                    continue

            asset_id = _s("Asset ID", "AssetID")
            if not asset_id:
                skipped += 1
                continue

            action = _s("Action")
            if not action:
                skipped += 1
                continue

            # ── Timestamp ──────────────────────────────────────────────────────
            ts_raw    = _s("Date", "Timestamp")
            timestamp = _parse_excel_timestamp(ts_raw)
            if timestamp is None:
                timestamp = datetime.now(timezone.utc)
            elif timestamp.tzinfo is None:
                timestamp = timestamp.replace(tzinfo=timezone.utc)

            # ── Dedup fallback: same asset + action + same day (no LogID) ──────
            if not excel_log_id:
                ts_date_str = timestamp.strftime("%Y-%m-%d")
                existing_same_day = db.query(DBAssignmentLog).filter(
                    DBAssignmentLog.asset_id == asset_id,
                    DBAssignmentLog.action   == action,
                ).all()
                if any(
                    e.timestamp and e.timestamp.strftime("%Y-%m-%d") == ts_date_str
                    for e in existing_same_day
                ):
                    skipped += 1
                    continue

            # ── Employee email ─────────────────────────────────────────────────
            is_assign = "assign" in action.lower()
            if is_assign:
                emp_raw = _s("Assigned To", "AssignedTo")
            else:
                emp_raw = _s("Return From", "ReturnFrom")
                if not emp_raw:
                    emp_raw = _s("Assigned To", "AssignedTo")

            employee_email = emp_raw if emp_raw.lower() not in NOT_EMPTY else None

            # ── Asset meta for display ─────────────────────────────────────────
            brand      = _s("Brand")
            model      = _s("Model")
            asset_type = _s("Asset_Type", "Asset Type", "Item Type")
            parts      = [p for p in [brand, model, asset_id] if p]
            asset_label = " ".join(parts)

            notes = _s("Notes")

            db.add(DBAssignmentLog(
                asset_id=asset_id,
                action=action,
                employee_email=employee_email,
                timestamp=timestamp,
                notes=notes,
                needs_sync=False,
                source_log_id=excel_log_id or None,
                asset_type=asset_type or None,
                asset_label=asset_label or None,
            ))
            imported += 1

            if imported % 100 == 0:
                db.commit()
                print(f"  [sync_logs_from_excel] {imported} imported so far…")

        db.commit()
        print(f"[sync_logs_from_excel] Done. {imported} imported, {skipped} skipped.")
        return {"imported": imported, "skipped": skipped, "total": len(log_rows)}

    except Exception as e:
        traceback.print_exc()
        db.rollback()
        raise


def sync_to_excel(db: Session):
    """
    Pushes all local changes (needs_sync=True) back to the Excel workbook via Graph API.
    - Assets: updates the matching row in MasterTable by asset_id, or appends if new.
    - Logs:   appends new assignment/action log entries to Assignment_Log table.
    """
    # ── 1. Push pending asset changes ─────────────────────────────────────────
    pending_assets = db.query(DBAsset).filter(DBAsset.needs_sync == True).all()
    if not pending_assets:
        print("[sync_to_excel] No pending asset changes.")
    else:
        print(f"[sync_to_excel] Pushing {len(pending_assets)} asset(s) to Excel...")
        try:
            headers = graph.get_table_headers(MASTER_TABLE)
            existing_rows = graph.get_table_rows(MASTER_TABLE)
            row_index_by_id = {
                str(r.get("Asset ID", r.get("AssetID", ""))).strip(): r["_row_index"]
                for r in existing_rows
            }
        except Exception as e:
            print(f"[sync_to_excel] ERROR: Could not fetch MasterTable headers/rows: {e}")
            return

        pushed = 0
        for asset in pending_assets:
            emp = db.query(DBEmployee).filter(
                DBEmployee.email == asset.assigned_to_email
            ).first() if asset.assigned_to_email else None

            emp_display = emp.employee_display if emp and emp.employee_display else (emp.full_name if emp else "Not Assigned")
            field_map = {
                "Asset ID":         asset.asset_id,
                "AssetID":          asset.asset_id,
                "Asset_ID_QR":      asset.asset_id_qr or asset.asset_id.replace("-", ""),
                "AssetIDQR":        asset.asset_id_qr or asset.asset_id.replace("-", ""),
                "Asset_Type":       asset.asset_type or "",
                "Asset Type":       asset.asset_type or "",
                "Item Type":        asset.asset_type or "",
                "Status":           asset.status or "",
                "Condition":        asset.condition or "",
                "Brand":            asset.brand or "",
                "Model":            asset.model or "",
                "Serial_Number":    asset.serial_number or "",
                "Serial Number":    asset.serial_number or "",
                "SerialNumber":     asset.serial_number or "",
                "Storage":          asset.storage or "",
                "Storage_2":        asset.storage_2 or "",
                "Secondary Storage": asset.storage_2 or "",
                "Memory(RAM)":      asset.memory_ram or "",
                "RAM":              asset.memory_ram or "",
                "Purchase_Date":    asset.purchase_date or "",
                "Purchase Date":    asset.purchase_date or "",
                "Purchase_Price":   asset.purchase_price or "",
                "Purchase Price":   asset.purchase_price or "",
                "Vendor":           asset.vendor or "",
                "Invoice Reference": asset.invoice_ref or "",
                "Invoice Ref":      asset.invoice_ref or "",
                "Warranty_End":     asset.warranty_end or "",
                "Warranty End":     asset.warranty_end or "",
                "EmployeeID":       emp.employee_id if emp else "",
                "Employee ID":      emp.employee_id if emp else "",
                "EmployeeDisplay":  emp_display,
                "Username":         asset.assigned_to_email or "",
                "Location":         asset.location or "",
                "Notes":            asset.notes or "",
                "Pin/Password":     asset.pin_password or "",
                "PIN/Password":     asset.pin_password or "",
                "AssignmentID":     asset.assignment_id or "",
                "Assignment ID":    asset.assignment_id or "",
                "DateAssigned":     asset.date_assigned or "",
                "Date Assigned":    asset.date_assigned or "",
                "Charger_Model":    asset.charger_model or "",
                "Charger Model":    asset.charger_model or "",
                "Charger_Serial":   asset.charger_serial or "",
                "Charger Serial":   asset.charger_serial or "",
                "Charger_Notes":    asset.charger_notes or "",
                "Charger Notes":    asset.charger_notes or "",
                "Processor":        asset.processor or "",
                "Graphics":         asset.graphics or "",
                "Screen_Size":      asset.screen_size or "",
                "Screen Size":      asset.screen_size or "",
                "OS":               asset.os or "",
                "Operating System": asset.os or "",
            }
            row_values = [field_map.get(h, "") for h in headers]
            print(f"[sync_to_excel] Pushing asset {asset.asset_id} — {asset.status}")

            try:
                if asset.asset_id in row_index_by_id:
                    graph.update_table_row(MASTER_TABLE, row_index_by_id[asset.asset_id], row_values)
                else:
                    graph.add_table_row(MASTER_TABLE, row_values)
                asset.needs_sync = False
                pushed += 1
            except Exception as e:
                print(f"[sync_to_excel] ERROR pushing asset {asset.asset_id}: {e}")

        db.commit()
        print(f"[sync_to_excel] Pushed {pushed}/{len(pending_assets)} assets.")

    # ── 2. Push pending assignment logs ───────────────────────────────────────
    try:
        pending_logs = db.query(DBAssignmentLog).filter(DBAssignmentLog.needs_sync == True).all()
        if pending_logs:
            log_headers = graph.get_table_headers(LOG_TABLE)
            pushed_logs = 0
            for log in pending_logs:
                is_assign = log.action and "assign" in log.action.lower()
                log_asset = db.query(DBAsset).filter(DBAsset.asset_id == log.asset_id).first()
                log_id = f"LOG-{random.randint(100000, 999999)}"
                log_map = {
                    "LogID":        log_id,
                    "Log ID":       log_id,
                    "Date":         log.timestamp.isoformat() if log.timestamp else "",
                    "Timestamp":    log.timestamp.isoformat() if log.timestamp else "",
                    "Model":        log_asset.model or "" if log_asset else "",
                    "Brand":        log_asset.brand or "" if log_asset else "",
                    "Asset ID":     log.asset_id,
                    "AssetID":      log.asset_id,
                    "Action":       log.action,
                    "Status":       log.new_status or (log_asset.status if log_asset else ""),
                    "Condition":    log_asset.condition or "" if log_asset else "",
                    "Assigned To":  log.employee_email if is_assign else "Not Assigned",
                    "AssignedTo":   log.employee_email if is_assign else "Not Assigned",
                    "Return From":  log.employee_email if not is_assign else "",
                    "ReturnFrom":   log.employee_email if not is_assign else "",
                    "Notes":        log.notes or "",
                }
                row_vals = [log_map.get(h, "") for h in log_headers]
                try:
                    graph.add_table_row(LOG_TABLE, row_vals)
                    # Store LogID back so future pull-logs won't re-import this entry
                    log.source_log_id = log_id
                    log.needs_sync = False
                    pushed_logs += 1
                except Exception as e:
                    print(f"[sync_to_excel] ERROR pushing log {log.id}: {e}")
            db.commit()
            print(f"[sync_to_excel] Pushed {pushed_logs}/{len(pending_logs)} log entries.")
    except Exception as e:
        print(f"[sync_to_excel] WARNING: Could not push assignment logs: {e}")