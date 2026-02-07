/*
  # Manufacturing Execution System (MES) Module

  ## Overview
  Creates the complete MES database schema for shop floor production tracking,
  work orders, bill of materials, material handling, and integration with
  existing ticketing/inventory systems.

  ## 1. Enums
    - production_status: queued, in_progress, hold, complete
    - step_status: pending, in_progress, complete, skipped
    - work_center_type: fabrication, assembly, testing, finishing, packaging, general
    - material_move_status: requested, in_transit, delivered, cancelled

  ## 2. Tables
    - work_centers - Shop stations/cells
    - production_orders - Work orders
    - production_steps - Routing/operations
    - bill_of_materials - Materials list per order
    - production_time_logs - Labor tracking
    - material_move_requests - Forklift/handler queue
    - wip_tracking - Work in progress chain of custody

  ## 3. Security
    - RLS on all tables
    - Role-based access for admin, dispatcher, technician, material_handler

  ## 4. Triggers & Functions
    - Auto-generate production order numbers (PO-YY-00001)
    - Auto-update order status when steps complete
    - Backflush BOM inventory on order completion

  ## 5. Views
    - vw_production_dashboard
    - vw_work_center_queue
    - vw_material_moves_queue
*/

-- =====================================================
-- ENUMS
-- =====================================================
-- Note: material_handler role added via separate migration 20260206205000

DO $$ BEGIN
    CREATE TYPE production_status AS ENUM ('queued', 'in_progress', 'hold', 'complete');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE step_status AS ENUM ('pending', 'in_progress', 'complete', 'skipped');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE work_center_type AS ENUM ('fabrication', 'assembly', 'testing', 'finishing', 'packaging', 'general');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE material_move_status AS ENUM ('requested', 'in_transit', 'delivered', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- =====================================================
-- TABLES
-- =====================================================

-- Work Centers (Shop stations/cells)
CREATE TABLE IF NOT EXISTS work_centers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    center_type work_center_type NOT NULL DEFAULT 'general',
    description TEXT,
    capacity_per_hour NUMERIC(10, 2),
    is_active BOOLEAN DEFAULT TRUE,
    default_technician_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    location_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Production Orders (Work orders)
CREATE TABLE IF NOT EXISTS production_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    status production_status NOT NULL DEFAULT 'queued',
    priority INTEGER DEFAULT 3 CHECK (priority >= 1 AND priority <= 5),
    ticket_id UUID REFERENCES tickets(id) ON DELETE SET NULL,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    scheduled_start TIMESTAMPTZ,
    scheduled_end TIMESTAMPTZ,
    actual_start TIMESTAMPTZ,
    actual_end TIMESTAMPTZ,
    quantity_ordered INTEGER DEFAULT 1,
    quantity_completed INTEGER DEFAULT 0,
    assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
    hold_reason TEXT,
    notes TEXT,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Production Steps (Routing/operations)
CREATE TABLE IF NOT EXISTS production_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    production_order_id UUID NOT NULL REFERENCES production_orders(id) ON DELETE CASCADE,
    step_number INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    work_center_id UUID REFERENCES work_centers(id) ON DELETE SET NULL,
    status step_status NOT NULL DEFAULT 'pending',
    estimated_minutes INTEGER,
    actual_minutes INTEGER,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    completed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(production_order_id, step_number)
);

-- Bill of Materials (Materials list per order)
CREATE TABLE IF NOT EXISTS bill_of_materials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    production_order_id UUID NOT NULL REFERENCES production_orders(id) ON DELETE CASCADE,
    part_id UUID NOT NULL REFERENCES parts(id) ON DELETE RESTRICT,
    quantity_required NUMERIC(10, 4) NOT NULL DEFAULT 1,
    quantity_allocated NUMERIC(10, 4) DEFAULT 0,
    quantity_consumed NUMERIC(10, 4) DEFAULT 0,
    source_location_id UUID REFERENCES stock_locations(id) ON DELETE SET NULL,
    unit_cost NUMERIC(12, 4),
    is_allocated BOOLEAN DEFAULT FALSE,
    is_consumed BOOLEAN DEFAULT FALSE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(production_order_id, part_id)
);

