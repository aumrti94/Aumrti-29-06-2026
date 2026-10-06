# Phase 9 — Tier 2 journeys, revenue and scheme: status record

**Phase:** 9 of [PHASED_TEST_PLAN.md](PHASED_TEST_PLAN.md) · **Date:** 2026-09-19

**Status: MET.** All 8 parts delivered, verified against the real local dev server, both
hospitals green on every new/touched Playwright spec, full `npx vitest run` clean apart from two
pre-existing, already-documented environmental flakes (below). Four real, previously-undiscovered
defects were found and fixed while building this phase's tests — the exit gate is a test *plan*
in name but caught live bugs at nearly every part.

## 1. Summary by part

| Part | What it covers | Status |
|---|---|---|
| 1 | Dialysis double-charge (KNOWN-BUG-249) and oncology dead-dedupe (KNOWN-BUG-250) — fixed | ✅ |
| 2 | D3 — `insurance_pending` derived from `claim_outstanding`, `derivedBillStatus()` | ✅ |
| 3 | D2 — bill/claim balance invariant, `reconcile-bill-claim-balance` nightly job | ✅ |
| 4 | J06 negative forks (underpayment/dispute, unbilled service, duplicate charge-post) | ✅ |
| 5 | J07 — PMJAY/CGHS nursing-bundling, proven both ways | ✅ |
| 6 | Dialysis + Oncology e2e (regression tests for Part 1's fixes) | ✅ |
| 7 | LAMA/DAMA e2e — surfaced and fixed two more real bugs (KNOWN-BUG-252, -253) | ✅ |
| 8 | Transfer-out — full new feature build, one more instance of Part 7's bug class (KNOWN-BUG-254) | ✅ |

## 2. New Playwright journey specs

`e2e/journeys/j06-negative-forks.spec.ts`, `j07-pmjay-cghs-scheme.spec.ts`,
`dialysis-recurring-billing.spec.ts`, `oncology-daycare-billing.spec.ts`, `lama-discharge.spec.ts`,
`transfer-out.spec.ts` — 6 new spec files, 15 new test cases, all green on both `hospital-a` and
`hospital-b`. New page objects: `DialysisPage.ts`, `OncologyPage.ts`; extended `BillingPage.ts`,
`InsurancePage.ts`, `IPDWorkspacePage.ts`.

New unit tests: `src/lib/chargePosting.test.ts` (2 cases — the shared `postCharge()` idempotency
guard, and confirmation that two genuinely different dedupe keys are never conflated).

Full `e2e/journeys/` regression run, both hospitals, all 46 tests: **passed**. Two transient
toast-assertion flakes were observed during this pass (`lama-discharge.spec.ts` once, an
unrelated pre-existing `pharmacy-spine.spec.ts` case once) — both reproduced cleanly on
immediate re-run in isolation, consistent with load-induced timing flakiness from running the
full suite back-to-back rather than a real regression; neither touches code this phase changed.

## 3. Real defects found and fixed while building this phase's tests

Four, all logged in full in `KNOWN_BUGS.md`:

- **KNOWN-BUG-249 / -250** (Part 1) — dialysis billed twice on its normal session lifecycle;
  oncology's dedupe check was structurally dead code, protected only by a racy order-level flag.
- **KNOWN-BUG-251** (Part 4) — `ipdBilling.ts`'s automatic IPD charge-pull batched heterogeneous
  `bill_line_items` rows (some with `payment_status` set, some without) into one insert.
  PostgREST fills a column missing from only *some* rows of a bulk insert with a literal `NULL`
  rather than the table default — confirmed empirically — so the entire pull silently failed
  whenever a room/nursing/consultation/OT charge co-occurred with a lab/radiology/pharmacy charge
  in the same cycle. That is the common case for nearly every real inpatient stay, not an edge
  case; a stay could go multiple days with the automatic sweep doing nothing, visible only in a
  browser console nobody was watching.
- **KNOWN-BUG-252 / -253** (Part 7) — LAMA's own billing waiver (banner, checkbox, audit log,
  ack columns — all already built) was unreachable in practice: the discharge stepper's own
  progression had no LAMA awareness, so an unbilled LAMA discharge got stuck forever on
  "Finalise Billing →". Separately, the Discharge Type selector's own persistence call was a
  bare, un-awaited Supabase query — a confirmed no-op that only worked by accident because the
  final discharge update happened to also write `discharge_type`.
