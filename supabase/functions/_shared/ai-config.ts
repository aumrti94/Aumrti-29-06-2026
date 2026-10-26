// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkAIAllowed } from "./ai-entitlement.ts";
import { getUsdToInr } from "./platform-rate.ts";
import {
  aiConfigCacheKey,
  classifyAiFeature,
  decideKeySource,
  mayHospitalChooseModel,
  type ByokState,
  type KeyOwner,
} from "./byokPolicy.ts";

const isSafetyFeature = (featureKey: string): boolean =>
  classifyAiFeature(featureKey) === "safety";

// Thrown by resolveAiConfig when a hospital's "AI Features" master switch (or the
// per-feature toggle) withholds this call. Distinct from the "no config → null →
// env fallback" path: a disabled hospital must be BLOCKED, never fall through to a
// platform env key. Callers that don't catch it fail safe (500, no provider spend).
export class AIDisabledError extends Error {
  constructor(message = "AI features are disabled for this hospital.") {
    super(message);
    this.name = "AIDisabledError";
  }
}

/**
 * Thrown when a hospital has BYOK switched on but the call cannot run on their
 * own key — no active key row, or the BYOK state could not be read at all.
 *
 * A SIBLING OF AIDisabledError, FOR THE SAME REASON. Returning null here would
 * let callers fall through to `?? resolveAiConfigFromEnv()` and spend a platform
 * key on behalf of a hospital that contracted its own provider — sending patient
 * data to a vendor under a contract the hospital never signed, while the
 * hospital believes the opposite is happening. Throwing makes the failure
 * reach the clinician as "AI unavailable" instead, which is the correct and
 * visible outcome.
 *
 * Callers must surface this as a configuration problem the hospital's
 * administrator can fix — never as a clinical warning, and never by silently
 * returning an empty result (a clinician can read an empty AI panel as a
 * clinical finding rather than a system failure).
 */
export class BYOKUnavailableError extends Error {
  constructor(message = "This hospital's own AI provider key is unavailable.") {
    super(message);
    this.name = "BYOKUnavailableError";
  }
}

// The DB (platform_ai_provider_config.provider, and the platform UI dropdown) stores Azure as
// "azure_openai", but the maps + dispatch below are keyed on "azure". Without normalising, the
// service-key lookup returns undefined → the API key row is never fetched → resolveAiConfig()
// returns null → every feature reports "No AI provider configured" for Azure ONLY. Normalise
// once, here, so the two vocabularies can never diverge again.
export function normalizeProviderKey(provider: string | undefined | null): string {
  const p = String(provider || "");
  return p === "azure_openai" ? "azure" : p;
}

const PROVIDER_SERVICE_KEYS: Record<string, string> = {
  claude: "anthropic",
  openai: "openai",
  gemini: "gemini",
  perplexity: "perplexity",
  azure: "azure_openai",
  azure_openai: "azure_openai", // tolerate the raw DB value too
  openrouter: "openrouter",
};

const PROVIDER_ENV_KEYS: Record<string, string> = {
  claude: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
  perplexity: "PERPLEXITY_API_KEY",
  azure: "AZURE_OPENAI_API_KEY",
  azure_openai: "AZURE_OPENAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
};

const DEFAULT_MODELS: Record<string, string> = {
  claude: "claude-sonnet-4-6",
  openai: "gpt-4o",
  gemini: "gemini-2.0-flash",
  perplexity: "llama-3.1-sonar-large-128k-online",
  azure: "gpt-4o",
  azure_openai: "gpt-4o",
  openrouter: "google/gemini-2.5-flash",
};

export interface AiConfig {
  provider: string;
  model: string;
  apiKey: string;
  temperature: number;
  maxTokens: number;
  endpoint?: string;   // Azure: base URL (e.g. https://xxx.openai.azure.com)
  apiVersion?: string; // Azure: API version (e.g. 2024-02-01); blank uses the newer /openai/v1 surface
  apiStyle?: "chat_completions" | "responses"; // Azure: "responses" only valid when apiVersion is blank
  azureSurface?: string; // Azure: which Foundry surface — "auto"|"openai"|"anthropic"|"foundry_models"
  /**
   * Who to bill this call's cost to. Set by resolveAiConfig (which already
   * receives both identifiers) so that callAiChat/callAiChatWithUsage/
   * callAiVision meter automatically.
   *
   * Why it lives on the config rather than at each call site: before this,
   * only ai-proxy and ai-clinical-voice logged cost — the other ten AI edge
   * functions called providers straight through this module and their spend
   * was invisible, which made any AI budget meaningless. Attaching the
   * identity to the config makes metering the default rather than something
   * each new function has to remember.
   *
   * patientId / encounterId are OPTIONAL and set by the caller AFTER resolveAiConfig
   * returns (resolveAiConfig has no way to know them). They exist because ai-proxy
   * already writes both onto ai_usage_logs while this path did not — leaving every
   * dedicated-edge-function AI call unattributable to a patient, which is exactly what
   * Ananya's rule ("AI inputs/outputs involving PHI must be logged with a consent
   * reference") requires. Safe to set on the returned object: finalize() caches the
   * config WITHOUT a meter and attaches a fresh one per call, so mutating what you get
   * back touches a per-call spread, never the shared cache.
   */
  meter?: {
    hospitalId: string;
    featureKey: string;
    patientId?: string;
    encounterId?: string;
    /**
     * Whose credential actually served the call.
     *
     * An OBSERVATION taken from the resolved config, never re-derived from
     * `byok_enabled && entitled` at the logging site. If it restated config
     * INTENT instead, the alert meant to catch a BYOK hospital silently running
     * on a platform key would be structurally incapable of firing: it would
     * report `hospital` for a call that ran on `platform`.
     *
     * Drives two things in recordAiUsage: the row's provenance, and whether the
     * Aumrti wallet is debited at all.
     */
    keyOwner?: KeyOwner;
  };
}

// Azure AI Foundry serves different model families through different API surfaces:
//   • openai         → OpenAI-compatible /openai/v1 (GPT, and open models: Llama, DeepSeek, Mistral, Grok, Cohere…)
//   • anthropic      → /anthropic/v1/messages (Claude — Anthropic Messages shape, NOT OpenAI)
//   • foundry_models → /models/chat/completions?api-version= (serverless/partner deployments, OpenAI-shaped)
export type AzureSurface = "openai" | "anthropic" | "foundry_models";

// Azure output-token headroom. `max_output_tokens`/`max_tokens` is a CEILING, not a
// reservation — you're billed for tokens actually generated — so a generous cap costs nothing
// for well-behaved models and rescues the two ways Foundry models blow the caller's budget:
//   • reasoning models (gpt-5/o-series) bill HIDDEN reasoning against the same budget →
//     it's consumed before the answer starts → empty output → JSON.parse("") blows up;
//   • verbose/"thinking" models (e.g. Kimi-K2.5) simply run past the cap → TRUNCATED JSON.
// Both were observed live at exactly the caller's cap (1152 and 1200 of 1200). Applied to ALL
// Azure calls, not just name-matched reasoning models — the name pattern was too narrow.
// Twin of the helper in src/lib/azureFoundry.ts — keep in lockstep.
export function azureMaxOutputTokens(requested: number): number {
  return Math.max((Number(requested) || 0) * 4, 4000);
}

// Azure inference endpoints are ALWAYS the resource root (scheme + host) — the inference path
// (/openai/v1/…, /models/…, /anthropic/v1/…) is appended to it. Users frequently paste the
// Foundry *project* endpoint instead:
//   https://<res>.services.ai.azure.com/api/projects/<name>   ← Agents/SDK endpoint, NOT inference
// which builds broken URLs and makes EVERY Azure call 404. Normalise to the origin.
export function normalizeAzureEndpoint(endpoint: string | undefined): string {
  const raw = (endpoint || "").trim();
  if (!raw) return "";
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    return new URL(withScheme).origin;
  } catch {
    return raw.replace(/\/+$/, "");
  }
}

// Resolve "auto"/blank to a concrete surface: Claude deployments speak the Anthropic
// surface; everything else defaults to the OpenAI-compatible surface.
export function resolveAzureSurface(surface: string | undefined, model: string): AzureSurface {
  if (surface === "openai" || surface === "anthropic" || surface === "foundry_models") return surface;
  return /^claude/i.test(model || "") ? "anthropic" : "openai";
}

