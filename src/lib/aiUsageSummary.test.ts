/**
 * Per-feature AI usage roll-up for the hospital's own transparency screen.
 *
 * The failures these assertions guard against are all SILENT ones — this screen
 * exists to be believed by a hospital's DPDP officer and procurement team, so a
 * number that is quietly wrong is worse here than a screen that fails to load:
 *
 *   • safety-class spend leaking into the metered figure, which would make this
 *     page and /settings/plan disagree about the same month;
 *   • a retired feature_key being dropped, which would understate the total
 *     while the breakdown still looked internally consistent;
 *   • Postgres `numeric` arriving as a string and summing by concatenation,
 *     which produces a plausible-looking but enormous rupee figure;
 *   • breakdown rows that do not add up to the total printed above them.
 *
 * The last one is asserted directly rather than trusted: metered + safety must
 * equal total, and the per-feature rows must sum to it, on every case.
 */
import { describe, it, expect } from "vitest";
import {
  summariseAiUsage,
  type AiCostDailyRow,
} from "@/lib/aiUsageSummary";
import { SAFETY_AI_FEATURE_KEYS, AI_FEATURE_DEFS } from "@/lib/aiFeatures";

const row = (over: Partial<AiCostDailyRow> & { feature_key: string }): AiCostDailyRow => ({
  provider: "gemini",
  total_calls: 1,
  total_cost_inr: 0,
  ...over,
});

describe("summariseAiUsage — empty and malformed input", () => {
  it("returns an empty summary for null", () => {
    const s = summariseAiUsage(null);
    expect(s.isEmpty).toBe(true);
    expect(s.features).toEqual([]);
    expect(s.totalCalls).toBe(0);
    expect(s.totalCostInr).toBe(0);
    expect(s.meteredCostInr).toBe(0);
    expect(s.safetyCostInr).toBe(0);
    expect(s.providers).toEqual([]);
  });

  it("returns an empty summary for undefined", () => {
    expect(summariseAiUsage(undefined).isEmpty).toBe(true);
  });

  it("returns an empty summary for an empty array", () => {
    expect(summariseAiUsage([]).isEmpty).toBe(true);
  });

  it("drops rows with a missing, blank or non-string feature_key", () => {
    const s = summariseAiUsage([
      { feature_key: "" },
      { feature_key: "   " },
      // Shapes PostgREST should never produce, but a hand-rolled caller might.
      { feature_key: null as unknown as string },
      { feature_key: undefined as unknown as string },
      { feature_key: 42 as unknown as string },
    ]);
    expect(s.isEmpty).toBe(true);
    expect(s.features).toEqual([]);
  });

  it("tolerates a null row inside the array without throwing", () => {
    const s = summariseAiUsage([
      null as unknown as AiCostDailyRow,
      row({ feature_key: "icd_coding", total_cost_inr: 5 }),
    ]);
    expect(s.features).toHaveLength(1);
    expect(s.totalCostInr).toBe(5);
  });
});

describe("summariseAiUsage — numeric coercion", () => {
  it("parses Postgres numeric strings rather than concatenating them", () => {
    const s = summariseAiUsage([
      row({ feature_key: "icd_coding", total_cost_inr: "1.5", total_calls: "2" }),
      row({ feature_key: "icd_coding", total_cost_inr: "2.5", total_calls: "3" }),
    ]);
    // Concatenation would give "1.52.5"; naive + on strings would give 15 or NaN.
    expect(s.totalCostInr).toBe(4);
    expect(s.totalCalls).toBe(5);
  });

  it("treats null, undefined, blank and unparseable values as zero", () => {
    const s = summariseAiUsage([
      { feature_key: "icd_coding", total_cost_inr: null, total_calls: null },
      { feature_key: "icd_coding", total_cost_inr: undefined, total_calls: undefined },
      { feature_key: "icd_coding", total_cost_inr: "", total_calls: "" },
      { feature_key: "icd_coding", total_cost_inr: "abc", total_calls: "xyz" },
      { feature_key: "icd_coding", total_cost_inr: NaN, total_calls: NaN },
      { feature_key: "icd_coding", total_cost_inr: Infinity, total_calls: -Infinity },
    ]);
    expect(s.totalCostInr).toBe(0);
    expect(s.totalCalls).toBe(0);
    // The feature is still listed — it ran, it just cost nothing recordable.
    expect(s.features).toHaveLength(1);
  });

  it("rounds to four decimals so rows sum to the printed total", () => {
    const s = summariseAiUsage([
      row({ feature_key: "icd_coding", total_cost_inr: 0.00005 }),
      row({ feature_key: "voice_scribe", total_cost_inr: 0.00005 }),
    ]);
    const summed = s.features.reduce((n, f) => n + f.costInr, 0);
    expect(summed).toBeCloseTo(s.totalCostInr, 10);
  });
});

