# IntelliService ERP: Production-Ready Implementation Plan

**Created**: February 8, 2026
**Target**: All three environments production-ready
**Timeline**: 2-3 weeks intensive work

---

## Environment Matrix

| Environment | DB Project | Local Repo | Deployed URL | Modules |
|-------------|------------|------------|--------------|---------|
| **Production** | `trtqrdplgjgysyspwvam` | `C:\dev\intelliservicebeta` | TBD | FSM + AHS |
| **Demo** | `uuarbdrzfakvlhlrnwgc` | Shared | intelliservice-dunaway.pages.dev | FSM |
| **MES** | `vijbnqrewokckwmtbbhi` | `C:\Dev\IntelliService-MES` | intelliservice-dunaway-hvac.pages.dev | FSM + MES + Quality |

---

## Phase 1: Security Hardening (Days 1-3) - CRITICAL

### 1.1 Create Master Security Migration

**File**: `migrations/20260209_000_security_hardening.sql`

```sql
/*
  SECURITY HARDENING MIGRATION
  Apply to ALL THREE environments

  Fixes:
  - CVE-IS-001: Self-service admin role assignment
  - CVE-IS-002: USING(true) policies (199+)
  - CVE-IS-003: is_active not enforced
  - CVE-IS-004: Frontend-only RBAC
*/

-- ============================================
-- STEP 1: Create security helper functions
-- ============================================

-- Check if user is active and has required role
CREATE OR REPLACE FUNCTION public.auth_has_role(required_roles text[])
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND is_active = true
    AND role::text = ANY(required_roles)
  );
$$;

-- Check if user is active (any role)
CREATE OR REPLACE FUNCTION public.auth_is_active()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND is_active = true
  );
$$;

-- Check if user is admin
CREATE OR REPLACE FUNCTION public.auth_is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND is_active = true
    AND role = 'admin'
  );
$$;

-- ============================================
-- STEP 2: Fix profile INSERT policy (CVE-IS-001)
-- ============================================

DROP POLICY IF EXISTS "Users can create own profile" ON profiles;
CREATE POLICY "Users can create own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    id = auth.uid()
    AND role = 'technician'  -- Force default role
  );

-- ============================================
-- STEP 3: Fix CRITICAL financial table policies
-- ============================================

-- GL Journal Entries (Admin only for write, Admin/Dispatcher for read)
DROP POLICY IF EXISTS "gl_journal_entries_policy" ON gl_journal_entries;
DROP POLICY IF EXISTS "Authenticated users can view journal entries" ON gl_journal_entries;

CREATE POLICY "gl_journal_entries_select"
  ON gl_journal_entries FOR SELECT
  TO authenticated
  USING (auth_has_role(ARRAY['admin', 'dispatcher']));

CREATE POLICY "gl_journal_entries_insert"
  ON gl_journal_entries FOR INSERT
  TO authenticated
  WITH CHECK (auth_is_admin());

CREATE POLICY "gl_journal_entries_update"
  ON gl_journal_entries FOR UPDATE
  TO authenticated
  USING (auth_is_admin())
  WITH CHECK (auth_is_admin());

-- GL Entry Lines
DROP POLICY IF EXISTS "gl_entry_lines_policy" ON gl_entry_lines;

CREATE POLICY "gl_entry_lines_select"
  ON gl_entry_lines FOR SELECT
  TO authenticated
  USING (auth_has_role(ARRAY['admin', 'dispatcher']));

CREATE POLICY "gl_entry_lines_insert"
  ON gl_entry_lines FOR INSERT
  TO authenticated
  WITH CHECK (auth_is_admin());

-- Invoices (Admin/Dispatcher)
DROP POLICY IF EXISTS "invoices_select_policy" ON invoices;
DROP POLICY IF EXISTS "invoices_insert_policy" ON invoices;
DROP POLICY IF EXISTS "invoices_update_policy" ON invoices;
DROP POLICY IF EXISTS "invoices_delete_policy" ON invoices;

CREATE POLICY "invoices_select"
  ON invoices FOR SELECT
  TO authenticated
  USING (auth_has_role(ARRAY['admin', 'dispatcher']));

CREATE POLICY "invoices_insert"
  ON invoices FOR INSERT
  TO authenticated
  WITH CHECK (auth_has_role(ARRAY['admin', 'dispatcher']));

CREATE POLICY "invoices_update"
  ON invoices FOR UPDATE
  TO authenticated
  USING (auth_has_role(ARRAY['admin', 'dispatcher']))
  WITH CHECK (auth_has_role(ARRAY['admin', 'dispatcher']));

CREATE POLICY "invoices_delete"
  ON invoices FOR DELETE
  TO authenticated
  USING (auth_is_admin());

-- Invoice Lines
DROP POLICY IF EXISTS "invoice_lines_select_policy" ON invoice_lines;
DROP POLICY IF EXISTS "invoice_lines_insert_policy" ON invoice_lines;
DROP POLICY IF EXISTS "invoice_lines_update_policy" ON invoice_lines;
DROP POLICY IF EXISTS "invoice_lines_delete_policy" ON invoice_lines;

CREATE POLICY "invoice_lines_select"
  ON invoice_lines FOR SELECT
  TO authenticated
  USING (auth_has_role(ARRAY['admin', 'dispatcher']));

CREATE POLICY "invoice_lines_insert"
  ON invoice_lines FOR INSERT
  TO authenticated
  WITH CHECK (auth_has_role(ARRAY['admin', 'dispatcher']));

CREATE POLICY "invoice_lines_update"
  ON invoice_lines FOR UPDATE
  TO authenticated
  USING (auth_has_role(ARRAY['admin', 'dispatcher']))
  WITH CHECK (auth_has_role(ARRAY['admin', 'dispatcher']));

CREATE POLICY "invoice_lines_delete"
  ON invoice_lines FOR DELETE
  TO authenticated
  USING (auth_is_admin());

-- Invoice Payments
DROP POLICY IF EXISTS "invoice_payments_select_policy" ON invoice_payments;
DROP POLICY IF EXISTS "invoice_payments_insert_policy" ON invoice_payments;
DROP POLICY IF EXISTS "invoice_payments_update_policy" ON invoice_payments;

CREATE POLICY "invoice_payments_select"
  ON invoice_payments FOR SELECT
  TO authenticated
  USING (auth_has_role(ARRAY['admin', 'dispatcher']));

CREATE POLICY "invoice_payments_insert"
  ON invoice_payments FOR INSERT
  TO authenticated
  WITH CHECK (auth_has_role(ARRAY['admin', 'dispatcher']));

CREATE POLICY "invoice_payments_update"
  ON invoice_payments FOR UPDATE
  TO authenticated
  USING (auth_is_admin())
  WITH CHECK (auth_is_admin());

-- Bank Reconciliations (Admin only)
DROP POLICY IF EXISTS "bank_reconciliations_select" ON bank_reconciliations;
DROP POLICY IF EXISTS "bank_reconciliations_update" ON bank_reconciliations;

CREATE POLICY "bank_reconciliations_select"
  ON bank_reconciliations FOR SELECT
  TO authenticated
  USING (auth_is_admin());

CREATE POLICY "bank_reconciliations_insert"
  ON bank_reconciliations FOR INSERT
  TO authenticated
  WITH CHECK (auth_is_admin());

CREATE POLICY "bank_reconciliations_update"
  ON bank_reconciliations FOR UPDATE
  TO authenticated
  USING (auth_is_admin())
  WITH CHECK (auth_is_admin());

-- Payroll (Admin only)
DROP POLICY IF EXISTS "payroll_runs_select" ON payroll_runs;

CREATE POLICY "payroll_runs_select"
  ON payroll_runs FOR SELECT
  TO authenticated
  USING (auth_is_admin());

CREATE POLICY "payroll_runs_insert"
  ON payroll_runs FOR INSERT
  TO authenticated
  WITH CHECK (auth_is_admin());

CREATE POLICY "payroll_runs_update"
  ON payroll_runs FOR UPDATE
  TO authenticated
  USING (auth_is_admin())
  WITH CHECK (auth_is_admin());

-- ============================================
-- STEP 4: Fix operational table policies
-- ============================================

-- Customers (All authenticated can view, Admin/Dispatcher can modify)
DROP POLICY IF EXISTS "customers_select_policy" ON customers;
DROP POLICY IF EXISTS "customers_insert_policy" ON customers;
DROP POLICY IF EXISTS "customers_update_policy" ON customers;

CREATE POLICY "customers_select"
  ON customers FOR SELECT
  TO authenticated
  USING (auth_is_active());

CREATE POLICY "customers_insert"
  ON customers FOR INSERT
  TO authenticated
  WITH CHECK (auth_has_role(ARRAY['admin', 'dispatcher']));

CREATE POLICY "customers_update"
  ON customers FOR UPDATE
  TO authenticated
  USING (auth_has_role(ARRAY['admin', 'dispatcher']))
  WITH CHECK (auth_has_role(ARRAY['admin', 'dispatcher']));

-- Tickets (Technicians see assigned, Admin/Dispatcher see all)
DROP POLICY IF EXISTS "tickets_select_policy" ON tickets;
DROP POLICY IF EXISTS "tickets_insert_policy" ON tickets;
DROP POLICY IF EXISTS "tickets_update_policy" ON tickets;

CREATE POLICY "tickets_select"
  ON tickets FOR SELECT
  TO authenticated
  USING (
    auth_has_role(ARRAY['admin', 'dispatcher'])
    OR assigned_to = auth.uid()
    OR EXISTS (
      SELECT 1 FROM ticket_technicians tt
      WHERE tt.ticket_id = tickets.id
      AND tt.technician_id = auth.uid()
    )
  );

CREATE POLICY "tickets_insert"
  ON tickets FOR INSERT
  TO authenticated
  WITH CHECK (auth_has_role(ARRAY['admin', 'dispatcher']));

CREATE POLICY "tickets_update"
  ON tickets FOR UPDATE
  TO authenticated
  USING (
    auth_has_role(ARRAY['admin', 'dispatcher'])
    OR assigned_to = auth.uid()
  )
  WITH CHECK (
    auth_has_role(ARRAY['admin', 'dispatcher'])
    OR assigned_to = auth.uid()
  );

-- Parts (All can view, Admin/Dispatcher can modify)
DROP POLICY IF EXISTS "parts_select_policy" ON parts;
DROP POLICY IF EXISTS "parts_insert_policy" ON parts;
DROP POLICY IF EXISTS "parts_update_policy" ON parts;

CREATE POLICY "parts_select"
  ON parts FOR SELECT
  TO authenticated
  USING (auth_is_active());

CREATE POLICY "parts_insert"
  ON parts FOR INSERT
  TO authenticated
  WITH CHECK (auth_has_role(ARRAY['admin', 'dispatcher']));

CREATE POLICY "parts_update"
  ON parts FOR UPDATE
  TO authenticated
  USING (auth_has_role(ARRAY['admin', 'dispatcher']))
  WITH CHECK (auth_has_role(ARRAY['admin', 'dispatcher']));

-- Ticket Parts Used (Technicians can add to assigned tickets)
DROP POLICY IF EXISTS "ticket_parts_used_select" ON ticket_parts_used;
DROP POLICY IF EXISTS "ticket_parts_used_insert" ON ticket_parts_used;
DROP POLICY IF EXISTS "ticket_parts_used_update" ON ticket_parts_used;
DROP POLICY IF EXISTS "ticket_parts_used_delete" ON ticket_parts_used;

CREATE POLICY "ticket_parts_used_select"
  ON ticket_parts_used FOR SELECT
  TO authenticated
  USING (
    auth_has_role(ARRAY['admin', 'dispatcher'])
    OR EXISTS (
      SELECT 1 FROM tickets t
      WHERE t.id = ticket_parts_used.ticket_id
      AND (t.assigned_to = auth.uid() OR EXISTS (
        SELECT 1 FROM ticket_technicians tt
        WHERE tt.ticket_id = t.id AND tt.technician_id = auth.uid()
      ))
    )
  );

CREATE POLICY "ticket_parts_used_insert"
  ON ticket_parts_used FOR INSERT
  TO authenticated
  WITH CHECK (
    auth_has_role(ARRAY['admin', 'dispatcher'])
    OR EXISTS (
      SELECT 1 FROM tickets t
      WHERE t.id = ticket_parts_used.ticket_id
      AND (t.assigned_to = auth.uid() OR EXISTS (
        SELECT 1 FROM ticket_technicians tt
        WHERE tt.ticket_id = t.id AND tt.technician_id = auth.uid()
      ))
    )
  );

CREATE POLICY "ticket_parts_used_update"
  ON ticket_parts_used FOR UPDATE
  TO authenticated
  USING (auth_has_role(ARRAY['admin', 'dispatcher']))
  WITH CHECK (auth_has_role(ARRAY['admin', 'dispatcher']));

CREATE POLICY "ticket_parts_used_delete"
  ON ticket_parts_used FOR DELETE
  TO authenticated
  USING (auth_is_admin());

-- AHS Warranty Module (Specific Tables)
DROP POLICY IF EXISTS "ticket_fees_select" ON ticket_fees;
CREATE POLICY "ticket_fees_select"
  ON ticket_fees FOR SELECT
  TO authenticated
  USING (
    auth_has_role(ARRAY['admin', 'dispatcher'])
    OR EXISTS (
      SELECT 1 FROM tickets t
      WHERE t.id = ticket_fees.ticket_id
      AND t.assigned_to = auth.uid()
    )
  );

DROP POLICY IF EXISTS "ahs_audit_log_select" ON ahs_audit_log;
CREATE POLICY "ahs_audit_log_select"
  ON ahs_audit_log FOR SELECT
  TO authenticated
  USING (auth_is_admin());

-- MES & Quality Module (Secure by default if tables exist)
DO $$
BEGIN
  -- production_orders
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'production_orders') THEN
    DROP POLICY IF EXISTS "production_orders_select" ON production_orders;
    CREATE POLICY "production_orders_select" ON production_orders FOR SELECT TO authenticated
    USING (auth_has_role(ARRAY['admin', 'dispatcher', 'operator', 'supervisor']));
  END IF;

  -- quality_nonconformances
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'quality_nonconformances') THEN
    DROP POLICY IF EXISTS "quality_nc_select" ON quality_nonconformances;
    CREATE POLICY "quality_nc_select" ON quality_nonconformances FOR SELECT TO authenticated
    USING (auth_has_role(ARRAY['admin', 'dispatcher', 'quality_inspector']));
  END IF;
END $$;

-- ============================================
-- STEP 5: Reload PostgREST schema cache
-- ============================================

NOTIFY pgrst, 'reload schema';
```

