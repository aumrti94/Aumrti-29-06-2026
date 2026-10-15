# Billing Clerk — Training Manual

**Module:** Billing (OPD/IPD Billing & Collections)
**Owner:** Balaji
**Screen:** `Billing` in the main menu, which opens `src/pages/billing/BillingPage.tsx`

> Money on every screen in Billing is shown in Indian Rupees with the ₹ symbol and Indian digit
> grouping (lakhs/crores) — for example ₹1,50,000, not ₹150,000. Dates are shown as DD/MM/YYYY.
> You never type a GST percentage anywhere — the system picks it up automatically from the rates
> your hospital has configured, based on the service.

## What this role does in the system

As a Billing Clerk, you work entirely inside the **Billing** screen. When you open it you see a
row of tabs along the top:

**Bills · 💳 Collections · 🔴 Pending Payments · 📉 Revenue Leakage · 🔐 Approvals · 💰 Refunds**

(Some of these carry a small number badge — that is a count of items waiting for someone to act
on them. "Approvals" and "Refunds" are usually for a supervisor to action, but you will often be
the one who sends a patient's bill there in the first place.)

Your day-to-day work is:

- Opening a patient's visit and turning it into a bill (**Bills** tab).
- Taking money from a patient and recording it against their bill (**Bills** tab, inside a bill;
  or the **🔴 Pending Payments** tab for individual service charges).
- Chasing patients who still owe money from an earlier visit (**💳 Collections** tab).
- Catching services a patient received but was never charged for, before the hospital loses that
  revenue (**📉 Revenue Leakage** tab, and the "Scan Unbilled" tools inside a bill).
- Starting a refund when a patient has been overcharged or has a credit balance (inside a bill's
  Payments tab — a second person with approval rights then signs it off in **💰 Refunds**).

You never create a bill number yourself and you never type a bill's GST amount by hand — both are
calculated and stamped by the system the moment you add a service or finalise a bill.

A note on what you see: every bill always belongs to one specific patient visit (an "encounter").
You cannot create a loose bill that isn't tied to a visit — the system will not let you.

---

## 1. Generate a bill for a patient

1. Open **Billing** from the main menu. You land on the **Bills** tab by default — this is a
   two-pane screen: a list of bills on the left, and an empty "Select a bill to open" panel on
   the right.
2. At the top of the left-hand bill list, click the **+ New Bill** button.
3. A **"Create New Bill"** window opens.
   - In the **Patient** field, start typing the patient's name, phone number, or UHID (their
     unique hospital ID). A dropdown list appears below the field — click the correct patient.
     Their name and UHID now show in a highlighted box; if you picked the wrong patient, click
     **Change** to search again.
   - Under **Bill Type**, click one of the four buttons: **OPD Visit**, **IPD Discharge**,
     **Emergency**, or **Day Care**. Pick the one that matches why the patient is here today.
4. Click the **Create Bill →** button at the bottom.
5. The system generates the bill number itself (you will never be asked to type one) and opens
   the bill straight away in the **Bill Editor** window.
6. Inside the Bill Editor you will see a second row of tabs: **Line Items, Payments, Insurance,
   Discount** (an **Advance** tab also appears for IPD/Day Care bills). You start on **Line
   Items**.
   - Click **+ Add Service** to search your hospital's service list (consultation, procedure,
     room charge, etc.) and add it to the bill. Each service you add fills in its own GST rate
     and HSN code automatically — you do not set these.
   - For an IPD (admitted-patient) bill, two extra buttons appear here: **Scan Unbilled** and
     **Recalculate IPD** — see Walkthrough 4 below for what these do.
7. Once every service the patient received is on the bill, click the **Finalise Bill** button
   (shown at the top of the window, next to the patient's name, while the bill is still in
   **Draft** status). Finalising locks the bill's totals and GST calculation and turns on the
   **Pay Bill** and **GST Invoice** buttons.

**Note for IPD/Day Care admissions:** if a patient is still admitted and no bill exists yet for
their stay, you will see their name on the Bills list already with a **"Pending IPD"** tag and a
**"Click to create bill →"** note instead of an amount. Clicking that row does steps 2–5 for you
automatically — you do not need to use "+ New Bill" separately for an admitted patient who
already shows up this way.

---

## 2. Collect a payment against a bill

1. Go to the **Bills** tab and click on the patient's bill in the left-hand list. (A bill must be
   **Finalised**, not Draft, before you can collect against it — if you see a **Finalise Bill**
   button instead of **Pay Bill**, finalise it first.)
2. The **Bill Editor** opens on the right. At the top, next to the patient's name and bill
   number, click the **Pay Bill** button (it only appears if money is still owed on the bill).
