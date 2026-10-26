/**
 * fetchHospitalUpiId — the hospital's own configured UPI VPA, for building a
 * `upi://pay` deep link on a receipt/slip/invoice QR.
 *
 * Extracted because GSTInvoiceModal's UPI QR block (and the new patient-credit
 * slip print) both need it, and GSTInvoiceModal's existing block had been
 * using a hardcoded literal "hospital@upi" instead of the value a hospital
 * actually saves on Settings → Razorpay — so its QR pointed real patients'
 * scans at an address that has never belonged to any hospital using the
 * product. See SettingsRazorpayPage.tsx, which writes this same value.
 */

import { supabase } from "@/integrations/supabase/client";

/**
 * Returns null (never a fake value) when the hospital hasn't configured one.
 *
 * Goes through the `get_hospital_upi_id` RPC rather than reading
 * api_configurations directly. That table holds live Razorpay/WATI/ABDM
 * credentials and is administrator-only as of 20261110000001 — but the people
 * who print receipts are cashiers, not admins, so a direct read here would
 * return null for exactly the users who need it and put a QR with no payee on
 * a patient's invoice. The RPC returns ONLY the VPA (a payee address, printed
 * on every slip — not a secret) and derives the hospital from the session, so
 * there is no hospital_id to spoof.
 *
 * `hospitalId` is retained in the signature for call-site clarity and is
 * deliberately unused: the RPC resolves the tenant itself, and accepting one
 * here would imply a caller could ask for another hospital's value.
 */
export async function fetchHospitalUpiId(_hospitalId: string): Promise<string | null> {
  const { data, error } = await (supabase as any).rpc("get_hospital_upi_id");
  // Supabase returns errors as values. An unchecked error would fall through to
  // `data === null` and render as "no UPI configured", which is indistinguishable
  // from the real thing and would silently drop the QR off every receipt.
  if (error) return null;
  const upi = typeof data === "string" ? data.trim() : "";
  return upi || null;
}

/** Builds a upi://pay deep-link string, or null when no VPA is configured. */
export function buildUpiPayUri(opts: {
  upiId: string | null;
  payeeName: string;
  amount: number;
  note: string;
}): string | null {
  if (!opts.upiId) return null;
  const params = new URLSearchParams({
    pa: opts.upiId,
    pn: opts.payeeName,
    am: String(opts.amount),
    cu: "INR",
    tn: opts.note,
  });
  return `upi://pay?${params.toString()}`;
}
