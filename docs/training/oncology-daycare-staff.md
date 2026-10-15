# Oncology Daycare Staff — Training Manual

## What this role does in the system

As Oncology / Chemotherapy Daycare staff, you work in the **🎗️ Oncology & Chemotherapy** module.
It opens on the **Daycare Board**, where chemo orders move through a mandatory 5-step verification
checklist before a single drop is administered, and chairs in the daycare bay are tracked one by
one. This manual assumes you have never used hospital software before.

> **Access check — no gap found, with one one-time setup step.** The `/oncology` route has no
> override in `src/lib/routeRoles.ts`, so it inherits its allowed-roles list from the module
> catalogue (`src/lib/modules.ts`, line 76): **Oncologist**, **Chemo Nurse**, and **Super Admin**.
> Both job titles an oncology daycare actually employs already have a matching role on that list —
> there is no job title here with zero matching login, unlike Phase 2's three gaps.
>
> As with Dialysis, neither **Oncologist** nor **Chemo Nurse** is one of the 7 role cards that ship
> by default on the Staff screen (`src/pages/settings/SettingsStaffPage.tsx`, lines 85–92). Your
> Hospital Admin must first create "Chemo Nurse" (and "Oncologist", if that doctor doesn't already
> have a plain Doctor login) as a **custom role** on **Settings → Roles** before it can be assigned
> to a staff login — a one-time admin setup step, not a product gap. Once that custom role exists,
> the login reaches every screen in this manual.

All dates on screen show as DD/MM/YYYY. All money shows as ₹.

---

## 1. The header — KPIs and quick actions

Across the top you'll always see: **💊 N Sessions Today**, **⚠️ N Awaiting Verification**
(highlighted amber once above zero), **🪑 occupied/total Chairs**, and — only when above zero — a
red **🔬 N Low ANC** badge. Two buttons: **"+ New Chemo Order"** and **"+ Register Patient"**. If
either is missing for your login, your hospital's permission setup for this module doesn't include
that action — ask your admin.

---

## 2. Daycare Board — the verification checklist and chair grid

This is the tab the module opens on.

### Vial Sharing Opportunities (optional, AI-assisted)

If your hospital has this AI feature switched on, and the system finds two or more patients
scheduled for the **same drug within the same 4-hour reconstitution window**, a card titled
**"Vial Sharing Opportunities"** appears above the chair grid with an estimated ₹ saving. Click
**"AI Wastage Optimizer"** for a one-paragraph scheduling suggestion, or **"Apply"** on an
individual opportunity to shift those patients' scheduled administration times together. This card
is invisible with nothing to action when there are no such opportunities — that is normal, not a
fault.

### Chair grid

Every daycare chair is a card: 🟢 Available, 🔵 In Use (shows the patient's name and estimated end
time), 🟡 Cleaning, or grey Maintenance. On an 🔵 In Use chair, click **"✓ Complete"** once the
infusion has finished.

### Creating a chemo order

Open this from **"+ New Chemo Order"** in the header:
1. Pick the **Patient** (only patients already registered in Oncology — Section 4 — appear here).
2. Fill **Cycle #**, **Day of Cycle**, and **Scheduled Date**.
3. Optionally enter **Pre-Chemo Labs** — **ANC (/μL)**, **Platelets (/μL)**, **Creatinine
   (mg/dL)**, **Bilirubin (mg/dL)**. You can leave these blank here; they get checked for real at
   Step 4 of the verification checklist below.
4. Click **"Create Chemo Order"**. The order's drug doses are calculated automatically from the
   patient's registered protocol and BSA.

### The 5-step verification checklist (mandatory before dispensing)

Every new order sits in **"Pending Verification"** with a **"⏳ N/5 verified"** badge until all
five steps are individually confirmed:
1. **Protocol Confirmed** — confirms the assigned protocol matches the diagnosis.
2. **Dose Correct** — shows each drug's planned dose (mg/m² × the patient's BSA = mg), and flags
   **"⚠️ X% deviation!"** in red if the ordered dose differs from the protocol dose by more than
   10%.
3. **Allergies Checked**.
4. **Labs Reviewed** — shows ANC, Platelets, Creatinine, and Bilirubin with red/green flags against
   safe thresholds. **If ANC is under 1000, Platelets under 75,000, or Creatinine over 1.5, clicking
   this step's "✓ Confirm" does not verify it — it immediately flips the whole order to status
   "held"** with the specific reason(s) listed (e.g. "ANC too low (<1000)"), and the cycle cannot
   proceed until a clinician resolves the hold.
5. **Pharmacist Sign-Off** — a separate, independent confirmation from steps 1–4.

