# AI Clinical Intelligence — Training Manual

**Module:** AI Clinical Intelligence (catalogue category: Analytics)
**Screen:** `src/pages/ai/AIClinicalIntelligencePage.tsx`, route `/ai/clinical-intelligence`
**Tabs:** Deterioration Watch, LOS Prediction, AI Prior Auth (confirmed via the three
`GatedTabsTrigger module="ai_clinical"` entries on the page — there is no fourth tab)

> Dates are shown as DD/MM/YYYY and money as ₹ elsewhere in this manual's house style, but neither
> actually appears anywhere on this screen — there is no raw date string and nothing denominated in
> rupees on any of its three tabs. That is stated here once, plainly, rather than assumed.

---

## Who this file is for, and why it is not "the Nurse file"

This file is written for a **Nursing Supervisor** doing ward rounds, or a **Doctor** reviewing
ward-wide deterioration risk — not the bedside Nurse already covered in
[nurse.md](./nurse.md). That is not a stylistic choice; it is forced by the access list.

`src/lib/modules.ts` (line 110) catalogues this module with
`roles: ["doctor", "nursing_supervisor", "super_admin", "hospital_admin"]` — **`nurse` is not on
that list.** A bedside Nurse login, which `nurse.md` is written for, cannot open
`/ai/clinical-intelligence` at all. The bedside nurse's job is recording the NEWS2/MEWS vitals that
feed this screen's scores (that recording happens elsewhere, in the nursing vitals-entry flow
`nurse.md` already documents) — reviewing the ward-wide roll-up of those scores is a supervisor- or
doctor-level task.

### Access control — checked against both the catalogue and the route-override file

`src/lib/routeRoles.ts` line 86 carries an explicit override for this route:

```
ROUTE_ROLES['/ai/clinical-intelligence'] = ['super_admin', 'hospital_admin', 'doctor', 'nursing_supervisor'];
```

Checked against the two confirmed recurring bug classes this phase was specifically asked to watch
for:

- **(a) The "Billing"-card role-mislabel trap (Phase 8/9):** does not apply here. None of this
  module's four roles — `doctor`, `nursing_supervisor`, `super_admin`, `hospital_admin` — is a
  billing-type role, so there is no "looks already set up" trap to check.