### 1.2 Application Order

1. **MES Dev first** (lowest risk) - Test thoroughly
2. **Demo second** - Verify nothing breaks
3. **Production last** - After validation

### 1.3 Verification Checklist

- [ ] Admin can access all features
- [ ] Dispatcher can access operational features
- [ ] Technician can ONLY see assigned tickets
- [ ] Technician CANNOT access GL, Invoices, Payroll
- [ ] New signup gets `technician` role (not admin)
- [ ] Deactivated user cannot access anything

---

## Phase 2: Data Integrity Fixes (Days 4-6)

### 2.1 Consolidate parts_usage → ticket_parts_used

**File**: `migrations/20260209_001_consolidate_parts_usage.sql`

```sql
/*
  Consolidate legacy parts_usage table into ticket_parts_used
  This eliminates the "Double Ledger" problem
*/

-- Step 1: Migrate any orphaned data
INSERT INTO ticket_parts_used (ticket_id, part_id, quantity, unit_cost, created_at)
SELECT
  pu.ticket_id,
  pu.part_id,
  pu.quantity,
  COALESCE(pu.unit_cost, p.unit_cost, 0),
  pu.created_at
FROM parts_usage pu
JOIN parts p ON p.id = pu.part_id
WHERE NOT EXISTS (
  SELECT 1 FROM ticket_parts_used tpu
  WHERE tpu.ticket_id = pu.ticket_id
  AND tpu.part_id = pu.part_id
  AND tpu.created_at = pu.created_at
);

-- Step 2: Drop legacy table (after verification)
-- UNCOMMENT AFTER VERIFYING DATA MIGRATED
-- DROP TABLE IF EXISTS parts_usage CASCADE;

-- Step 3: Update any views/functions referencing parts_usage
-- (List all and update)

-- Step 4: [CRITICAL] Verify frontend / BI module for legacy references
-- Search: grep -r "parts_usage" src/components/BI
```

