# Research Platform Coordinator — Training Manual

**Module:** Research Platform
**Screen:** `src/pages/research/ResearchPlatformPage.tsx` (route `/research`)
**Tabs:** Cohort Builder, De-identification, FHIR Export — gated together as one module
(`GatedTabsTrigger module="research"`), so whatever role can open this screen sees all three tabs.

> Dates are shown as DD/MM/YYYY. No money figures appear on this screen. This manual uses Indian
> English spelling throughout.

This manual assumes you have never used hospital software before.

---

## What this role does in the system

As the staff member running the hospital's research-cohort workflow, you build a **cohort** — a
saved definition of "which patients match these criteria" — then export that cohort as a FHIR
bundle for an external research or pharma-partnership use. The three tabs are a pipeline, not three
unrelated screens: Cohort Builder defines and previews the group, De-identification explains the
rule the export is supposed to follow, and FHIR Export is where the file actually leaves the
hospital's system.

**Read the warning box in Section 4 before you export anything.** The single most important fact
in this manual is that the export button does not do what its own on-screen label says it does.

---

## 1. Opening the module and your first cohort list

1. Open **Research Platform** (`/research`). You land on the **Cohort Builder** tab. If any
   cohorts already exist for your hospital, you see a list of them; otherwise a message reads "No
   cohorts defined. Create one to start research."
2. Click **"+ New Cohort"** (top-right). A form panel opens below.

---

## 2. Cohort Builder — defining a cohort

1. **Cohort Name \*** — type a name, e.g. "T2DM patients aged 40–60 with nephropathy." This is
   required; the Save button stays disabled without it.
2. **Description** — optional free text.
3. **k-Anonymity (k ≥ 5)** — a dropdown with four values: **k = 5, 10, 15, 20**. Read Section 3
   before assuming this number does anything beyond labelling the cohort — it does not, as
   explained there.
4. **Inclusion Criteria** — click **"+ Add Criterion"** to add a row. Each row has a **Type**
   dropdown with seven options: **Age Range, Gender, Diagnosis (ICD-10 / text), Chronic Condition,
   Admission Type, Admission Date Range, Lab Test Result.**
   - For **Age Range**, two number fields appear: Min age, Max age.
   - For **Gender**, a Male/Female dropdown appears.
   - For **Diagnosis** or **Chronic Condition**, a single free-text field appears.
   - For **Admission Date Range**, two date fields appear: From, To.
   - **For Admission Type and Lab Test Result, no input field appears at all.** You can select
     either of these two types from the dropdown, but the row then shows nothing to type a value
     into — there is no way to actually specify an admission type or a lab test/operator/value for
     these two criterion types. **This is a confirmed gap, not a browser rendering issue**: the
     component's criteria-row layout
     (`src/pages/research/ResearchPlatformPage.tsx`, lines 207–227) only has rendering blocks for
     five of the seven listed types; Admission Type and Lab Test Result have none.
   - Click the **X** on a row to remove it.
5. Click **"Preview"** to see how many patients currently match. Click **"Save Cohort"** to persist
   the cohort definition (Section 2.1 below explains exactly what gets saved and a defect found in
   that save).
6. Once saved, the cohort appears in the list below with its name, description, patient count,
   **k=** value, created date, and number of criteria. Each saved cohort has its own **"FHIR
   Export"** button — this is the real export action; see Section 4.

### 2.1 What Preview actually checks, and what it silently ignores

Clicking **Preview** runs a live query against the hospital's own `patients` table
(`previewCohort`, lines 61–88) and shows a green banner with the match count. Two things about this
are important to know exactly, not approximately:

- **The preview query pulls real, fully-identified patient fields** — `full_name`, `uhid`, `dob`,
  `gender`, `chronic_conditions` — scoped correctly to your own hospital
  (`.eq("hospital_id", hospitalId)`, so there is no cross-tenant leak). **This is by design, not an
  accident**: a preview has to match against real patient records to produce a real count. But only
  the count is ever shown on screen (the green banner text, lines 237–240) — the identified rows
  themselves (names, UHIDs, dates of birth) are never rendered anywhere in the UI. They are, however,
  fetched to the browser and held in React state (`previewPatients`) for as long as the form stays
  open, which means they pass through the network response and sit in browser memory even though
  nothing on screen displays them — worth flagging as a PHI-exposure concern worth tightening (a
  count-only preview could, in principle, be computed with a server-side count query instead of
  shipping identified rows to the browser), not a confirmed breach, since nothing renders or
  persists the identified fields beyond that.
- **Only three of the seven criterion types actually filter anything.** Reading the query logic
  line by line: `gender` and `chronic_condition` are applied as real database filters (lines 66–71,
  `.eq("gender", ...)` / `.contains("chronic_conditions", [...])`), and `age_range` is applied as a
  client-side filter after the fetch (lines 76–83). **Diagnosis, Admission Type, Admission Date
  Range, and Lab Test Result are never applied to the query at all** — not server-side, not
  client-side. If you add a "Diagnosis: Diabetes Mellitus" criterion, fill it in, and click
  Preview, the count you see is **exactly the same as if that criterion were never added** — every
  patient in the hospital (up to the 200-row preview cap) is still included, silently, with no error
  or warning that the criterion had no effect. Combined with Admission Type and Lab Test Result
  having no input field at all (Section 2, item 4), this means **4 of the module's 7 advertised
  criterion types do nothing today** — only Age Range, Gender, and Chronic Condition genuinely
  narrow a cohort.
