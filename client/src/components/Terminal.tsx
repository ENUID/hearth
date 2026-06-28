import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { SearchAddon } from "@xterm/addon-search";
import { ClipboardAddon } from "@xterm/addon-clipboard";
import { WebglAddon } from "@xterm/addon-webgl";
import "@xterm/xterm/css/xterm.css";
import type { PtySocket } from "../hooks/usePtySocket";

type Mods = { ctrl: boolean; alt: boolean };

type Props = {
  ptySocket: PtySocket;
  /** Sticky modifiers from the mobile key bar, applied to the next typed char. */
  modifiersRef?: MutableRefObject<Mods>;
  /** Called after a sticky modifier is consumed, so the UI can clear it. */
  onConsumeModifiers?: () => void;
};

// Only enable the GPU renderer when a real WebGL2 context can be created.
function supportsWebgl2(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!canvas.getContext("webgl2");
  } catch {
    return false;
  }
}

// Apply a sticky Ctrl/Alt to a single typed character.
function applyMods(data: string, mods: Mods): string {
  let ch = data;
  if (mods.ctrl) {
    const code = data.toLowerCase().charCodeAt(0);
    if (code >= 97 && code <= 122) ch = String.fromCharCode(code - 96); // ^a..^z
    else if (data === " ") ch = "\x00";
    else if (code >= 91 && code <= 95) ch = String.fromCharCode(code - 64); // ^[ ^\ ^] ^^ ^_
  }
  if (mods.alt) ch = "\x1b" + ch; // Alt = ESC prefix
  return ch;
}

export default function Terminal({ ptySocket, modifiersRef, onConsumeModifiers }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const searchRef = useRef<SearchAddon | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new XTerm({
      fontFamily: "var(--font-mono)",
      fontSize: 14,
      lineHeight: 1.4,
      cursorBlink: true,
      scrollback: 10000,
      allowProposedApi: true,
      macOptionIsMeta: true,
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
    });

    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());
    term.loadAddon(searchAddon);
    term.loadAddon(new ClipboardAddon()); // OSC 52: programs can read/write clipboard

    // Wide-character / emoji width handling.
    const unicode11 = new Unicode11Addon();
    term.loadAddon(unicode11);
    term.unicode.activeVersion = "11";

    term.open(containerRef.current);

    // GPU rendering for speed; fall back silently to the DOM renderer if WebGL
    // is unavailable (headless, blocklisted GPUs, context loss). Only attempt
    // when a real WebGL2 context is available, and guard disposal — a failed
    // context leaves the addon half-initialized and its dispose() throws.
    let webgl: WebglAddon | null = null;
    if (supportsWebgl2()) {
      try {
        webgl = new WebglAddon();
        webgl.onContextLoss(() => {
          try {
            webgl?.dispose();
          } catch {
            /* ignore */
          }
          webgl = null;
        });
        term.loadAddon(webgl);
      } catch {
        try {
          webgl?.dispose();
        } catch {
          /* ignore */
        }
        webgl = null;
      }
    }

    termRef.current = term;
    searchRef.current = searchAddon;

    // Copy/paste/search keyboard shortcuts.
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== "keydown") return true;
      const ctrlShift = (e.ctrlKey || e.metaKey) && e.shiftKey;
      if (ctrlShift && e.code === "KeyC") {
        const sel = term.getSelection();
        if (sel) {
          navigator.clipboard?.writeText(sel).catch(() => {});
          return false;
        }
      }
      if (ctrlShift && e.code === "KeyV") {
        navigator.clipboard?.readText().then((t) => t && ptySocket.send(t)).catch(() => {});
        return false;
      }
      if (ctrlShift && e.code === "KeyF") {
        setSearchOpen(true);
        setTimeout(() => searchInputRef.current?.focus(), 0);
        return false;
      }
      return true;
    });

    // Fit only when the element has a real size AND xterm's renderer has computed
    // its cell dimensions — otherwise FitAddon throws "reading 'dimensions'".
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
      const mods = modifiersRef?.current;
      if (mods && (mods.ctrl || mods.alt) && data.length === 1) {
        ptySocket.send(applyMods(data, mods));
        onConsumeModifiers?.();
        return;
      }
      ptySocket.send(data);
    });

    const ro = new ResizeObserver(() => {
      safeFit();
    });
    ro.observe(containerRef.current);

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
      try {
        webgl?.dispose();
      } catch {
        /* a half-initialized WebGL context can throw on dispose */
      }
      webgl = null;
      try {
        term.dispose();
      } catch {
        /* ignore */
      }
    };
  }, [ptySocket]);

  function runSearch(q: string, dir: "next" | "prev") {
    if (!q) return;
    const opts = {
      decorations: {
        matchBackground: "#3d3578",
        activeMatchBackground: "#7c6af7",
        matchOverviewRuler: "#3d3578",
        activeMatchColorOverviewRuler: "#7c6af7",
      },
    };
    if (dir === "next") searchRef.current?.findNext(q, opts);
    else searchRef.current?.findPrevious(q, opts);
  }

  function closeSearch() {
    setSearchOpen(false);
    searchRef.current?.clearDecorations();
    termRef.current?.focus();
  }

  return (
    <div style={{ position: "relative", flex: 1, overflow: "hidden", height: "100%" }}>
      <div
        ref={containerRef}
        style={{ width: "100%", height: "100%", padding: "8px 4px 4px 8px", background: "var(--bg)" }}
      />

      {searchOpen && (
        <div
          style={{
            position: "absolute",
            top: 8,
            right: 12,
            display: "flex",
            gap: 4,
            alignItems: "center",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            padding: "4px 6px",
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
          }}
        >
          <input
            ref={searchInputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              runSearch(e.target.value, "next");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") runSearch(query, e.shiftKey ? "prev" : "next");
              else if (e.key === "Escape") closeSearch();
            }}
            placeholder="search…"
            style={{
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              color: "var(--text)",
              padding: "3px 6px",
              fontSize: 12,
              fontFamily: "var(--font-mono)",
              outline: "none",
              width: 160,
            }}
          />
          <button onClick={() => runSearch(query, "prev")} style={searchBtn} tabIndex={-1}>↑</button>
          <button onClick={() => runSearch(query, "next")} style={searchBtn} tabIndex={-1}>↓</button>
          <button onClick={closeSearch} style={searchBtn} tabIndex={-1}>✕</button>
        </div>
      )}
    </div>
  );
}

const searchBtn: React.CSSProperties = {
  background: "var(--bg)",
  border: "1px solid var(--border)",
  borderRadius: 4,
  color: "var(--text-muted)",
  cursor: "pointer",
  fontSize: 12,
  width: 24,
  height: 24,
};
