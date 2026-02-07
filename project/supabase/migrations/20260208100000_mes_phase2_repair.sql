/*
  MES Phase 2 Repair Migration

  This migration repairs any missing objects from the MES Phase 2 enhancement
  that may have failed to create due to dependency or other issues.
*/

-- =====================================================
-- ENUMS (idempotent)
-- =====================================================

DO $$ BEGIN
    CREATE TYPE plant_hierarchy_level AS ENUM ('site', 'plant', 'area', 'line');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE equipment_state AS ENUM ('RUN', 'STOP', 'IDLE', 'CHANGEOVER', 'PLANNED_STOP');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE downtime_category AS ENUM ('planned', 'unplanned');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE downtime_group AS ENUM ('mechanical', 'electrical', 'material', 'quality', 'ops', 'other');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE operation_run_status AS ENUM ('NOT_STARTED', 'RUNNING', 'PAUSED', 'COMPLETED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE consumption_method AS ENUM ('scan', 'manual', 'backflush');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE oee_grain AS ENUM ('hourly', 'shift', 'daily');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- =====================================================
-- ADD COLUMN TO work_centers (idempotent)
-- =====================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'work_centers'
        AND column_name = 'ideal_cycle_time_seconds'
    ) THEN
        ALTER TABLE work_centers ADD COLUMN ideal_cycle_time_seconds NUMERIC(10, 3);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'work_centers'
        AND column_name = 'line_id'
    ) THEN
        ALTER TABLE work_centers ADD COLUMN line_id UUID;
    END IF;
END $$;

-- =====================================================
-- TABLES (in dependency order)
-- =====================================================

-- Plant Hierarchy
CREATE TABLE IF NOT EXISTS plant_hierarchy (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id UUID REFERENCES plant_hierarchy(id) ON DELETE CASCADE,
    level_type plant_hierarchy_level NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    timezone TEXT DEFAULT 'America/New_York',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(code)
);

-- Downtime Reason Codes (needed for production_counts FK)
CREATE TABLE IF NOT EXISTS downtime_reason_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    category downtime_category NOT NULL DEFAULT 'unplanned',
    reason_group downtime_group NOT NULL DEFAULT 'other',
    parent_code_id UUID REFERENCES downtime_reason_codes(id) ON DELETE SET NULL,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Equipment Assets
CREATE TABLE IF NOT EXISTS equipment_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    work_center_id UUID NOT NULL REFERENCES work_centers(id) ON DELETE CASCADE,
    asset_code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    manufacturer TEXT,
    model TEXT,
    serial_number TEXT,
    ideal_cycle_time_seconds NUMERIC(10, 3),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Equipment State Events
CREATE TABLE IF NOT EXISTS equipment_state_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    equipment_asset_id UUID REFERENCES equipment_assets(id) ON DELETE CASCADE,
    work_center_id UUID REFERENCES work_centers(id) ON DELETE SET NULL,
    state equipment_state NOT NULL,
    start_ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    end_ts TIMESTAMPTZ,
    duration_seconds NUMERIC(12, 2) GENERATED ALWAYS AS (
        CASE
            WHEN end_ts IS NOT NULL THEN
                EXTRACT(EPOCH FROM (end_ts - start_ts))
            ELSE NULL
        END
    ) STORED,
    external_event_id TEXT,
    source TEXT DEFAULT 'manual',
    notes TEXT,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Downtime Events
CREATE TABLE IF NOT EXISTS downtime_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    equipment_state_event_id UUID NOT NULL REFERENCES equipment_state_events(id) ON DELETE CASCADE,
    reason_code_id UUID REFERENCES downtime_reason_codes(id) ON DELETE SET NULL,
    is_classified BOOLEAN DEFAULT FALSE,
    is_planned BOOLEAN DEFAULT FALSE,
    classification_notes TEXT,
    classified_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    classified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Production Operation Runs
CREATE TABLE IF NOT EXISTS production_operation_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    production_order_id UUID NOT NULL REFERENCES production_orders(id) ON DELETE CASCADE,
    production_step_id UUID REFERENCES production_steps(id) ON DELETE SET NULL,
    work_center_id UUID REFERENCES work_centers(id) ON DELETE SET NULL,
    equipment_asset_id UUID REFERENCES equipment_assets(id) ON DELETE SET NULL,
    status operation_run_status NOT NULL DEFAULT 'NOT_STARTED',
    sequence_number INTEGER,
    scheduled_start_ts TIMESTAMPTZ,
    scheduled_end_ts TIMESTAMPTZ,
    actual_start_ts TIMESTAMPTZ,
    actual_end_ts TIMESTAMPTZ,
    setup_start_ts TIMESTAMPTZ,
    setup_end_ts TIMESTAMPTZ,
    started_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    completed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Production Counts
