# ABDM / Digital Health Executive — Training Manual

## What this role does in the system

As an ABDM / Digital Health Executive, you work in one module: **🛡️ ABDM / ABHA** (`/abdm`), the
**ABDM Consent Manager**. It has five tabs along the top: **Active Consents**, **Care Contexts**,
**Gateway Logs**, **Fetch Records (HIU)**, and **Compliance Score**. This is where your hospital's
day-to-day work under the Ayushman Bharat Digital Mission happens: watching which consent
artefacts patients have granted or denied, making sure a patient's OPD/lab/radiology records
actually get linked to their ABHA so they show up in their PHR app, reading the raw gateway traffic
log when something goes wrong, and requesting another hospital's records on a patient's behalf.
This manual assumes you have never used hospital software before.

### Three different ABDM-related screens exist in Aumrti — do not confuse them

This product has three separate places that mention ABDM/ABHA, and this manual covers only one of
them:

1. **Patient registration — the "ABHA ID" field.** Front Desk staff optionally capture a patient's
   ABHA ID during registration and click **Verify** (`docs/training/front-desk.md`). This is a
   one-time data-entry field on the registration form, not a workflow screen. (Front Desk's
   registration form separately also has an optional **Aadhaar ID** field, which is encrypted on
   save and is unrelated to anything this manual's screen displays — this manual's screen never
   shows a raw Aadhaar number, and per this codebase's hard rule an Aadhaar number must never be
   stored anywhere — only the ABHA ID/VID.)
2. **Settings → Integrations → ABDM/ABHA** (`/settings/abdm`, `SettingsABDMPage.tsx`) — a one-time
   setup page where a Hospital Admin enters the hospital's HFR ID, ABDM client credentials, the
   sandbox/production gateway URL, and switches on features like HIP sharing or HIU fetch
   (`docs/training/admin-hospital-manager.md`). You do not configure anything there; you only use
   what's already been switched on.
3. **This manual — the ABDM Consent Manager (`/abdm`).** The operational screen: everyday consent,
   care-context, gateway-log, and record-fetch work. This is the only one of the three this manual
   documents.

All dates on screen show as DD/MM/YYYY. No money figures appear on this screen.

---

## PHI handling — read this before you touch the screen

Every tab on this screen displays patient-identifying data: ABHA addresses/numbers, requester
names, purpose codes, the actual list of health-information types being shared, and — on **Gateway
Logs** — the full raw request/response JSON exchanged with the ABDM gateway, which itself contains
a patient's ABHA address and care-context references. Treat all of it as PHI:

- Never screenshot, export, print, or copy a consent record, a care-context row, or a gateway-log
  payload out of this screen for any purpose — not for a support ticket, not for a WhatsApp message
  to a colleague, not for your own notes. If you need to escalate a problem, reference the
  **Consent ID**, **MLC/visit reference**, or **patient UHID**, not a copied payload.
  Every table behind this screen (`abdm_consents`, `abdm_care_contexts`, `abdm_gateway_logs`,
  `hospital_abdm_config`) is tenant-isolated by hospital, but within your own hospital any
  authenticated login that can open this module sees every patient's consent and care-context
  rows — there is no further per-patient restriction, so treat anything you see here with the same
  discretion as a patient's chart.
- Record linking to a patient's ABHA/PHR account always requires the patient's own explicit
  digital consent — this screen only manages artefacts for consent that was already granted (or
  requested) through the ABDM gateway; it is not a way to link or share a patient's records without
  their consent.

---

## 1. The header

The header bar shows **ABDM Consent Manager** with a short description, and — if any consent is
sitting in **Requested** status — an amber **"*N* pending"** badge next to the title and a matching
number badge on the **Active Consents** tab itself.

---

## 2. Active Consents

A list of every consent artefact your hospital has requested or received, newest first.

1. Use the **Filter by status** dropdown to narrow the list to **All statuses**, **Requested**,
   **Granted**, **Denied**, **Revoked**, or **Expired**. Each status shows as a colour-coded badge
   on every row (amber Requested, green Granted, red Denied, grey Revoked, lighter grey Expired).
2. Click the **refresh** icon (circular arrow, top-left of the tab) to reload the list.
3. Click anywhere on a consent row to expand it. The expanded view shows **Requester**,
   **Purpose**, **Date range** (from → to), **Expiry**, **Granted** date, and **HI types** (the
   list of health-information categories covered, e.g. OPConsultation, DischargeSummary).
4. **Revoking a consent:** only visible if your login is `hospital_admin` or `super_admin`, and
   only on a consent that is currently **Granted**. Expand the row and click **"Revoke Consent"**
   (red button with an X icon). The screen calls the ABDM gateway's revoke endpoint, then marks the
   consent **Revoked** in your own records once the gateway call completes.

