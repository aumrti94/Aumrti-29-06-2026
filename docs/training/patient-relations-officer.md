# Patient Relations Officer (PRO) — Training Manual

**Module:** Patient Relations
**Screen:** `src/pages/pro/PROPage.tsx`, route `/pro`. On screen its header reads **"🤝 Patient
Relations"**.

> Dates are shown as DD/MM/YYYY. Money, where it appears at all in this module, is in ₹. This
> manual uses Indian English spelling throughout. This manual assumes you have never used hospital
> software before.

---

## Access check — read this before anything else

**The route carries no override.** `src/lib/routeRoles.ts` has no entry for `/pro`, so it falls
through to the module catalogue's own role list: `src/lib/modules.ts`, line 119 —
`roles: ["pro_officer", "receptionist", "super_admin"]`.

**`pro_officer` is not a default role card — it needs the one-time custom-role step, same pattern
as every specialty role since Phase 5.** `pro_officer` is not one of the 7 role cards that ship by
default on **Settings → Staff Members → Add Staff Member**
(`src/pages/settings/SettingsStaffPage.tsx`, `DEFAULT_ROLE_CARDS`, lines 86–92: only Doctor, Nurse,
Billing, Pharmacist, Lab Tech, Reception, Admin/CEO). To get a login titled specifically "PRO" or
"Patient Relations Officer," a Hospital Admin must first create a **custom role** on
**Settings → Roles & Permissions**. There is a real trap here worth calling out explicitly: role
creation slugifies whatever free-text label you type into the exact snake_case key the route guard
expects (`src/pages/settings/SettingsRolesPage.tsx`, `slugifyRoleName`, lines 45–46) —
`label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_")`. Typing the full, natural job title
**"Patient Relations Officer" slugifies to `patient_relations_officer`, which does NOT match
`pro_officer`** and will not grant access to this module. The admin must type something that
slugifies to exactly `pro_officer` — e.g. typing **"PRO Officer"** or **"Pro Officer"** both
produce `pro_officer` correctly. This is a sharper version of the pattern Phase 5–7 found: it is
not just "create a custom role," it is "create a custom role with exactly the right label," and
the obvious, natural-sounding label is the wrong one.

**`receptionist` IS a default role card, and it is on this module's role list with no
restriction — a Receptionist login already has zero-setup access to the entire module.** Unlike
Phase 5's Physiotherapy or Phase 7's Dietetics (where the fallback role was `doctor`), here the
fallback is `receptionist`, and `receptionist` is one of the 7 cards created automatically for
every hospital. That means **every hospital already has a login that can open `/pro` on day one,
with no admin configuration at all** — this is a cleaner starting position than most specialty
modules in this manual. Confirmed by tracing further: the five tabs below are each wrapped in
`GatedTabsTrigger`, and the two header buttons in `GatedAction` — but these are a **separate,
per-hospital permission gate** (`src/components/access/useModuleAccess.ts`,
`src/lib/tabPermissions.ts`), not a route-role restriction. They default to allowed for any role
that can reach the route at all, and only hide a tab/button if a Hospital Admin has specifically
gone in and restricted it for that role. So, out of the box, a Receptionist login sees every tab
and every button documented below, exactly the same as a PRO-labelled login — the distinction
between the two logins is a job title, not a different screen.

---

## What this screen looks like when you open it

Across the top, five KPI tiles update as you work: **Open Grievances**, **SLA Breached**,
**Avg CSAT**, **Active Visitors**, **Rights Not Signed**. Below them, five tabs:
**📋 Grievances**, **⭐ Feedback**, **🪪 Visitor Passes**, **📜 Patient Rights**, **📊 Analytics**.
Two buttons sit in the header at all times: **"+ New Grievance"** and **"+ Visitor Pass"**.

---

## 1. 📋 Grievances — logging and resolving a patient complaint

This tab is a two-pane screen: a filterable queue on the left, the selected grievance's full detail
on the right.

### Logging a new grievance

1. Click **"+ New Grievance"** in the header (top right of the whole screen, not inside the tab).
2. A **"New Grievance"** window opens. Fill in:
   - **Patient name \*** — required.
   - **Phone number** — optional, but needed if you want the system to WhatsApp the patient once
     the grievance is resolved (see step 5 below).
   - **Category** — choose one of: clinical care, billing, staff behaviour, facility cleanliness,
     food, waiting time, communication, privacy, other. (These are shown on screen with underscores
     replaced by spaces — the underlying values are `clinical_care`, `billing`,
     `staff_behaviour`, `facility_cleanliness`, `food`, `waiting_time`, `communication`,
     `privacy`, `other`.)
   - **Severity** — low, medium, high, or critical.
   - **Description \*** — required. What actually happened.
   - **Channel** — how the complaint reached you: counter, portal, whatsapp, phone, email, or
     written.
