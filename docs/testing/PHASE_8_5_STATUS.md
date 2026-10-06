# Phase 8.5 — Penetration test and load: status record

**Phase:** 8.5 of [PHASED_TEST_PLAN.md](PHASED_TEST_PLAN.md) §8.5 · **Date:** 2026-09-19

**Status: NOT MET, by design — not a phase completion record.** Phase 8.5's own two exit-gate
items — a third-party penetration test and a 40-user concurrency run on cloud staging — both need
infrastructure this environment does not have (cloud staging) and, for the pentest half, named
independent security professionals (Ananya on RLS/OWASP, Prakash on the Aadhaar/ABHA path) doing
work no amount of local engineering can substitute for. This record covers what *was* buildable
locally instead, at the user's explicit request: a local approximation of the concurrency claim,
and an engineering self-review of the exact five surfaces the plan scopes to the real pentest —
prep work intended to reduce findings when that real pentest happens, not a replacement for it.

---

## 1. What this is not

- **Not the third-party penetration test.** No independent security review occurred. Nothing here
  should be read as satisfying that gate.
- **Not the cloud-staging concurrency run.** The load test below runs against local Supabase — same
  Postgres/PostgREST/RLS engine, not the same environment, and not the same scale guarantee.
- **No cloud staging, ABDM sandbox, real SMS/WhatsApp send, or third-party pentest was exercised** —
  identical to every other phase's disclosed limitation this whole testing effort has carried.

## 2. Local concurrency approximation — [e2e/load/concurrency-isolation.test.ts](../../e2e/load/concurrency-isolation.test.ts)

Three real-concurrency tests, run via `npx vitest run e2e/load/concurrency-isolation.test.ts`,
firing genuinely simultaneous writes through `tenantClient()` (real RLS-scoped sessions, not
service-role) against both hospitals at once:

| Test | What it proves |
|---|---|
| 40 concurrent OPD token issuances (20+20, one shared doctor per hospital — the worst case for the atomic sequence generator) | No lost writes, no duplicate `opd_tokens.token_number` despite every write in a hospital contending on the same `opd_token_sequences` row; hospital A's RLS-scoped read never sees hospital B's concurrently-written rows, and vice versa |
| 40 concurrent standalone bill creations (20+20) | No lost writes, no duplicate `bills.bill_number` under the same kind of contention on the bills numbering trigger |
| 15 concurrent inserts sharing one `dedupe_key` | Collapse to exactly 1 `clinical_alerts` row — the dedupe constraint holds under a REAL race, not the sequential "save it, then save it again" pattern every existing dedupe test in this repo uses, which cannot by construction catch two callers both passing an existence check before either commits |

All three pass. This is genuine, new signal: no existing test in this codebase exercised true
concurrent writes before this pass, only sequential retries — and a race condition is,
definitionally, a bug that only shows up under real concurrency. It does not prove the cloud
staging gate; it proves the specific atomic-numbering and dedupe mechanisms this codebase already
built for exactly this problem (`opd_token_sequence`, the bills numbering trigger, the
`clinical_alerts` dedupe constraint) hold under real contention, not just in design.

## 3. Engineering self-review of the pentest-scoped surfaces

Five surfaces, matching the plan's own scope. One real, high-severity finding; the rest confirmed
solid on direct inspection, not assumed.

### Cross-tenant access — RLS audit completed

KNOWN-BUG-232 (2026-09-15) flagged "13 more files" with the same hand-rolled pre-decoupling RLS
predicate as `partograph_entries`, none audited. This session (two passes, same day) closed every
one of them out:

| Outcome | Tables |
|---|---|
| Fixed today (KNOWN-BUG-244) | `pmjay_preauth_requests`, `package_station_logs`, `cghs_echs_beneficiaries` |
| Fixed today (KNOWN-BUG-248) | `emr_template_definitions`, `patient_encounter_templates`, `patient_template_responses`, `demand_forecasts`, `procurement_recommendations` |
| Already fixed by their own dedicated later migration | `lab_calibration_records` (`20261008000034`), `ipd_advances` (`20261008000011`) |
| Confirmed genuinely harmless — a second, correctly-scoped policy already coexists | `asset_register`, `depreciation_ledger`, `emi_plans`, `emi_installments`, `payment_links` |

Zero of the original 13 remain unaudited. `patient_encounter_templates`/`patient_template_responses`
(clinical documentation keyed to a real patient, not just admin config) were the most severe of
the two newly-fixed groups.

