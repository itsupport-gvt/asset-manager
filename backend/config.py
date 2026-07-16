import os
from pathlib import Path
from dotenv import load_dotenv


def _load_env():
    """Load .env from ASSET_DATA_DIR (Electron) first, then fall back to local .env."""
    d = os.getenv("ASSET_DATA_DIR")
    if d:
        env_path = Path(d) / ".env"
        if env_path.exists():
            load_dotenv(env_path, override=True)
            return
    load_dotenv()


_load_env()

FILE_URL = os.getenv("SHAREPOINT_FILE_URL")

# Table names — confirmed from Office Scripts
MASTER_TABLE = "MasterTable"
LOG_TABLE    = "Assignment_Log"
EMP_TABLE    = "tbl_Employees"

# Optional public URL override (e.g. ngrok HTTPS tunnel for scanner QR code)
NGROK_URL = os.getenv("NGROK_URL", "").rstrip("/")

# Microsoft Entra ID auth (optional — auth is disabled when AUTH_CLIENT_ID is empty)
AUTH_CLIENT_ID = os.getenv("AUTH_CLIENT_ID", "")

# Static token for external clients (Android app, API tools).
# Set this in your .env file. Unlike APP_SECRET_TOKEN (which Electron generates
# randomly each launch), this one is fixed so external apps can use it.
MOBILE_APP_TOKEN = os.getenv("MOBILE_APP_TOKEN", "").strip()

# Type code map — exact copy from Register_New_Asset.osts
TYPE_CODE_MAP: dict[str, str] = {
    "Laptop": "LT", "Desktop": "DT", "Monitor": "MO",
    "Keyboard": "KB", "Mouse": "MS", "Docking Station": "DS",
    "Server": "SV", "Printer": "PR", "Smart TV": "TV",
    "Mobile Phone": "MP", "Motherboard": "MB", "SSD": "SS",
    "HDD": "HD", "RAM": "RM", "Memory": "RM", "CPU": "CP",
    "GPU": "GP", "USB Hub": "UH", "Adapter": "AD",
    "Power Adapter": "PA", "Webcam": "WC", "Headset": "HS",
    "Land Phone": "LP", "IP Phone": "LP",
}
