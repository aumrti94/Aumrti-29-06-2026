# Analytics / MIS Officer — Training Manual

**Module:** Analytics & BI (`src/pages/analytics/AnalyticsPage.tsx`)
**Owner:** Santosh (analytics, BI & HMIS reporting)
**Screen:** **Analytics & BI** in the main menu

> Money on every screen in this manual is shown in Indian Rupees with the ₹ symbol. Dates are
> shown as DD/MM/YYYY. You never type a date range by hand for the dashboards below — you pick a
> quick range or a custom From/To pair, and every chart and KPI card updates to match.

> **Access check — read this before you assume your login already has this module.** "Analytics /
> MIS Officer" does not map cleanly onto a single role string that an existing default staff
> account already carries. The exact trap, and how to avoid it, is in **Access control** near the
> end of this file — read it before telling a hospital "your Billing Clerk can already see this,"
> because, for this specific module, that assumption is wrong.

---

## What this role does in the system

Open **Analytics & BI** from the main menu. You land on a single screen
(`src/pages/analytics/AnalyticsPage.tsx`) with four fixed parts, confirmed against the component
source:

- A **header bar** with the quick date-range buttons, a **Forecasts** button, an **AI Digest**
  button, an **Export** button, and a refresh icon.
- A **tab strip** of eleven tabs (the `TABS` constant in source, with their exact on-screen
  labels including the emoji each one carries): **📊 Revenue · 🏥 Clinical · 👨‍⚕️ Doctors · 🏢
  Departments · ✅ Quality · 📋 PROM/PREM · 🌱 ESG · 🤖 AI Digest · 📈 AI Performance · 🏆
  National Benchmarks · 📋 Custom Report**.
- The **content area** below, which swaps to whichever tab is active.
- A **footer bar** with "Data refreshes every 5 minutes," a **Force Refresh** link, a
  last-updated timestamp, and three more links: **Custom Report**, **Schedule Reports**, and
  **Export** (the footer's Custom Report and Export links just jump you to the same tab/modal as
  the header controls — they are not separate features).

Your day-to-day work on this screen is: pick the right date range, read the tab relevant to the
question you're answering, and get the numbers out to whoever asked for them — as a one-off
export, a scheduled recurring email/WhatsApp, or a custom-built report. You are not expected to
read every chart in every tab daily; the walkthroughs below cover the controls you will actually
click, not every chart underneath them.

### 1.1 Pick a date range

1. In the header, click one of the five quick-range buttons: **Today**, **Yesterday**, **This
   Week**, **This Month**, **Last Month**. The screen defaults to **This Month** when you first
   open it.
2. For a range the quick buttons don't cover, click **Custom** — two date buttons appear (From /
   To). Click **From**, pick a date on the calendar pop-up, then click **To** and pick the end
   date (the To-calendar blocks any date before your chosen From date). Every tab's data updates
   to this custom range the moment both dates are picked.
3. The small "Updated Nm ago" text next to the page title, and "Last updated: ..." in the footer,
   tell you how stale the current numbers are — click the refresh icon (header) or **Force
   Refresh** (footer) to pull the latest figures without changing your selected range.

### 1.2 Switch between tabs

Click any tab label in the tab strip to switch. What each one is for, grounded in the real
component behind it:

- **📊 Revenue** (`RevenueTab.tsx`) — collection KPI cards (**Total Collection**, **Outstanding**,
  **OPD Collections**, **IPD Collections**, **Pharmacy Sales**, **Lab Collections**, **Radiology
  Collections**, **Insurance Settled**, **Emergency Collections**, **Daycare Collections**,
  **Package Collections**), a revenue trend chart, a payment-mode breakdown, and a daily
  collections heatmap calendar. This is the tab you open first for "how much did we collect this
  month."
- **🏥 Clinical** (`ClinicalTab.tsx`) — OPD/IPD volumes and clinical activity for the selected
  range.
- **👨‍⚕️ Doctors** (`DoctorsTab.tsx`) — a searchable, department-filterable doctor leaderboard
  (cards or table view, toggle in the header controls), each doctor scored on **OPD Visits**,
  **Revenue**, **IPD Admits**, **OT Cases**, **Avg LOS**. Click a doctor's card/row to drill into
  their detail.
