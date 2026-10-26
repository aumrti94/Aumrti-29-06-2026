/**
 * Which key pays for this AI call — the whole decision, in one pure function.
 *
 * WHY THIS FILE EXISTS, AND WHY IT IS PURE
 * ----------------------------------------
 * Every other part of this system was engineered never to fail an AI call: there
 * are ~25 `?? resolveAiConfigFromEnv()` fallbacks across the edge functions,
 * each one there so a clinician never hits a dead end. BYOK inverts that
 * premise. It is the first feature in the product where FAILING the call is the
 * correct outcome, because the alternative — quietly spending a platform key on
 * behalf of a hospital that contracted its own provider — sends patient data to
 * a vendor under a contract the hospital never signed, and the hospital believes
 * the exact opposite is happening.
 *
 * A rule that subtle cannot live inline in a resolver that also does I/O. It
 * lives here, with no imports and no side effects, so it can be exhaustively
 * tested — see byokPolicy.test.ts, which walks the entire state space rather
 * than sampling it. Same arrangement as `leakageScan.ts`: one file imported by
 * both the Deno edge runtime and the vitest suite, rather than the repo's usual
 * "TWIN of X — keep in lockstep" comment, which is a convention a tired person
 * breaks at 2am.
 *
 * THREE RESOLUTION DOMAINS, NEVER OVERLAPPING
 *
 *   safety       — the four SAFETY_AI_FEATURE_KEYS. ALWAYS the platform key.
 *                  Structurally out of scope of BYOK, not "exempted at call
 *                  time". The distinction matters: an exemption is a fallback,
 *                  and fallbacks are what this feature forbids. These features
 *                  were never on the hospital's key, so nothing falls back.
 *                  This is what makes the no-fallback rule survivable: when a
 *                  hospital's key dies, documentation AI goes dark (annoying)
 *                  rather than drug-interaction checking (a safety event).
 *
 *   clinical /   — hospital key when BYOK is fully active; platform key when it
 *   non_clinical   is not; BLOCKED when BYOK is active but unusable. Never a
 *                  silent fall through to platform.
 *
 * FAIL CLOSED, DELIBERATELY UNLIKE THE ENTITLEMENT GATE
 *
 * `checkAIAllowed` fails OPEN — a transient DB error must not lock a paying
 * hospital out of AI. This decision fails CLOSED: if we could not read the BYOK
 * state, we cannot prove the hospital is not BYOK, so we must not spend a
 * platform key on them. Two bits, one query, opposite polarity — which is
 * exactly why it is spelled out here rather than left to emerge from whichever
 * `if` a future caller writes.
 *
 * Note that an unreadable BYOK state still permits SAFETY calls: their key
 * source does not depend on BYOK state at all, so a DB blip degrades
 * documentation AI without touching deterioration or interaction checking.
 */

/** Who the credential for this call belongs to. */
export type KeyOwner = "platform" | "hospital";

/** Which resolution domain a feature sits in. */
export type AiFeatureClass = "safety" | "clinical" | "non_clinical";

/**
 * MIRROR of SAFETY_AI_FEATURE_KEYS in src/lib/aiFeatures.ts.
 *
 * Duplicated because Deno edge functions cannot import from src/. The duplication
 * is not left to discipline: byokPolicy.test.ts imports BOTH this list and the
 * src one and asserts they are identical, so a key added on one side and not the
 * other fails CI rather than silently putting a safety feature on a hospital key.
 */
export const SAFETY_AI_FEATURE_KEYS: readonly string[] = [
  "drug_interaction_analysis",
  "adr_detector",
  "sepsis_early_warning",
  "critical_incidental_finder",
];

/**
 * Features that carry clinical meaning — a clinician can act on the output.
 * Used to decide whether a hospital may also choose the MODEL, not just the key:
 * under the governance ruling, key ownership and model selection are separate
 * freedoms, and only the first is granted on a clinical path.
 *
 * Deliberately a DENY-list posture: a feature key absent from this list AND
 * absent from the safety list is treated as `non_clinical` for model-choice
 * purposes only. That is the right default because the cost of mis-classifying
 * a reporting feature as clinical is a needless restriction, while the reverse
 * is caught by `mayHospitalChooseModel` requiring an explicit allow-list entry
 * anyway (see allowlist handling in the resolver).
 */
export const CLINICAL_AI_FEATURE_KEYS: readonly string[] = [
  "voice_scribe",
  "voice_scribe_rescue",
  "generate_clinical_note",
  "discharge_summary",
  "discharge_summary_structured",
  "ed_discharge_summary",
  "discharge_instructions",
  "icd_coding",
  "icd_suggest",
  "differential_diagnosis",
  "radiology_impression",
  "pathology_impression_draft",
  "triage_classifier",
  "lab_anomaly",
  "lab_auto_interpreter",
  "lab_ast_phenotype",
  "lab_sample_mixup",
  "lab_report_narrative",
  "lab_reflex_tests",
  "readmission_predictor",
  "prakriti_analysis",
  "history_document_extract",
  "history_digest",
  "patient_context_summary",
  "clarifying_questions",
  "care_plan_goal",
  "meal_plan_ai",
  "document_ocr",
  "order_catalogue_match",
  "clinical_guidelines",
];