3. A **"Collect Payment · [Bill Number]"** window opens.
   - The **Amount to Collect** figure at the top shows the exact outstanding balance in ₹.
   - One payment row is already filled in: a **payment mode** dropdown (defaults to **Cash** —
     other options include UPI, Card, and other modes your hospital has set up), an **₹ Amount**
     box pre-filled with the full balance due, and an optional **Ref / Txn ID** box for a UPI
     reference, cheque number, or card transaction ID.
   - If the patient is paying in more than one mode (part cash, part UPI, for example), click
     **+ Add split payment** to add another row, and adjust each row's amount so they add up to
     what you are actually collecting.
   - The **Auto-send WhatsApp receipt** checkbox is ticked by default — leave it ticked to send
     the patient a receipt automatically once payment is recorded.
4. Click the **Pay ₹[amount]** button at the bottom. You will see a confirmation toast
   ("Payment of ₹X collected ✓") and the bill's balance updates immediately.

You can also do all of this without leaving the bill — the same form appears inside the bill's
own **Payments** tab, under a **Payment History** table showing every payment already taken
against this bill.

---

## 3. Find and chase a pending payment

There are two different places for this, depending on what "pending" means for the patient in
front of you:

**A. A specific service hasn't been paid for yet (counter collection)** — go to the
**🔴 Pending Payments** tab. This lists individual unpaid charges (a lab test, a pharmacy
dispense, a nursing procedure, etc.) grouped under the patient and bill they belong to, with the
module they came from shown as a badge (Lab, Pharmacy, OT, and so on).
   - Use the **search box** at the top to find a patient by name, UHID, or the service
     description, or use the **module dropdown** to narrow it to one department.
   - For a single charge, click the **✓ Paid** button next to that line.
   - If a patient owes on several charges at once, click **Collect All** next to their name to
     take one combined payment for everything outstanding on that bill.

