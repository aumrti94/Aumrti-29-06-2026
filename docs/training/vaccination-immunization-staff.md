# Vaccination / Immunization Staff — Training Manual

## What this role does in the system

As immunization-clinic staff — nurse or doctor — you work in one module: **💉 Vaccination &
Immunization**. From here you check which vaccines a patient is due, record a vaccine
administration (including any adverse event observed), log the vaccine fridge's temperature,
manage vaccine stock, run a vaccination camp, and keep the vaccine catalogue itself up to date.
This manual assumes you have never used hospital software before.

> **Access check — a clean bill, and a cleaner one than most specialty modules get.** The
> `/vaccination` route has no override in `src/lib/routeRoles.ts` — grepping that file for
> `/vaccination` returns nothing — so it inherits its allowed-roles list straight from the module
> catalogue (`src/lib/modules.ts`, line 79): **Nurse**, **Doctor**, and **Super Admin**. Both
> job titles this clinic actually employs are **already default role cards** on
> **Settings → Staff Members → Add Staff Member**
> (`src/pages/settings/SettingsStaffPage.tsx`, `DEFAULT_ROLE_CARDS`: Doctor, Nurse, Billing
> Executive, Accountant, Pharmacist, Lab Tech, Reception, Admin/CEO). Unlike every specialty
> module since Phase 5 (Dialysis, Oncology, IVF, Physiotherapy, Dietitian, Biomedical, Mortuary,
> Dental, AYUSH, CSSD...), there is **no one-time custom-role step here at all** — a hospital's
> existing Nurse or Doctor logins open this module with zero extra configuration, the same clean
> shape Phase 3 found for Hospital Admin and Phase 8 found for Emergency Department.

> **Dead-code finding — resolved by deletion, not by porting.** `src/pages/vaccination/` used to
> have a second, unreachable page file, `VaccinationModulePage.tsx` (plus two tab components,
> `ImmunizationScheduleTab.tsx` and `AEFIReportingTab.tsx`), never imported by any route or
> component anywhere in the codebase. Its AEFI-reporting tab looked materially richer than this
> module's real AEFI capture (Section 4's "Adverse Event (AEFI)" panel inside Record Vaccine) —
> its own stats dashboard, a 10-item adverse-event-type list, onset-hours and action-taken fields —
> but a clinical-correctness review found its write path has a real data-integrity defect: it
> fabricates a `vaccination_records` row via free-text name matching against the patient list, with
> no disambiguation and `patient_id: null` on no-match. Porting that logic as-is would have
> introduced a worse bug than the one being fixed, so all three dead files were deleted instead. A
> properly rebuilt cross-patient AEFI register remains a real gap worth building — flagged as
> future work, not attempted here.

All dates on screen show as DD/MM/YYYY (`en-IN`). All money shows as ₹.

---

## 1. The header — KPIs and quick actions

Across the top of the module:
- Four KPI cards: **Given Today**, **Overdue** (red), **Due This Week** (amber), and **Cold
  Chain** — the last shows the most recent fridge temperature reading in green if it's within
  2–8°C, red if not, or "No data" if nothing has been logged yet.
- Two buttons: **"Record Vaccine"** (jumps to the Record Vaccine tab) and **"+ Plan Camp"** (jumps
  to the Camps tab). Both open the relevant tab directly rather than a separate pop-up.

Eight tabs run along the top: **👤 Patient Card**, **📅 Due List**, **💉 Record Vaccine**,
**🧊 Cold Chain**, **🏕️ Camps**, **📦 Stock**, **🧑 Adult Schedule**, **➕ Add Vaccine**.

---

## 2. Patient Card — checking a patient's due vaccines

1. Click the **👤 Patient Card** tab.
2. Search for the patient by name or UHID in the search box and click the match.
3. The screen shows the patient's name, UHID, DOB and age, then a **"National Immunization
   Schedule"** timeline grouped by milestone (Birth, 6 wk, 10 wk, 14 wk, 9 mo, 16–24 mo, 5–6 yr,
   10 yr, 16 yr) — each vaccine shown as a badge: a plain badge if upcoming, green with a ✅ if
   given, red with a ⚠️ if overdue.
   - The first time you open a patient with no due-list entries yet, the system automatically
     builds one from the National Immunization Schedule (NIS) vaccines and the patient's date of
     birth.
