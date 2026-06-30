import { useCallback, useEffect, useState } from "react";
import { getBillingSummary, chargeNow, type BillingSummary } from "../lib/api";

const usd = (cents: number) => "$" + (cents / 100).toFixed(cents < 100 ? 4 : 2);

// Account-wide usage + billing across all of the caller's workspaces (or the
// active team's). Surfaces the metering the control plane already collects.
export default function BillingPanel({ onClose }: { onClose: () => void }) {
  const [sum, setSum] = useState<BillingSummary | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    getBillingSummary().then(setSum).catch((e) => setMsg((e as Error).message));
  }, []);
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [refresh]);

  async function pay() {
    setBusy(true);
    setMsg("");
    try {
      const r = await chargeNow();
      setMsg(`charge ${r.result.status} · ${r.result.provider} · ${usd(r.result.amountCents)}`);
      refresh();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={sheet} className="hearth-fade" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: "var(--fg)" }}>usage &amp; billing</span>
          <button onClick={onClose} style={closeBtn} aria-label="close" tabIndex={-1}>✕</button>
        </div>

        {!sum ? (
          <div style={{ color: "var(--fg-muted)", padding: 12 }}>{msg || "loading…"}</div>
        ) : (
          <>
            <div style={{ fontSize: 12, color: "var(--fg-muted)", marginBottom: 14 }}>
              Across {sum.workspaces.length} workspace{sum.workspaces.length === 1 ? "" : "s"} ·{" "}
              billing: {sum.billing.name}{sum.billing.live ? " (live)" : " (simulated)"}
            </div>

            {/* big total */}
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14 }}>
              <span style={{ fontSize: 34, fontWeight: 650, color: "var(--fg)", letterSpacing: "-0.02em" }}>{usd(sum.total.totalCents)}</span>
              <span style={{ fontSize: 12, color: "var(--fg-subtle)" }}>current accrued</span>
            </div>

            {/* per-workspace breakdown */}
            <div style={sectionLabel}>by workspace</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 12 }}>
              <div style={{ ...rowHead }}>
                <span style={{ flex: 1 }}>workspace</span>
                <span style={col}>compute</span>
                <span style={col}>gpu</span>
                <span style={{ ...col, textAlign: "right" }}>total</span>
              </div>
              {sum.workspaces.length === 0 && <div style={{ fontSize: 12, color: "var(--fg-subtle)", padding: "6px 0" }}>no usage yet.</div>}
              {sum.workspaces.map((w) => (
                <div key={w.id} style={dataRow}>
                  <span style={{ flex: 1, color: "var(--fg)", display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 8, color: w.state === "running" ? "var(--ok, #3fb950)" : "var(--fg-subtle)" }}>●</span>
                    {w.id}
                  </span>
                  <span style={col}>{w.usage.machineMinutes.toFixed(1)}m · {usd(w.usage.machineCents)}</span>
                  <span style={col}>{w.usage.gpuMinutes > 0 ? `${w.usage.gpuMinutes.toFixed(1)}m · ${usd(w.usage.gpuCents)}` : "—"}</span>
                  <span style={{ ...col, textAlign: "right", color: "var(--fg)" }}>{usd(w.usage.totalCents)}</span>
                </div>
              ))}
            </div>

            {/* invoice */}
            <div style={sectionLabel}>invoice</div>
            <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "10px 12px", marginBottom: 14 }}>
              {sum.invoice.lines.length === 0 ? (
                <div style={{ fontSize: 12, color: "var(--fg-subtle)" }}>nothing billable yet.</div>
              ) : (
                sum.invoice.lines.map((l) => (
                  <div key={l.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "3px 0" }}>
                    <span style={{ color: "var(--fg-muted)" }}>{l.label} <span style={{ color: "var(--fg-subtle)", fontSize: 11 }}>({l.minutes.toFixed(1)} min)</span></span>
                    <span style={{ color: "var(--fg)" }}>{usd(l.cents)}</span>
                  </div>
                ))
              )}
              <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--border)", marginTop: 6, paddingTop: 6, fontWeight: 600 }}>
                <span>Total</span><span>{usd(sum.invoice.totalCents)}</span>
              </div>
            </div>

            <button onClick={pay} disabled={busy || sum.total.totalCents <= 0} style={{ ...payBtn, opacity: busy || sum.total.totalCents <= 0 ? 0.5 : 1 }}>
              {busy ? "charging…" : `Pay ${usd(sum.invoice.totalCents)}`}
            </button>
            {msg && <div style={{ marginTop: 10, fontSize: 12, color: "var(--accent)" }}>{msg}</div>}
            <div style={{ marginTop: 10, fontSize: 10, color: "var(--fg-subtle)", lineHeight: 1.5 }}>
              Metering is live (compute + GPU minutes). Charges run through {sum.billing.name}
              {sum.billing.live ? "" : " — set a Stripe key to charge for real (test mode)"}.
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(3px)" };
const sheet: React.CSSProperties = { position: "relative", width: 480, maxWidth: "100%", maxHeight: "90vh", overflowY: "auto", background: "var(--bg-elevated)", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-lg, 14px)", padding: "22px 24px", boxShadow: "0 24px 70px rgba(0,0,0,0.45)" };
const closeBtn: React.CSSProperties = { marginLeft: "auto", background: "transparent", border: "none", color: "var(--fg-muted)", cursor: "pointer", fontSize: 15 };
const sectionLabel: React.CSSProperties = { fontSize: 10, color: "var(--fg-subtle)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 };
const rowHead: React.CSSProperties = { display: "flex", fontSize: 10, color: "var(--fg-subtle)", textTransform: "uppercase", letterSpacing: "0.04em", paddingBottom: 4, borderBottom: "1px solid var(--border)" };
const dataRow: React.CSSProperties = { display: "flex", fontSize: 12, padding: "5px 0", borderBottom: "1px solid var(--border)" };
const col: React.CSSProperties = { width: 96, color: "var(--fg-muted)", fontFamily: "var(--font-mono)", fontSize: 11 };
const payBtn: React.CSSProperties = { width: "100%", background: "var(--accent)", color: "var(--bg)", border: "none", borderRadius: "var(--radius)", padding: "11px", fontSize: 14, fontWeight: 650, cursor: "pointer" };
