/*
  # MES Phase 2 Enhancements

  ## Overview
  Adds Production Scheduling, OEE tracking, Downtime management, and improved
  material consumption to the existing MES module.

  ## Additive-only changes
  - No drops/renames of existing tables
  - Only adds new enums, tables, functions, views
  - Adds nullable line_id column to work_centers

  ## New Enums
  - plant_hierarchy_level: site, plant, area, line
  - equipment_state: RUN, STOP, IDLE, CHANGEOVER, PLANNED_STOP
  - downtime_category: planned, unplanned
  - downtime_group: mechanical, electrical, material, quality, ops, other
  - operation_run_status: NOT_STARTED, RUNNING, PAUSED, COMPLETED
  - consumption_method: scan, manual, backflush
  - oee_grain: hourly, shift, daily

  ## New Tables (11 total)
  - plant_hierarchy
  - equipment_assets
  - shift_calendars
  - shift_calendar_rules
  - planned_downtime_windows
  - downtime_reason_codes
  - equipment_state_events
  - downtime_events
  - production_operation_runs
  - production_counts
  - material_consumption_log
  - oee_snapshots
  - mes_audit_log
*/

-- =====================================================
-- ENUMS
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
-- TABLES
-- =====================================================

-- Plant Hierarchy (Site/Plant/Area/Line hierarchy)
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

-- Equipment Assets (Equipment within work centers)
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

-- Shift Calendars (Calendar definitions)
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

-- Shift Calendar Rules (Day-of-week shift rules)
CREATE TABLE IF NOT EXISTS shift_calendar_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    calendar_id UUID NOT NULL REFERENCES shift_calendars(id) ON DELETE CASCADE,
    shift_name TEXT NOT NULL,
    day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0=Sunday, 6=Saturday
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(calendar_id, shift_name, day_of_week)
);

-- Downtime Reason Codes (Reason taxonomy)
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

-- Planned Downtime Windows (Scheduled downtime)
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
    recurrence_pattern TEXT, -- cron-like pattern for recurring
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CHECK (end_ts > start_ts)
);

-- Equipment State Events (RUN/STOP state tracking)
CREATE TABLE IF NOT EXISTS equipment_state_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    equipment_asset_id UUID NOT NULL REFERENCES equipment_assets(id) ON DELETE CASCADE,
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
    external_event_id TEXT, -- For idempotent ingestion from external systems
    source TEXT DEFAULT 'manual', -- manual, plc, scada, etc.
    notes TEXT,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique partial index for idempotent event ingestion
CREATE UNIQUE INDEX IF NOT EXISTS idx_equipment_state_events_external_id
    ON equipment_state_events(external_event_id)
    WHERE external_event_id IS NOT NULL;

-- Downtime Events (Downtime classification)
CREATE TABLE IF NOT EXISTS downtime_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    equipment_state_event_id UUID NOT NULL REFERENCES equipment_state_events(id) ON DELETE CASCADE,
    reason_code_id UUID REFERENCES downtime_reason_codes(id) ON DELETE SET NULL,
    is_classified BOOLEAN DEFAULT FALSE,
    classification_notes TEXT,
    classified_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    classified_at TIMESTAMPTZ,
    is_planned BOOLEAN DEFAULT FALSE,
    planned_downtime_window_id UUID REFERENCES planned_downtime_windows(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(equipment_state_event_id)
);

-- Production Operation Runs (Execution state - system-of-record)
CREATE TABLE IF NOT EXISTS production_operation_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    production_order_id UUID NOT NULL REFERENCES production_orders(id) ON DELETE CASCADE,
    production_step_id UUID REFERENCES production_steps(id) ON DELETE SET NULL,
    work_center_id UUID REFERENCES work_centers(id) ON DELETE SET NULL,
    equipment_asset_id UUID REFERENCES equipment_assets(id) ON DELETE SET NULL,
    status operation_run_status NOT NULL DEFAULT 'NOT_STARTED',
    scheduled_start_ts TIMESTAMPTZ,
    scheduled_end_ts TIMESTAMPTZ,
    start_ts TIMESTAMPTZ,
    end_ts TIMESTAMPTZ,
    sequence_number INTEGER DEFAULT 1,
    started_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    completed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Production Counts (Good/scrap/rework counts)
CREATE TABLE IF NOT EXISTS production_counts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operation_run_id UUID NOT NULL REFERENCES production_operation_runs(id) ON DELETE CASCADE,
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
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CHECK (total_qty = good_qty + scrap_qty + rework_qty)
);

-- Material Consumption Log (Consumption with reversals)
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
    serialized_part_id UUID REFERENCES serialized_parts(id) ON DELETE SET NULL,
    lot_number TEXT,
    inventory_movement_id UUID, -- Link to inventory_movements table if exists
    consumed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    consumed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- OEE Snapshots (Pre-computed OEE metrics)