### 2.2 Replace Auto-Numbering with Sequences

**File**: `migrations/20260209_002_fix_auto_numbering.sql`

```sql
/*
  Replace MAX()+1 anti-pattern with proper SEQUENCES
  Eliminates race conditions
*/

-- Invoice Numbers
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START 1;

-- Set sequence to current max
SELECT setval('invoice_number_seq',
  COALESCE((SELECT MAX(CAST(SUBSTRING(invoice_number FROM '[0-9]+') AS integer)) FROM invoices), 0) + 1
);

CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN 'INV-' || LPAD(nextval('invoice_number_seq')::text, 6, '0');
END;
$$;

-- Project Numbers
CREATE SEQUENCE IF NOT EXISTS project_number_seq START 1;

SELECT setval('project_number_seq',
  COALESCE((SELECT MAX(CAST(SUBSTRING(project_number FROM '[0-9]+') AS integer)) FROM projects), 0) + 1
);

CREATE OR REPLACE FUNCTION public.generate_project_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN 'PRJ-' || LPAD(nextval('project_number_seq')::text, 6, '0');
END;
$$;

-- PO Numbers
CREATE SEQUENCE IF NOT EXISTS po_number_seq START 1;

SELECT setval('po_number_seq',
  COALESCE((SELECT MAX(CAST(SUBSTRING(po_number FROM '[0-9]+') AS integer)) FROM purchase_orders), 0) + 1
);

CREATE OR REPLACE FUNCTION public.generate_po_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN 'PO-' || LPAD(nextval('po_number_seq')::text, 6, '0');
END;
$$;

-- Ticket Numbers
CREATE SEQUENCE IF NOT EXISTS ticket_number_seq START 1;

SELECT setval('ticket_number_seq',
  COALESCE((SELECT MAX(CAST(SUBSTRING(ticket_number FROM '[0-9]+') AS integer)) FROM tickets), 0) + 1
);

CREATE OR REPLACE FUNCTION public.generate_ticket_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN 'TKT-' || LPAD(nextval('ticket_number_seq')::text, 6, '0');
END;
$$;

-- Production Order Numbers (MES)
CREATE SEQUENCE IF NOT EXISTS production_order_number_seq START 1;

SELECT setval('production_order_number_seq',
  COALESCE((SELECT MAX(CAST(SUBSTRING(order_number FROM '[0-9]+') AS integer)) FROM production_orders), 0) + 1
);

CREATE OR REPLACE FUNCTION public.generate_production_order_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN 'PO-' || TO_CHAR(CURRENT_DATE, 'YY') || '-' || LPAD(nextval('production_order_number_seq')::text, 5, '0');
END;
$$;

-- Quality Inspection Numbers (MES)
CREATE SEQUENCE IF NOT EXISTS quality_inspection_number_seq START 1;

SELECT setval('quality_inspection_number_seq',
  COALESCE((SELECT MAX(CAST(SUBSTRING(run_number FROM '[0-9]+') AS integer)) FROM quality_inspection_runs), 0) + 1
);
```

