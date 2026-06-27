import { useCallback, useEffect, useRef, useState } from "react";
import Terminal from "./components/Terminal";
import KeyBar from "./components/KeyBar";
import { usePtySocket } from "./hooks/usePtySocket";

const SESSION_ID = "dev-session";

type Mods = { ctrl: boolean; alt: boolean };

function detectTouch(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(pointer: coarse)").matches ||
    "ontouchstart" in window ||
    window.innerWidth < 820
  );
}

export default function App() {
  const pty = usePtySocket(SESSION_ID);

  // Sticky modifiers shared with the terminal's input path via a ref (so the
  // terminal's one-time event handler always reads the latest value).
  const modifiersRef = useRef<Mods>({ ctrl: false, alt: false });
  const [mods, setMods] = useState<Mods>({ ctrl: false, alt: false });
  const apply = useCallback((next: Mods) => {
    modifiersRef.current = next;
    setMods(next);
  }, []);
  const toggleCtrl = useCallback(
    () => apply({ ctrl: !modifiersRef.current.ctrl, alt: modifiersRef.current.alt }),
    [apply]
  );
  const toggleAlt = useCallback(
    () => apply({ ctrl: modifiersRef.current.ctrl, alt: !modifiersRef.current.alt }),
    [apply]
  );
  const clearMods = useCallback(() => apply({ ctrl: false, alt: false }), [apply]);

  const [showKeyBar, setShowKeyBar] = useState(detectTouch);
  useEffect(() => {
    const onResize = () => setShowKeyBar(detectTouch());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Keep the app sized to the visible viewport so the key bar stays above the
  // on-screen keyboard (which shrinks visualViewport rather than the window).
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv || !showKeyBar) return;
    const onVV = () => {
      if (rootRef.current) rootRef.current.style.height = `${vv.height}px`;
    };
    vv.addEventListener("resize", onVV);
    vv.addEventListener("scroll", onVV);
    onVV();
    return () => {
      vv.removeEventListener("resize", onVV);
      vv.removeEventListener("scroll", onVV);
      if (rootRef.current) rootRef.current.style.height = "";
    };
  }, [showKeyBar]);

  return (
    <div
      ref={rootRef}
      style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg)" }}
    >
      {/* header */}
      <div
        style={{
          height: 38,
          display: "flex",
          alignItems: "center",
          padding: "0 14px",
          gap: 10,
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontWeight: 700,
            color: "var(--accent)",
            letterSpacing: "-0.02em",
            fontFamily: "var(--font-mono)",
          }}
        >
          hearth
        </span>
        <span style={{ color: "var(--text-muted)", fontSize: 12, fontFamily: "var(--font-mono)" }}>
          {SESSION_ID}
        </span>
        <span style={{ marginLeft: "auto", color: "var(--text-muted)", fontSize: 11 }}>
          your computer, in the browser
        </span>
      </div>

      {/* terminal fills the rest */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex" }}>
        <Terminal ptySocket={pty} modifiersRef={modifiersRef} onConsumeModifiers={clearMods} />
      </div>

      {/* mobile key bar */}
      {showKeyBar && (
        <KeyBar pty={pty} mods={mods} onToggleCtrl={toggleCtrl} onToggleAlt={toggleAlt} />
      )}
    </div>
  );
}
