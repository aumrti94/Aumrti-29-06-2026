# Govt Schemes / PMJAY

This file is for a **Billing Executive** working the hospital's PM-JAY (Ayushman Bharat) and other
government-scheme patients — registering their scheme card, getting treatment pre-approved,
submitting the cashless claim, and chasing it through to settlement. It assumes you have never used
this software before.

## Before you start — this is NOT the same "Government Schemes" you may have heard about

Aumrti has **two different screens that both mention "Government Schemes," and they are not the
same thing**:

1. **Insurance & TPA** (`/insurance`) has a left-hand navigation section literally labelled
   **Government Schemes**, listing CGHS/ECHS, ESI Scheme, and Arogyasri/State. That section is
   orientation-only — a shortcut menu, not a dedicated workflow you walk through — and is reachable
   by `billing_executive`, `insurance_executive`, and `super_admin`
   (`src/lib/modules.ts`, line 63).
2. **This file** covers a completely separate, standalone module: **Govt Schemes / PMJAY**
   (`/pmjay`), reachable only by `billing_executive` and `super_admin`
   (`src/lib/modules.ts`, line 66) — **`insurance_executive` is not on this module's role list at
   all.** This is the real PM-JAY workflow screen: beneficiary registration, pre-authorisation,
   cashless claim submission, and the HBP package rate list.

If you are looking for CGHS, ECHS, ESI, or Arogyasri day-to-day work, that is covered (at
orientation depth only) in `docs/training/accountant-insurance-tpa.md`. This file is about PM-JAY
(and any other scheme configured the same way) on the dedicated `/pmjay` screen. Do not assume the
two are interchangeable — a Billing Executive who only ever uses `/insurance` has never actually
opened this screen, and vice versa.

## 1. Opening the module

1. From the dashboard, click the tile named **Govt Schemes / PMJAY**.
2. The screen that opens is headed **"PMJAY & Govt Schemes"**, with the subtitle
   *"Pre-authorization, cashless claims, beneficiaries, and HBP package catalog."*
3. Across the top of the card are five tabs, in this order: **Pre-Authorization**,
   **Beneficiaries**, **Cashless Claims**, **HBP Catalog**, **Analytics**. The screen opens on
   **Pre-Authorization** by default.
4. On the **Pre-Authorization** and **Beneficiaries** tabs only, a button appears at the top right
   of the page — **"New Pre-Auth"** on Pre-Authorization, **"Register Beneficiary"** on
   Beneficiaries. (This button can be switched off for your hospital's plan tier — if you do not
   see it, use the **"Register Beneficiary"** / the in-tab **"+ New Pre-Auth Request"** equivalent
   button described in each section below, which works the same way.)

Day-to-day, work normally flows **Beneficiaries → Pre-Authorization → Cashless Claims**, so this
file covers them in that order, even though the tab bar itself opens on Pre-Authorization first.

## 2. Beneficiaries tab — registering a PM-JAY/scheme beneficiary

1. Click the **Beneficiaries** tab.
2. You see a table of every beneficiary registered at your hospital so far, with columns
   **Patient, Scheme, Beneficiary ID, Name on Card, Status, Expiry**.
3. **Status** is shown as a coloured badge: **verified** (green), **pending** (amber), or
   **expired** (red).
4. To register a new beneficiary, click **"Register Beneficiary"** (top right of the list, or the
   header "New Pre-Auth"-style button if your tab opened there). A panel slides in on the right
   titled **"Register Beneficiary"**.
5. Fill in:
   - **Patient \*** — type into the "Search patient..." box and click the matching patient from the
     list that appears.
   - **Scheme \*** — pick from the **"Select scheme"** dropdown (this list comes from your
     hospital's configured government schemes — PM-JAY and any state variant your hospital has set
     up).
   - **Beneficiary ID \*** — the Ayushman card number (the field's placeholder text literally says
     *"Ayushman card number"*).
   - **Card Number** — optional.
   - **Family ID** — optional.
   - **Name on Card** — optional, placeholder *"As printed on card."*
   - **Expiry Date** — optional, pick from the calendar (shows as DD/MM/YYYY once chosen).
