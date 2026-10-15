# CSSD Technician — Training Manual

## What this role does in the system

As a CSSD (Central Sterile Supply Department) Technician, you work in one module:
**🏥 CSSD — Central Sterile Supply**. It opens on **Sterilize**, where you run and monitor
sterilization cycles, and from there you also manage **Sets & Instruments** (your set/instrument
inventory and its status), **Issue / Return** (handing sterile sets to OT and taking them back), and
**Logs** (the full cycle and issue/return history, plus a flash-sterilization compliance report).
This manual assumes you have never used hospital software before.

> **Access check — correct on the role-string match, but still needs the same one-time admin step as
> every other role in this phase. CSSD is "gap-free" only in the narrower sense that there's no
> mismatch — not in the sense that a CSSD Technician can log in with zero setup.** The `/cssd` route
> has no override in `src/lib/routeRoles.ts`, so it inherits its allowed-roles list from the module
> catalogue (`src/lib/modules.ts`, line 54): **CSSD Technician** and **Super Admin** only —
> confirmed, no `doctor` fallback either. The role string the job title needs (`cssd_technician`) is
> genuinely the one the route guard expects — that part really is clean, unlike Phase 2's Radiology
> Technician or IPD Ward Clerk, where no matching role string existed at all. But **CSSD Technician
> is not one of the 7 default role cards** on **Settings → Staff Members → Add Staff Member**
> (`src/pages/settings/SettingsStaffPage.tsx`, `DEFAULT_ROLE_CARDS`, lines 85–92: Doctor, Nurse,
> Billing, Pharmacist, Lab Tech, Reception, Admin/CEO), and no migration seeds it as a pre-built
> system role either. Exactly like Dialysis Technician, Chemo Nurse, and Embryologist in Phase 5, and
> like Mortuary Officer/Medical Officer/Dentist/AYUSH Doctor above, your Hospital Admin must create
> **"CSSD Technician"** once as a **custom role** on **Settings → Roles & Permissions** — it
> slugifies to exactly `cssd_technician` (`src/pages/settings/SettingsRolesPage.tsx`,
> `slugifyRoleName`, lines 44–46), which the route guard already expects — before a matching login
> can exist. **The one-time admin-configuration step is the same requirement every specialty role in
> this and the previous phase shares; CSSD is not exempt from it.**

All dates on screen show as DD/MM/YYYY. All money shows as ₹.

---

## 1. The header — status chips and quick actions

The header always shows live counts: **N Sets Ready** (green), **N Awaiting Processing** (amber),
and — only when above zero — **N Quarantined** (red) and **N BI Pending** (amber, biological
indicator results still incubating). Two buttons, each gated by your hospital's permission setup (if
either is missing for your login, ask your admin): **"+ New Cycle"** jumps to Sterilize and opens the
new-cycle form; **"Issue Set to OT"** jumps to Issue / Return and opens the issue form.

---

## 2. Sterilize — running a sterilization cycle

This is the tab the module opens on, split into a new-cycle form on the left and active
cycles/pending results on the right.

### Starting a routine cycle

1. Pick the **Autoclave**: Autoclave 1 — Pre-vacuum, Autoclave 2 — Gravity, or EO Gas Unit.
2. Pick the **Load Type**: **📋 Routine**, **⚡ Emergency**, **🔬 Implant**, or **⚠️ Flash** (Flash is
   covered separately below — it is not a normal option).
3. Pick the **Method**: Steam Autoclave, EO Gas, Plasma (H₂O₂), Dry Heat, or Chemical. Choosing a
   method auto-fills **Temp (°C)**, **PSI**, and **Duration (min)** with that method's standard
   cycle parameters (e.g. Steam Autoclave defaults to 134°C / 32 PSI / 4 min) — you can still edit
   any of the three by hand if your actual run differs.
4. Under **"Sets in this Load"**, tick every set going into this cycle. If a set you need doesn't
   exist yet, click **"+ Quick Add Set"** to create one on the spot (just a **Set Name** and
   **Code**) — it's added to the load automatically once created.
5. Toggle **"Biological Indicator included"** if a BI is in this load, and record the **Chemical
   Indicator** result as **✓ Pass** or **✗ Fail**.
6. Click **"Start Cycle (N sets)"**. Every set in the load moves to **processing** status
   immediately.

### Using Flash sterilization — a hard-blocked, logged exception

Selecting **⚠️ Flash** does not start a flash cycle directly — it opens a mandatory red warning
dialog titled **"🚫 FLASH STERILIZATION — NABH VIOLATION"**, stating flash sterilization is
prohibited by NABH standards, raises surgical site infection risk, and that SSIs cost
₹50,000–₹5,00,000 per case. To actually proceed:

1. Type a **Clinical Justification** of at least 50 characters (a live counter shows your progress).
2. Select an **Authorised By** — only users with the doctor, super_admin, or admin role appear in
   this dropdown.