- Saving a cohort does **not** re-check the preview count against the cohort's own count at save
  time, and does not check the count against the selected k value either — you can save a cohort
  whose preview showed, say, 2 matching patients against a k=20 selection, and nothing blocks it or
  warns you (see Section 3).

---

## 3. De-identification — is k-anonymity actually enforced?

**Direct answer: no. `anonymisation_k` is a label stored on the cohort record. Nothing in the
codebase enforces it.**

Opening the **De-identification** tab shows a static information panel (lines 289–332), not a
live engine running on your cohort's data. It states the policy intent — "All research exports
apply k-anonymity (minimum k=5) per DPDP Act 2023" — and a table of fields the policy says are
suppressed or generalised on export: Patient Name (removed), Phone Number (removed), UHID
(anonymised to an `ANON-XXXXXX` code), ABHA ID (removed), Exact Age (5-year bands), Address
(district-level only), Admission Date (month + year only), Diagnosis (3-character ICD-10 only).

This tab is describing a transformation function that genuinely exists in the file —
`deidentify()` (lines 112–126) implements almost exactly this logic (age-banding, slicing
`chronic_conditions` to 3 entries, setting `uhid`/`full_name`/`phone` to `undefined`). **But
`deidentify()` is never called anywhere in this component.** It is dead code: searching the whole
file for every reference to it finds only its own definition — no button, no export path, no
save path invokes it. The tab you are reading describes a rule the product does not currently run.

There is also no code anywhere in this file (or called from it) that compares a saved cohort's
`patient_count` against its own `anonymisation_k` before letting it be exported — so a cohort with,
say, 3 matching patients and k=20 selected can be exported exactly like a cohort with 500 patients
and k=5. **k-anonymity here is a dropdown value saved to the database column
`research_cohorts.anonymisation_k`; it is not a gate that blocks or suppresses a small cell at any
point in this workflow.**

---

## 4. FHIR Export — what actually leaves the hospital, and the single most important fact in this manual

Two different things on this screen are both called "export," and only one of them is a real
file-generating action:

- **The "Request Bulk FHIR Export" button on the FHIR Export tab itself** (lines 334–353) does not
  export anything. Its click handler only shows a toast: "Bulk export queued — you'll receive a
  download link via email within 30 minutes" (line 348). There is no network call, no file
  generated, and — despite the amber advisory box on the same tab stating "Aumrti logs all bulk
  export requests for audit" — **no insert into any audit or log table happens either.** This is a
  stub, not a working bulk-export pipeline.
- **The "FHIR Export" button on each saved cohort row, back on the Cohort Builder tab** (Section 2,
  step 6) **is now disabled**, with a tooltip reading "Not yet available — the de-identification
  and k-anonymity logic this export depends on isn't implemented yet. Re-enabling this requires
  clinical-governance review before it ships."

**Why it's disabled rather than fixed — read this before assuming the button is just broken.** The
button used to call `exportFHIRBundle()`, which built a FHIR `Bundle` with a hardcoded empty
`entry: []` — never populated from `previewPatients`, from `deidentify()`'s output, or from any
other patient data. The downloaded file contained zero patient records, identified or
de-identified, while the success toast claimed "FHIR Bundle downloaded (de-identified)." Making
this genuinely work is not a wiring fix: a real de-identified research bundle needs a
resource-modelling decision (does it carry per-patient FHIR resources at all, given
re-identification risk through the Condition→Encounter→Patient graph, or should it be
aggregate-only) and a real k-anonymity *equivalence-class* check — `cohort.patient_count ≥ k` is
not sufficient, since a 50-patient cohort selected at k=10 can still contain a 2-person
age-band×gender×condition cell that violates k=10 even though the overall count clears it. Shipping
a cosmetic fix here — running `previewPatients` through `deidentify()` and calling it done without
resolving that question — would have made the privacy claim *look* satisfied without the guarantee
actually existing, which is worse than an honestly disabled button. Re-enabling this is tracked as
its own future piece of work requiring Dr. Nalini's clinical-governance review before any
implementation, not something this pass attempted.

The amber **"Institutional Review Board (IRB) approval required"** notice on the FHIR Export tab is
real on-screen text and a genuinely correct process reminder — ensure IRB/Ethics Committee approval
before sharing de-identified data externally — but it has nothing to connect to yet, since no data
is currently being shared through either export path on this screen.

---

## 5. DPDP Act 2023 note

