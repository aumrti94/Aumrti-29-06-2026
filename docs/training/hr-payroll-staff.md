# HR / Payroll Staff — Training Manual

**Module:** HR & Staff (`src/pages/hr/HRPage.tsx`)
**Owner:** Pradeep (HR, Payroll & Attendance)
**Screen:** `HR` in the main menu — route `/hr`

> Money on every payroll screen in this manual is shown in Indian Rupees with the ₹ symbol and
> Indian digit grouping. Dates are shown as DD/MM/YYYY. GST does not apply to payroll — PF, ESI,
> PT, and TDS rates come from the salary structure and statutory tables configured for your
> hospital, never typed by hand on the payroll screen itself.

**Scope of this file.** `HRPage.tsx` has 20 tabs across five sections. This manual covers the four
that are this role's actual daily work — **Attendance**, **Leave Management**, **Payroll
(PF/ESI/TDS)**, and **Payroll (History)**. The remaining 16 tabs (Staff Directory, Roster,
Payroll Integrations, Credentials, Expiring Credentials, Privileges, Training & CME, Training
Compliance, Injury Register, Second Victim Support, Occupational Health, Burnout Risk Monitor,
Performance Appraisals, Recruitment, Exit & Full-and-Final, Disciplinary & Grievance, Document
Vault, Reports) are credentialing, training-compliance, clinical-risk, and talent-lifecycle
screens that sit on the same page but belong to HR-manager-level or compliance-officer work, not
day-to-day payroll/attendance administration — this is a scoping decision, stated here explicitly
rather than silently skipped. Section 5 below is a one-line orientation map of them, not a
walkthrough, in case you land on one by accident.

**`MyHRPage.tsx` is a different screen, not covered here.** Route `/my-hr`, reached via the **My
HR** button in the HR header, is the **employee self-service** side — Overview, My Attendance, My
Leave, My Payslips, My Documents, Requests — where any staff member (including you) looks up their
*own* attendance, leave balance, and payslips, and submits their own leave/overtime/regularization/
shift-swap requests. This manual is about *administering* HR for the whole hospital
(`HRPage.tsx`), not about using your own self-service page. The two do not overlap in what they
let you do — `MyHRPage.tsx` has no administrative actions, and `HRPage.tsx`'s tabs are not where
you'd look up your own payslip.

---

## What this role does in the system

Open **HR** from the main menu. The header shows live KPI pills — **Staff count**, **Present**,
**Leave**, and, when non-zero, **License Alerts**, **Privilege Reviews**, and **Training
Overdue** — plus a **My HR** button (jumps to your own self-service page) and a **+ Add Staff**
button (navigates to `/settings/staff`, not a tab on this page). A left-hand nav groups every tab
under five headers: **Workforce, Payroll, Compliance, Talent Lifecycle**, and an ungrouped
**Reports** entry.

Your day-to-day work is:
- Marking and reviewing daily **Attendance**, including biometric import and regularization
  approvals.
- Approving or rejecting **Leave** requests and watching each staff member's leave balance.
- Running the monthly **Payroll (PF/ESI/TDS)** engine — computing and processing payslips.
- Printing payslips and pulling statutory exports (EPF ECR, Form 16/16A) from **Payroll
  (History)**, which is the record of past runs, not where new payroll is run.

---

## 1. Mark and review attendance

1. Click **Attendance** in the left nav (under **Workforce**). Three view-toggle buttons at the
   top: **List**, **Calendar**, **Approvals**. You land on **List**.
2. On **List**, pick a date (date-picker button, defaults to today) and optionally a department
   filter. The table shows every active staff member: **Staff, Role, Dept, Shift, In, Out, Hours,
   Status**.
3. Click the **Status** dropdown on any row to mark that person **Present / Absent / Half Day /
   Late / On Leave / Holiday** (the exact option list comes from your hospital's configured
   attendance-status list) for the selected date.
4. If most of the hospital showed up, click **Mark All Present** (top right) to mark everyone who
   has no status yet — this does not overwrite anyone already marked.
5. Click **Import CSV** to bulk-load attendance from a biometric device export. Paste or upload a
   file with columns **Name, Date, In Time, Out Time** (dates as `YYYY-MM-DD` or `DD/MM/YYYY`,
   times as `HH:MM`). The preview table shows which rows matched a real staff name (✓) and which
   didn't (✗ no match — these are skipped). Click **Import N rows**.