6. Click **"Register."** The new row appears in the table with **Status = pending**.
7. To mark a beneficiary verified, click the **"Mark as Verified"** button that appears next to any
   row whose status is **pending**. The row updates to **Status = verified** immediately. Hovering
   the button shows a tooltip: *"Manual status flip only — does not call the NHA/BIS eligibility
   check. Use Pre-Auth's 'Verify PMJAY Card Eligibility' for a real card verification."*

**Important — this button does not call the NHA/PM-JAY portal.** "Mark as Verified" only flips the
database status, with no outside check (`src/components/pmjay/PmjayBeneficiariesTab.tsx`,
`verifyBeneficiary`) — it was relabelled from a plain "Verify" specifically so it no longer implies
a real check happened. The **real** e-card/BIS eligibility check — the one that actually contacts
PM-JAY's systems — lives on a different screen entirely: the **Pre-Authorization** tab's **"Verify
PMJAY Card Eligibility"** box (Section 3 below), which calls a dedicated `pmjay-eligibility` server
function. Because NHA does not accept a PM-JAY verification done *after* admission, treat this
button as **administrative record-keeping only** — always run the real check on the
Pre-Authorization tab before admitting a PM-JAY patient.

## 3. Pre-Authorization tab — getting treatment approved before admission

1. Click the **Pre-Authorization** tab. The left-hand panel is the **"Pre-Auth Queue"**, with
   filter chips **All, Draft, Submitted, Under Review, Approved, Rejected**.
2. Each row in the queue shows the patient's name, a status badge, the scheme name, the package
   name, the requested amount in ₹, and (once calculated) an AI approval-probability percentage.

### 3.1 Starting a new pre-authorisation request

1. Click **"New Pre-Auth"** (top of page) or the equivalent button inside the tab. A form titled
   **"New Pre-Auth Request"** opens on the right.
2. **Patient \*** — search and select, same as in Beneficiaries.
3. **Scheme \*** — select from the dropdown.
4. **Beneficiary ID \*** — this list is populated only from beneficiaries already registered **and
   verified** for this patient. If none exist yet, the form tells you directly: *"No verified
   beneficiaries found. Register one in the Beneficiaries tab first."*
5. **Verify PMJAY Card Eligibility** box — this is the real check:
   - Type the PM-JAY card number into the field (placeholder: *"PMJAY card number (e.g.
     12345678901234)"*).
   - Click **"Verify."** While it runs, the button reads **"Checking..."**
   - The result box shows one of: **"Eligible (Sandbox mode)"**, **"Eligible (Live verification)"**,
     **"Not eligible,"** or **"Verification failed."** On a successful eligible result, it also
     shows the beneficiary's Name, Scheme, Family ID, and remaining Balance in ₹.
6. **Diagnosis / ICD-10 keyword** box — type a keyword such as *"Cataract," "CABG,"
   "Appendicitis,"* or *"Knee Replacement"* and the system suggests matching PM-JAY packages
   (code, specialty, name, and rate in ₹) as clickable cards. Click one to select it.
7. **Package \*** — alternatively, pick directly from the **"Select package"** dropdown, or use the
   **"Search PMJAY Packages by name, specialty or code..."** box below it.
8. **Link Admission (optional)** — only shown if the selected patient has an active admission; pick
   one if relevant. (You can also leave this blank and link it later — see the warning in Section
   3.3 below.)
9. **Clinical Justification** — a free-text box for a brief note.
10. Click **"Create Pre-Auth."** The request is saved with **Status = draft** and appears in the
    queue on the left.

### 3.2 Working an existing pre-authorisation request

Click any row in the queue to open its detail view on the right.

1. **AI Clinical Summary** — click **"Generate Summary"** to have the system draft a 3-paragraph
   clinical summary for the request. The text appears in an editable box with the note
   *"(AI generated — please review and edit before submission)."* Edit it if needed, then click
   **"Save Changes"** (this button only appears once you have actually changed the text).
2. **Required Documents** checklist — five items you tick off as you have collected them:
   *"Discharge summary / IP case sheet," "Beneficiary card copy," "Aadhaar copy," "Investigation
   reports,"* and *"Pre-operative photos (if surgery)."*
