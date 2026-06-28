import { useCallback, useEffect, useRef, useState } from "react";
import TerminalTab from "./components/TerminalTab";
import KeyBar from "./components/KeyBar";
import Login from "./components/Login";
import MachinePanel from "./components/MachinePanel";
import type { PtySocket } from "./hooks/usePtySocket";
import { getConfig, getToken, uploadFile, downloadUrl, getMachine } from "./lib/api";

type Mods = { ctrl: boolean; alt: boolean };
type Tab = { id: string; title: string };

function detectTouch(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(pointer: coarse)").matches ||
    "ontouchstart" in window ||
    window.innerWidth < 820
  );
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
  // --- auth ---
  const [authResolved, setAuthResolved] = useState(false);
  const [needsLogin, setNeedsLogin] = useState(false);
  useEffect(() => {
    getConfig()
      .then((c) => setNeedsLogin(c.authRequired && !getToken()))
      .catch(() => {})
      .finally(() => setAuthResolved(true));
  }, []);

  // --- tabs / sessions ---
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

  function newTab() {
    const id = "s-" + Date.now().toString(36);
    setTabs((prev) => [...prev, { id, title: String(prev.length + 1) }]);
    setActiveId(id);
  }
  function closeTab(id: string) {
    import("./lib/api").then((m) => m.killSession(id));
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === id);
      let next = prev.filter((t) => t.id !== id);
      if (next.length === 0) next = [{ id: "main", title: "1" }];
      if (activeIdRef.current === id) setActiveId((next[Math.max(0, idx - 1)] ?? next[0]).id);
      return next;
    });
  }

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

  // --- machine status (Phase 2 control plane) ---
  const [machineOpen, setMachineOpen] = useState(false);
  const [machineState, setMachineState] = useState<string>("");
  useEffect(() => {
    let stop = false;
    const poll = () =>
      getMachine()
        .then((s) => !stop && setMachineState(s.machine?.state ?? ""))
        .catch(() => {});
    poll();
    const t = setInterval(poll, 8000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, []);

  const [showKeyBar, setShowKeyBar] = useState(detectTouch);
  useEffect(() => {
    const onResize = () => setShowKeyBar(detectTouch());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

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

  // --- file transfer ---
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState("");
  const uploadFiles = useCallback(async (files: FileList | File[]) => {
    for (const f of Array.from(files)) {
      setStatus(`uploading ${f.name}…`);
      const r: { ok?: boolean; path?: string; error?: string } = await uploadFile(
        activeIdRef.current,
        f
      ).catch(() => ({ error: "failed" }));
      setStatus(r.ok ? `uploaded ${f.name} → ${r.path}` : `upload failed: ${r.error ?? ""}`);
    }
    setTimeout(() => setStatus(""), 4000);
  }, []);
  function download() {
    const p = window.prompt("Download which file? (path relative to the current directory)");
    if (!p) return;
    const a = document.createElement("a");
    a.href = downloadUrl(activeIdRef.current, p);
    a.download = "";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  if (!authResolved) return null;
  if (needsLogin) return <Login onAuthed={() => setNeedsLogin(false)} />;

  return (
    <div ref={rootRef} style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      {/* header */}
      <div style={headerStyle}>
        <span style={{ fontWeight: 700, color: "var(--accent)", letterSpacing: "-0.02em", fontFamily: "var(--font-mono)" }}>
          hearth
        </span>

        {/* tabs */}
        <div style={{ display: "flex", gap: 4, marginLeft: 8, overflowX: "auto", flex: 1 }}>
          {tabs.map((t) => (
            <div
              key={t.id}
              onClick={() => setActiveId(t.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "3px 8px",
                borderRadius: "var(--radius)",
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                cursor: "pointer",
                whiteSpace: "nowrap",
                background: t.id === activeId ? "var(--accent-dim)" : "transparent",
                color: t.id === activeId ? "var(--accent)" : "var(--text-muted)",
                border: "1px solid " + (t.id === activeId ? "var(--accent-dim)" : "var(--border)"),
              }}
            >
              {t.title}
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(t.id);
                }}
                style={{ opacity: 0.6, fontSize: 13, lineHeight: 1 }}
                title="close tab"
              >
                ×
              </span>
            </div>
          ))}
          <button onClick={newTab} title="new tab" style={iconBtn}>
            +
          </button>
        </div>

        {/* machine */}
        <button onClick={() => setMachineOpen(true)} title="machine: size, GPU, usage" style={{ ...iconBtn, display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ color: MACHINE_STATE_COLOR[machineState] ?? "var(--text-muted)", fontSize: 9 }}>●</span>
          machine
        </button>

        {/* file transfer */}
        {status && <span style={{ color: "var(--text-muted)", fontSize: 11, marginRight: 8 }}>{status}</span>}
        <button onClick={() => fileInputRef.current?.click()} title="upload file" style={iconBtn}>
          upload
        </button>
        <button onClick={download} title="download file" style={iconBtn}>
          download
        </button>
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

      {/* terminals (drag-drop upload target) */}
      <div
        style={{ flex: 1, overflow: "hidden", display: "flex", minHeight: 0 }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer?.files?.length) uploadFiles(e.dataTransfer.files);
        }}
      >
        {tabs.map((t) => (
          <TerminalTab
            key={t.id}
            sid={t.id}
            active={t.id === activeId}
            modifiersRef={modifiersRef}
            onConsumeModifiers={clearMods}
            register={register}
          />
        ))}
      </div>

      {/* mobile key bar */}
      {showKeyBar && <KeyBar onSend={sendToActive} mods={mods} onToggleCtrl={toggleCtrl} onToggleAlt={toggleAlt} />}

      {/* machine control panel */}
      {machineOpen && <MachinePanel onClose={() => setMachineOpen(false)} />}
    </div>
  );
}

const MACHINE_STATE_COLOR: Record<string, string> = {
  running: "var(--green)",
  asleep: "var(--text-muted)",
  waking: "var(--yellow)",
  provisioning: "var(--yellow)",
  error: "var(--red)",
};

const headerStyle: React.CSSProperties = {
  height: 40,
  display: "flex",
  alignItems: "center",
  padding: "0 12px",
  gap: 6,
  borderBottom: "1px solid var(--border)",
  background: "var(--surface)",
  flexShrink: 0,
};

const iconBtn: React.CSSProperties = {
  background: "var(--bg)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  color: "var(--text-muted)",
  cursor: "pointer",
  fontSize: 12,
  fontFamily: "var(--font-mono)",
  padding: "3px 8px",
  whiteSpace: "nowrap",
};
