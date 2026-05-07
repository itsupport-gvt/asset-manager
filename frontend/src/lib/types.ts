export interface Asset {
    asset_id: string;
    asset_type: string;
    status: string;
    condition: string;
    brand: string;
    model: string;
    serial_number: string;
    username: string;
    employee_display: string;
    assignment_id: string;
    date_assigned: string;
    location: string;
    notes: string;
    storage: string;
    storage_2: string;
    memory_ram: string;
    processor: string;
    graphics: string;
    screen_size: string;
    os: string;
    purchase_date: string;
    purchase_price: string;
    vendor: string;
    invoice_ref: string;
    warranty_end: string;
    pin_password: string;
    charger_model: string;
    charger_serial: string;
    charger_notes: string;
    asset_display: string;
    row_index: number;
}

export interface Employee {
    employee_id: string;
    full_name: string;
    email: string;
    employee_display: string;
    designation: string;
    is_room?: boolean;
}

export interface CreateEmployeeRequest {
    employee_id: string;
    full_name: string;
    email: string;
    designation: string;
}

export interface AssignRequest {
    asset_id: string;
    employee_email: string;
    condition?: string;
    notes?: string;
}

export interface ReturnRequest {
    asset_id: string;
    condition?: string;
    notes?: string;
}

export interface CreateAssetRequest {
    asset_type: string;
    status: string;
    condition: string;
    brand: string;
    model: string;
    serial_number: string;
    storage?: string;
    storage_2?: string;
    memory_ram?: string;
    processor?: string;
    graphics?: string;
    screen_size?: string;
    os?: string;
    purchase_date?: string;
    purchase_price?: string;
    vendor?: string;
    invoice_ref?: string;
    additional_invoice?: string;
    warranty_end?: string;
    location?: string;
    notes?: string;
    pin_password?: string;
    charger_model?: string;
    charger_serial?: string;
    charger_notes?: string;
}

export interface ReportRow {
    asset_id: string;
    asset_type: string;
    brand: string;
    model: string;
    serial_number: string;
    notes: string;
    is_charger: boolean;
}

export interface ReportPreview {
    employee: {
        email: string;
        full_name: string;
        employee_id: string;
        designation: string;
        display: string;
    };
    rows: ReportRow[];
    asset_count: number;
}

// ── Overlay / Print ──────────────────────────────────────────────────────────

export interface OverlayConfig {
    page_size: string;
    table_data_start_y_mm: number;
    rows_per_page1: number;
    table_data_start_y_mm_page2: number;
    row_height_mm: number;
    col_x_mm: number[];
    col_w_mm: number[];
    font_size: number;
}

export interface CalibrationPage {
    data_start_y: number;
    avg_row_h: number;
    num_data_rows: number;
    col_x0: number[];
    col_w: number[];
}

export type CalibrationData = Record<number, CalibrationPage>;

export interface OverlayRow {
    page: number;
    target_row: number;  // 1-indexed
    values: [string, string, string, string, string, string, string]; // 7 cols
    /** asset_id for print-log tracking (not sent to backend) */
    asset_id?: string;
}

export interface PrintLogEntry {
    emp_id: string;
    doc_type: string;
    printed_ids: string[];
    history: { timestamp: string; added_ids: string[] }[];
}

// ── Activity Log ─────────────────────────────────────────────────────────────

export interface ActivityLogItem {
    id: number;
    asset_id: string;
    asset_label: string;
    asset_type: string;
    action: string;
    employee_email: string;
    employee_name: string;
    timestamp: string;
    notes: string;
    old_status: string;
    new_status: string;
    changed_fields: string;   // raw JSON string: [{field, old, new}, ...]
}

export interface ActivityLogPage {
    total: number;
    page: number;
    page_size: number;
    pages: number;
    items: ActivityLogItem[];
}

// Scanner Context Payload
export interface ScanPayload {
    mode: 'context_action' | 'asset_qr' | 'field_scan';
    value: string;
    tokens?: string[];
    context?: {
        action: 'assign' | 'swap' | 'return';
        targetUser?: string;
        oldAsset?: string;
    };
}
