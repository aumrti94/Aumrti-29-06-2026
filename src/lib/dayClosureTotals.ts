/**
 * Day-closure cash reconciliation — pure aggregation, so the money logic is
 * testable without a database.
 *
 * A closure answers one question per tender: how much of it physically moved
 * today? That means each bucket must be NET — receipts, advances taken in, and
 * refunds paid out all land in the mode they actually moved through.
 *
 * Previously advances and refunds were lump sums bolted onto the grand total
 * with no mode attribution, so a ₹5,000 UPI advance left UPI reading ₹0 while a
 * ₹3,500 cash refund never came off Cash. The grand total still came out right,
 * but only by coincidence — and the per-mode figures are the ones a supervisor
 * physically counts.
 */

export interface SystemTotals {
  cash: number;
  upi: number;
  card: number;
  cheque: number;
  net_banking: number;
  insurance: number;
  other: number;
  /** Refunds processed today (refund_payables, status='processed') — informational; already inside the mode buckets. */
  refunds: number;
  /** Advance deposits received today but not yet mirrored into bill_payments — informational; already inside the mode buckets. */
  advances: number;
  /**
   * Patient Pay-Later grants issued today (patient_credit_grants) — informational, and
   * deliberately NEVER added to `total`. Nothing was collected: the grant is a decision
   * to create the order without payment, not a tender. Adding it to `total` would make
   * `total` exceed the cash actually in the drawer and produce a permanent evening
   * variance equal to the day's credit issued — see DailyCashClosurePage.tsx, where
   * `other` (the one bucket this could otherwise fall into) is deliberately excluded
   * from the supervisor's manually-countable MODES list.
   */
  creditIssued: number;
  /**
   * Patient Pay-Later amounts recovered today. Already fully counted inside cash/upi/
   * card/etc — a recovery is an entirely ordinary bill_payments row through
   * recordBillPayment. This field exists for display only ("included above, for
   * reference", same treatment as `advances`) and is NOT computed by
   * computeDayClosureTotals — callers that want it populate it themselves from a
   * separate query, exactly as DailyCashClosurePage.tsx does.
   */
  creditRecovered: number;
  total: number;
}

export interface ModedAmount {
  mode: string | null;
  amount: number;
}

export interface DayClosureInput {
  /** bill_payments rows for the day (any mode, including internal transfers). */
  payments: ModedAmount[];
  /** refund_payables rows processed today, by refund_mode. */
  refunds: ModedAmount[];
  /** ipd_advances deposit rows created today, by payment_mode. */
  advanceDeposits: ModedAmount[];
  /** bill_payments rows for the day with is_advance = true (the mirrored slice of the above). */
  mirroredAdvances: ModedAmount[];
  /**
   * patient_credit_grants rows created today. No mode — a grant never touches a tender.
   * Optional so every existing caller (and the whole existing test suite) that predates
   * Pay-Later keeps compiling unchanged.
   */
  creditGrants?: { amount: number }[];
}

/**
 * Not a tender: 'advance_adjust' applies an already-collected advance to a bill.
 * No money changes hands, so counting it as a receipt double-counts the original
 * deposit — and, as a mirror row, it must not cancel out an unmirrored deposit.
 */
export const INTERNAL_TRANSFER_MODE = "advance_adjust";

export const EMPTY_TOTALS: SystemTotals = {
  cash: 0, upi: 0, card: 0, cheque: 0, net_banking: 0,
  insurance: 0, other: 0, refunds: 0, advances: 0,
  creditIssued: 0, creditRecovered: 0, total: 0,
};

/** Map a raw payment/refund mode string onto its SystemTotals bucket. */
export function bucketForMode(mode: string | null): keyof SystemTotals {
  const m = (mode || "").toLowerCase();
  if (m === "cash") return "cash";
  if (m === "upi") return "upi";
  if (m === "card") return "card";
  if (m === "cheque") return "cheque";
  if (m === "net_banking") return "net_banking";
  if (m === "insurance" || m === "pmjay" || m === "cghs" || m === "echs") return "insurance";
  return "other";
}

const isInternal = (mode: string | null) => (mode || "").toLowerCase() === INTERNAL_TRANSFER_MODE;

function sumByMode(rows: ModedAmount[]): Record<string, number> {
  const acc: Record<string, number> = {};
  for (const r of rows) {
    if (isInternal(r.mode)) continue;
    const m = (r.mode || "unknown").toLowerCase();
    acc[m] = (acc[m] || 0) + Number(r.amount || 0);
  }
  return acc;
}