### 2.3 Add Missing Foreign Key Cascades

**File**: `migrations/20260209_003_fix_cascades.sql`

```sql
/*
  Add proper ON DELETE CASCADE to prevent orphaned records
*/

-- Invoice Lines
ALTER TABLE invoice_lines
  DROP CONSTRAINT IF EXISTS invoice_lines_invoice_id_fkey,
  ADD CONSTRAINT invoice_lines_invoice_id_fkey
    FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE;

-- Ticket Parts Used
ALTER TABLE ticket_parts_used
  DROP CONSTRAINT IF EXISTS ticket_parts_used_ticket_id_fkey,
  ADD CONSTRAINT ticket_parts_used_ticket_id_fkey
    FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE;

-- Ticket Notes
ALTER TABLE ticket_notes
  DROP CONSTRAINT IF EXISTS ticket_notes_ticket_id_fkey,
  ADD CONSTRAINT ticket_notes_ticket_id_fkey
    FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE;

-- Project Phases
ALTER TABLE project_phases
  DROP CONSTRAINT IF EXISTS project_phases_project_id_fkey,
  ADD CONSTRAINT project_phases_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

-- Project Tasks
ALTER TABLE project_tasks
  DROP CONSTRAINT IF EXISTS project_tasks_phase_id_fkey,
  ADD CONSTRAINT project_tasks_phase_id_fkey
    FOREIGN KEY (phase_id) REFERENCES project_phases(id) ON DELETE CASCADE;

-- Purchase Order Lines
ALTER TABLE purchase_order_lines
  DROP CONSTRAINT IF EXISTS purchase_order_lines_po_id_fkey,
  ADD CONSTRAINT purchase_order_lines_po_id_fkey
    FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE CASCADE;

-- Estimate Lines
ALTER TABLE estimate_lines
  DROP CONSTRAINT IF EXISTS estimate_lines_estimate_id_fkey,
  ADD CONSTRAINT estimate_lines_estimate_id_fkey
    FOREIGN KEY (estimate_id) REFERENCES estimates(id) ON DELETE CASCADE;
```