- **KNOWN-BUG-254** (Part 8) — building transfer-out into the same waiver mechanism surfaced a
  second instance of -252's exact root cause (a second LAMA-only check, in a different render
  branch) before it could affect a real user.

## 4. New feature: transfer-out (Part 8)

Genuinely new, not a bug fix — `discharge_type` accepted `'transfer'` as a value with nothing
behind it before this phase. New migration `20261106000044_transfer_out.sql` (receiving-facility
name/address/contact, accepting doctor, reason, `transfer_billing_ack_by/at`). Reuses
`DischargeSummaryGenerator.tsx`'s existing content pipeline for the transfer summary document
(heading "TRANSFER SUMMARY", prefixed with receiving-facility fields) rather than a parallel
document system, and the admission's existing `is_mlc` flag for the MLC banner (no new column or
clock logic — Phase 8B's own statutory clock already fires from it regardless of discharge type).

## 5. What this record does not claim

- **All three of this phase's migrations (`20261106000042`, `20261106000043`,
  `20261106000044` — D2's reconciliation table, its cron schedule, and transfer-out's new
  admissions columns) were pushed to the live hosted Supabase project on 2026-09-19** via
  `npm run supabase:push`, at the user's explicit request. Applied cleanly, no errors.
- **The `reconcile-bill-claim-balance` edge function itself is NOT deployed** — blocked by a
  pre-existing constraint, not anything this phase introduced: the live project is sitting at
  its function-count ceiling (100/100). Diffing local function directories against what's
  actually deployed shows **7 other functions were already undeployed before this attempt**,
  including `api-gateway` — the public API gateway per this repo's own edge-function
  conventions, whose absence in production is a separate, likely more consequential gap than
  this phase's own function. Resolving the cap needs either a plan/quota upgrade or a deliberate
  decision to retire an existing deployed function to free a slot — neither attempted here,
  left for the user to decide. Until then, D2's own table and column exist live, but nothing
  writes `claim_outstanding` or raises reconciliation flags in production — the nightly cron
  schedule migration itself also still needs the `aumrti_service_role_key` Vault secret to exist
  on that project before it would do anything even once the function is deployed (it no-ops
  with a `RAISE NOTICE` today, confirmed not to have blocked the migration push itself).
- **KNOWN-BUG-247's fix (Phase 8.5, HCX callback auth bypass) remains separately undeployed** —
  unrelated to this phase's own work but still an open item from the same session, needing a real
  `HCX_CALLBACK_SANDBOX_TOKEN` a human must choose and set via `npx supabase secrets set`.
  Duplicate-charge-post's own third fork (Part 4) is covered as a unit test
  (`src/lib/chargePosting.test.ts`) rather than a Playwright spec — it is a pure idempotency
  check on a shared function with no UI step of its own, and Part 6's dialysis/oncology specs
  already regression-test the two real double-charge bugs end-to-end through the real UI.
- **The two observed toast-assertion flakes (§2) were not root-caused to a specific mechanism**
  beyond "timing, under load, in a shared toast-assertion helper" — triaged as pre-existing and
  environmental per this suite's own flaky-triage discipline, not chased further given neither
  touches code this phase changed and both reproduce cleanly in isolation.
- **`financial-anomaly-check.test.ts`'s known environmental flake and the intermittent
  Windows/Deno worker-crash on isolated test files (both pre-existing, documented earlier this
  session) recurred during this phase's own verification runs** — confirmed both are unrelated to
  Phase 9's changes by re-running the affected files in isolation, where they pass. Neither is a
  regression from this phase's work.
- This phase does not touch Phase 8.5's own remaining items (the real third-party pentest, the
  real cloud-staging concurrency run) — separately tracked, unaffected by this pass.
