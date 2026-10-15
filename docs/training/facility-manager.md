# Facility Manager — Training Manual

## What this role does in the system

As Facility Manager, you work in one module: **🔩 FMS / Safety** (Facility Management & Safety),
at `/fms/dashboard`. It opens on the **Assets** tab — the register of the hospital's non-clinical
infrastructure (lifts, DG sets, fire extinguishers, AC plants, and so on) — and from there you log
**Maintenance** against those assets, record **Safety Rounds**, track **BMW Manifests**
(biomedical-waste dispatch to your authorised disposal vendor), and run three statutory safety
sub-tabs: **Fire Safety**, **Medical Gas**, and **Electrical Safety**. This manual assumes you have
never used hospital software before.

> **Access check — fixed.** The module catalogue (`src/lib/modules.ts`, line 94) lists
> `/fms/dashboard`'s allowed roles as **Facility Manager** (`facility_manager`), **Biomedical
> Technician** (`biomedical_technician`), **Super Admin**, and **Hospital Admin**. `src/lib/routeRoles.ts`
> used to explicitly **override** that list with `['super_admin', 'hospital_admin', 'quality_officer', 'quality_manager']`
> — a copy-paste from the `/nabh/compliance` override one line above it, not an intentional
> restriction, confirmed by clinical-pod: NABH FMS-chapter safety rounds, PM schedules, and BMW
> manifests are Facility/Biomedical operating duties; Quality's statutory role is to audit that
> evidence afterward via `/nabh/compliance`, which already has its own entry. **The override has
> been removed** — `/fms/dashboard` now falls through to `ALL_MODULES`'s own correct role list, so
> a Facility Manager or Biomedical Technician login (created via the one-time custom-role step,
> since neither is a default role card on **Settings → Staff Members → Add Staff Member**) can now
> open this screen as intended.

All dates on screen show as DD/MM/YYYY. Money shows as ₹.

**Note on NABH evidence:** unlike Housekeeping (BMW Log, Section 3 of
`housekeeping-facility-staff.md`) or Ambulance, no screen in this module calls
`logNABHEvidence()` — not on adding an asset, logging maintenance, recording a safety round, saving
a BMW manifest, or logging a fire-safety/medical-gas/electrical-safety record, even though the
migration that created these tables (`supabase/migrations/20260909000007_fms.sql`, line 2) states
its purpose in a comment as *"Satisfies NABH FMS chapter requirements for maintenance, calibration,
safety rounds, BMW."* This is the same gap Phase 7 found in Biomedical Engineering. Nothing in this
manual should be read as implying otherwise; if your NABH assessor asks for FMS-chapter evidence,
it comes from the records themselves, not from an evidence-log entry.

**One thing checked and confirmed clean this phase:** every staff-attribution (`_by`) column this
module writes to — `conducted_by` on Safety Rounds and Fire Safety, `recorded_by` on Medical Gas,
`performed_by` on Electrical Safety — is read directly from your own logged-in session via
`useHospitalId()`'s `userId`, with no separate, unfiltered lookup query in between. This is the
opposite of the `_by`-misattribution bug Phase 6/7 found and fixed in Mortuary and Biomedical's
`ReportBreakdownModal.tsx` — this module does not have that bug.

---

## 1. The header — KPIs

Below the page title, five KPI chips always show, their on-screen emoji copied literally:
**🏢 N Assets**, **⚠️ N Maintenance Overdue** (only shown once there is at least one), **🔧 N AMC
Expiring** (only shown once there is at least one), **🛡️ N Rounds This Month**, and **🗑️ N BMW
Entries**.