CREATE TABLE IF NOT EXISTS oee_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grain oee_grain NOT NULL,
    scope_type TEXT NOT NULL CHECK (scope_type IN ('work_center', 'equipment', 'line', 'plant', 'site')),
    scope_id UUID NOT NULL,
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    shift_name TEXT,
    -- Time breakdown (in seconds)
    planned_production_time_seconds NUMERIC(12, 2) NOT NULL DEFAULT 0,
    actual_run_time_seconds NUMERIC(12, 2) NOT NULL DEFAULT 0,
    downtime_seconds NUMERIC(12, 2) NOT NULL DEFAULT 0,
    planned_downtime_seconds NUMERIC(12, 2) NOT NULL DEFAULT 0,
    unplanned_downtime_seconds NUMERIC(12, 2) NOT NULL DEFAULT 0,
    -- Counts
    total_count NUMERIC(12, 4) NOT NULL DEFAULT 0,
    good_count NUMERIC(12, 4) NOT NULL DEFAULT 0,
    scrap_count NUMERIC(12, 4) NOT NULL DEFAULT 0,
    rework_count NUMERIC(12, 4) NOT NULL DEFAULT 0,
    -- Cycle time
    ideal_cycle_time_seconds NUMERIC(10, 3),
    actual_cycle_time_seconds NUMERIC(10, 3),
    -- OEE components (0-1 scale)
    availability NUMERIC(5, 4) NOT NULL DEFAULT 0,
    performance NUMERIC(5, 4) NOT NULL DEFAULT 0,
    quality NUMERIC(5, 4) NOT NULL DEFAULT 0,
    oee NUMERIC(5, 4) NOT NULL DEFAULT 0,
    -- Metadata
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(grain, scope_type, scope_id, period_start)
);

-- MES Audit Log (Audit trail)
CREATE TABLE IF NOT EXISTS mes_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type TEXT NOT NULL,
    entity_id UUID NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
    before_json JSONB,
    after_json JSONB,
    changed_fields TEXT[],
    performed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- MODIFY EXISTING TABLES (Additive only)
-- =====================================================

-- Add line_id to work_centers (nullable, for hierarchy integration)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'work_centers' AND column_name = 'line_id'
    ) THEN
        ALTER TABLE work_centers ADD COLUMN line_id UUID REFERENCES plant_hierarchy(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Add ideal_cycle_time_seconds to work_centers (for OEE calculations)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'work_centers' AND column_name = 'ideal_cycle_time_seconds'
    ) THEN
        ALTER TABLE work_centers ADD COLUMN ideal_cycle_time_seconds NUMERIC(10, 3);
    END IF;
END $$;

-- =====================================================
-- INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_plant_hierarchy_parent_id ON plant_hierarchy(parent_id);
CREATE INDEX IF NOT EXISTS idx_plant_hierarchy_level_type ON plant_hierarchy(level_type);
CREATE INDEX IF NOT EXISTS idx_plant_hierarchy_code ON plant_hierarchy(code);

CREATE INDEX IF NOT EXISTS idx_equipment_assets_work_center_id ON equipment_assets(work_center_id);
CREATE INDEX IF NOT EXISTS idx_equipment_assets_asset_code ON equipment_assets(asset_code);

CREATE INDEX IF NOT EXISTS idx_shift_calendar_rules_calendar_id ON shift_calendar_rules(calendar_id);
CREATE INDEX IF NOT EXISTS idx_shift_calendar_rules_day_of_week ON shift_calendar_rules(day_of_week);

CREATE INDEX IF NOT EXISTS idx_downtime_reason_codes_code ON downtime_reason_codes(code);
CREATE INDEX IF NOT EXISTS idx_downtime_reason_codes_category ON downtime_reason_codes(category);
CREATE INDEX IF NOT EXISTS idx_downtime_reason_codes_reason_group ON downtime_reason_codes(reason_group);

CREATE INDEX IF NOT EXISTS idx_planned_downtime_windows_calendar_id ON planned_downtime_windows(calendar_id);
CREATE INDEX IF NOT EXISTS idx_planned_downtime_windows_equipment_asset_id ON planned_downtime_windows(equipment_asset_id);
CREATE INDEX IF NOT EXISTS idx_planned_downtime_windows_start_ts ON planned_downtime_windows(start_ts);
CREATE INDEX IF NOT EXISTS idx_planned_downtime_windows_end_ts ON planned_downtime_windows(end_ts);

