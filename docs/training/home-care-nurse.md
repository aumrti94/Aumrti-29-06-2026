# Home Care Nurse — Training Manual

## What this role does in the system

As a Home Care nurse, you run post-discharge home visits from one module: **🏠 Home Care**. From
here you manage a patient's active home-care plan, schedule and record home visits (vitals, wound
checks, feedback), and review tele-monitoring readings a patient or their family phones in from
home — including what happens when one breaches a safety threshold. This manual assumes you have
never used hospital software before.

**This is a different module from Physiotherapy, not a renamed version of it.**
`docs/training/physiotherapy-staff.md` covers the **🦿 Physiotherapy & Rehabilitation** module
(`/physio`), which is referral-and-session based: a physiotherapy referral, booked sessions with
pain/ROM/MMT outcome scoring, equipment bookings, and Home Exercise Plans — and one of its four
session **types** happens to be labelled "home visit." That is a physiotherapy session that occurs
at the patient's home; it is not this module. **Home Care** (`/home-care`, this file) is a
separate system built on its own tables (`home_care_plans`, `home_care_visits`,
`home_tele_monitoring`) for general post-discharge nursing follow-up — wound checks, vitals,
chronic-care or palliative visit cadences, and remote vital-sign monitoring — with no referral,
no outcome-score tool, and no HEP builder. A patient could legitimately be on both at once (a
physio home-visit session for knee rehab, and a Home Care nursing plan for wound care), and
neither module reads the other's tables.

> **Access check — a clean bill, the same clean shape as Vaccination.** The `/home-care` route has
> no override in `src/lib/routeRoles.ts` — grepping that file for `/home-care` returns nothing —
> so it inherits its allowed-roles list from the module catalogue (`src/lib/modules.ts`, line 81):
> **Nurse**, **Doctor**, and **Super Admin**. Both job titles are already default role cards on
> **Settings → Staff Members → Add Staff Member**, so a hospital's existing Nurse or Doctor
> logins open this module with zero extra setup — no one-time custom-role step is needed here,
> the same clean shape Vaccination has (see `vaccination-immunization-staff.md`).

All dates on screen show as DD/MM/YYYY. All money shows as ₹.

---

## 1. The header — at-a-glance counts

Across the top of the module: **🏠 Home Care**, followed by **N active plans**, **N visits
today**, and — only when above zero — **N overdue** in red and **⚠️ N alerts** in amber. "Alerts"
counts tele-monitoring readings in the last 24 hours that actually breached a safety threshold
(`alert_sent = true`), not every reading logged.

Three tabs run down the left: **Active Plans**, **Visit Schedule**, **Tele-Monitoring** — each
only shown if your hospital's permission setup grants you that specific tab.

---

## 2. Active Plans — creating and viewing a home-care plan

1. Click **Active Plans** in the left-hand menu.
2. Click **"+ New Plan."**
3. Search for and select the **Patient \***.
4. Pick a **Plan Type**: **Post-Discharge**, **Chronic Care**, or **Palliative**.
5. Fill in **Diagnosis** (free text, e.g. "Post-op wound care, CHF, etc."), and tick every
   **Service Needed** your hospital has configured as a chip (e.g. wound dressing, vitals
   monitoring — this list is hospital-configurable).
6. Pick a **Frequency**: **daily**, **alternate_days**, **weekly**, or **twice_daily**.
7. Set **Start Date \***, and optionally an **End Date** (if left blank, the plan defaults to a
   30-day window) and free-text **Notes**.
8. Click **"Create Plan."** The system then:
   - Saves the plan and immediately generates every scheduled visit for its full window up front
     (one visit per day/alternate-day/week per the chosen frequency, capped at 180 visits so a
     bad end date can't generate thousands of rows) — these appear straight away on the Visit
     Schedule tab.
   - Logs NABH evidence under standard **AAC.12** ("Home care plan created: \<plan type\>").
   - If the visit schedule somehow fails to generate, the plan itself is still saved and the
     screen tells you plainly — **"Plan created, but visits could not be scheduled"** — rather
     than claiming full success.

Each plan in the list shows the patient's name, plan type, frequency, start date (→ end date if
set), diagnosis, and a status badge (**Active** green / **Completed** grey / **Cancelled** red).

