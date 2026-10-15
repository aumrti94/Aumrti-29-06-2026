# Medical Records (MRD) Officer — Training Manual

## What this role does in the system

As an MRD Officer, you work in one module: **🗂️ Medical Records**. It has eight tabs along the top:
**📋 Records Index**, **🏷️ ICD Coding**, **📨 Requests**, **📜 Death Certs**, **📅 Retention**,
**🤱 Form 8**, **⚖️ MLC Register**, and **🔍 Coding Audit**. This is where every patient visit's
record gets indexed and bundled, every discharge/death gets its ICD-10 code assigned and finally
locked, every outside request for a copy of a record gets tracked, every death gets its MCCD (Form
4) printed, every record's legal retention clock gets watched, the statutory Maternity (Form 8) and
Medico-Legal Case registers get produced, and an AI tool checks recently coded episodes for
under/over-coding. This manual assumes you have never used hospital software before.

> **Access check — the same one-time custom-role step every specialty role has needed since Phase
> 5, plus a role-card trap specific to this module.** `/mrd`'s role list
> (`src/lib/modules.ts`, line 93) is `["mrd_officer", "super_admin", "billing_executive"]`, with no
> override in `src/lib/routeRoles.ts`. Neither **MRD Officer** nor **Billing Executive** is one of
> the 7 role cards that ship by default on **Settings → Staff Members → Add Staff Member**
> (`src/pages/settings/SettingsStaffPage.tsx`, `DEFAULT_ROLE_CARDS`, lines 85–92: only Doctor,
> Nurse, Billing, Pharmacist, Lab Tech, Reception, Admin/CEO). To get either login, your Hospital
> Admin must first create it as a **custom role** on **Settings → Roles & Permissions**: typing a
> free-text label slugifies it into the exact snake_case key the route guard expects
> (`src/pages/settings/SettingsRolesPage.tsx`, `slugifyRoleName`, lines 44–46, used at role-creation
> time around lines 326, 370) — "MRD Officer" produces `mrd_officer`, "Billing Executive" produces
> `billing_executive`. **This confirms, rather than finds a gap, on `mrd_officer`'s side** — it was
> already added as a recognised `app_role` enum value by `supabase/migrations/20260517000003_mrd_icd_validation_lock.sql`
> for the ICD-lock trigger (Section 3 below), so the role exists at the database level even though
> it isn't a default staff card. **The `billing_executive` trap — fixed.** This was the same shape
> Phase 8 found for Analytics & BI's "Billing" card: the default role card used to be literally
> labelled **"Billing"** but create role `accountant`, not `billing_executive` — two genuinely
> separate, already-established role strings (`src/lib/appRoles.ts`, `APP_ROLES`) — so a hospital's
> existing Billing Clerk, set up the normal way, could not open Medical Records despite the card's
> label suggesting otherwise. **Now fixed at the root** (not patched per-module): `DEFAULT_ROLE_CARDS`
> has two separate cards, **"Billing Executive"** and **"Accountant"** — pick the one that matches
> the job you're actually hiring for, and a Billing Executive login reaches this module with zero
> extra configuration. **A genuine safety net also exists independent of either role string**:
> `hospital_admin` ("Admin/CEO", a default card) is not on `/mrd`'s role list at all, yet can still
> open this module with zero configuration, because `BYPASS_ROLES = ["super_admin", "hospital_admin"]`
> (`routeRoles.ts`, line 95) overrides every route's role list — the same mechanism Phase 4 found
> for Quality.

All dates on screen show as DD/MM/YYYY. Money shows as ₹.

---

## 1. The header — quick actions and KPIs

Two buttons in the header, each gated by your hospital's permission setup for this module (if
either is missing for your login, ask your admin — it isn't a bug):
- **"New Record Request"** — jumps to the Requests tab and opens the New Record Request form
  (Section 4).
- **"Death Certificate"** — jumps to the Death Certs tab and opens the Generate Death Certificate
  form (Section 5).

Below the header, four KPI tiles always show: **Total Records**, **Pending ICD Coding**, **Pending
Requests**, and **Due for Destruction** (records whose retention window closes within 30 days —
see Section 6 for why this tile may never move).