export function computeDayClosureTotals(input: DayClosureInput): SystemTotals {
  const totals: SystemTotals = { ...EMPTY_TOTALS };
  const add = (mode: string | null, amount: number) => {
    const bucket = bucketForMode(mode);
    (totals[bucket] as number) += amount;
  };

  // Real tenders received. Internal transfers move no money.
  for (const p of input.payments) {
    if (isInternal(p.mode)) continue;
    add(p.mode, Number(p.amount || 0));
  }

  // Refunds paid out — money OUT of the tender it left by.
  // Note: ipd_advances also carries a mirror 'refund' row for the same
  // disbursement (RefundApprovalsInbox writes it on approval). Only
  // refund_payables is read, or every refund would be subtracted twice.
  for (const r of input.refunds) {
    const amt = Number(r.amount || 0);
    totals.refunds += amt;
    add(r.mode, -amt);
  }

  // Advance deposits. syncAdvanceToBill mirrors these into bill_payments once a
  // draft IPD bill exists but skips silently when none does, so the deposit is
  // otherwise invisible. Dedupe PER MODE: the mirrored slice is already counted
  // above, the remainder is not.
  const deposited = sumByMode(input.advanceDeposits);
  const mirrored = sumByMode(input.mirroredAdvances);
  for (const [mode, amount] of Object.entries(deposited)) {
    const unmirrored = Math.max(0, amount - (mirrored[mode] || 0));
    if (unmirrored === 0) continue;
    totals.advances += unmirrored;
    add(mode, unmirrored);
  }

  // Pay-Later grants — informational only. Deliberately never passed to add(): a grant
  // must never land in any tender bucket, or `total` would count money that was never
  // collected. See the SystemTotals.creditIssued docstring.
  for (const g of input.creditGrants || []) {
    totals.creditIssued += Number(g.amount || 0);
  }

  // Buckets are already net of advances in and refunds out — adding those again
  // would double-count them. creditIssued is intentionally excluded, same reason.
  totals.total = totals.cash + totals.upi + totals.card + totals.cheque
    + totals.net_banking + totals.insurance + totals.other;

  return totals;
}

// ─── Per-cashier breakdown ─────────────────────────────────────────────────────
//
// Multiple accounts (any role — reception, doctor, admin, lab…) take payments on
// the same day. The single hospital-wide total can't tell you how much cash each
// person's drawer should hold. groupTotalsByCashier splits the same rows by the
// user who took them (received_by) and runs the identical NET computation per
// group, so each account can be counted separately.
//
// Invariant: the per-cashier totals sum back to computeDayClosureTotals over the
// same rows. This holds as long as a deposit and its mirror row land in the SAME
// group (the caller leaves both unattributed, so they share the "Unattributed"
// group and the per-mode advance dedup happens exactly as it does globally).

/** A moded amount that also knows which user (received_by) it belongs to. */
export interface CashierModedAmount extends ModedAmount {
  /** public.users.id of the collector. null/undefined ⇒ unattributed (e.g. online/gateway). */
  cashierId?: string | null;
  /** Display name resolved from users.full_name. */
  cashierName?: string | null;
}

/** A credit grant that also knows which user (granted_by) issued it. */
export interface CashierCreditGrant {
  amount: number;
  cashierId?: string | null;
  cashierName?: string | null;
}

export interface CashierDayClosureInput {
  payments: CashierModedAmount[];
  refunds: CashierModedAmount[];
  advanceDeposits: CashierModedAmount[];
  mirroredAdvances: CashierModedAmount[];
  /** Attributed to the granting user — this is the per-cashier fraud-detection view:
   * an unusual concentration of Pay-Later grants under one login is the signal, same
   * as it would be for cash. Optional so existing callers that don't pass it still work. */
  creditGrants?: CashierCreditGrant[];
}

export interface CashierBreakdown {
  /** received_by, or null for the pooled unattributed group. */
  cashierId: string | null;
  cashierName: string;
  totals: SystemTotals;
}

/** Rows with no collector (online/gateway, or actor not fetched) pool here. */
export const UNATTRIBUTED_KEY = "__unattributed__";
export const UNATTRIBUTED_LABEL = "Online / Unattributed";

export function groupTotalsByCashier(input: CashierDayClosureInput): CashierBreakdown[] {
  const groups = new Map<string, { id: string | null; name: string; input: DayClosureInput }>();

  const ensure = (r: { cashierId?: string | null; cashierName?: string | null }) => {
    const key = r.cashierId ? r.cashierId : UNATTRIBUTED_KEY;
    let g = groups.get(key);
    if (!g) {
      g = {
        id: r.cashierId ?? null,
        name: r.cashierId ? (r.cashierName?.trim() || "Unknown user") : UNATTRIBUTED_LABEL,
        input: { payments: [], refunds: [], advanceDeposits: [], mirroredAdvances: [], creditGrants: [] },
      };
      groups.set(key, g);
    } else if (r.cashierId && r.cashierName?.trim() && g.name === "Unknown user") {
      // Name arrived on a later row for the same id.
      g.name = r.cashierName.trim();
    }
    return g;
  };

  for (const r of input.payments) ensure(r).input.payments.push(r);
  for (const r of input.refunds) ensure(r).input.refunds.push(r);
  for (const r of input.advanceDeposits) ensure(r).input.advanceDeposits.push(r);
  for (const r of input.mirroredAdvances) ensure(r).input.mirroredAdvances.push(r);
  for (const r of input.creditGrants || []) ensure(r).input.creditGrants.push({ amount: r.amount });

  const out: CashierBreakdown[] = [];
  for (const g of groups.values()) {
    out.push({ cashierId: g.id, cashierName: g.name, totals: computeDayClosureTotals(g.input) });
  }

  // Named collectors first (alphabetical), the pooled unattributed group last.
  out.sort((a, b) => {
    if (a.cashierId === null) return 1;
    if (b.cashierId === null) return -1;
    return a.cashierName.localeCompare(b.cashierName);
  });
  return out;
}
