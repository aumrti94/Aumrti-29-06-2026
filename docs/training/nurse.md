# Nurse — Training Manual

## What this role does in the system

As a Nurse, you work mainly in two screens: the **Nursing** module (your day-to-day task list —
vitals due, medicines due, handover) and the **IPD / Wards** module (the ward's bed map, used to
find a patient and open their full admission record, including their nursing chart).

Every vitals reading and every medicine you give is written to the patient's permanent record the
moment you save it, and every medication administration goes through a mandatory **5 Rights**
check that can never be skipped, including for a routine or repeat dose.

All dates show as DD/MM/YYYY. All vitals and vitals-based scores (e.g. NEWS2) escalate
immediately to a clinical alert if a reading is dangerous — you will see a message on screen the
same moment the result is saved, not at the end of your shift.

---

## 1. Record a patient's vitals

1. In the left-hand menu, click **Nursing**. This opens on the **Tasks** tab by default, showing
   every task due for the current shift across your wards — medicines, vitals checks, and
   handover.
2. Use the **ward** drop-down and the status filter (Overdue / Due Now / Upcoming / Done) at the
   top of the task list to narrow it down if needed.
3. Click a **vitals** task card (marked with the 🫀 icon) for the patient you are about to check.
4. On the right, the patient's name, bed and (if recorded) diagnosis and doctor appear at the
   top. You can tap the microphone (voice dictation) button here to dictate your findings and
   have the vitals and nursing note fields fill in automatically, or type directly into each box.
5. Fill in the vitals grid: **BP Systolic**, **BP Diastolic**, **Pulse**, **Temperature**,
   **SpO2**, **Resp. Rate**. Click **"+ GCS, Urine output, Blood glucose, Pain score"** if you
   need to record any of those as well.
   Any reading entered outside the safe range is highlighted immediately on the same screen.
6. A **NEWS2 Score** box appears automatically once you have entered at least BP, Pulse or SpO2,
   colour-coded green/amber/red. A score of 5 or more shows an on-screen warning that an
   escalation alert will be raised the moment you save.
7. Click **"💾 Save Vitals"**. If any reading is critical, or the NEWS2 score is 5 or higher, a
   clinical alert is raised immediately — this is never delayed or batched, and for a NEWS2 of
   7 or more you are told on screen to call the doctor and request a Rapid Response.

---

## 2. View the IPD nursing station / ward list

1. In the left-hand menu, click **IPD / Wards**. This opens the ward **Bed Map** — every bed in
   the hospital shown as a tile, colour-coded by status (occupied, vacant, reserved, etc.), with
   ward occupancy statistics above it.
2. Click an occupied bed to open that patient's full **IPD Workspace** — their admission record,
   with its own set of tabs (diagnosis, orders, vitals trend, medication, discharge, and more).
3. Inside the IPD Workspace, click the **"🩺 Kardex"** tab. This is the nurse's working view for
   that one patient: device/line bundle checklists (central line, catheter, ventilator, etc. —
   each with its own daily care checklist), the medication administration record (MAR), and the
   vitals trend over time, all in one place.
4. To record a new vitals reading or give a medicine for a patient you found this way, use the
   **Nursing** module's Tasks tab as described in Walkthroughs 1 and 3 — the Kardex tab is for
   reviewing what has already been charted and tracking device days, not for recording a brand
   new entry.

---

## 3. Administer a medication and record it (5 Rights check)

1. In the left-hand menu, click **Nursing**, and stay on the **Tasks** tab.
2. Click a **medication** task card (marked with the 💊 icon) for the dose that is due.
3. On the right, a **5 Rights Verification** checklist appears with five cards, one for each of:
   **Right PATIENT**, **Right DRUG**, **Right DOSE**, **Right ROUTE**, **Right TIME** — each card
   shows the actual value to check against the patient in front of you (e.g. the patient's name,
   or "Oral").
4. Physically check each one against the patient and the medicine in hand, then click each card
   to tick it off. If the patient has a recorded allergy, a red allergy banner is shown above the
   checklist and cannot be dismissed without being read.
5. You cannot click **"GIVEN"** until all five cards are ticked — this is enforced by the screen,
   not left to memory.
6. If the drug is a **high-alert medication**, a warning banner appears and a second nurse must
   confirm a double-check pop-up before the dose can be marked given. If it is an **NDPS**
   (narcotic) drug, dual-nurse verification is similarly required.
7. Once ready, click **"✓ GIVEN"**. This records the dose to the patient's Medication
   Administration Record (MAR) immediately, with your name and the time.
   - If the dose cannot be given as scheduled, click **"⏸ HOLD"** instead and pick a reason
     (e.g. "Patient refused", "Doctor order to hold", "Patient NBM") before confirming.
   - If it must not be given at all, click **"✕ NOT GIVEN"** and record a reason the same way.

---

*This manual covers the Nursing and IPD screens as they exist in Aumrti HMS today. Note: the
drug-administration 5-Rights check described above (at the patient's bedside, when you actually
give the dose) is a different checklist from the one a pharmacist completes before handing the
drug to the ward — see the Pharmacist manual if you need to understand what happens before the
medicine reaches you. If a screen looks different from what is described here, tell Jaya (Nursing
& Care Plans) or Radha (IPD & Ward Management) so the manual can be corrected — never skip the
5 Rights check to save time.*
