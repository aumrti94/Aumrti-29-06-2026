/**
 * Per-feature AI usage roll-up for the hospital's own transparency screen — pure, no I/O.
 *
 * WHY THIS EXISTS
 * ---------------
 * /settings/plan already shows a hospital ONE number: total AI spend this month.
 * That answers "how much" and nothing else. The question hospitals actually ask —
 * the one behind "we'll manage our own API keys" — is *which* of our workflows
 * send data out, how often, and to whom. This turns the daily roll-up into that
 * answer.
 *
 * Two invariants it exists to protect, both mirroring src/lib/aiBudget.ts:
 *
 *   1. SAFETY AI IS REPORTED BUT NEVER COUNTED AS METERED. The four
 *      SAFETY_AI_FEATURE_KEYS are shown — a hospital is entitled to know a
 *      drug-interaction check ran — but they are excluded from `meteredCostInr`,
 *      exactly as the `hospital_ai_budget_status` view excludes them from the
 *      cap. If this file counted them and the view did not, the usage page and
 *      the plan page would quietly disagree about the same month.
 *
 *   2. UNKNOWN FEATURE KEYS ARE KEPT, NEVER DROPPED. A row whose feature_key is
 *      no longer in AI_FEATURE_DEFS is a feature that was renamed or retired
 *      after the row was written. Dropping it would understate the total and
 *      make this page disagree with /settings/plan, which sums the same table
 *      without filtering. It is shown under its raw key with `known: false` so
 *      the discrepancy is visible rather than silent.
 *
 * Totals are computed from the SAME rows the table renders, never passed in
 * separately — a summary whose total can disagree with its own breakdown is
 * worse than no summary on a screen whose entire purpose is to be trusted.
 */

import { AI_FEATURE_DEFS, isSafetyAiFeature } from "./aiFeatures";

/**
 * One `ai_cost_daily` row as PostgREST returns it.
 *
 * `numeric` columns arrive as STRINGS over the wire (Postgres numeric has no
 * lossless JSON representation), while `integer` columns arrive as numbers.
 * Both shapes are accepted on every field rather than trusting the column type,
 * because a caller that selects an aggregate or a view gets whichever the
 * planner produced.
 */
export interface AiCostDailyRow {
  feature_key: string;
  provider?: string | null;
  total_calls?: number | string | null;
  total_cost_inr?: number | string | null;
}

export interface AiFeatureUsage {
  featureKey: string;
  /** Human label from AI_FEATURE_DEFS, or the raw key when unknown. */
  label: string;
  /** False when the key is absent from AI_FEATURE_DEFS — retired or renamed. */
  known: boolean;
  /** True for the four SAFETY_AI_FEATURE_KEYS. Reported, never metered. */
  isSafety: boolean;
  calls: number;
  costInr: number;
  /** Distinct providers that served this feature, sorted. */
  providers: string[];
}

export interface AiUsageSummary {
  /** Sorted most-expensive first. */
  features: AiFeatureUsage[];
  totalCalls: number;
  /** Every rupee, safety included. Matches what /settings/plan sums. */
  totalCostInr: number;
  /** Spend that counts against a plan allowance — excludes safety class. */
  meteredCostInr: number;
  /** Safety-class spend, shown for transparency, never counted. */
  safetyCostInr: number;
  /** Distinct providers across all features, sorted. */
  providers: string[];
  /** True when there is nothing to show — lets the caller pick an empty state. */
  isEmpty: boolean;
}

const LABEL_BY_KEY: ReadonlyMap<string, string> = new Map(
  AI_FEATURE_DEFS.map((f) => [f.key, f.label]),
);

/**
 * Postgres `numeric` arrives as a string; `integer` as a number; a missing
 * column as undefined. Anything non-finite (null, "", "abc", NaN) is 0 — a
 * usage page must never render "NaN" at a hospital administrator.
 */
const num = (v: number | string | null | undefined): number => {
  if (v == null) return 0;
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Four decimal places, matching src/lib/aiBudget.ts. Individual AI calls cost
 * fractions of a rupee, so rounding to paise at the per-feature level would lose
 * real money on a low-volume feature and make the rows fail to sum to the total.
 */
const round4 = (n: number): number => Math.round((n + Number.EPSILON) * 10000) / 10000;

export function summariseAiUsage(rows: AiCostDailyRow[] | null | undefined): AiUsageSummary {
  const byFeature = new Map<string, { calls: number; costInr: number; providers: Set<string> }>();

  for (const row of rows ?? []) {
    // A row with no feature_key cannot be attributed to anything a hospital
    // would recognise, and inventing a bucket for it would be a worse lie than
    // omitting it. The only rows this drops are malformed ones.
    const featureKey = typeof row?.feature_key === "string" ? row.feature_key.trim() : "";
    if (!featureKey) continue;

    let entry = byFeature.get(featureKey);
    if (!entry) {
      entry = { calls: 0, costInr: 0, providers: new Set<string>() };
      byFeature.set(featureKey, entry);
    }

    entry.calls += num(row.total_calls);
    entry.costInr += num(row.total_cost_inr);

    const provider = typeof row.provider === "string" ? row.provider.trim() : "";
    if (provider) entry.providers.add(provider);
  }

  const features: AiFeatureUsage[] = [];
  for (const [featureKey, entry] of byFeature) {
    const label = LABEL_BY_KEY.get(featureKey);
    features.push({
      featureKey,
      label: label ?? featureKey,
      known: label != null,
      isSafety: isSafetyAiFeature(featureKey),
      calls: entry.calls,
      costInr: round4(entry.costInr),
      providers: [...entry.providers].sort(),
    });
  }

  // Cost first (what the reader scans for), then calls, then key. The third key
  // is not decorative: Map iteration order is insertion order, which follows
  // whatever order PostgREST happened to return, so without it two renders of
  // identical data could order zero-cost rows differently.
  features.sort(
    (a, b) =>
      b.costInr - a.costInr ||
      b.calls - a.calls ||
      a.featureKey.localeCompare(b.featureKey),
  );

  let totalCalls = 0;
  let totalCostInr = 0;
  let safetyCostInr = 0;
  const providers = new Set<string>();

  for (const f of features) {
    totalCalls += f.calls;
    totalCostInr += f.costInr;
    if (f.isSafety) safetyCostInr += f.costInr;
    for (const p of f.providers) providers.add(p);
  }

  totalCostInr = round4(totalCostInr);
  safetyCostInr = round4(safetyCostInr);

  return {
    features,
    totalCalls,
    totalCostInr,
    // Derived by subtraction rather than summed independently, so metered +
    // safety is guaranteed to equal the total the breakdown shows.
    meteredCostInr: round4(totalCostInr - safetyCostInr),
    safetyCostInr,
    providers: [...providers].sort(),
    isEmpty: features.length === 0,
  };
}
