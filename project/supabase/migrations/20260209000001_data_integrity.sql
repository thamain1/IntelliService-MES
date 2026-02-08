-- ============================================================================
-- PHASE 2: DATA INTEGRITY MIGRATION
-- ============================================================================
-- Date: February 9, 2026
-- Target: ALL THREE environments (Production, Demo, MES)
--
-- Fixes:
-- - 2.1: Consolidate parts_usage into ticket_parts_used (prepare for deprecation)
-- - 2.2: Replace MAX()+1 auto-numbering with sequences
-- - 2.3: Add missing foreign key cascades
--
-- All operations wrapped in IF EXISTS for cross-environment portability
-- ============================================================================

-- ============================================================================
-- SECTION 2.1: CONSOLIDATE PARTS_USAGE
-- ============================================================================
-- The parts_usage table duplicates ticket_parts_used functionality
-- This section migrates any orphaned data and creates a view for backwards compatibility

DO $$
DECLARE
  has_unit_cost boolean;
BEGIN
  -- Only run if both tables exist
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='parts_usage')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='ticket_parts_used') THEN

    -- Check if ticket_parts_used has unit_cost column
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='ticket_parts_used' AND column_name='unit_cost'
    ) INTO has_unit_cost;

    IF has_unit_cost THEN
      -- Migrate with unit_cost
      INSERT INTO ticket_parts_used (ticket_id, part_id, quantity, unit_cost, created_at)
      SELECT
        pu.ticket_id,
        pu.part_id,
        pu.quantity_used,
        COALESCE(p.unit_cost, 0),
        pu.created_at
      FROM parts_usage pu
      LEFT JOIN parts p ON p.id = pu.part_id
      WHERE pu.ticket_id IS NOT NULL
        AND pu.part_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM ticket_parts_used tpu
          WHERE tpu.ticket_id = pu.ticket_id
          AND tpu.part_id = pu.part_id
          AND DATE(tpu.created_at) = DATE(pu.created_at)
        )
      ON CONFLICT DO NOTHING;
    ELSE
      -- Migrate without unit_cost
      INSERT INTO ticket_parts_used (ticket_id, part_id, quantity, created_at)
      SELECT
        pu.ticket_id,
        pu.part_id,
        pu.quantity_used,
        pu.created_at
      FROM parts_usage pu
      WHERE pu.ticket_id IS NOT NULL
        AND pu.part_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM ticket_parts_used tpu
          WHERE tpu.ticket_id = pu.ticket_id
          AND tpu.part_id = pu.part_id
          AND DATE(tpu.created_at) = DATE(pu.created_at)
        )
      ON CONFLICT DO NOTHING;
    END IF;

    RAISE NOTICE 'Migrated orphaned parts_usage records to ticket_parts_used';
  END IF;
END $$;

-- Create backwards-compatible view for parts_usage queries
-- This allows existing code to work while we transition
DO $$
DECLARE
  has_unit_cost boolean;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='ticket_parts_used') THEN
    -- Drop existing view if any
    DROP VIEW IF EXISTS vw_parts_usage_compat;

    -- Check if ticket_parts_used has unit_cost column
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='ticket_parts_used' AND column_name='unit_cost'
    ) INTO has_unit_cost;

    IF has_unit_cost THEN
      CREATE VIEW vw_parts_usage_compat AS
      SELECT
        tpu.id,
        tpu.ticket_id,
        tpu.part_id,
        tpu.quantity as quantity_used,
        tpu.unit_cost,
        tpu.created_at,
        NULL::uuid as recorded_by
      FROM ticket_parts_used tpu;
    ELSE
      CREATE VIEW vw_parts_usage_compat AS
      SELECT
        tpu.id,
        tpu.ticket_id,
        tpu.part_id,
        tpu.quantity as quantity_used,
        0::numeric as unit_cost,
        tpu.created_at,
        NULL::uuid as recorded_by
      FROM ticket_parts_used tpu;
    END IF;

    RAISE NOTICE 'Created vw_parts_usage_compat view';
  END IF;
END $$;

-- NOTE: Do NOT drop parts_usage table yet - code still references it
-- After frontend is updated to use ticket_parts_used, run:
-- DROP TABLE IF EXISTS parts_usage CASCADE;

