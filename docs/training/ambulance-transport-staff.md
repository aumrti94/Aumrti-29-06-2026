# Ambulance / Transport Staff — Training Manual

## What this role does in the system

As Ambulance / Transport staff, you work in one module: **🚑 Ambulance Service**. It opens on the
**Dispatch Board** — a Kanban view of every call today — and from there you perform an
**Equipment Check** on a vehicle before it goes out, log vitals and treatment on the **Transit
Log** during a trip, and manage the vehicle **Fleet**. This manual assumes you have never used
hospital software before.

> **Access check — the most severe finding of this phase: there is no login role for this job at
> all, not even one requiring a one-time setup step.** The `/ambulance` route has no override in
> `src/lib/routeRoles.ts`, so it inherits its allowed-roles list straight from the module catalogue
> (`src/lib/modules.ts`, line 80): **Nurse**, **Doctor**, **Receptionist**, and **Super Admin**.
> A direct read of that array, independently re-checked against `routeRoles.ts`, confirms there is
> **no role string resembling "ambulance staff," "driver," "EMT," or "transport staff" anywhere in
> this list** — unlike every other job this phase and Phase 5/6 covered.
>
> This is a harder gap than Phase 5/6's "needs a one-time custom role" pattern (Dialysis
> Technician, Chemo Nurse, Embryologist, Mortuary Officer, Dentist, AYUSH Doctor, CSSD Technician),
> and closer to Phase 2/4's "no login matches the job title at all" pattern (Radiology Technician,
> IPD Ward Clerk, Payroll Clerk, Store Clerk) — but it is **more severe than those too**. In every
> one of those cases, creating a custom role on **Settings → Roles & Permissions** that slugifies to
> the right snake_case string would work *if* that string already happened to be the one the route
> guard expected — Phase 5/6 confirmed it does, for those four. For Ambulance, there is no such
> string to aim for: `modules.ts`'s hardcoded array for this route is exactly
> `["nurse", "doctor", "receptionist", "super_admin"]`, with nothing resembling an ambulance-staff
> role anywhere in it. Typing "Ambulance Driver" or "EMT" into the custom-role form
> (`src/pages/settings/SettingsRolesPage.tsx`, `slugifyRoleName`) would produce `ambulance_driver`
> or `emt` — a role string the route guard's hardcoded array does not contain and would not
> recognise, so that login still could not open `/ambulance`. Unlike the Phase 5/6 roles, there is
> no clean one-time admin action that fixes this; it needs the route's allowed-roles list itself
> widened, which is a product change, not a configuration step — flag it to Nikhil/Vikram to
> sequence rather than treating it as something this manual or a hospital admin can work around.
>
> **Who can actually use this screen today:** a **Nurse**, **Doctor**, or **Receptionist** login.
> If your hospital has dedicated ambulance/transport staff, they need one of those three logins to
> reach this module at all — there is no narrower option. The rest of this manual is written for
> whichever of those three logins is actually running ambulance operations at your hospital in
> practice.
>
> **One further access detail, specific to this module's own tab-filtering mechanism.**
> `AmbulancePage.tsx` filters its own sidebar tabs through `useModuleAccess().tabAllowed("ambulance",
> tab.id)` rather than relying only on the page-level route guard — a distinct mechanism from the
> simple role-list check the other three modules this phase use. In practice this does not narrow
> anything out of the box: `src/lib/tabPermissions.ts` defines all four tabs (`dispatch`,
> `equipment`, `transit`, `fleet`) under the `ambulance` key with no built-in default restriction —
> `hasTabAccess()` defaults to **allow** unless a hospital admin has explicitly hidden a specific
> tab for a specific role in **Settings → Roles & Permissions**. So today, any of the three roles
> above that can open the module sees all four tabs, unless your own hospital's admin has
> deliberately narrowed one.

All dates on screen show as DD/MM/YYYY. Money shows as ₹.

---

## 1. The header — KPIs

Across the top: **"🚑 Ambulance Service"**, and on the right, three live counters: **N active
calls** (dispatches currently in status dispatched / en_route / at_scene / transporting), **N
vehicles** (active vehicles in the fleet), and **N checks today** (equipment checks logged today).

---

## 2. Dispatch Board — taking and running a call

A 5-column Kanban board: **Dispatched**, **En Route**, **At Scene**, **Transporting**,
**Completed**. Each card shows the assigned vehicle number (if one was picked), the chief
complaint, pickup location, call time, and crew names if entered.

### Creating a new dispatch

