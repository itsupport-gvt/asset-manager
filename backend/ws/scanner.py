"""
WebSocket bridge: phone scanner ↔ web app.

/ws/scanner  — phone connects here, sends scan results
/ws/app      — web app connects here, receives forwarded scan results

No auth required — same-network only.
"""
from fastapi import WebSocket, WebSocketDisconnect

# Active connections
_phone_conns: set[WebSocket] = set()
_app_conns:   set[WebSocket] = set()


async def scanner_ws(ws: WebSocket):
    """Phone scanner endpoint — receives scans, relays to all app connections."""
    await ws.accept()
    _phone_conns.add(ws)
    print(f"[WS] Scanner connected. Active scanners: {len(_phone_conns)}")
    try:
        while True:
            data = await ws.receive_text()
            print(f"[WS] Scan received: {data[:80]}")
            # Forward to all web app connections
            dead: set[WebSocket] = set()
            for app_ws in list(_app_conns):
                try:
                    await app_ws.send_text(data)
                except Exception:
                    dead.add(app_ws)
            _app_conns -= dead
    except WebSocketDisconnect:
        _phone_conns.discard(ws)
        print(f"[WS] Scanner disconnected. Active scanners: {len(_phone_conns)}")


async def app_ws(ws: WebSocket):
    """Web app endpoint — receives forwarded scan results, and sends context commands to phones."""
    await ws.accept()
    _app_conns.add(ws)
    print(f"[WS] App connected. Active app clients: {len(_app_conns)}")
    try:
        while True:
            # We now read from the app to send messages (like 'set_context') back to the scanners
            data = await ws.receive_text()
            print(f"[WS] Command from app: {data[:80]}")
            
            dead_phones: set[WebSocket] = set()
            for phone_ws in list(_phone_conns):
                try:
                    await phone_ws.send_text(data)
                except Exception:
                    dead_phones.add(phone_ws)
            _phone_conns -= dead_phones

    except WebSocketDisconnect:
        _app_conns.discard(ws)
        print(f"[WS] App disconnected. Active app clients: {len(_app_conns)}")


def scanner_status() -> dict:
    return {
        "scanners_connected": len(_phone_conns),
        "apps_connected": len(_app_conns),
    }