3. Click **"Submit Grievance"**.

The moment you submit, the grievance is automatically marked **acknowledged** (status jumps
straight from nothing to "acknowledged," with today's date/time stamped as the acknowledgement
time) — you do not click a separate "acknowledge" button. This matters because the SLA clock below
starts from this acknowledgement timestamp, not from when you first typed it in.

### Working a grievance through to resolution

1. Click any grievance in the left-hand queue to open it on the right. Use the filter buttons at
   the top of the queue — **Open, In Progress, Resolved, All** — to narrow what you're looking at.
   ("Open" shows anything in status open or acknowledged; "Resolved" shows resolved or closed.)
2. The detail pane shows the patient's name and phone, a severity badge, a channel badge, the full
   description, and a five-step progress stepper: **open → acknowledged → in progress → resolved →
   closed**.
3. An SLA badge tells you where you stand:
   - A pulsing red **"SLA BREACHED"** badge means the clock has already run out.
   - An orange **"Nh left"** badge means 4 hours or fewer remain.
   - A green outlined **"Nh left"** badge means you still have comfortable room.
   - The actual limit is **24 hours** from acknowledgement for **high** or **critical** severity,
     and **48 hours** for everything else. This is checked automatically by the system every 15
     minutes in the background — you do not need to manually mark anything as breached; if a
     grievance crosses the limit while still open, it flips to breached on its own.
4. **Assign it to staff.** Under **"Assign to Staff,"** pick a name from the dropdown (every user in
   your hospital appears here, with their role shown alongside, e.g. "Priya Sharma (nurse)") and
   click **"Assign."** This moves the grievance's status to "in progress."
5. **Resolve it.** Under **"Resolution,"** type the **root cause** (why it happened) and the
   **resolution taken** (what you did about it), then click **"Mark Resolved."** This:
   - Marks the grievance resolved, stamps the resolution time, and calculates the turnaround time
     (TAT) in hours to one decimal place.
   - Logs NABH evidence against standard **PCC.6** automatically — you do not file this separately.
   - If the patient's phone number was captured, opens WhatsApp Web in a new tab with a pre-filled
     message to the patient naming the grievance category and your resolution text, signed "—
     Patient Relations Team." **Review this message before sending it, the same as any pre-filled
     message anywhere in this system** — it is not sent automatically, opening WhatsApp Web still
     requires you to actually click Send there.

Once resolved, the detail pane shows a green **"✓ Resolved"** card with the root cause, resolution
text, and TAT in hours, instead of the assignment/resolution forms.

---

## 2. ⭐ Feedback — read-only CSAT/NPS tracking

This tab has no "Add Feedback" button anywhere on it — it is read-only, showing whatever has
already landed in the system. Three tiles at the top: **Overall CSAT** (out of 5, with a star
rendering), **NPS Score**, and **Responses This Month**. Below them, a table of every feedback
record: **Channel, Rating (as stars), Comment, Sentiment, Date**. A row with a CSAT of 2 or below
is highlighted in red so it stands out at a glance.

