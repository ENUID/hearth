import { useEffect, useRef, useCallback } from "react";

export type PtySocket = {
  send: (data: ArrayBuffer | string) => void;
  resize: (cols: number, rows: number) => void;
  onData: (cb: (data: ArrayBuffer) => void) => () => void;
  connected: boolean;
};

export function usePtySocket(sessionId: string): PtySocket {
  const ws = useRef<WebSocket | null>(null);
  const listeners = useRef<Set<(data: ArrayBuffer) => void>>(new Set());
  const connected = useRef(false);

  useEffect(() => {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const url = `${proto}://${location.host}/pty?sid=${sessionId}`;

    function connect() {
      const socket = new WebSocket(url);
      socket.binaryType = "arraybuffer";
      ws.current = socket;

      socket.onopen = () => {
        connected.current = true;
      };

      socket.onmessage = (ev) => {
        if (ev.data instanceof ArrayBuffer) {
          listeners.current.forEach((cb) => cb(ev.data as ArrayBuffer));
        }
      };

      socket.onclose = () => {
        connected.current = false;
        ws.current = null;
        setTimeout(connect, 2000);
      };

      socket.onerror = () => {
        socket.close();
      };
    }

    connect();

    return () => {
      ws.current?.close();
    };
  }, [sessionId]);

  const send = useCallback((data: ArrayBuffer | string) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(data);
    }
  }, []);

  const resize = useCallback((cols: number, rows: number) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: "resize", cols, rows }));
    }
  }, []);

  const onData = useCallback((cb: (data: ArrayBuffer) => void) => {
    listeners.current.add(cb);
    return () => listeners.current.delete(cb);
  }, []);

  return { send, resize, onData, get connected() { return connected.current; } };
}