- **🏢 Departments** (`DepartmentsTab.tsx`) — a department list on the left (ranked by revenue)
  with a detail/drill-down panel on the right showing that department's doctors and top services.
- **✅ Quality** (`QualityTab.tsx`) — four summary cards (**Patient Safety**, **Infection
  Control**, **Clinical Quality**, **Patient Satisfaction**) above a live **Quality Indicators**
  table pulled from the same NABH indicator data `quality-nabh-officer.md` documents feeding.
- **📋 PROM/PREM** (`PROMAnalyticsTab.tsx`) — patient-reported outcome/experience survey results
  (**Response Rate**, **Avg Overall PREM**, **Avg Pain Score (post-discharge)**, **Readmission
  Rate**). Click **Send Surveys (48h discharged)** to trigger the batch send to patients
  discharged in the last 48 hours — this is the one button on this tab you may actually need to
  click, not just read.
- **🌱 ESG** (`ESGTab.tsx`) — sustainability metrics (electricity, water, biomedical waste,
  carbon offset) by month. Click **Enter Monthly Data** to open the entry form if your hospital's
  Facility/Housekeeping team hasn't logged the current month yet; an **AI Recommendations**
  button (only visible if your hospital has this AI feature switched on) drafts suggestions —
  review before acting on them, the same as any AI output elsewhere in Aumrti.
- **🤖 AI Digest** — see 1.4 below, it has its own walkthrough.
- **📈 AI Performance** (`AIPerformanceDashboard.tsx`) — accept/override/reject/flag rates for
  every AI feature in the hospital, by feature. This is read-only oversight of how staff are
  actually using AI suggestions, not a clinical screen itself.
- **🏆 National Benchmarks** (`NationalBenchmarkTab.tsx`) — your hospital's own indicator values
  lined up against published NABH/NHM national benchmark figures (ALOS, Bed Occupancy Rate,
  CLABSI/CAUTI/VAP/SSI rates, medication error rate, fall rate, and more), each tagged with its
  published source.
- **📋 Custom Report** — see 1.5 below.

### 1.3 Export a report