- **(b) The route-override copy-paste bug (Phase 9's FMS/IPC/ABDM pattern):** **does not apply
  here either, confirmed by direct comparison.** The override's four role strings —
  `super_admin`, `hospital_admin`, `doctor`, `nursing_supervisor` — are the exact same four strings
  the catalogue declares, just listed in a different order. Nothing is dropped, nothing is added.
  This is a clean, intentional-looking override (most likely written to put the two admin roles
  first for readability), not the drop-a-role or add-an-unrelated-role bug found on FMS, IPC, and
  ABDM in earlier phases. Stated plainly because the brief asked for an explicit check, not because
  there was anything to fix.

**Role-card check — the familiar one-time custom-role step, with a Doctor fallback.**
`src/pages/settings/SettingsStaffPage.tsx`'s `DEFAULT_ROLE_CARDS` (lines 95–104) ships exactly
eight out-of-the-box cards on **Settings → Staff Members → Add Staff Member**: Doctor, Nurse,
Billing Executive, Accountant, Pharmacist, Lab Tech, Reception, Admin/CEO. **`nursing_supervisor`
is not one of them** — the same pattern Phase 5–7 found for every specialty role since Dialysis
Technician. To get a login titled "Nursing Supervisor," your Hospital Admin must first create it
as a **custom role** on **Settings → Roles & Permissions**: typing the free-text label there
slugifies it (`SettingsRolesPage.tsx`, `slugifyRoleName`, lines 45–46) into the exact key the route
guard expects. Typing "Nursing Supervisor" produces exactly `nursing_supervisor` — an exact match,
no acronym surprise the way "Patient Relations Officer" tripped up `pro_officer` in Phase 9.
**Because `doctor` is also on this module's role list and is one of the eight default cards, any
existing Doctor login can already open this screen with zero extra setup** — only a login
specifically titled "Nursing Supervisor" needs the custom-role step, the same split Phase 5 found
for Physiotherapist and Phase 7 found for Dietitian.

You reach the screen from the dashboard by clicking the **🧠 AI Clinical Intelligence** tile
(category: Analytics, description on the tile itself: "Deterioration watch, LOS prediction, AI
prior authorisation").

---

## 1. Deterioration Watch — the tab the screen opens on

This tab is **read-only**. It does not write anything to the database, raise any alert, or
notify anyone — say this plainly up front, because the natural question ("what triggers
escalation?") has a real answer that is easy to over-state: **nothing on this screen triggers
escalation.** It only visualises a score computed from vitals and admission data that were already
recorded elsewhere (bedside NEWS2/MEWS entry is `nurse.md`'s job, not this screen's). If your ward
needs an automatic page or alert when a patient crosses a risk threshold, that is not something
this tab does — it is a dashboard you have to actively open and read.

### 1.1 The four risk-count tiles

At the top, four tiles show live counts: **Critical Risk**, **High Risk**, **Moderate Risk**, **Low
Risk**. Click any tile to filter the patient list below to just that risk level; click the same
tile again to clear the filter back to "all."

### 1.2 What the risk bands actually mean

Each admitted patient gets a **score from 0–100**, and the on-screen band is decided purely by that
number — there is no separate clinical judgement layered on top:

| Band | Score | Badge colour |
|---|---|---|
| **Critical** | 75 or above | Red |
| **High** | 50–74 | Orange |
| **Moderate** | 25–49 | Amber |
| **Low** | below 25 | Green |

### 1.3 What feeds the score

The score is pure arithmetic (`computeDeteriorationScore` in the component source) — **not an AI
or machine-learning model**, despite the module's name. It adds points from five real inputs,
capped at 100 total:

- **NEWS2 score:** ≥7 adds 50 points ("NEWS2 score N (high risk)"); 5–6 adds 30 ("medium risk");
  3–4 adds 15 ("low-medium"). Below 3 adds nothing.
- **MEWS score:** ≥5 adds 20 points ("MEWS score N (escalation required)"); 3–4 adds 10 ("close
  monitoring"). Below 3 adds nothing.
- **Age:** 75 or over adds 15 points ("Age ≥ 75 years"); 65–74 adds 8 ("Age ≥ 65 years").
- **Chronic conditions on file:** 3 or more adds 15 points, with a visible "N chronic conditions"
  chip. 1 or 2 conditions adds 5 points, with a visible "N chronic condition(s)" chip too — this
  used to add silently with no chip shown, which meant the reason chips on a row didn't always add
  up to the full visible score; now fixed, so every scoring factor always has a matching chip.
- **Length of stay:** more than 14 days adds 10 points ("Extended LOS: N days").

Each row shows only the **top 3** reason chips even if more contributed, with a "+N more" label if
there are extras.

### 1.4 Reading and acting on a row

1. Each row in the list shows the patient's **score** as a coloured number badge, their **name**,
   **UHID**, **bed number** (if the admission has a bed assigned), their **admitting diagnosis**,
   and up to 3 reason chips as described above.
2. If the patient has a recorded vitals entry, the right side of the row also shows their latest
   **NEWS2** and **MEWS** numbers and the **time** (hours:minutes only — no date is shown on this
   row, so if a reading is more than a day old you cannot tell that from this screen alone) they
   were recorded.
3. **The only action on a row is a chevron (▸) button on the right.** Clicking it navigates you to
   `/ipd` — the general IPD module, **not** a deep link to that specific patient's chart or bed.
   There is no "Escalate," "Notify," or "Acknowledge" button on this screen at all. If you need to
   act on a patient's rising score, this screen's only job is to tell you to go open IPD yourself
   and find them.

The list itself is sorted highest score first, so the most at-risk patients are always at the top
regardless of which filter tile (if any) is active.

---

## 2. LOS Prediction

A second, independent read-only list, sorted by **current length of stay, longest first** (not by
predicted LOS and not by risk score).

1. Each row shows the patient's **name**, **UHID**, **admission type**, their **current days**
   admitted, the system's **predicted LOS** in days, and a **confidence** badge.
2. A short note above the list states plainly what feeds the prediction: *"AI-predicted length of
   stay based on admission type, age, and comorbidity profile."* Despite the word "AI" in that
   on-screen text, the calculation (`computeLOSPrediction` in the component source) is, like
   Deterioration Watch, deterministic arithmetic, not a model call:
   - A base number of days by **admission type** — Emergency 6, Elective 4, Transfer 8, Daycare 1.
     Any admission type not matching one of those four defaults to 5 days.
   - **+2 days** if the patient is 65 or over.
   - **+0.8 days per chronic condition** on file.
3. **Confidence** is derived from how many days of the prediction remain (predicted days minus
   current days, floored at zero): under 1 day remaining shows **"Due for discharge"**; under 2
   days shows **"High"**; anything else shows **"Moderate."** There is no fourth, "Low confidence"
   band, even though the colour scheme (red / green / blue) might suggest a wider range than three
   values.
4. Rows where the current LOS has already passed the predicted LOS are highlighted in amber as
   **overdue**.
5. **There is no click action anywhere on this tab** — no chevron, no link, no button on an
   individual row. This is a pure read-and-compare list; if you want to act on an overdue patient,
   you have to navigate to IPD yourself using the sidebar, the same way you would for any other
   patient (this tab gives you no shortcut the way Deterioration Watch's chevron, limited as it is,
   does).

---

## 3. AI Prior Auth — read this before assuming it is a workspace

This is the tab most likely to mislead a first-time user, because it looks like a form and is not
one. **Everything on this tab is static descriptive content. There is nothing to fill in, submit,
or track here.**

1. A card titled **"AI-Assisted Prior Authorization"** describes, in a bullet list with green
   checkmarks, five capabilities: auto-extracting ICD-10 diagnosis codes, pulling supporting labs
   and vitals, generating a clinical justification narrative, submitting to the HCX network
   (PMJAY, CGHS, TPA), and tracking pre-auth status with SLA alerts. **Every one of these five
   checkmarks is hardcoded `done: true` in the component source — they do not reflect anything
   that happened on this screen, or on this patient, or today.** They are a feature summary, not a
   progress tracker.
2. The only button on the tab is **"Go to Insurance Module,"** which navigates you to `/insurance`.
   **That is where the real workflow lives** — the Pre-Auth Queue, documented in
   [accountant-insurance-tpa.md](./accountant-insurance-tpa.md).
3. A blue "Powered by" box names four real backend pieces — the `insurance-automation`,
   `submit-pre-auth-hcx`, and `hcx-claim-submit` Edge Functions, plus an `ai-proxy → Claude Sonnet`
   call. These power the Insurance module's own automation, not anything that happens on this tab
   itself — nothing on this AI Clinical Intelligence screen calls any of them directly.
4. A final card, **"Future: Deterioration Prediction Model,"** is the component's own, on-screen
   admission that Deterioration Watch (Section 1 above) is not currently AI-driven: it states the
   plan is a future 6-hour-ahead prediction via a supervised ML model, and that it "**Currently
   uses rule-based scoring above**" — i.e. exactly the point-based arithmetic this file documents
   in Section 1.3, confirmed directly against the source, not inferred. The progress bar under that
   text is fixed at a hardcoded 65% width in the component's styling — it is a static graphic, not
   a tracked completion percentage of anything.

### Does this duplicate the PMJAY or Insurance AI pre-authorisation features already documented?

**No — checked directly, not assumed.** Two other training files already cover real,
functioning AI-assisted prior-authorisation workflows:

- **PMJAY's own Pre-Authorization tab** (documented in
  [government-schemes-pmjay-executive.md](./government-schemes-pmjay-executive.md), Section 3.2)
  has a real **"AI Clinical Summary → Generate Summary"** button that drafts an actual 3-paragraph
  clinical justification and saves it to a real `pmjay_preauth_requests` record.
- **Insurance & TPA's Pre-Auth Queue** (documented in
  [accountant-insurance-tpa.md](./accountant-insurance-tpa.md), Section B1) has its own, separate
  AI-assisted denial-risk scoring ("AI Review") on the Claims to Submit tab.

This AI Clinical Intelligence screen's "AI Prior Auth" tab **does not create, view, or edit a
single pre-authorisation record of either kind.** It is a signpost pointing at the Insurance
module's automation, plus a feature-list and a progress stub for a not-yet-built deterioration
model — not a third place to actually do prior-authorisation work. If a trainee needs to submit or
work a pre-auth, send them to Insurance or PMJAY, not here.

---

## Summary for the trainee

- **Deterioration Watch** and **LOS Prediction** are both read-only ward-round dashboards built on
  deterministic scoring rules (NEWS2/MEWS/age/comorbidities/LOS) — not AI/ML models, despite the
  module's name. Neither tab raises an alert or notifies anyone; they only display numbers you have
  to act on yourself.
- **AI Prior Auth** is an orientation panel, not a workspace. The real prior-authorisation work for
  PM-JAY lives on `/pmjay`, and for TPA/private insurance lives on `/insurance` — both already
  documented elsewhere in this manual.
- This screen is reachable to **Doctor** and **Nursing Supervisor** logins (plus `super_admin`/
  `hospital_admin`); a bedside **Nurse** login cannot open it at all, which is why this file exists
  separately from `nurse.md`.

*This manual covers the AI Clinical Intelligence screen as it exists in Aumrti HMS today. No code
was changed while writing it — the display gap in Section 1.3 (silent chronic-conditions points)
and the static/hardcoded elements noted in Section 3 are flagged for Arnav (Clinical AI) and Priya
to assess, not fixed here. If a screen looks different from what is described here, tell Arnav so
the manual can be corrected.*
