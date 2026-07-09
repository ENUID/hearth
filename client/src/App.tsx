import { useCallback, useEffect, useRef, useState } from "react";
import TerminalTab from "./components/TerminalTab";
import KeyBar from "./components/KeyBar";
import CommandBar from "./components/CommandBar";
import HearthMark from "./components/HearthMark";
import Sidebar from "./components/Sidebar";
import Login from "./components/Login";
import MachinePanel from "./components/MachinePanel";
import SettingsPanel from "./components/SettingsPanel";
import ModelsPanel from "./components/ModelsPanel";
import AgentsPanel from "./components/AgentsPanel";
import Welcome from "./components/Welcome";
import TeamsPanel from "./components/TeamsPanel";
import BillingPanel from "./components/BillingPanel";
import CommandPalette, { type Command } from "./components/CommandPalette";
import type { PtySocket } from "./hooks/usePtySocket";
import type { TermHandle } from "./components/Terminal";
import { getConfig, getToken, uploadFile, downloadUrl, getMachine, getModels, killSession, getMe, logout, getScope, setScope, getTeams, signOutEverywhere, changePassword, type Team } from "./lib/api";
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
  const [multiUser, setMultiUser] = useState(false);
  const [me, setMe] = useState<string | null>(null);
  const [instance, setInstance] = useState<{ name: string; signupsOpen: boolean }>({ name: "Hearth", signupsOpen: true });
  useEffect(() => {
    getConfig()
      .then((c) => {
        setMultiUser(c.multiUser);
        setInstance({ name: c.instanceName ?? "Hearth", signupsOpen: c.signupsOpen ?? true });
        setNeedsLogin(c.authRequired && !getToken());
        if (c.multiUser && getToken()) getMe().then((m) => setMe(m.user?.username ?? null)).catch(() => {});
      })
      .catch(() => {})
      .finally(() => setAuthResolved(true));
  }, []);
  const onAuthed = useCallback(() => {
    setNeedsLogin(false);
    getMe().then((m) => setMe(m.user?.username ?? null)).catch(() => {});
  }, []);
  const signOut = useCallback(() => {
    logout();
    window.location.reload();
  }, []);
  const signOutAll = useCallback(async () => {
    await signOutEverywhere().catch(() => {});
    logout();
    window.location.reload();
  }, []);
  const doChangePassword = useCallback(async () => {
    const current = window.prompt("Current password");
    if (!current) return;
    const next = window.prompt("New password (6+ characters)");
    if (!next) return;
    try {
      await changePassword(current, next);
      window.alert("Password changed. Other devices have been signed out.");
    } catch (e) {
      window.alert((e as Error).message);
    }
  }, []);

  // --- teams / scope (multi-user) ---
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamsOpen, setTeamsOpen] = useState(false);
  const [billingOpen, setBillingOpen] = useState(false);
  const scope = getScope();
  const loadTeams = useCallback(() => {
    getTeams().then((r) => setTeams(r.teams)).catch(() => {});
  }, []);
  useEffect(() => {
    if (multiUser && me) loadTeams();
  }, [multiUser, me, loadTeams]);
  const switchScope = useCallback((s: string) => {
    setScope(s);
    window.location.reload();
  }, []);
  const scopeLabel = scope === "me" ? "Personal" : teams.find((t) => `team:${t.id}` === scope)?.name ?? "Team";

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

  // Terminal display handles (per sid) — the AI prompt writes its replies into
  // the active terminal's scrollback and reads the screen for context.
  const terms = useRef(new Map<string, TermHandle>());
  const registerTerm = useCallback((sid: string, h: TermHandle | null) => {
    if (h) terms.current.set(sid, h);
    else terms.current.delete(sid);
  }, []);
  const writeToActive = useCallback((text: string) => {
    terms.current.get(activeSidRef.current)?.write(text);
  }, []);
  const readActiveTail = useCallback((lines: number) => {
    return terms.current.get(activeSidRef.current)?.readTail(lines) ?? "";
  }, []);

  // tab ops (within the active workspace). Tab labels are rendered from live
  // position (1..N), so title here is just a stable id-free placeholder.
  const newTab = useCallback(() => {
    setCur((s) => {
      const id = "t" + Date.now().toString(36);
      return { tabs: [...s.tabs, { id, title: "" }], active: id };
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
      // Pin to the keyboard-shrunk viewport only while the keyboard is open;
      // otherwise restore the full dynamic-viewport height. (Setting "" here
      // wiped React's inline height:100dvh, collapsing the app to content
      // height — a gap at the bottom and the composer pushed off the first tab.)
      rootRef.current.style.height = keyboardOpen ? `${vv.height}px` : "100dvh";
    };
    vv.addEventListener("resize", onVV);
    vv.addEventListener("scroll", onVV);
    onVV();
    return () => {
      vv.removeEventListener("resize", onVV);
      vv.removeEventListener("scroll", onVV);
      if (rootRef.current) rootRef.current.style.height = "100dvh";
    };
  }, []);

  // --- machine + running-model status (per active workspace) ---
  const [machineOpen, setMachineOpen] = useState(false);
  const [machineState, setMachineState] = useState<string>("");
  const [runningModel, setRunningModel] = useState<string | null>(null);
  const [modelBackend, setModelBackend] = useState<string>("");
  useEffect(() => {
    let stop = false;
    setMachineState("");
    setRunningModel(null);
    const poll = () => {
      getMachine(activeWs).then((s) => !stop && setMachineState(s.machine?.state ?? "")).catch(() => {});
      getModels(activeWs)
        .then((s) => {
          if (stop) return;
          setRunningModel(s.running && s.running.status !== "stopped" ? s.running.name : null);
          setModelBackend(s.backend);
        })
        .catch(() => {});
    };
    poll();
    const t = setInterval(poll, 8000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [activeWs]);

  // --- file transfer ---
  const [status, setStatus] = useState("");
  const uploadFiles = useCallback(async (files: FileList | File[]): Promise<{ name: string; ok: boolean; path?: string }[]> => {
    const results: { name: string; ok: boolean; path?: string }[] = [];
    for (const f of Array.from(files)) {
      setStatus(`uploading ${f.name}…`);
      const r: { ok?: boolean; path?: string; error?: string } = await uploadFile(activeSidRef.current, f).catch(() => ({ error: "failed" }));
      setStatus(r.ok ? `uploaded ${f.name}` : `upload failed: ${r.error ?? ""}`);
      results.push({ name: f.name, ok: !!r.ok, path: r.path });
    }
    setTimeout(() => setStatus(""), 4000);
    return results;
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
  const [modelsOpen, setModelsOpen] = useState(false);
  const [agentsOpen, setAgentsOpen] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(() => {
    try { return !localStorage.getItem("hearth_onboarded"); } catch { return false; }
  });
  const closeWelcome = useCallback(() => {
    setWelcomeOpen(false);
    try { localStorage.setItem("hearth_onboarded", "1"); } catch { /* ignore */ }
  }, []);
  // --- left sidebar (workspace navigation) ---
  const [isNarrow, setIsNarrow] = useState(() => typeof window !== "undefined" && window.innerWidth < 760);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem("hearth_sidebar");
      if (saved !== null) return saved === "1";
    } catch { /* ignore */ }
    return typeof window !== "undefined" && window.innerWidth >= 760; // open on desktop, closed on phones
  });
  useEffect(() => { try { localStorage.setItem("hearth_sidebar", sidebarOpen ? "1" : "0"); } catch { /* ignore */ } }, [sidebarOpen]);
  useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth < 760);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
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
    { id: "models", title: "Run an open-source model", hint: "ai", run: () => setModelsOpen(true) },
    { id: "agents", title: "Install a CLI agent (Claude Code, Aider…)", hint: "ai", run: () => setAgentsOpen(true) },
    { id: "machine", title: "Machine: size, GPU, usage", hint: "machine", run: () => setMachineOpen(true) },
    { id: "billing", title: "Usage & billing", hint: "billing", run: () => setBillingOpen(true) },
    ...(multiUser ? [{ id: "teams", title: "Teams: shared workspaces", hint: "teams", run: () => setTeamsOpen(true) }] : []),
    { id: "welcome", title: "Show welcome / quick start", hint: "app", run: () => setWelcomeOpen(true) },
    { id: "settings", title: "Settings", hint: "app", run: () => setSettingsOpen(true) },
    { id: "theme", title: `Theme: ${settings.theme} → next`, hint: "app", run: cycleTheme },
    { id: "download", title: "Download file…", hint: "files", run: download },
  ];

  if (!authResolved) return null;
  if (needsLogin) return <Login onAuthed={onAuthed} multiUser={multiUser} instanceName={instance.name} signupsOpen={instance.signupsOpen} />;


  return (
    <div ref={rootRef} style={{ height: "100dvh", display: "flex", flexDirection: "row", background: "var(--bg)" }}>
      {sidebarOpen && (
        <Sidebar
          instanceName={instance.name}
          workspaces={workspaces}
          activeWs={activeWs}
          activeWsMachineState={machineState}
          onSelectWs={(id) => { setActiveWs(id); if (isNarrow) setSidebarOpen(false); }}
          onNewWs={newWorkspace}
          onDeleteWs={closeWorkspace}
          onCollapse={() => setSidebarOpen(false)}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenMachine={() => setMachineOpen(true)}
          multiUser={multiUser}
          me={me}
          scope={scope}
          scopeLabel={scopeLabel}
          teams={teams}
          onSwitchScope={switchScope}
          onManageTeams={() => setTeamsOpen(true)}
          onChangePassword={doChangePassword}
          onSignOutAll={signOutAll}
          onSignOut={signOut}
        />
      )}
      {sidebarOpen && isNarrow && <div onClick={() => setSidebarOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 55 }} />}

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, position: "relative" }}>
      <div className="hearth-glowbar" />
      <div style={headerStyle}>
        <button onClick={() => setSidebarOpen((o) => !o)} title="toggle sidebar" className="hearth-act" style={{ ...ghostBtn, display: "flex", alignItems: "center", padding: "4px 6px" }} aria-label="toggle sidebar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
        </button>
        {!sidebarOpen && (
          <span style={{ display: "flex", alignItems: "center", gap: 7, marginRight: 2 }}>
            <HearthMark size={18} />
            <span style={{ fontWeight: 600, color: "var(--fg)", letterSpacing: "-0.01em", fontFamily: "var(--font-mono)", fontSize: 13 }}>hearth</span>
          </span>
        )}
        <div style={{ width: 1, height: 16, background: "var(--border)", margin: "0 6px" }} />

        {/* tabs for the active workspace */}
        <div style={{ display: "flex", alignItems: "center", gap: 2, overflowX: "auto", flex: 1 }}>
          {cur.tabs.map((t, i) => {
            const isActive = t.id === cur.active;
            return (
              <button key={t.id} onClick={() => selectTab(t.id)} className="hearth-act" style={{ ...tabChip, position: "relative", color: isActive ? "var(--fg)" : "var(--fg-subtle)", background: isActive ? "var(--accent-soft)" : "transparent" }}>
                {/* label is the tab's live position, so removing any tab (even a
                    middle one) renumbers the rest 1..N automatically */}
                {i + 1}
                <span onClick={(e) => { e.stopPropagation(); closeTab(t.id); }} title="close tab" style={{ opacity: 0.5, fontSize: 13, lineHeight: 1 }}>×</span>
                {isActive && <span style={tabGlow} />}
              </button>
            );
          })}
          <button onClick={newTab} title="new tab" className="hearth-act" style={{ ...ghostBtn, fontSize: 15, padding: "2px 7px" }}>+</button>
        </div>

        {status && <span style={{ color: "var(--fg-muted)", fontSize: 11, marginRight: 8 }}>{status}</span>}

        {/* right cluster — the app's controls, grouped as one quiet unit */}
        <div style={rightCluster}>
          <button
            onClick={() => setModelsOpen((o) => !o)}
            title="run an open-source model"
            className="hearth-act" style={{ ...ghostBtn, color: modelsOpen ? "var(--fg)" : "var(--fg-muted)", background: modelsOpen ? "var(--accent-soft)" : "transparent" }}
          >
            ✦ models
          </button>
          <button
            onClick={() => setAgentsOpen((o) => !o)}
            title="install a CLI agent"
            className="hearth-act" style={{ ...ghostBtn, color: agentsOpen ? "var(--fg)" : "var(--fg-muted)", background: agentsOpen ? "var(--accent-soft)" : "transparent" }}
          >
            ◆ agents
          </button>
          <span style={clusterDivider} />
          <button onClick={() => setMachineOpen(true)} title="machine" className="hearth-act" style={{ ...ghostBtn, display: "flex", alignItems: "center", gap: 6 }}>
            {machineState === "waking" || machineState === "provisioning" ? (
              <span className="hearth-spin" style={{ width: 9, height: 9 }} />
            ) : (
              <span className={machineState === "running" ? "hearth-pulse" : undefined} style={{ width: 7, height: 7, borderRadius: 999, background: MACHINE_STATE_COLOR[machineState] ?? "var(--fg-subtle)", display: "inline-block" }} />
            )}
            <span style={{ color: "var(--fg-muted)" }}>{machineState || "machine"}</span>
          </button>
          <button onClick={() => setSettingsOpen(true)} title="settings" className="hearth-act" style={{ ...ghostBtn, display: "flex", alignItems: "center", padding: "4px 6px" }} aria-label="settings">
            <GearIcon />
          </button>
        </div>
      </div>

      {/* one window: terminal + AI conversation + composer, for the active workspace */}
      <div style={{ flex: 1, display: "flex", minHeight: 0, overflow: "hidden" }}>
        <CommandBar
          ws={activeWs}
          machineState={machineState}
          runningModel={runningModel}
          modelBackend={modelBackend}
          onOpenModels={() => setModelsOpen(true)}
          runCmd={sendToActive}
          aiWrite={writeToActive}
          readContext={readActiveTail}
          onAttach={uploadFiles}
        >
          <div
            style={{ flex: 1, overflow: "hidden", display: "flex", minHeight: 0 }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); if (e.dataTransfer?.files?.length) uploadFiles(e.dataTransfer.files); }}
          >
            {cur.tabs.map((t) => {
              const sid = `${activeWs}__${t.id}`;
              return <TerminalTab key={sid} sid={sid} active={t.id === cur.active} modifiersRef={modifiersRef} onConsumeModifiers={clearMods} register={register} registerTerm={registerTerm} />;
            })}
          </div>
        </CommandBar>
        {modelsOpen && <ModelsPanel ws={activeWs} onClose={() => setModelsOpen(false)} />}
        {agentsOpen && (
          <AgentsPanel
            onRun={(cmd) => { sendToActive(cmd); setAgentsOpen(false); }}
            onClose={() => setAgentsOpen(false)}
          />
        )}
      </div>

      {showKeyBar && <KeyBar onSend={sendToActive} mods={mods} onToggleCtrl={toggleCtrl} onToggleAlt={toggleAlt} />}
      </div>{/* end main column */}

      {machineOpen && <MachinePanel ws={activeWs} onClose={() => setMachineOpen(false)} />}
      {settingsOpen && <SettingsPanel commands={commands} onClose={() => setSettingsOpen(false)} />}
      {paletteOpen && <CommandPalette commands={commands} onClose={() => setPaletteOpen(false)} />}
      {welcomeOpen && (
        <Welcome
          onClose={closeWelcome}
          onOpenModels={() => setModelsOpen(true)}
          onOpenAgents={() => setAgentsOpen(true)}
        />
      )}
      {teamsOpen && <TeamsPanel me={me} onClose={() => setTeamsOpen(false)} onSwitchScope={switchScope} />}
      {billingOpen && <BillingPanel onClose={() => setBillingOpen(false)} />}
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
  running: "var(--accent)",
  asleep: "var(--fg-subtle)",
  waking: "var(--fg-muted)",
  provisioning: "var(--fg-muted)",
  error: "var(--danger)",
};

const headerStyle: React.CSSProperties = {
  height: 44,
  display: "flex",
  alignItems: "center",
  padding: "0 14px",
  gap: 4,
  borderBottom: "1px solid var(--border)",
  background: "var(--bg-glass)",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
  flexShrink: 0,
};
/* right-side controls grouped as one quiet unit */
const rightCluster: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 2,
  padding: 3,
  border: "1px solid var(--border)",
  borderRadius: 10,
  background: "color-mix(in srgb, var(--bg-elevated) 55%, transparent)",
};
const clusterDivider: React.CSSProperties = {
  width: 1,
  height: 14,
  background: "var(--border)",
  margin: "0 3px",
};
const tabGlow: React.CSSProperties = {
  position: "absolute",
  left: 6,
  right: 6,
  bottom: 0,
  height: 2,
  borderRadius: 2,
  background: "var(--accent-gradient)",
  boxShadow: "0 0 6px var(--accent-glow)",
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
  padding: "5px 11px",
  borderRadius: "var(--radius-sm)",
  border: "none",
  background: "transparent",
  fontFamily: "var(--font-mono)",
  fontSize: 12,
  cursor: "pointer",
  whiteSpace: "nowrap",
};
