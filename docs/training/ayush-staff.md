# AYUSH Staff — Training Manual

## What this role does in the system

As AYUSH staff, you work in the **🌿 AYUSH & Integrative Medicine** module, which covers five
systems selected via a toolbar: **🌿 Ayurveda**, **💊 Homeopathy**, **🌙 Unani**, **🪻 Siddha**, and
**🧘 Yoga & Naturopathy**. Whichever system you select changes which department's patient queue you
see and which consultation form renders. Four tabs sit below the system selector: **📋
Consultation**, **🧬 Prakriti**, **🛁 Panchakarma**, and **💊 Prescriptions**. This manual assumes
you have never used hospital software before — and assumes no prior exposure to Ayurvedic or
homeopathic terminology either; every term used on screen is explained below.

> **This module is genuinely different from allopathic OPD, not a relabelled copy.** Two of its four
> tabs — **Prakriti** (constitutional assessment) and **Panchakarma** (a scheduled multi-session
> therapy programme) — have no equivalent anywhere in `doctor-opd.md`; there is no "constitution
> questionnaire" or "therapy course scheduler" in the standard OPD consultation flow. Even the
> Consultation tab's own form changes shape depending on which system you've selected (Section 2
> below) — this is not the same four-tab Complaint/Guidance/Orders/Reports shape doctor-opd.md
> documents.

> **Patient registration happens inside this module, unlike Dental.** The header's **"New
> Consultation"** button opens the same walk-in registration dialog used hospital-wide
> (`WalkInModal`), but pre-filled with whichever AYUSH department matches your currently selected
> system — so you can register a new walk-in patient and issue their token without leaving the AYUSH
> module or going through the separate OPD screen first.

> **Access check — same one-time admin-configuration step as Mortuary and Dental, and also no
> doctor fallback.** The `/ayush` route has no override in `src/lib/routeRoles.ts`, so it inherits
> its allowed-roles list from the module catalogue (`src/lib/modules.ts`, line 83): **AYUSH Doctor**
> and **Super Admin** only — `doctor` is confirmed absent from this list, so an existing allopathic
> Doctor login cannot open `/ayush`. **AYUSH Doctor** is not one of the 7 default role cards on
> **Settings → Staff Members → Add Staff Member** (`src/pages/settings/SettingsStaffPage.tsx`,
> `DEFAULT_ROLE_CARDS`, lines 85–92) and is not seeded by any migration as a system role. Your
> Hospital Admin must create it once as a **custom role** on **Settings → Roles & Permissions** —
> typing "Ayush Doctor" slugifies to exactly `ayush_doctor`
> (`src/pages/settings/SettingsRolesPage.tsx`, `slugifyRoleName`, lines 44–46), which is what the
> route guard already expects. This is a one-time setup step, not a product gap, but it is required
> before any AYUSH Doctor login can exist.

All dates on screen show as DD/MM/YYYY. All money shows as ₹.

---

## 1. The header and system selector

The header shows **🌿 AYUSH & Integrative Medicine** and two buttons (each gated by your hospital's
permission setup — if missing, ask your admin): **"+ New Consultation"** (opens walk-in
registration, pre-filled to the current system's department) and **"+ Panchakarma"** (jumps straight
to the Panchakarma tab and opens its scheduling dialog).

Below that, click **🌿 Ayurveda**, **💊 Homeopathy**, **🌙 Unani**, **🪻 Siddha**, or **🧘 Yoga &
Naturopathy** to switch systems — this changes every tab's content to that system's patients and
data. Three KPI tiles track the selected system only: **Today's Consultations**, **Panchakarma
Today**, and **Active Patients**.

---

## 2. 📋 Consultation — the queue and the examination form

The left panel is today's queue for the selected system's department, searchable by name, UHID, or
token number — same **Waiting / Called / With Doctor / Done** status badges used across the
system's token screens. Click a patient to open their consultation on the right.

1. Enter the **Chief Complaint \*** (required before you can save).
2. **If the system is Ayurveda**, an accordion titled **"Ashtavidha Pariksha (8-fold Examination)"**
   opens, covering the eight traditional diagnostic examinations: **🖐️ Nadi (Pulse)**, **💩 Mala
   (Stool)**, **💧 Mutra (Urine)**, **👅 Jivha (Tongue)**, **🗣️ Shabda (Voice)**, **✋ Sparsha
   (Touch)**, **👁️ Drik (Eyes)**, and **🧍 Akriti (Appearance)**. Nadi and Jivha each offer quick
   template buttons (e.g. "Vata dominant, irregular, thready" for pulse; "Coated white" for tongue)
   that you can click instead of typing, or type your own finding into the box below them.
