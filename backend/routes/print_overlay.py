"""
Print Overlay routes — port of the overlay engine from main-v2.py.

Endpoints:
  GET  /api/overlay/config                               → current OVERLAY_CONFIG
  POST /api/overlay/calibrate                            → upload PDF, return calibration
  GET  /api/overlay/calibration-grid                     → download calibration grid PDF
  POST /api/overlay/generate                             → generate overlay PDF (download)
  GET  /api/overlay/print-log/{emp_id}/{doc_type}        → get print log entry
  POST /api/overlay/print-log/{emp_id}/{doc_type}/mark   → mark asset IDs as printed
  DELETE /api/overlay/print-log/{emp_id}/{doc_type}      → clear log entry
"""

from __future__ import annotations

import io
import json
import os
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import Response, StreamingResponse

router = APIRouter(prefix="/api/overlay", tags=["overlay"])


# ── Path helpers ─────────────────────────────────────────────────────────────

def _data_dir() -> Path:
    """User-writable data directory (AppData in Electron, repo root in dev)."""
    d = os.getenv("ASSET_DATA_DIR")
    if d:
        return Path(d)
    # Dev: project root (two levels above backend/)
    return Path(__file__).resolve().parent.parent.parent.parent


PRINT_LOG_FILE_NAME = "print_log.json"


def _print_log_path() -> Path:
    return _data_dir() / PRINT_LOG_FILE_NAME


# ── Baked-in calibration (from actual PDF border-line measurements) ──────────

OVERLAY_CONFIG: dict[str, Any] = {
    "page_size": "A4",
    # Page 1
    "table_data_start_y_mm": 156.700,
    "rows_per_page1": 7,
    # Page 2
    "table_data_start_y_mm_page2": 61.600,
    # Row height
    "row_height_mm": 16.055,
    # Column positions (mm from left edge)  — 7 cols
    "col_x_mm":  [12.700, 39.000, 65.250, 91.540, 117.840, 144.590, 170.890],
    "col_w_mm":  [26.300, 26.250, 26.290, 26.300,  26.750,  26.300,  26.300],
    "font_size": 9,
}


# ── Font registration ─────────────────────────────────────────────────────────

OVERLAY_FONT_NAME = "Cambria"

_FONT_CANDIDATES: dict[str, list[tuple[str, int]]] = {
    "Cambria": [
        ("C:/Windows/Fonts/cambria.ttc", 0),
        ("C:/Windows/Fonts/Cambria.ttc", 0),
        (os.path.expanduser("~") + "/AppData/Local/Microsoft/Windows/Fonts/cambria.ttc", 0),
        ("C:/Windows/Fonts/cambria.ttf", 0),
    ],
    "Arial": [
        ("C:/Windows/Fonts/arial.ttf", 0),
        ("/Library/Fonts/Arial.ttf", 0),
        ("/usr/share/fonts/truetype/msttcorefonts/Arial.ttf", 0),
    ],
    "Calibri": [
        ("C:/Windows/Fonts/calibri.ttf", 0),
        (os.path.expanduser("~") + "/AppData/Local/Microsoft/Windows/Fonts/calibri.ttf", 0),
    ],
}

_BUILTIN_FONTS = {
    "Helvetica", "Helvetica-Bold", "Helvetica-Oblique",
    "Times-Roman", "Times-Bold", "Courier", "Courier-Bold",
}


def _register_font(font_name: str) -> str:
    if font_name in _BUILTIN_FONTS:
        return font_name
    try:
        from reportlab.pdfbase import pdfmetrics
        pdfmetrics.getFont(font_name)
        return font_name
    except Exception:
        pass

    import glob as _glob
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont

    candidates = list(_FONT_CANDIDATES.get(font_name, []))
    for font_dir in [
        "C:/Windows/Fonts",
        os.path.expanduser("~") + "/AppData/Local/Microsoft/Windows/Fonts",
        "/Library/Fonts", "/System/Library/Fonts", "/usr/share/fonts/truetype",
    ]:
        for ext in ["ttf", "ttc", "TTF", "TTC"]:
            for path in _glob.glob(f"{font_dir}/{font_name}*.{ext}"):
                candidates.append((path, 0))
            for path in _glob.glob(f"{font_dir}/{font_name.lower()}*.{ext}"):
                candidates.append((path, 0))

    for path, idx in candidates:
        if os.path.exists(path):
            try:
                pdfmetrics.registerFont(TTFont(font_name, path, subfontIndex=idx))
                return font_name
            except Exception:
                pass

    return "Helvetica"


# Resolved font — registered lazily on first use
_RESOLVED_FONT: str | None = None


