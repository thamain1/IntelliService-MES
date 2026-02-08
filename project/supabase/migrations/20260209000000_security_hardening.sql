-- ============================================================================
-- SECURITY HARDENING MIGRATION
-- ============================================================================
-- Date: February 9, 2026
-- Target: ALL THREE environments (Production, Demo, MES)
--
-- Fixes:
-- - CVE-IS-001: Self-service admin role assignment (CRITICAL)
-- - CVE-IS-002: USING(true) policies allowing unrestricted access (CRITICAL)
-- - CVE-IS-003: is_active field not enforced (HIGH)
-- - CVE-IS-004: Frontend-only RBAC bypass (HIGH)
--
-- All tables wrapped in IF EXISTS for cross-environment portability
-- ============================================================================

-- ============================================================================
-- STEP 1: CREATE SECURITY HELPER FUNCTIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auth_has_role(required_roles text[])
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND is_active = true AND role::text = ANY(required_roles)
  );
$$;

CREATE OR REPLACE FUNCTION public.auth_is_active()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.auth_is_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND is_active = true AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.auth_is_admin_or_dispatcher()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND is_active = true AND role IN ('admin', 'dispatcher')
  );
$$;

-- ============================================================================
-- STEP 2: FIX PROFILE POLICIES (CVE-IS-001 - CRITICAL)
-- ============================================================================

DROP POLICY IF EXISTS "Users can create own profile" ON profiles;
CREATE POLICY "Users can create own profile" ON profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid() AND role = 'technician');

DROP POLICY IF EXISTS "Admins can insert profiles" ON profiles;
CREATE POLICY "Admins can insert profiles" ON profiles FOR INSERT TO authenticated
  WITH CHECK (auth_is_admin());

DROP POLICY IF EXISTS "profiles_select_policy" ON profiles;
DROP POLICY IF EXISTS "Users can view all profiles" ON profiles;
DROP POLICY IF EXISTS "profiles_select" ON profiles;
CREATE POLICY "profiles_select" ON profiles FOR SELECT TO authenticated
  USING (auth_is_active());

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() AND auth_is_active())
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "Admins can update any profile" ON profiles;
DROP POLICY IF EXISTS "admins_update_any_profile" ON profiles;
CREATE POLICY "admins_update_any_profile" ON profiles FOR UPDATE TO authenticated
  USING (auth_is_admin())
  WITH CHECK (auth_is_admin());

DROP POLICY IF EXISTS "Admins can delete profiles" ON profiles;
DROP POLICY IF EXISTS "admins_delete_profiles" ON profiles;
CREATE POLICY "admins_delete_profiles" ON profiles FOR DELETE TO authenticated
  USING (auth_is_admin());

