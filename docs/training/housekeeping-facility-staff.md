# Housekeeping / Facility Staff — Training Manual

## What this role does in the system

As Housekeeping / Facility staff, you work in one module: **🧹 Housekeeping & Facility**. It opens
on the **Tasks** tab — a Kanban board of every cleaning task — and from there you pick up and
complete a task (including the bed/room turnover that lets a ward reuse a bed), log **BMW**
(biomedical waste), track **Linen**, manage recurring **Schedules**, and read **Reports**. This
manual assumes you have never used hospital software before.

> **Access check — the headline finding this phase: every housekeeping login today is
> supervisor-level by definition; there is no lower-tier attendant/staff role string anywhere in
> the app.** The `/housekeeping` route has no override in `src/lib/routeRoles.ts`, so it inherits
> its allowed-roles list straight from the module catalogue (`src/lib/modules.ts`, line 96):
> **Housekeeping Supervisor**, **Super Admin**, and **Hospital Admin**. A grep of the entire `src`
> tree and every migration in `supabase/migrations` turns up exactly one housekeeping-specific role
> string anywhere in the codebase: `housekeeping_supervisor`. There is no `housekeeping_staff`,
> `housekeeping_attendant`, `cleaner`, or similar — not hardcoded anywhere, not seeded by any
> migration, and not available as a label distinct from "Supervisor" in any existing config. This
> is a different shape of gap from Phase 5/6's "needs a one-time custom role" pattern: there, the
> exact job title's role string already existed in the route guard and just needed to be typed once
> on **Settings → Roles & Permissions** (`slugifyRoleName`, `src/pages/settings/SettingsRolesPage.tsx`
> lines 44–46). Here, **Housekeeping Supervisor is also not a default role card**
> (`src/pages/settings/SettingsStaffPage.tsx`, `DEFAULT_ROLE_CARDS`, lines 85–92) and needs that same
> custom-role step — but even after taking it, the only title that unlocks this module is
> "Supervisor." A hospital cannot create a distinctly-titled "Housekeeping Attendant" or
> "Housekeeping Staff" login that opens `/housekeeping` at all; doing so would create a role string
> (e.g. `housekeeping_attendant`) that the route guard's hardcoded array simply does not recognise.
> In practice, every day-to-day housekeeping login at a hospital using this software today must be
> labelled "Housekeeping Supervisor" (or ride in on an Admin login) regardless of the actual rank of
> the person using it.
>
> This matches a real product-level observation in the Tasks tab's own code (Section 2 below):
> there is, correctly, no "assign this task to a named attendant" step anywhere in the task
> lifecycle — any housekeeping login can pick up any pending task. The single-role-string gap above
> and the self-service task model below are two sides of the same fact: this module was built
> assuming one flat housekeeping login, not a supervisor/attendant hierarchy.

All dates on screen show as DD/MM/YYYY. Money shows as ₹.

---

## 1. The header — quick actions

Two buttons, both gated by your hospital's permission setup for this module (if either is missing
for your login, ask your admin — it isn't a bug):
- **"New Task"** — opens the task-creation form (Section 2).
- **"BMW Entry"** — opens the biomedical-waste log form directly (Section 3).

Below the header, four KPI tiles always show: **Pending Tasks**, **In Progress**, **Beds
Cleaning**, and **Avg TAT Today** (average task turnaround time in minutes, for tasks completed
today).

---

## 2. Tasks — the cleaning task board and bed turnover

This is the tab the module opens on: a three-column Kanban board — **Pending**, **In Progress**,
**Completed Today** — filterable by **Ward**. Each task card shows its type (e.g. "bed turnover",
"routine cleaning"), a priority badge, a **DISCHARGE** or **TRANSFER** tag if it was created
automatically rather than by hand, the ward/bed, and how long ago it was created.

### The full task lifecycle, precisely

**Most bed-turnover tasks are not created by a person at all — they are created automatically the
moment a bed is vacated.** When a patient is discharged or transferred to a different bed
(`src/lib/bedTurnover.ts`), the system does two things in a fixed order: it first inserts a
`bed_turnover` task — priority **High**, status **Pending**, with a fixed 6-item checklist (Remove
soiled linen, Clean mattress with disinfectant, Fit fresh linen, Clean bedside table, Mop floor,
Supervisor inspection) — and only *after* that task exists does it flip the bed's own status to
**Cleaning**. This order is deliberate: a bed is never left sitting in "Cleaning" with no task
behind it, because the only thing that can ever move a bed back to "Available" is completing that
specific task (Section below). You'll see this reflected on the IPD Bed Map as a bed marked
**Cleaning** — that bed is now sitting in your Pending column as a `bed_turnover` task.

You can also create a task by hand:
1. Click **"New Task"**.
2. Pick a **Task Type** (Bed Turnover, Terminal Cleaning, Routine Cleaning, Spill Management,
   Isolation Protocol, OT Cleaning, Toilet Cleaning, Linen Change, or Other — your hospital's exact
   list is configurable), a **Priority** (low / normal / high / urgent), a **Ward**, and — once a
   ward is picked — optionally a specific **Bed**.