export function buildAzureUrl(cfg: {
  endpoint?: string; model: string; apiVersion?: string; apiStyle?: string; surface?: string;
}): { url: string; surface: AzureSurface; useV1: boolean; useResponses: boolean } {
  const endpoint = normalizeAzureEndpoint(cfg.endpoint);
  if (!endpoint) throw new Error("Azure OpenAI endpoint not configured");
  const surface = resolveAzureSurface(cfg.surface, cfg.model);
  if (surface === "anthropic") {
    return { url: `${endpoint}/anthropic/v1/messages`, surface, useV1: false, useResponses: false };
  }
  if (surface === "foundry_models") {
    const apiVersion = cfg.apiVersion || "2025-03-01-preview";
    return { url: `${endpoint}/models/chat/completions?api-version=${apiVersion}`, surface, useV1: false, useResponses: false };
  }
  // openai surface. With an API version → classic GA (deployment in URL). Responses API
  // only exists on the newer /openai/v1 surface, so it requires apiVersion to be blank.
  // Smart Auto: GPT-5 / o-series reasoning models are served ONLY via the Responses API on
  // Foundry (chat-completions 404s), so when the user left surface on "auto" we route them
  // there automatically. Explicit surface/apiStyle choices are always respected.
  const useV1 = !cfg.apiVersion;
  // Reasoning models are served ONLY by the Responses API on Azure — chat-completions 404s for
  // them — so route them there whether the surface was left on "auto" OR set explicitly to
  // "openai". (Honouring an explicit chat_completions choice here would always fail.)
  const reasoning = /^(o[0-9]|gpt-5)/i.test(cfg.model || "");
  const useResponses = useV1 && (cfg.apiStyle === "responses" || reasoning);
  const url = useResponses
    ? `${endpoint}/openai/v1/responses`
    : useV1
    ? `${endpoint}/openai/v1/chat/completions`
    : `${endpoint}/openai/deployments/${cfg.model}/chat/completions?api-version=${cfg.apiVersion}`;
  return { url, surface, useV1, useResponses };
}

export function azureHeaders(surface: AzureSurface, apiKey: string): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json", "api-key": apiKey };
  if (surface === "anthropic") {
    h["x-api-key"] = apiKey;
    h["anthropic-version"] = "2023-06-01";
  }
  return h;
}