> **Defect found and fixed.** The revoke call's `X-CM-ID` header used to send
> `cfg.is_production ? "sbx" : "sbx"` (`src/pages/ABDMConsentPage.tsx`, `ActiveConsentsTab`,
> line 131) — both branches of that ternary evaluated to the literal string `"sbx"`, so the header
> was always "sandbox" regardless of whether the hospital's ABDM configuration was actually
> switched to production. It now reads `cfg.is_production ? "abdm" : "sbx"`, matching the
> correctly-written equivalent already in this file's Fetch Records (HIU) submit handler, and
> cross-checked against three further call sites before being fixed.

---

## 3. Care Contexts

A list of every care context your hospital has created for linking to patients' ABHA accounts — a
care context is generated automatically whenever an OPD visit, lab report, or radiology report is
completed; you cannot create one by hand here.

1. Each row shows the record's description, its type (e.g. OPD Visit, Diagnostic Report), the date
   it was created, and — if already linked — the date it linked, plus a status icon/badge:
   **Linked** (green check), **Pending** (amber clock), **Unlinked** (grey), **Failed** (red alert).
2. A summary strip at the bottom of the tab totals how many contexts fall into each status.
3. **Retrying a single failed/unlinked context:** click **"Retry"** on that row. This re-triggers
   the hospital's HIP (Health Information Provider) link-initiation call for that one record and
   notifies the patient again via their PHR app.
4. **Bulk-linking everything pending:** if there is at least one Unlinked or Failed context, a
   **"Link All Pending (*N*)"** button appears next to the refresh icon. Clicking it groups every
   pending context by patient and fires one link-initiation call per patient, then shows a toast
   reporting how many patients' linking was successfully initiated.

This same care-context list, scoped to one patient, also appears directly on that patient's own
chart as the **ABHA Care Contexts** panel (`src/components/abdm/ABDMCareContextsPanel.tsx`) — a
`hospital_admin`/`super_admin` login additionally gets a document-icon **"View FHIR Bundle
(admin)"** button there to preview the underlying FHIR R4 package for a linked record. That
per-patient panel is not a separate screen you navigate to; it is embedded wherever a patient's
chart already shows it.

---

## 4. Gateway Logs

A read-only, newest-first log of every request your hospital's ABDM integration has sent to or
received from the NHA gateway.

1. Each collapsed row shows: a direction badge (**inbound** in blue, **outbound** in violet), the
   action name (e.g. a consent-request or link-init call), a status indicator (green for `ok`, red
   for anything else), and a timestamp.
2. Click a row to expand it and see the full **Request** and **Response** JSON payloads, each
   rendered in a dark code block.

Remember the PHI note above: these payloads routinely contain a patient's ABHA address and
care-context references in plain text. Use this tab to diagnose why a link or consent request
failed — never to copy a payload elsewhere.

---

## 5. Fetch Records (HIU)

This is how your hospital acts as an **HIU (Health Information User)** — requesting a patient's
health records held by some *other* ABDM-registered hospital/HIP. The patient receives a
notification on their own PHR app and must grant or deny the request there; nothing is fetched
without that.

1. **Patient ABHA Address \*** — type the patient's ABHA address (e.g. `patient@abdm`).
2. **Requester Name** — optional; the doctor or department name requesting the records.
3. **Purpose \*** — a dropdown: **Care Management**, **Break the Glass**, **Public Health**,
   **Healthcare Payment**, **Disease Specific Research**, **Clinical Research**.
4. **Health Information Types \*** — a row of toggle chips: OPConsultation, DischargeSummary,
   DiagnosticReport, Prescription, ImmunizationRecord, HealthDocumentRecord. Three are pre-selected
   (OPConsultation, DischargeSummary, DiagnosticReport); click any chip to add or remove it. At
   least one must stay selected.
5. **Date From** / **Date To** — the date range of records you are requesting; **Date To** defaults
   to today.
6. **Consent Expiry** — the date this consent artefact itself expires; defaults to 30 days from
   today.
7. Click **"Send Consent Request"**. The screen sends the structured consent-request payload to
   the ABDM gateway and, once accepted, saves a new **Requested** row that will appear on the
   **Active Consents** tab once the patient responds.

If your hospital has not yet configured its ABDM gateway token (Settings → Integrations → ABDM,
owned by your Hospital Admin), submitting here fails with **"ABDM not configured. Set up gateway
token in Settings → ABDM."** — that is an admin-configuration gap, not something fixable from this
screen.

---

## 6. Compliance Score

This tab embeds the **ABDM Compliance Dashboard** (`src/pages/ABDMComplianceDashboard.tsx`) — a
read-only scorecard, not an action screen, so this manual orients you to what it shows rather than
walking through clicks (there are none beyond a refresh elsewhere in the product; the standalone
version of this dashboard has its own header and a manual **Refresh** button, but neither the
header nor the Refresh button render in the embedded view here — it auto-refreshes itself every 60
seconds instead).