The left-hand navigation lists seven tabs, each gated separately by your hospital's per-tab
entitlement setup (if a tab is missing for your login, ask your admin — it isn't a bug): **Assets**,
**Maintenance**, **Safety Rounds**, **BMW Manifests**, **Fire Safety**, **Medical Gas**, **Electrical
Safety**.

---

## 2. Assets — the facility infrastructure register

A filterable table (search by name/tag/location, or filter by Category) of every active facility
asset, showing its asset tag, name, category, location, and — once you click a row to expand it —
Vendor, Warranty Expiry, AMC Provider, AMC Expiry, and Next Maintenance date.

> **Assets-boundary finding — two genuinely separate tables, with a dropdown that contradicts its
> own warning text.** This Assets tab writes to and reads from `facility_assets`. The Biomedical
> Technician's equipment registry (`biomedical-technician.md`, Section 2) is a completely different
> table, `equipment_master` — confirmed directly in both components' `.from()` calls and in their
> separate `CREATE TABLE` statements (`supabase/migrations/20260909000007_fms.sql` for
> `facility_assets`; `supabase/migrations/20260329082735_...sql` for `equipment_master`). There is no
> foreign key, shared ID, or any other link between the two tables — nothing in the schema or either
> screen's code stops the same physical device from being registered in both at once. The **Add
> Asset** form itself is aware of this risk and tries to head it off with an inline note (copied
> literally): *"Register facility infrastructure here (HVAC, DG Set, Fire suppression, Medical Gas,
> Electrical panels, elevators). For clinical medical devices (MRI, Ventilator, monitors, etc.) use
> the Biomedical Engineering module."* **The same form's Category dropdown used to directly
> contradict that note** — it listed MRI, CT Scanner, X-Ray, Ultrasound, Ventilator, Defibrillator,
> ECG Machine, Anaesthesia Machine, Autoclave, and CSSD Equipment alongside the categories that
> actually belong here, creating a real double-registration risk (the same physical device entered
> a second time in `facility_assets` under a different asset tag than its `equipment_master` entry).
> **Fixed:** the dropdown now only offers **Lift, DG Set, AC Plant, Fire Extinguisher, Oxygen
> Plant, Vacuum System, Water Treatment**, plus the general catch-all **Biomedical Equipment** and
> **Other** — every clinical-device category is gone, matching the form's own advisory text.

### Registering a new facility asset

1. Click **"Add Asset"**.
2. Read the blue advisory note above the form (quoted in full above) before picking a category —
   if what you're registering is a clinical medical device, stop and use the **Biomedical
   Engineering** module (linked directly from this note) instead.
3. Fill in **Asset Tag \*** and **Name \***.
4. Optionally: **Category** (see the list and the boundary warning above), **Location**, **Vendor**,
   **Warranty Expiry**, **AMC Provider**, **AMC Expiry**.
5. Click **"Save Asset"**.

### Upcoming Maintenance / Calibration banner

If any asset has maintenance or calibration due within the next 30 days, a banner appears above the
asset list with a table: Asset, Location, Type, Next Due Date, Days Remaining (shown as "Today" or
"Nd", colour-coded red at 7 days or less, orange at 14, amber beyond that), and a **"Log
Maintenance"** button per row that opens a quick-log modal without leaving this tab — see Section 3
for what that modal records.

### Removing an asset

Expand a row and click **"Remove"** — this deactivates the asset (it stops counting toward the
Assets KPI and disappears from the active list) rather than deleting its history.

---

## 3. Maintenance — maintenance & calibration logs

A searchable, filterable (by Status: OK / Observation / Defect, and by Type) history of every
maintenance and calibration entry logged against any asset, or logged generally with no asset
attached.

1. Click **"Add Log"**.
2. Pick the **Asset** (or leave it as **"No specific asset / General"**), the **Date \***, and the
   **Type \*** (Preventive Maintenance, Breakdown Repair, Calibration, or Safety Check).
3. Optionally: **Description**, **Performed By** (free text — technician or vendor name, not a
   system login), **Status \*** (OK, Observation, or Defect), **Next Due Date**, **Document URL**
   (link to a service report).
4. Click **"Save Log"**.

Logging maintenance from the Assets tab's due-soon banner (Section 2) opens the same fields in a
focused modal — **Description / Work Done**, **Performed By**, **Outcome / Status** (OK — No
issues / Observation noted / Defect found), **Next Due Date**, **Service Report URL** — and clicking
**"Save & Mark Done"** both records the log and automatically clears the asset's older pending
due-date entries for the same maintenance type, so it drops off the due-soon banner.

---

## 4. Safety Rounds — documented walkrounds

A running history of every recorded safety round: date, area, who conducted it, a non-compliance
count badge (or a green check if none), findings, the non-compliances themselves as a bulleted
list, and corrective actions.