3. Add **Notes** if needed, then click **"Create Task"**. A manually-created task always starts in
   **Pending** with a default 4-item checklist (Clean surfaces, Mop floor, Empty dustbin, Supervisor
   inspection).

**There is no "assign to a named person" step anywhere in this flow, for either path.** A task
lands directly in the **Pending** column visible to every housekeeping login; whoever is free picks
it up. This is a deliberate simplification already noted in the component's own code comment
(`TasksTab.tsx`, lines 103–106): an older "Assigned" status exists in the data model from before
this was simplified, but there is no housekeeping role to assign *to*, so any such legacy row is
simply shown under Pending today rather than being a separate step.

1. On any card in **Pending**, click **"Start"** — status moves to **In Progress**, and the start
   time is recorded.
2. On a card in **In Progress**, click **"Complete →"**. This opens the Complete Task dialog:
   - Tick every item in the **Checklist** — all boxes must be checked, there is no way to skip one.
   - Rate **Quality Score**, 1 to 5 stars.
   - Add **Notes** if needed.
   - Click **"Mark Complete"**.
3. On save, the system records completion time and turnaround time (TAT, in minutes). **If — and
   only if — this was a `bed_turnover` task tied to a specific bed**, the bed's status flips to
   **Available** right then, and the action is **logged as NABH evidence** (standard FMS.5,
   recording the TAT against the NABH target of under 30 minutes). Any other task type just shows a
   plain "Task completed" confirmation — no bed changes, no NABH log.

---

## 3. BMW Log — biomedical waste

A compliance note at the top states the CPCB (Central Pollution Control Board) colour-coding this
hospital follows under the BMW Rules 2016: 🟡 **Yellow = Anatomical** | 🔴 **Red = Contaminated** |
🔵 **Blue = Glass** | ⚪ **White = Sharps**. Below it, a history table of every day's log: Date,
Ward, and a column per bag colour in kg (🟡 Yellow, 🔴 Red, 🔵 Blue, ⚪ White, ⚫ Black, 🧪 Cyto),
plus Total kg, disposal Agency, and Manifest number.

1. Click **"BMW Entry"** (header, Section 1).
2. Pick the **Ward**.
3. Enter the weight in kg collected for each category actually used by your hospital: **🟡 Yellow
   (Anatomical)**, **🔴 Red (Contaminated)**, **🔵 Blue (Glass/metals)**, **⚪ White (Sharps)**,
   **⚫ Black (General)**, and **🧪 Cytotoxic** — leave any category at zero if nothing of that
   type was collected. The **Total** updates live as you type.
4. Enter the **Disposal agency** and **CPCB Manifest No.** (the tracking number from the common
   biomedical waste treatment facility that collects it), then click **"Save BMW Record"**.
5. This save is **logged as NABH evidence** automatically (standard HIC.8).

---

## 4. Linen — laundry tracking

A single entry form plus a running history table (Date, Ward, Type, Sent, Received, Condemned).

1. Pick a **Ward** and a **Linen Type** (Bed Sheet, Pillow Cover, Blanket, Patient Gown, Surgical
   Drape, Curtain, or Towel).
2. Enter counts for **Sent** (to laundry), **Received** (back from laundry), and **Condemned**
   (written off — torn, stained beyond use, etc.) — any left blank is recorded as zero.
3. Click **"Save"**.

---

## 5. Schedules — recurring area-cleaning schedules

A list of configured recurring cleaning schedules — separate from the Tasks board, this is for
areas that need cleaning on a fixed cycle regardless of whether a bed just turned over (corridors,
toilets, the canteen, and so on). Each row shows the area name, area type, frequency, last-done and
next-due times, and turns red if it's overdue, amber if due today.

1. Click **"Add Schedule"**.
2. Enter an **Area name** (free text, e.g. "3rd Floor Corridor").
3. Pick an **Area Type** (General Ward, Operation Theatre, ICU / HDU, Emergency / Casualty, OPD /
   Outpatient, Toilet / Washroom, Corridor, Stairwell, Reception / Lobby, Canteen / Pantry,
   Pharmacy, or Laboratory).
4. Pick a **Frequency** (Hourly, Every 4hrs, Every Shift, Daily, Weekly, or Monthly) and
   optionally a **Ward**.
5. Click **"Save"**.

Click **"Mark Done"** on any schedule once you've completed it — this records the time and
automatically calculates the next due time based on the frequency you picked.

---

## 6. Reports

Two charts: **Bed Turnover TAT by Ward** (average minutes per ward, against the NABH target of
under 30 minutes, stated on screen) and **BMW Generation Trend** (total kg of biomedical waste per
month).

---

*This manual covers the Housekeeping & Facility screens as they exist in Aumrti HMS today,
including the access-control finding above. If a screen looks different from what is described
here, tell Murthy (Facility & Support Services) so the manual can be corrected.*
