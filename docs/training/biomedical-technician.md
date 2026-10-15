# Biomedical Equipment Technician — Training Manual

## What this role does in the system

As a Biomedical Equipment Technician, you work in one module: **🔧 Biomedical Engineering**. It
opens on the **🖥 Equipment** tab — the hospital's full equipment registry — and from there you
schedule and log **Maintenance**, record **Calibration**, log and resolve **Breakdowns**, watch the
**Alerts** tab for anything overdue or expiring, read the **🤖 AI Predictive** panel, and run
**Reports**. This manual assumes you have never used hospital software before.

> **Access check — a real one-time admin-configuration step, the same pattern Phase 5/6 found for
> Dialysis, Oncology, IVF, Mortuary, Dental, AYUSH and CSSD.** The `/biomedical` route has no
> override in `src/lib/routeRoles.ts`, so it inherits its allowed-roles list straight from the
> module catalogue (`src/lib/modules.ts`, line 95): **Biomedical Technician**, **Super Admin**, and
> **Hospital Admin**. The job title is on that list — there is no flat access gap the way Phase 2
> found for Radiology Technician. But **Biomedical Technician is not one of the 7 role cards that
> ship by default on Settings → Staff Members → Add Staff Member**
> (`src/pages/settings/SettingsStaffPage.tsx`, `DEFAULT_ROLE_CARDS`, lines 85–92: only Doctor, Nurse,
> Billing, Pharmacist, Lab Tech, Reception, Admin/CEO), and it is not seeded by any migration as a
> pre-built system role. **There is no `doctor` or `nurse` fallback on this module's role list
> either** — unlike Dietetics/Physiotherapy, no existing clinical login can open `/biomedical` with
> zero setup. To get a login titled "Biomedical Technician", your Hospital Admin must first create
> it as a **custom role** on **Settings → Roles & Permissions**: typing the free-text label there
> slugifies it into the exact snake_case key the route guard expects
> (`src/pages/settings/SettingsRolesPage.tsx`, `slugifyRoleName`, lines 44–46, used at role-creation
> time around lines 320–330) — "Biomedical Technician" becomes `biomedical_technician`, which
> matches exactly. This works correctly today and is a one-time setup step, not a product gap.

All dates on screen show as DD/MM/YYYY. Money shows as ₹.

**Note on NABH evidence:** unlike Dietetics, Housekeeping, or Ambulance, no screen in this module
calls `logNABHEvidence()` — not on adding equipment, completing a PM, recording a calibration
result, or reporting/resolving a breakdown, even for a Calibration Fail or a Critical breakdown.
Nothing in this manual should be read as implying otherwise; if your NABH assessor asks for
biomedical-engineering evidence, it comes from the records themselves (PM schedules, calibration
records, breakdown logs), not from an evidence log entry.

---

## 1. The header — KPIs and quick actions

Two buttons, both gated by your hospital's permission setup for this module (if either is missing
for your login, ask your admin — it isn't a bug):
- **"Add Equipment"** — opens the equipment-registration form (Section 2).
- **"Report Breakdown"** — opens the breakdown form directly (Section 5), without going through
  Equipment first.

Below the header, five KPI tiles always show: **Total Equipment**, **Operational**, **Under
Maintenance**, **PM Overdue**, and **AMC Expiring (30d)**.

**What "AMC Expiring (30d)" means:** AMC is the Annual Maintenance Contract — the yearly service
agreement a hospital holds with a vendor for a piece of equipment (covering routine servicing and,
usually, breakdown repairs at no extra cost). This tile counts every piece of equipment whose AMC
contract is due to lapse within the next 30 days, so you (and your admin) have time to renew it
before the equipment is left uncovered.

---

## 2. 🖥 Equipment — the registry

A filterable table (search by name/code, or filter by Category, Status, or Department) of every
active piece of equipment: Code, Name, Category, Dept, Make / Model, Status, AMC Expiry (shown in
red if under 30 days away, amber under 60).

### Registering new equipment

1. Click **"Add Equipment"** in the header.
2. The system generates the **Code** for you automatically (e.g. `EQ-2026-004`) — you cannot edit
   this field.