> **Fixed.** The plan list's date text used to render the raw stored value — e.g.
> "2026-10-14 → 2026-11-13" — instead of the house DD/MM/YYYY convention. Now formatted via
> `toLocaleDateString("en-IN")`.

---

## 3. Visit Schedule — booking context and completing a home visit

1. Click **Visit Schedule** in the left-hand menu.
2. Pick a filter: **Today**, **This Week**, or **Overdue** (scheduled visits whose date has
   already passed and are still marked Scheduled). Visits for a plan are already pre-generated
   when the plan was created (Section 2) — there is no separate "add a single visit" button on
   this tab.
3. Each visit row shows the patient's name, scheduled date, plan type, and a status badge
   (**Scheduled** blue / **Completed** green / **Missed** red / **Rescheduled** amber).
4. On a **Scheduled** visit, click **"Record"** to open the visit panel on the right:
   - Enter **BP (mmHg)**, **Pulse**, **Temp (°F)**, and **SpO2 (%)**.
   - Pick a **Wound Condition** — N/A / Healing / Static / Deteriorating.
   - Fill in **Patient Feedback** and **Nurse Notes**.
   - Click **"Complete Visit."**
5. Completing a visit:
   - A **"Services Performed"** checkbox grid (the same seeded service list the Active Plans
     tab's "Services Needed" field uses) lets you tick off what was actually done — wound
     dressing, IV therapy, physiotherapy, nursing care, doctor visit, etc.
   - Marks the visit **Completed**, stamps today's date as the visit date, and records you (the
     logged-in nurse) as who performed it.
   - Auto-bills a **"Home Care Visit"** charge against the patient, naming the services you ticked
     rather than a generic label.
6. Alternatively, click **"Missed"** on a Scheduled visit to mark it missed without recording
   vitals — there is no reschedule control on this tab; a missed visit stays missed.

> **Fixed.** The visit-completion record's `services_done` field previously had no input control
> anywhere on screen, so it was always saved empty and every bill read as a generic "Home Care
> Visit — Nursing Visit." The checkbox grid above now drives it.

---

## 4. Tele-Monitoring — reviewing readings and what "alert" means

1. Click **Tele-Monitoring** in the left-hand menu.
2. Click **"Log Reading"** to enter one yourself (e.g. a reading phoned or messaged in by the
   patient/family): pick the **Care Plan \*** (must be an active plan), then **Systolic**,
   **Diastolic**, **Pulse**, **SpO2 (%)**, **Blood Sugar (mg/dL)**, and **Weight (kg)** as
   available, and click **"Save."**
3. Every reading is checked **immediately, at the point of entry** against fixed thresholds
   (`src/lib/homeCareAlerts.ts`): systolic BP over 160 mmHg, diastolic over 100 mmHg, SpO2 under
   92%, or blood sugar over 250 or under 60 mg/dL. If **any** of these is breached:
   - The reading is saved with `alert_sent = true` and shown highlighted red with a ⚠️ icon in
     the readings table.
   - A **high-severity** `clinical_alerts` entry is raised immediately, naming the patient and
     exactly which vital(s) tripped it (e.g. "BP systolic 172 mmHg") — this is the same alert
     escalation path the hospital's dashboard Alerts panel already watches, not a second,
     separate notification mechanism.
   - The save confirmation itself reads **"Reading logged — alert raised"** rather than a plain
     success message, so you know at the moment of entry, not later.
4. If nothing is breached, the save confirms simply as **"Reading logged ✓"** with no alert.
5. The readings table lists every logged reading — Patient, BP, Pulse, SpO2, Sugar, Weight, Time —
   with breached rows shaded red and a ⚠️ icon next to the patient's name, so a glance down the
   table shows which patients need a follow-up call regardless of when they were logged.

> **Fixed.** The readings table's Time column used to call `.toLocaleString()` with no locale
> argument — the same class of gap Phase 8 found and fixed in Emergency's
> `EpidemicModeBanner.tsx`. Now explicitly passes `"en-IN"`.

---

*This manual covers the Home Care screens as they exist in Aumrti HMS today, including the three
content gaps noted above (the Active Plans date format, the missing "services done" input on
Visit Schedule, and the Tele-Monitoring time-locale format). If a screen looks different from
what is described here, tell Sridevi (Allied Health & Rehabilitation, which includes Home Care)
so the manual can be corrected.*
