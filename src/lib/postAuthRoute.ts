import { supabase } from "@/integrations/supabase/client";

/**
 * Role → default landing page, for a user who hasn't personally overridden it
 * (see `user_quick_access.default_route`). Shared by every post-auth routing
 * decision so password sign-in, OAuth sign-in, and resuming an existing
 * session all agree on where a given role lands.
 */
export const ROLE_LANDING_ROUTES: Record<string, string> = {
  super_admin: "/dashboard",
  hospital_admin: "/dashboard",
  doctor: "/opd",
  nurse: "/nursing",
  accountant: "/billing",
  billing_executive: "/billing",
  billing_staff: "/billing",
  cfo: "/accounts",
  pharmacist: "/pharmacy",
  lab_tech: "/lab",
  lab_technician: "/lab",
  radiologist: "/radiology",
  hr_manager: "/hr",
  receptionist: "/opd",
};

/**
 * Where should an authenticated user land?
 *
 * An Aumrti platform admin has a row in `aumrti_admins` but NO row in `users`, so the
 * hospital context resolves `role = null` and every RoleGuard denies them — including
 * /dashboard itself, which bounces back to /dashboard forever behind an "Access denied"
 * toast. Any code path that routes a freshly-authenticated (or already-signed-in) user
 * must ask this helper instead of hard-coding "/dashboard".
 *
 * Precedence: platform admin (mirrors `resolve_oauth_login()`'s RPC precedence) →
 * the user's personal `default_route` pick (src/pages/modules/QuickAccessPage.tsx) →
 * their role's default landing page → the caller-supplied fallback. A stale personal
 * pick (role changed, module unentitled since it was saved) needs no special handling
 * here — RoleGuard already bounces any denied route back to /dashboard.
 */
export async function resolvePostAuthRoute(fallback = "/dashboard"): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return "/login";
  if (await isPlatformAdmin(user.id)) return "/platform";

  // This function must always resolve to *some* route — sign-in can't hard-fail
  // just because a personalization lookup errored — so failures degrade to the
  // role/fallback default rather than throwing, but are logged so a broken
  // preference read/write doesn't silently disappear during development.
  const { data: userRow, error: userErr } = await supabase
    .from("users")
    .select("id, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (userErr) console.warn("resolvePostAuthRoute: users lookup failed", userErr);
  if (!userRow) return fallback;

  const { data: prefRow, error: prefErr } = await (supabase as any)
    .from("user_quick_access")
    .select("default_route")
    .eq("user_id", userRow.id)
    .maybeSingle();
  if (prefErr) console.warn("resolvePostAuthRoute: default_route lookup failed", prefErr);
  const personal = (prefRow as any)?.default_route;
  if (personal) return personal;

  return ROLE_LANDING_ROUTES[userRow.role] || fallback;
}

/** True when this auth user is an active Aumrti platform admin. */
export async function isPlatformAdmin(authUserId: string): Promise<boolean> {
  const { data } = await (supabase as any)
    .from("aumrti_admins")
    .select("id")
    .eq("auth_user_id", authUserId)
    .eq("is_active", true)
    .maybeSingle();
  return !!data;
}
