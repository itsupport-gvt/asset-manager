"""
Asset Manager — FastAPI Backend
Serves the React frontend, REST API, WebSocket scanner bridge, and QR code helper.
"""
import collections
import hmac
import io
import logging
import os
import sys
import socket
from pathlib import Path

# ── Frozen (PyInstaller) vs dev path resolution ──────────────────────────────
_BASE = Path(sys._MEIPASS) if getattr(sys, "frozen", False) else Path(__file__).parent

from fastapi import FastAPI, WebSocket, BackgroundTasks, Depends, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, Response, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from starlette.middleware.base import BaseHTTPMiddleware

from routes.assets        import router as assets_router
from routes.employees     import router as employees_router
from routes.actions       import router as actions_router
from routes.stats         import router as stats_router
from routes.reports       import router as reports_router
from routes.print_overlay import router as overlay_router
from routes.activity      import router as activity_router
from routes.users         import router as users_router
from ws.scanner       import scanner_ws, app_ws, scanner_status

from database import engine, Base, get_db, SessionLocal, run_migrations
from models_db import DBAsset, DBEmployee
from services.sync_service import sync_from_excel, sync_to_excel, sync_logs_from_excel, get_current_sync_status
from graph_client import GraphClient
from config import NGROK_URL, MOBILE_APP_TOKEN

# ── Dynamic ngrok state ───────────────────────────────────────────────────────
_ngrok_tunnel = None   # pyngrok tunnel object when active

import traceback

# ── Logging setup ─────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

_log_buffer: collections.deque = collections.deque(maxlen=500)


class _BufferHandler(logging.Handler):
    def emit(self, record: logging.LogRecord) -> None:
        try:
            _log_buffer.append(self.format(record))
        except Exception:
            pass


_buf_handler = _BufferHandler()
_buf_handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
logging.getLogger().addHandler(_buf_handler)

APP_VERSION = "2.2.4"
_APP_SECRET_TOKEN: str = os.environ.get("APP_SECRET_TOKEN", "").strip()


class TokenAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        if _APP_SECRET_TOKEN and request.url.path.startswith("/api/"):
            provided = request.headers.get("X-App-Token", "")
            # Accept either the Electron per-launch token or the static mobile token
            electron_ok = hmac.compare_digest(provided, _APP_SECRET_TOKEN)
            mobile_ok   = bool(MOBILE_APP_TOKEN) and hmac.compare_digest(provided, MOBILE_APP_TOKEN)
            if not electron_ok and not mobile_ok:
                return JSONResponse({"detail": "Unauthorized"}, status_code=401)
        return await call_next(request)


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


def get_active_ngrok_url() -> str:
    """Returns active dynamic ngrok URL, falling back to static NGROK_URL env var."""
    if _ngrok_tunnel:
        try:
            return _ngrok_tunnel.public_url.rstrip("/")
        except Exception:
            pass
    return NGROK_URL


def get_scanner_url() -> str:
    # Prefer ngrok HTTPS URL if configured — required for mobile camera access
    ngrok = get_active_ngrok_url()
    if ngrok:
        return f"{ngrok}/scanner"
    return f"{get_scheme()}://{get_lan_ip()}:8000/scanner"


# ── App setup ─────────────────────────────────────────────────────────────────

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Asset Manager API", version=APP_VERSION)

app.add_middleware(TokenAuthMiddleware)

app.add_middleware(
    CORSMiddleware,
    # Allow localhost (dev) + any LAN IP (mobile app, browser on other machines)
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1|\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*", "X-App-Token", "Authorization", "X-MS-Graph-Token"],
)

# Serve local scanner JS deps so mobile can load them without internet
SCANNER_LIB_DIR = _BASE / "scanner_static"
if SCANNER_LIB_DIR.exists():
    app.mount("/scanner-lib", StaticFiles(directory=SCANNER_LIB_DIR), name="scanner-lib")

# ── Startup ───────────────────────────────────────────────────────────────────

