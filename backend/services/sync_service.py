import json
import random
import traceback
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from datetime import datetime

from config import MASTER_TABLE, EMP_TABLE, LOG_TABLE
from graph_client import graph, _excel_serial_to_str
from models_db import DBAsset, DBEmployee, DBAssignmentLog


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

        # Known rooms to import as is_room=True
        room_names = [
            "Workspace", "Chamber Room", "HR Room", "Engineering Room",
            "Main Hall", "Proposal Eng Dept.", "Not Assigned", "Proposal Server"
        ]

        # 1. Process Employees and Rooms
        for idx, row in enumerate(emp_rows):
            name = str(row.get("FullName", row.get("Full Name", ""))).strip()
            if not name or name == "None":
                continue

            # Check if it's a room
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

            # Update or Create
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
                    new_emp = DBEmployee(
                        email=email,
                        full_name=name,
                        employee_id=emp_id,
                        designation=designation,
                        is_room=is_room,
                        employee_display=emp_display,
                    )
                    db.add(new_emp)
                    new_emps += 1
                
                # Commit PER ROW so one bad row doesn't crash the whole sync
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

        # 2. Process Assets
        print("[sync_from_excel] Fetching assets...")
        asset_rows = graph.get_table_rows(MASTER_TABLE)
        print(f"[sync_from_excel] Found {len(asset_rows)} raw asset rows. Processing...")
        
        new_assets = 0
        updated_assets = 0
        skipped_assets = 0
        
        for idx, row in enumerate(asset_rows):
            asset_id = str(row.get("Asset ID", row.get("AssetID", row.get("AssetId", "")))).strip()
            if not asset_id or asset_id == "None":
                print(f"  Skipping asset row {idx} with blank Asset ID.")
                skipped_assets += 1
                continue

            # Print first row headers once to confirm column names
            if idx == 0:
                print(f"  [DEBUG] MasterTable columns: {list(row.keys())}")

            # Username column contains email, room name, "Not Assigned", or empty
            username_raw = str(row.get("Username", "")).strip()
            assigned_email = None

            NOT_ASSIGNED_VALUES = {"", "none", "not assigned", "n/a", "-"}
            if username_raw.lower() not in NOT_ASSIGNED_VALUES:
                if "@" in username_raw:
                    # Real email — look up directly
                    emp = db.query(DBEmployee).filter(DBEmployee.email.ilike(username_raw)).first()
                    if emp:
                        assigned_email = emp.email
                    else:
                        assigned_email = username_raw  # store raw so reference isn't lost
                        print(f"  [WARN] Email '{username_raw}' not in employees for asset {asset_id} — storing raw")
                else:
                    # Room name — match by synthetic email
                    synthetic = f"room:{username_raw.lower().replace(' ', '_')}@local"
                    emp = db.query(DBEmployee).filter(DBEmployee.email == synthetic).first()
                    if not emp:
                        emp = db.query(DBEmployee).filter(DBEmployee.full_name.ilike(username_raw)).first()
                    if emp:
                        assigned_email = emp.email
                    else:
                        print(f"  [WARN] Cannot resolve '{username_raw}' for asset {asset_id}")

            try:
                existing = db.query(DBAsset).filter(DBAsset.asset_id == asset_id).first()
                def _get(r, *keys, fallback=""):
                    for k in keys:
                        v = r.get(k)
                        if v is not None and str(v).strip() not in ("", "None"):
                            return str(v).strip()
                    return str(fallback) if fallback is not None else ""

                if existing:
                    existing.asset_type = _get(row, "Asset_Type", "Asset Type", "Item Type", fallback=existing.asset_type)
                    existing.status = _get(row, "Status", fallback=existing.status)
                    existing.condition = _get(row, "Condition", fallback=existing.condition)
                    existing.brand = _get(row, "Brand", fallback=existing.brand)
                    existing.model = _get(row, "Model", fallback=existing.model)
                    existing.serial_number = _get(row, "Serial_Number", "Serial Number", "SerialNumber", fallback=existing.serial_number)
                    existing.assigned_to_email = assigned_email
                    existing.location = _get(row, "Location", fallback=existing.location)
                    existing.notes = _get(row, "Notes", fallback=existing.notes)
                    existing.storage = _get(row, "Storage", fallback=existing.storage)
                    existing.memory_ram = _get(row, "Memory(RAM)", "RAM", fallback=existing.memory_ram)
                    existing.purchase_date = _get(row, "Purchase_Date", "Purchase Date", fallback=existing.purchase_date)
                    existing.purchase_price = _get(row, "Purchase_Price", "Purchase Price", fallback=existing.purchase_price)
                    existing.vendor = _get(row, "Vendor", fallback=existing.vendor)
                    existing.invoice_ref = _get(row, "Invoice Reference", "Invoice Ref", fallback=existing.invoice_ref)
                    existing.warranty_end = _get(row, "Warranty_End", "Warranty End", fallback=existing.warranty_end)
                    existing.pin_password = _get(row, "Pin/Password", "PIN/Password", fallback=existing.pin_password)
                    existing.charger_model = _get(row, "Charger_Model", "Charger Model", fallback=existing.charger_model)
                    existing.charger_serial = _get(row, "Charger_Serial", "Charger Serial", fallback=existing.charger_serial)
                    existing.charger_notes = _get(row, "Charger_Notes", "Charger Notes", fallback=existing.charger_notes)
                    # QR ID: prefer Excel's Asset_ID_QR column, fall back to generated
                    qr_from_excel = str(row.get("Asset_ID_QR", row.get("AssetIDQR", ""))).strip()
                    existing.asset_id_qr = qr_from_excel if qr_from_excel and qr_from_excel != "None" else asset_id.replace("-", "")
                    existing.needs_sync = False  # just synced from remote
                    updated_assets += 1
                else:
                    qr_from_excel = str(row.get("Asset_ID_QR", row.get("AssetIDQR", ""))).strip()
                    asset_id_qr = qr_from_excel if qr_from_excel and qr_from_excel != "None" else asset_id.replace("-", "")
                    new_asset = DBAsset(
                        asset_id=asset_id,
                        asset_id_qr=asset_id_qr,
                        asset_type=_get(row, "Asset_Type", "Asset Type", "Item Type"),
                        status=_get(row, "Status", fallback="In Stock"),
                        condition=_get(row, "Condition"),
                        brand=_get(row, "Brand"),
                        model=_get(row, "Model"),
                        serial_number=_get(row, "Serial_Number", "Serial Number", "SerialNumber"),
                        assigned_to_email=assigned_email,
                        location=_get(row, "Location"),
                        notes=_get(row, "Notes"),
                        storage=_get(row, "Storage"),
                        memory_ram=_get(row, "Memory(RAM)", "RAM"),
                        purchase_date=_get(row, "Purchase_Date", "Purchase Date"),
                        purchase_price=_get(row, "Purchase_Price", "Purchase Price"),
                        vendor=_get(row, "Vendor"),
                        invoice_ref=_get(row, "Invoice Reference", "Invoice Ref"),
                        warranty_end=_get(row, "Warranty_End", "Warranty End"),
                        pin_password=_get(row, "Pin/Password", "PIN/Password"),
                        charger_model=_get(row, "Charger_Model", "Charger Model"),
                        charger_serial=_get(row, "Charger_Serial", "Charger Serial"),
                        charger_notes=_get(row, "Charger_Notes", "Charger Notes"),
                        needs_sync=False
                    )
                    db.add(new_asset)
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