1. Click **Export** (header button, or the footer's **Export** link — same modal either way).
2. Under **What to export**, pick one of three scopes: **Current Tab View**, **Full Analytics
   Report**, or **AI Digest**.
3. Pick a **Format**: **Excel (.xlsx)**, **PDF Report**, or **CSV Data**.
4. If you picked **Full Analytics Report**, an **Include sections** checklist appears —
   **Revenue Summary**, **Clinical Statistics**, **Doctor Performance**, **Department P&L**, and
   **Quality Indicators** are ticked by default; **Raw Data Tables (large file)** is off by
   default — tick it only if you actually need the underlying row-level data, it produces a much
   bigger file.
5. Click **Generate & Download**. For PDF, this opens your browser's print dialog instead of
   downloading a file directly — use "Save as PDF" in that dialog.

### 1.4 Read and send the AI Digest

1. Click the **🤖 AI Digest** tab (or the **AI Digest** button in the header — both land you on
   the same tab).
2. Use the **‹** / **›** arrows either side of the date label to move the digest back/forward one
   day at a time.
3. If no digest exists yet for that day, click **Generate Now**. Once one exists, you can click
   **Regenerate** to produce a fresh one for the same day.
4. Click **Send to WhatsApp** to deliver the digest text to whoever your hospital has configured
   to receive it. Once delivered, the button relabels to **Delivered ✓** for that day's digest.
5. The right-hand panel shows a same-day KPI snapshot (OPD Patients, Revenue Collected, Bed
   Occupancy, Pending Bills, Lab Pending, Critical Alerts) independent of whichever date you're
   viewing the digest text for.

### 1.5 Build a custom report

1. Click the **📋 Custom Report** tab.
2. On the left panel: type a **Report Name**, pick a **Data Source** (Revenue & Billing / OPD
   Visits / IPD Admissions / Lab Orders / Pharmacy Sales / Quality Indicators), pick **Group By**
   (Day / Week / Month / Department / Doctor), tick which **Metrics** you want (options change
   based on the data source you picked), and pick a **Chart Type** (Bar Chart / Line Chart / Pie
   Chart / Table).
3. Click **Preview Report** to run it against your currently selected date range — the result
   renders on the right.
4. Click the floppy-disk icon next to **Preview Report** to save this configuration under
   **Saved Reports** at the bottom of the left panel, so you can reload it later without
   re-picking every setting. Click **Export** (top right of the preview) to download the current
   preview as an Excel file.

   **Content note, worth knowing before you rely on this:** "Saved Reports" here are written to
   your browser's own `localStorage` (`CustomReportBuilder.tsx`), not to a database table. A
   report you save will not appear if you open Analytics on a different computer or browser, and
   is lost if that browser's site data is ever cleared. This is a real, confirmed limitation, not
   a bug to be fixed by re-clicking anything — if a report needs to survive across devices, rebuild
   it there rather than assuming "Saved Reports" carries it.

### 1.6 Schedule a recurring report

1. Click **Schedule Reports** in the footer. This schedules the **Full Analytics Report** as a
   whole — it is not tied to whichever tab happens to be open when you click it.
2. Pick a **Frequency** (**Daily / Weekly / Monthly**) — for Weekly, also pick a day of the week;
   for Monthly, also pick a day of the month — and a delivery **time**.
3. Under **Recipients**, the **All CEO/Admin users** switch is on by default; type a name and
   click **Add** to include specific people as well.
4. Pick **Delivery** (WhatsApp and/or Email — WhatsApp is ticked by default) and **Format**
   (Excel and/or PDF — Excel is ticked by default).
5. Click **Save Schedule**.

   **Content finding, confirmed and not fixed (a navigability gap, not a narrow bug).** Once
   saved, this screen gives you no way to see, pause, or cancel the schedule you just created —
   there is no "my schedules" list anywhere inside Analytics & BI. The only screen that lists,
   edits, or deletes rows from the same `report_schedules` table is **Settings → Scheduled
   Reports** (`/settings/report-schedules`), which is gated to `super_admin`/`hospital_admin`
   only (`src/lib/routeRoles.ts` — no override exists for this path, so it falls through to the
   `/settings` parent rule at line 15). None of `ceo`, `cmo`, or `billing_executive` — the three
   non-admin roles that can reach Analytics & BI at all — can open Settings at all. In practice:
   an Analytics/MIS Officer can create a recurring schedule from this screen, but cannot see or
   cancel it afterwards without asking a Hospital Admin to do it from Settings. This is a real
   gap in the product, not something to work around by re-saving — flag a wrong or unwanted
   schedule to your Hospital Admin rather than hunting for a cancel button that doesn't exist on
   this screen.

---

## 2. Sibling standalone pages — orientation only, not a walkthrough

Three further analytics pages exist as their own routes, reached from outside the tab strip
above — the **Forecasts** button in the header takes you to the first of them. They are
deliberately **not** walked through step-by-step in this file, because, as confirmed against
`src/lib/routeRoles.ts`, none of their role lists include `ceo`, `cmo`, or `billing_executive` —
the three roles (besides the `super_admin`/`hospital_admin` bypass) that can open the main
**Analytics & BI** screen this file covers:

| Page | Route | Allowed roles (`routeRoles.ts`) | Reachable by this file's roles? |
|---|---|---|---|
| Predictive Analytics ("Forecasts") | `/analytics/forecasts` | `super_admin, hospital_admin, cfo, doctor` | No |
| Population Health | `/analytics/population-health` | `super_admin, hospital_admin, doctor, quality_officer, quality_manager` | No |
| Revenue Intelligence | `/analytics/revenue-intelligence` | `super_admin, hospital_admin, cfo` | No |

Clicking the **Forecasts** button on the main Analytics screen as a `ceo`, `cmo`, or
`billing_executive` login does navigate you to `/analytics/forecasts` in the browser, but
`RoleGuard` checks your role against the real path you've landed on
(`hasAccess(location.pathname, ...)` in `src/lib/routeRoles.ts`, which does an exact lookup
against these three overrides) — not against the main Analytics role list — so you are bounced
back to `/dashboard` with an "Access denied" toast. Only a `cfo` or `doctor` login (plus the
admin bypass roles) can actually use Forecasts; only `cfo` can use Revenue Intelligence; only
`doctor`/`quality_officer`/`quality_manager` can use Population Health. If your hospital needs an
Analytics/MIS Officer to also see one of these three, that needs a custom role created against
the specific role string already in that page's list (see Access control below for how custom
roles work) — it cannot be solved by adding `ceo`/`cmo`/`billing_executive` to the main
`/analytics` module's role list, because that list is never consulted for these three routes.

