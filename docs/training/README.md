# Staff Training Manual

This is the version-controlled, step-by-step staff training manual for Aumrti HMS. It did not
exist before this phase. It is **documentation-only** — plain-English, task-based walkthroughs
that a new hospital employee reads (or is walked through) before touching the live system.

This is **not**:
- The LMS video/course module (courses, quizzes, certification, CME tracking — that is a
  separate, already-existing in-product feature, owned by Usha).
- `SettingsTrainingPage` in the app (an in-product settings screen, not instructional content).

This manual is the source of truth for "how do I actually do my job in this software," written
once and kept current in this repo, reviewed the same way code is.

## Phase 1 scope

Nikhil (PM) scoped Phase 1 to the 6 highest-traffic, highest-risk roles — the roles every hospital
go-live depends on from day one. Each role has its own file:

| Role | File | Covers |
|---|---|---|
| Front Desk / Registration | [front-desk.md](./front-desk.md) | Patient registration, appointment booking, OPD queue |
| Doctor (OPD) | [doctor-opd.md](./doctor-opd.md) | The consultation workflow (Complaint, AI Guidance, Rx & Orders, Reports, History tabs) |
| Nurse | [nurse.md](./nurse.md) | Vitals entry, IPD nursing station, drug administration |
| Lab Technician | [lab-technician.md](./lab-technician.md) | The ~10 LabPage.tsx tabs (Worklist, Collection, Pending from OPD, Pay Later, QC Dashboard, Calibration/NABL, Histopathology, TAT, External Referrals, Analyzer Interface) |
| Pharmacist | [pharmacist.md](./pharmacist.md) | OP/IP dispensing flow |
| Billing Clerk | [billing-clerk.md](./billing-clerk.md) | BillingPage.tsx tabs (Bills, Collections, Pending Payments, Revenue Leakage, Approvals, Refunds) |

## Phase 2 — shipped

Four more role files, written by clinical-pod and grounded in actual component source the same
way Phase 1 was:

| Role | File | Covers |
|---|---|---|
| Radiology Technician | [radiology-technician.md](./radiology-technician.md) | Receiving orders on the Worklist, performing/recording a study, DICOM image upload and PACS linking, report/sign-off that marks a study complete |
| OT / Surgical Staff | [ot-surgical-staff.md](./ot-surgical-staff.md) | OT booking/scheduling, WHO Surgical Safety Checklist (pre-op/intra-op) plus PAC gate, intra-op documentation, implant/instrument counts and End Case, PACU/Aldrete recovery |
| Blood Bank Technician | [blood-bank-technician.md](./blood-bank-technician.md) | Donor/unit registration with TTI screening, cross-match request/result, issuing a unit via the Requests tab, inventory and issue log with adverse-event reporting |
| IPD Ward Clerk / Admission Desk | [ipd-ward-clerk.md](./ipd-ward-clerk.md) | Admission (4-step wizard), bed reservation/transfer, the clerk's slice of discharge (initiating the workflow and paperwork hand-off) — explicitly excludes clinical clearance/discharge-summary content owned by nurse.md/doctor-opd.md |

**Access-control gap found while writing these, not a documentation gap.** Grounding this content
in the real route guards (`src/lib/routeRoles.ts`) surfaced a mismatch between the job titles
above and the roles the app actually lets log in:

- The `/radiology` route only permits `radiologist`, `doctor`, `super_admin`, `hospital_admin` —
  there is no distinct radiology-technician login role. The walkthrough is accurate to the screens;
  there is currently no login that matches the job title in its own filename.
- The `/ipd` route only permits `doctor`, `nurse`, `super_admin` — there is currently no
  clerical/ward-clerk role that can open the IPD module at all. The IPD Ward Clerk file documents
  real screens that a dedicated clerk login cannot currently reach.
- OT has the same pattern — `doctor`, `nurse`, `super_admin` only, no distinct OT-staff role — but
  it is lower severity, since nurse/doctor logins plausibly already cover who touches OT screens in
  practice.

The training content is accurate to what exists on screen. The gap is that the role/access model
hasn't caught up to these job titles yet — that is a product follow-up for Nikhil/Vikram to
sequence, not something this documentation effort fixes.

Two further gaps are content-only, not access-related, and are noted in
[ot-surgical-staff.md](./ot-surgical-staff.md) itself: OT has no structured intra-op operative-note
template (only a generic Notes field plus the anaesthesia sheet), and no dedicated OT Register
screen (only schedule views) — the file documents what exists rather than a fuller register
workflow that doesn't exist yet.

## Phase 3 — shipped

One more role file, written by growth-pod and grounded in actual component source the same way
Phase 1 and 2 were:

| Role | File | Covers |
|---|---|---|
| Hospital Admin / Manager | [admin-hospital-manager.md](./admin-hospital-manager.md) | The Settings Hub, scoped to day-to-day admin work: staff accounts, logins and MFA, per-user access overrides, clinical-privilege credentialing, custom roles and the permission matrix, module entitlements (Plan & Billing), Hospital Profile, Branding, and GST/NIC IRP configuration — plus an orientation map (not a walkthrough) of the ~40 remaining Settings pages |

**No access-control gap found for this one, unlike Phase 2's three roles.** The `/settings` route
(`src/lib/routeRoles.ts`, line 15) is gated to exactly `super_admin` and `hospital_admin` — both
titles the file is written for can actually log in and reach every screen it documents. This is
stated here for the same consistency Phase 2 held itself to: check the access model every time,
report a gap when there is one, and say plainly when there isn't.

