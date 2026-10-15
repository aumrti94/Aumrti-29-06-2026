# Chronic Disease / Care Coordinator — Training Manual

## What this role does in the system

As a Chronic Disease Care Coordinator, you run one module — **📋 Chronic Disease Management**
(`/chronic-disease`) — for every patient enrolled in a long-term condition programme: Type 2
Diabetes, Hypertension, COPD, Chronic Kidney Disease, Heart Failure, Asthma, Hypothyroidism,
Rheumatoid Arthritis, Epilepsy, or another condition your hospital tracks this way. From here you
turn an OPD enrolment into a structured **Care Plan**, assign and track follow-up **Tasks** (lab
tests, appointments, medication refills, vitals checks, education, referrals), run periodic
**reviews**, and track **Medication Adherence** day by day — so a diabetic, hypertensive, or CKD
patient's follow-up care does not quietly fall through the gap between hospital visits. This
manual assumes you have never used hospital software before.

**There is no login called "Care Coordinator."** You will log in as **Doctor** or **Nurse** — see
the access check below for exactly what that means in practice.

> **Access check — a clean bill, zero setup, not a Ward-Clerk/Ambulance-style dead end.** The
> `/chronic-disease` route has no override anywhere in `src/lib/routeRoles.ts` — grepping that
> file for "chronic-disease" returns nothing — so it inherits its allowed-roles list straight from
> the module catalogue (`src/lib/modules.ts`, line 92): **Doctor**, **Nurse**, **Super Admin**.
> Both Doctor and Nurse are already default role cards on **Settings → Staff Members → Add Staff
> Member**, so any hospital with those two logins already set up can open this module today with
> zero extra configuration — the same clean shape Phase 3 found for Hospital Admin and Phase 11
> found for Vaccination/Home Care. **Hospital Admin** can also open it even though that exact role
> string is not on the catalogue list, because `hospital_admin` sits in `BYPASS_ROLES`
> (`routeRoles.ts` line 116) alongside `super_admin` — both always pass every route guard in the
> app. A grep across `src/` and `supabase/migrations/` for `care_coordinator`, `cdm_coordinator`,
> `chronic_disease_coordinator`, and `chronic_care_coordinator` returns **nothing** — unlike
> Phase 2's Ward Clerk or Phase 7's Ambulance Driver, there is no real-world job title here with no
> matching login at all. This module genuinely is Doctor/Nurse's own job today, not a gap waiting
> to be named — Babu's roster portfolio ("Packages, Wellness & CDM") is the reason this phase wrote
> a distinct file for the *work*, not evidence of a missing *role string*.

**Two look-alike "Chronic Conditions" screens exist in the product under very similar names — they
are not the same system, and this file covers only the second one.**
- **OPD Consultation's own History tab** (documented in `doctor-opd.md`) shows **Chronic
  Conditions** as free-text editable chips (e.g. "Hypertension," "Diabetes") that a doctor types
  or clicks during a consultation. These write straight to the `patients.chronic_conditions`
  column — a plain list, with no follow-up date, no monitoring tests, and no link to anything in
  this module.
- **The Patients module's own patient record** (opened from the **🧑‍⚕️ Patients** screen, not from
  inside a consultation) has its own, separate **"Chronic Conditions"** panel with an **Enrol**
  link that opens **"Enrol in Chronic Disease Program."** This is the real bridge into this
  module — it writes to `chronic_disease_programs`, with a condition, a diagnosed date, a
  follow-up interval (30/60/90 days or 6 months), and a set of tests to monitor (e.g. HbA1c,
  Creatinine for diabetes). Neither doctor-opd.md's chip list nor this Enrol screen is documented
  further in this file — this file starts from the moment a `chronic_disease_programs` enrolment
  already exists, picked up on this module's own Dashboard and Care Plans tabs.

All dates on screen show as DD/MM/YYYY. All money shows as ₹.

---

## 1. The header and four tabs

