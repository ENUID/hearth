import { useCallback, useEffect, useState } from "react";
import {
  getMachine,
  resizeMachine,
  provisionGpu,
  releaseGpu,
  sleepMachine,
  wakeMachine,
  chargeNow,
  type MachineSnapshot,
} from "../lib/api";

const usd = (cents: number) => "$" + (cents / 100).toFixed(cents < 100 ? 4 : 2);

const stateColor: Record<string, string> = {
  running: "var(--fg)",
  asleep: "var(--fg-subtle)",
  waking: "var(--fg-muted)",
  provisioning: "var(--fg-muted)",
  error: "var(--danger)",
};

export default function MachinePanel({ onClose }: { onClose: () => void }) {
  const [snap, setSnap] = useState<MachineSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const refresh = useCallback(async () => {
    try {
      setSnap(await getMachine());
    } catch (e) {
      setMsg((e as Error).message);
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [refresh]);

  const act = async (fn: () => Promise<MachineSnapshot>, label: string) => {
    setBusy(true);
    setMsg(label);
    try {
      setSnap(await fn());
      setMsg("");
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const m = snap?.machine;
  const gpu = m?.gpu;
  const gpuActive = gpu && (gpu.state === "attached" || gpu.state === "provisioning");

  return (
    <div onClick={onClose} style={overlay}>
      <div onClick={(e) => e.stopPropagation()} style={drawer}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontFamily: "var(--font-mono)", color: "var(--fg)" }}>machine</h2>
          <button onClick={onClose} style={{ ...btn, marginLeft: "auto" }} tabIndex={-1}>✕</button>
        </div>

        {!snap ? (
          <div style={{ color: "var(--fg-muted)" }}>loading…</div>
        ) : (
          <>
            {/* state */}
            <div style={row}>
              <span style={label}>status</span>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: stateColor[m!.state] ?? "var(--fg-muted)", fontSize: 9 }}>●</span>
                {m!.state}
              </span>
            </div>
            <div style={row}>
              <span style={label}>resources</span>
              <span>{m!.resources.cpu} vCPU · {Math.round(m!.resources.memoryMb / 1024)} GB</span>
            </div>

            {/* tiers */}
            <div style={section}>tier</div>
            <div style={{ display: "flex", gap: 6 }}>
              {Object.entries(snap.tiers).map(([key, t]) => (
                <button
                  key={key}
                  disabled={busy}
                  onClick={() => act(() => resizeMachine(key), `resizing to ${t.label}…`)}
                  style={{ ...chip, flex: 1, ...(m!.tier === key ? activeChip : {}) }}
                >
                  <div style={{ fontWeight: 600 }}>{t.label}</div>
                  <div style={{ fontSize: 10, opacity: 0.8 }}>{t.resources.cpu} CPU</div>
                  <div style={{ fontSize: 10, opacity: 0.8 }}>{t.hourlyCents === 0 ? "free" : usd(t.hourlyCents) + "/hr"}</div>
                </button>
              ))}
            </div>

            {/* GPU */}
            <div style={section}>gpu</div>
            {gpuActive ? (
              <div>
                <div style={row}>
                  <span style={label}>{gpu!.spec.label}</span>
                  <span>{gpu!.state === "provisioning" ? "provisioning…" : `${gpu!.spec.vramGb} GB · ${usd(gpu!.spec.hourlyCents)}/hr`}</span>
                </div>
                <button disabled={busy} onClick={() => act(releaseGpu, "releasing GPU…")} style={{ ...btn, width: "100%", marginTop: 6 }}>
                  release GPU
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 6 }}>
                {Object.entries(snap.gpuCatalog).map(([key, g]) => (
                  <button key={key} disabled={busy} onClick={() => act(() => provisionGpu(key), `provisioning ${g.label}…`)} style={{ ...chip, flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{g.type.toUpperCase()}</div>
                    <div style={{ fontSize: 10, opacity: 0.8 }}>{g.vramGb} GB</div>
                    <div style={{ fontSize: 10, opacity: 0.8 }}>{usd(g.hourlyCents)}/hr</div>
                  </button>
                ))}
              </div>
            )}

            {/* usage */}
            <div style={section}>usage this session</div>
            <div style={row}><span style={label}>compute</span><span>{snap.usage.machineMinutes.toFixed(2)} min · {usd(snap.usage.machineCents)}</span></div>
            <div style={row}><span style={label}>gpu</span><span>{snap.usage.gpuMinutes.toFixed(2)} min · {usd(snap.usage.gpuCents)}</span></div>
            <div style={{ ...row, borderTop: "1px solid var(--border)", paddingTop: 8, marginTop: 4, fontWeight: 600 }}>
              <span style={label}>total</span><span>{usd(snap.usage.totalCents)}</span>
            </div>

            {/* actions */}
            <div style={{ display: "flex", gap: 6, marginTop: 16 }}>
              {m!.state === "asleep" ? (
                <button disabled={busy} onClick={() => act(wakeMachine, "waking…")} style={{ ...btn, flex: 1 }}>wake</button>
              ) : (
                <button disabled={busy} onClick={() => act(sleepMachine, "sleeping…")} style={{ ...btn, flex: 1 }}>sleep now</button>
              )}
              <button
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const r = await chargeNow();
                    setMsg(`charge ${r.result.status} (${r.result.provider}) ${usd(r.result.amountCents)}`);
                  } catch (e) {
                    setMsg((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
                style={{ ...btn, flex: 1 }}
              >
                pay now
              </button>
            </div>

            <div style={{ marginTop: 12, fontSize: 11, color: "var(--fg-muted)" }}>
              provider: {snap.provider} · billing: {snap.billing.name}{snap.billing.live ? " (live)" : ""}
            </div>
            {msg && <div style={{ marginTop: 8, fontSize: 12, color: "var(--accent)" }}>{msg}</div>}
          </>
        )}
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.5)",
  display: "flex",
  justifyContent: "flex-end",
  zIndex: 50,
};
const drawer: React.CSSProperties = {
  width: 340,
  maxWidth: "90vw",
  height: "100%",
  background: "var(--bg-elevated)",
  borderLeft: "1px solid var(--border)",
  padding: 20,
  overflowY: "auto",
  color: "var(--fg)",
  fontSize: 13,
};
const row: React.CSSProperties = { display: "flex", justifyContent: "space-between", padding: "4px 0" };
const label: React.CSSProperties = { color: "var(--fg-muted)" };
const section: React.CSSProperties = { marginTop: 18, marginBottom: 8, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--fg-muted)", fontFamily: "var(--font-mono)" };
const btn: React.CSSProperties = { background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "var(--radius)", color: "var(--fg)", cursor: "pointer", fontSize: 12, padding: "8px 10px" };
const chip: React.CSSProperties = { background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "var(--radius)", color: "var(--fg)", cursor: "pointer", padding: "8px 6px", textAlign: "center" };
const activeChip: React.CSSProperties = { border: "1px solid var(--accent)", background: "var(--accent-soft)", color: "var(--accent)" };
