# Day Care Unit Coordinator — Training Manual

## What this role does in the system

As a Day Care Unit coordinator — doctor, nurse, or receptionist — you run same-day procedure
admissions from one module: **Day Care Unit**. From here you book a procedure in advance, give
the patient an estimate and collect their deposit, admit them on the day, bill the procedure(s)
they actually had, and discharge, cancel, or reschedule the case — all expected to close out the
same calendar day it opened. This manual assumes you have never used hospital software before.

**This is a structurally different workflow from `ipd-ward-clerk.md`, not the same screens under
a different name.** That file's own stated scope is the logistics side of a long-stay IPD
admission: the 4-step admission wizard (Patient → Admission Details → Estimate & Deposit →
Review), bed assignment/reservation/transfer on the Bed Map, and the clerk's slice of a multi-day
discharge (initiate, then hand over paperwork once Clinical/Billing/Pharmacy clearances and a
signed Discharge Summary are all done elsewhere). None of that applies here:
- Day Care has **no bed management at all** — nothing in `DayCarePage.tsx` or its modals
  references a bed or ward; a day-care booking is a patient, one or more procedures, a doctor,
  and a scheduled date/time.
- Day Care's booking **does not admit the patient** — booking and admitting are two separate
  steps, gated by money, not by clinical/pharmacy sign-off.
- Day Care bills **per procedure, GST-exempt, at the rate frozen at booking** — a fundamentally
  different billing shape from an open-ended IPD stay's running tariff.
- Day Care's discharge checklist is **same-day by rule**, with its own audited "crossed
  midnight" exception path — IPD's discharge has no such same-day expectation at all.
- Day Care has its own **Cancel** and **Reschedule** actions for a booking that never happened or
  moved — IPD admission has neither, because by the time IPD's wizard completes, the patient is
  already admitted.

> **Access check — a clean bill, and the override here is a widening, not the usual bug
> pattern.** `src/lib/routeRoles.ts` line 12 carries an **explicit override** for this route:
>
> ```
> ROUTE_ROLES['/ipd/day-care'] = ['doctor', 'nurse', 'receptionist', 'billing_executive', 'super_admin', 'hospital_admin'];
> ```
>
> The module catalogue entry it overrides (`src/lib/modules.ts`, line 40) is narrower:
> `["doctor", "nurse", "receptionist", "super_admin"]`. **This is the opposite of the
> override-copy-paste bug Phase 9 found on FMS and Phase 10 found on IPC** — in both of those
> cases, the override *silently dropped* a role the catalogue intended. Here, the override only
> *adds* two roles the catalogue doesn't list — **`billing_executive`** and **`hospital_admin`** —
> and drops nothing the catalogue granted. Every role on the override list has an operational tie
> to this screen: Doctor/Nurse run the clinical side, Receptionist books and manages the board day
> to day, and Billing Executive is added because Day Care's financial gate (Section 3) and
> procedure billing (Section 4) are core to this workflow, not incidental to it — unlike the
> FMS/IPC cases, there is no role on this list without a real reason to be here.
>
> Every one of those five roles is **already a default role card** on **Settings → Staff
> Members → Add Staff Member** (Doctor, Nurse, Receptionist, Billing Executive are all on
> `DEFAULT_ROLE_CARDS`; `hospital_admin`/`super_admin` are the standing admin accounts every
> hospital already has) — so there is **no one-time custom-role step** needed for this module at
> all, a clean bill. Worth noting directly against `ipd-ward-clerk.md`: that file found IPD proper
> has **no** Receptionist access at all (`doctor`, `nurse`, `super_admin` only) — Day Care's own
> override is the one place in the IPD family where a Receptionist login can actually run a
> same-day admission board.

All dates on screen show as DD/MM/YYYY (`en-IN`, via `formatDateIST`). All money shows as ₹ via
`formatINRExact`.

---

## 1. The board — finding a case

1. In the left-hand menu, click **Day Care Unit**. This opens a two-panel board: a patient list
   on the left, detail on the right.
2. At the top of the list panel, pick **Today** or **Yesterday**, or use the date field to jump
   to any date.
3. Below that, pick a status tab: **Scheduled**, **Active**, **Discharged**, or **Cancelled** —
   each tab filters both the status *and* which date column is being filtered (scheduled date for
   Scheduled, admission date for the others).
4. Use the search box to filter by patient name, admission number, or procedure name.
5. Click a patient's row to open their detail on the right. Each row shows the patient's name, a
   payer badge (Self Pay / Insurance / PMJAY / CGHS / ECHS), the procedure name(s), and either the
   scheduled time (Scheduled tab) or admitted time (other tabs).

---

## 2. Booking a day-care admission

Booking reserves the slot and starts the financial-clearance clock — **it does not admit the
patient.** The patient is admitted later, from the Scheduled tab, once they actually report and
are financially cleared (Section 3).