Across the top: **📋 Chronic Disease Management**, with a **Refresh** button. Four tabs run across
the top, each only shown if your hospital's permission setup grants you that tab: **Cohort
Dashboard**, **Care Plans**, **Adherence**, **New Care Plan**.

---

## 2. Cohort Dashboard — the bridge from OPD enrolment to a care plan

1. Click **Cohort Dashboard**.
2. Four counters run across the top: **Active Care Plans**, **Enrolled in OPD** (every patient
   with a live `chronic_disease_programs` row, whether or not they have a care plan yet), **Tasks
   Due Today**, and **Overdue Tasks** — the last two are hospital-wide counts, not limited to
   whichever plan you last opened (see Section 3 for why that distinction matters).
3. If any patient is enrolled in a chronic programme from OPD but has no active care plan yet, an
   amber banner appears: **"N patients enrolled in OPD without a care plan."** Each row shows the
   patient's name, their enrolled condition, and their next OPD follow-up date if one is set.
4. Click **"Create plan"** on any row to jump straight to the **New Care Plan** tab with that
   patient, their condition, and their OPD follow-up date already filled in — and the resulting
   plan is saved with a link back to the enrolment it came from (see Section 5).
5. Below that, **Condition Breakdown** lists every condition across your hospital's active care
   plans with a patient count, busiest condition first.

This bridge is real, not cosmetic: the enrolment table (`chronic_disease_programs`) and the care
plan table (`care_plans`) used to be two completely separate systems with no link between them —
a care plan column named `program_id` now connects a plan back to the enrolment it was created
from, and the "Create plan" button above is what sets it.

---

## 3. Care Plans — selecting a plan, adding a task, completing a review

1. Click **Care Plans**. The left-hand list shows every care plan (patient name, condition, UHID,
   and a status badge — **active** green, otherwise grey). Click a plan to open it on the right.
2. The plan header shows the condition and patient name, a blue **"OPD enrolment"** badge if the
   plan is linked to a `chronic_disease_programs` row (Section 2), the UHID, the start date, and
   the next review date if one is set.
3. Click **"+ Add Task"** to open the New Task form:
   - **Task Type** — a dropdown of exactly six types: **lab test**, **appointment**,
     **medication refill**, **vitals check**, **education**, **referral**.
   - **Due Date.**
   - **Description** — free text (e.g. "HbA1c test, Ophthalmology review...").
   - Click **"Add Task."** The task is saved against this care plan and this patient, assigned to
     you (the logged-in Doctor or Nurse), with status **pending**.
4. Each task in the list shows its type, a status badge (**pending** amber / **completed** green /
   red with a ⚠️ if overdue), its description, and its due date. A task counts as **overdue** the
   moment its due date has passed and it is still pending — this is worked out live on screen each
   time the tab renders, it is not a separate stored status.
5. On a **pending** task, click the green checkmark to mark it **completed** — this stamps the
   current date/time as `completed_at` and refreshes both this plan's task list and the
   hospital-wide **Tasks Due Today / Overdue** counters on the Dashboard tab. A second icon next to
   it, a grey/red ✕, **cancels** the task instead — use this for a task that's no longer relevant
   (e.g. a referral the patient no longer needs). A cancelled task shows a grey **cancelled** badge
   and the row dims, same as a completed one.

> **Fixed.** The database and the code have always supported a third task outcome —
> `updateTaskStatus(taskId, "cancelled")` and the `care_plan_tasks.status` column's `cancelled`
> value both already existed — but no button on this screen ever called it. The cancel icon
> described above now does.

**Tasks Due Today / Overdue counters, exactly how they are worked out:** both figures on the
Dashboard tab count every **pending** row in `care_plan_tasks` across the whole hospital — "Due
Today" matches `due_date = today`, "Overdue" matches `due_date < today` — not just the tasks on
whichever plan is currently open. This was a known past defect pattern in this module (the
counters used to be derived only from the currently-selected plan's own task list, which read as
zero or wrong whenever no plan was open); the counters shown today are already the hospital-wide,
correct version.

