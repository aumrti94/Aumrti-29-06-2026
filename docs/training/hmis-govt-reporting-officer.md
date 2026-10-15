# HMIS / Govt Reporting Officer — Training Manual

## What this role does in the system

As the HMIS / Govt Reporting Officer, you work in one module: **📊 Govt HMIS Reporting**. It is a
single screen (no tabs) with a header, four KPI tiles, three report-generator cards, a **Report
History** table, and a **PCPNDT Form F Register** panel. This is where your hospital's statutory
periodic submissions to the Ministry of Health & Family Welfare (MoHFW) get generated: the Monthly
HMIS return, the weekly IDSP (Integrated Disease Surveillance Programme) syndromic-surveillance
P-Form, and the monthly RMNCH+A (Reproductive, Maternal, Newborn, Child & Adolescent Health)
return — plus a register of PCPNDT Form F entries (the PC-PNDT Act 1994's mandatory record for
every pre-natal ultrasound). This manual assumes you have never used hospital software before.

**This closes a deferred item from Phase 8.** `analytics-mis-officer.md` (Section 3) orients the
reader toward "the separate Govt HMIS Reporting module" without walking through it, and names it
in the Deferred list as a module Analytics' own file does not cover. This file is that walkthrough.

> **Access check — the standard one-time custom-role step, with the acronym slugifying exactly as
> expected.** `/hmis`'s role list (`src/lib/modules.ts`, line 97) is `["hmis_officer",
> "super_admin", "hospital_admin"]`. A fresh grep of `src/lib/routeRoles.ts` confirms there is no
> override entry for `/hmis` anywhere in that file — it falls straight through to the module
> catalogue's own role list, the same "no override" shape Phase 3 and several since have found.
> **`hmis_officer` is not one of the 8 role cards that ship by default on Settings → Staff
> Members → Add Staff Member** (`src/pages/settings/SettingsStaffPage.tsx`, `DEFAULT_ROLE_CARDS`,
> lines 95–104: Doctor, Nurse, Billing Executive, Accountant, Pharmacist, Lab Tech, Reception,
> Admin/CEO — the two-card Billing split that closed Phase 8/9's role-mislabel trap). To get an
> `hmis_officer` login, your Hospital Admin must first create it as a **custom role** on
> **Settings → Roles & Permissions**: typing a free-text label slugifies it into the exact
> snake_case key the route guard expects
> (`src/pages/settings/SettingsRolesPage.tsx`, `slugifyRoleName`, lines 45–46 — lower-cases the
> label, collapses every run of non-alphanumeric characters to a single underscore, then trims
> leading/trailing underscores). **Checked on this exact input, not assumed**: `"HMIS Officer"` →
> trim → lower-case `"hmis officer"` → the space collapses to one underscore → `hmis_officer` —
> an exact match, with no unpredictable behaviour from the acronym. This works correctly today; it
> is a one-time admin-configuration step, not a product gap. **No `doctor` fallback exists on this
> module's role list** — unlike Dietitian/Physiotherapy's split in Phase 5/7, there is no
> zero-setup login for this specific job title; the custom-role step is mandatory. A genuine
> safety net exists regardless: `hospital_admin` ("Admin/CEO", a default card) is explicitly on
> `/hmis`'s own role list *and* covered independently by `BYPASS_ROLES = ["super_admin",
> "hospital_admin"]` (`routeRoles.ts`, line 116), so your Hospital Admin can always open this module
> immediately, with or without the custom role existing yet.
>
> **The Settings-side companion page is admin-only configuration, not a second screen for this
> role — the same ABDM-precedent split Phase 10 drew.** `src/pages/settings/SettingsHMISPage.tsx`
> (route `/settings/hmis-portal`) is where the MoHFW IHIP portal's HIN Code, Facility Code,
> username, and password are saved — a one-time credential setup, not part of your day-to-day
> work. It falls under the general `/settings/*` gate (`hasAccess()` resolves it to the `/settings`
> entry in `routeRoles.ts`, line 15: `super_admin`/`hospital_admin` only) — an `hmis_officer` login
> cannot open it even after the custom-role step, by design. If your hospital's reports keep
> falling back to "submitted manually" (Section 6), that credential page — not this module — is
> where your admin needs to look.

This module shows no money anywhere — no bill, no ₹ figure, no `formatCurrency()` call. All dates
*should* display as DD/MM/YYYY; Section 6 and Section 7 flag two places where that convention is
broken.

---

## 1. The header and KPI tiles

The header bar reads **📊 Govt HMIS Reporting** with two buttons: **"Generate Report"** (generates
the current month's Monthly HMIS report immediately, Section 2) and **"IDSP Alert"** (opens the
manual single-disease outbreak alert dialog, Section 4 — not the same thing as the automatic
weekly syndrome scan in Section 3).

Below that, four KPI tiles always show: **Reports This Month** (every report of any type, for the
current calendar month, generated or submitted — a Monthly HMIS and a RMNCH+A report generated in
the same month both count here), **Submitted** (status `submitted` or `accepted`, across all
history), **Pending** (status `draft` or `generated`, i.e. made but not yet sent), and **IDSP
Alerts** (a running total of every alert logged via Section 4 for the current year — not a count
of unresolved/open alerts).

---

## 2. Generating the Monthly HMIS Report

The first of three report cards, **📋 MoHFW Monthly HMIS**, shows "Due: 5th of every month," a
status badge, and a button.

1. Click **"Generate *[Month]* Report →"** (or the header's **"Generate Report"** button — both do
   the same thing for the current month).
2. The report compiles automatically from your hospital's existing records for the calendar
   month — you do not type any numbers in yourself. It pulls OPD attendance, IPD
   admissions/discharges/deaths/ALOS/bed-occupancy, completed surgeries by type, deliveries
   (normal vs. caesarean), and total lab tests.
3. A toast confirms **"HMIS Report generated for *[Month] [Year]*"** and the **Report Viewer**
   opens automatically (Section 6 covers everything in it).

Re-running this for the same month safely overwrites the existing draft rather than creating a
duplicate — it is the only one of the three report types built this way (see the flagged
inconsistency at the end of Section 5).

---

## 3. Generating the Weekly IDSP P-Form — and what actually triggers a syndrome flag

The second card, **🦠 IDSP Disease Surveillance**, shows "Due: Every Monday (P-form)."

1. Click **"Generate Week *[N]* P-Form →"**.
2. The system pulls every OPD visit and IPD admission recorded in your hospital during that
   calendar week and scans two free-text fields — the OPD visit's **Chief Complaint** and the IPD
   admission's **Admitting Diagnosis** — for specific words. If any one of those words appears
   anywhere in the text (as a substring, case-insensitive), that visit or admission is counted
   under the matching syndrome. The eight syndromes and the exact words each one looks for
   (`src/pages/hmis/HMISPage.tsx`, `SYNDROME_KEYWORDS`, lines 21–30) are:

   | Syndrome flagged | Matches if the text contains... |
   |---|---|
   | Fever (>38°C) | "fever", "pyrexia", "febrile" |
   | Acute Diarrhoeal Disease | "diarrhoea", "diarrhea", "loose stools", "gastro", "gastroenteritis" |
   | Jaundice | "jaundice", "yellow eyes", "icterus" |
   | Rash with Fever | "rash", "skin eruption" |
   | Severe Acute Respiratory Illness (SARI) | "breathlessness", "sari", "severe respiratory", "pneumonia" |
   | Acute Flaccid Paralysis | "afp", "flaccid paralysis" |
   | Dengue-like Illness | "dengue", "myalgia", "thrombocytopenia" |
   | Malaria-like Illness | "malaria", "chills", "rigors" |

   **This is a text-matching scan, not a clinical reading.** "Fever (>38°C)" does not check any
   recorded temperature value anywhere — it fires the moment the word "fever" (or "pyrexia" or
   "febrile") appears in a complaint or diagnosis field, regardless of whether a temperature was
   ever taken or what it actually was. The same visit can count under more than one syndrome at
   once (a complaint of "fever with myalgia" matches both Fever and Dengue-like Illness). An
   admission's death only counts toward a syndrome's death column if that admission's own
   diagnosis text matched that same syndrome's keywords.
3. The toast confirms **"IDSP P-Form generated for Week *N*"** and opens the viewer, which shows a
   table — **Syndrome / OPD / IPD / Deaths** — with any row that has at least one case highlighted
   in amber.

Regenerating the same week's P-Form is **not** safe the way Section 2's Monthly HMIS is — see the
flagged defect at the end of Section 5.

---

## 4. Logging a manual IDSP Disease Alert — a different thing from the weekly P-Form

Clicking the header's **"IDSP Alert"** button opens a separate dialog, **"IDSP Disease Alert —
W*N*/*Year*"**, for reporting one specific named disease — this is not the same mechanism as
Section 3's automatic keyword scan, and the two do not feed each other.

