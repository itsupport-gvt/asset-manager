"""
Asset write actions — Assign, Return, Create, Update.
Uses local SQLAlchemy DB instead of direct Graph API calls for vastly improved performance.
Changes are marked `needs_sync = True` to be pushed to Excel later by the SyncService.
"""

import json
import random
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from database import get_db
from models_db import DBAsset, DBEmployee, DBAssignmentLog
from models import AssignRequest, ReturnRequest, CreateAssetRequest, SwapRequest
from config import TYPE_CODE_MAP, MASTER_TABLE
from graph_client import graph

router = APIRouter(prefix="/api")


def _asset_label(asset: DBAsset) -> str:
    """Return a human-readable label for an asset, e.g. 'Dell XPS 15 LT-2312-0001'."""
    parts = [p for p in [asset.brand, asset.model, asset.asset_id] if p]
    return " ".join(parts)


# ── Assign ────────────────────────────────────────────────────────────────────

@router.post("/asset/assign")
async def assign_asset(req: AssignRequest, db: Session = Depends(get_db)):
    db_asset = db.query(DBAsset).filter(DBAsset.asset_id == req.asset_id).first()
    if not db_asset:
        raise HTTPException(status_code=404, detail=f"Asset '{req.asset_id}' not found")

    db_emp = db.query(DBEmployee).filter(DBEmployee.email == req.employee_email).first()
    if not db_emp:
        raise HTTPException(status_code=404, detail=f"Employee '{req.employee_email}' not found")

    new_assign_id = f"AS-{random.randint(10000, 99999)}"
    timestamp = datetime.now(timezone.utc)

    old_status  = db_asset.status
    label       = _asset_label(db_asset)
    atype       = db_asset.asset_type

    db_asset.status = "Active"
    if req.condition:
        db_asset.condition = req.condition
    db_asset.assigned_to_email = db_emp.email
    db_asset.assignment_id = new_assign_id
    db_asset.date_assigned = timestamp.isoformat()
    db_asset.needs_sync = True

    db.add(DBAssignmentLog(
        asset_id=req.asset_id,
        action="Assign",
        employee_email=db_emp.email,
        timestamp=timestamp,
        notes=req.notes or "",
        needs_sync=True,
        old_status=old_status,
        new_status="Active",
        asset_type=atype,
        asset_label=label,
    ))
    db.commit()

    return {"success": True, "assignment_id": new_assign_id, "asset_id": req.asset_id}


# ── Return ────────────────────────────────────────────────────────────────────

@router.post("/asset/return")
async def return_asset(req: ReturnRequest, db: Session = Depends(get_db)):
    db_asset = db.query(DBAsset).filter(DBAsset.asset_id == req.asset_id).first()
    if not db_asset:
        raise HTTPException(status_code=404, detail=f"Asset '{req.asset_id}' not found")

    returned_from = db_asset.assigned_to_email or ""
    old_status    = db_asset.status
    label         = _asset_label(db_asset)
    atype         = db_asset.asset_type
    timestamp     = datetime.now(timezone.utc)

    db_asset.status = "In Stock"
    if req.condition:
        db_asset.condition = req.condition
    db_asset.assigned_to_email = None
    db_asset.assignment_id = ""
    db_asset.date_assigned = ""
    db_asset.needs_sync = True

    db.add(DBAssignmentLog(
        asset_id=req.asset_id,
        action="Return",
        employee_email=returned_from,
        timestamp=timestamp,
        notes=req.notes or "",
        needs_sync=True,
        old_status=old_status,
        new_status="In Stock",
        asset_type=atype,
        asset_label=label,
    ))
    db.commit()

    return {"success": True, "returned_from": returned_from, "asset_id": req.asset_id}


# ── Bulk Return (Resignation / Offboarding) ───────────────────────────────────

