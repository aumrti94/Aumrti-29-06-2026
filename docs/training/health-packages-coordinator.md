# Health Packages & Preventive Care Coordinator — Training Manual

## A note on this file's title

This file replaces a "Telemedicine Coordinator" role originally scoped for this phase. Checking
`src/pages/telemedicine/TelemedicinePage.tsx` and its route found that **Telemedicine has no
distinct coordinator role or screen at all** — `/telemedicine` in `src/lib/modules.ts` is gated to
`["doctor", "super_admin"]` only, and the component itself is a single doctor-facing video-consult
workspace (patient queue + video call window + SOAP notes + quick prescription + auto-billing, all
on one screen). Its one scheduling-adjacent control is a "Schedule" button gated the same way
everything else on the page is — there is no separate screen a non-doctor coordinator works from.
**Health Packages** is used instead: a genuinely different job (booking and running preventive
health-checkup packages) worked by a Receptionist/Doctor combination, with five distinct tabs and
two coordinator-facing modals, that is not covered by `front-desk.md` (confirmed by reading
`front-desk.md`'s actual scope — it covers registration, appointment booking, and the OPD queue,
and has zero mentions of "package").

## What this role does in the system

As a Health Packages Coordinator, you work in one module: **📋 Health Packages & Checkups**. It
opens on **📅 Today's Checkups**, and from there you can also reach the **📦 Packages** catalogue,
**📊 Progress Tracker**, **🏢 Corporate** accounts, and **📈 Analytics**. This manual assumes you
have never used hospital software before.

> **Access check — a clean bill, the same shape as the base Emergency Department module, not the
> custom-role pattern most specialty roles since Phase 5 have needed.** The `/packages` route
> carries no override in `src/lib/routeRoles.ts`, so it inherits its allowed-roles list straight
> from the module catalogue (`src/lib/modules.ts`, line 45): **receptionist**, **doctor**,
> **super_admin**. Both **Reception** and **Doctor** are two of the 7 role cards that ship by
> default on **Settings → Staff Members → Add Staff Member**
> (`src/pages/settings/SettingsStaffPage.tsx`, `DEFAULT_ROLE_CARDS`, lines 85–92). There is no
> custom-role step required and no job title missing from the route guard — any hospital that has
> already set up Reception and Doctor logins can open this module with zero extra configuration.

All dates on screen show as DD/MM/YYYY. All money shows as ₹.

---

## 1. The header and KPI row

Four tiles always show: **Booked Today**, **In Progress**, **Completed Today**, **Revenue Today**
(see the content note at the end of this file about the last of these). Two buttons sit in the
header, each gated by your hospital's permission setup for this module:

- **"Patient Booking Link"** — opens the public, unauthenticated booking page
  (`/packages/book`) in a new tab. This is the page a patient or their family uses directly, from
  outside the hospital's login system — share this link (or the hospital's QR code pointing to it)
  with anyone who wants to book a package themselves; it walks them through choosing a package,
  entering their details, and paying online via Razorpay. You never need to use this page yourself
  for a walk-in or phone booking — use "Book Package" below instead.
- **"Book Package"** — opens the booking form for a patient you are booking in person or by phone
  (Section 3).

A separate **"Create Package"** button (not gated the same way) opens the package-authoring form —
this is normally a one-time setup task done by whoever first configures your hospital's package
catalogue, not a daily coordinator task; it is covered briefly in Section 5 for completeness.

---

## 2. 📦 Packages — the catalogue

Each package shows as a card: its type badge (Basic / Essential / Comprehensive / Executive /
Senior Citizen / Corporate / Custom / Pre-Marital), target gender, estimated duration in hours, age
range if restricted, the number of components included, and its price. Click **"View Components"**
on any card to expand the full list of what's included (lab tests, radiology studies, OPD
consultations) in the sequence they'll be performed. Click **"Book This Package"** on a card to
jump straight into the booking form pre-aware of that package's context.

---

## 3. Booking a package