-- ============================================================================
-- SECTION 2.2: SEQUENCE-BASED AUTO-NUMBERING
-- ============================================================================
-- Replace MAX()+1 pattern with proper sequences to prevent race conditions

-- Invoice Numbers
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq;

DO $$
DECLARE
  max_num bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='invoices') THEN
    SELECT COALESCE(MAX(
      CASE
        WHEN invoice_number ~ '^[A-Z]+-[0-9]+$' THEN CAST(SUBSTRING(invoice_number FROM '[0-9]+$') AS bigint)
        WHEN invoice_number ~ '^[0-9]+$' THEN CAST(invoice_number AS bigint)
        ELSE 0
      END
    ), 0) INTO max_num FROM invoices;

    IF max_num > 0 THEN
      PERFORM setval('invoice_number_seq', max_num);
    END IF;
    RAISE NOTICE 'Invoice sequence set to %', max_num;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN 'INV-' || LPAD(nextval('invoice_number_seq')::text, 6, '0');
END;
$$;

-- Ticket Numbers
CREATE SEQUENCE IF NOT EXISTS ticket_number_seq;

DO $$
DECLARE
  max_num bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='tickets') THEN
    SELECT COALESCE(MAX(
      CASE
        WHEN ticket_number ~ '^[A-Z]+-[0-9]+$' THEN CAST(SUBSTRING(ticket_number FROM '[0-9]+$') AS bigint)
        WHEN ticket_number ~ '^[0-9]+$' THEN CAST(ticket_number AS bigint)
        ELSE 0
      END
    ), 0) INTO max_num FROM tickets;

    IF max_num > 0 THEN
      PERFORM setval('ticket_number_seq', max_num);
    END IF;
    RAISE NOTICE 'Ticket sequence set to %', max_num;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.generate_ticket_number()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN 'TKT-' || LPAD(nextval('ticket_number_seq')::text, 6, '0');
END;
$$;

-- Project Numbers
CREATE SEQUENCE IF NOT EXISTS project_number_seq;

DO $$
DECLARE
  max_num bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='projects') THEN
    SELECT COALESCE(MAX(
      CASE
        WHEN project_number ~ '^[A-Z]+-[0-9]+$' THEN CAST(SUBSTRING(project_number FROM '[0-9]+$') AS bigint)
        WHEN project_number ~ '^[0-9]+$' THEN CAST(project_number AS bigint)
        ELSE 0
      END
    ), 0) INTO max_num FROM projects;

    IF max_num > 0 THEN
      PERFORM setval('project_number_seq', max_num);
    END IF;
    RAISE NOTICE 'Project sequence set to %', max_num;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.generate_project_number()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN 'PRJ-' || LPAD(nextval('project_number_seq')::text, 6, '0');
END;
$$;

-- Purchase Order Numbers
CREATE SEQUENCE IF NOT EXISTS po_number_seq;

DO $$
DECLARE
  max_num bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='purchase_orders') THEN
    SELECT COALESCE(MAX(
      CASE
        WHEN po_number ~ '^[A-Z]+-[0-9]+$' THEN CAST(SUBSTRING(po_number FROM '[0-9]+$') AS bigint)
        WHEN po_number ~ '^[0-9]+$' THEN CAST(po_number AS bigint)
        ELSE 0
      END
    ), 0) INTO max_num FROM purchase_orders;

    IF max_num > 0 THEN
      PERFORM setval('po_number_seq', max_num);
    END IF;
    RAISE NOTICE 'PO sequence set to %', max_num;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.generate_po_number()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN 'PO-' || LPAD(nextval('po_number_seq')::text, 6, '0');
END;
$$;

-- Estimate Numbers
CREATE SEQUENCE IF NOT EXISTS estimate_number_seq;

DO $$
DECLARE
  max_num bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='estimates') THEN
    SELECT COALESCE(MAX(
      CASE
        WHEN estimate_number ~ '^[A-Z]+-[0-9]+$' THEN CAST(SUBSTRING(estimate_number FROM '[0-9]+$') AS bigint)
        WHEN estimate_number ~ '^[0-9]+$' THEN CAST(estimate_number AS bigint)
        ELSE 0
      END
    ), 0) INTO max_num FROM estimates;

    IF max_num > 0 THEN
      PERFORM setval('estimate_number_seq', max_num);
    END IF;
    RAISE NOTICE 'Estimate sequence set to %', max_num;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.generate_estimate_number()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN 'EST-' || LPAD(nextval('estimate_number_seq')::text, 6, '0');
