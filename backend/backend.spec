# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec for Asset Manager backend.

Build from asset-app/ root:
    .venv/Scripts/pyinstaller backend/backend.spec --distpath backend/dist --noconfirm

Output: backend/dist/asset-backend/  (--onedir, NOT --onefile — needed for DLL stability)
"""

import os
from PyInstaller.utils.hooks import collect_all, collect_submodules

block_cipher = None

# ── Collect packages that use dynamic imports ─────────────────────────────────
# collect_all returns (datas, binaries, hiddenimports)
pkgs = [
    'fastapi', 'starlette', 'pydantic', 'pydantic_core',
    'sqlalchemy', 'msal', 'docxtpl', 'docx2pdf', 'qrcode',
    'PIL', 'lxml', 'jinja2', 'docx', 'reportlab',
    'pdfplumber', 'cryptography', 'websockets', 'anyio',
]

all_datas    = []
all_binaries = []
all_hidden   = []

for pkg in pkgs:
    try:
        d, b, h = collect_all(pkg)
        all_datas    += d
        all_binaries += b
        all_hidden   += h
    except Exception:
        pass  # package not installed — skip

# ── Static / template assets ───────────────────────────────────────────────────
# Use SPEC path (reliable regardless of CWD when pyinstaller is invoked)
src_dir = os.path.dirname(os.path.abspath(SPEC))

extra_datas = [
    (os.path.join(src_dir, 'static'),         'static'),
    (os.path.join(src_dir, 'scanner_static'), 'scanner_static'),
    (os.path.join(src_dir, 'scanner.html'),   '.'),
    (os.path.join(src_dir, 'templates'),      'templates'),
]
# Only include paths that actually exist (templates/ may not exist yet at spec-time)
all_datas += [(src, dst) for src, dst in extra_datas if os.path.exists(src)]

# ── pywin32 DLLs (often missed by auto-collect) ───────────────────────────────
_pywin32_dll_dir = os.path.join(
    src_dir, '.venv', 'Lib', 'site-packages', 'pywin32_system32'
)
all_binaries += [
    (os.path.join(_pywin32_dll_dir, 'pythoncom312.dll'), '.'),
    (os.path.join(_pywin32_dll_dir, 'pywintypes312.dll'), '.'),
]

# ── Analysis ──────────────────────────────────────────────────────────────────
a = Analysis(
    [os.path.join(src_dir, 'main.py')],
    pathex=[src_dir],
    binaries=all_binaries,
    datas=all_datas,
    hiddenimports=all_hidden + [
        # uvicorn dynamic imports
        'uvicorn', 'uvicorn.main', 'uvicorn.config', 'uvicorn.server',
        'uvicorn.importer',
        'uvicorn.loops.auto', 'uvicorn.loops.asyncio', 'uvicorn.loops.uvloop',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.http.h11_impl',
        'uvicorn.protocols.http.httptools_impl',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.protocols.websockets.websockets_impl',
        'uvicorn.protocols.websockets.wsproto_impl',
        'uvicorn.lifespan.off', 'uvicorn.lifespan.on',
        # HTTP / async
        'h11', 'httptools', 'anyio', 'anyio._backends._asyncio',
        'anyio._backends._trio',
        # SQLAlchemy dialects
        'sqlalchemy.dialects.sqlite',
        'sqlalchemy.dialects.sqlite.pysqlite',
        # pywin32 (docx2pdf uses win32com)
        'win32com', 'win32com.client', 'pywintypes', 'pythoncom',
        'win32com.server.register',
        # email / multipart (fastapi File uploads)
        'email', 'email.mime', 'email.mime.text', 'email.mime.multipart',
        'multipart', 'python_multipart',
        # pdfplumber deps
        'pdfminer', 'pdfminer.high_level', 'pdfminer.layout',
        'pdfminer.pdfpage', 'pdfminer.pdfinterp', 'pdfminer.converter',
        # reportlab
        'reportlab.pdfgen.canvas',
        'reportlab.lib.pagesizes',
        'reportlab.lib.units',
        'reportlab.pdfbase.pdfmetrics',
        'reportlab.pdfbase.ttfonts',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'tkinter', 'matplotlib', 'numpy', 'pandas', 'scipy',
        'IPython', 'notebook', 'pytest',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='asset-backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,       # ← UPX MUST be False — it corrupts win32com and lxml DLLs
    console=True,    # set False for release (hides terminal window)
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name='asset-backend',
)
