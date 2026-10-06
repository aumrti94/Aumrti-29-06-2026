-- Post-8B round 2, Part 2 — the three genuinely-broken policies out of the "13 more files"
-- flagged as an audit debt in 20261106000034_partograph_entries_rls_auth_user_id.sql.
--
-- WHY. Same defect as partograph_entries: each of these three policies hand-rolls
-- `hospital_id = (SELECT hospital_id FROM users WHERE id = auth.uid())` instead of calling the
-- canonical `public.get_user_hospital_id()` helper, which migration 20260322111223 repointed to
-- `auth_user_id = auth.uid()` once `public.users.id` and the auth uid started diverging for every
-- account created after that point. Each of these three tables has been silently returning zero
-- rows, for any post-decoupling account, since it was created.
--
-- SCOPE NOTE. Of the "13 more files" flagged in 20261106000034, research this round found only
-- these three are genuinely still broken with no working fallback. The rest are either already
-- fixed by a later migration, or have a SECOND, correctly-scoped policy already present on the
-- same table — Postgres OR's permissive policies together, so the correct one grants access
-- regardless and the broken one is harmless dead weight. Those ~14 are a documented,
-- deliberately-deferred cleanup (see docs/testing/KNOWN_BUGS.md), not fixed here.

DROP POLICY IF EXISTS "tenant_isolation_pmjay_preauth" ON public.pmjay_preauth_requests;
CREATE POLICY "tenant_isolation_pmjay_preauth" ON public.pmjay_preauth_requests
  AS PERMISSIVE FOR ALL TO authenticated
  USING (hospital_id = public.get_user_hospital_id())
  WITH CHECK (hospital_id = public.get_user_hospital_id());

DROP POLICY IF EXISTS "tenant_isolation_package_station_logs" ON public.package_station_logs;
CREATE POLICY "tenant_isolation_package_station_logs" ON public.package_station_logs
  AS PERMISSIVE FOR ALL TO authenticated
  USING (hospital_id = public.get_user_hospital_id())
  WITH CHECK (hospital_id = public.get_user_hospital_id());

-- This one's original policy also had no WITH CHECK clause at all (USING only) — a write naming
-- another hospital's id was never blocked even before the auth.uid() divergence. Adding WITH
-- CHECK here matches the shape every other isolation policy in this codebase already uses.
DROP POLICY IF EXISTS "hospital_isolation_cghs_echs" ON public.cghs_echs_beneficiaries;
CREATE POLICY "hospital_isolation_cghs_echs" ON public.cghs_echs_beneficiaries
  USING (hospital_id = public.get_user_hospital_id())
  WITH CHECK (hospital_id = public.get_user_hospital_id());
