# Inventory / Store / Procurement Staff — Training Manual

**Module:** Inventory & Stores
**Owner:** Vinod
**Screen:** `Inventory & Stores` in the main menu, which opens `src/pages/inventory/InventoryPage.tsx` at
the route `/inventory`
**Related screen (separate route, not a tab here):** `Procurement Recommendations`, which opens
`src/pages/inventory/ProcurementRecommendationsPage.tsx` at `/inventory/procurement-recommendations`
— see Walkthrough 4.

> Money on every screen in this module is shown in Indian Rupees with the ₹ symbol and Indian digit
> grouping (lakhs/crores) — for example ₹1,50,000, not ₹150,000. Dates are shown as DD/MM/YYYY (and
> sometimes "dd MMM yyyy", e.g. 12 Oct 2026, inside list rows — both are read left-to-right as
> day/month/year, never month/day/year). GST, batch, and expiry details are picked up or calculated
> by the system wherever shown — you never type a GST percentage by hand.

## What this role does in the system

As Inventory / Store / Procurement staff, you work entirely inside the **Inventory & Stores**
screen. When you open it you see a strip of counters at the top —
**📦 N Items · 🔴 N Low Stock · ⚠️ N Expiring · 📋 N Pending** — and an **AI Demand Review** button
(only shown once your hospital ID has loaded), plus a column of tabs down the left:

**Stock Overview · Indents · Ward Store · Consolidated · Stock Count · RFQ / Requisition ·
Purchase Orders · GRN / Receipts · Vendors · MIS Dashboard · Anomalies · Reports**

Your day-to-day work is:

- Recording goods that arrive from a vendor (**GRN / Receipts** tab).
- Approving and physically handing out stock to a department or another store (**Indents** and
  **Ward Store** tabs).
- Getting competitive quotes and raising a purchase order when stock needs replenishing
  (**RFQ / Requisition** tab feeding into the **Purchase Orders** tab, or a **Purchase Orders** tab
  entry created directly).
