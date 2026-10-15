# Mortuary & Medico-Legal Staff — Training Manual

## What this role does in the system

As Mortuary & Medico-Legal staff, you work in one module: **🏥 Mortuary & Medico-Legal**. It opens
on the **📋 Register** tab — every body currently in mortuary storage, in one list — and from there
you issue the **📜 MCCD** (Medical Certificate of Cause of Death, Form 4), register and track
**🚔 MLC** (medico-legal case) cases including police intimation, process a **🔑 Release** (body
handover to next of kin), and record **🫀 Organ Donation** cases under the NOTTO protocol. This
manual assumes you have never used hospital software before.

> **Access check — a real one-time admin-configuration step, same as three other specialty roles,
> but with no doctor fallback at all.** The `/mortuary` route has no override in
> `src/lib/routeRoles.ts`, so it inherits its allowed-roles list straight from the module catalogue
> (`src/lib/modules.ts`, line 78): **Mortuary Officer**, **Medical Officer**, and **Super Admin**.
> Both job titles are present on that list — there is no flat access gap the way Phase 2 found for
> Radiology Technician or IPD Ward Clerk. But neither **Mortuary Officer** nor **Medical Officer**
> is one of the 7 role cards that ship by default on **Settings → Staff Members → Add Staff Member**
> (`src/pages/settings/SettingsStaffPage.tsx`, `DEFAULT_ROLE_CARDS`, lines 85–92: only Doctor, Nurse,
> Billing, Pharmacist, Lab Tech, Reception, Admin/CEO) — and, confirmed against the actual migrations
> directory, no migration seeds either role as a pre-built system role either. To get a login with
> either title, your Hospital Admin must first create it as a **custom role** on
> **Settings → Roles & Permissions**: typing a free-text label there slugifies it into the exact
> snake_case key the route guard expects (`src/pages/settings/SettingsRolesPage.tsx`,
> `slugifyRoleName`, lines 44–46, used at role-creation time around lines 320–330) — "Mortuary
> Officer" becomes `mortuary_officer`, "Medical Officer" becomes `medical_officer`. This works
> correctly today and is a one-time setup step, not a product gap. **Unlike Physiotherapy in Phase
> 5, there is no `doctor` fallback on this module's role list** — an existing Doctor login cannot
> open `/mortuary` at all; the custom-role step is mandatory for every mortuary login, with no
> exception.

All dates on screen show as DD/MM/YYYY. All money shows as ₹.

---

## 1. The header — quick actions

Two buttons, both gated by your hospital's permission setup for this module (if either is missing
for your login, ask your admin — it isn't a bug):
- **"+ Admit to Mortuary"** — opens the body-admission form (Section 2).
- **"MLC Registration"** — opens the medico-legal case form directly (Section 4), without first
  admitting a body.

Below the header, four KPI tiles always show: **In Mortuary**, **Active MLC Cases**, **MCCD
Pending**, and **Days (Oldest)** — the longest any body currently in storage has been waiting,
turning red once it passes 3 days.

---

## 2. 📋 Register — admitting a body

This is the tab the module opens on: a table of every body ever admitted — **Body No**, **Patient**,
**Age**, **Time of Death**, **Storage**, **Status**, **Days**, **MLC**.

### Admitting a body

1. Click **"+ Admit to Mortuary"** in the header.
2. **Patient \*** — search by name or UHID and click the match. If the patient isn't registered yet,
   click the inline **Register New** option to open the standard patient-registration form; once
   saved, it fills this field for you automatically.
3. **Time of Death \*** — date and time picker.
4. **Pronounced by \*** — pick the certifying doctor from the dropdown (only users with the
   **doctor** role appear here).
