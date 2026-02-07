/*
  # MES Quality Execution Module

  ## Overview
  Adds Quality Execution (Inspections + SPC + NCR/CAPA) to the MES module,
  integrated with Work Orders and Traveler workflow.

  ## Additive-only changes (NO schema-breaking changes)

  ## Phase 2.Q1 - Quality Master Data
  - quality_inspection_plans (plan definitions)
  - quality_characteristics (checks within plans)

  ## Phase 2.Q2 - Sampling Plans
  - quality_sampling_plans (AQL/frequency/subgroup sizing)

  ## Phase 2.Q3 - Inspection Execution
  - quality_inspection_runs (executed instances)
  - quality_measurements (results/values)
  - quality_measurement_revisions (audit trail)

  ## Phase 2.Q4 - NCR/Disposition/CAPA
  - quality_nonconformances
  - quality_defect_codes (Pareto taxonomy)
  - quality_nc_defects (defects per NC)
  - quality_dispositions
  - quality_capa

  ## Phase 2.Q5 - SPC Primitives
  - spc_subgroups
  - spc_points
  - spc_rule_violations

  ## Security
  - RLS on all tables
  - Role-based access for operators, inspectors, supervisors, admin
*/

-- =====================================================
-- ENUMS
-- =====================================================

DO $$ BEGIN
    CREATE TYPE inspection_plan_type AS ENUM ('INCOMING', 'IN_PROCESS', 'FINAL', 'AUDIT');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE inspection_applies_to AS ENUM ('PRODUCT', 'OPERATION', 'WORK_CENTER', 'ASSET', 'VENDOR_PART');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE characteristic_type AS ENUM ('VARIABLE', 'ATTRIBUTE');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE data_capture_type AS ENUM ('numeric', 'pass_fail', 'count', 'text', 'photo');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE sampling_method AS ENUM ('100_PERCENT', 'EVERY_N', 'PER_LOT', 'AQL');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE inspection_run_status AS ENUM ('PENDING', 'IN_PROGRESS', 'PASSED', 'FAILED', 'WAIVED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE nc_source AS ENUM ('INSPECTION', 'OPERATOR_REPORTED', 'CUSTOMER_RETURN', 'AUDIT');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE nc_severity AS ENUM ('MINOR', 'MAJOR', 'CRITICAL');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE nc_status AS ENUM ('OPEN', 'UNDER_REVIEW', 'DISPOSITIONED', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE disposition_type AS ENUM ('SCRAP', 'REWORK', 'USE_AS_IS', 'RETURN_TO_VENDOR', 'SORT_100');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE capa_status AS ENUM ('OPEN', 'IN_PROGRESS', 'VERIFIED', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE spc_violation_type AS ENUM (
        'WESTERN_ELECTRIC_1', 'WESTERN_ELECTRIC_2', 'WESTERN_ELECTRIC_3', 'WESTERN_ELECTRIC_4',
        'NELSON_1', 'NELSON_2', 'NELSON_3', 'NELSON_4', 'NELSON_5', 'NELSON_6', 'NELSON_7', 'NELSON_8'
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- =====================================================
-- PHASE 2.Q2: SAMPLING PLANS (create first - referenced by characteristics)
-- =====================================================

CREATE TABLE IF NOT EXISTS quality_sampling_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    method sampling_method NOT NULL DEFAULT '100_PERCENT',
    sample_size INTEGER,
    frequency_n INTEGER, -- for EVERY_N method
    aql_level TEXT, -- for AQL method (e.g., '1.0', '2.5', '4.0')
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quality_sampling_plans_active ON quality_sampling_plans(is_active);

-- =====================================================
-- PHASE 2.Q1: QUALITY MASTER DATA
-- =====================================================

-- Inspection Plans (templates)
CREATE TABLE IF NOT EXISTS quality_inspection_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    plan_type inspection_plan_type NOT NULL DEFAULT 'IN_PROCESS',
    applies_to inspection_applies_to NOT NULL DEFAULT 'OPERATION',
    -- Linkage fields (nullable based on applies_to)
    product_id UUID REFERENCES parts(id) ON DELETE SET NULL,
    production_step_id UUID REFERENCES production_steps(id) ON DELETE SET NULL,
    work_center_id UUID REFERENCES work_centers(id) ON DELETE SET NULL,
    equipment_asset_id UUID REFERENCES equipment_assets(id) ON DELETE SET NULL,
    vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL,
    part_id UUID REFERENCES parts(id) ON DELETE SET NULL,
    -- Versioning
    revision TEXT DEFAULT '1.0',
    effective_date DATE DEFAULT CURRENT_DATE,
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quality_inspection_plans_type ON quality_inspection_plans(plan_type);
CREATE INDEX IF NOT EXISTS idx_quality_inspection_plans_applies ON quality_inspection_plans(applies_to);
CREATE INDEX IF NOT EXISTS idx_quality_inspection_plans_active ON quality_inspection_plans(is_active);
CREATE INDEX IF NOT EXISTS idx_quality_inspection_plans_product ON quality_inspection_plans(product_id) WHERE product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quality_inspection_plans_step ON quality_inspection_plans(production_step_id) WHERE production_step_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quality_inspection_plans_wc ON quality_inspection_plans(work_center_id) WHERE work_center_id IS NOT NULL;

-- Characteristics (checks within a plan)
CREATE TABLE IF NOT EXISTS quality_characteristics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inspection_plan_id UUID NOT NULL REFERENCES quality_inspection_plans(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    char_type characteristic_type NOT NULL DEFAULT 'ATTRIBUTE',
    uom TEXT, -- unit of measure for VARIABLE type
    -- Specifications (for VARIABLE type)
    target_value NUMERIC(15, 6),
    lsl NUMERIC(15, 6), -- lower spec limit
    usl NUMERIC(15, 6), -- upper spec limit
    -- Sampling
    sampling_plan_id UUID REFERENCES quality_sampling_plans(id) ON DELETE SET NULL,
    -- Data capture
    data_capture data_capture_type NOT NULL DEFAULT 'pass_fail',
    -- Requirements
    required BOOLEAN DEFAULT TRUE,
    sequence INTEGER DEFAULT 0,
    -- Future: gage calibration integration
    gage_id UUID, -- placeholder for future calibration module
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quality_characteristics_plan ON quality_characteristics(inspection_plan_id);
CREATE INDEX IF NOT EXISTS idx_quality_characteristics_type ON quality_characteristics(char_type);
CREATE INDEX IF NOT EXISTS idx_quality_characteristics_sequence ON quality_characteristics(inspection_plan_id, sequence);

-- =====================================================
-- PHASE 2.Q3: INSPECTION EXECUTION
-- =====================================================

-- Inspection Runs (executed instances)
CREATE TABLE IF NOT EXISTS quality_inspection_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Plan reference
    inspection_plan_id UUID NOT NULL REFERENCES quality_inspection_plans(id) ON DELETE RESTRICT,
    -- Linkage to production context
    production_order_id UUID REFERENCES production_orders(id) ON DELETE SET NULL,
    operation_run_id UUID REFERENCES production_operation_runs(id) ON DELETE SET NULL,
    work_center_id UUID REFERENCES work_centers(id) ON DELETE SET NULL,
    equipment_asset_id UUID REFERENCES equipment_assets(id) ON DELETE SET NULL,
    -- Traceability (align with existing serialization/lot)
    lot_id UUID, -- reference to lot tracking if implemented
    serial_id UUID REFERENCES serialized_parts(id) ON DELETE SET NULL,
    -- Status
    status inspection_run_status NOT NULL DEFAULT 'PENDING',
    -- Execution
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    inspector_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    -- Results summary
    total_characteristics INTEGER DEFAULT 0,
    passed_characteristics INTEGER DEFAULT 0,
    failed_characteristics INTEGER DEFAULT 0,
    -- Notes
    notes TEXT,
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quality_inspection_runs_plan ON quality_inspection_runs(inspection_plan_id);
CREATE INDEX IF NOT EXISTS idx_quality_inspection_runs_order ON quality_inspection_runs(production_order_id) WHERE production_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quality_inspection_runs_operation ON quality_inspection_runs(operation_run_id) WHERE operation_run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quality_inspection_runs_status ON quality_inspection_runs(status);
CREATE INDEX IF NOT EXISTS idx_quality_inspection_runs_inspector ON quality_inspection_runs(inspector_id) WHERE inspector_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quality_inspection_runs_serial ON quality_inspection_runs(serial_id) WHERE serial_id IS NOT NULL;

-- Measurements (results/values)
CREATE TABLE IF NOT EXISTS quality_measurements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inspection_run_id UUID NOT NULL REFERENCES quality_inspection_runs(id) ON DELETE CASCADE,
    characteristic_id UUID NOT NULL REFERENCES quality_characteristics(id) ON DELETE RESTRICT,
    -- For VARIABLE type
    measured_value NUMERIC(15, 6),
    -- For ATTRIBUTE type
    pass_fail BOOLEAN,
    -- For COUNT type (defect counting)
    defect_count INTEGER,
    -- Notes and attachments
    notes TEXT,
    attachment_url TEXT, -- photo/document URL
    -- Result determination
    is_within_spec BOOLEAN, -- computed: value within LSL/USL or pass_fail=true
    -- Audit: revision tracking
    revision_number INTEGER DEFAULT 1,
    revised_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    revised_at TIMESTAMPTZ,
    revision_reason TEXT,
    -- Timestamps
    recorded_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    recorded_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quality_measurements_run ON quality_measurements(inspection_run_id);
CREATE INDEX IF NOT EXISTS idx_quality_measurements_char ON quality_measurements(characteristic_id);
CREATE INDEX IF NOT EXISTS idx_quality_measurements_spec ON quality_measurements(is_within_spec);

-- Measurement Revisions (audit trail for edits)
CREATE TABLE IF NOT EXISTS quality_measurement_revisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    measurement_id UUID NOT NULL REFERENCES quality_measurements(id) ON DELETE CASCADE,
    revision_number INTEGER NOT NULL,
    -- Before state
    before_measured_value NUMERIC(15, 6),
    before_pass_fail BOOLEAN,
    before_defect_count INTEGER,
    before_is_within_spec BOOLEAN,
    -- After state
    after_measured_value NUMERIC(15, 6),
    after_pass_fail BOOLEAN,
    after_defect_count INTEGER,
    after_is_within_spec BOOLEAN,
    -- Audit
    changed_by UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    change_reason TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quality_measurement_revisions_measurement ON quality_measurement_revisions(measurement_id);
CREATE INDEX IF NOT EXISTS idx_quality_measurement_revisions_changed_by ON quality_measurement_revisions(changed_by);

-- =====================================================
-- PHASE 2.Q4: NCR / DISPOSITION / CAPA
-- =====================================================

-- Defect Codes (Pareto taxonomy)
CREATE TABLE IF NOT EXISTS quality_defect_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT, -- e.g., 'dimensional', 'cosmetic', 'functional', 'documentation'
    severity_default nc_severity DEFAULT 'MINOR',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quality_defect_codes_code ON quality_defect_codes(code);
CREATE INDEX IF NOT EXISTS idx_quality_defect_codes_category ON quality_defect_codes(category);
CREATE INDEX IF NOT EXISTS idx_quality_defect_codes_active ON quality_defect_codes(is_active);

-- Nonconformances (NCRs)
CREATE TABLE IF NOT EXISTS quality_nonconformances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nc_number TEXT NOT NULL UNIQUE, -- auto-generated: NCR-YY-00001
    source nc_source NOT NULL DEFAULT 'INSPECTION',
    -- Linkage
    inspection_run_id UUID REFERENCES quality_inspection_runs(id) ON DELETE SET NULL,
    production_order_id UUID REFERENCES production_orders(id) ON DELETE SET NULL,
    operation_run_id UUID REFERENCES production_operation_runs(id) ON DELETE SET NULL,
    -- Traceability
    lot_id UUID,
    serial_id UUID REFERENCES serialized_parts(id) ON DELETE SET NULL,
    part_id UUID REFERENCES parts(id) ON DELETE SET NULL,
    product_id UUID REFERENCES parts(id) ON DELETE SET NULL, -- finished product
    -- Classification
    severity nc_severity NOT NULL DEFAULT 'MINOR',
    status nc_status NOT NULL DEFAULT 'OPEN',
    -- Details
    title TEXT NOT NULL,
    description TEXT,
    qty_affected NUMERIC(15, 3) DEFAULT 1,
    -- Ownership
    reported_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
    -- Timestamps
    reported_at TIMESTAMPTZ DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quality_nonconformances_number ON quality_nonconformances(nc_number);
CREATE INDEX IF NOT EXISTS idx_quality_nonconformances_status ON quality_nonconformances(status);
CREATE INDEX IF NOT EXISTS idx_quality_nonconformances_severity ON quality_nonconformances(severity);
CREATE INDEX IF NOT EXISTS idx_quality_nonconformances_source ON quality_nonconformances(source);
CREATE INDEX IF NOT EXISTS idx_quality_nonconformances_inspection ON quality_nonconformances(inspection_run_id) WHERE inspection_run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quality_nonconformances_order ON quality_nonconformances(production_order_id) WHERE production_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quality_nonconformances_part ON quality_nonconformances(part_id) WHERE part_id IS NOT NULL;

-- NC Defects (many defects per NC)
CREATE TABLE IF NOT EXISTS quality_nc_defects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nonconformance_id UUID NOT NULL REFERENCES quality_nonconformances(id) ON DELETE CASCADE,
    defect_code_id UUID NOT NULL REFERENCES quality_defect_codes(id) ON DELETE RESTRICT,
    qty_affected NUMERIC(15, 3) DEFAULT 1,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quality_nc_defects_nc ON quality_nc_defects(nonconformance_id);
CREATE INDEX IF NOT EXISTS idx_quality_nc_defects_defect ON quality_nc_defects(defect_code_id);

-- Dispositions
CREATE TABLE IF NOT EXISTS quality_dispositions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nonconformance_id UUID NOT NULL REFERENCES quality_nonconformances(id) ON DELETE CASCADE,
    disposition disposition_type NOT NULL,
    instructions TEXT,
    -- Approval
    approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    -- Execution
    executed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    executed_at TIMESTAMPTZ,
    execution_notes TEXT,
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quality_dispositions_nc ON quality_dispositions(nonconformance_id);
CREATE INDEX IF NOT EXISTS idx_quality_dispositions_type ON quality_dispositions(disposition);

-- CAPA (Corrective and Preventive Action)
CREATE TABLE IF NOT EXISTS quality_capa (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    capa_number TEXT NOT NULL UNIQUE, -- auto-generated: CAPA-YY-00001
    nonconformance_id UUID REFERENCES quality_nonconformances(id) ON DELETE SET NULL,
    -- Analysis
    root_cause TEXT,
    root_cause_method TEXT, -- e.g., '5 Why', 'Fishbone', 'FMEA'
    -- Actions
    corrective_action TEXT,
    corrective_due_date DATE,
    corrective_completed_at TIMESTAMPTZ,
    preventive_action TEXT,
    preventive_due_date DATE,
    preventive_completed_at TIMESTAMPTZ,
    -- Ownership
    owner_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    -- Status
    status capa_status NOT NULL DEFAULT 'OPEN',
    -- Verification
    verified_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    verified_at TIMESTAMPTZ,
    verification_notes TEXT,
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quality_capa_number ON quality_capa(capa_number);
CREATE INDEX IF NOT EXISTS idx_quality_capa_nc ON quality_capa(nonconformance_id) WHERE nonconformance_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quality_capa_status ON quality_capa(status);
CREATE INDEX IF NOT EXISTS idx_quality_capa_owner ON quality_capa(owner_id) WHERE owner_id IS NOT NULL;

-- =====================================================
-- PHASE 2.Q5: SPC PRIMITIVES
-- =====================================================

-- SPC Subgroups
CREATE TABLE IF NOT EXISTS spc_subgroups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    characteristic_id UUID NOT NULL REFERENCES quality_characteristics(id) ON DELETE CASCADE,
    -- Context
    work_center_id UUID REFERENCES work_centers(id) ON DELETE SET NULL,
    equipment_asset_id UUID REFERENCES equipment_assets(id) ON DELETE SET NULL,
    product_id UUID REFERENCES parts(id) ON DELETE SET NULL,
    operation_id UUID REFERENCES production_steps(id) ON DELETE SET NULL,
    -- Subgroup data
    subgroup_ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    n INTEGER NOT NULL DEFAULT 1, -- subgroup size
    -- Computed statistics (can be calculated on insert or via service)
    mean NUMERIC(15, 6),
    range_value NUMERIC(15, 6),
    stddev NUMERIC(15, 6),
    min_value NUMERIC(15, 6),
    max_value NUMERIC(15, 6),
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spc_subgroups_characteristic ON spc_subgroups(characteristic_id);
CREATE INDEX IF NOT EXISTS idx_spc_subgroups_ts ON spc_subgroups(subgroup_ts);
CREATE INDEX IF NOT EXISTS idx_spc_subgroups_wc ON spc_subgroups(work_center_id) WHERE work_center_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_spc_subgroups_product ON spc_subgroups(product_id) WHERE product_id IS NOT NULL;

-- SPC Points (individual measurements within subgroups)
CREATE TABLE IF NOT EXISTS spc_points (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subgroup_id UUID NOT NULL REFERENCES spc_subgroups(id) ON DELETE CASCADE,
    measured_value NUMERIC(15, 6) NOT NULL,
    sequence INTEGER DEFAULT 1, -- order within subgroup
    -- Optional link to source measurement
    measurement_id UUID REFERENCES quality_measurements(id) ON DELETE SET NULL,
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spc_points_subgroup ON spc_points(subgroup_id);
CREATE INDEX IF NOT EXISTS idx_spc_points_measurement ON spc_points(measurement_id) WHERE measurement_id IS NOT NULL;

-- SPC Rule Violations
CREATE TABLE IF NOT EXISTS spc_rule_violations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    characteristic_id UUID NOT NULL REFERENCES quality_characteristics(id) ON DELETE CASCADE,
    subgroup_id UUID REFERENCES spc_subgroups(id) ON DELETE SET NULL,
    violation_type spc_violation_type NOT NULL,
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Details
    details JSONB, -- specifics about the violation (points involved, etc.)
    -- Acknowledgment
    acknowledged_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    acknowledged_at TIMESTAMPTZ,
    acknowledgment_notes TEXT,
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spc_rule_violations_characteristic ON spc_rule_violations(characteristic_id);
CREATE INDEX IF NOT EXISTS idx_spc_rule_violations_type ON spc_rule_violations(violation_type);
CREATE INDEX IF NOT EXISTS idx_spc_rule_violations_detected ON spc_rule_violations(detected_at);

-- =====================================================
-- AUTO-GENERATE NCR NUMBERS
-- =====================================================

CREATE OR REPLACE FUNCTION fn_generate_nc_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_year TEXT;
    v_seq INTEGER;
BEGIN
    v_year := TO_CHAR(NOW(), 'YY');

    SELECT COALESCE(MAX(
        CAST(SUBSTRING(nc_number FROM 'NCR-' || v_year || '-(\d+)') AS INTEGER)
    ), 0) + 1
    INTO v_seq
    FROM quality_nonconformances
    WHERE nc_number LIKE 'NCR-' || v_year || '-%';

    NEW.nc_number := 'NCR-' || v_year || '-' || LPAD(v_seq::TEXT, 5, '0');
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_generate_nc_number ON quality_nonconformances;
CREATE TRIGGER trigger_generate_nc_number
    BEFORE INSERT ON quality_nonconformances
    FOR EACH ROW
    WHEN (NEW.nc_number IS NULL OR NEW.nc_number = '')
    EXECUTE FUNCTION fn_generate_nc_number();

-- =====================================================
-- AUTO-GENERATE CAPA NUMBERS
-- =====================================================

CREATE OR REPLACE FUNCTION fn_generate_capa_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_year TEXT;
    v_seq INTEGER;
BEGIN
    v_year := TO_CHAR(NOW(), 'YY');

    SELECT COALESCE(MAX(
        CAST(SUBSTRING(capa_number FROM 'CAPA-' || v_year || '-(\d+)') AS INTEGER)
    ), 0) + 1
    INTO v_seq
    FROM quality_capa
    WHERE capa_number LIKE 'CAPA-' || v_year || '-%';

    NEW.capa_number := 'CAPA-' || v_year || '-' || LPAD(v_seq::TEXT, 5, '0');
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_generate_capa_number ON quality_capa;
CREATE TRIGGER trigger_generate_capa_number
    BEFORE INSERT ON quality_capa
    FOR EACH ROW
    WHEN (NEW.capa_number IS NULL OR NEW.capa_number = '')
    EXECUTE FUNCTION fn_generate_capa_number();

-- =====================================================
-- AUTO-CREATE NCR ON FAILED INSPECTION
-- =====================================================

CREATE OR REPLACE FUNCTION fn_auto_create_ncr_on_inspection_fail()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_plan_name TEXT;
BEGIN
    -- Only trigger when status changes to FAILED
    IF NEW.status = 'FAILED' AND (OLD.status IS NULL OR OLD.status != 'FAILED') THEN
        -- Get plan name for NCR title
        SELECT name INTO v_plan_name
        FROM quality_inspection_plans
        WHERE id = NEW.inspection_plan_id;

        -- Create NCR
        INSERT INTO quality_nonconformances (
            source,
            inspection_run_id,
            production_order_id,
            operation_run_id,
            serial_id,
            severity,
            title,
            description,
            reported_by
        )
        VALUES (
            'INSPECTION',
            NEW.id,
            NEW.production_order_id,
            NEW.operation_run_id,
            NEW.serial_id,
            'MAJOR', -- default severity for inspection failures
            'Failed Inspection: ' || COALESCE(v_plan_name, 'Unknown'),
            'Inspection failed with ' || NEW.failed_characteristics || ' characteristic(s) out of spec.',
            NEW.inspector_id
        );
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_auto_create_ncr_on_inspection_fail ON quality_inspection_runs;
CREATE TRIGGER trigger_auto_create_ncr_on_inspection_fail
    AFTER UPDATE ON quality_inspection_runs
    FOR EACH ROW
    EXECUTE FUNCTION fn_auto_create_ncr_on_inspection_fail();

-- =====================================================
-- MEASUREMENT REVISION AUDIT TRIGGER
-- =====================================================

CREATE OR REPLACE FUNCTION fn_audit_measurement_revision()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Only create revision if key fields changed
    IF OLD.measured_value IS DISTINCT FROM NEW.measured_value
       OR OLD.pass_fail IS DISTINCT FROM NEW.pass_fail
       OR OLD.defect_count IS DISTINCT FROM NEW.defect_count
       OR OLD.is_within_spec IS DISTINCT FROM NEW.is_within_spec
    THEN
        INSERT INTO quality_measurement_revisions (
            measurement_id,
            revision_number,
            before_measured_value,
            before_pass_fail,
            before_defect_count,
            before_is_within_spec,
            after_measured_value,
            after_pass_fail,
            after_defect_count,
            after_is_within_spec,
            changed_by,
            change_reason
        )
        VALUES (
            NEW.id,
            NEW.revision_number,
            OLD.measured_value,
            OLD.pass_fail,
            OLD.defect_count,
            OLD.is_within_spec,
            NEW.measured_value,
            NEW.pass_fail,
            NEW.defect_count,
            NEW.is_within_spec,
            COALESCE(NEW.revised_by, auth.uid()),
            COALESCE(NEW.revision_reason, 'No reason provided')
        );

        -- Increment revision number
        NEW.revision_number := OLD.revision_number + 1;
        NEW.revised_at := NOW();
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_audit_measurement_revision ON quality_measurements;
CREATE TRIGGER trigger_audit_measurement_revision
    BEFORE UPDATE ON quality_measurements
    FOR EACH ROW
    EXECUTE FUNCTION fn_audit_measurement_revision();

-- =====================================================
-- COMPUTE SUBGROUP STATISTICS
-- =====================================================

CREATE OR REPLACE FUNCTION fn_compute_subgroup_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_stats RECORD;
BEGIN
    -- Compute statistics from all points in the subgroup
    SELECT
        COUNT(*)::INTEGER AS n,
        AVG(measured_value) AS mean,
        MAX(measured_value) - MIN(measured_value) AS range_value,
        STDDEV_SAMP(measured_value) AS stddev,
        MIN(measured_value) AS min_value,
        MAX(measured_value) AS max_value
    INTO v_stats
    FROM spc_points
    WHERE subgroup_id = COALESCE(NEW.subgroup_id, OLD.subgroup_id);

    -- Update subgroup with computed stats
    UPDATE spc_subgroups
    SET n = v_stats.n,
        mean = v_stats.mean,
        range_value = v_stats.range_value,
        stddev = v_stats.stddev,
        min_value = v_stats.min_value,
        max_value = v_stats.max_value,
        updated_at = NOW()
    WHERE id = COALESCE(NEW.subgroup_id, OLD.subgroup_id);

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_compute_subgroup_stats ON spc_points;
CREATE TRIGGER trigger_compute_subgroup_stats
    AFTER INSERT OR UPDATE OR DELETE ON spc_points
    FOR EACH ROW
    EXECUTE FUNCTION fn_compute_subgroup_stats();

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE quality_sampling_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE quality_inspection_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE quality_characteristics ENABLE ROW LEVEL SECURITY;
ALTER TABLE quality_inspection_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE quality_measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE quality_measurement_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE quality_defect_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quality_nonconformances ENABLE ROW LEVEL SECURITY;
ALTER TABLE quality_nc_defects ENABLE ROW LEVEL SECURITY;
ALTER TABLE quality_dispositions ENABLE ROW LEVEL SECURITY;
ALTER TABLE quality_capa ENABLE ROW LEVEL SECURITY;
ALTER TABLE spc_subgroups ENABLE ROW LEVEL SECURITY;
ALTER TABLE spc_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE spc_rule_violations ENABLE ROW LEVEL SECURITY;

-- Sampling Plans: Admin can manage, all authenticated can read
CREATE POLICY "Admin can manage sampling plans" ON quality_sampling_plans
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
    WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Authenticated can read sampling plans" ON quality_sampling_plans
    FOR SELECT TO authenticated USING (true);

-- Inspection Plans: Admin can manage, all authenticated can read
CREATE POLICY "Admin can manage inspection plans" ON quality_inspection_plans
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
    WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Authenticated can read inspection plans" ON quality_inspection_plans
    FOR SELECT TO authenticated USING (true);

-- Characteristics: Admin can manage, all authenticated can read
CREATE POLICY "Admin can manage characteristics" ON quality_characteristics
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
    WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Authenticated can read characteristics" ON quality_characteristics
    FOR SELECT TO authenticated USING (true);

-- Inspection Runs: Authorized users can manage
CREATE POLICY "Authorized users can manage inspection runs" ON quality_inspection_runs
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'dispatcher', 'supervisor', 'operator', 'technician')))
    WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'dispatcher', 'supervisor', 'operator', 'technician')));

