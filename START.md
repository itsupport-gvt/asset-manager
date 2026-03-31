# Asset Manager — Quick Start

## Prerequisites
- Python 3.11+ (already installed — used by report generator)
- Node.js 20+ → download from https://nodejs.org (LTS version)

---

## First-time setup

### 1. Backend
```bat
cd asset-app\backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Frontend
```bat
cd asset-app\frontend
npm install
```

---

## Running (development — hot reload)

**Terminal 1 — Backend:**
```bat
cd asset-app\backend
.venv\Scripts\activate
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**Terminal 2 — Frontend:**
```bat
cd asset-app\frontend
npm run dev
```

Open: http://localhost:5173

---

## Phone scanner

1. Find your laptop's LAN IP:
   Open CMD → `ipconfig` → look for **IPv4 Address** under your WiFi adapter
   (e.g. `192.168.1.45`)

2. On your phone (same WiFi), open Chrome/Safari:
   `http://192.168.1.45:8000/scanner`

3. Allow camera access when prompted.

The green dot in the web app header shows when the scanner is connected.

---

## Production build (single server, no Vite needed)

```bat
cd asset-app\frontend
npm run build
```
This outputs to `asset-app\backend\static\`.
Then run only the backend:
```bat
cd asset-app\backend
.venv\Scripts\activate
uvicorn main:app --host 0.0.0.0 --port 8000
```
Open: http://localhost:8000

---

## Files
```
asset-app/
├── backend/          Python FastAPI server + scanner WebSocket
│   ├── scanner.html  Phone scanner page (QR + OCR)
│   └── static/       React build output (after npm run build)
└── frontend/         React + Vite source
```

---

## Electron desktop app

### Local build (produces installer on your machine)
```powershell
cd asset-app
powershell -ExecutionPolicy Bypass -File .\build-electron.ps1
# Output: asset-app\electron\dist\Asset Manager Setup 1.0.0.exe
```

---

## Auto-update via GitHub Releases

Auto-update uses **electron-updater** + **GitHub Releases**. Installed clients check
for `latest.yml` on each launch and download updates in the background.

### One-time setup

1. **Create a GitHub repository** for this project and push all code.

2. **Edit `asset-app/electron/package.json`** — replace the placeholders:
   ```json
   "publish": {
     "provider": "github",
     "owner": "your-github-username",
     "repo":  "your-repo-name"
   }
   ```

3. **Create a GitHub Personal Access Token (PAT)**
   - GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens
   - Permissions: **Contents** → Read and write (to create releases)
   - Copy the token.

4. **Add the secret to your repo**
   - GitHub repo → Settings → Secrets and variables → Actions → New repository secret
   - Name: `GH_TOKEN`
   - Value: paste the PAT

5. **Make the repo public** (recommended for auto-update downloads)
   OR use a `generic` provider if the repo must stay private.

### Releasing a new version

```bash
# 1. Bump version in electron/package.json  (e.g. "1.0.0" → "1.0.1")
# 2. Commit and push
git add asset-app/electron/package.json
git commit -m "chore: bump to v1.0.1"
git push

# 3. Tag and push — this triggers the GitHub Actions build
git tag v1.0.1
git push origin v1.0.1
```

GitHub Actions will:
- Build the React frontend
- Bundle the FastAPI backend with PyInstaller
- Build the NSIS installer with electron-builder
- Create a GitHub Release and upload:
  - `Asset Manager Setup 1.0.1.exe`
  - `Asset Manager Setup 1.0.1.exe.blockmap`
  - `latest.yml`

Installed clients will detect `latest.yml` on next launch and auto-update.

### Manually checking for updates (in-app)
Menu bar → **Help → Check for Updates**
