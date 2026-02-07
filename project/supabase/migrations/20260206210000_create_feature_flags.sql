/*
  # Feature Flags System

  ## Overview
  Creates a feature flags system for toggling modules and features at the organization level.
  This enables gradual rollout and allows disabling features without code changes.

  ## 1. New Tables
  ### organization_features
    - `id` (uuid) - Primary key
    - `feature_key` (text) - Unique identifier for the feature
    - `display_name` (text) - Human-readable name
    - `description` (text) - Feature description
    - `is_enabled` (boolean) - Whether feature is active
    - `config` (jsonb) - Additional configuration options

  ## 2. Security
    - Enable RLS on all new tables
    - SELECT for all authenticated users
    - INSERT/UPDATE/DELETE for admin only

  ## 3. Helper Functions
    - is_feature_enabled(feature_key) - Quick lookup function
*/

-- Create organization_features table
CREATE TABLE IF NOT EXISTS organization_features (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    feature_key TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    description TEXT,
    is_enabled BOOLEAN DEFAULT FALSE,
    config JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for fast lookups by feature_key
CREATE INDEX IF NOT EXISTS idx_organization_features_feature_key
    ON organization_features(feature_key);

-- Enable RLS
ALTER TABLE organization_features ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- All authenticated users can view features
CREATE POLICY "Authenticated users can view organization_features"
    ON organization_features FOR SELECT
    TO authenticated
    USING (true);

-- Only admins can insert features
CREATE POLICY "Admins can insert organization_features"
    ON organization_features FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Only admins can update features
CREATE POLICY "Admins can update organization_features"
    ON organization_features FOR UPDATE
    TO authenticated
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

-- Only admins can delete features
CREATE POLICY "Admins can delete organization_features"
    ON organization_features FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_organization_features_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_organization_features_updated_at ON organization_features;
CREATE TRIGGER trigger_update_organization_features_updated_at
    BEFORE UPDATE ON organization_features
    FOR EACH ROW
    EXECUTE FUNCTION update_organization_features_updated_at();

-- Helper function to check if a feature is enabled
CREATE OR REPLACE FUNCTION is_feature_enabled(p_feature_key TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    v_enabled BOOLEAN;
BEGIN
    SELECT is_enabled INTO v_enabled
    FROM organization_features
    WHERE feature_key = p_feature_key;

    -- Return false if feature not found
    RETURN COALESCE(v_enabled, false);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION is_feature_enabled(TEXT) TO authenticated;

-- Seed initial feature flags
INSERT INTO organization_features (feature_key, display_name, description, is_enabled, config)
VALUES
    ('module_mes', 'Manufacturing Execution System', 'Shop floor production tracking, work orders, bill of materials, and material handling', true, '{}'),
    ('module_warranty', 'Warranty Management', 'Track warranty claims, repairs, and manufacturer warranty periods', false, '{}'),
    ('module_fleet', 'Fleet Management', 'Vehicle tracking, maintenance schedules, and fuel management', false, '{}')
ON CONFLICT (feature_key) DO NOTHING;

-- Add comment for documentation
COMMENT ON TABLE organization_features IS 'Feature flags for enabling/disabling modules and features';
COMMENT ON FUNCTION is_feature_enabled(TEXT) IS 'Returns true if the specified feature is enabled, false otherwise';
