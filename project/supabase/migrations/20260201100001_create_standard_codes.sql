/*
  # Create Standard Codes Table for Analytics Pipeline

  This migration creates the foundation for the Problem/Resolution code system
  that enables Pareto analysis, root cause detection, and sales opportunity tagging.

  ## Tables Created
  - `standard_codes` - Master table for problem and resolution codes

  ## Columns Added to `tickets`
  - `problem_code` - FK to standard_codes
  - `resolution_code` - FK to standard_codes
  - `sales_opportunity_flag` - Auto-set when trigger codes are used
  - `urgent_review_flag` - Auto-set for temporary fixes
*/

-- Create the standard_codes table
CREATE TABLE IF NOT EXISTS standard_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    code_type TEXT NOT NULL CHECK (code_type IN ('problem', 'resolution')),
    label TEXT NOT NULL,
    description TEXT,
    category TEXT,
    severity INTEGER DEFAULT 5 CHECK (severity BETWEEN 1 AND 10),
    triggers_sales_lead BOOLEAN DEFAULT FALSE,
    triggers_urgent_review BOOLEAN DEFAULT FALSE,
    is_critical_safety BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add RLS
ALTER TABLE standard_codes ENABLE ROW LEVEL SECURITY;

-- Everyone can read standard codes
CREATE POLICY "Standard codes are viewable by all authenticated users"
    ON standard_codes FOR SELECT
    TO authenticated
    USING (true);

-- Only admins can modify
CREATE POLICY "Only admins can insert standard codes"
    ON standard_codes FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

CREATE POLICY "Only admins can update standard codes"
    ON standard_codes FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Create indexes for efficient lookups
CREATE INDEX idx_standard_codes_type ON standard_codes(code_type);
CREATE INDEX idx_standard_codes_active ON standard_codes(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_standard_codes_sales_trigger ON standard_codes(triggers_sales_lead) WHERE triggers_sales_lead = TRUE;

-- Add comments for documentation
COMMENT ON TABLE standard_codes IS 'Master table for standardized problem and resolution codes used in ticket analytics';
COMMENT ON COLUMN standard_codes.code IS 'Unique code identifier (e.g., NO-COOL-AIRFLOW, RES-CAPACITOR-REPLACE)';
COMMENT ON COLUMN standard_codes.code_type IS 'Type of code: problem (symptoms) or resolution (actions taken)';
COMMENT ON COLUMN standard_codes.category IS 'Category grouping: electrical, airflow, refrigerant, safety, usage';
COMMENT ON COLUMN standard_codes.triggers_sales_lead IS 'When true, using this code flags the ticket as a sales opportunity';
COMMENT ON COLUMN standard_codes.triggers_urgent_review IS 'When true, using this code flags the ticket for management review';
COMMENT ON COLUMN standard_codes.is_critical_safety IS 'When true, selecting this code shows a safety warning (e.g., gas leak)';