- Acting on low-stock and reorder signals before the hospital runs out of something it needs
  (**Stock Overview**'s Low Stock badge, and the separate **Procurement Recommendations** screen).
- Keeping the stock master accurate — correcting counts, writing off expired or damaged stock, and
  running periodic physical counts (**Stock Overview**'s Adjust button and the **Stock Count** tab).

Every tab you see on the left is filtered by what your hospital has switched on for your role —
if a tab listed above is missing for you, it has been turned off for your login, not deleted from
the app.

---

## 1. Receive stock from a vendor (GRN / Receipts)

A GRN (Goods Received Note) is the record that goods have physically arrived — only after you save
one does the stock master update and the items become available to issue.

1. Open **Inventory & Stores** → click the **GRN / Receipts** tab. You land on a two-pane screen: a
   list of past GRNs on the left (**GRN Records (N)**), and a "Select a GRN to view details" panel
   on the right.
2. Click **+ New GRN** at the top of the list. A **"New Goods Received Note"** window opens.
3. At the very top is the **AI invoice scanner** — you can photograph or upload the vendor's paper
   invoice and the system will try to read the vendor name, invoice number/date, and every line
   item (name, batch, expiry, quantity, rate) straight off the image. If it finds anything, a green
   banner shows **"✓ Extracted N items (confidence: X%)"** — always re-check every extracted line
   before saving; this is a starting point, not a final answer.
4. Two toggles appear next:
   - **Against PO?** — leave this **Yes** if these goods were ordered through a Purchase Order you
     raised earlier; switch it to **No (Direct GRN)** if the vendor just delivered stock with no PO
     behind it (the scanner switches this to No automatically once it extracts data from a photo).
   - **Consignment?** — switch this on if the vendor owns the stock until you actually use it
     (you don't pay for it on receipt). A **Consignment Vendor** dropdown appears, and every batch
     you add gets a small **"C — Consignment"** tag.
5. If **Against PO** is Yes: pick the order from **Select Purchase Order** — this pre-fills every
   ordered item, its ordered quantity, and what's already been received against it, so you only
   need to fill in what actually came in this delivery, the batch number, and the expiry date.
   If **Direct GRN**: pick the vendor from **Select Vendor** instead, then either scan each item's
   barcode in the **Scan barcode to add item…** box, or search for it by name and click it to add a
   row.
6. Fill in **Invoice Number**, **Invoice Date**, and set **Quality Check** to **✓ Pass**, **✗ Fail**,
   or **⚠ Conditional** based on what you physically inspected.
7. For every item row, confirm the **Recv Qty** (received quantity), type the **Batch** number and
   **Expiry** date, and check the **Rate**. Rows the scanner matched to an existing item show a
   green left-edge stripe; anything it couldn't match shows an amber stripe and
   **"⚠️ Not in master"** — these still save, but flag them to your supervisor so the item can be
   added properly.
8. Click **Save GRN**. This immediately:
   - Adds the received quantity into **Stock Overview**, under the batch number and expiry date you
     entered (a new row if the batch doesn't exist yet, or added onto the existing batch if it
     matches one already on hand).
   - Updates the linked Purchase Order's received quantity, and marks the PO **completed** once
     every line is fully received (or **partial_grn** if only part of it has arrived).
   - Posts the accounting entry for the purchase automatically — you do not do this separately.

---

## 2. Issue / consume stock

There are two different places this happens, depending on who is asking for the stock.

### A. A hospital department needs stock from the Central Store — the Indents tab

1. Click the **Indents** tab. You land on **Pending** by default — a list of indent requests
   raised by departments (Pharmacy, Nursing stations, OT, etc.) against the central store, with
   filter pills **Pending / Approved / Issued / Rejected / All** across the top.
2. Click a pending indent to open it on the right. You'll see every item requested, how much is
   **Requested**, how much is currently **In Stock**, and (once approved) an **Issue Qty** box per
   line.
3. On a pending indent, two quick actions sit right on the row: **✓ Approve** or **✗ Reject**.
   Approving moves it into the **Approved** tab; rejecting closes it.
4. Once approved, open it again — for each line, type how much you're actually handing out in
   **Issue Qty** (it won't let you issue more than what's in stock or more than was requested).
5. Click **Issue Selected Items**. This deducts the issued quantity from central stock automatically
   (oldest-expiry batches first — FEFO, First-Expiry-First-Out) and marks the indent **issued** (or
   **partially_issued** if you issued less than the full request).

To raise a brand-new indent yourself (for example, on a department's behalf), click
**+ New Indent**, pick the **Department**, an optional **Required Date** and **Notes**, search and
add each item with its quantity, then click **Submit Indent**.

### B. Moving stock between stores (ward, ICU, OT, central) — the Ward Store tab

This is for stock movements *between store locations* rather than a department drawing from the
single central store — for example a ward topping up its own cupboard from Central Stores, or one
ward lending stock to another.

1. Click the **Ward Store** tab. Pick which store you're acting for from the **Store** dropdown at
   the top left.
2. Choose one of three views using the toggle next to it:
   - **My Indents** — requests *you've* raised from this store, asking another store to supply you.
   - **Issue Stock** — requests from *other* stores asking *your* selected store to supply them
     (a badge shows how many are pending).
   - **Stock on Hand** — a read-only view of everything currently sitting in this store, with a
     reconciliation flag if on-hand quantity doesn't match what the ledger says was ever issued
     here.
3. **To ask another store for stock:** in **My Indents**, click **+ Raise Indent**. In the
   **"Raise Indent"** window, pick who you're requesting from (**Request To \***), add an optional
   note, then search and add each item with its **Qty** and **Unit** under **Items Requested**
   (click **+ Add Row** for more lines). Click **Submit Indent**.
4. **To supply another store's request:** switch to **Issue Stock**, click the request to open it.
   For each line, confirm (or adjust) **Approve** and **Issue** quantities, then click
   **Approve & Issue** — this deducts the stock from your store (oldest-expiry first) and adds it
   to the requesting store in one move. If there isn't enough on hand, the system blocks the issue
   and tells you exactly which items are short. You can also **Reject** a request with a reason
   instead.
5. **To receive stock you requested:** once a request you raised shows status **Issued**, open it
   and click **Mark Received**.
6. **To send unused stock back:** on a **Received** or **Issued** indent, click
   **Return to Store**, enter the quantity to return per item and a **Return Reason**
   (Unused / Expired / Excess quantity / Damaged / Wrong item issued), then click **Confirm Return**
   — this moves the stock back to the supplying store's balance.

---

## 3. Raise a purchase order

A Purchase Order (PO) can be created two ways in this module — through a formal multi-vendor
quote comparison (RFQ), or created directly without one. **An RFQ does not always precede a PO** —
read both paths below before assuming one is mandatory.

### A. Competitive quotes first — the RFQ / Requisition tab

1. Click the **RFQ / Requisition** tab, then **+ New RFQ**.
2. In the **"New RFQ"** window, search and add the items you need quotes for with their quantities,
   tick which **vendors** to invite, set a **Due** date, then click **Create RFQ**.
3. Back on the RFQ list, click the RFQ to open its comparison grid. As vendors respond, click
   **Enter a vendor quote**, pick the vendor chip, type each item's **Unit rate** and the
   **Delivery days**, then click **Save Quote**. Repeat for every vendor who quotes.
4. The grid shows every vendor's rate per item side by side, highlights the lowest rate per line in
   green, and marks one vendor **★ REC** — a recommendation computed from 50% price + 20% delivery
   time + 30% vendor performance score, not price alone.
5. Click **Award (best TCO)** next to the recommended vendor (or plain **Award** next to any other
   vendor if you have a reason to override the recommendation). This immediately creates a new
   **draft** Purchase Order using that vendor's quoted rates — you still finish it off in the
   **Purchase Orders** tab (see below).

### B. Creating a PO directly — the Purchase Orders tab

1. Click the **Purchase Orders** tab, then **+ New PO** (this works whether or not an RFQ exists —
   most hospitals use this path for routine reorders and reserve RFQs for larger or competitive
   purchases).
2. In the **"Create Purchase Order"** window, pick the **Vendor**, an **Expected Delivery** date,
   optional **Notes** and a **Cost centre / department**.
3. If any items are currently below their reorder level, an amber **"Low Stock Items — Suggested
   for PO"** box appears with one clickable chip per item — click a chip to add it straight to the
   order.
4. Search and add any other items, set each one's **Qty** and **Rate** (a green **contract** tag
   shows if a vendor rate contract already covers that item at that price; an amber **off-contract**
   tag shows if you've typed a different rate). An amber warning appears if the quantity is below
   that item's minimum order quantity.
5. Click **Create PO**. It saves as **draft**.
6. Back on the PO list, open the draft and move it through its lifecycle using the buttons in the
   detail header: **Approve** (someone other than whoever created the PO must do this — the system
   blocks self-approval, and large-value POs may require a specific approver role) → **Send to
   Vendor** → optionally **WhatsApp Vendor** to forward the order details on WhatsApp. **Cancel** is
   available at any point before goods arrive.
7. Once goods start arriving, go record them in **GRN / Receipts** (Walkthrough 1) — the PO's
   **Received** column and status update automatically from each GRN.
8. When the vendor's invoice comes in, type the **Invoice No.** and **Invoice Amount** in the PO
   detail footer and click **Verify 3-Way Match** — the system checks the invoice against the PO
   amount and the GRN value received so far. If it doesn't line up within tolerance, it shows
   **"Payment Blocked"** until a supervisor clicks **Supervisor Override**, or the figures are
   corrected. Once matched, a **Record Payment** button appears — this part is usually finished by
   your accounts team.

---

## 4. Reorder alerts — what actually surfaces a low-stock warning

Three tabs could plausibly show this; only one of them actually does, plus one separate screen
built specifically for it.

1. **Stock Overview** is where the day-to-day low-stock signal lives. Open the tab and you'll see:
   - The **🔴 N Low Stock** counter in the page header strip (visible from any tab, not just this
     one).
   - A **Low Stock** filter pill (next to **All / Expiring / Out / Consignment**) — click it to
     show only items at or below their reorder level.
   - Per row, a **Status** column reading **Low Stock ⚠️**, **Out of Stock 🔴**, or **✓ OK**.
   This is a live read of current stock versus each item's configured reorder level — nothing here
   needs to be "run."
2. **Anomalies** and **MIS Dashboard** do **not** carry a reorder-point alert. Anomalies covers six
   different detection types (un-billed consumption, off-contract pricing, consumption spikes,
   abnormal adjustments, dead stock, expiry risk) — reorder/low-stock is not one of them. MIS
   Dashboard covers department-wise consumption, near-expiry items, and non-moving items — again,
   not reorder levels. Don't look for the reorder signal in either of these tabs.
3. The dedicated home for AI-driven reorder and procurement suggestions is the separate
   **Procurement Recommendations** screen at `/inventory/procurement-recommendations` — this is
   **not** a tab inside Inventory & Stores; it's its own page. On it you can:
   - Click **Scan Reorder Breaches** to generate a recommendation for every item that has dropped
     to or below its reorder level, each one scored **Critical / High / Medium / Low** and with a
     suggested vendor and quantity.
   - Click **Run AI Forecast** to additionally predict items trending toward a stock-out even
     before they breach the reorder level.
   - On any recommendation, click **✓ Accept**, **💬 Notify** (sends a WhatsApp alert), or
     **✗ Reject**.
   - Once you've accepted one or more, either **Auto-Draft POs** (groups accepted items by the best
     vendor/rate contract and creates ready-to-approve draft POs automatically) or
     **Create PO (single vendor)** to put everything accepted onto one PO you pick the vendor for.
   - A quicker, simpler alternative lives back on the main Inventory page: the **AI Demand Review**
     button in the header runs a lighter version of the same idea and turns your selections
     directly into a Central Store indent rather than a PO.

**Navigation gap, confirmed against the source, not a guess:** there is no button or link inside
the **Inventory & Stores** screen itself that takes you to **Procurement Recommendations**. The
only in-app link to it today is a "Procurement Recs" shortcut on the separate **HOD Dashboard**
page (`/hod-dashboard`), a screen built for department heads, not for this role. Until that's
fixed, reach this screen by typing `/inventory/procurement-recommendations` directly into the
address bar, or ask IT/your administrator to bookmark it for you.

---

## 5. Other tabs at a glance (not full walkthroughs)

- **Consolidated** — a read-only rollup of stock value, units, and expiring batches across every
  silo your hospital tracks separately (Central Stores, Pharmacy, Ward/sub-stores, Blood Bank,
  Vaccination), plus a combined "expiring soon" list and top-vendor spend. It does not let you edit
  anything — it exists purely so you can see the whole hospital's stock position in one place
  without visiting five different modules.
- **Stock Count** — for physical stock-taking. Pick **Central Store** or a specific store from the
  dropdown, click **Start New Count** to snapshot current system quantities, then walk the shelves
  and type what you actually counted into each line's **Counted** box. Click **Post Variances** to
  push the corrected quantities back into stock and log every difference.
- **Vendors** — your vendor master and scorecards: contact details, a performance score (On-Time
  Delivery % and Quality Pass Rate, syncable from real GRN history via the **Sync** button),
  outstanding payables with an ageing breakdown, and rate contracts per item. **+ Add Vendor** adds
  a new one; **Rescore All** recalculates every vendor's score at once.
- **MIS Dashboard** — three switchable cards: **Dept-wise Consumption** (this month, by store),
  **Near-Expiry Items** (next 30 or 60 days, your choice), and **Non-Moving Items** (no movement in
  90+ days). **Content gap:** the **Mark Return**, **Write-off**, and **Redistribute** buttons shown
  next to each row in this tab are visual only — they are not wired to any action yet, so clicking
  them does nothing. Use **Stock Overview**'s **Adjust** button (below) for an actual write-off.
- **Anomalies** — rules-based detection across six categories (un-billed consumption, off-contract
  pricing, consumption spikes, abnormal adjustments, dead stock, expiry risk). Click **Run Scan** to
  check, **AI Digest** for a plain-English summary, and **Review**/**Dismiss** per flagged anomaly.
  **Access note:** this tab is gated behind an AI feature switch your hospital administrator
  controls (`inventory_anomaly_digest`); if that feature isn't enabled for your hospital, this tab
  shows nothing at all when you click it.
- **Reports** — four report types on the left: **Stock Valuation**, **Dead Stock**, **Expiry
  Report**, all of which are real, working tables. **Content gap:** **Vendor Performance** is listed
  as a report but currently only shows a static placeholder message — there is no actual report
  behind it yet. For real vendor numbers, use the **Vendors** tab's scorecards instead.
- **Adjusting or writing off stock** (reached from inside **Stock Overview**, not its own tab):
  click **Adjust** on any item's row. In the **"Adjust Stock"** window, choose a reason — **Stock
  Correction**, **Wastage / Disposal**, **Expired Items**, or **Return to Vendor** — pick which batch
  it affects (or let it pick automatically, oldest-expiry first), enter the quantity and a note, and
  click **Save Adjustment**. Expired-item write-offs can only be applied against batches that have
  actually passed their expiry date.

---

## Access control

- The **Inventory & Stores** route (`/inventory`) has no explicit entry in
  `src/lib/routeRoles.ts` — it inherits its role list straight from the module catalogue in
  `src/lib/modules.ts`, where the Inventory & Stores module is defined with
  `roles: ["inventory_manager", "super_admin"]`. Verified directly against both files; no override
  exists for `/inventory` in the explicit overrides section of `routeRoles.ts`.
- **Procurement Recommendations** (`/inventory/procurement-recommendations`) is guarded with the
  exact same role list — its route in `src/App.tsx` explicitly reuses the `/inventory` role check
  (`<RG path="/inventory">`), so whoever can open Inventory & Stores can also open this page (gap
  above aside — reaching it still requires typing the URL or using the HOD Dashboard shortcut).
- **Plainly: `inventory_manager` is the only non-`super_admin` login that can open this module at
  all.** `hospital_admin` cannot reach `/inventory` or the Procurement Recommendations page today —
  confirmed by the absence of `hospital_admin` from the roles list in `modules.ts` and the absence
  of any `/inventory` override in `routeRoles.ts` that might have added it back. `doctor` and
  `nurse` logins have no access either.
- This means there is currently no separate, lower-tier "store clerk" or "procurement assistant"
  login distinct from `inventory_manager` — everyone who can see this screen is on a manager-tier
  login, whatever their actual day-to-day job title is. This is the same category of gap Phase 2
  flagged for radiology-technician, IPD ward-clerk, and OT-surgical-staff: the training content
  above is accurate to what's on screen, but the job title "Inventory / Store / Procurement Staff"
  does not map to its own distinct role in the system today. If your hospital's actual store clerks
  or receiving staff need their own login separate from whoever manages vendors and approves POs,
  that is a product follow-up for Nikhil/Vikram to sequence, not something this documentation
  effort can fix.

---

## Quick reference — tab names as they actually appear on screen

| What the brief called it | What you'll actually see on screen |
|---|---|
| Stock Overview | **Stock Overview** |
| Indents | **Indents** |
| Ward Store | **Ward Store** |
| Consolidated | **Consolidated** |
| Stock Count | **Stock Count** |
| RFQ / Requisition | **RFQ / Requisition** |
| Purchase Orders | **Purchase Orders** |
| GRN / Receipts | **GRN / Receipts** |
| Vendors | **Vendors** |
| MIS Dashboard | **MIS Dashboard** |
| Anomalies | **Anomalies** (blank if the AI feature is off for your hospital) |
| Reports | **Reports** (Vendor Performance sub-report is a placeholder — see Section 5) |
| Procurement Recommendations | **Procurement Recommendations** — separate screen at `/inventory/procurement-recommendations`, not a tab here (see Walkthrough 4) |
