<#
.SYNOPSIS
  Master build script for the Asset Manager Electron desktop app.

.DESCRIPTION
  1. Build React frontend (npm run build) -> backend/static/
  2. Create backend/templates/ and copy .docx templates into it
  3. Install pyinstaller + pdfplumber if missing
  4. Run PyInstaller -> backend/dist/asset-backend/  (onedir)
  5. cd electron/ && npm install && npm run dist
  -> Output: electron/dist/Asset Manager Setup 1.0.0.exe

.NOTES
  Run from the asset-app/ directory:
    cd asset-app
    powershell -ExecutionPolicy Bypass -File .\build-electron.ps1
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ROOT   = $PSScriptRoot
$FRONT  = Join-Path $ROOT "frontend"
$BACK   = Join-Path $ROOT "backend"
$VENV   = Join-Path $BACK ".venv"
$PYTHON = Join-Path $VENV "Scripts\python.exe"
$PIP    = Join-Path $VENV "Scripts\pip.exe"

function Step($msg) { Write-Host "" ; Write-Host "--- $msg ---" -ForegroundColor Cyan }
function OK($msg)   { Write-Host "  OK: $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "  WARN: $msg" -ForegroundColor Yellow }

# Validate we're in the right place
if (-not (Test-Path (Join-Path $ROOT "frontend\package.json"))) {
    Write-Error "Run this script from the asset-app/ directory."
    exit 1
}

# Step 1: Build frontend
Step "Building React frontend"
Push-Location $FRONT
npm run build
if ($LASTEXITCODE -ne 0) { Write-Error "Frontend build failed."; exit 1 }
Pop-Location
OK "Frontend built -> backend/static/"

# Step 2: Copy templates
Step "Copying report templates"
$TEMPLATES = Join-Path $BACK "templates"
New-Item -ItemType Directory -Force -Path $TEMPLATES | Out-Null

# Templates live in asset-app/ root (same folder as this script)
foreach ($tpl in @("handover.docx", "return.docx")) {
    $src = Join-Path $ROOT $tpl
    $dst = Join-Path $TEMPLATES $tpl
    if (Test-Path $src) {
        Copy-Item $src $dst -Force
        OK "Copied $tpl"
    } else {
        Warn "$tpl not found at $src - skipping"
    }
}

# Step 3: Install pyinstaller + pdfplumber
Step "Installing/updating Python dependencies"
& $PIP install --quiet pyinstaller pdfplumber python-multipart
if ($LASTEXITCODE -ne 0) { Write-Error "pip install failed."; exit 1 }
OK "Dependencies ready"

# Step 4: Run PyInstaller
Step "Running PyInstaller (this may take 2-5 minutes)"
Push-Location $ROOT
& $PYTHON -m PyInstaller backend/backend.spec --distpath backend/dist --noconfirm
if ($LASTEXITCODE -ne 0) { Write-Error "PyInstaller failed."; Pop-Location; exit 1 }
Pop-Location
OK "PyInstaller complete -> backend/dist/asset-backend/"

# Step 5: Electron build
Step "Building Electron app"
$ELECTRON = Join-Path $ROOT "electron"
Push-Location $ELECTRON

npm install --no-fund --no-audit
if ($LASTEXITCODE -ne 0) { Write-Error "npm install failed."; Pop-Location; exit 1 }

# ------------------------------------------------------------------
# winCodeSign workaround:
# electron-builder downloads winCodeSign-2.6.0.7z which contains macOS
# symlinks. On Windows without Developer Mode the 7-zip extraction fails.
# Fix: pre-extract the archive into the cache dir ourselves, creating
# placeholder files in place of the macOS symlinks. electron-builder
# checks if the cache dir exists and skips the download when it does.
# ------------------------------------------------------------------
$WCSIGN_CACHE = "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign"
$WCSIGN_DIR   = "$WCSIGN_CACHE\winCodeSign-2.6.0"
$SEVEN_ZIP    = Join-Path $ELECTRON "node_modules\7zip-bin\win\x64\7za.exe"

if (-not (Test-Path $WCSIGN_DIR)) {
    Write-Host "  Pre-extracting winCodeSign (bypass symlink restriction)..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Force -Path $WCSIGN_DIR | Out-Null

    $ARCHIVE = Join-Path $env:TEMP "winCodeSign-2.6.0.7z"
    $ARCHIVE_URL = "https://github.com/electron-userland/electron-builder-binaries/releases/download/winCodeSign-2.6.0/winCodeSign-2.6.0.7z"

    try {
        Invoke-WebRequest -Uri $ARCHIVE_URL -OutFile $ARCHIVE -UseBasicParsing
        # Extract directly into WCSIGN_DIR; ignore non-zero exit (macOS symlinks fail, Windows files succeed)
        & $SEVEN_ZIP x -y "-o$WCSIGN_DIR" $ARCHIVE 2>&1 | Out-Null
    } catch {
        Warn "winCodeSign download failed: $_  (build may still work)"
    }

    # Create placeholder files for every macOS symlink that could not be created
    foreach ($rel in @(
        "darwin\10.12\lib\libcrypto.dylib",
        "darwin\10.12\lib\libssl.dylib"
    )) {
        $full = Join-Path $WCSIGN_DIR $rel
        if (-not (Test-Path $full)) {
            New-Item -ItemType File -Force -Path $full | Out-Null
        }
    }
    Remove-Item $ARCHIVE -ErrorAction SilentlyContinue
    OK "winCodeSign cache pre-built -> $WCSIGN_DIR"
} else {
    OK "winCodeSign cache already present -> skipping download"
}

# Disable code-signing (no certificate configured)
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
$env:WIN_CSC_KEY_PASSWORD         = ""

npm run dist
if ($LASTEXITCODE -ne 0) { Write-Error "electron-builder failed."; Pop-Location; exit 1 }
Pop-Location

OK "Electron build complete -> electron/dist/"

Write-Host ""
Write-Host "=============================================" -ForegroundColor Green
Write-Host "  BUILD COMPLETE" -ForegroundColor Green
Write-Host "  Installer: electron\dist\Asset Manager Setup 1.0.0.exe" -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green