-- Production Time Logs (Labor tracking)
CREATE TABLE IF NOT EXISTS production_time_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    production_order_id UUID NOT NULL REFERENCES production_orders(id) ON DELETE CASCADE,
    production_step_id UUID REFERENCES production_steps(id) ON DELETE SET NULL,
    work_center_id UUID REFERENCES work_centers(id) ON DELETE SET NULL,
    technician_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    clock_in TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    clock_out TIMESTAMPTZ,
    duration_minutes INTEGER GENERATED ALWAYS AS (
        CASE
            WHEN clock_out IS NOT NULL THEN
                EXTRACT(EPOCH FROM (clock_out - clock_in)) / 60
            ELSE NULL
        END
    ) STORED,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Material Move Requests (Forklift/Handler queue)
CREATE TABLE IF NOT EXISTS material_move_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    production_order_id UUID REFERENCES production_orders(id) ON DELETE SET NULL,
    from_location_id UUID REFERENCES stock_locations(id) ON DELETE SET NULL,
    to_work_center_id UUID REFERENCES work_centers(id) ON DELETE SET NULL,
    to_location_id UUID REFERENCES stock_locations(id) ON DELETE SET NULL,
    item_id UUID REFERENCES parts(id) ON DELETE SET NULL,
    quantity NUMERIC(10, 4) NOT NULL DEFAULT 1,
    status material_move_status NOT NULL DEFAULT 'requested',
    priority INTEGER DEFAULT 3 CHECK (priority >= 1 AND priority <= 5),
    requested_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- WIP Tracking (Chain of Custody)
CREATE TABLE IF NOT EXISTS wip_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    production_order_id UUID NOT NULL REFERENCES production_orders(id) ON DELETE CASCADE,
    current_work_center_id UUID REFERENCES work_centers(id) ON DELETE SET NULL,
    current_location_id UUID REFERENCES stock_locations(id) ON DELETE SET NULL,
    last_move_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'at_work_center',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(production_order_id)
);

-- =====================================================
-- INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_work_centers_code ON work_centers(code);
CREATE INDEX IF NOT EXISTS idx_work_centers_center_type ON work_centers(center_type);
CREATE INDEX IF NOT EXISTS idx_work_centers_is_active ON work_centers(is_active);

CREATE INDEX IF NOT EXISTS idx_production_orders_order_number ON production_orders(order_number);
CREATE INDEX IF NOT EXISTS idx_production_orders_status ON production_orders(status);
CREATE INDEX IF NOT EXISTS idx_production_orders_ticket_id ON production_orders(ticket_id);
CREATE INDEX IF NOT EXISTS idx_production_orders_project_id ON production_orders(project_id);
CREATE INDEX IF NOT EXISTS idx_production_orders_customer_id ON production_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_production_orders_assigned_to ON production_orders(assigned_to);
CREATE INDEX IF NOT EXISTS idx_production_orders_scheduled_start ON production_orders(scheduled_start);

CREATE INDEX IF NOT EXISTS idx_production_steps_production_order_id ON production_steps(production_order_id);
CREATE INDEX IF NOT EXISTS idx_production_steps_work_center_id ON production_steps(work_center_id);
CREATE INDEX IF NOT EXISTS idx_production_steps_status ON production_steps(status);

CREATE INDEX IF NOT EXISTS idx_bill_of_materials_production_order_id ON bill_of_materials(production_order_id);
CREATE INDEX IF NOT EXISTS idx_bill_of_materials_part_id ON bill_of_materials(part_id);

CREATE INDEX IF NOT EXISTS idx_production_time_logs_production_order_id ON production_time_logs(production_order_id);
CREATE INDEX IF NOT EXISTS idx_production_time_logs_technician_id ON production_time_logs(technician_id);
CREATE INDEX IF NOT EXISTS idx_production_time_logs_clock_in ON production_time_logs(clock_in);

CREATE INDEX IF NOT EXISTS idx_material_move_requests_status ON material_move_requests(status);
CREATE INDEX IF NOT EXISTS idx_material_move_requests_assigned_to ON material_move_requests(assigned_to);
CREATE INDEX IF NOT EXISTS idx_material_move_requests_production_order_id ON material_move_requests(production_order_id);

CREATE INDEX IF NOT EXISTS idx_wip_tracking_production_order_id ON wip_tracking(production_order_id);
CREATE INDEX IF NOT EXISTS idx_wip_tracking_current_work_center_id ON wip_tracking(current_work_center_id);