CREATE TABLE IF NOT EXISTS production_counts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operation_run_id UUID REFERENCES production_operation_runs(id) ON DELETE CASCADE,
    production_order_id UUID REFERENCES production_orders(id) ON DELETE CASCADE,
    work_center_id UUID REFERENCES work_centers(id) ON DELETE SET NULL,
    equipment_asset_id UUID REFERENCES equipment_assets(id) ON DELETE SET NULL,
    count_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    total_qty NUMERIC(12, 4) NOT NULL DEFAULT 0,
    good_qty NUMERIC(12, 4) NOT NULL DEFAULT 0,
    scrap_qty NUMERIC(12, 4) NOT NULL DEFAULT 0,
    rework_qty NUMERIC(12, 4) NOT NULL DEFAULT 0,
    scrap_reason_code_id UUID REFERENCES downtime_reason_codes(id) ON DELETE SET NULL,
    rework_reason_code_id UUID REFERENCES downtime_reason_codes(id) ON DELETE SET NULL,
    recorded_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- OEE Snapshots
CREATE TABLE IF NOT EXISTS oee_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grain oee_grain NOT NULL,
    scope_type TEXT NOT NULL CHECK (scope_type IN ('work_center', 'equipment', 'line', 'plant', 'site')),
    scope_id UUID NOT NULL,
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    shift_name TEXT,
    planned_production_time_seconds NUMERIC(12, 2) DEFAULT 0,
    actual_run_time_seconds NUMERIC(12, 2) DEFAULT 0,
    downtime_seconds NUMERIC(12, 2) DEFAULT 0,
    planned_downtime_seconds NUMERIC(12, 2) DEFAULT 0,
    unplanned_downtime_seconds NUMERIC(12, 2) DEFAULT 0,
    total_count NUMERIC(12, 4) DEFAULT 0,
    good_count NUMERIC(12, 4) DEFAULT 0,
    scrap_count NUMERIC(12, 4) DEFAULT 0,
    rework_count NUMERIC(12, 4) DEFAULT 0,
    ideal_cycle_time_seconds NUMERIC(10, 3),
    actual_cycle_time_seconds NUMERIC(10, 3),
    availability NUMERIC(5, 4) DEFAULT 0,
    performance NUMERIC(5, 4) DEFAULT 0,
    quality NUMERIC(5, 4) DEFAULT 0,
    oee NUMERIC(5, 4) DEFAULT 0,
    calculated_at TIMESTAMPTZ DEFAULT NOW(),
    calculated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(grain, scope_type, scope_id, period_start)
);

-- Shift Calendars
CREATE TABLE IF NOT EXISTS shift_calendars (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    timezone TEXT DEFAULT 'America/New_York',
    site_id UUID REFERENCES plant_hierarchy(id) ON DELETE SET NULL,
    plant_id UUID REFERENCES plant_hierarchy(id) ON DELETE SET NULL,
    line_id UUID REFERENCES plant_hierarchy(id) ON DELETE SET NULL,
    is_default BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Shift Calendar Rules
CREATE TABLE IF NOT EXISTS shift_calendar_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    calendar_id UUID NOT NULL REFERENCES shift_calendars(id) ON DELETE CASCADE,
    shift_name TEXT NOT NULL,
    day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(calendar_id, shift_name, day_of_week)
);

-- Planned Downtime Windows
CREATE TABLE IF NOT EXISTS planned_downtime_windows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    calendar_id UUID REFERENCES shift_calendars(id) ON DELETE CASCADE,
    equipment_asset_id UUID REFERENCES equipment_assets(id) ON DELETE CASCADE,
    work_center_id UUID REFERENCES work_centers(id) ON DELETE CASCADE,
    start_ts TIMESTAMPTZ NOT NULL,
    end_ts TIMESTAMPTZ NOT NULL,
    reason_code_id UUID REFERENCES downtime_reason_codes(id) ON DELETE SET NULL,
    description TEXT,
    is_recurring BOOLEAN DEFAULT FALSE,
    recurrence_pattern TEXT,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CHECK (end_ts > start_ts)
);

