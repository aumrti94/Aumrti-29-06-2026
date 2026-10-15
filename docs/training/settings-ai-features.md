# Settings → AI Features — Training Manual

## What this screen is (and what it is not)

This file extends [admin-hospital-manager.md](./admin-hospital-manager.md) — specifically the one
line under Section 5's **Plan & Modules** group: **"AI Features & Attestation" ("Enable/disable AI
per feature, DPA compliance, doctor attestation policy").** Sections 1–4 of that file (Staff
accounts, Module entitlements, Hospital profile/branding, GST) are not repeated here — see that
file directly for anything to do with staff logins, roles, or billing configuration.

This screen (`Settings → AI Features`, route `/settings/ai-features`, component
`src/pages/settings/SettingsAIFeaturesPage.tsx`) is the **admin-only master switchboard** for eight
named AI features: a per-feature on/off toggle, a static "Requires Attestation" badge on the four
the component marks `critical`, and a fixed block of attestation-policy wording underneath the
list. It is **not** the attestation flow itself — the actual review-and-accept modal a doctor sees
before AI content lands on a patient record is a separate component, `AIAttestationModal.tsx`,
wired independently into each clinical screen that uses it, not into this one. It is also **not**
an AI cost or usage dashboard — this screen has no budget, spend, or token-count control of any
kind. And it is **not** the prompt registry or model-selection surface Dr. Nalini governs — this
screen only flips a stored true/false per feature key; it does not touch which model, prompt, or
guardrail runs behind a feature that is on.

**Role required:** Hospital Admin or Super Admin, same as the rest of Settings — see "Access
control" below for how this was independently re-traced for this specific sub-route, not just
assumed from the parent screen's gate.

**A mandatory governance finding is folded into this file, not left as a separate memo.** Dr.
Nalini (Chief Data Officer, AI governance) independently reviewed this exact screen against the
codebase's real AI-governance wiring — not just its on-screen appearance — and found two real
defects and one open question. Each is called out explicitly, attributed to her review, at the
point in this walkthrough where it matters: the toggle list (Section 1), the critical flag and
badge (Section 2), the Save button's cache call (Section 3), and the connected/disconnected check
(Section 4). None of the four is fixed here — this is a flag-only documentation pass, consistent
with this manual's standing discipline since Phase 8.

---

## 1. Opening the screen and reading the feature list

1. Open **Settings → AI Features**. The header reads **"AI Features"**, with the breadcrumb
   **"Settings › AI Features"** underneath it.
2. An amber-bordered notice reads **"Data Processing Agreement Required"**, with the body text:
   *"Using AI features may involve sending patient data to third-party AI providers (Lovable
   Gateway / OpenAI). Ensure your **Data Processing Agreements (DPA)** are in place before enabling
   these features in production."* followed by *"**Do NOT enable AI features without explicit
   hospital admin authorization.** All AI-generated clinical content requires doctor attestation
   before it is saved to a patient record."*
3. Below that, a status line reads **"N of 8 AI features enabled"** — N is however many of the
   eight toggles below are currently on — with a green **"AI Active"** badge shown whenever N is
   greater than zero.
4. Below that is the list of eight feature rows, each with an icon, a label, a short description, a
   toggle switch, and (for four of the eight) a **"Requires Attestation"** badge next to the label.

**The eight rows, read directly from `AI_FEATURES` (`SettingsAIFeaturesPage.tsx` lines 21–78), with
their on-screen labels and descriptions copied verbatim, not paraphrased:**

