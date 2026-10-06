# Quick Scribe — what the team found, in plain English

**Date:** 26 September 2026 · **Branch:** `feature/quick-scribe` · **Commit under review:** `0f33ebf`
**Reviewed by:** Nikhil (PM) convening clinical, data, security, frontend, quality pods + Nalini (CDO)

---

## Build status — updated 26 Sep 2026, P0 partially landed

Working tree now carries the review fixes below. `tsc` clean · `build` clean · `check:db-contract`,
`check:rls-coverage`, `check:user-fk` all pass · 1362 unit tests pass (24 of them new).

| # | P0 item | Status |
|---|---|---|
| 1 | Working-tree state resolved | **Done** — tree held a full uncommitted revert; restored from `0f33ebf` (revert backed up as a patch first) |
| 2 | Printout made legal | **Done** — mandatory name/age/sex, Qty column, signature line, blocking reg number, Schedule X/NDPS notice, retitled "Consultation Advice", disclaimer rewritten |
| 3 | Patient consent step | **Not started** — needs a product decision on wording/placement |
| 4 | PHI out of Edge Function logs | **Done** — raw-response log now prints length + shape, never content |
| 5 | Seed `quick_scribe: false` | **Done** — migration `20261107000003` writes an explicit `false` into every `ai_suite` plan row |
| 6 | Duplicate-therapy / interaction check | **Done** — new `src/lib/quickScribeSafety.ts`, surfaced immediately on the screen |
| 7 | Medicine editing destroying fields | **Done** — structured per-field rows replace the joined textarea |
| 8 | "New" not resetting voice session | **Done** — calls `resetSession()` |

Also fixed, beyond the P0 list: the entitlement gate now runs **before** `req.json()` again
(master-switch form), closing the multi-MB buffering regression; the shared `guardNote`'s
"your own clinical inference belongs here" licence is now **withdrawn** for `quick_scribe`
rather than redirected into `summary`; the audit trail records the model's original output with
the doctor's edit as `override_value` and logs `"overridden"` instead of always `"accepted"`;
the `staff_profiles` registration lookup no longer discards its error; RLS narrowed from
every-authenticated-user to doctor/MRD/admin; the transcript is actually saved.

**Still open from P1:** repeat-visit retrieval UI, retention purge executor, prompt-registry row,
consent step, Kavitha's per-note cost ceiling, and the two-tenant RLS isolation e2e test.

**Unrelated pre-existing issues found:** `e2e/load/concurrency-isolation.test.ts` fails without a
live Supabase (missing the `skipIf` guard every other Supabase-dependent test has) — red before
this work and untouched by it. A stale `.claude/worktrees/agent-a5cbeb01702261ded/` directory is
contributing all 39 of the repo's current ESLint errors.

---

## The short answer

**Yes, we can build this, and most of it is already built.** Someone already shipped a Quick Scribe
module in commit `0f33ebf`. It reuses our existing voice pipeline, it is opt-in, and it does not
disturb existing modules. That part is genuinely good work.

**But it cannot ship as it stands, for one reason that has nothing to do with code:**

> In India, a printed list of medicines **is** a prescription in law — whatever we title it.
> A prescription with no patient name on it is not a legal prescription. So "voice note with
> medicines, no patient name, printed and handed over" is not a thing we are allowed to build.

The good news: the doctor asked for two different things and only one of them is blocked.

| What the doctor said | What they actually need | Can we do it? |
|---|---|---|
| "No patient **registration**" | No MRN, no queue, no billing, no OPD/Pharmacy/Lab linkage | **Yes — fully.** This is the whole point of the module. |
| "No patient **name**" | Not typing a name | **No, not for the medicines page.** Law requires it. |

**The fix is small.** The doctor types the patient's name and age once on the scribe screen — about
three seconds, one text box. That is *not* registration. It creates no patient record, no MRN, no
queue entry, no bill. It is just a label on a printout. The doctor still gets everything they asked
for: no registration desk, no module linkage, print, click New, next patient.

That one change turns an illegal document into a legal one and unblocks the whole feature.

---

## What is already built (commit `0f33ebf`)