-- ============================================================================
-- STEP 3: FINANCIAL TABLES (wrapped in IF EXISTS)
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='gl_entries' AND table_type='BASE TABLE') THEN
    DROP POLICY IF EXISTS "gl_entries_policy" ON gl_entries;
    DROP POLICY IF EXISTS "gl_entries_select" ON gl_entries;
    DROP POLICY IF EXISTS "gl_entries_insert" ON gl_entries;
    DROP POLICY IF EXISTS "gl_entries_update" ON gl_entries;
    DROP POLICY IF EXISTS "gl_entries_delete" ON gl_entries;
    CREATE POLICY "gl_entries_select" ON gl_entries FOR SELECT TO authenticated USING (auth_is_admin_or_dispatcher());
    CREATE POLICY "gl_entries_insert" ON gl_entries FOR INSERT TO authenticated WITH CHECK (auth_is_admin());
    CREATE POLICY "gl_entries_update" ON gl_entries FOR UPDATE TO authenticated USING (auth_is_admin()) WITH CHECK (auth_is_admin());
    CREATE POLICY "gl_entries_delete" ON gl_entries FOR DELETE TO authenticated USING (auth_is_admin());
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='invoices' AND table_type='BASE TABLE') THEN
    DROP POLICY IF EXISTS "invoices_select_policy" ON invoices;
    DROP POLICY IF EXISTS "invoices_select" ON invoices;
    DROP POLICY IF EXISTS "invoices_insert" ON invoices;
    DROP POLICY IF EXISTS "invoices_update" ON invoices;
    DROP POLICY IF EXISTS "invoices_delete" ON invoices;
    CREATE POLICY "invoices_select" ON invoices FOR SELECT TO authenticated USING (auth_is_admin_or_dispatcher());
    CREATE POLICY "invoices_insert" ON invoices FOR INSERT TO authenticated WITH CHECK (auth_is_admin_or_dispatcher());
    CREATE POLICY "invoices_update" ON invoices FOR UPDATE TO authenticated USING (auth_is_admin_or_dispatcher()) WITH CHECK (auth_is_admin_or_dispatcher());
    CREATE POLICY "invoices_delete" ON invoices FOR DELETE TO authenticated USING (auth_is_admin());
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='invoice_lines' AND table_type='BASE TABLE') THEN
    DROP POLICY IF EXISTS "invoice_lines_select" ON invoice_lines;
    DROP POLICY IF EXISTS "invoice_lines_insert" ON invoice_lines;
    DROP POLICY IF EXISTS "invoice_lines_update" ON invoice_lines;
    DROP POLICY IF EXISTS "invoice_lines_delete" ON invoice_lines;
    CREATE POLICY "invoice_lines_select" ON invoice_lines FOR SELECT TO authenticated USING (auth_is_admin_or_dispatcher());
    CREATE POLICY "invoice_lines_insert" ON invoice_lines FOR INSERT TO authenticated WITH CHECK (auth_is_admin_or_dispatcher());
    CREATE POLICY "invoice_lines_update" ON invoice_lines FOR UPDATE TO authenticated USING (auth_is_admin_or_dispatcher()) WITH CHECK (auth_is_admin_or_dispatcher());
    CREATE POLICY "invoice_lines_delete" ON invoice_lines FOR DELETE TO authenticated USING (auth_is_admin());
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='invoice_payments' AND table_type='BASE TABLE') THEN
    DROP POLICY IF EXISTS "invoice_payments_select" ON invoice_payments;
    DROP POLICY IF EXISTS "invoice_payments_insert" ON invoice_payments;
    DROP POLICY IF EXISTS "invoice_payments_update" ON invoice_payments;
    DROP POLICY IF EXISTS "invoice_payments_delete" ON invoice_payments;
    CREATE POLICY "invoice_payments_select" ON invoice_payments FOR SELECT TO authenticated USING (auth_is_admin_or_dispatcher());
    CREATE POLICY "invoice_payments_insert" ON invoice_payments FOR INSERT TO authenticated WITH CHECK (auth_is_admin_or_dispatcher());
    CREATE POLICY "invoice_payments_update" ON invoice_payments FOR UPDATE TO authenticated USING (auth_is_admin()) WITH CHECK (auth_is_admin());
    CREATE POLICY "invoice_payments_delete" ON invoice_payments FOR DELETE TO authenticated USING (auth_is_admin());
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='bank_reconciliations' AND table_type='BASE TABLE') THEN
    DROP POLICY IF EXISTS "bank_reconciliations_select" ON bank_reconciliations;
    DROP POLICY IF EXISTS "bank_reconciliations_insert" ON bank_reconciliations;
    DROP POLICY IF EXISTS "bank_reconciliations_update" ON bank_reconciliations;
    DROP POLICY IF EXISTS "bank_reconciliations_delete" ON bank_reconciliations;
    CREATE POLICY "bank_reconciliations_select" ON bank_reconciliations FOR SELECT TO authenticated USING (auth_is_admin());
    CREATE POLICY "bank_reconciliations_insert" ON bank_reconciliations FOR INSERT TO authenticated WITH CHECK (auth_is_admin());
    CREATE POLICY "bank_reconciliations_update" ON bank_reconciliations FOR UPDATE TO authenticated USING (auth_is_admin()) WITH CHECK (auth_is_admin());
    CREATE POLICY "bank_reconciliations_delete" ON bank_reconciliations FOR DELETE TO authenticated USING (auth_is_admin());
  END IF;
END $$;