3. Fill in **Equipment Name \***, **Category \*** (Diagnostic, Therapeutic, Patient Monitoring,
   Laboratory, Surgical Instruments, OT Equipment, IT / Computers, Utility / Electrical, Radiation
   / Imaging, or Other — your hospital's exact list is configurable), **Make \***, and **Model \***.
4. Optionally: **Serial Number**, **Department**, **Location** (e.g. "ICU Bed 3"), **Purchase
   Date** and **Purchase Cost (₹)**, **Warranty Expiry** and **Warranty Vendor**, **AMC Vendor**,
   **AMC Cost (₹)**, **AMC Start**, and **AMC Expiry**.
5. If you set Category to **Radiation / Imaging**, an extra amber panel appears for **AERB License
   No** and **AERB Expiry** — fill these in for any X-ray, CT, or other radiation-emitting
   equipment; AERB (Atomic Energy Regulatory Board) licensing is mandatory for this equipment
   category.
6. Add **Notes** if needed, then click **"Save Equipment"**.

### Viewing a piece of equipment's full history

Click any row to open its detail drawer, with four tabs: **Details** (every field above, plus the
AERB panel if applicable), **PM History**, **Breakdowns**, and **Calibration** — each showing that
equipment's full record without leaving this screen.

---

## 3. 📅 Maintenance — preventive maintenance (PM) schedules

Filter buttons across the top: **All**, **Overdue**, **Due This Week**, **Done**. Each schedule
card shows the equipment, its PM frequency, and a status line: **"🔴 OVERDUE by N days"**, **"⚠️
Due in N days"** (amber, within 7 days), **"📅 Due DD/MM/YYYY"**, or **"✅ Done DD/MM/YYYY"**.

### Scheduling a new PM

1. Click **"Schedule PM"**.
2. Pick the **Equipment**, a **Frequency** (Weekly, Monthly, Quarterly, Biannual, Annual), and the
   **First Due Date**.
3. **Checklist Items** — leave blank to use the category's default checklist (e.g. diagnostic
   equipment defaults to Probe check / Image quality / Safety interlock / Calibration verify), or
   type your own, one item per line.
4. Click **"Schedule PM"**.

### Completing a PM

1. On any schedule that isn't already Done, click **"Mark as Done"**.
2. Tick every item in the **Checklist** — the save button stays disabled (showing **"Complete all
   checklist items"**) until every box is ticked.
3. Add **Observations** if needed, then click **"Save PM Record"**.
4. On save, the system automatically: marks this schedule Done, creates the **next** PM schedule
   for this equipment based on its frequency (so you never have to re-create a recurring PM
   yourself), and sets the equipment's status back to **Operational**.

---

## 4. 🔬 Calibration — calibration records

A table of every calibration record: Equipment, Last Calibrated, Agency, Next Due (red under 30
days, amber under 90), Certificate, Result.

1. Click **"Add Calibration Record"**.
2. Pick the **Equipment \*** — the system suggests a **Next Due \*** date one year from the
   calibration date automatically (you can override it).
3. Fill in **Calibration Date \***, **Calibrating Agency \***, and optionally **Certificate No**.
4. **Result \*** — Pass, Fail, Out of Range, or Adjusted. Choosing **Fail** or **Out of Range**
   shows a warning: **"⚠️ Equipment will be marked for calibration and a clinical alert will be
   raised."**
5. Add **Observations** if needed, then click **"Save Record"**.

If you record a Fail or Out of Range result, the equipment's status is set to **Calibration** (it
is not listed as Operational again until a passing record is added) and a high-severity clinical
alert is raised for the hospital.

---

## 5. 📋 Breakdowns — reporting and resolving a fault

### Reporting a breakdown

1. Click **"Report Breakdown"** (header, Section 1) or from the Breakdowns tab.
2. Pick the **Equipment \***, describe the issue in **Description \***, and pick a **Severity**
   (Low / Medium / High / Critical).
3. Click **"Report Breakdown"**. The equipment's status flips to **Breakdown** immediately, and if
   you chose **Critical**, a high-severity clinical alert is raised for the hospital straight away.