**One correction surfaced while grounding Section 4 (GST / billing) against the real component
source**, documented inline in the file itself: the GST/NIC IRP settings page has no HSN field, no
GST-rate/slab configuration, and no invoice-numbering control — but a per-item GST rate *is*
configurable elsewhere in Settings (Service Rates, and Drug Formulary for a drug's default rate).
The file states this precisely rather than the broader "no GST rate configuration anywhere in
Settings" claim it was initially scoped from, which a grep of the component source did not
support.

## Phase 4 — shipped

Four more role files, written by revenue-pod, clinical-pod, and quality-pod in parallel and
grounded in actual component source the same way Phases 1–3 were:

| Role | File | Covers |
|---|---|---|
| Accountant / Insurance-TPA Executive | [accountant-insurance-tpa.md](./accountant-insurance-tpa.md) | Accounts (Dashboard/Ledger/Expenses/Journal/Bank/Reports tabs plus the six standalone `/accounts/*` pages — Opening Balances, Chart of Accounts, Journal Workbench, Cost Centres, Financial Statements, Budget Management, Fixed Assets) and Insurance & TPA (Pre-Auth Queue → Claims to Submit → Claims Status/TPA Ageing → Reconciliation, plus an orientation of the remaining Insurance screens) |
| HR / Payroll Staff | [hr-payroll-staff.md](./hr-payroll-staff.md) | Attendance, Leave Management, the live Payroll (PF/ESI/TDS) engine, and Payroll (History)/payslip + statutory exports on `HRPage.tsx` — explicitly excludes the page's 16 credentialing/training/talent-lifecycle tabs as HR-manager-level work, and `MyHRPage.tsx` (employee self-service), both scoped out inline |
| Inventory / Store / Procurement Staff | [inventory-procurement-staff.md](./inventory-procurement-staff.md) | Receiving stock (GRN/Receipts, including the AI invoice scanner), issuing/consuming stock (Indents and Ward Store tabs), raising purchase orders (RFQ→Award-to-PO and direct-PO paths, documented as independent, not sequential), reorder alerts (Stock Overview's Low Stock signal vs. the standalone Procurement Recommendations page), plus an orientation of the remaining tabs (Consolidated, Stock Count, Vendors, MIS Dashboard, Anomalies, Reports) |
| Quality / NABH Officer | [quality-nabh-officer.md](./quality-nabh-officer.md) | Safety-event logging with structured RCA (5 Whys/Fishbone/FMEA) and CAPA tracking, running a clinical audit (compliance-sampling → % score → QI-project conversion), and committee/meeting/action-item tracking — including a resolved account of which of two look-alike screen families (Incident Reports vs. Safety Events; Audit Calendar vs. Clinical Audit) is the real workflow |

**Four access-control/content gaps found while writing these, on top of Phase 2's pattern.**

- **Job title vs login role, same pattern as Phase 2.** `/hr` (`src/lib/routeRoles.ts`, line 17)
  permits only `hr_manager`, `super_admin`, `hospital_admin` — there is no distinct `payroll_clerk`
  or `hr_staff` login. The HR/Payroll Staff file is accurate to the screens; anyone doing that job
  today logs in as `hr_manager`.
- **No single role covers "Accountant / Insurance-TPA Executive" as one job title.** `/accounts`
  (line 16) and `/insurance` (line 20) have different, only partially overlapping role lists, and
  three Accounts sub-pages (Financial Statements, Budget, Fixed Assets — lines 59–61) are further
  restricted to `cfo`/`accountant` only. `billing_executive` is the only role reaching both
  `/accounts` and `/insurance`, but it's excluded from those three sub-pages; `accountant` reaches
  every Accounts screen but none of Insurance; `insurance_executive` reaches Insurance but no
  Accounts screen at all, not even the un-gated ones. The file states the exact combination needed
  to cover this job title today — there isn't a single one.
- **Inventory has the same "no clerk-level role" pattern.** `inventory_manager` and `super_admin`
  are the only logins that can reach `/inventory` or `/inventory/procurement-recommendations`
  (`src/lib/modules.ts`, line 70) — there is no separate "store clerk" role, matching the shape of
  every gap above.
- **Quality has a navigability gap rather than a login gap.** `quality_officer` is explicitly
  permitted on 4 of 5 standalone `/quality/*` and `/nabh/*` pages (`routeRoles.ts`, lines 23–43),
  but `QualityPage.tsx` itself — the only in-product screen with buttons linking to those pages —
  is gated to `["quality_manager", "super_admin"]` with no bypass for `quality_officer`
  (`src/lib/modules.ts`, line 71), and none of the four has its own `ALL_MODULES` tile. A
  `quality_officer` login is *permitted* to open those four pages but has no in-app way to navigate
  to them (one exception: `/quality/events`, reachable via a dashboard banner that only renders when
  a CAPA is overdue). `hospital_admin` is unaffected — the app's `BYPASS_ROLES` mechanism grants it
  access regardless of route-level role lists.
- **Four content-only gaps, not access-related**, documented inline in their files: in
  [accountant-insurance-tpa.md](./accountant-insurance-tpa.md), the standalone Chart of Accounts
  page's "Add New" button is a no-op (`console.log` only, no form) and the standalone Cost Centres
  page saves its budget figures to browser `localStorage` rather than a database table; in
  [inventory-procurement-staff.md](./inventory-procurement-staff.md), three buttons on the MIS
  Dashboard tab (Mark Return, Write-off, Redistribute) have no click handler, the Vendor Performance
  report tab is a static placeholder, and the only in-app link to Procurement Recommendations is a
  shortcut on an unrelated HOD dashboard page rather than anywhere inside Inventory itself.

## Phase 5 — shipped

Four more role files, written by clinical-pod and grounded in actual component source the same
way Phases 1–4 were:

| Role | File | Covers |
|---|---|---|
| Dialysis Unit (Dialysis Technician / Nephrologist) | [dialysis-unit-staff.md](./dialysis-unit-staff.md) | Machine Board (session start/end with serology-compatibility and dialyzer-reuse hard blocks, Kt/V calc, auto-billing), Schedule, Patients, Sessions log, Reports |
| Oncology / Chemotherapy Daycare (Chemo Nurse / Oncologist) | [oncology-daycare-staff.md](./oncology-daycare-staff.md) | Daycare Board (chair grid, 5-step chemo verification checklist with auto-hold on unsafe labs, infusion billing), Orders, Patients (BSA/ECOG registration), Protocols, Reports |
| IVF & ART (Embryologist / IVF Doctor) | [ivf-art-staff.md](./ivf-art-staff.md) | Couples, Cycles, Stimulation, Embryology, Embryo Bank (ICMR export, consent-expiry), Andrology, ICMR Compliance (ART Act 2021 reporting) |
| Physiotherapy & Rehabilitation (Physiotherapist / Doctor) | [physiotherapy-staff.md](./physiotherapy-staff.md) | Referrals, Sessions (booking/completing with pain VAS, ROM, MMT, auto-billing), Outcomes (FIM/Barthel/VAS/KOOS/DASH/Berg/MRC), Equipment booking, HEP (home exercise plans with WhatsApp send) |

**Access-control finding — a third pattern, distinct from both Phase 2/4's hard gaps and Phase 3's
clean bill.** Phase 2 and Phase 4 found job titles with no matching login role at all (radiology
technician, ward clerk, OT staff, payroll clerk, store clerk). Phase 3 found no gap and said so
plainly. Phase 5 is neither: the route guards for all four modules *do* list a role string matching
the job title — `dialysis_technician` (`src/lib/modules.ts`, line 75), `chemo_nurse` (line 76),
`physiotherapist` (line 77), `embryologist` (line 84) — each flowing straight into `ROUTE_ROLES`
with no override in `src/lib/routeRoles.ts`. But none of these four is a default "role card" when
adding a staff member: the out-of-box role cards on **Settings → Staff Members → Add Staff Member**
are only Doctor, Nurse, Billing, Pharmacist, Lab Tech, Reception, and Admin/CEO
(`docs/training/admin-hospital-manager.md`, Section 1.1, lines 36–39). To get one of these four
specialty roles, the Hospital Admin must first create a **custom role** on
**Settings → Roles & Permissions** by typing a free-text label — role creation slugifies that label
into the exact snake_case key the route guard expects (`src/pages/settings/SettingsRolesPage.tsx`,
lines 44–46, 326–330): typing "Dialysis Technician" produces `dialysis_technician`, "Chemo Nurse"
produces `chemo_nurse`, and so on. This works correctly today — it is a one-time admin-configuration
step, not a product gap. Physiotherapy is the partial exception: because `doctor` is also on its
role list (`roles: ["physiotherapist", "doctor", "super_admin"]`), any existing Doctor login can
already open `/physio` with zero setup; only a login specifically titled "Physiotherapist" needs the
custom-role step. In short: no flat access gap this phase, but a real one-time admin-configuration
step is required for Dialysis Technician, Chemo Nurse, and Embryologist (and for Physiotherapist
specifically, not for Doctor) before a matching login can exist.

**Five content-only gaps, not access-related**, documented inline in their files:

- **IVF & ART**: `src/components/ivf/ICMRComplianceTab.tsx` (line 49) queries a table named
  `ivf_couples`, which does not exist in the schema — the real table, used correctly everywhere
  else in the module (`CouplesTab.tsx`, `CyclesTab.tsx`, `EmbryoBankTab.tsx`), is `art_couples`.
  Because the query's error is discarded, the ICMR Compliance tab — the one screen whose job is to
  show ICMR regulatory status — cannot show real couple data.
- **IVF & ART**: the Embryology tab opens pre-loaded with three hardcoded placeholder embryo rows,
  and "Save Records" has no click handler — nothing in this tab persists, which conflicts with
  ICMR's embryo-record retention requirement.
- **Dialysis Unit**: `src/components/dialysis/MachineBoardTab.tsx` (line 228) checks admission
  `status = "admitted"` to route a session charge onto an existing IPD bill, but the dominant
  convention elsewhere in the codebase (including `IPDPage.tsx` line 83 and `PhysioPage.tsx` line
  226) is `status = "active"`. This spelling isn't unique to dialysis — `RevenueForecastCard.tsx`
  and `CEOBoardPage.tsx` also use "admitted" — so this is a real status-value inconsistency
  affecting dialysis billing for admitted patients, not a dialysis-only one-off bug.
- **Oncology**: the toxicity-grading form tells the user a Grade 3+ event "will generate a clinical
  alert," but `OncologyReportsTab.tsx`'s submit handler only inserts into the toxicity log — it
  never writes to `clinical_alerts` or raises anything.
- **Physiotherapy**: for an OPD (non-admitted) patient, booking a session and completing it each
  independently create a bill without checking for an existing one tied to the same session — only
  the admitted-patient path correctly de-duplicates via `source_dedupe_key`. Flagged as a possible
  double-billing risk for revenue-pod to assess, not a confirmed defect, since `src/lib/chargePosting.ts`'s
  dedupe behaviour on the OPD path has not been independently traced.

## Phase 6 — shipped

Four more role files, written by clinical-pod and grounded in actual component source the same way
Phases 1–5 were:

| Role | File | Covers |
|---|---|---|
| Mortuary & Medico-Legal Staff | [mortuary-medicolegal-staff.md](./mortuary-medicolegal-staff.md) | Register (body admission, 72-hour UNCLAIMED colour-coding), MCCD Form 4 issuance (with AI-assisted drafting that must be reviewed, never trusted as fact), MLC registration and police intimation tracking, Release (with a DB-trigger-enforced MLC police-clearance hard block, not just a client-side check), Organ Donation under the NOTTO protocol |
| Dental Staff | [dental-staff.md](./dental-staff.md) | The module's own token/queue screen (confirmed structurally distinct from OPD's workspace, though patient registration itself still routes through the standard OPD walk-in flow, department-filtered to Dental), Tooth Chart (FDI charting), Perio (full-mouth probing with an auto-computed diagnosis), Treatment Plan (procedure planning with per-item billing on completion), Lab Orders (prosthetic/appliance work tracking) |
| AYUSH Staff | [ayush-staff.md](./ayush-staff.md) | The five-system selector (Ayurveda/Homeopathy/Unani/Siddha/Yoga) resolving to department-filtered queues, Consultation (system-specific forms — Ashtavidha Pariksha for Ayurveda, Homeopathic Case Taking for Homeopathy), Prakriti (30-question constitutional assessment with AI-assisted summary), Panchakarma (therapy scheduling and billed completion), Prescriptions (read-only history) — confirmed to have no doctor-opd.md equivalent for Prakriti or Panchakarma |
| CSSD Technician | [cssd-technician.md](./cssd-technician.md) | Sterilize (cycle parameters by method, a DB/UI dual-enforced Flash sterilization hard block with mandatory justification and IC alerting, biological-indicator pass/fail handling with auto-quarantine on failure), Sets & Instruments (inventory management), Issue/Return (dispatch to OT with loss reporting), Logs (cycle history and a flash-sterilization NABH compliance report) |

**Access-control finding — the same one-time admin-configuration pattern Phase 5 found for
Dialysis/Oncology/IVF, now confirmed for all four of this phase's roles too, including one explicit
correction of an initial premise.** The route guards for all four modules list a role string
matching the job title with no override in `src/lib/routeRoles.ts` — `mortuary_officer` /
`medical_officer` (`src/lib/modules.ts`, line 78), `dentist` (line 82), `ayush_doctor` (line 83), and
`cssd_technician` (line 54) — each flowing straight into `ROUTE_ROLES`. But none of the five distinct
role strings across these four modules is a default role card on **Settings → Staff Members → Add
Staff Member** (`src/pages/settings/SettingsStaffPage.tsx`, `DEFAULT_ROLE_CARDS`, lines 85–92: only
Doctor, Nurse, Billing, Pharmacist, Lab Tech, Reception, Admin/CEO), and none is seeded by any
migration as a pre-built system role — confirmed by grepping the migrations directory directly, not
assumed. Every one of them requires the Hospital Admin to first create a **custom role** on
**Settings → Roles & Permissions**: typing a free-text label slugifies it into the exact snake_case
key the route guard expects (`src/pages/settings/SettingsRolesPage.tsx`, `slugifyRoleName`, lines
44–46, used at role-creation time around lines 320–330). This works correctly today — it is a
one-time admin-configuration step, not a product gap. **None of the four modules lists `doctor` as a
fallback role** — unlike Physiotherapy in Phase 5, there is no existing login type that can open any
of these four screens with zero setup; the custom-role step is mandatory in every case, with no
exception. **This explicitly corrects an initial framing that CSSD was "gap-free":** CSSD's route
guard genuinely has no *mismatch* — the role string the job title needs really is the one already in
the route guard, which is a cleaner starting position than Mortuary/Dental/AYUSH's two freshly-named
roles each — but "no mismatch" is not the same as "a CSSD Technician can log in out of the box." CSSD
shares the identical one-time admin-configuration requirement as the other three.

**Four content-only gaps, not access-related**, documented inline in their files:

- **Mortuary & Medico-Legal — fixed.** The auto-generated body-release bill's `released_by` column
  was written as `doctors[0]?.id` — the first row of an unfiltered, page-load-time users query, not
  the logged-in staff member confirming the release — the same class of `_by`-column misattribution
  bug found and fixed in CSSD's own `SterilizeTab.tsx`/`IssueReturnTab.tsx` in an earlier pass. Now
  reads `userId` from `useHospitalId()`, same as every other `_by` column in the app. The same bill
  previously carried no `admission_id` (the `autoChargeService` call passed neither `admissionId`
  nor `performedBy`) — now passes both, so a dialysis-style "which existing bill does this append
  to" lookup works for mortuary charges on a patient who was admitted before death, instead of
  always spawning a standalone bill. The Organ Donation tab's **Outcome** column previously had no
  form field anywhere that wrote to it — it now has an inline click-to-edit field directly on each
  row (`handleSaveOutcome`), since the real value is only known after the fact, not at the time the
  donation record is first created. Verified: `npm run lint`, `npx tsc --noEmit`, and
  `npm run check:db-contract` all pass with no new findings.
- **Mortuary & Medico-Legal**: neither the 24-hour MCCD deadline nor the 6-hour MLC police-intimation
  deadline has an on-screen countdown or system-fired alert — both are tracked only by a KPI tile or
  a manually-clicked "Mark Intimated" button, with no automatic escalation if either window closes
  unattended.
- **CSSD Technician**: the Sterilize tab's "Autoclave Anomaly Detector" panel is a demo stub by its
  own code comment — "Simulate Cycle" generates synthetic sensor data with one artificial anomaly
  injected, and "Configure MQTT" opens a form of disabled inputs with an explicit note that real
  monitoring is "pending IoT hardware procurement and MQTT broker deployment." There is no live
  autoclave telemetry in this module today.
- **Dental Staff**: confirmed as a genuine, non-overlapping chairside workflow rather than a content
  gap — flagged here only because Nikhil's brief specifically asked whether Dental is a thin OPD
  wrapper; it is not, except for where new patients actually enter the day's queue (the standard OPD
  walk-in screen, department-filtered to Dental — there is no separate Dental registration screen).

## Phase 7 — shipped

Four more role files, written by clinical-pod and grounded in actual component source the same way
Phases 1–6 were:

| Role | File | Covers |
|---|---|---|
| Dietitian / Nutrition Staff | [dietitian-nutrition-staff.md](./dietitian-nutrition-staff.md) | Screening (NRS-2002 risk scoring, BMI, NABH NFS.1 evidence logging), Diet Orders (allergy banner), Meal Tracking (per-meal % consumed), AI Meal Plans (7-day plan, explicitly flagged draft-only, not authoritative), Reports |
| Biomedical Technician | [biomedical-technician.md](./biomedical-technician.md) | Equipment registry, PM Maintenance, Calibration, Breakdowns, Alerts, AI Predictive, Reports |
| Housekeeping & Facility Staff | [housekeeping-facility-staff.md](./housekeeping-facility-staff.md) | Tasks (bed-turnover lifecycle), BMW Log (NABH HIC.8), Linen, Schedules, Reports |
| Ambulance / Transport Staff | [ambulance-transport-staff.md](./ambulance-transport-staff.md) | Dispatch Board, Equipment Check (NABH COP.3), Transit Log, Fleet |

