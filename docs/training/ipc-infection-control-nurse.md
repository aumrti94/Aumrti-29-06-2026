# IPC Dashboard (Infection Control Nurse / IPC Officer) — Training Manual

## What this role does in the system

As the Infection Control Nurse / IPC Officer, you work in one module: the **IPC Surveillance
Dashboard** (route `/ipc/dashboard`, badge **NABH HIC** in the header). It is where device-days,
healthcare-associated infection (HAI) events, bundle-compliance checklists, and hand-hygiene audits
are recorded and turned into the CLABSI/CAUTI/VAP/SSI rates your NABH HIC chapter is assessed
against. This manual assumes you have never used hospital software before.

**This is a different, fuller screen from "Infection Control" inside Quality & NABH — not a
duplicate.** `docs/training/quality-nabh-officer.md` already documents `QualityPage.tsx`
(`/quality`), which has its own tab literally labelled **🦠 Infection Control**, and that file
explicitly lists Infection Control (and Antibiotic Stewardship) as "not covered in detail here."
Having read both components directly, that framing is correct — `InfectionControlTab.tsx` (the
component behind QualityPage's tab) is genuinely the thinner sibling, not the other way round:
it is three KPI cards (Hand Hygiene Compliance, HAI Rate, and an "Antibiotic Consumption" card that
is permanently a placeholder dash, captioned "Data source: pharmacy module") plus two simple
entry modals — "Record Hand Hygiene Audit" (one combined total/compliant count, no WHO Five
Moments breakdown) and "Report Hospital-Acquired Infection" (no onset-date-range surveillance, no
device-days, no bundle tracking at all). It writes into the **same two tables** your dashboard
reads (`hand_hygiene_audits`, `ipc_infection_events`), so a hand-hygiene audit or HAI event logged
on either screen shows up on both — but only the IPC Surveillance Dashboard documented here has
device-day tracking, per-device bundle checklists, NABH-benchmarked CLABSI/CAUTI/VAP/SSI rate
cards with period-over-period trend comparison, and the AI anomaly-insights panel. Treat the IPC
Surveillance Dashboard as your real working screen; QualityPage's Infection Control tab is a
lighter read/write surface that happens to share your data.

> **Access check — fixed.** `src/lib/modules.ts` line 72 lists the module's intended roles as
> `quality_officer`, `quality_manager`, **`infection_control_nurse`**, `doctor`, `super_admin`,
> `hospital_admin`. `src/lib/routeRoles.ts` used to carry an explicit hardcoded override for this
> route that dropped `infection_control_nurse` while adding `nurse`/`nursing_supervisor` instead —
> confirmed real, the same copy-paste-override bug class already fixed for FMS in an earlier
> phase. Before the fix, this was not a true dead end the way Ambulance Driver was: creating a
> custom "Infection Control Nurse" role always gets a `role_permissions` database row, which routes
> access through `hasAccess()`'s dynamic permissions branch rather than the broken static override
> — so a two-step admin workaround (create the role, then explicitly grant View on the IPC
> Dashboard row in the Permission Matrix) already worked. **The override is now removed at the
> source anyway**, so `/ipc/dashboard` falls through to the catalogue's own correct role list
> directly — the one-step custom-role pattern every other specialty role in this manual has used
> since Phase 5 now works here too, no Permission Matrix detour required. `nurse`/
> `nursing_supervisor` were deliberately dropped in the fix, not just left as before: IPC
> surveillance data entry (device-day logging, HAI event entry, antibiogram review) is
> infection-control-team work, not bedside nursing's — a ward nurse performs hand hygiene in
> practice but doesn't log this dashboard's data, which is exactly why the catalogue created a
> distinct role for it.

All dates on screen show as DD/MM/YYYY. This module has no money fields.

---

## 1. The header and the date range picker

The header reads **"IPC Surveillance Dashboard"** with a **NABH HIC** badge. From left to right on
the right-hand side:
- A refresh icon button (reloads everything without changing your date range).
- **"Ask NABH Assistant"** — an AI-assisted panel that drafts a written analysis of your current
  surveillance data, which you review and edit before it is saved as NABH evidence (see Section 8
  for how this differs from the AI Insights tab).
- **"Log HAI Event"** — opens the same **"Record HAI Event"** dialog as the HAI Events tab's own
  button (Section 4).

Below the header, the **Period** bar lets you pick the date range every number on the page is
calculated over:
1. Quick chips — **30d**, **90d**, **6M**, **MTD** (month to date), **Last 3M** — click one to jump
   straight to that range.
2. Or set **From** / **To** dates yourself (both are plain date pickers; **To** cannot be set past
   today).
3. The window size shows on the right as **"N day window."**

Changing the date range re-runs every rate, chart, and table on the page except the Hand Hygiene
tab, which keeps its own independent record list.

---

## 2. Reading the HAI Rate cards against NABH benchmarks

Just below the period bar, four cards show **CLABSI Rate**, **CAUTI Rate**, **VAP Rate**, and **SSI
Rate** for your selected period, each against the preceding period of equal length:
- A large number is the rate; next to it, **≤1.5**, **≤2**, **≤2.5**, or **≤2** respectively marked
  **NABH** — the national benchmark it is compared to. A red **"↑ EXCEEDED"** tag appears the
  moment your rate crosses that line.
- Underneath, the comparison to the previous period of the same length (e.g. "prev: 1.20") with a
  red up-arrow or green down-arrow.
- The subtitle under each title tells you the real denominator — e.g. "Central line-days: 420
  (curr) / 380 (prev)" — so you can see exactly what the rate was computed over.

**If a card says "No central-line days recorded in this period" (or the equivalent for the other
three) instead of a number, that is not a rate of zero — it means nothing was exposed to measure
in that window.** The dashboard is deliberately built not to show a false "0.00 ✓" when there is
simply no device-day data yet; treat an empty-exposure card as "surveillance gap," not "all clear."

Below that, a three-tile strip shows **Active Devices** (current count across all types),
**Bundle Compliance** (average % across all scored checklists, with the scored-vs-total count), and
**Total HAI Events** for the period.

---

## 3. The seven tabs

Across the top: **📊 Overview · 🔌 Device Log · 🦠 HAI Events · ✅ Bundle Compliance · 🖐 Hand
Hygiene · 📈 Trends · 🤖 AI Insights**. Which of these seven you see can depend on your hospital's
plan — if one is missing for your login, it is a plan-entitlement question for your admin, not
necessarily a bug.

### 3a. 📊 Overview

Four panels, read-only:
- **Device Days by Type** — a bar chart of device-days per device category for the selected period.
- **HAI Events by Type** — a horizontal bar per infection type (CLABSI, CAUTI, VAP, SSI, BSI, CDI,
  MDRO, Other) with its count.
- **Currently Active Devices** — a count per device type, right now (not scoped to your date range).
- **Rates vs NABH Benchmarks** — the same CLABSI/CAUTI/VAP rates as the top cards, shown as
  progress bars against their benchmark line, with a green "✓" or red "↑ EXCEEDED" tag.

### 3b. 🔌 Device Log — recording a device and removing it

This is where device-days (the denominator every rate above depends on) actually get created.

**To log a new device:**
1. Click **"Log Device."**
2. **Admission \*** — search by patient name, UHID, ward, or bed, and pick the matching **active**
   admission. Device surveillance can only be recorded against an admitted patient — there is no
   OPD path for this form.
3. **Device Type \*** — Central Line, Peripheral Line, Urinary Catheter, Ventilator, Tracheostomy,
   or Other Device.
4. **Inserted At \*** — date and time (cannot be set in the future).
5. **Insertion Site** (e.g. "right subclavian") and **Notes** are both optional.
6. Click **"Save Device."**

If the device type you chose has an insertion bundle defined (today, only **Central Line** does),
a note tells you **"The insertion bundle checklist will open after saving"** — and it genuinely
does: saving the device immediately opens the **Insertion Bundle** checklist for it (same form as
Section 3c below), so you complete the insertion bundle in the same flow rather than hunting for
the device afterwards.

**The device log table** shows Type, Ward, Inserted, Removed, Device Days (days ≥7 are shown in
amber), and Status (**Active** or **Removed**). Every active row has two buttons:
- **"Bundle"** — opens that device's **Maintenance Bundle** checklist (its daily care-bundle audit,
  distinct from the one-time insertion bundle above).
