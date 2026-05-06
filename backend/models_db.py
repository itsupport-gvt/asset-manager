from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime
from sqlalchemy.sql import func
from database import Base

class DBEmployee(Base):
    __tablename__ = "employees"

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(String, unique=False, index=True, nullable=True)
    full_name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    designation = Column(String, nullable=True)
    is_room = Column(Boolean, default=False, nullable=False)  # True = office room/location, False = person
    employee_display = Column(String, nullable=True)  # e.g. "Abraham Joseph (1080)"

class DBAsset(Base):
    __tablename__ = "assets"

    id = Column(Integer, primary_key=True, index=True)
    asset_id = Column(String, unique=True, index=True, nullable=False)      # e.g. LT-2312-0001
    asset_id_qr = Column(String, unique=True, index=True, nullable=True)    # e.g. LT23120001 (no hyphens — matches physical QR)
    asset_type = Column(String, index=True, nullable=False)
    status = Column(String, index=True, nullable=False)  # Unassigned, Active, Missing, etc.
    condition = Column(String, nullable=True)
    brand = Column(String, nullable=True)
    model = Column(String, nullable=True)
    serial_number = Column(String, nullable=True)

    # Assignment
    assigned_to_email = Column(String, ForeignKey("employees.email"), nullable=True)
    assignment_id = Column(String, nullable=True)
    date_assigned = Column(String, nullable=True)

    # Specs & Info
    location = Column(String, nullable=True)
    notes = Column(String, nullable=True)
    storage = Column(String, nullable=True)
    memory_ram = Column(String, nullable=True)
    processor = Column(String, nullable=True)
    graphics = Column(String, nullable=True)
    screen_size = Column(String, nullable=True)
    os = Column(String, nullable=True)
    purchase_date = Column(String, nullable=True)
    purchase_price = Column(String, nullable=True)
    vendor = Column(String, nullable=True)
    invoice_ref = Column(String, nullable=True)
    warranty_end = Column(String, nullable=True)
    pin_password = Column(String, nullable=True)

    # Laptop charger details (only relevant for Laptop asset type)
    charger_model = Column(String, nullable=True)
    charger_serial = Column(String, nullable=True)
    charger_notes = Column(String, nullable=True)

    # Used for tracking delta changes against the Excel sheet
    needs_sync = Column(Boolean, default=True)

class DBAssignmentLog(Base):
    __tablename__ = "assignment_logs"

    id             = Column(Integer, primary_key=True, index=True)
    asset_id       = Column(String, index=True, nullable=False)
    action         = Column(String, nullable=False)  # Assign, Return, Create, Update, Bulk Return
    employee_email = Column(String, index=True, nullable=True)
    timestamp      = Column(DateTime(timezone=True), server_default=func.now())
    notes          = Column(String, nullable=True)
    needs_sync     = Column(Boolean, default=True)

    # ── Extended audit fields (populated from v1.2.0+) ─────────────────────────
    old_status     = Column(String, nullable=True)   # asset status before action
    new_status     = Column(String, nullable=True)   # asset status after action
    changed_fields = Column(String, nullable=True)   # JSON: [{"field","old","new"}, ...]
    asset_type     = Column(String, nullable=True)   # e.g. "Laptop"
    asset_label    = Column(String, nullable=True)   # e.g. "Dell XPS 15 LT-2312-0001"
    source_log_id  = Column(String, nullable=True, index=True)  # Excel LogID � used for dedup on pull
