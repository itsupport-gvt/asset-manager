from pydantic import BaseModel
from typing import Optional


class AssetResponse(BaseModel):
    asset_id: str
    asset_type: str
    status: str
    condition: str
    brand: str
    model: str
    serial_number: str
    username: str
    employee_display: str
    assignment_id: str
    date_assigned: str
    location: str
    notes: str
    storage: str
    memory_ram: str
    processor: str
    graphics: str
    screen_size: str
    os: str
    purchase_date: str
    purchase_price: str
    vendor: str
    invoice_ref: str
    warranty_end: str
    pin_password: str
    charger_model: str
    charger_serial: str
    charger_notes: str
    asset_display: str
    row_index: int


class EmployeeResponse(BaseModel):
    employee_id: str
    full_name: str
    email: str
    employee_display: str
    designation: str
    is_room: bool = False


class AssignRequest(BaseModel):
    asset_id: str
    employee_email: str
    condition: Optional[str] = ""
    notes: Optional[str] = ""


class ReturnRequest(BaseModel):
    asset_id: str
    condition: Optional[str] = ""
    notes: Optional[str] = ""


class CreateAssetRequest(BaseModel):
    asset_type: str
    status: str
    condition: str
    brand: str
    model: str
    serial_number: str
    storage: Optional[str] = ""
    memory_ram: Optional[str] = ""
    processor: Optional[str] = ""
    graphics: Optional[str] = ""
    screen_size: Optional[str] = ""
    os: Optional[str] = ""
    purchase_date: Optional[str] = ""
    purchase_price: Optional[str] = ""
    vendor: Optional[str] = ""
    invoice_ref: Optional[str] = ""
    additional_invoice: Optional[str] = ""
    warranty_end: Optional[str] = ""
    location: Optional[str] = ""
    notes: Optional[str] = ""
    pin_password: Optional[str] = ""
    charger_model: Optional[str] = ""
    charger_serial: Optional[str] = ""
    charger_notes: Optional[str] = ""


class CreateEmployeeRequest(BaseModel):
    employee_id: str
    full_name: str
    email: str
    designation: str


class SwapRequest(BaseModel):
    mode: str                               # "person" | "stock"
    asset_id: str                           # current asset being swapped
    # Person-swap fields
    new_employee_email: Optional[str] = None
    # Stock-swap fields
    replacement_asset_id: Optional[str] = None
    return_status: Optional[str] = "In Stock"   # status to set on returned asset
    # Shared
    condition: Optional[str] = ""
    notes: Optional[str] = ""