Also directly verified, not assumed: the control-plane admin surface's RLS boundary
(`is_aumrti_admin()`, see §4) and `hospitals`' own anon-readable "branding" policy (`USING
(is_active = true)`, scoped `TO anon` — confirmed this does not extend to `authenticated`
non-admin sessions, which stay correctly restricted to their own hospital only).

### ABHA/Aadhaar path — no new findings

Ten `abdm-*` edge functions reviewed for caller verification and Aadhaar handling. This surface has
already had substantial prior scrutiny (dense "Found via Phase 4 isolation audit" / "Found via
Phase 6 edge-function testing" comments throughout) — spot-checking `abdm-gateway-token`
specifically (the one function with no caller-hospital-check indicators on a first pass) confirmed
it was already hardened to service-role-only in a prior phase, per its own comment trail. No
unresolved item in `KNOWN_BUGS.md`'s Open table touches this surface as a security concern (one
unrelated S3 dead-UI-setting entry, KNOWN-BUG-159, is the only open ABDM item at all).

### Control-plane admin surface — confirmed solid, not assumed

Initial concern: `PlatformShell`/`PlatformGuard` (client-side redirect via `useAumrtiAdmin()`) is
the only gate visible from the route tree — `/platform/*` isn't wrapped in the standard `RG`
(RoleGuard) every other route uses. Traced the actual security boundary rather than trusting the
UI: `is_aumrti_admin()` (`SECURITY DEFINER`, checks `aumrti_admins.auth_user_id = auth.uid() AND
is_active = true`) backs real RLS policies on every table the platform pages query —
`aumrti_admin_read_all_hospitals`/`_users`/`_branches` (`20260601160003`) and
`hospital_sub_aumrti_all` (`20260601150001`), each OR'd alongside the existing "own hospital only"
policy. A regular hospital staffer's session genuinely cannot read cross-tenant platform data by
calling the underlying tables directly (e.g. via devtools), even though the client-side guard alone
would not have stopped them. `admin-impersonate-start` and `update-oauth-providers` (the two
highest-privilege control-plane actions) both independently verify the caller against
`aumrti_admins.is_active` before doing anything.

### Edge Function auth — one real finding, fixed

**KNOWN-BUG-247, S1.** `hcx-callback-receiver`'s sandbox fallback path (reachable whenever a
hospital has not yet configured `HCX_HOSPITAL_PRIVATE_KEY_JWK` — presently every hospital on the
platform) accepted **any unauthenticated plain-JSON POST** and processed it as a genuine NHA
claim/pre-auth adjudication — no JWT (`verify_jwt = false`, required so NHA's real gateway can
reach it), no signature, no encryption check. This was not an oversight: KNOWN-BUG-185(a)'s own fix
(2026-09-13) explicitly left this path unauthenticated, reasoning "no HCX crypto configured yet"
implied nothing real was at stake — a reasoning that doesn't hold, since a hospital's
`insurance_claims`/`insurance_pre_auth` rows are real and consequential the moment staff use the
claims module at all, independent of whether HCX encryption has been configured. Fixed by gating
the sandbox path behind `HCX_CALLBACK_SANDBOX_TOKEN`, an Aumrti-internal shared secret checked via
a new header — fails closed (`503`) if unconfigured, so an operator who hasn't set it up gets a
clear rejection rather than silent open access. Full write-up and verification in
`docs/testing/KNOWN_BUGS.md`'s KNOWN-BUG-247 entry.

Every other `verify_jwt = false` function (`razorpay-webhook`, `razorpay-subscription-webhook`,
`abdm-hip-callback`) confirmed to carry a real signature/JWT check of its own — `api-gateway` is the
one legitimate public-gateway exception, matching the edge-function skill's own stated rule for
what may disable platform-level JWT verification.

### File/export endpoints — no new findings

`export-drug-chart`, `export-lab-reports`, `export-nursing-notes` all independently verify
`admission.hospital_id === callerHospitalId` before exporting. `generate-invoice` (subscription
invoices) is already restricted to service-role-only per a Phase 4 isolation-audit fix. `fhir-export`
resolves the caller's own identity via their Authorization header before acting. Spot-checked
against the classic "client-supplied `hospital_id` trusted without verifying the caller belongs to
it" pattern this whole testing effort has found repeatedly elsewhere — none reproduced here.

## 4. What this record does not claim

- Phase 8.5's own exit gate is not met and this pass was never going to meet it — see §1.
- The concurrency test proves the mechanisms it exercises hold locally, at the scale it ran (40
  writes); it says nothing about behaviour at real production scale or on real cloud
  infrastructure.
- KNOWN-BUG-247's fix is verified locally only. Shipping it needs `npm run supabase:deploy --
  hcx-callback-receiver` plus a real `HCX_CALLBACK_SANDBOX_TOKEN` set via `npx supabase secrets
  set` on the live hosted project — a human decision (choosing and storing that secret), not done
  in this pass.
- The engineering self-review is not exhaustive. It covered the five surfaces the plan itself
  names, spot-checking representative functions in each rather than every one of the 100+ edge
  functions in this repo. A real pentest may still find things this pass did not.