1. Click **"Book Package"** (header) or **"Book This Package"** on a catalogue card.
2. **Patient \*** — search and select an existing patient, or register a new one inline.
3. **Package \*** — select from the dropdown (shows each package's name and price).
4. **Date \*** and **Time** — when the checkup is scheduled.
5. Click **"Book & Bill Package"**.

Booking does four things in one step: it creates the booking record, raises a bill for the full
package price immediately, posts the accounting journal entry for that revenue, and stages the
package's lab and radiology components as orders against the patient — but those staged orders are
deliberately **held back** from the Lab and Radiology worklists until the bill is actually paid.
The moment payment settles, the hold releases and the tests appear for the lab/radiology teams to
act on. You'll see a confirmation toast naming how many lab and radiology orders were staged, with
a reminder that they're held until payment.

---

## 4. 📅 Today's Checkups — running the day's bookings

Each booking shows as a card: the patient's name and UHID, their package, a status badge, and a
row of eight **stations** — Reception, Vitals, Lab, ECG, X-Ray, USG, Doctor, Report — with a
progress bar underneath.

1. For a booking still in **"booked"** status, click **"Check In"**. The patient moves to the
   Vitals station.
2. Click **"Complete [station name] →"** to advance through each station:
   - **Vitals** opens a form for BP, pulse, SpO2, temperature, height, and weight — BMI
     calculates automatically as you type height and weight.
   - **Lab** doesn't open a form — it raises the package's lab orders directly (or, if they were
     already staged at booking time per Section 3, it simply advances the station without raising
     a second, duplicate set).
   - **ECG**, **X-Ray**, **USG**, and **Doctor** each open a simple findings/notes box.
3. Once every station is done, the booking moves to **"awaiting_report"** and appears in the
   Progress Tracker (Section 5).

---

## 5. 📊 Progress Tracker — generating the health report

Bookings that have finished every station, or are already marked completed, show here. For a
booking still **awaiting_report**, click **"Generate Health Report"** — this calls the AI to draft
a plain-language summary (overall health status, key findings, risk factors, recommendations, next
checkup timing) from the patient's age, gender, package, and scheduled date, and marks the booking
**completed** once the draft is produced. Review the AI draft before it goes to the patient — it is
a draft, not an authoritative report, the same discipline every other AI-assisted draft in this
manual follows (see the content note below about two buttons on this same screen that are not yet
wired up).

---

## 6. 🏢 Corporate — accounts and bulk booking

This tab lists your hospital's corporate accounts (company name, contact, phone, GSTIN, credit
days, negotiated discount %). Two buttons:

- **"Add Corporate Account"** — a simple form for the company's details, credit terms, and
  discount percentage.
- **"Bulk Book from File"** — select a corporate account and package, pick a scheduled date, then
  click **"Upload Employee File"** to import a `.csv`/`.xlsx`/`.xls` list of employees (a
  **"Download Template"** button gives you the expected column layout). Each row is validated
  before you commit — rows missing a name, or missing both phone and employee ID, are flagged in
  red so you can fix them before clicking **"Book for N Employees"**.

---

## 7. 📈 Analytics — orientation only

A read-only KPI panel: Total Bookings, Completed, Cancelled, and Completion Rate for all time (not
scoped to a date range on this screen). A "Package Performance" card below it is a placeholder for
now — see the content note below.

---

## Content findings from writing this file

**Three findings — all flagged, none fixed (see reasoning on each).**

- **Flagged, not fixed — the "Revenue Today" KPI tile on the main header is always ₹0.**
  `src/pages/packages/PackagesPage.tsx`'s `loadKPIs` function fetches real counts for Booked
  Today/In Progress/Completed Today, but sets `revenue: 0` outright — it never queries the bills
  or package bookings created today for an actual total. The tile always displays ₹0 regardless of
  how much was actually billed. Computing this correctly needs a decision on what "today's
  revenue" should mean for this screen (billed amount vs. collected/paid amount, and whether
  corporate bulk bookings — which don't bill at booking time, see below — should count at all), so
  it is flagged for Nikhil/revenue-pod rather than fixed here with an assumption baked in.
- **Flagged, not fixed — two buttons on the Progress Tracker have no click handler at all.**
  `src/components/packages/ProgressTrackerTab.tsx`'s **"Download Report"** and **"WhatsApp to
  Patient"** buttons (shown once a report exists) render with no `onClick` — clicking either does
  nothing. Implementing either is a real feature (a PDF export, and a WhatsApp send integration
  respectively) rather than a one-line fix, so both are flagged here rather than attempted.
- **Flagged, not fixed — corporate bulk bookings skip the billing and order-staging step that
  individual bookings go through.** `src/components/packages/CorporateTab.tsx`'s `bulkBook`
  function inserts a `package_bookings` row per employee with `corporate_account_id` and
  `booking_source: "corporate"` set, but — unlike `BookPackageModal.tsx`'s individual-booking path
  — it never creates a `bills` row, never links a `bill_id` back onto the booking, and never stages
  lab/radiology orders via `syncLabOrders`/`syncRadiologyOrders` at booking time. When that
  booking is later checked in on Today's Checkups, the **Lab** station's fallback path (intended
  for bookings made before order-staging existed) raises real lab orders anyway, with no bill
  behind them at all — individually-booked packages hold their lab/radiology orders until payment
  settles, but corporate bulk-booked ones never go through that hold because there is no bill to
  gate on. This may be the intended design (corporate accounts are invoiced later on credit terms,
  per their `credit_days` field), but it was not possible to confirm that intent from the component
  source alone, and it touches money, so it is flagged for revenue-pod to confirm rather than
  changed here.

No code defect in this module was confident and safe enough to fix within this pass — all three
findings above are flagged for the appropriate pod/owner rather than fixed, per the instruction to
only fix what can be done confidently and within a reasonable blast radius. No files in
`src/components/packages/` or `src/pages/packages/` were modified.
