# Hospital Admin / Manager — Training Manual

## What this role does in the system

As a Hospital Admin / Manager, you work mainly in **Settings** — the control room for staff
accounts, who can see and do what, your subscription, the hospital's legal/branding identity, and
GST configuration. This file covers the five areas you touch most often, not every one of the
~45 screens under `/settings/*`.

> **Access check — no gap found.** Unlike a few Phase 2 roles (Radiology Technician, IPD Ward
> Clerk, OT staff), where the job title in the file name didn't match any real login role, this
> one is clean: the `/settings` route is gated to exactly **Hospital Admin** and **Super Admin**
> (`src/lib/routeRoles.ts`, line 15) — no other login can open it, and both of those titles can.
> There is no access-model gap to flag here.

All dates show as DD/MM/YYYY. All money shows as ₹. On-screen button, tab and field labels below
are copied exactly from the screen — including a couple of places where the screen itself uses
American spelling ("Brand Color") rather than the Indian English used in the rest of this manual;
those are quoted, not corrected.

---

## 1. Staff accounts & roles

This is the single biggest part of your job: adding every staff member, giving them a login, and
deciding what they can see. It spans two screens — **Doctors & Staff** (adding people and their
logins) and **Roles** (deciding what each role can do) — plus two tabs inside the staff drawer
(**Access** and **Privileges**) that are easy to confuse with each other.

### 1.1 Doctors & Staff — adding and managing people

Open **Settings → Staff Members**. The screen header reads **"Doctors & Staff"**, with the
breadcrumb **"Settings › Doctors & Staff"** just under it.

**To add a new staff member:**
1. Click **"Add Staff Member"** (top right).
2. Under **Role \***, pick one of the role cards: **Doctor**, **Nurse**, **Billing**,
   **Pharmacist**, **Lab Tech**, **Reception**, **Admin / CEO** — or any custom role your hospital
   has created on the Roles screen (see 1.4), which also appears here automatically.