-- =====================================================
-- ENABLE RLS
-- =====================================================

ALTER TABLE work_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_of_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_time_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_move_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE wip_tracking ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- RLS POLICIES
-- =====================================================

-- Work Centers: All authenticated can view, admin/dispatcher can manage
CREATE POLICY "Authenticated users can view work_centers"
    ON work_centers FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin and dispatcher can manage work_centers"
    ON work_centers FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'dispatcher')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'dispatcher')
        )
    );

-- Production Orders: All authenticated can view, admin/dispatcher can manage all, assigned technician can update
CREATE POLICY "Authenticated users can view production_orders"
    ON production_orders FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin and dispatcher can manage production_orders"
    ON production_orders FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'dispatcher')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'dispatcher')
        )
    );

CREATE POLICY "Assigned technician can update production_orders"
    ON production_orders FOR UPDATE TO authenticated
    USING (assigned_to = auth.uid())
    WITH CHECK (assigned_to = auth.uid());

-- Production Steps: All authenticated can view, admin/dispatcher can manage
CREATE POLICY "Authenticated users can view production_steps"
    ON production_steps FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin and dispatcher can manage production_steps"
    ON production_steps FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'dispatcher')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'dispatcher')
        )
    );

-- Bill of Materials: All authenticated can view, admin/dispatcher can manage
CREATE POLICY "Authenticated users can view bill_of_materials"
    ON bill_of_materials FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin and dispatcher can manage bill_of_materials"
    ON bill_of_materials FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'dispatcher')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'dispatcher')
        )
    );

-- Production Time Logs: Users can manage own records, admin can manage all
CREATE POLICY "Authenticated users can view production_time_logs"
    ON production_time_logs FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can manage own time logs"
    ON production_time_logs FOR ALL TO authenticated
    USING (technician_id = auth.uid())
    WITH CHECK (technician_id = auth.uid());

CREATE POLICY "Admin can manage all time logs"
    ON production_time_logs FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Material Move Requests: All authenticated can view, material_handler/admin/dispatcher can manage
CREATE POLICY "Authenticated users can view material_move_requests"
    ON material_move_requests FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can create material_move_requests"
    ON material_move_requests FOR INSERT TO authenticated
    WITH CHECK (requested_by = auth.uid());

CREATE POLICY "Admin dispatcher material_handler can manage material_move_requests"
    ON material_move_requests FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'dispatcher', 'material_handler')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'dispatcher', 'material_handler')
        )
    );

-- WIP Tracking: All authenticated can view, admin/dispatcher can manage
CREATE POLICY "Authenticated users can view wip_tracking"
    ON wip_tracking FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin and dispatcher can manage wip_tracking"
    ON wip_tracking FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'dispatcher')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'dispatcher')
        )
    );

-- =====================================================
-- TRIGGERS & FUNCTIONS
-- =====================================================

-- Updated_at triggers for all tables
CREATE OR REPLACE FUNCTION update_mes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_work_centers_updated_at ON work_centers;
CREATE TRIGGER trigger_work_centers_updated_at
    BEFORE UPDATE ON work_centers FOR EACH ROW EXECUTE FUNCTION update_mes_updated_at();

DROP TRIGGER IF EXISTS trigger_production_orders_updated_at ON production_orders;
CREATE TRIGGER trigger_production_orders_updated_at
    BEFORE UPDATE ON production_orders FOR EACH ROW EXECUTE FUNCTION update_mes_updated_at();

DROP TRIGGER IF EXISTS trigger_production_steps_updated_at ON production_steps;
CREATE TRIGGER trigger_production_steps_updated_at
    BEFORE UPDATE ON production_steps FOR EACH ROW EXECUTE FUNCTION update_mes_updated_at();

DROP TRIGGER IF EXISTS trigger_bill_of_materials_updated_at ON bill_of_materials;
CREATE TRIGGER trigger_bill_of_materials_updated_at
    BEFORE UPDATE ON bill_of_materials FOR EACH ROW EXECUTE FUNCTION update_mes_updated_at();

DROP TRIGGER IF EXISTS trigger_production_time_logs_updated_at ON production_time_logs;
CREATE TRIGGER trigger_production_time_logs_updated_at
    BEFORE UPDATE ON production_time_logs FOR EACH ROW EXECUTE FUNCTION update_mes_updated_at();

