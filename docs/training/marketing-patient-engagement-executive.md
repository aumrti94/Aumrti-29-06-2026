# Marketing / Patient Engagement Executive — Training Manual

## What this role does in the system

As a Marketing / Patient Engagement Executive, you work in one module: **CRM & Marketing**. On
screen its header reads **"📣 CRM & Patient Acquisition"** (the module catalogue calls it "CRM &
Marketing" — both names refer to the same single screen, you will only ever see the header text).
It opens on **👨‍⚕️ Referrals**, and from there you can also reach **📣 Campaigns**, **⭐ Reviews**,
**👥 Segments**, and **📊 Analytics**. This manual assumes you have never used hospital software
before.

> **Access check — the custom-role step is mandatory, with no fallback login.** The `/crm` route
> carries no override in `src/lib/routeRoles.ts`, so it inherits its allowed-roles list straight
> from the module catalogue (`src/lib/modules.ts`, line 100): **marketing**, **hospital_admin**,
> **super_admin**. "Marketing" is **not** one of the 7 role cards that ship by default on
> **Settings → Staff Members → Add Staff Member** (`src/pages/settings/SettingsStaffPage.tsx`,
> `DEFAULT_ROLE_CARDS`, lines 85–92: only Doctor, Nurse, Billing, Pharmacist, Lab Tech, Reception,
> Admin/CEO). To get a login that can open this module, a Hospital Admin must first create a
> **custom role** on **Settings → Roles & Permissions**: typing a free-text label slugifies it
> into the exact snake_case key the route guard expects
> (`src/pages/settings/SettingsRolesPage.tsx`, `slugifyRoleName`, lines 44–46, used at
> role-creation time around line 326) — typing "Marketing" produces exactly `marketing`
> (`"Marketing".trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")` →
> `"marketing"`), confirmed by tracing the function rather than assumed. This works correctly
> today — it is a one-time admin-configuration step, not a product gap. **Unlike Dietitian or
> Physiotherapist in Phase 5/7, there is no fallback role on this module at all** — `/crm`'s role
> list has no `doctor` (or any other default-card role) on it, so an existing Doctor, Nurse, or
> Receptionist login cannot open this module under any circumstance. Every Marketing Executive
> login needs the custom-role step, with no exception.

> **A second, separate finding: this job title, as commonly described, spans two modules that do
> not share a single login.** If your hospital describes this role as covering "CRM, patient
> engagement campaigns, **and** health package sales," be aware that health package *sales and
> booking* is not part of this module at all — it lives in a completely different module, **Health
> Packages** (route `/packages`, roles `["receptionist", "doctor", "super_admin"]`,
> `src/lib/modules.ts` line 45), documented in
> [health-packages-coordinator.md](./health-packages-coordinator.md). The `marketing` role is not
> on `/packages`'s role list, and neither `receptionist` nor `doctor` is on `/crm`'s role list — the
> only role string the two modules share is `super_admin`, which bypasses role checks everywhere
> and so is not a real overlap for day-to-day work. In practice: a Marketing Executive login cannot
> open Health Packages, and a Receptionist or Doctor working Health Packages has no CRM & Marketing
> screen surfaced to them either. If your hospital runs this as one combined job, the person doing
> it needs **two** logins (or a custom role added to both route lists), and should read
> [health-packages-coordinator.md](./health-packages-coordinator.md) for the package-sales half of
> the job — it is not repeated here. This is the same shape of finding as Phase 4's
> "no single role covers Accountant / Insurance-TPA as one job title."

All dates on screen show as DD/MM/YYYY. All money shows as ₹.

---

## 1. 👨‍⚕️ Referrals — your referring-doctor relationships

This tab opens as a two-pane screen: a searchable list of referral doctors on the left, their full
profile on the right.

1. Use the **"Search doctors..."** box to find a doctor by name or specialty, or filter by tier
   using the **All / Platinum / Gold / Silver** buttons above the list.
2. Click any doctor's row to open their profile on the right: specialty, qualification, clinic,
   phone/email/city, their relationship tier badge, and four metric tiles — **Total Referrals**,
   **Total Revenue**, **Avg / Referral**, and **Last Referral** (DD/MM/YYYY).
3. Click **"Send Thank-You"** to open WhatsApp Web with a pre-filled thank-you message addressed to
   that doctor — review it before sending, same as any pre-filled message in this system.
4. Click **"Edit Doctor"** to correct any of their details.

### Adding a new referral doctor

1. Click **"Add Referral Doctor"** in the header (top right).
2. The dialogue opens in **search mode first** — type the doctor's name, phone, or specialty. If
   they already exist in the list, click their row to select them instead of creating a duplicate.
3. If they are genuinely new, click **"Add New Referral Doctor"** to switch to the entry form.
4. Fill in **Doctor Name \*** and **Phone \*** (both required), plus Specialty, Qualification,
   Clinic / Hospital, Email, City, Address, and Notes as you have them.
5. Click **"Save"**.

> This button may not be visible to you — it is wrapped in a per-hospital permission gate
> (`GatedAction module="crm" action="add_referral_doctor"`), so your hospital admin can hide it for
> your role even though you can see the rest of the module.

---

## 2. 📣 Campaigns — running a marketing campaign

Each campaign shows as a card: its name, type badge, status badge (draft/active), its target
segment and date range, and four figures — **Reach**, **Conversions**, **Revenue**, **ROI%**.

### Creating a campaign

1. Click **"New Campaign"** in the header.
2. **Campaign Name \*** — required.
3. **Type** — choose one of: Health Camp, Whatsapp Blast, Sms, Email, Social Media, Referral
   Program, Corporate, Seasonal.
4. **Target Segment** — pick one of your hospital's patient segments (Section 4).
5. **Start Date** / **End Date**.
6. **Budget ₹**.
7. **Message Template** — the text that will go out to patients in this segment. You can use the
   placeholders `{patient_name}`, `{hospital_name}`, `{phone}`, and `{condition}` inside it; they
   get filled in per patient when the campaign actually sends.
8. Click **"Save Campaign"**. It saves as **draft** — it has not gone out to anyone yet.
9. To actually run it, find the campaign's card on this tab and click **"▶ Run"**. This only flips
   its status to active; it does not generate reach or conversion numbers on its own — those fields
   are filled in elsewhere as the campaign's real-world results come in.

> **Be precise about what "Health Camp" and "Corporate" campaign types mean here.** These two
> entries in the Type dropdown describe the *kind of outreach* this campaign is — e.g. a community
> health camp or a corporate-tie-up campaign — nothing more. Creating a campaign with Type =
> "Health Camp" does **not** book, schedule, or fulfil an actual health checkup package for any
> patient. Booking and running health packages is a completely separate system (Section above,
> and [health-packages-coordinator.md](./health-packages-coordinator.md)); do not confuse a
> marketing campaign that happens to be *about* health camps with the Health Packages module
> itself — they do not talk to each other.

> This button may not be visible to you either — it is wrapped in the same kind of per-hospital
> permission gate (`GatedAction module="crm" action="new_campaign"`).

---

## 3. ⭐ Reviews — tracking and responding to online reviews

The top of this tab shows your hospital's overall average rating out of 5, the review count, and a
per-platform average (Google, Practo, JustDial, Facebook, whichever platforms you have reviews
logged for).

### Logging a review someone left on an external platform

1. Click **"Add Review"**.
2. **Platform** — Google, Practo, Justdial, Facebook, or Other.
3. **Reviewer Name**, **Rating** (1–5 stars), **Review Text**, **Date**.
4. Click **"Save"**.

When you save, the system automatically tags the review **Positive**, **Negative**, or **Neutral**
using a simple keyword match — it checks the review text against a fixed list of positive words
(excellent, good, best, great, helpful, clean, fast, professional, wonderful, amazing) and negative
words (bad, worst, rude, dirty, slow, expensive, waiting, unprofessional, horrible, terrible) and
tags whichever side has more hits, or Neutral if it's a tie or no match. **This is a plain
keyword-count heuristic, not AI** — do not describe it to anyone as AI-generated sentiment; it will
mis-tag reviews that don't use any of those exact words (e.g. sarcasm, or a mixed review, or simply
different wording), so always glance at the tag against the actual text yourself.