You'll see an overall **Compliance Score out of 100** on a circular gauge, colour-coded red/amber/
green, built from six weighted components: **M1 (ABHA)** — the share of your patients with a linked
ABHA, worth 25 points; **M2 (HIP)** — the share of care contexts actually linked, 25 points;
**M3 (Consent)** — the share of consent requests that ended up Granted, 20 points; **HCX** — Health
Claims Exchange submission approval rate, 15 points; **HPR** — the share of your doctors who are
HPR-verified, 10 points; and **HFR** — whether your facility has a registered HFR ID, 5 points. Each
has its own card below the gauge with the underlying numbers (e.g. "Patients with ABHA: 42 / 500"),
and the HPR card lists any unverified doctors by name. At 80 or above, a green **"Apply for NHA
Certification"** button appears, linking out to the NHA sandbox certification portal. Use this tab
to see where your hospital's ABDM readiness stands and which of the other four tabs needs more
attention — not to take any action on a specific patient.

---

## Access control — who can actually get here

**The module catalogue and the enforced route guard disagree, and the enforced one wins.**
`src/lib/modules.ts` (line 101) declares this module's intended roles as `["receptionist",
"doctor", "nurse", "hospital_admin", "super_admin"]`. But `src/lib/routeRoles.ts` (line 51) carries
an explicit override that is applied after the module catalogue is read (`ROUTE_ROLES` is built
from `ALL_MODULES` first, then every override below it reassigns specific routes — `/abdm`'s
override is one of them):

```
ROUTE_ROLES['/abdm'] = ['super_admin', 'hospital_admin', 'doctor', 'billing_executive'];
```

This override is what the app actually enforces. Confirmed independently by reading both files
directly: **`receptionist` and `nurse` are both absent from the enforced list**, even though both
are named as intended roles in the module catalogue, and **`billing_executive` is present in the
enforced list despite not appearing anywhere in the module catalogue's role list for this module
and having no stated operational connection to ABHA consent management, care-context linking, or
HIU record requests.**

This is a sharper gap than the usual "needs a one-time custom role" pattern found in most other
training-manual phases, for two reasons:

- **`receptionist` and `nurse` are both already default role cards** on **Settings → Staff
  Members → Add Staff Member** (`src/pages/settings/SettingsStaffPage.tsx`, `DEFAULT_ROLE_CARDS`,
  confirmed directly: the card list is Doctor, Nurse, Billing Executive, Accountant, Pharmacist,
  Lab Tech, Reception, Admin/CEO) — a hospital does not need any admin-configuration step at all
  for these two logins to exist. They are locked out of this specific screen anyway, by an explicit
  override that has nothing to do with whether the role exists.
- **The practical consequence is visible immediately once you cross-reference Front Desk's own
  documented workflow**: `docs/training/front-desk.md` documents a Receptionist capturing a
  patient's ABHA ID at registration and clicking Verify — but that same Receptionist login cannot
  open this module at all, so they cannot track whether that patient's consent request was granted,
  retry a failed care-context link, or review the gateway log if the verify step itself misbehaved.
  A Nurse login has the identical problem on the clinical side — unable to open the Consent Manager
  to check consent status before acting on a care-context link tied to a nursing-entered record.

`billing_executive`'s presence is the other half of this finding. Nothing in this screen, its
supporting components (`ABDMCareContextsPanel.tsx`), or the ABDM compliance dashboard performs any
billing-adjacent action — there is no charge, claim, or invoice touched anywhere on `/abdm`. Unlike
the "Billing" role-card mislabel Phase 8/9 found elsewhere (where `billing_executive` was wrongly
*excluded* from a module it should have reached), this is the reverse shape: a role is *included*
here with no apparent operational reason, while two roles the module's own catalogue entry was
clearly written for are excluded. Whether this was meant to read a different role string entirely
(e.g. a future ABDM-specific role) or is simply a copy-paste from a nearby override, as happened
with the `/fms/dashboard` override a prior phase found and fixed, is not something this manual can
determine from the source alone — it is flagged here as a finding for Nikhil/Vikram to resolve, not
assumed to have an innocent explanation.

**`hospital_admin` and `super_admin` are unaffected regardless** — both are on the enforced list
directly, and `hospital_admin`/`super_admin` additionally bypass every route's role list via
`BYPASS_ROLES` (`routeRoles.ts`), the same mechanism prior phases found covering other modules'
admin-level access.

---

*This manual covers the ABDM Consent Manager (`/abdm`) as it exists in Aumrti HMS today, including
the access-control and `X-CM-ID` findings in the sections above. If a screen looks different from
what is described here, flag it so the manual can be corrected.*
