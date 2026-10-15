# Emergency Department Staff — Training Manual

## What this role does in the system

As Emergency Department staff, you work in one module: **🚨 Emergency**. It opens straight onto the
**Triage Board** — every patient currently in the department, sorted into four colour-coded
priority columns — with a **Patient Workspace** below it for whichever patient you select. This
manual assumes you have never used hospital software before.

> **Access check — two separate findings, not one. Read both before assuming either applies to
> you.**
>
> **Finding 1 — the base Emergency module itself is a clean bill, unlike every specialty role from
> Phase 5 onward.** The `/emergency` route carries no override in `src/lib/routeRoles.ts`, so it
> inherits its allowed-roles list straight from the module catalogue (`src/lib/modules.ts`, line 41):
> **doctor**, **nurse**, **super_admin**. Both **Doctor** and **Nurse** are two of the 7 role cards
> that ship by default on **Settings → Staff Members → Add Staff Member**
> (`src/pages/settings/SettingsStaffPage.tsx`, `DEFAULT_ROLE_CARDS`, lines 85–92). There is no
> custom-role step required and no job title missing from the route guard — any hospital that has
> already set up Doctor and Nurse logins (which every go-live does on day one) can open the
> Emergency Department board with zero extra configuration.
>
> **Finding 2 — a real asymmetry between the day-to-day board and its own Mass Casualty mode.** The
> Mass Casualty / Disaster Response screen at `/emergency/mci` is a *different* route with its own
> explicit override in `src/lib/routeRoles.ts` (line 57): `super_admin`, `hospital_admin`,
> `doctor`, `nurse`, **and `receptionist`**. That fifth role — receptionist — is not on the base
> `/emergency` module's role list at all. The practical effect: a **Receptionist** login can open
> the Declare/Stand-Down MCI screen and its disaster-mode controls, but cannot open the ordinary
> Emergency Department triage board on any normal day. `hospital_admin` is unaffected by either
> list — the app's `BYPASS_ROLES` mechanism (`src/lib/routeRoles.ts`, line 95) grants it access to
> everything regardless of a route's role array, confirmed by reading that mechanism directly rather
> than assumed. This isn't necessarily wrong (a receptionist may only ever need the MCI activation
> button during a declared disaster, routed from the front desk, and never the clinical board) — but
> it is a real, documentable asymmetry between two screens that share the same underlying
> `emergency` module key, and is flagged here exactly as the brief asked.

All dates on screen show as DD/MM/YYYY. All money shows as ₹.

---

## 1. The header — status bar

A thin dark bar across the top of the module:
- A live clock.
- An **NABH** badge (criteria AAC.1 / COP.3 / COP.13) — informational only, confirming this module
  is in scope for those standards. It does not log anything by itself (see the content note at the
  end of this file).
- **"🚨 Declare MCI"** / **"⚫ Stand Down MCI"** — activates or deactivates Mass Casualty mode for
  the whole department (see Section 6). The button's own label flips depending on whether MCI mode
  is currently active.
- **"📊 Analytics"** — opens a read-only KPI panel (visit counts, triage mix, length-of-stay,
  disposition breakdown, MLC count, revenue for the period). Not a walkthrough target of this file;
  orient yourself to it and move on.