1. Click **"Book Procedure"** at the top of the screen.
2. **Step 1 — search and select the Patient** by name, UHID, or phone.
3. **Step 2 — Procedure & Details**:
   - Click the **"Day Care Procedures"** picker and tick every procedure for this visit — a day
     care list routinely bundles more than one, and a bilateral case (e.g. cataract, both eyes) is
     the same procedure selected with its quantity set to 2 using the **+/−** controls next to it.
     Each selected line shows its rate × quantity, and the picker's own total updates live.
   - Pick the **Doctor \***.
   - Set **Scheduled Date & Time \***.
   - Pick the **Payer** — Self Pay / Insurance / PMJAY / CGHS / ECHS — and, if not Self Pay, the
     **Policy / Member ID**.
   - Optionally add **Clinical Notes** (pre-op instructions, allergies, contraindications).
   - If any selected procedure requires pre-authorisation and the payer isn't Self Pay, the screen
     shows an amber note that an insurance intimation will be raised automatically, due 2 hours
     before the scheduled time.
3. Click **"Book Procedure."** The screen then jumps straight to the Scheduled tab, on the date you
   just booked, with that patient selected — and opens the Estimate & Deposit step (Section 3)
   immediately, so counselling happens right after booking rather than as a separate click later.

---

## 3. Clearing the booking financially — Estimate & Deposit, and the admit gate

Before a patient can be admitted, this module checks they are **financially cleared** — the real
rule, read directly from `src/lib/dayCareGate.ts`, which this screen's counselling flow and a
database trigger (`enforce_daycare_financial_clearance()`) both enforce independently:

- **Self-pay** (or insured with no pre-authorisation decision yet): the patient must have paid at
  least the required deposit — by default **100% of the estimate** (your hospital's Hospital Admin
  can lower this percentage on **Settings → Day Care Procedures**).
- **Payer approved in full:** nothing is required at the door.
- **Payer approved only part of the estimate:** the gap between the estimate and the approved
  amount becomes the patient's own required deposit (e.g. a payer approving ₹30,000 of a ₹47,000
  estimate leaves ₹17,000 payable by the patient).

To give the estimate and collect the deposit:
1. Select a Scheduled booking, then click **"Estimate & Deposit"** (or, if a partial deposit is
   already on file, the button instead reads **"Pay Remaining (₹X)"**).
2. The estimate form opens pre-filled with the booking's total procedure charge and a deposit
   figure derived from your hospital's deposit percentage. Adjust and confirm as counselling
   requires, then collect the deposit via the usual advance-receipt flow.
3. Once the deposit required is fully collected, the button on the patient's detail panel changes
   to a disabled **"Deposit Paid"** badge.

If you click **"Admit Patient"** before the patient is cleared, the **Payment required before
admission** gate opens instead, showing Deposit Required / Collected So Far / Shortfall, and two
ways forward: click **"Collect ₹X"** to take the outstanding amount right there, or — only if your
login's role is on the policy's override list — click **"Override…"**, type a mandatory reason
(e.g. "Free camp patient, approved by MD"), and admit anyway. Every override is written to
`clinical_alerts` as a high-severity, audited entry naming the role, the shortfall, and the reason
typed.

> **Fixed — in two parts.** The "Override…" button only appears when `canOverrideDayCareGate()`
> finds your login's `role` string inside `policy.overrideRoles`. The **default** policy used to
> set that list to literally `["admin", "billing"]` — neither a real login role anywhere in this
> app — so by default no login at all, not even Super Admin, could use the audited override; only
> "Collect ₹X" worked. `DEFAULT_DAY_CARE_POLICY.overrideRoles` now reads `["hospital_admin",
> "super_admin", "billing_executive"]`, the real role strings with a genuine operational tie to
> this gate. **A second, less obvious fix was needed alongside it**: `SettingsDayCareProceduresPage.tsx`'s
> save handler always re-persists the *current* override list whenever a hospital saves any change
> on that settings screen (toggling "Require Clearance," editing the deposit percentage) — so any
> hospital that had touched that screen before this fix would have the broken `["admin","billing"]`
> permanently baked into their own `hospital_settings` row, which the app prefers over the
> corrected code-level default. A backfill migration corrects any already-persisted row still
> carrying that exact broken value. The Settings screen still has no input control to let a
> hospital *customize* the override list beyond this corrected default — a smaller, separate
> follow-up, not required to close the access gap itself.

---

## 4. Admitting the patient and billing the procedure(s)

1. Once cleared (or overridden), click **"Admit Patient."**
2. The booking becomes a real admission — status flips to Active, the arrival time is stamped, and
   the board switches you to the Active tab with this patient selected.