-- Material Consumption Log
CREATE TABLE IF NOT EXISTS material_consumption_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    production_order_id UUID NOT NULL REFERENCES production_orders(id) ON DELETE CASCADE,
    production_step_id UUID REFERENCES production_steps(id) ON DELETE SET NULL,
    operation_run_id UUID REFERENCES production_operation_runs(id) ON DELETE SET NULL,
    part_id UUID NOT NULL REFERENCES parts(id) ON DELETE RESTRICT,
    bom_item_id UUID REFERENCES bill_of_materials(id) ON DELETE SET NULL,
    source_location_id UUID REFERENCES stock_locations(id) ON DELETE SET NULL,
    qty NUMERIC(12, 4) NOT NULL,
    unit_cost NUMERIC(12, 4),
    method consumption_method NOT NULL DEFAULT 'manual',
    is_reversal BOOLEAN DEFAULT FALSE,
    reversal_of_id UUID REFERENCES material_consumption_log(id) ON DELETE SET NULL,
    reversal_reason TEXT,
    lot_number TEXT,
    inventory_movement_id UUID,
    consumed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    consumed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- MES Audit Log
CREATE TABLE IF NOT EXISTS mes_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type TEXT NOT NULL,
    entity_id UUID NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
    before_json JSONB,
    after_json JSONB,
    performed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    performed_at TIMESTAMPTZ DEFAULT NOW(),
    ip_address TEXT,
    user_agent TEXT
);

-- =====================================================
-- ENABLE RLS
-- =====================================================

ALTER TABLE plant_hierarchy ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_calendars ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_calendar_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE downtime_reason_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE planned_downtime_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_state_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE downtime_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_operation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_consumption_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE oee_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE mes_audit_log ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- RLS POLICIES (drop first to avoid duplicates)
-- =====================================================

DROP POLICY IF EXISTS "Authenticated users can view production_counts" ON production_counts;
CREATE POLICY "Authenticated users can view production_counts"
    ON production_counts FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authorized users can manage production_counts" ON production_counts;
CREATE POLICY "Authorized users can manage production_counts"
    ON production_counts FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'dispatcher', 'supervisor', 'operator')
        )
    );

DROP POLICY IF EXISTS "Authenticated users can view downtime_reason_codes" ON downtime_reason_codes;
CREATE POLICY "Authenticated users can view downtime_reason_codes"
    ON downtime_reason_codes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admin can manage downtime_reason_codes" ON downtime_reason_codes;
CREATE POLICY "Admin can manage downtime_reason_codes"
    ON downtime_reason_codes FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

DROP POLICY IF EXISTS "Authenticated users can view equipment_assets" ON equipment_assets;
CREATE POLICY "Authenticated users can view equipment_assets"
    ON equipment_assets FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authorized users can manage equipment_assets" ON equipment_assets;
CREATE POLICY "Authorized users can manage equipment_assets"
    ON equipment_assets FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'dispatcher')
        )
    );

DROP POLICY IF EXISTS "Authenticated users can view equipment_state_events" ON equipment_state_events;
CREATE POLICY "Authenticated users can view equipment_state_events"
    ON equipment_state_events FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authorized users can manage equipment_state_events" ON equipment_state_events;
CREATE POLICY "Authorized users can manage equipment_state_events"
    ON equipment_state_events FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'dispatcher', 'supervisor', 'operator')
        )
    );

DROP POLICY IF EXISTS "Authenticated users can view downtime_events" ON downtime_events;
CREATE POLICY "Authenticated users can view downtime_events"
    ON downtime_events FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authorized users can manage downtime_events" ON downtime_events;
CREATE POLICY "Authorized users can manage downtime_events"
    ON downtime_events FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'dispatcher', 'supervisor', 'operator')
        )
    );

DROP POLICY IF EXISTS "Authenticated users can view production_operation_runs" ON production_operation_runs;
CREATE POLICY "Authenticated users can view production_operation_runs"
    ON production_operation_runs FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authorized users can manage production_operation_runs" ON production_operation_runs;
CREATE POLICY "Authorized users can manage production_operation_runs"
    ON production_operation_runs FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'dispatcher', 'supervisor', 'operator')
        )
    );

DROP POLICY IF EXISTS "Authenticated users can view oee_snapshots" ON oee_snapshots;
CREATE POLICY "Authenticated users can view oee_snapshots"
    ON oee_snapshots FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can view plant_hierarchy" ON plant_hierarchy;
CREATE POLICY "Authenticated users can view plant_hierarchy"
    ON plant_hierarchy FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can view shift_calendars" ON shift_calendars;
CREATE POLICY "Authenticated users can view shift_calendars"
    ON shift_calendars FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can view shift_calendar_rules" ON shift_calendar_rules;