6. Click **Export** to download the currently filtered list as CSV.
7. Switch to the **Calendar** view-toggle for a month-at-a-glance view, or **Approvals** to review
   attendance **regularization requests** — a staff member disputing a wrongly-marked day (these
   originate from their own `MyHRPage.tsx` **Requests** section) — and approve or reject each one.

## 2. Approve leave and check a staff member's balance

1. Click **Leave Management** in the left nav.
2. The left panel is a request queue, filterable by **pending / approved / rejected / all** chips.
   Each request card shows the staff member, leave type, date range, day count, and reason.
3. On a **pending** request, click **Approve** or **Reject**. Approving a request:
   - Updates the staff member's leave balance for that leave type (casual/sick/earned) for the
     year.
   - Automatically marks every date in that leave range as **on_leave** in Attendance — but only
     on dates that are currently unmarked or already `on_leave`; it will never silently overwrite
     a day someone already marked present or absent.
   - Rejecting a request that was previously approved removes those auto-created `on_leave`
     attendance rows again.
4. Rejecting opens a **Rejection Reason** box — type the reason and click **Reject** to confirm.
5. The right panel lets you pick any staff member from the **Select staff to view balance**
   dropdown to see their **Leave Balance** for the current year: Casual, Sick, and Earned Leave
   bars (used/total), plus a comp-off balance if they have one.
6. Click **Apply Leave for Staff** (top right of the balance panel) to log a leave request on
   someone's behalf — pick the staff member, leave type, date range, and reason, then **Submit**.
   Selecting **Maternity** as the leave type shows the Maternity Benefit Act, 1961 entitlement
   (26 weeks, or 12 weeks / 84 days if the staff member already has 2 or more surviving children)
   and blocks a request that would exceed what's left for the year.

## 3. Run monthly payroll — Payroll (PF/ESI/TDS)

This is the live payroll engine — salary structures through to PF/ESI/TDS payslips and the
general-ledger posting. A banner on screen states this plainly: *"Canonical payroll engine —
salary structures → PF/ESI/TDS payslips, Form 16/16A, EPF ECR, and GL posting on approval. (The
legacy Payroll tab is now read-only history.)"*

1. Click **Payroll (PF/ESI/TDS)** in the left nav (under **Payroll**).
2. If a staff member doesn't have a salary structure assigned yet, click **Salary Setup** first —
   this opens the template/assignment screen where a salary structure (basic %, HRA %, DA %, fixed
   TA, medical allowance, PT state) is created and then assigned to a staff member with their
   monthly gross, PAN, PF account number, ESI IP number, and bank details. Payroll cannot compute
   for anyone without an assignment — the staff list on this tab only shows people who have one.
3. Pick the **Month** and **Year** at the top.
4. Click **Compute Payslips**. This pulls each staff member's attendance for the month (paid
   leaves, loss-of-pay days, overtime hours) and calculates their payslip in memory — nothing is
   saved yet. Four summary cards appear: **Total Gross, Total Net Pay, PF (Emp + Employer), TDS
   This Month**.
5. Click any staff row to expand it — you can override **Present Days**, **Paid Leaves**, and
   **LOP Days** for that person specifically before saving, if their attendance record needs a
   manual correction for payroll purposes only.
6. Click **Payslip** on any expanded/computed row to print that one person's payslip immediately,
   before processing the whole run, if you need to sanity-check it.
7. Once you're satisfied, click **Process & Save** — this is the step that actually writes the
   `payroll_runs` and `payslips` records. A toast confirms: *"Payroll processed for [Month] [Year]
   ✓"*.
8. Click **Export CSV** to download the full computed run (one row per staff member, every
   earnings/deduction column) at any point after computing.
9. A **Gratuity** calculator is available on this tab for anyone with 5+ years of completed
   service — enter their service dates and last basic salary; it computes
   `(Last Basic × 15/26) × completed years` per the Payment of Gratuity Act, 1972, and can print a
   signed certificate.

Processing a run does **not** post it to the general ledger yet — that happens when the run is
**approved** (an `approveRun` action available once the run shows as **processed**, which posts
Salaries (debit) against Net Salary Payable and Statutory Deductions Payable (credit) as a single
balanced journal entry). Depending on your hospital's permission setup, approval may be a step you
do yourself or one a supervisor does from the run list.

## 4. Payslip history and statutory exports — Payroll (History)

