-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- Platform AI cost: aggregate-only admin read path
--
-- THE GAP, STATED PRECISELY. ai_cost_daily and ai_usage_logs (both 20260910000002) each carry
-- exactly one SELECT policy:
--
--   ai_cost_daily_select_own   FOR SELECT TO authenticated USING (hospital_id = get_user_hospital_id())
--   ai_usage_logs_select_own   FOR SELECT TO authenticated USING (hospital_id = get_user_hospital_id())
--
-- There is no is_aumrti_admin() read policy on either. An Aumrti platform admin's
-- get_user_hospital_id() does not resolve to a tenant, so the policy matches nothing and the
-- query returns zero rows — and src/pages/admin/AIPerformancePage.tsx destructures only
-- `const { data: rows } = await ...` then does `const all: DailyRow[] = rows ?? []`. The error is
-- discarded, the array is empty, and the page renders a confident ₹0 platform-wide AI spend. The
-- CFO's cost dashboard currently cannot distinguish "we spent nothing" from "we cannot read the
-- table", and it has been reporting the first.
--
-- WHY NOT ANOTHER CROSS-TENANT ROW POLICY. That is what 20260913000000_aumrti_admin_cross_tenant_rls.sql
-- did for 12 tables, 6 of them PHI-bearing (bills, admissions, lab_orders, radiology_orders,
-- ed_visits, pharmacy_dispensing — each reachable to patient_id). Kavitha needs a number;
-- Ananya's position is that a row-level grant to satisfy a number is a DPDP problem because the
-- grant is unbounded by purpose — nothing in `FOR SELECT USING (is_aumrti_admin())` limits the
-- admin to aggregates once the rows are readable. Both are satisfied by giving the admin the
-- aggregate and not the rows.
--
-- THE PRECEDENT THIS FOLLOWS. 20261009000175_ai_budget_and_inr_metering.sql §4 hit exactly this
-- wall and documented the workaround in its own comment: "a plain view runs with the owner's
-- rights and bypasses the base tables' RLS, and ai_cost_daily has no platform admin read policy
-- — so the WHERE clause scopes rows to the caller's own hospital, or all rows for an Aumrti
-- admin." hospital_ai_budget_status is that view. It solves the month-to-date budget question
-- and only that question; AIPerformancePage needs per-day, per-feature, per-provider series and
-- cache economics, which the budget view does not expose. This migration extends the same
-- mechanism to that shape rather than inventing a second one.
--
-- WHY THIS IS SAFE TO AGGREGATE AT ALL — checked, not assumed. Neither base table has a
-- patient_id, an encounter_id or any free-text clinical field. Full column lists at
-- 20260910000002:6-27 (ai_usage_logs) and :44-57 (ai_cost_daily); the widest thing either holds
-- is feature_key and ai_usage_logs.error_message. So these views are PHI-free by construction,
-- not by filtering — a materially different claim from aggregating over bills or admissions, and
-- the reason this approach works here and would NOT work as a general replacement for
-- 20260913000000.
--
-- SECURITY NOTE ON OWNER-RIGHTS VIEWS. A plain view in PG15+ runs as its owner and bypasses base
-- table RLS, so the WHERE clause IS the access control and a mistake in it is a cross-tenant
-- leak. Three rules, enforced by review (Meera) on any change to this file:
--   (1) every view here ends in `WHERE ... public.is_aumrti_admin()` or an explicit tenant scope;
--   (2) no view here selects a column that could carry PHI;
--   (3) security_invoker is left at its default false — setting it true would re-break the page.
-- ═════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 1. ai_cost_platform_daily — the series AIPerformancePage actually needs
--
-- Grain: (date, hospital, feature, provider). That is one grain coarser than ai_cost_daily's
-- rows only in that it drops the surrogate id — deliberately, because this is the grain the
-- page already groups to and anything finer would be a row grant wearing a view's clothes.
--
-- Column set is the union of what AIPerformancePage.fetchAIPerf() selects (lines ~63-73),
-- including the hospitals(name) join it currently does as an embedded resource. Resolving the
-- name inside the view removes that embed, which is itself an RLS dependency on hospitals.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.ai_cost_platform_daily;
CREATE VIEW public.ai_cost_platform_daily AS
SELECT
  d.date,
  d.hospital_id,
  h.name                        AS hospital_name,
  d.feature_key,
  d.provider,
  sum(d.total_calls)            AS total_calls,
  sum(d.total_tokens_input)     AS total_tokens_input,
  sum(d.total_tokens_output)    AS total_tokens_output,
  sum(d.total_cache_reads)      AS total_cache_reads,
  sum(d.cache_hit_count)        AS cache_hit_count,
  sum(d.total_cost_usd)         AS total_cost_usd,
  sum(d.total_cost_inr)         AS total_cost_inr,
  -- Cache hit rate as a ratio, computed here so three different dashboards cannot each derive
  -- it slightly differently. NULL rather than 0 when there were no calls: a day with no AI
  -- usage has no cache hit rate, and rendering it as 0% reads as a cache failure.
  CASE WHEN sum(d.total_calls) > 0
       THEN round((sum(d.cache_hit_count)::numeric / sum(d.total_calls)) * 100, 2)
       ELSE NULL END            AS cache_hit_pct