| Piece | File | Status |
|---|---|---|
| The screen | `src/pages/quick-scribe/QuickScribePage.tsx` | Built |
| Print output | `src/lib/quickScribePrint.ts` | Built, legally wrong |
| Database table | `supabase/migrations/20261107000002_quick_scribe_notes.sql` | Built, clean |
| Voice capture | Reuses `VoiceDictationButton` / `VoiceScribePanel` | Built, correct reuse |
| AI structuring | `supabase/functions/ai-clinical-voice/index.ts` — new `quick_scribe` branch | Built |
| Settings toggle | `SettingsAIFeaturesPage.tsx`, defaults **off** | Built, correct |
| Module tile + route | `modules.ts`, `moduleKeys.ts`, `App.tsx`, `tabPermissions.ts` | Built |

The table is exactly right: `hospital_id` + `doctor_id` only, **no foreign key to any patient,
encounter, OPD, pharmacy, lab or radiology table**. RLS isolation policy present. Audit trigger
present. That is precisely the "no connection to other modules" the doctor asked for.

---

## The problems, worst first

### 1. The printout is not a legal prescription

Current disclaimer text:

> *"Informal note — not an institutional prescription. No drug-interaction or allergy screening
> was performed (no patient record exists for this note)."*

Two things wrong with this. First, "institutional prescription" is not a category in Indian drug
law — a prescription is an act of a *doctor*, never a hospital. So the sentence disclaims nothing.
Second, and worse: the sentence is a **written admission, handed to the patient**, that we gave out
medicines without checking them. In a negligence case that is the other side's evidence, not our
defence.

What Indian law actually requires on a prescription (Drugs & Cosmetics Rules 1945, Rule 65(10);
MCI Code of Ethics 2002):

| Required | Present today? |
|---|---|
| Patient name **and address** | No |
| Age / sex | No |
| Total quantity of each drug | No field exists |
| Doctor's signature (space for it) | No — typed name only |
| Doctor's registration number | Fetched, but silently blank if the lookup fails |
| Generic drug names (2017 amendment) | No — brand names pass straight through |
| Date | Yes |
| Schedule H1 register fields | No |
| Schedule X / NDPS controls | None |

**What will happen in the real world if we ship this:** the chemist dispenses anyway, and writes a
patient name into the statutory Schedule H1 register that did not come from our document. We would
be shipping a product whose normal operating mode produces **fabricated entries in a government
register**, and the liability lands on our customer's chemist.

### 2. The doctor's repeat-visit flow does not work at all

The doctor described: patient comes back with lab results and collects medicines.

**Today that is impossible.** The table is write-only. There is exactly one database call in the
whole feature — an `INSERT`. There is **no `SELECT` on `quick_scribe_notes` anywhere in the repo**.
No list, no search, no history. Clicking "New" just clears the screen.

So a doctor who wants last week's note has no way to get it from inside Aumrti. The entire
repeat-visit flow depends on the patient having kept the paper. Also, the transcript is never even
saved — the insert writes an empty string into `transcript_text`.

This is the second reason a name field helps: without it, there is nothing to search by.

### 3. We can do a drug safety check, and we should

The commit's reasoning was "no patient record, so no safety check possible." **That is wrong.**
Our existing function already works without a patient:

```ts
checkDrugSafety(newDrug, currentDrugs, patientAllergies, hospitalId = "")
```

`patientAllergies` accepts an empty array. No `patient_id` is needed. Run it across the medicines
the doctor just dictated and we get **duplicate-therapy detection for free** — Dolo 650 + Crocin
both being paracetamol is the highest-value check in an Indian OPD and a real overdose risk, not a
theoretical one.

Having no patient record excuses skipping the *allergy* check. It does not excuse skipping the
*drug-drug* check. Cost: about half a week.

### 4. The AI can quietly start diagnosing

The shared prompt guard is appended to *every* voice context and tells the model that
`suggested_diagnosis` "is where your OWN clinical inference belongs". Quick Scribe's schema has no
such field. So the model's only place to put its inference is `summary` — which prints on
letterhead, **unlabelled as AI guesswork**. That is how a "just transcribe it" feature silently
becomes a diagnostic one. Nalini classifies it **MDR 2017 Class B** as built, not Class A.

