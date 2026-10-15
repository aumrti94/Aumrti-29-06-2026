# Doctor — OPD & Consultation Training Manual

## What this role does in the system

As a Doctor working in the OPD (Outpatient Department), your consultation screen is the
**Consultation Workspace**. It opens the moment you select a waiting patient from the OPD Queue,
and everything you record there — history, vitals, diagnosis, prescription, lab and radiology
orders — is saved automatically every few seconds, so you never lose work by switching screens or
being called away mid-sentence.

The workspace is organised into five tabs across the top: **Complaint**, **AI Guidance**,
**Rx & Orders**, **🧪 Reports**, and **History**. You move between them with a single click —
nothing here takes more than 3 clicks from the OPD dashboard.

All dates show as DD/MM/YYYY and all fees show with the ₹ symbol (for example ₹500).

---

## 1. Start a consultation

1. In the left-hand menu, click **OPD Queue**. This opens the OPD screen with the queue of
   today's patients on the left.
2. Click a patient's card in the queue. Their card shows their token number (e.g. "A-7"), name,
   and current status — Waiting, Called, or In Consultation.
3. On the right, the patient's name, UHID, age/gender, blood group and any recorded
   **⚠️ Allergies** appear in the header bar at the top of the Consultation Workspace.
4. Click **"▶ Start Consultation"** in the top-right of this header bar. The patient's status
   changes to "In Consultation" and you are taken into the **Complaint** tab, ready to begin.

   If you need to step away and come back to a patient you already marked complete the same day
   (for example, a report has just come back), reopen their card and click
   **"↻ Resume Consultation"** instead.

---

## 2. Record the complaint and use AI Guidance

### Recording the complaint (Complaint tab)

1. With the consultation started, you are on the **Complaint** tab. At the top is a **Vitals**
   row — type the patient's BP (systolic/diastolic), Pulse, Temp, SpO2, Weight and Height
   directly into the boxes. Anything outside the normal range shown under each field is
   highlighted automatically.
2. Below that, type the **Chief Complaint*** (required — in the patient's own words) and the
   **History of Present Illness** (onset, duration, progression, aggravating/relieving factors).
3. On the right side of the same screen, fill in **General Examination** and
   **Systemic Examination / Clinical Notes**, and record the **Diagnosis** in the diagnosis
   panel (you can add more than one diagnosis here).
4. Further down, fill in **Plan & Investigations** and **Advice & Instructions**, and a
   follow-up date/note if one is needed (e.g. "Follow up with MRI report").
5. You do not need to click a Save button — a "Saving…" indicator and then a green
   "✓ Saved" tick appear in the tab strip automatically, usually within 2–3 seconds of you
   stopping typing, and at least every 30 seconds even if you keep typing continuously.

   You can also dictate instead of typing: tap the microphone/voice button to dictate the
   complaint, history, examination findings, diagnosis and plan, and the fields above fill in
   automatically from your speech.

### Using AI Guidance (AI Guidance tab)

1. Click the **AI Guidance** tab (this only becomes useful once you have entered a Chief
   Complaint).
2. The tab shows an AI-generated **differential diagnosis** list based on the complaint,
   examination notes, history and the patient's vitals and known chronic conditions. Click a
   suggested diagnosis to accept it directly into the Diagnosis field on the Complaint tab.
3. A **Clarifying Questions** card may also appear, suggesting follow-up questions worth asking
   the patient based on what has been recorded so far.

   Every AI suggestion here is just that — a suggestion. Nothing from this tab is added to the
   patient's record, coded, or billed until you actively select it. A diagnosis the AI suggests
   is always marked separately from one you typed or dictated yourself, so your own clinical
   judgement is never silently overwritten.

---

## 3. Write a prescription and place orders

1. Click the **Rx & Orders** tab.
2. To add a medicine, click **"+ Add Drug"**. Type the drug name — it searches your hospital's
   drug master as you type. Fill in Dose, Route, the M-A-E frequency (Morning-Afternoon-Evening,
   e.g. "1-0-1"), Days, and Instructions; Quantity is calculated for you automatically from the
   frequency and days, shown highlighted in amber (you can override it if needed).
3. Every drug you add is checked automatically against the patient's known allergies, their
   other current medicines (interactions), and duplicate therapy. This check can never be
   skipped or bypassed, including for a quick or routine prescription:
   - If the drug is clear, a brief green "✓ No interactions found" banner flashes and it is
     added straight away.
   - If there is an issue, a safety alert pop-up appears immediately, describing the interaction,
     allergy conflict, or duplicate. You must either **"Add Anyway"** or provide a reason and
     confirm an **override** — either way, the decision and your reason are recorded against the
     patient's record. The alert is never shown later or batched with other alerts — you see it
     the moment the system knows.
   - Prescribing an antibiotic asks you to record a short clinical justification first, as part
     of the hospital's antibiotic stewardship programme.
4. Each prescribed drug shows as one compact, directly-editable row (Drug | Dose | Route | M-A-E
   | Days | Qty | Instructions). Click the ✕ on a row to remove a drug.
5. To order lab tests: under **Lab Orders**, type into the **"Search test name..."** box and
   press Enter, or click one of your own saved quick-pick test chips. Selected tests appear in a
   list below with a status chip — **PRESCRIBED** (on your draft only), **AWAITING PAYMENT**, or
   **BILLED & ORDERED** (the patient has paid and the lab has received the order).
6. To order imaging: under **Radiology Orders**, do the same thing in the matching search box on
   the right.
7. Add your discharge advice and a review date under the advice section if applicable (shown
   further down the same tab).

---

## 4. Review a patient's past reports and history

### Reading new results (🧪 Reports tab)

1. Click the **🧪 Reports** tab. If a lab or imaging result has come back since you last looked,
   a green number badge appears directly on this tab in the tab strip, so you never have to
   remember to go check.
2. Results are grouped by what was ordered. Anything still pending shows as such; anything you
   have not yet opened is marked unreviewed until you view it here.
3. You do not need to leave the Consultation Workspace or open the Lab module separately — this
   tab is the result side of the same ordering loop as Rx & Orders.

### Reading a patient's history (History tab)

1. Click the **History** tab.
2. **Chronic Conditions** are shown as editable chips (e.g. Hypertension, Diabetes) — click the
   suggested condition chips or type your own to add one.
3. Below that, **Past Visits** for this patient are listed by date. Click a past visit to expand
   it and see that visit's diagnosis, notes, prescription and advice in full.

---

## 5. Finish the consultation

1. Once you are done, click **"✓ Complete"** in the top-right header bar (this requires that a
   Chief Complaint has been entered). This finalises the encounter, generates the consultation
   charge, and moves the patient out of the active queue.
2. If a report or further action is still needed the same day, you can reopen the same visit
   later with **"↻ Resume Consultation"** rather than starting a fresh one.

---

*This manual covers the Doctor OPD screens as they exist in Aumrti HMS today — tab names,
button labels and the exact safety-check behaviour described above were confirmed directly
against the Consultation Workspace and Rx & Orders source. If anything on your screen looks
different, tell Priya (clinical systems) so the manual can be corrected — never work around a
missing or different safety check yourself.*