CREATE POLICY "Authenticated users can view shift_calendar_rules"
    ON shift_calendar_rules FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can view planned_downtime_windows" ON planned_downtime_windows;
CREATE POLICY "Authenticated users can view planned_downtime_windows"
    ON planned_downtime_windows FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can view material_consumption_log" ON material_consumption_log;
CREATE POLICY "Authenticated users can view material_consumption_log"
    ON material_consumption_log FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authorized users can manage material_consumption_log" ON material_consumption_log;
CREATE POLICY "Authorized users can manage material_consumption_log"
    ON material_consumption_log FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'dispatcher', 'supervisor', 'operator')
        )
    );

DROP POLICY IF EXISTS "Authenticated users can view mes_audit_log" ON mes_audit_log;
CREATE POLICY "Authenticated users can view mes_audit_log"
    ON mes_audit_log FOR SELECT TO authenticated USING (true);

-- =====================================================
-- VIEWS
-- =====================================================

-- Drop views if they exist (they depend on tables that might have been missing)
DROP VIEW IF EXISTS vw_downtime_log CASCADE;
DROP VIEW IF EXISTS vw_oee_summary CASCADE;

-- Downtime Log View
CREATE VIEW vw_downtime_log AS
SELECT
    de.id AS downtime_event_id,
    ese.id AS equipment_state_event_id,
    ese.equipment_asset_id,
    ea.name AS equipment_name,
    ea.asset_code,
    ese.work_center_id,
    wc.name AS work_center_name,
    wc.code AS work_center_code,
    ese.state,
    ese.start_ts,
    ese.end_ts,
    ese.duration_seconds,
    de.reason_code_id,
    drc.code AS reason_code,
    drc.name AS reason_name,
    drc.category AS reason_category,
    drc.reason_group,
    de.is_classified,
    de.is_planned,
    de.classification_notes,
    de.classified_by,
    p.full_name AS classified_by_name,
    de.classified_at,
    ese.source,
    ese.notes
FROM downtime_events de
JOIN equipment_state_events ese ON de.equipment_state_event_id = ese.id
LEFT JOIN equipment_assets ea ON ese.equipment_asset_id = ea.id
LEFT JOIN work_centers wc ON ese.work_center_id = wc.id
LEFT JOIN downtime_reason_codes drc ON de.reason_code_id = drc.id
LEFT JOIN profiles p ON de.classified_by = p.id
ORDER BY ese.start_ts DESC;

-- OEE Summary View
CREATE VIEW vw_oee_summary AS
SELECT
    os.id,
    os.grain,
    os.scope_type,
    os.scope_id,
    CASE os.scope_type
        WHEN 'work_center' THEN wc.name
        WHEN 'equipment' THEN ea.name
        WHEN 'line' THEN ph.name
        ELSE os.scope_type || ':' || os.scope_id::TEXT
    END AS scope_name,
    os.period_start,
    os.period_end,
    os.shift_name,
    os.planned_production_time_seconds,
    os.actual_run_time_seconds,
    os.downtime_seconds,
    os.planned_downtime_seconds,
    os.unplanned_downtime_seconds,
    os.total_count,
    os.good_count,
    os.scrap_count,
    os.rework_count,
    ROUND(os.availability * 100, 2) AS availability_pct,
    ROUND(os.performance * 100, 2) AS performance_pct,
    ROUND(os.quality * 100, 2) AS quality_pct,
    ROUND(os.oee * 100, 2) AS oee_pct,
    os.calculated_at
FROM oee_snapshots os
LEFT JOIN work_centers wc ON os.scope_type = 'work_center' AND os.scope_id = wc.id
LEFT JOIN equipment_assets ea ON os.scope_type = 'equipment' AND os.scope_id = ea.id
LEFT JOIN plant_hierarchy ph ON os.scope_type IN ('line', 'plant', 'site') AND os.scope_id = ph.id
ORDER BY os.period_start DESC;

-- =====================================================
-- INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_production_counts_work_center_id ON production_counts(work_center_id);
CREATE INDEX IF NOT EXISTS idx_production_counts_count_timestamp ON production_counts(count_timestamp);
CREATE INDEX IF NOT EXISTS idx_equipment_state_events_work_center_id ON equipment_state_events(work_center_id);
CREATE INDEX IF NOT EXISTS idx_equipment_state_events_start_ts ON equipment_state_events(start_ts);
CREATE INDEX IF NOT EXISTS idx_downtime_events_equipment_state_event_id ON downtime_events(equipment_state_event_id);

-- =====================================================
-- RELOAD SCHEMA
-- =====================================================

NOTIFY pgrst, 'reload schema';