### 5. Things that changed for hospitals that did NOT enable it

The commit message says nothing about these:

- **Every AI-enabled hospital can already be billed for it.** The entitlement check blocks only on
  an explicit `false`; a missing key means "allowed". Nothing seeds `quick_scribe: false`. The tile
  is hidden, but a direct API call runs and spends money.
- **Hospitals with no plan row auto-enable it**, which changed their "Active Modules" count on the
  Plan settings page.
- **Every super_admin / hospital_admin at all ~100 hospitals can see the "Quick Scribe" tile today.**
- The Edge Function now parses the whole request body *before* the entitlement check, so an
  unentitled hospital's multi-MB audio upload is fully buffered before it gets a 403.

The one thing I suspected — the `VoiceDictationButton` gating change breaking existing OPD/IPD
dictation — is **clean**. All five call sites pass a literal session type; existing behaviour is
unchanged. But the commit message calls it a "bug fix" when it is an additive branch. Reword it.

### 6. The commit does not build, and the branch is half-reverted

Two facts to fix before anything else:

- `App.tsx` at `0f33ebf` imports `SettingsPatientCreditPaymentPage`, which **does not exist in that
  commit**. The commit only builds because the file happens to be sitting uncommitted on disk.
  Checked out clean, it fails.
- The working tree currently has the Quick Scribe files **deleted** (along with 64 other files) —
  a partial revert that no CI check detects, because the generated `types.ts` still carries a
  dangling `quick_scribe_notes` definition.

Also riding along in this commit: `pay_later` tabs on lab/radiology and a patient-credit settings
route. Unrelated scope that should not be in a Quick Scribe commit.

---

## What it takes to ship — ranked

### P0 — blocks any hospital seeing this (~1 sprint)

1. **Decide the branch's intent** and fix the tree — restore from `0f33ebf` or regenerate types.
   Note `types.ts` also carries `patient_credit_grants`, whose migration is not in the commit:
   types were regenerated against someone's live dev DB.
2. **Make the printout legal** — mandatory name/age/sex, quantity column, signature line,
   registration number that blocks printing if missing, Schedule X/NDPS block, and honest
   disclaimer wording. Retitle to "Consultation Advice".
3. **Patient consent step** for recording audio and sending it to a third-party AI (DPDP s.5/s.6/s.16).
   None exists today.
4. **Strip PHI from Edge Function logs** — the redactor is key-anchored and cannot see names inside
   free-text `summary`.
5. **Seed `quick_scribe: false`** into existing tenants' plan features.
6. **Duplicate-therapy / interaction check** on the dictated list.
7. **Fix medicine editing** — editing the text box currently destroys dose, frequency and duration.
8. **"New" must reset the voice session** — the previous patient's dictation currently carries over.

### P1 — before general availability (~1 sprint)

Repeat-visit retrieval list · real retention purge (`purge_after` has no executor, so the 30-day
window is a comment, not a behaviour — and two permanent copies survive in `audit_log` and
`ai_suggestions_audit` anyway) · audit correctness (record model + prompt version) · narrow RLS to
doctor + MRD roles, because today **every receptionist and billing clerk in the clinic can read
every consultation summary** · design-law fixes (11px disclaimer text fails the 14px Clarity rule).

### Tests (~1.5 weeks)

Seven specs, of which the non-negotiable ones are the `VoiceDictationButton` gating regression
across all six session types and a two-tenant RLS isolation test.

> **Do not say this "passed CI".** Committed CI runs **no unit tests, no Playwright, no coverage
> thresholds** — only static text-scanning checks. The test gating exists only as uncommitted edits
> to `ci.yml` and `vitest.config.ts` on disk.

**Total: roughly 10 engineer-weeks — about three sprints.** This is not a polish pass.

---

## The market: what else Indian doctors can buy

Searched September 2026. There is no single "top 10" ranking anyone agrees on, so this groups them
by what they actually are.

### India-built or India-tuned