4. Below the timeline, an **"Optional / IAP Recommended"** section lists non-NIS vaccines the same
   way.
5. Click **"Print Card"** to open a printable vaccination card (vaccine, code, dose, status, date),
   or **"WhatsApp"** to send the patient a plain-text summary of what's given and what's due/
   overdue, straight to their phone via `wa.me`.

---

## 3. Due List — working the overdue/due-this-week queue

1. Click the **📅 Due List** tab.
2. Pick a filter: **Overdue**, **Due Today**, **Due This Week**, or **Due This Month**.
3. Patients are grouped one row per patient, showing name, UHID, age, up to four due vaccine code
   badges (with a "+N more" badge if there are more), and the **Max Overdue** days for that
   patient. Click a row to expand it and see every vaccine/dose due for that patient individually.
4. Click the message icon on a patient's row to send them a WhatsApp reminder listing every
   vaccine due and its due date (and "Overdue N days" where applicable).
5. Click **"Send Reminders to All Overdue"** at the top to open WhatsApp for the first overdue
   patient; for more than one, the screen tells you bulk WhatsApp messaging needs the WATI
   integration and does not attempt to send the rest itself.

---

## 4. Record Vaccine — administering a vaccine, and reporting an AEFI

This is the real, reachable screen for both recording a vaccine administration and reporting an
Adverse Event Following Immunization (AEFI) — there is no separate AEFI tab on this page (see the
gap noted at the top of this file).

1. Click the **💉 Record Vaccine** tab (or the **"Record Vaccine"** button in the header).
2. Search for and select the **Patient**.
3. Click the **Vaccines** picker, search or scroll the list, and tick every vaccine given this
   visit — each selected vaccine appears below with its dose number (auto-calculated from the
   patient's prior doses of that vaccine) and an injection **Site** you can edit.
4. Fill in **Date**, **Batch Number**, and **Expiry Date**.
5. Set **VVM Status** — **OK ✅** / **Stage 1** / **Stage 2 ⚠️** / **Discarded ❌** (the Vaccine
   Vial Monitor reading on the vial itself).
6. If the patient had a reaction, click **"Adverse Event (AEFI)"** to expand it, toggle **"AEFI
   observed"** on, and fill in a free-text **description** and a **Severity** (Mild / Moderate /
   Severe). The screen reminds you: **"⚠️ Observe patient for 30 minutes post-vaccination."**
7. Click **"Record N Vaccination(s)"**. The system then:
   - Saves one `vaccination_records` row per selected vaccine, with the AEFI fields attached to
     each if you reported one.
   - Marks the matching Due List entry as given and auto-schedules the next dose (28 days later)
     if the vaccine has more doses in its course.
   - Deducts one unit from the oldest-expiry batch in Stock (Section 7) for each vaccine given.
   - Auto-bills the visit: looks up a "vaccination" service rate (defaulting to ₹150 if none is
     configured), applies GST if your hospital has it configured on that service, and raises a
     standalone OPD bill.

> **A real AEFI record, correctly captured — but not yet a formal AEFI register.** What you file
> here is written straight onto that vaccine's own `vaccination_records` row
> (`aefi_reported`/`aefi_description`/`aefi_severity`), which is correct and does reach the
> dedicated `AEFIReportingTab.tsx` component's read query — but that component itself is on the
> unreachable second page described above, so there is currently no in-app screen that lists every
> AEFI report together, by severity, the way that component is built to. Until that page is wired
> up (or its logic moved onto the live one), treat this tab's collapsible panel as the only way to
> both record and retrieve an AEFI entry — it is on the individual patient's vaccination record,
> not a standalone register.

---

## 5. Cold Chain — logging a temperature reading

1. Click the **🧊 Cold Chain** tab.
2. Under **"Record Temperature,"** enter the **Unit** (defaults to "Vaccine Refrigerator 1") and
   the **Temperature (°C)**, then click **"Record."**
3. If the temperature is **outside 2–8°C**, the system:
   - Shows a red toast: **"🔴 ALERT: Temperature out of range: X°C — Check refrigerator
     immediately. Do not use vaccines until temperature is restored."**
   - Raises a **critical** `clinical_alerts` entry for the breach.
   - Does **not** call `logNABHEvidence()` for a breach reading — breaches go to the clinical
     alert instead.