**B. An older bill is overdue and needs chasing** — go to the **💳 Collections** tab. This is
built for ageing debt, not same-day counter collection.
   - At the top you see KPI pills: **Total**, **>30d**, **>60d**, **>90d** — how much is overdue
     and for how long.
   - Use the **Bill Type**, **Days Overdue**, and **Amount** filter dropdowns to narrow the
     **Outstanding Bills** table to the patients you want to chase.
   - Each row shows the patient, bill number, amount due, and days overdue (colour-coded —
     redder the longer it's been outstanding). On the right of each row are four small action
     icons:
     - **Pay Link icon** — opens a **"Generate Payment Link"** window; set the **Amount (₹)** and
       an expiry (1/3/7/30 days), click **Generate Pay Link**, then **Copy Link** or
       **WhatsApp** it straight to the patient.
     - **EMI Plan icon** — opens **"Create EMI Plan"**; choose the number of **Installments** and
       **Frequency** (Weekly/Fortnightly/Monthly), then click **Create EMI Plan**.
     - **WhatsApp Remind icon** — sends the patient a WhatsApp message quoting the amount due and
       how many days it's overdue, straight away (no extra window).
     - **Mark Collected icon** — use this if you received payment outside the normal flow (cash
       handed over at the ward, a bank transfer that's landed, etc.). Opens **"Record
       Collection"**; enter the **Amount (₹)** and choose a **Mode** (Cash/UPI/Card/Cheque), then
       click **Record Payment**.
   - **Run Campaign** (top right) lets you message several overdue patients at once instead of
     one row at a time.

---

## 4. Review flagged revenue leakage / unbilled services

"Revenue leakage" means a service was actually given to a patient but never made it onto a bill —
money the hospital is owed but hasn't claimed yet. There are three places to catch this, at two
different levels. Use the hospital-wide dashboard to spot the problem; use the tools inside a
specific bill to fix it.

**A. Hospital-wide — the 📉 Revenue Leakage tab**
1. Go to the **📉 Revenue Leakage** tab. This shows every unbilled service across the whole
   hospital, grouped by department (Pharmacy, Lab, OT, Dialysis, Physiotherapy, and so on).
2. Three KPI cards at the top show **Unbilled Revenue** (in ₹), **Modules with leaks**, and
   **Oldest unbilled** service.
3. Use the **module** and **minimum amount** dropdowns to narrow the list, or click
   **Refresh** to reload it.
4. Click **Run Scan** to trigger an immediate check across all modules (normally this runs
   automatically every night) — a toast tells you how many unbilled items it found.
5. Click on any department's row to expand it and see each unbilled service, its date, and its
   estimated amount. If a row's amount reads **"Rate not set"**, it means no price has been
   configured for that service yet in Settings — flag this to your supervisor rather than
   guessing a figure.
6. Rows marked **"from scan"** came from the automatic overnight scan and cannot be actioned here
   directly — open the patient's bill instead (see below) to add the charge. Rows with a
   **Waive** button are ones you can mark as deliberately not chargeable, if your hospital has
   decided not to bill for that particular item.
7. Below the department list, an **"Unordered Investigations"** panel separately lists lab tests
   or radiology studies a doctor prescribed in OPD that were never actually sent to Lab or
   Radiology — this is lost revenue of a different kind (nothing to bill because the test was
   never ordered), and is shown here as a reminder to follow up with the clinical team.

**B. Inside one IPD bill — "Scan Unbilled"**
1. Open the patient's admission bill (Bills tab → click their bill).
2. In the **Line Items** tab, click the **Scan Unbilled** button (only shown for bills tied to an
   admission).
3. An **"Unbilled Services — [Patient Name]"** window opens, listing everything dispensed or
   ordered during this admission that hasn't been added to the bill yet, grouped under
   **Pharmacy Dispenses**, **Lab Orders**, and **Radiology Orders**.
4. Items that are safely, definitely unbilled are pre-ticked for you. Items that look unbilled
   but might already be on a bill that's mid-correction are listed but **not** pre-ticked —
   review these yourself before ticking them, so you don't bill the patient twice.
5. Tick or untick items as needed, then click **Add Selected to Bill**.

**C. Inside any bill (OPD or IPD) — the AI Leakage Scanner banner**
1. Still in the **Line Items** tab, scroll to the bottom of the bill. If the bill is linked to a
   visit or admission, you'll see a **"Scan for Unbilled Services"** button.
2. Click it. If it finds anything, an amber banner expands showing each missed charge (lab,
   radiology, pharmacy, or completed OT case) with its suggested amount.
3. Click **Add** next to a single item to post it to the bill, or **+ Add All (N) to Bill** to
   add everything the scan found in one go. Use **Dismiss All** only if you've checked the items
   and genuinely don't want to bill for them.
4. If it finds nothing, it shows a green "✓ No unbilled services detected" message instead.

---

## 5. Process a refund

A refund is a two-person action: you start it from inside the patient's bill, and someone with
refund-approval rights finishes it in the **💰 Refunds** tab. You cannot do both steps yourself
unless your role also has approval rights.

**Step 1 — Request the refund**
1. Open the patient's bill (Bills tab → click their bill).
2. Go to the bill's **Payments** tab. If the patient has a credit balance — they've paid more
   than the bill actually comes to — you'll see a blue **"Refund Due to Patient"** box showing
   the exact amount to be returned, in ₹.
3. Click the **Process Refund** button in that box.
4. A **"Process Patient Refund"** window opens.
   - **Refund Amount (₹)** is pre-filled with the amount owed and cannot be increased above it.
   - **Refund Mode** — choose Cash, UPI, Bank Transfer, or Cheque.
   - **Reference / Transaction No.** (optional) — a UPI reference, cheque number, or UTR.
   - **Notes** (optional) — the reason for the refund.
5. Click **Confirm Refund**. This does **not** hand money back yet — it only submits the request.
   You'll see a toast confirming it's "submitted for approval", and the Payments tab now shows an
   amber notice that a refund is awaiting approval, so you cannot submit a second one for the same
   bill by mistake.

**Step 2 — Approve and disburse the refund** (a supervisor, or you if your role has this
permission)
1. Go to the **💰 Refunds** tab. This opens the **Refund Approval Inbox**, filtered to
   **Pending** by default.
2. Find the request — it shows the patient's name and UHID, the bill number and total, who
   requested it and when, and the bill's current balance.
3. Click **Open Bill →** if you want to review the bill itself first.
4. To approve: click **Approve & Process**. This returns the money in the ledger, updates the
   bill's status, and posts the matching accounting entry automatically — you do not do this
   separately.
5. To reject instead: click **Reject**, type a reason in the box that appears, then click
   **Confirm Reject**.

If you don't have permission to approve or reject, the system tells you so and the buttons won't
work for you — hand the request to a supervisor.

---

## Quick reference — tab names as they actually appear on screen

| What the brief called it | What you'll actually see on screen |
|---|---|
| Bills | **Bills** |
| Collections | **💳 Collections** |
| Pending Payments | **🔴 Pending Payments** |
| Revenue Leakage | **📉 Revenue Leakage** |
| Approvals | **🔐 Approvals** (discount approvals — not covered in this manual) |
| Refunds | **💰 Refunds** (this is the *approval inbox*, not where you start a refund — see Walkthrough 5) |
