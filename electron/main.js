'use strict';

const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const path  = require('path');
const fs    = require('fs');
const net   = require('net');
const { spawn, execSync } = require('child_process');

// ── Paths ─────────────────────────────────────────────────────────────────────
const APP_DATA_DIR = path.join(app.getPath('appData'), 'AssetManager');
const CONFIG_FILE  = path.join(APP_DATA_DIR, 'config.json');
const ENV_FILE     = path.join(APP_DATA_DIR, '.env');
const BACKEND_DIR  = app.isPackaged
  ? path.join(process.resourcesPath, 'backend')
  : path.join(__dirname, '..', 'backend');
const BACKEND_EXE  = app.isPackaged
  ? path.join(BACKEND_DIR, 'asset-backend.exe')
  : null;  // dev mode: backend runs separately

// ── Ensure AppData dir ───────────────────────────────────────────────────────
if (!fs.existsSync(APP_DATA_DIR)) fs.mkdirSync(APP_DATA_DIR, { recursive: true });

// ── Single instance lock ──────────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}
app.on('second-instance', () => {
  if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); }
});

// ── State ─────────────────────────────────────────────────────────────────────
let mainWindow   = null;
let splashWindow = null;
let setupWindow  = null;
let backendProc  = null;
let backendPort  = 8000;

// ── Config helpers ────────────────────────────────────────────────────────────
function readConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch {}
  return null;
}

function writeConfig(cfg) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
}

function writeEnvFromConfig(cfg) {
  const lines = [
    `SHAREPOINT_TENANT_ID=${cfg.SHAREPOINT_TENANT_ID || ''}`,
    `SHAREPOINT_CLIENT_ID=${cfg.SHAREPOINT_CLIENT_ID || ''}`,
    `SHAREPOINT_CLIENT_SECRET=${cfg.SHAREPOINT_CLIENT_SECRET || ''}`,
    `SHAREPOINT_FILE_URL=${cfg.SHAREPOINT_FILE_URL || ''}`,
    `NGROK_URL=${cfg.NGROK_URL || ''}`,
  ];
  fs.writeFileSync(ENV_FILE, lines.join('\n') + '\n', 'utf8');
}

// ── Port helpers ──────────────────────────────────────────────────────────────
function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => { server.close(); resolve(true); });
    server.listen(port);
  });
}

async function findFreePort(start = 8000) {
  for (let p = start; p < start + 20; p++) {
    if (await isPortFree(p)) return p;
  }
  return start;
}

// ── Backend polling ───────────────────────────────────────────────────────────
function pollBackendReady(port, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const check = () => {
      if (Date.now() - started > timeout) { reject(new Error('Backend timeout')); return; }
      const req = require('http').request({ hostname: '127.0.0.1', port, path: '/health', timeout: 1500 },
        (res) => { if (res.statusCode === 200) resolve(); else setTimeout(check, 500); });
      req.on('error', () => setTimeout(check, 500));
      req.end();
    };
    check();
  });
}

// ── Splash window ─────────────────────────────────────────────────────────────
function createSplash() {
  splashWindow = new BrowserWindow({
    width: 360, height: 300,
    resizable: false, frame: false, center: true,
    webPreferences: { contextIsolation: true },
  });
  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
}

