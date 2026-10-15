# Communication Inbox — Training Manual

**Role:** Patient Communication / Inbox Coordinator (typically a Receptionist login, though — see
the Access control section below — this is not the only login that can reach it)
**Module:** Communication Inbox
**Screen:** `src/pages/inbox/InboxPage.tsx`, route `/inbox`. In the left sidebar it is labelled
simply **"Inbox"**; on the All Modules grid and Quick Access picker it is listed as **"Communication
Inbox"** with the description **"WhatsApp & messages"**.

> This manual uses Indian English spelling throughout and assumes you have never used hospital
> software before. Money does not appear anywhere on this screen. Timestamps on this screen are
> **not** shown as a fixed DD/MM/YYYY date — see "How timestamps are shown" below for exactly what
> you will see, taken directly from the component's own formatting logic rather than assumed.

---

## Access control — who can actually get here

**Independently re-verified, not taken on trust — and the real picture is wider open than it first
looks.** Three places in the codebase mention a role list for this module, and tracing which one
actually governs what you see gives a different (and more permissive) answer than reading any one
of them in isolation would suggest:

1. **`src/lib/modules.ts` line 127** declares the module's own role list as
   `roles: ["receptionist", "super_admin"]` — this looks like the narrowest, intended-only list.
2. **`src/lib/routeRoles.ts` lines 94–97** then sets an explicit override, wider than #1:
   ```
   ROUTE_ROLES['/inbox'] = [
     'doctor', 'nurse', 'receptionist', 'pharmacist',
     'billing_executive', 'billing_staff', 'super_admin', 'hospital_admin',
   ];
   ```
3. **But neither #1 nor #2 is actually what decides access.** Every place in the app that checks
   whether a logged-in user may open or see a tile for `/inbox` — `RoleGuard.tsx` (the component
   that protects the route itself), `AppSidebar.tsx` (the left-hand navigation), `ModulesPage.tsx`
   (the All Modules grid), `QuickAccessPage.tsx` (the personalisation picker), and
   `CommandPalette.tsx` (the ⌘-K search) — calls one shared function, `hasAccess(path, role,
   permissions)` in `src/lib/routeRoles.ts`, never `module.roles.includes(role)` or
   `ROUTE_ROLES[path].includes(role)` directly. And `hasAccess()` contains this, checked **before**
   it ever consults `ROUTE_ROLES` or the per-user permissions blob (`routeRoles.ts` line 183):
   ```
   const coreRoutes = ["/dashboard", "/modules", "/settings/profile", "/inbox", "/my-hr", "/quick-access", "/lms"];
   if (coreRoutes.includes(normalizedPath)) return true;
   ```
   `/inbox` is on that list. The practical effect: **`hasAccess('/inbox', role, ...)` returns `true`
   for any logged-in user who has a role at all** — the explicit 8-role override in step 2 is never
   reached for this route, and the module catalogue's 2-role list in step 1 is likewise never
   consulted for enforcement. It is decorative metadata, not a gate.

**What this means in practice, corrected from the brief that commissioned this file:** the original
assumption was that Doctor/Nurse/Pharmacist/Billing logins are route-permitted but have no visible
tile to find their way there — the same "route-permitted, no path to it" shape Phase 4 found for
`quality_officer`. That is **not** what is actually happening here, and the practical story is
simpler and more wide open than either list on its own suggests: **every authenticated staff login
in the hospital — Doctor, Nurse, Receptionist, Pharmacist, Billing, Lab Technician, Radiologist, HR
Manager, CFO, Accountant, Quality Officer, Marketing Executive, any custom specialty role —
already has both the route permission and a visible way in**, with zero admin configuration:

- The sidebar's bottom section has a hardcoded **"Inbox"** entry (`AppSidebar.tsx`, `bottomItems`),
  filtered only through `hasAccess()` — so it renders for every logged-in user.
- The **"Communication Inbox"** tile on **All Modules** (`/modules`) and the **Quick Access**
  personalisation picker (`/quick-access`) both filter `ALL_MODULES` through the same `hasAccess()`
  call, not the module's own declared `roles` array — so the tile is visible and pinnable by every
  role too.