| Label (on screen) | Key | Description (on screen, verbatim) | `critical` | Default state |
|---|---|---|---|---|
| Clinical Note Drafting | `clinical_note` | "AI-assisted SOAP notes and clinical documentation via voice or structured input" | true | On |
| Discharge Summary | `discharge_summary` | "Structured AI-generated discharge summaries from IPD admission data" | true | On |
| Differential Diagnosis | `differential_dx` | "AI-ranked differentials with supporting/against features and urgency classification" | true | On |
| ICD-10 Code Suggestions | `icd_suggest` | "Inline AI-suggested ICD-10 codes during diagnosis entry and MRD coding" | false | On |
| Radiology Impression | `radiology_impression` | "AI-suggested impressions for radiology reports based on findings text" | true | On |
| Voice Dictation (AI-enhanced) | `voice_dictation` | "Voice-to-text with AI structuring for clinical notes, ward rounds, and prescriptions" | false | On |
| Executive Digest | `executive_digest` | "AI-generated daily KPI summaries and anomaly detection for hospital management" | false | On |
| Quick Scribe (standalone, no patient record) | `quick_scribe` | "A doctor records a conversation and prints a structured note — no patient registration, no interaction/allergy check, and not linked to any other module. For clinics that skip full registration workflows." | false | **Off** |

Quick Scribe is the only one of the eight that loads switched off by default
(`DEFAULT_FLAGS.quick_scribe = false`, line 85) — the component's own inline comment explains why:
*"Opt-in, never silently on: unlike every other feature here, Quick Scribe has no patient record to
run a safety check against, so a hospital admin must deliberately switch it on."*

**Dr. Nalini's review, finding 1 — the critical split is directionally right for 6 of the 8, with
one open question, not a settled fact.** She traced each row's real-world data flow, not just its
on-screen description, and flagged **Voice Dictation** as possibly mis-classified: its own
on-screen description says it feeds "clinical notes, ward rounds, and prescriptions" — a drug-order
surface — which per this codebase's drug-safety standing rule (CLAUDE.md: *"Drug interaction and
allergy checks must be real. Never mock or skip them"*) would argue for Decision Support
classification (`critical: true`, with the badge and a mandatory attestation gate), but it
currently carries `critical: false` and gets neither. **This is explicitly an open question for
Arnav (clinical-pod) and Dr. Ramesh to confirm, not a confirmed defect** — Dr. Nalini's review did
not reach a final verdict, and this file does not resolve it either.

---

## 2. The critical flag, the "Requires Attestation" badge, and the Attestation Policy block

1. The four rows with `critical: true` — **Clinical Note Drafting, Discharge Summary, Differential
   Diagnosis, Radiology Impression** — each carry a small red **"Requires Attestation"** badge next
   to their label. The four `critical: false` rows — ICD-10 Code Suggestions, Voice Dictation,
   Executive Digest, Quick Scribe — carry no badge.
2. Below the feature list, a fixed box headed **"Doctor Attestation Policy"** reads: *"Features
   marked **'Requires Attestation'** (clinical note, discharge summary, differential diagnosis, and
   radiology impression) show a mandatory review modal before AI-generated content is saved. The
   doctor must confirm they have reviewed and accept responsibility for the content. All
   attestations are logged with the doctor's identity, timestamp, and whether the content was
   edited before saving."*
3. Flip any switch to change its state immediately in the form — nothing is written to the database
   until **Save Changes** is clicked (see Section 3).

**A naming note, not a defect.** This block's four feature names are typed directly into the
component's JSX as prose, not generated from the `critical` flags on `AI_FEATURES` — so if a future
change flips a fifth feature to `critical: true` (for instance, resolving Finding 1 above by
reclassifying Voice Dictation), this sentence will not update itself and would need its own edit.
Flagged for awareness, not treated as a current defect, since the two currently agree.

**On what the badge and this block actually do — this is the subject of Dr. Nalini's most serious
finding, walked through in full in Section 4 below, not here.** It is worth stating plainly before
going further: **this badge, and this policy block, are both static display text on this settings
screen.** Neither one runs any code, and neither one is what makes a doctor actually see a review
modal before saving AI content — that is a separate, independently-wired component
(`AIAttestationModal.tsx`) on each clinical screen. Whether a given feature's badge here actually
corresponds to a real attestation gate on the clinical side is exactly what Section 4 traces,
feature by feature.

---

## 3. Saving changes — and what "Save Changes" actually does