END;
$$;

-- Production Order Numbers (MES only)
CREATE SEQUENCE IF NOT EXISTS production_order_number_seq;

DO $$
DECLARE
  max_num bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='production_orders') THEN
    SELECT COALESCE(MAX(
      CASE
        WHEN order_number ~ '[0-9]+' THEN CAST(SUBSTRING(order_number FROM '[0-9]+$') AS bigint)
        ELSE 0
      END
    ), 0) INTO max_num FROM production_orders;

    IF max_num > 0 THEN
      PERFORM setval('production_order_number_seq', max_num);
    END IF;
    RAISE NOTICE 'Production order sequence set to %', max_num;
  END IF;
END $$;

-- Only create if function doesn't exist (MES already has this with a trigger)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'generate_production_order_number') THEN
    CREATE FUNCTION public.generate_production_order_number()
    RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
    BEGIN
      RETURN 'WO-' || TO_CHAR(CURRENT_DATE, 'YY') || '-' || LPAD(nextval('production_order_number_seq')::text, 5, '0');
    END;
    $fn$;
    RAISE NOTICE 'Created generate_production_order_number function';
  ELSE
    RAISE NOTICE 'generate_production_order_number already exists, skipping';
  END IF;
END $$;

-- ============================================================================
-- SECTION 2.3: FOREIGN KEY CASCADES
-- ============================================================================
-- Add ON DELETE CASCADE to prevent orphaned records

-- Invoice Lines -> Invoices
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='invoice_lines') THEN
    ALTER TABLE invoice_lines DROP CONSTRAINT IF EXISTS invoice_lines_invoice_id_fkey;
    ALTER TABLE invoice_lines ADD CONSTRAINT invoice_lines_invoice_id_fkey
      FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added CASCADE to invoice_lines.invoice_id';
  END IF;
END $$;

-- Ticket Parts Used -> Tickets
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='ticket_parts_used') THEN
    ALTER TABLE ticket_parts_used DROP CONSTRAINT IF EXISTS ticket_parts_used_ticket_id_fkey;
    ALTER TABLE ticket_parts_used ADD CONSTRAINT ticket_parts_used_ticket_id_fkey
      FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added CASCADE to ticket_parts_used.ticket_id';
  END IF;
END $$;

-- Ticket Parts Planned -> Tickets
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='ticket_parts_planned') THEN
    ALTER TABLE ticket_parts_planned DROP CONSTRAINT IF EXISTS ticket_parts_planned_ticket_id_fkey;
    ALTER TABLE ticket_parts_planned ADD CONSTRAINT ticket_parts_planned_ticket_id_fkey
      FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added CASCADE to ticket_parts_planned.ticket_id';
  END IF;
END $$;

-- Ticket Notes -> Tickets
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='ticket_notes') THEN
    ALTER TABLE ticket_notes DROP CONSTRAINT IF EXISTS ticket_notes_ticket_id_fkey;
    ALTER TABLE ticket_notes ADD CONSTRAINT ticket_notes_ticket_id_fkey
      FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added CASCADE to ticket_notes.ticket_id';
  END IF;
END $$;

-- Ticket Technicians -> Tickets
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='ticket_technicians') THEN
    ALTER TABLE ticket_technicians DROP CONSTRAINT IF EXISTS ticket_technicians_ticket_id_fkey;
    ALTER TABLE ticket_technicians ADD CONSTRAINT ticket_technicians_ticket_id_fkey
      FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added CASCADE to ticket_technicians.ticket_id';
  END IF;
END $$;

-- Ticket Fees -> Tickets (AHS)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='ticket_fees') THEN
    ALTER TABLE ticket_fees DROP CONSTRAINT IF EXISTS ticket_fees_ticket_id_fkey;
    ALTER TABLE ticket_fees ADD CONSTRAINT ticket_fees_ticket_id_fkey
      FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added CASCADE to ticket_fees.ticket_id';
  END IF;
END $$;

-- Project Phases -> Projects
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='project_phases') THEN
    ALTER TABLE project_phases DROP CONSTRAINT IF EXISTS project_phases_project_id_fkey;
    ALTER TABLE project_phases ADD CONSTRAINT project_phases_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added CASCADE to project_phases.project_id';
  END IF;
END $$;