def sync_to_excel(db: Session):
    """
    Pushes all local changes (needs_sync=True) back to the Excel workbook via Graph API.
    - Assets: updates the matching row in MasterTable by asset_id, or appends if new.
    - Logs:   appends new assignment log entries to Assignment_Log table.
    """
    # ── 1. Push pending asset changes ─────────────────────────────────────────
    pending_assets = db.query(DBAsset).filter(DBAsset.needs_sync == True).all()
    if not pending_assets:
        print("[sync_to_excel] No pending asset changes.")
    else:
        print(f"[sync_to_excel] Pushing {len(pending_assets)} asset(s) to Excel...")
        try:
            headers = graph.get_table_headers(MASTER_TABLE)
            # Fetch all existing rows to find row_index by asset_id
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
                # Asset ID variants
                "Asset ID":         asset.asset_id,
                "AssetID":          asset.asset_id,
                # QR ID variants
                "Asset_ID_QR":      asset.asset_id_qr or asset.asset_id.replace("-", ""),
                "AssetIDQR":        asset.asset_id_qr or asset.asset_id.replace("-", ""),
                # Asset type variants
                "Asset_Type":       asset.asset_type or "",
                "Asset Type":       asset.asset_type or "",
                "Item Type":        asset.asset_type or "",
                # Status / Condition
                "Status":           asset.status or "",
                "Condition":        asset.condition or "",
                # Brand / Model
                "Brand":            asset.brand or "",
                "Model":            asset.model or "",
                # Serial number variants
                "Serial_Number":    asset.serial_number or "",
                "Serial Number":    asset.serial_number or "",
                "SerialNumber":     asset.serial_number or "",
                # Specs
                "Storage":          asset.storage or "",
                "Memory(RAM)":      asset.memory_ram or "",
                "RAM":              asset.memory_ram or "",
                # Purchase info variants
                "Purchase_Date":    asset.purchase_date or "",
                "Purchase Date":    asset.purchase_date or "",
                "Purchase_Price":   asset.purchase_price or "",
                "Purchase Price":   asset.purchase_price or "",
                "Vendor":           asset.vendor or "",
                # Invoice / Warranty variants
                "Invoice Reference": asset.invoice_ref or "",
                "Invoice Ref":      asset.invoice_ref or "",
                "Warranty_End":     asset.warranty_end or "",
                "Warranty End":     asset.warranty_end or "",
                # Assignment info variants
                "EmployeeID":       emp.employee_id if emp else "",
                "Employee ID":      emp.employee_id if emp else "",
                "EmployeeDisplay":  emp_display,
                "Username":         asset.assigned_to_email or "",
                "Location":         asset.location or "",
                "Notes":            asset.notes or "",
                # Password variants
                "Pin/Password":     asset.pin_password or "",
                "PIN/Password":     asset.pin_password or "",
                # Assignment ID / date variants
                "AssignmentID":     asset.assignment_id or "",
                "Assignment ID":    asset.assignment_id or "",
                "DateAssigned":     asset.date_assigned or "",
                "Date Assigned":    asset.date_assigned or "",
                # Charger fields (Laptop only)
                "Charger_Model":    asset.charger_model or "",
                "Charger Model":    asset.charger_model or "",
                "Charger_Serial":   asset.charger_serial or "",
                "Charger Serial":   asset.charger_serial or "",
                "Charger_Notes":    asset.charger_notes or "",
                "Charger Notes":    asset.charger_notes or "",
            }
            row_values = [field_map.get(h, "") for h in headers]
            import json
            print(f"[sync_to_excel] DEBUG field_map Asset_Type: {field_map.get('Asset_Type')} Serial: {field_map.get('Serial_Number')}")
            print(f"[sync_to_excel] DEBUG Headers length: {len(headers)} Row length: {len(row_values)}")
            print(f"[sync_to_excel] DEBUG Headers: {headers}")
            print(f"[sync_to_excel] DEBUG row_values: {row_values}")


            try:
                if asset.asset_id in row_index_by_id:
                    # Update existing row
                    graph.update_table_row(MASTER_TABLE, row_index_by_id[asset.asset_id], row_values)
                else:
                    # New asset — append row
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
                # Look up the asset to fill in Model, Brand, Status, Condition
                log_asset = db.query(DBAsset).filter(DBAsset.asset_id == log.asset_id).first()
                log_id = f"LOG-{random.randint(100000, 999999)}"
                log_map = {
                    # LogID variants
                    "LogID":        log_id,
                    "Log ID":       log_id,
                    # Date / Timestamp variants
                    "Date":         log.timestamp.isoformat() if log.timestamp else "",
                    "Timestamp":    log.timestamp.isoformat() if log.timestamp else "",
                    # Asset info (from asset record)
                    "Model":        log_asset.model or "" if log_asset else "",
                    "Brand":        log_asset.brand or "" if log_asset else "",
                    # Asset ID variants
                    "Asset ID":     log.asset_id,
                    "AssetID":      log.asset_id,
                    # Action
                    "Action":       log.action,
                    # Status / Condition
                    "Status":       log_asset.status or "" if log_asset else "",
                    "Condition":    log_asset.condition or "" if log_asset else "",
                    # Assignment columns
                    "Assigned To":  log.employee_email if is_assign else "Not Assigned",
                    "AssignedTo":   log.employee_email if is_assign else "Not Assigned",
                    "Return From":  log.employee_email if not is_assign else "",
                    "ReturnFrom":   log.employee_email if not is_assign else "",
                    "Notes":        log.notes or "",
                }
                row_vals = [log_map.get(h, "") for h in log_headers]
                try:
                    graph.add_table_row(LOG_TABLE, row_vals)
                    log.needs_sync = False
                    pushed_logs += 1
                except Exception as e:
                    print(f"[sync_to_excel] ERROR pushing log {log.id}: {e}")
            db.commit()
            print(f"[sync_to_excel] Pushed {pushed_logs}/{len(pending_logs)} log entries.")
    except Exception as e:
        print(f"[sync_to_excel] WARNING: Could not push assignment logs: {e}")