1. **Select disease** — a dropdown of 15 named diseases (Acute Diarrhoeal Disease, Typhoid,
   Cholera, Viral Hepatitis, Dengue, Chikungunya, Malaria, Leptospirosis, Acute Encephalitis
   Syndrome, Meningitis, Measles, Diphtheria, Pertussis, Chicken Pox, Other).
2. **"Syndrome (optional)"** — free text.
3. **OPD Cases / IPD Cases / Deaths** — you type these in by hand; nothing here is pulled
   automatically the way Section 3's P-Form is.
4. Tick **"⚠️ Mark as Outbreak"** if applicable, and add **Notes** if needed.
5. Click **"Save & Submit to IDSP"**. The alert is always saved to your hospital's own records
   first; the system then separately attempts to submit it to the NHA IHIP portal. If that
   succeeds, you'll see a green **"Submitted to IDSP Portal"** confirmation with an acknowledgment
   reference. If the portal is unreachable or your hospital hasn't configured its credentials yet
   (Settings → Integrations, covered above), you instead see **"IDSP alert recorded locally ✓"**
   plus a reminder to configure credentials — your alert is not lost, it just hasn't reached the
   government portal yet.

---

## 5. Generating the Monthly RMNCH+A Report

The third card, **🤰 RMNCH+A Maternal & Child**, shows "Due: 5th of every month."