1. Click **Payroll (History)** in the left nav.
2. An amber banner at the top states: *"Retired engine — read-only history. New payroll is now
   processed in the Payroll Run (PF/ESI/TDS) tab (proper TDS + salary structures + GL posting).
   Past runs below remain viewable and exportable."* The **Run Payroll (retired)** button on this
   tab is permanently disabled — do not go looking for a working "run payroll" action here; use
   Section 3 above instead.
3. The table lists every historical payroll run — **Month, Staff, Gross, Deductions, Net,
   Status** — with per-run actions:
   - **View** — opens the full payslip list for that run.
   - **PDF** — downloads the payroll register as a PDF.
   - **ECR** — generates an EPF ECR file formatted for the EPFO portal.
   - **16A** — generates the quarterly Form 16A TDS certificate for consultants, for that run's
     financial-year quarter.
   - **Approve** — appears only while a run's status is still **processed** (older runs created
     before the current engine).
4. Any run processed through the current **Payroll (PF/ESI/TDS)** tab (Section 3) also shows up
   here for viewing/export — this tab is the shared historical record for both the old and current
   payroll engines, even though only the current one can create new runs.

## 5. Everything else on this page — orientation only, not covered

These tabs exist on `HRPage.tsx` but are scoped out of this manual as HR-manager/compliance-officer
work rather than daily Payroll/HR-staff duties:

- **Workforce:** Staff Directory, Roster — staff records and duty-roster scheduling.
- **Payroll:** Payroll Integrations — connecting to an external payroll/banking system.
- **Compliance:** Credentials, Expiring Credentials, Privileges, Training & CME, Training
  Compliance, Injury Register, Second Victim Support, Occupational Health, Burnout Risk Monitor,
  Performance Appraisals — clinical credentialing, training records, and staff-wellbeing tracking.
- **Talent Lifecycle:** Recruitment, Exit & Full-and-Final, Disciplinary & Grievance, Document
  Vault — hiring, offboarding, and disciplinary case management.
- **Reports** — HR-wide reporting across all of the above.

If your hospital's go-live plan expects day-to-day Payroll/HR staff to also own any of these,
flag it rather than assuming this file already covers it — ask for that section to be written as
its own piece of work, the same way front-desk.md etc. were scoped per role.

---

## Access control — confirmed against `src/lib/routeRoles.ts`

Re-checked directly against the current file (not carried over from memory):

```
Line 17: ROUTE_ROLES['/hr'] = ['hr_manager', 'super_admin', 'hospital_admin'];
```

This is accurate as of this writing. **The only non-admin login role that can reach `/hr` at all
is `hr_manager`.** There is no distinct lower-tier `payroll_clerk` or `hr_staff` login role today —
"HR / Payroll Staff" as a job title does not have its own dedicated role the way, say, `nurse` or
`pharmacist` does.

This is the same pattern Phase 2 flagged for radiology-technician/ward-clerk/OT-staff: **the
training content in this file is accurate to the screens** — everything in Sections 1–4 is real
and reachable once logged in — **but the job title in this file's name doesn't have its own
login.** Anyone doing this job today logs in as `hr_manager` (or an admin role). This is a
product/role-model gap for Nikhil/Vikram to sequence as a follow-up — introducing a scoped-down
`payroll_clerk`/`hr_staff` role with access to only Attendance/Leave/Payroll and not Compliance/
Talent-Lifecycle, if the hospital wants that separation enforced by login rather than by this
manual's own written scoping in Section 5 — not something this documentation effort can fix by
itself.

`/my-hr` (`MyHRPage.tsx`, the self-service side described above) is in the app's `coreRoutes` list
in `src/lib/routeRoles.ts` (`hasAccess`, line 168) — every authenticated user, of any role, can
reach their own self-service page regardless of what the table above says about `/hr`.

---

## Quick reference — tab names as they actually appear on screen

| What this file covers | What you'll actually see on screen |
|---|---|
| Attendance | **Attendance** (under Workforce) — List / Calendar / Approvals toggle |
| Leave Management | **Leave Management** (under Workforce) |
| Payroll run | **Payroll (PF/ESI/TDS)** (under Payroll) — the live engine |
| Payroll history | **Payroll (History)** (under Payroll) — read-only, "Run Payroll" disabled |
| Your own payslip/leave/attendance | Not on this page — click **My HR** to go to `/my-hr` |
