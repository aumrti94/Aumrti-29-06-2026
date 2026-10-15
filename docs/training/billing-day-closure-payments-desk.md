# Day Closure & Payments Desk — Training Manual

**Modules:** Day Closure (`src/pages/billing/DailyCashClosurePage.tsx`) and Payments
(`src/pages/billing/PaymentsPage.tsx`)
**Owner:** Balaji (OPD/IPD billing & collections)
**Screens:** `Day Closure` (route `/billing/closure`) and `Payments` (route `/payments`) in the
main menu — two separate, standalone screens bundled into one file because they are both worked
by the same end-of-day finance desk, the same pattern Phase 4 used for Accountant/Insurance-TPA.

> Day Closure shows every amount via `formatINR()` from `src/lib/currency.ts` — Indian Rupees with
> the ₹ symbol and Indian digit grouping (lakhs/crores), e.g. ₹1,50,000. Payments does **not** use
> that shared helper — see the flag at the end of Part B. Dates are shown as DD/MM/YYYY throughout
> (`toLocaleDateString("en-IN")`).

**This file does not cover collecting a payment from inside a patient's own bill** — that is the
Billing Clerk's day-to-day job (**Bills → Pay Bill**, and the Bill Editor's own **Payments** tab),
already documented in [billing-clerk.md](./billing-clerk.md). Confirmed by reading that file in
full before writing this one: its "Payments" mentions are exclusively the sub-tab inside one
bill's editor (Line Items/Payments/Insurance), never these two separate standalone routes. This
file starts from the two screens billing-clerk.md does not cover: the end-of-day cash lock, and
the cross-bill payment ledger (which, as Part B explains below, is mostly a *reconciliation and
reporting* desk, not a second place to take a counter payment).

---

## Part A — Day Closure (`/billing/closure`)

### What this screen is for

Day Closure is the end-of-day ritual: at close of business, a supervisor confirms that the cash,
UPI, card, cheque, net-banking, and insurance totals the system recorded for the day actually match
what was physically collected, then **locks** the day so nothing can be back-dated into it without
a deliberate, logged reopen.