@app.on_event("startup")
async def startup_event():
    """Apply migrations and create tables on startup."""
    Base.metadata.create_all(bind=engine)
    run_migrations()
    db = SessionLocal()
    try:
        emp_count   = db.query(DBEmployee).count()
        asset_count = db.query(DBAsset).count()
        print(f"[startup] DB ready: {emp_count} employees, {asset_count} assets. First pull is user-triggered.")
    finally:
        db.close()

# ── REST routes ───────────────────────────────────────────────────────────────

app.include_router(assets_router)
app.include_router(employees_router)
app.include_router(actions_router)
app.include_router(stats_router)
app.include_router(reports_router)
app.include_router(overlay_router)
app.include_router(activity_router)
app.include_router(users_router)

# ── Sync Routes ───────────────────────────────────────────────────────────────

def _graph_from_header(x_ms_graph_token: str | None) -> GraphClient:
    if not x_ms_graph_token:
        raise RuntimeError("No Graph token provided. Sign in first and try again.")
    return GraphClient(token=x_ms_graph_token)


@app.post("/api/sync/push")
def push_sync(
    db: Session = Depends(get_db),
    x_ms_graph_token: str | None = Header(None, alias="X-MS-Graph-Token"),
):
    """Pushes local pending changes up to Excel using the signed-in user's Graph token."""
    try:
        graph = _graph_from_header(x_ms_graph_token)
        result = sync_to_excel(db, graph)
        ap, af = result["assets_pushed"], result["assets_failed"]
        lp, lf = result["logs_pushed"],   result["logs_failed"]
        parts = []
        if ap or af:
            parts.append(f"{ap} asset{'s' if ap != 1 else ''}" + (f" ({af} failed)" if af else ""))
        if lp or lf:
            parts.append(f"{lp} log entr{'ies' if lp != 1 else 'y'}" + (f" ({lf} failed)" if lf else ""))
        if not parts:
            msg = "Nothing pending — already up to date."
        else:
            msg = "Pushed to Excel: " + ", ".join(parts)
            if af or lf:
                msg += " — some items failed, check logs"
        return {"success": True, "message": msg, **result}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/sync/pull")
def pull_sync(
    db: Session = Depends(get_db),
    x_ms_graph_token: str | None = Header(None, alias="X-MS-Graph-Token"),
):
    """Pulls current Excel state (assets + employees + activity logs) down to local DB."""
    try:
        graph = _graph_from_header(x_ms_graph_token)
        sync_from_excel(db, graph)
        log_result = sync_logs_from_excel(db, graph)
        n = log_result["imported"]
        msg = "Pulled from Excel"
        if n:
            msg += f" — {n} new log entr{'y' if n == 1 else 'ies'} imported"
        return {"success": True, "message": msg, **log_result}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/sync/pull-logs")
def pull_logs_sync(
    db: Session = Depends(get_db),
    x_ms_graph_token: str | None = Header(None, alias="X-MS-Graph-Token"),
):
    """Pulls historical activity logs from Excel Assignment_Log table into local DB (dedup-safe)."""
    try:
        graph = _graph_from_header(x_ms_graph_token)
        result = sync_logs_from_excel(db, graph)
        return {"success": True, "message": f"Imported {result['imported']} logs, skipped {result['skipped']} duplicates.", **result}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/sync/status")
def sync_status(db: Session = Depends(get_db)):
    """Returns number of pending local changes and last sync info."""
    pending = db.query(DBAsset).filter(DBAsset.needs_sync == True).count()
    status  = get_current_sync_status()
    return {"pending_changes": pending, "last_sync": status.get("last_sync"), "status": status.get("status")}

@app.post("/api/admin/mark-all-for-sync")
def mark_all_for_sync(db: Session = Depends(get_db)):
    """Mark every asset as needs_sync=True so the next push repopulates all Excel rows."""
    count = db.query(DBAsset).update({"needs_sync": True})
    db.commit()
    return {"marked": count}

@app.get("/api/admin/logs")
def get_admin_logs(n: int = 200):
    """Return the last N lines from the in-memory log buffer (max 500)."""
    lines = list(_log_buffer)[-(min(n, 500)):]
    return {"lines": lines, "total": len(_log_buffer)}

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


