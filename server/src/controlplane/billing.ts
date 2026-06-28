import type { UsageTotals } from "./types";

export interface InvoiceLine {
  label: string;
  minutes: number;
  cents: number;
}
export interface Invoice {
  currency: "usd";
  lines: InvoiceLine[];
  totalCents: number;
}

/** Pure: turn metered usage into an itemized invoice (no external calls). */
export function buildInvoice(usage: UsageTotals): Invoice {
  const lines: InvoiceLine[] = [
    { label: "Compute", minutes: usage.machineMinutes, cents: Math.round(usage.machineCents) },
    { label: "GPU", minutes: usage.gpuMinutes, cents: Math.round(usage.gpuCents) },
  ].filter((l) => l.minutes > 0 || l.cents > 0);
  return { currency: "usd", lines, totalCents: Math.round(usage.totalCents) };
}

export interface ChargeResult {
  id: string;
  status: string;
  provider: string;
  amountCents: number;
}

export interface Billing {
  readonly name: string;
  readonly live: boolean;
  charge(amountCents: number, description: string): Promise<ChargeResult>;
}

/** No payment processor configured — return a simulated result (preview only). */
export class NoopBilling implements Billing {
  readonly name = "none";
  readonly live = false;
  async charge(amountCents: number): Promise<ChargeResult> {
    return { id: `sim_${Date.now()}`, status: "simulated", provider: "none", amountCents };
  }
}

/** Stripe via REST (test mode). Activates when STRIPE_SECRET_KEY (sk_test_...) is set. */
export class StripeBilling implements Billing {
  readonly name = "stripe";
  readonly live = true;
  constructor(private key: string) {}

  async charge(amountCents: number, description: string): Promise<ChargeResult> {
    const body = new URLSearchParams({
      amount: String(Math.max(1, Math.round(amountCents))),
      currency: "usd",
      description,
      "payment_method_types[]": "card",
    });
    const res = await fetch("https://api.stripe.com/v1/payment_intents", {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.key}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
    });
    const j = (await res.json()) as { id?: string; status?: string; error?: { message?: string } };
    if (!res.ok) throw new Error(`stripe: ${j.error?.message ?? res.status}`);
    return { id: j.id ?? "", status: j.status ?? "unknown", provider: "stripe", amountCents };
  }
}

export function makeBilling(): Billing {
  const key = process.env.STRIPE_SECRET_KEY;
  return key ? new StripeBilling(key) : new NoopBilling();
}