def _font() -> str:
    global _RESOLVED_FONT
    if _RESOLVED_FONT is None:
        _RESOLVED_FONT = _register_font(OVERLAY_FONT_NAME)
    return _RESOLVED_FONT


# ── Text wrapping helpers ─────────────────────────────────────────────────────

def _wrap_text(text: str, font: str, size: float, max_w_mm: float, canvas_obj) -> list[str]:
    words = text.split()
    if not words:
        return []
    lines, current = [], ""
    for word in words:
        test = (current + " " + word).strip()
        if canvas_obj.stringWidth(test, font, size) * 25.4 / 72 <= max_w_mm:
            current = test
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def _best_fit_note(text: str, font: str, cell_w_mm: float, cell_h_mm: float,
                   padding_mm: float, canvas_obj) -> tuple[float, list[str]]:
    usable_w = cell_w_mm - 2 * padding_mm
    usable_h = cell_h_mm - 2 * padding_mm
    for fsize in [9, 8, 7, 6]:
        line_h_mm = fsize * 1.2 * 25.4 / 72
        lines = _wrap_text(text, font, fsize, usable_w, canvas_obj)
        if len(lines) * line_h_mm <= usable_h:
            return fsize, lines
    fsize = 6
    line_h_mm = fsize * 1.2 * 25.4 / 72
    max_lines = int(usable_h / line_h_mm)
    lines = _wrap_text(text, font, fsize, usable_w, canvas_obj)
    return fsize, lines[:max_lines]


def _draw_notes_in_cell(canvas_obj, note_text: str,
                        cell_x0_mm: float, cell_y_top_mm: float,
                        cell_w_mm: float, cell_h_mm: float,
                        page_h_pt: float, padding_mm: float = 1.5) -> None:
    from reportlab.lib.units import mm
    if not note_text.strip():
        return
    font = _font()
    fsize, lines = _best_fit_note(note_text, font, cell_w_mm, cell_h_mm, padding_mm, canvas_obj)
    line_h_mm = fsize * 1.2 * 25.4 / 72
    block_h_mm = len(lines) * line_h_mm
    top_offset_mm = (cell_h_mm - block_h_mm) / 2
    canvas_obj.setFont(font, fsize)
    usable_w = cell_w_mm - 2 * padding_mm
    for i, line in enumerate(lines):
        line_top_mm = cell_y_top_mm + top_offset_mm + i * line_h_mm
        y_pt = page_h_pt - (line_top_mm + line_h_mm * 0.75) * mm
        text_w_mm = canvas_obj.stringWidth(line, font, fsize) * 25.4 / 72
        x_mm = cell_x0_mm + padding_mm + (usable_w - text_w_mm) / 2
        canvas_obj.drawString(x_mm * mm, y_pt, line)
    canvas_obj.setFont(font, OVERLAY_CONFIG["font_size"])


# ── Core overlay PDF generator ────────────────────────────────────────────────

def _generate_overlay_pdf_bytes(
    rows_to_print: list[dict],
    calib: dict | None = None,
) -> bytes:
    """
    rows_to_print: [{"target_row": int (1-indexed), "page": int, "values": [7 str]}]
    calib: optional calibration from read_calibration_from_pdf()
    Returns raw PDF bytes.
    """
    from reportlab.pdfgen import canvas as rl_canvas
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm

    cfg = OVERLAY_CONFIG
    pagesize = A4
    page_w, page_h = pagesize
    fsize = cfg["font_size"]
    font = _font()

    def _get_page_geom(page_num: int):
        if calib and page_num in calib:
            p = calib[page_num]
            return (
                [x * mm for x in p["col_x0"]],
                [w * mm for w in p["col_w"]],
                p["data_start_y"],
                p["avg_row_h"],
            )
        elif page_num == 1:
            return (
                [x * mm for x in cfg["col_x_mm"]],
                [w * mm for w in cfg["col_w_mm"]],
                cfg["table_data_start_y_mm"],
                cfg["row_height_mm"],
            )
        else:
            return (
                [x * mm for x in cfg["col_x_mm"]],
                [w * mm for w in cfg["col_w_mm"]],
                cfg["table_data_start_y_mm_page2"],
                cfg["row_height_mm"],
            )

    pages: dict[int, list] = defaultdict(list)
    for entry in rows_to_print:
        pages[entry["page"]].append(entry)
    max_page = max(pages.keys()) if pages else 1

    buf = io.BytesIO()
    c = rl_canvas.Canvas(buf, pagesize=pagesize)
    c.setPageCompression(0)
    c.setFont(font, fsize)

    for page_num in range(1, max_page + 1):
        entries = pages.get(page_num, [])
        col_x, col_w, start_y, rh_mm = _get_page_geom(page_num)

        for entry in entries:
            row_idx = entry["target_row"] - 1
            vals = entry["values"]
            y_top_mm = start_y + row_idx * rh_mm
            y_center = page_h - (y_top_mm + rh_mm / 2) * mm

            for col_idx, val in enumerate(vals):
                val = str(val)
                if not val or col_idx >= len(col_x):
                    continue
                if col_idx == 5:  # Notes column — wrapped
                    _draw_notes_in_cell(
                        canvas_obj=c,
                        note_text=val,
                        cell_x0_mm=col_x[col_idx] / mm,
                        cell_y_top_mm=y_top_mm,
                        cell_w_mm=col_w[col_idx] / mm,
                        cell_h_mm=rh_mm,
                        page_h_pt=page_h,
                    )
                    continue
                text_w = c.stringWidth(val, font, fsize)
                x = col_x[col_idx] + (col_w[col_idx] - text_w) / 2
                x = max(col_x[col_idx] + 1 * mm,
                        min(x, col_x[col_idx] + col_w[col_idx] - text_w - 1 * mm))
                c.drawString(x, y_center - (fsize / 2) * 0.352778 * mm, val)

        if page_num < max_page:
            c.showPage()
            c.setFont(font, fsize)

    c.save()
    return buf.getvalue()


