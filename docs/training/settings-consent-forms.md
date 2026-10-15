# Settings → Consent Forms — Training Manual

## What this screen is (and what it is not)

This file extends [admin-hospital-manager.md](./admin-hospital-manager.md) — specifically the one
line under Section 5's **Clinical** group: **"Consent Forms ('Manage consent form templates')."**
Sections 1–4 of that file (Staff accounts, Module entitlements, Hospital profile/branding, GST)
are not repeated here — see that file directly for anything to do with staff logins, roles, or
billing configuration.

This screen (`Settings → Consent Forms`, route `/settings/consent-forms`, component
`src/pages/settings/SettingsConsentFormsPage.tsx`) is the **admin-only master-data editor** for
consent form **templates** — the wording of a "Consent for Surgical Procedure" or "Consent for
HIV Testing" form, whether it needs a witness, and whether it is currently offered at all. It is
**not** where a patient signs anything, and it is **not** the same screen as the Patient Relations
Officer's **📜 Patient Rights** tab documented in
[patient-relations-officer.md](./patient-relations-officer.md) Section 4. The two are genuinely
different systems, not two names for one thing — see "Two separate consent systems" below for the
full comparison, confirmed from source, not assumed.

**Role required:** Hospital Admin or Super Admin, same as the rest of Settings — see "Access
control" below for how this was independently re-traced for this specific sub-route, not just
assumed from the parent screen's gate.

---

## 1. Opening the screen and reading the list

1. Open **Settings → Consent Forms**. The header reads **"Consent Forms"**, with the breadcrumb
   **"Settings › Consent Forms"** underneath it.
2. A line of helper text under the header reads: *"Manage consent form templates used across the
   hospital. Templates are fetched at admission."*
