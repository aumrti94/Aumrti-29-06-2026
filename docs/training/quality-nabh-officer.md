# Quality / NABH Officer — Training Manual

**Module:** Quality & NABH
**Owner:** Ramya
**Screens:** `src/pages/quality/QualityPage.tsx` (route `/quality`) — plus five standalone sibling
pages that are each their own route and their own component, not tabs inside QualityPage:
`SafetyEventsPage.tsx` (`/quality/events`), `ClinicalAuditPage.tsx` (`/quality/clinical-audits`),
`CommitteesPage.tsx` (`/quality/committees`), `QIProjectsPage.tsx` (`/quality/qi-projects`),
`NABHMatrixPage.tsx` (`/nabh/compliance`), and `JCIAccreditationPage.tsx` (`/quality/jci`).

> Dates are shown as DD/MM/YYYY. Money, where it appears at all in this module, is in ₹. This
> manual uses Indian English spelling throughout (e.g. "organisation", "analyse", "colour").

---

## Read this first: there are two separate families of screens with overlapping names

Before writing a single walkthrough, every screen below was opened and read in full, because the
Quality module has a structural trap: **QualityPage has tabs that look like they do the same job
as four of the five standalone pages, and in two cases they genuinely do not use the same data.**
Getting this wrong would mean training a Quality Officer on the wrong screen for their actual job.

| Topic | QualityPage tab (inside `/quality`) | Standalone page | Verdict |
|---|---|---|---|
| Logging an event | **🚨 Incident Reports** tab → `IncidentReportsTab.tsx`. Table: `incident_reports`. Fields: incident type, severity (minor/moderate/major/sentinel), description, immediate action, a 4-step status bar (Reported → Under Review → CAPA Raised → Closed). No root-cause-analysis form, no structured CAPA (raising a CAPA here is just a status flag), no AI assistance. | `/quality/events` → `SafetyEventsPage.tsx`. Table: `safety_events` (plus `safety_event_rca` and `safety_event_capa`). Event types include complaint/grievance/legal notice/claim as well as incident/near-miss/sentinel. Has a structured Root Cause Analysis tab (5 Whys / Fishbone / FMEA, with an AI-drafted RCA you must review and tick before saving), a structured CAPA tab (type, owner, due date, AI-suggested actions), NABH-standard linking that auto-creates evidence, and an overdue-CAPA banner. | **`SafetyEventsPage` is the real, fuller workflow** — this manual documents it as Walkthrough 1. `IncidentReportsTab` is a separate, simpler, older-looking system writing to a different table. **These two do not share data** — an event logged on one will never show up on the other. |
| Running a clinical audit | **📅 Audit Calendar** tab → `AuditCalendarTab.tsx`. Table: `audit_records`. This is a scheduling calendar for accreditation-style audit *visits* (internal/external/NABH surveillance/NABH accreditation/peer/unannounced), with an auditor name, a findings box, and a single overall score out of 100 once you mark it complete. | `/quality/clinical-audits` → `ClinicalAuditPage.tsx`. Table: `clinical_audits` (plus `clinical_audit_samples`). This is a full clinical-audit *cycle*: objective, measurable criteria, a sample of real records pulled from OPD/IPD/Lab/Billing and marked compliant/non-compliant one by one, a compliance percentage with a chart, an AI-drafted committee narrative, and a one-click path to spin up a QI Project if compliance is below 80%. | **Not a duplicate — two different jobs.** Audit Calendar answers "when is our next NABH/external audit visit and did it pass." Clinical Audits answers "are we actually compliant with a specific clinical standard, and by how much." This manual documents **both**: Walkthrough 2 (Clinical Audits, the richer PDSA-style cycle) and a shorter note on Audit Calendar in the orientation section, since a Quality Officer realistically uses both. |
| Committee meetings | **No tab for this exists inside QualityPage.** The `navTabs` array in `QualityPage.tsx` lists exactly eight tabs — NABH Dashboard, Quality Indicators, Audit Calendar, Incident Reports, CAPA Tracker, Infection Control, Antibiotic Stewardship, Pain Management — and none of them is Committees. | `/quality/committees` → `CommitteesPage.tsx` is the **only** screen for this in the entire app. | **Confirmed: `CommitteesPage` is it.** There is nothing to choose between. Walkthrough 3 documents it. |

