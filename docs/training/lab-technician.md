# Lab Technician — Training Manual

## What this role does in the system

As a Lab Technician, your home screen is the **Laboratory (LIS)** module. It is organised into
10 tabs across the top of the screen:

**🔬 Worklist**, **💉 Collection**, **⏳ Pending from OPD**, **🕒 Pay Later**, **📊 QC Dashboard**,
**🔧 Calibration (NABL)**, **🧫 Histopathology**, **⏱️ TAT**, **🔗 External Referrals**, and
**⚙️ Analyzer Interface**.

(The brief this manual was built from named the sixth tab "Calibration/NABL" — on screen it
reads **"🔧 Calibration (NABL)"**; otherwise all 10 tab names match exactly.)

Day to day you will mostly live in three of these: **Worklist** (to find and process a sample),
**Collection** (to physically collect and receive samples), and **🔗 External Referrals** (for
tests sent out to another lab). All dates show as DD/MM/YYYY.

---

## 1. Find and process a pending sample (Worklist)

1. In the left-hand menu, click **Laboratory (LIS)**. This opens on the **🔬 Worklist** tab by
   default.
2. On the left, the **Lab Queue** panel lists every order for the selected date, with filter
   chips along the top: All, Pending, In Process, Pending Validation, Ready, Completed. Orders
   are colour-flagged by priority (STAT orders are highlighted).
3. Click an order in the queue list. The order opens in the centre panel, with the patient's
   details on the right.
4. If the order's status is still "ordered" (sample not yet collected), click
   **"📦 Mark Collected"** in the header of the order — or go to the **Collection** tab instead
   (Walkthrough 2 below) if you are physically at the bedside/counter right now.
5. Once a sample is collected and received, its individual tests appear as rows for you to enter
   results against (see Walkthrough 3).
6. A new order can also reach this worklist directly from a doctor's prescription once it is
   paid for — you do not need to create it yourself in that case. If you do need to create one
   manually (a walk-in direct-test patient, or adding a test to an existing order), click
   **"+ New Order"** in the Lab Queue panel, search for the patient, and add the tests required.

---

## 2. Collect a sample

1. In the left-hand menu, click **Laboratory (LIS)**, then click the **💉 Collection** tab.
2. The screen opens on the **⏳ To Collect** tab — every sample waiting to be drawn, sorted by
   priority. (The other tabs here are **📦 Collected**, **📥 Received**, and **🚫 Rejected**.)
3. Find the patient's row. Click **"Label"** first if you need to print a barcode label for the
   sample tube.
4. Click **"Collect"** on their row. A **two-identifier confirmation** pop-up appears, showing
   the patient's name and UHID — check this against the patient and the tube in your hand, then
   confirm. This step cannot be skipped or clicked through without seeing the name and UHID.
5. The sample moves to the **📦 Collected** tab. When it physically reaches the lab bench, find
   it there and click **"Receive"** — it moves to **📥 Received**.
6. From **📥 Received**, click **"Process"** to mark that testing has begun. The sample (and its
   order) is now ready for result entry in the Worklist.
7. If a sample is unsuitable (haemolysed, clotted, insufficient quantity, wrong container, etc.),
   click **"Reject"** instead of Collect/Receive/Process at any stage before results are entered.
   Choose a rejection reason from the list, add a note if needed, and click
   **"Reject & Queue Recollection"** — this automatically queues a fresh sample to be drawn.

---

## 3. Enter a result

1. In the **🔬 Worklist** tab, click the order you are working on (it should already show as
   collected and received/processing — see Walkthrough 2 if not).
2. Each ordered test appears as a row, grouped by category, with a **Result Input** box.
   - For a numeric test (e.g. Haemoglobin), type the value directly into the number box and
     click away (the result saves automatically on blur — there is no separate Save button per
     row).
   - For a qualitative test (e.g. a rapid antigen test), choose from the drop-down: Positive,
     Negative, Detected, Not detected, or Equivocal.
3. As soon as a value is entered, the system flags it automatically against the reference range
   for that test and the patient's age/gender (High, Low, or a specific abnormal flag).
4. **If a result is a critical value** (dangerously high or low), a red banner appears on that
   row immediately, saying **"🚨 Critical Value — Notify Treating Doctor Immediately"**. You must
   tick **"I have notified the treating doctor about this critical value"** before you can click
   **"✓ Acknowledge & Continue"** — this cannot be bypassed or left for later.
5. Once every test on the order has a result, click **"✓ Validate & Release"** at the top of the
   screen to finalise and release the report.
   - For tests that require a second, qualified sign-off (e.g. microbiology/culture reports),
     you will instead see **"⏳ Submit for Validation"** — click it to hand the order to a
     pathologist or doctor, who then clicks their own **"✓ Validate & Sign"** button to release
     it. You do not release a dual-validation report yourself.

---

## 4. Handle an external referral

Use this when a test your hospital cannot perform in-house is sent to an outside reference lab.

1. In the left-hand menu, click **Laboratory (LIS)**, then click the **🔗 External Referrals**
   tab.
2. Click **"New Referral"** (or **"Create First Referral"** if the list is empty).
3. Fill in the referral details in the pop-up — the outside lab's name, the patient, and the
   tests being sent out — and save it. It appears in the list with status **"Pending"**.
4. As the sample physically moves, click the **"→ Sample Sent"** button on that referral's row
   to advance its status. It then shows **"→ Report Awaited"**, and finally, once the outside
   lab's report has arrived and you have entered/uploaded it, click **"→ Completed"**.
5. The moment you mark a referral **Completed**, the doctor who originally ordered the test is
   notified automatically — you do not need to separately inform them that an outside report has
   landed.
6. Use the status filter chips at the top of the tab (All / Pending / Sample Sent / Report
   Awaited / Completed) to see everything still outstanding at a glance.

---

*This manual covers the Laboratory (LIS) screens as they exist in Aumrti HMS today — all 10 tab
names and the button labels above were confirmed directly against the Lab module source. If a
screen looks different from what is described here, tell Deepika (Lab, Pathology & LIMS) so the
manual can be corrected.*
