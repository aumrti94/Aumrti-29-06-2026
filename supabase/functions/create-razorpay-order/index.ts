import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

/**
 * SECURITY (fixed 2026-09-19 — found while scoping Phase 10, no prior KNOWN-BUG entry):
 * this function had NO caller verification of any kind. hospitalId/amount came straight from
 * the request body and were trusted outright — any caller could create a Razorpay order
 * against ANY hospital's live payment gateway at ANY amount, with the client-supplied `notes`
 * object merged straight into what appears on that hospital's Razorpay dashboard.
 *
 * Two genuinely different real callers reach this function, confirmed by reading both call
 * sites directly rather than assuming one shape fits all:
 *   1. PublicBookingPage.tsx — a patient booking a health package BEFORE registering/logging
 *      in. No session exists yet, by design; `packageId` is a real `health_packages.id`.
 *   2. PatientPortalBillsPage.tsx — an authenticated patient portal session paying a bill.
 *      Its own comment says `packageId` is actually the `bills.id` here, used only to build
 *      the Razorpay receipt tag string — never a health_packages row.
 *
 * So this cannot simply require a JWT (path 1 has none, by design) or simply trust the body
 * (path 2's real risk is a compromised/malicious client lowballing what it pays). Both paths
 * instead derive hospital_id AND the amount actually charged from a real, server-side row —
 * the client's own `hospitalId`/`amount` are used only to CROSS-CHECK, never trusted outright.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { hospitalId, packageId, currency = "INR", notes = {} } = await req.json();

    if (!hospitalId || !packageId) {
      return json({ error: "hospitalId, packageId required" }, 400);
    }

    let resolvedAmount: number;
    const authHeader = req.headers.get("Authorization");

    if (authHeader) {
      // Path 2 — authenticated patient portal bill payment. packageId is a bills.id.
      const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
      if (authErr || !user) return json({ error: "Unauthorized" }, 401);

      const { data: bill } = await supabase
        .from("bills")
        .select("id, hospital_id, patient_id, balance_due")
        .eq("id", packageId)
        .eq("hospital_id", hospitalId)
        .maybeSingle();
      if (!bill) return json({ error: "Bill not found" }, 404);

      // Patients authenticate via Supabase Auth email/phone OTP with no stored auth_user_id
      // FK on `patients` (confirmed live — PatientPortalLogin.tsx matches by email/phone at
      // login time, not a foreign key) — the same match is the real authorization check here.
      const { data: patient } = await supabase
        .from("patients")
        .select("email, phone")
        .eq("id", bill.patient_id)
        .maybeSingle();
      const emailMatches = !!patient?.email && !!user.email && patient.email.toLowerCase() === user.email.toLowerCase();
      const last10 = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "").slice(-10);
      const phoneMatches = !!patient?.phone && !!user.phone && last10(patient.phone) === last10(user.phone) && last10(user.phone).length === 10;
      if (!emailMatches && !phoneMatches) return json({ error: "Forbidden" }, 403);

      resolvedAmount = Number(bill.balance_due);
      if (!(resolvedAmount > 0)) return json({ error: "Nothing due on this bill" }, 400);
    } else {
      // Path 1 — anonymous public package booking. packageId is a real health_packages.id.
      const { data: pkg } = await supabase
        .from("health_packages")
        .select("id, hospital_id, price, is_active")
        .eq("id", packageId)
        .maybeSingle();
      if (!pkg || !pkg.is_active || pkg.hospital_id !== hospitalId) {
        return json({ error: "Package not found" }, 404);
      }
      resolvedAmount = Number(pkg.price);
    }

    // Fetch hospital's Razorpay credentials
    const { data: apiConfig } = await supabase
      .from("api_configurations")
      .select("config")
      .eq("hospital_id", hospitalId)
      .eq("service_key", "razorpay")
      .eq("is_active", true)
      .maybeSingle();

    if (!apiConfig?.config) {
      return json({ error: "Razorpay not configured for this hospital" }, 400);
    }

    const { key_id, key_secret } = apiConfig.config as Record<string, any>;
    if (!key_id || !key_secret) {
      return json({ error: "Razorpay credentials incomplete" }, 400);
    }

    // Create Razorpay order
    const auth = btoa(`${key_id}:${key_secret}`);
    const orderPayload = {
      amount: Math.round(resolvedAmount * 100), // paise
      currency,
      receipt: `PKG-${String(packageId).slice(0, 8)}-${Date.now()}`,
      notes: { hospital_id: hospitalId, package_id: packageId, ...notes },
    };

    const rzpRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(orderPayload),
    });

    if (!rzpRes.ok) {
      const errText = await rzpRes.text();
      console.error("Razorpay order creation failed:", errText);
      return json({ error: "Razorpay order creation failed", detail: errText }, 502);
    }

    const order = await rzpRes.json();

    return json({
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      key_id,
    });

  } catch (err) {
    console.error("Create order error:", err);
    return json({ error: String(err) }, 500);
  }
});
