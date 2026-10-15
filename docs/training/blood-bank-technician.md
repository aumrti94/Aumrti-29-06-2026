# Blood Bank Technician — Training Manual

## What this role does in the system

As a Blood Bank Technician (system role: **Blood Bank Technician**), you work in the
**🩸 Blood Bank** module. Its header always shows a live count of available units for every
blood group and Rh combination, colour-coded red (critically low, under 2 units)/amber
(under 5)/green (adequate) — this is the first thing to check at the start of a shift.

All dates show as DD/MM/YYYY. All money (blood product charges that get billed when a unit is
issued) shows with the ₹ symbol and Indian comma grouping.

---

## 1. Register a donor and bring a unit into stock

1. In the left-hand menu, click **Blood Bank**. Click **"Register Donor"** in the top-right (or
   open the **Donors** tab and use the same button there).
2. In the **"Register Donor"** pop-up (step 1 — Personal details): fill in **Full Name \***,
   **Date of Birth**, **Gender**, **Blood Group \***, **Rh Factor \***, **Phone**, **Address**.
   Click **"Next → Screening"**.
3. Step 2 — **Pre-Donation Screening**: enter **Haemoglobin (g/dL)** (must be ≥ 12.5),
   **Weight (kg)** (must be ≥ 45), **BP Systolic** (100–180) and **BP Diastolic** (60–100). If any
   value is outside range, a red **DEFERRED** message appears and you cannot proceed with this
   donor today. Tick **"Separate into components (RBC + FFP + Platelets)"** if the unit should be
   split rather than kept as whole blood, then click **"Next → TTI Results"**.
4. Step 3 — **TTI Screening Results**: for each of **HIV**, **HBsAg**, **HCV**, **VDRL**
   and **Malaria**, click **Non-Reactive** or **Reactive** once the lab result is known.
   - If every test is Non-Reactive, click **"Register Donor & Separate Components"** (or
     **"...& Collect Whole Blood"** if you didn't split it). The donor and their bag(s) are saved,
     each bag gets a unique **Unit Number** and QR code, and the bag(s) show as
     **✓ TTI Clear — Available** in the Donors tab's Recent Blood Bags list.
   - If any test is Reactive, a red warning appears: the donor is **permanently deferred** and the
     bag(s) are saved with status **QUARANTINED** — they cannot be issued to any patient.
5. From the Recent Blood Bags list, click **"Print"** next to any bag to print its physical blood
   bag label (unit number, component, blood group, collection/expiry dates, QR code).
6. To recall donors who are now eligible to donate again, click **"Campaign → Eligible (N)"** at
   the top of the Donors tab, then **"Send WhatsApp to All"** (or message one donor individually)
   from the pop-up that lists them.

---

## 2. Cross-match request and result

1. Click the **Cross-Match** tab.
2. Select the **Patient** from the drop-down (their recorded blood group shows underneath once
   selected).
3. Type or scan the **Unit Number** into the "Unit Number (scan/type)" box and click
   **"Lookup"**. The unit's component, blood group and volume appear underneath.
4. The screen instantly checks ABO/Rh compatibility between the patient and the unit:
   - If **incompatible**, a red **"🔴 ABO INCOMPATIBILITY DETECTED"** box appears explaining
     exactly which part doesn't match — the lab technique and result fields do not even appear,
     and this unit cannot be used for this patient. Pick a different unit.
   - If **compatible**, a green **"✓ ABO & Rh compatible — proceed with lab cross-match"** banner
     appears and the testing fields unlock.
5. Select the **Technique** used (Immediate Spin (IS) / Albumin / Indirect Antiglobulin (IAT) /
   Electronic), then click the matching **Result** button: **"✓ Compatible"**,
   **"✗ Incompatible"**, or **"⚠️ Minor"**. Add any **Notes**, then click
   **"Save Cross-Match Result"**.
   - Saving **Incompatible** automatically quarantines the unit — it can never be issued.
   - Saving **Compatible** automatically reserves the unit for that patient.
   - The system will not let you save a "Compatible" result against a unit that failed the
     ABO/Rh check above — that combination is blocked outright, not just discouraged.
6. The **Recent Cross-Match Log** table at the bottom of this tab shows every result recorded,
   with date/time, for reference.

---

## 3. Issuing a unit

Issuing happens from the **Requests** tab, against a blood request raised for a patient — there
is no separate "Issue" tab; the **Issue Log** tab (Walkthrough 4) is where you look up what has
already been issued, not where you perform the issue.

1. Click the **Requests** tab. If a doctor hasn't already raised a request for this patient, click
   **"Blood Request"** at the top of the module, fill in the **Patient**, **Blood Group**,
   **Rh Factor**, **Component**, **Units Required**, **Urgency** and **Indication**, and click
   **"Submit Request"**.
2. In the **Pending Requests** list on the left, click the patient's request. The right panel
   shows their details and a list of **Available Compatible Units (FEFO)** — units that match by
   ABO/Rh compatibility, soonest-expiring first. An exact blood-group match is highlighted green;
   a compatible-but-not-identical match is highlighted amber.
3. Click **"Reserve"** next to a unit to hold it for this patient — its row then shows an
   **"✓ Issue"** button.
4. Click **"✓ Issue"**. The system hard-blocks the issue unless a **Compatible** cross-match
   record already exists for this exact patient and unit (Walkthrough 2) — if one doesn't, you
   get an error telling you to complete the cross-match first.
5. Once issued, the unit is marked **Issued**, the request is marked **Fulfilled**, and the blood
   product is billed automatically — to the IPD bill for an admitted patient, or as a standalone
   OPD bill otherwise.

---

## 4. Inventory and the issue log

1. Click the **Inventory** tab to see every blood unit in stock as a table, filterable by
   **Component**, **Group**, and **Status** (Available / Reserved / All). Rows are colour-coded —
   red/amber shading for units expiring soon, blue for reserved — and a red banner at the top
   lists any unit expiring within 48 hours (with special, tighter timers for platelets, which
   expire in 5 days).
2. Click the **Issue Log** tab to see every unit already issued: date/time, unit number, patient,
   component, blood group, and who issued it (status shown as **Issued**, **Returned**, or
   **Adverse Event**).
3. If a transfusion reaction occurs, find the issue row and click **"Report Adverse"**, pick the
   **Reaction Type** (Febrile / Allergic / Haemolytic / TRALI / Other) in the pop-up, and click
   **"Report & Alert Team"** — this flags the row red and alerts the transfusion medicine team.
4. If a unit was issued but never transfused, click **"Return"** on its row — this is only allowed
   within 30 minutes of issue (a blood safety rule the screen enforces, not just advises); after
   that the button is unavailable and the unit must be discarded per protocol.

---

*This manual covers the Blood Bank screens as they exist in Aumrti HMS today. If a screen looks
different from what is described here, tell Harish (Blood Bank & Transfusion) so the manual can
be corrected.*
