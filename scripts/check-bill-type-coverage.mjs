#!/usr/bin/env node
// Aumrti CI guard — bills.bill_type coverage.
//
// autoChargeService's standalone branch (src/lib/serviceBilling.ts) derives bill_type from
// serviceModule.toLowerCase().replace("_", ""). Until 20261106000038, a DB-level CHECK
// constraint (bills_bill_type_check) was the only thing verifying a transformed value was
// actually allowed — and it needed patching four times (20260520000002, 20260821000002,
// 20261106000004, 20261106000030) after a new MODULE_* constant shipped and nobody remembered
// to extend the allow-list. Every real call site wraps autoChargeService in `.catch(() => {})`,
// so a rejected insert was never once visible to anyone — KNOWN-BUG-222 and its three
// predecessors. The constraint is gone now (0-for-4 catching a real bad value, 4-for-4 blocking
// a legitimate one); this check replaces it, on the PR that introduces the gap instead of
// silently in production.
//
// Purely static: parses src/lib/serviceBilling.ts as text rather than importing it (that file
// pulls in the Supabase client and browser-oriented hooks that don't run under plain Node), the
// same convention check-db-contract.mjs and check-rls-coverage.mjs already use for SQL/TS source.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const SERVICE_BILLING = join(ROOT, "src", "lib", "serviceBilling.ts");

const src = readFileSync(SERVICE_BILLING, "utf8");

// Every `export const MODULE_XXX = "value";` declaration.
const moduleConstRe = /export const (MODULE_\w+)\s*=\s*"([^"]+)";/g;
const moduleConstants = [];
let m;
while ((m = moduleConstRe.exec(src))) {
  moduleConstants.push({ name: m[1], value: m[2] });
}

if (moduleConstants.length === 0) {
  console.error(
    "check-bill-type-coverage — found zero MODULE_* constants in serviceBilling.ts. " +
    "The parser regex is broken, or the constants moved to a different file.",
  );
  process.exit(1);
}

const billableMatch = src.match(/export const BILLABLE_MODULES\s*=\s*\[([\s\S]*?)\]\s*as const;/);
if (!billableMatch) {
  console.error(
    "check-bill-type-coverage — could not find a `BILLABLE_MODULES = [...] as const` array in " +
    "serviceBilling.ts. It may have been renamed or removed.",
  );
  process.exit(1);
}
const billableModules = new Set([...billableMatch[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]));

// The exact transform autoChargeService's standalone branch runs at runtime — real
// String.prototype.replace, not a reimplementation. Deliberately non-global: it must match the
// runtime's own behaviour exactly (including for a hypothetical two-underscore module name,
// where only the first underscore would strip), not a "corrected" version that would silently
// diverge from what actually executes.
const missing = [];
for (const { name, value } of moduleConstants) {
  const transformed = value.toLowerCase().replace("_", "");
  if (!billableModules.has(transformed)) {
    missing.push(`${name} = "${value}" -> "${transformed}"`);
  }
}

if (missing.length) {
  console.error(
    `check-bill-type-coverage — ${missing.length} MODULE_* constant(s) transform to a value not in BILLABLE_MODULES:`,
  );
  for (const line of missing) console.error(`  ! ${line}`);
  console.error(
    "\nautoChargeService's standalone branch would insert this exact bill_type. There is no " +
    "database-level CHECK constraint to catch it anymore (dropped in 20261106000038, after " +
    "recurring four times as a silent production failure) — add the transformed value to " +
    "BILLABLE_MODULES in src/lib/serviceBilling.ts.",
  );
  process.exit(1);
}

console.log(
  `check-bill-type-coverage passed — ${moduleConstants.length} MODULE_* constants, all covered ` +
  `by ${billableModules.size} BILLABLE_MODULES entries.`,
);
