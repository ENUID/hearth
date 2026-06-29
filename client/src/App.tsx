import { useCallback, useEffect, useRef, useState } from "react";
import TerminalTab from "./components/TerminalTab";
import KeyBar from "./components/KeyBar";
import Login from "./components/Login";
import MachinePanel from "./components/MachinePanel";
import SettingsPanel from "./components/SettingsPanel";
import CommandPalette, { type Command } from "./components/CommandPalette";
import type { PtySocket } from "./hooks/usePtySocket";
import { getConfig, getToken, uploadFile, downloadUrl, getMachine, killSession } from "./lib/api";
import { useSettings, setSettings } from "./lib/settings";

type Mods = { ctrl: boolean; alt: boolean };
type Tab = { id: string; title: string };
type Workspace = { id: string; name: string };
type WsState = { tabs: Tab[]; active: string };

function detectTouch(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(pointer: coarse)").matches || "ontouchstart" in window || window.innerWidth < 820;
}

const DEFAULT_WS: Workspace = { id: "workspace", name: "main" };
const freshWsState = (): WsState => ({ tabs: [{ id: "1", title: "1" }], active: "1" });

function load<T>(key: string, fallback: T): T {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "null");
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

export default function App() {
  const settings = useSettings();

  // --- auth ---
  const [authResolved, setAuthResolved] = useState(false);
  const [needsLogin, setNeedsLogin] = useState(false);
  useEffect(() => {
    getConfig().then((c) => setNeedsLogin(c.authRequired && !getToken())).catch(() => {}).finally(() => setAuthResolved(true));
  }, []);

  // --- workspaces (Phase 3) ---
  const [workspaces, setWorkspaces] = useState<Workspace[]>(() => {
    const w = load<Workspace[]>("hearth_workspaces", [DEFAULT_WS]);
    return Array.isArray(w) && w.length ? w : [DEFAULT_WS];
  });
  const [activeWs, setActiveWs] = useState<string>(() => localStorage.getItem("hearth_active_ws") || workspaces[0].id);
  const [tabsByWs, setTabsByWs] = useState<Record<string, WsState>>(() => {
    const t = load<Record<string, WsState>>("hearth_tabs_v2", {});
    if (!t[activeWs]) t[activeWs] = freshWsState();
    return t;
  });

  useEffect(() => localStorage.setItem("hearth_workspaces", JSON.stringify(workspaces)), [workspaces]);
  useEffect(() => localStorage.setItem("hearth_active_ws", activeWs), [activeWs]);
  useEffect(() => localStorage.setItem("hearth_tabs_v2", JSON.stringify(tabsByWs)), [tabsByWs]);
  useEffect(() => {
    // Ensure the active workspace always has a tab state.
    setTabsByWs((prev) => (prev[activeWs] ? prev : { ...prev, [activeWs]: freshWsState() }));
  }, [activeWs]);

  const cur = tabsByWs[activeWs] ?? freshWsState();
  const activeSid = `${activeWs}__${cur.active}`;
  const activeSidRef = useRef(activeSid);
  useEffect(() => {
    activeSidRef.current = activeSid;
  }, [activeSid]);

  const setCur = useCallback(
    (fn: (s: WsState) => WsState) =>
      setTabsByWs((prev) => ({ ...prev, [activeWs]: fn(prev[activeWs] ?? freshWsState()) })),
    [activeWs]
  );

  const ptys = useRef(new Map<string, PtySocket>());
  const register = useCallback((sid: string, pty: PtySocket | null) => {
    if (pty) ptys.current.set(sid, pty);
    else ptys.current.delete(sid);
  }, []);
  const sendToActive = useCallback((data: string) => {
    ptys.current.get(activeSidRef.current)?.send(data);
  }, []);

  // tab ops (within the active workspace)
  const newTab = useCallback(() => {
    setCur((s) => {
      const id = "t" + Date.now().toString(36);
      return { tabs: [...s.tabs, { id, title: String(s.tabs.length + 1) }], active: id };
    });
  }, [setCur]);
  const selectTab = useCallback((id: string) => setCur((s) => ({ ...s, active: id })), [setCur]);
  const closeTab = useCallback(
    (id: string) => {
      killSession(`${activeWs}__${id}`);
      setCur((s) => {
        const idx = s.tabs.findIndex((t) => t.id === id);
        let tabs = s.tabs.filter((t) => t.id !== id);
        if (tabs.length === 0) tabs = [{ id: "1", title: "1" }];
        const active = s.active === id ? (tabs[Math.max(0, idx - 1)] ?? tabs[0]).id : s.active;
        return { tabs, active };
      });
    },
    [activeWs, setCur]
  );

  // workspace ops
  const newWorkspace = useCallback(() => {
    const id = "ws-" + Date.now().toString(36);
    setWorkspaces((prev) => {
      const name = "ws " + (prev.length + 1);
      return [...prev, { id, name }];
    });
    setTabsByWs((prev) => ({ ...prev, [id]: freshWsState() }));
    setActiveWs(id);
    setWsMenu(false);
  }, []);
  const closeWorkspace = useCallback(
    (id: string) => {
      const ws = tabsByWs[id];
      ws?.tabs.forEach((t) => killSession(`${id}__${t.id}`));
      setWorkspaces((prev) => {
        let next = prev.filter((w) => w.id !== id);
        if (next.length === 0) next = [DEFAULT_WS];
        if (activeWs === id) setActiveWs(next[0].id);
        return next;
      });
      setTabsByWs((prev) => {
        const n = { ...prev };
        delete n[id];
        return n;
      });
    },
    [activeWs, tabsByWs]
  );

  // --- modifiers ---
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
    if (!vv) return;
    // Only pin the height while the on-screen keyboard is open (so the key bar
    // stays visible). Otherwise let CSS 100dvh fill the screen — no bottom gap.
    const onVV = () => {
      if (!rootRef.current) return;
      const keyboardOpen = window.innerHeight - vv.height > 80;
      rootRef.current.style.height = keyboardOpen ? `${vv.height}px` : "";
    };
    vv.addEventListener("resize", onVV);
    vv.addEventListener("scroll", onVV);
    onVV();
    return () => {
      vv.removeEventListener("resize", onVV);
      vv.removeEventListener("scroll", onVV);
      if (rootRef.current) rootRef.current.style.height = "";
    };
  }, []);

  // --- machine status (per active workspace) ---
  const [machineOpen, setMachineOpen] = useState(false);
  const [machineState, setMachineState] = useState<string>("");
  useEffect(() => {
    let stop = false;
    setMachineState("");
    const poll = () => getMachine(activeWs).then((s) => !stop && setMachineState(s.machine?.state ?? "")).catch(() => {});
    poll();
    const t = setInterval(poll, 8000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [activeWs]);

  // --- file transfer ---
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState("");
  const uploadFiles = useCallback(async (files: FileList | File[]) => {
    for (const f of Array.from(files)) {
      setStatus(`uploading ${f.name}…`);
      const r: { ok?: boolean; error?: string } = await uploadFile(activeSidRef.current, f).catch(() => ({ error: "failed" }));
      setStatus(r.ok ? `uploaded ${f.name}` : `upload failed: ${r.error ?? ""}`);
    }
    setTimeout(() => setStatus(""), 4000);
  }, []);
  const download = useCallback(() => {
    const p = window.prompt("Download which file? (path relative to the current directory)");
    if (!p) return;
    const a = document.createElement("a");
    a.href = downloadUrl(activeSidRef.current, p);
    a.download = "";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, []);

  // --- palette / panels ---
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [wsMenu, setWsMenu] = useState(false);
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
    { id: "close-tab", title: "Close current tab", hint: "tabs", run: () => closeTab((tabsByWs[activeWs] ?? cur).active) },
    { id: "new-ws", title: "New workspace", hint: "workspace", run: newWorkspace },
    { id: "machine", title: "Machine: size, GPU, usage", hint: "machine", run: () => setMachineOpen(true) },
    { id: "settings", title: "Settings", hint: "app", run: () => setSettingsOpen(true) },
    { id: "theme", title: `Theme: ${settings.theme} → next`, hint: "app", run: cycleTheme },
    { id: "upload", title: "Upload file…", hint: "files", run: () => fileInputRef.current?.click() },
    { id: "download", title: "Download file…", hint: "files", run: download },
  ];

  if (!authResolved) return null;
  if (needsLogin) return <Login onAuthed={() => setNeedsLogin(false)} />;

  const activeWsName = workspaces.find((w) => w.id === activeWs)?.name ?? activeWs;

  return (
    <div ref={rootRef} style={{ height: "100dvh", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      <div style={headerStyle}>
        <span style={{ fontWeight: 600, color: "var(--fg)", letterSpacing: "-0.01em", fontFamily: "var(--font-mono)", fontSize: 13 }}>hearth</span>

        {/* workspace switcher */}
        <div style={{ position: "relative", marginLeft: 8 }}>
          <button onClick={() => setWsMenu((o) => !o)} title="workspace" style={{ ...ghostBtn, display: "flex", gap: 5, alignItems: "center", fontFamily: "var(--font-mono)" }}>
            <span style={{ color: "var(--fg)" }}>{activeWsName}</span>
            <span style={{ color: "var(--fg-subtle)", fontSize: 10 }}>▾</span>
          </button>
          {wsMenu && (
            <>
              <div onClick={() => setWsMenu(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
              <div style={wsMenuStyle} className="hearth-fade">
                {workspaces.map((w) => (
                  <div key={w.id} style={{ display: "flex", alignItems: "center" }}>
                    <button
                      onClick={() => {
                        setActiveWs(w.id);
                        setWsMenu(false);
                      }}
                      style={{ ...wsItem, color: w.id === activeWs ? "var(--fg)" : "var(--fg-muted)", background: w.id === activeWs ? "var(--accent-soft)" : "transparent" }}
                    >
                      {w.name}
                    </button>
                    {workspaces.length > 1 && (
                      <span onClick={() => closeWorkspace(w.id)} title="delete workspace" style={{ color: "var(--fg-subtle)", cursor: "pointer", padding: "0 8px", fontSize: 13 }}>×</span>
                    )}
                  </div>
                ))}
                <button onClick={newWorkspace} style={{ ...wsItem, color: "var(--fg-muted)", borderTop: "1px solid var(--border)", marginTop: 4, paddingTop: 8 }}>＋ new workspace</button>
              </div>
            </>
          )}
        </div>

        <div style={{ width: 1, height: 16, background: "var(--border)", margin: "0 8px" }} />

        {/* tabs for the active workspace */}
        <div style={{ display: "flex", alignItems: "center", gap: 2, overflowX: "auto", flex: 1 }}>
          {cur.tabs.map((t) => (
            <button key={t.id} onClick={() => selectTab(t.id)} style={{ ...tabChip, color: t.id === cur.active ? "var(--fg)" : "var(--fg-subtle)", background: t.id === cur.active ? "var(--accent-soft)" : "transparent" }}>
              {t.title}
              <span onClick={(e) => { e.stopPropagation(); closeTab(t.id); }} title="close tab" style={{ opacity: 0.5, fontSize: 13, lineHeight: 1 }}>×</span>
            </button>
          ))}
          <button onClick={newTab} title="new tab" style={{ ...ghostBtn, fontSize: 15, padding: "2px 7px" }}>+</button>
        </div>

        {status && <span style={{ color: "var(--fg-muted)", fontSize: 11, marginRight: 8 }}>{status}</span>}
        <button onClick={() => setMachineOpen(true)} title="machine" style={{ ...ghostBtn, display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: MACHINE_STATE_COLOR[machineState] ?? "var(--fg-subtle)", fontSize: 8 }}>●</span>
          <span style={{ color: "var(--fg-muted)" }}>{machineState || "machine"}</span>
        </button>
        <button onClick={() => setSettingsOpen(true)} title="settings" style={{ ...ghostBtn, display: "flex", alignItems: "center", padding: "4px 6px" }} aria-label="settings">
          <GearIcon />
        </button>

        <input ref={fileInputRef} type="file" multiple hidden onChange={(e) => { if (e.target.files?.length) uploadFiles(e.target.files); e.target.value = ""; }} />
      </div>

      {/* terminals for the active workspace */}
      <div
        style={{ flex: 1, overflow: "hidden", display: "flex", minHeight: 0 }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); if (e.dataTransfer?.files?.length) uploadFiles(e.dataTransfer.files); }}
      >
        {cur.tabs.map((t) => {
          const sid = `${activeWs}__${t.id}`;
          return <TerminalTab key={sid} sid={sid} active={t.id === cur.active} modifiersRef={modifiersRef} onConsumeModifiers={clearMods} register={register} />;
        })}
      </div>

      {showKeyBar && <KeyBar onSend={sendToActive} mods={mods} onToggleCtrl={toggleCtrl} onToggleAlt={toggleAlt} />}
      {machineOpen && <MachinePanel ws={activeWs} onClose={() => setMachineOpen(false)} />}
      {settingsOpen && <SettingsPanel commands={commands} onClose={() => setSettingsOpen(false)} />}
      {paletteOpen && <CommandPalette commands={commands} onClose={() => setPaletteOpen(false)} />}
    </div>
  );
}

function GearIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
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
const wsMenuStyle: React.CSSProperties = {
  position: "absolute",
  top: 30,
  left: 0,
  zIndex: 41,
  minWidth: 180,
  background: "var(--bg-elevated)",
  border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius)",
  boxShadow: "0 16px 40px rgba(0,0,0,0.3)",
  padding: 6,
};
const wsItem: React.CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  background: "transparent",
  border: "none",
  borderRadius: "var(--radius-sm)",
  color: "var(--fg)",
  cursor: "pointer",
  fontSize: 13,
  fontFamily: "var(--font-mono)",
  padding: "7px 10px",
};