// Azure Responses API returns output as a list of typed items rather than choices[0].message.content.
function extractResponsesOutputText(data: Record<string, unknown>): string {
  if (typeof data.output_text === "string") return data.output_text;
  const output = Array.isArray(data.output) ? data.output : [];
  const parts: string[] = [];
  for (const item of output as Record<string, unknown>[]) {
    if (item?.type !== "message" || !Array.isArray(item.content)) continue;
    for (const c of item.content as Record<string, unknown>[]) {
      if (c?.type === "output_text" && typeof c.text === "string") parts.push(c.text);
    }
  }
  return parts.join("");
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Resolve the GLOBAL (platform-controlled) AI config for a feature.
 *
 * AI configuration is no longer per-hospital: every hospital uses the single
 * global config managed at /platform (platform_ai_provider_config +
 * platform_ai_keys). `hospitalId` is retained in the signature for backwards
 * compatibility and call-site logging only — it is NOT used for resolution.
 *
 * Falls back to global_default if no feature-specific row found.
 * Returns null if no config or API key is available.
 */
export interface ResolveAiConfigOptions {
  /**
   * Entitlement already decided by the caller. Pass it when the caller has ALREADY run
   * checkAIAllowed for this same feature — otherwise this function re-runs it and the
   * request pays 4 extra serial DB queries to re-answer one boolean it already knows.
   */
  entitlement?: { allowed: boolean; reason?: string };
}

/**
 * Cache for the GLOBAL platform tables (platform_ai_provider_config / platform_ai_keys).
 *
 * These are platform-wide rows an admin edits maybe monthly, but every AI call was
 * re-reading them from scratch — up to 3 serial round trips per request, on the critical
 * path of a doctor watching a spinner. Same pattern as LEXICON_TTL_MS in medical-lexicon.ts.
 * Per-isolate; a config edit takes effect within the TTL, or immediately on a cold isolate.
 */
const AI_CONFIG_TTL_MS = 5 * 60 * 1000;
const aiConfigCache = new Map<string, { config: AiConfig | null; loadedAt: number }>();

/** Drop cached provider config — call after an admin writes new platform AI settings. */
export function invalidateAiConfigCache(): void {
  aiConfigCache.clear();
}

/**
 * Read the hospital's BYOK state.
 *
 * Returns `null` — meaning UNDETERMINED, never "not BYOK" — on any error. That
 * distinction is the whole point: decideKeySource fails closed on null, so a
 * transient DB error degrades AI rather than silently spending a platform key
 * for a hospital that contracted its own provider.
 *
 * A hospital with no row is a KNOWN state, not an unreadable one: no row means
 * never granted, which resolves to the platform key correctly.
 *
 * NOT CACHED. The 5-minute config TTL would mean that for 300 seconds after a
 * hospital flips BYOK on, their calls still run on the platform key — the rule
 * violated for five minutes, every time, by design. One indexed point-select
 * (~2-5ms) against a 10-20s LLM call is the right trade.
 */
async function loadByokState(
  sb: ReturnType<typeof createClient>,
  hospitalId: string,
): Promise<ByokState | null> {
  try {
    const { data, error } = await sb
      .from("hospital_ai_provider_config")
      .select("byok_enabled, provider, model_name")
      .eq("hospital_id", hospitalId)
      .maybeSingle();

    // Supabase returns errors as VALUES. Without this check an error object
    // would leave `data` null and read as "no row" → "not BYOK" → platform key.
    if (error) {
      // Code 42P01 = relation does not exist. Before the BYOK migration is
      // applied there is no table, and every hospital is legitimately
      // non-BYOK — that is a KNOWN state, not an unreadable one, so it must
      // not block every AI call on the platform.
      if ((error as { code?: string }).code === "42P01") {
        return { entitled: false, enabled: false, hasActiveKey: false };
      }
      return null;
    }

    if (!data) return { entitled: false, enabled: false, hasActiveKey: false };

    const row = data as Record<string, unknown>;
    const enabled = row.byok_enabled === true;

    // The `api_hub` entitlement is the grant. Resolved through the same
    // plan → add-on → override path as every other module, rather than a
    // second boolean on this row that RLS cannot protect.
    const entitled = enabled ? await isApiHubEntitled(sb, hospitalId) : false;
    if (entitled === null) return null;

    // Only look for a key when it can matter. An active key row for the
    // hospital's chosen provider is what makes BYOK usable.
    let hasActiveKey = false;
    if (entitled && enabled) {
      const provider = normalizeProviderKey(row.provider as string);
      const serviceKey = PROVIDER_SERVICE_KEYS[provider];
      if (!serviceKey) return { entitled, enabled, hasActiveKey: false };

      const { data: keyRow, error: keyErr } = await sb
        .from("hospital_ai_keys")
        .select("id")
        .eq("hospital_id", hospitalId)
        .eq("service_key", serviceKey)
        .eq("is_active", true)
        .maybeSingle();
      if (keyErr) return null;
      hasActiveKey = Boolean(keyRow);
    }

    return { entitled, enabled, hasActiveKey };
  } catch {
    return null;
  }
}

/**
 * Build an AiConfig from the HOSPITAL's own provider row and key.
 *
 * Never cached, and never falls back: every failure path here throws
 * BYOKUnavailableError rather than returning null, because null would let the
 * caller's `?? resolveAiConfigFromEnv()` tail spend a platform key.
 *
 * MODEL SELECTION IS NOT THE HOSPITAL'S, EXCEPT ON NON-CLINICAL FEATURES.
 * Key ownership and model choice are separate freedoms. The hospital's reasons
 * for BYOK — own contract, own bill, own DPA — need the first and none of the
 * second, while the second changes clinical correctness in ways this very file
 * documents: supportsPdfDocuments() exists because one provider silently
 * accepts a PDF it cannot read, answers from the text prompt alone, and bills
 * for it — producing confident, invented patient history on an extraction task.
 *
 * Until a validated per-feature-class model allow-list exists, the interim
 * allow-list is "the default model this provider is already run on in
 * production" — DEFAULT_MODELS. A hospital may still pick the PROVIDER (their
 * key only works with their own), but on a clinical or safety feature the model
 * within it is ours.
 */
async function resolveHospitalAiConfig(
  sb: ReturnType<typeof createClient>,
  hospitalId: string,
  featureKey: string,
  defaultMaxTokens: number,
): Promise<AiConfig> {
  const { data: cfgRow, error: cfgErr } = await sb
    .from("hospital_ai_provider_config")
    .select("provider, model_name, temperature, max_tokens")
    .eq("hospital_id", hospitalId)
    .maybeSingle();
  if (cfgErr || !cfgRow) {
    throw new BYOKUnavailableError(
      "This hospital's AI provider configuration could not be read.",
    );
  }

  const cfg = cfgRow as Record<string, unknown>;
  const provider = normalizeProviderKey(cfg.provider as string);
  const serviceKey = PROVIDER_SERVICE_KEYS[provider];
  if (!serviceKey) {
    throw new BYOKUnavailableError(
      `This hospital's configured AI provider (${String(cfg.provider ?? "none")}) is not supported.`,
    );
  }

  const { data: keyRow, error: keyErr } = await sb
    .from("hospital_ai_keys")
    .select("config")
    .eq("hospital_id", hospitalId)
    .eq("service_key", serviceKey)
    .eq("is_active", true)
    .maybeSingle();
  if (keyErr || !keyRow) {
    throw new BYOKUnavailableError(
      "This hospital's AI provider key is missing or inactive.",
    );
  }

  const keyCfg = (keyRow as { config?: Record<string, string> }).config ?? {};
  const apiKey = keyCfg.api_key;
  // Deliberately NO env-var fallback on this path. The platform env keys exist
  // for platform-operated hospitals; reaching for one here is exactly the
  // silent fallback the whole feature forbids.
  if (!apiKey) {
    throw new BYOKUnavailableError("This hospital's AI provider key is not set.");
  }

  const model = mayHospitalChooseModel(featureKey)
    ? ((cfg.model_name as string) || DEFAULT_MODELS[provider] || "gpt-4o")
    : (DEFAULT_MODELS[provider] || "gpt-4o");

  const base = {
    provider,
    model,
    apiKey,
    temperature: Number(cfg.temperature) || 0.3,
    maxTokens: Number(cfg.max_tokens) || defaultMaxTokens,
    meter: { hospitalId, featureKey, keyOwner: "hospital" as KeyOwner },
  } as AiConfig;

  if (provider === "azure") {
    return {
      ...base,
      endpoint: keyCfg.endpoint,
      apiVersion: keyCfg.api_version,
      apiStyle: keyCfg.api_style as AiConfig["apiStyle"],
      azureSurface: keyCfg.azure_surface,
    };
  }
  return base;
}

/**
 * Is the `api_hub` module entitled for this hospital?
 *
 * Returns null on an unreadable result so the caller can fail closed.
 * Mirrors the module-entitlement resolution used elsewhere: an explicit
 * per-hospital override wins over the plan default.
 */
async function isApiHubEntitled(
  sb: ReturnType<typeof createClient>,
  hospitalId: string,
): Promise<boolean | null> {
  try {
    const { data, error } = await sb
      .from("hospital_feature_overrides")
      .select("enabled")
      .eq("hospital_id", hospitalId)
      .eq("module_key", "api_hub")
      .maybeSingle();
    if (error) {
      if ((error as { code?: string }).code === "42P01") return false;
      return null;
    }
    // No override row means the grant was never made. api_hub is deliberately
    // NOT on by default on any plan — moving a hospital's AI spend off Aumrti's
    // contract is a commercial decision, never a self-serve setting.
    return data ? (data as { enabled?: boolean }).enabled === true : false;
  } catch {
    return null;
  }
}

export async function resolveAiConfig(
  hospitalId: string,
  featureKey: string,
  defaultMaxTokens = 1000,
  options: ResolveAiConfigOptions = {},
): Promise<AiConfig | null> {
  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // AI entitlement floor — the single server-side choke every ai-config-based edge
  // function funnels through. THROW (don't return null) when the hospital's AI switch
  // withholds this: null would let callers fall through to `?? resolveAiConfigFromEnv()`
  // and spend on a platform key anyway. checkAIAllowed fails open, so this only throws
  // on a definite disabled decision — never on a transient DB error.
  const gate = options.entitlement ?? await checkAIAllowed(sb, hospitalId, featureKey);
  if (!gate.allowed) throw new AIDisabledError(gate.reason);

  // ── Which key pays for this call ──────────────────────────────────────────
  // Decided BEFORE any config read, because the answer determines which tables
  // are even consulted. Safety-class features short-circuit without a BYOK
  // lookup at all, so a DB blip cannot touch deterioration or interaction
  // checking. See _shared/byokPolicy.ts for the full rule and its state walk.
  const byokState: ByokState | null = isSafetyFeature(featureKey)
    ? null // never consulted for safety class; decideKeySource ignores it
    : await loadByokState(sb, hospitalId);

  const decision = decideKeySource({ featureKey, byok: byokState });
  if (decision.blocked) throw new BYOKUnavailableError(decision.reason);
  const keyOwner: KeyOwner = decision.owner;

  if (keyOwner === "hospital") {
    // Deliberately NOT cached and deliberately not sharing the platform path:
    // the hospital's credential is read fresh on every call. The exposure this
    // avoids is residency, not staleness — a cached credential can be served to
    // whichever tenant next warms the isolate, and no TTL makes that safe.
    return await resolveHospitalAiConfig(sb, hospitalId, featureKey, defaultMaxTokens);
  }

  // Hospital-dimensioned AND owner-dimensioned. The previous key was
  // `${featureKey}:${defaultMaxTokens}` — no tenant component — so two
  // hospitals calling the same feature at the same token count shared one
  // entry, and whichever warmed the isolate first donated its API key to the
  // other. Logged correctly against each hospital, with nothing to detect it by.
  const cacheKey = aiConfigCacheKey(hospitalId, featureKey, defaultMaxTokens, keyOwner);
  const cached = aiConfigCache.get(cacheKey);
  if (cached && Date.now() - cached.loadedAt < AI_CONFIG_TTL_MS) {
    // Re-attach the meter for THIS caller. The cached copy deliberately has none — see
    // finalize() below. Returning it bare would leave the call unmetered and unbilled.
    return cached.config ? { ...cached.config, meter: { hospitalId, featureKey, keyOwner } } : null;
  }

  // Feature-specific config first, then global_default — global tables, no hospital_id.
  // ONE query for both: these used to be two sequential maybeSingle() calls, and because
  // most feature_key rows are never seeded the first reliably missed, so nearly every
  // request paid for both.
  const { data: cfgRows } = await sb
    .from("platform_ai_provider_config")
    .select("feature_key, provider, model_name, temperature, max_tokens")
    .in("feature_key", [featureKey, "global_default"])
    .eq("is_active", true);

  const rows = (cfgRows ?? []) as Record<string, unknown>[];
  const cfg: Record<string, unknown> | null =
    rows.find(r => r.feature_key === featureKey) ??
    rows.find(r => r.feature_key === "global_default") ??
    null;

  if (!cfg) {
    aiConfigCache.set(cacheKey, { config: null, loadedAt: Date.now() });
    return null;
  }

  // The DB stores Azure as "azure_openai" but everything below is keyed on "azure" —
  // normalise once so the service-key lookup and the Azure branch actually fire.
  const provider = normalizeProviderKey(cfg.provider as string);

  // Get API key (and extra fields) from the global platform_ai_keys
  const serviceKey = PROVIDER_SERVICE_KEYS[provider];
  let keyCfgData: Record<string, string> | undefined;

  if (serviceKey) {
    const { data: keyCfg } = await sb
      .from("platform_ai_keys")
      .select("config")
      .eq("service_key", serviceKey)
      .eq("is_active", true)
      .maybeSingle();
    keyCfgData = keyCfg?.config as Record<string, string> | undefined;
  }

  // Cache the resolved config WITHOUT the meter, then attach a fresh meter per call.
  // `meter` carries hospitalId; caching it would bill one hospital's usage to whichever
  // hospital happened to warm the isolate first.
  const finalize = (resolved: Omit<AiConfig, "meter">): AiConfig => {
    aiConfigCache.set(cacheKey, { config: resolved as AiConfig, loadedAt: Date.now() });
    return { ...resolved, meter: { hospitalId, featureKey, keyOwner } } as AiConfig;
  };

  // Azure OpenAI requires endpoint + deployment in addition to API key
  if (provider === "azure") {
    const azApiKey = keyCfgData?.api_key || Deno.env.get("AZURE_OPENAI_API_KEY") || undefined;
    if (!azApiKey) return null;
    return finalize({
      provider: "azure",
      // Per-feature model wins over the drawer's single deployment — otherwise EVERY Azure
      // feature is pinned to one deployment and the platform UI's per-feature Model box does
      // nothing (every other provider already honours cfg.model_name). Features without their
      // own row still inherit the drawer deployment via the global_default fallback above.
      model: (cfg.model_name as string) || keyCfgData?.deployment_name || keyCfgData?.deployment || DEFAULT_MODELS.azure,
      apiKey: azApiKey,
      endpoint: keyCfgData?.endpoint || Deno.env.get("AZURE_OPENAI_ENDPOINT") || undefined,
      apiVersion: keyCfgData?.api_version || Deno.env.get("AZURE_OPENAI_API_VERSION") || undefined,
      apiStyle: (keyCfgData?.api_style as AiConfig["apiStyle"]) || undefined,
      azureSurface: keyCfgData?.azure_surface || undefined,
      temperature: Number(cfg.temperature) || 0.3,
      maxTokens: Number(cfg.max_tokens) || defaultMaxTokens,
    });
  }

  let apiKey: string | undefined = keyCfgData?.api_key;

  // Env var fallback
  if (!apiKey) {
    const envKey = PROVIDER_ENV_KEYS[provider];
    apiKey = envKey ? (Deno.env.get(envKey) || undefined) : undefined;
  }

  if (!apiKey) return null;

  return finalize({
    provider,
    model: (cfg.model_name as string) || DEFAULT_MODELS[provider] || "gpt-4o",
    apiKey,
    temperature: Number(cfg.temperature) || 0.3,
    maxTokens: Number(cfg.max_tokens) || defaultMaxTokens,
  });
}

/**
 * Resolve AI config from env vars only (no hospitalId required).
 * Tries providers in order: openai → claude → gemini.
 *
 * `hospitalId`/`featureKey` are optional but should be passed wherever the
 * caller knows them: this is the `?? resolveAiConfigFromEnv()` fallback that
 * fires when no DB config exists, and it still spends real money on a platform
 * key. Omitting them makes that spend unattributable.
 */
export function resolveAiConfigFromEnv(
  defaultMaxTokens = 1000,
  hospitalId?: string,
  featureKey?: string,
): AiConfig | null {
  const priorities = [
    { provider: "openai",     envKey: "OPENAI_API_KEY",     model: DEFAULT_MODELS.openai },
    { provider: "claude",     envKey: "ANTHROPIC_API_KEY",  model: DEFAULT_MODELS.claude },
    { provider: "gemini",     envKey: "GEMINI_API_KEY",     model: DEFAULT_MODELS.gemini },
    { provider: "perplexity", envKey: "PERPLEXITY_API_KEY", model: DEFAULT_MODELS.perplexity },
  ];
  const meter = hospitalId && featureKey ? { hospitalId, featureKey } : undefined;
  for (const { provider, envKey, model } of priorities) {
    const apiKey = Deno.env.get(envKey);
    if (apiKey) return { provider, model, apiKey, temperature: 0.3, maxTokens: defaultMaxTokens, meter };
  }
  return null;
}

export interface ChatUsage {
  tokensInput: number;
  tokensOutput: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}

// USD cost per 1000 tokens (approximate) — mirrors ai-proxy/index.ts's
// COST_PER_1K table so a given model's estimated cost matches whichever
// path logged it. Falls back to a Claude-Sonnet-ish rate for unlisted models.
const COST_PER_1K: Record<string, { input: number; output: number; cacheWrite: number; cacheRead: number }> = {
  "claude-sonnet-4-6":          { input: 0.003,   output: 0.015,  cacheWrite: 0.00375, cacheRead: 0.0003 },
  "claude-sonnet-4-20250514":   { input: 0.003,   output: 0.015,  cacheWrite: 0.00375, cacheRead: 0.0003 },
  "claude-3-5-sonnet-20241022": { input: 0.003,   output: 0.015,  cacheWrite: 0.00375, cacheRead: 0.0003 },
  "claude-3-5-haiku-20241022":  { input: 0.0008,  output: 0.004,  cacheWrite: 0.001,   cacheRead: 0.00008 },
  "claude-3-opus-20240229":     { input: 0.015,   output: 0.075,  cacheWrite: 0.01875, cacheRead: 0.0015 },
  "gpt-4o":                     { input: 0.005,   output: 0.015,  cacheWrite: 0,       cacheRead: 0.0025 },
  "gpt-4o-mini":                { input: 0.00015, output: 0.0006, cacheWrite: 0,       cacheRead: 0.000075 },
  "gemini-2.0-flash":           { input: 0.0001,  output: 0.0004, cacheWrite: 0,       cacheRead: 0 },
};

// Azure Foundry deployment names are arbitrary (e.g. "claude-sonnet-5", "gpt-4o",
// "DeepSeek-V3.2"), so fall back to a family prefix when there's no exact match.
function pricingForModel(model: string) {
  if (COST_PER_1K[model]) return COST_PER_1K[model];
  const m = (model || "").toLowerCase();
  const SONNET = { input: 0.003, output: 0.015, cacheWrite: 0.00375, cacheRead: 0.0003 };
  if (m.includes("haiku")) return { input: 0.0008, output: 0.004, cacheWrite: 0.001, cacheRead: 0.00008 };
  if (m.includes("opus")) return { input: 0.015, output: 0.075, cacheWrite: 0.01875, cacheRead: 0.0015 };
  if (m.startsWith("claude") || m.includes("sonnet")) return SONNET;
  if (m.startsWith("gpt-4o-mini") || m.includes("mini")) return COST_PER_1K["gpt-4o-mini"];
  if (m.startsWith("gpt") || m.startsWith("o1") || m.startsWith("o3")) return COST_PER_1K["gpt-4o"];
  if (m.startsWith("gemini")) return COST_PER_1K["gemini-2.0-flash"];
  return SONNET;
}

export function estimateAiCostUsd(model: string, usage: ChatUsage): number {
  const pricing = pricingForModel(model);
  return (
    (usage.tokensInput / 1000) * pricing.input +
    (usage.tokensOutput / 1000) * pricing.output +
    (usage.cacheCreationTokens / 1000) * pricing.cacheWrite +
    (usage.cacheReadTokens / 1000) * pricing.cacheRead
  );
}

/**
 * Record one AI call against the hospital that caused it.
 *
 * Writes both the raw row (`ai_usage_logs`) and the pre-aggregate
 * (`ai_cost_daily`, via the same `upsert_ai_cost_daily` RPC ai-proxy uses), so
 * budget and dashboard queries can read the rollup without scanning raw logs.
 *
 * Fire-and-forget by design: metering must never be able to fail a clinical AI
 * call. A lost log row costs a rounding error in a budget; a thrown error here
 * would cost a discharge summary.
 */
// Exported so the streaming path can meter a streamed call exactly like a buffered one —
// callAiChatStream deliberately does not meter itself, since the caller owns the timing.
export async function recordAiUsage(
  meter: {
    hospitalId: string;
    featureKey: string;
    patientId?: string;
    encounterId?: string;
    keyOwner?: KeyOwner;
  },
  provider: string,
  model: string,
  usage: ChatUsage,
  latencyMs?: number,
): Promise<void> {
  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    // Provider rate cards are USD-per-1K-tokens, so the raw figure is computed
    // in USD and kept for invoice reconciliation. The rupee figure is frozen
    // alongside it at the rate in force now — everything a human sees, and
    // every budget comparison, uses the INR value.
    // BYOK: the hospital pays its own provider directly, so Aumrti has no cost
    // to record and — critically — no wallet to debit. Before this branch,
    // recordAiUsage called upsert_ai_cost_daily and debit_ai_wallet_for_usage
    // UNCONDITIONALLY, so a BYOK hospital would have paid its provider AND had
    // its Aumrti prepaid wallet drawn down for the same call.
    const byok = meter.keyOwner === "hospital";

    const costUsd = estimateAiCostUsd(model, usage);
    const costInr = costUsd * (await getUsdToInr(sb));
    const cacheHit = usage.cacheReadTokens > 0;

    await sb.from("ai_usage_logs").insert({
      hospital_id: meter.hospitalId,
      feature_key: meter.featureKey,
      provider,
      model_name: model,
      tokens_input: usage.tokensInput,
      tokens_output: usage.tokensOutput,
      cache_creation_tokens: usage.cacheCreationTokens,
      cache_read_tokens: usage.cacheReadTokens,
      cache_hit: cacheHit,
      // NULL, not 0, on BYOK. Aumrti does not know the hospital's negotiated
      // rate, and a 0 would be indistinguishable from a free safety-class call
      // while quietly deflating Aumrti's own cost dashboards.
      estimated_cost_usd: byok ? null : costUsd,
      estimated_cost_inr: byok ? null : costInr,
      // Provenance of the credential that actually served the call.
      key_owner: meter.keyOwner ?? "platform",
      latency_ms: latencyMs ?? null,
      success: true,
      // Null for the callers that don't know them — matches ai-proxy, which has always
      // written these two. Columns added in 20260607000001_fix_missing_tables.sql.
      patient_id: meter.patientId ?? null,
      encounter_id: meter.encounterId ?? null,
    });

    // Both aggregates answer "what does Aumrti meter and bill". A call the
    // hospital paid their own provider for is neither, so BYOK stops here —
    // the raw ai_usage_logs row above is still written, so consumption stays
    // visible to both parties and to the hospital's own transparency screen.
    if (byok) return;

    await sb.rpc("upsert_ai_cost_daily", {
      p_hospital_id:       meter.hospitalId,
      p_date:              new Date().toISOString().split("T")[0],
      p_feature_key:       meter.featureKey,
      p_provider:          provider,
      p_tokens_input:      usage.tokensInput,
      p_tokens_output:     usage.tokensOutput,
      p_cache_read_tokens: usage.cacheReadTokens,
      p_cache_hit:         cacheHit,
      p_cost_usd:          costUsd,
      p_cost_inr:          costInr,
    });

    // Draw the metered cost from the prepaid AI wallet — but only the slice
    // above the plan's included monthly allowance. Runs AFTER the ai_cost_daily
    // upsert so the month-to-date figure includes this call. Safety-class AI is
    // never billed. Fire-and-forget: a wallet error must never fail an AI call.
    await sb.rpc("debit_ai_wallet_for_usage", {
      p_hospital_id: meter.hospitalId,
      p_feature_key: meter.featureKey,
      p_cost_inr:    costInr,
    });
  } catch (err) {
    console.error("AI usage metering failed (non-fatal):", err instanceof Error ? err.message : String(err));
  }
}

