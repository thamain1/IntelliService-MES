-- Fix the fn_process_received_parts_for_tickets function to use proper upsert
-- The issue: INSERT fails when part_inventory record already exists with different reservation

CREATE OR REPLACE FUNCTION fn_process_received_parts_for_tickets()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_linked_ticket_id uuid;
  v_linked_request_id uuid;
  v_all_parts_received boolean;
  v_staging_location_id uuid := 'a0000000-0000-0000-0000-000000000001';
  v_pick_list_id uuid;
  v_new_qty integer;
BEGIN
  -- Only process when quantity_received is updated
  IF NEW.quantity_received IS DISTINCT FROM OLD.quantity_received THEN
    v_linked_ticket_id := NEW.linked_ticket_id;
    v_linked_request_id := NEW.linked_request_id;

    IF v_linked_ticket_id IS NOT NULL AND NEW.quantity_received > COALESCE(OLD.quantity_received, 0) THEN
      -- Calculate how many NEW parts were received this update
      v_new_qty := NEW.quantity_received - COALESCE(OLD.quantity_received, 0);

      -- Use INSERT ON CONFLICT for atomic upsert - handles all cases
      INSERT INTO part_inventory (part_id, stock_location_id, quantity, reserved_for_ticket_id, reserved_at, reserved_by)
      VALUES (NEW.part_id, v_staging_location_id, v_new_qty, v_linked_ticket_id, now(), auth.uid())
      ON CONFLICT (part_id, stock_location_id)
      DO UPDATE SET
        quantity = part_inventory.quantity + v_new_qty,
        reserved_for_ticket_id = v_linked_ticket_id,
        reserved_at = now(),
        reserved_by = auth.uid(),
        updated_at = now();

      -- Check if all parts for this request have been received
      SELECT
        NOT EXISTS (
          SELECT 1
          FROM purchase_order_lines pol
          WHERE pol.linked_request_id = v_linked_request_id
          AND COALESCE(pol.quantity_received, 0) < pol.quantity_ordered
        )
      INTO v_all_parts_received;

      IF v_all_parts_received THEN
        -- Update the parts request status to 'received'
        UPDATE ticket_parts_requests
        SET
          status = 'received',
          fulfilled_at = now()
        WHERE id = v_linked_request_id
        AND status = 'ordered';

        -- Create or update pick list for this ticket
        INSERT INTO ticket_pick_lists (ticket_id, status, notes)
        VALUES (v_linked_ticket_id, 'ready', 'Parts received and staged for pickup')
        ON CONFLICT (ticket_id) DO UPDATE SET
          status = 'ready',
          updated_at = now();

        -- Get the pick list ID
        SELECT id INTO v_pick_list_id
        FROM ticket_pick_lists
        WHERE ticket_id = v_linked_ticket_id;

        -- Add items to pick list
        INSERT INTO ticket_pick_list_items (pick_list_id, part_id, quantity, source_location_id)
        SELECT
          v_pick_list_id,
          pi.part_id,
          pi.quantity,
          pi.stock_location_id
        FROM part_inventory pi
        WHERE pi.reserved_for_ticket_id = v_linked_ticket_id
        AND pi.stock_location_id = v_staging_location_id
        ON CONFLICT DO NOTHING;

        -- Update ticket
        UPDATE tickets
        SET
          hold_type = 'parts_ready',
          revisit_required = true,
          updated_at = now()
        WHERE id = v_linked_ticket_id;

        -- Resolve the hold
        UPDATE ticket_holds
        SET
          status = 'resolved',
          resolved_at = now(),
          metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
            'resolved_reason', 'parts_staged',
            'pickup_required', true,
            'pick_list_id', v_pick_list_id
          )
        WHERE ticket_id = v_linked_ticket_id
        AND hold_type = 'parts'
        AND status = 'active';

        -- Create ticket update
        INSERT INTO ticket_updates (
          ticket_id,
          technician_id,
          update_type,
          notes,
          status
        ) VALUES (
          v_linked_ticket_id,
          auth.uid(),
          'parts_staged',
          'Parts received and staged in Job Staging area. Ready for technician pickup.',
          'scheduled'
        );
      END IF;
    -- Handle receiving for parts NOT linked to a ticket (general inventory)
    ELSIF v_linked_ticket_id IS NULL AND NEW.quantity_received > COALESCE(OLD.quantity_received, 0) THEN
      v_new_qty := NEW.quantity_received - COALESCE(OLD.quantity_received, 0);

      -- For non-ticket parts, don't auto-stage - they need manual location selection
      -- The frontend handles this via fn_upsert_part_inventory before updating the PO line
      NULL; -- Do nothing, let frontend handle it
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