describe("summariseAiUsage — feature identity", () => {
  it("labels a known feature from AI_FEATURE_DEFS", () => {
    const known = AI_FEATURE_DEFS[0];
    const s = summariseAiUsage([row({ feature_key: known.key })]);
    expect(s.features[0].label).toBe(known.label);
    expect(s.features[0].known).toBe(true);
  });

  it("keeps an unknown feature_key under its raw key rather than dropping it", () => {
    const s = summariseAiUsage([
      row({ feature_key: "retired_feature_v1", total_cost_inr: 10 }),
    ]);
    expect(s.features).toHaveLength(1);
    expect(s.features[0].label).toBe("retired_feature_v1");
    expect(s.features[0].known).toBe(false);
    // The decisive assertion: the rupee still reaches the total, so this page
    // cannot disagree with /settings/plan, which sums the table unfiltered.
    expect(s.totalCostInr).toBe(10);
  });

  it("aggregates repeated daily rows for one feature into a single entry", () => {
    const s = summariseAiUsage([
      row({ feature_key: "voice_scribe", total_calls: 10, total_cost_inr: 11 }),
      row({ feature_key: "voice_scribe", total_calls: 5, total_cost_inr: 4 }),
    ]);
    expect(s.features).toHaveLength(1);
    expect(s.features[0].calls).toBe(15);
    expect(s.features[0].costInr).toBe(15);
  });
});

describe("summariseAiUsage — the safety carve-out", () => {
  it.each(SAFETY_AI_FEATURE_KEYS)("flags %s as safety class", (key) => {
    const s = summariseAiUsage([row({ feature_key: key })]);
    expect(s.features[0].isSafety).toBe(true);
  });

  it("reports safety spend but excludes it from the metered figure", () => {
    const s = summariseAiUsage([
      row({ feature_key: "drug_interaction_analysis", total_cost_inr: 30 }),
      row({ feature_key: "icd_coding", total_cost_inr: 70 }),
    ]);
    expect(s.safetyCostInr).toBe(30);
    expect(s.meteredCostInr).toBe(70);
    // Total is everything — a hospital is entitled to see the full figure.
    expect(s.totalCostInr).toBe(100);
  });

  it("reports a metered figure of zero when only safety AI ran", () => {
    const s = summariseAiUsage([
      row({ feature_key: "sepsis_early_warning", total_cost_inr: 42 }),
    ]);
    expect(s.meteredCostInr).toBe(0);
    expect(s.safetyCostInr).toBe(42);
    expect(s.totalCostInr).toBe(42);
  });

  it("keeps metered + safety equal to total on a mixed month", () => {
    const s = summariseAiUsage([
      row({ feature_key: "adr_detector", total_cost_inr: "3.3333" }),
      row({ feature_key: "critical_incidental_finder", total_cost_inr: "1.1111" }),
      row({ feature_key: "voice_scribe", total_cost_inr: "12.6666" }),
      row({ feature_key: "discharge_summary", total_cost_inr: "0.0001" }),
    ]);
    expect(s.meteredCostInr + s.safetyCostInr).toBeCloseTo(s.totalCostInr, 10);
  });

  it("does not treat a non-safety feature as safety", () => {
    const s = summariseAiUsage([row({ feature_key: "ai_digest", total_cost_inr: 9 })]);
    expect(s.features[0].isSafety).toBe(false);
    expect(s.safetyCostInr).toBe(0);
    expect(s.meteredCostInr).toBe(9);
  });
});

