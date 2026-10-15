# Settings → Drug Formulary — Training Manual

## What this screen is (and what it is not)

This file extends [admin-hospital-manager.md](./admin-hospital-manager.md) — specifically the one
line under Section 5's **Clinical** group: **"Drug Formulary ('Hospital drug list and formulary'
— also where a drug's default GST rate lives)."** Sections 1–4 of that file (Staff accounts,
Module entitlements, Hospital profile/branding, GST) are not repeated here — see that file
directly for anything to do with staff logins, roles, or billing configuration.

This screen (`Settings → Drug Formulary`, route `/settings/drugs`, component
`src/pages/settings/SettingsDrugsPage.tsx`, with its bulk-import flow in
`src/components/settings/BulkDrugImportModal.tsx`) is the **admin-only master-data editor** for
the hospital's drug list — `drug_master` — covering a drug's name, category, routes, Schedule
(G/H/H1/X/OTC/other), its NDPS flag, and a default GST %. It is **not** a dispensing screen, not a
stock/batch screen, and not where a prescription is written. See "Where this data actually gets
used" below for exactly which other screens read what this page writes, confirmed from source, not
assumed — the finding there is mixed: one field is genuinely wired through, one field is only
half-wired, and one field, despite the on-screen helper text's own claim, is not actually read
downstream at all.

**Role required:** Hospital Admin or Super Admin, same as the rest of Settings — see "Access
control" below for how this was independently re-traced for this specific sub-route, not just
assumed from the parent screen's gate.

---

## 1. Opening the screen and reading the list

1. Open **Settings → Drug Formulary**. The header reads **"Drug Master"**, with a subheading
   showing the live count, e.g. *"142 drugs"*.
2. Two buttons sit top right: **"Bulk Import"** and **"Add Drug"**.
3. The table below lists every drug on file, with columns **Drug Name**, **Generic**,
   **Category**, **Routes**, **Schedule**, **NDPS**, **GST %**, **Actions**:
   - **Drug Name** — the drug's name as typed, e.g. "Paracetamol 500mg".
   - **Generic** — the generic/INN name, or **"—"** if not set.
   - **Category** — a free-text pill, e.g. "Analgesic", or **"—"**.
   - **Routes** — a comma-joined list (e.g. "oral, IV"), or **"—"**.
   - **Schedule** — a coloured badge **"Sch G"**, **"Sch H"**, **"Sch H1"**, or **"Sch X"**,
     with **" ⚠ Rx Required"** appended for H/H1 and **" 🔒 NDPS"** appended for X; drugs with no
     schedule set show plain text **"OTC"** instead of a badge.
   - **NDPS** — a destructive-styled **"NDPS / Controlled"** badge if the drug is flagged NDPS,
     else **"—"**.
   - **GST %** — the stored percentage with a `%` suffix (e.g. "12%"), or **"—"** if null.
   - **Actions** — a single **"Edit"** link.
4. While the list is loading, the table shows **"Loading..."**.

There is no delete control and no Active/Inactive toggle visible on this screen's table — the
`drug_master` row's own `is_active` column is read by the list query (line 28 of
`SettingsDrugsPage.tsx`) but there is no UI control on this screen that writes to it, so a drug
added here cannot be deactivated from this screen.

---

## 2. Adding a single drug

1. Click **"Add Drug"** (top right). The button becomes **"Cancel"** and a form row opens
   immediately below the header, inline — there is no separate modal for the single-drug path.
2. Fill in the fields, left to right:
   - **Drug Name \*** — required, e.g. "Paracetamol 500mg".
   - **Generic Name** — e.g. "Acetaminophen".
   - **Category** — free text, e.g. "Analgesic".
   - **Routes (comma sep)** — free text, e.g. "oral, IV".
   - **Drug Schedule** — a dropdown with exactly six options: **"None / OTC"**, **"Schedule
     G"**, **"Schedule H"**, **"Schedule H1"**, **"Schedule X (Narcotic)"**, **"OTC"**,
     **"Other"**.
   - **GST %** — a number field, pre-filled **"12"** for a new drug.
3. Click **"Save"** (reads **"Update"** instead when editing — see Section 3). The button is
   disabled while the Drug Name field is empty or while the save is in flight (showing
   **"Saving..."**).