export interface ChatResult {
  content: string;
  usage: ChatUsage;
}

// Every provider reports usage under a slightly different shape/field name —
// this normalizes all of them to the one ChatUsage shape ai_usage_logs uses.
function extractUsage(data: Record<string, unknown>, provider: string): ChatUsage {
  const usage = (data.usage ?? data.usageMetadata ?? {}) as Record<string, unknown>;
  const num = (v: unknown): number => (typeof v === "number" ? v : 0);

  if (provider === "gemini") {
    return {
      tokensInput: num(usage.promptTokenCount),
      tokensOutput: num(usage.candidatesTokenCount),
      cacheCreationTokens: 0,
      cacheReadTokens: num((usage as any).cachedContentTokenCount),
    };
  }
  if (provider === "claude") {
    return {
      tokensInput: num((usage as any).input_tokens),
      tokensOutput: num((usage as any).output_tokens),
      cacheCreationTokens: num((usage as any).cache_creation_input_tokens),
      cacheReadTokens: num((usage as any).cache_read_input_tokens),
    };
  }
  // OpenAI, Azure (chat_completions + responses), Perplexity, OpenRouter are
  // all OpenAI-compatible: prompt_tokens/completion_tokens, or the newer
  // Responses API's input_tokens/output_tokens.
  return {
    tokensInput: num((usage as any).prompt_tokens ?? (usage as any).input_tokens),
    tokensOutput: num((usage as any).completion_tokens ?? (usage as any).output_tokens),
    cacheCreationTokens: 0,
    cacheReadTokens: num((usage as any).prompt_tokens_details?.cached_tokens ?? (usage as any).input_tokens_details?.cached_tokens),
  };
}