-- Project Tasks -> Project Phases
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='project_tasks') THEN
    ALTER TABLE project_tasks DROP CONSTRAINT IF EXISTS project_tasks_phase_id_fkey;
    ALTER TABLE project_tasks ADD CONSTRAINT project_tasks_phase_id_fkey
      FOREIGN KEY (phase_id) REFERENCES project_phases(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added CASCADE to project_tasks.phase_id';
  END IF;
END $$;

-- Purchase Order Lines -> Purchase Orders
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='purchase_order_lines') THEN
    ALTER TABLE purchase_order_lines DROP CONSTRAINT IF EXISTS purchase_order_lines_po_id_fkey;
    ALTER TABLE purchase_order_lines DROP CONSTRAINT IF EXISTS purchase_order_lines_purchase_order_id_fkey;

    -- Check which column exists
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='purchase_order_lines' AND column_name='po_id') THEN
      ALTER TABLE purchase_order_lines ADD CONSTRAINT purchase_order_lines_po_id_fkey
        FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE CASCADE;
    ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='purchase_order_lines' AND column_name='purchase_order_id') THEN
      ALTER TABLE purchase_order_lines ADD CONSTRAINT purchase_order_lines_purchase_order_id_fkey
        FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE;
    END IF;
    RAISE NOTICE 'Added CASCADE to purchase_order_lines';
  END IF;
END $$;

-- Estimate Lines -> Estimates
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='estimate_lines') THEN
    ALTER TABLE estimate_lines DROP CONSTRAINT IF EXISTS estimate_lines_estimate_id_fkey;
    ALTER TABLE estimate_lines ADD CONSTRAINT estimate_lines_estimate_id_fkey
      FOREIGN KEY (estimate_id) REFERENCES estimates(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added CASCADE to estimate_lines.estimate_id';
  END IF;
END $$;

-- GL Entry Lines -> GL Entries
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='gl_entry_lines')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='gl_entries') THEN
    ALTER TABLE gl_entry_lines DROP CONSTRAINT IF EXISTS gl_entry_lines_entry_id_fkey;
    ALTER TABLE gl_entry_lines DROP CONSTRAINT IF EXISTS gl_entry_lines_gl_entry_id_fkey;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='gl_entry_lines' AND column_name='entry_id') THEN
      ALTER TABLE gl_entry_lines ADD CONSTRAINT gl_entry_lines_entry_id_fkey
        FOREIGN KEY (entry_id) REFERENCES gl_entries(id) ON DELETE CASCADE;
    ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='gl_entry_lines' AND column_name='gl_entry_id') THEN
      ALTER TABLE gl_entry_lines ADD CONSTRAINT gl_entry_lines_gl_entry_id_fkey
        FOREIGN KEY (gl_entry_id) REFERENCES gl_entries(id) ON DELETE CASCADE;
    END IF;
    RAISE NOTICE 'Added CASCADE to gl_entry_lines';
  END IF;
END $$;

-- Production Steps -> Production Orders (MES)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='production_steps')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='production_orders') THEN
    ALTER TABLE production_steps DROP CONSTRAINT IF EXISTS production_steps_production_order_id_fkey;
    ALTER TABLE production_steps ADD CONSTRAINT production_steps_production_order_id_fkey
      FOREIGN KEY (production_order_id) REFERENCES production_orders(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added CASCADE to production_steps.production_order_id';
  END IF;
END $$;

-- ============================================================================
-- RELOAD SCHEMA CACHE
-- ============================================================================

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- VERIFICATION QUERIES (Run after migration)
-- ============================================================================
--
-- Check sequences created:
-- SELECT sequencename FROM pg_sequences WHERE schemaname = 'public';
--
-- Check functions created:
-- SELECT proname FROM pg_proc WHERE proname LIKE 'generate_%_number';
--
-- Test sequence functions:
-- SELECT generate_invoice_number();
-- SELECT generate_ticket_number();
--
-- Check cascades added:
-- SELECT
--   tc.table_name,
--   tc.constraint_name,
--   rc.delete_rule
-- FROM information_schema.table_constraints tc
-- JOIN information_schema.referential_constraints rc
--   ON tc.constraint_name = rc.constraint_name
-- WHERE tc.constraint_type = 'FOREIGN KEY'
--   AND rc.delete_rule = 'CASCADE'
--   AND tc.table_schema = 'public';
