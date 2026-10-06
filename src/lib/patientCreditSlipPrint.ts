/**
 * patientCreditSlipPrint — the "Payment Due Slip" printed when a patient is
 * granted OPD Pay Later on a lab or radiology order.
 *
 * Follows receiptPrint.ts's shape: a pure render function producing the body
 * HTML, plus an I/O wrapper that warms the brand cache and opens the print
 * window. Deliberately its own renderer rather than a reuse of
 * renderReceiptHtml — this document is the opposite of a receipt: it
 * acknowledges money OWED, not money received, and needs a large amount,
 * a QR code and a thumb-impression box a receipt has no use for.
 *
 * Design intent (see docs/product/PATIENT_PAY_LATER_DESIGN.md's rural-reality
 * section): large font for a patient who may not read well, a local-language
 * label for "amount owing" that avoids "credit"/"udhaar"/"loan", and a QR
 * pre-filled with the exact amount so the most common resolution — a relative
 * sending money — takes minutes, not the full return trip.
 *
 * The QR must be a data-URI image, not a React <QRCodeSVG>: printDocument
 * injects raw HTML into a popup via document.write, which cannot host a
 * React component. Generated with the `qrcode` package directly (already a
 * dependency — see package.json), not qrcode.react.
 */

import QRCode from "qrcode";
import { supabase } from "@/integrations/supabase/client";
import { escapeHtml } from "@/lib/billPrint";
import { fetchHospitalBrand, printHeader, printDocument } from "@/lib/printUtils";
import { fetchHospitalUpiId, buildUpiPayUri } from "@/lib/hospitalUpi";

export interface PatientCreditSlipInput {
  patientName: string;
  uhid: string | null;
  billNumber: string;
  amountOwing: number;
  grantedAt: string;
}

const SLIP_STYLES = `<style>
  .pcs-wrap { text-align:center; }
  .pcs-row { display:flex; justify-content:space-between; margin:4px 0; font-size:13px; }
  .pcs-label { color:#64748b; }
  .pcs-value { font-weight:700; color:#1e293b; }
  .pcs-owing-label { font-size:14px; color:#475569; margin-top:14px; }
  .pcs-owing { font-size:32px; font-weight:800; color:#b91c1c; margin:6px 0 14px; }
  .pcs-qr { margin:10px 0; }
  .pcs-thumb { display:inline-block; width:120px; height:80px; border:2px solid #94a3b8;
               border-radius:4px; margin-top:16px; }
  .pcs-thumb-label { font-size:10px; color:#94a3b8; margin-top:4px; }
  .pcs-note { font-size:11px; color:#64748b; margin-top:14px; border-top:1px dashed #cbd5e1; padding-top:8px; }
</style>`;

/** PURE. The slip body, minus the hospital header — callers prepend printHeader(). */
export function renderPatientCreditSlipHtml(
  input: PatientCreditSlipInput,
  qrDataUri: string | null,
): string {
  const date = new Date(input.grantedAt).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
  });

  return `${SLIP_STYLES}
<div class="pcs-wrap">
  <div class="pcs-row"><span class="pcs-label">Patient</span><span class="pcs-value">${escapeHtml(input.patientName)}</span></div>
  ${input.uhid ? `<div class="pcs-row"><span class="pcs-label">UHID</span><span class="pcs-value">${escapeHtml(input.uhid)}</span></div>` : ""}
  <div class="pcs-row"><span class="pcs-label">Reference</span><span class="pcs-value">${escapeHtml(input.billNumber)}</span></div>
  <div class="pcs-row"><span class="pcs-label">Date</span><span class="pcs-value">${escapeHtml(date)}</span></div>

  <div class="pcs-owing-label">Amount to pay / बाकी / బాకీ</div>
  <div class="pcs-owing">₹${input.amountOwing.toLocaleString("en-IN")}</div>

  ${qrDataUri ? `<div class="pcs-qr"><img src="${qrDataUri}" width="160" height="160" alt="UPI QR" /><div style="font-size:11px;color:#64748b;">Scan to pay the exact amount</div></div>` : ""}

  <div>
    <div class="pcs-thumb"></div>
    <div class="pcs-thumb-label">Thumb impression</div>
  </div>

  <div class="pcs-note">Please bring this slip when you return to pay.</div>
</div>`;
}

/**
 * Fetch branding + the hospital's UPI ID, build the QR, render, open the print window.
 * No QR block at all (not a fake one) when the hospital hasn't configured a UPI ID.
 */
export async function printPatientCreditSlip(
  hospitalId: string,
  input: PatientCreditSlipInput,
): Promise<void> {
  const [brand, upiId] = await Promise.all([
    fetchHospitalBrand(supabase, hospitalId),
    fetchHospitalUpiId(hospitalId),
  ]);

  const upiUri = buildUpiPayUri({
    upiId,
    payeeName: brand.name,
    amount: input.amountOwing,
    note: `Bill-${input.billNumber}`,
  });

  let qrDataUri: string | null = null;
  if (upiUri) {
    try {
      qrDataUri = await QRCode.toDataURL(upiUri, { width: 200 });
    } catch {
      // A QR failure must not block printing the slip — the token/reference/amount
      // alone is still usable at the counter.
      qrDataUri = null;
    }
  }

  const body = `${printHeader(brand.name, "Payment Due Slip")}${renderPatientCreditSlipHtml(input, qrDataUri)}`;
  printDocument(`Payment Due Slip — ${input.billNumber}`, body, { width: 420, height: 640 });
}