> **Important finding — this tab will show "No feedback records yet" in real use, and this is not
> a documentation gap, it is a genuine disconnect between two parts of the product.** Tracing every
> place in the codebase that touches this tab's data confirmed:
>
> - This tab reads exclusively from the `feedback_records` table
>   (`PROPage.tsx`, `loadFeedbacks`/`loadKPIs`).
> - **Nothing anywhere in the entire application writes to `feedback_records`.** A repo-wide search
>   for every `.from("feedback_records")` call found exactly one file touching that table at
>   all — `PROPage.tsx` itself, and both of its calls are reads (`.select(...)`), never an insert.
>   There is no staff-facing "log a feedback call" form and no patient-facing screen that targets
>   this table.
> - The screen patients actually use to leave feedback — **"How was your experience?"** on the
>   Patient Portal (`src/pages/portal/PortalFeedback.tsx`, reached from the portal after a visit,
>   with star ratings for Overall/Doctor/Nursing/Facilities, a "Would you recommend us" Yes/No, and
>   a comments box) — writes to a **different table entirely: `patient_feedback`**, not
>   `feedback_records`. Confirmed in its migration
>   (`supabase/migrations/20260326094517_8e6560cd-e8fa-4a31-b58b-80b3dd5a2e8a.sql`, line 33):
>   different columns too (`overall_rating`/`doctor_rating`/`nursing_rating`/`facility_rating`/
>   `would_recommend`, no `nps_score`, no `channel`, no `sentiment`).
> - That `patient_feedback` table is, in turn, **never read anywhere else in the app** — a
>   repo-wide search for `.from("patient_feedback")` finds only the one insert call in
>   `PortalFeedback.tsx`. It isn't surfaced on this Feedback tab, the Analytics PROM/PREM tab, or
>   anywhere else checked.
>
> **In plain terms: the patient-facing feedback form and the PRO's Feedback tab are two
> disconnected systems writing to two different tables, and a third table this tab is built to
> read from (`feedback_records`) currently has no writer in the product at all.** Every patient who
> fills in the portal's "How was your experience?" form today has their rating land somewhere this
> screen will never show you, and this screen's own KPI tiles (Avg CSAT, NPS, Responses This Month)
> will read 0/zero/empty until some other process — not identified anywhere in this codebase —
> starts inserting into `feedback_records`. **Flagged here, not fixed** — this is a data-pipeline
> gap for Nikhil/Vikram to sequence (either point this tab at `patient_feedback`, or wire a writer
> into `feedback_records`), not something this training document can resolve.
>
> **Separately — the Feedback-vs-Reviews comparison this phase was specifically asked to check.**
> The CRM & Marketing module's **⭐ Reviews** tab (documented in
> [marketing-patient-engagement-executive.md](./marketing-patient-engagement-executive.md),
> Section 3) is a **genuinely separate, non-overlapping system** from this Feedback tab — it reads
> and writes `online_reviews`, a table for ratings left on **external** platforms (Google, Practo,
> Justdial, Facebook, Other), with its own reviewer name, platform, and AI-analysis fields; it has
> nothing to do with `feedback_records` or `patient_feedback`. They are not the same data, and not
> even "overlapping" in the sense of partial duplication — three fully distinct tables, one feeding
> Reviews, two intended to feed this tab (and currently neither reliably does, per the finding
> above). **There is one genuine cross-module link worth knowing, though, in the other
> direction**: on the CRM Reviews tab, clicking **"AI Analyse"** on a review can, if the AI flags it
> as needing escalation, automatically **insert a new row into this module's own `grievances`
> table** (`src/components/crm/ReviewSentimentAnalyser.tsx`, lines 70–79) — with
> `channel: "portal"`, a severity drawn from the AI's urgency read, and a category crudely mapped
> from whichever department the AI implicated (anything flagged "OPD" becomes `waiting_time`,
> everything else becomes `clinical_care`, regardless of what the AI's own `topics_mentioned` list
> actually said). **In practice, this means a grievance can appear in your Grievances queue (Section
> 1 above) that nobody in Patient Relations typed in** — it originated from a Marketing Executive
> analysing an online review. If you see a grievance with channel "portal" and a patient name that
> doesn't match your own PRO queue's typical sources, this is very likely how it got there — it is
> working as designed, not a data-entry error on your end.

---

## 3. 🪪 Visitor Passes — issuing and tracking visitor access

A blue notice banner at the top states your hospital's visiting rules as configured in the code:
**"ICU: Max 2 visitors per shift (9AM-1PM, 5PM-7PM only) · NICU: Parents only, max 2 hours per
visit."** This is informational text only — the system does not enforce these limits for you; you
apply them yourself when issuing a pass.

### Issuing a pass

1. Click **"+ Visitor Pass"** in the header (top right of the whole screen).
2. In **"Search patient..."**, type at least 2 characters of the patient's name or phone number —
   a dropdown of matches appears; click the right one to select them. (Only active patients are
   searchable.)
3. Fill in **Visitor name \***, **Relation \*** (both required — e.g. "Son," "Daughter," "Spouse"),
   **Visitor phone**, and **Purpose**.
4. Pick how long the pass is valid for: **1hr, 2hr, 4hr, or 8hr**.
5. Click **"Issue Pass."**

The system generates a pass number itself in the format **VP-2026-123456** (year plus a 6-digit
sequence) — you never type this. The pass is immediately recorded as entered (its entry time is
stamped at the moment you click Issue Pass, not when the visitor physically walks in), and its
valid-until time is calculated from the hours you picked.

### Tracking passes and recording an exit

The table below lists every pass: **Pass #, Visitor, Relation, Entry** (time), **Valid Until**
(time), **Status** (active/expired, colour-coded), and an **Action** column. For any pass still
active and not yet exited, click **"Mark Exit"** to stamp the exit time and flip its status to
expired.

---

## 4. 📜 Patient Rights — NABH PCC.1 signature capture

A purple notice banner states the standard this tab exists for: **"NABH PCC.1: All admitted
patients must acknowledge patient rights & responsibilities within 24 hours of admission."** The
table below lists every currently-admitted patient who has **not yet** signed — **Patient, Ward,
Admitted** (date/time), and an **Action** column with a **"Get Signature →"** button. When every
admitted patient is covered, the table shows a green **"✓ All admitted patients have acknowledged
rights"** message instead.

