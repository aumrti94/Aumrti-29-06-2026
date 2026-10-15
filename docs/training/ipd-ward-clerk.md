# IPD Ward Clerk — Training Manual

## What this role does in the system

As a Ward Clerk / admission-desk clerk, your job is the **logistics** side of a patient's inpatient
stay: getting them into a bed, moving them if their clinical team needs a different bed or ward,
and handling the paperwork once the clinical and billing teams have signed off a discharge. This
manual covers **only** that clerical slice of the **IPD / Wards** module.

It does **not** cover: vitals, medications, ward rounds, nursing charting, or writing/signing a
discharge summary — those are clinical documentation and are covered in `nurse.md` and in the IPD
extension of `doctor-opd.md`. Where this manual reaches the edge of your job and a doctor's,
pharmacist's, or billing executive's job begins, it says so explicitly.

> **Before you start — a real access gap, not a training note.** Today, the **IPD / Wards**
> module (where bed assignment, transfer, and the admission/discharge screens described below
> actually live) is only reachable by accounts with the role **Doctor**, **Nurse**, or
> **Super Admin** — there is no **Receptionist** or clerical role on that screen's access list.
> The front desk's own **Receptionist** role (`front-desk.md`) can trigger "Admit to IPD" from
> inside an OPD consultation, but cannot open the IPD Bed Map itself to assign a bed, transfer a
> patient, or process a discharge the way this manual describes. **If your hospital intends a
> dedicated ward-clerk login for this work, flag it to Nikhil/Priya before go-live** — as it
> stands, whoever does this job needs a Nurse or Doctor login to get into the screen at all. The
> walkthroughs below describe the actual screen so the gap can be reported accurately, not to
> imply it is already usable by a clerk account.

All dates show as DD/MM/YYYY.

---

## 1. Admit a patient

1. In the left-hand menu, click **IPD / Wards**. This opens the **Bed Map** — every bed shown as
   a tile, colour-coded 🟢 Free / 🔴 Occupied / 🟡 Cleaning / 🔵 Reserved, with an occupancy
   summary bar above it.
2. Click **"+ New Admission"** at the bottom of the Bed Map (or click directly on a 🟢 free bed
   tile, which pre-fills that bed). This opens the **"New Admission"** pop-up — a 4-step wizard.
3. **Step 1 — Patient**: search by name, phone, or UHID and click the patient in the results. If
   they're not found, click **"Not found? Register new patient →"** and fill in Full Name, Phone,
   Age, Gender, then **"Register Patient"**. Click **"Next →"**.
4. **Step 2 — Admission Details**: fill in **Admission Type**, **Department**,
   **Admitting Doctor \***, **Primary Diagnosis**, and **Select Bed \*** (skip this if you opened
   the form from a specific bed tile). Choose **Insurance** and **Billing Payer**. Tick the
   mandatory **Allergy Verification** box after asking the patient/attendant about allergies —
   you cannot proceed without it. Fill in **Handover Notes for Nursing** (pre-filled from the
   patient's last OPD visit where available — review and update it, don't just accept it blindly),
   **Expected Discharge** (optional), and **Dietary Instruction**. If this is a
   **Medico-Legal Case (MLC)**, tick that box and type the **police station name** — the screen
   reminds you police must be informed (and a second checkbox, "Police have actually been
   informed", must be ticked separately once that has genuinely happened; ticking the MLC box
   alone does not mean police were notified). Click **"Next →"**.
5. **Step 3 — Estimate & Deposit**: enter **Estimated Stay (Days)**, **Estimated Amount (₹)**,
   **Deposit Required (₹)**, optionally a **Package**, and **Remarks**. This step also carries
   the mandatory **MUST Nutritional Screening** (BMI, recent weight loss %, acute illness
   checkbox) — the screen calculates a Low/Medium/High risk score automatically as you fill it
   in. Click **"Next →"**.
6. **Step 4 — Review**: check the summary (patient, type, bed, doctor, diagnosis, insurance, diet,
   estimate, MUST score) and click **"✓ Confirm Admission"**.