**Completing a chronic review:** click **"Complete Review"** on an open plan to close out this
plan's current review cycle:
- A new row is saved in `care_plan_reviews` (not on the plan itself) dated today, with the next
  review date automatically set three months ahead.
- NABH evidence is logged under standard **COP.10**: "Chronic care plan reviewed: \<condition\> —
  \<patient name\>."
- A **"Chronic Care Review — \<condition\>"** charge is automatically raised against the patient,
  keyed to this specific review record so each review cycle bills exactly once even if you click
  the button twice.
- The plan's own review date is pushed out to match, and a toast confirms: "Review recorded — next
  review DD/MM/YYYY."

> **Fixed — after confirming there was genuinely nothing to wire.** The auto-charge call used to
> pass neither `encounterId` nor `admissionId` to `autoChargeService`, so every Chronic Care Review
> bill landed in the "standalone" branch with no `encounter_id` set — a direct violation of this
> pod's hard rule that every bill must carry one. Checking the schema first confirmed this wasn't a
> missed wiring: no table in the chronic-disease chain (`care_plans`, `care_plan_tasks`,
> `care_plan_reviews`, `chronic_disease_programs`) stores an encounter or admission link at all. The
> fix reuses `resolveActiveEncounterLink()` — the same resolver Lab's external-referral flow already
> uses for an identical problem — to find whichever episode is actually open on the review date: an
> IPD admission wins over an OPD encounter, and a review done with the patient not in either (e.g.
> by phone) still correctly falls back to a standalone bill, the same accepted pattern
> ambulance/mortuary/home-care charges already use. Revenue-pod reviewed and signed off.

---

## 4. New Care Plan — creating a plan from scratch or from an OPD enrolment

1. Click **New Care Plan** (or arrive here already via **"Create plan"** from the Dashboard tab,
   Section 2 — the patient, condition, and review date are already filled in when you do).
2. **Search Patient** — type a name or UHID, press Enter or click the search icon, then click the
   matching result to select them.
3. If you arrived via **"Create plan,"** a blue note confirms **"Linked to this patient's OPD
   chronic enrolment"** with an **unlink** option if you'd rather save this as a standalone plan.
4. Pick a **Condition** chip — Type 2 Diabetes, Hypertension, COPD, Chronic Kidney Disease, Heart
   Failure, Asthma, Hypothyroidism, Rheumatoid Arthritis, Epilepsy, or Other.
5. Fill in an **ICD-10 Code** (e.g. "E11") and a **Plan Type** — **Standard**, **Intensive**, or
   **Palliative**.
6. Set a **Review Date**.
7. Type **Goals**, one per line (e.g. "HbA1c < 7%," "BP < 130/80 mmHg," "Annual eye review...") —
   each line becomes its own numbered goal.
8. Click **"Create Care Plan."** You (the logged-in Doctor or Nurse) are recorded as both the
   plan's creator and its assigned doctor. NABH evidence is logged under standard **COP.10**:
   "Chronic care plan created for \<patient name\>: \<condition\> (\<plan type\>)." You land back
   on the Care Plans tab with the new plan already selected.