- **"🔴 CODE BLUE"** — pulses continuously. Clicking it opens a confirmation dialog ("Confirm Code
  Blue Alert? This will notify ALL connected staff immediately."); confirming it fires a
  hospital-wide `clinical_alerts` entry and a full-screen red "CODE BLUE ACTIVE" overlay for three
  seconds on your own screen. Only use this for an actual cardiac/respiratory arrest needing the
  whole team — it cannot be un-sent.

---

## 2. The Triage Board

Four columns, left to right: **🔴 IMMEDIATE (P1)**, **🟠 URGENT (P2)**, **🟡 DELAYED (P3)**,
**🟢 MINOR (P4)**. Each patient is a small card showing their name, time since arrival, chief
complaint, and — if applicable — a red **MLC** tag and an amber **"⏰ Reassess"** tag (appears when
a patient has gone past their triage category's safe re-check interval without a disposition).

### Registering a new patient

1. Click **"+ Register Emergency Patient"** above the board.
2. **Arrival Mode** — Walk-in, Ambulance, Referred, Police, or Brought Dead. Choosing Ambulance,
   Referred, or Police opens a second field to name the ambulance/referring hospital/police
   station. Choosing **Brought Dead** changes the rest of the form: triage is skipped, and an amber
   note warns "Patient will be recorded as expired and routed to the mortuary."
3. **Patient Name**, or search by phone/name to link an existing patient record instead of creating
   a new one. An outstanding-balance banner appears automatically if the linked patient has unpaid
   bills.
4. **Age (est.)** and **Gender**.
5. **Chief Complaint** — free text; this also feeds the AI triage suggestion below.
6. **Quick Vitals (optional)** — HR, BP Sys, BP Dia, SpO2, GCS. Optional, but improves the AI
   triage suggestion if you fill them.
7. Optionally click **"🤖 AI Triage"** once you've entered a complaint. It returns a suggested
   priority with a rationale; click **"Accept AI Triage"** to apply it to the **Triage Category**
   field below, or dismiss it and classify manually — the AI suggestion never applies itself.
8. **Triage Category \*** — P1 through P4, required unless Brought Dead was selected.
9. Tick **"Medico-Legal Case?"** if this is a medico-legal case (road accident, assault, poisoning,
   burns, fall, sexual assault, or other circumstances requiring police involvement).
10. Click **"Register & Triage →"** (or **"Record Brought Dead →"**). The patient appears on the
    board immediately. If you ticked MLC, the full **MLC Case Documentation** form (Section 5)
    opens automatically right after — you cannot skip it from this path.

---

## 3. The Patient Workspace

Selecting a patient card opens their workspace in three columns:

- **Left — Timeline**: a read-only strip showing Arrived, Triaged, Doctor seen, Investigation
  (with a 🔴 flag if a lab result is critical), Imaging (same for radiology), and Disposition — plus
  a running "Time in ED" clock that turns amber past 2 hours and red past 4.
- **Centre — clinical entry**: live vitals (BP, Pulse, RR, SpO2, Temp, GCS, with a Save button and
  an auto-computed NEWS2 early-warning badge), Chief Complaint, AMPLE History (Allergies,
  Medications, Past history, Last meal, Events), Working Diagnosis, and the MLC checkbox with its
  four inline fields (Police Station, Officer Name, FIR Number, Injury Type) if MLC is ticked here.
- **Right — Actions**: the buttons that move the patient's care and billing forward (Section 4).

### Actions panel buttons (exact on-screen labels)

- **"🙋 Assign to me"** — only shown if no doctor is assigned yet; assigns you as the treating
  doctor.
- **"AI Triage Assist"** — a second, fuller AI pass once more clinical detail is on record; returns
  differentials, red flags, and a suggested category. Applying its suggestion requires going
  through an **attestation step** ("Apply with Attestation") — you cannot silently accept an AI
  triage change without that extra confirmation screen.
- **"🛏️ Admit to IPD"**, **"🔬 STAT Lab"**, **"🩻 STAT Radiology"**, **"💉 Medications"**,
  **"🗒️ Handover Note"**, **"📝 Consent"**, **"🩸 Blood Request"**, **"📟 Call Specialist"**,
  **"🏥 Refer to OT"** (hidden once the patient is discharged/expired), **"📄 Discharge Summary"**,
  **"🏠 Discharge"**.
- An **"⚑ Other Disposition"** dropdown for LAMA, DAMA, LWBS, Absconded, or Referred Out — each
  needs a confirmation dialog before it closes the visit.
- If MLC is ticked: **"📄 MLC Register"** (opens a read-only summary of the inline fields you
  entered in the centre panel — not the full MLC form; see the content note below) and
  **"📋 Police Intimation"** (prints a Form-4-style letter to hand or fax to the police station —
  see the same note).
- An **"ED Charges"** box showing the casualty fee (bills automatically on discharge/admit/LAMA/
  DAMA) and any itemized charges, with **"+ Add ED Charge"** and **"💰 Collect Deposit"** buttons.

### Discharging a patient

Click **"🏠 Discharge"**. The confirmation dialog shows any outstanding ED bill balance and any
unbilled lab/radiology/pharmacy items from this visit as informational banners (never blocking) —
it also offers a **"📄 Prepare discharge summary first"** shortcut. Confirming closes the visit and
removes the patient from the active board.

---

## 4. Medications and allergy checking

Clicking **"💉 Medications"** opens the ED medication administration record. Enter the drug, dose,
and route; the panel checks the drug name against the patient's AMPLE-history allergies field and
shows a red warning banner if it finds a likely match before you administer. Optionally tick
**"Bill as consumable"** to add it as an itemized ED charge in the same step.

---

## 5. Medico-Legal Case (MLC) documentation

If MLC is ticked **at the moment of registration** (Section 2, step 9), the full **MLC Case
Documentation** form opens immediately after you register the patient. This is the real,
system-tracked record: case type, injury type, incident date/time/place/description, body parts
injured, alleged history, and a dedicated **Police Intimation** block — police station, officer
name/designation, FIR number, intimation mode, who sent it, and a **"Police have been informed"**
checkbox with a timestamp. Saving it generates the hospital's next MLC number automatically and
writes a tracked `mlc_cases` record — the same record the Mortuary & Medico-Legal Staff
(`mortuary-medicolegal-staff.md`) and MRD's MLC Register read from.

---

## 6. Mass Casualty (MCI) mode — orientation only

Clicking **"🚨 Declare MCI"** in the header switches the whole department into surge mode: the
registration form adds a **START Field Triage** row (Immediate/Delayed/Minor/Expectant, mapping to
P1/P3/P4), and an orange banner appears across the top of the module for every ED user until
someone clicks **"⚫ Stand Down MCI"**. This same action is also reachable as its own full screen at
**🚨 MCI / Disaster Response** — that screen's triage zones, P1–P4 surge board, and casualty-count
tracking are a separate module (`/emergency/mci`) with its own role list (see the access-control
note at the top of this file) and are not walked through here; this section only orients you to the
one button that turns the mode on from inside the ED board itself.

---

## Content findings from writing this file

**Two findings — one flagged, one fixed.**

- **Flagged, not fixed — a real gap in when the system-tracked MLC record gets created.** The full
  MLC Case Documentation form (Section 5), which is the only screen that writes a trackable
  `mlc_cases` row with the police-intimation fields the hard 6-hour-intimation rule depends on, is
  only ever opened automatically from the **registration** form — triggered by `onMlcRequired` in
  `src/pages/emergency/EmergencyPage.tsx`, which only fires from
  `src/components/emergency/EmergencyRegistrationModal.tsx`. If a patient's case is only recognised
  as medico-legal *after* registration — a common real-world sequence, since the nature of an
  injury often only becomes clear once a doctor examines the patient — ticking "Medico-Legal Case
  (MLC)" in the centre panel of the Patient Workspace (Section 3) only fills four free-text fields
  on `ed_visits.mlc_details` (police station, officer, FIR, injury type). It never creates an
  `mlc_cases` row and never sets `police_informed`/`police_informed_at`. The **"📄 MLC Register"**
  button in the Actions panel only shows a read-only summary of those same four free-text fields,
  not the real form, and the **"📋 Police Intimation"** button only generates a print-only letter —
  neither one writes to the database. Confirmed by searching the whole codebase for every place
  `MLCDetailsModal` (the only component that inserts into `mlc_cases`) is actually opened from: the
  ED registration flow and one IPD flow (`src/components/ipd/IPDWorkspace.tsx`) are the only two.
  `src/components/mrd/MLCRegisterTab.tsx` only reads the table. This is a genuine content/workflow
  gap, not something this documentation pass fixes — adding a route to the full MLC form from the
  Patient Workspace for a late-flagged case is a real product change, out of the blast radius of a
  documentation-only pass, and is flagged here for Nikhil/Priya to sequence.
- **Flagged, not fixed — the allergy check in Medications is real but narrower than the hard rule's
  spirit.** Section 4's allergy warning is a genuine, un-mocked check (it is not skipped or faked),
  but it is a plain substring match between the drug name you type and the free-text AMPLE
  allergies field for *this visit* — it does not call the shared `src/lib/drugSafetyCheck.ts`
  checker that Pharmacy and OPD prescribing use, does not check drug-drug interactions against
  anything already administered, and does not read a patient's confirmed, structured allergy
  record if one exists outside this visit's AMPLE text. Integrating the shared checker into the ED
  medication panel is a real improvement, not a one-line fix, so it is flagged rather than attempted
  here.
- **Fixed.** `src/components/emergency/EpidemicModeBanner.tsx`'s "Since …" timestamp (shown in the
  epidemic/MCI mode banner) called `toLocaleString()` with no locale argument, which renders in
  whatever locale the browser or OS defaults to rather than the house `en-IN` `DD/MM/YYYY` format
  every other date in this module uses. Now calls `toLocaleString("en-IN")`, matching the rest of
  the module.

Verified: `npx eslint src/components/emergency/EpidemicModeBanner.tsx`,
`npx tsc --noEmit`, and `npm run check:db-contract` all pass with no new findings (this was a
locale-argument-only change — no query, column, or `.from()`/`.rpc()` shape changed).