7. On the success screen, click **"🖨️ Print Admission Slip"** to hand the patient/attendant a
   printed slip, and **"📋 Get Consent Signed (Recommended)"** if informed consent has not already
   been captured. Click **"Close"** to finish.

---

## 2. Bed assignment, reservation, and transfer

### Assigning a bed (walk-in admission)

Clicking a 🟢 free bed tile on the Bed Map and completing the admission wizard above **is** how a
bed gets assigned — there is no separate "assign bed" step once Walkthrough 1 is done.

### Reserving a bed in advance

1. On the Bed Map, click **"🔵 Reserve a Bed"**.
2. In the **"Reserve Bed"** pop-up, search for and select the **Patient**, pick the **Bed** (skip
   if you opened it from a specific tile), optionally the **Doctor**, the **Planned Admission
   Date \***, and any **Notes**, then click **"Reserve Bed"**. The bed tile turns 🔵 and shows
   "Rsv".
3. When the patient actually arrives, click the 🔵 reserved bed tile. A pop-up shows the
   reservation (patient name, planned date, doctor) with two buttons: **"✅ Check In Patient"**
   (opens the admission wizard pre-filled with that bed) or **"✕ Cancel Reservation"** (frees the
   bed back to available).

### Transferring a patient to a different bed or ward

1. Open the patient's admission (click their occupied bed on the Bed Map).
2. Click **"🔁 Transfer"**.
3. In the **"Transfer Patient"** pop-up, select the **Destination Ward**, then the
   **Available Bed** within it, and type a **Reason for Transfer** (e.g. "Upgrade to ICU,
   step-down to general ward..."). Click **"Confirm Transfer"**.
4. The patient's admission moves to the new bed immediately. The bed they vacated does **not**
   go straight back to available — it turns 🟡 **Cleaning** and only returns to the available
   pool once Housekeeping marks that cleaning task done (so do not expect to re-assign a
   just-vacated bed until Housekeeping has cleared it).

---

## 3. Discharge — where the clerk's job starts and stops

The discharge workflow itself (Medical Clearance by the doctor, Pharmacy Clearance by the
pharmacist, Billing Settlement by billing, and writing/signing the Discharge Summary) is **not**
clerical work, and this manual does not walk through it — see `doctor-opd.md`'s IPD extension and
`nurse.md` for those steps. Your part is at the two ends of that workflow:

1. **Starting the clock.** Once the attending team decides the patient is ready to go home, click
   **"🏠 Initiate Discharge"** in the patient's IPD workspace. This starts the discharge TAT
   (turnaround time) clock and notifies Billing, Pharmacy and Nursing that clearances are needed.
   You will see this button is blocked with an error ("Cannot discharge — MLC details not
   documented") if an MLC admission's medico-legal details were never completed — if that happens,
   it needs a doctor/nurse to complete the MLC Details form before discharge can proceed; it is
   not something you can fill in from this screen.
2. **Handing over the paperwork.** Once all clearance steps on the **Overview** tab show complete
   (Clinical / Billing / Pharmacy Clearance, then Discharge Summary) and the doctor has signed the
   discharge summary, your job is to print and hand over the exit paperwork: use the
   **🖨️ printer icon** in the patient header to print the **Case Sheet**, and the **document icon**
   next to it (when an estimate exists) to print the admission **Estimate**. The signed Discharge
   Summary itself is generated and printed from inside the Discharge Summary step by the doctor —
   you hand the printed set to the patient/attendant, not generate it yourself.
3. Once the admission is fully discharged, its bed turns 🟡 **Cleaning** on the Bed Map, the same
   as after a transfer — it only becomes available again once Housekeeping completes the cleaning
   task for it.

---

*This manual covers the clerical/logistics parts of the IPD / Wards screens as they exist in
Aumrti HMS today — admission, bed reservation/transfer, and the paperwork hand-off at discharge.
The access gap noted at the top (no clerical role can currently open this module) is the most
important thing to resolve before relying on this manual for a live ward-clerk role. If a screen
looks different from what is described here, tell Radha (IPD & Ward Management) so the manual can
be corrected.*
