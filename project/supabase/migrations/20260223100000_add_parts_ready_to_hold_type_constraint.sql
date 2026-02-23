-- Add 'parts_ready' to the hold_type check constraint on tickets table
-- This allows the receiving trigger to mark tickets as having parts ready for pickup

-- Drop the existing constraint
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_hold_type_check;

-- Add updated constraint with 'parts_ready' option
ALTER TABLE tickets ADD CONSTRAINT tickets_hold_type_check
  CHECK (hold_type IS NULL OR hold_type IN ('parts', 'issue', 'parts_ready'));