1. Click **"Save Changes"** (top right, in the `SettingsPageWrapper` header bar). The button reads
   **"Saving..."** while the request is in flight.
2. The handler (`handleSave`, `SettingsAIFeaturesPage.tsx` lines 107–117) writes the entire `flags`
   object to the `ai_feature_flags` column on the current hospital's row in the `hospitals` table,
   then calls `invalidateAIFlagCache()`, then shows a toast reading **"AI feature settings saved."**

**Dr. Nalini's review, finding 4 — `invalidateAIFlagCache()` clears a per-tab cache, not a
shared one, and this is a real propagation gap, not a cosmetic one.** `invalidateAIFlagCache()`
(`src/hooks/useAIFeatureFlag.ts` lines 66–69) does exactly two things: `cachedFlags = null;` and
`cacheHospitalId = null;`. Both are **module-scope variables in the browser's current tab** — a
singleton that `useAIFeatureFlag()` (same file, lines 29–57) reads from and writes to for whichever
hospital was last fetched *in that same tab*. There is no realtime Supabase channel, no broadcast,
and no server-side push anywhere in this flow. Practical effect, stated plainly: saving a toggle
only guarantees the new value shows up on (a) a fresh page load, and (b) the admin's own browser
tab, from that point forward. Any other session that was already open when the save happened — a
different doctor on a different tablet, or the same admin in a second tab — keeps serving the
flag value it cached at its own last load, indefinitely, until that session reloads on its own.
**For the three `critical: true` toggles that are actually wired to a real consumer (Discharge
Summary, Differential Diagnosis, Radiology Impression — see Section 4), this means switching one
off as an emergency measure does not immediately stop an already-open session elsewhere in the
hospital from continuing to generate that AI content.** This is a real gap in how fast a safety
decision on this screen can actually take effect across the hospital, not a minor implementation
detail.

**A second, independently-found defect, not part of Dr. Nalini's review — flagged here because it
sits on the same Save button.** Neither the initial fetch (`SettingsAIFeaturesPage.tsx` lines
96–104) nor the save itself (lines 110–113) checks the `error` Supabase returns alongside `data` —
both calls destructure only `{ data }` (fetch) or nothing at all (save), per this codebase's own
stated rule (`CLAUDE.md`: *"Supabase returns errors as values rather than throwing"*). Concretely:
if the update in `handleSave` fails for any reason — an RLS denial, a dropped connection — the
toast still unconditionally reads **"AI feature settings saved,"** and the admin has no way to know
the toggle state they just set was never actually written. The same pattern on load means that if
the initial fetch of `ai_feature_flags` fails, the screen silently falls back to showing every
default-on toggle as "on" with no indication that it may not reflect what is actually stored.
Flagged, not fixed, per this pass's scope.

---

## 4. Where these toggles actually get used — a connected system for four, a cosmetic one for four

This is the question this manual has asked of every look-alike or newly-written module since Phase
9 (MRD/Mortuary's two MLC tables, PRO's Feedback tab) — and the answer here is the most serious
finding in this file. **Dr. Nalini's review, finding 2, independently re-traced and confirmed: only
four of the eight keys on this screen are ever read by any real feature in production.** Tracing
every call site of `useAIFeatureFlag()` across `src/` turns up exactly four consumers:

| Key | Read by |
|---|---|
| `discharge_summary` | `src/components/ipd/DischargeSummaryAIPanel.tsx` (line 43) |
| `differential_dx` | `src/components/opd/DifferentialDiagnosisPanel.tsx` (line 64) |
| `radiology_impression` | `src/components/radiology/RadiologyReportingWorkspace.tsx` (line 141) |
| `quick_scribe` | `src/pages/quick-scribe/QuickScribePage.tsx` (line 35) |

