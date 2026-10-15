# IVF & ART Staff — Training Manual

## What this role does in the system

As IVF & ART staff, you work in the **🧬 IVF & Assisted Reproduction** module: registering couples
under informed consent, running a cycle through its stages, recording stimulation monitoring and
semen analysis, tracking the frozen embryo bank, and filing the annual ICMR ART Act compliance
report. This manual assumes you have never used hospital software before.

> **Access check — no gap found, with one one-time setup step.** The `/ivf` route has no override
> in `src/lib/routeRoles.ts`, so it inherits its allowed-roles list from the module catalogue
> (`src/lib/modules.ts`, line 84): **IVF Doctor**, **Embryologist**, and **Super Admin**. Both job
> titles an IVF unit actually employs already have a matching role on that list — there is no job
> title here with zero matching login, unlike Phase 2's three gaps.
>
> As with Dialysis and Oncology, neither **IVF Doctor** nor **Embryologist** is one of the 7 role
> cards that ship by default on the Staff screen (`src/pages/settings/SettingsStaffPage.tsx`, lines
> 85–92). Your Hospital Admin must first create each as a **custom role** on **Settings → Roles**
> before it can be assigned to a staff login — a one-time admin setup step, not a product gap.
> Once that custom role exists, the login reaches every screen in this manual.

All dates on screen show as DD/MM/YYYY. All money shows as ₹.

---

## 1. The header — KPIs and quick actions

Four KPI cards: **Active Cycles**, **Monitoring Today**, **Embryos Stored**, and **Consent
Expiring** (shown in amber once above zero — embryos whose annual cryopreservation consent lapses
within 30 days). Two buttons: **"+ Register Couple"** and **"+ Start Cycle"**. If either is missing
for your login, your hospital's permission setup for this module doesn't include that action.

---

## 2. Couples — registering under ICMR consent

The main list shows every registered couple: Couple Code, Female Patient, Indication, AMH, AFC,
Consent, and Status. Click a row to see its detail pop-up.

**To register a couple**, open the dialog from **"+ Register Couple"**:
1. **Female Patient \*** and, optionally, **Male Patient** — both searched via the patient picker.
2. **Indication** (free text, e.g. "Tubal factor, Male factor, Unexplained, PCOS…").
3. **AMH Level (ng/mL)** and **AFC Count**.
4. **ICMR Registration Number**.
5. A highlighted box, **"⚠️ ICMR ART Act 2021 Compliance"**, states that informed consent from
   both partners is mandatory before any ART procedure and that the physical consent form must be
   signed and documented. Tick **"Consent obtained from couple"** only once that is genuinely true
   — the **"Register Couple"** button stays disabled until this switch is on; there is no way to
   register a couple without it.

---

## 3. Cycles — the stage-by-stage Kanban

Every active cycle is a card inside one of five columns: **Stimulation**, **OPU Done**,
**Fertilization**, **ET Done**, **Awaiting Result** (this column groups both the "luteal support"
and "test due" stages). Each card shows the couple code, cycle type, "Day N • Cycle #X", and the
protocol if one was set.

**To start a new cycle**, open the dialog from **"+ Start Cycle"** in the header:
1. **Couple \*** — the dropdown flags any couple with **"⚠️ No consent"** next to their code, but
   does not stop you picking them; clicking **"Begin Cycle"** afterwards is what actually blocks it
   ("Cannot start cycle — consent not obtained") if their consent isn't on file.
2. **Cycle Type \*** (IVF, ICSI, FET, IUI, IMSI, Donor Egg, Donor Sperm, Surrogacy).
3. **Protocol** (Long agonist, Short agonist, Antagonist, Mini IVF, Natural cycle).
4. Click **"Begin Cycle"**. Starting a cycle auto-bills the stimulation milestone (fallback ₹15,000
   if no specific rate is configured).

**To advance a cycle**, click the **"→ [next stage]"** button on its card. Moving into **OPU Done**
or **ET Done** auto-bills that milestone too (egg retrieval ₹25,000 fallback, embryo transfer
₹20,000 fallback) — you don't raise a separate bill yourself.

---

## 4. Stimulation — follicle monitoring

1. **Select Active Cycle** from the dropdown on the left. Once chosen, a **Follicle Growth &
   Endometrium** line chart appears (once there are 2+ scans) alongside the scan history list —
   each past scan shows a **"🎯 Trigger Met"** badge if it qualified.
2. On the right, log a new scan: **Scan Date**, **Stim Day**, then add each measured follicle in
   mm to **Right Ovary Follicles** and **Left Ovary Follicles** one at a time via the **"+ Add"**
   button (press Enter also works) — follicles ≥18mm are highlighted green.
3. Fill **Endometrium (mm)** and **Pattern** (Trilaminar / Homogeneous), **E2 (pg/mL)**, **LH**,
   **P4**, **Current Dose** (e.g. "Gonal-F 225IU"), and **Dose Adjustment** (e.g. "Continue same"),
   plus free-text **Notes**.
4. If three or more follicles across both ovaries are ≥18mm, a green banner appears:
   **"🎯 Trigger criteria met — ≥3 follicles ≥18mm. Consider trigger today."**
5. Click **"Save Scan Record"**.

---

## 5. Embryology — content gap, not wired to real records