---

## Phase 3: Schema Improvements (Days 7-9)

### 3.1 Add ENUMs for TEXT Status Fields

**File**: `migrations/20260209_004_add_enums.sql`

```sql
/*
  Convert TEXT status fields to ENUMs for data integrity
*/

-- Project Status
DO $$ BEGIN
  CREATE TYPE project_status_enum AS ENUM (
    'planning', 'in_progress', 'on_hold', 'completed', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Only convert if column is TEXT
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'status' AND data_type = 'text'
  ) THEN
    ALTER TABLE projects
      ALTER COLUMN status TYPE project_status_enum
      USING status::project_status_enum;
  END IF;
END $$;

-- Estimate Status
DO $$ BEGIN
  CREATE TYPE estimate_status_enum AS ENUM (
    'draft', 'sent', 'viewed', 'accepted', 'rejected', 'expired', 'converted'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Purchase Order Status
DO $$ BEGIN
  CREATE TYPE po_status_enum AS ENUM (
    'draft', 'submitted', 'approved', 'partial', 'received', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
```

### 3.2 Add Audit Trail Columns

**File**: `migrations/20260209_005_add_audit_columns.sql`

```sql
/*
  Add audit columns to critical tables
*/

-- Function to auto-update audit fields
CREATE OR REPLACE FUNCTION update_audit_fields()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  NEW.updated_by = auth.uid();
  IF TG_OP = 'INSERT' THEN
    NEW.created_by = COALESCE(NEW.created_by, auth.uid());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add columns to invoice_payments
ALTER TABLE invoice_payments
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

DROP TRIGGER IF EXISTS invoice_payments_audit ON invoice_payments;
CREATE TRIGGER invoice_payments_audit
  BEFORE INSERT OR UPDATE ON invoice_payments
  FOR EACH ROW EXECUTE FUNCTION update_audit_fields();

-- Add columns to inventory_movements
ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

DROP TRIGGER IF EXISTS inventory_movements_audit ON inventory_movements;
CREATE TRIGGER inventory_movements_audit
  BEFORE INSERT OR UPDATE ON inventory_movements
  FOR EACH ROW EXECUTE FUNCTION update_audit_fields();

-- Add columns to gl_entry_lines
ALTER TABLE gl_entry_lines
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

DROP TRIGGER IF EXISTS gl_entry_lines_audit ON gl_entry_lines;
CREATE TRIGGER gl_entry_lines_audit
  BEFORE INSERT OR UPDATE ON gl_entry_lines
  FOR EACH ROW EXECUTE FUNCTION update_audit_fields();
```