// ── Setup window ──────────────────────────────────────────────────────────────
function createSetupWindow() {
  setupWindow = new BrowserWindow({
    width: 560, height: 720,
    resizable: false, center: true,
    title: 'Asset Manager — Setup',
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  setupWindow.loadFile(path.join(__dirname, 'setup.html'));
  setupWindow.on('closed', () => { setupWindow = null; });
}

// ── Main window ───────────────────────────────────────────────────────────────
function createMainWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1400, height: 900,
    minWidth: 960, minHeight: 600,
    title: 'Asset Manager',
    show: false,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  mainWindow.loadURL(`http://127.0.0.1:${port}`);
  mainWindow.once('ready-to-show', () => {
    if (splashWindow && !splashWindow.isDestroyed()) { splashWindow.close(); splashWindow = null; }
    mainWindow.show();
    mainWindow.focus();
  });
  mainWindow.on('closed', () => { mainWindow = null; });

  // Open external links in the system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// ── Spawn backend ─────────────────────────────────────────────────────────────
function spawnBackend(port) {
  if (!app.isPackaged || !BACKEND_EXE || !fs.existsSync(BACKEND_EXE)) {
    console.log('[Electron] Dev mode — backend not spawned (run uvicorn separately)');
    return;
  }

  const env = {
    ...process.env,
    PORT: String(port),
    ASSET_DATA_DIR: APP_DATA_DIR,
    PYTHONUNBUFFERED: '1',
  };

  backendProc = spawn(BACKEND_EXE, [], {
    cwd: BACKEND_DIR,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  backendProc.stdout.on('data', d => console.log('[backend]', d.toString().trim()));
  backendProc.stderr.on('data', d => console.error('[backend]', d.toString().trim()));
  backendProc.on('exit', (code) => {
    console.log(`[Electron] Backend exited with code ${code}`);
  });
}

// ── Kill backend ──────────────────────────────────────────────────────────────
function killBackend() {
  // Kill tracked PID first
  if (backendProc) {
    try { execSync(`taskkill /PID ${backendProc.pid} /T /F`, { stdio: 'ignore' }); } catch {}
    backendProc = null;
  }
  // Also kill by name — handles orphaned processes from failed/partial updates
  try { execSync('taskkill /IM asset-backend.exe /T /F', { stdio: 'ignore' }); } catch {}
}

// ── App menu ──────────────────────────────────────────────────────────────────
function buildMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Settings…',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            if (setupWindow && !setupWindow.isDestroyed()) {
              setupWindow.focus();
            } else {
              createSetupWindow();
            }
          },
        },
        { type: 'separator' },
        { role: 'quit', label: 'Exit' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Check for Updates',
          click: () => {
            autoUpdater.checkForUpdates()
              .then((result) => {
                const latest  = result && result.updateInfo && result.updateInfo.version;
                const current = app.getVersion();
                if (!latest || latest === current) {
                  dialog.showMessageBox({
                    type: 'info',
                    title: 'Up to date',
                    message: `You are running the latest version (v${current}).`,
                  });
                }
                // If latest > current, the 'update-available' event fires and
                // handles the notification + download automatically.
              })
              .catch(() => {
                dialog.showMessageBox({
                  type: 'info',
                  title: 'Update check failed',
                  message: 'Could not reach the update server.',
                  detail: 'Make sure you are connected to the internet. If the problem persists, contact your IT administrator.',
                });
              });
          },
        },
        { type: 'separator' },
        {
          label: `About Asset Manager v${app.getVersion()}`,
          click: () => {
            dialog.showMessageBox({
              type: 'info',
              title: 'Asset Manager',
              message: `Asset Manager v${app.getVersion()}`,
              detail: 'Gravity BP\nAsset tracking and report generation.',
            });
          },
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── IPC handlers ─────────────────────────────────────────────────────────────
ipcMain.handle('get-config', () => readConfig());

ipcMain.handle('save-config', (_, cfg) => {
  writeConfig(cfg);
  writeEnvFromConfig(cfg);
  return { ok: true };
});

ipcMain.handle('setup-complete', async (_, cfg) => {
  writeConfig(cfg);
  writeEnvFromConfig(cfg);
  if (setupWindow && !setupWindow.isDestroyed()) { setupWindow.close(); setupWindow = null; }
  await launchApp();
});

ipcMain.handle('get-port', () => backendPort);

// ── Main launch sequence ──────────────────────────────────────────────────────
async function launchApp() {
  // Kill any orphaned backend from a previous partial update before spawning a new one
  try { execSync('taskkill /IM asset-backend.exe /T /F', { stdio: 'ignore' }); } catch {}

  createSplash();

  try {
    backendPort = await findFreePort(8000);
    const cfg = readConfig();
    if (cfg) writeEnvFromConfig(cfg);
    spawnBackend(backendPort);

    // In dev mode the backend is already running on 8000
    const targetPort = app.isPackaged ? backendPort : 8000;
    await pollBackendReady(targetPort, 30000);

    createMainWindow(targetPort);
    autoUpdater.checkForUpdatesAndNotify().catch(() => {});
  } catch (err) {
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
    dialog.showErrorBox('Asset Manager — Startup Error', String(err));
    app.quit();
  }
}

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  buildMenu();
  const cfg = readConfig();
  if (!cfg || !cfg.SHAREPOINT_TENANT_ID) {
    // First run — show setup screen
    createSetupWindow();
  } else {
    await launchApp();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  killBackend();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) launchApp();
});

// ── Auto-updater events ───────────────────────────────────────────────────────
autoUpdater.on('update-available', () => {
  dialog.showMessageBox({ type: 'info', title: 'Update available', message: 'A new version is being downloaded…' });
});

autoUpdater.on('update-downloaded', () => {
  const choice = dialog.showMessageBoxSync({
    type: 'question',
    buttons: ['Restart Now', 'Later'],
    message: 'Update downloaded. Restart to apply?',
  });
  if (choice === 0) {
    // Kill backend BEFORE quitAndInstall so Windows fully releases the exe
    // file handle before the NSIS installer tries to overwrite it.
    killBackend();
    setTimeout(() => autoUpdater.quitAndInstall(true, true), 2000);
  }
});