@router.post("/employee/{employee_email}/bulk-return")
async def bulk_return(employee_email: str, body: dict, db: Session = Depends(get_db)):
    """
    Return multiple assets from one employee at once.
    Body: {
        "items": [{"asset_id": str, "condition": str, "notes": str}, ...],
        "reason": str   # e.g. "Resignation", "Transfer", "Offboarding"
    }
    Returns: { returned: [asset_id, ...], failed: [{asset_id, reason}, ...] }
    """
    items  = body.get("items", [])
    reason = body.get("reason", "Bulk Return")

    returned  = []
    failed    = []
    timestamp = datetime.now(timezone.utc)

    for item in items:
        asset_id  = item.get("asset_id", "")
        condition = item.get("condition", "")
        notes     = item.get("notes", "")

        db_asset = db.query(DBAsset).filter(DBAsset.asset_id == asset_id).first()
        if not db_asset:
            failed.append({"asset_id": asset_id, "reason": "Not found"})
            continue
        if not db_asset.assigned_to_email:
            failed.append({"asset_id": asset_id, "reason": "Not assigned"})
            continue

        returned_from = db_asset.assigned_to_email
        old_status    = db_asset.status
        label         = _asset_label(db_asset)
        atype         = db_asset.asset_type

        db_asset.status            = "In Stock"
        db_asset.assigned_to_email = None
        db_asset.assignment_id     = ""
        db_asset.date_assigned     = ""
        db_asset.needs_sync        = True
        if condition:
            db_asset.condition = condition

        note_str = f"[{reason}] {notes}".strip(" []") if notes else f"Bulk return — {reason}"
        db.add(DBAssignmentLog(
            asset_id=asset_id,
            action="Return",
            employee_email=returned_from,
            timestamp=timestamp,
            notes=note_str,
            needs_sync=True,
            old_status=old_status,
            new_status="In Stock",
            asset_type=atype,
            asset_label=label,
        ))
        returned.append(asset_id)

    db.commit()
    return {"returned": returned, "failed": failed, "total": len(returned)}


# ── Bulk Assign ───────────────────────────────────────────────────────────────

@router.post("/employee/{employee_email}/bulk-assign")
async def bulk_assign(employee_email: str, body: dict, db: Session = Depends(get_db)):
    """
    Assign multiple assets to one employee at once.
    Body: { "asset_ids": [str, ...] }
    Returns: { assigned: [asset_id, ...], failed: [{asset_id, reason}, ...] }
    """
    asset_ids = body.get("asset_ids", [])

    db_emp = db.query(DBEmployee).filter(DBEmployee.email == employee_email).first()
    if not db_emp:
        raise HTTPException(status_code=404, detail=f"Employee '{employee_email}' not found")

    assigned  = []
    failed    = []
    timestamp = datetime.now(timezone.utc)

    for asset_id in asset_ids:
        db_asset = db.query(DBAsset).filter(DBAsset.asset_id == asset_id).first()
        if not db_asset:
            failed.append({"asset_id": asset_id, "reason": "Not found"})
            continue
        if db_asset.assigned_to_email:
            failed.append({"asset_id": asset_id, "reason": f"Already assigned to {db_asset.assigned_to_email}"})
            continue

        new_assign_id = f"AS-{random.randint(10000, 99999)}"
        old_status    = db_asset.status
        label         = _asset_label(db_asset)
        atype         = db_asset.asset_type

        db_asset.status            = "Active"
        db_asset.assigned_to_email = db_emp.email
        db_asset.assignment_id     = new_assign_id
        db_asset.date_assigned     = timestamp.isoformat()
        db_asset.needs_sync        = True

        db.add(DBAssignmentLog(
            asset_id=asset_id,
            action="Assign",
            employee_email=db_emp.email,
            timestamp=timestamp,
            notes="Bulk assign",
            needs_sync=True,
            old_status=old_status,
            new_status="Active",
            asset_type=atype,
            asset_label=label,
        ))
        assigned.append(asset_id)

    db.commit()
    return {"assigned": assigned, "failed": failed, "total": len(assigned)}


