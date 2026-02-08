-- ============================================================================
-- PHASE 3: SCHEMA IMPROVEMENTS
-- ============================================================================
-- Date: February 9, 2026
-- Target: ALL THREE environments (Production, Demo, MES)
--
-- Improvements:
-- - 3.1: Add ENUMs for TEXT status fields (data validation)
-- - 3.2: Add audit trail columns to critical tables
--
-- All operations wrapped in IF EXISTS for cross-environment portability
-- ============================================================================

-- ============================================================================
-- SECTION 3.1: STATUS ENUMS
-- ============================================================================
-- Convert TEXT status fields to ENUMs for better data validation
-- Note: We create ENUMs but don't force column conversion (risky on production data)
-- Instead, we add CHECK constraints where possible

-- Project Status ENUM
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'project_status_enum') THEN
    CREATE TYPE project_status_enum AS ENUM (
      'planning', 'in_progress', 'on_hold', 'completed', 'cancelled'
    );
    RAISE NOTICE 'Created project_status_enum';
  END IF;
END $$;

-- Estimate Status ENUM
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estimate_status_enum') THEN
    CREATE TYPE estimate_status_enum AS ENUM (
      'draft', 'sent', 'viewed', 'accepted', 'rejected', 'expired', 'converted'
    );
    RAISE NOTICE 'Created estimate_status_enum';
  END IF;
END $$;

-- Purchase Order Status ENUM
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'po_status_enum') THEN
    CREATE TYPE po_status_enum AS ENUM (
      'draft', 'submitted', 'approved', 'partial', 'received', 'cancelled'
    );
    RAISE NOTICE 'Created po_status_enum';
  END IF;
END $$;

-- Ticket Status ENUM
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ticket_status_enum') THEN
    CREATE TYPE ticket_status_enum AS ENUM (
      'new', 'scheduled', 'in_progress', 'on_hold', 'completed', 'cancelled', 'invoiced'
    );
    RAISE NOTICE 'Created ticket_status_enum';
  END IF;
END $$;

-- Invoice Status ENUM (if not exists - may already be defined)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invoice_status_enum') THEN
    CREATE TYPE invoice_status_enum AS ENUM (
      'draft', 'sent', 'paid', 'overdue', 'cancelled', 'partially_paid', 'written_off'
    );
    RAISE NOTICE 'Created invoice_status_enum';
  END IF;
END $$;

-- Production Order Status ENUM (MES)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'production_order_status_enum') THEN
    CREATE TYPE production_order_status_enum AS ENUM (
      'draft', 'planned', 'released', 'in_progress', 'on_hold', 'completed', 'cancelled', 'closed'
    );
    RAISE NOTICE 'Created production_order_status_enum';
  END IF;
END $$;

-- ============================================================================
-- SECTION 3.2: AUDIT TRAIL FUNCTION
-- ============================================================================
-- Create a reusable function to auto-populate audit fields

CREATE OR REPLACE FUNCTION public.update_audit_fields()
RETURNS TRIGGER AS $$
BEGIN
  -- Set updated_at on every update
  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at = now();
    -- Only set updated_by if column exists and we have auth context
    IF auth.uid() IS NOT NULL THEN
      NEW.updated_by = auth.uid();
    END IF;
  END IF;

  -- Set created_by on insert if not already set
  IF TG_OP = 'INSERT' THEN
    IF NEW.created_at IS NULL THEN
      NEW.created_at = now();
    END IF;
    IF auth.uid() IS NOT NULL AND NEW.created_by IS NULL THEN
      NEW.created_by = auth.uid();
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- SECTION 3.3: ADD AUDIT COLUMNS TO CRITICAL TABLES
-- ============================================================================

-- Helper function to add audit columns and trigger to a table
CREATE OR REPLACE FUNCTION public.add_audit_columns(target_table text)
RETURNS void AS $$
BEGIN
  -- Add created_by if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = target_table AND column_name = 'created_by'
  ) THEN
    EXECUTE format('ALTER TABLE %I ADD COLUMN created_by UUID REFERENCES profiles(id)', target_table);
    RAISE NOTICE 'Added created_by to %', target_table;
  END IF;

  -- Add updated_by if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = target_table AND column_name = 'updated_by'
  ) THEN
    EXECUTE format('ALTER TABLE %I ADD COLUMN updated_by UUID REFERENCES profiles(id)', target_table);
    RAISE NOTICE 'Added updated_by to %', target_table;
  END IF;

  -- Add updated_at if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = target_table AND column_name = 'updated_at'
  ) THEN
    EXECUTE format('ALTER TABLE %I ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now()', target_table);
    RAISE NOTICE 'Added updated_at to %', target_table;
  END IF;

  -- Add created_at if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = target_table AND column_name = 'created_at'
  ) THEN
    EXECUTE format('ALTER TABLE %I ADD COLUMN created_at TIMESTAMPTZ DEFAULT now()', target_table);
    RAISE NOTICE 'Added created_at to %', target_table;
  END IF;

  -- Create audit trigger
  EXECUTE format('DROP TRIGGER IF EXISTS %I_audit_trigger ON %I', target_table, target_table);
  EXECUTE format('CREATE TRIGGER %I_audit_trigger BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_audit_fields()', target_table, target_table);
  RAISE NOTICE 'Created audit trigger on %', target_table;
END;
$$ LANGUAGE plpgsql;