// Build the full Azure request (url + headers + body) for a text chat across all
// three Foundry surfaces. Callers with image attachments (ai-proxy) resolve the
// surface via resolveAzureSurface()/buildAzureUrl() and shape content themselves.
export function buildAzureRequest(
  cfg: { endpoint?: string; model: string; apiKey: string; apiVersion?: string; apiStyle?: string; surface?: string },
  messages: ChatMessage[],
  opts: { maxTokens: number; temperature: number },
): { url: string; headers: Record<string, string>; body: Record<string, unknown>; surface: AzureSurface; useResponses: boolean } {
  const { url, surface, useV1, useResponses } = buildAzureUrl(cfg);
  const headers = azureHeaders(surface, cfg.apiKey);
  const systemMsg = messages.find((m) => m.role === "system");
  const chatMsgs = messages.filter((m) => m.role !== "system");
  // GPT-5 / o-series reasoning models reject the `temperature` sampling param on Azure.
  const reasoning = /^(o[0-9]|gpt-5)/i.test(cfg.model || "");
  let body: Record<string, unknown>;
  if (surface === "anthropic") {
    body = {
      model: cfg.model,
      max_tokens: azureMaxOutputTokens(opts.maxTokens),
      temperature: opts.temperature,
      ...(systemMsg ? { system: systemMsg.content } : {}),
      messages: chatMsgs.map((m) => ({ role: m.role, content: m.content })),
    };
  } else if (surface === "foundry_models") {
    body = {
      model: cfg.model,
      max_tokens: azureMaxOutputTokens(opts.maxTokens),
      temperature: opts.temperature,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    };
  } else if (useResponses) {
    body = {
      model: cfg.model,
      input: chatMsgs.map((m) => ({ role: m.role, content: m.content })),
      ...(systemMsg ? { instructions: systemMsg.content } : {}),
      max_output_tokens: azureMaxOutputTokens(opts.maxTokens),
      ...(reasoning ? { reasoning: { effort: "low" } } : { temperature: opts.temperature }),
    };
  } else {
    body = {
      ...(useV1 ? { model: cfg.model } : {}),
      max_tokens: azureMaxOutputTokens(opts.maxTokens),
      ...(reasoning ? {} : { temperature: opts.temperature }),
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    };
  }
  return { url, headers, body, surface, useResponses };
}

// Parse an Azure response into text + normalized usage, per surface.
export function parseAzureResponse(
  surface: AzureSurface,
  useResponses: boolean,
  data: Record<string, unknown>,
): { content: string; usage: ChatUsage } {
  if (surface === "anthropic") {
    const blocks = Array.isArray((data as any).content) ? (data as any).content : [];
    const content = blocks.filter((c: any) => c?.type === "text").map((c: any) => c.text).join("");
    const u = ((data as any).usage ?? {}) as Record<string, unknown>;
    const n = (v: unknown) => (typeof v === "number" ? v : 0);
    return {
      content,
      usage: {
        tokensInput: n(u.input_tokens),
        tokensOutput: n(u.output_tokens),
        cacheCreationTokens: n(u.cache_creation_input_tokens),
        cacheReadTokens: n(u.cache_read_input_tokens),
      },
    };
  }
  const content = useResponses ? extractResponsesOutputText(data) : ((data as any).choices?.[0]?.message?.content || "");
  // A Responses payload with no message item means the model produced nothing usable — almost
  // always a reasoning model that burned max_output_tokens on hidden reasoning. Fail with the
  // real reason instead of returning "" and letting the caller's JSON.parse throw a misleading
  // "Failed to parse AI response as JSON".
  if (useResponses && !content) {
    const status = (data as any).status ?? "unknown";
    const reason = (data as any).incomplete_details?.reason;
    throw new Error(
      `Azure returned no output text (status=${status}${reason ? `, reason=${reason}` : ""}). ` +
      `Reasoning models (gpt-5/o-series) spend max_output_tokens on hidden reasoning — raise max tokens or lower reasoning effort.`,
    );
  }
  return { content, usage: extractUsage(data, "azure") };
}

