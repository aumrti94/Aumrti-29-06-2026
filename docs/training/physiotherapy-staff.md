# Physiotherapy Staff — Training Manual

## What this role does in the system

As Physiotherapy staff, you work in the **🦿 Physiotherapy & Rehabilitation** module: accepting
referrals, booking and completing sessions, recording standardised outcome scores, booking
electrotherapy/exercise equipment, and building Home Exercise Plans you can send straight to a
patient's phone. This manual assumes you have never used hospital software before.

> **Access check — no gap found, and no setup step needed either.** The `/physio` route has no
> override in `src/lib/routeRoles.ts`, so it inherits its allowed-roles list from the module
> catalogue (`src/lib/modules.ts`, line 77): **Physiotherapist**, **Doctor**, and **Super Admin**.
> Unlike Dialysis, Oncology, and IVF, this module lists **Doctor** directly — and Doctor is one of
> the 7 role cards that already ship by default on the Staff screen
> (`src/pages/settings/SettingsStaffPage.tsx`, lines 85–92). That means any hospital's existing
> Doctor logins can open this module with **zero extra setup**. If you want a login titled
> specifically **"Physiotherapist"** rather than Doctor, your Hospital Admin still needs to create
> it once as a **custom role** on **Settings → Roles** — the same one-time step documented for the
> other three Specialized modules — but it is not required to use this module at all.

All dates on screen show as DD/MM/YYYY. All money shows as ₹.

---

## 1. The header — KPIs and quick actions

Four KPI cards, each with an icon: **Active Referrals**, **Sessions Today**, **Pending Referrals**
(shown in amber once above zero), and **Equipment In Use**. Two buttons: **"Accept Referral"** and
**"Book Session"**.

The **"Accept Referral"** button does not itself accept anything — clicking it simply switches you
to the Referrals tab (Section 2), where you then select a pending referral and accept it from its
own detail panel. **"Book Session"** opens the booking dialog directly (Section 3). If either
button is missing for your login, your hospital's permission setup for this module doesn't include
that action.

---

## 2. Referrals — accepting and reviewing a case

The left-hand panel lists referrals, filterable by **Pending**, **Active**, **Done**, or **All**.
Each row shows an urgency badge, status badge, diagnosis, sessions done/planned, and the date
referred. Click a referral to see its detail on the right: diagnosis and ICD code, any **Goals**
chips, an amber **"⚠️ Precautions"** card if the referrer noted any, sessions done/planned, and the
referral date.

- If the referral is **pending**, click **"Accept Referral"** in the detail panel (a different
  button from the header one) to take ownership of the case.
- If it's **accepted** or **in progress**, click **"Book Session"** to open the booking dialog
  pre-filled with this referral.
- Below that, a **Session History** table shows every past session for this referral: Date,
  Duration, Modalities, Pain (before→after), and Notes.

---

## 3. Sessions — booking and completing a session, and a billing gap to know about

### Booking a session

