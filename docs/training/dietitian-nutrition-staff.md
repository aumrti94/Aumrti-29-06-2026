# Dietitian / Nutrition Staff — Training Manual

## What this role does in the system

As Dietitian / Nutrition staff, you work in one module: **🥗 Dietetics & Nutrition**. It opens on
the **Screening** tab — every admitted patient who still needs a nutritional-risk screening — and
from there you place a **Diet Order**, record **Meal Tracking** (how much of each meal a patient
actually ate), generate an AI-assisted **Meal Plan**, and read the NABH compliance **Reports** tab.
This manual assumes you have never used hospital software before.

> **Access check — a real one-time admin-configuration step, same pattern Phase 5/6 found for
> Dialysis, Oncology, IVF, Mortuary, Dental, AYUSH and CSSD, with one partial exception.** The
> `/dietetics` route has no override in `src/lib/routeRoles.ts`, so it inherits its allowed-roles
> list straight from the module catalogue (`src/lib/modules.ts`, line 98): **Dietitian**, **Doctor**,
> and **Super Admin**. The job title is on that list — there is no flat access gap the way Phase 2
> found for Radiology Technician or IPD Ward Clerk. But **Dietitian is not one of the 7 role cards
> that ship by default on Settings → Staff Members → Add Staff Member**
> (`src/pages/settings/SettingsStaffPage.tsx`, `DEFAULT_ROLE_CARDS`, lines 85–92: only Doctor, Nurse,
> Billing, Pharmacist, Lab Tech, Reception, Admin/CEO). To get a login titled "Dietitian", your
> Hospital Admin must first create it as a **custom role** on **Settings → Roles & Permissions**:
> typing the free-text label "Dietitian" there slugifies it into the exact snake_case key the route
> guard expects (`src/pages/settings/SettingsRolesPage.tsx`, `slugifyRoleName`, lines 44–46, used at
> role-creation time around lines 320–330) — this works correctly today and is a one-time setup
> step, not a product gap. **The partial exception:** because `doctor` is also on this module's role
> list, any existing Doctor login can already open `/dietetics` with zero setup — only a login
> specifically titled "Dietitian" needs the custom-role step, the same split Phase 5 found for
> Physiotherapy.

All dates on screen show as DD/MM/YYYY. Money (where it appears) shows as ₹.

---

## 1. The header — quick actions

Two buttons, both gated by your hospital's permission setup for this module (if either is missing
for your login, ask your admin — it isn't a bug):
- **"New Diet Order"** — jumps straight to the Diet Orders tab (Section 3).
- **"Screening"** — jumps straight to the Screening tab (Section 2).

Below the header, four KPI tiles always show: **Screened Today**, **High Risk**, **Active Diet
Orders**, **Overdue Screenings**.

If any patient has been admitted more than 24 hours without a nutritional screening, a red banner
appears above the header reading **"NABH COP.21 BREACH: N patient(s) admitted >24hrs without
nutritional screening"**, listing up to 5 of them by name, ward, and hours-overdue. Clicking a
patient's chip in that banner jumps you straight to the Screening tab with that patient already
selected.

---

## 2. Screening — NRS-2002 nutritional risk

This is the tab the module opens on. The left panel lists **"Patients Needing Screening (N)"** —
every currently-admitted patient who has no screening on file yet, each showing their name, UHID,
ward/bed, and how many hours since admission (a red **"OVERDUE"** tag once that passes 24 hours).
If the list is empty, it shows **"✅ All patients screened"**.

1. Click a patient in that list. The NRS-2002 form opens on the right, titled **"NRS-2002
   Screening"**, showing the patient's name, UHID, and admitting diagnosis (and a **"Age ≥70
   (+1)"** badge if applicable — patients 70 and over get an automatic +1 added to their score).
2. **Nutritional Status Score (0-3)** — pick the one row that applies: 0 = Normal nutritional
   status; 1 = Wt loss >5% in 3 months / intake 50-75%; 2 = Wt loss >5% in 2 months / BMI 18.5-20.5
   / intake 25-50%; 3 = Wt loss >5% in 1 month / BMI <18.5 / intake <25%.
3. **Disease Severity Score (0-3)** — pick the one row that applies: 0 = Normal requirements; 1 =
   Hip fracture / COPD / DM / Cirrhosis / HD; 2 = Major surgery / Stroke / Severe pneumonia; 3 =
   Head injury / ICU (APACHE >10) / BMT.
4. As you pick both, the **"NRS-2002 Total Score"** box updates live with the total and a risk
   badge: **LOW** (0), **MODERATE** (1-2), **HIGH** (3-4), or **VERY HIGH** (5+) risk, plus a plain-
   language recommendation ("No intervention, re-screen weekly" / "Dietitian assessment needed" /
   "Immediate dietitian referral + diet plan").
5. Enter **Weight (kg)** and **Height (cm)** — the **BMI** field below calculates and categorises
   itself automatically (Underweight / Normal / Overweight / Obese) as soon as both are filled.
   Neither field is required to save.
6. Add **Notes** if needed, then click **"Save Screening"**.