### AI Analyse — a second, genuinely AI-powered sentiment check

Underneath any review's text, you'll see an **"AI Analyse"** button. Unlike the automatic tag above,
this one genuinely calls AI: click it and the system sends the review's rating and text to the AI
provider and gets back a structured read — which topics it mentions (e.g. waiting time, staff
behaviour, billing, cleanliness, clinical care, food, communication), which department is implicated,
how urgent it is, and whether it needs escalating. If the AI flags a review as needing escalation, it
automatically creates a grievance record for Patient Relations to follow up on, and shows you a
toast confirming that. Review what the AI surfaces — it is a draft read on the review, not a
guaranteed-correct classification, the same discipline every other AI-assisted feature in this
manual follows.

### Responding to a review with AI-drafted text

1. On any review that hasn't been responded to yet, click **"🤖 AI Response"**.
2. The system drafts a response for you using AI — it takes the review's rating, text, and
   reviewer name, and writes a short, professional, empathetic reply signed off as "[Your Hospital]
   Patient Care Team."
3. **Read the draft carefully before doing anything with it.** It is a starting point, not a
   finished reply — check it is factually fair, doesn't promise anything the hospital can't deliver,
   and matches how your hospital actually wants to sound. Edit the text in the box if needed.
4. Click **"Post Response"** to save it against the review (it will show under the review as the
   hospital's response), or **"Cancel"** to discard it without saving.

---

## 4. 👥 Segments — patient groups for targeting

This tab has two parts.

**Re-engagement Opportunities** (top): a table of patients who haven't visited in 90+ days, each
scored 0–100 on how likely they are to come back (a blend of how recently they visited, how often,
and how much they've spent) and labelled **High** (≥70), **Medium** (≥40), or **Low**. Click the
message icon next to any patient to open WhatsApp Web with a pre-filled re-engagement message to
that patient (review it before sending) — or click **"Run Campaign (N)"** to do this for every
High-scoring patient with a phone number on file, one WhatsApp tab at a time. Click **"Refresh"** to
re-score the list against today's data.

**Segment cards** (below): five default segments are created automatically the first time anyone
opens this tab if none exist yet — Chronic Disease Patients, Post-Discharge (30 days), Birthday
This Month, High-Value Patients, and Inactive Patients (6+ months) — each showing its patient count.
Click **"Create Campaign"** on any segment card to jump straight to the New Campaign form
(Section 2) with that targeting already in mind.

---

## 5. 📊 Analytics — orientation

A read-only reporting screen, nothing to click through step by step:

- **Top Referrers** — a bar chart of your top 20% of referring doctors by referral volume, with the
  heading itself stating what share of all referrals they represent (a Pareto view).
- **At-Risk Referrers** — doctors who referred more than 3 patients before but have gone quiet for
  60+ days; click **"Re-engage"** next to any of them for a pre-filled WhatsApp message (review
  before sending).
- **Patient Acquisition Sources** — a pie chart of where your patients are coming from.
- **Top Referring Doctors** — a bar chart repeating the referral-volume view from the Referrals tab.
- **Campaign ROI** — a table of every campaign's reach, conversions, revenue, cost, and ROI%.
- **Review Rating Trend** — a line chart of star ratings over time, oldest to newest.

---

## Content findings from writing this file

**One defect found and fixed, following the same discipline Phase 6/7 used for confident, narrow,
safe fixes.**

- **Reviews tab — fixed.** `src/pages/crm/CRMPage.tsx`'s review card rendered the review's text
  **twice** — two byte-identical `<p>` elements (one directly before, one directly after the
  `ReviewSentimentAnalyser` AI-analysis button), the second apparently left behind by a copy-paste.
  A reviewer reading this tab saw the same sentence twice under every review. Removed the duplicate
  `<p>`; the review text, AI-analyse control, and reviewer/date line now render once each, in the
  original order. Verified: `npx eslint src/pages/crm/CRMPage.tsx`, `npx tsc --noEmit`, and
  `npm run check:db-contract` all pass with no new findings (the only output from `check:db-contract`
  is the pre-existing, unrelated allowlisted/pending items already carried in the repo).

**Two things confirmed accurate, not defects, worth stating plainly for this reader:**

- The automatic sentiment tag saved on every new review (`classifySentiment` in `AddReviewModal`,
  `src/pages/crm/CRMPage.tsx`) is a fixed keyword-count heuristic, not AI — confirmed by reading the
  function; it contains no AI call. `generateAIResponse` (same file) and the "AI Analyse" button
  (`src/components/crm/ReviewSentimentAnalyser.tsx`) are the two genuinely AI-powered features in
  this module — both call `callAI` from `@/lib/aiProvider` — and both are documented above with the
  "review before trusting/posting" discipline this manual applies to every AI-assisted draft.
- The campaign-type list's `"health_camp"` and `"corporate"` options are campaign metadata only —
  confirmed by reading `NewCampaignModal`'s save handler, which writes only to `marketing_campaigns`
  and never touches any package-booking table. They do not overlap with the separate Health
  Packages booking/catalogue system, and the file says so explicitly to avoid conflating the two.

No other code defect in this module was confident and safe enough to fix within this pass. The two
"Add Referral Doctor" / "New Campaign" header buttons being conditionally hidden by a per-hospital
permission gate (`GatedAction`) is working-as-designed access control, not a defect, and is noted
above rather than flagged as one.
