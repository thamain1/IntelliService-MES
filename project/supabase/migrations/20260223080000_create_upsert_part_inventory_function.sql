-- Create atomic upsert function for part_inventory
-- This function handles the INSERT or UPDATE in a single atomic operation
-- avoiding race conditions and duplicate key violations

CREATE OR REPLACE FUNCTION fn_upsert_part_inventory(
  p_part_id UUID,
  p_location_id UUID,
  p_quantity_change NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Use INSERT ON CONFLICT for atomic upsert
  INSERT INTO part_inventory (part_id, stock_location_id, quantity, created_at, updated_at)
  VALUES (p_part_id, p_location_id, p_quantity_change, NOW(), NOW())
  ON CONFLICT (part_id, stock_location_id)
  DO UPDATE SET
    quantity = part_inventory.quantity + p_quantity_change,
    updated_at = NOW();
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION fn_upsert_part_inventory TO authenticated;

-- Add comment
COMMENT ON FUNCTION fn_upsert_part_inventory IS
  'Atomically inserts or updates part_inventory quantity. Uses ON CONFLICT for proper upsert handling.';

-- Disable the inventory_movements trigger for receipt type to avoid double-processing
-- The trigger was causing duplicate inserts when combined with direct updates
DROP TRIGGER IF EXISTS trg_process_inventory_movement ON inventory_movements;