---

## Phase 4: MES Module Completion (Days 10-12)

### 4.1 Verify MES Tables Exist

Run verification query on MES environment:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN (
  'work_centers',
  'production_orders',
  'production_steps',
  'bill_of_materials',
  'production_time_logs',
  'material_move_requests',
  'wip_tracking',
  'equipment_assets',
  'equipment_state_events',
  'downtime_events',
  'downtime_reason_codes',
  'production_operation_runs',
  'production_counts',
  'oee_snapshots',
  'quality_inspection_plans',
  'quality_characteristics',
  'quality_inspection_runs',
  'quality_measurements',
  'quality_defect_codes',
  'quality_nonconformances'
);
```

### 4.2 Fix MES RLS Policies

Apply same security pattern to MES tables:

```sql
-- Work Centers (All can view, Admin can modify)
CREATE POLICY "work_centers_select"
  ON work_centers FOR SELECT
  TO authenticated
  USING (auth_is_active());

CREATE POLICY "work_centers_modify"
  ON work_centers FOR ALL
  TO authenticated
  USING (auth_is_admin())
  WITH CHECK (auth_is_admin());

-- Production Orders (Operator+)
CREATE POLICY "production_orders_select"
  ON production_orders FOR SELECT
  TO authenticated
  USING (auth_has_role(ARRAY['admin', 'dispatcher', 'operator', 'supervisor']));

CREATE POLICY "production_orders_insert"
  ON production_orders FOR INSERT
  TO authenticated
  WITH CHECK (auth_has_role(ARRAY['admin', 'dispatcher', 'supervisor']));

