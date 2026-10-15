# Dialysis Unit Staff — Training Manual

## What this role does in the system

As Dialysis Unit staff, you work in one module: **🫀 Dialysis Unit**. It opens on the **Machine
Board** — every haemodialysis machine shown as a card, colour-coded by status — and from there you
start and end sessions, register new dialysis patients, build the weekly schedule, and read back
adequacy/compliance reports. This manual assumes you have never used hospital software before.

> **Access check — no gap found, with one one-time setup step.** The `/dialysis` route has no
> override in `src/lib/routeRoles.ts`, so it inherits its allowed-roles list straight from the
> module catalogue (`src/lib/modules.ts`, line 75): **Nephrologist**, **Dialysis Technician**, and
> **Super Admin**. Both job titles a dialysis unit actually employs already have a matching role on
> that list — unlike the three gaps Phase 2 found (Radiology Technician, IPD Ward Clerk, OT staff),
> there is no job title here with zero matching login.
>
> The one real-world catch: neither **Nephrologist** nor **Dialysis Technician** is one of the 7
> role cards that ship by default on the Staff screen (`src/pages/settings/SettingsStaffPage.tsx`,
> lines 85–92 — only Doctor, Nurse, Billing, Pharmacist, Lab Tech, Reception, and Admin/CEO are
> pre-built). Before your hospital can create a login with either title, your Hospital Admin must
> first add it as a **custom role** on **Settings → Roles** (the same mechanism documented in
> `admin-hospital-manager.md` section 1.4) — a label of "Dialysis Technician" there becomes the
> role name the access list already expects. This is a one-time admin setup step, not a product
> gap: once that custom role exists, the login reaches every screen in this manual.

All dates on screen show as DD/MM/YYYY. All money shows as ₹.

---

## 1. The header — KPIs and quick actions

Across the top of the module you'll always see:
- KPI chips: **👤 N Active Patients**, **🔵 N Sessions Today**, and — only when the count is above
  zero — **⚠️ N Missed This Week** and **🩺 N Low Kt/V**.
- Two buttons: **Register Patient** and **Schedule Session**. Clicking either jumps you straight to
  the Patients or Schedule tab and opens that tab's dialog pre-loaded. (If either button is missing
  for your login, your hospital's permission setup for this module doesn't include that specific
  action — ask your admin.)

---

## 2. Machine Board — starting and ending a session

This is the tab you open the module on. Each machine is its own card showing its name, a badge for
its type (**CLEAN**, **HBV DEDICATED**, **HCV DEDICATED**, **HIV DEDICATED**, or **UNIVERSAL**),
and a coloured status dot: 🟢 Available, 🔵 In Use, 🟡 Disinfecting, grey Maintenance, 🔴 Out of
Service.

### Starting a session

1. On a 🟢 **Available** machine's card, click **"Start Session"**.
2. **Step 1 — Select Patient**: search by name or UHID and click a patient in the list. Each row
   shows a badge for the machine type that patient requires (CLEAN / HBV / HCV / HIV / ISOLATED,
   driven by their HBsAg/HCV/HIV serology on file).
   - If the patient's required type doesn't match the machine you opened this dialog from, a red
     **"🔴 PATIENT SAFETY VIOLATION"** pop-up blocks you immediately — you cannot override it from
     here. Pick a patient whose serology matches this machine, or start the session on a compatible
     machine instead. This check exists because assigning, for example, an HBsAg-negative patient
     to an HBV-dedicated machine is a cross-infection risk.
3. **Step 3 — Pre-dialysis vitals**: enter **Weight (kg) \***, **BP Sys \***, **BP Dia \***, and
   **Pulse \*** — the **"Start Session"** button at the bottom stays disabled until all four are
   filled. Also record **Temp (°C)**, **Blood Flow (mL/min)** (defaults to 300), **Dialysate Flow**
   (defaults to 500), **Heparin (units)** (defaults to 5000), and **Dialyzer ID** (scan the
   barcode, if your unit tracks dialyzers this way).
   - If the patient has a dry weight on file, the screen shows **Fluid overload** and an auto-
     calculated **UF Goal (auto)** in mL as soon as you type the pre-weight.
   - If the Dialyzer ID you enter was already used on a *different* patient, a hard block appears
     ("Dialyzers CANNOT be reused across different patients — infection risk") and the session
     cannot start with that dialyzer.
4. Click **"Start Session"**. The machine card turns 🔵 and shows the patient's name.

### Ending a session

1. On an 🔵 **In Use** machine's card, click **"End Session"**.
2. Fill in **Post-Weight (kg)**, **BP Sys**, **BP Dia**, **Post-Pulse**, **Urea Pre (mg/dL)**,
   **Urea Post (mg/dL)**, **UF Achieved (mL)**, tick any applicable **Complications** chips, and
   add **Notes**.
3. Click **"Complete Session"**. The system then, automatically:
   - Calculates **Kt/V** (Daugirdas second-generation formula) from the urea pre/post values, post-
     weight, UF achieved, and how long the session actually ran.
   - If Kt/V comes out **below 1.2** (the NABH adequacy standard), fires an immediate, non-
     silenceable clinical alert — **"⚠️ Inadequate Dialysis: Kt/V = X"** — and logs it to
     `clinical_alerts` as high severity.
   - Logs the completed session to NABH evidence (standard DIC.1) regardless of the Kt/V outcome.
   - Moves the machine to 🟡 **Disinfecting** for 30 minutes; it returns to 🟢 **Available**
     automatically once that window passes — you don't need to do anything to release it.
   - Auto-bills the session: an IPD/daycare patient is *meant* to get a line item added to their
     existing admission bill, and an OPD patient a new standalone bill numbered **DIAL-...**, with
     GST applied if your hospital has it configured on the dialysis service rate. A ₹ total appears
     in a confirmation toast.