Open the dialog from either **"Book Session"** button (header, or on a referral's own detail
panel):
1. Pick the **referral** (the dropdown shows the patient's name and diagnosis).
2. Pick a **date** and **time**.
3. Pick a **duration** — 30, 45, or 60 min.
4. Pick a **session type** — in clinic, bedside ip, home visit, or tele.
5. Tick any **modalities** your hospital has configured (e.g. electrotherapy types) as chips.
6. Click **"Book Session"**. The system posts a charge for this session **immediately, at booking
   time** — this is a "payment-first" design, not something you trigger separately.

### Today's Sessions

The Sessions tab lists everything booked for today: Time, Duration, Type, Modalities, and Status
(**Done** once billed, otherwise **Scheduled**). Click **"✓ Complete"** on a session once it has
actually happened.

### Completing a session

1. In the **"Complete Session"** pop-up, drag the **Pain Before (VAS 0–10)** and **Pain After
   (VAS 0–10)** sliders to the values the patient reports.
2. Add free-text **Treatment notes**.
3. Toggle **"HEP given"** if you handed over home exercises this visit.
4. Optionally record **ROM** findings (free text, e.g. "Knee F: 0-110°, Hip F: 0-90°") and an
   **MMT Grade** (0 "No contraction" through 5 "Normal strength").
5. Click **"Complete & Bill"**. This records your findings and triggers a second billing step for
   the session.
6. Once a session shows **Done**, its Action column changes to a **"Print"** button, which opens a
   printable **Physiotherapy Session Report** (patient, date, time, duration, type, modalities,
   pain VAS before/after, treatment notes, HEP given, and a signature line for the therapist).

> **Content gap found while tracing the billing code for this flow.** Booking a session (step 6
> above) posts a charge via `postCharge` (`PhysioPage.tsx`, `bookSession`); completing a session
> posts a *second*, independent charge via `createPhysioBill` (`PhysioPage.tsx`,
> `completeSessionAction` → `createPhysioBill`). Both use the exact same dedupe key format
> (`physio:session:<session id>`), so for a patient who is genuinely admitted at the time of
> booking, the two charges correctly collapse onto the *same* admission bill and nothing doubles up.
> **For an OPD patient with no active admission, they do not collapse.** `bookSession`'s own charge
> always opens a brand-new OPD bill (it never passes an encounter ID for `postCharge` to match an
> existing one against), and `createPhysioBill`'s OPD branch separately always opens its *own*
> brand-new standalone "PHYS-" bill at completion — two different bills, so the one safeguard that
> exists (a dedupe index scoped to `bill_id` + the dedupe key, not the dedupe key alone) never
> triggers between them. In plain terms: **an OPD physiotherapy session may currently be billed
> twice** — once at booking, once at completion. Until this is fixed, cross-check an OPD patient's
> account for a duplicate physio charge before they're asked to pay, and flag this to Ravi/billing
> as a revenue-correctness issue rather than assuming it's a one-off.

---

## 4. Outcomes — standardised scoring and progress tracking

Click **"Record Score"** to open the form: pick the **referral**, the **tool** — FIM (Functional
Independence), Barthel Index, VAS Pain Scale, KOOS (Knee Score), DASH (Arm/Shoulder), Berg Balance
Scale, MRC Muscle Grade, or Other, each labelled with its maximum score — the **assessment type**
(Initial, Interim, Discharge), and drag the **Score** slider. Click **"Save Score"**.

Click any row in the outcomes table to load its **Progress Chart** on the right — this needs at
least two assessments for the same referral before a line appears. Once a chart is showing, an
optional **AI-assisted outcome trajectory** prediction can appear below it (only if your hospital
has that AI feature switched on) — it estimates expected recovery time and flags whether the
patient is tracking on, ahead of, or behind a typical trajectory for that diagnosis. Treat it as a
second opinion, not a record of fact.

---

## 5. Equipment — booking electrotherapy and exercise equipment

Click **"Book Equipment"**: pick the **equipment type** (UST, IFT, TENS, SWT, Traction,
Hydrotherapy, Parallel Bars, Treadmill, Other), then **start** and **end** date/time, and click
**"Book"**. On the Equipment list, a **booked** item shows a **"Start"** button (moves it to **in
use**) and an **in-use** item shows a **"Complete"** button (frees it).

---

## 6. HEP — building and sending a Home Exercise Plan

Click **"New HEP"**:
1. Pick the **referral**.
2. Set **Frequency / day** and **Duration (weeks)**.
3. Click exercises from the **Exercise Library**, grouped by body region — **Knee** (Quad sets,
   SLR, Terminal knee extension, Hamstring stretch), **Back** (Cat-camel, Bird-dog, Prone
   extension, Core bracing), **Shoulder** (Pendulum, Wall walk, Isometric, Rotator cuff), **Hip**
   (Bridges, Clamshells, Hip abduction, Hip flexor stretch), **Ankle** (Pumps, Alphabet, Theraband,
   Single leg balance), and **General** (Deep breathing, Bed mobility, Transfer practice) — each
   click adds it to the plan below, where you can adjust **Sets** and **Reps** per exercise or
   remove one.
4. Click **"Save HEP"**.

On the HEP list, click the **message icon** to send the plan straight to the patient's phone over
WhatsApp (pre-filled with the exercise list, frequency, and a safety line — "Stop if pain
increases. Contact us immediately."), or the **printer icon** to open a printable version.

---

*This manual covers the Physiotherapy & Rehabilitation screens as they exist in Aumrti HMS today,
including the billing gap documented in Section 3. If a screen looks different from what is
described here, tell Sridevi (Allied Health & Rehabilitation) so the manual can be corrected.*