The "+ File Incident" and "+ Schedule Audit" buttons in QualityPage's own header bar open
`FileIncidentModal` and `ScheduleAuditModal` — these feed the **simpler, older tables**
(`incident_reports`, `audit_records`), not the ones this manual's main walkthroughs use. If you
use those buttons expecting them to show up in Safety Events or Clinical Audits, they will not —
they are a different system.

---

## What this role does in the system

As a Quality / NABH Officer, your day-to-day work spans three mostly-separate screens:

- Logging and investigating a patient-safety event, complaint, or legal notice, and tracking it
  through Root Cause Analysis and CAPA (**Safety Events**, Walkthrough 1).
- Running a structured clinical audit — defining criteria, pulling a sample of real records,
  marking each one compliant or not, and writing up findings for the Quality Committee
  (**Clinical Audits**, Walkthrough 2).
- Setting up hospital committees (Quality & Safety, IPC, Pharmacy & Therapeutics, Mortality &
  Morbidity, Ethics, and so on), scheduling their meetings, recording agendas and minutes, and
  chasing the action items that come out of them (**Committees**, Walkthrough 3).

All three screens auto-link NABH standards where relevant — ticking a chapter or standard code
anywhere in these screens creates (or reuses) a NABH evidence record, so your day-to-day logging
work doubles as accreditation evidence without a separate filing step.

---

## 1. Log and investigate a safety event (Safety Events)

1. Open the **Quality** screen from wherever your login lands you (see **Access control** below —
   this may not be a direct click for you). Click **Events & Incidents** at the bottom of the left
   sidebar. This opens `/quality/events` — **Safety Events & Complaints**.
2. Click the **+ Report Event** button, top right.
3. A **"Report Safety Event / Complaint"** window opens.
   - Click one of the **Event Type** pills: **Incident, Near Miss, Sentinel Event, Complaint,
     Grievance, Legal Notice, Claim**.
   - Type what happened in the **Description** box (minimum 20 characters). Once you've typed
     enough, an **AI: Suggest category & severity** button appears — click it and the system
     proposes a **Category** (fall, medication error, surgery, lab, billing, behaviour, privacy,
     equipment, infection, other) and a **Severity** (No Harm / Mild / Moderate / Severe / Death)
     with a one-line reason. Click **Apply** to accept it, or set Category and Severity yourself
     in the dropdowns below — the AI suggestion is never applied automatically.
   - Pick a **Department** and type a **Location** (e.g. "Ward 3B").
   - Fill in **Immediate Action Taken**.
   - Optionally, under **Link to NABH Standard**, pick a standard code — doing this
     auto-creates a NABH evidence record the moment you save, so you don't have to separately log
     it on the NABH Matrix.
4. Click **File Event**. The event gets an automatic number (e.g. `EV-2026-0001`) — you never type
   this yourself.