-- Measurements: Authorized users can manage
CREATE POLICY "Authorized users can manage measurements" ON quality_measurements
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'dispatcher', 'supervisor', 'operator', 'technician')))
    WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'dispatcher', 'supervisor', 'operator', 'technician')));

-- Measurement Revisions: Read only for authorized users
CREATE POLICY "Authorized users can read measurement revisions" ON quality_measurement_revisions
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'dispatcher', 'supervisor', 'operator', 'technician')));

-- Defect Codes: Admin can manage, all authenticated can read
CREATE POLICY "Admin can manage defect codes" ON quality_defect_codes
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
    WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Authenticated can read defect codes" ON quality_defect_codes
    FOR SELECT TO authenticated USING (true);

-- Nonconformances: Authorized users can manage
CREATE POLICY "Authorized users can manage nonconformances" ON quality_nonconformances
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'dispatcher', 'supervisor', 'operator', 'technician')))
    WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'dispatcher', 'supervisor', 'operator', 'technician')));

-- NC Defects: Authorized users can manage
CREATE POLICY "Authorized users can manage nc defects" ON quality_nc_defects
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'dispatcher', 'supervisor', 'operator', 'technician')))
    WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'dispatcher', 'supervisor', 'operator', 'technician')));

-- Dispositions: Supervisors and Admin can manage
CREATE POLICY "Supervisors can manage dispositions" ON quality_dispositions
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor')))
    WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor')));