-- ============================================================================
-- STEP 4: OPERATIONAL TABLES
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='customers' AND table_type='BASE TABLE') THEN
    DROP POLICY IF EXISTS "customers_select_policy" ON customers;
    DROP POLICY IF EXISTS "customers_select" ON customers;
    DROP POLICY IF EXISTS "customers_insert" ON customers;
    DROP POLICY IF EXISTS "customers_update" ON customers;
    DROP POLICY IF EXISTS "customers_delete" ON customers;
    CREATE POLICY "customers_select" ON customers FOR SELECT TO authenticated USING (auth_is_active());
    CREATE POLICY "customers_insert" ON customers FOR INSERT TO authenticated WITH CHECK (auth_is_admin_or_dispatcher());
    CREATE POLICY "customers_update" ON customers FOR UPDATE TO authenticated USING (auth_is_admin_or_dispatcher()) WITH CHECK (auth_is_admin_or_dispatcher());
    CREATE POLICY "customers_delete" ON customers FOR DELETE TO authenticated USING (auth_is_admin());
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='tickets' AND table_type='BASE TABLE') THEN
    DROP POLICY IF EXISTS "tickets_select_policy" ON tickets;
    DROP POLICY IF EXISTS "tickets_select" ON tickets;
    DROP POLICY IF EXISTS "tickets_insert" ON tickets;
    DROP POLICY IF EXISTS "tickets_update" ON tickets;
    DROP POLICY IF EXISTS "tickets_delete" ON tickets;
    CREATE POLICY "tickets_select" ON tickets FOR SELECT TO authenticated
      USING (auth_is_admin_or_dispatcher() OR assigned_to = auth.uid());
    CREATE POLICY "tickets_insert" ON tickets FOR INSERT TO authenticated WITH CHECK (auth_is_admin_or_dispatcher());
    CREATE POLICY "tickets_update" ON tickets FOR UPDATE TO authenticated
      USING (auth_is_admin_or_dispatcher() OR assigned_to = auth.uid())
      WITH CHECK (auth_is_admin_or_dispatcher() OR assigned_to = auth.uid());
    CREATE POLICY "tickets_delete" ON tickets FOR DELETE TO authenticated USING (auth_is_admin());
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='ticket_notes' AND table_type='BASE TABLE') THEN
    DROP POLICY IF EXISTS "ticket_notes_select" ON ticket_notes;
    DROP POLICY IF EXISTS "ticket_notes_insert" ON ticket_notes;
    DROP POLICY IF EXISTS "ticket_notes_update" ON ticket_notes;
    DROP POLICY IF EXISTS "ticket_notes_delete" ON ticket_notes;
    CREATE POLICY "ticket_notes_select" ON ticket_notes FOR SELECT TO authenticated USING (auth_is_active());
    CREATE POLICY "ticket_notes_insert" ON ticket_notes FOR INSERT TO authenticated WITH CHECK (auth_is_active());
    CREATE POLICY "ticket_notes_update" ON ticket_notes FOR UPDATE TO authenticated USING (auth_is_admin_or_dispatcher() OR created_by = auth.uid()) WITH CHECK (auth_is_admin_or_dispatcher() OR created_by = auth.uid());
    CREATE POLICY "ticket_notes_delete" ON ticket_notes FOR DELETE TO authenticated USING (auth_is_admin());
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='ticket_parts_used' AND table_type='BASE TABLE') THEN
    DROP POLICY IF EXISTS "ticket_parts_used_select" ON ticket_parts_used;
    DROP POLICY IF EXISTS "ticket_parts_used_insert" ON ticket_parts_used;
    DROP POLICY IF EXISTS "ticket_parts_used_update" ON ticket_parts_used;
    DROP POLICY IF EXISTS "ticket_parts_used_delete" ON ticket_parts_used;
    CREATE POLICY "ticket_parts_used_select" ON ticket_parts_used FOR SELECT TO authenticated USING (auth_is_active());
    CREATE POLICY "ticket_parts_used_insert" ON ticket_parts_used FOR INSERT TO authenticated WITH CHECK (auth_is_active());
    CREATE POLICY "ticket_parts_used_update" ON ticket_parts_used FOR UPDATE TO authenticated USING (auth_is_admin_or_dispatcher()) WITH CHECK (auth_is_admin_or_dispatcher());
    CREATE POLICY "ticket_parts_used_delete" ON ticket_parts_used FOR DELETE TO authenticated USING (auth_is_admin());
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='parts' AND table_type='BASE TABLE') THEN
    DROP POLICY IF EXISTS "parts_select_policy" ON parts;
    DROP POLICY IF EXISTS "parts_select" ON parts;
    DROP POLICY IF EXISTS "parts_insert" ON parts;
    DROP POLICY IF EXISTS "parts_update" ON parts;
    DROP POLICY IF EXISTS "parts_delete" ON parts;
    CREATE POLICY "parts_select" ON parts FOR SELECT TO authenticated USING (auth_is_active());
    CREATE POLICY "parts_insert" ON parts FOR INSERT TO authenticated WITH CHECK (auth_is_admin_or_dispatcher());
    CREATE POLICY "parts_update" ON parts FOR UPDATE TO authenticated USING (auth_is_admin_or_dispatcher()) WITH CHECK (auth_is_admin_or_dispatcher());
    CREATE POLICY "parts_delete" ON parts FOR DELETE TO authenticated USING (auth_is_admin());
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='part_inventory' AND table_type='BASE TABLE') THEN
    DROP POLICY IF EXISTS "part_inventory_select" ON part_inventory;
    DROP POLICY IF EXISTS "part_inventory_insert" ON part_inventory;
    DROP POLICY IF EXISTS "part_inventory_update" ON part_inventory;
    DROP POLICY IF EXISTS "part_inventory_delete" ON part_inventory;
    CREATE POLICY "part_inventory_select" ON part_inventory FOR SELECT TO authenticated USING (auth_is_active());
    CREATE POLICY "part_inventory_insert" ON part_inventory FOR INSERT TO authenticated WITH CHECK (auth_is_admin_or_dispatcher());
    CREATE POLICY "part_inventory_update" ON part_inventory FOR UPDATE TO authenticated USING (auth_is_admin_or_dispatcher()) WITH CHECK (auth_is_admin_or_dispatcher());
    CREATE POLICY "part_inventory_delete" ON part_inventory FOR DELETE TO authenticated USING (auth_is_admin());
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='stock_locations' AND table_type='BASE TABLE') THEN
    DROP POLICY IF EXISTS "stock_locations_select" ON stock_locations;
    DROP POLICY IF EXISTS "stock_locations_insert" ON stock_locations;
    DROP POLICY IF EXISTS "stock_locations_update" ON stock_locations;
    DROP POLICY IF EXISTS "stock_locations_delete" ON stock_locations;
    CREATE POLICY "stock_locations_select" ON stock_locations FOR SELECT TO authenticated USING (auth_is_active());
    CREATE POLICY "stock_locations_insert" ON stock_locations FOR INSERT TO authenticated WITH CHECK (auth_is_admin());
    CREATE POLICY "stock_locations_update" ON stock_locations FOR UPDATE TO authenticated USING (auth_is_admin()) WITH CHECK (auth_is_admin());
    CREATE POLICY "stock_locations_delete" ON stock_locations FOR DELETE TO authenticated USING (auth_is_admin());
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='projects' AND table_type='BASE TABLE') THEN
    DROP POLICY IF EXISTS "projects_all" ON projects;
    DROP POLICY IF EXISTS "projects_select" ON projects;
    DROP POLICY IF EXISTS "projects_insert" ON projects;
    DROP POLICY IF EXISTS "projects_update" ON projects;
    DROP POLICY IF EXISTS "projects_delete" ON projects;
    CREATE POLICY "projects_select" ON projects FOR SELECT TO authenticated USING (auth_is_admin_or_dispatcher());
    CREATE POLICY "projects_insert" ON projects FOR INSERT TO authenticated WITH CHECK (auth_is_admin_or_dispatcher());
    CREATE POLICY "projects_update" ON projects FOR UPDATE TO authenticated USING (auth_is_admin_or_dispatcher()) WITH CHECK (auth_is_admin_or_dispatcher());
    CREATE POLICY "projects_delete" ON projects FOR DELETE TO authenticated USING (auth_is_admin());
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='estimates' AND table_type='BASE TABLE') THEN
    DROP POLICY IF EXISTS "estimates_select" ON estimates;
    DROP POLICY IF EXISTS "estimates_insert" ON estimates;
    DROP POLICY IF EXISTS "estimates_update" ON estimates;
    DROP POLICY IF EXISTS "estimates_delete" ON estimates;
    CREATE POLICY "estimates_select" ON estimates FOR SELECT TO authenticated USING (auth_is_admin_or_dispatcher());
    CREATE POLICY "estimates_insert" ON estimates FOR INSERT TO authenticated WITH CHECK (auth_is_admin_or_dispatcher());
    CREATE POLICY "estimates_update" ON estimates FOR UPDATE TO authenticated USING (auth_is_admin_or_dispatcher()) WITH CHECK (auth_is_admin_or_dispatcher());
    CREATE POLICY "estimates_delete" ON estimates FOR DELETE TO authenticated USING (auth_is_admin());
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='purchase_orders' AND table_type='BASE TABLE') THEN
    DROP POLICY IF EXISTS "purchase_orders_select" ON purchase_orders;
    DROP POLICY IF EXISTS "purchase_orders_insert" ON purchase_orders;
    DROP POLICY IF EXISTS "purchase_orders_update" ON purchase_orders;
    DROP POLICY IF EXISTS "purchase_orders_delete" ON purchase_orders;
    CREATE POLICY "purchase_orders_select" ON purchase_orders FOR SELECT TO authenticated USING (auth_is_admin_or_dispatcher());
    CREATE POLICY "purchase_orders_insert" ON purchase_orders FOR INSERT TO authenticated WITH CHECK (auth_is_admin_or_dispatcher());
    CREATE POLICY "purchase_orders_update" ON purchase_orders FOR UPDATE TO authenticated USING (auth_is_admin_or_dispatcher()) WITH CHECK (auth_is_admin_or_dispatcher());
    CREATE POLICY "purchase_orders_delete" ON purchase_orders FOR DELETE TO authenticated USING (auth_is_admin());
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='vendors' AND table_type='BASE TABLE') THEN
    DROP POLICY IF EXISTS "vendors_select" ON vendors;
    DROP POLICY IF EXISTS "vendors_insert" ON vendors;
    DROP POLICY IF EXISTS "vendors_update" ON vendors;
    DROP POLICY IF EXISTS "vendors_delete" ON vendors;
    CREATE POLICY "vendors_select" ON vendors FOR SELECT TO authenticated USING (auth_is_admin_or_dispatcher());
    CREATE POLICY "vendors_insert" ON vendors FOR INSERT TO authenticated WITH CHECK (auth_is_admin_or_dispatcher());
    CREATE POLICY "vendors_update" ON vendors FOR UPDATE TO authenticated USING (auth_is_admin_or_dispatcher()) WITH CHECK (auth_is_admin_or_dispatcher());
    CREATE POLICY "vendors_delete" ON vendors FOR DELETE TO authenticated USING (auth_is_admin());
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='time_logs' AND table_type='BASE TABLE') THEN
    DROP POLICY IF EXISTS "time_logs_select" ON time_logs;
    DROP POLICY IF EXISTS "time_logs_insert" ON time_logs;
    DROP POLICY IF EXISTS "time_logs_update" ON time_logs;
    DROP POLICY IF EXISTS "time_logs_delete" ON time_logs;
    CREATE POLICY "time_logs_select" ON time_logs FOR SELECT TO authenticated USING (auth_is_admin_or_dispatcher() OR user_id = auth.uid());
    CREATE POLICY "time_logs_insert" ON time_logs FOR INSERT TO authenticated WITH CHECK (auth_is_admin_or_dispatcher() OR user_id = auth.uid());
    CREATE POLICY "time_logs_update" ON time_logs FOR UPDATE TO authenticated USING (auth_is_admin_or_dispatcher() OR user_id = auth.uid()) WITH CHECK (auth_is_admin_or_dispatcher() OR user_id = auth.uid());
    CREATE POLICY "time_logs_delete" ON time_logs FOR DELETE TO authenticated USING (auth_is_admin());
  END IF;
