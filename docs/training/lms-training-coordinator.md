# LMS / Training Coordinator — Training Manual

**Module:** Staff Training / LMS (`src/pages/lms/LMSPage.tsx`)
**Owner:** Usha (LMS & Staff Training)
**Screen:** **🎓 Staff Training / LMS** in the main menu — route `/lms`

## What this file is (and isn't)

This file is instructions for *using one screen*: the in-product Staff Training / LMS module at
`/lms`. It is not, itself, the training manual — `docs/training/` as a whole (31 other files plus
this one) is the training manual, and it is read *outside* this screen, usually before a new
employee ever logs in.

The two are easy to confuse because they're about the same subject (staff training) but they do
different jobs:

- **`docs/training/` (this whole directory)** is plain-English, click-by-click documentation that a
  human reads — in a induction session, printed, or on a second monitor — to learn how to do a job
  in Aumrti HMS. It has no login, no quiz, no pass/fail score, and issues no certificate.
- **The in-product LMS (`/lms`, this file's subject)** is a live, logged-in screen inside the HMS
  itself, where staff complete assigned courses, sit a quiz, and are issued a certificate the
  software tracks for NABH evidence — and where HR/the Training Coordinator enrols staff, authors
  courses and quiz questions, and chases down who's overdue.

If you are new and someone handed you a role file from this folder to read before your first
shift, you are using the training manual. If you have just been assigned a course and need to log
in and complete it, you are using the in-product LMS — keep reading.

## What this role does in the system

There is one screen, two different things it shows you, switched by a single button in the header
— not two separate logins:

- **👤 Staff View** (the default, no `?admin=true` in the address bar) — "Hello, `<Your Name>`",
  your own assigned courses, a quiz for each, and your own certificates. **Every member of staff
  who can reach this screen lands here.**
- **👨‍💼 Admin View** (`?admin=true`) — a toolbar with **Bulk Enrol**, **Add Course**, **Add
  Questions**, a hospital-wide **Compliance Heatmap**, and an **Overdue Staff** chase list. This is
  the Training Coordinator's workspace.

> **Access control — fixed.** Previously, `/lms` was gated to exactly `hr_manager`, `super_admin`,
> `hospital_admin` — no other login, including a Doctor or Nurse, could open the page at all, not
> even to take their own assigned "Hand Hygiene & Infection Control" or "Fire Safety & Evacuation"
> course, unless a Hospital Admin had separately granted them a permission-matrix override. That
> override was also the only gate on Admin View (Bulk Enrol, Add Course, Add Questions) — once
> cleared, Staff View and Admin View were the same unprotected screen with no further check.
>
> **The fix:** `/lms` now sits in `hasAccess()`'s `coreRoutes` list (`src/lib/routeRoles.ts`), the
> same mechanism that already lets every authenticated login reach `/dashboard` and `/inbox` — so
> any Doctor, Nurse, Pharmacist, Lab Tech, or Receptionist can now open Staff View directly and see
> their own assigned training, with the **🎓 Staff Training / LMS** tile appearing in their sidebar
> automatically. Admin View did **not** get the same widening: a new `hasLmsAdminAccess()` function
> reproduces the original `hr_manager`/`super_admin`/`hospital_admin`-or-permission-grant check, and
> the page's `isAdmin` flag now requires both `?admin=true` in the URL **and** that check passing —
> so Bulk Enrol, Add Course, and Add Questions stay restricted exactly as before, while everyone
> can now reach their own courses with zero admin configuration.
>
> **On "Training Coordinator" as a job title** — there is still no role string by that name, and
> none is needed: a Hospital Admin who wants a dedicated coordinator login (rather than using an
> `hr_manager` login) should grant that person the permission-matrix override for **view+manage**
> on **🎓 Staff Training / LMS**, which `hasLmsAdminAccess()` still honours exactly as the original
> gate did.

---

## 1. 👤 Staff View — your own assigned courses

This is what you land on when you open **Staff Training** without Admin View switched on.

1. The header reads **"Hello, `<Your Name>`"**, followed by three stat tiles: **Completed**,
   **Due Soon** (due within 30 days), **Overdue** (past the due date, or your enrolment's own status
   is already `expired`).
2. Below that, four filter tabs: **All**, **Pending**, **Completed**, **Expired**.
   - **Pending** shows only courses still `enrolled` or `in_progress`.
   - **Completed** shows only courses you've passed.
   - **Expired** shows courses whose validity window has lapsed *and* any course you've run out of
     attempts on (badged **"Max attempts reached"**) — both land here, not just true expiries, so
     if a course you failed three times has disappeared from **Pending**, look under **Expired**.
3. Each course in the list shows its name, a category badge (e.g. "mandatory annual", "clinical",
   "safety" — shown exactly as stored, lower-case with underscores turned to spaces), its duration
   in minutes, and a due date (if one was set) as `DD/MM/YYYY`. On the right, one of:
   - **Completed** courses: a green **"✅ Completed `DD/MM/YY`"** badge plus a **"Certificate"**
     button (download icon).
   - **Due soon** or **pending** courses: a **"Start Course →"** button (filled for due-soon,
     outlined for pending — same action either way).
   - **Overdue** courses: a red, pulsing **"❌ Start Now →"** button.
   - **Expired** courses: an amber-outlined **"🔄 Renew →"** button.
   - Courses you've exhausted all 3 attempts on: a red **"Max attempts reached"** badge — no
     button; you cannot retry it yourself. Contact your supervisor (or whoever has Admin Mode) to
     be re-enrolled.
4. If nothing matches your filter, you'll see **"No courses found"**. If you have no courses at all
   assigned to you yet, that's the Training Coordinator's job to fix via **Bulk Enrol** (Section 5)
   — you cannot enrol yourself in anything from this screen.

---

## 2. Taking a course — the quiz

Click **"Start Course →"**, **"❌ Start Now →"**, or **"🔄 Renew →"** on any course to open the quiz
window. This works identically whether you're in Staff View taking your own course or Admin Mode
(the quiz always runs against your own enrolment — Admin Mode has no "take a quiz on someone
else's behalf" button).

1. **Intro screen** shows the course name, its description, duration in minutes, **"📝 `<N>`
   questions"**, and **"🎯 Pass: `<passing_score>`%"** — this is the course's actual
   `passing_score` column, not a fixed house number; it is whatever the Training Coordinator set
   when the course was created (Section 6). If you've attempted this course before, you'll also see
   **"Attempts used: `<N>`/3"**. Click **"Begin Quiz →"**.
   - If the course has no quiz questions loaded yet, you'll see a toast — **"No quiz questions
     available for this course yet."** — and nothing opens. This means whoever authored the course
     hasn't used **Add Questions** (Section 7) yet; it is not something you can fix from here.
   - If you've already used all 3 attempts and not passed, clicking Start at all shows **"Maximum
     attempts reached. Contact your supervisor."** instead of opening the quiz.
2. **Quiz screen** shows **"Question `<N>` of `<total>`"** with a progress bar, the question text,
   and its options lettered **A., B., C.** (etc.) as clickable rows. You must select an option
   before **"Next →"** becomes clickable; **"← Previous"** is disabled on the first question. On
   the last question the button reads **"Submit"** (or **"Submitting..."** while it saves).
3. **Results screen** shows your score as a large percentage.
   - **Pass** (score ≥ the course's `passing_score`): **"✅ Passed!"**, **"You scored `<X>`% —
     required `<Y>`%"**, and a **"Download Certificate"** button. This opens the certificate screen
     (Section 3) — it does not download a file by itself; see the note in that section.
   - **Fail**: **"❌ Try Again"**, the same score line, and — if you still have attempts left — a
     **"🔄 Retry"** button, or, on your third failed attempt, **"Maximum attempts reached. Contact
     your supervisor."** with no retry option. Underneath, every question is shown again with your
     answer, the correct answer where you got it wrong, and the question's explanation text (prefixed
     **"💡"**) if one was written for it. **This answer review only appears when you fail** — if you
     pass, you go straight to the certificate with no review of the questions.

A pass is logged as NABH evidence automatically (`logNABHEvidence`, code **HRM.6**) — you don't need
to do anything extra for the compliance record; this happens the moment you pass, in the background.

---

## 3. Your certificate

Click **"Certificate"** on a completed course in Staff View, or **"Download Certificate"** right
after passing a quiz. A **"Certificate of Completion"** window opens showing: your name, your role,
the course name, **Date: `DD/MM/YYYY`** (the day you passed), **Valid until: `DD/MM/YYYY`** (or
**"Lifetime"** if the course has no validity period), **Certificate No:** a generated number in the
form `CERT-HMS-<year>-<6 digits>`, and a **"NABH Compliant Training"** footer line.

The only button here is **"Print Certificate"** — it opens your browser's print dialog with the
certificate formatted for A4 landscape. **There is no separate file-download button**: despite the
Staff View button being labelled "Certificate" with a download icon, and the quiz-results button
being labelled "Download Certificate", neither actually saves a file — both just open this same
print-ready screen. If you want a PDF copy rather than a paper printout, choose "Save as PDF" (or
your browser/printer's equivalent) in the print dialog that opens.

---

## 4. 👨‍💼 Admin View — the Training Coordinator's workspace

Click **"👨‍💼 Admin View"** in the header (switches you to Admin Mode is one click away for anyone
who can open this page at all — see the access-control note above). You'll see an **"Admin View"**
badge next to the page title, and the button now reads **"👤 Staff View"** to switch back.

1. **Toolbar** — three buttons: **"Bulk Enrol"**, **"Add Course"**, **"Add Questions"** (Sections
   5–7).
2. **📊 Compliance Heatmap** — a table with one row per department and one column per *mandatory*
   course (any category starting "mandatory"; clinical/administrative/safety/compliance/custom
   courses don't appear here). Each cell shows the percentage of that department's staff who have
   completed that course — colour-coded green (≥80%), amber (≥60%), red (any completion below
   60%), or a darker red with **"—"** if nobody in that department is even enrolled. Click any cell
   to open a detail popup listing every staff member in that department against that course, with
   their status, completion date, and score.
3. **❌ Overdue Staff (`<count>`)** — a table of every enrolment whose due date has passed and
   isn't completed, sorted worst-first by days overdue, showing Staff, Course, Due Date
   (`DD/MM/YYYY`), Days Overdue, and a **"Remind"** button. **Only the 20 most-overdue rows are
   shown** — if more than 20 staff are overdue, there is no page-2 or "show more" to reach the rest
   from this screen (flagged below). If nobody is overdue, you'll see **"No overdue training. ✅"**.
   Clicking **"Remind"** opens WhatsApp Web/App with a pre-written message ("Dear `<name>`, your
   "`<course>`" training is overdue. Please log in to the HMS LMS and complete it. This is mandatory
   for NABH compliance.") already typed in — **but with no recipient phone number attached**, since
   the system doesn't hold a staff phone number anywhere in this module. You still have to pick the
   right contact yourself in WhatsApp before sending.

---

## 5. Admin — Bulk Enrol Staff

1. Click **"Bulk Enrol"**.
2. **Course** — a dropdown of every active course (the 10 seeded NABH courses plus any you've
   added via Section 6).
3. **Enrol** — choose **All Staff**, **By Role**, or **By Department**.
   - **By Role** shows a free-text box labelled **"Role (e.g. nurse)"** — you must type the exact
     internal role string (lower-case, e.g. `nurse`, `doctor`, `hr_manager`), not the label shown
     elsewhere in the app. Get the spelling or case wrong and the system does **not** tell you no
     one matched — it silently enrols zero people and shows the same **"All staff already
     enrolled"** success-looking message it would show if everyone really was already enrolled.
     There is no way from this message alone to tell the two situations apart. Flagged below.
   - **By Department** is a proper dropdown of your hospital's departments — no typing risk there.
4. **Due Date** — optional date picker.
5. Click **"Enrol Staff"**. Staff already enrolled in that course are skipped automatically — you
   can re-run this safely without double-enrolling anyone.

---

## 6. Admin — Add Custom Course

1. Click **"Add Course"**.
2. **Course Name**.
3. **Category** — dropdown: mandatory annual, mandatory biannual, mandatory once, clinical,
   administrative, safety, compliance, custom (shown lower-case with spaces, not Title Case; defaults
   to **custom**).
4. **Duration (min)** and **Pass Score (%)** side by side (defaults 30 minutes / 80%). The Pass
   Score you set here is exactly the number shown to learners as **"🎯 Pass: X%"** on the quiz
   intro screen and used to decide pass/fail — there is no separate, hidden threshold anywhere
   else.
5. **Validity (months, 0=lifetime)** — defaults to 12; enter 0 for a certificate that never expires.
6. **Target Roles (comma-separated)** — e.g. `nurse, doctor`. **This field is saved but never acted
   on anywhere else in the module** — it does not pre-fill or restrict the "By Role" field in Bulk
   Enrol, and it isn't shown anywhere on the course list or heatmap. Flagged below.
7. **Description** — shown to learners on the quiz intro screen.
8. Click **"Create Course"**. The course gets an auto-generated code (`CUST-<random>`) and is
   immediately available for Bulk Enrol and Add Questions.

A course has no quiz questions until you add them — see Section 7 next; a freshly created course
cannot be started by anyone yet.

---

## 7. Admin — Add Quiz Question

1. Click **"Add Questions"**.
2. **Course** — select which course this question belongs to.
3. **Question** — the question text.
4. **Type** — **MCQ** (4 options) or **True/False** (2 fixed options, pre-filled "True"/"False" with
   their text locked — you can still change *which one* is marked correct, just not their wording).
5. **Options (click radio to mark correct)** — type each option's text and click the radio button
   next to the one correct answer. At least one option must have text and be marked correct, or
   **"Add Question"** will reject it.
6. **Explanation (shown after answering)** — optional; shown to a learner only if they fail and
   review their answers (Section 2).
7. Click **"Add Question"**. The form clears and **stays open** with the same course still
   selected — this is deliberate, so you can add several questions to one course back-to-back
   without re-selecting it each time. Close the window yourself (click outside it, or its corner
   control) once you're done adding questions for that course.

---

## Flagged, not fixed, this phase

Per the discipline every prior phase has held to, nothing below was changed — each is described
exactly as the code behaves, for the next person who picks this up:

- **The Staff View/Admin View split is a one-click UI toggle, not an access boundary** (detailed in
  the access-control note above) — anyone whose login can open `/lms` at all can run the entire
  Training Coordinator workflow, including creating courses and quiz questions and bulk-enrolling
  staff, whether or not that was the intent of granting them access to take their own training.
- **Renewing a lapsed course can leave the wrong certificate on file.** `submitQuiz`
  (`LMSPage.tsx` lines 247–321) inserts a **new** row into `lms_certificates` every time a quiz is
  passed, including on a **"🔄 Renew →"** retake of an already-expired course — there is no update
  to, or replacement of, the earlier certificate row for that same enrolment, and the table has no
  uniqueness constraint on `enrollment_id`. `openCertificate`'s lookup
  (`certificates.find(c => c.enrollment_id === enrollment.id)`, line 326) returns whichever
  certificate comes first in the loaded array, which is not guaranteed to be the most recently
  issued one — a staff member who renews could be shown their old, already-expired certificate
  instead of the new one.
- **A failed certificate or enrolment-status write is silent.** Neither the `lms_certificates`
  insert (line 297) nor the `lms_enrollments` update (line 315) in `submitQuiz` checks the `error`
  Supabase returns. If either write fails for a learner who just passed, they still see "✅
  Passed!" and are sent to "Download Certificate" — only to hit **"Certificate not found"**
  moments later with no explanation of why.
- **Bulk Enrol's "By Role" field is free text with no validation** (Section 5) — a mis-typed or
  mis-cased role string silently enrols nobody, with the same "All staff already enrolled" message
  a genuinely-complete enrolment would show.
- **"Target Roles" on a course is write-only** — collected on **Add Course** (Section 6) but never
  read anywhere else in this file to filter, suggest, or restrict anything.
- **Overdue Staff is hard-capped at the 20 worst rows** (`overdueStaff.slice(0, 20)`, line 703) —
  if a hospital has more than 20 overdue enrolments at once, there is no way to see or remind the
  rest from this screen.

No files under `src/pages/lms/` or `src/components/lms/` were modified in writing this file.