CREATE POLICY "Authorized users can read dispositions" ON quality_dispositions
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'dispatcher', 'supervisor', 'operator', 'technician')));

-- CAPA: Supervisors and Admin can manage
CREATE POLICY "Supervisors can manage capa" ON quality_capa
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor')))
    WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor')));

CREATE POLICY "Authorized users can read capa" ON quality_capa
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'dispatcher', 'supervisor', 'operator', 'technician')));

-- SPC tables: Authorized users can manage
CREATE POLICY "Authorized users can manage spc subgroups" ON spc_subgroups
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'dispatcher', 'supervisor', 'operator', 'technician')))
    WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'dispatcher', 'supervisor', 'operator', 'technician')));

CREATE POLICY "Authorized users can manage spc points" ON spc_points
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'dispatcher', 'supervisor', 'operator', 'technician')))
    WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'dispatcher', 'supervisor', 'operator', 'technician')));

CREATE POLICY "Authorized users can manage spc violations" ON spc_rule_violations
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'dispatcher', 'supervisor', 'operator', 'technician')))
    WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'dispatcher', 'supervisor', 'operator', 'technician')));

-- =====================================================
-- VIEWS FOR DASHBOARD/REPORTING
-- =====================================================

-- Inspection queue view
CREATE OR REPLACE VIEW vw_quality_inspection_queue AS
SELECT
    qir.id,
    qir.status,
    qir.started_at,
    qir.completed_at,
    qir.created_at,
    qip.name AS plan_name,
    qip.plan_type,
    po.order_number AS production_order_number,
    po.title AS production_order_title,
    wc.name AS work_center_name,
    p.full_name AS inspector_name,
    qir.total_characteristics,
    qir.passed_characteristics,
    qir.failed_characteristics