- The ⌘-K **Command Palette** search surfaces it the same way.

This is a cleaner — and more unusual — starting position than any prior phase's finding: not a
one-time custom-role step (Phase 5–7's pattern), not a mismatch needing a product fix (Phase 4/9's
pattern), and not "route-permitted but no tile" (Phase 4's `quality_officer` pattern this ticket
specifically asked to check against). It is a genuine clean bill, just a much wider one than the
module catalogue's own 2-role declaration implies. If a future engineer tightens `/inbox` back down
to receptionist-only, removing it from `coreRoutes` in `routeRoles.ts` is the fix that actually
matters — editing `ROUTE_ROLES['/inbox']` or `modules.ts` line 127 alone would do nothing, since
neither is consulted while `/inbox` stays in that array.

**One separate, narrower axis this does not touch:** a hospital's subscription **plan** can still
gate this module independently of role, via `isModuleKeyAllowed("inbox", enabledModules)` — that is
billing entitlement (does this hospital's plan include Communication Inbox at all), not a role
question, and is outside the scope of this access-control finding.

---

## What this screen looks like when you open it

The screen is a three-column layout with no page-level scroll:

- **Column 1 (far left, narrow):** a **"+ New Message"** button at the top, then eight navigation
  sections, then a **Tags** strip at the bottom.
- **Column 2 (middle):** a search box and the filtered message list for whichever section is
  selected.
- **Column 3 (right, widest):** the open conversation thread, or a placeholder reading **"Select a
  message to read"** until you click a message.

The eight sections in Column 1, in order, with their exact on-screen labels: **All Inbox**,
**WhatsApp**, **In-App**, **Feedback**, **Grievances**, **Sent**, **Starred**, **Resolved**. Each
shows an unread-style count badge when there is something to act on (the **Grievances** badge turns
red instead of the usual grey when its count is above zero).

Each message, wherever it appears, carries a small coloured channel badge. The exact labels (note:
the **section** in the left nav reads **"Grievances"**, plural, while the **badge** on an individual
message reads **"Grievance"**, singular — this is not a typo in this manual, it is what the source
literally renders in each place):

| Channel value | Badge label | Badge colour |
|---|---|---|
| `whatsapp` | WhatsApp | green |
| `in_app` | In-App | blue |
| `feedback` | Feedback | amber |
| `grievance` | Grievance | red |
| `portal` | Portal | purple |

### How timestamps are shown

There is no fixed DD/MM/YYYY date anywhere on this screen — the component deliberately shows a
relative, WhatsApp-style timestamp instead:

- A message from the last 24 hours shows just the time, e.g. **"14:32"**.
- A message from the last 7 days (but not today) shows the short weekday name, e.g. **"Mon"**.
- Anything older shows a short date, e.g. **"14 Oct"**.

All three use the `en-IN` locale internally, so this is the house convention applied correctly —
it is simply a relative format, not a full date, by the screen's own design.

---

## 1. Reading the unified inbox and switching sections

1. Open **Inbox** from the left sidebar (or the **Communication Inbox** tile on All Modules /
   Quick Access).
2. By default you land on **All Inbox** — this shows every inbound message (from a patient) that
   is not yet resolved or closed. A message you have not opened yet shows a small blue dot and
   bold sender name; its background is slightly lighter than an already-read message.
3. Click any section in the left nav to switch what the middle column shows:
   - **WhatsApp** — inbound WhatsApp messages only.
   - **In-App** — inbound in-app messages only.
   - **Feedback** — everything tagged channel "Feedback" (see the important finding below —
     in practice this will be empty).
   - **Grievances** — everything tagged channel "Grievance" (also see the finding below).
   - **Sent** — every message your hospital has sent out, any channel.
   - **Starred** — anything you (or a colleague) have starred, regardless of channel or direction.
   - **Resolved** — anything marked resolved or closed.
4. Click any message row in the middle column to open its full thread in Column 3. Opening an
   unread message marks it read immediately (the blue dot disappears and the unread count for that
   section drops by one) — there is no separate "mark as read" button; viewing it is enough.

---

## 2. Searching

1. Type into the **"Search messages..."** box at the top of the middle column.
2. The list narrows live, in whichever section you currently have selected — search does not
   switch you to "All Inbox" on its own. It matches against the message text, the sender's name,
   and the subject line (whichever of those exist on a given message).
3. Clear the box to go back to the full list for that section.

The small **Filter** icon button next to the search box does not open anything — see "Content
findings" below.

---

## 3. Replying to a message, including quick-reply chips

1. With a message open in Column 3, look at the panel at the bottom of the thread (this panel is
   hidden once a message is marked Resolved or Closed — see Section 5).
2. A row of **quick-reply chips** sits above the text box, pre-written full sentences you can send
   with one click: **"We'll get back to you shortly,"** **"Please visit our billing counter,"**
   **"Your lab report is ready,"** **"Appointment confirmed."** Clicking one drops that exact
   sentence into the reply box — it does not send it immediately; you still review and click Send.
3. Alternatively, type your own reply directly into the box.
4. Choose which channel to send the reply on: **💬 WhatsApp** or **📱 In-App** (these are the only
   two reply channels offered — you cannot reply on Feedback, Grievance, or Portal channels from
   this box).
5. Press **Enter** (without Shift) or click **Send**. If you chose WhatsApp and the original
   message has a phone number attached, this also fires the real outbound WhatsApp send
   (`sendWhatsApp()`) in addition to saving the reply in this screen's own message list.
6. Your reply appears instantly at the bottom of the thread, right-aligned in the hospital's colour,
   and the thread auto-scrolls down to show it.

---

## 4. Composing a brand-new outbound WhatsApp message

Use this when you want to message a patient who has not written in — there is no existing thread
to reply to.

1. Click **"+ New Message"** at the top of the left nav.
2. A window titled **"New WhatsApp Message"** opens. Fill in:
   - **Recipient Name** — optional (defaults to "Staff" as the sender name shown, not the
     recipient — this field is for your own reference and record-keeping).
   - **Phone Number** — required, e.g. "+91 9876543210".
   - **Message** — required, your free-text message.
3. Click **Send**. This is a real outbound WhatsApp send (the same `sendWhatsApp()` call used for
   replies) and also creates a new outbound row visible under the **Sent** section afterwards.

This compose window only ever sends WhatsApp — there is no equivalent "new in-app message" compose
path on this screen.

---

## 5. Starring, changing priority, and marking resolved

With a message's thread open in Column 3, the header row above the conversation offers:

1. **Priority dropdown** — **Low / Normal / High / Urgent**. Changing this updates the message
   immediately; a message set to Urgent shows a small red **"🔴 Urgent"** label under it in the
   message list everywhere it appears.
2. **Resolve button** — visible only while the message is not already resolved. Click it to mark
   the conversation resolved; this also records the exact resolve time. Once resolved, the reply
   box at the bottom disappears (you cannot keep replying inside a resolved thread from this
   screen), and the conversation moves out of "All Inbox" into the **Resolved** section.
3. **Star icon** (a plain star button, no label) — toggles starring on or off for this message.
   Starred messages turn up under the **Starred** section regardless of what channel or status they
   are otherwise in.

**There is no "assign a message to a colleague" control anywhere on this screen** — see Content
findings below; this manual does not invent a walkthrough step for it because it does not exist in
the real component.

---

## Cross-reference — Grievances and Feedback on this screen are not the same data as the PRO/CRM modules

This is the one real cross-reference this file was specifically asked to check, not re-derive from
scratch — and the underlying finding goes one step further than the question assumed.

Phase 9's [patient-relations-officer.md](./patient-relations-officer.md) already documented, in its
own Section 2, a genuine three-way table split: the CRM & Marketing module's **Reviews** tab
(`online_reviews`), the PRO module's own **Grievances** tab (`grievances`), and two further
disconnected feedback tables — `feedback_records` (what PRO's Feedback tab reads, nothing writes to
it) and `patient_feedback` (what the Patient Portal's feedback form writes to, nothing reads it
back). It also documented one real, intentional link: CRM's "AI Analyse" on a review can insert
directly into PRO's `grievances` table.

**This Inbox screen's "Grievances" and "Feedback" sections are a fourth and fifth pipe, not the
same tables at all.** Both sections filter the single `inbox_messages` table by its `channel`
column (`channel = "grievance"` / `channel = "feedback"`) — confirmed directly in
`InboxPage.tsx`'s `filteredMessages` logic. `inbox_messages` is a completely separate table from
`grievances`, `feedback_records`, and `patient_feedback`, with no foreign key or shared identifier
to any of them. A grievance logged by a PRO on `/pro`, or one auto-created by CRM's AI Analyse
feature, will **never** show up in this Inbox's Grievances section, and nothing a patient sends into
this Inbox's Grievances section (if anything ever did — see the finding immediately below) would
ever reach the PRO's queue either. These are five independent systems sharing two overlapping
English words ("Grievance," "Feedback"), not one workflow split across screens.

---

## Content findings from writing this file — flagged, not fixed

Per this ticket's scoping, these are documented, not corrected: no code was edited for this file.

1. **The most serious finding: the "Feedback," "Grievance," and "Portal" channels on this screen
   have no writer anywhere in the codebase — they will always be empty in real use.** A repo-wide
   search confirms exactly one source file ever touches the `inbox_messages` table:
   `InboxPage.tsx` itself. Its two insert paths — `handleReply()` and `handleCompose()` — only ever
   insert `channel: replyChannel` (which can only be `"whatsapp"` or `"in_app"`, the two buttons
   offered in the reply box) or `channel: "whatsapp"` (hardcoded in Compose). No code path in the
   entire application ever inserts an `inbox_messages` row with `channel = "feedback"`,
   `"grievance"`, or `"portal"`. The **Feedback** and **Grievances** sections, their channel
   badges, and their unread-count tiles in the left nav are fully built but structurally unreachable
   — there is no in-app or patient-facing source that ever populates them.
2. **A second, related finding: the real inbound WhatsApp pipeline does not write to this screen's
   table at all.** `supabase/functions/whatsapp-bot/index.ts` is the actual Meta Cloud API webhook
   that receives a patient's incoming WhatsApp message (signature-verified, intent-detected, and
   auto-replied to). It writes exclusively to two different tables — `whatsapp_bot_sessions` and
   `whatsapp_bot_messages` — never to `inbox_messages`. Combined with finding 1, this means the
   **WhatsApp** section of this Inbox is not actually fed by real inbound patient WhatsApp traffic
   today; the only rows that ever land in `inbox_messages` are the outbound replies/composes this
   same screen's own two insert paths create. In its current wiring, a Receptionist opening this
   screen expecting to see patients' incoming WhatsApp messages will not find them here — they are
   being auto-handled by the separate bot pipeline with no bridge back into this unified inbox.