FROM public.ai_cost_daily d
JOIN public.hospitals h ON h.id = d.hospital_id
WHERE d.hospital_id = public.get_user_hospital_id() OR public.is_aumrti_admin()
GROUP BY d.date, d.hospital_id, h.name, d.feature_key, d.provider;

REVOKE ALL ON public.ai_cost_platform_daily FROM anon;
GRANT SELECT ON public.ai_cost_platform_daily TO authenticated;

COMMENT ON VIEW public.ai_cost_platform_daily IS
  'Per-day/hospital/feature/provider AI cost and cache rollup. Owner-rights view following the '
  'precedent documented in 20261009000175 §4 — the WHERE clause is the access control: own '
  'hospital, or all hospitals for an Aumrti admin. PHI-free: ai_cost_daily holds no patient_id '
  'or clinical field. Replaces AIPerformancePage''s direct .from("ai_cost_daily") read, which '
  'returns zero rows for a platform admin because no is_aumrti_admin() policy exists on the '
  'base table.';

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 2. ai_cost_platform_totals — a single row, so "₹0" can never be ambiguous again
--
-- The specific failure being fixed is that an empty result set and a zero total look identical
-- once a UI reduces an array. A view that always returns exactly one row cannot be confused
-- that way: if the caller gets no row at all, that is unambiguously an authorisation failure
-- and the UI must say so rather than render a total.
--
-- hospitals_with_usage is the honesty check a reviewer should look at first — a platform total
-- with hospitals_with_usage = 0 is not a cost of zero, it is a broken read.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.ai_cost_platform_totals;
CREATE VIEW public.ai_cost_platform_totals AS
SELECT
  COALESCE(sum(s.total_calls), 0)                AS total_calls,
  COALESCE(sum(s.total_cost_inr), 0)             AS total_cost_inr,
  COALESCE(sum(s.total_cost_usd), 0)             AS total_cost_usd,
  COALESCE(sum(s.total_tokens_input), 0)         AS total_tokens_input,
  COALESCE(sum(s.total_tokens_output), 0)        AS total_tokens_output,
  COALESCE(sum(s.cache_hit_count), 0)            AS cache_hit_count,
  count(DISTINCT s.hospital_id)                  AS hospitals_with_usage,
  min(s.date)                                    AS first_usage_date,
  max(s.date)                                    AS last_usage_date,
  CASE WHEN COALESCE(sum(s.total_calls), 0) > 0
       THEN round((sum(s.cache_hit_count)::numeric / sum(s.total_calls)) * 100, 2)
       ELSE NULL END                             AS cache_hit_pct,
  public.is_aumrti_admin()                       AS is_platform_scope
FROM public.ai_cost_daily s
WHERE s.hospital_id = public.get_user_hospital_id() OR public.is_aumrti_admin();

REVOKE ALL ON public.ai_cost_platform_totals FROM anon;
GRANT SELECT ON public.ai_cost_platform_totals TO authenticated;