**`clinical_note`, `icd_suggest`, `voice_dictation`, and `executive_digest` are never read by
`useAIFeatureFlag()` anywhere in the repository.** Most importantly: `src/components/voice/
VoiceScribePanel.tsx` — the component that actually performs AI-assisted note drafting from voice
or structured input, the real feature this screen's **"Clinical Note Drafting"** row describes —
has **no reference to `useAIFeatureFlag`, the string `"clinical_note"`, or any AI-feature-flag
check at all.** Toggling "Clinical Note Drafting" off on this screen writes `false` to
`hospitals.ai_feature_flags.clinical_note`, keeps showing its red "Requires Attestation" badge, and
produces the "AI feature settings saved" toast — and does **nothing else**. The real note-drafting
feature keeps running, for every doctor, regardless of this toggle's state.

A second, corroborating trace makes the same point from the attestation side: `AIAttestationModal`
(`src/components/ai/AIAttestationModal.tsx`) accepts a `feature` prop typed to include
`"clinical_note"` and `"voice_dictation"` among its options (lines 12–22), but grepping every one
of its seven real call sites in the codebase (Emergency, Insurance Claims, Discharge Summary,
Sepsis, NABH Assistant, Differential Diagnosis, Radiology) shows none of them is ever invoked with
`feature="clinical_note"` or `feature="voice_dictation"` — those two values exist in the type
definition but are passed by no real screen. This is independent evidence for the same conclusion:
the "Requires Attestation" badge on Clinical Note Drafting describes a review gate that does not
exist anywhere downstream.

**This file must not describe the "Clinical Note Drafting" toggle as a working kill switch, and
does not.** It is cosmetic today — a real database write, a real badge, a real line in the
Attestation Policy prose, and zero effect on the feature it names. The same "toggle writes to the
database but nothing reads it back" gap applies to ICD-10 Code Suggestions, Voice Dictation, and
Executive Digest, though those three carry less severity: none of them displays a "Requires
Attestation" badge implying a safety gate that isn't there the way Clinical Note Drafting's does.

**A separate, narrower check — this screen is clean on it.** None of this screen's eight keys
overlaps `SAFETY_AI_FEATURE_KEYS` (`src/lib/aiFeatures.ts` lines 120–125:
`drug_interaction_analysis`, `adr_detector`, `sepsis_early_warning`, `critical_incidental_finder`),
and this screen has no budget, cap, or spend control of any kind to check against those features in
the first place. So this specific screen cannot be used, accidentally or otherwise, to budget-cap
or disable a CLAUDE.md-defined safety-class AI feature. A separate, more serious safety-class
entitlement gap exists elsewhere in the codebase (platform-pod territory, `PlansManagerPage.tsx` /
`HospitalDetailPage.tsx`) — out of scope for this file; it is not resolved by anything documented
here, and this file makes no claim that safety-class AI is fully protected everywhere.

---

## Access control — independently re-traced, not assumed from the parent screen

`admin-hospital-manager.md` already states the `/settings` route itself is gated to exactly
**Super Admin** and **Hospital Admin**. Per this pod's standing rule to trace the *real*
enforcement chain rather than take a route's on-screen wiring at face value, this was re-checked
specifically for `/settings/ai-features` rather than assumed to inherit cleanly:

1. `src/App.tsx` (line 390) registers the route as:
   `<Route path="/settings/ai-features" element={<RG path="/settings"><SM name="AI Features">
   <SettingsAIFeaturesPage /></SM></RG>} />` — note the `RG` wrapper is given the **literal string
   `"/settings"`**, not `"/settings/ai-features"`.
2. `RG` (`src/App.tsx` lines 240–244) looks that string up in `ROUTE_ROLES["/settings"]` and
   passes the result as the `allowedRoles` prop into `RoleGuard`.
3. **That prop is a dead end for authorization.** `RoleGuard` (`src/components/auth/RoleGuard.tsx`
   line 20) never reads its own `allowedRoles` prop when deciding access — it calls
   `hasAccess(location.pathname, role, permissions)` using the browser's **real, current path**
   (`/settings/ai-features`), completely independent of whatever string `App.tsx` happened to pass
   into `RG`.
