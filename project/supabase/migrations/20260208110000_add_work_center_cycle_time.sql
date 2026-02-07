-- Add ideal_cycle_time_seconds column to work_centers table
-- This column is needed for OEE calculations

ALTER TABLE work_centers
ADD COLUMN IF NOT EXISTS ideal_cycle_time_seconds NUMERIC(10, 3);

-- Also add line_id if missing
ALTER TABLE work_centers
ADD COLUMN IF NOT EXISTS line_id UUID;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