> **Defect found and fixed — same class as Mortuary's `released_by` bug from Phase 6.**
> `reported_by` on this breakdown record previously came from a separate, unfiltered first-row
> query on the hospital's `users` table, not your own logged-in account — so whoever it was
> attributed to in the database was not reliably you. It now reads the real logged-in user
> straight from `useHospitalId()` (the same hook this file already used for `hospitalId`), with no
> extra query. If your session somehow isn't ready, the screen now blocks the report with a toast
> instead of silently attributing it to the wrong person.

### Resolving an active breakdown

Active breakdowns show at the top, each with elapsed time since reported and — for diagnostic or
radiation equipment only — an estimated revenue-loss figure in ₹ (a flat ₹15,000/hour assumption,
shown as **"Est. revenue lost: ₹..."**).

1. Click **"Update"** on the breakdown.
2. Fill in **Vendor**, **Vendor Called At**, **Repair Started**, **Repaired At**, **Root Cause**,
   **Parts Replaced**, and **Repair Cost (₹)** as they become known — you can save this form more
   than once as information comes in.
3. Click **"Mark Resolved"** once the repair is actually done. This records total downtime (hours
   between reported and repaired), sets the equipment's status back to **Operational**, and moves
   the record to the **Resolved** list below, which shows downtime, cost, and root cause for every
   past breakdown.

---

## 6. ⚠️ Alerts — everything overdue or expiring in one place

This tab rolls up every time-sensitive signal in the module into one sorted list: **PM Overdue**,
**PM Due Soon** (within 7 days), **Calibration Due** (within 90 days), **AMC Expiring** (within 60
days, showing vendor and annual cost), **AERB License Expiring** (radiation equipment, within 90
days), and **Warranty Expiring** (within 30 days). The tab's own badge in the tab bar shows a count
combining PM-overdue and AMC-expiring items.

Each row has an **"Action →"** button that jumps you straight to the relevant tab (Maintenance,
Calibration, or Equipment) to act on it. If nothing is pending, the tab shows **"✅ No pending
alerts — all equipment is compliant"**.

**Note:** this tab also shows the full AI Predictive panel (Section 7) at its very top — it is not
a separate feature here, it's the same panel that also has its own "AI Predictive" tab.

---

## 7. 🤖 AI Predictive — predictive maintenance

This tab's own on-screen heading is **"🔮 Predictive Maintenance"**, with a **"Run AI Analysis"**
button next to it. **This is a real, working AI feature, not a stub** — confirmed by reading
`PredictiveMaintenanceSection.tsx` directly, unlike CSSD's "Autoclave Anomaly Detector" (flagged as
a demo stub in Phase 6).

1. Click **"Run AI Analysis"**.
2. The system pulls each piece of currently Operational or Under Maintenance equipment (up to the
   first 10) along with its breakdown history, sends that to an AI model, and asks it to predict
   maintenance risk.
3. Any equipment the model comes back with a risk above "low" appears as a card with a risk badge
   reading **"MEDIUM RISK"**, **"HIGH RISK"**, or **"CRITICAL RISK"**, the predicted issue, the
   recommended action, how many days until it should be acted on (e.g. "Within 14 days"), and — if
   the model estimated one — an approximate cost shown as "Est. ₹...".
4. Click **"Schedule PM"** on any card to create a real preventive-maintenance schedule from that
   prediction immediately, due on the predicted date, with the AI's recommended action as the
   checklist item.

**Treat every prediction as a draft worth checking, not a finding to act on blindly** — it comes
from an AI model reading limited breakdown history and the equipment's purchase date, with no
access to anything that happened on the ward today. Use your own judgement before scheduling PM
off a prediction you have reason to doubt.

---

## 8. 📊 Reports

Two reports: **"📊 Downtime Report"** (per equipment: number of breakdowns, total downtime in
hours, average repair time, and total repair cost in ₹, sorted by worst downtime first) and
**"☢️ AERB Compliance Report (Radiation Equipment)"**, for radiation equipment only (license
number, expiry date, and a status badge — **"EXPIRED — CANNOT OPERATE"** in red for any licence
past its expiry date, **"License Missing"** if none is on file, **"Valid"** otherwise).

---

*This manual covers the Biomedical Engineering screens as they exist in Aumrti HMS today, including
the gap documented in Section 5. If a screen looks different from what is described here, tell
Lalitha (Biomedical & Asset Management) so the manual can be corrected.*