1. Click **"New Dispatch"**.
2. **Pickup Location \*** — free text (patient address or location).
3. **Destination** — free text (e.g. which hospital).
4. **Chief Complaint** — free text (e.g. "RTA, chest pain").
5. **Vehicle** — pick from your active fleet (Section 4), or leave unassigned.
6. **Crew Names** — free text, comma-separated (e.g. "Ravi Kumar, Priya Sharma"). This is a plain
   text field, not a lookup against staff logins — there is no structured "assign driver" step
   beyond whatever default driver is already recorded against the vehicle you picked in Fleet
   (Section 4).
7. Click **"Dispatch"**. The call appears on the board under **Dispatched**.

### Moving a call through its stages

Drag a card from one column to the next — **Dispatched → En Route → At Scene → Transporting →
Completed** — to update its status. Each move is saved immediately; there is no separate "save"
step.

> **Defect confirmed and fixed — the "New Dispatch" form now has a Patient field.** Tracing
> `DispatchTab.tsx`'s intake flow confirmed the earlier suspicion: the create-dispatch form never
> collected a patient at all, so the auto-bill-on-Completed check (which only fires if the dispatch
> already has a `patient_id`) could never trigger — every ambulance trip billed nothing, silently,
> every time. A **"Patient (if already known)"** search field (same picker used elsewhere in the
> app, by name or UHID) now sits at the top of the New Dispatch form — fill it in when you already
> know who you're dispatching for (a scheduled transfer, a dialysis pickup) so the trip bills
> correctly on completion. **Leave it blank for a true emergency call where the patient isn't known
> yet** — there is currently no way to attach a patient to a dispatch *after* it's created, so an
> emergency pickup's ambulance trip still won't auto-bill. Loop in billing/front-desk manually for
> those until a post-dispatch "link patient" step exists.

---

## 3. Equipment Check — pre-trip vehicle checklist

1. Pick a **vehicle** from the dropdown at the top (defaults to your first active vehicle).
2. For each of the 15 fixed checklist items — Oxygen cylinder (full), Oxygen mask & tubing,
   Bag-valve mask (BVM), Defibrillator / AED, Suction machine & catheters, IV fluids (NS, RL x2
   each), IV cannulas (assorted), Emergency drug kit (sealed), Stretcher & safety straps, BP cuff &
   stethoscope, Pulse oximeter, ECG leads / monitor, Cervical collar (assorted sizes), Trauma
   dressings & bandages, Intubation kit (laryngoscope, ETT) — mark it **OK**, **Fault**, or
   **Missing** (every item starts as OK; you only need to change the ones that aren't).
3. Add **Remarks** if needed.
4. Click **"Save Check"**. If every item was OK, you'll see **"Equipment check: All OK ✓"**;
   otherwise **"Equipment check saved — issues noted"**.
5. This save is **logged as NABH evidence** automatically (standard COP.3).

The right-hand panel shows the last 10 checks for the selected vehicle, colour-coded green (all OK)
or red (issues found).

---

## 4. Transit Log — vitals and treatment during a trip

1. At the top, pick the active call from **"— Select Active Call —"** (only calls currently in
   Dispatched / En Route / At Scene / Transporting appear here).
2. Record **BP (mmHg)**, **Pulse (bpm)**, **SpO2 (%)**, **RR (bpm)**, and **GCS (3–15)** as
   measured.
3. Describe **Treatment Given** and **Drugs Given** in free text (e.g. "Morphine 2mg IV,
   Ondansetron 4mg IV").
4. Click **"Log Treatment"**. Each entry is timestamped and added to the **Treatment Records**
   list on the right — you can log multiple entries across a single trip as the patient's
   condition changes.

---

## 5. Fleet — vehicle registry

A card per vehicle: vehicle number, type (BLS, ALS, NICU Transport, or Mortuary), and its default
driver name/phone if one is on file.

1. Click **"Add Vehicle"**.
2. **Vehicle Number \*** (e.g. "MH12AB1234" — automatically capitalised).
3. **Type** — BLS, ALS, NICU Transport, or Mortuary.
4. **Driver Name** and **Driver Phone** — optional; this is the one place a driver is actually
   recorded against a vehicle in this module.
5. Click **"Save"**.

Click **"Deactivate"** / **"Activate"** on any vehicle to take it out of (or back into) service —
an inactive vehicle no longer appears as a selectable option on the Dispatch Board or Equipment
Check tab.

---

*This manual covers the Ambulance Service screens as they exist in Aumrti HMS today, including the
access-control finding above, which is this phase's most significant gap. If a screen looks
different from what is described here, tell Murthy (Facility & Support Services) so the manual can
be corrected.*