---

## 2. 📋 Records Index

A table of every medical record on file: **Patient**, **Record Type**, **Visit Date**, **Location**,
**Barcode**, **Status**, **Actions**.

1. **Search patient name or UHID...** filters by name or UHID.
2. The record-type dropdown filters by **All Types / IPD / OPD / Emergency / Day Care**.
3. The status dropdown filters by **All Status / Active / Archived** (defaults to **Active**).

Only **IPD** rows get action buttons:
- **"Bundle →"** opens the **📋 Case Summary Bundle** dialog (next subsection).
- **"Summary"** (only shown if the record has a linked visit) opens a **Discharge Summary** dialog
  showing the admission's discharge notes, or "No discharge summary recorded." if none exist yet.

### The Case Summary Bundle

Clicking **"Bundle →"** opens a checklist of everything that could go into a case file: **Admission
Note**, **Discharge Summary**, **Lab Reports (N)**, **Radiology Reports (N)**, **Operation Notes**,
**Nursing Notes Summary**, **Final Bill Summary (N)**, **Pre-Auth Approval Letter**, **ICD Coding
Sheet (N)**, and **FHIR R4 Bundle (ABDM)**. Each item is pre-ticked and shows a green check if data
actually exists for it, or an amber warning if not. **Operation Notes** and **Nursing Notes
Summary** always show as unavailable — nothing in this screen (or, as far as this file's scope
goes, anywhere wired to it) ever populates those two.

- **"Generate Full Bundle"** opens a printable document assembling every ticked, available section,
  plus a document checklist with Available/N-A status for the record — print it or save it as a PDF
  from your browser's print dialog. If **FHIR R4 Bundle (ABDM)** is ticked, it separately downloads
  a `.json` file via the `fhir-export` function.
- **"WhatsApp Bundle Link"** opens WhatsApp Web/the WhatsApp app with a pre-filled message saying
  the bundle "is ready for download. Please contact the MRD department for access."

> **Content gap found, not fixed.** "WhatsApp Bundle Link" does not actually attach or link to
> anything — no file, no URL, nothing the recipient can click to retrieve the bundle. The only real
> artefact this screen produces is the print window from "Generate Full Bundle", which stays on your
> own screen. Treat the WhatsApp button as "notify someone to come ask you for it in person," not as
> a delivery mechanism.

---

## 3. 🏷️ ICD Coding

Left panel: a queue of coding items, filtered by status tabs **Pending / Coded / Validated /
Locked / All**, and further by a visit-scope row of buttons **All / OPD / IPD / Emergency**. Each
item in the queue shows its visit type, a status badge, an AI-suggestion line (🤖 AI: *code*
(*confidence*%)) if one exists, and its creation date.

Click an item to open the **ICD Coding Workspace** on the right. An **"AI Audit Log"** button in
the top-right of the workspace opens a drawer of every AI suggestion's accept/reject/override
history for this hospital.

### Using the AI suggestion

Selecting a **Pending** item with no existing AI suggestion automatically triggers one — you'll see
**"🤖 Searching your ICD-10 library & analysing notes..."** while it runs. When it returns, an
**AI Suggestion** box shows the suggested code and description, a confidence bar, the AI's
reasoning, and — at ≥80% confidence — a green **"High confidence — auto-filled"** badge that has
already filled the Primary ICD-10 Code fields for you; below 60% you instead see an amber **"Low
confidence — manual review"** badge and nothing is auto-filled. Any secondary codes the AI proposes
appear with individual **"Add"** buttons. Three buttons act on the suggestion as a whole:
**"Accept All"**, **"Accept Primary Only"**, and **"Dismiss"**.

### Coding the item yourself

- **Primary ICD-10 Code** and its description — always visible, always required to save.
- **Primary ICD-11 Code** — only appears if your hospital has switched on ICD-11 in
  **Settings → ICD Code Master**. It is recorded *alongside* the ICD-10 pair, never instead of it —
  PMJAY/HCX claims and the MRD lock below both key off the ICD-10 code regardless of whether ICD-11
  is filled in.