# ── Calibration grid PDF generator ───────────────────────────────────────────

def _generate_calibration_grid_bytes() -> bytes:
    from reportlab.pdfgen import canvas as rl_canvas
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm

    cfg = OVERLAY_CONFIG
    page_w, page_h = A4
    buf = io.BytesIO()
    c = rl_canvas.Canvas(buf, pagesize=A4)
    c.setFont("Helvetica", 5)

    # Horizontal lines every 1 mm, labelled every 5 mm
    c.setStrokeColorRGB(0.85, 0.85, 0.85)
    c.setLineWidth(0.3)
    for y_mm in range(0, 300, 1):
        y = page_h - y_mm * mm
        c.line(0, y, page_w, y)
        if y_mm % 5 == 0:
            c.setStrokeColorRGB(0.6, 0.6, 0.6)
            c.setLineWidth(0.6)
            c.line(0, y, page_w, y)
            c.setFillColorRGB(0, 0, 0)
            c.drawString(1 * mm, y + 0.5 * mm, f"{y_mm}")
            c.setStrokeColorRGB(0.85, 0.85, 0.85)
            c.setLineWidth(0.3)

    # Vertical lines every 5 mm
    for x_mm in range(0, 220, 5):
        x = x_mm * mm
        c.line(x, 0, x, page_h)
        c.drawString(x + 0.3 * mm, page_h - 5 * mm, f"{x_mm}")

    # Current column positions in blue
    c.setStrokeColorRGB(0.1, 0.4, 0.9)
    c.setLineWidth(1.0)
    for x_mm in cfg["col_x_mm"]:
        c.line(x_mm * mm, 0, x_mm * mm, page_h)

    # Table data start y in red
    c.setStrokeColorRGB(0.9, 0.1, 0.1)
    c.setLineWidth(1.0)
    y_start = page_h - cfg["table_data_start_y_mm"] * mm
    c.line(0, y_start, page_w, y_start)

    # Row lines in green
    c.setStrokeColorRGB(0.1, 0.7, 0.2)
    c.setLineWidth(0.5)
    for i in range(1, 10):
        y = page_h - (cfg["table_data_start_y_mm"] + i * cfg["row_height_mm"]) * mm
        c.line(0, y, page_w, y)

    c.save()
    return buf.getvalue()


# ── PDF calibration reader ────────────────────────────────────────────────────

def _read_calibration_from_pdf_bytes(pdf_bytes: bytes) -> dict | None:
    try:
        import pdfplumber
    except ImportError:
        raise HTTPException(status_code=500, detail="pdfplumber not installed")

    results = {}
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page_num, page in enumerate(pdf.pages, 1):
            mm_conv = lambda p: p * 25.4 / 72
            rects = page.rects
            border_x: set[float] = set()
            border_y: set[float] = set()
            for r in rects:
                w = mm_conv(r["x1"] - r["x0"])
                h = mm_conv(r["bottom"] - r["top"])
                if w < 0.5 and h > 3.0:
                    border_x.add(round(mm_conv(r["x0"]), 2))
                if h < 0.5 and w > 3.0:
                    border_y.add(round(mm_conv(r["top"]), 2))

            border_x_s = sorted(border_x)
            border_y_s = sorted(border_y)
            if len(border_x_s) < 2 or len(border_y_s) < 2:
                continue

            col_x0 = border_x_s[:-1]
            col_w = [border_x_s[i + 1] - border_x_s[i] for i in range(len(border_x_s) - 1)]
            data_start_y = border_y_s[1] if len(border_y_s) > 1 else border_y_s[0]
            data_row_ys = border_y_s[1:]
            row_heights = [data_row_ys[i + 1] - data_row_ys[i] for i in range(len(data_row_ys) - 1)]
            avg_row_h = sum(row_heights) / len(row_heights) if row_heights else 16.0
            num_data_rows = len(row_heights)

            results[page_num] = {
                "data_start_y": data_start_y,
                "avg_row_h": avg_row_h,
                "num_data_rows": num_data_rows,
                "col_x0": col_x0,
                "col_w": col_w,
            }

    return results if results else None