CREATE INDEX IF NOT EXISTS idx_equipment_state_events_equipment_asset_id ON equipment_state_events(equipment_asset_id);
CREATE INDEX IF NOT EXISTS idx_equipment_state_events_work_center_id ON equipment_state_events(work_center_id);
CREATE INDEX IF NOT EXISTS idx_equipment_state_events_state ON equipment_state_events(state);
CREATE INDEX IF NOT EXISTS idx_equipment_state_events_start_ts ON equipment_state_events(start_ts);
CREATE INDEX IF NOT EXISTS idx_equipment_state_events_end_ts ON equipment_state_events(end_ts);

CREATE INDEX IF NOT EXISTS idx_downtime_events_equipment_state_event_id ON downtime_events(equipment_state_event_id);
CREATE INDEX IF NOT EXISTS idx_downtime_events_reason_code_id ON downtime_events(reason_code_id);
CREATE INDEX IF NOT EXISTS idx_downtime_events_is_classified ON downtime_events(is_classified);

CREATE INDEX IF NOT EXISTS idx_production_operation_runs_production_order_id ON production_operation_runs(production_order_id);
CREATE INDEX IF NOT EXISTS idx_production_operation_runs_work_center_id ON production_operation_runs(work_center_id);
CREATE INDEX IF NOT EXISTS idx_production_operation_runs_equipment_asset_id ON production_operation_runs(equipment_asset_id);
CREATE INDEX IF NOT EXISTS idx_production_operation_runs_status ON production_operation_runs(status);
CREATE INDEX IF NOT EXISTS idx_production_operation_runs_scheduled_start_ts ON production_operation_runs(scheduled_start_ts);

CREATE INDEX IF NOT EXISTS idx_production_counts_operation_run_id ON production_counts(operation_run_id);
CREATE INDEX IF NOT EXISTS idx_production_counts_production_order_id ON production_counts(production_order_id);
CREATE INDEX IF NOT EXISTS idx_production_counts_work_center_id ON production_counts(work_center_id);
CREATE INDEX IF NOT EXISTS idx_production_counts_count_timestamp ON production_counts(count_timestamp);

CREATE INDEX IF NOT EXISTS idx_material_consumption_log_production_order_id ON material_consumption_log(production_order_id);
CREATE INDEX IF NOT EXISTS idx_material_consumption_log_part_id ON material_consumption_log(part_id);
CREATE INDEX IF NOT EXISTS idx_material_consumption_log_consumed_at ON material_consumption_log(consumed_at);
CREATE INDEX IF NOT EXISTS idx_material_consumption_log_is_reversal ON material_consumption_log(is_reversal);

CREATE INDEX IF NOT EXISTS idx_oee_snapshots_grain ON oee_snapshots(grain);
CREATE INDEX IF NOT EXISTS idx_oee_snapshots_scope ON oee_snapshots(scope_type, scope_id);
CREATE INDEX IF NOT EXISTS idx_oee_snapshots_period_start ON oee_snapshots(period_start);

CREATE INDEX IF NOT EXISTS idx_mes_audit_log_entity ON mes_audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_mes_audit_log_performed_at ON mes_audit_log(performed_at);

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
-- RLS POLICIES
-- =====================================================

-- Plant Hierarchy: All authenticated can view, admin can manage
CREATE POLICY "Authenticated users can view plant_hierarchy"
    ON plant_hierarchy FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin can manage plant_hierarchy"
    ON plant_hierarchy FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
    WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- Equipment Assets: All authenticated can view, admin/dispatcher can manage
CREATE POLICY "Authenticated users can view equipment_assets"
    ON equipment_assets FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin and dispatcher can manage equipment_assets"
    ON equipment_assets FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'dispatcher')))
    WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'dispatcher')));

-- Shift Calendars: All authenticated can view, admin can manage
CREATE POLICY "Authenticated users can view shift_calendars"
    ON shift_calendars FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin can manage shift_calendars"
    ON shift_calendars FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
    WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- Shift Calendar Rules: All authenticated can view, admin can manage
CREATE POLICY "Authenticated users can view shift_calendar_rules"
    ON shift_calendar_rules FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin can manage shift_calendar_rules"
    ON shift_calendar_rules FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
    WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- Downtime Reason Codes: All authenticated can view, admin can manage
CREATE POLICY "Authenticated users can view downtime_reason_codes"
    ON downtime_reason_codes FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin can manage downtime_reason_codes"
    ON downtime_reason_codes FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
    WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- Planned Downtime Windows: All authenticated can view, admin/dispatcher can manage
CREATE POLICY "Authenticated users can view planned_downtime_windows"
    ON planned_downtime_windows FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin and dispatcher can manage planned_downtime_windows"
    ON planned_downtime_windows FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'dispatcher')))
    WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'dispatcher')));