---

## 3. Companion module — Govt HMIS Reporting (orientation only)

**Govt HMIS Reporting** (`src/pages/hmis/HMISPage.tsx`, route `/hmis`) is a separate module from
Analytics & BI, not a tab inside it. It generates the statutory monthly/weekly reports Indian
hospitals must file — HMIS portal submissions, IDSP weekly syndromic-surveillance reports (with a
built-in keyword matcher for syndromes like Acute Diarrhoeal Disease, Dengue-like Illness,
Malaria-like Illness, SARI), RMNCH+A reporting, and PCPNDT Form F tracking — none of which this
file covers in detail.

In real hospitals, "Analytics/MIS Officer" plausibly covers both BI dashboard work *and*
statutory HMIS reporting — but the app models them as two different logins with **zero shared
custom-role string**. `/hmis`'s role list is `["hmis_officer", "super_admin", "hospital_admin"]`
(`src/lib/modules.ts`, line 97, no override in `routeRoles.ts`) — completely disjoint from
`/analytics`'s `["ceo", "cmo", "super_admin", "billing_executive"]` apart from the two admin
bypass roles. A `ceo`/`cmo`/`billing_executive` login that handles Analytics & BI cannot open
`/hmis` at all, and an `hmis_officer` login cannot open `/analytics` at all. If one person does
both jobs, they need two separately-created logins/custom roles, the same shape as the
Marketing/Health-Packages and Accountant/Insurance-TPA cross-module findings from earlier phases
of this manual — not something this file's scope (Analytics & BI specifically) resolves.

---

## 4. Access control — the centrepiece finding, confirmed against source

**The route itself:** `src/lib/modules.ts`, line 123 — `"Analytics & BI"`, route `/analytics`,
`roles: ["ceo", "cmo", "super_admin", "billing_executive"]`. No override exists in
`src/lib/routeRoles.ts`, so this exact array is what `hasAccess()` checks against the real
`/analytics` path.

**None of `ceo`, `cmo`, or `billing_executive` is a default role card.** Opening **Settings →
Staff Members → Add Staff Member**, the out-of-box role cards
(`DEFAULT_ROLE_CARDS` in `src/pages/settings/SettingsStaffPage.tsx`, lines 85–92) are only:

```
doctor, nurse, accountant (labelled "Billing"), pharmacist, lab_tech, receptionist, hospital_admin
```

To get a login with role `ceo`, `cmo`, or `billing_executive`, a Hospital Admin must first create
a **custom role** on **Settings → Roles & Permissions**, typing a free-text label that
`slugifyRoleName` (`src/pages/settings/SettingsRolesPage.tsx`, line 46:
`label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")`) turns into the
exact snake_case string the route guard expects — typing "CEO" produces `ceo`, "CMO" produces
`cmo`, "Billing Executive" produces `billing_executive`. This part of the story is the same
one-time admin-configuration step every specialty role since Phase 5 of this manual has needed.

**Here is the part that is genuinely different from every prior phase, and the one worth
repeating to a Hospital Admin out loud: the "Billing" trap.** The default role card literally
labelled **"Billing"** on the Add Staff Member screen does not create a `billing_executive`. Read
directly from the array:

```
{ role: "accountant", icon: Receipt, label: "Billing" }   // SettingsStaffPage.tsx, line 88
```