export function classifyAiFeature(featureKey: string): AiFeatureClass {
  const key = (featureKey || "").trim();
  if (SAFETY_AI_FEATURE_KEYS.includes(key)) return "safety";
  if (CLINICAL_AI_FEATURE_KEYS.includes(key)) return "clinical";
  return "non_clinical";
}

/**
 * The hospital's BYOK state, as read from hospital_ai_provider_config.
 * `null` anywhere this is accepted means "could not be determined" — never
 * "not BYOK".
 */
export interface ByokState {
  /** The `api_hub` entitlement — granted by Aumrti, not self-serve. */
  entitled: boolean;
  /** The hospital's own switch. */
  enabled: boolean;
  /** An active row exists in hospital_ai_keys for the resolved provider. */
  hasActiveKey: boolean;
}

export type KeySourceDecision =
  | { owner: KeyOwner; blocked: false; reason: string }
  | { owner: null; blocked: true; reason: string };

/**
 * Decide which key serves this call.
 *
 * `byok === null` means the state could not be read (DB error, timeout). It is
 * NOT a synonym for "no BYOK row" — a hospital that has never been granted BYOK
 * is `{ entitled: false, ... }`, which is a known state and resolves to platform.
 */
export function decideKeySource(params: {
  featureKey: string;
  byok: ByokState | null;
}): KeySourceDecision {
  const featureClass = classifyAiFeature(params.featureKey);

  // 1. Safety class is decided BEFORE BYOK is consulted at all. This ordering is
  //    the mechanism, not an optimisation: it is what makes safety AI immune to
  //    both an expired hospital key and an unreadable BYOK state.
  if (featureClass === "safety") {
    return {
      owner: "platform",
      blocked: false,
      reason: "safety-class feature — always runs on the platform key, never BYOK",
    };
  }

  // 2. Unknown state fails CLOSED. Resolving this to "not BYOK" would mean a
  //    transient DB error silently spends a platform key for a hospital that
  //    contracted its own provider.
  if (params.byok == null) {
    return {
      owner: null,
      blocked: true,
      reason: "BYOK state could not be determined — refusing to default to a platform key",
    };
  }

  const { entitled, enabled, hasActiveKey } = params.byok;

  // 3. Not granted, or granted and switched off. This is a CONFIGURED state, not
  //    a fallback: the hospital is on Aumrti's keys because that is the
  //    arrangement, and nothing about the founder's rule is engaged.
  if (!entitled || !enabled) {
    return {
      owner: "platform",
      blocked: false,
      reason: !entitled
        ? "BYOK not granted for this hospital — platform key is the configured source"
        : "BYOK granted but switched off by the hospital — platform key is the configured source",
    };
  }

  // 4. BYOK on, but no usable key. The single most important branch in this file.
  //    The drafted migration said this case "falls back to the platform global
  //    config"; that is the silent fallback the rule forbids. Hard stop instead.
  if (!hasActiveKey) {
    return {
      owner: null,
      blocked: true,
      reason:
        "BYOK is enabled but no active key is configured — the hospital's AI provider key needs attention",
    };
  }

  return {
    owner: "hospital",
    blocked: false,
    reason: "BYOK active — running on the hospital's own provider key",
  };
}

/**
 * May this hospital choose the MODEL for this feature, or only own the key?
 *
 * Key ownership and model selection are separate freedoms. A hospital's real
 * reasons for BYOK — their own provider contract, their own bill, their own DPA
 * — require the first and none of the second, while the second carries real
 * clinical risk that this repo already documents: `supportsPdfDocuments()` in
 * ai-config.ts exists because one provider silently accepts a PDF it cannot
 * read, answers from the text prompt alone, and bills for it — on a document
 * extraction task that produces confident, invented patient history.
 *
 * So: free choice on non-clinical features, platform-pinned model on everything
 * clinical or safety, until a validated per-feature-class model allow-list
 * exists.
 */
export function mayHospitalChooseModel(featureKey: string): boolean {
  return classifyAiFeature(featureKey) === "non_clinical";
}

/**
 * Cache key for a resolved AI config.
 *
 * The bug this exists to prevent: the cache was keyed `${featureKey}:${maxTokens}`
 * with NO hospital dimension, at module scope, and it cached the resolved
 * `apiKey`. Two hospitals using the same feature at the same token count shared
 * one entry — so whichever warmed the isolate first donated its credential to
 * the other. Under BYOK that means one customer's clinical notes land in another
 * customer's vendor account, logged against the correct hospital_id, with no
 * error and nothing to detect it by.
 *
 * `hospitalId` first so entries for one tenant sort together when debugging.
 *
 * NOTE this keys the non-secret part of the config ONLY. The BYOK key itself is
 * never cached at any TTL — see resolveAiConfig. The exposure is residency, not
 * staleness, so a shorter TTL does not address it.
 */
export function aiConfigCacheKey(
  hospitalId: string,
  featureKey: string,
  maxTokens: number,
  keyOwner: KeyOwner,
): string {
  return `${hospitalId}:${keyOwner}:${featureKey}:${maxTokens}`;
}