5. The event now appears in the list on the left. Click it to open its detail pane on the right.
   Three tabs run across the top: **OVERVIEW, RCA, CAPA**.
   - **OVERVIEW** — click **Edit** to update Status, Location, or Immediate Action Taken as the
     investigation moves along. A progress bar shows Reported → Under Review → Action Planned →
     Closed.
   - **RCA** (Root Cause Analysis) — choose a **Methodology** (5 Whys, Fishbone/Ishikawa, FMEA, or
     Other). You can click **Generate Draft RCA (5 Whys)** or **Generate AI Draft** to get an
     AI-written starting point — either way, a review checkbox ("I have reviewed and edited this
     RCA…") must be ticked before **Save RCA** becomes clickable; the system will not let an
     unreviewed AI draft go straight into the record. Fill in the **RCA Summary / Root Cause** box
     and the four **Contributing Factors** fields (People, Process, Equipment, Environment).
     Saving an RCA automatically moves the event's status to "Under Investigation" if it wasn't
     already further along.
   - **CAPA** — click **+ Add Action**, choose **Corrective** or **Preventive**, assign an
     **Owner**, set a **Due Date**, and describe the action. You can also click **AI Suggest
     Actions** for three draft suggestions — tick the confirmation checkbox before any suggestion
     can be added. Adding your first CAPA action moves the event to "Action Planned". Each action
     has its own status dropdown (Open / In Progress / Completed / Cancelled) — marking one
     Completed timestamps it.
6. If a CAPA action's due date passes while it's still Open or In Progress, it shows up in the
   amber **"N CAPA actions are overdue"** banner at the top of this screen (and, for anyone whose
   role can reach this screen, as a clickable banner on the Dashboard home page too — see Access
   control). Clicking **View** on that banner filters the event list down to just the overdue
   ones.

---

## 2. Run a clinical audit (Clinical Audits)

1. From inside Quality, click **Clinical Audits** at the bottom of the left sidebar. This opens
   `/quality/clinical-audits`.
2. Click **+ New Audit**. A 3-step wizard opens:
   - **Step 1** — **Audit Title*** (e.g. "Antibiotic Prescription Compliance Audit"),
     **Department**, and **Audit Objective*** (what you're measuring and why).
   - **Step 2** — **Audit Criteria / Standard*** (what counts as "compliant" — be specific, e.g.
     "Prescription includes diagnosis, generic name, dose, route, and duration"), **Data Source**
     (free text — use a value containing "OPD", "IPD", "Lab", or "Bill" if you want the
     auto-sampling feature in step 4 below to work), **Sample Method** (Consecutive / Random /
     All), and **Target Sample Size**.
   - **Step 3** — **Period From / Period To**, then a summary screen, then **Create Audit**.
3. The new audit opens on the right with a status stepper: **Planning → Data Collection → Analysis
   → Action → Closed**. A button in the top-right of the audit header advances it one stage at a
   time (its label changes — "Start Data Collection", "Move to Analysis", "Move to Action Stage",
   "Close Audit").
4. On the **Overview** tab, you can click **Draft Criteria with AI** — it returns a drafted
   definition of compliance, data elements to check, and a suggested benchmark. You must tick "I
   confirm this AI-drafted criteria is clinically appropriate…" before **Apply to Audit Criteria**
   is enabled.
5. Move to the **Data Collection** tab (label shows a live count, e.g. "Data Collection (12)"):
   - Click **+ Add Sample** to record one record by hand — pick a **Module/Source** (OPD, IPD,
     Lab, OT, Billing, Pharmacy, Other), mark **Compliance** (Compliant / Non-Compliant / Pending
     review), and add **Remarks / Reference**.
   - Or click **Generate Sample** to have the system pull real records matching your Data Source
     and period automatically (it recognises "opd"/"encounter"/"prescription", "ipd"/"admission",
     "lab", or "bill" in whatever you typed as the Data Source in step 2). This opens an amber
     **"Generated Preview"** table — for each row, click the green ✓ or red ✗ icon to mark it
     compliant or not, add a **Remarks** note, then click **Save Sample** to commit the batch (or
     **Discard** to throw the preview away and try again).
   - The four KPI cards above (Total / Compliant / Non-Compliant / Pending) update live as you
     mark records.
6. Move to the **Analysis** tab:
   - A large percentage shows your **Compliance Rate**, with a bar chart of Compliant /
     Non-Compliant / Pending. Below 80%, a warning appears: "Compliance below 80% NABH threshold —
     consider converting to a QI project."
   - Type your **Audit Conclusion / Committee Notes** — this auto-saves the moment you click away
     from the box.
   - Click **Generate Narrative** under **AI Narrative Summary** for an AI-drafted, committee-ready
     write-up built from your sample data and conclusion notes. You must tick a confirmation
     checkbox ("I confirm this narrative accurately reflects the audit findings…") before **Save
     Narrative** stores it on the audit record.
   - If compliance is below 80% and the audit isn't Closed yet, an orange **"Convert to QI
     Project"** panel appears. Clicking **Start QI Project** opens a short form (Project Title,
     Problem Statement, Aim Statement — a SMART goal, is required — Baseline %, Target %, Start
     Date). Saving it creates a QI Project and takes you straight to the **QI Projects** screen
     (`/quality/qi-projects`, not covered in detail in this manual — it runs PDSA-cycle
     improvement projects, often seeded from an audit this way).

**Separately — the Audit Calendar.** If what you actually need is to schedule or track an
upcoming NABH surveillance visit, an external audit, or an unannounced inspection (rather than run
your own clinical-compliance sample), use the **📅 Audit Calendar** tab inside QualityPage instead
— click **+ Schedule Audit** (either from QualityPage's own header, or inside the tab itself),
fill in **Title**, **Type** (internal/external/NABH surveillance/NABH accreditation/peer/
unannounced), **Date**, optional **Auditor Name**, and tick the **NABH Chapters** the visit will
cover. Once the date passes, open the entry from the calendar or the list below it, fill in
**Findings** and an overall **Score (%)**, and click **Mark Completed**. This is a lighter,
calendar-first tool — it does not do sampling, AI narratives, or QI conversion.

---

## 3. Set up a committee and track its meetings (Committees)

1. From inside Quality, click **Committees** at the bottom of the left sidebar. This opens
   `/quality/committees` — **Governance & Committees**. Three tabs run across the top: **🏛️
   Committees, 📋 Meetings, ✅ Action Items**.
2. **Create a committee.** Click **+ New Committee**. A quick-select list of common committees
   appears (Quality & Safety Committee, IPC Committee, OT Committee, Pharmacy & Therapeutics
   Committee, Mortality & Morbidity Committee, Blood Transfusion Committee, Ethics Committee, NABH
   Steering Committee, Biomedical Waste Committee, Disaster Management Committee) — click one to
   use it as the name, or type your own. Add a **Description**, pick a **Chairperson** and
   **Secretary** from your hospital's staff list, then click **Create Committee**.
3. **Add members.** Select the committee on the left, then in the **Members** panel click **Add**.
   Choose **HMS User** (pick from your staff list) or **External** (type a Name and Designation
   for someone without a login, e.g. a visiting consultant). Set their **Role** (Member / Invitee /
   Advisor / Observer) and tick **Core member** if relevant, then **Add Member**.
4. **Schedule a meeting.** Either click **New Meeting** from inside a selected committee, or go to
   the **Meetings** tab and click **+ Schedule Meeting**. Pick the **Committee**, **Meeting
   Date**, and optional **Venue**. If the committee name matches a known template (e.g. "IPC
   Committee"), a template preview box appears with a **Preview agenda** link and its linked NABH
   chapters — tick **Pre-fill agenda template** and **Pre-fill minutes template** to start from it
   rather than a blank page, then click **Create Meeting**.
5. **Run the meeting record.** Select the meeting from the Meetings tab list. Four sub-tabs:
   - **Agenda** — a free-text box (toggle **Preview** to see it rendered instead of as raw text).
   - **Minutes** — the same free-text/preview pattern, plus an **AI Summarise** button that drafts
     formal minutes from whatever you've typed in Agenda and Minutes so far, which you can review
     and apply.
   - **NABH** — tick any of the ten NABH chapters (AAC, COP, MOM, PRE, HIC, ROM, FMS, HRM, IMS,
     QPS) this meeting covered. A green confirmation shows how many chapters "will be linked as
     evidence on save."
   - **Actions** — type a description, assign an **Owner**, set a **Due Date**, and click the
     **+** button to add an action item straight from the meeting.
   - Tick **Quorum met** near the top if it was, then click **Save Meeting** — this is also what
     actually creates the NABH evidence entries for any chapters you ticked.
6. **Track all action items across every committee.** Go to the **✅ Action Items** tab. Toggle
   between a **Kanban board** (drag a card between Open / In Progress / Completed / Deferred
   columns) and a **list view**, and filter by committee or status. Overdue items (past due date,
   still Open or In Progress) push a red "N overdue" badge into the page header.

---

## Where this sits inside the Quality module (orientation)

QualityPage itself (`/quality`) is the hub you land on first, with eight tabs down the left:

**📊 NABH Dashboard · 🎯 Quality Indicators · 📅 Audit Calendar · 🚨 Incident Reports · 🔄 CAPA
Tracker · 🦠 Infection Control · 💊 Antibiotic Stewardship · 🩹 Pain Management**

— plus, below a divider at the bottom of that same sidebar, five arrow-marked links that leave
QualityPage entirely and open the standalone pages this manual's main walkthroughs cover: **Events
& Incidents, NABH Matrix, Clinical Audits, QI Projects, Committees**.

This manual's three walkthroughs use **Events & Incidents** (→ Safety Events), **Clinical Audits**,
and **Committees**. The other tabs and links — NABH Dashboard, Quality Indicators, Audit Calendar
(noted above), Incident Reports (the simpler legacy system — noted above), CAPA Tracker, Infection
Control, Antibiotic Stewardship, Pain Management, NABH Matrix, QI Projects, and JCI Accreditation
— are not covered in detail here; flag it if a go-live needs a walkthrough for any of them.

The header bar of QualityPage itself also has an **Export Evidence Bundle** button, which zips up
four CSVs (NABH evidence log, incident reports, audit log, quality indicators) for an assessor —
useful to know exists, not a day-to-day action.

---

## Access control — who can actually get here (verified, not assumed)

This needed real checking, because the numbers alone are easy to misread.

**The module tile.** `src/lib/modules.ts` line 71 lists the "Quality & NABH" tile (the one that
opens `/quality`, i.e. QualityPage) with `roles: ["quality_manager", "super_admin"]`. Notably
**not** `quality_officer`, and not `hospital_admin` — but see the bypass rule below.

**The five standalone routes.** `src/lib/routeRoles.ts` (lines 23–43) has explicit per-route
overrides that *do* name `quality_officer` and `hospital_admin` directly: `/quality/events`,
`/quality/clinical-audits`, `/quality/qi-projects`, `/quality/committees`, and `/nabh/compliance`
are all route-permitted for both. `/quality/jci` (line 58) is permitted for both too, **and** has
its own module tile (`modules.ts` line 104) — so JCI Accreditation is fully reachable.

**The bypass rule.** `routeRoles.ts` line 95 defines `BYPASS_ROLES = ["super_admin",
"hospital_admin"]`, and the `hasAccess()` function (line 163) returns `true` for a bypass role
*before it even looks at the route's role list*. So **hospital_admin can always open `/quality`
itself**, regardless of the tile's `roles` array — the restriction to `quality_manager` effectively
only excludes `quality_officer` (and every other non-admin role).

**What that means for navigating there.** The only in-product links to the four non-tiled
standalone routes (`/quality/clinical-audits`, `/quality/qi-projects`, `/quality/committees`,
`/nabh/compliance`) are the five buttons at the bottom of QualityPage's own sidebar
(`QualityPage.tsx` lines 150–191). There is no entry for any of them in the app's persistent left
sidebar (`AppSidebar.tsx` — its three static groups list Dashboard, All Modules, Patients, Medical
Records, IPC Dashboard, FMS/Safety, ABDM, My HR, Inbox, Settings; nothing Quality-specific), and
`ALL_MODULES` — the single list that both the "All Modules" grid page and the Quick Access
personalisation picker (`QuickAccessPage.tsx` line 64) draw from — contains exactly two Quality
entries, `/quality` and `/quality/jci`. The other four routes cannot appear on the All Modules
grid or be pinned to Quick Access, because they are not in that list at all.

Chaining this together:

- **hospital_admin — no gap.** The bypass rule means hospital_admin can open `/quality` directly
  (Dashboard → All Modules → the "Quality & NABH" tile shows for them too, since the tile list is
  filtered with the same bypassing `hasAccess()`), and from there click any of the five sidebar
  links. That's 3 clicks from the dashboard, which meets the 1-2-3-Click rule.
- **quality_officer — a confirmed gap on four of the five standalone screens.** `quality_officer`
  is explicitly route-permitted to open `/quality/clinical-audits`, `/quality/qi-projects`,
  `/quality/committees`, and `/nabh/compliance` — but cannot open `/quality` itself (not in the
  tile's role list, not a bypass role), so the one and only in-product link to each of those four
  screens is behind a page this role can never reach. There is also no tile, sidebar entry, or
  Quick Access pin possible for any of them. In practice: permitted by the route guard, invisible
  everywhere a human actually clicks.
- **`/quality/events` is a partial, conditional exception.** The Dashboard home page
  (`src/pages/Dashboard.tsx` lines 279–283) shows an **Overdue CAPA banner**
  (`OverdueCAPABanner.tsx`) to any role that `hasAccess("/quality/events", …)` covers — which
  includes `quality_officer`, and also `doctor`, `nurse`, `receptionist`, and
  `nursing_supervisor` (all separately route-permitted for this one screen per
  `routeRoles.ts` lines 24–27). That banner's **View** button does navigate straight to
  `/quality/events?overdue_capa=1`. But `OverdueCAPABanner.tsx` line 43 returns `null` — renders
  nothing at all — whenever the overdue-CAPA count is zero. So this path exists only on days when
  a CAPA action is actually overdue; on a day with none outstanding, `/quality/events` is just as
  unreachable for quality_officer as the other four. (The matching NABH QI Anomaly card on the
  Dashboard, gated the same way for `/nabh/compliance`, was checked too — it is a self-contained
  dismiss widget with no navigation link at all, so it never offers a path to the NABH Matrix
  regardless of role.)

This is the same shape of finding Phase 2 surfaced for radiology-technician, ward-clerk, and
OT-staff: the content documented above is accurate to what's on screen, but the role/access model
and the navigation surface (sidebar, module grid, Quick Access) haven't caught up with each other
for this job title. It is a product follow-up for Nikhil/Vikram to sequence — either give these
four routes their own module tiles (which would also make them Quick-Access-pinnable), add a
persistent sidebar entry, or extend `/quality`'s own role list to include `quality_officer` — not
something this training document can fix by itself.

---

## Clinical-correctness review

The Root Cause Analysis methodology options (5 Whys, Fishbone/Ishikawa, FMEA), the CAPA
corrective/preventive action-type framing, and the clinical-audit sampling/compliance-percentage
description above were reviewed by Priya (clinical-pod) for clinical correctness, since these
sections document a care-pathway/patient-safety event trail rather than pure administrative
screen mechanics. No clinical-accuracy issues were flagged — the terminology and workflow as
described match standard RCA/CAPA and clinical-audit practice, and every AI-assisted step in the
actual screens already requires a human review/attestation checkbox before anything is saved,
which this manual states at each occurrence rather than glossing over.

---

## Quick reference — screen names as they actually appear on screen

| What this manual called it | What you'll actually see on screen |
|---|---|
| Safety Events (Walkthrough 1) | **Safety Events & Complaints** (header), reached via the **Events & Incidents** link |
| Clinical Audits (Walkthrough 2) | **Clinical Audits** (header, badge "NABH QPS.7") |
| Committees (Walkthrough 3) | **Governance & Committees** (header, badge "NABH ROM/HRM") |
| The simpler duplicate for events | **🚨 Incident Reports** tab inside Quality — different table, not covered as a walkthrough here |
| The simpler duplicate for audits | **📅 Audit Calendar** tab inside Quality — different purpose (scheduling, not sampling), covered briefly above |
| QI Projects (mentioned, not walked through) | **QI Projects**, reached via the **QI Projects** link, or automatically from a low-compliance Clinical Audit |
| NABH Matrix (mentioned, not walked through) | **NABH Matrix**, reached via the **NABH Matrix** link |