3. Billing happens automatically, right after admission: **every booked procedure gets its own
   line item** on the patient's bill (not one blended total), at the rate frozen when it was
   booked — not a fresh read of the procedure's price if it has since changed in Settings — and
   with **0% GST**, because a healthcare procedure is statutorily GST-exempt. If a deposit was
   collected before the bill existed, it is matched into the bill automatically at this point.
4. If the billing step itself fails for any reason, admission still stands — the patient is not
   stranded — but the screen warns you plainly (**"Procedure not billed — add it in Billing"**)
   rather than silently losing the charge.
5. On the Active or Discharged tab, click **"Print Bill"** to print the itemised bill — day care
   previously had no bill print at all, only a deposit receipt that showed a lump sum and never
   said what it bought.
6. Selecting an Active or Discharged patient also shows a **Financials** panel: Estimate Given,
   Deposit Collected, Billed So Far, an **Over/Under Estimate** variance line (only shown once the
   difference is ≥ ₹1), and the current Balance Due — with an **"Open in Billing"** shortcut if you
   need to adjust the bill directly.

---

## 5. Discharging a day-care case

1. Select an Active patient and click **"Discharge."**
2. Tick the three clinical checklist items — **"Procedure completed successfully,"** **"Patient
   stable, vitals checked, fit for discharge,"** **"Discharge instructions given, consent
   signed"** — these are self-attested by you, the clinical team is the source of truth on them.
3. **"Bill finalised and payment cleared"** is **not** a checkbox — it is derived automatically
   from the real bill (its status, payment status, and balance due) and shown with a ✓ or ✗, so it
   cannot be ticked on a bill that doesn't exist or isn't actually settled.
4. Confirm or adjust the **Discharge Date & Time** (defaults to now, editable because a discharge
   is often recorded slightly after the fact).
   - If the discharge time would fall on a **later calendar day (IST) than the admission**, an
     amber **"Discharging on a later day than admission"** panel appears: pick a reason from a
     preset list (Extended recovery/observation, Post-procedure complication, Procedure started
     late in the evening, Discharge completed but not recorded in the system, Patient/attendant
     delayed, Waiting on transport) or type one of your own — a reason is mandatory before you can
     proceed, and it is recorded as an audited exception. If the patient genuinely left the same
     day, correct the discharge time instead rather than justifying a late one.
5. Add free-text **Discharge Notes** (post-procedure instructions, follow-up date, medications).
6. Click **"Print Bill"** here too, if it hasn't been printed yet, so the patient leaves holding
   the itemised bill rather than just the deposit receipt.
7. Click **"Confirm Discharge"** (disabled until every item above is satisfied). The system then
   discharges the admission and settles any remaining advance — if the patient overpaid, the
   excess is automatically sent for refund approval rather than handed back on the spot.

---

## 6. Cancelling or marking a booking as a no-show

Only available on a **Scheduled** (not-yet-admitted) booking.

1. Select the booking and click **"Cancel"** (or **"No-Show"** if the patient simply never
   reported — pre-fills the reason as "patient no-show").
2. Pick a **Reason \*** from your hospital's configured cancellation-reason list, and an optional
   **Note**.
3. If a deposit was already collected, choose what happens to it:
   - **"Refund the full deposit"** — raised for approval; no cash leaves until a second person
     approves it.
   - **"Retain a fee, refund the rest"** — enter the fee to retain; it is billed as a real
     cancellation-charge line item (so the revenue is recognised, not just kept off the books),
     and the rest goes to refund approval the same way.
   - **"Hold it against a future booking"** — nothing is refunded or billed; the deposit stays on
     this same admission record. (If you actually mean to keep the same booking but move its
     date, use **Reschedule** — Section 7 — instead of this.)
4. Click **"Cancel Booking"** / **"Mark No-Show."** The booking's status flips, any pending
   insurance intimation for it is retired so it doesn't later fire a false "missed intimation"
   alert, and an audit entry is written either way.

---

## 7. Rescheduling a booking

Only available on a **Scheduled** booking — once admitted, a case can no longer be rescheduled.

1. Select the booking and click **"Reschedule."**
2. Pick the **new date & time \*** (must be in the future) and an optional **Note** on why it
   moved.
3. If a deposit is already held, the screen confirms it stays with this same booking — nothing is
   refunded or re-collected just for moving the date.
4. Click **"Reschedule."** The booking keeps its same admission record (so its deposit rides
   along), its expected discharge date moves with it, and any pending insurance intimation
   deadline is re-anchored to 2 hours before the new scheduled time.

---

*This manual covers the Day Care Unit screens as they exist in Aumrti HMS today, including the
admit-gate override-role gap noted in Section 3. If a screen looks different from what is
described here, tell Radha (IPD & Ward Management, which includes Day Care) so the manual can be
corrected.*