Click **"✓ Confirm"** on each step as it's completed. Once all five show done, a green
**"✅ All Verified — Dispense"** button appears; until then the button reads **"Dispensing Not
Allowed — N/5 steps done"** and is disabled. Clicking Dispense moves the order to Verified status.

### Starting and finishing the infusion

1. On a **Verified** order's card, click **"▶ Assign Chair & Start"**.
2. In the **"Assign Chair & Start Infusion"** pop-up, pick an available chair and click
   **"▶ Start Infusion"**. The chair turns 🔵 In Use.
3. When the infusion is done, click **"✓ Complete"** on that chair's card (Section 2 above). This
   marks the order completed, frees the chair to 🟡 Cleaning, and auto-bills the cycle: the system
   prices it per mg of drug administered (chemo-per-mg rate × total planned dose across all drugs
   on the order), with GST applied if configured, on a bill numbered **CHEMO-...**.
   - **If no chemo drug rate is configured for your hospital, the system does not silently bill
     ₹0.** It records the delivered cycle to a revenue-leakage log instead of a bill, so billing
     staff can see it and configure the missing rate — if you ever see a ₹0 chemo bill or none at
     all for a completed cycle, that is the reason, and it should be flagged to billing, not
     ignored.

---

## 3. Orders — the full order list

A searchable (by patient name), read-only list of every chemo order: patient, protocol, cycle/day,
scheduled date, each drug and its dose, status, BSA used, and a running count of how many of the 5
verification steps are done. Use this tab to look an order up; use the Daycare Board (Section 2) to
act on it.

---

## 4. Patients — registering an oncology patient

A searchable, read-only card list of every registered oncology patient (diagnosis, stage, assigned
protocol, current cycle, BSA, ECOG score).

**To register a new oncology patient**, open the dialog from **"+ Register Patient"** in the header:
1. **Link to Patient** — search and select the existing patient record.
2. **Primary Diagnosis \*** (e.g. "Carcinoma Breast Stage IIB"), plus optional **ICD-10 Code**
   (e.g. "C50.9") and **Stage** (e.g. "T2N1M0").
3. **Protocol** — pick from the hospital's active chemotherapy protocols.
4. **Total Cycles Planned**.
5. **BSA Calculator (Mosteller)** — enter **Height (cm)** and **Weight (kg)**; the screen computes
   **"BSA = X m²"** live underneath, using the Mosteller formula.
6. **ECOG Performance Status** — pick from the 5-point scale (0 "Fully active" through 4
   "Completely disabled").
7. Click **"Register Patient"**.

---

## 5. Protocols — the regimen catalogue

A searchable (by protocol name or cancer type), read-only card list of every active chemotherapy
protocol. Each card shows the total cycle count, cycle length ("q*N*d"), and drug count. Click a
card to see its full drug table — Drug, Dose (mg/m²), Route, Day, Infusion Time — below the grid.

---

## 6. Reports — toxicity and vial wastage

### Toxicity Events

Click **"+ Record Toxicity"** to open the entry form: pick the **Chemo Order**, **Cycle #**,
**Onset Date**, **Toxicity Type** (Haematological, GI, Neurological, Renal, Hepatic, Alopecia,
Mucositis, Fatigue, Cardiac, Dermatological), **CTCAE Grade** (1 Mild through 5 Death), an optional
**Description**, whether the **dose was modified** (Hold / Reduce / Discontinue), and whether the
patient was **hospitalised**. Click **"Record Toxicity"**.

> **Content gap found while grounding this against the component source.** When you select CTCAE
> Grade 3 or above, the form shows the line *"⚠️ Grade X — Clinical alert will be generated"*. In
> the actual code (`OncologyReportsTab.tsx`, `submitToxicity`), recording the event only inserts a
> row into the toxicity log — it does **not** insert a row into `clinical_alerts` or raise any
> alert anywhere else in the system. A Grade 3+ toxicity event is recorded for the audit trail, but
> it does **not** currently page or badge anyone the way the on-screen text implies. Treat a severe
> toxicity as something you must escalate verbally/by your hospital's own process — do not rely on
> this screen to have notified anyone.

### Vial Wastage Report

Shows total wastage cost for the month in ₹, and a table of every wastage record: Drug, Ordered
(mg), Administered (mg), Wasted (mg), Cost (₹). This is a read-only report — wastage records come
from the chemo order/dispensing flow, not from a form on this tab.

---

*This manual covers the Oncology & Chemotherapy screens as they exist in Aumrti HMS today. If a
screen looks different from what is described here, tell Latha (Oncology, Dialysis & IVF) so the
manual can be corrected.*
