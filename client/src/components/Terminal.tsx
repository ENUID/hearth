import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import type { PtySocket } from "../hooks/usePtySocket";

type Props = {
  ptySocket: PtySocket;
};

export default function Terminal({ ptySocket }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new XTerm({
      fontFamily: "var(--font-mono)",
      fontSize: 14,
      lineHeight: 1.4,
      theme: {
        background: "#0f1117",
        foreground: "#e2e8f0",
        cursor: "#7c6af7",
        cursorAccent: "#0f1117",
        selectionBackground: "#3d3578",
        black: "#1e2130",
        red: "#f87171",
        green: "#4ade80",
        yellow: "#fbbf24",
        blue: "#60a5fa",
        magenta: "#c084fc",
        cyan: "#34d399",
        white: "#e2e8f0",
        brightBlack: "#64748b",
        brightRed: "#f87171",
        brightGreen: "#4ade80",
        brightYellow: "#fbbf24",
        brightBlue: "#93c5fd",
        brightMagenta: "#d8b4fe",
        brightCyan: "#6ee7b7",
        brightWhite: "#f8fafc",
      },
      allowProposedApi: true,
      scrollback: 5000,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(containerRef.current);

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    // Fit only when the element has a real size AND xterm's renderer has computed
    // its cell dimensions — otherwise FitAddon throws "reading 'dimensions'".
    // Returns true once a fit actually happened.
    const safeFit = (): boolean => {
      const el = containerRef.current;
      if (!el || el.clientWidth === 0 || el.clientHeight === 0) return false;
      try {
        const dims = fitAddon.proposeDimensions();
        if (!dims || !Number.isFinite(dims.cols) || !Number.isFinite(dims.rows)) return false;
        fitAddon.fit();
        ptySocket.resize(term.cols, term.rows);
        return true;
      } catch {
        return false; // renderer not ready yet; a later tick will retry
      }
    };

    const unsubData = ptySocket.onData((data) => {
      term.write(new Uint8Array(data));
    });

    term.onData((data) => {
      ptySocket.send(data);
    });

    const ro = new ResizeObserver(() => {
      safeFit();
    });
    ro.observe(containerRef.current);

    // Retry the initial fit until the renderer is ready and the socket is up.
    requestAnimationFrame(() => safeFit());
    let fitted = false;
    const timer = setInterval(() => {
      if (!fitted) fitted = safeFit();
      if (fitted && ptySocket.connected) clearInterval(timer);
    }, 150);

    return () => {
      clearInterval(timer);
      unsubData();
      ro.disconnect();
      term.dispose();
    };
  }, [ptySocket]);

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        padding: "8px 4px 4px 8px",
        background: "var(--bg)",
        overflow: "hidden",
        height: "100%",
      }}
    />
  );
}