1. Click **"Generate Report →"** (this card's button, unlike the Monthly HMIS card, does not
   include the month name in its label — a minor wording inconsistency between the two cards, not
   a functional difference).
2. The report compiles Antenatal Care visits/early registration/high-risk detection, delivery
   outcomes (normal vs. caesarean), postnatal visits, neonatal outcomes (low/very-low birth weight,
   birth asphyxia by 5-minute APGAR <7), and total immunisations given — all pulled automatically
   from existing obstetric, neonatal, and vaccination records for the month.
3. The viewer opens showing each of those sections as its own collapsible card.

> **Fixed.** The Weekly IDSP P-Form (Section 3) and the Monthly RMNCH+A report (this section) used
> to do a plain `insert` with no `onConflict` handling, unlike Monthly HMIS's correct `upsert` —
> clicking either report's generate button a second time for an already-generated week or month
> hit the real `uq_hmis_report` database constraint and failed with a raw duplicate-key error
> instead of refreshing. Both now `upsert` against the constraint's full 5-column conflict target
> (`hospital_id, report_type, period_year, period_month, period_week`), matching Monthly HMIS's
> pattern — regenerating a period you've already run now cleanly refreshes it.

---

## 6. Report History — viewing, re-opening, downloading, and submitting

Below the three cards, the **Report History** table lists every report ever generated: **Report
Type**, **Period**, **Generated** (shown correctly as `DD/MM/YYYY HH:mm`), **Status**, and
**Actions**.

1. Click the eye icon (**View**) on any row to re-open its Report Viewer without regenerating it.
2. If the row's status is **generated** or **draft**, a **"Submit"** button appears — this calls
   the same NHA IHIP portal submission the IDSP Alert dialog uses: success shows **"Submitted to
   portal. Ack: *[reference]*"**; a portal failure falls back to marking the report submitted
   locally with a **"Portal credentials not configured — marked as submitted manually"** toast.
3. A row that has an acknowledgment reference shows a small **✓ACK** badge.