FROM quality_inspection_runs qir
JOIN quality_inspection_plans qip ON qir.inspection_plan_id = qip.id
LEFT JOIN production_orders po ON qir.production_order_id = po.id
LEFT JOIN work_centers wc ON qir.work_center_id = wc.id
LEFT JOIN profiles p ON qir.inspector_id = p.id;

-- NCR summary view
CREATE OR REPLACE VIEW vw_quality_ncr_summary AS
SELECT
    qnc.id,
    qnc.nc_number,
    qnc.source,
    qnc.severity,
    qnc.status,
    qnc.title,
    qnc.qty_affected,
    qnc.reported_at,
    qnc.closed_at,
    po.order_number AS production_order_number,
    pt.part_number,
    pt.name AS part_name,
    reporter.full_name AS reported_by_name,
    assignee.full_name AS assigned_to_name,
    (SELECT COUNT(*) FROM quality_nc_defects WHERE nonconformance_id = qnc.id) AS defect_count,
    (SELECT disposition FROM quality_dispositions WHERE nonconformance_id = qnc.id ORDER BY created_at DESC LIMIT 1) AS latest_disposition
FROM quality_nonconformances qnc
LEFT JOIN production_orders po ON qnc.production_order_id = po.id
LEFT JOIN parts pt ON qnc.part_id = pt.id
LEFT JOIN profiles reporter ON qnc.reported_by = reporter.id
LEFT JOIN profiles assignee ON qnc.assigned_to = assignee.id;

