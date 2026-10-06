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

/** Returns null (never a fake value) when the hospital hasn't configured one. */
export async function fetchHospitalUpiId(hospitalId: string): Promise<string | null> {
  const { data } = await (supabase as any)
    .from("api_configurations")
    .select("config")
    .eq("hospital_id", hospitalId)
    .eq("service_key", "razorpay")
    .eq("is_active", true)
    .maybeSingle();
  const upi = (data?.config as Record<string, any> | undefined)?.upi_id;
  return typeof upi === "string" && upi.trim() ? upi.trim() : null;
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