3. **Predicted Approval Probability** — click **"Calculate Score"** for an AI-estimated approval
   percentage, labelled HIGH / MODERATE / LOW, with a stated risk factor and recommendation. This
   is advisory only, not a guarantee from NHA.
4. Once ready, click **"Submit Pre-Auth"** (only shown while status is **draft**). This marks the
   request **submitted** in Aumrti and records the time.
5. Once the hospital hears back from NHA/the scheme, come back here and click either
   **"Mark Approved"** or **"Mark Rejected"** (shown while status is **submitted** or **under
   review**) to record the outcome.
6. Once approved (or partially approved), click **"Convert to Claim"** to move the request into the
   Cashless Claims tab as a claim. If the request has no admission linked yet, the system blocks
   this with the message *"Link an admission first — PMJAY claims require an admission on the
   pre-auth record before they can be created."* — go back and edit the admission link before
   retrying.
7. Click **"Print PA-9"** at any time to print a hospital-generated pre-authorisation summary for
   manual submission. **Caution:** the printout itself carries a footer note that its layout is
   *"pending regulatory confirmation — verify before submission to the portal"* — treat it as a
   convenience summary of what you've entered, not a verified replica of NHA's actual PA-9 form.

**What this screen does NOT do:** clicking "Submit Pre-Auth" only changes the status inside Aumrti
— it does not file anything with the NHA BIS portal. You (or whoever handles portal filing at your
hospital) still need to separately log into the NHA BIS portal and submit the request there using
the printed PA-9 summary as your reference.

## 4. Cashless Claims tab — submitting and settling the claim

1. Click the **Cashless Claims** tab. The left panel lists claims with filter chips **All, Draft,
   Submitted, Approved, Rejected, Settled**.
2. Click a claim to open its detail view: Patient, Claim #, Claimed ₹, Approved ₹, Settled ₹, and
   whether it has been Resubmitted.

### 4.1 Submitting a draft claim

1. With status **draft**, you see a blue box **"Ready to Submit"** explaining: *"The system
   verifies that the ICD code is MRD-locked before submitting this claim."*
2. Click **"Submit Claim."** The system runs this ICD lock check automatically. If the patient's
   ICD-10 diagnosis code has not yet been reviewed and locked by the Medical Records (MRD) team,
   you get blocked with: *"PMJAY claim cannot be submitted — ICD code pending MRD validation. Ask
   the MRD officer to review and lock the ICD code first."* (This is the same ICD Coding/MRD Lock
   step documented in `docs/training/mrd-officer.md` — if you hit this message, it is not a bug,
   it is this hard gate doing its job; follow up with MRD, do not try to work around it.)
3. Once the ICD lock passes, the claim moves to **submitted**.
4. Click **"Print for Portal"** at any time on a draft claim to print a **"PMJAY Claim Submission
   Bundle"** (patient name, UHID, claim number, package, claimed amount, admission/discharge
   dates) — the printout itself tells you: *"Submit this bundle to the NHA BIS portal to complete
   electronic claim submission."* An on-screen note below the buttons repeats this: *"After marking
   submitted here, log into the NHA BIS portal to complete electronic submission."*

### 4.2 If a claim is rejected

1. A red box appears: **"Claim Rejected,"** showing the denial code and reason (if recorded).
2. Click **"Generate Appeal Letter"** to have the system draft a formal appeal using the denial
   details. It opens in a dialog titled **"AI-Generated Appeal Letter,"** where you can edit the
   text, then **Copy**, **Print**, or **"Save to Claim."**
3. Once you have resubmitted the appeal through the portal yourself, click **"Mark Resubmitted"**
   back in Aumrti (this runs the same ICD-lock check as a fresh submission).

### 4.3 Settling an approved claim

1. A green box appears: **"✓ Claim Approved,"** showing the approved amount in ₹.
2. Click **"Mark Settled & Record Payment."** This single click:
   - marks the claim **settled** with today's date,
   - records a payment against the patient's bill (payment mode "pmjay") if a bill is linked,
     recalculating the bill's paid/balance/payment-status fields,
   - posts the matching accounting journal entry automatically, and
   - clears the billing-pending flag on the patient's admission.