DROP TRIGGER IF EXISTS trigger_material_move_requests_updated_at ON material_move_requests;
CREATE TRIGGER trigger_material_move_requests_updated_at
    BEFORE UPDATE ON material_move_requests FOR EACH ROW EXECUTE FUNCTION update_mes_updated_at();

DROP TRIGGER IF EXISTS trigger_wip_tracking_updated_at ON wip_tracking;
CREATE TRIGGER trigger_wip_tracking_updated_at
    BEFORE UPDATE ON wip_tracking FOR EACH ROW EXECUTE FUNCTION update_mes_updated_at();

-- Auto-generate production order numbers (PO-YY-00001)
CREATE OR REPLACE FUNCTION generate_production_order_number()
RETURNS TRIGGER AS $$
DECLARE
    v_year TEXT;
    v_sequence INTEGER;
    v_new_number TEXT;
BEGIN
    -- Get current 2-digit year
    v_year := TO_CHAR(NOW(), 'YY');

    -- Get the next sequence number for this year
    SELECT COALESCE(MAX(
        CASE
            WHEN order_number ~ ('^PO-' || v_year || '-[0-9]+$') THEN
                CAST(SUBSTRING(order_number FROM '[0-9]+$') AS INTEGER)
            ELSE 0
        END
    ), 0) + 1
    INTO v_sequence
    FROM production_orders
    WHERE order_number LIKE 'PO-' || v_year || '-%';

    -- Generate the new order number
    v_new_number := 'PO-' || v_year || '-' || LPAD(v_sequence::TEXT, 5, '0');

    NEW.order_number := v_new_number;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_generate_production_order_number ON production_orders;
CREATE TRIGGER trigger_generate_production_order_number
    BEFORE INSERT ON production_orders
    FOR EACH ROW
    WHEN (NEW.order_number IS NULL OR NEW.order_number = '')
    EXECUTE FUNCTION generate_production_order_number();

-- Auto-update production order status when all steps complete
CREATE OR REPLACE FUNCTION update_production_order_status()
RETURNS TRIGGER AS $$
DECLARE
    v_total_steps INTEGER;
    v_completed_steps INTEGER;
    v_in_progress_steps INTEGER;
    v_current_status production_status;
BEGIN
    -- Get step counts
    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE status IN ('complete', 'skipped')),
        COUNT(*) FILTER (WHERE status = 'in_progress')
    INTO v_total_steps, v_completed_steps, v_in_progress_steps
    FROM production_steps
    WHERE production_order_id = COALESCE(NEW.production_order_id, OLD.production_order_id);

    -- Get current order status
    SELECT status INTO v_current_status
    FROM production_orders
    WHERE id = COALESCE(NEW.production_order_id, OLD.production_order_id);

    -- Only update if not on hold
    IF v_current_status != 'hold' THEN
        IF v_total_steps > 0 AND v_completed_steps = v_total_steps THEN
            -- All steps complete
            UPDATE production_orders
            SET status = 'complete',
                actual_end = NOW(),
                quantity_completed = quantity_ordered
            WHERE id = COALESCE(NEW.production_order_id, OLD.production_order_id)
            AND status != 'complete';
        ELSIF v_in_progress_steps > 0 OR v_completed_steps > 0 THEN
            -- At least one step in progress or complete
            UPDATE production_orders
            SET status = 'in_progress',
                actual_start = COALESCE(actual_start, NOW())
            WHERE id = COALESCE(NEW.production_order_id, OLD.production_order_id)
            AND status = 'queued';
        END IF;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_production_order_status ON production_steps;
CREATE TRIGGER trigger_update_production_order_status
    AFTER INSERT OR UPDATE OF status ON production_steps
    FOR EACH ROW
    EXECUTE FUNCTION update_production_order_status();

-- Backflush BOM inventory when order completes
CREATE OR REPLACE FUNCTION backflush_bom_inventory()
RETURNS TRIGGER AS $$
DECLARE
    v_bom RECORD;
