"""
Asset Manager — FastAPI Backend
Serves the React frontend, REST API, WebSocket scanner bridge, and QR code helper.
"""
import io
import os
import sys
import socket
from pathlib import Path

# ── Frozen (PyInstaller) vs dev path resolution ──────────────────────────────
_BASE = Path(sys._MEIPASS) if getattr(sys, "frozen", False) else Path(__file__).parent

from fastapi import FastAPI, WebSocket, BackgroundTasks, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, Response, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from routes.assets        import router as assets_router
from routes.employees     import router as employees_router
from routes.actions       import router as actions_router
from routes.stats         import router as stats_router
from routes.reports       import router as reports_router
from routes.print_overlay import router as overlay_router
from ws.scanner       import scanner_ws, app_ws, scanner_status

from database import engine, Base, get_db, SessionLocal, run_migrations
from models_db import DBAsset, DBEmployee
from services.sync_service import sync_from_excel, sync_to_excel, get_current_sync_status
from config import NGROK_URL

import traceback


def get_lan_ip() -> str:
    """Returns the machine's LAN IP by opening a dummy UDP socket to 8.8.8.8."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def get_scheme() -> str:
    """Returns 'https' if SSL cert files are present, otherwise 'http'."""
    if (_BASE / "cert.pem").exists() and (_BASE / "key.pem").exists():
        return "https"
    return "http"


def get_scanner_url() -> str:
    # Prefer ngrok HTTPS URL if configured — required for mobile camera access
    if NGROK_URL:
        return f"{NGROK_URL}/scanner"
    return f"{get_scheme()}://{get_lan_ip()}:8000/scanner"


# ── App setup ─────────────────────────────────────────────────────────────────

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Asset Manager API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # same-network internal tool
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve local scanner JS deps so mobile can load them without internet
SCANNER_LIB_DIR = _BASE / "scanner_static"
if SCANNER_LIB_DIR.exists():
    app.mount("/scanner-lib", StaticFiles(directory=SCANNER_LIB_DIR), name="scanner-lib")

# ── Startup & Background Sync ─────────────────────────────────────────────────

@app.on_event("startup")
def startup_event():
    """Apply schema migrations, create tables, then sync from Excel if DB is empty."""
    # 1. Ensure tables exist
    Base.metadata.create_all(bind=engine)
    # 2. Apply any schema migrations (ALTER TABLE for new columns)
    run_migrations()
    # 3. Sync from Excel if EITHER employees OR assets are missing
    db = SessionLocal()
    try:
        emp_count   = db.query(DBEmployee).count()
        asset_count = db.query(DBAsset).count()
        if emp_count == 0 or asset_count == 0:
            print(f"DB incomplete (employees={emp_count}, assets={asset_count}). Syncing from Excel...")
            sync_from_excel(db)
        else:
            print(f"Database ready. {emp_count} employees, {asset_count} assets loaded.")
    finally:
        db.close()

# ── REST routes ───────────────────────────────────────────────────────────────

app.include_router(assets_router)
app.include_router(employees_router)
app.include_router(actions_router)
app.include_router(stats_router)
app.include_router(reports_router)
app.include_router(overlay_router)

# ── Sync Routes ───────────────────────────────────────────────────────────────

@app.post("/api/sync/push")
def push_sync(_: BackgroundTasks, db: Session = Depends(get_db)):
    """Pushes local pending changes up to Excel."""
    try:
        sync_to_excel(db)
        return {"success": True, "message": "Pushed changes to Excel."}
    except Exception as e:
        traceback.print_exc()
        return {"success": False, "detail": str(e)}

@app.post("/api/sync/pull")
def pull_sync(_: BackgroundTasks, db: Session = Depends(get_db)):
    """Pulls current Excel state down to local DB (overwrites)."""
    try:
        sync_from_excel(db)
        return {"success": True, "message": "Pulled changes from Excel."}
    except Exception as e:
        traceback.print_exc()
        return {"success": False, "detail": str(e)}

@app.get("/api/sync/status")
def sync_status(db: Session = Depends(get_db)):
    """Returns number of pending local changes and last sync info."""
    pending = db.query(DBAsset).filter(DBAsset.needs_sync == True).count()
    status  = get_current_sync_status()
    return {"pending_changes": pending, "last_sync": status.get("last_sync"), "status": status.get("status")}

@app.get("/api/debug/excel-headers")
def debug_excel_headers():
    """Returns the first row of MasterTable and employee table to identify column names."""
    from config import MASTER_TABLE, EMP_TABLE
    from graph_client import graph
    try:
        asset_rows  = graph.get_table_rows(MASTER_TABLE)
        emp_rows    = graph.get_table_rows(EMP_TABLE)
        return {
            "master_table_columns": list(asset_rows[0].keys()) if asset_rows else [],
            "master_table_sample": dict(list(asset_rows[0].items())[:8]) if asset_rows else {},
            "emp_table_columns":   list(emp_rows[0].keys())   if emp_rows  else [],
        }
    except Exception as e:
        return {"error": str(e)}


# ── WebSocket routes ──────────────────────────────────────────────────────────

@app.websocket("/ws/scanner")
async def ws_scanner(ws: WebSocket):
    await scanner_ws(ws)


@app.websocket("/ws/app")
async def ws_app_endpoint(ws: WebSocket):
    await app_ws(ws)


# ── Scanner page (phone browser) ──────────────────────────────────────────────

SCANNER_HTML = _BASE / "scanner.html"


@app.get("/scanner", response_class=HTMLResponse)
async def serve_scanner():
    if SCANNER_HTML.exists():
        return HTMLResponse(SCANNER_HTML.read_text(encoding="utf-8"))
    return HTMLResponse("<h1>scanner.html not found</h1>", status_code=404)


# ── QR code & LAN IP helpers ──────────────────────────────────────────────────

@app.get("/api/scanner-url")
async def scanner_url():
    """Returns the scanner URL using ngrok if configured, otherwise LAN IP."""
    url = get_scanner_url()
    return JSONResponse({"url": url, "ip": get_lan_ip(), "scheme": get_scheme(), "via_ngrok": bool(NGROK_URL)})


@app.get("/api/scanner-qr")
async def scanner_qr():
    """
    Returns a QR code PNG pointing to the scanner page.
    Uses https:// automatically if cert.pem/key.pem are present.
    """
    import qrcode  # lazy import

    url = get_scanner_url()

    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=8,
        border=3,
    )
    qr.add_data(url)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)

    return Response(
        content=buf.getvalue(),
        media_type="image/png",
        headers={
            "Cache-Control": "no-store",       # IP can change; never cache
            "X-Scanner-URL": url,
        },
    )


# ── Health / status ───────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "scanner_url": get_scanner_url(),
        "ssl": get_scheme() == "https",
        "ws": scanner_status(),
    }


# ── Serve React frontend (production build) ───────────────────────────────────
# Only active after running `npm run build` in the frontend folder.

STATIC_DIR = _BASE / "static"

if STATIC_DIR.exists():
    assets_subdir = STATIC_DIR / "assets"
    # Only mount /assets if the subdirectory exists (created by npm run build)
    if assets_subdir.exists():
        app.mount("/assets", StaticFiles(directory=assets_subdir), name="assets")

    @app.get("/{full_path:path}", response_class=FileResponse)
    async def serve_spa(full_path: str):
        """
        SPA catch-all: serve the exact file if it exists,
        otherwise return index.html for client-side routing.
        """
        requested = STATIC_DIR / full_path
        if requested.is_file():
            return FileResponse(requested)
        return FileResponse(STATIC_DIR / "index.html")


# ── Entry point for PyInstaller / direct run ──────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=int(os.getenv("PORT", "8000")), reload=False)