# ── Create ────────────────────────────────────────────────────────────────────

@router.post("/asset/create")
async def create_asset(req: CreateAssetRequest, db: Session = Depends(get_db)):
    type_code = TYPE_CODE_MAP.get(req.asset_type)
    if not type_code:
        raise HTTPException(
            status_code=422,
            detail=f"Unknown asset type '{req.asset_type}'. Valid types: {list(TYPE_CODE_MAP.keys())}",
        )

    serial_up = req.serial_number.upper().strip()

    # Duplicate check
    existing = db.query(DBAsset).filter(
        DBAsset.serial_number == serial_up,
        DBAsset.asset_type == req.asset_type
    ).first()

    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Serial '{req.serial_number}' already exists for '{req.asset_type}'",
        )

    # Date code from purchase_date string (YYYY-MM-DD)
    date_code = "XXXX"
    if req.purchase_date:
        try:
            pd_obj = datetime.strptime(req.purchase_date[:10], "%Y-%m-%d")
            date_code = f"{str(pd_obj.year)[-2:]}{pd_obj.month:02d}"
        except ValueError:
            pass

    id_prefix = f"{type_code}-{date_code}"

    # Find next sequence number
    similar_assets = db.query(DBAsset.asset_id).filter(DBAsset.asset_id.startswith(id_prefix)).all()
    max_seq = 0
    for (aid,) in similar_assets:
        parts = aid.split("-")
        if len(parts) >= 3:
            try:
                seq = int(parts[2])
                if seq > max_seq:
                    max_seq = seq
            except ValueError:
                pass

    new_asset_id    = f"{id_prefix}-{(max_seq + 1):04d}"
    new_asset_id_qr = new_asset_id.replace("-", "")

    new_asset = DBAsset(
        asset_id=new_asset_id,
        asset_id_qr=new_asset_id_qr,
        asset_type=req.asset_type,
        status=req.status,
        condition=req.condition,
        brand=req.brand,
        model=req.model,
        serial_number=serial_up,
        storage=req.storage,
        memory_ram=req.memory_ram,
        processor=req.processor,
        graphics=req.graphics,
        screen_size=req.screen_size,
        os=req.os,
        purchase_date=req.purchase_date,
        purchase_price=req.purchase_price,
        vendor=req.vendor,
        invoice_ref=req.invoice_ref,
        warranty_end=req.warranty_end,
        assigned_to_email=None,
        location=req.location,
        notes=req.notes,
        pin_password=req.pin_password,
        charger_model=req.charger_model or "",
        charger_serial=req.charger_serial or "",
        charger_notes=req.charger_notes or "",
        needs_sync=True
    )
    db.add(new_asset)
    db.commit()

    # Push to Excel MasterTable immediately
    try:
        headers = graph.get_table_headers(MASTER_TABLE)
        field_map = {
            "Asset ID":          new_asset_id,
            "AssetID":           new_asset_id,
            "Asset_ID_QR":       new_asset_id_qr,
            "AssetIDQR":         new_asset_id_qr,
            "Asset_Type":        req.asset_type,
            "Asset Type":        req.asset_type,
            "Item Type":         req.asset_type,
            "Status":            req.status or "In Stock",
            "Condition":         req.condition or "",
            "Brand":             req.brand or "",
            "Model":             req.model or "",
            "Serial_Number":     serial_up,
            "Serial Number":     serial_up,
            "SerialNumber":      serial_up,
            "Storage":           req.storage or "",
            "Memory(RAM)":       req.memory_ram or "",
            "RAM":               req.memory_ram or "",
            "Purchase_Date":     req.purchase_date or "",
            "Purchase Date":     req.purchase_date or "",
            "Purchase_Price":    req.purchase_price or "",
            "Purchase Price":    req.purchase_price or "",
            "Vendor":            req.vendor or "",
            "Invoice Reference": req.invoice_ref or "",
            "Invoice Ref":       req.invoice_ref or "",
            "Warranty_End":      req.warranty_end or "",
            "Warranty End":      req.warranty_end or "",
            "Username":          "",
            "EmployeeID":        "",
            "Employee ID":       "",
            "EmployeeDisplay":   "Not Assigned",
            "Location":          req.location or "",
            "Notes":             req.notes or "",
            "Pin/Password":      req.pin_password or "",
            "PIN/Password":      req.pin_password or "",
            "AssignmentID":      "",
            "Assignment ID":     "",
            "DateAssigned":      "",
            "Date Assigned":     "",
            "Charger_Model":     req.charger_model or "",
            "Charger Model":     req.charger_model or "",
            "Charger_Serial":    req.charger_serial or "",
            "Charger Serial":    req.charger_serial or "",
            "Charger_Notes":     req.charger_notes or "",
            "Charger Notes":     req.charger_notes or "",
        }
        row_values = [field_map.get(h, "") for h in headers]
        graph.add_table_row(MASTER_TABLE, row_values)
        new_asset.needs_sync = False
        db.commit()
        print(f"[create_asset] Pushed '{new_asset_id}' to Excel MasterTable")
    except Exception as e:
        print(f"[create_asset] WARNING: Excel write failed: {e}")

    # Audit log for asset creation
    asset_label = " ".join(p for p in [req.asset_type, req.brand, req.model, new_asset_id] if p)
    db.add(DBAssignmentLog(
        asset_id=new_asset_id,
        action="Create",
        employee_email=None,
        timestamp=datetime.now(timezone.utc),
        notes=f"Asset created: {req.asset_type} {req.brand or ''} {req.model or ''}".strip(),
        needs_sync=True,
        old_status=None,
        new_status=req.status,
        asset_type=req.asset_type,
        asset_label=asset_label,
    ))
    db.commit()

    return {
        "success": True,
        "asset_id": new_asset_id,
        "asset_id_qr": new_asset_id_qr,
    }