3. A confirmation toast shows the settled amount, e.g. *"₹1,50,000 settled & billing updated ✓"*
   (figures always shown with Indian digit grouping and the ₹ symbol, never a bare number, per
   house convention).

## 5. HBP Catalog — orientation only, not a daily task

The **HBP Catalog** tab is a reference list of Health Benefit Package codes, names, specialties,
and rates (all amounts in ₹), with a search box and a specialty filter. A banner at the top tells
you: *"Showing [N] packages (system + hospital-custom). The full PMJAY HBP catalog (1,929 packages)
can be bulk-imported via Settings → Data Migration → PMJAY Packages."*

A **"Add Custom Package"** button lets anyone with access to this screen add a one-off package
(Code, Name, Specialty, Procedure Group, Rate). This is a **setup/configuration action**, not
something a Billing Executive does as part of daily claim work — most hospitals will do this once,
when onboarding a state-specific package the system doesn't already carry, not repeatedly.
Day-to-day, you will mostly use this tab to look up a package's current rate, which you will
usually have already done through the diagnosis-keyword search inside the Pre-Authorization form
itself (Section 3.1, step 6).

## 6. Analytics — orientation only, read-only reporting

The **Analytics** tab is a read-only dashboard: no buttons that change anything. It shows, for the
current month:
- A **scheme-wise summary table** (Pre-Auths, Approvals, Claims, Settled ₹, Recovery %) per
  configured scheme.
- A **Denial Analysis** pie chart by denial category.
- An **AR Ageing** panel: counts of pending claims over 30/60/90 days, and a **Total Outstanding**
  figure in ₹.

There is nothing to click through here beyond reading the numbers — use it to see how your
scheme-wise recovery is trending, not as a task screen.

## Access control — who can actually get here

Checked directly against the route guard and the module catalogue, not assumed:

- **No override for `/pmjay` exists in `src/lib/routeRoles.ts`.** A line-by-line read of that file
  (lines 1–99) confirms every explicit `ROUTE_ROLES[...]` override, and `/pmjay` is not among them
  — not in the admin-only overrides, not in `coreRoutes` (line 183), not in the `/settings`
  special-case. It therefore falls through to the loop at lines 7–10, which builds
  `ROUTE_ROLES['/pmjay']` straight from `ALL_MODULES`'s declared role list.
- **That declared list is `["billing_executive", "super_admin"]`** (`src/lib/modules.ts`, line 66
  — *"Govt Schemes / PMJAY," desc: "PMJAY, CGHS, state scheme claims," route: "/pmjay"*). This
  confirms the brief's framing exactly: no `insurance_executive` on this list at all.
- **`hospital_admin` is NOT in that declared list, but can still open the screen** via the separate
  `BYPASS_ROLES` catch-all (`routeRoles.ts`, line 99 and line 167 in `hasAccess()`): "Hard-coded
  bypass roles (Super Admin / Admin always have access)." This applies to every route in the app,
  not something specific to PMJAY — worth knowing so you don't read the bare module-catalogue line
  as the full picture of who can get in.
- **`billing_executive` IS a default role card** on **Settings → Staff Members → Add Staff
  Member** — `src/pages/settings/SettingsStaffPage.tsx`, `DEFAULT_ROLE_CARDS`, line 98:
  `{ role: "billing_executive", icon: Receipt, label: "Billing Executive" }`. This confirms the
  brief's second question directly: **this module is zero-setup reachable** — any hospital that has
  already created a Billing Executive login the normal way (no custom-role step required) can open
  Govt Schemes / PMJAY immediately. This is the same clean-bill shape Phase 3/8 found for other
  modules, and it is only true today because of the Phase 9 fix that split the old single
  "Billing" card into separate **"Billing Executive"** and **"Accountant"** cards — before that
  fix, the card literally labelled "Billing" created role `accountant`, not `billing_executive`,
  which would have made this module unreachable out of the box exactly like the Analytics & BI
  trap Phase 8 found.