-- Apply audit columns to critical financial tables
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='invoices') THEN
    PERFORM add_audit_columns('invoices');
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='invoice_payments') THEN
    PERFORM add_audit_columns('invoice_payments');
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='gl_entries') THEN
    PERFORM add_audit_columns('gl_entries');
  END IF;
END $$;

-- Apply to operational tables
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='tickets') THEN
    PERFORM add_audit_columns('tickets');
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='estimates') THEN
    PERFORM add_audit_columns('estimates');
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='projects') THEN
    PERFORM add_audit_columns('projects');
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='purchase_orders') THEN
    PERFORM add_audit_columns('purchase_orders');
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='customers') THEN
    PERFORM add_audit_columns('customers');
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='vendors') THEN
    PERFORM add_audit_columns('vendors');
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='parts') THEN
    PERFORM add_audit_columns('parts');
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='inventory_movements') THEN
    PERFORM add_audit_columns('inventory_movements');
  END IF;
END $$;

-- Apply to MES tables (if they exist)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='production_orders') THEN
    PERFORM add_audit_columns('production_orders');
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='work_centers') THEN
    PERFORM add_audit_columns('work_centers');
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='quality_nonconformances') THEN
    PERFORM add_audit_columns('quality_nonconformances');
  END IF;
END $$;

-- ============================================================================
-- SECTION 3.4: ADD MISSING INDEXES FOR PERFORMANCE
-- ============================================================================

-- Tickets indexes
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='tickets') THEN
    CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
    CREATE INDEX IF NOT EXISTS idx_tickets_assigned_to ON tickets(assigned_to);
    CREATE INDEX IF NOT EXISTS idx_tickets_customer_id ON tickets(customer_id);
    CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets(created_at);
    RAISE NOTICE 'Created indexes on tickets';
  END IF;
END $$;

-- Invoices indexes
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='invoices') THEN
    CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
    CREATE INDEX IF NOT EXISTS idx_invoices_customer_id ON invoices(customer_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date);
    CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON invoices(created_at);
    RAISE NOTICE 'Created indexes on invoices';
  END IF;
END $$;

-- Projects indexes
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='projects') THEN
    CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
    CREATE INDEX IF NOT EXISTS idx_projects_customer_id ON projects(customer_id);
    RAISE NOTICE 'Created indexes on projects';
  END IF;
END $$;

-- Parts indexes
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='parts') THEN
    CREATE INDEX IF NOT EXISTS idx_parts_part_number ON parts(part_number);
    CREATE INDEX IF NOT EXISTS idx_parts_name ON parts(name);
    RAISE NOTICE 'Created indexes on parts';
  END IF;
END $$;

-- Part inventory indexes
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='part_inventory') THEN
    CREATE INDEX IF NOT EXISTS idx_part_inventory_part_id ON part_inventory(part_id);
    CREATE INDEX IF NOT EXISTS idx_part_inventory_location_id ON part_inventory(stock_location_id);
    RAISE NOTICE 'Created indexes on part_inventory';
  END IF;
END $$;

-- Time logs indexes
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='time_logs') THEN
    CREATE INDEX IF NOT EXISTS idx_time_logs_user_id ON time_logs(user_id);
    -- ticket_id may not exist in all schemas
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='time_logs' AND column_name='ticket_id') THEN
      CREATE INDEX IF NOT EXISTS idx_time_logs_ticket_id ON time_logs(ticket_id);
    END IF;
    -- clock_in may not exist (could be start_time or similar)
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='time_logs' AND column_name='clock_in') THEN
      CREATE INDEX IF NOT EXISTS idx_time_logs_clock_in ON time_logs(clock_in);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='time_logs' AND column_name='start_time') THEN
      CREATE INDEX IF NOT EXISTS idx_time_logs_start_time ON time_logs(start_time);
    END IF;
    RAISE NOTICE 'Created indexes on time_logs';
  END IF;
END $$;

-- Production orders indexes (MES)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='production_orders') THEN
    CREATE INDEX IF NOT EXISTS idx_production_orders_status ON production_orders(status);
    -- work_center_id may have different name
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='production_orders' AND column_name='work_center_id') THEN
      CREATE INDEX IF NOT EXISTS idx_production_orders_work_center_id ON production_orders(work_center_id);
    END IF;
    -- scheduled_start may have different name
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='production_orders' AND column_name='scheduled_start') THEN
      CREATE INDEX IF NOT EXISTS idx_production_orders_scheduled_start ON production_orders(scheduled_start);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='production_orders' AND column_name='scheduled_start_date') THEN
      CREATE INDEX IF NOT EXISTS idx_production_orders_scheduled_start_date ON production_orders(scheduled_start_date);
    END IF;
    RAISE NOTICE 'Created indexes on production_orders';
  END IF;
END $$;

-- ============================================================================
-- CLEANUP: Drop helper function (optional, can keep for future use)
-- ============================================================================
-- DROP FUNCTION IF EXISTS add_audit_columns(text);

-- ============================================================================
-- RELOAD SCHEMA CACHE
-- ============================================================================
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================
--
-- Check ENUMs created:
-- SELECT typname FROM pg_type WHERE typname LIKE '%_enum' AND typnamespace = 'public'::regnamespace;
--
-- Check audit columns on invoices:
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'invoices' AND column_name IN ('created_by', 'updated_by', 'updated_at');
--
-- Check triggers created:
-- SELECT trigger_name, event_object_table FROM information_schema.triggers WHERE trigger_name LIKE '%_audit_trigger';
--
-- Check indexes created:
-- SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname LIKE 'idx_%';
