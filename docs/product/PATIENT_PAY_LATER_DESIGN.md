# Patient Pay-Later (Self) — Design Decision

**Date:** 2026-09-21
**Trigger:** Hospital demo feedback — OPD → Lab/Diagnostics credit workflow
**Target market:** Indian hospitals, primarily rural
**Team:** Nikhil (PM) convening revenue, clinical, data, frontend, security, platform, growth, quality pods
**Status:** Design complete. **NOT approved to build** — three decisions belong to Preethi (§12).

---

## 0. Executive summary

The hospital asked for a "Credit option for lab and diagnostics." That is the right *need* and the
wrong *ticket*. Three things reframe it:

1. **OPD deliberately has no payment gate** — not because we forgot, but because the OPD order
   modals *refuse to create the order row until cash is taken*. There is no unpaid order to block.
   That is precisely why the patient who says "I'll bring money in an hour" cannot have the test
   ordered at all.
2. **Uncontrolled patient credit already flows** through ~20 other modules and through the pharmacy
   retail counter, where it is recorded as *fully paid*. This project is roughly **30% new
   capability and 70% governing credit that already flows ungoverned.**
3. **Your two guesses — IPD and Day Care — are both already covered**, and adding Pay-Later to Day
   Care would be actively harmful. The modules that actually need work are OPD, Lab, Radiology,
   Emergency and Settings.

The value is not in the button. It is in **day-close visibility** and the **order-to-service gate**.

> **Design law adopted as a build gate (Deepa, growth):**
> *Removing friction without adding visibility is leakage.* The paper notebook's friction is itself
> a rationing control. Ship the fast button **without** the day-close line, the outstanding list and
> the attribution, and we have stripped the control and added convenience — that version makes the
> hospital **worse off**. Ship all of them or none.

---

## 1. Five findings that change the shape of the feature

All five independently verified against the codebase.