**Access-control finding — three distinct patterns this phase, not one repeated finding.**

- **Dietitian and Biomedical Technician both need the Phase 5/6-style one-time custom-role step,
  but only one of the two has a safety net.** Neither `dietitian` nor `biomedical_technician` is a
  default role card on **Settings → Staff Members → Add Staff Member**
  (`src/pages/settings/SettingsStaffPage.tsx`, `DEFAULT_ROLE_CARDS`, lines 85–92: only Doctor,
  Nurse, Billing, Pharmacist, Lab Tech, Reception, Admin/CEO). Both route guards already carry the
  exact role string the job title needs with no override in `src/lib/routeRoles.ts` — `dietitian`
  (`src/lib/modules.ts`, line 98) and `biomedical_technician` (line 95) — so, as with every
  specialty role since Phase 5, the Hospital Admin must first create a **custom role** on
  **Settings → Roles & Permissions**: typing a free-text label slugifies it into the exact
  snake_case key the route guard expects (`src/pages/settings/SettingsRolesPage.tsx`,
  `slugifyRoleName`, lines 44–46, used at role-creation time around lines 326 and 370). This works
  correctly today — it is a one-time admin-configuration step, not a product gap. **Dietitian has a
  Doctor fallback with zero setup**, the same split Phase 5 found for Physiotherapy — `/dietetics`
  lists `["dietitian", "doctor", "super_admin"]`, so an existing Doctor login can already open the
  module. **Biomedical Technician has no fallback at all** — `/biomedical` lists
  `["biomedical_technician", "super_admin", "hospital_admin"]` with no `doctor` on it, so every
  Biomedical Technician login needs the custom-role step, no exception.
- **Housekeeping is this phase's distinctive finding, different in kind from the other three.**
  `housekeeping_supervisor` is the *only* housekeeping role string anywhere in the codebase —
  confirmed by clinical-pod via grep across `src/` and `supabase/migrations/`, and independently
  re-confirmed here: the only other "housekeeping"-prefixed strings in the migrations directory are
  `housekeeping_task_types` and `housekeeping_area_types` config-dropdown values
  (`supabase/migrations/20260531150001_hospital_config_values.sql`,
  `supabase/migrations/20261103000001_config_value_defaults.sql`), not a role. There isn't even a
  lower-tier attendant role to custom-create — `/housekeeping` lists
  `["housekeeping_supervisor", "super_admin", "hospital_admin"]` (`src/lib/modules.ts`, line 96) and
  nothing else. Every housekeeping login is supervisor-level by definition. This is not a
  one-time-setup gap like Dietitian/Biomedical Technician — it is an absence of a tier.
- **Ambulance / Transport Staff is the most severe finding of the phase.** `/ambulance`'s role list
  — `["nurse", "doctor", "receptionist", "super_admin"]` (`src/lib/modules.ts`, line 80, no override
  in `routeRoles.ts`) — contains no ambulance/driver/EMT role string at all, and a grep for
  `ambulance_driver`, `ambulance_staff`, and `emt` across `src/` and `supabase/migrations/` returns
  nothing. Unlike every prior phase's gaps, the custom-role mechanism cannot fix this one: there is
  no matching string in the route guard's hardcoded array for a freshly slugified "Ambulance
  Driver" or "EMT" role to land on, because `slugifyRoleName` only produces a string that *already*
  appears in `ROUTE_ROLES` — it cannot widen the array itself. This needs the route's allowed-roles
  list widened at the source (`src/lib/modules.ts` line 80) — a product change for Nikhil/Vikram to
  sequence, not a hospital-admin configuration workaround like Phase 5/6's roles.

**Three content-only gaps found this phase — all three now fixed**, following up on the same
pattern Phase 6 set with the mortuary `_by`-column bug:

- **Dietetics — fixed.** The high-nutritional-risk alert insert in
  `src/pages/dietetics/DietPage.tsx` wrote to a column named `message`, but the real NOT NULL
  column on `clinical_alerts` is `alert_message`
  (`supabase/migrations/20261013000017_clinical_alerts_attribution.sql`) — the insert's error was
  discarded, so the alert silently never saved even though the screening itself did. Now writes to
  `alert_message`, attributes `created_by` to the screening dietitian, and surfaces a toast instead
  of silently discarding the error if the alert insert itself ever fails.
- **Biomedical — fixed.** `ReportBreakdownModal.tsx`'s `reported_by` was set from an unfiltered,
  first-row `users` query scoped only to `hospital_id` — not the logged-in user. Same
  `_by`-misattribution class Phase 6 fixed in Mortuary. Now reads `userId` from `useHospitalId()`
  directly (that hook already exposes it; the extra query and its `DUMMY_USER` fallback constant
  were both unnecessary and removed), and blocks submission with a toast if the session isn't ready
  rather than falling back to a dummy UUID.