1. Click **"Record Round"**.
2. Enter the **Date \*** and optionally **Area / Ward** (free text, e.g. "ICU, OT complex, Kitchen")
   and **Conducted By** (a dropdown of your hospital's active staff — leave blank and the system
   records you, the logged-in user, automatically).
3. Add **Findings / Observations**, and list any **Non-compliances (one per line)** — each line
   becomes its own bullet in the saved record.
4. Add **Corrective Actions** if any were assigned.
5. Click **"Save Round"**.

---

## 5. BMW Manifests — biomedical-waste dispatch records

> **BMW-overlap finding — the single most important finding in this file: these are two genuinely
> separate records, not the same data viewed twice, and nothing in the system reconciles them.**
> This FMS tab reads and writes `bmw_manifests` (`supabase/migrations/20260909000007_fms.sql`, line
> 50) — columns `manifest_date`, `vendor`, `yellow_bag_kg`, `red_bag_kg`, `blue_bag_kg`,
> `white_bag_kg`, `route_sheet_url`, `remarks`. Housekeeping's BMW Log
> (`housekeeping-facility-staff.md`, Section 3) reads and writes a completely different table,
> `bmw_records` (`supabase/migrations/20260329083647_...sql`, line 71) — columns `record_date`,
> `ward_id`/`ward_name`, `yellow_bag_kg`, `red_bag_kg`, `blue_bag_kg`, `white_bag_kg`,
> **`black_bag_kg`**, **`cytotoxic_kg`**, `total_kg`, `disposal_agency`, `cpcb_manifest_no`,
> `collected_by`, `verified_by`. Confirmed directly from both components' `.from()` calls and both
> tables' own `CREATE TABLE` statements, not assumed from the similar screen names. **This is a
> genuinely separate record, not the same underlying data and not a facility-wide aggregate of
> it** — there is no foreign key between `bmw_manifests` and `bmw_records`, no shared ID, and
> nothing in either screen's code reads from the other table to total or roll anything up. The two
> screens also capture different things at a different grain: Housekeeping's BMW Log is a per-ward,
> per-day **collection** record (what each ward handed over today, with two extra waste categories
> — Black/General and Cytotoxic — that FMS's form has no fields for at all) carrying its own CPCB
> manifest number as a free-text field (`cpcb_manifest_no`); FMS's BMW Manifests tab is a
> hospital-wide, no-ward-breakdown **vendor dispatch** record (what the authorised disposal vendor
> picked up, with a route-sheet link instead of a manifest-number field). In a hospital running
> both modules, a Facility Manager's monthly total here and a Housekeeping Supervisor's monthly
> total in `bmw_records` describe the same physical waste stream at two different stages of its
> journey (ward-level collection vs. vendor dispatch) but are stored, entered, and totalled
> completely independently — nothing in the system checks that a given day's collection total in
> Housekeeping roughly matches that day's (or week's) dispatch total here. If your hospital's CPCB/
> SPCB compliance reporting assumes these two logs reconcile, that reconciliation is a manual
> cross-check today, not a system-enforced one.

A this-month totals strip shows total kg per bag colour, followed by a 12-month stacked-bar trend
chart (legend: Yellow, Red, Blue, White), followed by the manifest history itself (date, vendor,
total kg, a dot-coded per-colour kg breakdown, a Route Sheet link if one was saved, and remarks).

1. Click **"Add Manifest"**.
2. Enter the **Date \***, optionally the **Authorised Vendor** (the CBWTF — Common Biomedical Waste
   Treatment Facility — or vendor name) and a **Route Sheet URL**.
3. Enter the weight in kg for each bag type actually collected: **🟡 Yellow Bag (kg) — Infectious /
   Pathological**, **🔴 Red Bag (kg) — Contaminated / Recyclable**, **🔵 Blue Bag (kg) — Glass
   Waste**, **⚪ White Bag (kg) — Sharps / Metallic** — leave any at zero if nothing of that type
   was in that dispatch.
4. Add **Remarks** if needed.
5. Click **"Save Manifest"**.

Click **"Print Monthly Report"** to generate a signed, printable A4 BMW Monthly Report — a monthly
collection-summary table with a grand total row, a 12-month stacked-bar trend chart, and three
signature blocks (**FMS In-Charge / Engineering Head**, **BMW Nodal Officer**, **Medical
Superintendent / CEO**), citing the Biomedical Waste Management Rules 2016 (CPCB / SPCB) and NABH
FMS-chapter evidence on its footer.

