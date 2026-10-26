/**
 * Which key pays for an AI call — the exhaustive state walk.
 *
 * WHY THIS FILE LIVES HERE AND NOT NEXT TO ITS SOURCE. The module under test is
 * `supabase/functions/_shared/byokPolicy.ts`. `vitest.config.ts` test.include only
 * collects tests under `src/` and `e2e/`, so a test placed beside its source is
 * never collected — silently, with no error or warning. Same arrangement as
 * `src/lib/leakageScan.test.ts`; do not "fix" it by moving this file.
 *
 * WHY EXHAUSTIVE RATHER THAN SAMPLED. Every branch here is a way to break one of
 * two promises, and both failures are invisible at runtime:
 *
 *   • "when BYOK is on, only the hospital's key is used" — broken by any path
 *     that resolves to `platform` while BYOK is active. The call succeeds, the
 *     clinician sees a normal result, the usage row records the correct
 *     hospital, and patient data has gone to a vendor under a contract the
 *     hospital never signed.
 *   • "safety AI never depends on a hospital's key" — broken by any path that
 *     resolves safety-class to `hospital` or to `blocked`. A hospital's finance
 *     department forgetting to top up an account would then silence a
 *     drug-interaction check.
 *
 * So the whole space is walked: 3 feature classes × (8 BYOK combinations + the
 * unreadable state) = 27 states, each asserted explicitly.
 */
import { describe, it, expect } from "vitest";
import {
  SAFETY_AI_FEATURE_KEYS as EDGE_SAFETY_KEYS,
  CLINICAL_AI_FEATURE_KEYS,
  aiConfigCacheKey,
  classifyAiFeature,
  decideKeySource,
  mayHospitalChooseModel,
  type ByokState,
} from "../../supabase/functions/_shared/byokPolicy";
import { SAFETY_AI_FEATURE_KEYS as APP_SAFETY_KEYS } from "@/lib/aiFeatures";

describe("the safety list mirror cannot drift", () => {
  // Deno edge functions cannot import from src/, so the safety list is
  // duplicated. This assertion is the only thing standing between that
  // duplication and a safety feature quietly running on a hospital's key
  // because someone added a key on one side and not the other.
  it("matches src/lib/aiFeatures.ts exactly", () => {
    expect([...EDGE_SAFETY_KEYS].sort()).toEqual([...APP_SAFETY_KEYS].sort());
  });

  it("is not empty — an empty list would silently disable the whole carve-out", () => {
    expect(EDGE_SAFETY_KEYS.length).toBeGreaterThan(0);
  });

  it("does not list a safety key as clinical as well", () => {
    for (const key of EDGE_SAFETY_KEYS) {
      expect(CLINICAL_AI_FEATURE_KEYS).not.toContain(key);
    }
  });
});

describe("classifyAiFeature", () => {
  it.each([...EDGE_SAFETY_KEYS])("classifies %s as safety", (key) => {
    expect(classifyAiFeature(key)).toBe("safety");
  });

  it.each(["voice_scribe", "discharge_summary", "differential_diagnosis", "document_ocr"])(
    "classifies %s as clinical",
    (key) => {
      expect(classifyAiFeature(key)).toBe("clinical");
    },
  );

  it.each(["ai_digest", "revenue_leakage", "roster_optimizer", "whatsapp_bot_intent"])(
    "classifies %s as non-clinical",
    (key) => {
      expect(classifyAiFeature(key)).toBe("non_clinical");
    },
  );

  it("treats an unknown key as non-clinical", () => {
    expect(classifyAiFeature("some_future_feature")).toBe("non_clinical");
  });

  it("trims surrounding whitespace before classifying", () => {
    expect(classifyAiFeature("  adr_detector  ")).toBe("safety");
  });

  it("treats an empty or missing key as non-clinical rather than throwing", () => {
    expect(classifyAiFeature("")).toBe("non_clinical");
    expect(classifyAiFeature(undefined as unknown as string)).toBe("non_clinical");
  });
});

// ── The exhaustive walk ───────────────────────────────────────────────────────

const BOOLS = [false, true] as const;
/** All eight combinations of the three BYOK bits, plus the unreadable state. */
const ALL_BYOK_STATES: Array<ByokState | null> = [
  null,
  ...BOOLS.flatMap((entitled) =>
    BOOLS.flatMap((enabled) =>
      BOOLS.map((hasActiveKey): ByokState => ({ entitled, enabled, hasActiveKey })),
    ),
  ),
];

const describeState = (s: ByokState | null) =>
  s == null
    ? "unreadable"
    : `entitled=${s.entitled} enabled=${s.enabled} key=${s.hasActiveKey}`;

describe("decideKeySource — safety class is immune to everything", () => {
  it("covers all nine BYOK states", () => {
    expect(ALL_BYOK_STATES).toHaveLength(9);
  });

  for (const byok of ALL_BYOK_STATES) {
    it(`runs on the platform key when ${describeState(byok)}`, () => {
      for (const featureKey of EDGE_SAFETY_KEYS) {
        const d = decideKeySource({ featureKey, byok });
        expect(d.blocked).toBe(false);
        expect(d.owner).toBe("platform");
      }
    });
  }

  it("is never blocked even with BYOK fully active and no key", () => {
    // The decisive case. If this ever returns blocked, a hospital's expired
    // card can silence a deterioration alert.
    const d = decideKeySource({
      featureKey: "sepsis_early_warning",
      byok: { entitled: true, enabled: true, hasActiveKey: false },
    });
    expect(d.blocked).toBe(false);
    expect(d.owner).toBe("platform");
  });

  it("never routes a safety call to a hospital key, even when one exists", () => {
    const d = decideKeySource({
      featureKey: "drug_interaction_analysis",
      byok: { entitled: true, enabled: true, hasActiveKey: true },
    });
    expect(d.owner).toBe("platform");
  });
});