BEGIN
    -- Only process if status changed to complete
    IF NEW.status = 'complete' AND OLD.status != 'complete' THEN
        -- Loop through BOM items that haven't been consumed
        FOR v_bom IN
            SELECT bom.id, bom.part_id, bom.quantity_required, bom.quantity_consumed, bom.source_location_id
            FROM bill_of_materials bom
            WHERE bom.production_order_id = NEW.id
            AND bom.is_consumed = FALSE
        LOOP
            -- Calculate quantity to deduct
            DECLARE
                v_qty_to_deduct NUMERIC;
            BEGIN
                v_qty_to_deduct := v_bom.quantity_required - COALESCE(v_bom.quantity_consumed, 0);

                IF v_qty_to_deduct > 0 AND v_bom.source_location_id IS NOT NULL THEN
                    -- Deduct from part_inventory
                    UPDATE part_inventory
                    SET quantity = quantity - v_qty_to_deduct,
                        updated_at = NOW()
                    WHERE part_id = v_bom.part_id
                    AND location_id = v_bom.source_location_id;

                    -- Mark BOM item as consumed
                    UPDATE bill_of_materials
                    SET quantity_consumed = v_bom.quantity_required,
                        is_consumed = TRUE,
                        updated_at = NOW()
                    WHERE id = v_bom.id;
                END IF;
            END;
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_backflush_bom_inventory ON production_orders;
CREATE TRIGGER trigger_backflush_bom_inventory
    AFTER UPDATE OF status ON production_orders
    FOR EACH ROW
    EXECUTE FUNCTION backflush_bom_inventory();