-- Equipment State Events: All authenticated can view, authorized roles can insert/update
CREATE POLICY "Authenticated users can view equipment_state_events"
    ON equipment_state_events FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authorized users can manage equipment_state_events"
    ON equipment_state_events FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'dispatcher', 'technician', 'supervisor', 'operator')))
    WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'dispatcher', 'technician', 'supervisor', 'operator')));

-- Downtime Events: All authenticated can view, authorized roles can manage
CREATE POLICY "Authenticated users can view downtime_events"
    ON downtime_events FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authorized users can manage downtime_events"
    ON downtime_events FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'dispatcher', 'supervisor', 'operator')))
    WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'dispatcher', 'supervisor', 'operator')));

-- Production Operation Runs: All authenticated can view, authorized roles can manage
CREATE POLICY "Authenticated users can view production_operation_runs"
    ON production_operation_runs FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authorized users can manage production_operation_runs"
    ON production_operation_runs FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'dispatcher', 'technician', 'supervisor', 'operator')))
    WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'dispatcher', 'technician', 'supervisor', 'operator')));

-- Production Counts: All authenticated can view, authorized roles can manage
CREATE POLICY "Authenticated users can view production_counts"
    ON production_counts FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authorized users can manage production_counts"
    ON production_counts FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'dispatcher', 'technician', 'supervisor', 'operator')))
    WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'dispatcher', 'technician', 'supervisor', 'operator')));

-- Material Consumption Log: All authenticated can view, authorized roles can manage
CREATE POLICY "Authenticated users can view material_consumption_log"
    ON material_consumption_log FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authorized users can manage material_consumption_log"
    ON material_consumption_log FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'dispatcher', 'technician', 'supervisor', 'operator', 'material_handler')))
    WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'dispatcher', 'technician', 'supervisor', 'operator', 'material_handler')));

-- OEE Snapshots: All authenticated can view, admin can manage
CREATE POLICY "Authenticated users can view oee_snapshots"
    ON oee_snapshots FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin can manage oee_snapshots"
    ON oee_snapshots FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
    WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- MES Audit Log: Admins can view, system can insert
CREATE POLICY "Admin can view mes_audit_log"
    ON mes_audit_log FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- Allow inserts from triggers (service role)