# ── Update ────────────────────────────────────────────────────────────────────

@router.post("/asset/update/{asset_id}")
async def update_asset(asset_id: str, req: CreateAssetRequest, db: Session = Depends(get_db)):
    db_asset = db.query(DBAsset).filter(DBAsset.asset_id == asset_id).first()
    if not db_asset:
        raise HTTPException(status_code=404, detail=f"Asset '{asset_id}' not found")

    # ── Capture before-state for change diff ──────────────────────────────────
    old_status = db_asset.status

    _track = [
        ("asset_type",    req.asset_type),
        ("status",        req.status),
        ("condition",     req.condition),
        ("brand",         req.brand),
        ("model",         req.model),
        ("serial_number", req.serial_number.upper().strip() if req.serial_number else req.serial_number),
        ("storage",       req.storage),
        ("memory_ram",    req.memory_ram),
        ("processor",     req.processor),
        ("graphics",      req.graphics),
        ("screen_size",   req.screen_size),
        ("os",            req.os),
        ("purchase_date", req.purchase_date),
        ("purchase_price",req.purchase_price),
        ("vendor",        req.vendor),
        ("invoice_ref",   req.invoice_ref),
        ("warranty_end",  req.warranty_end),
        ("location",      req.location),
        ("notes",         req.notes),
        ("pin_password",  req.pin_password),
        ("charger_model", req.charger_model),
        ("charger_serial",req.charger_serial),
        ("charger_notes", req.charger_notes),
    ]
    diffs = []
    for field, new_val in _track:
        if new_val is None:
            continue
        old_val   = getattr(db_asset, field) or ""
        new_clean = new_val or ""
        if str(old_val) != str(new_clean):
            diffs.append({"field": field, "old": str(old_val), "new": str(new_clean)})

    # ── Apply changes ──────────────────────────────────────────────────────────
    if req.asset_type:
        db_asset.asset_type = req.asset_type
    if req.status:
        db_asset.status = req.status
    if req.condition:
        db_asset.condition = req.condition
    if req.brand:
        db_asset.brand = req.brand
    if req.model:
        db_asset.model = req.model
    if req.serial_number:
        db_asset.serial_number = req.serial_number.upper().strip()
    if req.storage is not None:
        db_asset.storage = req.storage
    if req.memory_ram is not None:
        db_asset.memory_ram = req.memory_ram
    if req.processor is not None:
        db_asset.processor = req.processor
    if req.graphics is not None:
        db_asset.graphics = req.graphics
    if req.screen_size is not None:
        db_asset.screen_size = req.screen_size
    if req.os is not None:
        db_asset.os = req.os
    if req.purchase_date is not None:
        db_asset.purchase_date = req.purchase_date
    if req.purchase_price is not None:
        db_asset.purchase_price = req.purchase_price
    if req.vendor is not None:
        db_asset.vendor = req.vendor
    if req.invoice_ref is not None:
        db_asset.invoice_ref = req.invoice_ref
    if req.warranty_end is not None:
        db_asset.warranty_end = req.warranty_end
    if req.location is not None:
        db_asset.location = req.location
    if req.notes is not None:
        db_asset.notes = req.notes
    if req.pin_password is not None:
        db_asset.pin_password = req.pin_password
    if req.charger_model is not None:
        db_asset.charger_model = req.charger_model
    if req.charger_serial is not None:
        db_asset.charger_serial = req.charger_serial
    if req.charger_notes is not None:
        db_asset.charger_notes = req.charger_notes

    db_asset.needs_sync = True
    db.commit()

    # ── Audit log ──────────────────────────────────────────────────────────────
    label    = _asset_label(db_asset)
    note_str = (
        f"Updated: {', '.join(d['field'] for d in diffs)}" if diffs
        else "Record saved (no field changes)"
    )
    db.add(DBAssignmentLog(
        asset_id=asset_id,
        action="Update",
        employee_email=db_asset.assigned_to_email,
        timestamp=datetime.now(timezone.utc),
        notes=note_str,
        needs_sync=True,
        old_status=old_status,
        new_status=db_asset.status,
        changed_fields=json.dumps(diffs) if diffs else None,
        asset_type=db_asset.asset_type,
        asset_label=label,
    ))
    db.commit()

    return {"success": True}


