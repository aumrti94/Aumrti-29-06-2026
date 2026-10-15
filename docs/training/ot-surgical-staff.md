# OT & Surgical Staff — Training Manual

## What this role does in the system

As OT (Operation Theatre) staff — scrub nurse, OT assistant, or anaesthetist — you work in the
**Operation Theatre** module. It has three parts on screen at once: the **OT Schedule** on the
left (which rooms are booked, and when), the **case workspace** in the middle (everything about
the currently selected case), and an **OT Info** panel on the right (today's case list, AI
utilisation/cancellation insights).

> **Before you start — a note on login roles.** Aumrti does not have a separate "OT Technician" or
> "Scrub Nurse" login role. The OT module is reachable by accounts set up with the role **Doctor**,
> **Nurse**, or **Super Admin** — your hospital's admin assigns OT staff one of those roles
> depending on their qualification (surgeons/anaesthetists as Doctor, scrub/OT nurses as Nurse).

All dates show as DD/MM/YYYY and times as 24-hour. Money on the Billing tab shows with the ₹
symbol and Indian comma grouping.

---

## 1. OT scheduling / booking a case

1. In the left-hand menu, click **Operation Theatre**. The **OT Schedule** panel on the left shows
   today's cases as a colour-coded day timeline, grouped by room (use the **OT ROOM** drop-down
   above it to filter to one room, or leave it on "📋 All Rooms").
2. Click **"+ Book OT"** at the top of the schedule panel (or click directly on an empty slot in
   the timeline, which pre-fills the time).
3. In the **"Book OT Slot"** pop-up, search for and select the **Patient**, then fill in:
   **Surgery Name**, **Category** (General / Orthopaedic / Gynaecology / Urology /
   Cardiothoracic / Neurosurgery / ENT / Ophthalmology / Paediatric / Plastic / Emergency /
   Endoscopy / Other), **Case Type** (Elective / Emergency / Add-on), **Date**, **OT Room**,
   **Start Time** and **Duration**, **Surgeon**, and optionally **Anaesthetist** and
   **Anaesthesia Type**.
4. If the time/room you picked overlaps an existing booking, a warning banner shows exactly which
   case it conflicts with — change the time or room before continuing.
5. Click **"📅 Confirm OT Booking"**. The case now appears on the schedule with status
   **Scheduled**. For major surgery categories (cardiac, ortho, neuro, abdominal, vascular,
   thoracic, liver, transplant), the system automatically raises a pre-operative blood request to
   the Blood Bank.
6. Use the **Day / Week / Month** toggle at the top of the schedule panel to see further ahead;
   clicking any case in the Week or Month view jumps straight to that day.

---

## 2. Pre-op checklist and starting the case

Aumrti's pre-op checklist is the **WHO Surgical Safety Checklist**'s **Sign In** phase, completed
in the case workspace itself (not a separate ward-side pre-op form) — together with the
**Pre-Anaesthesia Check (PAC)** gate described below.

1. Click a case on the schedule to open it in the middle workspace. It opens on the
   **WHO Checklist** tab, split into three columns: **✅ SIGN IN** (before anaesthesia
   induction), **⏱️ TIME OUT** (before skin incision), and **📋 SIGN OUT** (before the patient
   leaves OT).
2. Tick off each Sign In item (patient identity, site marked, consent signed, anaesthesia safety
   check, pulse oximeter functioning, known allergies, difficult airway risk, blood loss risk) as
   you confirm it against the patient in front of you.
3. Once every Sign In item is ticked, click **"✓ Sign & Complete ✅ SIGN IN"**. Sign on the
   pop-up signature pad and click **"Confirm & Complete"** — this locks that phase and timestamps
   who completed it.
4. Before the case can move to **Confirmed**, the system checks that **PAC (Pre-Anaesthesia
   Check)** has been cleared. If it has not, a banner appears: tick **"Mark PAC Cleared &
   Confirm"** (optionally adding ASA grade or precautions in the notes box) once the anaesthetist
   has evaluated and cleared the patient.
5. Click **"Confirm Case"** in the case header. If the assigned surgeon has no active clinical
   privilege recorded, a warning appears and you must enter an override reason before the case
   can proceed — this is logged against the case.
6. When the patient and team are ready, click **"Start Case ▶"** in the case header. This records
   the actual start time and begins the live case timer on the **Case Details** tab.