---

## 6. Fire Safety — drills & inspections

The tab heading is **"Fire Safety Drills & Inspections"**. A badge next to it reads **"Nd since last
drill — NABH requires quarterly"** (red) if more than 90 days have passed since the last Evacuation
Drill or Mock Fire Drill, or **"Last drill Nd ago"** (green) otherwise.

1. Click **"Record Drill / Inspection"**.
2. Enter the **Date \***, the **Drill / Inspection Type \*** (Evacuation Drill, Extinguisher
   Inspection, Code Red Mock Drill, or Mock Fire Drill), and the **Shift** (Morning, Afternoon, or
   Night).
3. Optionally: **Area / Block Covered**, **Participants Count**, **Evacuation Time (mins)**,
   **Extinguishers Checked**, the checkbox **"Fire exits clear & unobstructed"** (ticked by default),
   **Document / Report URL**.
4. Add **Observations** and **Corrective Actions** if needed.
5. Click **"Save Record"**.

Each saved record shows its type, shift, area, a red **"Exits Blocked"** badge if the exits-clear box
was unticked (or a green check if it was), participant count, evacuation time (flagged amber if over
5 minutes), extinguishers checked, observations, and any corrective actions.

---

## 7. Medical Gas — pipeline monitoring

The tab heading is **"Medical Gas Pipeline Monitoring"**. A red **"N Alarm Events"** badge appears if
any logged reading had an alarm.

1. Click **"Log Gas Reading"**.
2. Enter the **Date \*** and **Gas Type \*** — **Oxygen (O₂)**, **Nitrous Oxide (N₂O)**,
   **Compressed Air**, **Carbon Dioxide (CO₂)**, or **Nitrogen (N₂)**.
3. Pick the **Source Type** — Cylinders, Manifold Bank, PSA Oxygen Plant, or Liquid/Pipeline.
4. Optionally: **Pipeline Pressure (bar)**, **Volume / Consumption (L)**, **Supplier**, **Cylinders
   Received**, **Cylinders Returned**, **Next Inspection Date**.
5. Tick **"Pipeline inspected OK"** (ticked by default) and/or **"Alarm triggered"** (in red) if
   relevant — ticking Alarm triggered reveals an **Alarm Details** field to describe what happened
   and how it was handled.
6. Add **Remarks** if needed, then click **"Save Log"**.

You can filter the log history by gas type. Each entry shows pressure, volume, cylinder in/out
counts, supplier, and — in red — any alarm details.

---

## 8. Electrical Safety — DG set & electrical logs

The tab heading is **"Electrical Safety & DG Set Logs"**. Badges show **"N Faults"** (red) and **"N
Overdue Checks"** (amber) when present.

1. Click **"Add Safety Check"**.
2. Enter the **Date \*** and **Check Type \*** — DG Set Auto-Start Test, UPS / Battery Test,
   Earthing / Grounding Check, Main Panel / Distribution Board, General Lighting Inspection,
   Emergency Lighting Test, Lift / Elevator Safety, or Solar Panel / Inverter Check.
3. Pick **Status \*** — OK — No issues, Observation noted, or Fault found.
4. Optionally: **Equipment ID / Asset Tag**, **Location**.
5. **Only when Check Type is "DG Set Auto-Start Test"**, three extra fields appear: **Load (kVA)**,
   **Fuel Level (%)**, **Run Duration (mins)**.
6. Optionally: **Next Due Date**, **Document / Certificate URL**, **Findings**, **Corrective
   Actions**.
7. Click **"Save Log"**.

Each saved entry shows its check type, status badge, equipment ID, location, a red **"Overdue"**
badge if its next-due date has passed, and — for DG set checks — load, fuel level (red under 30%,
amber under 50%), and run duration.

---

*This manual covers the FMS / Safety screens as they exist in Aumrti HMS today, including the
access-control defect, the BMW-overlap finding, and the Assets-boundary finding documented above. If
a screen looks different from what is described here, tell Murthy (Facility & Support Services) so
the manual can be corrected.*