3. Fill in **Full Name \***, **Phone Number \***, and **Email Address** (the screen warns: *"No
   email — this staff member will not be able to log in. Add email to enable login later."*).
4. Fill in the fields that appear for that role — e.g. for a Doctor: **Department \***,
   **Registration No (MCI/NMC)**, **HPR ID** (with a **Verify HPR** button against the national
   Healthcare Professionals Registry), **Consultation Pricing** (Consultation Fee, Follow-up Fee,
   IPD Consultation Fee, Validity days, Follow-up Visits Allowed, Emergency Fee), and **OT Fees**
   (Surgeon Fee, Anaesthetist Fee).
5. Fill in **Employment & Salary** — Employee ID, Employment Type (Permanent/Contract/
   Visiting/Intern), Payroll Type, Basic Salary, HRA %, DA %, Conveyance, Medical Allowance, PF/ESIC
   checkboxes, UAN, PAN, ESI IP No., and License Expiry Date (the screen flags it automatically
   once it is within 60 days or past due).
6. Click **"Save Staff Member"**.

The staff table lists columns **Name / Role / Department / Phone / Status / Actions**, and a row
of filter tabs above it (**All**, plus one tab per role actually in use, e.g. Doctor/Nurse/Admin).

**Per-row actions, in order of appearance:**
- **Edit** — reopens the Add/Edit drawer for that person (now with three tabs — see 1.2/1.3 below).
- **Deactivate** / **Activate** — confirms with *"Deactivate {name}? They will immediately lose
  access to the system."* Deactivating does not delete the person's data.
- **Enable Login** (only shown for a staff member with no login yet) — opens the **"Create Login
  Credentials"** modal: enter **Email** and **Password** (minimum 8 characters), click **"Create
  Login"**. From this point the row shows **"✓ Can Login"** instead.
- Once a login exists, three more actions appear:
  - **Reset Password** — opens **"Reset Password"**, where you can either type a **New Password**
    and click **"Set Password"**, or click **"Email reset link instead"** to send the staff member
    a self-service reset email (only works if a real email is on file, not a placeholder).
  - **MFA On/Off toggle** — shows **"🔒 MFA On"** or **"MFA Off"**; click to flip it. Turning MFA
    on means the staff member is prompted to set up an authenticator app on next login.
  - **Reset Auth** — only appears when MFA is currently on. Use it if the staff member has lost
    their authenticator device; it clears their enrolled factor so they can log in and re-enrol.

### 1.2 The Access tab — restrict-only, per individual

Inside **Edit** for an existing staff member, the drawer gets three tabs: **Profile**, **Access**,
**Privileges**. The **Access** tab (`StaffAccessPanel`) is a per-user override, and it is important
to understand what it can and cannot do:

- The staff member's **role** permissions (set on the Roles screen, 1.4) are the ceiling. This
  screen can only **withhold** something the role already grants — it can never grant something
  the role denies.
- It shows the same module list as the Roles screen, grouped by category, with View/Create/Edit/
  Delete/Approve/Export toggle switches per module. A switch that is greyed out and un-clickable
  means the role itself doesn't grant that action — withholding is not possible because there is
  nothing to withhold.
- A module shows a **"Not in plan"** badge if the hospital's subscription doesn't include it at
  all, or a **"Role has no access"** badge if the role itself has no access to it.
- Where a module defines its own tabs or buttons, a small **Layers**-icon expander opens two
  further sections, **Tabs** and **Actions**, each with its own switches — e.g. you could leave a
  nurse's role able to open IPD but withhold just the "Discharge" tab for one specific nurse.
- Click **Save**. If you withhold nothing (every switch left on), saving removes the override
  entirely — the staff member purely inherits their role's permissions, with no extra row stored.

### 1.3 The Privileges tab — NOT the same thing as Access

The **Privileges** tab (`StaffPrivilegesPanel`) looks similar but is a completely different
concept, and the two are easy to confuse:

> **Privileges = clinical credentialing, not module access.** This tab has nothing to do with what
> screens or buttons a staff member can use in the software. It is a register of what clinical
> procedures a doctor/staff member is credentialed to perform — the NABH HRM.3 requirement — and
> it does not affect login permissions in any way. Do not use this tab if what you actually need is
> to restrict someone's access to a module or action; that is the **Access** tab (1.2) or the
> **Roles** screen (1.4).

**To grant a privilege:**
1. On the Privileges tab, click **"Grant Privilege"**.
2. Choose a **Privilege Scope \*** from the list — e.g. "General Surgery - Level I", "Laparoscopic
   Surgery", "ICU Management", "Anaesthesia - ASA I-II", "Endoscopy", or "Other".
3. Optionally set a **Department**, free-text **Details / Restrictions**, and a **Review Due
   Date**.
4. Click **"Save Privilege"**.

The table shows **Department, Privilege Scope, Granted By, Granted, Review Due, Active** for every
privilege on record, and colour-flags rows by review urgency: a row with a review date already
past is highlighted red with a warning icon; a row due within 30 days is highlighted amber; other
rows are unmarked. A toggle in the **Active** column lets you deactivate a privilege without
deleting its history.

### 1.4 Roles & Permissions — what each role can see and do

Open **Settings → Roles & Permissions** (the page itself is headed simply **"Roles"**). This is a
two-panel screen: a left list of roles, and a right-hand permission matrix for whichever role is
selected.

**Left panel:**
- Every system role (Doctor, Nurse, Admin, etc. — marked **System**, locked, cannot be renamed)
  and every role your hospital has created (marked **Custom**) is listed, with a live count of how
  many staff currently hold it.
- **Create** opens a small dialog: type a **Role Name** (free text, e.g. "Senior Nurse") and
  optionally pick **Start From** an existing role to copy its permissions as a starting point, then
  defaults wipe to blank if you leave Start From empty.
- **Bulk Create** opens a modal where you can paste one role name per line, all seeded from
  whichever role is selected in the **"Bulk: start from…"** dropdown next to the button (or blank
  permissions if you leave it on **"Bulk: blank perms"**).

**Right panel, for the selected role:**
- A **Feature Access** card at the very top is separate from the module matrix below — it answers
  one specific question: *who can perform Cash / Day Closure* (locking the end-of-day cash
  reconciliation). It lists which roles currently can, and a dropdown lets you check/uncheck roles
  (Super Admin and Hospital Admin are always allowed and cannot be unchecked).
- **Apply Preset** buttons give a one-click starting point: **Full Access**, **View Only**,
  **Clinical Only**, **Finance Only**.
- The permission matrix lists every module, grouped by category, with View/Create/Edit/Delete/
  Approve/Export switches. Hovering a module row reveals three quick links — **Full**, **View
  Only**, **None** — to set that one module's whole row at once.
- A module outside the hospital's plan or add-ons shows disabled with a **"Not in plan — upgrade"**
  badge — a role can never be granted more than the hospital's subscription actually includes (see
  Section 2).