-- Defect Pareto view
CREATE OR REPLACE VIEW vw_quality_defect_pareto AS
SELECT
    qdc.id AS defect_code_id,
    qdc.code,
    qdc.name,
    qdc.category,
    COUNT(qnd.id) AS occurrence_count,
    SUM(qnd.qty_affected) AS total_qty_affected
FROM quality_defect_codes qdc
LEFT JOIN quality_nc_defects qnd ON qdc.id = qnd.defect_code_id
GROUP BY qdc.id, qdc.code, qdc.name, qdc.category
ORDER BY occurrence_count DESC;

-- =====================================================
-- SEED DEFAULT DEFECT CODES
-- =====================================================

INSERT INTO quality_defect_codes (code, name, category, severity_default) VALUES
    ('DIM-001', 'Out of Tolerance - Oversize', 'dimensional', 'MAJOR'),
    ('DIM-002', 'Out of Tolerance - Undersize', 'dimensional', 'MAJOR'),
    ('DIM-003', 'Incorrect Dimension', 'dimensional', 'MAJOR'),
    ('COS-001', 'Scratch', 'cosmetic', 'MINOR'),
    ('COS-002', 'Dent', 'cosmetic', 'MINOR'),
    ('COS-003', 'Discoloration', 'cosmetic', 'MINOR'),
    ('COS-004', 'Surface Finish Defect', 'cosmetic', 'MINOR'),
    ('FUN-001', 'Does Not Function', 'functional', 'CRITICAL'),
    ('FUN-002', 'Intermittent Function', 'functional', 'MAJOR'),
    ('FUN-003', 'Performance Below Spec', 'functional', 'MAJOR'),
    ('MAT-001', 'Wrong Material', 'material', 'CRITICAL'),
    ('MAT-002', 'Material Contamination', 'material', 'MAJOR'),
    ('MAT-003', 'Material Defect', 'material', 'MAJOR'),
    ('ASM-001', 'Missing Component', 'assembly', 'CRITICAL'),
    ('ASM-002', 'Wrong Component', 'assembly', 'CRITICAL'),
    ('ASM-003', 'Loose Assembly', 'assembly', 'MAJOR'),
    ('ASM-004', 'Incorrect Orientation', 'assembly', 'MAJOR'),
    ('DOC-001', 'Missing Documentation', 'documentation', 'MINOR'),
    ('DOC-002', 'Incorrect Documentation', 'documentation', 'MINOR'),
    ('PKG-001', 'Packaging Damage', 'packaging', 'MINOR'),
    ('PKG-002', 'Incorrect Packaging', 'packaging', 'MINOR')