- **Secondary ICD-10 Codes** — a running list you build with the Add buttons above, removable
  individually.
- **Procedure Code (PCS)** — optional.
- **"Save Coding"** sets status to **Coded**. **"Validate & Finalise"** sets status to **Validated**
  and, if a PMJAY package matches the code, shows a **💰 Coding Impact** banner: "This episode coded
  correctly could attract ₹*amount* under *scheme* package." Both buttons stay disabled until a
  Primary ICD-10 Code is entered.

### Locking the code — this is the step that makes you, specifically, needed here

A **"Lock ICD (MRD Final)"** section only appears once an item is **Coded** or **Validated**, and
only for users whose login role is `mrd_officer`, `super_admin`, or `hospital_admin`
(`src/components/mrd/ICDCodingTab.tsx`, `MRD_LOCK_ROLES`, line 26) — a doctor or coder logging in
under any other role never sees this section at all. Enter a justification and click
**"Lock ICD"**: the item becomes **mrd_locked** and read-only (you'll see a violet **"MRD Locked —
Read Only"** banner with the lock date if you reopen it), and — per the toast message — **"PMJAY
claim submission now unblocked."**

---

## 4. 📨 Requests

Left panel: requests filtered by tabs **Pending / Approved / Fulfilled / All**, each row showing
the patient, a status badge, the requester type, and a preview of the stated purpose.

Select a request to see its **Request Details**: Patient, Requester (name + type), Contact,
Status, and Purpose.

- On a **pending** request: **"✓ Approve"**, or type a reason in the **"Rejection reason (required
  to reject)"** box and click **"✗ Reject"** (disabled until a reason is entered).
- On an **approved** request: **"Mark as Fulfilled"**.

### Logging a new request

The **"New Record Request"** dialog (opened from the header button, Section 1) asks for: **Patient**
(search by name/UHID, click the match), **Requester Type** (a dropdown — default values are
**Patient (Self)**, **Legal Guardian**, **Advocate / Lawyer**, **Insurance / TPA**, **Police**,
**Court Order**, **Government Authority**, **Treating Doctor**, **Employer**, **Research /
Academic**; your hospital's admin can edit this list), **Requester Name**, **Contact**, and
**Purpose**. Click **"Submit Request"**.

---

## 5. 📜 Death Certs

A table of every death certificate issued: **Patient**, **Time of Death**, **Cause (1a)**,
**Manner**, **MLC**, **MCCD #**, **Actions** (a **"Print"** button to reprint any certificate at
any time).

### Generating a certificate

The **"📜 Generate Death Certificate"** dialog (opened from the header button, Section 1) walks
through the **MCCD (Form 4/4A)** fields: **Patient**, **Time of Death \***, a boxed **"Cause of
Death (MCCD Format)"** section with **1a. Immediate cause \***, **1b. Due to (antecedent)**,
**1c. Due to (underlying)**, and **Part II: Contributing conditions**, then **ICD Code (underlying
cause)**, **Manner of Death** (dropdown — default values Natural/Accidental/Suicide/Homicide/
Undetermined), a **"MLC Case"** toggle, and **Certified By \*** (a dropdown of users whose role is
`doctor`). Click **"Generate Certificate"**.

The certificate auto-prints immediately on save — a formal **"MEDICAL CERTIFICATE OF CAUSE OF
DEATH (MCCD — Form 4/4A under Registration of Births and Deaths Act)"** layout with the MCCD number
and issue date, Deceased Information, the Cause of Death table (I(a)/I(b)/I(c)/II), ICD code,
Manner of Death, Medico-Legal Case Yes/No, and signature lines for the Certifying Medical
Practitioner and Seal/Stamp. You can reprint it any time from the table's **"Print"** button.

> **Content gap found, not fixed.** The MCCD number assigned on save is `MCCD-` followed by the raw
> millisecond timestamp (`src/components/mrd/DeathCertificatesTab.tsx`, line 135) — not a
> sequential per-hospital register number the way Mortuary's Body No and MLC No are generated
> (`mortuary-medicolegal-staff.md`, Sections 2 and 4). Two certificates generated in the same
> hospital will never collide, but the number itself carries no register sequence a statutory
> inspection would expect to see.

