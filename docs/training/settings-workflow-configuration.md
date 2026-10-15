# Settings → Discharge Workflow & OPD Workflow — Training Manual

## What these screens are (and what they are not)

This file extends [admin-hospital-manager.md](./admin-hospital-manager.md) — specifically the two
lines under Section 5's **Workflows** group: **"Discharge Workflow** ('Discharge checklist and
approval flow')" and **"OPD Queue Config** ('Token generation and queue rules')"** (that file,
Section 5, lines 325–327). Sections 1–4 of that file (Staff accounts, Module entitlements, Hospital
profile/branding, GST) are not repeated here — see that file directly for anything to do with staff
logins, roles, or billing configuration.

This one file covers **two separate screens, owned by two different specialists**, bundled the
same way Phase 12's billing-day-closure-payments-desk.md bundled two routes — not because they are
one feature, but because both sit in Settings' "Workflows" group and both were the subject of the
same historical misconfiguration pattern (see "Access control" below):

- **`Settings → Discharge Workflow`** (route `/settings/discharge-workflow`, component
  `src/pages/settings/SettingsDischargeWorkflowPage.tsx`, Radha's) — the **admin-only editor for
  the hospital's discharge approval sequence**: which clearance steps (Doctor, Pharmacy, Billing,
  and any custom ones) a patient's discharge must pass through, in what order, and whether each is
  required. It is **not** where a nurse or ward clerk actually initiates or clears a discharge —
  that is the IPD Overview tab's discharge stepper, already covered (without explaining where its
  step list comes from) in [nurse.md](./nurse.md), [doctor-opd.md](./doctor-opd.md), and
  [ipd-ward-clerk.md](./ipd-ward-clerk.md). This screen only edits the *template*; see "Where these
  settings actually get used" below for how the two are connected.