# ── Print log helpers ─────────────────────────────────────────────────────────

def _load_print_log() -> dict:
    p = _print_log_path()
    if p.exists():
        with open(p, "r") as f:
            return json.load(f)
    return {}


def _save_print_log(log: dict) -> None:
    p = _print_log_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    with open(p, "w") as f:
        json.dump(log, f, indent=2)


def _log_key(emp_id: str, doc_type: str) -> str:
    return f"{emp_id}_{doc_type}"


# ── API endpoints ─────────────────────────────────────────────────────────────

@router.get("/config")
def get_config():
    """Return current baked-in overlay configuration."""
    return OVERLAY_CONFIG


@router.post("/calibrate")
async def calibrate_from_pdf(file: UploadFile = File(...)):
    """
    Upload a generated form PDF → returns calibration data (column/row positions).
    The frontend can store this and pass it back in /generate.
    """
    pdf_bytes = await file.read()
    calib = _read_calibration_from_pdf_bytes(pdf_bytes)
    if not calib:
        raise HTTPException(status_code=422, detail="Could not detect table borders in the uploaded PDF")
    return {"calibration": calib}


@router.get("/calibration-grid")
def get_calibration_grid():
    """Download a ruler grid PDF for manual calibration."""
    pdf_bytes = _generate_calibration_grid_bytes()
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="calibration_grid.pdf"'},
    )


@router.post("/generate")
def generate_overlay(body: dict):
    """
    Generate an overlay PDF.

    Body:
    {
        "rows": [
            {
                "page": int,
                "target_row": int,   // 1-indexed row on the physical page
                "values": [str, str, str, str, str, str, str]  // 7 cols
            }
        ],
        "calibration": { ... }   // optional, from /calibrate
    }
    Returns PDF as a download.
    """
    rows = body.get("rows", [])
    calib_raw = body.get("calibration")

    if not rows:
        raise HTTPException(status_code=400, detail="No rows provided")

    # Decode calibration keys from JSON (they come as strings, need int keys)
    calib: dict | None = None
    if calib_raw:
        calib = {int(k): v for k, v in calib_raw.items()}

    try:
        pdf_bytes = _generate_overlay_pdf_bytes(rows, calib)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Overlay generation failed: {e}")

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"Overlay_{timestamp}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── Print log endpoints ───────────────────────────────────────────────────────

@router.get("/print-log/{emp_id}/{doc_type}")
def get_print_log(emp_id: str, doc_type: str):
    """Return print log entry for an employee + doc type."""
    log = _load_print_log()
    k = _log_key(emp_id, doc_type)
    entry = log.get(k, {"printed_ids": [], "history": []})
    return {"emp_id": emp_id, "doc_type": doc_type, **entry}


@router.post("/print-log/{emp_id}/{doc_type}/mark")
def mark_printed(emp_id: str, doc_type: str, body: dict):
    """
    Mark asset IDs as printed.
    Body: { "asset_ids": [str, ...] }
    """
    asset_ids = body.get("asset_ids", [])
    log = _load_print_log()
    k = _log_key(emp_id, doc_type)
    if k not in log:
        log[k] = {"printed_ids": [], "history": []}
    existing = set(log[k]["printed_ids"])
    new_ids = [str(i) for i in asset_ids if str(i) not in existing]
    log[k]["printed_ids"].extend(new_ids)
    log[k]["history"].append({
        "timestamp": datetime.now().isoformat(),
        "added_ids": new_ids,
    })
    _save_print_log(log)
    return {"marked": new_ids, "total_printed": len(log[k]["printed_ids"])}


@router.delete("/print-log/{emp_id}/{doc_type}")
def clear_print_log(emp_id: str, doc_type: str):
    """Clear print log for an employee + doc type."""
    log = _load_print_log()
    k = _log_key(emp_id, doc_type)
    if k in log:
        del log[k]
        _save_print_log(log)
        return {"cleared": True}
    return {"cleared": False, "detail": "No log entry found"}