- Where a module defines its own tabs or action buttons, a **"Customise"** link (with a chevron)
  expands two sections: **Tab Visibility** ("which tabs this role can see") and **Action Controls**
  ("which buttons/actions this role can perform"), each with its own **Enable All / Disable All**
  shortcut.
- Type a short **"Reason for change…"** before clicking **Save** — it is written to the
  configuration change log.
- Click **Preview** to see exactly what that role would see in the app: a full-screen view split
  into **Visible Modules** and **Hidden Modules**.
- **Delete** (custom roles only) is blocked with a named list of affected staff if anyone is still
  actively assigned that role — you must reassign them first.

**The bottom line on granular permissions:** per-module, per-tab, and per-action overrides are
real, shipped features across these three screens (Roles, Access, Privileges-adjacent) — this is
not a gap or a future promise, it works today.

---

## 2. Module entitlements — what your subscription includes

Open **Settings → Plan & Billing** (`/settings/plan`).

- **Current Plan** card: plan name, price, and a status badge — **Free Trial**, **Active**,
  **Payment Due**, **Suspended**, or **Cancelled**.
- **Usage Statistics**: **Staff Accounts** (unlimited on every plan — every nurse gets her own
  login so clinical actions stay attributable to a person), **Registered Beds**, **Active Modules**
  (shown as "X of 56"), and **Database Storage**.
- **AI Usage This Cycle**: AI Calls, Estimated Cost, and what's Included in Plan — shown for
  visibility; AI usage is not billed separately today.
- **Add-ons**: bundle SKUs, each with an **Add** button. Clicking it opens a confirm dialog that
  states plainly: access starts immediately, the charge is added to your **next renewal** — there
  is no separate checkout step. The page also states: *"To remove one, contact support."* — there
  is no self-service way to remove an add-on.
- **"Just want one module? Buy it on its own"** — a collapsed section with a search box, for
  buying a single module at its own standalone price instead of a bundle.
- **Active Modules**: a read-only badge list of every module the hospital currently has access to
  (via plan + add-ons). There is no toggle anywhere on this list — you cannot click a module off.
- **Available Plans**: upgrade cards for every other plan tier.

**The important distinction:** this page controls *whether the hospital has a module at all*.
It has **no on/off switch** for any module — access comes purely from plan tier plus whatever
add-ons are active, and taking one away is a support request, not a click here. Whether a
*specific role or staff member* can actually **see** an entitled module is a completely separate
decision, made on **Settings → Roles & Permissions** (Section 1.4 above) — don't look for that
control on this page.

---

## 3. Hospital profile & branding

These are two separate screens that both exist and are easy to mix up — one is your hospital's
legal/registration identity, the other is what printouts and the app look like.

### 3.1 Hospital Profile

Open **Settings → Hospital Profile** (`/settings/profile`).

**To update your hospital's details:**
1. Fill in **Hospital Name \***, **Address**, **State**, **Pincode**.
2. Fill in **GSTIN**, **NABH Number**.
3. Fill in **NABL Accreditation No.** and **NABL Valid Up To**.
4. Fill in **Drug License No. (Form 20B/21B)** and **Drug License Valid Up To**.
5. Fill in **80G Registration No. (Charitable)** and **Trust PAN (for 80G receipts)**.
6. In the **UHID Configuration** box, set a **UHID Prefix** (letters/numbers only, e.g. "BH"),
   and choose **Date in UHID** — **"Full date"** (e.g. BH-20260606-0001), **"Year only"** (e.g.
   BH-2026-0001), or **"No date"** (e.g. BH-0001). A live preview below the dropdown shows exactly
   what the next UHID will look like.
7. Pick a **Brand Color** swatch (this field is literally labelled "Brand Color" on screen).
8. Under **Preferred Patient Languages**, select which languages (besides English, which is always
   included) feed discharge instructions, OPD prescription advice, and patient WhatsApp messages.
9. Click **"Save Changes"**.

This page also has a **Two-Factor Authentication (MFA)** section with a **Trusted Devices** list —
**this is your own personal login's security, not a hospital-wide setting.** Enabling MFA here
only affects whoever is currently logged in and viewing the page, not every admin or every staff
member.

### 3.2 Branding

Open **Settings → Branding** (`/settings/branding`) — a left editor and a right live preview with
a **Desktop / Mobile / Print Doc** toggle.

**To update your hospital's branding:**
1. Click the logo upload box to pick a file — **PNG, JPG or SVG, max 2MB**. Once uploaded, click
   **"Remove Logo"** if you need to replace it.