- **`Settings → OPD Queue Config`** (route `/settings/opd-workflow`, component
  `src/pages/settings/SettingsOPDWorkflowPage.tsx`, Mohan's) — the **admin-only editor for the OPD
  token/queue scheme, consultation-fee-timing policy, and revisit-discount rules**. It is **not**
  the screen a receptionist uses to actually register a walk-in patient or call a token — that is
  `WalkInModal.tsx` / `TokenQueue.tsx`, already covered in [front-desk.md](./front-desk.md). See
  "Where these settings actually get used" below for exactly which of this screen's fields that
  live registration flow actually reads.

**Role required:** Hospital Admin or Super Admin for both screens, same as the rest of Settings —
see "Access control" below for why this is the one fact this file had to verify most carefully,
not just assume from the parent screen's gate.

---

## 1. Settings → Discharge Workflow (Radha)

### 1.1 Opening the screen

1. Open **Settings → Discharge Workflow**. The header reads **"Discharge Workflow"**, with the
   breadcrumb **"Settings › Discharge Workflow"** underneath it, and a back arrow that returns to
   **Settings**.
2. A line of helper text under the header reads: *"Each hospital can have a unique workflow. Select
   a built-in preset or create your own custom workflow."*
3. The screen is split into two panels: a **left list** of workflows (Built-in, then Custom) and a
   **right editor panel** showing whichever workflow is currently selected in that list.

### 1.2 The three built-in presets

Under the **"Built-in"** label, three presets are always available, each shown with its step count
and, if it is the hospital's current live workflow, a green checkmark:

| Preset | Steps (in order) |
|---|---|
| **Simple Cash** | Clinical Clearance (Doctor, 30 min) → Billing Settlement (Billing Executive, 60 min) |
| **Standard** | Clinical Clearance (Doctor, 30 min) → Pharmacy Clearance (Pharmacist, 20 min) → Billing Settlement (Billing Executive, 60 min) → Nursing Clearance (Nurse, 15 min) |
| **Insurance** | Clinical Clearance (Doctor, 30 min) → Pharmacy Clearance (Pharmacist, 20 min) → Insurance Pre-approval (Insurance Coordinator, 120 min) → Billing Settlement (Billing Executive, 60 min) → TPA Final Clearance (Insurance Coordinator, 60 min) → Nursing Clearance (Nurse, 15 min) |

Clicking a built-in preset's row selects it in the right-hand panel, which opens **read-only** —
the panel's title shows **"\<preset name\> (read-only preset)"** with a grey **"built-in"** tag, and
every step row is shown dimmed with no edit controls. A note underneath reads: *"Built-in presets
cannot be edited. Create a custom workflow to make changes."* If this preset is not already the
hospital's active one, a **"Set as Active Workflow"** button appears — clicking it makes this
read-only preset the one every discharge in the hospital is checked against (see Section 3 below).

### 1.3 Creating a custom workflow

1. Under the **"Custom"** label on the left, click **"New Custom Workflow"** (the button carries a
   plus icon; if no custom workflow exists yet, the panel reads *"No custom workflows yet"* above
   it).
2. Type a name into the box that opens (placeholder text: **"Workflow name…"**) and click
   **"Create"**. A toast confirms: **"Workflow "\<name\>" created."**
3. The new workflow starts with **zero steps** and opens immediately in the editor panel on the
   right.

### 1.4 Editing a custom workflow's steps

With a custom workflow selected, the right panel becomes editable (no "built-in" tag, no
read-only dimming):

1. Each existing step is a row with, left to right: a drag handle, a step number, a **Step name**
   text box, a **role** dropdown (choices: **Doctor, Nurse, Pharmacist, Billing Executive, Insurance
   Coordinator, OT Technician, Lab Technician, Radiology Technician, Admin**), a **time limit**
   number field (in minutes), a **Required** toggle switch, and a trash-can icon to remove that
   step.
2. To add a step, click **"Add Step"** at the bottom of the list — it inserts a new row defaulted
   to role **Doctor**, 30 minutes, **Required** on, with a blank name to fill in.
3. **There is no confirmation dialog before deleting a step.** Clicking the trash icon on any row —
   including a "Billing Settlement" row — removes it from the draft immediately, with no undo. See
   "Access control" below for exactly who is allowed to reach this button today, and the content
   defect flagged at the end of this file for what happens to the *live* discharge gate when a
   dangerous edit like this is later reversed by deleting the whole workflow instead of fixing the
   step.
4. If the workflow being edited is not currently the hospital's active one, an amber note appears:
   *"Click "Save Changes" above to save edits and set this as the active workflow."*
5. Click **"Save Changes"** (top right, part of the shared Settings page header, not a button
   inside the panel itself) to persist the draft. A toast confirms: **"Discharge workflow saved" —
   "\<name\>" is now the active workflow.**

### 1.5 Renaming or deleting a custom workflow

In the left-hand Custom list, each custom workflow row has two small text controls underneath it:

1. **"Rename"** (pencil icon) — turns the row into a text box pre-filled with the current name;
   press **Enter** or click the checkmark to confirm, **Escape** or the **X** to cancel. There is no
   separate toast for a rename.
2. **"Delete"** (trash icon, red) — deletes the workflow **immediately, with no confirmation
   dialog**. A toast confirms: **"\<name\>" deleted."** See the content-defect note at the end of
   this file for what this button does and does not update.

---

## 2. Settings → OPD Queue Config (Mohan)

### 2.1 Opening the screen

Open **Settings → OPD Queue Config**. The header and breadcrumb both read **"OPD Queue Config"**
(**"Settings › OPD Queue Config"**) — note this is the on-screen title even though the route itself
is `/settings/opd-workflow`. The screen has no left/right split like Discharge Workflow — it is a
single scrollable column of labelled sections, each saved together by the one **"Save Changes"**
button in the shared header.

### 2.2 Queue Type

A set of three radio options: **"Token-based"**, **"Appointment-first"**, **"Walk-in only"**.

### 2.3 Token Format

Three controls side by side:
- **Prefix** — a free-text box (defaults to **"A"**).
- **Starting Number** — a number box (defaults to **1**). Clicking **Save Changes** with this set
  to 0 or a negative number is blocked: a destructive toast reads **"Starting number must be 1 or
  higher"** with the description **"Tokens are announced to patients — a zero or negative token
  cannot be called."** — the save does not go through until this is corrected.
- **"Reset daily"** — a toggle switch with its own label.

### 2.4 Consultation Fee Timing

Three radio options: **"Collect before consultation"**, **"Collect after consultation"**,
**"Patient's choice"**.

### 2.5 Free Follow-up

One line: **"Free follow-up within"** [a number box, default **14**] **"days"**.

### 2.6 OPD TV Display

- **Patient Name Format** — three radio options: **"Full name"**, **"First name + initial"**,
  **"Token only"**.
- **"Audio announcement"** — a toggle switch.

### 2.7 Walk-in Late Arrival

Three radio options: **"Wait in queue"**, **"Move to end"**, **"Cancel"**.

### 2.8 Revisit Rules

This section has its own toggle (labelled **"Enabled"**/**"Disabled"** next to the switch) and, when
turned on, shows a short explanation — *"When a returning patient visits within the configured
window, the consultation fee is automatically discounted."* — followed by a table:

| Within (days) | Same Doctor | Discount Type | Amount / % | — |
|---|---|---|---|---|
| number box | toggle | dropdown: **Free (₹0)** / **Percent off (%)** / **Fixed amount (₹)** | number box (hidden when "Free" is selected) | trash icon |

1. Click **"Add Rule"** to append another row (defaulted to 30 days, Same Doctor on, **Percent off
   (%)**, 50).
2. Click the trash icon on any row to remove that rule — again, no confirmation dialog.
3. A footnote under the table reads: *"Rules are evaluated in order — first matching rule wins.
   "Within 7 days = Free" means returning patient within 7 days pays ₹0."*

Click **"Save Changes"** to persist every section above (Queue Type through Revisit Rules) in one
action. A toast confirms: **"OPD config saved."**

---

## 3. Where these settings actually get used — a connected system, or disconnected

This is the same question [settings-consent-forms.md](./settings-consent-forms.md) asked of its own
screen, and Nikhil's brief for this phase asked explicitly. Tracing every read of these two
screens' saved values in `src/` gives **two different answers for the two screens** — Discharge
Workflow is genuinely connected (with one serious gap, flagged below); OPD Queue Config is mostly
disconnected.

### 3.1 Discharge Workflow — connected, and consequential

`src/components/ipd/tabs/IPDOverviewTab.tsx` (lines 177–186) reads the hospital's `discharge_workflow`
column on load and uses its `steps` array — supporting both the legacy plain-array shape and the
newer `{ id, steps }` shape this screen now saves — as `configuredSteps` (line 449), falling back to
a hardcoded three-step default only if nothing is saved at all. `configuredSteps` directly drives
the real discharge stepper every ward nurse, doctor, and billing executive sees on a patient's IPD
Overview tab: each step is rendered in order, `getStepDone()` resolves each step's completion by
matching its `role` string (lines 451–465), and `currentStep` is simply the first step not yet done.
**This is a real, operationally consequential connection, not a cosmetic one** — if the active
workflow's step list omits "Billing Settlement" (role `"Billing Executive"`) entirely, the discharge
stepper on the ward never requires or shows a billing-clearance step for that admission at all. This
is exactly the stake behind the historical incident this file was asked to re-verify (see "Access
control" below) and exactly why a content defect in the delete flow, flagged at the end of this
file, matters more here than it would on a purely cosmetic settings screen.

### 3.2 OPD Queue Config — mostly disconnected; only Revisit Rules is wired up

The two blobs this screen saves are **not symmetric**:

- **`hospital_settings` key `opd_revisit_rules`** (Section 2.8 above) **is** genuinely connected.
  `src/lib/consultationFee.ts` exports `fetchRevisitRules()` (lines 393–405), which reads exactly
  this key; `src/components/opd/WalkInModal.tsx` calls it on load (line 274) and feeds the result
  into its own fee calculation (lines 334–341), which is the same pricing logic
  `ConsultationWorkspace` and the project's own `consultationFee.test.ts` use. A revisit rule saved
  here genuinely changes what a returning patient is charged at walk-in registration.
- **`hospital_settings` key `opd_workflow_config`** — everything in Sections 2.2–2.7 above (Queue
  Type, Token Prefix, Starting Number, Reset Daily, Fee Timing, Free Follow-up Days, Patient Name
  Format, Audio Announcement, Walk-in Late Arrival) — **is write-only**. A repo-wide search for the
  key `opd_workflow_config` itself, and separately for the internal field names `queueType` and
  `feeTimimg` (the component's own name for the Fee Timing field — note the typo, present in the
  source, harmless since it is only ever read by this same file), returns **no result anywhere
  except this settings page**. Nothing else in `src/` ever loads this key back out. Concretely:
  - The **Prefix** field has no effect on the token prefix patients actually get. The real token
    prefix is hardcoded in `WalkInModal.tsx` (line 245): `visitType === "emergency" ? "URG" : "A"`
    — a fixed two-value rule, completely independent of whatever this screen's Prefix box is set
    to.
  - **Starting Number**, **Reset daily**, **Queue Type**, **Fee Timing**, **Free follow-up days**,
    **Patient Name Format**, **Audio announcement**, and **Walk-in Late Arrival** have no reader
    anywhere in the product. Changing any of them, saving, and reloading the screen round-trips
    correctly (the data really is stored and re-fetched into the form), but nothing downstream —
    not the TV queue display, not the kiosk, not `WalkInModal.tsx` — ever consults the stored
    value to change its own behaviour.

This is the opposite finding from [settings-consent-forms.md](./settings-consent-forms.md), which
found its screen's templates genuinely wired into three real signing points. Here, one half of one
screen (Revisit Rules) is wired up exactly that way, and the other half (everything else on the OPD
Queue Config page) is not — a split verdict within a single screen, not a clean yes or no.

---

## 4. Access control — independently re-traced, not assumed from the brief

Nikhil's brief for this phase pointed at a specific comment in `src/lib/routeRoles.ts` describing
two historical incidents and framing both as fixed, and asked for this to be independently
re-verified rather than taken on the comment's word. That re-trace follows the same chain
[settings-consent-forms.md](./settings-consent-forms.md) walked for its own route.

1. `src/App.tsx` registers both routes with the same pattern consent-forms.md already documented:
   `<Route path="/settings/discharge-workflow" element={<RG path="/settings">...}` (line 383) and
   `<Route path="/settings/opd-workflow" element={<RG path="/settings">...}` (line 385). Both `RG`
   wrappers are given the literal string `"/settings"`, not their own exact path.
2. `RG` (`src/App.tsx`, lines 240–244) looks up `ROUTE_ROLES["/settings"]` and passes it into
   `RoleGuard` as the `allowedRoles` prop — but `RoleGuard` (`src/components/auth/RoleGuard.tsx`,
   line 20) never reads that prop. It calls `hasAccess(location.pathname, role, permissions)`
   using the browser's real current path, independent of whatever `App.tsx` passed in. This is a
   dead end for authorization on both routes, exactly as consent-forms.md found for its own.
3. `hasAccess()` is where this phase's verification actually had to happen, because this is the
   exact function the brief's comment describes being patched. Reading it in full
   (`src/lib/routeRoles.ts`, lines 176–267) rather than only the commented section:
   - Step 1.6 (lines 203–221) is a dedicated branch: *"if `normalizedPath === "/settings"` or
     `normalizedPath.startsWith("/settings/")`"* — true for both
     `/settings/discharge-workflow` and `/settings/opd-workflow` — the function calls
     `staticRolesFor(normalizedPath)` and **returns immediately**, before step 2 (the dynamic
     permissions-blob branch) is ever reached.
   - This is the actual fix, not a comment describing an intended fix: the dynamic blob check — the
     exact mechanism the comment says a nurse's `ipd`-module permission entry and a receptionist's
     `opd`-module entry used to leak through — is now **structurally unreachable** for any
     `/settings/*` path, for any role, because the function returns before step 2's code even
     executes. This is stronger than a route-table correction; it closes the entire class of bug at
     the branch level, not just for these two routes.
   - `staticRolesFor("/settings/discharge-workflow")` and `staticRolesFor("/settings/opd-workflow")`
     were each independently traced through `staticRolesFor()` itself (lines 166–171): neither path
     has its own exact entry anywhere in `ROUTE_ROLES` — confirmed by reading every assignment in
     the file (lines 9, 12, 15–90, 93–114) end to end, not just grepping the two literal strings —
     so both fall through `findParentPath()` to the nearest matching prefix. The only key in
     `ROUTE_ROLES` that is a prefix of either path is `"/settings"` itself (line 15):
     `['super_admin', 'hospital_admin']`. No other `/settings/*` entry in the file (e.g.
     `/settings/record-retention`, `/settings/tv-display`, line 69–73) is a prefix of either
     discharge-workflow or opd-workflow's path, so there is no risk of an unrelated sub-route entry
     accidentally matching first.
4. **Net result: confirmed closed, today, for both routes — Nikhil's first-pass finding holds, with
   one addition.** Both `/settings/discharge-workflow` and `/settings/opd-workflow` resolve to
   exactly `['super_admin', 'hospital_admin']`, and — because of the step-1.6 early return — no
   permission-blob entry under any module key (`ipd`, `opd`, or anything else) can ever grant
   access to either screen, regardless of what a hospital admin has configured in the granular
   permissions matrix for a nurse or receptionist role. The addition to Nikhil's finding: the fix is
   not merely "no override entry exists for these two paths" (true, and what a grep alone would
   show) but that the *mechanism* the original incident exploited — the dynamic blob fallthrough —
   is now categorically bypassed for the entire `/settings/*` surface, which is a stronger and more
   durable guarantee than a per-route table entry would have been. A future `/settings/*` sub-route
   added without its own `ROUTE_ROLES` entry inherits this same admin-only default by construction,
   not by someone remembering to add it.
5. One scenario this trace deliberately did not need to rule out, stated for completeness: `nurse`
   and `receptionist` are both default role cards on **Settings → Staff Members → Add Staff Member**
   (`SettingsStaffPage.tsx`, `DEFAULT_ROLE_CARDS`, lines 97 and 102) — so the specific logins named
   in the historical incident (a nurse, a receptionist) are not edge-case or custom roles that would
   need a separate check; they are exactly the ordinary, zero-setup logins every hospital already
   has. The fix holds against the realistic case, not only a theoretical one.

---

## 5. PHI boundary check — reviewed, boundary holds, with one note

Neither screen displays, stores, or exports patient data — both edit hospital-wide configuration
only. Checked specifically for the two risks that apply to every PHI-adjacent screen in this
codebase:

- **No PHI in logs, console output, or error messages.** Neither
  `SettingsDischargeWorkflowPage.tsx` nor `SettingsOPDWorkflowPage.tsx` contains a `console.log`
  call. Confirmed against the underlying schema directly, not assumed: `discharge_workflow` and
  `discharge_workflow_presets` are `jsonb` columns on `public.hospitals`
  (`supabase/migrations/20260511000001_discharge_workflow_config.sql`), and `opd_workflow_config`/
  `opd_revisit_rules` are rows in the generic `hospital_settings(id, hospital_id, key, value,
  updated_at)` table (`supabase/migrations/20260908000006_opd_diagnoses_revisit.sql`, lines
  36–43) — neither table carries a patient-identifying column of any kind.
- **No export control gap.** Neither screen has an export, print, or download button.
- **One note, not a PHI finding: neither page surfaces a Supabase write error to the user at
  all.** Every write in both files — `handleSave`, `handleCreateNew`, `handleDeleteCustom`, and
  `handleRenameConfirm` in the Discharge Workflow page; `handleSave` in the OPD Queue Config page —
  calls `.update()`/`.upsert()` and discards the response entirely, without reading `error`. The
  success toast (**"Discharge workflow saved,"** **"Workflow "…" created,"** **"…" deleted,"**
  **"OPD config saved"**) fires unconditionally, even if the write itself failed (an RLS denial, a
  dropped connection, or any other Supabase-side error). This is not a PHI exposure — there is no
  patient-identifying error message to leak, since neither table carries one — but it is the same
  silent-failure shape flagged as a defect in several already-shipped files (Dietetics' alert
  insert, Research Platform's `saveCohort()`, both in earlier phases), and is listed as a flagged
  defect below rather than fixed here.

**Sign-off: the PHI boundary itself holds on both screens** — there is no patient column to leak and
no export path to audit — but the error-swallowing above is listed as a genuine functional defect in
Section 6, since on the Discharge Workflow page specifically it compounds with the delete-flow gap
below.

---

## 6. Content defects found — flagged, not fixed, per this phase's scope

- **Deleting the active custom discharge workflow does not update the field the live discharge
  stepper actually reads — the single most significant finding in this file.** `handleDeleteCustom`
  (`SettingsDischargeWorkflowPage.tsx`, lines 145–153) removes the deleted workflow from
  `discharge_workflow_presets` and resets `activeId` to `"standard"` **only in local React state** —
  it never writes to the `discharge_workflow` column, which is the one and only field
  `IPDOverviewTab.tsx` reads (Section 3.1 above). Concretely: if a hospital's currently active
  workflow is a misconfigured custom one — say, missing the Billing Settlement step, the exact
  historical scenario this phase was asked to verify — an admin who notices the problem and deletes
  that workflow from this screen has **not** fixed the live discharge gate. The `hospitals` row's
  `discharge_workflow` column still holds the old `{ id, steps }` snapshot from whenever it was last
  explicitly saved, and `IPDOverviewTab.tsx` keeps using those stale, unsafe steps. On top of that,
  a page reload makes the problem harder to notice, not easier: the load effect (lines 77–102)
  re-reads the stale `discharge_workflow.id`, finds no matching entry in the now-shorter preset list
  (since it was deleted), and the editor silently falls back to showing **"Standard (read-only
  preset)"** — with no checkmark anywhere in the list — giving the appearance that "Standard" is now
  governing discharges, when the database still holds the deleted workflow's actual step list and
  nothing has changed it. The only way to actually fix a dangerous active workflow is to select a
  different one and click **"Save Changes"** — deleting it from the list, on its own, does nothing
  to the live gate.
- **Both screens' every write path discards the Supabase response without checking for an
  `error`,** so a failed save, create, delete, or rename always shows a success toast regardless.
  Noted in Section 5 above; repeated here because it is a functional defect independent of the PHI
  question, and because it directly worsens the delete-flow gap above — an admin would have no way
  to tell a "successful" delete from a silently-failed one, either.
- **Deleting a step, a workflow, or a revisit rule has no confirmation dialog anywhere on either
  screen.** A single misclick on any trash icon — including the Billing Settlement step row itself
  — removes it immediately, with no undo. This is the same risk the historical incident's framing
  was about, now narrowed to "anyone with Hospital Admin/Super Admin access, not anyone with an
  `ipd`/`opd` permission-blob entry" by the access-control fix in Section 4 — but it is still worth
  flagging as a usability gap on its own, independent of who can reach the button.
- **Minor, not user-facing:** the OPD Queue Config component's own internal field name for the Fee
  Timing setting is spelled `feeTimimg` (`SettingsOPDWorkflowPage.tsx`, lines 29, 127) — a typo in
  the variable name, not any on-screen label. Harmless today since nothing outside this file reads
  the key, but noted for whoever eventually wires this field up for real (see Section 3.2).

---

## A note on scope

This file covers only the two admin-side configuration editors named above. It does not re-document
the discharge stepper itself (`IPDOverviewTab.tsx`, already the subject of `nurse.md`/
`doctor-opd.md`/`ipd-ward-clerk.md`) or the walk-in registration/token flow
(`WalkInModal.tsx`/`TokenQueue.tsx`, already the subject of `front-desk.md`) beyond what was needed
to answer the "connected or disconnected" question in Section 3 and to trace the content defect in
Section 6. Settings → Approval Rules and Settings → IPD Ancillary Payment, two sibling entries in
the same "Workflows" group (`admin-hospital-manager.md`, Section 5, lines 326–328), remain
orientation-only and are not walked through here.