- **"Remove"** — opens **"Remove [Device Type]"**: enter **Removed At \*** (cannot be before the
  insertion time or in the future), then **"Record Removal."** This stops that device's device-days
  from accruing any further.

### 3c. Bundle checklists (opened from the Device Log tab)

A bundle checklist is a list of plain-language care-bundle elements for that device type — e.g. for
Central Line maintenance: "Hand hygiene performed before access," "Maximum sterile barrier
precautions maintained," "Chlorhexidine skin antisepsis applied," "Catheter at optimal site
(femoral avoided)," "Necessity reviewed — central line still required." Tick each element that was
actually done; **compliance % is computed live** as you tick, and the form tells you plainly:
**"(unticked items count as not met)"** — leaving something blank is the same as marking it not
done, it is not neutral. Click **"Save Checklist"** when done.

### 3d. 🦠 HAI Events — logging an infection event

Click **"Log HAI"** (same dialog as the header's "Log HAI Event") to open **"Record HAI Event":**
1. **Infection Type \*** — CLABSI, CAUTI, VAP, SSI, BSI, CDI, MDRO, or Other.
2. **Onset Date \*.**
3. **Ward** and **Outcome** (Recovered, Transferred, Expired, Ongoing, Unknown) are both optional
   dropdowns.
4. **Organism** (e.g. "E. coli") and **Sensitivity Pattern** (e.g. "ESBL, MRSA") as free text.
5. Tick **"Device-associated infection"** if it is linked to a device.
6. Add **Notes** if needed, then **"Save Event."**

The events table shows Type, Onset, Ward, Organism, Sensitivity, a tick/cross for Device-linked,
and Outcome. An empty table reads **"No HAI events recorded in this period — excellent!"** — but
only when the read actually succeeded; if the data failed to load, the table says so instead,
because an empty result from a failed query is not a clean bill of health.

### 3e. ✅ Bundle Compliance

Three summary cards — **Central Line**, **Urinary Catheter**, **Ventilator** — each showing the
average compliance % across all scored checklists for that device type in your selected period,
with an amber **"Below 80% threshold"** flag if it falls under 80%. Checklists saved before scoring
was switched on, or otherwise left unscored, are excluded from this average rather than counted as
100%. Below the cards, the **Bundle Checklist Log** table lists every checklist (Device, Bundle
Type, Date, Compliance %) — this tab is read-only for new entries; the note on screen says
precisely that: **"Record a checklist from the Device Log tab, against the device it applies to."**

### 3f. 🖐 Hand Hygiene

Click **"Record Audit"** to open the WHO Five Moments form:
1. **Audit Date \*** and **Ward / Area.**
2. For each of the five moments — **M1 Before Patient Contact, M2 Before Aseptic Procedure, M3
   After Body Fluid Exposure Risk, M4 After Patient Contact, M5 After Touching Patient
   Surroundings** — enter **Opportunities** (observed) and **Compliant** (how many were done
   correctly); a live % chip shows per moment as you type.
3. Three technique checks: **"Glove use appropriate," "Hand rub available at POC," "Soap & water
   available."**
4. **Observations** and **Corrective Actions**, both free text.
5. Click **"Save Audit."**

A badge in the header of this tab shows **"This month: X% — on target"** (green) or **"— below 80%
target"** (red/amber). Each saved audit appears below with its per-moment breakdown and an **X**
button to delete it — there is no confirmation step before it deletes (see Defects below). NABH
HIC.9 requires monthly hand-hygiene audits using this framework with a ≥80% compliance target,
which is the text shown on screen when the list is empty.

### 3g. 📈 Trends

Three read-only charts over your selected window (up to 12 months): **HAI Rates per 1000 Device
Days** (CLABSI/CAUTI/VAP lines), **Device Days Trend** (area chart per device type), and **Total
HAI Events per Month** (bar chart).

---

## 4. 🤖 AI Insights — advisory only, never authoritative

Click **"Run AI Analysis."** The system sends your current period's rates, active-device counts,
HAI event counts, and bundle compliance % to an AI model, which returns four sections: **Anomaly
Alerts** (rates exceeding NABH benchmarks), **Key Observations**, **Recommended Actions**, and
**Compliance Gaps.** The result appears under an expandable **"AI Analysis Results"** panel.

**Treat this exactly the way this manual treats every other AI feature — a draft to review, never
a fact to act on.** The panel's own on-screen text says so directly: *"AI output is advisory
only — clinical judgment takes precedence."* Below the results, you are asked to tick: *"I have
reviewed the AI analysis above. I confirm this is advisory output and will apply independent
clinical judgment before taking any action based on these insights."* **Ticking this checkbox now
logs real NABH evidence** (standard HIC.2) the moment you check it — unticking does not remove that
record, since unchecking isn't a retraction of the fact that you reviewed it. This is a separate
evidence trail from the header's **"Ask NABH Assistant"** button (Section 1), which writes to a
different table (`nabh_evidence_items`) for a different purpose (a curated evidence document vs.
this checkbox's append-only review log) — use whichever one matches what you're actually trying to
record.

---

## Defects found in the source read for this file

- **Hand Hygiene audit deletion — fixed.** The **X** button on each audit row in the Hand Hygiene
  tab used to delete that record immediately on click, with no confirmation. It now opens a
  confirmation dialog ("Delete this audit record? This action cannot be undone") before the delete
  actually fires.
- **The AI Insights tab's review checkbox — fixed.** As noted in Section 4, ticking "I have
  reviewed the AI analysis above…" now logs real NABH evidence (standard HIC.2) rather than only
  existing in local component state.
- **The Antibiotic Consumption card on QualityPage's Infection Control tab is still a permanent
  placeholder**, captioned "Data source: pharmacy module" with a dash where a number should be —
  flagged here only because it sits on the look-alike screen this file had to rule out as the real
  workflow; it is `InfectionControlTab.tsx`'s own gap, not this dashboard's.

---

*This manual covers the IPC Surveillance Dashboard as it exists in Aumrti HMS today. If a screen
looks different from what is described here, tell Nirmala (IPC & Antibiotic Stewardship) so the
manual can be corrected.*