3. **If the system is Homeopathy**, a **"Homeopathic Case Taking"** card opens instead, with
   **Modalities (better/worse)**, **Mental Generals**, **Physical Generals**, a **Miasmatic
   Tendency** dropdown (Psora / Sycosis / Syphilis / Tubercular), and **Remedy**, **Potency** (6c /
   12c / 30c / 200c / 1M / 10M), and **Dose** (1 dose / 3 doses daily / Morning & night) fields.
4. Enter an **Ayurvedic Diagnosis** (free text, e.g. "Vataja Jwara") and an optional **ICD Code**.
5. **For every system except Homeopathy**, a **Prescription** card lets you click **"+ Add
   Medicine"** repeatedly, each time picking a **Drug** from your hospital's AYUSH drug master (or
   typing your own) and filling **Dose**, **Anupana** (the vehicle the medicine is taken with, e.g.
   warm water or honey), **Frequency**, and **Duration**.
6. Fill **Diet Advice** and **Lifestyle Advice**, and set **Follow-up after** N **days**.
7. Click **"Save Consultation"**.

---

## 3. 🧬 Prakriti — constitutional assessment

This has no equivalent in allopathic OPD. Search for a patient on the left; if they already have an
assessment on file, it displays directly (dominant dosha badge, Vata/Pitta/Kapha score bars, and any
saved summary) with a **"Re-assess Prakriti"** button if you need to start over.

To run a fresh assessment:

1. For each of 30 questions (body frame, skin, appetite, sleep, memory, and so on), click whichever
   of the three answer columns — labelled **Vata**, **Pitta**, or **Kapha** — best matches the
   patient.
2. Live counters update as you go: **V**, **P**, **K** scores out of 30 each. You need at least 20
   answered questions before the result section unlocks.
3. Once you've answered 20+, a result card shows the dominant dosha (or a mixed/tridosha result if
   two or three scores are close) and the three score bars.
4. Optionally click **"Generate AI Summary"** for a short AI-written paragraph on personality traits,
   health tendencies, and diet/lifestyle recommendations based on the scores — treat this as a
   drafting aid, not a clinical fact, the same way any AI output in this system should be reviewed
   before being acted on.
5. Click **"Save Prakriti Assessment"**.

---

## 4. 🛁 Panchakarma — scheduling and completing therapy sessions

Also with no allopathic equivalent: a schedule table of therapy sessions — **Date**, **Time**,
**Procedure**, **Oil / Medicine**, **Duration**, **Status**, **Actions** — for the next 7 days back
and forward.

### Scheduling a session

1. Click **"Schedule"** (or the header's **"+ Panchakarma"** button).
2. Search for and select the **Patient**.
3. Pick the **Procedure** — Abhyanga (full body oil massage), Shirodhara (oil pouring on forehead),
   Basti (medicated enema), Virechana (purgation therapy), Vamana (emesis therapy), Nasya (nasal
   instillation), Raktamokshana (bloodletting), Udvartana (herbal powder massage), Pinda Sweda
   (bolus massage), Shastika Shali (rice bolus massage), Netra Tarpana (eye treatment), Kati Basti
   (lower back oil pool), or Other.
4. Set **Date**, **Time**, and **Duration (min)** (45 / 60 / 90).
5. Optionally record the **Oil / Medicine** used and its **Quantity (ml)**.
6. Click **"Schedule"**.

### Completing a session

Click **"Complete"** on any **scheduled** row to open the completion dialog: record **Patient
Feedback** and **Observations**, then click **"Complete & Bill"**. This marks the session completed
and immediately raises a bill for it — the fee and GST rate come from your hospital's configured
service rate for that procedure where one exists (defaulting to ₹800 at 5% GST if not configured).
The system guards against billing the same session twice: if you somehow trigger completion again
on an already-billed session, it shows **"Session already completed & billed"** instead of creating
a second charge.

---

## 5. 💊 Prescriptions — reviewing past consultations

A read-only history: search past consultations by complaint or diagnosis on the left, click one to
see its full detail on the right — the prescribed medicines table (Medicine, Formulation, Dose,
Anupana, Frequency, Duration), Diet Advice, Lifestyle Advice, and the follow-up interval, exactly as
they were recorded at that consultation. There are no edit actions here — to change a prescription,
go back to the Consultation tab and record a new visit.

---

*This manual covers the AYUSH screens as they exist in Aumrti HMS today. If a screen looks different
from what is described here, tell Divya (Specialty EMRs) so the manual can be corrected.*