| # | Finding | Evidence | Verified |
|---|---|---|---|
| **F1** | **We already ship the broken version.** Pharmacy Retail has a live **"Credit"** tender. The sale-completion path writes `paid_amount: netTotal`, `balance_due: 0`, `payment_status: "paid"` — **unconditionally, for every tender including credit**. A pharmacy credit sale is recorded as fully collected. The receivable exists nowhere. | [RetailPayment.tsx:433](../../src/components/pharmacy/retail/RetailPayment.tsx#L433) (mode), [:186-188](../../src/components/pharmacy/retail/RetailPayment.tsx#L186-L188) (write) | ✅ confirmed — single unconditional write, no branch on mode |
| **F2** | **An ED STAT troponin cannot exist until someone pays.** Emergency opens the lab and radiology modals with **no `linkedAdmissionId`**, so both route through `handleCollectAndCreate` — cash first, order second. | [EmergencyWorkspace.tsx:1070](../../src/components/emergency/EmergencyWorkspace.tsx#L1070), [:1082](../../src/components/emergency/EmergencyWorkspace.tsx#L1082) | ✅ confirmed — no admission prop passed |
| **F3** | **Uncontrolled patient credit already flows.** `autoChargeService` and `chargePosting` mint `payment_status: 'unpaid'` bills across ~20 modules today (dialysis, physio, ambulance, AYUSH, home care), and `WalkInModal.handlePayAndIssue(skipPayment)` does it in OPD. | [serviceBilling.ts](../../src/lib/serviceBilling.ts), [chargePosting.ts](../../src/lib/chargePosting.ts) | ✅ pattern confirmed |
| **F4** | **Every OPD credit becomes uncollectable the night it is issued.** `isLockExempt` returns `false` for any bill without an `admission_id`. Day locks at closure → patient returns Wednesday → *"Day is locked. Reopen it first."* | [lockedDay.ts:68](../../src/lib/lockedDay.ts#L68), enforced in [billPayments.ts](../../src/lib/billPayments.ts) via `checkBillWritable` | ✅ confirmed — **blocking** |
| **F5** | **`CLAUDE.md` §Testing is stale and misinforming every agent.** It says "There is no unit or e2e test command right now." CI runs **three jobs** including `npm run test:coverage` and Playwright across **both tenants**; `npm test` exists. | [ci.yml:125](../../.github/workflows/ci.yml#L125), [:168](../../.github/workflows/ci.yml#L168); [package.json:16-19](../../package.json#L16-L19) | ✅ confirmed — coverage **is** a merge gate |

---

## 2. What already exists — reuse, don't rebuild

The feature is further along than it looks. The gap is narrow and specific.

| Capability | Location | Status |
|---|---|---|
| Per-line `payment_status: pending_payment` | [chargePosting.ts](../../src/lib/chargePosting.ts) | ✅ exists |
| Service-delivery block + audited override | [ipdAncillaryGate.ts](../../src/lib/ipdAncillaryGate.ts), [ancillaryGateChecks.ts](../../src/lib/ancillaryGateChecks.ts) | ✅ exists — **IPD-only** |
| Collection worklist screen | [PendingCollectionsPanel.tsx](../../src/components/billing/PendingCollectionsPanel.tsx) | ✅ exists |
| Patient outstanding aggregation | [outstandingBalance.ts](../../src/lib/outstandingBalance.ts) | ✅ exists |
| Outstanding banner at registration | [OutstandingBalanceBanner.tsx](../../src/components/billing/OutstandingBalanceBanner.tsx) | ✅ exists |
| GL **1010 Accounts Receivable – Patients** | [seed_hospital_defaults.sql:70](../../supabase/migrations/20260613110000_seed_hospital_defaults.sql#L70) | ✅ already posting on accrual |
| Credit limit + auto-hold | [creditLimitCheck.ts](../../src/lib/creditLimitCheck.ts) | ⚠️ **payers only** (TPA/corporate) |
| Day-care deposit gate + DB trigger | [dayCareGate.ts](../../src/lib/dayCareGate.ts), migration `20261008000140` | ✅ exists |
| Append-only ledger + derived-balance view precedent | `ipd_advances` / `ipd_advance_balances`, migration `20260902000001` | ✅ proven pattern to copy |

**The actual gap:** a patient-level credit authorisation layer (the self-pay twin of
`checkPayerCreditLimit`), plus letting an OPD order **exist in an unpaid state** so the gate
machinery that already works for IPD can govern it.

The decisive code comment, written by us, before this request existed:

> *"OPD looks like it has a payment gate; it does not. Its order modals simply refuse to create the
> order row until cash is taken (see `NewLabOrderModal.handleCollectAndCreate`), so there is never
> an unpaid order to block."*
> — [ipdAncillaryGate.ts:17-22](../../src/lib/ipdAncillaryGate.ts#L17-L22)

---

## 3. Naming — settled

`payer_masters.credit_limit` / `credit_hold` / `checkPayerCreditLimit` already exist and mean
**corporate/TPA credit**. Reusing the word collides with a live concept in our own ageing reports
and in staff vocabulary.

| Surface | Term |
|---|---|
| Counter button | **Pay Later** |
| Bill / list state | **Payment Pending** (reuses existing `pending_payment`) |
| Owner's screen | **Outstanding** |
| Printed slip | **Payment Due Slip** + vernacular (Hindi **बाकी**, Telugu **బాకీ**) — never *udhaar*, *loan*, *credit* |
| Internal / DB | `patient_credit_*` (fine; never user-visible) |

**Forbidden anywhere a patient or clinician can see:** "defaulter", "blocked", "blacklist", "credit".

---

## 4. Module-by-module verdict (all 67)

### 4.1 The two you asked about — both already covered

**IPD / Wards — ALREADY COVERED. Do not build.**
IPD *is* a credit line. `resolveChargePaymentStatus()` returns `advance_covered`, which the file's
own comment defines as *"carried by the admission, settle at discharge"* — not "money received".
The admission bill is the credit account, `ipd_advance_balances` is the ledger, the deposit is the
limit. Adding a parallel patient-credit object over the same `source_dedupe_key` lines gives the
discharge sweep **two ledgers answering one question**. The genuine IPD gap — *discharge against an
unpaid balance* — is a discharge-clearance question, not an order-time one.

**Day Care — ALREADY COVERED, and Pay-Later here is actively harmful.**
From `dayCareGate.ts`'s own header: *"an elective day care patient walks out the same day. There is
no leverage to collect afterwards."* A pay-later option removes the one control that exists
*because* it cannot be recovered. It is also **DB-trigger enforced** (migration `20261008000140`),
so a client-side flag would either be silently ignored (staff see "approved", admission still fails,
nobody knows why) or force weakening the trigger. The controlled exception already exists:
`admissions.financial_override_by` + `financial_override_reason`, or `require_clearance: false` in
settings. **Zero engineering.**

### 4.2 Full matrix

| Verdict | Modules |
|---|---|
| **IN SCOPE — v1 UI** | OPD Queue (handoff), Laboratory (LIS), Radiology (RIS), Settings Hub (policy panel) |
| **IN SCOPE — ships first, separately, statutory** | **Emergency** (F2 — needs an *unconditional* unpaid path, not a toggle) |
| **IN SCOPE — v2, restricted, default OFF** | Pharmacy IP (different risk class — §8.4) |
| **IN SCOPE — guard assertion only** | Medical Records (an unpaid bill must never block record release), ABDM (must never block care-context linking) |
| **ALREADY COVERED — visibility only, no build** | Dialysis, Physiotherapy, Home Care, AYUSH, Dental, Mental Health, Chronic Disease Mgmt, Oncology, Ambulance, Obstetric ANC, Billing/Collections (`CollectionsTab` already has outstanding + ageing + EMI), Patient Portal, Communication Inbox, Insurance/TPA (pre-auth *is* credit with a payer), Govt Schemes / PMJAY |
| **ALREADY COVERED — and adding it is harmful** | **IPD**, **Day Care**, Telemedicine (keep pre-paid: no physical presence, the consult *is* the product) |
| **OUT — hard clinical rule, non-configurable** | Blood Bank (never gate cross-match or issue), Mortuary & MCCD (a body is never held for money), Partograph / Delivery Record (labour is an emergency), MCI / Disaster (global kill-switch suspends all financial gates), cytotoxic reconstitution (once reconstituted the money is spent regardless) |
| **OUT — wrong instrument** | Operation Theatre (estimate + advance), IVF & ART (contracted tranches), Health Packages (a package on credit is an unsecured loan with a discount attached), Pharmacy Retail v1 (breaks Z-report + day closure), Nursing / Dietetics (never a money surface) |
| **OUT — no patient money path** | CSSD, IPC, FMS, Biomedical, Housekeeping, Govt HMIS, HR & Payroll, Analytics & BI, HOD Dashboard, TV Display, Population Health, Research, Notifications, Financial Statements, Budget, Fixed Assets, Neonatal EMR, Anaesthesia EMR, Ophthalmology EMR, Vaccination, Patient Relations, Staff Training, CRM, JCI |

> **Net: 4 modules build in v1, 1 ships first separately, 1 in v2, 2 need guard assertions.
> Everything else is already credit-capable or explicitly refused.**

---

## 5. Data model

### 5.1 Credit is NOT a tender

**A Pay-Later grant never produces a `bill_payments` row.**

Decisive reason, verified: [billPayments.ts](../../src/lib/billPayments.ts) reads the authoritative
`balance_due` and refuses at `<= 0` — *"This bill is already fully paid — nothing left to collect."*
A `'credit'` payment row zeroes the balance, so **the later real cash collection is rejected through
the only sanctioned path.**

Secondary confirmations:
- `billMoney.directPaid` would mark the bill `settled`.
- [tallyXmlGenerator.ts:81](../../src/lib/tallyXmlGenerator.ts#L81) maps `credit → "AR - Patients"`
  and emits a `Dr AR / Cr AR` null Receipt voucher — **firing today on every pharmacy retail credit
  sale.**

### 5.2 Money stays where it is

A Pay-Later is **one `bills` row**: `bill_status='final'`, `payment_status='unpaid'`,
`balance_due > 0`, `encounter_id` **NOT NULL** (nullable in schema; enforce on this path).

**Do not add `'credit'` to the `bills.payment_status` CHECK.** It forks every
`payment_status IN (...)` predicate in `metrics_registry`, `api_event_outbox`,
`PendingCollectionsPanel` and `computeBillTotals`. A Pay-Later bill is genuinely *unpaid*.

### 5.3 Lifecycle in a new append-only ledger — balance DERIVED, never stored

```sql
public.patient_credit_ledger          -- append-only. No UPDATE. No DELETE. No soft-delete.
  hospital_id       NOT NULL FK hospitals
  patient_id        NOT NULL FK patients ON DELETE RESTRICT
  bill_id           NOT NULL FK bills    ON DELETE RESTRICT
  entry_type        CHECK IN ('issue','recover','waive','write_off','reissue')
  amount            numeric(12,2) CHECK (amount > 0)
  signed_amount     GENERATED ALWAYS AS (CASE WHEN entry_type IN ('issue','reissue')
                                          THEN amount ELSE -amount END) STORED
  authorised_by     FK public.users(id)   -- NOT auth.users (check:user-fk)
  authorisation_reason, due_date
  bill_payment_id   FK bill_payments             -- 'recover' only, trigger-written
  approval_id       FK patient_credit_approvals  -- 'waive'/'write_off' only
  corrects_entry_id FK self                      -- append-only correction
```

Plus `public.patient_credit_approvals` (mutable request/decide lifecycle) and a
`patient_credit_balances` view = `SUM(signed_amount)`.

### 5.4 Ruled OUT — and this is the important part

**No mutable `outstanding_amount` column anywhere.** Revenue-pod proposed a maintained cache
mirroring `payer_masters`. Rejected for a reason **already proven in this repo**:

> [creditLimitCheck.ts:81-132](../../src/lib/creditLimitCheck.ts#L81-L132) does
> `SELECT outstanding_amount` → compute in JS → `UPDATE`.
> **Two cashiers collecting concurrently both read `10000`, both write `10000 − their_amount`.
> One collection is silently erased.**
> That is literal revenue leakage, produced by a mutable column, in code already shipped.

**No `outstanding_amount` on `patients`.** It is the single most likely way this leaks onto a
doctor's screen — through every existing `patients` read path, every RLS policy that lets clinical
roles read `patients`, and every `select('*')`.

**Precedent to follow:** `ipd_advances` (append-only, `transaction_type`) + `ipd_advance_balances`
(a `SUM(CASE...)` view), migration `20260902000001` lines 30-82. Proven in this codebase.

---

## 6. Anti-leakage — the structural answer to your question

### 6.1 Your premise was wrong, and it helps you

`bills.patient_id` is **`uuid NOT NULL REFERENCES public.patients(id)`**
([20260322092601](../../supabase/migrations/20260322092601_*.sql), verified), and `WalkInModal`
mints a patient + UHID before inserting any bill.

**A credit orphaned from a patient is already structurally impossible.** No new guarantee needed
there. The real leakage vectors are three others.

### 6.2 The guarantees that must be built

| Vector | Guarantee |
|---|---|
| **Wrong patient / cross-tenant attribution** | `BEFORE INSERT` trigger asserting `bills.patient_id = NEW.patient_id AND bills.hospital_id = NEW.hospital_id`. Postgres cannot express a cross-table CHECK, and the two FKs are independent — nothing today stops a row claiming patient A while pointing at patient B's bill. **This is the structural answer you asked for.** |
| **Silent zeroing** | `BEFORE UPDATE` on `bills`: raise if the bill has an `issue` row, `NEW.balance_due <= 0`, and ledger net for that bill is still `> 0`. Forces a `recover`/`waive`/`write_off` row to exist before money can be declared collected. **The keystone.** |
| **Fabricated recovery** | `recover` rows written **only** by an `AFTER INSERT` trigger on `bill_payments`. Humans structurally cannot insert one. One money path; ledger as atomic mirror. |
| **Editing history** | `REVOKE UPDATE, DELETE` **plus** a `BEFORE UPDATE OR DELETE` RAISE trigger — the REVOKE alone does not stop `service_role`, and every Edge Function runs as `service_role`. Given the Phase 4 audit found 24 cross-tenant Edge Function vulns, assume one will eventually point here. |
| **Double-issue / double-count** | Partial uniques: `UNIQUE(bill_id) WHERE entry_type='issue'`; `UNIQUE(bill_payment_id) WHERE entry_type='recover'`. |
| **Patient never returns** | Nothing closes. Ages in buckets from `issue.due_date`. Leaves the books only via approved write-off with a GL entry. Never a delete; never `balance_due = 0` by update. |

### 6.3 Cashier pockets the cash and marks it Pay Later

Four layers — and honestly, at a single-desk rural hospital the approver and the cashier are often
the same person:

1. **The serial-numbered patient slip.** A patient who paid cash and was handed a "payment pending"
   slip complains. This is the real control.
2. **Per-cashier daily Pay-Later ceiling — blocked, not reviewed.**
3. `bill_payments.received_by` attribution.
4. **Write-off is a different permission from grant.** Get this wrong and staff cancel the bill
   instead, which is untraceable.

### 6.4 The hole this does NOT close — flagged, not hidden

**Duplicate patients.** [WalkInModal.tsx:435-463](../../src/components/opd/WalkInModal.tsx#L435-L463)
— duplicate detection is *advisory*; staff click "Create New Anyway". The same human becomes two
UHIDs, credit fragments, and the UHID in front of you reads ₹0. **No constraint on a new table fixes
this.**

> The no-leakage requirement is **not** honestly met while patient-merge is open.
> ~5 engineer-days, separate scope, and it is a priority call for Preethi — not an engineering one.

---

## 7. Day-end reconciliation — the highest-ROI element

**Pay-Later is a NON-TENDER.** `computeDayClosureTotals` answers exactly one question: *"how much of
this tender physically moved today."* A Pay-Later moved ₹0. Same reasoning that already excludes
`INTERNAL_TRANSFER_MODE = 'advance_adjust'`.

**If it enters the tender buckets:** `bucketForMode` dumps it in `other`; `other` is inside
`totals.total` ([dayClosureTotals.ts:121](../../src/lib/dayClosureTotals.ts#L121)) but **not** in
`MODES` on the closure page (line 40), so `manualTotal` cannot include it and **`variance` shows a
shortage equal to the day's credit every single evening.** The variance control that catches real
theft becomes noise.

New fields on `SystemTotals`, beside `refunds`/`advances`, **excluded from `total`**:

| Bucket | Treatment |
|---|---|
| `creditIssued` | Informational. Attributed to the granting user → splits via `groupTotalsByCashier`. **This is the fraud detector.** |
| `creditRecovered` | Already inside cash/upi (a real `bill_payments` row). Label *"included above — for reference"*, exactly like `advances` today. Never added to total. |
| `creditOutstanding` | Carried forward. Separate strip, never in variance maths. |

**On a ₹400 Pay-Later the drawer reconciles at ₹0 impact.** Cash counted = cash in system, variance
zero, plus a separate line: *"Pay Later issued today: ₹400 (1 patient)."* The supervisor locks a
balanced drawer **and** sees what they are carrying.

> The real cost-to-serve is not chasing the debt — it is the **20-40 minutes and an accusation**
> every unexplained drawer variance costs. That makes the day-close line the single highest-ROI
> element in this design, ahead of the outstanding list and far ahead of approvals.
> **If sequencing forces a cut, cut approvals; never cut this.**

---

## 8. Clinical safety, accounting, authorisation

### 8.1 Accounting & GST — mostly already correct

**Headline, and it deflates most of the worry:** diagnostic services by a clinical establishment are
**exempt** under Notification 12/2017-CT(R) Sl. No. 74, and
[gstRules.ts](../../src/lib/gstRules.ts) already carries `lab: 0, radiology: 0` (verified).
**A ₹400 lab test on Pay-Later carries ₹0 GST.** No output tax to fund out of pocket. The GST
question only bites on pharmacy (12%) — which is precisely why pharmacy is v2.

| Question | Answer |
|---|---|
| Revenue recognition | **At service delivery, not cash receipt** (CGST s.13). System already behaves this way: `bill_status='final'` → `auto_post_bill_journal` → accrual. **No change.** |
| Tax invoice timing | Issue at service delivery. A **bill of supply under Rule 49** must still be raised for the exempt supply even though payment is deferred. |
| GSTR-1 on an unrecovered credit | **Nothing to do. Do NOT issue a credit note.** s.34 covers reduction in value or deficiency in supply; non-payment is neither, and **GST has no bad-debt relief provision.** The supply stays declared. A write-off is a books event, not a returns event. |
| Hard block required | A hospital must never "fix" an unrecovered credit by cancelling the invoice. Post-IRN, cancellation is IRP-only within 24h. Hang the block on `bills.irn` / `bill_status='irn_locked'`. |

**GL entries** against the seeded COA in
[seed_hospital_defaults.sql:62-147](../../supabase/migrations/20260613110000_seed_hospital_defaults.sql#L62-L147):

- **Issue** — `Dr 1010 AR-Patients / Cr 4004 Lab Revenue`. **Already correct, zero work** —
  `auto_post_bill_journal()` fires on `bill_status='final'` regardless of payment.
- **Recovery** — `Dr 1001 Cash / Cr 1010 AR-Patients`. **Already correct, zero work** via
  `recordBillPayment` → `autoPostJournalEntry`.
- **Write-off** — `Dr 5070 Bad Debts / Cr 1010 AR-Patients`. **`5070` does not exist.** Seeded
  expenses run 5001→5060 with no bad-debt account. Add `5070` + `1019 Provision for Doubtful Debts`,
  backfill existing hospitals (pattern exists in `20261008000048`), add one `auto_posting_rules` row
  `trigger_event='patient_credit_write_off'`.

**Tally — pleasant surprise.** `generateSalesVouchers`
([tallyXmlGenerator.ts:128-130](../../src/lib/tallyXmlGenerator.ts#L128-L130)) already debits AR for
the full `total_amount` — **already accrual**. A Pay-Later bill exports as a Sales voucher with no
matching Receipt; AR sits open, exactly right. Two items: **delete
`PAYMENT_MODE_LEDGER['credit']`** ([line 81](../../src/lib/tallyXmlGenerator.ts#L81)) — it emits null
`Dr AR / Cr AR` Receipt vouchers today; and confirm the journal export is not filtered to
`entry_type='manual'`.

### 8.2 Controlled authorisation — arbitrated

Three pods disagreed. The ruling:

**Attribution, not approval, for the grant.** There is no second person at 7pm at a 30-bed hospital,
and a two-person model is defeated within a week by password sharing — producing entries reading
"approved by Dr. Owner" that are **worse than no approval**, because it is a false audit record we
then have to defend in a dispute. The notebook's control is handwriting: it identifies the person.

1. **Self-authorised, attributed.** Granted under the user's own login, their name on it.
2. **Per-grant ceiling above which a second person is needed — set high enough to fire maybe once a
   week, not five times a day.** Default ₹2,000–3,000, configurable. *A control that fires
   constantly is a control staff learn to click through — and that habit then applies to every
   control we ever ship.*
3. **That escalation is asynchronous.** Blocking approval at 7pm turns the patient away — we would
   have reproduced the original problem in a new location and called it a feature.
4. **Maker-checker IS mandatory — for write-off and waiver only.** Always, any amount. This is the
   one that becomes embezzlement. Trigger-enforced (`decided_by <> requested_by`), not UI. Clone
   `20260908000011_discount_approvals.sql` + `20261009000173` — the second already **freezes the
   authorised role set onto the row** so a later settings change cannot retroactively legitimise an
   approval.
5. **The real control is the evening summary.** *"Today: 6 Pay Later, ₹2,450. Total outstanding
   ₹18,300."* The owner reading that daily **is** the control — and it is the retention hook that
   makes him open the product.

**Caps.** Per-patient caps are decorative when identity is unreliable — a ₹2,000 cap never
accumulates against the right record across four "Ramesh" rows. The caps that actually bind are the
two that **do not depend on identity resolution**: **per-transaction cap** and **per-cashier daily
ceiling**. Per-patient cap exists but defaults generous. Plus one genuinely free, high-value rule:
**a patient with zero completed encounters gets ₹0** (count `opd_encounters`).

**Blocklist — REFUSED as framed.** There must be **no `defaulter_blocklist` table.** The restriction
must be **derived** from the ledger (outstanding > threshold AND oldest > N days) so it self-corrects
on payment and cannot be hand-stuffed with a name. **DPDP S.8(3)** bites: data used to make a
decision affecting the Data Principal must be accurate and complete. Given shared phones and
unreliable identity, a blocklist here has a **high false-positive rate by construction** — blocking
the wrong person because their brother owes ₹600 is the *expected* failure, and S.8(3) puts that on
the hospital.

**Generalise `creditLimitCheck.ts`?** Yes to the shape, **no** to the storage. Refactor to
`checkCreditLimit(hospitalId, {scope:'payer'|'patient', id}, amount)` with two adapters — but the
patient adapter reads the **derived view**, never a mutable column. Also fix two live bugs in it:
the read-modify-write race, and `decreasePayerOutstanding`'s `SELECT` **missing
`.eq("hospital_id", ...)`** — a cross-tenant *read* of another hospital's credit limit
([creditLimitCheck.ts:86-90](../../src/lib/creditLimitCheck.ts#L86-L90), verified; it fails closed on
the write, but it is a read leak).

### 8.3 Clinical safety — spec-ready, non-configurable

> **CR-1 — Pay-Later never touches a result.** A patient's outstanding balance, credit status,
> approval, or limit MUST NOT influence the entry, verification, authorisation, release, printing,
> portal publication, ABDM linkage, or clinician notification of any laboratory result, pathology
> report, microbiology report, radiology report, or discharge summary. Payment state is evaluated at
> exactly two points — **order creation** and **the first irreversible service-delivery step** — and
> nowhere downstream.

> **CR-2 — Critical values are unconditional.** A result meeting the critical/panic threshold
> (`result_flag` `CH`/`CL`, or radiology `is_critical`) MUST be released and the alert raised within
> the standard 60-second window regardless of payment state — never delayed, batched, downgraded, or
> annotated with financial information. Where a critical value arises on an unpaid order, the system
> MUST **additionally and automatically clear that order's financial gate for all remaining steps of
> the same episode** and log `credit_gate_auto_released`. **No human approval required.**

> **CR-3 — Emergency and life-safety exemption.** No financial gate applies to: an ED encounter
> prior to stabilisation; any order of priority `stat`/`urgent`/`emergency`; **any** service while an
> MCI activation is open; blood cross-match and issue; obstetric labour, delivery, neonatal
> resuscitation; psychiatric emergency assessment; mortuary release and MCCD issue. ON by default,
> **NOT configurable per hospital.**

> **CR-4 — Three distinct authorities, never collapsed.** *Grant Pay-Later* (financial:
> billing/admin — **never a clinician**). *Override a payment block to deliver a service* (clinical:
> the above **plus** doctor/nursing supervisor — because at 9pm the person standing in front of a
> blocked patient is a doctor or a nurse, and if the only key-holder went home the gate is
> absolute). *Automatic release* (no holder; fires on CR-2/CR-3).

**The conflict that had to be resolved.** Field data says the **report-release hold** is the
hospital's actual collection lever, worth the difference between **~80-90% and ~45-60% recovery**.
CR-1 and DPDP S.11 (access right) + NMC Reg 1.3.2 (records within 72h) both forbid it.

**Ruling: the hold is forbidden. Clinical and legal override the economics.** Substitutes:
- The collection window moves **earlier** — to before the patient leaves the premises, which is the
  85-95% recovery bucket anyway.
- **The QR slip does the work.** The most common resolution of "I'll bring it in an hour" is not the
  patient returning with cash — it is the patient **phoning a relative who sends money**. A QR
  pre-filled with the exact amount and reference converts "one hour" into four minutes.
- The recovery-rate delta is a **known, accepted risk** — logged as R3 for Preethi.

**NABH — fire `logNABHEvidence()` on the *delay*, never on the credit.** In a 200-patient OPD where
40% take Pay-Later, logging every grant writes 80 rows/day that say nothing; the assessor reads
three, sees noise, and stops trusting the register. **Alert fatigue applies to evidence logs.** Fire
on: a service blocked on financial grounds (`AAC.3`/`AAC.5`); an override recorded
(**[ancillaryGateChecks.ts:125](../../src/lib/ancillaryGateChecks.ts#L125) currently writes only a
`clinical_alerts` row and no NABH evidence — existing gap, close it here**); a CR-2/CR-3
auto-release; a grant above threshold. **Evidence text records the clinical fact, never the money** —
no rupee figure in an assessor-readable export.

### 8.4 Pharmacy is a different risk class (v2)

Full retail value leaves the building, fungible and resaleable; NDPS / Schedule H1 / Schedule X
diversion risk; `drug_batches.quantity_available` decrements while cash does not — the same number a
Drug Inspector audits. The better answer: **credit dispensing is a part-supply, not a full course.**
Default 1 day. Patient is not left untreated, exposure is ₹40 not ₹900. NDPS / Sch X / Sch H1
hard-excluded, not configurable. Credit-dispensed items never refundable for cash.

---

## 9. Rural reality — what survives contact

**Verdict: the need survives completely; a "credit control system" does not.** ~80% of what the
hospital calls credit control is a **social mechanism the software should RECORD**; ~20% is a **rule
it should ENFORCE**.

The 20%: (1) it cannot be invisible — day-close + one outstanding list; (2) it names a human; (3) it
carries a promised-by time.

| Reality | Design consequence |
|---|---|
| Cash-heavy; cashier personally eats drawer variance | Pay-Later is a separate day-close line, **never a payment**. Get this wrong and they stop using it in a week — out of self-protection, not laziness. |
| No reliable patient identity | Attach to the **bill/visit**, not a resolved patient profile. Recovery hook is the **physical slip**, not identity. |
| One phone per family, or none | Phone **never mandatory** — mandatory phone fields produce `9999999999`. When captured, record *whose* phone. |
| Patient may be illiterate | No signature pad, no on-screen consent text. **Printed slip in local language, read aloud, thumb impression.** Token in 32pt. Arabic numerals — currency notes use them; localised numerals would *reduce* comprehension. |
| UPI bursty and displaced | **QR on the slip, pre-filled with exact amount + reference. Highest-ROI single element in this spec.** |
| Relative as guarantor | Free text: name, relationship, **village**. Not an FK. The village name does more collection work than anything we compute. |
| "Known to the hospital" | The cashier's social knowledge **is** the credit bureau and beats anything we compute. Do not try to outperform it — record it. |
| Notebook takes 8-12 seconds and needs nobody's permission | **Hard spec number: under 20 seconds, ≤4 taps, from where they already are.** No new screen, no new menu. |
| Works with no power or internet | **Do NOT solve with offline sync.** Solve with the printed slip as primary artefact + a documented paper-fallback SOP + a backdated-entry path. **Thermal printer test is a go-live blocker.** |

**Reversion risk: HIGH — the highest of any feature class in the product.** Structural, not cultural:
the paper alternative is free, faster, and already on the counter; and **the person paying the cost
(the cashier: 15 seconds, busiest moment, queue watching) is not the person getting the benefit (the
owner, at month-end).**

Mitigations: one tap from where they already are; give the cashier the thing they hand the patient
(the slip is the adoption mechanism); and **make day-close the forcing function, not a rule** — if
Pay-Later appears in day-close and the notebook does not, the drawer only tallies when they used the
system.

**Value at stake, 30-bed rural hospital:** 3-8 events/day × ~₹400 = **₹1,200-3,200/day,
₹35k-95k/month at risk**; swing between good and bad handling ~₹10-30k/month — comparable to the
subscription. But the bigger number is the test that **does not happen today**: the patient walks,
the hospital loses 100%, and they go to the private lab down the road *which does extend credit on
exactly this social basis*.

> **This is a revenue-capture feature wearing a credit feature's clothes.**

**Pre-build action, recommended:** no defensible published figure exists for Indian rural OPD credit
recovery. **Ask three pipeline hospitals to photograph one page of their register and count
struck-through vs open lines.** Two days; settles recovery rate, average ticket, daily volume, and
whether the report-hold is actually used.

---

## 10. Compliance, PHI, RLS

**Verdict: conditionally approvable.** Approved: the ledger, the consent model, the constrained
guarantor object, the derived payment-method restriction. **Withheld: any blocklist, any
clinical-screen exposure, any hard block, and reminders as scoped.**

| Item | Position |
|---|---|
| **Lawful basis** | Split, and the confusion disappears. **Collection → consent (S.6)** — DPDP has no contractual-necessity equivalent, so consent is the *only* available basis, which means credit consent is not a nicety: **it is what makes the record lawful at all**. **Retention → law (S.8(7))** — IT Act Rule 6F(5), Companies Act s.128(5), CGST s.36. |
| **Separate consent?** | **Yes, hard rule.** S.6(1) requires specificity; consent must be **free**, and a patient signing at the point of clinical need has not freely agreed to a financial instrument. **A patient must be able to accept treatment and decline Pay-Later.** Per-episode artefact, not a registration flag. Must state: *withdrawal stops reminders and new credit — it does not cancel what you already owe.* |
| **Retention — the crux** | **A paid or written-off entry is NOT erasable on request.** S.8(7) and S.12(3) both carve out "necessary for compliance with any law". Resolved textually, not by balancing. **But** build the four-stage lifecycle: Active → Closed (+3y, Limitation Act — removed from all recovery-operational scope) → **Pseudonymised (+3→8y: null the guarantor PII and contact snapshot, retain the transaction)** → Purge (+8y). **If the lifecycle engine is cut, the whole retention position collapses.** Gating, not phase 2. |
| **Architecture constraint** | You framed it as "a financial record attached to a health record." **It must attach to the *patient*, live in the financial domain, joined by `patient_id` — never embedded in the health record.** Otherwise every clinical read, FHIR export, ABDM PHR push and insurance case-file bundle becomes a financial-disclosure vector. |
| **Guarantor** | **Allowed, tightly** — banning it pushes it into a free-text notes field with no consent, no RLS, no retention, which is worse. Conditions: the guarantor is a Data Principal, **consents personally and must be present**; permitted set is **name + one mobile + relationship only — no address, no ID number of any kind, no ID scan**; never on `patients`, never in any export; **never blocklisted, never profiled** (CICRA 2005); independently erasable earlier than the ledger row. Minors (S.9) cannot consent and cannot incur credit. |
| **"Known to hospital"** | Given as GTM colour; it is actually a **data requirement**: capture *who vouched and on what basis* as a structured field. **An unrecorded trust decision is the fraud surface** and is what makes a disputed credit unreviewable. |
| **Statutory bar on blocking care** | Real and layered: *Parmanand Katara*; *Paschim Banga Khet Mazdoor Samity*; **Clinical Establishments Act 2010 s.12(2)** (a registration condition); state variants (**AP Allopathic Private Medical Care Establishments Act 2002** — directly relevant to the rural-AP target — Karnataka KPME, Maharashtra BNHRA). **Sharpest practical risk: PMJAY/CGHS empanelment** — denying an eligible beneficiary over a private debt is an empanelment breach with de-empanelment exposure. |
| **Max permitted enforcement** | **The Pay-Later payment method becomes unavailable. The order proceeds on cash/UPI/scheme.** A payment-method restriction, never a care restriction — and even that overridable in **one click** by a named role. |
| **Who may see an outstanding** | Billing/cashier/finance/admin: **full**. **Receptionist: restricted** — a boolean + amount at the point of registering an encounter only, **no browsable list, no search-by-name** (a searchable outstanding list in the hands of the most socially-embedded role in a village hospital is a social-harm vector). **Doctor: NO** — it converts financial status into a clinical variable, and under CR-1 they cannot act on it anyway; **substitute: show the price of what is being ordered.** **Phlebotomist: NO** — she is holding a needle in front of the patient; the pressure to mention it in a room full of family is enormous, and that is exactly when the patient walks out. The sample-collection screen gets **one derived token** (Cleared / Pay-later approved / Pending at counter), no amount — and it **routes, never gates**. |
| **Structural requirement** | **Three distinct read shapes, not one policy.** Base table readable by billing/finance/admin only; every other role reads through a `SECURITY DEFINER` view/RPC returning the derived token. |
| **Reminders** | **Do not build in v1.** The requirement says *"collected when they return"* — a counter workflow. Reminders are scope creep with the highest disclosure risk per rupee. If built anyway: **never the test/department/specialty name, under any consent, non-configurable** — MTP Act s.5A(2) is **imprisonment up to 1 year**; HIV Act s.8/s.9 likewise. Default to reference-number-only, no patient name. Needs `phone_ownership: self\|family_shared\|third_party` on `patients`, TRAI TCCCPR DLT registration (**+2-4 weeks calendar**), and disabling `openWaMeFallback` in [whatsapp-send.ts](../../src/lib/whatsapp-send.ts) (it pushes message text into a URL and browser history). |
| **PHI in logs — live finding** | [creditLimitCheck.ts:71](../../src/lib/creditLimitCheck.ts#L71) returns rupee figures inside a human-readable `reason` string. Acceptable today because it is **payer**-scoped. The obvious implementation — "generalise it to patients" — turns that into **personal financial data rendered into a toast and, in practice, a Sentry breadcrumb.** **Hard requirement: the patient-scoped path returns a reason-code enum.** The rupee string is composed in the component from data already on screen. |
| **Aadhaar — pre-existing, separate** | `patients.aadhaar_id` + `aadhaar_enc`/`aadhaar_hash` (migration `20261106000021`) conflict with security-pod's own standing rule. Encrypting it does not cure storing it. **No Pay-Later code path may read, join on, or display it.** Aadhaar as collateral is separately barred by Aadhaar Act s.7/s.29 — securing a private commercial debt is outside any permitted purpose. Raised to Vikram separately. |
| **Audit** | Append-only, no UPDATE/DELETE for anyone including `hospital_admin` (mirror `20260628000003_phi_access_audit.sql`). 13 event types including **`credit_record_viewed` (read auditing)** — in a single-community rural hospital, a staff member browsing neighbours' debts is *the* realistic abuse, not exfiltration. |
| **Companies (Accounts) Rules 2014 Rule 3(1)** | If the establishment is a company, accounting software must maintain a **non-disableable audit trail with edit log**. The credit ledger *is* accounting software — **append-only is a statutory requirement independent of DPDP.** |

---

## 11. Packaging & entitlement

**Core issuance + register on all plans including trial. Professional tier for the management layer.
NOT an add-on SKU.**

Disqualifying fact for the add-on route —
[addon_skus.sql:20-24](../../supabase/migrations/20261008000166_addon_skus.sql#L20-L24): *"add-ons do
not charge on purchase… that reconciler is gated behind the `bed_reprice_live` flag and ships OFF, so
until it is enabled an add-on grants access and charges NOTHING."* We would build the gate, the
purchase flow and the drift warning to collect ₹0. And an add-on is **cancellable** — a cancelled
credit feature with live outstanding credits is the lapse disaster below.

Second: **we are pricing against a ₹20 notebook that works perfectly.** A ₹499/mo upsell on a feature
that closes an ₹8,999/mo deal is a negotiation we start and lose.

| Core (all plans) | Professional |
|---|---|
| Issue Pay-Later; outstanding at counter; **collect on return**; per-patient cap + approver role (never sell the safety rail); simple Outstanding list | Ageing buckets; automated dunning; write-off workflow + approval chain; bad-debt GL posting; recovery analytics |

**Mechanism exists today — ~1 engineer-day, not new architecture.** The assumption of
`ALL_MODULES` coupling is wrong: `hospital_module_entitlements.module_key` is plain `text` with no FK
or CHECK, and **`ai_suite` is already a shipped pseudo-module** with no tile, no route, no sidebar —
living as one key in `MODULE_ACTIONS` ([tabPermissions.ts:556](../../src/lib/tabPermissions.ts#L556)).
`patient_credit` uses it identically. `resolveEntitlement()` unchanged.

**Two switches, composed AND, defaulting in opposite directions — and that is not a contradiction:**
- **(a) Platform entitlement** — written by Aumrti. Convention is immovable: **absence = allowed.**
- **(b) Hospital policy** — `hospital_settings` key `patient_credit`, mirroring `daycare_payment` /
  `ipd_ancillary_payment`: **absence = disabled.**

*Plan says "may"; hospital says "do".*

**Default OFF — `ipdAncillaryGate` precedent, not `dayCareGate`.** The distinction is not
safe-vs-unsafe, it is *does the default create new behaviour or preserve existing*. `dayCareGate`
could safely default ON only because its trigger is **literally unreachable** for legacy rows
(`scheduled → active`, new booking flow only). That property does not exist here — this is the
busiest path in the product, live at every tenant. Defaulting ON would silently convert "no order
without money" into "orders without money" across the install base overnight, with no cap and no
training. **Absent key → `enabled: false` → the order modal behaves exactly as it does today.**

The counter-argument — *"off by default is also wrong; hospitals that never find the setting get the
fake-cash behaviour"* — is resolved by making it an explicit **go-live checklist decision**, not by
flipping the default.

### 🔴 The lapse case is a live defect, not a design question

`20261008000163_enforce_subscription_access.sql` attaches a statement-level trigger to **every** table
carrying `hospital_id` minus an exclusion list. `bills`, `bill_payments`, `patients` are **not
excluded**. On suspension: **the hospital can see that a patient owes ₹340, watch him hand over cash,
and be unable to record it.**

> **Rule: Pay-Later ISSUANCE is gated. RECOVERY is never gated — not by entitlement, not by policy,
> not by subscription status.** That debt exists because of the hospital's relationship with its
> patient, not ours with the hospital. Holding it is not leverage, it is a liability.

Implementation: **do not widen the exclusion array** — that re-opens the "expired hospital keeps
collecting cash" hole. One narrow `SECURITY DEFINER` RPC `record_patient_credit_repayment()` that can
only *decrease* an existing outstanding, cannot create a bill/line-item/credit, is idempotent on a
client ref, and audits every call including when suspended. ~2.5 engineer-days.
**Ship the RPC or do not ship Pay-Later.**

Also: turning the policy off must **never** hide the collection path.

**Analytics — with a correction to our own rule.** `credit_recovery_rate` reconciles to the
**tenant's** `bills`/`bill_payments`, **not to Razorpay** — it is hospital-to-patient receivables, not
Aumrti revenue. It must never render on `RevenueDashboardPage` near MRR/ARR. Registry caveat text,
verbatim: *"Hospital-to-patient receivables. Not Aumrti revenue. Not reconciled to Razorpay."* And if
the median rural tenant recovers 40%, **we have shipped a machine for generating bad debt and Preethi
needs to know before it is in a deck.**

---

## 12. Delivery plan, estimate, Definition of Done

### 12.1 Honest estimate

| Pod | Engineer-days |
|---|---|
| revenue | 28 |
| clinical | 17.5 |
| data | 13.5 |
| frontend | 11 |
| platform | 10 |
| quality | 11-13 |
| **security (compliance surface)** | **41-55** |
| **Raw total** | **~132-148 ed ≈ 26-30 engineer-weeks** |

Security dominates — mostly consent artefact + retention lifecycle + guarantor. Phasing cuts Phase 1
to a demo-able slice.

### 12.2 Phases

**Phase 0 — Defects. Ship alone, now, no dependency on any of this. ~3 ed.**
- **F2**: ED unconditional unpaid path ([EmergencyWorkspace.tsx:1070/1082](../../src/components/emergency/EmergencyWorkspace.tsx#L1070)). **Statutory. Own PR.** — 2 ed
- **F1**: [RetailPayment.tsx](../../src/components/pharmacy/retail/RetailPayment.tsx) credit-recorded-as-paid leak — 1 ed
- Side: correct `CLAUDE.md` §Testing (F5); fix `creditLimitCheck.ts` cross-tenant read

**Phase 1 — Foundation. Nothing demoable; nothing else is safe without it. ~18 ed.**
`lockedDay` recovery exemption (client + SQL together) · ledger + approvals migrations, constraints,
indexes, RLS, integrity triggers · type regen · `record_patient_credit_repayment` RPC · COA
5070/1019 + posting rule · pure `patientCreditLedger.ts` at 100% coverage

**Phase 2 — The demo. ~26 ed.** *(This is what closes the hospital.)*
`ancillaryGate` generalisation (drop the `isIPD` short-circuit) · Pay-Later state in Lab + Radiology
modals · **slip print with QR — highest single-item ROI** · `CreditRegisterPage` at 2 clicks ·
day-close buckets · settings panel · `j14` E2E

**Phase 3 — Controls & compliance. ~35 ed.**
Consent artefact · maker-checker write-off/waiver · audit table + read auditing · three-shape RLS ·
reason-code enum · CR-2/CR-3 auto-release · NABH evidence · ageing + write-off GL

**Phase 4 — Deferred.**
Retention lifecycle engine (**gating for GA, not for pilot**) · guarantor object · pharmacy IP
part-supply · patient-merge/MDM · reminders (recommend: never)

> **Capacity note:** no more than 80% committed. At 5 engineers that is 4 engineer-weeks/sprint of
> committed work. **Phases 0-2 alone are ~47 ed ≈ 2.5 sprints minimum.**

### 12.3 Definition of Done — the money invariants

Non-negotiable; these become the acceptance tests.

| # | Invariant |
|---|---|
| M1 | Issuing changes no tender bucket and no `total` |
| M2 | `billedValue(D) == tenders(D) + creditIssued(D) + discount + insurance + writeOff` |
| M3 | Credit cannot exist without a registered patient (pgTAP) |
| M4 | Balance identity recomputable from the ledger |
| M5 | Outstanding ≥ 0 |
| M6 | Overpay rejected, not silently converted to an advance |
| M7 | Closes exactly once (same class as KNOWN-BUG-222) |
| M8 | `closed ⟺ outstanding == 0` |
| M9 | N partials sum exactly, no float drift |
| M11 | One Pay-Later per order (partial unique, `20261008000153` pattern) |
| **M12** | **`billMoney.ts` gains `creditOutstanding`** — without it the same rupee is `balanceDue` on the bill *and* outstanding on the ledger, double-counted in every ageing report |
| M15 | Append-only |
| M16 | GST unchanged by credit |
| M17 | Credit issued on locked day D, collected D+3, posts to D+3 only |

**The race test cannot be a unit test.** The bug lives between the SELECT and the UPDATE; any mocked
client serialises them and passes on broken code. Real Postgres, genuinely parallel:
`Promise.all(10 × collect(100))` against outstanding 1000 → assert 0, ten rows, Σ=1000. Home:
`e2e/edge-functions/`, matching commit `02684d8`.

**Not cuttable under any timeline:** the concurrency test, and the two-hospital isolation test —
including the **same-UHID-in-both-tenants** case and **every new RPC called with A's JWT and B's
`credit_id`** (the exact class the Phase 4 audit found 24 of).

**Blocking condition:** `supabase/tests/` pgTAP is **not in CI**. The `e2e` job already runs
`supabase start`; adding `supabase test db` is a few lines. **A guarantee whose only proof runs
manually is not a guarantee.** Do it as its own small PR first — it retroactively protects 14
existing pgTAP files.

### 12.4 UAT the hospital actually signs

Register-book parity for one full day, line by line — *this single check is what earns trust*;
**three consecutive days of drawer count** (days 2 and 3 are where issue-day and collection-day
interact); the printed slip; shift handover across cashiers; power-cut mid-issue.
**Signed by the hospital's own cashier and administrator, not by a test report.**

### 12.5 Sample acceptance criteria

```gherkin
Given  the hospital has patient_credit.enabled = true and a per-transaction cap of ₹2,000
And    a registered OPD patient with an open encounter
When   a billing user selects "Pay Later" on a ₹640 lab order, records a reason
       and an expected return time, and confirms
Then   the lab order row is created with payment_status 'pending_payment'
And    a bills row exists with balance_due = 640 and encounter_id NOT NULL
And    exactly one patient_credit_ledger row exists with entry_type 'issue',
       amount 640, authorised_by = that user, and a non-empty reason
And    no bill_payments row is created
And    today's day-closure cash/upi/card buckets are unchanged
And    today's day-closure shows "Pay Later issued: ₹640 (1 patient)"
And    a Payment Due Slip prints with token, ₹640, and a pre-filled UPI QR

Given  a patient has an open Pay-Later of ₹640 issued on a day that is now locked
When   they return three days later and pay ₹640 in cash
Then   the payment posts to the CURRENT day, not the issue day
And    the locked day's totals are unchanged
And    the ledger holds exactly one 'recover' row linked to that bill_payment
And    outstanding for that patient is 0 and the credit reads closed

Given  a lab result on a Pay-Later order meets the critical/panic threshold
When   the result is verified
Then   it is released and the alert raised within 60 seconds
And    the release is NOT gated on payment state
And    the order's financial gate is auto-cleared for the rest of the episode
And    a credit_gate_auto_released NABH evidence row is written with no rupee figure
```

---

## 13. Risks

| # | Risk | Severity |
|---|---|---|
| **R1** | **Reversion to the notebook.** Cost and benefit sit with different people. | **Highest** |
| **R2** | **Pay-Later as a cash-theft channel** — cashier takes ₹400, records Pay-Later, later written off as "never came back", indistinguishable from a genuine default. Our feature creates the channel. | High |
| **R3** | **Recovery rate below the business case**, because CR-1 forbids the report-release lever. Accepted trade; mitigated by the QR slip and the on-premises collection window. **Flag to Preethi.** | High |
| **R4** | **Duplicate patients** make the no-leakage claim untrue. Patient-merge is out of scope. | High |
| **R5** | **Fail-closed gate on the clinical path** → Sev-1 during a packed OPD. Mitigated by inheriting `ipdAncillaryGate`'s **fail-open** stance verbatim, including the `no_charge_found` clause. | High |
| **R6** | Duplicate settlement — two people settle the same Pay-Later. Needs the idempotency treatment recent billing fixes applied elsewhere. | Medium |
| **R7** | Entitlement convention "absence = allowed" means a new plan created with no explicit `{"issue": false}` grants paid sub-capabilities free. True of every entitlement today; credit is the first where it costs money. | Medium |
| **R8** | Consent capture slows the counter below the 20-second budget → R1. | Medium |

---

## 14. Do NOT build

- Interest, late fees or penalties — converts trade credit into **money-lending** (state Money
  Lenders Acts); also GST-able under s.15(2)(d)
- EMI / instalments
- **Credit scoring or any risk model** — profiling under DPDP, encodes caste/income proxies from name
  and address, and trips Nalini's AI-governance gate
- **Manually-editable defaulter blocklist**
- **Any hard block on a clinical action**
- **Credit status on any clinical screen**
- **Test name in any outbound message** — MTP s.5A(2) and HIV Act s.8 are criminal, not merely penal
- Automated dunning campaigns
- Collections-agency integration, receivables assignment, credit-bureau reporting (CICRA 2005)
- **Cross-tenant patient credit history** — the most-requested version; a direct breach of the tenant
  boundary
- Aadhaar / PAN / ration card / any ID as collateral
- Photograph of patient or guarantor
- Credit data in any FHIR bundle, ABDM PHR push, HIP endpoint, or insurance case file
- **Denormalised `outstanding_amount` on `patients`**
- Free-text notes on the ledger — *"it will contain a diagnosis, then a guarantor's Aadhaar, then a
  slur about the patient, in that order"*
- Bulk "download defaulter list"
- s.34 credit note as a bad-debt instrument
- Backdating a grant or recovery
- Offline mode
- A 68th module tile
- **30/60/90 ageing buckets at the counter** — past 7 days it is uncollectable; the counter sees
  today / this week / older
- Blocking the next visit on an old due
- Notebook data migration — unreconcilable; opening figure as a memo only, never per-patient rows
- **Patient self-service portal to pay** — the QR does it with zero onboarding

---

## 15. Open decisions — Preethi's call

Nikhil's hard rule: **no scaffold begins without his backlog score *and* Preethi's priority sign-off.
She has not signed off, and he did not spawn her** (a pod never calls a leader; a leader does not
spawn a peer leader).

1. **Is patient-merge in scope?** Without it, the no-leakage claim is not honestly met (R4).
2. **Accept R3** — the recovery-rate hit from forbidding the report-release hold.
3. **Does ~26-30 engineer-weeks all-in clear the bar** against everything else in the queue?

**Kavitha (CFO) is also needed**, on two things: the revenue surface alone is 28 ed (> 4
engineer-weeks, above Nikhil's own escalation threshold), and the **₹35k-95k/month value-at-stake
figure in §9 is a practitioner estimate that must not reach a deck unvalidated.**

**Nalini (CDO) deliberately not activated** — no AI on a clinical path here, so no SaMD gate. Note
that *credit scoring* would trip it, which is one more reason it is on the refuse list.

### Where the pods disagreed and Nikhil ruled

| Conflict | Ruling |
|---|---|
| Mutable balance cache (revenue) vs append-only derived (data) | **data** — the race is already proven in `creditLimitCheck.ts` |
| DB trigger (data) vs no trigger (clinical) | **Both — they were describing different triggers.** Integrity triggers on the ledger yes; no trigger on the clinical delivery path |
| Report-release hold (growth) vs CR-1 (clinical + security) | **clinical/security**, with the QR slip as substitute |
| Approval workflow (revenue/security) vs attribution (growth) | **Attribution for the grant; maker-checker for write-off only** |
| Default OFF (platform/data) vs "off is also wrong" (growth) | **OFF technically**, explicit decision forced at go-live |

---

## 16. Release-note skeleton for whoever ships Phase 0

**Shipped** — ED lab/radiology orders no longer require payment before the order row exists
(statutory); pharmacy retail credit sales now record a receivable instead of a phantom collection.
**Changed** — `CLAUDE.md` testing section corrected.
**Deferred** — full Pay-Later (Phases 1-4).
**Known limitations** — patient-merge open; Pay-Later not yet available at any counter.