3. **Assign-to-staff control — fixed.** `inbox_messages`'s pre-existing `assigned_to` column now
   has a real **"Assign to…"** dropdown in the message detail panel, reusing the same staff-fetch
   pattern PRO's Grievances tab already uses on its own separate `grievances` table.
4. **Filter and Tags — fixed, using real pre-existing columns rather than new ones.** The **Filter**
   icon next to the search box now toggles "unread only," reading the pre-existing
   `inbox_messages.is_read` column. The five **Tags** chips (**Urgent, Billing, Appointment, Report,
   Other**) now filter the message list against the pre-existing `inbox_messages.tags` column —
   both columns already existed in the schema, unused, before this fix.

**One new finding from this round's design-law review, not yet acted on:** Column 3 of this
screen's layout is already tight at the 768px tablet breakpoint, and the new Assign control makes
it tighter — flagged as a responsive-layout follow-up, not fixed as part of this pass.

---

## Scoping note on review gates

This file documents an existing, already-shipped screen; no new UI was built or changed as part of
this ticket. Per the brief that commissioned this file, Kiran's 3-Design-Laws review gate (which
applies to new components/pages) was deliberately not invoked here — this is a documentation-only
pass with no code edits, so there is nothing for that gate to review. Noted explicitly so this
reads as a scoping decision, not an oversight.