/**
 * Call the configured AI provider with chat messages. Returns the response
 * text AND token/cache usage, normalized across providers — use this over
 * callAiChat() when the caller logs cost/usage (e.g. to ai_usage_logs).
 */
/**
 * Provider dispatch. Has one return per provider branch, which is exactly why
 * metering does NOT live here — see the exported wrapper below.
 */
/**
 * Streaming chat. Emits text deltas as they arrive and returns the full text at the end.
 *
 * WHY: a ~1200-token structured note takes 10-20 s to generate, and the doctor had zero
 * feedback for all of it — one spinner, then everything at once. Streaming lets the form
 * fill in field by field while the model is still writing.
 *
 * Provider support is narrow on purpose: claude and the OpenAI-compatible providers, which
 * covers the configured defaults. `supportsStreaming()` below is the guard, and EVERY caller
 * must keep the buffered path as a fallback — a provider that cannot stream, or a stream
 * that breaks mid-flight, must still produce a complete note.
 *
 * Usage/metering is deliberately NOT handled here; the caller meters the final text so a
 * streamed call is billed exactly like a buffered one.
 */
export function supportsStreaming(config: AiConfig): boolean {
  const p = normalizeProviderKey(config.provider);
  return p === "claude" || p === "openai" || p === "openrouter";
}

export async function callAiChatStream(
  config: AiConfig,
  messages: ChatMessage[],
  onDelta: (text: string) => void,
  maxTokens?: number,
  temperature?: number,
): Promise<ChatResult> {
  const maxTok = maxTokens ?? config.maxTokens;
  const temp = temperature ?? config.temperature;
  const provider = normalizeProviderKey(config.provider);

  let url: string;
  let headers: Record<string, string>;
  let body: Record<string, unknown>;

  if (provider === "claude") {
    const systemMsg = messages.find((m) => m.role === "system");
    const chatMsgs = messages.filter((m) => m.role !== "system");
    url = "https://api.anthropic.com/v1/messages";
    headers = {
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    };
    body = {
      model: config.model,
      max_tokens: maxTok,
      temperature: temp,
      stream: true,
      ...(systemMsg ? { system: systemMsg.content } : {}),
      messages: chatMsgs.map((m) => ({ role: m.role, content: m.content })),
    };
  } else if (provider === "openai" || provider === "openrouter") {
    url = provider === "openrouter"
      ? "https://openrouter.ai/api/v1/chat/completions"
      : "https://api.openai.com/v1/chat/completions";
    headers = { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" };
    body = {
      model: config.model,
      max_tokens: maxTok,
      temperature: temp,
      stream: true,
      stream_options: { include_usage: true },
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    };
  } else {
    throw new Error(`Provider ${config.provider} does not support streaming`);
  }

  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  if (!res.ok || !res.body) throw new Error(`${provider} stream error ${res.status}: ${await res.text()}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  const usage: ChatUsage = { tokensInput: 0, tokensOutput: 0, cacheCreationTokens: 0, cacheReadTokens: 0 };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by a blank line; a frame can straddle two chunks, so only
    // complete frames are consumed and the remainder is carried forward.
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);

      for (const line of frame.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;

        let evt: Record<string, any>;
        try { evt = JSON.parse(payload); } catch { continue; }

        if (provider === "claude") {
          if (evt.type === "content_block_delta" && evt.delta?.text) {
            content += evt.delta.text;
            onDelta(evt.delta.text);
          } else if (evt.type === "message_start" && evt.message?.usage) {
            usage.tokensInput = evt.message.usage.input_tokens ?? 0;
            usage.cacheReadTokens = evt.message.usage.cache_read_input_tokens ?? 0;
            usage.cacheCreationTokens = evt.message.usage.cache_creation_input_tokens ?? 0;
          } else if (evt.type === "message_delta" && evt.usage?.output_tokens) {
            usage.tokensOutput = evt.usage.output_tokens;
          }
        } else {
          const delta = evt.choices?.[0]?.delta?.content;
          if (delta) { content += delta; onDelta(delta); }
          if (evt.usage) {
            usage.tokensInput = evt.usage.prompt_tokens ?? usage.tokensInput;
            usage.tokensOutput = evt.usage.completion_tokens ?? usage.tokensOutput;
          }
        }
      }
    }
  }

  // Some providers omit usage on the stream; fall back to a rough estimate so a streamed
  // call is never silently unbilled.
  if (!usage.tokensOutput) usage.tokensOutput = Math.ceil(content.length / 4);
  if (!usage.inputTokens) {
    usage.inputTokens = Math.ceil(messages.reduce((n, m) => n + m.content.length, 0) / 4);
  }
  return { content, usage };
}

async function callAiChatWithUsageRaw(
  config: AiConfig,
  messages: ChatMessage[],
  maxTokens?: number,
  temperature?: number,
): Promise<ChatResult> {
  const maxTok = maxTokens ?? config.maxTokens;
  const temp = temperature ?? config.temperature;

  if (normalizeProviderKey(config.provider) === "azure") {
    const { url, headers, body, surface, useResponses } = buildAzureRequest(
      {
        endpoint: config.endpoint,
        model: config.model,
        apiKey: config.apiKey,
        apiVersion: config.apiVersion,
        apiStyle: config.apiStyle,
        surface: config.azureSurface,
      },
      messages,
      { maxTokens: maxTok, temperature: temp },
    );
    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`Azure error ${res.status}: ${await res.text()}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
    return parseAzureResponse(surface, useResponses, data);
  }

  if (config.provider === "claude") {
    const systemMsg = messages.find((m) => m.role === "system");
    const chatMsgs = messages.filter((m) => m.role !== "system");
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: maxTok,
        temperature: temp,
        ...(systemMsg ? { system: systemMsg.content } : {}),
        messages: chatMsgs.map((m) => ({ role: m.role, content: m.content })),
      }),
    });
    if (!res.ok) throw new Error(`Claude error ${res.status}: ${await res.text()}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return { content: data.content?.[0]?.text || "", usage: extractUsage(data, "claude") };
  }

  if (config.provider === "openai") {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.model,
        max_tokens: maxTok,
        temperature: temp,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      }),
    });
    if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${await res.text()}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return { content: data.choices?.[0]?.message?.content || "", usage: extractUsage(data, "openai") };
  }

  if (config.provider === "gemini") {
    const systemMsg = messages.find((m) => m.role === "system");
    const chatMsgs = messages.filter((m) => m.role !== "system");
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(systemMsg ? { system_instruction: { parts: [{ text: systemMsg.content }] } } : {}),
        contents: chatMsgs.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
        // thinkingBudget:0 disables Gemini 2.5/3 "thinking" — without it the model
        // burns the output budget on hidden reasoning (slow + MAX_TOKENS truncation).
        generationConfig: { maxOutputTokens: maxTok, temperature: temp, thinkingConfig: { thinkingBudget: 0 } },
      }),
    });
    if (res.status === 429) throw new Error("AI quota exceeded — the AI provider key has hit its rate limit / quota. Check provider billing.");
    if (!res.ok) throw new Error(`Gemini error ${res.status}: ${await res.text()}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return { content: data.candidates?.[0]?.content?.parts?.[0]?.text || "", usage: extractUsage(data, "gemini") };
  }

  if (config.provider === "perplexity") {
    const res = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.model,
        max_tokens: maxTok,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      }),
    });
    if (!res.ok) throw new Error(`Perplexity error ${res.status}: ${await res.text()}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return { content: data.choices?.[0]?.message?.content || "", usage: extractUsage(data, "perplexity") };
  }

  if (config.provider === "openrouter") {
    // OpenRouter: one key, OpenAI-compatible API, vendor-namespaced models
    // (e.g. google/gemini-2.5-flash, anthropic/claude-3.7-sonnet, perplexity/sonar).
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json", "X-Title": "Aumrti HMS" },
      body: JSON.stringify({
        model: config.model,
        max_tokens: maxTok,
        temperature: temp,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      }),
    });
    if (res.status === 429) throw new Error("AI quota exceeded — the AI provider key has hit its rate limit / quota. Check provider billing.");
    if (!res.ok) throw new Error(`OpenRouter error ${res.status}: ${await res.text()}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return { content: data.choices?.[0]?.message?.content || "", usage: extractUsage(data, "openrouter") };
  }

  throw new Error(`Unsupported AI provider: ${config.provider}`);
}