4. `hasAccess()` (`src/lib/routeRoles.ts` lines 218–221) treats any path starting with
   `/settings/` as the dedicated settings branch, and calls `staticRolesFor("/settings/ai-
   features")`. There is no exact entry for that path in `ROUTE_ROLES` — confirmed by grepping
   `routeRoles.ts` for "ai-features" directly, which returns nothing — so it falls through to the
   nearest parent prefix, `ROUTE_ROLES["/settings"]`, which is `['super_admin', 'hospital_admin']`
   (`routeRoles.ts` line 15).

**Net result: confirmed clean, no gap.** `/settings/ai-features` has no override of its own and
correctly falls through to the same two roles the parent `/settings` entry already grants — the
same access as every other screen in `admin-hospital-manager.md`, and the identical chain
[settings-consent-forms.md](./settings-consent-forms.md) walked for `/settings/consent-forms`. The
same caveat applies here too: if a future sub-route under `/settings/*` ever needs *narrower*
access than the `/settings` parent, adding an entry to `App.tsx`'s `RG path=...` prop alone would
silently do nothing — the fix has to be a new entry in `ROUTE_ROLES` itself
(`src/lib/routeRoles.ts`), not the route registration.

---

## PHI boundary check — reviewed, boundary holds, with one caveat already flagged above

This screen itself never touches patient data, confirmed from source rather than assumed:

- **No PHI in logs, console output, or error messages.** `SettingsAIFeaturesPage.tsx` has no
  `console.log` call anywhere, and no error branch at all that could surface a message — which is
  itself the defect flagged in Section 3 above (a failed save or fetch is swallowed silently rather
  than shown), not a PHI leak, but worth re-stating here as the reason there is no error-message
  path to audit for PHI content in the first place.
- **The table this screen writes to carries no patient-identifying column.** `hospitals` is a
  tenant-configuration table; the one column this screen touches, `ai_feature_flags` (added by
  migration `20260908000007_ai_attestations.sql`), is a JSONB map of feature-key → boolean. There is
  no patient name, UHID, or clinical content anywhere in what this screen reads or writes.
  Confirmed directly against the migration, not assumed from the column name alone.
  `ai_feature_flags` is a hospital-wide setting, not itself a PHI-bearing column, and does not need
  its own per-row `hospital_id`/RLS isolation policy beyond what `hospitals` already carries as a
  table.
- **No export control gap.** This screen has no export, print, or download button of any kind to
  review.
- **The boundary correctly shifts once a feature this screen gates actually runs.** The three
  genuinely-wired features documented in Section 4 (Discharge Summary, Differential Diagnosis,
  Radiology Impression) do handle real PHI once a doctor uses them — admission data, a patient's
  clinical findings — but that boundary belongs to whichever training-manual file eventually
  documents each of those clinical screens in full; it was traced here only far enough to confirm
  which toggles are real, not to audit those screens' own PHI handling.

**Sign-off: this screen's own PHI boundary holds.** The toggle switchboard operates entirely on
hospital-level configuration, not a patient record, and nothing on this screen logs, displays, or
exports anything patient-identifying. This finding is narrower than it might sound, though: it
describes this settings screen only, not the AI features it names — four of which (Section 4) this
screen does not actually control at all.

---

## A note on scope

This file covers only the one screen named above: the toggle list, the critical flag's effect on
the badge and the Attestation Policy block's wording, and the Save button's write/cache-invalidate
behaviour. It does not walk through `AIAttestationModal.tsx`'s own review-and-accept flow — that
belongs to whichever file documents each clinical screen that embeds it; of the seven real call
sites, only Emergency's (`feature="triage_assist"`) is currently covered elsewhere, in
[emergency-department-staff.md](./emergency-department-staff.md). The three real governance gaps
found while writing this file — Voice Dictation's possible mis-classification, the cosmetic
Clinical Note Drafting (and ICD-10/Executive Digest) toggles, and the cache's per-tab, non-realtime
propagation — are documented above exactly as Dr. Nalini's review found them, flagged, and left
unfixed, per this phase's own scope.