Inside the **Report Viewer** modal (opened from any card's "Generate" button, or from View above):
- **"Download Excel"** exports the report's figures as a `.xlsx` workbook.
- **"Mark as Submitted"** appears only if the report isn't already `submitted`/`accepted` — this is
  a second, separate way to flip the status to submitted, distinct from the table row's "Submit"
  button: it only updates your own hospital's record and never calls the government portal at all.
  Use the table row's "Submit" when you actually want the system to try reaching IHIP; use this
  button only when you've already submitted a report outside the system (e.g. manual upload) and
  just need Aumrti's own record to reflect that.
- **"Close"**.

> **Fixed.** Two places in this module used to display a date straight from the database in ISO
> `YYYY-MM-DD` form instead of `DD/MM/YYYY`: the IDSP P-Form viewer's **"Period: *[from]* to
> *[to]*"** line, and the PCPNDT Form F Register table's **Date** column and its printed Form F
> document (Section 7 below). Both now format via `dd/MM/yyyy`, matching the Report History
> table's Generated column.

> **Fixed — dead code removed.** The Report History table's type column used to also have a label
> mapped for "IDSP L-Form," but nothing anywhere in this file — or found in a repo-wide search —
> ever created a report with that type. The vestigial label branch has been removed.

---

## 7. PCPNDT Form F Register

A table at the bottom of the screen — **Date, Patient Name, Age, Indication, Sex Det., Actions** —
plus an **"+ Add Form F"** button.

1. Click **"+ Add Form F"**.
2. **Select the radiology order first** — the "Radiology Order (Required)" dropdown lists your
   hospital's 100 most recent radiology orders of *any* type, not only ultrasounds or only
   obstetric studies; choosing one auto-fills the patient name and indication if the order already
   has them.
3. Fill in **Patient Name \*** (required), Age, Address, Referred By, Procedure Date, Indication
   for Procedure, and Findings/Remarks.
4. Tick **"Sex determination was performed (legally required to disclose)"** only if it genuinely
   was — this is the single most legally significant field on the form.
5. Click **"Save Form F"**. The new row appears in the table immediately; click **"Print"** on any
   row at any time to reprint the formal **"FORM F"** document (PC-PNDT Act 1994 layout) for that
   entry.

> **The single biggest finding in this module: this register is not the only — or even the
> primary — place Form F gets filled in, and the two systems do not share data.** This was checked
> directly by reading every file that touches a PCPNDT table, not assumed from this screen alone.
>
> This tab reads and writes the **`pcpndt_form_f`** table (`supabase/migrations/
> 20260322161647_...sql`, lines 102–116). Two other code paths write to that same table
> automatically, with no officer involvement at all: ordering an obstetric ultrasound from
> Radiology's own New Order screen, or from a doctor's OPD consultation (Rx & Orders tab) — both
> detect an obstetric ultrasound via the shared `requiresPcpndtFormF()` check
> (`src/lib/pcpndt.ts`) and silently insert a `pcpndt_form_f` row the moment the order is placed
> (`src/components/radiology/NewRadiologyOrderModal.tsx`, `src/lib/investigationSync.ts`). Those
> auto-created rows always have **`sex_determination_done = false`** — the column's own database
> default (`supabase/migrations/20260322161647_...sql`, line 111) — because at order time the scan
> hasn't happened yet; nothing ever revisits that field afterward on *this* table.
>
> Separately, and completely independently, Radiology's own reporting workspace
> (`src/components/radiology/RadiologyReportingWorkspace.tsx`) gates an obstetric order's report
> from being finalised behind a **different, newer, and far more complete** Form F —
> `PCPNDTFormModal.tsx` — which writes to a **different table entirely, `pcpndt_records`**
> (`supabase/migrations/20260908000005_pcpndt_records.sql`), not `pcpndt_form_f`. This is where a
> radiologist actually records LMP, gestational age, gravida/para, an indication *category*,
> patient consent, a sequential **Form Number** (`PCPNDT-<year>-<sequence>`), and the real
> mandatory declaration — a checkbox reading *"I hereby declare that... I have **NOT** determined
> and will **NOT** disclose the sex of the foetus..."* — which must be ticked before the modal's
> **"Save Form F"** / **"Update Form F"** button is even enabled. This is the legally complete,
> radiologist-signed version of the form.
>
> **These two tables have no foreign key or shared identifier linking a row in one to a row in the
> other** — `pcpndt_form_f.order_id` and `pcpndt_records.radiology_order_id` both point at the same
> underlying `radiology_orders` row, but neither table has any column referencing the other, and
> each generates its own form reference independently (`pcpndt_records` has a real sequential
> `form_number`; `pcpndt_form_f` has none). **As the HMIS Officer, the register on this screen is
> only ever a partial, duplicate-risking view of your hospital's real PCPNDT compliance**: an
> obstetric scan that Radiology has already fully and correctly documented in `pcpndt_records`
> will *also* silently carry a thin, `sex_determination_done = false`-by-default row in
> `pcpndt_form_f` from the moment it was ordered — the exact same order can appear once correctly
> in Radiology's register and once incompletely in yours, with nothing on this screen telling you
> the fuller version already exists elsewhere. Manually adding a Form F here for an order Radiology
> has already completed does not update or merge with their record — it creates a second,
> independent `pcpndt_form_f` row, since this screen has no awareness of `pcpndt_records` at all.
> Treat this screen's register as a supplementary log, not your hospital's single source of truth
> for PCPNDT compliance — that currently lives split across two unlinked tables, the same
> "two registers, no cross-reference" governance gap Phase 9 found between MRD's and Mortuary's MLC
> tables. **Confirmed as deliberately deferred, not fixed in this pass's defect sweep**: a
> follow-up investigation held this to the same standard as Phase 9's MLC consolidation — bridging
> the two tables needs a real design decision (which register is authoritative, what happens to
> already-divergent rows), not a narrow patch, so it remains open rather than half-bridged. Rough
> sizing: 1–1.5 engineer-weeks once scoped, the same order of magnitude as the MLC consolidation.
> The on-screen date picker you fill in when adding an entry (Section 7, step 3) reads and writes
> in raw `YYYY-MM-DD` form, consistent with standard HTML date inputs — this is normal, not a
> defect; only the *displayed* table/print values needed the DD/MM/YYYY fix noted above.

---

*This manual covers the Govt HMIS Reporting screen as it exists in Aumrti HMS today, including the
gaps documented in Sections 5, 6, and 7. If a screen looks different from what is described here,
flag it so the manual can be corrected.*
