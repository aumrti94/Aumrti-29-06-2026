// quick-scribe-retention — runs the Quick Scribe retention sweep.
//
// This exists because pg_cron cannot be relied on here. 20261008000097 records that it was never
// enabled on this project and that several "scheduled" jobs were very likely never running;
// purge_old_phi_audit() has sat unscheduled since June 2026. The migration that defines
// purge_quick_scribe_notes() still installs a guarded cron job, but this endpoint is the path that
// works today: point any external scheduler (GitHub Actions, a cron box, Supabase's own scheduler
// UI) at it, or curl it by hand during an audit.
//
// It is one of three triggers by design — see 20261111000003's header. The other two are the
// opportunistic per-tenant sweep fired when a doctor opens the Quick Scribe screen, and the cron
// safety net.
//
// Service-role only. The blast radius is limited to data already past its retention boundary, but
// "delete things" is not an endpoint to leave open, so the caller must present the service-role key
// rather than any valid hospital JWT.
//
// No PHI is logged. The response carries row counts per bucket and nothing else — deliberately not
// the ids or names of what was purged, since that would recreate the record in the log.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!serviceKey) {
      console.error("quick-scribe-retention: SUPABASE_SERVICE_ROLE_KEY is not configured");
      return json({ error: "Not configured" }, 500);
    }

    // Constant-ish comparison is not meaningful against a bearer token of this length over HTTPS;
    // what matters is that a hospital-scoped JWT does not satisfy it.
    const presented = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (presented !== serviceKey) {
      return json({ error: "Forbidden" }, 403);
    }

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);

    // Supabase returns errors as values rather than throwing — an unhandled failure here would
    // report a successful purge that never ran, which is the worst possible outcome for a job
    // whose entire purpose is to be able to say "yes, that was deleted".
    const { data, error } = await admin.rpc("purge_quick_scribe_notes");
    if (error) {
      console.error("quick-scribe-retention: purge failed:", error.message);
      return json({ error: error.message }, 500);
    }

    const buckets = (data as Array<{ bucket: string; affected_count: number }> | null) ?? [];
    console.log(
      "quick-scribe-retention: completed —",
      buckets.map((b) => `${b.bucket}=${b.affected_count}`).join(" "),
    );

    return json({ ranAt: new Date().toISOString(), buckets });
  } catch (err) {
    console.error("quick-scribe-retention error:", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
