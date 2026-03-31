from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from database import get_db
from models_db import DBEmployee
from models import EmployeeResponse, CreateEmployeeRequest
from config import EMP_TABLE
from graph_client import graph

router = APIRouter(prefix="/api")

def _db_employee_to_response(emp: DBEmployee) -> EmployeeResponse:
    return EmployeeResponse(
        employee_id=emp.employee_id or "",
        full_name=emp.full_name or "",
        email=emp.email or "",
        employee_display=emp.employee_display or emp.full_name or "",
        designation=emp.designation or "",
        is_room=emp.is_room,
    )

@router.get("/employees", response_model=list[EmployeeResponse])
async def list_employees(db: Session = Depends(get_db)):
    employees = db.query(DBEmployee).all()
    return [_db_employee_to_response(e) for e in employees]

@router.post("/employee/create")
async def create_employee(req: CreateEmployeeRequest, db: Session = Depends(get_db)):
    # Duplicate check
    existing = db.query(DBEmployee).filter(DBEmployee.email == req.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Employee with this email already exists")

    # Determine is_room from email pattern (rooms use synthetic email scheme)
    is_room = req.email.startswith("room:") and req.email.endswith("@local")

    # 1. Save to local DB
    emp_display = f"{req.employee_id} - {req.full_name}" if req.employee_id else req.full_name
    new_emp = DBEmployee(
        employee_id=req.employee_id or None,
        full_name=req.full_name,
        email=req.email,
        designation=req.designation or "",
        is_room=is_room,
        employee_display=emp_display,
    )
    db.add(new_emp)
    db.commit()
    db.refresh(new_emp)

    # 2. Push to Excel's tbl_Employees table
    # Get the current column order so we write values in the right positions
    try:
        headers = graph.get_table_headers(EMP_TABLE)
        # Build a row aligned to the Excel column order
        field_map = {
            "FullName":        req.full_name,
            "Full Name":       req.full_name,
            "Email":           req.email if not is_room else "",
            "Email Address":   req.email if not is_room else "",
            "EmployeeID":      req.employee_id or "",
            "Employee ID":     req.employee_id or "",
            "EmployeeDisplay": emp_display,
            "Designation":     req.designation or "",
            "Department":      "",
            "EmploymentStatus": "Active",
            "HireDate":        "",
            "TerminationDate": "",
        }
        row_values = [field_map.get(h, "") for h in headers]
        graph.add_table_row(EMP_TABLE, row_values)
        print(f"[create_employee] Pushed '{req.full_name}' to Excel tbl_Employees")
    except Exception as e:
        # Don't fail the whole request if Excel write fails — log and continue
        print(f"[create_employee] WARNING: Excel write failed: {e}")

    return {"success": True, "email": new_emp.email, "is_room": is_room}