The De-identification tab's own compliance claim cites Section 17 of the DPDP Act and states "no
export contains personal data as defined under the Act." Taken only on the narrow question of
whether a direct identifier leaks through the FHIR Export button today, the outcome is technically
true — because, as Section 4 above establishes, no data of any kind currently leaves through that
button, identified or otherwise. That is not the same as the module achieving data minimisation the
way DPDP's principle intends: data minimisation means collecting and sharing only what is
necessary for the stated purpose, not that nothing is shared at all. The cohort-preview step
(Section 2.1) already pulls more identified detail (full name, UHID, date of birth) into the
browser than a count-only preview needs, and the export step that is supposed to apply the
documented de-identification transformation does not currently run it. Both are worth closing
before this module is relied on for a real external research hand-off — flagged here, not fixed,
per this documentation effort's scope.

---

## 6. Access control — who can actually get here

**`src/lib/modules.ts` (line 114)** declares this module's roles as `["quality_officer",
"quality_manager", "super_admin", "hospital_admin"]`. **`src/lib/routeRoles.ts` (line 87)** carries
an explicit override for `/research` with the identical four roles, just in a different order —
`['super_admin', 'hospital_admin', 'quality_officer', 'quality_manager']`. **This is not a mismatch
and not the route-override copy-paste bug found elsewhere in this manual's earlier phases** (e.g.
`/fms/dashboard` in Phase 9, `/abdm` previously) — the override here is redundant but correct; it
enforces exactly what the module catalogue already declares. Checked directly, not assumed.

**Neither `quality_officer` nor `quality_manager` is a default role card.**
`src/pages/settings/SettingsStaffPage.tsx`'s `DEFAULT_ROLE_CARDS` (lines 95–104) is exactly:
Doctor, Nurse, Billing Executive, Accountant, Pharmacist, Lab Tech, Reception, Admin/CEO. To get a
login that can open `/research`, the Hospital Admin must first create a **custom role** on
**Settings → Roles & Permissions**, the same one-time step every specialty role since Phase 5 has
needed. `slugifyRoleName` (`SettingsRolesPage.tsx`, lines 45–46) lowercases and underscores the
typed label — typing **"Quality Officer"** produces `quality_officer` and typing **"Quality
Manager"** produces `quality_manager`, both exact matches with no slug-mismatch trap (unlike the
Patient Relations Officer case in Phase 9). **There is no `doctor` or other default-card fallback
on `/research`'s role list at all** — the mandatory-custom-role-no-exception shape Phase 6/8 found
for Mortuary/Dental/AYUSH/CRM, not the partial-fallback shape Phase 5/7 found for Physiotherapy or
Dietitian. `hospital_admin` and `super_admin` also separately bypass every route's role list
entirely via `BYPASS_ROLES` (`routeRoles.ts`, line 116), so an admin login reaches this screen
regardless.

**Confirmed before writing this file: this is not already covered by
`docs/training/quality-nabh-officer.md`.** That Phase 4 file shares the identical login roles
(`quality_officer`, `quality_manager`) but its own documented scope is safety-event/RCA/CAPA
logging, clinical audits, and committee tracking — a direct grep of that file for "research",
"cohort", and "de-identif" (case-insensitive) returns zero matches. The two files document
functionally distinct jobs that happen to share a login.

---

## 7. Other defects found this phase

- **`research_cohorts.created_by` FKs to `auth.users(id)`, not `public.users(id)` in the original
  `CREATE TABLE` migration — confirmed already fixed, not a live bug.** The original table-creation
  migration (`20260910000011_phase4_research_nps_chain.sql`, line 12) does still say
  `auth.users(id)`, which is expected — original migrations are never edited. But the Phase 10
  fix-pass's generic FK-repair migration (`20261106000003_fix_user_fk_targets.sql`, line 93) has
  had `research_cohorts`/`created_by` in its repair list since that migration was written, which
  remaps the column to `public.users(id)` at apply time. `npm run check:user-fk` confirms it as
  one of the 40 already-repointed columns. Writing a second repair migration here would have been
  a confusing no-op — correctly not done.
- **`saveCohort()` never checked for an insert error — fixed.** It now destructures `error` from
  the insert and, on failure, shows a destructive toast with the real error message and leaves the
  form open/filled/unsaved, matching the fail-loud pattern already used elsewhere in this codebase
  (e.g. the Oncology toxicity-alert fix) — never claims success on a failed save.
- **`research_cohorts.is_anonymised`** is still never set to `true` by any code path in this file —
  left alone deliberately, since setting it to `true` at save time would be a false claim given the
  de-identification pipeline doesn't actually run anywhere yet (Section 4). This is entangled with
  the same FHIR-export/k-anonymity design question, not a separate one-line fix.
- **Bonus PHI-minimisation fix, found during this pass:** the cohort-preview query used to fetch
  `full_name` and `uhid` into browser state even though neither field is ever rendered or used by
  the preview (only the count is shown) — both are now dropped from the query.

---

*This manual covers the Research Platform (`/research`) as it exists in Aumrti HMS today, including
every access-control and content finding in the sections above. If a screen looks different from
what is described here, flag it so the manual can be corrected.*
