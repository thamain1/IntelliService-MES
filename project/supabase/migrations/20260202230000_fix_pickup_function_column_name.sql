/*
  # Fix Parts Pickup Function Column Name

  ## Problem
  The fn_pickup_parts_for_ticket function is referencing `pi.location_id`
  but the column is actually `pi.stock_location_id`.

  ## Solution
  Recreate the function with the correct column name.
*/

-- Recreate the function with correct column names
CREATE OR REPLACE FUNCTION fn_pickup_parts_for_ticket(
  p_ticket_id uuid,
  p_destination_location_id uuid  -- Tech's truck location
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_pick_list_id uuid;
  v_staging_location_id uuid := 'a0000000-0000-0000-0000-000000000001';
  v_item record;
  v_transferred_count integer := 0;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get pick list
  SELECT id INTO v_pick_list_id
  FROM ticket_pick_lists
  WHERE ticket_id = p_ticket_id
  AND status IN ('pending', 'ready');

  IF v_pick_list_id IS NULL THEN
    RAISE EXCEPTION 'No pending pick list found for this ticket';
  END IF;

  -- Transfer each part from staging to destination (tech's truck)
  FOR v_item IN
    SELECT tpli.*, pi.quantity as staged_qty
    FROM ticket_pick_list_items tpli
    JOIN part_inventory pi ON pi.part_id = tpli.part_id
      AND pi.stock_location_id = tpli.source_location_id  -- FIXED: was location_id
      AND pi.reserved_for_ticket_id = p_ticket_id
    WHERE tpli.pick_list_id = v_pick_list_id
    AND tpli.picked_up = false
  LOOP
    -- Decrease from staging
    UPDATE part_inventory
    SET
      quantity = quantity - v_item.quantity,
      reserved_for_ticket_id = NULL,
      reserved_at = NULL,
      reserved_by = NULL
    WHERE part_id = v_item.part_id
    AND stock_location_id = v_staging_location_id  -- FIXED: was location_id
    AND reserved_for_ticket_id = p_ticket_id;

    -- Add to tech's truck
    INSERT INTO part_inventory (part_id, stock_location_id, quantity)
    VALUES (v_item.part_id, p_destination_location_id, v_item.quantity)
    ON CONFLICT (part_id, stock_location_id) DO UPDATE
    SET quantity = part_inventory.quantity + EXCLUDED.quantity;

    -- Mark item as picked up
    UPDATE ticket_pick_list_items
    SET picked_up = true, picked_up_at = now()
    WHERE id = v_item.id;

    v_transferred_count := v_transferred_count + 1;
  END LOOP;

  -- Update pick list status
  UPDATE ticket_pick_lists
  SET
    status = 'picked_up',
    picked_up_at = now(),
    picked_up_by = v_user_id,
    updated_at = now()
  WHERE id = v_pick_list_id;

  -- Update ticket - now fully ready to work
  UPDATE tickets
  SET
    hold_active = false,
    hold_type = NULL,
    updated_at = now()
  WHERE id = p_ticket_id;

  -- Add ticket update
  INSERT INTO ticket_updates (
    ticket_id,
    technician_id,
    update_type,
    notes
  ) VALUES (
    p_ticket_id,
    v_user_id,
    'parts_picked_up',
    'Parts picked up from staging area and loaded to truck. Ready to complete job.'
  );

  RETURN jsonb_build_object(
    'success', true,
    'pick_list_id', v_pick_list_id,
    'items_transferred', v_transferred_count,
    'destination_location_id', p_destination_location_id
  );
END;
$$;

-- Ensure grants
GRANT EXECUTE ON FUNCTION fn_pickup_parts_for_ticket TO authenticated;

-- Verify
DO $$
BEGIN
  RAISE NOTICE 'Function fn_pickup_parts_for_ticket recreated with correct column name (stock_location_id)';
END;
$$;