Every staff member created via that default "Billing" card gets role **`accountant`** —
and `accountant` is **not** in `/analytics`'s role list at all. So a hospital's existing Billing
Clerk, created the normal way on day one, **cannot** open Analytics & BI — not because of a
missing custom-role step, but because the role string their account already carries is the wrong
one for this specific module, even though the card is literally labelled "Billing" and the
module's role list literally contains the string `billing_executive`. A Hospital Admin who reads
"Billing" on one screen and "billing_executive" in a role list and assumes they already match
will be wrong. The only way to get a `billing_executive` login is the same custom-role path as
CEO/CMO above — typing "Billing Executive" (or any label that slugifies to exactly
`billing_executive`) on Roles & Permissions, as a deliberate second, separate role from the
existing "Billing" (`accountant`) staff.

**This is a different shape from Phases 5–7's custom-role findings.** In every one of those, the
specialty job title (Dietitian, Biomedical Technician, Dialysis Technician, and so on) had no
existing default card at all, so there was no risk of a Hospital Admin mistaking an existing
account for one that already worked. Here, there *is* an existing, commonly-created "Billing"
account — and it quietly does not work for this module, which is a sharper trap than "you need to
set this up," because it looks already set up.

**Net effect:** there is no flat access gap and no missing route-guard entry — the mechanism
works exactly as designed — but every one of `ceo`, `cmo`, and `billing_executive` requires a
deliberate custom-role creation step before a login matching that string can exist, and the
"Billing" default card will not get you there even though its label suggests it might.

---

## Content findings from writing this file

Per this manual's standing practice of grounding every claim in real component source rather than
assuming, the following were specifically checked:

- **`report_schedules` insert from this module omits `created_by`.** Both
  `ScheduleReportModal.tsx` (used from this screen) and `SettingsReportSchedulesPage.tsx` insert
  into `report_schedules` without setting `created_by`, even though the column exists and
  `useHospitalId()` exposes the logged-in `userId` that could populate it. The column is
  nullable, so nothing fails — this is a real but minor completeness gap (no "who scheduled
  this" audit trail), not a crash or data-loss bug, so it is noted here rather than patched; a
  narrow fix would touch a shared modal also used by the admin-only Settings page, which is
  outside this file's documentation-only scope to re-plumb without a data-pod review of both call
  sites.
- **The AI Digest and AI Performance tabs do not touch a clinical decision path.** Both surface
  already-computed operational counts (OPD volume, revenue, bed occupancy, AI acceptance rates)
  rather than diagnosing, dosing, or triaging — so, unlike the AI features documented in earlier
  phases (meal plans, embryology summaries), nothing in this module required a Dr. Nalini
  clinical-AI sign-off check; this was verified by reading what each AI call actually computes,
  not assumed from the tab's name.
- **No `_by`-column misattribution bug found in this module**, unlike the pattern Phase 6/7 fixed
  in Mortuary and Biomedical — every `created_by`/`reported_by`-style column this module touches
  (ESG metrics, PROM survey sends) was traced and found either correctly attributed or, in the
  `report_schedules` case above, simply left null rather than wrongly set to someone else's ID.

No fix was made to application code for this file. The `report_schedules` attribution gap and the
Schedule Reports navigability gap (Section 1.6) are both flagged as product follow-ups, not
patched, consistent with this manual's practice of only fixing a defect when it is narrow, safe,
and self-contained to verify — neither of these two is.

---

## Quick reference — screen names as they actually appear

| What this file calls it | What you'll actually see on screen |
|---|---|
| The eleven tabs | **📊 Revenue · 🏥 Clinical · 👨‍⚕️ Doctors · 🏢 Departments · ✅ Quality · 📋 PROM/PREM · 🌱 ESG · 🤖 AI Digest · 📈 AI Performance · 🏆 National Benchmarks · 📋 Custom Report** |
| Export | Header **Export** button or footer **Export** link — same modal, titled **Export Report** |
| Schedule a recurring report | Footer **Schedule Reports** link — modal titled **Schedule Report** |
| Build a custom report | **📋 Custom Report** tab — left panel titled **Build Custom Report** |
| The "Billing" default staff card | Creates role `accountant` — does **not** grant Analytics & BI access (Section 4) |
| Forecasts / Population Health / Revenue Intelligence | Separate pages, separate role lists, not reachable by this file's roles (Section 2) |
| Govt HMIS Reporting | Separate module entirely, route `/hmis`, no shared role with Analytics & BI (Section 3) |