### Capturing the acknowledgement

1. Click **"Get Signature →"** next to the patient.
2. The **"Patient Rights & Responsibilities"** window opens. At the top, a row of four language
   buttons: **English, Hindi, Telugu, Tamil.**
   - **Read this carefully: clicking a language button only changes which button is highlighted
     (`rightsLang`) — it does NOT change the rights/responsibilities text shown below it.** The
     eight numbered rights (e.g. "Right to respectful care regardless of religion, caste, or
     economic status," "Right to know your diagnosis, treatment plan, and alternatives," "Right to
     file a complaint / grievance") and the six responsibilities (e.g. "Provide complete and
     accurate medical history," "Follow hospital rules and visiting hours") are hardcoded in
     English only in the component source — there is no Hindi, Telugu, or Tamil text anywhere in
     this screen's code. What the language toggle **does** do is get saved as plain data on the
     acknowledgement record itself (so your hospital has a record of which language was declared
     for this patient), and it is quoted back to you in the confirmation toast when you save. If a
     patient needs the content read out in their own language, you (or whoever is witnessing) must
     do that verbally — the screen will not display it for you in anything but English, regardless
     of which language button is highlighted.
3. Below the rights/responsibilities text, fill in:
   - **Patient / Guardian Name** — if left blank, the system falls back to the patient's own name
     from their admission record.
   - **Witness Name (Nurse/PRO)** — optional; typically you, or the nurse present.
4. Under **"Signature,"** the patient (or their guardian) signs with a mouse or stylus directly in
   the white box using their finger/stylus/mouse — draw the signature the same way you would with
   pen on paper. Click **"Clear Signature"** to wipe it and start again if needed.
5. Click **"Save Acknowledgement."**

**What actually happens to the captured signature.** The signature canvas is converted to a PNG
image (a base64 data URL, via the canvas's own `toDataURL("image/png")`) and saved as a text value
directly on the new row in the `patient_rights_acknowledgements` table, in a column called
`digital_signature` — alongside the patient ID, the admission ID, the language you had selected,
the guardian/patient name, and the witness name. It is genuinely persisted to the database, not
discarded — this is not one of the "no save handler" gaps flagged elsewhere in this manual series.
On save, a toast confirms **"Patient rights acknowledged — NABH PCC.1 ✓"**, and NABH evidence is
logged automatically against standard **PCC.1** — again, you do not file this separately. The
patient then drops off the pending list on this tab (and the "Rights Not Signed" KPI tile at the
top of the whole screen decreases by one).

---

## 5. 📊 Analytics — orientation

A read-only reporting screen, nothing to click through step by step:

- **Grievance Categories** — a donut chart of all grievances ever logged, broken down by category,
  colour-coded the same way the Grievances queue badges are.
- **SLA Compliance** — three figures: **Open Grievances**, **SLA Breached**, and a **Compliance
  Rate** percentage (calculated as (open minus breached) ÷ open — if there are currently zero open
  grievances, this shows 100% by definition, not because every grievance in history has met SLA).

---

## Content findings from writing this file

**One serious data-pipeline gap found, documented in full under Section 2 above rather than
repeated here**: the Feedback tab reads a table (`feedback_records`) that nothing in the product
writes to, while the real patient-facing feedback form writes to a completely different table
(`patient_feedback`) that nothing reads. Flagged, not fixed, per this manual's standing rule — this
needs a product decision (which table is the real one, and whether to backfill or re-point), not a
training-doc workaround.

**One cross-module behaviour confirmed, not a defect**: the CRM & Marketing Reviews tab's AI
Analyse feature can write directly into this module's `grievances` table when it flags a review as
needing escalation (`src/components/crm/ReviewSentimentAnalyser.tsx`, lines 70–79). This is
working as designed, but a PRO reading only this file would have no way to know a given grievance
came from there — now documented in Section 2.

**One content-accuracy point worth flagging, not a defect in the strict sense**: the Patient Rights
tab's language toggle (Hindi/Telugu/Tamil) changes only which button is visually selected and what
gets saved as metadata — it does not translate the actual rights/responsibilities text, which is
hardcoded in English only. A hospital relying on this toggle to actually present the content in a
regional language will find it does not do that; flagged to clinical-pod/frontend-pod as a
content/i18n gap, not fixed here.

No other code defect in this module was confident and safe enough to flag as a bug within this
pass. The "+ New Grievance" and "+ Visitor Pass" header buttons being conditionally hidden by a
per-hospital permission gate (`GatedAction`) is working-as-designed access control, as is each
tab's own `GatedTabsTrigger` wrapper — both are noted above under Access rather than flagged as
defects.
