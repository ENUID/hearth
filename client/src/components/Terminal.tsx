import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { SearchAddon } from "@xterm/addon-search";
import { ClipboardAddon } from "@xterm/addon-clipboard";
import { WebglAddon } from "@xterm/addon-webgl";
import "@xterm/xterm/css/xterm.css";
import type { ITheme } from "@xterm/xterm";
import type { PtySocket } from "../hooks/usePtySocket";
import { useSettings, getSettings } from "../lib/settings";

type Mods = { ctrl: boolean; alt: boolean };

// The chrome is monochrome, but the terminal keeps real ANSI colors so CLI
// output stays readable — tuned for each theme.
function xtermTheme(resolved: "light" | "dark"): ITheme {
  if (resolved === "light") {
    return {
      background: "#ffffff", foreground: "#15171a", cursor: "#15171a", cursorAccent: "#ffffff",
      selectionBackground: "rgba(21,23,26,0.14)",
      black: "#383a42", red: "#d14b46", green: "#4a8f3c", yellow: "#b07d00",
      blue: "#2f6fdb", magenta: "#9a3fb5", cyan: "#2a8a99", white: "#4b4f55",
      brightBlack: "#9aa0a6", brightRed: "#e05c55", brightGreen: "#5aa248", brightYellow: "#c2920f",
      brightBlue: "#3f7eea", brightMagenta: "#ad4fc7", brightCyan: "#319bab", brightWhite: "#15171a",
    };
  }
  return {
    background: "#0b0c0e", foreground: "#e8e9ea", cursor: "#e8e9ea", cursorAccent: "#0b0c0e",
    selectionBackground: "rgba(232,233,234,0.18)",
    black: "#2b2e33", red: "#e06c75", green: "#98c379", yellow: "#e5c07b",
    blue: "#61afef", magenta: "#c678dd", cyan: "#56b6c2", white: "#d7dae0",
    brightBlack: "#5f646a", brightRed: "#e6747d", brightGreen: "#a6cf86", brightYellow: "#ecc98a",
    brightBlue: "#7bbef2", brightMagenta: "#d089e3", brightCyan: "#6fc2cd", brightWhite: "#ffffff",
  };
}

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
  const fitRef = useRef<FitAddon | null>(null);
  const searchRef = useRef<SearchAddon | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const settings = useSettings();

  // Apply theme / font size / cursor live, without recreating the terminal.
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.theme = xtermTheme(settings.resolved);
    term.options.fontSize = settings.fontSize;
    term.options.cursorStyle = settings.cursorStyle;
    try {
      fitRef.current?.fit();
    } catch {
      /* ignore */
    }
  }, [settings.resolved, settings.fontSize, settings.cursorStyle]);

  useEffect(() => {
    if (!containerRef.current) return;

    const s0 = getSettings();
    const term = new XTerm({
      fontFamily: "var(--font-mono)",
      fontSize: s0.fontSize,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: s0.cursorStyle,
      scrollback: 10000,
      allowProposedApi: true,
      macOptionIsMeta: true,
      theme: xtermTheme(s0.resolved),
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
    fitRef.current = fitAddon;
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
        matchBackground: "#6b7177",
        activeMatchBackground: "#e8e9ea",
        matchOverviewRuler: "#6b7177",
        activeMatchColorOverviewRuler: "#e8e9ea",
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
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            padding: "4px 6px",
            boxShadow: "0 8px 28px rgba(0,0,0,0.28)",
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
              color: "var(--fg)",
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
  color: "var(--fg-muted)",
  cursor: "pointer",
  fontSize: 12,
  width: 24,
  height: 24,
};
