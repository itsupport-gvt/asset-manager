from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from database import get_db
from models_db import DBEmployee
from models import EmployeeResponse, CreateEmployeeRequest
from config import EMP_TABLE

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

    return {"success": True, "email": new_emp.email, "is_room": is_room}