> **Serious content gap found while grounding this tab against its source
> (`EmbryologyTab.tsx`).** This tab does not load or save anything to the database. It opens with
> **three hardcoded sample rows already in the table** (embryo numbers E‑01 through E‑03, with
> made-up grading), and the **"Save Records"** button has **no click handler at all** — clicking it
> does nothing, silently. The **"+ Add Oocyte"** button does work, but only against an in-memory
> list that exists purely in your browser tab: navigate away, refresh the page, or close the tab,
> and everything you entered — including the pre-loaded sample rows — is gone. Nothing here reaches
> an `embryology_records` table or any other persistent store.
>
> This matters specifically for this module: ICMR ART Guidelines 2021 require embryo records to be
> retained for a minimum of 10 years. As built today, this screen cannot satisfy that requirement —
> it cannot retain anything past the current browser session. Do not rely on this tab to be your
> embryo development record; keep your lab's existing paper/other system of record until this is
> fixed, and flag this to Latha (Oncology, Dialysis & IVF) as a build gap, not a training gap.

What the screen shows, for reference: a table titled **"Embryo Development Tracking (Day 0 - Day
6)"** with columns ID, **Day 0 (Oocyte)** (MII / MI / GV / Degenerate), **Day 1 (Fertilization)**
(2PN / 1PN / 3PN / 0PN), **Day 3 (Cleavage)** (free text, e.g. "8C, Gr 1"), **Day 5/6
(Blastocyst)** (free text Gardner grade, e.g. "4AA"), and **Status** (Active (Culture) / Transferred
/ Frozen (Cryobank) / Discarded).

---

## 6. Embryo Bank — frozen inventory and ICMR export

A table of every currently stored embryo: Storage Location, Couple, Grade, Freeze Date, Method,
Consent Expiry, and Status. An embryo with consent expiry in the past shows **"🔴 EXPIRED"**; one
expiring within 30 days shows **"⚠️ Nd"**. If any embryo is in that 30-day window, an amber banner
reminds you that ICMR ART Act 2021 requires annual consent renewal and to contact the couple for
renewal or a disposition decision.

Click **"📥 Export ICMR Format"** to download the current stored inventory as a CSV (Couple Code,
Embryo Grade, Freeze Date, Freeze Method, Storage Location, Consent Expiry, Disposition).

---

## 7. Andrology — semen analysis (WHO 6th Edition)

A table of every semen analysis report on file: Date, Volume, Concentration, Motility %,
Progressive %, Morphology %, DFI %, and whether ICSI is indicated. Values below the WHO 6th
Edition reference minimum are shown in red.

**To record a new report**, click **"+ New Report"**:
1. Pick the **Patient**.
2. Fill in the parameters, each field labelled with its WHO reference minimum — **Volume (mL)
   ≥1.4**, **pH ≥7.2**, **Conc (M/mL) ≥16**, **Total Count (M) ≥39**, **Total Motility % ≥42**,
   **Progressive % ≥30**, **Morphology % ≥4**, **Vitality % ≥54**, plus **DFI %**.
3. Toggle **ICSI Indicated** if applicable, add **Notes**, and click **"Save Report"**.

---

## 8. ICMR — the ART Act 2021 compliance tab, and a serious content gap

This tab exists for one regulatory reason: **ART (Regulation) Act 2021, Section 25**, requires
every ART clinic to submit an annual registry report to ICMR, and every couple/cycle to carry an
ICMR Couple ID. The screen shows two compliance tiles — **"N couples missing ICMR ID"** / **"All
couples have ICMR IDs"**, and **"N cycles pending ICMR report"** / **"All cycles reported"** — plus
a year picker and a **"Generate & Download"** button that builds a JSON annual report (procedure
breakdown, outcomes, pregnancy/live-birth rates, neonatal outcomes, and full cycle detail), saves a
copy internally for record-keeping, marks the included cycles as submitted, and downloads the file.
Below that is a cycle-by-cycle table with each cycle's ICMR ID status, procedure, date, outcome,
gamete source, and submission status.

> **Serious content gap found while grounding this tab against its source
> (`ICMRComplianceTab.tsx`).** The query this tab runs to populate couple names and ICMR IDs joins
> `ivf_cycles` against a table called **`ivf_couples`**. That table does not exist anywhere in the
> schema — the real couples table, used everywhere else in this module including the Couples tab
> (Section 2) and the Cycles Kanban (Section 3), is **`art_couples`**. Because the code discards
> the query's error, this doesn't crash the screen — it just means the couple-name column, the
> ICMR ID badges, and very likely **both compliance tiles at the top of this exact tab** will not
> reflect your hospital's real couples or consent status. This is the one screen whose entire job
> is to flag ICMR ID and submission gaps, and the flag itself is built on a query referencing a
> table that was never created. Do not rely on the two compliance tiles here to tell you whether
> your hospital is actually missing ICMR IDs — verify against the Couples tab directly, and flag
> this to Latha (Oncology, Dialysis & IVF) as a build gap, not a training gap.

---

*This manual covers the IVF & Assisted Reproduction screens as they exist in Aumrti HMS today,
including the two content gaps documented above. If a screen looks different from what is
described here, tell Latha (Oncology, Dialysis & IVF) so the manual can be corrected.*
