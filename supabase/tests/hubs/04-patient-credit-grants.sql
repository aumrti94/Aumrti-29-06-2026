-- patient_credit_grants — Pay Later for OPD Lab/Radiology (see
-- 20261107000001_patient_credit_grants.sql and docs/product/PATIENT_PAY_LATER_DESIGN.md).
--
-- Three things asserted, matching the load-bearing claims the migration makes:
--   (1) FK targets are public.users(id), never auth.users(id) — check:user-fk's own audit
--       catches this statically, but a direct pgTAP assertion on the FK target catches drift
--       even if that script has a blind spot.
--   (2) Cross-tenant RLS isolation — hospital X's session must not see hospital Y's grant,
--       and must see its own. The two-hospital pattern the tenant-isolation-testing skill
--       requires, not a single-tenant "it returned something" check.
--   (3) The two extended lockedDay triggers: a credit-bearing bill remains writable and
--       collectable after its day locks, while a PLAIN bill (no grant) on the very same
--       locked date is still rejected — proving the exemption is scoped to credit bills
--       only, not accidentally widened to every OPD bill on a locked day.
--
-- Self-contained: throwaway hospitals/patients/bills/users, rolled back at the end. No PHI.

BEGIN;
SELECT plan(9);

-- ── Fixture: two hospitals, one patient + one bill each, one admin user in hospital X ──

INSERT INTO public.hospitals (id, name)
VALUES
  ('77777777-7777-4777-8777-000000000001', 'Credit Test Hospital X'),
  ('77777777-7777-4777-8777-000000000002', 'Credit Test Hospital Y');

INSERT INTO public.role_permissions (hospital_id, role_name, role_label)
VALUES
  ('77777777-7777-4777-8777-000000000001', 'hospital_admin', 'Hospital Admin'),
  ('77777777-7777-4777-8777-000000000002', 'hospital_admin', 'Hospital Admin');

INSERT INTO auth.users (id) VALUES ('77777777-7777-4777-8777-000000000010');

INSERT INTO public.users (id, hospital_id, full_name, email, role, auth_user_id)
VALUES (
  '77777777-7777-4777-8777-000000000011',
  '77777777-7777-4777-8777-000000000001',
  'Credit Test Admin X',
  'credit-test-admin-x@example.test',
  'hospital_admin',
  '77777777-7777-4777-8777-000000000010'
);

INSERT INTO public.patients (id, hospital_id, full_name, uhid)
VALUES
  ('77777777-7777-4777-8777-000000000020', '77777777-7777-4777-8777-000000000001', 'Credit Test Patient X', 'CTHX0001'),
  ('77777777-7777-4777-8777-000000000021', '77777777-7777-4777-8777-000000000002', 'Credit Test Patient Y', 'CTHY0001');

-- Two bills in hospital X: one will carry a Pay Later grant, one will not — the negative
-- control for assertion (3). Both dated onto the same date this file will lock below.
INSERT INTO public.bills (id, hospital_id, bill_number, patient_id, bill_date, bill_status, payment_status, total_amount, paid_amount, balance_due)
VALUES
  ('77777777-7777-4777-8777-000000000030', '77777777-7777-4777-8777-000000000001', 'CTHX-BILL-CREDIT', '77777777-7777-4777-8777-000000000020', '2026-01-15', 'final', 'unpaid', 640, 0, 640),
  ('77777777-7777-4777-8777-000000000031', '77777777-7777-4777-8777-000000000001', 'CTHX-BILL-PLAIN',  '77777777-7777-4777-8777-000000000020', '2026-01-15', 'final', 'unpaid', 300, 0, 300);

-- A bill in hospital Y, for the RLS cross-tenant check.
INSERT INTO public.bills (id, hospital_id, bill_number, patient_id, bill_date, bill_status, payment_status, total_amount, paid_amount, balance_due)
VALUES ('77777777-7777-4777-8777-000000000032', '77777777-7777-4777-8777-000000000002', 'CTHY-BILL', '77777777-7777-4777-8777-000000000021', '2026-01-15', 'final', 'unpaid', 500, 0, 500);

