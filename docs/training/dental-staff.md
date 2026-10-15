# Dental Staff — Training Manual

## What this role does in the system

As Dental staff, you work in the **🦷 Dental** module. Unlike most specialty EMRs in this system,
Dental runs its **own token/queue screen** — it does not open on a shared OPD workspace. You select a
patient from today's dental queue, then work through four tabs: **🦷 Tooth Chart**, **📊 Perio**,
**📋 Treatment Plan**, and **🔬 Lab Orders**. This manual assumes you have never used hospital
software before.

> **Where patient registration actually happens — this is not a thin OPD wrapper, but it does share
> OPD's queue and department model.** `DentalPage.tsx` reads today's queue directly from the
> `opd_tokens` table, filtered to whichever department(s) in your hospital have "dental" in the name.
> **There is no "New Patient" or "Add to Queue" button inside the Dental module itself** — the
> empty-queue message on screen says so explicitly: *"Register patients via OPD → select Dental
> department."* So: the chairside clinical work (tooth charting, periodontal probing, treatment
> planning, lab orders) is entirely Dental's own screens and its own tables
> (`dental_charts`, `periodontal_charts`, `dental_treatment_plans`, `dental_lab_orders`) — none of
> that overlaps with `doctor-opd.md`. But getting a patient *into* today's queue in the first place
> is the standard OPD walk-in/token flow, department-filtered to Dental, not a separate Dental
> registration screen.

> **Access check — a one-time admin-configuration step, same pattern as Dialysis/Oncology/IVF/
> Mortuary, and like Mortuary, no doctor fallback.** The `/dental` route has no override in
> `src/lib/routeRoles.ts`, so it inherits its allowed-roles list from the module catalogue
> (`src/lib/modules.ts`, line 82): **Dentist** and **Super Admin** only. `doctor` is not on this
> list — confirmed directly against the route guard — so an existing Doctor login cannot open
> `/dental` the way a Doctor login can open Physiotherapy in Phase 5. **Dentist** is not one of the
> 7 default role cards on **Settings → Staff Members → Add Staff Member**
> (`src/pages/settings/SettingsStaffPage.tsx`, `DEFAULT_ROLE_CARDS`, lines 85–92) and is not seeded
> by any migration as a system role either. Your Hospital Admin must create it once as a **custom
> role** on **Settings → Roles & Permissions** — typing "Dentist" there slugifies to exactly
> `dentist` (`src/pages/settings/SettingsRolesPage.tsx`, `slugifyRoleName`, lines 44–46), which is
> what the route guard already expects. This is a one-time setup step, not a product gap — but it is
> required before any Dentist-titled login can exist.

All dates on screen show as DD/MM/YYYY. All money shows as ₹.

---

## 1. The header and token queue

The header shows **🦷 Dental**, a badge counting patients still **in queue** (excluding completed,
cancelled, and no-show), and a **"Refresh"** button.

The left panel is today's queue, searchable by name, UHID, or token number. Each row shows the
token number, patient name, UHID · gender · age, and a status badge: **Waiting**, **Called**, **With
Doctor** (in consultation), or **Done** (completed) — no-show and cancelled rows appear faded with no
label. Click a patient to open their workspace on the right, which always opens on the **Tooth
Chart** tab first.

---

## 2. 🦷 Tooth Chart — charting findings

1. With a patient selected, the FDI tooth chart renders in the main panel. Click a surface on any
   tooth to open a small pop-up titled **"Tooth {number} — Surface {surface}"**.
2. Pick a status for that surface from the badges shown: **Normal**, **Caries**, **Filling**,
   **Crown**, **RCT**, **Missing**, **Implant**, **Bridge**, **Extraction Planned**. Clicking one
   applies it immediately and closes the pop-up — repeat for every finding.
3. Below the chart, record **Oral Hygiene Assessment**: pick **Oral Hygiene** (good / fair / poor)
   and **Calculus** (none / mild / moderate / heavy) as button toggles, and add free-text **Soft
   Tissue Notes** (gingival findings, mucosal lesions).