4. If the temperature is **within 2–8°C**, the system shows a green toast (**"Temperature logged:
   X°C ✅"**) and logs it to NABH evidence under standard **FMS.8** — this is the compliance trail
   an assessor would check for routine cold-chain maintenance.
5. A 7-day temperature chart plots every reading with a shaded safe band (2–8°C) and red bands
   above/below it, followed by a table of the last 20 readings with an **ALERT** badge on any
   out-of-range one.

---

## 6. Camps — planning and tracking a vaccination camp

1. Click the **🏕️ Camps** tab (or **"+ Plan Camp"** in the header).
2. Click **"+ Plan Camp."**
3. Fill in **Camp Name**, **Date**, **Target Count** (a number), **Location**, **Target
   Population** (free text, e.g. "School children 5–12 years"), and **Notes**.
4. Click **"Save Camp."**
5. The camp list shows Camp Name, Date, Location, Target, Actual, and a status badge
   (Scheduled/Ongoing/Completed/Cancelled). There is no on-screen control to record vaccines given
   at the camp separately from Record Vaccine (Section 4) or to edit the **Actual** count from
   this tab — it is a planning and tracking list, not a camp-day operating screen.

---

## 7. Stock — receiving vaccine stock (FEFO)

1. Click the **📦 Stock** tab (or the vaccine stock will already show here from prior receipts).
2. Click **"+ Receive Stock."**
3. Pick the **Vaccine**, **Stock Type** (Purchased / Government Supplied), **Batch Number**,
   **Manufacturer**, **Quantity**, **Received Date**, **Expiry Date**, and optional **Storage
   Location**.
4. Click **"Receive Stock."**
5. The table lists every batch — Vaccine, Batch, Type, Manufacturer, Expiry, Received, Used,
   Wasted, Balance — ordered by expiry date (First-Expiry-First-Out), with a row shaded amber if
   expiring within 30 days and red if already expired.

---

## 8. Adult Schedule — adult immunization tracking

1. Click the **🧑 Adult Schedule** tab.
2. Search for and select the patient.
3. If this is their first time on this tab, click **"Init Full Schedule"** to seed the standard
   adult vaccine list (Influenza, Td/Tdap, Hepatitis B, Pneumococcal, HPV, COVID-19 Booster,
   Hepatitis A, MMR, Varicella) as **Due** entries, or click **"Add Vaccine"** to add one
   individually with its own due date.
4. Each row shows the vaccine, due/given date, batch (if recorded), and a status chip (Due /
   Given / Overdue / Deferred). Click **"Mark Given"** on a due vaccine to record it as given
   today.
5. This tab keeps its own separate `adult_immunization_schedule` table — it does **not** feed the
   Patient Card's NIS timeline (Section 2) or the main Due List (Section 3), which are both
   paediatric-schedule-only.

> **Fixed.** This tab's due-date/given-date text used to render the raw stored value — e.g.
> "Due: 2026-10-21" — instead of the house DD/MM/YYYY convention. Now formatted via
> `toLocaleDateString("en-IN")`, matching the Due List and Patient Card tabs on the same page.

---

## 9. Add Vaccine — maintaining the vaccine catalogue

1. Click the **➕ Add Vaccine** tab.
2. Click **"Add Vaccine"** (or the pencil icon on an existing row to edit one).
3. Fill in **Vaccine Name \***, **Code \***, **Dose (ml)**, **Type** (Live Attenuated / Inactivated
   / Subunit / Toxoid / mRNA / Conjugate / Viral Vector / Combination / Other), **Route**, **Site**,
   **Storage Temp (°C)**, and **Age / Schedule** (free text, e.g. "Birth, 6 weeks, 10 years").
4. Click **"Add Vaccine"** / **"Save Changes."**
5. Click the **Active/Inactive** badge on a row to toggle whether it shows up as selectable
   elsewhere in the module, or the trash icon to delete it outright (with a confirm prompt).

---

*This manual covers the Vaccination & Immunization screens as they exist in Aumrti HMS today,
including the unreachable second page and the Adult Schedule date-formatting gap noted above. If
a screen looks different from what is described here, tell Jaya (Nursing & Care Plans) so the
manual can be corrected.*