describe("summariseAiUsage — providers", () => {
  it("deduplicates and sorts providers per feature and overall", () => {
    const s = summariseAiUsage([
      row({ feature_key: "voice_scribe", provider: "openai" }),
      row({ feature_key: "voice_scribe", provider: "gemini" }),
      row({ feature_key: "voice_scribe", provider: "openai" }),
      row({ feature_key: "icd_coding", provider: "claude" }),
    ]);
    const voice = s.features.find((f) => f.featureKey === "voice_scribe")!;
    expect(voice.providers).toEqual(["gemini", "openai"]);
    expect(s.providers).toEqual(["claude", "gemini", "openai"]);
  });

  it("ignores null, undefined, blank and non-string providers", () => {
    const s = summariseAiUsage([
      { feature_key: "icd_coding", provider: null },
      { feature_key: "icd_coding", provider: undefined },
      { feature_key: "icd_coding", provider: "   " },
      { feature_key: "icd_coding", provider: 7 as unknown as string },
    ]);
    expect(s.features[0].providers).toEqual([]);
    expect(s.providers).toEqual([]);
  });

  it("trims whitespace around a provider name", () => {
    const s = summariseAiUsage([row({ feature_key: "icd_coding", provider: "  gemini  " })]);
    expect(s.features[0].providers).toEqual(["gemini"]);
  });
});

describe("summariseAiUsage — ordering", () => {
  it("sorts most expensive first", () => {
    const s = summariseAiUsage([
      row({ feature_key: "icd_coding", total_cost_inr: 1 }),
      row({ feature_key: "voice_scribe", total_cost_inr: 100 }),
      row({ feature_key: "ai_digest", total_cost_inr: 50 }),
    ]);
    expect(s.features.map((f) => f.featureKey)).toEqual([
      "voice_scribe",
      "ai_digest",
      "icd_coding",
    ]);
  });

  it("breaks a cost tie on call count", () => {
    const s = summariseAiUsage([
      row({ feature_key: "icd_coding", total_cost_inr: 5, total_calls: 2 }),
      row({ feature_key: "ai_digest", total_cost_inr: 5, total_calls: 9 }),
    ]);
    expect(s.features.map((f) => f.featureKey)).toEqual(["ai_digest", "icd_coding"]);
  });

  it("breaks a full tie deterministically on feature key", () => {
    // Insertion order here is the reverse of alphabetical, so a Map-order
    // implementation would fail this. Two renders of identical data must not
    // reorder rows under a hospital administrator's cursor.
    const s = summariseAiUsage([
      row({ feature_key: "zzz_feature", total_cost_inr: 0, total_calls: 0 }),
      row({ feature_key: "aaa_feature", total_cost_inr: 0, total_calls: 0 }),
    ]);
    expect(s.features.map((f) => f.featureKey)).toEqual(["aaa_feature", "zzz_feature"]);
  });
});

describe("summariseAiUsage — totals integrity", () => {
  it("makes the breakdown sum to every printed total", () => {
    const s = summariseAiUsage([
      row({ feature_key: "voice_scribe", total_calls: 120, total_cost_inr: "812.4400" }),
      row({ feature_key: "discharge_summary", total_calls: 30, total_cost_inr: "95.1200" }),
      row({ feature_key: "drug_interaction_analysis", total_calls: 400, total_cost_inr: "40.0000" }),
      row({ feature_key: "legacy_thing", total_calls: 2, total_cost_inr: "0.5000" }),
    ]);
    const summedCost = s.features.reduce((n, f) => n + f.costInr, 0);
    const summedCalls = s.features.reduce((n, f) => n + f.calls, 0);
    expect(summedCost).toBeCloseTo(s.totalCostInr, 10);
    expect(summedCalls).toBe(s.totalCalls);
    expect(s.meteredCostInr + s.safetyCostInr).toBeCloseTo(s.totalCostInr, 10);
    expect(s.isEmpty).toBe(false);
  });
});