END $$;

-- ============================================================================
-- STEP 5: MES TABLES (MES environment only)
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='work_centers' AND table_type='BASE TABLE') THEN
    DROP POLICY IF EXISTS "work_centers_select" ON work_centers;
    DROP POLICY IF EXISTS "work_centers_insert" ON work_centers;
    DROP POLICY IF EXISTS "work_centers_update" ON work_centers;
    DROP POLICY IF EXISTS "work_centers_delete" ON work_centers;
    CREATE POLICY "work_centers_select" ON work_centers FOR SELECT TO authenticated USING (auth_is_active());
    CREATE POLICY "work_centers_insert" ON work_centers FOR INSERT TO authenticated WITH CHECK (auth_is_admin());
    CREATE POLICY "work_centers_update" ON work_centers FOR UPDATE TO authenticated USING (auth_is_admin()) WITH CHECK (auth_is_admin());
    CREATE POLICY "work_centers_delete" ON work_centers FOR DELETE TO authenticated USING (auth_is_admin());
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='production_orders' AND table_type='BASE TABLE') THEN
    DROP POLICY IF EXISTS "production_orders_select" ON production_orders;
    DROP POLICY IF EXISTS "production_orders_insert" ON production_orders;
    DROP POLICY IF EXISTS "production_orders_update" ON production_orders;
    DROP POLICY IF EXISTS "production_orders_delete" ON production_orders;
    CREATE POLICY "production_orders_select" ON production_orders FOR SELECT TO authenticated USING (auth_has_role(ARRAY['admin','dispatcher','operator','supervisor']));
    CREATE POLICY "production_orders_insert" ON production_orders FOR INSERT TO authenticated WITH CHECK (auth_has_role(ARRAY['admin','dispatcher','supervisor']));
    CREATE POLICY "production_orders_update" ON production_orders FOR UPDATE TO authenticated USING (auth_has_role(ARRAY['admin','dispatcher','operator','supervisor'])) WITH CHECK (auth_has_role(ARRAY['admin','dispatcher','operator','supervisor']));
    CREATE POLICY "production_orders_delete" ON production_orders FOR DELETE TO authenticated USING (auth_is_admin());
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='production_steps' AND table_type='BASE TABLE') THEN
    DROP POLICY IF EXISTS "production_steps_select" ON production_steps;
    DROP POLICY IF EXISTS "production_steps_insert" ON production_steps;
    DROP POLICY IF EXISTS "production_steps_update" ON production_steps;
    CREATE POLICY "production_steps_select" ON production_steps FOR SELECT TO authenticated USING (auth_has_role(ARRAY['admin','dispatcher','operator','supervisor']));
    CREATE POLICY "production_steps_insert" ON production_steps FOR INSERT TO authenticated WITH CHECK (auth_has_role(ARRAY['admin','dispatcher','supervisor']));
    CREATE POLICY "production_steps_update" ON production_steps FOR UPDATE TO authenticated USING (auth_has_role(ARRAY['admin','dispatcher','operator','supervisor'])) WITH CHECK (auth_has_role(ARRAY['admin','dispatcher','operator','supervisor']));
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='material_move_requests' AND table_type='BASE TABLE') THEN
    DROP POLICY IF EXISTS "material_move_requests_select" ON material_move_requests;
    DROP POLICY IF EXISTS "material_move_requests_insert" ON material_move_requests;
    DROP POLICY IF EXISTS "material_move_requests_update" ON material_move_requests;
    CREATE POLICY "material_move_requests_select" ON material_move_requests FOR SELECT TO authenticated USING (auth_has_role(ARRAY['admin','dispatcher','operator','supervisor','material_handler']));
    CREATE POLICY "material_move_requests_insert" ON material_move_requests FOR INSERT TO authenticated WITH CHECK (auth_has_role(ARRAY['admin','dispatcher','operator','supervisor','material_handler']));
    CREATE POLICY "material_move_requests_update" ON material_move_requests FOR UPDATE TO authenticated USING (auth_has_role(ARRAY['admin','dispatcher','supervisor','material_handler'])) WITH CHECK (auth_has_role(ARRAY['admin','dispatcher','supervisor','material_handler']));
  END IF;
END $$;

-- ============================================================================
-- STEP 6: RELOAD SCHEMA CACHE
-- ============================================================================

NOTIFY pgrst, 'reload schema';
