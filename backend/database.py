import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, declarative_base
from pathlib import Path


def _db_dir() -> Path:
    """Return the DB directory, driven by ASSET_DATA_DIR env var (Electron) or default."""
    d = os.getenv("ASSET_DATA_DIR")
    p = (Path(d) / "data") if d else Path(__file__).parent / "data"
    p.mkdir(parents=True, exist_ok=True)
    return p


# Create a SQLite database file — path is portable for Electron / Docker / dev
DB_DIR = _db_dir()
DB_PATH = DB_DIR / "assets.db"
SQLALCHEMY_DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

# Dependency for FastAPI
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def run_migrations():
    """
    Safely adds missing columns to existing tables.
    Uses ALTER TABLE ... ADD COLUMN which SQLite supports.
    Each migration is idempotent — safe to run on every startup.
    """
    migrations = [
        # Format: (table, column, sql_type_and_default)
        ("employees", "is_room",          "BOOLEAN NOT NULL DEFAULT 0"),
        ("employees", "employee_display", "TEXT"),
        ("assets",    "asset_id_qr",      "TEXT"),
        ("assets",    "invoice_ref",      "TEXT"),
        ("assets",           "charger_model",    "TEXT"),
        ("assets",           "charger_serial",   "TEXT"),
        ("assets",           "charger_notes",    "TEXT"),
        # v1.3.6 — new tech spec fields
        ("assets",           "processor",        "TEXT"),
        ("assets",           "graphics",         "TEXT"),
        ("assets",           "screen_size",      "TEXT"),
        ("assets",           "os",               "TEXT"),
        # v1.2.0 — extended audit fields on assignment_logs
        ("assignment_logs",  "old_status",       "TEXT"),
        ("assignment_logs",  "new_status",        "TEXT"),
        ("assignment_logs",  "changed_fields",   "TEXT"),
        ("assignment_logs",  "asset_type",       "TEXT"),
        ("assignment_logs",  "asset_label",      "TEXT"),
        ("assignment_logs",  "source_log_id",   "TEXT"),
    ]
    with engine.connect() as conn:
        for table, col, definition in migrations:
            try:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {definition}"))
                conn.commit()
                print(f"[Migration] Added column '{col}' to '{table}'")
            except Exception:
                pass  # already exists

        # Back-fill asset_id_qr from asset_id for all existing rows
        try:
            rows = conn.execute(text("SELECT id, asset_id FROM assets WHERE asset_id_qr IS NULL")).fetchall()
            for row_id, aid in rows:
                qr = aid.replace("-", "")
                conn.execute(text("UPDATE assets SET asset_id_qr = :qr WHERE id = :id"), {"qr": qr, "id": row_id})
            if rows:
                conn.commit()
                print(f"[Migration] Back-filled asset_id_qr for {len(rows)} assets")
        except Exception as e:
            print(f"[Migration] Backfill skipped: {e}")

        # Back-fill employee_display for ALL employees (re-run to fix format)
        try:
            rows = conn.execute(
                text("SELECT id, full_name, employee_id FROM employees")
            ).fetchall()
            for row_id, full_name, emp_id in rows:
                display = f"{emp_id} - {full_name}" if emp_id else full_name
                conn.execute(
                    text("UPDATE employees SET employee_display = :d WHERE id = :id"),
                    {"d": display, "id": row_id}
                )
            if rows:
                conn.commit()
                print(f"[Migration] Re-formatted employee_display for {len(rows)} employees")
        except Exception as e:
            print(f"[Migration] employee_display backfill skipped: {e}")