---

## 6. 📅 Retention

A table of records awaiting destruction review: **Patient**, **Record Type**, **Record Date**,
**Retain Until**, **Days Remaining**, **Basis**, **Status**, **Actions**. Status is colour-coded:
**OVERDUE** (red, past the retain-until date), **Due for Review** (≤30 days left), **Review Soon**
(≤365 days left), **On Track** (more than a year left). A **"Mark Reviewed"** button appears once a
row is ≤30 days out.

**Read the "Mark Reviewed" button carefully before you click it.** Despite its label, clicking it
does not just log a review — it writes `destruction_authorized_by` = you, `destruction_date` =
today, and `is_destroyed = true` in one step (`src/components/mrd/RetentionTab.tsx`, lines 39–48),
and the confirmation toast reads **"Marked as reviewed & authorised"**. For a legally sensitive
action — authorising destruction of a medical record — the on-screen label and the actual database
effect do not match: there is no separate "I reviewed it, keep it a while longer" option and no
second confirmation step before the destroyed flag is set.

> **The single biggest finding on this tab: nothing in the codebase ever creates a row here.**
> Checking every `.ts`/`.tsx`/`.sql` file in the repository for references to `retention_schedules`
> turns up exactly three: this tab's own `SELECT`/`UPDATE` calls, `MRDPage.tsx`'s KPI count query,
> and the generated types file — there is no insert anywhere, no trigger on any other table that
> populates it, and no edge function that runs on a schedule to seed it. The table's own definition
> (`supabase/migrations/20260328092644_e20b425f-7b11-4901-833e-bae2cd5c4448.sql`, lines 78–90) sets
> no default for `retain_until` and has no accompanying trigger to compute one — there is no
> function anywhere mapping a record type to a retention period (not 3 years, not 5, not any other
> number). **The actual retention-period logic, as implemented, is that there isn't any** — this
> screen can only ever display something if a row is inserted directly into the database by a
> process this repository does not contain yet. Until that exists, this tab — and the "Due for
> Destruction" KPI on the header — will read empty/zero for every hospital, regardless of how many
> records are actually due for review in real life. Do not assume this screen reflects your
> hospital's real retention obligations; it currently reflects nothing.

---

## 7. 🤱 Form 8 (Maternity Register)

A date-ranged register of deliveries, required under the Maternity Benefit Act, 1961.

1. Set the **Period: [from] to [to]** dates and click **"Load"**.
2. **"CSV"** downloads the visible rows as `Maternity_Register_Form8_<from>_<to>.csv`.
3. **"Print Form 8"** opens a formal printable register headed **"FORM 8 — Maternity Register"**,
   subtitled "Under the Maternity Benefit Act, 1961."

The table itself shows: **#**, **Adm. No.**, **Patient Name**, **Age**, **Adm. Date**, **Delivery
Date**, **Type**, **Outcome**, **Discharge**. It is built from `obstetric_records` filtered to
`record_type = "delivery"` within your chosen dates — ante-natal-only records are correctly
excluded. **Type** and **Outcome** are not two independently recorded facts: the schema stores one
combined mode/outcome value (`svd`/`lscs`/`forceps`/`vacuum`/`still_born`); **Type** shows that raw
value and **Outcome** derives "Stillbirth" vs "Live Birth" from it — they will always agree with
each other because they come from the same underlying field.

---

## 8. ⚖️ MLC Register — and whether this is the same case data as Mortuary's MLC tab

This tab is a **read-only register and print view** — there is no "+ Register MLC" or "New MLC"
button anywhere on this screen. A toolbar lets you **search MLC no., patient, FIR…**, filter by
**Case Type** (All Case Types / Road Traffic Accident / Assault - Violence / Poisoning / Burns /
Fall from Height / Sexual Assault / Other) and by date range, and **"Print Register"** (disabled
with zero results) produces a signed **"MLC REGISTER"** document with lines for **MRD Officer
Signature** and **Medical Superintendent Signature** — this screen exists specifically so you, the
MRD Officer, can produce that signed register. The table columns are: **MLC No.**, **Patient**,
**Case Type**, **Incident Date**, **Place**, **Police Station**, **FIR No.**, **Police Informed**
(Yes/No), **Police Intimation TAT** (a live countdown/overdue badge against the 6-hour clock), and
**Registered On**.