-- Create WIP tracking record when production order is created
CREATE OR REPLACE FUNCTION create_wip_tracking_on_order()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO wip_tracking (production_order_id, status)
    VALUES (NEW.id, 'queued')
    ON CONFLICT (production_order_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_create_wip_tracking ON production_orders;
CREATE TRIGGER trigger_create_wip_tracking
    AFTER INSERT ON production_orders
    FOR EACH ROW
    EXECUTE FUNCTION create_wip_tracking_on_order();

-- Update WIP tracking when material move is completed
CREATE OR REPLACE FUNCTION update_wip_on_move_complete()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'delivered' AND OLD.status != 'delivered' THEN
        UPDATE wip_tracking
        SET current_work_center_id = NEW.to_work_center_id,
            current_location_id = NEW.to_location_id,
            last_move_at = NOW(),
            status = 'at_work_center',
            updated_at = NOW()
        WHERE production_order_id = NEW.production_order_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_wip_on_move ON material_move_requests;
CREATE TRIGGER trigger_update_wip_on_move
    AFTER UPDATE OF status ON material_move_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_wip_on_move_complete();

-- =====================================================
-- VIEWS
-- =====================================================

-- Production Dashboard View
CREATE OR REPLACE VIEW vw_production_dashboard AS
SELECT
    po.id,
    po.order_number,
    po.title,
    po.description,
    po.status,
    po.priority,
    po.ticket_id,
    t.ticket_number,
    po.project_id,
    p.name AS project_name,
    po.customer_id,
    c.name AS customer_name,
    po.scheduled_start,
    po.scheduled_end,
    po.actual_start,
    po.actual_end,
    po.quantity_ordered,
    po.quantity_completed,
    po.assigned_to,
    pr.full_name AS assigned_to_name,
    po.hold_reason,
    po.created_at,
    po.updated_at,
    -- Step progress
    (SELECT COUNT(*) FROM production_steps ps WHERE ps.production_order_id = po.id) AS total_steps,
    (SELECT COUNT(*) FROM production_steps ps WHERE ps.production_order_id = po.id AND ps.status IN ('complete', 'skipped')) AS completed_steps,
    -- WIP info
    wip.current_work_center_id,
    wc.name AS current_work_center_name,
    wip.last_move_at
FROM production_orders po
LEFT JOIN tickets t ON po.ticket_id = t.id
LEFT JOIN projects p ON po.project_id = p.id
LEFT JOIN customers c ON po.customer_id = c.id
LEFT JOIN profiles pr ON po.assigned_to = pr.id
LEFT JOIN wip_tracking wip ON po.id = wip.production_order_id
LEFT JOIN work_centers wc ON wip.current_work_center_id = wc.id;

-- Work Center Queue View
CREATE OR REPLACE VIEW vw_work_center_queue AS
SELECT
    ps.id AS step_id,
    ps.production_order_id,
    po.order_number,
    po.title AS order_title,
    po.priority AS order_priority,
    po.customer_id,
    c.name AS customer_name,
    ps.step_number,
    ps.name AS step_name,
    ps.work_center_id,
    wc.name AS work_center_name,
    wc.code AS work_center_code,
    ps.status AS step_status,
    ps.estimated_minutes,
    ps.actual_minutes,
    ps.started_at,
    ps.completed_at,
    ps.completed_by,
    pr.full_name AS completed_by_name
FROM production_steps ps
JOIN production_orders po ON ps.production_order_id = po.id
LEFT JOIN work_centers wc ON ps.work_center_id = wc.id
LEFT JOIN customers c ON po.customer_id = c.id
LEFT JOIN profiles pr ON ps.completed_by = pr.id
WHERE po.status NOT IN ('complete', 'hold')
ORDER BY po.priority ASC, po.scheduled_start ASC, ps.step_number ASC;

-- Material Moves Queue View
CREATE OR REPLACE VIEW vw_material_moves_queue AS
SELECT
    mmr.id,
    mmr.production_order_id,
    po.order_number,
    po.title AS order_title,
    mmr.from_location_id,
    sl_from.name AS from_location_name,
    mmr.to_work_center_id,
    wc.name AS to_work_center_name,
    wc.code AS to_work_center_code,
    mmr.to_location_id,
    sl_to.name AS to_location_name,
    mmr.item_id,
    p.name AS item_name,
    p.part_number,
    mmr.quantity,
    mmr.status,
    mmr.priority,
    mmr.requested_by,
    pr_req.full_name AS requested_by_name,
    mmr.assigned_to,
    pr_assign.full_name AS assigned_to_name,
    mmr.started_at,
    mmr.completed_at,
    mmr.notes,
    mmr.created_at
FROM material_move_requests mmr
LEFT JOIN production_orders po ON mmr.production_order_id = po.id
LEFT JOIN stock_locations sl_from ON mmr.from_location_id = sl_from.id
LEFT JOIN stock_locations sl_to ON mmr.to_location_id = sl_to.id
LEFT JOIN work_centers wc ON mmr.to_work_center_id = wc.id
LEFT JOIN parts p ON mmr.item_id = p.id
LEFT JOIN profiles pr_req ON mmr.requested_by = pr_req.id
LEFT JOIN profiles pr_assign ON mmr.assigned_to = pr_assign.id
ORDER BY
    CASE mmr.status
        WHEN 'requested' THEN 1
        WHEN 'in_transit' THEN 2
        WHEN 'delivered' THEN 3
        WHEN 'cancelled' THEN 4
    END,
    mmr.priority ASC,
    mmr.created_at ASC;

-- =====================================================
-- SEED DATA
-- =====================================================

-- Seed work centers
INSERT INTO work_centers (code, name, center_type, description, capacity_per_hour, is_active)
VALUES
    ('FAB-01', 'Fabrication Center 1', 'fabrication', 'Primary fabrication station for cutting and shaping', 10, true),
    ('ASM-01', 'Assembly Station 1', 'assembly', 'Main assembly line station', 8, true),
    ('TEST-01', 'Quality Testing', 'testing', 'Quality assurance and testing area', 15, true),
    ('PACK-01', 'Packaging', 'packaging', 'Final packaging and shipping prep', 20, true)
ON CONFLICT (code) DO NOTHING;

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE work_centers IS 'Shop floor stations/cells where production work is performed';
COMMENT ON TABLE production_orders IS 'Work orders for manufacturing operations';
COMMENT ON TABLE production_steps IS 'Individual steps/operations in a production order routing';
COMMENT ON TABLE bill_of_materials IS 'Materials required for each production order';
COMMENT ON TABLE production_time_logs IS 'Labor time tracking for production work';
COMMENT ON TABLE material_move_requests IS 'Queue for material handlers/forklifts to move materials';
COMMENT ON TABLE wip_tracking IS 'Work in progress chain of custody tracking';

COMMENT ON VIEW vw_production_dashboard IS 'Dashboard view with production order details and progress';
COMMENT ON VIEW vw_work_center_queue IS 'Queue of pending work per work center';
COMMENT ON VIEW vw_material_moves_queue IS 'Queue for material handlers with item and location details';
