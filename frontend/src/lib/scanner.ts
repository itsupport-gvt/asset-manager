import { useEffect, useRef, useState, useCallback } from 'react';
import type { ScanPayload } from './types';

/**
 * useScanner — connects to /ws/app and streams scan events from the phone.
 *
 * Returns the latest ScanPayload (or null) and a clear() function.
 * The web app subscribes at the top level (App.tsx) and passes down via context.
 */
export function useScanner(onScan: (payload: ScanPayload) => void) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    let alive = true;

    function connect() {
      if (!alive) return;
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${location.host}/ws/app`);
      wsRef.current = ws;

      ws.onopen  = () => { if (alive) setConnected(true); };
      ws.onclose = () => {
        if (!alive) return;
        setConnected(false);
        setTimeout(connect, 2500); // auto-reconnect
      };
      ws.onerror = () => ws.close();
      ws.onmessage = (e) => {
        try {
          const payload: ScanPayload = JSON.parse(e.data);
          onScanRef.current(payload);
        } catch { /* ignore malformed messages */ }
      };
    }

    connect();
    return () => {
      alive = false;
      wsRef.current?.close();
    };
  }, []);

  const sendContext = useCallback((ctx: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'set_context', context: ctx }));
    }
  }, []);

  return { connected, setScannerContext: sendContext };
}

/**
 * ScannerContext — share latest field_scan payload across the component tree
 * so ScanField inputs can pick up values wherever they are rendered.
 */
import { createContext, useContext } from 'react';

interface ScannerContextValue {
  lastFieldScan: ScanPayload | null;
  clearFieldScan: () => void;
  scannerConnected: boolean;
  activeFieldId: string | null;
  setActiveFieldId: (id: string | null) => void;
  setScannerContext?: (ctx: any) => void;
}

export const ScannerContext = createContext<ScannerContextValue>({
  lastFieldScan: null,
  clearFieldScan: () => {},
  scannerConnected: false,
  activeFieldId: null,
  setActiveFieldId: () => {},
});

export const useScannerContext = () => useContext(ScannerContext);