### This was the single most important question to answer, so it was checked directly, not assumed

`mortuary-medicolegal-staff.md`'s Section 4 documents Mortuary's own **🚔 MLC** tab, which has a
**"+ Register MLC"** button and writes new cases. Opening both components' actual queries settles
the question:

- **This MRD tab** (`src/components/mrd/MLCRegisterTab.tsx`, line 99) queries the **`mlc_cases`**
  table, keyed by `ed_visit_id` or `admission_id` — i.e. a case opened while the patient was in
  Emergency or on an IPD admission, while alive. Its 6-hour police-intimation clock comes from a
  second table, `mlc_police_notifications`, matched by `source_table`/`source_id`.
- **Mortuary's MLC tab** is not a separate component file — it is built directly inside
  `src/pages/mortuary/MortuaryPage.tsx` (lines 167, 318, 340) and reads/writes the **`mlc_records`**
  table, keyed by `mortuary_id` — i.e. a case opened against a body already admitted to mortuary
  storage. Its intimation tracking is a single `intimated_at` timestamp column with no deadline
  clock at all (confirmed by `mortuary-medicolegal-staff.md`'s own Section 4: "There is no 6-hour
  countdown or alert tied to this").

**These are two genuinely separate workflows over two separate tables, not the same underlying
case data and not a superset of each other.** `mlc_cases` has no `mortuary_id` column and
`mlc_records` has no `ed_visit_id`/`admission_id` column — there is no foreign key or shared
identifier linking a row in one table to a row in the other, and each table generates its own
independent MLC number. A patient flagged MLC on arrival in Emergency gets an `mlc_cases` row that
appears here, on this tab. If that same patient later dies and the body is admitted to Mortuary and
re-registered as an MLC case there, Mortuary creates a **second, entirely independent** `mlc_records`
row — which will never appear on this tab, and this tab's row will never appear on Mortuary's. An
MRD Officer relying on this screen as "the hospital's MLC register" will not see mortuary-originated
cases at all, and vice versa for whoever works the Mortuary module.

> **Flagged as a governance gap, not fixed.** A hospital's medico-legal case register is, in
> principle, meant to be one register. This product currently has two, unlinked, each visible from
> a different module, with no cross-reference between them even when they describe the same
> patient and the same underlying incident. Confirmed by reading both components' queries directly,
> not inferred from naming.

---

## 9. 🔍 Coding Audit

**If this tab appears blank for you, that is expected behaviour, not a bug to report** — the whole
panel is gated behind an AI-feature toggle (`useAIFeature("coding_accuracy_auditor")`,
`src/components/mrd/CodingAccuracyAuditPanel.tsx`, line 49/163) and renders nothing at all,
not even a disabled-state message, until your hospital's admin switches that feature on.

Once enabled: click **"Run Coding Audit"** (shows "Auditing *N* episodes..." while working) to have
an AI model scan up to 20 of your hospital's most recently coded/validated/locked ICD items, cross-
checked against the admission or OPD encounter's documented diagnosis, for under-coding,
over-coding, missing procedure codes, or an incorrect principal diagnosis. Results show a summary
(episodes scanned, issues found, high-impact count, and a potential **₹** revenue-recovery total),
then one card per flagged episode with the current code, a suggested alternative where applicable,
a plain-English description of the problem, and a recommended action. A fixed footer note reads:
**"AI analysis only. MRD officer and physician review required before re-coding."** — nothing here
re-codes anything automatically; you decide whether to act on each flag.

---

*This manual covers the Medical Records screens as they exist in Aumrti HMS today, including the
gaps documented in Sections 2, 5, 6, and 8. If a screen looks different from what is described
here, flag it so the manual can be corrected.*