> **Content gap found while grounding this against the component source.** The check that decides
> *which* of those two billing paths a session takes (`MachineBoardTab.tsx`, `createDialysisBill`,
> line 228) looks for an admission with `status = "admitted"`. Everywhere else in this codebase
> that checks for a currently-admitted patient — including the IPD Bed Map itself
> (`src/pages/ipd/IPDPage.tsx`, line 83) — the live status value is `"active"`; the `admissions`
> table's own `status` column defaults to `'active'` at the database level. That means this
> specific lookup is very likely never matching a real admitted patient, so a dialysis session for
> an inpatient will almost always fall through to the OPD branch and get billed as a **new,
> disconnected standalone DIAL- bill** instead of a line item on that patient's existing admission
> bill — even though they were admitted the whole time. The session still gets billed (nothing is
> lost), but it may land on the wrong bill for an IPD patient. If you notice a dialysis charge
> missing from an inpatient's admission bill but showing up as its own separate bill instead, this
> is why — flag it to billing, don't assume it's a one-off mistake.

### Adding or editing a machine

Click **"Add Machine"** (top of the Machine Board) for a new one, or the pencil icon on an existing
card to edit it. Fill in **Machine Name \*** (e.g. "HD-09"), **Model** (e.g. "Fresenius 5008S"), and
**Machine Type \*** — Clean (HBsAg Negative) / HBV Dedicated / HCV Dedicated / HIV Dedicated /
Universal — then click **"Add Machine"** or **"Update"**. The power icon deactivates a machine; this
is blocked with an error if that machine currently has an active session.

---

## 3. Schedule — the weekly machine/session grid

This tab shows a Monday-to-Sunday grid: machines down the left, days across the top, with
**"← Prev"** / **"Next →"** buttons to move between weeks. Each cell shows the sessions booked on
that machine that day, colour-coded by status (green completed, blue in progress, red missed, grey
scheduled).

There is no "add" button on this tab itself — you open the **"Schedule Session"** dialog from the
module header (Section 1 above). In it:
1. Pick the **Patient** (the dropdown shows their required machine type next to their name).
2. Pick **Date** and **Time**.
3. The screen shows "Machine auto-assigned: X type" once you've picked a patient — it finds a
   compatible machine for you; you don't pick the machine yourself.
4. Click **"Schedule"**. If there is no machine of the right type available yet, you'll see an
   error asking you to add one first (Section 2) rather than a silent failure.

If a scheduled session's time has passed and it was never started, a small **"Mark Missed"** button
appears in that cell — clicking it marks the session missed and raises a high-severity clinical
alert immediately, the same as every other alert in this module.

---

## 4. Patients — registering and reviewing dialysis patients

The left-hand panel lists every registered dialysis patient with a search box; click a patient to
see their detail on the right.

### Registering a patient

Open this dialog from the **"Register Patient"** button in the module header (Section 1). Fill in:
1. **Link Patient \*** — search by name or UHID and click the match.
2. **Diagnosis \*** (ESRD / AKI / CKD Stage 4 / CKD Stage 5 / Other) and **Access Type \*** (AV
   Fistula / AV Graft / Tunneled Catheter / Non-tunneled Catheter / Peritoneal), plus optional
   **Access Site** (e.g. "Left arm AVF").
3. **⚠️ Serology (determines machine assignment)** — set **HBsAg**, **HCV**, and **HIV** each to
   Positive / Negative / (Vaccinated, HBsAg only) / Unknown. As you set these, a live badge below
   shows **"Machine Assignment: X machines"** — this is what later drives which machines this
   patient is allowed onto in Section 2's safety check.
4. **Dry Weight (kg)**, **Frequency** (2×/week, 3×/week, Daily, Alternate day), and **Duration
   (hrs)** (defaults to 4).
5. Click **"Register Dialysis Patient"**.

### Viewing a patient's record

Clicking a patient in the list shows four stat tiles — **Total Sessions**, **Completed**, **Avg
Kt/V**, **Compliance** (% of sessions actually completed) — followed by a **Recent Sessions** list
with date, pre-/post-weight, and Kt/V (shown in red if below 1.2).

---

## 5. Sessions — the flat session log

A read-only table of every session across all patients and machines: Date, Patient, Machine, Pre-
Weight, Post-Weight, UF (mL), Kt/V, Complications, Status. There are no actions on this tab — use
the Machine Board (Section 2) to actually start or end a session; this tab is for looking one up.

---

## 6. Reports — adequacy, compliance, and machine utilisation

Three cards:
1. **Dialysis Adequacy (Kt/V)** — every patient's average Kt/V across their sessions, with a red
   **"⚠️ N below target"** badge on the card itself when any patient's average is under 1.2, and
   each such row highlighted and marked **"Inadequate"**.
2. **Session Compliance** — scheduled vs. completed sessions per patient and the resulting
   compliance %, with rows under 80% highlighted amber.
3. **Machine Utilisation** — a tile per machine showing how many completed sessions it has run.

---

*This manual covers the Dialysis Unit screens as they exist in Aumrti HMS today. If a screen looks
different from what is described here, tell Latha (Oncology, Dialysis & IVF) so the manual can be
corrected.*