describe.each(["voice_scribe", "ai_digest"])(
  "decideKeySource — %s (non-safety)",
  (featureKey) => {
    it("blocks when the BYOK state cannot be read", () => {
      const d = decideKeySource({ featureKey, byok: null });
      expect(d.blocked).toBe(true);
      expect(d.owner).toBeNull();
    });

    it.each([
      { entitled: false, enabled: false, hasActiveKey: false },
      { entitled: false, enabled: false, hasActiveKey: true },
      { entitled: false, enabled: true, hasActiveKey: false },
      { entitled: false, enabled: true, hasActiveKey: true },
    ])("uses the platform key when not entitled (%o)", (byok) => {
      const d = decideKeySource({ featureKey, byok });
      expect(d.blocked).toBe(false);
      expect(d.owner).toBe("platform");
    });

    it.each([
      { entitled: true, enabled: false, hasActiveKey: false },
      { entitled: true, enabled: false, hasActiveKey: true },
    ])("uses the platform key when entitled but switched off (%o)", (byok) => {
      const d = decideKeySource({ featureKey, byok });
      expect(d.blocked).toBe(false);
      expect(d.owner).toBe("platform");
    });

    it("BLOCKS when BYOK is on but no active key exists", () => {
      // The branch the drafted migration got wrong: it specified a fall back to
      // "the platform global config" here, which is the silent fallback the
      // whole feature exists to forbid.
      const d = decideKeySource({
        featureKey,
        byok: { entitled: true, enabled: true, hasActiveKey: false },
      });
      expect(d.blocked).toBe(true);
      expect(d.owner).toBeNull();
    });

    it("uses the hospital key when BYOK is fully active", () => {
      const d = decideKeySource({
        featureKey,
        byok: { entitled: true, enabled: true, hasActiveKey: true },
      });
      expect(d.blocked).toBe(false);
      expect(d.owner).toBe("hospital");
    });
  },
);

describe("decideKeySource — the invariant, stated directly", () => {
  it("never returns the platform key for a non-safety feature while BYOK is active", () => {
    const nonSafety = ["voice_scribe", "discharge_summary", "ai_digest", "unknown_feature"];
    for (const featureKey of nonSafety) {
      for (const byok of ALL_BYOK_STATES) {
        const d = decideKeySource({ featureKey, byok });
        const byokActive = byok != null && byok.entitled && byok.enabled;
        if (byokActive) {
          // Either the hospital's own key, or a hard stop. Never platform.
          expect(d.owner).not.toBe("platform");
        }
      }
    }
  });

  it("always yields a reason a human can act on", () => {
    for (const featureKey of ["voice_scribe", "adr_detector"]) {
      for (const byok of ALL_BYOK_STATES) {
        const d = decideKeySource({ featureKey, byok });
        expect(d.reason).toBeTruthy();
        expect(d.reason.length).toBeGreaterThan(10);
      }
    }
  });
});

describe("mayHospitalChooseModel", () => {
  it("denies model choice on every safety feature", () => {
    for (const key of EDGE_SAFETY_KEYS) expect(mayHospitalChooseModel(key)).toBe(false);
  });

  it("denies model choice on every clinical feature", () => {
    for (const key of CLINICAL_AI_FEATURE_KEYS) expect(mayHospitalChooseModel(key)).toBe(false);
  });

  it("permits model choice on a non-clinical feature", () => {
    expect(mayHospitalChooseModel("ai_digest")).toBe(true);
    expect(mayHospitalChooseModel("roster_optimizer")).toBe(true);
  });
});

describe("aiConfigCacheKey", () => {
  it("separates two hospitals using the same feature at the same token count", () => {
    // The exact collision that leaked one tenant's API key to another: the old
    // key was `${featureKey}:${maxTokens}` with no hospital dimension.
    const a = aiConfigCacheKey("hospital-a", "generate_clinical_note", 800, "hospital");
    const b = aiConfigCacheKey("hospital-b", "generate_clinical_note", 800, "platform");
    expect(a).not.toBe(b);
  });

  it("separates the two key owners for one hospital", () => {
    // A hospital that flips BYOK off must not read back its own BYOK entry.
    const byok = aiConfigCacheKey("h1", "voice_scribe", 800, "hospital");
    const platform = aiConfigCacheKey("h1", "voice_scribe", 800, "platform");
    expect(byok).not.toBe(platform);
  });

  it("separates features and token counts", () => {
    expect(aiConfigCacheKey("h1", "a", 800, "platform")).not.toBe(
      aiConfigCacheKey("h1", "b", 800, "platform"),
    );
    expect(aiConfigCacheKey("h1", "a", 800, "platform")).not.toBe(
      aiConfigCacheKey("h1", "a", 1000, "platform"),
    );
  });

  it("is stable for identical inputs", () => {
    expect(aiConfigCacheKey("h1", "a", 800, "hospital")).toBe(
      aiConfigCacheKey("h1", "a", 800, "hospital"),
    );
  });
});