- **Ambulance — confirmed and fixed, not just a hedge.** Tracing `DispatchTab.tsx`'s intake flow
  (`createDispatch`) confirmed the suspicion was right: the create-dispatch form never collected a
  patient at all — no field, no picker — so `patient_id` was always null and the completion
  handler's auto-bill check could never fire for any ambulance trip. Added an optional
  `PatientSearchPicker` (the same shared component Mortuary and other modules already use) to the
  dispatch form, wired to `patient_id` on insert. Left deliberately out of scope: linking a patient
  *after* dispatch (the common emergency case where the patient isn't identified until pickup) —
  that needs its own edit flow and wasn't part of this defect.

Verified for all three: `npx eslint`, `npx tsc --noEmit`, and `npm run check:db-contract` pass with
no new findings.

## Phase 8 — shipped

Four more role files — the first phase not written by a single pod: clinical-pod wrote the first
two, frontend-pod wrote the third, and data-pod wrote the fourth, each grounded in actual
component source the same way Phases 1–7 were.

| Role | File | Covers |
|---|---|---|
| Emergency Department Staff | [emergency-department-staff.md](./emergency-department-staff.md) | Triage Board (four-colour priority queue, AI-assisted triage suggestion with mandatory attestation before it applies), registering a new patient (including Brought Dead and MLC flagging), the three-column Patient Workspace (Timeline / clinical entry / Actions), ED medication administration with allergy checking, Medico-Legal Case (MLC) documentation, and an orientation of Mass Casualty (MCI) mode |
| Health Packages & Preventive Care Coordinator | [health-packages-coordinator.md](./health-packages-coordinator.md) | Package catalogue, booking in person/by phone and via the public booking link, Today's Checkups (eight-station progress board), Progress Tracker (AI-drafted health report), Corporate accounts and bulk booking, and an orientation of Analytics |
| Marketing / Patient Engagement Executive | [marketing-patient-engagement-executive.md](./marketing-patient-engagement-executive.md) | Referrals (referring-doctor relationship management), Campaigns, Reviews (an automatic keyword-based sentiment tag plus a genuinely AI-powered analysis and response-drafting pair), Segments (re-engagement scoring and default patient segments), and an orientation of Analytics |
| Analytics / MIS Officer | [analytics-mis-officer.md](./analytics-mis-officer.md) | The Analytics & BI screen's eleven tabs (Revenue, Clinical, Doctors, Departments, Quality, PROM/PREM, ESG, AI Digest, AI Performance, National Benchmarks, Custom Report), date-range selection, Export, the AI Digest, Custom Report building, and Schedule Reports — plus an orientation of three sibling standalone pages (Forecasts, Population Health, Revenue Intelligence) and the separate Govt HMIS Reporting module |

**The Telemedicine substitution.** This phase was originally scoped for a "Telemedicine
Coordinator" role file. Checking `src/pages/telemedicine/TelemedicinePage.tsx` and its route
(`/telemedicine` in `src/lib/modules.ts`, gated to `["doctor", "super_admin"]` only) found that
Telemedicine has no distinct coordinator role or screen at all — it is a single doctor-facing
video-consult workspace (patient queue, video call window, SOAP notes, quick prescription,
auto-billing, all on one screen), and its one scheduling-adjacent control is gated the same way
as everything else on the page. This matches exactly the "thin, no coordinator-facing screen"
substitution trigger, the same question Phase 6 asked of Dental and answered the other way.
clinical-pod and Nikhil confirmed this before substituting **Health Packages** (route `/packages`,
roles `["receptionist", "doctor", "super_admin"]`) in its place — a genuinely distinct job with
five tabs and two coordinator-facing modals, not covered by `front-desk.md` (confirmed by reading
that file's actual scope — it has zero mentions of "package").

**Access-control finding — four different shapes in one phase, the widest spread any single
phase has produced.**

- **Emergency Department — a clean bill, plus a real asymmetry on its own Mass Casualty sibling.**
  `/emergency` (`src/lib/modules.ts`, line 41) carries **doctor**, **nurse**, **super_admin** with
  no override in `routeRoles.ts` — both Doctor and Nurse are default role cards, so any hospital
  with those two logins already set up can open the Emergency Department board with zero extra
  configuration, the same clean-bill shape Phase 3 found for Hospital Admin. But
  `/emergency/mci` — the Mass Casualty / Disaster Response screen — is a *different* route with
  its own override (`routeRoles.ts`, line 57): `super_admin`, `hospital_admin`, `doctor`,
  `nurse`, **and `receptionist`**. Receptionist is not on the base `/emergency` module's role list
  at all, so a Receptionist login can open Declare/Stand-Down MCI mode but cannot open the
  ordinary day-to-day ED board — a real, documented asymmetry between two screens sharing the same
  `emergency` module key.
- **Health Packages — also a clean bill.** `/packages` (line 45) carries **receptionist**,
  **doctor**, **super_admin**, also with no override — Reception and Doctor are both default role
  cards, so, like Emergency, any hospital with those two logins can open this module with zero
  extra configuration.
- **CRM & Marketing — the mandatory-custom-role pattern, no fallback, no exception.** `/crm`
  (line 100) carries **marketing**, **hospital_admin**, **super_admin**. `slugifyRoleName`
  confirms "Marketing" produces exactly `marketing` — but it is not a default role card, and
  unlike Dietitian or Physiotherapist in Phase 5/7, there is no `doctor` (or any other
  default-card role) on `/crm`'s list at all. Every Marketing Executive login needs the
  custom-role step, with no exception — the same "mandatory, no fallback" shape Phase 6 found for
  Mortuary/Dental/AYUSH. **A separate, related finding:** the job title as commonly described also
  covers "health package sales," but that work lives entirely in Health Packages' module
  (`/packages`) with a non-overlapping role list — `marketing` cannot reach `/packages` at all,
  and neither `receptionist` nor `doctor` can reach `/crm` — the same cross-module-split shape
  Phase 4 found for Accountant/Insurance-TPA.
- **Analytics & BI — a new shape, a trap rather than a missing step.** `/analytics` (line 123)
  carries **ceo**, **cmo**, **super_admin**, **billing_executive** — none of which is a default
  role card, which on its own would be the same one-time custom-role pattern as every specialty
  role since Phase 5. What's new: the default role card literally labelled **"Billing"** on
  **Settings → Staff Members → Add Staff Member** creates role `accountant`
  (`SettingsStaffPage.tsx`, `DEFAULT_ROLE_CARDS`, line 88) — and `accountant` is **not** in
  `/analytics`'s role list. A hospital's existing Billing Clerk, set up the normal way on day one,
  cannot open Analytics & BI — not because of a missing setup step, but because the card's
  visible label ("Billing") misleadingly suggests it already covers the module's
  `billing_executive` role string. `ceo`, `cmo`, and `billing_executive` each still need the
  standard custom-role step — this is a sharper trap than a missing step, because it looks already
  set up. A further, separate cross-module finding: three sibling pages (`/analytics/forecasts`,
  `/analytics/population-health`, `/analytics/revenue-intelligence`) each carry yet another role
  list, none including `ceo`/`cmo`/`billing_executive`, and `/hmis` (Govt HMIS Reporting) has zero
  role-string overlap with `/analytics` at all — the same disjoint-login shape as the CRM/Health
  Packages finding above.

**2 content-only gaps fixed, following the same confident/narrow/safe discipline Phase 6/7 set:**

- **Emergency — fixed.** `src/components/emergency/EpidemicModeBanner.tsx`'s "Since …" timestamp
  called `toLocaleString()` with no locale argument, rendering in whatever locale the browser or
  OS defaults to rather than the house `en-IN` `DD/MM/YYYY` format. Now calls
  `toLocaleString("en-IN")`.
- **CRM & Marketing — fixed.** `src/pages/crm/CRMPage.tsx`'s Reviews tab rendered a review's text
  twice — two byte-identical `<p>` elements left behind by a copy-paste. The duplicate was
  removed; the review text, AI-analyse control, and reviewer/date line now render once each, in
  the original order.

Verified for both fixes: `npx eslint`, `npx tsc --noEmit`, and `npm run check:db-contract` pass
with no new findings.

Flagged, not fixed, this phase: Emergency's late-flagged MLC cases not creating a tracked
`mlc_cases` record, and its medication panel's allergy check not wired to the shared
`src/lib/drugSafetyCheck.ts`; Health Packages' "Revenue Today" KPI hardcoded to ₹0, its Progress
Tracker's Download Report/WhatsApp buttons with no click handler, and its corporate bulk bookings
skipping billing entirely (flagged to revenue-pod, not confirmed as a defect); and Analytics'
schedule creation with no way to view/cancel it except an admin-only Settings page, plus its
`report_schedules` inserts missing `created_by`.

## Phase 9 — shipped

Four more role files — the second phase not written by a single pod, the same mixed-pod pattern
Phase 8 used: security-pod wrote the first, growth-pod the second, clinical-pod the third, and
quality-pod the fourth, each grounded in actual component source the same way Phases 1–8 were.

| Role | File | Covers |
|---|---|---|
| Medical Records (MRD) Officer | [mrd-officer.md](./mrd-officer.md) | Records Index (case summary bundles, including FHIR R4/ABDM export), ICD Coding (AI-suggested coding workflow with a role-gated MRD Lock that unblocks PMJAY claims), Requests (external record-request approval/rejection tracking), Death Certs (MCCD Form 4 generation and reprint), Retention (destruction-review queue), Form 8 (statutory Maternity Register), MLC Register (a read-only signed register with a 6-hour police-intimation countdown), Coding Audit (AI under/over-coding scan, feature-gated) |
| LMS / Training Coordinator | [lms-training-coordinator.md](./lms-training-coordinator.md) | Staff View (assigned NABH courses, quiz-taking, certificate print) and Admin View (Bulk Enrol, Add Course, Add Questions, Compliance Heatmap, Overdue Staff chase list) on the single `/lms` screen, switched by a client-side `?admin=true` toggle |
| Facility Manager | [facility-manager.md](./facility-manager.md) | Assets (facility infrastructure register), Maintenance (PM/calibration/breakdown logs), Safety Rounds, BMW Manifests (vendor-dispatch waste records), Fire Safety, Medical Gas, and Electrical Safety — the seven tabs of `/fms/dashboard` |
| Patient Relations Officer (PRO) | [patient-relations-officer.md](./patient-relations-officer.md) | Grievances (logging, SLA-timed assignment/resolution with auto-NABH-PCC.6 evidence and a WhatsApp resolution message), Feedback (read-only CSAT/NPS table), Visitor Passes (issue/track/mark-exit), Patient Rights (canvas signature capture for NABH PCC.1, language toggle, guardian/witness fields), and an orientation of Analytics |

**Four pods, four distinct findings this phase — not one repeated pattern.** Each file's author
checked the real route guard and real data flow independently; none of the four findings below
overlaps with another, and none was softened to fit a common shape.

- **Medical Records (MRD) — written by security-pod (Saroja). One of three findings fixed in a
  follow-up pass, two still open.** `/mrd`'s own **MLC Register** tab
  reads the **`mlc_cases`** table (cases opened while a patient is in Emergency or on an IPD
  admission, keyed by `ed_visit_id`/`admission_id`), while Mortuary's own MLC tab (already shipped,
  `mortuary-medicolegal-staff.md`) reads a completely separate table, **`mlc_records`** (cases
  opened against a body already admitted to mortuary storage, keyed by `mortuary_id`). There is no
  foreign key or shared identifier linking a row in one table to a row in the other, and each
  generates its own independent MLC number — so a patient flagged MLC on arrival in Emergency who
  later dies and is re-registered as an MLC case in Mortuary ends up with **two separate,
  uncross-referenced MLC records**, neither visible from the other module. Separately, the
  **Retention** tab's `retention_schedules` table has **no code anywhere in the repository that
  ever inserts a row into it** — no insert call, no trigger on another table, no scheduled edge
  function, and the table's own migration sets no default `retain_until` and carries no accompanying
  trigger. The retention/destruction KPI on this tab and on the module header will read
  empty/zero for every hospital regardless of real record volume, because nothing populates the
  table it reads from. **Fixed:** the default **"Billing"** role card on **Settings → Staff
  Members → Add Staff Member** used to create only role `accountant`, not `billing_executive` —
  `/mrd`'s own role list includes `billing_executive`, but a hospital's actual Billing Clerk login,
  created the normal way via that card, could not reach Medical Records at all. This was the
  identical card-mislabel trap Phase 8 found for Analytics & BI's "Billing" card, confirmed a
  second time on a different module — the root cause (not a per-module patch) is now fixed:
  `SettingsStaffPage.tsx`'s `DEFAULT_ROLE_CARDS` has two separate cards, **"Billing Executive"**
  and **"Accountant,"** since these are two genuinely different jobs gating different screens, not
  one job with two names. **Still open:** the MLC-table split and the empty Retention tab, both
  below.
- **LMS / Training Coordinator — written by growth-pod (Usha). Fixed.** No distinct "Training
  Coordinator" role string existed anywhere in the codebase: typing that exact label as a custom
  role on **Settings → Roles & Permissions** slugified to `training_coordinator`, which matched
  nothing in `/lms`'s route guard (`hr_manager`, `super_admin`, `hospital_admin` only). The only
  two ways in used to be an `hr_manager` login or a Hospital Admin manually granting **view**
  permission on the Staff Training / LMS tile via the granular permissions matrix — and that second
  path was also the *only* way an ordinary Doctor or Nurse could reach their own Staff View to take
  an assigned NABH course. **Fix:** `/lms` is now in `hasAccess()`'s `coreRoutes` list
  (`src/lib/routeRoles.ts`), so every authenticated login can open Staff View directly — the
  Doctor/Nurse module tile now appears automatically via the same `hasAccess()` check
  `AppSidebar.tsx` already uses, no separate visibility fix needed. Admin View (Bulk Enrol, Add
  Course, Add Questions) stays restricted: a new `hasLmsAdminAccess()` function reproduces the
  original `hr_manager`/`super_admin`/`hospital_admin`-or-permission-grant gate, and `LMSPage.tsx`'s
  `isAdmin` flag now checks it, not just the `?admin=true` URL param alone. **A live regression was
  caught and closed in the same pass, not a separate bug**: the first attempt at this fix widened
  `coreRoutes` but was interrupted before wiring `hasLmsAdminAccess()` into `LMSPage.tsx` — in that
  intermediate state, `?admin=true` in the URL was the *only* thing gating Admin View, with no role
  check behind it at all, meaning any authenticated Doctor or Nurse could have reached full
  Bulk-Enrol/Add-Course/Add-Questions access. Caught before being considered done, not shipped.
- **Facility Manager — written by clinical-pod (Murthy). The most severe access-control finding of
  this phase — fixed.** `src/lib/routeRoles.ts` (lines 44–46) used to explicitly override
  `/fms/dashboard`'s allowed roles to
  `['super_admin', 'hospital_admin', 'quality_officer', 'quality_manager']` — silently dropping both
  `facility_manager` and `biomedical_technician`, even though both are listed as the module's
  intended roles in `src/lib/modules.ts` line 94, while granting access to `quality_officer`/
  `quality_manager`, confirmed to have no operational reason to be there (NABH FMS-chapter safety
  rounds/PM schedules/BMW manifests are Facility/Biomedical operating duties; Quality's role is to
  audit that evidence afterward via `/nabh/compliance`, which already has its own entry) — a
  copy-paste from the `/quality/committees` override directly above in the same file, not an
  intentional restriction. This was sharper than every prior phase's gap: the matching role string
  was present in the module catalogue (so a hospital could reasonably believe a "Facility Manager"
  custom role would work) but absent from the actual enforced route guard. **Fix:** the override is
  removed entirely, so `/fms/dashboard` now falls through to `ALL_MODULES`'s own correct role list
  with no special-casing needed. Also fixed: FMS's **Assets** tab no longer offers MRI, Ventilator,
  Defibrillator, ECG Machine, Autoclave, or other clinical-device categories that the same form's
  own on-screen advisory already told staff to register in Biomedical Engineering instead — the
  double-registration risk this created is closed. **Still open:** FMS's **BMW Manifests**
  tab (`bmw_manifests` table — hospital-wide vendor-dispatch records, no ward breakdown) and
  Housekeeping's BMW Log (`bmw_records` table, already shipped,
  `housekeeping-facility-staff.md` — per-ward/per-day collection records, with two extra waste
  categories, Black/General and Cytotoxic, that FMS's form has no fields for at all) are two
  genuinely separate, unreconciled tables describing different stages of the same waste stream,
  with no system check that a given period's collection total in one roughly matches the dispatch
  total in the other — not yet confirmed as a deliberate design split vs. a genuine reconciliation
  gap; still an open question, not resolved by the Assets-tab fix above.
- **Patient Relations Officer (PRO) — written by quality-pod (Ramya). One of three findings
  resolved, one still open.** `receptionist` is already a default role card on **Settings → Staff
  Members → Add Staff Member**, and it sits on `/pro`'s own role list
  (`["pro_officer", "receptionist", "super_admin"]`) with no restriction, so every hospital already
  has zero-setup access to this whole module through its existing Receptionist login — no fix
  needed, this was never a gap. `pro_officer` itself still needs the standard one-time custom-role
  step, with a trap not seen in quite this shape before: the natural, obvious label **"Patient
  Relations Officer"** slugifies to `patient_relations_officer`, which does **not** match the route
  guard's `pro_officer` string. **Resolved as a documentation decision, not a code change**: rather
  than widen the route guard to silently accept a second string (which would just move the
  inconsistency rather than close it), the training manual now tells the admin the exact label to
  type instead ("PRO Officer" or "Pro Officer") — `src/lib/modules.ts` carries an inline comment
  explaining why this wasn't "fixed" by aliasing. **Still open:** the **Feedback** tab reads a table
  (`feedback_records`) that **nothing in the product ever writes to**, while the real
  patient-facing feedback form on the portal (`PortalFeedback.tsx`) writes to a completely
  different table (`patient_feedback`) that **nothing reads back** — two disconnected one-way
  pipes, not a single shared system. Confirmed as genuinely non-overlapping with CRM & Marketing's
  Reviews tab (`online_reviews`, Phase 8) — three fully distinct tables, not partial duplicates of
  each other. The one real cross-module link runs the other way: CRM's Reviews "AI Analyse" feature
  can auto-insert directly into this module's own `grievances` table when it flags a review as
  needing escalation, so a grievance can appear in a PRO's queue that no PRO ever typed in — that
  link is real and intentional, not a gap.

**Follow-up fix-pass status:** of the 9 items flagged across these four files, 5 are fixed and
independently re-verified (FMS route override, the live admin-gate regression it nearly shipped,
the "Billing" role-card root cause, LMS staff-view access, FMS Assets clinical-category cleanup),
1 is resolved as a documentation-only decision (PRO's role label), and 3 remain genuinely open,
carried forward rather than silently dropped: the MRD/Mortuary MLC-table split, MRD's empty
Retention tab, and PRO's Feedback-tab/portal-form disconnect. All fixes verified via `npx eslint`,
`npx tsc --noEmit`, `npm run check:db-contract`, `npm run check:rls-coverage`, and
`npm run check:user-fk` — all clean.

## Phase 10 — shipped

Four more role files, spanning revenue-pod, clinical-pod, security-pod, and frontend-pod — the
widest pod spread of any phase — grounded in actual component source the same way Phases 1–9 were.
Each pod was explicitly asked to watch for another instance of two now-confirmed recurring bug
classes in this codebase: the "Billing"-card role-mislabel trap (Phase 8/9) and the route-override
copy-paste bug (Phase 9's FMS finding). Both patterns turned up again this phase.

| Role | File | Covers |
|---|---|---|
| Government Schemes / PMJAY Executive | [government-schemes-pmjay-executive.md](./government-schemes-pmjay-executive.md) | Beneficiaries, Pre-Authorization (eligibility check, package matching, AI clinical summary, submit/decide/convert-to-claim), Cashless Claims (ICD-lock-gated submission, denial/AI appeal, settlement), plus an orientation of HBP Catalog and Analytics — explicitly distinguished from `/insurance`'s own orientation-only "Government Schemes" nav section already covered in accountant-insurance-tpa.md |
| IPC / Infection Control Nurse | [ipc-infection-control-nurse.md](./ipc-infection-control-nurse.md) | The IPC Surveillance Dashboard's CLABSI/CAUTI/VAP/SSI rate cards against NABH benchmarks, seven tabs (Overview, Device Log, HAI Events, Bundle Compliance, Hand Hygiene, Trends, AI Insights), device logging chained into insertion/maintenance bundle checklists, HAI event logging, the WHO Five Moments hand-hygiene audit, and the advisory-only AI Insights panel |
| ABDM / Digital Health Executive | [abdm-digital-health-executive.md](./abdm-digital-health-executive.md) | Active Consents (filter/expand/revoke), Care Contexts (status review, single and bulk retry, per-patient FHIR-bundle viewer), Gateway Logs, Fetch Records/HIU, and an orientation of the embedded Compliance Score tab — explicitly distinguished from the Front Desk ABHA-ID field and the one-time Settings → Integrations → ABDM setup page |
| Communication Inbox Coordinator | [communication-inbox-coordinator.md](./communication-inbox-coordinator.md) | The unified WhatsApp/In-App/Feedback/Grievances/Sent/Starred/Resolved board, searching, the four quick-reply chips, composing an outbound WhatsApp-only message, and priority/star/resolve controls |

**Four pods, four distinct findings — two confirmed repeats of known bug classes, one corrected
severity assessment, and one corrected false-positive.**

- **Government Schemes / PMJAY — written by revenue-pod. Clean access bill, confirmed as a direct
  consequence of the Phase 9 fix.** `/pmjay` (`src/lib/modules.ts` line 66) carries
  `["billing_executive", "super_admin"]` with no override. `billing_executive` is now a default
  role card — because Phase 9's root-cause fix split the old single "Billing" card into separate
  Billing Executive/Accountant cards. Before that fix, this module would have shown the exact same
  "looks set up but isn't" trap Phase 8 found on Analytics; it doesn't anymore, confirmed by tracing
  the live `DEFAULT_ROLE_CARDS` array. Separately, `insurance_executive` (present on `/insurance`'s
  own role list) is absent from `/pmjay`'s — the same cross-module-split shape Phase 4 found for
  Accountant/Insurance-TPA, not a new pattern; still open, not something this round touched.
  **Two of three content defects fixed:** `PmjayClaimsTab.tsx`'s settlement handler — the most
  significant — used to post the mandatory journal entry with the raw Supabase **auth** user id
  instead of the resolved `public.users.id` it correctly used two lines earlier for a sibling
  column, a direct instance of the `_by`-column FK rule CLAUDE.md states explicitly, silently
  capable of skipping the required journal entry for any account created after migration
  `20260322111223` while the success toast still fired — now reads `userData?.id` on both. The
  Beneficiaries tab's "Verify" button, which only flipped a database status with no real
  eligibility call, is now relabelled "Mark as Verified" with a tooltip pointing to the real check
  on the Pre-Auth tab, rather than either building a duplicate real check or leaving the mislabel.
  **Still open, confirmed as a genuine schema gap, not fixed:** the Pre-Auth "Required Documents"
  checklist is local component state that resets every time the record reopens — `pmjay_preauth_requests`
  has no column meant to hold it, so persisting it needs its own migration, sized at roughly
  0.5–1 engineer-week, not something to improvise into this pass.
- **IPC / Infection Control Nurse — written by clinical-pod. Same override-copy-paste bug class as
  Phase 9's FMS finding — fixed.** `/ipc/dashboard`'s catalogue entry (`modules.ts` line 72) declares
  `infection_control_nurse` as an intended role; `routeRoles.ts` (lines 28–31) used to carry a
  hardcoded override that omitted it while granting `nurse`/`nursing_supervisor` instead. Unlike
  Ambulance's genuine dead end, a custom role created via Settings → Roles & Permissions always got
  a `role_permissions` row that routed around the broken override via `hasAccess()`'s dynamic
  branch, so a working two-step admin workaround existed even before the fix — but the override is
  now removed at the source anyway, same approach as FMS: `/ipc/dashboard` falls through to the
  catalogue's own role list, with `nurse`/`nursing_supervisor` deliberately dropped too
  (clinical-pod's stated reasoning: IPC surveillance data entry — device-day logging, HAI event
  entry, antibiogram review — is infection-control-team work, not bedside nursing's; a ward nurse
  performs hand hygiene in practice but doesn't log this dashboard's data, which is exactly why the
  catalogue created a distinct role for it). **Two of three content defects fixed:** Hand Hygiene
  audit rows no longer delete on a single click — an `AlertDialog` confirmation now gates the actual
  delete. The AI Insights tab's "I have reviewed…" checkbox now calls `logNABHEvidence()` (NABH
  standard HIC.2) when checked — not on uncheck, since reviewing is the evidence-worthy event, not
  retracting it. **Still open:** `QualityPage.tsx`'s thinner sibling "Infection Control" tab still
  carries a permanently placeholder Antibiotic Consumption card.
- **ABDM / Digital Health Executive — written by security-pod. A flat lockout, not the usual
  one-time-setup gap — fixed, with a stated direction call, not a rubber-stamp revert.**
  `/abdm`'s catalogue entry (`modules.ts` line 101) declares
  `["receptionist", "doctor", "nurse", "hospital_admin", "super_admin"]`; the override that used to
  sit at `routeRoles.ts` line 51 dropped both **Reception and Nurse — genuinely zero-setup default
  role cards** — while granting `billing_executive`. Because this touches patient-consent/PHI
  surface, security-pod investigated rather than assumed a copy-paste revert: checked every tab of
  `ABDMConsentPage.tsx` and `ABDMCareContextsPanel.tsx` for any charge/claim/invoice logic tying
  `billing_executive` to this screen, and found none — the only "payment" string anywhere is an
  `HPAYMT` consent-*purpose* label in a dropdown, not a billing-role code path. Receptionist was
  restored on the evidence that `front-desk.md` already documents it capturing a patient's ABHA ID
  at registration — a real pre-existing touchpoint. Nurse was restored on the absence of any stated
  privacy rationale, and because "deliberately restrict to protect PHI" is internally inconsistent
  with admitting a finance role while excluding a clinical one. No prior rationale comment existed
  for this override (unlike IPC's, which at least named quality roles plausibly), further evidence
  this was copy-paste, not design. The override is now removed; `/abdm` falls through to the
  catalogue's own role list. **One content defect fixed:** the consent-revoke call's `X-CM-ID`
  header used to be `cfg.is_production ? "sbx" : "sbx"` — both ternary branches literally
  identical — confirmed as a genuine bug by direct comparison against the correctly-written
  equivalent (`"abdm" : "sbx"`) a few hundred lines later in the same file, and additionally
  cross-checked against three other call sites (`_shared/abdm-auth.ts`, `_shared/abdm-encrypt.ts`,
  `abdm-hip-callback/index.ts`) before fixing, not just the one nearby line.
- **Communication Inbox Coordinator — written by frontend-pod. A corrected false positive, not a
  confirmed gap.** The brief for this phase carried two text role lists for `/inbox` — a narrow one
  in `modules.ts` and a wider override in `routeRoles.ts` — but tracing every actual enforcement
  point (`RoleGuard.tsx`, `AppSidebar.tsx`, `ModulesPage.tsx`, `QuickAccessPage.tsx`,
  `CommandPalette.tsx`) showed all of them call the same `hasAccess()`, and `/inbox` sits in that
  function's `coreRoutes` array — the same short-circuit mechanism Phase 9 used to fix LMS Staff
  View — which returns `true` for *any* authenticated role before either text list is ever
  consulted. Net effect: every staff login already has full route access and a visible sidebar
  tile, wider open than either list on its own implies; this is a clean bill, not a gap, and neither
  `ROUTE_ROLES['/inbox']` nor `modules.ts`'s entry actually does anything today. **Two of four
  content defects fixed, narrow:** the Filter icon and five Tags chips had no click handlers at
  all — both columns already had real, unused columns behind them (`inbox_messages.is_read` and
  `.tags`, confirmed via the generated types before wiring, not invented), so Filter now toggles
  unread-only and each Tag chip filters the list against that tag, no new columns added. A
  previously-unused `assigned_to` column (also pre-existing, not invented) now has a real
  "Assign to…" dropdown reusing the same staff-fetch pattern the PRO module's Grievances tab
  already uses. **Two of four deliberately left open, with sizing, not half-fixed:** three of the
  eight board sections (Feedback, Grievances, portal messages) remain structurally unreachable —
  confirmed distinct from Phase 9's already-deferred `grievances`/`feedback_records`/
  `patient_feedback` gap (four non-overlapping systems total now, not three) — frontend-pod
  declined to build a partial fix for one channel without first scoping all three across
  portal/CRM/PRO ownership, sized at roughly 0.5–1 engineer-week per channel once scoped. The real
  inbound WhatsApp webhook still writes to entirely separate tables
  (`whatsapp_bot_sessions`/`whatsapp_bot_messages`), never to the ones this screen reads — confirmed
  this needs a real design decision (a column-shape mismatch plus a bot-vs-human-handoff
  race-condition risk if simply mirrored), not a small bridge, sized at roughly 0.5 engineer-week
  for the design decision alone, then 0.5–1 more to build. **One new follow-up surfaced by this
  round's design-law reviewer, not yet acted on:** the Inbox's third column is already tight at the
  768px tablet breakpoint before the new Assign control, and tighter after — flagged as a
  responsive-layout follow-up, not fixed here.

No code was edited in writing any of these four files — flag-only, per this phase's own scope. A
follow-up fix-pass (requested separately, same session) closed 7 of the 9 items flagged above —
the PMJAY `postedBy` FK misattribution, the ABDM consent-revoke `X-CM-ID` bug, both the IPC and
ABDM route-override corrections, the Hand Hygiene delete confirmation, the IPC AI-insight NABH
evidence logging, the PMJAY Beneficiaries relabel, and the Inbox tag/unread filtering plus
assign-to control — leaving 3 deliberately deferred with sizing, not silently dropped: the PMJAY
Pre-Auth document-checklist schema gap, and Inbox's unreachable channels and WhatsApp bridge.
Every fixed item was independently re-verified against the live source in this write-up, not taken
on either pod's or Nikhil's word alone — the same discipline this README has held since Phase 8's
original gap was found and closed the same way.

## Phase 11 — shipped

Four more role files, written by clinical-pod (the first three) and data-pod (the fourth),
grounded in actual component source the same way Phases 1–10 were.

| Role | File | Covers |
|---|---|---|
| Vaccination / Immunization Staff | [vaccination-immunization-staff.md](./vaccination-immunization-staff.md) | `VaccinationPage.tsx`'s 8 tabs (Patient Card, Due List, Record Vaccine, Cold Chain, Camps, Stock, Adult Schedule, Add Vaccine) — AEFI reporting lives inside Record Vaccine, not a separate tab |
| Home Care Nurse | [home-care-nurse.md](./home-care-nurse.md) | `HomeCarePage.tsx`'s 3 tabs (Active Plans, Visit Schedule, Tele-Monitoring) — explicitly distinguished from Physiotherapy's "home visit" session type: Home Care is a wholly separate `home_care_plans`/`home_care_visits`/`home_tele_monitoring` system with no referral or outcome-score tooling |
| Day Care Unit Coordinator | [day-care-unit-coordinator.md](./day-care-unit-coordinator.md) | `DayCarePage.tsx`'s full subsystem — booking, the financial gate (Estimate & Deposit), admission plus per-procedure GST-exempt billing, discharge, cancel/no-show, reschedule — explicitly distinguished from `ipd-ward-clerk.md` (confirmed no bed management exists in Day Care at all; same-day, procedure-based, its own gate/billing logic) |
| HMIS / Govt Reporting Officer | [hmis-govt-reporting-officer.md](./hmis-govt-reporting-officer.md) | Generating the Monthly HMIS return, the Weekly IDSP P-Form (and its keyword-match syndrome logic), and the Monthly RMNCH+A return; viewing/submitting past reports via Report History; and the PCPNDT Form F Register — closes the deferred item Phase 8's `analytics-mis-officer.md` pointed at without walking through |

**Access-control finding — three clean bills and one confirmed-benign widening; no new hard access
gap this phase, though Day Care surfaces a genuine access-adjacent defect inside its own override
policy.**

- **Vaccination and Home Care — both a clean bill, zero-setup.** Neither `/vaccination` nor
  `/home-care` has an override in `src/lib/routeRoles.ts` — both inherit the module catalogue's own
  role list, **Nurse**, **Doctor**, **Super Admin** — and both Nurse and Doctor are already default
  role cards on **Settings → Staff Members → Add Staff Member**. No one-time custom-role step is
  needed for either module, the same clean shape Phase 3 found for Hospital Admin and Phase 8 found
  for Emergency Department.
- **Day Care Unit — the `/ipd/day-care` override at `routeRoles.ts` line 12 is a confirmed
  widening, not the drop-a-role bug pattern Phase 9/10 found elsewhere.** It adds
  `billing_executive` and `hospital_admin` on top of the catalogue's `doctor`/`nurse`/`receptionist`/
  `super_admin`, and every added role has a real operational tie to the screen — Billing Executive
  to the financial gate and procedure billing, Hospital Admin as a standing admin account — nothing
  the catalogue granted is dropped. All five roles are already default role cards or standing admin
  accounts, so this module needs no custom-role step either. **A separate, genuine access-adjacent
  gap inside the same module:** `DayCareAdmitGateModal`'s audited-override path checks role against
  `DEFAULT_DAY_CARE_POLICY.overrideRoles = ["admin", "billing"]` — neither string matches any real
  login role in this app (`super_admin`, `hospital_admin`, `billing_executive`, etc.), and
  `SettingsDayCareProceduresPage.tsx` has no UI control to edit that list at all. Net effect: by
  default, no login — including Super Admin — can use the audited financial-clearance override;
  only the "collect the money" path works. **Fixed:** `DEFAULT_DAY_CARE_POLICY.overrideRoles` now
  reads `["hospital_admin", "super_admin", "billing_executive"]` — real role strings, matching the
  roles this same section already confirmed have a genuine operational tie to the screen. A second,
  non-obvious fix was needed alongside it: `SettingsDayCareProceduresPage.tsx`'s save handler
  always spreads the *current* policy object (including whatever `overrideRoles` resolved to) when
  a hospital saves any change on this screen — meaning any hospital that had ever toggled "Require
  Clearance" or edited the deposit percent before this fix landed would have the broken array
  permanently persisted into their own `hospital_settings` row, which `parseDayCarePolicy()` prefers
  over the code-level default once a row exists. A backfill migration
  (`20261108000007_daycare_override_roles_backfill.sql`) corrects any already-persisted row still
  carrying the exact broken 2-element array; the settings page itself still has no UI control to
  edit this list, which is a separate, smaller follow-up, not required to close the access gap
  itself (confirmed: `parseDayCarePolicy` already supports reading a hospital-configured value, so
  a UI would only be needed for a hospital to *customize* beyond the now-correct default, not to
  reach it).
- **HMIS / Govt Reporting Officer — the standard one-time custom-role step, mandatory, no
  fallback, with a safety net.** `/hmis` has no override in `routeRoles.ts`; `hmis_officer` is not a
  `DEFAULT_ROLE_CARDS` card, and `slugifyRoleName("HMIS Officer")` → `hmis_officer` is an exact
  match, with no acronym surprise. There is no `doctor` (or any other default-card role) fallback on
  this module's role list, so the custom-role step is mandatory — but `hospital_admin` already
  covers it with zero setup, both on the role list itself and via `BYPASS_ROLES`. The Settings-side
  companion page, `SettingsHMISPage.tsx` (`/settings/hmis-portal`), is genuinely admin-only
  configuration and is noted as orientation-only, not walked through — the same treatment Phase 10
  gave ABDM's own Settings page.

**Content-only gaps found this phase — 6 of 8 fixed, 1 deliberately deferred with evidence, 1 a
judgement call to leave unfixed:**

- **Vaccination — both items resolved, differently.** `AdultImmunizationTab.tsx`'s raw-ISO due/given
  dates are now `en-IN` formatted. The dead `VaccinationModulePage.tsx` (plus its
  `ImmunizationScheduleTab` and `AEFIReportingTab`) was investigated, not just deleted on sight:
  clinical-pod's Priya independently re-confirmed zero live references anywhere in the app, and
  separately confirmed the dead `AEFIReportingTab`'s write path has its own real clinical-data-
  integrity defect — it fabricates `vaccination_records` rows via free-text `ilike` patient-name
  matching, with `patient_id: null` on no-match and a hardcoded `dose_number: 1` — so it was
  **deleted, not ported**, even though its read-side register display was materially richer. A
  proper cross-patient AEFI register (reusing the read-side pattern, with a redesigned write path
  that attaches to a real dose row) is sized at roughly 0.5 engineer-day and deferred, since it
  needs a new UI surface routed through frontend-pod plus a second clinical sign-off, not something
  to improvise into a bug-fix pass.
- **Home Care — both items fixed.** The visit-completion form's `services_done` field needed no
  migration — a real seeded config category (`useConfigValues("home_care_services")`) already
  existed and was already used by the Active Plans tab's "Services Needed" field, just not reused
  here; a "Services Performed" checkbox grid now drives it, so bills stop falling back to a generic
  "Nursing Visit" label. Active Plans, Tele-Monitoring, and (caught as a one-line bonus while the
  file was already open) the Visit Schedule row's date all now show `en-IN` format.
- **Day Care Unit:** the admit-gate override-role gap is documented under access control above, now
  fixed there, including the backfill migration — not repeated here.
- **HMIS / Govt Reporting Officer — 3 of 4 fixed, the major finding deliberately deferred.**
  `generateIDSPPForm` and `generateRMNCHA` now `.upsert()` against the real 5-column constraint
  `uq_hmis_report` (`hospital_id, report_type, period_year, period_month, period_week` — confirmed
  directly from the constraint's own migration, since omitting any column from the conflict target
  makes Postgres unable to infer the arbiter at all, not just miss genuine duplicates), matching the
  pattern `generateMonthlyHMIS` already had correct. The IDSP P-Form Period line and the PCPNDT Form
  F Register's Date column and printed form all now show `en-IN` dates. The vestigial "IDSP L-Form"
  label, confirmed to have no producing code path, is removed. **The major finding — the PCPNDT
  dual-register gap — remains deliberately deferred, not fixed.** This screen's PCPNDT Form F
  Register (`pcpndt_form_f`) and Radiology's own radiologist-signed PCPNDT form (`pcpndt_records`)
  share no foreign key, so the same ultrasound order can appear once correctly in Radiology's
  register and once thinly/incompletely here — confirmed the identical "two unlinked registers"
  governance shape Phase 9 found between MRD's and Mortuary's MLC tables, and held to the same
  standard: this needs a real design decision (which table is authoritative, what happens to
  already-divergent rows) before any code changes, not a narrow bridge attempted inside a bug-fix
  pass. Sized at roughly 1–1.5 engineer-weeks once scoped, the same order of magnitude as the MLC
  consolidation Phase 9 is still carrying as backlog.

No code was edited by either pod during the flag-only phase itself. A follow-up fix-pass (requested
separately, same session, following the Phase 9/10 pattern) closed 7 of the 9 items above: the Day
Care override lockout (plus its backfill migration), both Vaccination items, both Home Care items,
and 3 of HMIS's 4 findings — leaving 2 deliberately deferred with sizing, not silently dropped: a
proper cross-patient AEFI register (Vaccination) and the PCPNDT dual-register consolidation (HMIS).
Every fixed item was independently re-verified against the live source — `npx eslint`,
`npx tsc --noEmit`, `npm run check:db-contract`, `npm run check:rls-coverage`, and
`npm run check:user-fk` all clean — the same discipline held since Phase 8's original README gap
was found and closed this same way.

## Phase 12 — shipped

Four more role files — the widest pod spread yet, three different pods plus one combined-module
file — grounded in actual component source the same way Phases 1–11 were. Nikhil independently
re-verified the Phase 11 baseline (47 of 69 modules touched) against the 43 shipped files himself
before building on it, rather than trusting the README's stated number.

| Role | File | Covers |
|---|---|---|
| AI Clinical Intelligence Reviewer | [ai-clinical-intelligence-reviewer.md](./ai-clinical-intelligence-reviewer.md) | `/ai/clinical-intelligence`'s three tabs — Deterioration Watch, LOS Prediction, AI Prior Auth — for a Doctor or Nursing Supervisor login |
| Chronic Disease Care Coordinator | [chronic-disease-care-coordinator.md](./chronic-disease-care-coordinator.md) | `/chronic-disease`'s Dashboard, Care Plans, Adherence, and New Care Plan tabs — the OPD-enrolment-to-care-plan bridge, 6 task types, and medication adherence scheduling |
| Research Platform Coordinator | [research-platform-coordinator.md](./research-platform-coordinator.md) | `/research`'s Cohort Builder, De-identification, and FHIR Export tabs |
| Billing: Day Closure & Payments Desk | [billing-day-closure-payments-desk.md](./billing-day-closure-payments-desk.md) | Two modules in one file — `/billing/closure` (end-of-day cash lock/variance/reopen) and `/payments` (payment links, Razorpay reconciliation) — bundled because both belong to the same real desk job (Balaji's), not two separate ones |

**Four findings, none repeating a known bug class as a drop-a-role lockout — one real cross-screen
asymmetry, one genuine clean bill, and two files surfacing real application bugs beyond access
control.**

- **AI Clinical Intelligence — clean, not a repeat.** The `routeRoles.ts` override (line 86) carries
  the exact same four roles as the catalogue (`modules.ts` line 110: `doctor`, `nursing_supervisor`,
  `super_admin`, `hospital_admin`), just reordered — independently confirmed, not the FMS/IPC/ABDM
  drop-a-role pattern. `nursing_supervisor` needs the standard one-time custom-role step; `doctor`
  already has zero-setup access. **Content finding, fixed.** The screen's own "AI" framing
  overstates itself — Deterioration Watch and LOS Prediction are pure deterministic arithmetic, not
  AI/ML — but that framing wasn't the bug; the chronic-conditions scoring silently added 5 points
  with no visible reason chip, unlike every other scoring factor on the same screen. The 1-2
  condition branch now pushes a reason chip too, display-only, scoring value unchanged. The AI
  Prior Auth tab's hardcoded "capability" checkmarks and progress bar are left as-is — confirmed
  accurate description of a signpost to Insurance's and PMJAY's real AI workflows, not a bug to fix.
- **Chronic Disease Management — a genuine clean bill, not a Ward-Clerk-style gap in different
  clothes.** `/chronic-disease` has no override at all and inherits `doctor`/`nurse`/`super_admin`
  directly from the catalogue; both are default role cards, and `hospital_admin` reaches it via
  `BYPASS_ROLES`. A repo-wide grep for `care_coordinator`/`cdm_coordinator`/variants found nothing —
  confirmed there is no missing job title here; this genuinely is Doctor/Nurse's own job today,
  written as its own file only because it is a distinct enough workflow (care plans, 6 task types,
  medication adherence) to warrant one, the same reasoning Phase 9 applied to Dialysis/Oncology.
  **Real content defect, fixed.** `completeReview()`'s `autoChargeService` call — independently
  verified at `ChronicDiseasePage.tsx` lines 349–358 — used to pass neither `encounterId` nor
  `admissionId`, so the Chronic Care Review bill landed with no `encounter_id` set. Investigation
  confirmed no stored encounter link exists anywhere in the chronic-disease schema at all — this
  wasn't a missed wiring, there was nothing to wire. The fix reuses `resolveActiveEncounterLink()`
  (the same resolver Lab's external-referral flow already uses for an identical problem) to find
  whatever episode is open on the review date — an admission wins over an OPD encounter, and a
  review done outside any visit still correctly falls back to a standalone bill, the same accepted
  pattern ambulance/mortuary/home-care charges already use. Revenue-pod's Ravi reviewed and signed
  off with one FYI-only note, no changes requested. Three further findings from the same file: a
  missing "cancel" control for a care-plan task is fixed (reuses the already-correct
  `updateTaskStatus("cancelled")` call, previously unreachable from the UI); Medication Adherence's
  one-dose-per-day limitation is fixed with a "Doses/day" field, after confirming the table has no
  unique-per-day constraint blocking multiple rows; and the missing "stop a scheduled drug" control
  is confirmed as a genuine schema gap (no `is_active`/end-date column exists) and deferred with
  sizing (~0.3 engineer-weeks, gated on a migration) rather than worked around.
- **Research Platform — clean access, but the module's actual privacy tooling doesn't do what it
  claims. Treated as one connected cluster, not four one-liners, given its patient-data-leaving-
  the-system stakes.** `/research`'s override exactly matches the catalogue's role list — not a
  repeat of the FMS/ABDM pattern. **The `_by`-column FK claim turned out to already be fixed** —
  investigation found `research_cohorts.created_by` has been in the generic 40-column repair list
  in `20261106000003_fix_user_fk_targets.sql` (line 93) since Phase 10's own fix-pass; the original
  `CREATE TABLE` migration still saying `auth.users(id)` is expected (original migrations are never
  edited) and doesn't mean the live schema is still broken. `check:user-fk` confirms it as one of
  the 40 already repointed. Writing a second migration would have been a confusing no-op — correctly
  not written. **`saveCohort()`'s silent error-swallow — fixed**, now fails loud with a destructive
  toast on insert failure, matching the Oncology toxicity-alert pattern, plus a PHI-minimisation
  fix to the same file's preview query (dropped `full_name`/`uhid` from a `select()` that never
  rendered either field). **The FHIR export itself — investigated, deliberately NOT fixed, and the
  misleading button disabled instead.** `exportFHIRBundle()` really does hardcode `entry: []`, and
  `deidentify()` really is dead code — but wiring them together is not a contained fix: a real
  de-identified research bundle needs a resource-modelling decision (does it carry per-patient FHIR
  resources at all, given re-identification risk through the Condition→Encounter→Patient graph) and
  a genuine k-anonymity *equivalence-class* check (patient_count ≥ k is not sufficient — a 50-patient
  cohort with k=10 can still have a 2-person age×gender×condition cell that violates k=10). Per the
  explicit instruction not to ship a cosmetic fix for a privacy feature, the "FHIR Export" button is
  now disabled with a tooltip explaining why, rather than leave a convincing-looking empty export
  with a false "de-identified" success toast live. Re-enabling it is tracked as its own future piece
  of work requiring Dr. Nalini's clinical-governance review before any implementation — not done in
  this pass.
- **Day Closure & Payments — a real, confirmed asymmetry between two screens of the same job, not a
  copy-paste bug.** `/billing/closure`'s override (`routeRoles.ts` line 19) *widens* the catalogue's
  `accountant`/`billing_executive`/`cfo`/`super_admin` by adding `hospital_admin` — nothing dropped,
  the same confirmed-widening shape Phase 11 found for Day Care, not a drop-a-role lockout.
  `/payments`, independently confirmed, has **no override at all** and falls through to the
  catalogue's own narrower `billing_executive`/`super_admin` list. Net effect, verified directly
  against both files: **Accountant and CFO can both close and lock the end-of-day cash register,
  but neither can open Payments to send a payment link or reconcile a transaction** — only Billing
  Executive, Super Admin, or Hospital Admin (via bypass) can. **Investigated, deliberately left
  unfixed — correctly, not by default.** A hospital admin might reasonably want Accountant/CFO to
  resolve a reconciliation issue they spot while closing the day; segregation of duties between
  closing the books and handling payments is equally a legitimate, common financial control. No
  evidence either way was found in any comment, migration, or sibling finance module, so the role
  list was left as-is and the question is flagged for Kavitha (CFO) or Nikhil to make an explicit
  call on, rather than widened on a guess. **Two further content defects, both fixed:** Payments
  now uses the shared `formatINR()` instead of hand-rolling its own formatter; the Mode filter
  dropdown now lists all 10 payment modes, not 5. A third item found during the same pass: Print
  Summary used to skip `fetchHospitalBrand()` and print a content-free stub — it now follows the
  same `fetchHospitalBrand()` → `printHeader()` → `printDocument()` pattern already correct
  elsewhere, with real KPI, mode-breakdown, and ledger content.

**Follow-up fix-pass status:** of this phase's findings, the AI Clinical Intelligence chip, both
Day Care-style access investigations (Day Closure/Payments — left unfixed, correctly, pending a
policy call), the Chronic Disease billing/task/adherence items (3 of 4 fixed, 1 deferred with
sizing), and 3 of Research Platform's 4 items are resolved; Research Platform's FHIR export stays
deliberately disabled rather than half-fixed, and the Payments role-asymmetry question remains
open for Kavitha/Nikhil. Verified via `npx eslint`, `npx tsc --noEmit`, `npm run check:db-contract`,
and `npm run build` — all clean.

## Phase 13 — investigated, nothing shipped

Nikhil (PM) scoped Phase 13 as a search for the next 4 highest-priority untouched modules — the
same sequencing exercise that opened every phase since Phase 1 — but this phase closes differently
from all twelve before it. He read `src/lib/modules.ts` in full (all 69 catalogued modules) and
cross-referenced every one of the 17 modules not yet touched by any of the 47 shipped files
directly against the standing rule — not a thin doctor/nurse extension already covered by
doctor-opd.md/nurse.md, and not something already covered as an orientation-only sibling in an
existing file — checked file-by-file against real source, not asserted. **The result: zero of the
17 qualify.** All 17 sort cleanly into five categories, none softened or merged into another, each
a genuinely different reason a role file was not written.

**Thin doctor/nurse extension, already named in this README's own Deferred list (7).** Obstetric
ANC (`/specialty/anc`), Neonatal EMR (`/specialty/neonatal`), Anaesthesia EMR
(`/specialty/anaesthesia`), Ophthalmology EMR (`/specialty/ophthalmology`), Partograph
(`/specialty/partograph`), Delivery Record (`/specialty/delivery`), and Mental Health/Psychiatry
(`/mental-health`) — all seven were already named, as a group, in the Deferred section's own first
bullet before this phase began; this phase re-confirms them rather than re-litigating them.

**Thin doctor-only extension, independently confirmed this phase (2).** Telemedicine
(`/telemedicine`, roles `doctor`/`super_admin` only) was already evaluated and substituted out in
Phase 8 — not re-litigated here. Quick Scribe (`/quick-scribe`, roles `doctor`/`super_admin` only,
`src/lib/modules.ts` line 46) is confirmed fresh this phase: a grep of the entire `docs/training/`
directory for "Quick Scribe" returns zero hits, confirming it was never implicitly covered by any
existing file either.

**Orientation-only sibling of a module already covered, same role family (4).** JCI Accreditation
(`/quality/jci`) is explicitly listed in this README's own Deferred section as a Quality/NABH
screen not covered by quality-nabh-officer.md. MCI/Disaster Response (`/emergency/mci`) is
orientation-only within emergency-department-staff.md (Phase 8). Population Health
(`/analytics/population-health`) and Revenue Intelligence (`/analytics/revenue-intelligence`) are
both orientation-only siblings within analytics-mis-officer.md (Phase 8).

**Not a staff-operated screen at all, verified directly in `src/App.tsx` (2).** Patient Portal
(`/portal/*`, `App.tsx` line 290) and TV Display (`/tv-display`, `App.tsx` line 296) are both
registered inside `App.tsx`'s own `{/* Public routes */}` block with no `AuthGuard`/`RoleGuard` at
all. Patient Portal is the patient's own self-service login, not a staff one. TV Display is
confirmed the same way on the component side: `src/pages/tv/TVDisplayPage.tsx` is an unattended
waiting-room kiosk — live clock, token-queue readout, rotating health-tip carousel — with zero
staff click targets on the page itself.

**No distinct job title behind the role list, verified by reading the component (2).**
Notifications (`/notifications` — `src/pages/notifications/NotificationsPage.tsx`, roles
`doctor`/`nurse`/`receptionist`/`super_admin`/`hospital_admin`) is shared by every already-covered
role on one screen; no "Notifications Coordinator" job exists behind it. HOD Dashboard
(`/hod-dashboard` — `src/pages/hod/HODDashboardPage.tsx`) has no `RoleGuard` on the route at all —
it is a pure auto-refreshing read-only KPI panel with three links out to other already-covered
modules, nothing on the page itself to walk through.

7 + 2 + 4 + 2 + 2 = 17 — exhaustive, nothing left unaccounted for.

No role file was written this phase, so the running tally is **unchanged from Phase 12**: still 47
role files, still 52 of 69 modules touched, still 67 of 190 routes covered. This is a delta of
zero, not a new count Nikhil independently re-verified from scratch — he built directly on the
already-stated Phase 12 numbers, the same restraint Phase 12 showed toward Phase 11's numbers.

**Two content-only defects found incidentally while verifying candidates — one fixed in a
follow-up pass, one still just flagged.**

- `NotificationsPage.tsx`'s `savePrefs()` — fixed. It used to upsert with `onConflict:
  "hospital_id,patient_id"` into `notification_preferences`, but the saved row never set
  `patient_id` — it's a hospital-level default. Confirmed against the table's own migration
  (`20260910000009_notifications.sql`: `patient_id` is nullable, plain `UNIQUE (hospital_id,
  patient_id)`, not `NULLS NOT DISTINCT`) — Postgres never treats two NULLs as a constraint match,
  so `ON CONFLICT` could never fire for this row; every "Save Preferences" click inserted a fresh
  duplicate rather than updating the hospital's existing row. Rather than migrate the constraint,
  the fix loads the existing hospital-level row's id on mount (`patient_id IS NULL`) and explicitly
  chooses `update` vs `insert` from there — no schema change needed. This also closes the
  compounding half of the bug: the screen previously never fetched saved prefs at all, so it could
  never show what was last saved; it now does, on load.
- `HODDashboardPage.tsx` (lines 77–97) queries `obstetric_records` specifically for its "Unsigned
  Clinical Notes" and "High-Risk Patients" KPI cards, on a dashboard framed as department-agnostic —
  reads like a copy-paste from an OB/GYN-specific view rather than a genuinely generic
  department-head metric set. Still flagged as a possible scope mismatch, not confirmed as a
  defect — not touched in this round.

**Two suspected bugs already resolved, recorded here only so a future reader doesn't mistake the
comment for an open bug.** `TVDisplayPage.tsx`'s own code comments (lines 69–71, 84–86) describe a
past Razorpay-key/phone-field aliasing bug and a past text-sort token-ordering bug — but the live
code already selects the correct `phone` column and already orders by `created_at`, re-verified
before reporting rather than taken on the comment's word, the same "re-verify a flagged finding is
still live before assuming it" discipline the Research Platform case established in Phase 12. No
action needed.

This phase found no new module that meets the bar for a dedicated role file — the 47-file corpus
already covers every distinct operational job in the catalogue. What's left is specialty-EMR
doctor/nurse extensions already named in the Deferred list, orientation-only siblings of
already-covered modules, or screens with no distinct staff job behind them at all (two of which
aren't even staff-facing). If a future go-live specifically needs training content for one of
these, flag it explicitly rather than assuming this manual already covers it.

## Phase 14 — Settings sub-pages, first batch

Phase 13 confirmed the 47-file role-based corpus already covers every genuinely distinct
operational job in the catalogue — no Phase 14 of that same kind exists. This phase instead opens
a second front: `admin-hospital-manager.md` Section 5 has always been an orientation map of the
~45 `/settings/*` sub-pages, not a walkthrough. This phase gives four of them a real, full
click-by-click walkthrough for the first time, cross-referenced from Section 5 rather than
duplicated into it.

| File | Covers |
|---|---|
| [settings-consent-forms.md](./settings-consent-forms.md) | `/settings/consent-forms` — the admin-only template editor for consent wording (General Treatment, Surgical, HIV, DNR, LAMA, etc.), and the real, connected signature-capture pipeline it feeds (`ConsentSignatureModal.tsx`, used from Emergency/IPD) |
| [settings-drug-formulary.md](./settings-drug-formulary.md) | `/settings/drugs` — single-drug add/edit and the bulk-import modal, including which fields (GST%, NDPS schedule) actually drive downstream Pharmacy behaviour and which don't |
| [settings-workflow-configuration.md](./settings-workflow-configuration.md) | `/settings/discharge-workflow` and `/settings/opd-workflow` together — the two screens `routeRoles.ts` itself documents a real historical misconfiguration incident against |
| [settings-ai-features.md](./settings-ai-features.md) | `/settings/ai-features` — the per-feature AI toggle list and attestation policy, with Dr. Nalini's (CDO) governance sign-off folded in as a mandatory gate, not an afterthought |

**Every one of the four independently re-traced the same access-control chain, rather than
assuming the parent `/settings` gate applies — and found a worthwhile structural point, not just a
repeated clean bill.** `App.tsx` wraps every `/settings/*` route in `<RG path="/settings">`, which
computes `ROUTE_ROLES["/settings"]` and passes it as `RoleGuard`'s `allowedRoles` prop — a prop
`RoleGuard.tsx` never actually reads. The real check is `hasAccess(location.pathname, ...)` on the
live browser path, and `src/lib/routeRoles.ts` lines 218-221 route any `/settings/*` path through
`staticRolesFor()` and **return immediately**, before the dynamic permissions-blob branch that
caused the historical incidents (a nurse's `ipd`-module permission once leaking into
`/settings/discharge-workflow`, a receptionist's `opd` permission once leaking into
`/settings/opd-workflow`) can ever run. This is independently verified as a structural fix covering
the entire `/settings/*` surface for any role, not a per-route patch that could regress if a new
sub-page is added without its own `ROUTE_ROLES` entry — confirmed by three separate pods tracing
the identical chain for four different sub-pages and landing on the same answer each time.

**Real content defects found, flagged, not fixed:**

- **Drug Formulary — bulk import is completely broken.** `BulkDrugImportModal.tsx` builds an
  insert payload containing `strength` and `form` keys, but `drug_master` has no such columns —
  independently confirmed against the generated schema, which has `dosage_forms` (plural, array)
  and `standard_doses` instead. Every bulk-import attempt, Excel or AI-scanned, fails on the final
  Import click with a generic "Import failed" toast masking a Postgres undefined-column error.
  Not caught by `check:db-contract`, which validates `.from()`/`.rpc()` resolution, not
  insert-payload column shape. Separately, the Schedule H/H1 classification this screen writes
  (`schedule_type`) is read by nothing in Pharmacy — every real "Prescription required" warning
  there reads a different, older column (`drug_schedule`) this screen's two write paths never
  touch — so a drug flagged Schedule H here shows the badge on this screen alone and trips no
  warning anywhere a pharmacist actually dispenses it. `gst_percent` on this screen is similarly
  confirmed never read by real billing, which uses the batch's own GST% instead.
- **Workflow Configuration — deleting a dangerous custom discharge workflow doesn't fix the live
  gate.** `handleDeleteCustom` in `SettingsDischargeWorkflowPage.tsx` only updates
  `discharge_workflow_presets` (the list of saved presets) — it never touches `discharge_workflow`,
  the one field `IPDOverviewTab.tsx` actually reads to drive the live ward discharge stepper.
  Independently confirmed: deleting the exact kind of workflow the historical incident describes
  (one missing the Billing Settlement step) does not retract it from live enforcement — a reload
  even makes the editor look reset while the stale step list is still what's enforced. Separately,
  OPD Queue Config's entire settings blob (Token Prefix, Fee Timing, TV Display format, etc.) is
  confirmed write-only — nothing in `src/` reads it back except the settings page itself; the real
  token prefix is hardcoded in `WalkInModal.tsx`, independent of this screen's Prefix field. Only
  `opd_revisit_rules` is genuinely wired through to billing.
- **AI Features & Attestation — Dr. Nalini's governance review, folded in as the file's central
  finding, not an afterthought.** The critical/non-critical split is right for 6 of 8 features, but
  `voice_dictation` is flagged as likely under-classified (it feeds prescriptions per its own
  description, yet carries no attestation gate). More seriously, the `clinical_note` toggle is
  **cosmetic** — independently re-verified by grepping every `useAIFeatureFlag()` call site:
  `VoiceScribePanel.tsx`, the real note-generation path, has zero reference to that flag at all, so
  switching it off does nothing. Three other keys (`icd_suggest`, `voice_dictation`,
  `executive_digest`) share the same gap. `invalidateAIFlagCache()` also only busts the calling
  browser tab's own cache, with no realtime propagation to other open sessions. A separate, more
  serious safety-class entitlement-withholding gap was found in `PlansManagerPage.tsx`/
  `HospitalDetailPage.tsx` (platform-pod territory) — deliberately not folded into this file, since
  it's a distinct build-ticket item, not a documentation finding.

**Settings sub-page tally: 4 of ~45 now have a real walkthrough** (Consent Forms, Drug Formulary,
Discharge Workflow, OPD Queue Config — AI Features & Attestation makes 5 screens across 4 files),
the remaining ~40 still orientation-only in `admin-hospital-manager.md` Section 5. No fix attempted
for any finding above — flag-only, consistent with every phase's first pass before a separate
fix-pass, if requested, addresses them. This README update and `admin-hospital-manager.md`
Section 5's cross-references were completed directly by the orchestrating session after the
authoring pods' own session ended before reaching this step — the same gap Phases 8, 10, and 12
each hit and closed the same way, verified against live source rather than taken on any pod's
word.

## Deferred, not forgotten

Everything below is out of scope for Phases 1–13 and will be written on request, as its own
prioritised piece of work — not silently assumed to not matter:

- Specialty EMRs whose patients are already operated by doctor/nurse logins covered in
  doctor-opd.md/nurse.md and are not written as separate files: Obstetric ANC, Neonatal EMR,
  Anaesthesia EMR, Ophthalmology EMR, Partograph, Delivery Record, and Mental Health/Psychiatry.
- The remaining ~40 `/settings/*` sub-pages not covered in detail by admin-hospital-manager.md
  (Section 5 of that file is an orientation map of them, not a walkthrough) — down from ~45 after
  Phase 14 gave 5 screens across 4 files (Consent Forms, Drug Formulary, Discharge Workflow, OPD
  Queue Config, AI Features & Attestation) a real walkthrough of their own.
- The 16 HR-manager/compliance tabs on `HRPage.tsx` not covered by hr-payroll-staff.md (Section 5
  of that file is an orientation map of them, not a walkthrough), and `MyHRPage.tsx`
  (employee self-service).
- The Insurance screens beyond Pre-Auth Queue/Claims to Submit/Claims Status/TPA Ageing/
  Reconciliation not walked through in accountant-insurance-tpa.md (Government Schemes tabs, HCX
  Claims, TPA Queries, Unified View, TPA Disputes, Denial Analytics, Automation, Auto Settings,
  TPA Configuration).
- The Inventory tabs only orientated, not walked through, in inventory-procurement-staff.md
  (Consolidated, Stock Count, Vendors, MIS Dashboard, Anomalies, Reports).
- The Quality/NABH screens not covered by quality-nabh-officer.md: NABH Dashboard, Quality
  Indicators, Infection Control, Antibiotic Stewardship, Pain Management (all tabs inside
  `QualityPage.tsx`), and `/quality/jci`.
- **Telemedicine itself remains undocumented — evaluated and deliberately substituted in Phase 8,
  not silently skipped.** `/telemedicine` (`src/lib/modules.ts`) is gated to `["doctor",
  "super_admin"]` only, with no distinct coordinator role or screen: a single doctor-facing
  video-consult workspace, confirmed by reading `TelemedicinePage.tsx` and its route directly.
  Phase 8 substituted **Health Packages** in its place (see the Phase 8 section above) rather than
  writing a thin, doctor-only file that would duplicate doctor-opd.md's discipline with nothing
  new to teach a non-existent coordinator.
- 123 of the 190 routes registered in `src/App.tsx` not covered by any file in this manual (67 are
  covered — up from 62 after Phase 11). This phase's four new files raise coverage by exactly 5,
  since one file bundles two routes: `/ai/clinical-intelligence`, `/chronic-disease`, `/research`,
  `/billing/closure`, and `/payments`.
- The remaining 17 of Aumrti's 69 catalogued modules (`src/lib/modules.ts`) not touched by the 47
  role files shipped across Phases 1–12 (down from 22 remaining before this phase, i.e. modules
  touched rises from 47 to 52 — 5 modules via 4 files). This phase's files touch AI Clinical
  Intelligence (`modules.ts` line 110), Chronic Disease Management (line 92), Research Platform
  (line 114), Day Closure (line 62), and Payments (line 64) — confirmed against the module catalogue
  directly. **The pre-Phase-12 baseline (Phases 1–11) is carried forward unaudited in this pass**,
  the same restraint every phase since 7 has shown toward its predecessors. A full bottom-up recount
  across all twelve phases was flagged to Nikhil as follow-up work here; **Phase 13 is that
  recount, now done** — it read `src/lib/modules.ts` in full, cross-referenced all 47 shipped files
  directly, and categorized the full remaining 17 into five audited groups, with none qualifying
  for a dedicated role file (see the Phase 13 section above for the breakdown and citations).

If a go-live is being planned for a role or module not listed above, flag it before assuming the
training manual already covers it.

## House style (every role file follows this)

- Indian English spelling throughout (Anaesthesia, Gynaecology, etc.).
- Dates as `DD/MM/YYYY`; money as `₹`, never a raw number.
- On-screen button, tab, and field labels are copied literally from the actual component source —
  never invented or paraphrased UI text.
- Content is a numbered, task-based walkthrough: click-by-click steps, not a feature description.
- Written for a reader with no prior software background — assume this is the first business
  software this person has ever used.