ON CONFLICT (code) DO NOTHING;

-- =====================================================
-- SEED DEFAULT SAMPLING PLANS
-- =====================================================

INSERT INTO quality_sampling_plans (name, description, method, sample_size, frequency_n) VALUES
    ('100% Inspection', 'Inspect every unit', '100_PERCENT', NULL, NULL),
    ('First Article', 'Inspect first piece of each batch', 'EVERY_N', 1, 1),
    ('Every 10th Unit', 'Inspect every 10th unit', 'EVERY_N', 1, 10),
    ('Every 25th Unit', 'Inspect every 25th unit', 'EVERY_N', 1, 25),
    ('Per Lot - 5 Samples', 'Sample 5 units per lot', 'PER_LOT', 5, NULL),
    ('Per Lot - 10 Samples', 'Sample 10 units per lot', 'PER_LOT', 10, NULL)
ON CONFLICT DO NOTHING;

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE quality_sampling_plans IS 'Sampling plan definitions for inspection frequency';
COMMENT ON TABLE quality_inspection_plans IS 'Inspection plan templates with linkage to products/operations/work centers';
COMMENT ON TABLE quality_characteristics IS 'Individual checks/measurements within an inspection plan';
COMMENT ON TABLE quality_inspection_runs IS 'Executed inspection instances linked to production context';
COMMENT ON TABLE quality_measurements IS 'Individual measurement results with audit trail';
COMMENT ON TABLE quality_measurement_revisions IS 'Audit trail for measurement edits';
COMMENT ON TABLE quality_defect_codes IS 'Defect taxonomy for Pareto analysis';
COMMENT ON TABLE quality_nonconformances IS 'Nonconformance reports (NCRs)';
COMMENT ON TABLE quality_nc_defects IS 'Defects associated with an NCR';
COMMENT ON TABLE quality_dispositions IS 'Disposition decisions for NCRs';
COMMENT ON TABLE quality_capa IS 'Corrective and Preventive Actions';
COMMENT ON TABLE spc_subgroups IS 'SPC subgroup data for control charts';
COMMENT ON TABLE spc_points IS 'Individual SPC measurement points within subgroups';
COMMENT ON TABLE spc_rule_violations IS 'Detected SPC control rule violations';
