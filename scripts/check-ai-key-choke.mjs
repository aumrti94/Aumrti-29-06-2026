#!/usr/bin/env node
/**
 * check:ai-key-choke — the guard that fails on code NOT YET WRITTEN.
 *
 * WHAT IT PROTECTS
 *
 * When a hospital runs BYOK, every AI call for that hospital must use THEIR
 * provider key. Not "usually". If any path reaches a platform key instead, the
 * call still succeeds, the clinician sees a normal result, the usage row records
 * the correct hospital — and patient data has gone to a vendor under a contract
 * the hospital never signed, while the hospital believes the opposite. There is
 * no runtime symptom. A test cannot catch a path nobody thought to test.
 *
 * So the rule is enforced structurally: exactly ONE module may resolve a
 * provider credential, and this script fails the build if any other file does.
 * Its real job is the 25th AI edge function, written six months from now by
 * someone who copies the pattern from a neighbour — the neighbour's pattern will
 * be correct, and if they reach for an env key directly, CI stops them.
 *
 * WHY A BASELINE RATHER THAN A CLEAN FAIL
 *
 * Thirteen edge functions already end in `?? resolveAiConfigFromEnv(...)`, and
 * six read `platform_ai_keys` directly. Those are not acceptable — each is a
 * live BYOK leak path — but failing main on day one would mean this guard never
 * gets switched on at all. They are recorded below and the build fails if the
 * count GROWS. Same stance as KNOWN_MISSING_FUNCTIONS in check-db-contract.mjs:
 * the list is a debt register, and it may only ever shrink.
 *
 * Fixing one means deleting its entry here. Do not add entries.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const FUNCTIONS_DIR = join(ROOT, "supabase", "functions");

/** The ONLY module permitted to resolve a provider credential. */
const CHOKE_POINT = "supabase/functions/_shared/ai-config.ts";

/**
 * Files that still reach a provider credential outside the choke point.
 * Each is a live BYOK leak path. THIS LIST MUST ONLY SHRINK.
 *
 * The three `scan-*` functions and `ai-clinical-voice` are the ones to fix
 * first: scan-invoice passes no hospital context at all, and ai-clinical-voice
 * holds four separate direct reads of platform_ai_keys.
 */
const KNOWN_LEAK_PATHS = new Set([
  "supabase/functions/ai-clarifying-questions/index.ts",
  "supabase/functions/ai-clinical-voice/index.ts",
  "supabase/functions/ai-differential-diagnosis/index.ts",
  "supabase/functions/ai-discharge-summary/index.ts",
  "supabase/functions/ai-history-digest/index.ts",
  "supabase/functions/ai-history-ingest/index.ts",
  "supabase/functions/ai-nabh-assistant/index.ts",
  "supabase/functions/ai-nabh-indicator-alert/index.ts",
  "supabase/functions/ai-proxy/index.ts",
  "supabase/functions/ai-resolve-orders/index.ts",
  "supabase/functions/bhashini-patient-transcribe/index.ts",
  "supabase/functions/bhashini-transcribe/index.ts",
  "supabase/functions/sarvam-transcribe/index.ts",
  "supabase/functions/scan-drug-list/index.ts",
  "supabase/functions/scan-invoice/index.ts",
  "supabase/functions/scan-lab-tests/index.ts",
]);

/** Vendor credential env names. Reading one of these IS resolving a credential. */
const VENDOR_ENV_KEYS = [
  "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY", "PERPLEXITY_API_KEY",
  "AZURE_OPENAI_API_KEY", "OPENROUTER_API_KEY", "SARVAM_API_KEY", "BHASHINI_API_KEY",
];

/** Tables holding provider credentials. */
const KEY_TABLES = ["platform_ai_keys", "hospital_ai_keys"];

function walk(dir, acc = []) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.ts$/.test(e.name)) acc.push(p);
  }
  return acc;
}

const violations = [];
const staleBaseline = new Set(KNOWN_LEAK_PATHS);

for (const file of walk(FUNCTIONS_DIR)) {
  const rel = relative(ROOT, file).replace(/\\/g, "/");
  if (rel === CHOKE_POINT) continue;

  // Strip comments so prose explaining a historical leak is not read as one.
  const code = readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/[^\n]*/gm, " ");

  const reasons = [];

  for (const envKey of VENDOR_ENV_KEYS) {
    if (new RegExp(`Deno\\.env\\.get\\(\\s*["'\`]${envKey}["'\`]`).test(code)) {
      reasons.push(`reads Deno.env.get("${envKey}") directly`);
    }
  }
  for (const table of KEY_TABLES) {
    if (new RegExp(`\\.from\\(\\s*["'\`]${table}["'\`]`).test(code)) {
      reasons.push(`reads the ${table} table directly`);
    }
  }
  if (/resolveAiConfigFromEnv\s*\(/.test(code)) {
    reasons.push("calls resolveAiConfigFromEnv() — the platform-key fallback");
  }

  if (reasons.length === 0) continue;

  if (KNOWN_LEAK_PATHS.has(rel)) {
    staleBaseline.delete(rel);
  } else {
    violations.push({ rel, reasons });
  }
}

let failed = false;

if (violations.length) {
  failed = true;
  console.error(
    `\ncheck-ai-key-choke FAILED — ${violations.length} file(s) resolve a provider ` +
    `credential outside ${CHOKE_POINT}:`,
  );
  for (const v of violations) {
    console.error(`  - ${v.rel}`);
    for (const r of v.reasons) console.error(`      ${r}`);
  }
  console.error(
    "\nWhen a hospital runs BYOK, every call must use THEIR key. A path that reaches a\n" +
    "platform key instead does not throw, does not log an error, and does not look wrong\n" +
    "to the clinician — patient data simply goes to a vendor the hospital never contracted.\n" +
    `\nResolve the config through resolveAiConfig() in ${CHOKE_POINT} instead. It applies\n` +
    "the BYOK decision (supabase/functions/_shared/byokPolicy.ts) and throws\n" +
    "BYOKUnavailableError rather than falling back.",
  );
}

// The baseline must track reality in both directions: an entry that no longer
// has a violation means the leak was fixed and the register was not updated.
// Left alone, the list silently stops meaning anything.
if (staleBaseline.size) {
  failed = true;
  console.error(
    `\ncheck-ai-key-choke FAILED — ${staleBaseline.size} stale KNOWN_LEAK_PATHS entry(ies):`,
  );
  for (const s of staleBaseline) console.error(`  - ${s}  (no longer leaks — delete this entry)`);
  console.error("\nDelete them from KNOWN_LEAK_PATHS in scripts/check-ai-key-choke.mjs.");
}

if (failed) process.exit(1);

console.log(
  `check-ai-key-choke passed — ${CHOKE_POINT} is the only credential resolver; ` +
  `${KNOWN_LEAK_PATHS.size} known leak path(s) remaining, none new.`,
);