There is also a direct link into this tab from outside the module: opening
`/chronic-disease?tab=new&program=<id>` (used by the Patients module's "Create care plan" link,
Section 2 above's own enrolment screen) jumps straight here with that enrolment's patient and
condition pre-filled. This deep link is consumed exactly once per page load — refreshing or
re-navigating afterwards will not silently re-open and overwrite a form you have already submitted.

---

## 5. Adherence — tracking whether a scheduled drug dose was actually taken

1. With a care plan selected (Section 3), click the **Adherence** tab. If no plan is selected yet,
   the tab tells you to select one first.
2. The header shows the patient's name and an adherence percentage over the last 30 days — e.g.
   "72% adherence over the last 30 days" — with a colour badge: **Good** (green, 80% and above),
   **Suboptimal** (amber, 50–79%), **Poor** (red, below 50%). Until at least one dose has actually
   become due, this reads **"No doses due yet"** with no percentage — a dose scheduled for next
   week does not count against you yet.
3. Click **"+ Add Drug"** to schedule a medicine:
   - **Drug name** — free text (e.g. "Metformin 500mg BD").
   - **Days** — how many days to schedule, from 1 to 90.
   - **Doses/day** — 1 to 4; use 2 for a twice-daily ("BD") drug, 3 for thrice-daily ("TDS"), etc.
   - Click **"Schedule."** This creates one row per dose per calendar day for the number of days
     entered, starting today, each marked **unknown** until you mark it. When doses/day is more
     than 1, each row's drug name carries a "— Dose N/M" suffix (e.g. "Metformin 500mg BD — Dose
     1/2") so you can tell same-day doses apart in the list.
4. Every scheduled dose appears in the list with the drug name and its scheduled date
   (DD/MM/YYYY), highlighted amber if it is due today or earlier and still unmarked, red if marked
   **missed**, and dimmed if marked **taken**.
5. On any row that is due (scheduled date today or earlier) and still **unknown**, click the green
   tick to mark it **taken**, or the red cross to mark it **missed**. A future-dated row has no
   buttons at all — you cannot pre-mark a dose that has not come due yet.

> **Fixed.** Scheduling used to create exactly one row per calendar day regardless of how many
> times a day the drug was actually taken. The Doses/day field above now drives the real number of
> rows created per day.
>
> **Still open, confirmed as a genuine schema gap, not fixed.** Once a drug is scheduled there is
> no control anywhere on this tab to edit, delete, or stop it — confirmed by checking the real
> table columns, not assumed: `medication_adherence` has no `is_active` flag and no end-date
> column at all, so this isn't a UI gap with a column just waiting to be used. If a drug is
> discontinued partway through its scheduled run, its remaining future-dated rows keep appearing
> as due doses with no way to cancel them. Closing this needs a migration (a stop/end-date column)
> before any UI control can be added — sized at roughly 0.3 engineer-weeks total, not attempted in
> this pass.

---

## 6. What was checked and found clean

- **`_by`-column attribution.** Mortuary (Phase 6), Biomedical (Phase 7), and PMJAY (Phase 10) each
  had a real bug where a `_by` column was set from an unfiltered, first-row, or wrong-ID users
  query instead of the logged-in staff member. This module does not have that bug: `created_by`,
  `assigned_doctor_id`, `assigned_to`, and `reviewed_by` are all set from `userId`, which
  `ChronicDiseasePage.tsx` reads directly off `useHospitalId()` — the same hook every other correct
  module in the app uses — with no extra query and no fallback to a dummy value. If the session
  isn't ready, these fields simply save as `null` rather than attributing the action to the wrong
  person.
- **NABH evidence — exactly two trigger points, both standard COP.10.** `logNABHEvidence()` is
  called from precisely two places in this file: creating a new care plan (Section 4) and
  completing a review (Section 3's "Complete Review"). Adding a task, completing a task, and
  scheduling or marking a medication dose do **not** log NABH evidence at all — if your hospital's
  NABH audit expects task- or adherence-level evidence, this module does not currently produce it.
- **Module/tab entitlement keys.** All four tabs (`dashboard`, `plans`, `adherence`, `new`) are
  correctly registered under the `chronic_disease` module key in `src/lib/tabPermissions.ts`, and
  `/chronic-disease` maps to that same key in `src/lib/moduleKeys.ts` — unlike the Quality module's
  tile-vs-route mismatch found in an earlier phase, there is no missing catalogue entry here that
  would silently hide a tab regardless of role.

---

*This manual covers the Chronic Disease Management screens and the Medication Adherence tab as
they exist in Aumrti HMS today. Of the four content gaps originally found, three are now fixed
(task cancellation, the Chronic Care Review bill's `encounter_id`, and multi-dose-per-day
adherence scheduling) and one remains open with sizing (no control to edit/stop a scheduled drug,
pending a schema migration). If a screen looks different from what is described here, tell Babu
(Packages, Wellness & CDM) so the manual can be corrected.*