-- Continue for all MES tables...
```

### 4.3 Verify MES Views

```sql
-- Check views exist
SELECT viewname FROM pg_views
WHERE schemaname = 'public'
AND viewname IN (
  'vw_work_center_schedule',
  'vw_oee_summary',
  'vw_downtime_log'
);
```

---

## Phase 5: Testing & Validation (Days 13-14)

### 5.1 Security Test Matrix

| Test | Expected Result | MES | Demo | Prod |
|------|-----------------|-----|------|------|
| New signup gets technician role | `role = 'technician'` | [ ] | [ ] | [ ] |
| Technician cannot view GL entries | 403/empty result | [ ] | [ ] | [ ] |
| Technician cannot view payroll | 403/empty result | [ ] | [ ] | [ ] |
| Technician can view assigned tickets | Returns data | [ ] | [ ] | [ ] |
| Technician cannot view other tickets | Empty result | [ ] | [ ] | [ ] |
| Deactivated user blocked | Auth fails | [ ] | [ ] | [ ] |
| Admin can access everything | Full access | [ ] | [ ] | [ ] |

### 5.2 Functional Test Matrix

| Module | Test | MES | Demo | Prod |
|--------|------|-----|------|------|
| Tickets | Create, assign, complete | [ ] | [ ] | [ ] |
| Invoicing | Generate from ticket | [ ] | [ ] | [ ] |
| Inventory | Deduct on part usage | [ ] | [ ] | [ ] |
| Projects | Create with phases/tasks | [ ] | [ ] | [ ] |
| Estimates | Create, send, convert | [ ] | [ ] | [ ] |
| GL | Journal entries post | [ ] | [ ] | [ ] |
| MES - Orders | Create, schedule, run | [ ] | N/A | N/A |
| MES - OEE | Calculate, display | [ ] | N/A | N/A |
| MES - Quality | Inspection runs | [ ] | N/A | N/A |

### 5.3 Load Test

```bash
# Simulate concurrent ticket creation
for i in {1..10}; do
  curl -X POST "$SUPABASE_URL/rest/v1/tickets" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"customer_id": "...", "title": "Test '$i'"}' &
done
wait

# Verify no duplicate ticket numbers
SELECT ticket_number, COUNT(*)
FROM tickets
GROUP BY ticket_number
HAVING COUNT(*) > 1;
```

---

## Phase 6: Deployment (Day 15)

### 6.1 Deployment Order

1. **MES Dev** (vijbnq) - Full test
2. **Demo** (uuarbd) - User acceptance
3. **Production** (trtqrdpl) - Final deploy

### 6.2 Pre-Deployment Checklist

- [ ] Backup all three databases
- [ ] Document current state
- [ ] Test migrations on MES first
- [ ] Verify no breaking changes
- [ ] Update environment variables if needed
- [ ] Notify stakeholders

### 6.3 Rollback Plan

```sql
-- Save current policy state before migration
CREATE TABLE IF NOT EXISTS _policy_backup AS
SELECT * FROM pg_policies WHERE schemaname = 'public';

-- Rollback script (if needed)
-- DROP all new policies
-- Recreate from backup
```

---

## Ongoing Maintenance

### Weekly Security Audit Query

```sql
-- Check for any USING(true) policies
SELECT tablename, policyname, qual
FROM pg_policies
WHERE schemaname = 'public'
AND qual::text LIKE '%true%';

-- Should return 0 rows after fixes
```

### Migration Consolidation (Monthly)

After 6 months of stability, consider:
1. Creating a fresh "baseline" migration
2. Archiving old migrations
3. Documenting final schema state

---

## Risk Matrix

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| RLS policy breaks existing feature | Medium | High | Test on MES first |
| Sequence number gap | Low | Low | Acceptable, use nextval |
| Data loss during migration | Low | Critical | Backup before each step |
| Performance regression | Medium | Medium | Monitor query times |

---

## Success Criteria

1. **Security**: Zero `USING(true)` policies remain
2. **Data Integrity**: Zero duplicate auto-numbers after load test
3. **Functionality**: All modules pass test matrix
4. **Performance**: Dashboard loads in < 2 seconds
5. **Audit**: All critical tables have audit columns

---

## Timeline Summary

| Phase | Duration | Focus |
|-------|----------|-------|
| Phase 1 | Days 1-3 | Security hardening |
| Phase 2 | Days 4-6 | Data integrity |
| Phase 3 | Days 7-9 | Schema improvements |
| Phase 4 | Days 10-12 | MES completion |
| Phase 5 | Days 13-14 | Testing |
| Phase 6 | Day 15 | Deployment |

**Total: ~3 weeks to production-ready state**

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-02-08 | Claude Code | Initial plan |