When you open **Day Closure** you land on one screen (no tabs) with:
- A date picker (defaults to today, cannot be set to a future date).
- A **billing-account picker** dropdown — "All Accounts (combined)", each active staff member who
  has collected anything, and "Online / Unattributed" — because *any* role that can take a payment
  (reception, a doctor's own front desk, etc.) shows up here as a separate drawer to count, not
  just dedicated billing staff.
- A **Locked** or **Open** badge, a **Tally Summary** print button, and a **Recent Closures**
  dropdown showing the last 7 days with their status and variance.

### A1. Review the System Totals and spot a variance

1. With "All Accounts (combined)" selected, the left panel, **System Totals (from transactions)**,
   shows what the system recorded today for each of six modes: **Cash, UPI, Card, Cheque, Net
   Banking, Insurance / TPA**. Below that, if applicable, three reference-only lines appear:
   **Advance deposits taken** (+), **Refunds Paid Out** (−), and **Pay Later recovered** (+) — each
   already folded into the mode totals above; these three lines exist only so you can see *why* a
   mode's figure moved, not as extra money to add in yourself.
2. A separate line, **Pay Later issued today (not in total)**, appears outside this box in amber if
   any Patient Pay-Later credit was granted today. This is deliberately **excluded** from the System
   Total — nothing was physically collected for it, so adding it would make the total look like more
   cash came in than actually did. Treat a day with an unusually large Pay-Later figure under one
   collector's name as something to ask about, not just read past — it is the screen's built-in
   fraud-detection signal (see the **Collections by Account** cards below).
3. On the right, under **Supervisor Physical Count**, type in the actual counted amount for each of
   the same six modes — there is no minimum, including for Cash: a tender can legitimately go
   negative on a day its refunds exceed its takings in that mode.
4. As you type, **Manual Total** updates, and the bar below the two panels shows **Variance** —
   Manual Total minus the System Total, for the whole hospital (never a filtered single account,
   even if you are viewing one). A green "Balanced" badge means the two match exactly (to the
   nearest paisa); a red bar means they do not, and you must type a reason in the box that appears
   before you are allowed to lock.
5. **Collections by Account** — a strip of cards below, one per staff member who collected anything
   today, each showing their own per-mode breakdown and total. Click a card to filter the
   transaction list below to just that person; click **Show all** (or re-click the same card) to
   return to the combined view. **You cannot lock the day while filtered to one account** — the
   screen shows "Showing [name] — switch to "All Accounts" to lock" and disables the Lock button
   until you switch back.

### A2. Lock the Day

1. Once every one of the six Supervisor Physical Count fields has a value, and either the variance
   reads ₹0.00 or you have typed a reason for it, the **Lock Day** button (bottom right of the
   variance bar) becomes clickable.
2. Click **Lock Day**. A browser confirmation box appears: *"Lock [date]? This cannot be undone
   without CFO approval."* Click OK.
3. The screen saves the system totals, your manual counts, and the variance/reason into that day's
   closure record, marks it **locked**, and — best-effort — posts a journal entry for the day's
   total via the shared `autoPostJournalEntry()` helper (trigger `daily_cash_closure`). This call is
   a no-op if the hospital has no posting rule configured for that trigger — it does not block the
   lock itself, and does not raise an error if it silently does nothing.
4. You'll see a toast — *"Day [date] locked successfully"* — and the badge switches to **Locked**
   (green), with the lock time shown next to it. Every manual-count field is now disabled.
5. **What "locked" actually stops, grounded in the real guard, not assumed:** locking a day sets a
   row in `daily_cash_closure` to `status = 'locked'`. Two **database triggers**
   (`prevent_bill_on_locked_day`, `prevent_payment_on_locked_bill_day`) — not just a client-side
   check — then refuse any new bill or payment dated on that day, hospital-wide, for anyone, on any
   screen in the app. This is a real back-dating block, enforced where it cannot be bypassed from
   the UI. There are exactly two deliberate exemptions, both narrow: (a) a still-**running** IPD
   admission bill (not yet finalised) keeps accruing charges under its original admission-day date
   for the whole stay, since a day-closure lock reconciles against `bill_payments`/`bill_line_items`,
   never against a running bill's own totals; (b) a bill carrying an open Patient Pay-Later credit
   grant stays collectable, so a Pay-Later patient doesn't become permanently uncollectable the
   moment the grant day's cash closes. Outside those two cases, a locked day genuinely cannot be
   written into — if you try, the screen that attempted the write shows: *"Day [date] is locked
   (cash closure). Reopen it first: Billing → Day Closure → Reopen Day."*

### A3. Reopen a locked day — a different, stricter permission from locking it

This is the one place the brief for this file specifically asked not to conflate two checks, so
stated precisely:

- **Closing the day** (`canCloseDay`) is gated by `actionAllowed("billing", "day_closure")` — a
  *configurable* per-role action permission, defaulting to **allowed** for any role that can reach
  the route at all, unless a Hospital Admin has explicitly switched it off for that role under
  **Settings → Roles → Billing → Action Controls**. If it is off for your role, the whole screen is
  replaced with the literal message: *"Cash Closure is restricted for your role."* followed by
  *"Ask an administrator to enable the "Day Closure" action for your role under Settings → Roles →
  Billing → Action Controls."*
- **Reopening a locked day** (`canReopen`) is a flat, **hardcoded** check in the component itself —
  `role` must be exactly `super_admin`, `hospital_admin`, or `cfo`. It does **not** go through the
  Settings permission matrix at all. A Hospital Admin cannot grant Reopen rights to a Billing
  Executive or Accountant through any Settings screen, no matter how the action-permission matrix is
  configured — and, the other direction, cannot take Reopen rights away from CFO/Admin/Super Admin
  either. The two checks are genuinely independent mechanisms, not one permission read two ways.
- If you have Reopen rights, a **Reopen Day** button (amber, with an unlock icon) appears next to
  the Locked badge. Clicking it opens a modal: *"Reopen [date]"*, with a required **Reason** text
  box (placeholder: *"e.g. Missed a cash receipt that must be added to 16 Jul"*) and a **Reopen
  Day** button, disabled until you type a reason. Confirming sets the closure record's status back
  to `reconciled` (not fully back to `open`), clears the locked-by/locked-at fields, and logs the
  change via `logConfigChange()` with your reason attached — so every reopen is independently
  auditable, not just a silent unlock. Re-lock the day once corrections are made, the same way as
  the first time.

### A4. Print the Tally Day Summary

Click **Tally Summary** (top right) at any time, locked or not. This opens a new window with a
printable one-page sheet: Collections Today (debit rows — Cash, Bank UPI/Card/Net Banking, Bank
Cheque, AR Insurance/TPA, Other), Collections by Account (one row per collector), Revenue by
Service (credit rows, grouped into Tally-style heads: OPD Consultation, IPD Room & Nursing, Surgery
/ OT, Laboratory, Radiology, Pharmacy, Packages, Other Services), a Collections–Revenue variance
line, and a plain-English instruction block telling whoever enters this into Tally Prime which
voucher type (**Receipt**), date, and narration to use. **This is a printed instruction sheet for
manual entry, not an automatic export or API push into Tally** — nothing on this screen writes an
XML voucher file or calls Tally directly; grounded in reading `printTallySummary()` itself, which
only builds an HTML print document.

---

## Part B — Payments (`/payments`)

### What this screen actually is — read this before assuming it's a second place to "take" a payment

Payments shows a live, hospital-wide ledger of every `bill_payments` row across all bill types and
modes, with four KPI cards (**Collected**, **Outstanding**, **Links Sent**, **Advances**), a
date-range filter (Today/Yesterday/This Week/This Month), a mode filter, a collections-by-mode bar
chart, and two side panels (**Find a Bill**, **Manual Reconciliation**).

**Correction to the brief's working assumption, confirmed by reading the component:** there is
**no generic "record a cash/UPI/card payment" button anywhere on this screen.** The only write path
on this page that calls `recordBillPayment()` is the Razorpay manual-reconciliation **Attach**
flow described in B2 below. An everyday counter payment (cash, UPI, card handed over at a bill) is
still recorded from inside the patient's own bill in **Billing** (Bills tab → Pay Bill, or the Bill
Editor's Payments tab) — exactly the flow billing-clerk.md Walkthrough 2 already documents. This
screen's job is reconciliation and reporting of payments already made, plus sending a payment
link and reconciling a Razorpay transaction the system doesn't yet know about — not a second
counter-collection form.

### B1. Read the KPI cards and the ledger

1. The **Collected** card totals every payment in the selected date range, with the top three
   modes listed underneath (e.g. "cash: ₹X · upi: ₹Y · card: ₹Z").
2. **Outstanding** sums `balance_due` across every bill not yet fully paid, hospital-wide,
   regardless of the date filter.
3. **Links Sent** counts `payment_links` rows created in the selected period; **Advances** sums
   `advance_receipts` not yet adjusted against a bill — both update live as new activity happens
   (the page subscribes to realtime changes on `bill_payments`, `bills`, `advance_receipts`, and
   `payment_links`).
4. The date pills (**Today/Yesterday/This Week/This Month**) and the **Mode** dropdown filter the
   table and chart together. The Mode dropdown only lists **All Modes, Cash, UPI, Card, Insurance,
   Cheque** — see the flag below for why that's narrower than the modes the rest of the screen
   actually displays.
5. Each row in the table shows time, patient name + UHID, bill number, a colour-coded mode badge
   with an emoji icon, the amount, and a reference/transaction ID if one was recorded. A row paid
   in mode **donation** additionally shows an **80G** print button if the hospital has a GST/80G
   registration number configured (see B4).

### B2. Send a payment link

1. In the **Find a Bill** panel, type a bill number or the patient's UHID into the search box and
   click the search icon (or press Enter).
2. If found, a small card appears: patient name, bill number, UHID, and the current balance due.
3. Click **Send Payment Link**. This opens the **Send Payment Link** modal: an editable **Amount
   (₹)** field (pre-filled with the balance due), a required **Patient Phone Number** field, a
   live preview of the WhatsApp message that will be sent, and a notice telling you whether a real
   Razorpay link will be generated or a demo link (if Razorpay isn't configured in Settings →
   Integrations).
4. Click **Send on WhatsApp** to generate the link and open a pre-filled WhatsApp message to that
   number (the bill is also flagged `payment_link_sent = true`), or **Copy Link** to just copy it
   without sending. Once generated, a QR code for the link also appears in the modal for a
   scan-to-pay option.

### B3. Reconcile a payment by Razorpay transaction ID

1. In the **Manual Reconciliation** panel, paste the Razorpay payment ID (format `pay_xxxxx...`)
   into the box and click **Look Up Transaction**. This calls the `razorpay-lookup` edge function.
2. The result card shows **Status** (captured/pending/etc., colour-coded), **Amount**, **Method**,
   and, if present, **Contact** and **Captured** timestamp.
3. If the status is **captured**, go back up to **Find a Bill** and search for the bill this
   payment belongs to (by bill number or UHID). Once found, an **Attach ₹X Payment** button
   appears on the found-bill card.
4. Click it. This is the one point on this whole screen that actually calls `recordBillPayment()`:
   it inserts the `bill_payments` row (mode mapped from Razorpay's method — `upi`→upi, `card`→card,
   `netbanking`→net_banking, anything else falls back to `upi` so GL posting never silently no-ops),
   posts the matching journal entry, updates the bill's paid amount/balance/status, and sends a
   WhatsApp receipt automatically. A toast confirms: *"₹X attached to Bill #[number] ✓"*.

### B4. Print an 80G donation receipt

1. Find a row in the table with mode **donation** and an **80G** button in its last column (only
   shown if your hospital's PAN/80G registration number is configured).
2. Click it. A printable receipt opens: "80G DONATION RECEIPT", the receipt number (the bill
   number), date, payer name, amount, mode, reference, a PAN/80G registration block, and the
   statutory footer noting eligibility for a tax deduction under Section 80G of the Income Tax Act,
   1961.

---

## `_by`-column attribution — checked, both files clean this time

Every write in both files that stamps a staff-attribution column was traced to its source, the
same check that caught the misattribution bug in Mortuary, Biomedical, and PMJAY in earlier phases.
Both files resolve correctly here:

- `DailyCashClosurePage.tsx`'s `closed_by` (on lock) reads `userId`, which is set once from
  `supabase.from("users").select("id, hospital_id").eq("auth_user_id", user.id)` — the resolved
  `public.users.id`, not the raw Supabase auth id. Correct, matching CLAUDE.md's `_by`-column rule.
- `PaymentsPage.tsx` passes `collectedBy: userId` into `recordBillPayment()` using the identical
  `auth_user_id → users.id` lookup pattern, and `src/lib/billPayments.ts` writes it straight to
  `bill_payments.received_by` and into `autoPostJournalEntry()`'s `postedBy`. Also correct.

No fix was needed here — stated plainly, the same discipline every phase has held toward a clean
result, not just toward a found bug.

---

## Access control — confirmed against `src/lib/routeRoles.ts` and `src/lib/modules.ts`

- **`/billing/closure`** — the module catalogue (`modules.ts` line 62) declares
  `["accountant", "billing_executive", "cfo", "super_admin"]`. `routeRoles.ts` line 19 carries an
  override that **adds `hospital_admin` on top** — every catalogue role is still present, nothing
  dropped. This is the same confirmed-widening shape Phase 11 found for `/ipd/day-care`, not the
  drop-a-role copy-paste bug Phase 9/10 found for FMS/IPC/ABDM — checked explicitly per this
  phase's brief, and it is clean. Of that five-role list, **Billing Executive**, **Accountant**,
  and **Admin/CEO** (`hospital_admin`) are all default role cards on **Settings → Staff Members →
  Add Staff Member** — confirmed the old single mislabelled "Billing" card (Phase 8/9's recurring
  trap) does not recur here: `DEFAULT_ROLE_CARDS` already carries separate **"Billing Executive"**
  and **"Accountant"** cards since Phase 9's fix, and both sit correctly on this route's role list.
  **CFO is not a default role card** — `slugifyRoleName("CFO")` → `cfo`, an exact match with no
  acronym surprise, so a Hospital Admin can reach it with the standard one-time custom-role step
  (type "CFO" on **Settings → Roles & Permissions**) — mandatory for that one role only, not for
  the other three.
- **`/payments`** — the catalogue (`modules.ts` line 64) declares only
  `["billing_executive", "super_admin"]`, and `routeRoles.ts` has **no override for this route at
  all** — confirmed by reading the file in full; it falls straight through to the catalogue list.
  **This produces a real asymmetry inside the same end-of-day finance workflow:** Accountant and
  CFO can both open Day Closure and lock the day, but **neither can open Payments** — only Billing
  Executive, Super Admin, and Hospital Admin (the last via the separate `BYPASS_ROLES` mechanism,
  not because it's on the static list) can. An Accountant or CFO who spots a reconciliation issue
  while closing the day cannot personally open Payments to send a payment link or attach a Razorpay
  transaction — that step must go to a Billing Executive or admin login. Flagged, not fixed:
  widening `/payments`'s role list is a product decision for Nikhil/Ravi to make, not something to
  change quietly inside a documentation pass.
- Neither route shows the route-override copy-paste bug class (Phase 9's FMS, Phase 10's IPC/ABDM)
  — Day Closure's override is a confirmed widening with nothing dropped, and Payments has no
  override to copy-paste from in the first place.

---

## Content gaps found — all three fixed

- **`PaymentsPage.tsx` didn't use `formatCurrency()`/`formatINR()` — fixed.** It used to define its
  own local `fmt` helper hand-rolling the same `toLocaleString("en-IN")` logic instead of importing
  from `src/lib/currency.ts`, unlike `DailyCashClosurePage.tsx`, which correctly uses `formatINR()`
  throughout. `fmt` now delegates to the shared `formatINR()`.
- **The Mode filter dropdown was narrower than the modes the rest of the screen displays — fixed.**
  All ten modes (`cash, upi, card, insurance, pmjay, net_banking, cheque, advance_adjust, credit,
  donation`) already rendered correctly in the table and chart, but the filter dropdown only
  offered six of them. The five missing options (Net Banking, PM-JAY, Advance Adjust, Credit,
  Donation) are now in the dropdown too.
- **The "Print Summary" button skipped the required `fetchHospitalBrand()` call and printed
  content-free output — fixed.** It now calls `fetchHospitalBrand()` before `printHeader()`/
  `printDocument()`, the same pattern every other correct print flow in this codebase follows, and
  the printed document now contains real content: the four KPI figures, the active date-range and
  mode-filter labels, a collections-by-mode breakdown table, and the currently visible ledger rows
  with a total — not just a static title and a date line.

---

## Quick reference — labels as they actually appear on screen

| What this file called it | What you'll actually see |
|---|---|
| Lock the day | **Lock Day** button (red, bottom-right of the variance bar) |
| Reopen a locked day | **Reopen Day** button (amber, next to the Locked badge — only visible if your role allows it) |
| Print the Tally sheet | **Tally Summary** button (top right of Day Closure) |
| Send a payment link | **Send Payment Link** → modal titled **Send Payment Link** → **Send on WhatsApp** / **Copy Link** |
| Reconcile a Razorpay transaction | **Manual Reconciliation** panel → **Look Up Transaction** → then **Attach ₹X Payment** on the matched bill |
| Print a donation receipt | **80G** button (only on `donation`-mode rows, only if 80G is configured) |