- **`insurance_executive` is confirmed absent from `/pmjay`'s role list, while it IS present on
  `/insurance`'s** (`src/lib/modules.ts`, line 63: `["billing_executive", "insurance_executive",
  "super_admin"]`). This is the same cross-module-split shape Phase 4 found for
  Accountant/Insurance-TPA: nobody holding only an `insurance_executive` login can reach this
  screen at all, and a `billing_executive` login is the *only* one that reaches both `/insurance`
  and `/pmjay`.
- **Tab/button visibility inside the module is additionally gated by plan entitlement, on top of
  role.** All five tabs (`preauth`, `beneficiaries`, `claims`, `catalog`, `analytics`) and the
  combined "New Pre-Auth / Claim" button action are catalogued in
  `src/lib/tabPermissions.ts` (lines 265–271 and 541–543). This is a hospital-plan-tier switch, not
  a role gap — mentioned here only so a reader isn't confused if their hospital's plan happens to
  hide a tab or the "+ New" button that this file otherwise describes as always present.

**Summary, corrected/confirmed against the brief's framing:** both of Nikhil's pre-read claims hold
up exactly as stated — this is a clean, zero-setup-reachable module for an existing Billing
Executive login, and it is a genuine cross-module split from `/insurance`'s `insurance_executive`.
The one addition not in the original framing is the `hospital_admin` bypass-role nuance above.

## Defects flagged — not fixed this phase

1. **Beneficiaries tab's "Verify" button does not actually verify anything with PM-JAY.** As
   described in Section 2 above, `verifyBeneficiary()`
   (`src/components/pmjay/PmjayBeneficiariesTab.tsx`, lines 125–132) sets
   `verification_status: "verified"` directly in the database with no call to any eligibility
   service. The *only* real e-card/BIS check in this module is the separate "Verify PMJAY Card
   Eligibility" control inside the Pre-Authorization form, which does call a server function
   (`supabase.functions.invoke("pmjay-eligibility")`,
   `src/components/pmjay/PmjayPreAuthTab.tsx`, lines 210–232). Two controls share the word
   "verify" and look like they do the same job; only one of them does. Given the pod's own hard
   rule that post-admission PM-JAY verification is rejected by NHA, this is worth a second look —
   not whether to remove the Beneficiaries "Verify" button, but whether staff are being told clearly
   enough which one is the real check.
2. **The "Required Documents" checklist on an open pre-auth is never saved.** `checkedDocs` in
   `PmjayPreAuthTab.tsx` is local component state only — `toggleDoc()` (line 499) updates it in
   memory, and the `useEffect` at lines 532–538 resets it to all-unchecked every time a different
   (or the same) pre-auth record is reopened. Ticking off "Aadhaar copy," "Investigation reports,"
   etc. has no effect beyond the current screen view; close and reopen the same pre-auth and every
   box is unchecked again.
3. **`markSettled()`'s journal-entry misattribution bug — fixed.** The function correctly resolves
   the logged-in staff member's `public.users` row (`userData.id`) and used it for `received_by` on
   the `bill_payments` insert, but used to call `autoPostJournalEntry` with the raw Supabase
   **auth** user id instead for `postedBy` — a direct instance of this codebase's hard rule that
   `_by` columns must FK to `public.users(id)`, not `auth.users(id)`, since the two diverge for
   every account created after migration `20260322111223`. Net effect before the fix: for any
   Billing Executive account created after that migration, clicking "Mark Settled & Record Payment"
   could silently skip the mandatory auto-journal-entry for the PM-JAY settlement while the success
   toast still fired. Now reads `userData?.id` for `postedBy` too, matching the already-correct
   `received_by` pattern.

Verification performed for this phase: read `src/pages/pmjay/PmjayPage.tsx` and all five tab
components in full, `src/lib/modules.ts`, `src/lib/routeRoles.ts` in full,
`src/pages/settings/SettingsStaffPage.tsx`'s `DEFAULT_ROLE_CARDS`, `src/lib/tabPermissions.ts`'s
PMJAY entries, and `src/lib/accounting.ts`'s `autoPostJournalEntry`. No code was edited.