CREATE POLICY "System can insert mes_audit_log"
    ON mes_audit_log FOR INSERT TO authenticated
    WITH CHECK (true);

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Idempotent equipment state event ingestion
CREATE OR REPLACE FUNCTION fn_ingest_equipment_state_event(
    p_equipment_asset_id UUID,
    p_state equipment_state,
    p_start_ts TIMESTAMPTZ,
    p_end_ts TIMESTAMPTZ DEFAULT NULL,
    p_external_event_id TEXT DEFAULT NULL,
    p_source TEXT DEFAULT 'manual',
    p_notes TEXT DEFAULT NULL,
    p_created_by UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
    v_event_id UUID;
    v_work_center_id UUID;
BEGIN
    -- Get work center from equipment asset
    SELECT work_center_id INTO v_work_center_id
    FROM equipment_assets
    WHERE id = p_equipment_asset_id;

    -- Check for existing event with same external_event_id (idempotency)
    IF p_external_event_id IS NOT NULL THEN
        SELECT id INTO v_event_id
        FROM equipment_state_events
        WHERE external_event_id = p_external_event_id;

        IF v_event_id IS NOT NULL THEN
            -- Event already exists, return existing ID
            RETURN v_event_id;
        END IF;
    END IF;

    -- Insert new event
    INSERT INTO equipment_state_events (
        equipment_asset_id,
        work_center_id,
        state,
        start_ts,
        end_ts,
        external_event_id,
        source,
        notes,
        created_by
    )
    VALUES (
        p_equipment_asset_id,
        v_work_center_id,
        p_state,
        p_start_ts,
        p_end_ts,
        p_external_event_id,
        p_source,
        p_notes,
        COALESCE(p_created_by, auth.uid())
    )
    RETURNING id INTO v_event_id;

    RETURN v_event_id;
END;
$$;

-- Material consumption with inventory integration
CREATE OR REPLACE FUNCTION fn_consume_material(
    p_production_order_id UUID,
    p_part_id UUID,
    p_qty NUMERIC,
    p_source_location_id UUID,
    p_method consumption_method DEFAULT 'manual',
    p_production_step_id UUID DEFAULT NULL,
    p_operation_run_id UUID DEFAULT NULL,
    p_bom_item_id UUID DEFAULT NULL,
    p_unit_cost NUMERIC DEFAULT NULL,
    p_serialized_part_id UUID DEFAULT NULL,
    p_lot_number TEXT DEFAULT NULL,
    p_consumed_by UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
    v_log_id UUID;
    v_actual_unit_cost NUMERIC;
BEGIN
    -- Get unit cost from inventory if not provided
    IF p_unit_cost IS NULL THEN
        SELECT unit_cost INTO v_actual_unit_cost
        FROM part_inventory
        WHERE part_id = p_part_id
        AND stock_location_id = p_source_location_id;
    ELSE
        v_actual_unit_cost := p_unit_cost;
    END IF;

    -- Create consumption log entry
    INSERT INTO material_consumption_log (
        production_order_id,
        production_step_id,
        operation_run_id,
        part_id,
        bom_item_id,
        source_location_id,
        qty,
        unit_cost,
        method,
        is_reversal,
        serialized_part_id,
        lot_number,
        consumed_by,
        consumed_at
    )
    VALUES (
        p_production_order_id,
        p_production_step_id,
        p_operation_run_id,
        p_part_id,
        p_bom_item_id,
        p_source_location_id,
        p_qty,
        v_actual_unit_cost,
        p_method,
        FALSE,
        p_serialized_part_id,
        p_lot_number,
        COALESCE(p_consumed_by, auth.uid()),
        NOW()
    )
    RETURNING id INTO v_log_id;

    -- Deduct from inventory
    UPDATE part_inventory
    SET quantity = quantity - p_qty,
        updated_at = NOW()
    WHERE part_id = p_part_id
    AND stock_location_id = p_source_location_id;

    -- Update BOM item if linked
    IF p_bom_item_id IS NOT NULL THEN
        UPDATE bill_of_materials
        SET quantity_consumed = COALESCE(quantity_consumed, 0) + p_qty,
            is_consumed = (COALESCE(quantity_consumed, 0) + p_qty >= quantity_required),
            updated_at = NOW()
        WHERE id = p_bom_item_id;
    END IF;

    RETURN v_log_id;
END;
$$;

-- Reversal-based consumption correction
CREATE OR REPLACE FUNCTION fn_reverse_consumption(
    p_consumption_log_id UUID,
    p_reason TEXT,
    p_reversed_by UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
    v_original RECORD;
    v_reversal_id UUID;
BEGIN
    -- Get original consumption record
    SELECT * INTO v_original
    FROM material_consumption_log
    WHERE id = p_consumption_log_id
    AND is_reversal = FALSE;

    IF v_original IS NULL THEN
        RAISE EXCEPTION 'Consumption log entry not found or already a reversal';
    END IF;

    -- Create reversal entry (negative qty)
    INSERT INTO material_consumption_log (
        production_order_id,
        production_step_id,
        operation_run_id,
        part_id,
        bom_item_id,
        source_location_id,
        qty,
        unit_cost,
        method,
        is_reversal,
        reversal_of_id,
        reversal_reason,
        serialized_part_id,
        lot_number,
        consumed_by,
        consumed_at
    )
    VALUES (
        v_original.production_order_id,
        v_original.production_step_id,
        v_original.operation_run_id,
        v_original.part_id,
        v_original.bom_item_id,
        v_original.source_location_id,
        -v_original.qty, -- Negative qty for reversal
        v_original.unit_cost,
        v_original.method,
        TRUE,
        p_consumption_log_id,
        p_reason,
        v_original.serialized_part_id,
        v_original.lot_number,
        COALESCE(p_reversed_by, auth.uid()),
        NOW()
    )
    RETURNING id INTO v_reversal_id;

    -- Add back to inventory
    UPDATE part_inventory
    SET quantity = quantity + v_original.qty,
        updated_at = NOW()
    WHERE part_id = v_original.part_id
    AND stock_location_id = v_original.source_location_id;

    -- Update BOM item if linked
    IF v_original.bom_item_id IS NOT NULL THEN
        UPDATE bill_of_materials
        SET quantity_consumed = GREATEST(0, COALESCE(quantity_consumed, 0) - v_original.qty),
            is_consumed = FALSE,
            updated_at = NOW()
        WHERE id = v_original.bom_item_id;
    END IF;

    RETURN v_reversal_id;
END;
$$;

-- Auto-create downtime event when STOP > threshold
CREATE OR REPLACE FUNCTION fn_auto_create_downtime_event()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Only create downtime event for STOP, IDLE states
    IF NEW.state IN ('STOP', 'IDLE') AND NEW.end_ts IS NOT NULL THEN
        INSERT INTO downtime_events (equipment_state_event_id, is_classified)
        VALUES (NEW.id, FALSE)
        ON CONFLICT (equipment_state_event_id) DO NOTHING;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_auto_create_downtime_event ON equipment_state_events;
CREATE TRIGGER trigger_auto_create_downtime_event
    AFTER INSERT OR UPDATE OF end_ts ON equipment_state_events
    FOR EACH ROW
    EXECUTE FUNCTION fn_auto_create_downtime_event();

-- MES Audit Log trigger function
CREATE OR REPLACE FUNCTION fn_mes_audit_log()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_entity_id UUID;
    v_before_json JSONB;
    v_after_json JSONB;
    v_changed_fields TEXT[];
BEGIN
    -- Get entity ID
    IF TG_OP = 'DELETE' THEN
        v_entity_id := OLD.id;
        v_before_json := to_jsonb(OLD);
        v_after_json := NULL;
    ELSIF TG_OP = 'INSERT' THEN
        v_entity_id := NEW.id;
        v_before_json := NULL;
        v_after_json := to_jsonb(NEW);
    ELSE -- UPDATE
        v_entity_id := NEW.id;
        v_before_json := to_jsonb(OLD);
        v_after_json := to_jsonb(NEW);

        -- Calculate changed fields
        SELECT array_agg(key)
        INTO v_changed_fields
        FROM jsonb_each(v_after_json) AS a(key, value)
        WHERE v_before_json->key IS DISTINCT FROM a.value;
    END IF;

    INSERT INTO mes_audit_log (
        entity_type,
        entity_id,
        action,
        before_json,
        after_json,
        changed_fields,
        performed_by,
        performed_at
    )
    VALUES (
        TG_TABLE_NAME,
        v_entity_id,
        TG_OP,
        v_before_json,
        v_after_json,
        v_changed_fields,
        auth.uid(),
        NOW()
    );

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;

-- Apply audit trigger to key tables
DROP TRIGGER IF EXISTS trigger_mes_audit_production_operation_runs ON production_operation_runs;
CREATE TRIGGER trigger_mes_audit_production_operation_runs
    AFTER INSERT OR UPDATE OR DELETE ON production_operation_runs
    FOR EACH ROW EXECUTE FUNCTION fn_mes_audit_log();

DROP TRIGGER IF EXISTS trigger_mes_audit_downtime_events ON downtime_events;
CREATE TRIGGER trigger_mes_audit_downtime_events
    AFTER INSERT OR UPDATE OR DELETE ON downtime_events
    FOR EACH ROW EXECUTE FUNCTION fn_mes_audit_log();

DROP TRIGGER IF EXISTS trigger_mes_audit_production_counts ON production_counts;
CREATE TRIGGER trigger_mes_audit_production_counts
    AFTER INSERT OR UPDATE OR DELETE ON production_counts
    FOR EACH ROW EXECUTE FUNCTION fn_mes_audit_log();

DROP TRIGGER IF EXISTS trigger_mes_audit_material_consumption_log ON material_consumption_log;
CREATE TRIGGER trigger_mes_audit_material_consumption_log
    AFTER INSERT OR UPDATE OR DELETE ON material_consumption_log
    FOR EACH ROW EXECUTE FUNCTION fn_mes_audit_log();

-- Updated_at triggers for new tables
DROP TRIGGER IF EXISTS trigger_plant_hierarchy_updated_at ON plant_hierarchy;
CREATE TRIGGER trigger_plant_hierarchy_updated_at
    BEFORE UPDATE ON plant_hierarchy FOR EACH ROW EXECUTE FUNCTION update_mes_updated_at();

DROP TRIGGER IF EXISTS trigger_equipment_assets_updated_at ON equipment_assets;
CREATE TRIGGER trigger_equipment_assets_updated_at
    BEFORE UPDATE ON equipment_assets FOR EACH ROW EXECUTE FUNCTION update_mes_updated_at();

DROP TRIGGER IF EXISTS trigger_shift_calendars_updated_at ON shift_calendars;
CREATE TRIGGER trigger_shift_calendars_updated_at
    BEFORE UPDATE ON shift_calendars FOR EACH ROW EXECUTE FUNCTION update_mes_updated_at();

DROP TRIGGER IF EXISTS trigger_shift_calendar_rules_updated_at ON shift_calendar_rules;
CREATE TRIGGER trigger_shift_calendar_rules_updated_at
    BEFORE UPDATE ON shift_calendar_rules FOR EACH ROW EXECUTE FUNCTION update_mes_updated_at();

DROP TRIGGER IF EXISTS trigger_downtime_reason_codes_updated_at ON downtime_reason_codes;
CREATE TRIGGER trigger_downtime_reason_codes_updated_at
    BEFORE UPDATE ON downtime_reason_codes FOR EACH ROW EXECUTE FUNCTION update_mes_updated_at();

DROP TRIGGER IF EXISTS trigger_planned_downtime_windows_updated_at ON planned_downtime_windows;
CREATE TRIGGER trigger_planned_downtime_windows_updated_at
    BEFORE UPDATE ON planned_downtime_windows FOR EACH ROW EXECUTE FUNCTION update_mes_updated_at();

DROP TRIGGER IF EXISTS trigger_equipment_state_events_updated_at ON equipment_state_events;
CREATE TRIGGER trigger_equipment_state_events_updated_at
    BEFORE UPDATE ON equipment_state_events FOR EACH ROW EXECUTE FUNCTION update_mes_updated_at();

DROP TRIGGER IF EXISTS trigger_downtime_events_updated_at ON downtime_events;
CREATE TRIGGER trigger_downtime_events_updated_at
    BEFORE UPDATE ON downtime_events FOR EACH ROW EXECUTE FUNCTION update_mes_updated_at();

DROP TRIGGER IF EXISTS trigger_production_operation_runs_updated_at ON production_operation_runs;
CREATE TRIGGER trigger_production_operation_runs_updated_at
    BEFORE UPDATE ON production_operation_runs FOR EACH ROW EXECUTE FUNCTION update_mes_updated_at();

DROP TRIGGER IF EXISTS trigger_production_counts_updated_at ON production_counts;
CREATE TRIGGER trigger_production_counts_updated_at
    BEFORE UPDATE ON production_counts FOR EACH ROW EXECUTE FUNCTION update_mes_updated_at();

DROP TRIGGER IF EXISTS trigger_material_consumption_log_updated_at ON material_consumption_log;
CREATE TRIGGER trigger_material_consumption_log_updated_at
    BEFORE UPDATE ON material_consumption_log FOR EACH ROW EXECUTE FUNCTION update_mes_updated_at();

-- =====================================================
-- VIEWS
-- =====================================================

-- Work Center Schedule View
CREATE OR REPLACE VIEW vw_work_center_schedule AS
SELECT
    por.id AS operation_run_id,
    por.production_order_id,
    po.order_number,
    po.title AS order_title,
    po.priority AS order_priority,
    po.customer_id,
    c.name AS customer_name,
    por.production_step_id,
    ps.step_number,
    ps.name AS step_name,
    por.work_center_id,
    wc.name AS work_center_name,
    wc.code AS work_center_code,
    por.equipment_asset_id,
    ea.name AS equipment_name,
    por.status,
    por.scheduled_start_ts,
    por.scheduled_end_ts,
    por.start_ts AS actual_start_ts,
    por.end_ts AS actual_end_ts,
    por.sequence_number,
    ps.estimated_minutes,
    wc.capacity_per_hour
FROM production_operation_runs por
JOIN production_orders po ON por.production_order_id = po.id
LEFT JOIN production_steps ps ON por.production_step_id = ps.id
LEFT JOIN work_centers wc ON por.work_center_id = wc.id
LEFT JOIN equipment_assets ea ON por.equipment_asset_id = ea.id
LEFT JOIN customers c ON po.customer_id = c.id
ORDER BY por.work_center_id, por.scheduled_start_ts NULLS LAST, por.sequence_number;

-- Downtime Log View
CREATE OR REPLACE VIEW vw_downtime_log AS
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
CREATE OR REPLACE VIEW vw_oee_summary AS
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

-- Material Consumption Summary View
CREATE OR REPLACE VIEW vw_material_consumption_summary AS
SELECT
    mcl.production_order_id,
    po.order_number,
    po.title AS order_title,
    mcl.part_id,
    p.name AS part_name,
    p.part_number,
    SUM(mcl.qty) FILTER (WHERE NOT mcl.is_reversal) AS total_consumed,
    SUM(mcl.qty) FILTER (WHERE mcl.is_reversal) AS total_reversed,
    SUM(mcl.qty) AS net_consumed,
    SUM(mcl.qty * COALESCE(mcl.unit_cost, 0)) AS total_cost,
    COUNT(*) FILTER (WHERE NOT mcl.is_reversal) AS consumption_count,
    COUNT(*) FILTER (WHERE mcl.is_reversal) AS reversal_count,
    MAX(mcl.consumed_at) AS last_consumption_at
FROM material_consumption_log mcl
JOIN production_orders po ON mcl.production_order_id = po.id
JOIN parts p ON mcl.part_id = p.id
GROUP BY mcl.production_order_id, po.order_number, po.title, mcl.part_id, p.name, p.part_number;

-- =====================================================
-- SEED DATA
-- =====================================================

-- Seed default downtime reason codes
INSERT INTO downtime_reason_codes (code, name, category, reason_group, display_order)
VALUES
    ('MECH-001', 'Machine Breakdown', 'unplanned', 'mechanical', 1),
    ('MECH-002', 'Tooling Failure', 'unplanned', 'mechanical', 2),
    ('MECH-003', 'Preventive Maintenance', 'planned', 'mechanical', 3),
    ('ELEC-001', 'Electrical Fault', 'unplanned', 'electrical', 10),
    ('ELEC-002', 'Sensor Malfunction', 'unplanned', 'electrical', 11),
    ('ELEC-003', 'PLC Error', 'unplanned', 'electrical', 12),
    ('MAT-001', 'Material Shortage', 'unplanned', 'material', 20),
    ('MAT-002', 'Material Quality Issue', 'unplanned', 'material', 21),
    ('MAT-003', 'Waiting for Material', 'unplanned', 'material', 22),
    ('QUAL-001', 'Quality Hold', 'unplanned', 'quality', 30),
    ('QUAL-002', 'Inspection', 'planned', 'quality', 31),
    ('QUAL-003', 'Rework Required', 'unplanned', 'quality', 32),
    ('OPS-001', 'Changeover', 'planned', 'ops', 40),
    ('OPS-002', 'No Operator', 'unplanned', 'ops', 41),
    ('OPS-003', 'Training', 'planned', 'ops', 42),
    ('OPS-004', 'Break/Meal', 'planned', 'ops', 43),
    ('OTHER-001', 'Unknown', 'unplanned', 'other', 50),
    ('OTHER-002', 'Other - See Notes', 'unplanned', 'other', 51)
ON CONFLICT (code) DO NOTHING;

-- Seed default shift calendar
INSERT INTO shift_calendars (name, description, timezone, is_default, is_active)
VALUES ('Standard 3-Shift', 'Standard manufacturing 3-shift schedule', 'America/New_York', TRUE, TRUE)
ON CONFLICT DO NOTHING;

-- Get the calendar ID and insert rules
DO $$
DECLARE
    v_calendar_id UUID;
BEGIN
    SELECT id INTO v_calendar_id FROM shift_calendars WHERE name = 'Standard 3-Shift' LIMIT 1;

    IF v_calendar_id IS NOT NULL THEN
        -- Insert shift rules for Monday-Friday (1-5)
        FOR dow IN 1..5 LOOP
            INSERT INTO shift_calendar_rules (calendar_id, shift_name, day_of_week, start_time, end_time)
            VALUES
                (v_calendar_id, '1st Shift', dow, '06:00', '14:00'),
                (v_calendar_id, '2nd Shift', dow, '14:00', '22:00'),
                (v_calendar_id, '3rd Shift', dow, '22:00', '06:00')
            ON CONFLICT (calendar_id, shift_name, day_of_week) DO NOTHING;
        END LOOP;
    END IF;
END $$;

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE plant_hierarchy IS 'Hierarchical structure for sites, plants, areas, and lines';
COMMENT ON TABLE equipment_assets IS 'Equipment/machines within work centers for OEE tracking';
COMMENT ON TABLE shift_calendars IS 'Shift calendar definitions for scheduling and OEE calculations';
COMMENT ON TABLE shift_calendar_rules IS 'Day-of-week rules for shift calendars';
COMMENT ON TABLE downtime_reason_codes IS 'Taxonomy of downtime reasons for classification';
COMMENT ON TABLE planned_downtime_windows IS 'Scheduled downtime windows for maintenance, changeovers, etc.';
COMMENT ON TABLE equipment_state_events IS 'RUN/STOP state tracking for equipment, supports idempotent ingestion';
COMMENT ON TABLE downtime_events IS 'Downtime classification and analysis records';
COMMENT ON TABLE production_operation_runs IS 'System-of-record for production execution state';
COMMENT ON TABLE production_counts IS 'Good/scrap/rework count tracking per operation run';
COMMENT ON TABLE material_consumption_log IS 'Material consumption with reversal-based corrections';
COMMENT ON TABLE oee_snapshots IS 'Pre-computed OEE metrics at various granularities';
COMMENT ON TABLE mes_audit_log IS 'Audit trail for MES data changes';

COMMENT ON FUNCTION fn_ingest_equipment_state_event IS 'Idempotent function to ingest equipment state events from external systems';
COMMENT ON FUNCTION fn_consume_material IS 'Record material consumption with inventory deduction';
COMMENT ON FUNCTION fn_reverse_consumption IS 'Create reversal entry for consumption correction';
COMMENT ON FUNCTION fn_mes_audit_log IS 'Trigger function to capture audit trail';

COMMENT ON VIEW vw_work_center_schedule IS 'Production scheduling view with order and work center details';
COMMENT ON VIEW vw_downtime_log IS 'Downtime events with classification and equipment details';
COMMENT ON VIEW vw_oee_summary IS 'OEE snapshots with human-readable scope names';
COMMENT ON VIEW vw_material_consumption_summary IS 'Aggregated material consumption per order and part';