# ── Mobile / admin connection helpers ────────────────────────────────────────

@app.get("/api/admin/server-info")
async def admin_server_info():
    """Returns server connection details for mobile app onboarding (admin UI)."""
    port   = int(os.environ.get("PORT", 8000))
    scheme = get_scheme()
    lan_ip = get_lan_ip()
    ngrok  = get_active_ngrok_url()
    ws     = scanner_status()
    return {
        "local_url":       f"{scheme}://{lan_ip}:{port}",
        "lan_ip":          lan_ip,
        "port":            port,
        "scheme":          scheme,
        "ngrok_url":       ngrok,
        "ngrok_active":    bool(_ngrok_tunnel),
        "scanners_connected": ws.get("scanners_connected", 0),
        "apps_connected":     ws.get("apps_connected", 0),
    }


@app.post("/api/admin/ngrok/start")
async def start_ngrok_tunnel(authtoken: str | None = None):
    """Start a pyngrok tunnel on port 8000. Optionally provide an authtoken."""
    global _ngrok_tunnel
    try:
        from pyngrok import ngrok as _pyngrok
    except ImportError:
        raise HTTPException(status_code=500, detail="pyngrok is not installed. Add 'pyngrok' to requirements.txt.")

    try:
        if _ngrok_tunnel:
            return {"url": _ngrok_tunnel.public_url, "already_running": True}
        if authtoken:
            _pyngrok.set_auth_token(authtoken)
        port = int(os.environ.get("PORT", 8000))
        tunnel = _pyngrok.connect(port)
        _ngrok_tunnel = tunnel
        logger.info(f"[ngrok] Tunnel started: {tunnel.public_url}")
        return {"url": tunnel.public_url, "started": True}
    except Exception as e:
        logger.error(f"[ngrok] Failed to start: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/admin/ngrok/stop")
async def stop_ngrok_tunnel():
    """Stop the active pyngrok tunnel."""
    global _ngrok_tunnel
    try:
        from pyngrok import ngrok as _pyngrok
    except ImportError:
        raise HTTPException(status_code=500, detail="pyngrok is not installed.")

    try:
        if _ngrok_tunnel:
            _pyngrok.disconnect(_ngrok_tunnel.public_url)
            _ngrok_tunnel = None
            logger.info("[ngrok] Tunnel stopped.")
        return {"stopped": True}
    except Exception as e:
        logger.error(f"[ngrok] Failed to stop: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/admin/qr-code")
async def admin_qr_code(url: str):
    """Return a QR code PNG for any given URL (used by the admin mobile-connection panel)."""
    import qrcode  # lazy import — already in requirements.txt

    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=8,
        border=3,
    )
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#202124", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return Response(content=buf.getvalue(), media_type="image/png", headers={"Cache-Control": "no-store"})


# ── Health / status ───────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "version": APP_VERSION,
        "scanner_url": get_scanner_url(),
        "ssl": get_scheme() == "https",
        "ws": scanner_status(),
    }


# ── Serve React frontend (production build) ───────────────────────────────────
# Only active after running `npm run build` in the frontend folder.

# Electron copies the frontend from the ASAR to userData/static/ on every
# launch so that auto-updates always serve the latest frontend regardless of
# whether the PyInstaller bundle was overwritten.
_ext_static = os.getenv("FRONTEND_STATIC_DIR", "")
STATIC_DIR = Path(_ext_static) if (_ext_static and Path(_ext_static).exists()) else _BASE / "static"

if STATIC_DIR.exists():
    assets_subdir = STATIC_DIR / "assets"
    if assets_subdir.exists():
        app.mount("/assets", StaticFiles(directory=assets_subdir), name="assets")

    @app.get("/{full_path:path}", response_class=FileResponse)
    async def serve_spa(full_path: str):
        requested = STATIC_DIR / full_path
        if requested.is_file():
            return FileResponse(requested)
        return FileResponse(STATIC_DIR / "index.html")


# ── Entry point for PyInstaller / direct run ──────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8000")), reload=False)