3. The table below it lists every template on file, with columns **Form Name**, **Type**,
   **Witness**, **Active**, **Actions**:
   - **Form Name** — the free-text title you gave the template (e.g. "General Consent for
     Treatment").
   - **Type** — shown as a badge, one of 10 consent types (see "Consent Type options" below).
   - **Witness** — **Yes** or **No**, whether this template requires a witness's name and signature
     when a patient signs it elsewhere in the app.
   - **Active** — a toggle switch. Flips immediately on click — there is no separate confirm step
     and no Save button for this column.
   - **Actions** — a single pencil icon, **Edit**.
4. If no templates exist yet, the table shows: *"No consent forms yet. Add your first template."*

**There is no delete control on this screen.** The only way to retire a template is to switch its
**Active** toggle off — a soft-disable, not a delete, consistent with the rest of this codebase
never hard-deleting a row with a production migration. A deactivated template stays in the table
(so its past history is not lost) but stops appearing wherever templates are offered for signing
(see Section 4 below).

---

## 2. Adding a new consent form template

1. Click **"+ Add Consent Form"** (top right of the screen).
2. In the **"Add Consent Form"** window:
   - **Form Name \*** — type the title, e.g. "Consent for Surgical Procedure".
   - **Consent Type** — pick one from the dropdown (see the 10 options below).
   - **Content** — type the full consent wording into the text box. This is the exact text a
     patient will read and sign against later — write it in full, not a summary.
   - Tick **"Requires witness signature"** if this type of consent needs a witness's name and
     signature alongside the patient's (the component defaults this off for every new template).
3. Click **"Save"**. A confirmation toast reads **"Consent form added."**

### Consent Type options shown in the dropdown

**General Treatment, Surgical / Procedure, Anaesthesia, Blood Transfusion, HIV Testing, LAMA
(Against Medical Advice), DNR (Do Not Resuscitate), Implant Consent, Research / Clinical Trial,
Photography / Videography.**

**A content defect found while verifying this list against the database, flagged not fixed per
this phase's scope.** The database's own check constraint on `consent_type`
(`consent_form_templates_consent_type_check`, added in migration
`20260910000004_digital_consent.sql`) allows **13** values, not 10 — the same 10 above, plus
**chemotherapy**, **dialysis**, and **pcpndt**, none of which appear in this screen's dropdown
(`CONSENT_TYPES`, `SettingsConsentFormsPage.tsx` lines 16–27). That same migration auto-seeds a
**"Consent for Chemotherapy"** template (`consent_type = 'chemotherapy'`) for every hospital that
had zero existing templates at the time it ran. Practical effect, confirmed directly from the
component source:
- That seeded row's **Type** badge on this screen's own table shows the raw, unformatted word
  **"chemotherapy"** rather than a proper label — the `typeLabel()` helper (line 111) only has a
  friendly label for the 10 dropdown values and falls back to printing the stored value as-is for
  anything else.
- Opening **Edit** on that row loads `consent_type: "chemotherapy"` into the form, but the Type
  dropdown has no matching option for it, so the dropdown cannot show "Chemotherapy" as selected
  (saving again without touching the dropdown still works correctly, since the value is only
  changed if you interact with the dropdown — but you cannot *see* or confirm what it's set to).
- There is **no way to create a new Dialysis- or PCPNDT-flagged consent template from this screen
  at all**, even though the schema already supports both values.

---

## 3. Editing an existing template

1. Click the pencil icon in the **Actions** column for the template you want to change.
2. The **"Edit Consent Form"** window opens, pre-filled with that template's **Form Name**,
   **Consent Type**, **Content**, and witness toggle.
3. Make your changes and click **"Save"**. A confirmation toast reads **"Consent form updated."**

If the save fails for any reason (a Supabase error), a destructive toast shows the raw error
message rather than discarding it silently — see "PHI boundary check" below for why this is safe
on this specific screen.

---

## 4. Where these templates actually get used — a connected system, not a disconnected one

This matters enough to call out on its own, because this exact "is it genuinely wired up, or are
there two systems quietly describing the same thing" question is the one Phase 9 raised for
MRD/Mortuary's two separate MLC tables and for PRO's Feedback tab/portal form. Here, tracing every
place `consent_form_templates` is read in `src/` (not just assumed) confirms the opposite finding:
**this table is a live, connected source for real patient signature capture, not an orphaned
admin screen.**

A shared component, `src/components/consent/ConsentSignatureModal.tsx`, reads exactly the active
templates this screen manages (`.eq("is_active", true)`, ordered by `sort_order`) and presents
them one at a time for a patient (or guardian) to read and sign with a canvas signature pad. It is
embedded in three places already documented elsewhere in this manual, though none of those files
walk through what the button actually does — that gap is closed here:

- **Emergency Department** — the **"📝 Consent"** action button on the patient workspace's Actions
  panel, already listed (without explanation) in
  [emergency-department-staff.md](./emergency-department-staff.md).
- **IPD admission** — the **"📋 Get Consent Signed (Recommended)"** button on the admission
  wizard's success screen, already listed (without explanation) in
  [ipd-ward-clerk.md](./ipd-ward-clerk.md) Step 4 of Section 1.
- **IPD Workspace** — an on-screen banner, *"Informed consent not yet obtained for this
  admission"* (or *"Consent expired (>30 days). Renewal required before surgical procedure"*), with
  a **"Get Consent Now"** / **"Renew Consent"** button, shown automatically whenever no valid
  signed consent is on file for the current admission.

When a patient signs, the modal writes a row to the separate `patient_consents` table — carrying
a foreign key (`template_id`) straight back to the row this screen manages, the patient's and
witness's captured signatures, a SHA-256 hash of the signing context, and a 30-day validity window
— and logs **NABH PRE.1** evidence automatically. If no active template exists for a hospital at
all, the modal shows its own message pointing the user back here: *"No active consent templates
found. Add templates in Settings → Consent Forms."* — confirming the two screens are deliberately
linked, not independently built.

### Two separate consent systems — do not confuse them

| | This screen's templates | Patient Relations' Patient Rights tab |
|---|---|---|
| Table | `consent_form_templates` → signed rows land in `patient_consents` | `patient_rights_acknowledgements` |
| NABH standard | PRE.1 (informed consent for treatment/procedure) | PCC.1 (patient rights & responsibilities charter) |
| Who edits the wording | Hospital Admin / Super Admin, here | Hardcoded in English in the component — no admin editor exists for it at all |
| Signature mechanism | `SignaturePad` component, reused across the modal | A raw HTML canvas, `toDataURL("image/png")`, saved directly as a text column |
| Where captured | Emergency, IPD admission, IPD Workspace (above) | Patient Relations Officer's own **📜 Patient Rights** tab, see [patient-relations-officer.md](./patient-relations-officer.md) Section 4 |

Both are genuinely real, both genuinely save to the database, and neither is a stub — they are
simply two different NABH obligations that happen to both involve a signature, built as two
separate features at different times. A reader should not assume editing a template on this screen
changes anything about the Patient Rights acknowledgement text, or vice versa.

---

## Access control — independently re-traced, not assumed from the parent screen

`admin-hospital-manager.md` already states the `/settings` route itself is gated to exactly
**Super Admin** and **Hospital Admin**. Per this pod's standing rule to trace the *real*
enforcement chain rather than take a route's on-screen wiring at face value, this was re-checked
specifically for `/settings/consent-forms` rather than assumed to inherit cleanly:

1. `src/App.tsx` (line 379) registers the route as:
   `<Route path="/settings/consent-forms" element={<RG path="/settings"><SM name="Consent Forms">
   <SettingsConsentFormsPage /></SM></RG>} />` — note the `RG` wrapper is given the **literal
   string `"/settings"`**, not `"/settings/consent-forms"`.
2. `RG` (`src/App.tsx` lines 240–244) looks that string up in `ROUTE_ROLES["/settings"]` and
   passes the result as the `allowedRoles` prop into `RoleGuard`.
3. **That prop is a dead end for authorization.** `RoleGuard` (`src/components/auth/RoleGuard.tsx`
   line 20) never reads its own `allowedRoles` prop when deciding access — it calls
   `hasAccess(location.pathname, role, permissions)` using the browser's **real, current path**
   (`/settings/consent-forms`), completely independent of whatever string `App.tsx` happened to
   pass into `RG`.
4. `hasAccess()` (`src/lib/routeRoles.ts` lines 218–221) treats any path starting with
   `/settings/` as the dedicated settings branch, and calls `staticRolesFor("/settings/consent-
   forms")`. There is no exact entry for that path in `ROUTE_ROLES`, so it falls through to the
   nearest parent prefix — `ROUTE_ROLES["/settings"]`, which is `['super_admin',
   'hospital_admin']` (`routeRoles.ts` line 15).

**Net result: confirmed clean, no gap.** `/settings/consent-forms` has no override of its own and
correctly falls through to the same two roles the parent `/settings` entry already grants — the
same access as every other screen in `admin-hospital-manager.md`. The `App.tsx` route's own
`path="/settings"` prop happens to describe the right outcome here only because it's the same
string the real check (`location.pathname`'s parent-prefix fallback) also lands on — not because
the prop itself does anything. This is worth stating explicitly rather than silently relying on:
if a future sub-route under `/settings/*` ever needs *narrower* access than the `/settings`
parent, adding an entry to `App.tsx`'s `RG path=...` prop alone would silently do nothing — the fix
has to be a new entry in `ROUTE_ROLES` itself (`src/lib/routeRoles.ts`), not the route
registration.

---

## PHI boundary check — reviewed, boundary holds

This screen itself never touches patient data. Reviewed specifically for the two risks that apply
to every PHI-adjacent screen in this codebase:

- **No PHI in logs, console output, or error messages.** `SettingsConsentFormsPage.tsx` has no
  `console.log` call anywhere. The only place an error surfaces is a toast showing
  `error.message` from a failed Supabase insert/update (lines 86, 95) — that message can only ever
  describe a constraint violation or connection failure against `consent_form_templates`, a table
  with no patient-identifying column at all (`id`, `hospital_id`, `name`, `consent_type`,
  `content`, `witness_required`, `is_active`, `sort_order`, timestamps — confirmed against the
  table's own migration, `20260904000023_consent_form_templates.sql`). There is no patient name,
  UHID, or clinical detail this error path could ever expose.
- **No export control gap.** This screen has no export, print, or download button of any kind to
  review.
- **The boundary correctly shifts once a template is actually signed.** The connected system
  described in Section 4 above — `ConsentSignatureModal.tsx` writing to `patient_consents` — *does*
  handle real PHI (patient signatures, a witness's name, a hash tied to a specific patient and
  admission). That table and component are out of this screen's scope and belong to whichever
  future training-manual coverage documents Emergency/IPD admission consent capture in full; they
  were traced here only far enough to confirm the connection is real, not to audit that component's
  own PHI handling. On a first read of that file for this purpose, it has no `console.log` either,
  and the one `console.error` found nearby (`IPDWorkspace.tsx`, consent-status fetch failure) logs
  only `error.message`, not any patient field — stated here for completeness, not as a closed
  finding on that file, since this review is scoped to the Settings screen.

**Sign-off: this screen's PHI boundary holds.** Hospital configuration (the template text) and
patient data (a signed consent) are stored in two separate tables with a one-way reference from
the latter to the former, and nothing on this screen logs, displays, or exports a patient record.

---

## A note on scope

This file covers only the one screen named above. It does not walk through the signature-capture
flow itself (`ConsentSignatureModal.tsx`, used from Emergency/IPD) — that belongs to whichever
clinical-pod file eventually documents that step of the Emergency or IPD admission workflow in
full; this file exists to document the admin-side template editor and to resolve, with evidence,
the "is this the same system as Patient Rights" question raised when this phase was scoped.
