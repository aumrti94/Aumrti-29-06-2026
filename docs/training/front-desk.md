# Front Desk / Receptionist — Training Manual

## What this role does in the system

As Front Desk staff (system role: **Receptionist**), you are the first screen a patient's
information passes through. You:

- Register new patients and keep their basic details up to date.
- Book appointments against a doctor's available slots.
- Check patients into the OPD queue — as a walk-in, or by checking in a patient who already
  has a booked appointment — and collect the consultation fee.

Everything you create here — the patient record, the appointment, the OPD token and bill — is
linked together automatically, so the doctor, the pharmacy and the billing desk all see the same
patient without re-typing anything.

All dates on your screen show as DD/MM/YYYY. All money amounts show with the ₹ symbol and Indian
comma grouping (for example ₹1,100).

---

## 1. Register a new patient

Use this the first time a patient visits the hospital, or any time you need to add someone who
does not already have a record.

1. In the left-hand menu, click **Patients**. This opens the **Patient Registry** screen — a
   table of every patient already registered at your hospital.
2. Click the **"Register New Patient"** button in the top-right corner of the screen.
3. A pop-up titled **"Register New Patient"** opens. Fill in:
   - **Full Name** (required)
   - **Phone**, **DOB** (date of birth) — or just **Age** if the exact date of birth is not known
   - **Gender** — tap Male / Female / Other
   - **Blood Group** — tap one of the blood-group buttons (A+, A−, B+, B−, AB+, AB−, O+, O−)
   - **Patient Category** — tap General, BPL, CGHS, ECHS, PM-JAY, ESI, Insurance, or Medical Aid.
     Picking CGHS, ECHS or PM-JAY opens an extra box for the beneficiary/card number.
   - **Address**
   - **Allergies** and **Chronic Conditions** (free text, e.g. "DM, HTN")
   - **Insurance / TPA ID** and **ABHA ID** (both optional). If you enter an ABHA ID, click the
     **"Verify"** button next to it — a green "Verified ✓" badge confirms it is valid.
   - **Aadhaar ID** (optional). Type the 12 digits — the screen auto-formats it as
     XXXX-XXXX-XXXX. It is encrypted the moment you save and is never shown in plain text again
     anywhere in the system.
   - **Referral Source** (optional) — type who referred the patient, or click
     **"+ Referral Doctor"** to add a brand-new referring doctor to the system first.
   - **Emergency Contact Name** and **Emergency Contact Phone**
4. Tick the consent checkbox at the bottom of the form. This records the patient's consent to
   their data being collected and used for treatment, billing and regulatory compliance, as
   required under the Digital Personal Data Protection Act, 2023 (DPDP). You cannot save the
   form without ticking this box.
5. Click **"Register Patient →"**.
6. **If** your hospital charges a registration fee, a **"Collect Registration Fee"** screen
   appears next. The fee amount is shown read-only (you cannot edit it). Select the
   **Payment Mode** (💵 Cash / 📱 UPI / 💳 Card), type a transaction reference if it is UPI or
   Card, and click **"Pay ₹[amount] & Finish →"**. You can also click **"Skip / collect later"**
   to finish registration without collecting the fee now.
   **If** your hospital does not charge a registration fee, the patient is saved immediately —
   skip to step 7.
7. A **"Registration Complete"** receipt appears, showing the Bill No. (if a fee was collected),
   the patient's name, and their new Hospital ID (UHID) — a unique number generated automatically
   for every patient. Click **"Print Receipt"** to hand the patient a printed slip, or
   **"Done"** to close the window.

---

## 2. Book an appointment

Use this when a patient — on the phone, or standing in front of you — wants a slot with a
doctor on a future date, rather than joining today's walk-in queue.

1. In the left-hand menu, click **Appointment Scheduling** (calendar icon).
2. On the left side of the screen, you see the list of doctors for the selected date, each
   showing how many slots are Open, Partial (some patients booked, more room left) or Full.
   Click a doctor's name card to select them.
3. On the right, that doctor's time slots for the day appear as a grid of colour-coded boxes:
   green = **Open**, amber = **Partial**, red = **Full**, grey = **Blocked**. Use the date field
   at the top of the screen to move to a different day first, if needed.