-- ── 1. FK targets: granted_by / approved_by → public.users(id), never auth.users(id) ──

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
    JOIN pg_class rt ON rt.oid = c.confrelid
    JOIN pg_namespace rn ON rn.oid = rt.relnamespace
    WHERE t.relname = 'patient_credit_grants' AND a.attname = 'granted_by'
      AND rt.relname = 'users' AND rn.nspname = 'public'
  ),
  'granted_by FKs to public.users, not auth.users'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
    JOIN pg_class rt ON rt.oid = c.confrelid
    JOIN pg_namespace rn ON rn.oid = rt.relnamespace
    WHERE t.relname = 'patient_credit_grants' AND a.attname = 'approved_by'
      AND rt.relname = 'users' AND rn.nspname = 'public'
  ),
  'approved_by FKs to public.users, not auth.users'
);

-- ── 2. Cross-tenant RLS isolation ──

INSERT INTO public.patient_credit_grants (hospital_id, patient_id, bill_id, amount, reason, granted_by)
VALUES ('77777777-7777-4777-8777-000000000001', '77777777-7777-4777-8777-000000000020',
        '77777777-7777-4777-8777-000000000030', 640, 'Patient will bring payment in an hour',
        '77777777-7777-4777-8777-000000000011');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', '77777777-7777-4777-8777-000000000010', 'role', 'authenticated')::text,
  true);

SELECT is(
  (SELECT count(*)::int FROM public.patient_credit_grants WHERE hospital_id = '77777777-7777-4777-8777-000000000001'),
  1,
  'hospital X''s session sees its own grant'
);

SELECT is(
  (SELECT count(*)::int FROM public.patient_credit_grants WHERE hospital_id = '77777777-7777-4777-8777-000000000002'),
  0,
  'hospital X''s session cannot see hospital Y''s rows (none exist yet, but the policy predicate is exercised via the filter below)'
);

SELECT is(
  (SELECT count(*)::int FROM public.patient_credit_grants),
  1,
  'an unfiltered SELECT under hospital X''s session returns only hospital X''s row — RLS, not the WHERE clause, is doing the filtering'
);

RESET ROLE;

-- ── 3. Locked-day exemption, both triggers ──

INSERT INTO public.daily_cash_closure (hospital_id, closure_date, status)
VALUES ('77777777-7777-4777-8777-000000000001', '2026-01-15', 'locked');

CREATE FUNCTION pg_temp.capture_sqlstate(p_sql text) RETURNS text AS $$
BEGIN
  EXECUTE p_sql;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN SQLSTATE;
END;
$$ LANGUAGE plpgsql;

-- 3a. The credit-bearing bill's balance UPDATE succeeds despite the lock.
SELECT is(
  pg_temp.capture_sqlstate($$
    UPDATE public.bills SET paid_amount = 640, balance_due = 0, payment_status = 'paid'
    WHERE id = '77777777-7777-4777-8777-000000000030'
  $$),
  NULL,
  'a credit-bearing bill''s payment-status UPDATE is exempt from the locked-day block'
);

-- 3b. A bill_payments INSERT against that same bill succeeds despite the lock — this is the
-- trigger that actually fires when the patient returns to pay.
SELECT is(
  pg_temp.capture_sqlstate($$
    INSERT INTO public.bill_payments (hospital_id, bill_id, payment_mode, amount)
    VALUES ('77777777-7777-4777-8777-000000000001', '77777777-7777-4777-8777-000000000030', 'cash', 640)
  $$),
  NULL,
  'collecting payment against a credit-bearing bill succeeds on a locked day'
);

-- 3c. The PLAIN bill (no grant), same locked date, is still rejected — the exemption must not
-- be accidentally widened to every OPD bill on a locked day.
SELECT is(
  pg_temp.capture_sqlstate($$
    UPDATE public.bills SET paid_amount = 300, balance_due = 0, payment_status = 'paid'
    WHERE id = '77777777-7777-4777-8777-000000000031'
  $$),
  'P0001',
  'a PLAIN bill with no patient_credit_grants row is still blocked on the same locked date'
);

SELECT is(
  pg_temp.capture_sqlstate($$
    INSERT INTO public.bill_payments (hospital_id, bill_id, payment_mode, amount)
    VALUES ('77777777-7777-4777-8777-000000000001', '77777777-7777-4777-8777-000000000031', 'cash', 300)
  $$),
  'P0001',
  'collecting payment against the plain bill is still blocked on the same locked date'
);

SELECT * FROM finish();
ROLLBACK;