---

## 3. Intra-operative documentation

There is no single "intra-op note" form for the surgeon's operative steps — what exists today is
split across two tabs:

1. The **Case Details** tab shows a live case timer (turns amber with a "⚠️ Over estimated time"
   warning if the case runs past its estimated duration), the patient's blood group, allergies and
   chronic conditions, the booked surgery details, and a free-text **Notes / Special
   Instructions** box you can update at any time during the case.
2. The **Anaesthesia** tab (filled in mainly by the anaesthetist) is where intra-operative
   anaesthesia is recorded: ASA class, Mallampati score and airway assessment, anaesthesia
   technique, each drug given (checked for interactions/allergies before it can be added),
   intra-operative vitals readings, fluid in / urine out / blood loss, and any complications —
   signed off at the end by the consultant anaesthetist.
3. Continue to tick off the **⏱️ TIME OUT** checklist on the WHO Checklist tab during the
   procedure (team introduced, patient/procedure/site confirmed, imaging displayed, antibiotics
   given, anticoagulation, equipment issues) and sign it the same way as Sign In.

If your hospital needs a structured, step-by-step operative note (what was found, what was done,
layer by layer) beyond these two tabs, that does not exist in the product today — flag this to
Nikhil rather than treating the Notes box as a substitute.

---

## 4. Implants, instrument counts, and the post-op note

1. Before the case can close, complete the **📋 SIGN OUT** checklist (procedure recorded,
   instrument count, swab count, specimen labelled, equipment issues, recovery handover). The
   **Instrument / Sponge / Needle Count** boxes directly below the checklist require an opening
   and closing count for each; if they don't match, you must type a reason before that item can
   be ticked.
2. When the patient is ready to leave OT, click **"End Case ■"** in the case header. This opens
   the **End Case** pop-up — this is the closest thing to a structured post-op note:
   - **Post-op Diagnosis** (free text)
   - **Case Outcome** — Completed Successfully / Completed with Complications / Abandoned /
     Converted (choosing "Completed with Complications" opens a box to describe them)
   - **Implants / High-Value Consumables** — you must declare **Yes** or **No**. If Yes, search
     the inventory or type the item manually (Item name, Manufacturer, Lot/Batch no., Expiry
     date, **CDSCO registration # (required)**, Cost ₹, Qty) and click **"+ Add to list"** for
     each one; if No, tick the confirmation box that none were used. You cannot close the case
     without completing this declaration.
3. Click **"✓ End Case & Close OT"**. The system blocks closing if the WHO Checklist's three
   phases are not all complete (unless a documented exception reason was entered), or if the
   anaesthesia record has not been signed by the consultant. Once closed, the case status becomes
   **Completed** and OT charges (room, implants, surgeon/anaesthesia fees) are billed
   automatically — to the admission bill for an IPD patient, or flagged for a manual bill for an
   OPD/daycare procedure.
4. After the case is closed, record recovery scoring on the **PACU** tab: score the patient on
   each of the five Aldrete criteria (Activity, Respiration, Circulation, Consciousness, SpO₂),
   add any notes, and click **"Record Score"**. The patient is considered ready for discharge from
   PACU once two consecutive scores of 9 or more, at least 30 minutes apart, have been recorded —
   the screen shows a green **"Discharge Criteria Met"** banner at that point.

---

## 5. OT register

**There is no dedicated "OT Register" screen in Aumrti today.** What you have instead:

- The **OT Schedule** panel's **Week** and **Month** views, which list every booked/completed
  case in that range, filterable by room.
- Each individual case's **Case Details**, **Implants & Consumables**, and **Billing** tabs,
  which together hold the data a statutory OT register would need (date, patient, surgeon,
  procedure, duration, implants with CDSCO numbers, swab/instrument counts, outcome) — but not as
  one combined, exportable list.

If your hospital's NABH/statutory audit needs a single OT register export (date, case number,
surgeon, procedure, start/end time, swab count, complications, in one sheet), that is not built
yet — flag it to Nikhil rather than assuming it exists under a different tab name.

---

*This manual covers the Operation Theatre screens as they exist in Aumrti HMS today. If a screen
looks different from what is described here, tell Karthik (OT & Anaesthesia) so the manual can be
corrected.*