/**
 * Call the configured AI provider with chat messages, returning the response
 * text AND normalised token/cache usage.
 *
 * Also METERS the call when the config carries a `meter` context — which
 * resolveAiConfig always sets. Metering sits in this single wrapper rather than
 * in each of the six provider branches, so adding a provider cannot silently
 * reintroduce unmetered spend.
 *
 * The recording is fire-and-forget and swallows its own errors: a failed log
 * must never fail the AI call it was measuring.
 */
export async function callAiChatWithUsage(
  config: AiConfig,
  messages: ChatMessage[],
  maxTokens?: number,
  temperature?: number,
): Promise<ChatResult> {
  const startedAt = Date.now();
  const result = await callAiChatWithUsageRaw(config, messages, maxTokens, temperature);
  if (config.meter) {
    void recordAiUsage(config.meter, config.provider, config.model, result.usage, Date.now() - startedAt);
  }
  return result;
}

/**
 * Call the configured AI provider with chat messages. Returns the response
 * text only (backward-compatible wrapper — existing callers are unaffected
 * by the usage-tracking addition above). Metering happens inside
 * callAiChatWithUsage, so plain callAiChat callers are metered too.
 */
export async function callAiChat(
  config: AiConfig,
  messages: ChatMessage[],
  maxTokens?: number,
  temperature?: number,
): Promise<string> {
  const { content } = await callAiChatWithUsage(config, messages, maxTokens, temperature);
  return content;
}

/**
 * Call the configured AI provider with a vision (image + text) input.
 * Supports openai, gemini, claude, and azure (all Foundry surfaces) providers.
 */
/**
 * Provider dispatch for vision. Returns content plus usage so the exported
 * wrapper can meter; metering does not live here for the same reason as chat —
 * one exit point instead of five.
 */
async function callAiVisionRaw(
  config: AiConfig,
  base64Image: string,
  mediaType: string,
  textPrompt: string,
  maxTokens?: number,
): Promise<ChatResult> {
  const maxTok = maxTokens ?? config.maxTokens;

  if (config.provider === "openai") {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.model,
        max_tokens: maxTok,
        messages: [{
          role: "user",
          content: [
            { type: "image_url", image_url: { url: `data:${mediaType};base64,${base64Image}` } },
            { type: "text", text: textPrompt },
          ],
        }],
      }),
    });
    if (!res.ok) throw new Error(`OpenAI vision error ${res.status}`);
    const data = await res.json();
    return { content: data.choices?.[0]?.message?.content || "", usage: extractUsage(data, "openai") };
  }

  if (config.provider === "gemini") {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: mediaType, data: base64Image } },
            { text: textPrompt },
          ],
        }],
        generationConfig: { maxOutputTokens: maxTok },
      }),
    });
    if (!res.ok) throw new Error(`Gemini vision error ${res.status}`);
    const data = await res.json();
    return { content: data.candidates?.[0]?.content?.parts?.[0]?.text || "", usage: extractUsage(data, "gemini") };
  }

  if (config.provider === "claude") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: maxTok,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: base64Image } },
            { type: "text", text: textPrompt },
          ],
        }],
      }),
    });
    if (!res.ok) throw new Error(`Claude vision error ${res.status}`);
    const data = await res.json();
    return { content: data.content?.[0]?.text || "", usage: extractUsage(data, "claude") };
  }

  if (normalizeProviderKey(config.provider) === "azure") {
    const { url, surface, useResponses } = buildAzureUrl({
      endpoint: config.endpoint,
      model: config.model,
      apiVersion: config.apiVersion,
      apiStyle: config.apiStyle,
      surface: config.azureSurface,
    });
    const headers = azureHeaders(surface, config.apiKey);
    let body: Record<string, unknown>;
    if (surface === "anthropic") {
      body = {
        model: config.model,
        max_tokens: maxTok,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: base64Image } },
            { type: "text", text: textPrompt },
          ],
        }],
      };
    } else if (useResponses) {
      body = {
        model: config.model,
        max_output_tokens: maxTok,
        input: [{
          role: "user",
          content: [
            { type: "input_text", text: textPrompt },
            { type: "input_image", image_url: `data:${mediaType};base64,${base64Image}` },
          ],
        }],
      };
    } else {
      // openai chat (/openai/v1 or classic deployment) or foundry_models — both OpenAI-shaped.
      body = {
        ...(surface === "foundry_models" || !config.apiVersion ? { model: config.model } : {}),
        max_tokens: maxTok,
        messages: [{
          role: "user",
          content: [
            { type: "image_url", image_url: { url: `data:${mediaType};base64,${base64Image}` } },
            { type: "text", text: textPrompt },
          ],
        }],
      };
    }
    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`Azure vision error ${res.status}: ${await res.text()}`);
    const data = await res.json();
    if (surface === "anthropic") {
      return { content: data.content?.[0]?.text || "", usage: extractUsage(data, "claude") };
    }
    const content = useResponses ? extractResponsesOutputText(data) : (data.choices?.[0]?.message?.content || "");
    return { content, usage: extractUsage(data, "azure") };
  }

  throw new Error(`Provider ${config.provider} does not support vision input`);
}

/**
 * Call the configured AI provider with a vision (image + text) input.
 *
 * Metered like chat when the config carries a `meter` context. Vision is among
 * the most expensive calls the platform makes, so leaving it unmetered would
 * understate exactly the spend that matters most.
 */
export async function callAiVision(
  config: AiConfig,
  base64Image: string,
  mediaType: string,
  textPrompt: string,
  maxTokens?: number,
): Promise<string> {
  const startedAt = Date.now();
  const result = await callAiVisionRaw(config, base64Image, mediaType, textPrompt, maxTokens);
  if (config.meter) {
    void recordAiUsage(config.meter, config.provider, config.model, result.usage, Date.now() - startedAt);
  }
  return result.content;
}

/**
 * A document the model reads natively — an image, or a PDF as a first-class
 * document block rather than base64 stuffed into a text prompt.
 *
 * Mirrors the `attachments` contract ai-proxy has served the BROWSER since it was
 * written (src/lib/aiProvider.ts AIAttachment). This module — the path every
 * dedicated edge function uses — never had one: callAiVision takes a SINGLE image
 * and shapes it as an image block, so a PDF sent through it is handed to Claude as
 * `{type:"image", media_type:"application/pdf"}`, which the API rejects outright.
 * Any server-side feature that had to read a PDF was therefore blocked from this
 * path entirely.
 */
export interface AiAttachment {
  kind: "image" | "pdf";
  mediaType: string; // "image/png", "image/jpeg", "application/pdf"
  data: string;      // base64, WITHOUT the "data:...;base64," prefix
}

/**
 * Can this config read a PDF as a document, rather than needing it rasterised
 * to images first?
 *
 * Callers must check BEFORE spending: OpenAI's chat-completions surface silently
 * accepts a request whose PDF attachment it cannot see, answers from the text
 * prompt alone, and bills for it. On a transcription task that produces a
 * confident, entirely invented page — the worst possible failure here. Better to
 * refuse the call than to pay for a hallucination.
 */
export function supportsPdfDocuments(config: AiConfig): boolean {
  const p = normalizeProviderKey(config.provider);
  if (p === "claude" || p === "gemini") return true;
  // Azure: only the Anthropic surface takes document blocks. The OpenAI-compatible
  // and foundry_models surfaces have the same blind spot as OpenAI proper.
  if (p === "azure") return resolveAzureSurface(config.azureSurface, config.model) === "anthropic";
  return false;
}

