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
  // Hold output that arrives before a terminal has attached, then replay it.
  const pending = useRef<ArrayBuffer[]>([]);
  const connected = useRef(false);

  useEffect(() => {
    // Each effect run owns its socket lifecycle. `disposed` is local so that a
    // socket closed during teardown (e.g. StrictMode remount) does NOT trigger
    // a reconnect — which previously spawned zombie duplicate connections.
    let disposed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let socket: WebSocket | null = null;

    const proto = location.protocol === "https:" ? "wss" : "ws";
    const url = `${proto}://${location.host}/pty?sid=${sessionId}`;

    function connect() {
      if (disposed) return;
      socket = new WebSocket(url);
      socket.binaryType = "arraybuffer";
      ws.current = socket;

      socket.onopen = () => {
        connected.current = true;
      };

      socket.onmessage = (ev) => {
        if (!(ev.data instanceof ArrayBuffer)) return;
        if (listeners.current.size === 0) {
          pending.current.push(ev.data);
        } else {
          listeners.current.forEach((cb) => cb(ev.data as ArrayBuffer));
        }
      };

      socket.onclose = () => {
        connected.current = false;
        if (ws.current === socket) ws.current = null;
        if (!disposed) reconnectTimer = setTimeout(connect, 1500);
      };

      socket.onerror = () => socket?.close();
    }

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
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
    // Replay anything buffered before this terminal attached.
    if (pending.current.length) {
      const queued = pending.current;
      pending.current = [];
      queued.forEach((d) => cb(d));
    }
    return () => {
      listeners.current.delete(cb);
    };
  }, []);

  return {
    send,
    resize,
    onData,
    get connected() {
      return connected.current;
    },
  };
}