5. **Cause of Death \*** — free text.
6. **Manner of Death** — a dropdown of configured manner types (e.g. natural, accidental, suicide,
   homicide, undetermined — your hospital's exact list is configurable).
7. Toggle **"Medico-Legal Case (MLC)"** if this death requires police involvement. Turning it on
   shows an amber note: **"⚠️ MLC registration will be required after admission."**
8. Optionally fill **Storage Slot** (e.g. "Cold Storage Unit 1") and **Notes**.
9. Click **"Admit"**. The system generates the next **Body No** for your hospital automatically — you
   never type one yourself. If you ticked MLC, the screen jumps you straight to the MLC tab with a
   reminder toast to complete that registration.

### Reading the register

Each row's **Days** column counts days since admission while the body is still **in_mortuary**, and
turns red with a **"⚠️ UNCLAIMED"** label once it passes 3 days (amber at exactly 3 days) —
operationally, this is the screen's way of surfacing a body that has been in storage past the
hospital's 72-hour routine retention window. **This is a passive colour change on this one screen
only** — nothing pings you, your supervisor, or any other screen when a body crosses that line; you
have to be looking at this tab to notice it.

---

## 3. 📜 MCCD — issuing Form 4

Left panel: every admitted body **not yet released and with no MCCD on record** under **Pending
Certification**, and every body that already has one under **Issued Certificates**. Click a pending
case to open its MCCD form on the right.

1. Click **"🤖 AI Draft"** (top-right of the form) to have the system draft Part I of the
   certificate from the patient's clinical record. This calls an AI model and returns a toast reading
   **"AI draft generated — please review and verify"** — treat every field it fills as a draft, not
   a fact; you are the one certifying it, not the AI.
2. Fill in (or correct the AI draft for) **PART I — Cause of Death**: **1a. Immediate cause \*** and
   its **Approx. interval**, **1b. Due to (antecedent)** and its interval, **1c. Due to
   (underlying)** and its interval.
3. **Part II — Other significant conditions** — free text.
4. **ICD-10 Code**, **Manner of death**, and toggle **"Post-mortem conducted"** if one was.
5. **Certifying Doctor \*** — pick from the dropdown.
6. Click **"Generate MCCD Certificate"**. The system assigns the next MCCD number for your hospital
   automatically.

> **Content gap found while grounding this against hospital policy.** Nothing in this tab — or
> anywhere else in `MortuaryPage.tsx` — fires an automatic alert or countdown against the 24-hour
> Form-4 deadline for an in-hospital death. The **MCCD Pending** KPI on the header is the only
> on-screen signal, and unlike the Register tab's Days/UNCLAIMED colour-coding, it carries no
> deadline indicator of its own. Track the 24-hour window manually until this is built.

---

## 4. 🚔 MLC — registering and tracking a medico-legal case

A table of every MLC case: **MLC No**, **Patient**, **Incident**, **Police Station**, **FIR**,
**Status**, **Actions**. Click **"+ Register MLC"** (either here or the header button) to open the
form:

1. **Patient \*** — search/select, or register new inline, same as Section 2.
2. **Link to Mortuary Case** — optional, if this MLC is tied to a body already admitted.
3. **Incident Type \*** — RTA, Assault, Fall, Poisoning, Burns, Drowning, Hanging, Gunshot, Unknown
   Cause, or Other.
4. **Incident Date**, **Location**, **Police Station**, **Officer Name**, **Officer Badge**,
   **Injury Description**.
5. **Forensic Samples Collected** — tick any of: Blood, Urine, Viscera, Gastric lavage, Swab,
   Clothing, Other.
6. Click **"Register MLC"**. The system assigns the next MLC number automatically.

Once a case shows status **open**, a **"Mark Intimated"** button appears in its row — click it once
you've actually notified the police, and the record is stamped with the exact intimation time
(`intimated_at`), satisfying the "system-tracked" part of the police-intimation requirement.
**There is no 6-hour countdown or alert tied to this** — the system records when intimation happened
if you tell it to, but nothing warns you as the 6-hour window is closing. Click **"📄 Letter"** on any
row to open a pre-filled police intimation letter (patient name, age, incident type, date, injuries),
with **"📋 Copy Text"** and **"🖨️ Print"** buttons.

---

## 5. 🔑 Release — handing over the body

Two tables: **Ready for Release** (every body still in storage, with its MCCD status and MLC flag
visible) and **Released Records** (history). Click **"Release Body"**:

1. **Select Case \*** — pick the body from the dropdown. If it's flagged MLC, an amber warning
   appears: **"⚠️ This is an MLC case — police clearance is mandatory before release."**
2. **Released To \*** and **Relation \*** — who is collecting the body and their relationship to the
   deceased.
3. **ID Proof Type** (Aadhaar / Voter ID / Passport / Driving License / Other) and **ID Number**.
4. Toggle **"Police Clearance Obtained"** and **"MCCD Issued"** as applicable.
5. Tick **Documents Given**: MCCD, Death Summary, Belongings, Post-mortem Report.
6. **Witness Name**, then click **"Confirm Release"**.

**For an MLC case, the police-clearance check is a real hard block, not just a reminder** — it's
enforced twice: once in this screen (you cannot submit without ticking the switch) and again at the
database level by a trigger on the `body_releases` table itself
(`supabase/migrations/20261106000029_mlc_police_clearance_release_gate.sql`), which rejects the
insert outright if `police_clearance` is false on an MLC case — so even a direct database write or a
future screen that skips this form cannot release an MLC body without clearance recorded.

On confirmation, the body's status flips to **released**, and the system automatically raises a
Mortuary Services bill for the patient.

> **Two defects found while tracing this handler — both now fixed.** `released_by` previously
> recorded `doctors[0]?.id` — the first row of an unfiltered, page-load-time users query, not the
> logged-in staff member confirming the release. It now reads the real logged-in user. The
> auto-generated Mortuary Services bill previously passed neither `admissionId` nor `performedBy` to
> `autoChargeService`, so a mortuary charge for a patient who had been admitted before death could
> never append to that admission's existing bill. It now passes both, matching the pattern every
> other module's admission-aware billing call uses.

---

## 6. 🫀 Organ Donation — NOTTO protocol

A table of every donation record: **Patient**, **Brain Death**, **Family Consent**, **Organs
Pledged**, **NOTTO Ref**, **Outcome**. Click **"+ New Donation Record"**:

1. **Mortuary Case \*** — pick the body; the patient is linked automatically.
2. **Brain Death Certification** — the form itself notes this requires 4 doctors (2 hospital + 1
   external neurologist + CMO); toggle **"Brain death certified"** and record the **Date/Time**.
3. **Family Counselling** — toggle **"Family counselled"**, then **"Family consent given"** if
   consent was obtained, with a **Consent Date**.
4. If consent is given, tick the **Organs Pledged**: Kidney, Liver, Heart, Lung, Cornea, Pancreas,
   Skin, Bone.
5. **NOTTO Reference No**, then click **"Save Record"**.

To record what actually happened to a pledged organ, **click directly on the Outcome cell** for
that row — it turns into a text box with **Save**/**Cancel** buttons (press Enter to save, Esc to
cancel). The outcome is only known after the fact, so this is a separate step from creating the
donation record, not part of the "+ New Donation Record" form above.

---

*This manual covers the Mortuary & Medico-Legal screens as they exist in Aumrti HMS today, including
the gaps documented in Sections 2–6. If a screen looks different from what is described here, tell
Murthy (Facility & Support Services) so the manual can be corrected.*