async function callAiDocumentRaw(
  config: AiConfig,
  attachments: AiAttachment[],
  textPrompt: string,
  maxTokens?: number,
  temperature?: number,
): Promise<ChatResult> {
  const maxTok = maxTokens ?? config.maxTokens;
  const temp = temperature ?? config.temperature;
  const provider = normalizeProviderKey(config.provider);
  const hasPdf = attachments.some((a) => a.kind === "pdf");

  if (hasPdf && !supportsPdfDocuments(config)) {
    throw new Error(
      `Provider ${config.provider} (model ${config.model}) cannot read PDF documents. ` +
      `Route this feature to Claude or Gemini in platform_ai_provider_config.`,
    );
  }

  if (provider === "claude") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
        // Document blocks live behind this beta flag. Harmless when no PDF is
        // attached, so it is unconditional rather than another branch to get wrong.
        "anthropic-beta": "pdfs-2024-09-25",
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: maxTok,
        temperature: temp,
        messages: [{
          role: "user",
          content: [
            ...attachments.map((a) =>
              a.kind === "pdf"
                ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: a.data } }
                : { type: "image", source: { type: "base64", media_type: a.mediaType, data: a.data } }),
            { type: "text", text: textPrompt },
          ],
        }],
      }),
    });
    if (!res.ok) throw new Error(`Claude document error ${res.status}: ${await res.text()}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return { content: data.content?.[0]?.text || "", usage: extractUsage(data, "claude") };
  }

  if (provider === "gemini") {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            ...attachments.map((a) => ({
              inline_data: { mime_type: a.kind === "pdf" ? "application/pdf" : a.mediaType, data: a.data },
            })),
            { text: textPrompt },
          ],
        }],
        // thinkingBudget:0 for the same reason as callAiChatWithUsageRaw: hidden
        // reasoning is charged against the output budget and truncates the answer.
        generationConfig: { maxOutputTokens: maxTok, temperature: temp, thinkingConfig: { thinkingBudget: 0 } },
      }),
    });
    if (res.status === 429) throw new Error("AI quota exceeded — the AI provider key has hit its rate limit / quota. Check provider billing.");
    if (!res.ok) throw new Error(`Gemini document error ${res.status}: ${await res.text()}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return { content: data.candidates?.[0]?.content?.parts?.[0]?.text || "", usage: extractUsage(data, "gemini") };
  }

  if (provider === "openai" || provider === "openrouter") {
    // Images only — the PDF case already threw above.
    const url = provider === "openrouter"
      ? "https://openrouter.ai/api/v1/chat/completions"
      : "https://api.openai.com/v1/chat/completions";
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json", ...(provider === "openrouter" ? { "X-Title": "Aumrti HMS" } : {}) },
      body: JSON.stringify({
        model: config.model,
        max_tokens: maxTok,
        temperature: temp,
        messages: [{
          role: "user",
          content: [
            ...attachments.map((a) => ({ type: "image_url", image_url: { url: `data:${a.mediaType};base64,${a.data}` } })),
            { type: "text", text: textPrompt },
          ],
        }],
      }),
    });
    if (!res.ok) throw new Error(`${provider} document error ${res.status}: ${await res.text()}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return { content: data.choices?.[0]?.message?.content || "", usage: extractUsage(data, provider) };
  }

  if (provider === "azure") {
    const { url, surface, useResponses } = buildAzureUrl({
      endpoint: config.endpoint,
      model: config.model,
      apiVersion: config.apiVersion,
      apiStyle: config.apiStyle,
      surface: config.azureSurface,
    });
    const headers = azureHeaders(surface, config.apiKey);
    if (surface === "anthropic") headers["anthropic-beta"] = "pdfs-2024-09-25";

    let body: Record<string, unknown>;
    if (surface === "anthropic") {
      body = {
        model: config.model,
        max_tokens: azureMaxOutputTokens(maxTok),
        temperature: temp,
        messages: [{
          role: "user",
          content: [
            ...attachments.map((a) =>
              a.kind === "pdf"
                ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: a.data } }
                : { type: "image", source: { type: "base64", media_type: a.mediaType, data: a.data } }),
            { type: "text", text: textPrompt },
          ],
        }],
      };
    } else if (useResponses) {
      body = {
        model: config.model,
        max_output_tokens: azureMaxOutputTokens(maxTok),
        input: [{
          role: "user",
          content: [
            { type: "input_text", text: textPrompt },
            ...attachments.map((a) => ({ type: "input_image", image_url: `data:${a.mediaType};base64,${a.data}` })),
          ],
        }],
      };
    } else {
      body = {
        ...(surface === "foundry_models" || !config.apiVersion ? { model: config.model } : {}),
        max_tokens: azureMaxOutputTokens(maxTok),
        messages: [{
          role: "user",
          content: [
            ...attachments.map((a) => ({ type: "image_url", image_url: { url: `data:${a.mediaType};base64,${a.data}` } })),
            { type: "text", text: textPrompt },
          ],
        }],
      };
    }

    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`Azure document error ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return parseAzureResponse(surface, useResponses, data);
  }

  throw new Error(`Provider ${config.provider} does not support document input`);
}

/**
 * Read one or more documents (images and/or PDFs) with a text instruction.
 *
 * Metered like every other call in this module when the config carries a `meter`.
 * Document reads are the most expensive calls the platform makes — a 15-page PDF
 * costs roughly what a hundred text prompts do — so leaving this path unmetered
 * would understate precisely the spend that matters most (Ishaan).
 */
export async function callAiDocument(
  config: AiConfig,
  attachments: AiAttachment[],
  textPrompt: string,
  maxTokens?: number,
  temperature?: number,
): Promise<ChatResult> {
  const startedAt = Date.now();
  const result = await callAiDocumentRaw(config, attachments, textPrompt, maxTokens, temperature);
  if (config.meter) {
    void recordAiUsage(config.meter, config.provider, config.model, result.usage, Date.now() - startedAt);
  }
  return result;
}

/**
 * Call the configured provider with an AUDIO + text input.
 *
 * Used by the voice-scribe rescue tier: when a dictation segment scores badly, the
 * audio is re-heard by a multimodal model that CAN recover a drug name the Indic ASR
 * destroyed — something no text-only pass can do, because the information is simply
 * gone from the transcript.
 *
 * PROVIDER SUPPORT IS GENUINELY NARROW, and callers must treat failure as normal:
 *   gemini  — inline_data, the only provider here that accepts browser webm directly
 *   openai  — input_audio, but ONLY wav/mp3; MediaRecorder produces webm, so a webm
 *             payload is rejected up front rather than sent and billed for nothing
 *   others  — Claude has no audio input at all
 * Every caller must treat a throw as "rescue unavailable" and keep the original
 * result. This is an optional upgrade, never a dependency.
 */
export async function callAiAudio(
  config: AiConfig,
  base64Audio: string,
  mediaType: string,
  textPrompt: string,
  maxTokens?: number,
): Promise<string> {
  const startedAt = Date.now();
  const maxTok = maxTokens ?? config.maxTokens;
  let result: ChatResult;

  if (config.provider === "gemini") {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: mediaType, data: base64Audio } },
            { text: textPrompt },
          ],
        }],
        generationConfig: { maxOutputTokens: maxTok, temperature: 0.1 },
      }),
    });
    if (!res.ok) throw new Error(`Gemini audio error ${res.status}: ${await res.text()}`);
    const data = await res.json();
    result = {
      content: data.candidates?.[0]?.content?.parts?.[0]?.text || "",
      usage: extractUsage(data, "gemini"),
    };
  } else if (config.provider === "openai") {
    const format = mediaType.includes("wav") ? "wav" : mediaType.includes("mp3") || mediaType.includes("mpeg") ? "mp3" : null;
    if (!format) {
      throw new Error(`OpenAI audio input supports wav/mp3 only, got ${mediaType}`);
    }
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.model,
        max_tokens: maxTok,
        messages: [{
          role: "user",
          content: [
            { type: "input_audio", input_audio: { data: base64Audio, format } },
            { type: "text", text: textPrompt },
          ],
        }],
      }),
    });
    if (!res.ok) throw new Error(`OpenAI audio error ${res.status}`);
    const data = await res.json();
    result = { content: data.choices?.[0]?.message?.content || "", usage: extractUsage(data, "openai") };
  } else {
    throw new Error(`Provider ${config.provider} does not support audio input`);
  }

  if (config.meter) {
    void recordAiUsage(config.meter, config.provider, config.model, result.usage, Date.now() - startedAt);
  }
  return result.content;
}