# ── Swap ──────────────────────────────────────────────────────────────────────

@router.post("/asset/swap")
async def swap_asset(req: SwapRequest, db: Session = Depends(get_db)):
    """
    Two swap modes:
      - "person": same asset reassigned to a different employee.
                  Returns from current employee, assigns to new employee.
      - "stock":  return current asset (with custom return_status),
                  assign a different in-stock asset to the same employee.
    Both modes log a "Swap" action for each asset involved.
    """
    timestamp = datetime.now(timezone.utc)

    # ── Load current asset ─────────────────────────────────────────────────────
    db_asset = db.query(DBAsset).filter(DBAsset.asset_id == req.asset_id).first()
    if not db_asset:
        raise HTTPException(status_code=404, detail=f"Asset '{req.asset_id}' not found")
    if not db_asset.assigned_to_email:
        raise HTTPException(status_code=400, detail=f"Asset '{req.asset_id}' is not currently assigned")

    current_employee_email = db_asset.assigned_to_email
    old_label = _asset_label(db_asset)
    atype     = db_asset.asset_type

    # ── PERSON SWAP ───────────────────────────────────────────────────────────
    if req.mode == "person":
        if not req.new_employee_email:
            raise HTTPException(status_code=400, detail="new_employee_email is required for person swap")

        db_new_emp = db.query(DBEmployee).filter(DBEmployee.email == req.new_employee_email).first()
        if not db_new_emp:
            raise HTTPException(status_code=404, detail=f"Employee '{req.new_employee_email}' not found")

        new_assign_id = f"AS-{random.randint(10000, 99999)}"
        old_status    = db_asset.status

        # Re-assign the same asset to new employee
        db_asset.assigned_to_email = db_new_emp.email
        db_asset.assignment_id     = new_assign_id
        db_asset.date_assigned     = timestamp.isoformat()
        if req.condition:
            db_asset.condition = req.condition
        db_asset.needs_sync = True

        swap_note = f"Swapped from {current_employee_email} → {db_new_emp.email}. {req.notes or ''}".strip()

        db.add(DBAssignmentLog(
            asset_id=req.asset_id,
            action="Swap",
            employee_email=db_new_emp.email,
            timestamp=timestamp,
            notes=swap_note,
            needs_sync=True,
            old_status=old_status,
            new_status="Active",
            asset_type=atype,
            asset_label=old_label,
        ))
        db.commit()
        return {"success": True, "mode": "person", "asset_id": req.asset_id, "new_employee": db_new_emp.email}

    # ── STOCK SWAP ────────────────────────────────────────────────────────────
    elif req.mode == "stock":
        if not req.replacement_asset_id:
            raise HTTPException(status_code=400, detail="replacement_asset_id is required for stock swap")

        db_replacement = db.query(DBAsset).filter(DBAsset.asset_id == req.replacement_asset_id).first()
        if not db_replacement:
            raise HTTPException(status_code=404, detail=f"Replacement asset '{req.replacement_asset_id}' not found")
        if db_replacement.assigned_to_email:
            raise HTTPException(status_code=400, detail=f"Replacement asset '{req.replacement_asset_id}' is already assigned to {db_replacement.assigned_to_email}")

        old_status       = db_asset.status
        repl_old_status  = db_replacement.status
        repl_label       = _asset_label(db_replacement)
        new_assign_id    = f"AS-{random.randint(10000, 99999)}"
        return_status    = req.return_status or "In Stock"

        # Return current asset to chosen status
        db_asset.status            = return_status
        db_asset.assigned_to_email = None
        db_asset.assignment_id     = ""
        db_asset.date_assigned     = ""
        db_asset.needs_sync        = True
        if req.condition:
            db_asset.condition = req.condition

        return_note = f"Swapped out — replaced by {req.replacement_asset_id}. {req.notes or ''}".strip()
        db.add(DBAssignmentLog(
            asset_id=req.asset_id,
            action="Swap",
            employee_email=current_employee_email,
            timestamp=timestamp,
            notes=return_note,
            needs_sync=True,
            old_status=old_status,
            new_status=return_status,
            asset_type=atype,
            asset_label=old_label,
        ))

        # Assign replacement asset to same employee
        db_replacement.status            = "Active"
        db_replacement.assigned_to_email = current_employee_email
        db_replacement.assignment_id     = new_assign_id
        db_replacement.date_assigned     = timestamp.isoformat()
        db_replacement.needs_sync        = True

        assign_note = f"Swap replacement for {req.asset_id}. {req.notes or ''}".strip()
        db.add(DBAssignmentLog(
            asset_id=req.replacement_asset_id,
            action="Swap",
            employee_email=current_employee_email,
            timestamp=timestamp,
            notes=assign_note,
            needs_sync=True,
            old_status=repl_old_status,
            new_status="Active",
            asset_type=db_replacement.asset_type,
            asset_label=repl_label,
        ))
        db.commit()
        return {
            "success": True, "mode": "stock",
            "returned_asset": req.asset_id, "return_status": return_status,
            "assigned_asset": req.replacement_asset_id, "employee": current_employee_email,
        }

    else:
        raise HTTPException(status_code=400, detail=f"Unknown swap mode '{req.mode}'. Use 'person' or 'stock'.")