2. Fill in **Hospital Name** and **Tagline** (100-character limit, with a live counter underneath).
3. Set **Primary Colour (Sidebar, headers)** and **Accent / Button Colour** — each has 8 preset
   swatches plus a custom colour picker.
4. Pick a **Primary Font** and a **Base Font Size** — **Small**, **Normal**, or **Large**.
5. Toggle **"Handwriting mode on printouts"** if needed. This exists specifically because
   Arogyasri and several TPAs reject claim files whose clinical narrative looks machine-set — this
   setting reprints the doctor-authored free text in a script typeface. Only the typeface changes;
   the author name, timestamp and wording are untouched. When on, you can pick a handwriting font,
   an ink colour, a size (80–200% of base text), a slant angle, and which sections it applies to.
6. Pick one of 6 **Header Layout** options: "Logo Left + Center Text", "Center All", "Full Colour
   Band", "Logo Right", "Text Only", "Minimal".
7. Fill in **Footer Text** — separate Left / Center / Right fields.
8. Click **"Save Branding"**.

**A minor duplication to be aware of:** GSTIN can be set on *both* this Hospital Profile page and
the GST page (Section 4 below) — both write to the same underlying `hospitals.gstin` field. Either
one keeps the other in sync; there is no harm in using whichever you reach first.

---

## 4. GST / billing configuration

Open **Settings → GST / NIC IRP** (`/settings/gst`).

**Hospital GST Details:** **GSTIN \***, **Legal Name**, **Trade Name**, **State Code**, **Place of
Supply**.

**NIC IRP (e-Invoice):** **IRP Username**, **IRP Password**, **Client ID**, **Client Secret**,
**Base URL** (defaults to the UAT/sandbox endpoint; switch to the live URL for production), and a
**Mode** choice of **Sandbox** / **Production**.

**To test your e-Invoice setup:**
1. Fill in the IRP credentials and click **Save** (the page title bar has the save action).
2. Click **"Test IRN Generation"** — this runs against the hospital's most recent bill and reports
   back whether an IRN was generated successfully.

A banner on this page states: *"Health services are GST exempt in India. Only non-clinical
services (canteen, parking, etc.) attract GST."*

**What is NOT on this page**, checked by reading the component source directly:
- No HSN code field.
- No GST rate or tax-slab configuration here.
- No invoice-numbering control anywhere in Settings.

**One correction to the brief this file was written from:** a GST *rate* is configurable in
Settings, just not on this page — **Settings → Service Rates** has a per-item **"% GST rate"**
column (editable inline), and **Settings → Drug Formulary** has a default GST rate per drug. Both
are orientation-only in Section 5 below, not walked through here, but it would be inaccurate to
tell a reader "GST rate configuration doesn't exist anywhere in Settings" — it exists, just on
those two other screens rather than the GST/NIC IRP page itself.

---

## 5. Settings Hub — what else lives here (orientation only)

Settings has roughly 40 more screens beyond the five areas above. This section is a map of what
each group is for, using the real card titles and descriptions from the Settings hub itself — for
most of these, it is **not** a walkthrough. Four have since been given a full click-by-click
walkthrough of their own (Consent Forms, Drug Formulary, the Discharge/OPD Workflow pair, and AI
Features & Attestation — each linked out to its own file below); the rest remain deferred to a
future phase.