4. Click an open (green) or partially-booked (amber) slot. A pop-up titled **"Book Appointment"**
   opens, with the doctor's name, date and time already filled in for you.
5. Under **"Search Patient (Name, Phone, or UHID)"**, start typing. If the patient already has a
   record, click their name in the results list that appears below the search box. If they are
   new, leave the search box and type their **Full Name**, **Age** and **Gender** directly; click
   **"+ Add more details (optional)"** if you also want to record DOB, blood group, address or
   known allergies at this point.
6. For a new patient, tick the consent box (the blue box reading "Patient consents to collection
   and processing of personal and health data... Digital Personal Data Protection Act, 2023").
   This step does not appear for a patient you selected from search, since their consent is
   already on file.
7. Choose the **Priority** and **Visit Type** if relevant, then click **"Book Appointment"** at
   the bottom of the pop-up. The slot is now booked for that patient, and they receive a WhatsApp
   confirmation automatically if a phone number is on file.

---

## 3. Check a patient into the OPD queue

A patient only gets a token — and only then becomes visible to the doctor — once this step is
done and the consultation fee is settled.

### A. Walk-in patient (no appointment booked)

1. In the left-hand menu, click **OPD Queue**.
2. In the OPD Queue panel on the left of the screen, click **"+ Register Walk-in"** at the
   bottom.
3. A **"Quick Registration"** pop-up opens. Search for the patient by name, phone or UHID in the
   search box, and click their name if found. If they are new, type their **Full Name**, **Age**
   and **Gender** (click **"+ Add more details (optional)"** for DOB, blood group, address and
   known allergies).
4. Choose the **Department** and **Doctor** from the two drop-downs. (A full-registration link —
   "Need full registration? →" — is also offered here if the patient needs the complete form
   from Walkthrough 1 instead.)
5. Pick the **Priority** (Normal / Urgent / Elderly / Pregnant / Disabled) and **Visit Type**
   (New / Revisit / Follow-up / Emergency). If a possible revisit is detected automatically for
   an existing patient, a suggestion box appears — click **"Link Visit"** to confirm it is the
   same problem (this can apply a discounted follow-up fee) or **"Dismiss"** if not.
   If this is a **Medico-Legal Case**, tick the **"Medico-Legal Case (MLC)"** box and type the
   police station name — the screen reminds you that police must be informed within 24 hours.
6. Click **"Proceed to Payment →"**.
7. On the **"Collect Consultation Fee"** screen, the fee is shown read-only — you cannot edit
   it, by design, so the amount cannot be changed at the counter. Select the **Payment Mode**
   (💵 Cash / 📱 UPI / 💳 Card) and enter a transaction reference for UPI or Card.
8. Click **"💳 Pay ₹[amount] & Issue Token →"**. The system allocates the next token number for
   that doctor (e.g. "A-7") and the patient appears in the OPD Queue list, status "waiting".
9. On the receipt screen that follows, click **"Print Receipt"** to hand the patient their token
   slip, or **"Done"** to close.

If the same patient already has an active token for today, the system stops you with a warning
("Patient already in queue today") before a second bill can be created by mistake — read it
before choosing "Register Anyway".

### B. Patient who already has a booked appointment and has now arrived

1. In the left-hand menu, click **Appointment Scheduling**, and select the doctor as in
   Walkthrough 2.
2. At the top of the right-hand panel, click **"Queue"** (next to "Slots") to see that doctor's
   booked appointments for the day.
3. Find the patient's row and click **"Arrived"**.
4. Once marked arrived, an **"Issue Token"** button appears on the same row — click it. This
   opens the same fee-collection screen described in Part A, step 7 above. Collect the fee and
   click **"Pay & Issue Token"** to generate the patient's OPD token number.

   Note: the **"Issue Token"** button only appears after you have clicked **"Arrived"** — if you
   don't see it, click Arrived first.

---

*This manual covers the Front Desk / Receptionist screens as they exist in Aumrti HMS today.
Screens are reviewed periodically — if a button or screen described here looks different on your
system, tell your supervisor so the manual can be corrected.*