When you save:
- The screening is recorded with your name as the screener and is **logged as NABH evidence**
  (standard NFS.1) automatically — you don't do anything extra for this.
- If the total score is **3 or above** (HIGH or VERY HIGH risk), the system marks the patient for
  dietitian referral and attempts to raise a clinical alert for the care team.
- The system auto-generates a billed line item for the dietitian assessment itself, tagged to the
  patient's admission — you don't raise this bill yourself.

> **Defect found and fixed.** `DietPage.tsx`'s `saveScreening` previously inserted into
> `clinical_alerts` using a column named `message` instead of the real `alert_message` column,
> silently failing every time. It now writes to `alert_message`, attributes the alert to the
> screening dietitian, and shows an on-screen toast if the alert insert itself ever fails — so a
> HIGH or VERY HIGH risk screening reliably raises a clinical alert for the rest of the care team.

---

## 3. Diet Orders — prescribing a diet

Left panel: **"Active Diet Orders (N)"**, a table of every active order (Patient / Diet / Since).
A **"Kitchen Dispatch"** button opens a printable list of every active order with patient, diet
type, texture, and notes — click **"Print"** inside that dialog to print it for the kitchen.

To place a new order:
1. On the right, under **"New Diet Order"**, search **"Patient (search admitted)"** by name or
   UHID (type at least 2 characters) and click the matching row.
2. If the patient has any allergies on file, a red banner appears immediately: **"⚠️ Food
   Allergies: ..."**, listing them — check this before choosing the diet type.
3. **Diet Type** — Normal, Soft, Semi-Liquid, Liquid, NGT Feed, NPO (Nil by Mouth), Diabetic,
   Renal, Cardiac, Low Sodium, High Protein, or Other.
4. **Texture** — Normal, Minced, Pureed, or Liquid.
5. **Calories (kcal/day)**, **Protein (g/day)**, and optionally **Fluid (mL/day)**.
6. **Specific Instructions** — free text (e.g. "Low salt, no fried foods").
7. Click **"Save Diet Order"**. The patient's on-file allergies are copied onto the order
   automatically — you don't re-type them.

Placing a diet order does **not** itself generate a bill or NABH-log anything — only the Screening
save (Section 2) does that. If your diet-order list on this tab looks empty immediately after
saving, give it a moment: the tab reloads from the database on every save.

---

## 4. Meal Tracking — recording what a patient actually ate

Left panel: **"Patients with Active Diet Orders (N)"** — click a patient to open their tracking
card for today, dated in `en-IN` format.

For each of the five meal slots — **Breakfast**, **Mid Morning**, **Lunch**, **Evening**,
**Dinner** — the card shows five buttons: **0%**, **25%**, **50%**, **75%**, **100%**. Click the one
that matches how much of that meal the patient consumed, optionally fill in **"Waste reason
(optional)"** (free text, e.g. "Nausea", "Disliked taste"), then click that meal's own **"Save"**
button. Each meal
saves independently — you don't need to fill in all five before saving any of them, and re-opening
the same patient the same day shows whatever was already recorded.

---

## 5. Meal Plans — AI-generated 7-day therapeutic plan

Left panel: **"Patients with Diet Orders"** — click a patient to open their plan panel, which shows
their diet type, calorie target, and protein target pulled from their active diet order.

1. Click **"Generate 7-Day Plan"**.
2. The system calls an AI model with the patient's diagnosis, diet type, calorie/protein/fluid
   targets, food allergies, and BMI, and asks it to draft a 7-day meal plan using common Indian
   hospital foods (idli, dal, rice, roti, khichdi, etc.), broken into Breakfast / Mid-morning /
   Lunch / Evening / Dinner per day.
3. The plan appears under **"🤖 AI Therapeutic Meal Plan"** and is saved to the patient's record
   automatically.
4. Click **"Print"** to print it.

**This is AI-drafted content, not a verified clinical plan — review every line before it reaches a
patient's tray.** The plan is generated from whatever diagnosis and targets happen to be on file at
that moment; it does not know about anything you haven't already entered (a missed allergy, a
just-changed diet order, a lab value), and the system marks the record `ai_generated: true` for
exactly this reason. Read it the way you would read a junior colleague's first draft, not a
dietitian's signed-off order.

---

## 6. Reports — NABH NFS compliance

A single screen, **"NABH NFS Compliance — This Month"**, showing four numbers side by side:
**Screening Rate** (as a %, with "(Target: 100%)" printed underneath), **Admissions**, **Screened**,
and **High Risk** — all for the current calendar month. Below that, a plain-language compliance
summary: **"✅ Excellent — NABH COP.21 compliance maintained"** at 95% or above, **"⚠️ Needs
improvement — target 100% screening within 24hrs"** between 80–95%, or **"🔴 Critical gap —
immediate action required for NABH compliance"** below 80%.

---

*This manual covers the Dietetics & Nutrition screens as they exist in Aumrti HMS today, including
the gap documented in Section 2. If a screen looks different from what is described here, tell
Nandita (Diet & Nutrition) so the manual can be corrected.*