COMMENT ON VIEW public.ai_cost_platform_totals IS
  'Single-row AI cost total, scoped to own hospital or platform-wide for an Aumrti admin. '
  'Always returns exactly one row, so a caller receiving no row knows it is an authorisation '
  'failure rather than a zero total — the specific defect this fixes in AIPerformancePage. '
  'is_platform_scope tells the UI which scope it is rendering so it can label the figure '
  'correctly instead of guessing.';

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 3. ai_usage_platform_health — reliability and latency, aggregate only
--
-- ai_usage_logs is the per-call table and the one a platform admin has the strongest temptation
-- to read raw, for debugging. error_message is the reason not to: it is free text written from a
-- provider response, and while supabase/functions are expected to sanitise before logging, an
-- aggregate view removes the need to trust that for cross-tenant reads. Errors are exposed here
-- as COUNTS BY feature, never as text.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.ai_usage_platform_health;
CREATE VIEW public.ai_usage_platform_health AS
SELECT
  date_trunc('day', l.created_at)::date          AS day,
  l.hospital_id,
  l.feature_key,
  l.provider,
  l.model_name,
  count(*)                                       AS call_count,
  count(*) FILTER (WHERE l.success)              AS success_count,
  count(*) FILTER (WHERE NOT l.success)          AS failure_count,
  CASE WHEN count(*) > 0
       THEN round((count(*) FILTER (WHERE NOT l.success)::numeric / count(*)) * 100, 2)
       ELSE NULL END                             AS failure_pct,
  -- Percentiles, not a mean: a mean latency hides the tail, and the tail is what a clinician
  -- experiences as the feature being broken.
  round(percentile_cont(0.50) WITHIN GROUP (ORDER BY l.latency_ms)::numeric, 0) AS p50_latency_ms,
  round(percentile_cont(0.95) WITHIN GROUP (ORDER BY l.latency_ms)::numeric, 0) AS p95_latency_ms,
  max(l.latency_ms)                              AS max_latency_ms
FROM public.ai_usage_logs l
WHERE l.hospital_id = public.get_user_hospital_id() OR public.is_aumrti_admin()
GROUP BY 1, 2, 3, 4, 5;

REVOKE ALL ON public.ai_usage_platform_health FROM anon;
GRANT SELECT ON public.ai_usage_platform_health TO authenticated;

COMMENT ON VIEW public.ai_usage_platform_health IS
  'Aggregate AI reliability and latency per day/hospital/feature/model. Deliberately exposes '
  'failure COUNTS and never ai_usage_logs.error_message, which is free text from a provider '
  'response: an aggregate removes the need to trust upstream sanitisation for a cross-tenant '
  'read. p95 rather than mean latency because the tail is what users experience.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- APPLICATION CHANGE REQUIRED — the migration alone does not fix the ₹0
--
-- src/pages/admin/AIPerformancePage.tsx, fetchAIPerf():
--   * `.from("ai_cost_daily")` -> `.from("ai_cost_platform_daily")`, and drop the
--     `hospitals:hospital_id ( name )` embed — hospital_name is a plain column on the view now.
--   * Destructure and HANDLE the error. The current `const { data: rows } = await ...` followed
--     by `rows ?? []` is the actual bug; swapping the table without this keeps the silent ₹0,
--     it just stops being empty for a different reason.
--   * Read ai_cost_platform_totals for the headline figures and treat a missing row as an error
--     state, not as zero. That is the only change that makes the ₹0 unreachable rather than
--     merely unlikely.
--
-- NOT DONE IN THIS MIGRATION, and not by this pod: that is a frontend change on an admin screen
-- and it needs Kiran's design-law review for the error state (what the card renders when the
-- read fails must not be a number). Routing it, not writing it.
--
-- WHAT THIS DOES NOT ADDRESS. 20260913000000's row-level cross-tenant grant on 12 tables stays
-- exactly as it is. This migration is the aggregate-only pattern for the AI cost question only;
-- applying it to the 6 PHI-bearing tables in that migration is a larger piece of work with a
-- real behaviour change for the admin cockpit, and it needs Ananya to specify which aggregates
-- the platform is actually entitled to before any view is written.
-- ═════════════════════════════════════════════════════════════════════════════════════════════