4. Click **"Save Chart"**. If this patient already has a chart on file, this updates it; otherwise it
   creates a new one for today's date.

---

## 3. 📊 Perio — periodontal probing

A full-mouth table, one row per tooth (all 32 by FDI number), with six probing-depth fields per
tooth — **Buccal (D/M/C)** and **Palatal (D/M/C)** — plus a **BOP** (bleeding on probing) checkbox
for each side.

1. For each tooth you probe, type the depth in millimetres into the relevant Buccal/Palatal
   distal/mesial/central boxes (depths over 5mm highlight red, 4–5mm highlight amber) and tick **BOP**
   where bleeding occurred.
2. As you enter values, three summary badges update live at the top: **Bleeding Index** (% of all
   sites that bled), **Deepest** (the single deepest pocket found and which tooth it's on), and an
   auto-computed diagnosis badge — **Healthy**, **Gingivitis**, or **Stage I–II** / **Stage III–IV
   Periodontitis**, based on the deepest pocket and the bleeding index.
3. Click **"Save Periodontal Chart"**. Each save creates a new dated record — this tab does not edit
   a previous one in place, so you can track a patient's periodontal status over multiple visits.

---

## 4. 📋 Treatment Plan — planning and billing procedures

A table of planned work: **Tooth**, **Procedure**, **ICD-10**, **Priority**, **Cost ₹**,
**Sessions**, **Status** — with a running **Total** at the bottom.

### Adding a planned procedure

1. Click **"+ Add Item"**.
2. **Tooth Number** (e.g. "16") and optionally an **ICD-10 Code** from a built-in list (e.g. K02.9
   Dental caries, K04.0 Pulpitis, K05.3 Chronic periodontitis).
3. **Procedure** — pick from a list including Scaling & Polishing, Filling (Composite/Amalgam), Root
   Canal Treatment, Crown (PFM/Zirconia), Extraction, Surgical Extraction, Implant, Bleaching,
   Orthodontic Assessment, Bridge, Denture, Gingivectomy, Flap Surgery, Curettage, or Other.
4. **Priority** — Urgent, Soon, or Elective — plus **Cost ₹** and number of **Sessions**.
5. Click **"Add to Plan"**.

### Billing a completed procedure

Change an item's **Status** dropdown to **Completed** (from Planned / In Progress / Skipped) and the
system immediately raises a bill for that procedure's cost — the GST rate is looked up from your
hospital's configured dental service rate (`service_master`), not a flat percentage — and shows a
toast like **"₹X,XXX billed to patient account."**

### Recording consent and saving the plan

Toggle **"Patient consented to treatment plan"** once you've discussed the plan with the patient —
this stamps a consent date badge. Click **"Save Treatment Plan"** to persist everything; the plan's
overall status (Active / Partially Done / Completed) is calculated automatically from each item's
individual status.

---

## 5. 🔬 Lab Orders — ordering prosthetic/appliance work

A table of every lab order for this patient: **Work Type**, **Tooth**, **Lab**, **Material**,
**Ordered**, **Expected**, **Status**, **Action**.

1. Click **"+ New Lab Order"**.
2. **Work Type** — Crown, Bridge, Removable Partial Denture, Fixed Partial Denture, Complete
   Denture, Orthodontic Appliance, Night Guard, Bleaching Tray, Implant Crown, or Inlay/Onlay.
3. **Tooth Numbers**, **Lab Name**, **Material**, **Shade**, **Expected Date**, **Cost ₹**, and
   **Special Instructions**.
4. Click **"Place Order"**.

Each order moves through status buttons shown in its row as work progresses: **In Lab** (from
Ordered), **Ready** (from In Lab — this fires a toast reminding you to call the patient back for
fitting), then **Delivered** (from Ready).

---

*This manual covers the Dental screens as they exist in Aumrti HMS today. If a screen looks different
from what is described here, tell Divya (Specialty EMRs) so the manual can be corrected.*