| Tool | What it is | Price |
|---|---|---|
| **Augnito** (Mumbai) | The serious Indian incumbent. Clinical speech recognition, dictate into any EMR/RIS/PACS without integration work. | Quote only — no public price. Directories benchmark this class at $50–200/user/month. |
| **Patient Square** | India-priced ambient scribe, unlimited notes | **₹1,599/doctor/month** (annual, ex-GST) |
| **Thunai AI** | Positioned specifically on Hinglish and regional accents | Not public |
| **Sunoh.ai** | Ambient listening, tuned to filter noisy Indian clinic background | Not public |
| **PenBOT** | Built for Indian clinics; multi-speaker with interruptions | Not public |
| **HealthOrbit** | Scribe plus clinical reasoning | Not public |

### Global, available in India

| Tool | Price | Verdict for our customer |
|---|---|---|
| **Nuance DAX / Microsoft Dragon Copilot** | $200–400/provider/month (₹16,000–33,000) | Enterprise leader. Unaffordable for a medium clinic. |
| **Heidi Health** | $99/user/month, free basic tier, 110+ languages | Built for UK/Australia rules, not Indian ones |
| **DeepScribe / Freed / S10.ai** | $99–$200/month band | US-market, US documentation conventions |

### What the research says

A September 2026 arXiv paper on ambient scribes in India is the most useful thing to read here.
Its findings:

- Indian consultations are **brief, three-way (doctor–patient–attendant), code-mixed, and noisy** —
  doctors switch between English, Hindi and a regional language mid-sentence.
- **Off-the-shelf Western ASR fails on this.** Scribes tuned on Western English degrade sharply.
- **Unadapted systems show 5–15% extraction hallucination rates.** On a medicines list, that is the
  number that should stop us cold — it is the single strongest argument for the duplicate-drug
  check in P0-6 and for a mandatory doctor-review step before print.
- Government OPD doctors handle 200+ visits/day at ~2 minutes each.

---

## Recommendation: build, don't buy — but fix the premise first

**1. Build it ourselves. We already own the hard part.**
The thing every tool above charges for — Indian-language, code-mixed, noisy-clinic ASR — is exactly
what our existing Sarvam/Bhashini pipeline already does, and it is already wired into five other
screens. Buying Augnito or Heidi would mean paying per-doctor for a capability we have, and getting
a note that lands in a separate app.

**2. Our actual differentiator is the one thing none of the ten can do.**
Every tool in that table is a standalone note-taker. The note comes out and stops. We are the only
option where, when the clinic grows up and starts registering patients, **the same scribe note can
graduate into a real patient record, a real prescription, a real lab order, a real bill** — without
the doctor changing tools or the clinic changing vendors. Sell Quick Scribe as the on-ramp to
Aumrti, not as a scribe that competes on transcription quality.

**3. Price against ₹1,599, not against $200.**
Patient Square at ₹1,599/doctor/month is the real competitor for a medium clinic. Nuance at ₹16,000
is not in this conversation.

**4. The cost ceiling is the open commercial question — get Kavitha a real number.**
A 5–10 minute consultation per note, at ~1,250 notes/month for a 50-patient clinic, against the
₹2,000/hospital/month AI ceiling, means **anything above roughly ₹1.60 per note breaks the ceiling**
— and this is aimed at our lowest-paying tier. Measure actual per-note cost before pricing anything.
Right now `quick_scribe` sits in the plan matrix with **no SKU and no price at all**.

**5. Take the legal question to Preethi.**
"Patient name is mandatory" overturns the doctor's stated premise. That is a product-direction call,
not an engineering one. My recommendation is the three-second name box — it satisfies the law, it
enables repeat-visit search, and the doctor still never touches a registration desk. But the call is
hers.

---

## What to tell the doctor

> "Yes — we can give you exactly this: open the screen, talk, get a structured note with summary,
> medicines, lab tests and scans, print, click New, next patient. No registration desk, no queue,
> no billing, nothing linked to any other module. It is a settings toggle, so nothing about how
> your hospital works today changes.
>
> One thing we have to change in your request: Indian drug law requires the patient's name and age
> on any paper that lists medicines. So the screen will have a name and age box at the top. Typing
> it takes three seconds and it does **not** create a patient file — it is just a label on the
> printout. That also means when the patient comes back with their lab report, you can search their
> name and pull up what you said last time, which is not possible otherwise."