**Identity** — besides Hospital Profile and Branding (Section 3), this group also has **White-Label
Branding** ("Partner/reseller branding, custom domain and product name"), **Language & Region**
("Interface language, date format, currency"), **Support** ("Raise a ticket, message Aumrti's
team"), and **Training Videos** ("Short how-to videos for every role").

**Plan & Modules** — besides Plan & Billing (Section 2), this group has **AI Features &
Attestation** ("Enable/disable AI per feature, DPA compliance, doctor attestation policy") — now
walked through in full in [settings-ai-features.md](./settings-ai-features.md), including Dr.
Nalini's governance finding that several of these toggles don't actually gate anything they claim
to.

**Structure** — the hospital's physical and organisational scaffolding: **Departments** ("Manage
hospital departments and specialties"), **Wards & Beds** ("Configure wards, bed count and
categories"), **Shifts** ("Define shift timings and patterns"), **Bank Accounts** ("Configure bank
accounts for reconciliation"), and **Configurable Dropdowns** ("Customise every dropdown in the
system — admission types, drug routes, leave types, TPA list, lab categories and more").

**People & Access** — besides Staff Members and Roles & Permissions (Section 1), this group has
**Doctor Schedules** ("OPD timings, slots, leave blocks"), **Service Rates** ("OPD fees, room
rates, package pricing" — this is where per-item GST rate actually lives, see Section 4), and
**Payer Masters** ("TPAs, corporates, PMJAY, CGHS, ESI, and scheme accounts").

**Clinical** — the master data clinical modules draw on: **Lab Test Master** ("Manage lab test
catalog and panels"), **Drug Formulary** ("Hospital drug list and formulary" — also where a drug's
default GST rate lives, now walked through in full in
[settings-drug-formulary.md](./settings-drug-formulary.md), including a critical finding that
bulk drug import is currently broken outright), **Consent Forms** ("Manage consent form
templates" — now walked through in full in
[settings-consent-forms.md](./settings-consent-forms.md)), **OT Checklist**
("WHO surgical safety checklist config"), **Clinical Protocols** ("Standard treatment protocols"),
**Alert Thresholds** ("Vitals and lab critical value alerts"), **ICD-10/ICD-11 Code Master**
("Manage diagnosis code sets for ICD coding"), **Radiology Modalities** ("Manage modality types and
pricing"), **Day Care Procedures** ("Configure approved day care procedure catalog"), and **EMR
Templates** ("Specialty note templates for consultations and clinical records").

**Queue Display & Kiosk** — **TV Queue Display** ("Multi-doctor queue, SpeechSynthesis
announcements, language support, marketing banners") and **Self-Service Kiosk** ("Touch-screen
kiosk configuration, device URL, and registration flow settings").

**Workflows** — hospital-wide process rules: **Discharge Workflow** ("Discharge checklist and
approval flow") and **OPD Queue Config** ("Token generation and queue rules") are now walked
through together in [settings-workflow-configuration.md](./settings-workflow-configuration.md) —
these are the two screens `routeRoles.ts` itself documents a real historical misconfiguration
incident against (a nurse once deleted the billing-clearance step; a receptionist once changed the
token scheme mid-clinic), now confirmed fixed at the access-control level but with a live content
defect found: deleting a dangerous custom discharge workflow doesn't actually clear the field the
live ward stepper enforces. **Approval Rules** ("Discount, refund and override approvals"),
**IPD Ancillary Payment** ("Pay-before-service vs
accrue-to-bill for pharmacy, lab, radiology"), **Patient Credit / Pay Later** ("Let OPD lab and
radiology orders be created before payment, collected later"), **Notification Config** ("SMS,
email and push notification rules"), **WhatsApp Bot** ("Automated WhatsApp message config"), and
**Scheduled Reports** ("Auto-generate and email reports").

**Integrations** — external system connections: **Integrations Console** ("Lab analyzers, PACS,
WhatsApp multi-provider, Tally ledger mapping"), **HL7/FHIR Integration** ("HL7 v2 and FHIR message
endpoints for external systems"), **Razorpay Payments** ("Payment gateway configuration"),
**HMIS/IHIP Portal** ("MoHFW portal credentials for report submission"), **WhatsApp/WATI**
("WhatsApp Business API setup"), **GST/NIC IRP** (already covered in Section 4), **ABDM/ABHA**
("ABDM HIP/HIU configuration"), **Backup & Export** ("Data export, audit logs"), **API Portal**
("Developer portal — API keys, webhooks and sandbox access"), **Integration Keys** ("WhatsApp &
government API keys"), and **AI Language Packs** ("Multi-language output for Voice Scribe, Token
Display, Discharge Summary — 10+ Indian languages").

**Inventory & Stores** — **Store Locations** ("Central store, ward sub-stores, OT store, ICU
store").

**Audit & Compliance** — **Record Retention** ("Retention policies per record type — NABH IMS
compliance"), **Record Access Log** ("Who accessed which records — IMS evidence for NABH
assessments"), and **Config Change Log** ("Audit trail of all configuration changes — controlled
change management").

**Go-Live & Migration** — **Go-Live Checklist** ("Pre-launch readiness verification for pilot
hospitals") and **Data Migration** ("Import patients, staff, drugs, and services from your old
system").

---

## A note on scope

This file deliberately does not cover every one of the ~45 `/settings/*` sub-pages — Section 5
above is an orientation map of the rest, not a substitute for a future phase that walks through
them one by one. See [README.md](./README.md) for what is and isn't covered across all phases of
this manual.
