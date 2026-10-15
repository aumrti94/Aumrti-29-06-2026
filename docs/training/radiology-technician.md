# Radiology Technician — Training Manual

## What this role does in the system

As a Radiology Technician, you work mainly in the **Radiology (RIS)** module. It opens on the
**📡 Worklist** tab, showing every imaging order for the selected date, sorted with 🔴 STAT orders
first, then 🟡 Urgent, then Routine.

> **Before you start — a note on login roles.** Aumrti does not currently have a separate
> "Radiology Technician" login role. The Radiology module is only reachable by accounts set up
> with the role **Radiologist**, **Doctor**, **Hospital Admin**, or **Super Admin**. If you are a
> technician (not a radiologist), your hospital's admin must have created your login with the
> **Radiologist** role for you to open this screen at all — ask your supervisor to confirm this
> was done. The Worklist and Images screens below are identical regardless of which of those
> roles your login carries; only the **Report** tab's findings/impression/sign-off is realistically
> a radiologist's own writing.

All dates show as DD/MM/YYYY, and every study carries a unique **Accession Number** (e.g.
`RAD-20261012-0004`) that you can use to find it again.

---

## 1. Receive and find an order on the Worklist

1. In the left-hand menu, click **Radiology**. This opens on the **📡 Worklist** tab.
2. The left-hand panel lists today's studies by default. Use the **date field** at the top (or
   the **Today** / **Yesterday** quick buttons) to look at a different day, and the **modality**
   drop-down (All / 🩻 X-Ray / 🔊 USG / 🫀 Echo / ❤️ ECG / 🧲 CT / 🧲 MRI) and **status** drop-down
   to narrow the list down.
3. Each order card shows the Accession Number, priority badge (🔴 STAT / 🟡 URGENT), the
   patient's name, UHID, age/gender, the study name, the referring doctor ("Dr. ..."), how long
   ago it was ordered, and a status pill (**Ordered**, **Scheduled**, **Arrived**, **Imaging**,
   **Awaiting Report**, **Reported**, **Validated ✓**).
4. Click an order card to open it on the right in the **Radiology Reporting Workspace** — this is
   where you do all of the steps below.
5. If a patient's doctor already wrote a radiology study in their OPD prescription or ward orders
   but no order has been created yet, check the **⏳ Pending from OPD** tab at the top instead —
   it lists those patients with a **Create Order** button that opens the New Radiology Order form
   pre-filled with the study name(s).

---

## 2. Perform and record the study

1. With an order open in the workspace, its header shows the modality icon, study name, Accession
   Number, patient details, and the referring doctor.
2. If the order has not started yet (status **Ordered**, **Scheduled** or **Arrived**), click
   **"▶ Start Study"**. This moves the order to status **Imaging**.
   - If the hospital collects payment before imaging and this order is unpaid, a payment-pending
     screen appears instead and blocks the study from starting until it is settled at the
     counter (or overridden by an authorised user with a reason).
3. Perform the scan/examination as per your department's protocol.
4. Once the images have been captured, click **"📷 Images Acquired"**. This moves the order to
   status **Awaiting Report** and is the point in the workflow where your part — performing and
   recording the study — is done; the **Report** tab from here on (Technique, Findings,
   Impression, Validate & Sign) is written and signed by the reporting radiologist.

---

## 3. Upload images

1. Still inside the order's workspace, click the **Images** tab.
2. On the **Uploaded Files** tab (left side), click **"Upload DICOM"**. This opens a file picker —
   select one or more `.dcm` files exported from your imaging equipment or modality workstation
   (up to 100 MB each). JPEG-compressed files (typical for X-ray/USG) can be viewed directly in
   the browser afterwards; some CT/MRI files use uncompressed raw pixel data and must be
   downloaded to view in a dedicated DICOM viewer (RadiAnt, Horos, MicroDicom) — the screen tells
   you which is true for each file.
3. Each uploaded file appears in the list on the left with its modality, series description, and
   file size. Click a file to open it in the built-in viewer on the right, where you can zoom,
   rotate, adjust brightness/contrast (or Window Centre/Width for raw CT/MRI data), measure
   distances, and — for multi-frame studies — play a cine loop.
4. If your hospital has a connected PACS (Orthanc, OHIF, Synapse, Centricity, etc.), use the
   **PACS Viewer** tab instead — click **"Open PACS"** to launch the full study in a new tab, or
   **"Show Inline"** to view it embedded in this screen. If no PACS is configured yet, this tab
   shows a box to paste a direct study URL for quick linking, plus a setup guide for your admin.

---

## 4. The radiologist's report and marking complete (what happens next)

The remaining steps are the reporting radiologist's own work, not a technician's — they are
described here only so you know what "marking complete" looks like and when a study has truly
finished its path:

1. On the **Report** tab, the radiologist fills in **Clinical History**, **Indication**,
   **Technique**, **Findings**, and **Impression / Conclusion** — optionally using the
   **✨ AI Suggest** button next to Impression, or the microphone icon next to Findings for voice
   dictation.
2. If a finding is urgent, the radiologist ticks **"Mark as Critical / Urgent Finding"** and types
   the detail — this raises an immediate clinical alert and is never delayed.
3. Once Findings and Impression are both filled in, the radiologist clicks **"✓ Validate & Sign"**.
   This moves the order to status **Validated ✓** — the point the study counts as complete and
   fully reported — and automatically notifies the referring doctor.
4. For any obstetric/gynaecological ultrasound, the order carries a **PCPNDT** tab and badge; the
   legally-mandated Form F must be completed there before the report can be signed — the screen
   blocks signing until it is done.
5. From a signed report, either you or the radiologist can click **"🖨️ Print"** for a hard copy, or
   **"📤 Send to Doctor"** to send the impression to the referring doctor over WhatsApp.

---

*This manual covers the Radiology (RIS) screens as they exist in Aumrti HMS today. If a screen
looks different from what is described here, tell Vishal (Radiology, DICOM & RIS) so the manual
can be corrected.*
