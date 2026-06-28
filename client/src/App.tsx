import { useCallback, useEffect, useRef, useState } from "react";
import TerminalTab from "./components/TerminalTab";
import KeyBar from "./components/KeyBar";
import Login from "./components/Login";
import MachinePanel from "./components/MachinePanel";
import SettingsPanel from "./components/SettingsPanel";
import CommandPalette, { type Command } from "./components/CommandPalette";
import type { PtySocket } from "./hooks/usePtySocket";
import { getConfig, getToken, uploadFile, downloadUrl, getMachine } from "./lib/api";
import { useSettings, setSettings } from "./lib/settings";

type Mods = { ctrl: boolean; alt: boolean };
type Tab = { id: string; title: string };

function detectTouch(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(pointer: coarse)").matches || "ontouchstart" in window || window.innerWidth < 820;
}

function loadTabs(): Tab[] {
  try {
    const t = JSON.parse(localStorage.getItem("hearth_tabs") ?? "[]");
    if (Array.isArray(t) && t.length) return t;
  } catch {
    /* ignore */
  }
  return [{ id: "main", title: "1" }];
}

export default function App() {
  const settings = useSettings();

  // --- auth ---
  const [authResolved, setAuthResolved] = useState(false);
  const [needsLogin, setNeedsLogin] = useState(false);
  useEffect(() => {
    getConfig().then((c) => setNeedsLogin(c.authRequired && !getToken())).catch(() => {}).finally(() => setAuthResolved(true));
  }, []);

  // --- tabs ---
  const [tabs, setTabs] = useState<Tab[]>(loadTabs);
  const [activeId, setActiveId] = useState<string>(() => localStorage.getItem("hearth_active") || loadTabs()[0].id);
  const activeIdRef = useRef(activeId);
  useEffect(() => {
    activeIdRef.current = activeId;
    localStorage.setItem("hearth_active", activeId);
  }, [activeId]);
  useEffect(() => {
    localStorage.setItem("hearth_tabs", JSON.stringify(tabs));
  }, [tabs]);
  useEffect(() => {
    if (!tabs.find((t) => t.id === activeId)) setActiveId(tabs[0].id);
  }, [tabs, activeId]);

  const ptys = useRef(new Map<string, PtySocket>());
  const register = useCallback((sid: string, pty: PtySocket | null) => {
    if (pty) ptys.current.set(sid, pty);
    else ptys.current.delete(sid);
  }, []);
  const sendToActive = useCallback((data: string) => {
    ptys.current.get(activeIdRef.current)?.send(data);
  }, []);

  const newTab = useCallback(() => {
    const id = "s-" + Date.now().toString(36);
    setTabs((prev) => [...prev, { id, title: String(prev.length + 1) }]);
    setActiveId(id);
  }, []);
  const closeTab = useCallback((id: string) => {
    import("./lib/api").then((m) => m.killSession(id));
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === id);
      let next = prev.filter((t) => t.id !== id);
      if (next.length === 0) next = [{ id: "main", title: "1" }];
      if (activeIdRef.current === id) setActiveId((next[Math.max(0, idx - 1)] ?? next[0]).id);
      return next;
    });
  }, []);
  const cycleTab = useCallback((dir: 1 | -1) => {
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === activeIdRef.current);
      const next = prev[(idx + dir + prev.length) % prev.length];
      if (next) setActiveId(next.id);
      return prev;
    });
  }, []);

  // --- modifiers (mobile key bar) ---
  const modifiersRef = useRef<Mods>({ ctrl: false, alt: false });
  const [mods, setMods] = useState<Mods>({ ctrl: false, alt: false });
  const apply = useCallback((next: Mods) => {
    modifiersRef.current = next;
    setMods(next);
  }, []);
  const toggleCtrl = useCallback(() => apply({ ctrl: !modifiersRef.current.ctrl, alt: modifiersRef.current.alt }), [apply]);
  const toggleAlt = useCallback(() => apply({ ctrl: modifiersRef.current.ctrl, alt: !modifiersRef.current.alt }), [apply]);
  const clearMods = useCallback(() => apply({ ctrl: false, alt: false }), [apply]);

  const showKeyBar = settings.keyBar === "on" || (settings.keyBar === "auto" && detectTouch());

  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv || !showKeyBar) return;
    const onVV = () => {
      if (rootRef.current) rootRef.current.style.height = `${vv.height}px`;
    };
    vv.addEventListener("resize", onVV);
    onVV();
    return () => {
      vv.removeEventListener("resize", onVV);
      if (rootRef.current) rootRef.current.style.height = "";
    };
  }, [showKeyBar]);

  // --- machine status ---
  const [machineOpen, setMachineOpen] = useState(false);
  const [machineState, setMachineState] = useState<string>("");
  useEffect(() => {
    let stop = false;
    const poll = () => getMachine().then((s) => !stop && setMachineState(s.machine?.state ?? "")).catch(() => {});
    poll();
    const t = setInterval(poll, 8000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, []);

  // --- file transfer ---
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState("");
  const uploadFiles = useCallback(async (files: FileList | File[]) => {
    for (const f of Array.from(files)) {
      setStatus(`uploading ${f.name}…`);
      const r: { ok?: boolean; path?: string; error?: string } = await uploadFile(activeIdRef.current, f).catch(() => ({ error: "failed" }));
      setStatus(r.ok ? `uploaded ${f.name}` : `upload failed: ${r.error ?? ""}`);
    }
    setTimeout(() => setStatus(""), 4000);
  }, []);
  const download = useCallback(() => {
    const p = window.prompt("Download which file? (path relative to the current directory)");
    if (!p) return;
    const a = document.createElement("a");
    a.href = downloadUrl(activeIdRef.current, p);
    a.download = "";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, []);

  // --- command palette ---
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const cycleTheme = useCallback(() => {
    const order = ["system", "light", "dark"] as const;
    setSettings({ theme: order[(order.indexOf(settings.theme) + 1) % order.length] });
  }, [settings.theme]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const commands: Command[] = [
    { id: "new-tab", title: "New tab", hint: "tabs", run: newTab },
    { id: "close-tab", title: "Close current tab", hint: "tabs", run: () => closeTab(activeIdRef.current) },
    { id: "next-tab", title: "Next tab", hint: "tabs", run: () => cycleTab(1) },
    { id: "prev-tab", title: "Previous tab", hint: "tabs", run: () => cycleTab(-1) },
    { id: "machine", title: "Machine: size, GPU, usage", hint: "machine", run: () => setMachineOpen(true) },
    { id: "settings", title: "Settings", hint: "app", run: () => setSettingsOpen(true) },
    { id: "theme", title: `Theme: ${settings.theme} → next`, hint: "app", run: cycleTheme },
    { id: "upload", title: "Upload file…", hint: "files", run: () => fileInputRef.current?.click() },
    { id: "download", title: "Download file…", hint: "files", run: download },
  ];

  if (!authResolved) return null;
  if (needsLogin) return <Login onAuthed={() => setNeedsLogin(false)} />;

  return (
    <div ref={rootRef} style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      {/* header */}
      <div style={headerStyle}>
        <span style={{ fontWeight: 600, color: "var(--fg)", letterSpacing: "-0.01em", fontFamily: "var(--font-mono)", fontSize: 13 }}>
          hearth
        </span>

        <div style={{ width: 1, height: 16, background: "var(--border)", margin: "0 10px" }} />

        {/* tabs */}
        <div style={{ display: "flex", alignItems: "center", gap: 2, overflowX: "auto", flex: 1 }}>
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveId(t.id)}
              style={{
                ...tabChip,
                color: t.id === activeId ? "var(--fg)" : "var(--fg-subtle)",
                background: t.id === activeId ? "var(--accent-soft)" : "transparent",
              }}
            >
              {t.title}
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(t.id);
                }}
                title="close tab"
                style={{ opacity: 0.5, fontSize: 13, lineHeight: 1 }}
              >
                ×
              </span>
            </button>
          ))}
          <button onClick={newTab} title="new tab" style={{ ...ghostBtn, fontSize: 15, padding: "2px 7px" }}>+</button>
        </div>

        {status && <span style={{ color: "var(--fg-muted)", fontSize: 11, marginRight: 8 }}>{status}</span>}

        {/* machine status */}
        <button onClick={() => setMachineOpen(true)} title="machine" style={{ ...ghostBtn, display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: MACHINE_STATE_COLOR[machineState] ?? "var(--fg-subtle)", fontSize: 8 }}>●</span>
          <span style={{ color: "var(--fg-muted)" }}>{machineState || "machine"}</span>
        </button>

        {/* command palette hint */}
        <button onClick={() => setPaletteOpen(true)} title="command palette (⌘K)" style={{ ...ghostBtn, fontFamily: "var(--font-mono)", color: "var(--fg-subtle)" }}>
          ⌘K
        </button>

        {/* settings */}
        <button onClick={() => setSettingsOpen(true)} title="settings" style={ghostBtn}>⚙</button>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) uploadFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {/* terminals */}
      <div
        style={{ flex: 1, overflow: "hidden", display: "flex", minHeight: 0 }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer?.files?.length) uploadFiles(e.dataTransfer.files);
        }}
      >
        {tabs.map((t) => (
          <TerminalTab key={t.id} sid={t.id} active={t.id === activeId} modifiersRef={modifiersRef} onConsumeModifiers={clearMods} register={register} />
        ))}
      </div>

      {showKeyBar && <KeyBar onSend={sendToActive} mods={mods} onToggleCtrl={toggleCtrl} onToggleAlt={toggleAlt} />}

      {machineOpen && <MachinePanel onClose={() => setMachineOpen(false)} />}
      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
      {paletteOpen && <CommandPalette commands={commands} onClose={() => setPaletteOpen(false)} />}
    </div>
  );
}

const MACHINE_STATE_COLOR: Record<string, string> = {
  running: "var(--fg)",
  asleep: "var(--fg-subtle)",
  waking: "var(--fg-muted)",
  provisioning: "var(--fg-muted)",
  error: "var(--danger)",
};

const headerStyle: React.CSSProperties = {
  height: 40,
  display: "flex",
  alignItems: "center",
  padding: "0 12px",
  gap: 4,
  borderBottom: "1px solid var(--border)",
  background: "var(--bg-elevated)",
  flexShrink: 0,
};

const ghostBtn: React.CSSProperties = {
  background: "transparent",
  border: "none",
  borderRadius: "var(--radius-sm)",
  color: "var(--fg-muted)",
  cursor: "pointer",
  fontSize: 12,
  padding: "4px 8px",
  whiteSpace: "nowrap",
};

const tabChip: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "3px 10px",
  borderRadius: "var(--radius-sm)",
  border: "none",
  background: "transparent",
  fontFamily: "var(--font-mono)",
  fontSize: 12,
  cursor: "pointer",
  whiteSpace: "nowrap",
};