4. On success, a toast reads **"Drug added"**, the form closes, and the list refreshes.

Directly under the GST % field, a line of helper text reads: *"This is the drug's default GST
rate. Each batch received via Receive Stock can still carry its own rate (e.g. from the vendor
invoice)."* **This sentence is checked against the real downstream code in "Where this data
actually gets used" below, and the claim does not hold up as written** — flagged there, not fixed,
per this phase's scope.

**A duplicate-name guard exists on this path.** Before saving, the mutation runs a
case-insensitive check for an existing `drug_master` row with the same `drug_name` for this
hospital (`SettingsDrugsPage.tsx` lines 52–60, correctly using `.maybeSingle()` per this
codebase's house rule, not `.single()`); on a match it throws `"<name>" already exists in the drug
master.`, shown as a destructive toast. This guard does **not** exist on the bulk-import path —
see Section 4.

Selecting **"Schedule X (Narcotic)"** is the only thing on this form that sets the drug's NDPS
flag: `is_ndps` is computed as `form.schedule_type === "X"` (`SettingsDrugsPage.tsx` line 61) and
saved alongside the chosen schedule. None of the other five dropdown options ever sets `is_ndps`
true.

---

## 3. Editing an existing drug

1. Click **"Edit"** in the Actions column for the drug you want to change.
2. The same inline form from Section 2 opens, pre-filled with that drug's Drug Name, Generic
   Name, Category, Routes, Drug Schedule, and GST % — and the button now reads **"Update"**.
3. Make changes and click **"Update"**. A toast reads **"Drug updated"**.

The duplicate-name check described in Section 2 still runs on an edit, excluding the row being
edited itself (`.neq("id", editingId)`, `SettingsDrugsPage.tsx` line 58) — so renaming one drug to
match another existing drug's name is still blocked.

If the save fails for any reason, a destructive toast shows the raw Supabase `error.message`
(`SettingsDrugsPage.tsx` line 85) — see "PHI boundary check" below for why this is safe on this
specific screen.

---

## 4. Bulk import — Excel/CSV and Image/Photo

1. Click **"Bulk Import"** (top right of the main screen). This opens a full-height dialog titled
   **"Bulk Import Drug Master"**.
2. Two mode tabs sit under the title: **"Excel / CSV"** and **"Image / Photo"**.

### 4a. Excel / CSV mode

1. With the **"Excel / CSV"** tab selected, either drag a file onto the dashed drop zone or click
   it (text reads *"Drop your Excel or CSV file here"*, *"Supports .xlsx, .xls, .csv"*, with a
   **"Choose File"** button).
2. Not sure of the column headings to use? Click **"Download Template"** next to *"Not sure about
   the format?"* — this downloads `drug_import_template.xlsx`, pre-filled with the header row
   **Drug Name, Generic Name, Category, Schedule (G/H/H1/X/OTC), Strength, Form, HSN Code, GST %**
   and three sample rows (Paracetamol 500mg, Amoxicillin 250mg, and a Schedule-X example, Morphine
   10mg/ml).
3. The column-header matching is forgiving by design — `mapHeader()` (`BulkDrugImportModal.tsx`
   lines 38–49) recognises several common spellings per field (e.g. "GST", "GST%", "Tax Rate", and
   "GST Rate" all map to the same field), so a hospital's existing spreadsheet does not need to
   match the template's exact wording.
4. Once parsed, every row lands in an editable preview grid (see "4c. Reviewing and importing"
   below).

### 4b. Image / Photo mode (AI extraction)

1. With the **"Image / Photo"** tab selected, drop or choose a photo/screenshot of a printed drug
   list (text reads *"Upload a photo or screenshot of your drug list"*, *"AI will extract drug
   names, strengths, schedules, and GST rates"*, with a **"Choose Image"** button).
2. Once an image is selected, a preview appears with a **"Scan with AI"** button (reads
   **"Scanning with AI…"** while the request is in flight).
3. The image is base64-encoded and sent to the `scan-drug-list` edge function
   (`BulkDrugImportModal.tsx` lines 141–168). A failed or empty scan shows a destructive toast
   (*"Scan failed"* or *"No drugs detected"*); a successful one drops the extracted rows straight
   into the same editable preview grid used by Excel mode, with a toast reading *"N drugs
   extracted — Review and edit before importing."*

### 4c. Reviewing and importing

1. The preview grid shows one row per drug, with inline-editable cells for **Drug Name \***,
   **Generic Name**, **Category**, **Schedule** (a dropdown: OTC/G/H/H1/X/other), **Strength**,
   **Form** (a dropdown: Tablet/Capsule/Injection/Syrup/Ointment/Drops/Inhaler/Patch/Other), **HSN
   Code**, and **GST %**, plus a trash-can icon to remove a row.
2. A header line above the grid reads *"N drug(s) ready to import"*; any row missing a drug name
   is highlighted and counted in a separate destructive badge, *"N row(s) missing name — will be
   skipped"*.
3. **"+ Add Row"** appends a blank row; **"Clear All"** empties the grid back to the upload step.
4. Click **"Import N Drug(s)"** (bottom right; reads **"Importing…"** while saving) to insert
   every row that has a drug name. **"Cancel"** closes the dialog without saving anything.

**A content defect found while tracing this insert against the real `drug_master` schema, flagged
not fixed per this phase's scope — this breaks the feature outright, not partially.** The import
payload (`BulkDrugImportModal.tsx` lines 181–193) builds each row with, among other fields,
`strength: r.strength.trim() || null` (line 187) and `form: r.form.trim() || null` (line 188), then
sends the whole batch in one call: `supabase.from("drug_master").insert(payload)` (line 195).
`drug_master` has **no `strength` column and no `form` column anywhere in its migration
history** — confirmed by reading every migration that touches the table (`CREATE TABLE` in
`20260322095145_...sql`, then column additions in `20260322164553_...sql`,
`20260509100009_nabh_high_alert_meds.sql`, `20260521000002_pharmacy_expiry_control.sql`, and
`20260904000026_p2_gaps.sql` — `strength`/`form` appear in none of them) and cross-checked against
the generated schema in `src/integrations/supabase/types.ts` (the `drug_master` `Row`/`Insert`
types list `dosage_forms` and `standard_doses`, not `strength` or `form`). Supabase/PostgREST turns
an unknown JSON key on `.insert()` into a literal column reference in the generated SQL, which
Postgres rejects with an "undefined column" error for the whole statement — so **every bulk import
attempt, Excel or AI-scanned, fails at the final "Import" click**, surfacing only as a generic
destructive toast (*"Import failed"*, with the raw Postgres error as the description,
`BulkDrugImportModal.tsx` line 202). This was not caught by `npm run check:db-contract`, which
verifies that a `.from()`/`.rpc()` call resolves against a real table/function, not that every key
inside an `.insert()`/`.update()` payload matches a real column — that narrower check falls outside
what the CI guard currently does.

**A second, smaller content defect, also flagged not fixed.** Unlike the single-drug form (Section
2), the bulk-import path has no duplicate-name check at all before inserting — `handleImport`
(`BulkDrugImportModal.tsx` lines 176–206) filters only for a non-empty `drug_name`, with no query
against existing `drug_master` rows. Once the `strength`/`form` defect above is fixed, re-importing
the same file (or an overlapping one) would be free to create duplicate drug rows that the
single-drug form's own guard exists specifically to prevent.

---

## 5. GST % and NDPS/Schedule classification — where this data actually gets used

This is the question this phase was specifically asked to answer with evidence, not assumption:
does anything else in the app actually read a drug's GST % or NDPS/Schedule classification from
this table? Tracing every real read site in `src/` gives three different answers for three fields
that this screen treats as one feature.

### 5a. `is_ndps` — a real, confirmed connection

Both write paths on this screen compute `is_ndps` purely from the Schedule choice — `schedule_type
=== "X"` on the single-drug form (`SettingsDrugsPage.tsx` line 61), `schedule_type.trim().toUpperCase()
=== "X"` on bulk import (`BulkDrugImportModal.tsx` line 191) — and that boolean is genuinely wired
into Pharmacy's controlled-substance workflow:

- **`src/components/pharmacy/ip/FiveRightsPanel.tsx`** (lines 40, 57, 60–65) reads `drug.is_ndps`
  to decide whether the Five Rights dispensing-verification panel requires a **second pharmacist's**
  sign-off before the "All 5 Rights Verified" confirmation can be clicked at all.
- **`src/components/pharmacy/retail/RetailPayment.tsx`** (lines 77–80, 308, 326, 332) and
  **`src/components/pharmacy/ip/DispensingWorkspace.tsx`** (lines 336, 356, 556, 577) carry the
  same `is_ndps` flag through to a dual-pharmacist confirmation gate and into the `ndps_register`
  write at the point of sale/dispense.
- **`src/components/pharmacy/retail/RetailDrugSearch.tsx`** (line 196), **`RxOrdersTab.tsx`**
  (OPD prescribing, line 1148), and **`DrugMasterSearchInput.tsx`** all surface an **"NDPS"** badge
  straight from this same flag when a doctor or pharmacist searches for the drug.

**Confirmed: this is a live, connected field, not an orphaned setting.** Flagging a drug Schedule X
on this screen is the only thing in the app that ever sets `is_ndps` true, and that flag is what
Pharmacy's narcotic dual-sign-off and NDPS Register logic actually keys off.

### 5b. The Schedule (G/H/H1/OTC/other) classification itself — only half-wired

This is more subtle than a simple yes/no. `drug_master` has **two separate columns** for a drug's
Schedule, added in two different migrations with no trigger or code anywhere bridging them:
`drug_schedule` (added by `20260322164553_2b762a05-...sql`, `DEFAULT 'OTC'`, the older column) and
`schedule_type` (added later and separately by `20260904000026_p2_gaps.sql`, with a check
constraint restricting it to `H`/`H1`/`X`/`G`/`OTC`/`other`, the newer column).

This Settings screen's own "Drug Schedule" dropdown and the bulk-import "Schedule" column write
**only** `schedule_type` (`SettingsDrugsPage.tsx` line 68; `BulkDrugImportModal.tsx` line 186) —
`drug_schedule` is never touched by either write path on this page. But Pharmacy's actual
Schedule H/H1 "⚠ Rx Required"-style prescription warnings read the **other** column,
`drug_schedule`, not `schedule_type`:

- **`src/components/pharmacy/retail/RetailDrugSearch.tsx`** (lines 52, 89, 193–194),
  **`RetailPOS.tsx`** (lines 113, 184, 208, 331–333, 360), and **`RetailPayment.tsx`** (lines 77,
  308, 326, 584) all select, carry, and branch on `drug_schedule` to decide whether to show a
  "Prescription required" warning or block checkout on a Schedule H/H1 item.
- **`PharmacyStockTab.tsx`** (lines 50, 246) and **`PharmacyNDPSTab.tsx`** (line 45) likewise
  filter and badge by `drug_schedule`.
- **`DispensingWorkspace.tsx`** (lines 187, 229, 336, 356, 556, 577, 790–791) and
  **`DrugReturnModal.tsx`** (lines 98, 107) do the same for IP dispensing and returns.

**Net effect, confirmed from source, not assumed:** picking "Schedule H" or "Schedule H1" on this
screen correctly shows the badge on this screen's own table (Section 1), but has **no effect on
Pharmacy's own Schedule H/H1 prescription-required warnings** anywhere in retail or IP dispensing,
because those all read a column (`drug_schedule`) that this screen never writes. The only part of
the Schedule choice that does reach Pharmacy is the one bit it collapses into on save — whether the
chosen schedule is exactly `"X"`, via `is_ndps` (Section 5a). A drug added here as Schedule H or H1
is, as far as every Pharmacy dispensing screen is concerned, indistinguishable from an untagged OTC
drug (`drug_schedule` stays at its column default, `'OTC'`), despite correctly showing "Sch H ⚠ Rx
Required" on this page's own list. The `drug_schedule` column is not dead elsewhere in the app —
the separate, one-time **Settings → Data Migration** onboarding tool
(`src/components/migration/ImportWizard.tsx` line 674) does write to it for drugs imported from a
hospital's old system — it is specifically this screen's two write paths that never reach it.

### 5c. `gst_percent` — the on-screen claim does not hold up

The helper text under the GST % field (Section 2 above) states this is "the drug's default GST
rate" that "each batch received via Receive Stock can still carry its own rate." Tracing the real
billing path shows this is not what happens:

- The only place in the app that reads `drug_master.gst_percent` at all is
  **`RetailDrugSearch.tsx`** line 52, which selects it onto each search result (line 90). That
  value is never rendered in this component's own result list (which shows the batch's sale price,
  Schedule badge, NDPS badge, and stock count — not a GST figure, lines 182–206) and is never read
  by `RetailPOS.tsx` when a drug is added to the cart: the actual billed rate comes from
  `drug.best_batch.gst_percent` (`RetailPOS.tsx` line 358) — the **batch's own** `gst_percent` on
  `drug_batches`, not the drug master's.
- Every dispensing/billing path that posts a real GST amount — `RetailPOS.tsx` (line 413),
  `RetailPayment.tsx` (lines 254, 263, 287), and `DispensingWorkspace.tsx` (lines 213, 528, 547) —
  reads the figure off the specific **batch** being sold, never off `drug_master`.
- `ReceiveStockModal.tsx`, where a new batch is actually created, does **not** look up the drug's
  `drug_master.gst_percent` to pre-fill a new batch's rate when an existing drug is selected from
  the dropdown — a fresh GRN row starts from a hardcoded `12` (`emptyItem()`, line 36) or from
  whatever the AI invoice scanner extracted off the vendor's own invoice (lines 70, 87, 110), not
  from this screen's setting. The one place `drug_master.gst_percent` is ever written from outside
  this screen is the opposite direction — `ReceiveStockModal.tsx` line 195 writes a **new** drug
  into `drug_master` with the GRN row's GST % when an unmatched drug name is auto-created during
  stock receipt, the reverse of "inherit from the master."

**Confirmed plainly: no module reads this screen's `gst_percent` for an actual billing
calculation.** The field is real, is saved correctly, and is shown correctly on this screen's own
table — but despite the helper text's claim of a default-with-override relationship to Receive
Stock, the two are not actually linked in either direction for an existing drug. This also revisits
`admin-hospital-manager.md` Section 4's own statement that "Drug Formulary ... has a default GST
rate per drug" — that line is accurate about what the field is for and where it is stored, but
should not be read as implying the rate is consulted anywhere downstream, which this trace found it
is not.

---

## Access control — independently re-traced, not assumed from the parent screen

`admin-hospital-manager.md` already states the `/settings` route itself is gated to exactly
**Super Admin** and **Hospital Admin**. Per this pod's standing rule to trace the *real*
enforcement chain rather than take a route's on-screen wiring at face value, this was re-checked
specifically for `/settings/drugs` rather than assumed to inherit cleanly:

1. `src/App.tsx` (line 367) registers the route as:
   `<Route path="/settings/drugs" element={<RG path="/settings"><SM name="Drugs">
   <SettingsDrugsPage /></SM></RG>} />` — note the `RG` wrapper is given the **literal
   string `"/settings"`**, not `"/settings/drugs"`.
2. `RG` (`src/App.tsx` lines 240–244) looks that string up in `ROUTE_ROLES["/settings"]` and
   passes the result as the `allowedRoles` prop into `RoleGuard`.
3. **That prop is a dead end for authorization.** `RoleGuard` (`src/components/auth/RoleGuard.tsx`
   line 20) never reads its own `allowedRoles` prop when deciding access — it calls
   `hasAccess(location.pathname, role, permissions)` using the browser's **real, current path**
   (`/settings/drugs`), completely independent of whatever string `App.tsx` happened to pass into
   `RG`.
4. `hasAccess()` (`src/lib/routeRoles.ts` lines 218–221) treats any path starting with
   `/settings/` as the dedicated settings branch, and calls `staticRolesFor("/settings/drugs")`.
   There is no exact entry for that path in `ROUTE_ROLES` — confirmed by searching `routeRoles.ts`
   for both `"/settings/drugs"` and `"settings/drugs"`, neither of which appears anywhere in the
   file — so it falls through to the nearest parent prefix, `ROUTE_ROLES["/settings"]`, which is
   `['super_admin', 'hospital_admin']` (`routeRoles.ts` line 15).

**Net result: confirmed clean, no gap, the identical mechanism documented for `/settings/consent-
forms`.** `/settings/drugs` has no override of its own and correctly falls through to the same two
roles the parent `/settings` entry already grants. As with every sibling Settings sub-route, the
`App.tsx` route's own `path="/settings"` prop happens to describe the right outcome only because
it's the same string the real check (`location.pathname`'s parent-prefix fallback) also lands on —
not because the prop itself does anything. If a future `/settings/drugs`-specific role requirement
is ever needed (narrower *or* wider than the `/settings` parent), the fix has to be a new entry in
`ROUTE_ROLES` itself (`src/lib/routeRoles.ts`), not the route registration in `App.tsx`.

---

## PHI boundary check — reviewed, boundary holds

This screen itself never touches patient data. Reviewed specifically for the two risks that apply
to every PHI-adjacent screen in this codebase:

- **No patient-identifying column exists on the table this screen edits.** `drug_master`'s full
  column set, traced across every migration that touches it (`20260322095145_...sql`,
  `20260322164553_...sql`, `20260509100009_nabh_high_alert_meds.sql`,
  `20260521000002_pharmacy_expiry_control.sql`, `20260904000026_p2_gaps.sql`) is: `id`,
  `hospital_id`, `drug_name`, `generic_name`, `category`, `dosage_forms`, `standard_doses`,
  `routes`, `is_active`, `is_ndps`, `drug_schedule`, `reorder_level`, `hsn_code`, `gst_percent`,
  `is_high_alert`, `high_alert_reason`, `reorder_qty`, `min_stock_level`, `auto_reorder_enabled`,
  `expiry_alert_days`, `schedule_type`. There is no patient name, UHID, or clinical-encounter field
  anywhere on this table — it is hospital-level master data, exactly as the opening section states,
  confirmed directly against the schema rather than assumed from the table's purpose.
- **No PHI in logs, console output, or error messages.** Neither `SettingsDrugsPage.tsx` nor
  `BulkDrugImportModal.tsx` has a single `console.log`/`console.error` call anywhere. The only
  place an error surfaces to the user is a toast showing the raw Supabase `error.message`
  (`SettingsDrugsPage.tsx` line 85; `BulkDrugImportModal.tsx` lines 130, 152, 164, 202) — every one
  of those can only ever describe a constraint violation, a missing-column error (see the
  `strength`/`form` defect in Section 4), or a connection failure against `drug_master`, a table
  with no patient-identifying column at all. There is nothing this error path could expose that
  touches a patient record.
- **The image-upload path (bulk import's "Image / Photo" mode) is a hospital document, not a
  patient one.** The photo a user uploads is described throughout the component as "your drug
  list" — the modal has no patient picker, no patient-context prop, and nothing in its state
  (`rows`, `imagePreview`, `imageFile`) carries a patient identifier. The base64 image is sent to
  the `scan-drug-list` edge function alongside only `hospital_id` (`BulkDrugImportModal.tsx` line
  148) — confirmed from the call site, not the function's own internals, which are out of this
  screen's scope the same way `ConsentSignatureModal.tsx`'s internals were left to a future phase in
  the consent-forms file.

**Sign-off: this screen's PHI boundary holds.** `drug_master` is hospital-level configuration with
no patient-identifying column, and nothing on either component logs, displays, or exports a patient
record.

---

## A note on scope

This file covers only the two components named above: the single-drug add/edit form and the
bulk-import modal on `Settings → Drug Formulary`. It does not walk through Pharmacy's own
dispensing screens (`RetailPOS.tsx`, `DispensingWorkspace.tsx`, and the rest of the Pharmacy module)
beyond what was needed to confirm, with evidence, which of this screen's fields those screens
actually read — that module's own click-by-click walkthrough, if and when it is written, is a
separate piece of work. It also does not audit the `scan-drug-list` edge function's own
implementation, the one-time **Settings → Data Migration** import tool
(`src/components/migration/ImportWizard.tsx`) beyond the single `drug_schedule` write cited in
Section 5b, or `ReceiveStockModal.tsx`'s AI invoice-scanning flow beyond what was needed to confirm
the GST % finding in Section 5c.
