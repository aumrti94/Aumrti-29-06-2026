# Pharmacist — Training Manual

## What this role does in the system

As a Pharmacist, your home screen is the **Pharmacy** module. At the top of the screen is a mode
switch with two options:

- **"🏥 IP Dispensing"** — the queue of signed prescriptions waiting to be dispensed, for both
  admitted (IPD) patients and OPD patients whose prescription has not yet been picked up at the
  retail counter.
- **"🛒 Retail Counter"** — a point-of-sale screen for walk-up patients, used for dispensing an
  OPD prescription at the counter and for over-the-counter (non-prescription) sales.

Below the mode switch is a row of tabs: **Dispense**, **Stock**, **Expiry Control**, **Reorder**,
**Returns**, **NDPS Register**, **Reports**.

Every dose you dispense goes through a mandatory **5 Rights** verification before it can leave
the pharmacy — this is the pharmacist's check at the point of handover, separate from (and in
addition to) the nurse's own 5 Rights check when the dose is actually given to the patient at the
bedside. Every NDPS (narcotic) drug additionally requires a second pharmacist's sign-off before
it can be dispensed. All dates show as DD/MM/YYYY and all amounts show with the ₹ symbol.

---

## 1. Dispense an OP prescription

1. In the left-hand menu, click **Pharmacy**.
2. Click **"🛒 Retail Counter"** at the top of the screen to switch into retail mode.
3. Search for the patient by name, phone, or UHID (or scan/enter their details) in the patient
   search box. Once you select them, if they have a prescription signed by a doctor earlier
   today, it loads into the cart for you automatically — you do not need to type it in by hand.
   - If that prescription has already been dispensed once today, you are told so on screen
     ("This prescription has already been dispensed") instead of loading it a second time.
4. Review the cart — drug name, quantity, batch and price per item. Use **Drug Search** to add
   anything further needed for this visit that was not on the prescription (e.g. an
   over-the-counter item the patient also wants).
5. Apply a discount if applicable (percentage or fixed amount).
6. Proceed to payment, collect the amount shown, and complete the sale. The bill, the stock
   deduction, and (for any NDPS/Schedule drug in the cart) the NDPS register entry are all
   recorded together when the sale is completed.

---

## 2. Dispense for an admitted (IPD) patient

1. In the left-hand menu, click **Pharmacy**.
2. Make sure **"🏥 IP Dispensing"** is selected at the top (this is the default mode), and click
   the **Dispense** tab if you are not already on it.
3. On the left, the **prescription queue** lists every patient with drugs waiting to be
   dispensed — admitted patients show their ward and bed number; OPD patients awaiting pickup do
   not. Click a patient's row to open it.
4. The centre panel shows that patient's drug table: Drug Name, Prescribed quantity, Dispense
   Qty, Batch, MRP, Stock remaining, a **5-Rights** checkbox column, and Status. The patient's
   known allergies are shown in a banner at the top, and any drug that matches a listed allergy
   is highlighted in the table.
5. For each drug row, check (and adjust if needed) the **Dispense Qty** and the **Batch** — the
   system auto-selects the batch expiring soonest (FEFO), but you can choose a different one
   from the drop-down if needed.
6. Click the **5-Rights** checkbox icon on a drug's row. A panel slides up from the bottom of the
   screen titled **"✅ 5-Rights Verification — [drug name]"**, with five cards: **Right
   PATIENT**, **Right DRUG**, **Right DOSE**, **Right ROUTE**, **Right TIME** — each showing the
   actual value to check. Tap each card to verify it in turn.
   - If the drug is NDPS (narcotic), a **"2nd Pharmacist"** drop-down appears in this same panel
     — you must select a second, different pharmacist before you can confirm.
   - Click **"All 5 Rights Verified"** (or **"...+ 2nd Pharmacist"** for an NDPS drug) once all
     five cards are ticked. This cannot be confirmed with any card left unticked.
7. Repeat for every drug on the prescription. Once every row shows its 5-Rights check complete,
   the **"Dispense All"** button at the bottom of the screen becomes active.
8. Click **"Dispense All"**. Stock is deducted from the selected batches, and any NDPS drug gets
   an entry written to the NDPS Register automatically, alongside your name and the
   second-pharmacist sign-off.
   - If your hospital requires **payment before handover** for pharmacy, this button instead
     reads **"Send to Counter"** — clicking it prices and charges the drugs without removing
     anything from the shelf yet. Once the attendant has paid at the billing counter, come back
     to the same screen and click **"Confirm Dispense"** to actually hand the drugs over
     (this is the step that deducts stock and completes the NDPS register entry).
9. To record drugs being handed back by the ward instead of dispensed (e.g. a changed order), use
   the **"Return Drugs"** button at the bottom of this same screen rather than the general
   Returns tab described below — it applies the correct dual sign-off for an admitted patient's
   NDPS drugs.

---

## 3. Handle a drug return

Use this for drugs already dispensed (to either an OPD or an admitted patient) that are coming
back — unused, excess, wrong drug, patient discharged, and so on.

1. In the left-hand menu, click **Pharmacy**, then click the **Returns** tab.
2. The screen lists everything dispensed in the last 30 days that can still be returned, newest
   first — each row shows the drug, patient, date dispensed, and quantity. Rows tagged **IPD**
   are for admitted patients; rows tagged **Bill** are linked to a specific bill that a credit
   note can be raised against.
3. Click a row to expand it.
4. If the drug is tagged **NDPS**, the screen tells you to use the **"Return Drugs"** option
   inside the Dispense workspace instead (Walkthrough 2, step 9) — that path has the mandatory
   dual sign-off this tab does not.
5. Otherwise, fill in:
   - **Return Qty** (up to the quantity originally dispensed)
   - **Reason** — choose from Unused / Not needed, Excess dispensed, Patient discharged,
     Physician order changed, Wrong drug dispensed, Adverse reaction, Prescription changed,
     Expired drug, or Other.
   - **Stock Disposition** — whether the returned stock goes back onto the shelf
     ("Returned to Stock") or must be quarantined/destroyed (this option only appears if you
     have the extra permission for it).
6. If the dispensed item was linked to a paid bill, a preview shows the credit note amount that
   will be raised automatically.
7. Click **"Confirm Return"**. The stock disposition you chose is applied, and if a bill was
   linked, the credit note (or refund, if the bill was already paid) is created at the same time
   — you do not need to go to Billing separately to adjust it.

---

*This manual covers the Pharmacy screens as they exist in Aumrti HMS today. One point worth
flagging: the on-screen "5-Rights Verification" panel described in Walkthrough 2 is the
pharmacist's own check at the point of dispensing — it is a different checklist, in a different
module, from the nurse's bedside 5-Rights check described in the Nursing manual; both exist and
neither replaces the other. If a screen looks different from what is described here, tell Suma
(Pharmacy & Formulary) so the manual can be corrected.*