3. Tick the acknowledgement checkbox confirming this is a genuine emergency.
4. Only then does **"Proceed with Flash — IC Alert Will Be Created"** become clickable. Clicking it
   immediately raises a high-severity clinical alert to the Infection Control team, logged as a NABH
   reportable event — this alert fires the moment you proceed, it is never batched or delayed.
   The recommended path, always offered first in the dialog, is **"✓ Cancel — Use Routine Cycle
   Instead"**.

### Reading and completing active cycles

Each **Active Cycle** card shows its cycle number, autoclave, load type badge (flash cycles are
outlined in red), how long ago it started, and which sets are in it. Click **"Cycle Complete"** once
the physical cycle has finished. If the load had no biological indicator (or the BI already passed),
every set in it is marked **sterile** immediately; if a BI is still incubating, the cycle moves to a
**"⏳ Pending BI Results"** list instead.

For a pending-BI cycle, click **"✓ BI Pass"** once the biological indicator confirms sterility — every
set in the load is released to **sterile** status. Click **"✗ BI Fail"** if it doesn't — every set in
that load is immediately moved to **quarantine** status and a critical clinical alert is raised
(*"STERILITY FAILURE — all items quarantined. Do NOT use until re-sterilized and BI passed"*), fired
immediately, not batched.

### The Autoclave Anomaly Detector panel

Below the cycle list sits an **"Autoclave Anomaly Detector"** panel with a **"Not Connected"** badge
and a **"Simulate Cycle"** button.

> **Content gap — this panel is a demo stub, not live monitoring, and the UI says so.** The
> component's own code comment states it plainly: *"Real implementation requires MQTT broker
> connection + autoclave sensor hardware. This UI stub shows connection status and simulates cycle
> data for demo/testing."* Clicking **"Simulate Cycle"** generates 20 synthetic temperature/pressure
> readings with one artificial anomaly injected, purely to preview what the feature would look like.
> Clicking **"Configure MQTT"** opens a form with disabled input fields (Broker Host, Port, Topic)
> and an explicit note that this "requires hardware setup" and is "pending IoT hardware procurement
> and MQTT broker deployment." There is no real-time autoclave telemetry anywhere in this module
> today — flag this to Lalitha (Biomedical & Asset Management) if your hospital needs actual
> hardware-connected monitoring, not a simulation.

---

## 3. Sets & Instruments — managing your inventory

Left panel: every instrument set, searchable by name/code and filterable by status (All / Sterile /
Dirty / Quarantined). Click a set to see its instruments on the right.

- Click **"+"** next to the search box to **Create Instrument Set** — **Set Name \***, **Set Code
  \*** (e.g. "SET-GS-001"), and **Specialty**.
- With a set selected, click **"+ Add Instrument"** — **Name \***, **Barcode \*** (scan or type),
  **Category** (surgical / endoscope / implant / electrical / container / other), and **Max
  Reprocessing** (0 = unlimited). Each instrument's row shows its **Cycles** count against that
  maximum once set.

---

## 4. Issue / Return — dispatching sets to OT and taking them back

Split screen: **Issue Set to OT** on the left, **Pending Returns** on the right.

### Issuing a set

1. Pick a **Set (sterile only)** — only sets currently marked sterile appear in this dropdown; if
   none do, the screen tells you directly: *"No sterile sets available. Process a sterilization
   cycle first."*
2. Enter the **Patient UHID** this set is going to (the field notes it auto-fills from the OT
   schedule where that integration exists).
3. Click **"Issue Set"**. The set moves to **in_use** status.

### Processing a return

Click **"Process Return"** on any pending-return card. The dialog opens pre-filled with the number
of instruments originally issued:

1. Enter **Instruments Returned** and **Damaged**.
2. If returned + damaged is less than the number issued, a red box appears:
   **"N instrument(s) not accounted for"**, and a **Loss Reason** becomes mandatory before you can
   submit.
3. Click **"Confirm Return"**. The set itself moves back to **dirty** status, ready for its next
   sterilization cycle. If any instruments were unaccounted for, a high-severity clinical alert is
   raised to verify with the OT team.

---

## 5. Logs — cycle history and the flash-sterilization report

Three panels, all read-only:

1. **Flash Sterilization Report** — total flash cycles this period, the percentage of all cycles
   that were flash (NABH target: under 1%), and total cycles run. The whole card turns red with an
   **"⚠️ Above NABH threshold"** badge once flash cycles exceed 5% of all cycles, and lists every
   flash cycle's recorded justification underneath.
2. **Sterilization Cycle Log** — every cycle: Date, Cycle #, Autoclave, Load Type, Items, BI result
   (Pass / FAIL / Pending), and Status (Completed / In Progress / Failed / Quarantine). Flash and
   failed cycles are highlighted in red.
3. **Issue / Return Log** — every set issue: Issued date/time, Set, Patient, instrument count,
   Returned date/time (with a **"⚠️ N lost"** flag if applicable), and return status (Complete /
   Pending / Loss Reported).

---

*This manual covers the CSSD screens as they exist in Aumrti HMS today, including the Autoclave
Anomaly Detector's simulation-only state documented in Section 2. If a screen looks different from
what is described here, tell Raji (CSSD & Sterilisation) so the manual can be corrected.*
