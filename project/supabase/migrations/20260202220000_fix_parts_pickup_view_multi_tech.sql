/*
  # Fix Parts Pickup View for Multi-Tech Assignments

  ## Problem
  The `vw_parts_ready_for_pickup` view only looks at `tickets.assigned_to`.
  When technicians are assigned via `ticket_assignments` table (multi-tech feature),
  the view shows "Unassigned" even though a tech is assigned.

  ## Solution
  Update the view to check both:
  1. `tickets.assigned_to` (primary)
  2. `ticket_assignments` table (fallback - get lead tech or first tech)
*/

-- Drop and recreate the view with multi-tech support
DROP VIEW IF EXISTS vw_parts_ready_for_pickup;

CREATE VIEW vw_parts_ready_for_pickup AS
WITH effective_assignments AS (
  -- Get effective assigned technician for each ticket
  -- Priority: tickets.assigned_to > ticket_assignments.lead > ticket_assignments.first
  SELECT
    t.id AS ticket_id,
    COALESCE(
      t.assigned_to,
      (SELECT ta.technician_id
       FROM ticket_assignments ta
       WHERE ta.ticket_id = t.id AND ta.role = 'lead'
       LIMIT 1),
      (SELECT ta.technician_id
       FROM ticket_assignments ta
       WHERE ta.ticket_id = t.id
       ORDER BY ta.created_at ASC
       LIMIT 1)
    ) AS effective_assigned_to
  FROM tickets t
)
SELECT
  tpl.id AS pick_list_id,
  tpl.ticket_id,
  t.ticket_number,
  t.title AS ticket_title,
  ea.effective_assigned_to AS assigned_to,
  p.full_name AS assigned_tech_name,
  t.scheduled_date,
  c.name AS customer_name,
  tpl.status AS pick_list_status,
  tpl.created_at,
  -- Aggregate parts to pick up
  (
    SELECT jsonb_agg(jsonb_build_object(
      'item_id', tpli.id,
      'part_id', tpli.part_id,
      'part_number', parts.part_number,
      'part_name', parts.name,
      'quantity', tpli.quantity,
      'location', sl.name,
      'picked_up', tpli.picked_up
    ))
    FROM ticket_pick_list_items tpli
    JOIN parts ON parts.id = tpli.part_id
    JOIN stock_locations sl ON sl.id = tpli.source_location_id
    WHERE tpli.pick_list_id = tpl.id
  ) AS items,
  -- Count items
  (SELECT COUNT(*) FROM ticket_pick_list_items WHERE pick_list_id = tpl.id) AS total_items,
  (SELECT COUNT(*) FROM ticket_pick_list_items WHERE pick_list_id = tpl.id AND picked_up = true) AS picked_items
FROM ticket_pick_lists tpl
JOIN tickets t ON t.id = tpl.ticket_id
JOIN effective_assignments ea ON ea.ticket_id = t.id
LEFT JOIN profiles p ON p.id = ea.effective_assigned_to
LEFT JOIN customers c ON c.id = t.customer_id
WHERE tpl.status IN ('pending', 'ready')
ORDER BY t.scheduled_date ASC NULLS LAST, tpl.created_at ASC;

COMMENT ON VIEW vw_parts_ready_for_pickup IS 'Parts staged and ready for technician pickup. Supports both single-tech (tickets.assigned_to) and multi-tech (ticket_assignments) assignments.';

-- Grant access
GRANT SELECT ON vw_parts_ready_for_pickup TO authenticated;

-- Also update the trigger to sync with ticket_assignments if needed
CREATE OR REPLACE FUNCTION fn_handle_ticket_assignment_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_effective_tech uuid;
BEGIN
  -- Get the effective technician (check both assigned_to and ticket_assignments)
  v_effective_tech := COALESCE(
    NEW.assigned_to,
    (SELECT ta.technician_id
     FROM ticket_assignments ta
     WHERE ta.ticket_id = NEW.id AND ta.role = 'lead'
     LIMIT 1),
    (SELECT ta.technician_id
     FROM ticket_assignments ta
     WHERE ta.ticket_id = NEW.id
     ORDER BY ta.created_at ASC
     LIMIT 1)
  );

  -- Update pick list if assignment changed
  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to OR v_effective_tech IS NOT NULL THEN
    UPDATE ticket_pick_lists
    SET
      assigned_to = v_effective_tech,
      updated_at = now()
    WHERE ticket_id = NEW.id
    AND status IN ('pending', 'ready');
  END IF;

  RETURN NEW;
END;
$$;

-- Also add a trigger on ticket_assignments to update pick lists
CREATE OR REPLACE FUNCTION fn_handle_ticket_assignments_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_effective_tech uuid;
  v_ticket_assigned_to uuid;
BEGIN
  -- Get ticket's assigned_to
  SELECT assigned_to INTO v_ticket_assigned_to
  FROM tickets WHERE id = COALESCE(NEW.ticket_id, OLD.ticket_id);

  -- If ticket has assigned_to, that takes priority
  IF v_ticket_assigned_to IS NOT NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Otherwise, get effective tech from ticket_assignments
  v_effective_tech := (
    SELECT ta.technician_id
    FROM ticket_assignments ta
    WHERE ta.ticket_id = COALESCE(NEW.ticket_id, OLD.ticket_id)
    AND ta.role = 'lead'
    LIMIT 1
  );

  IF v_effective_tech IS NULL THEN
    v_effective_tech := (
      SELECT ta.technician_id
      FROM ticket_assignments ta
      WHERE ta.ticket_id = COALESCE(NEW.ticket_id, OLD.ticket_id)
      ORDER BY ta.created_at ASC
      LIMIT 1
    );
  END IF;

  -- Update pick list
  UPDATE ticket_pick_lists
  SET
    assigned_to = v_effective_tech,
    updated_at = now()
  WHERE ticket_id = COALESCE(NEW.ticket_id, OLD.ticket_id)
  AND status IN ('pending', 'ready');

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Create trigger on ticket_assignments
DROP TRIGGER IF EXISTS trg_ticket_assignments_change ON ticket_assignments;
CREATE TRIGGER trg_ticket_assignments_change
AFTER INSERT OR UPDATE OR DELETE ON ticket_assignments
FOR EACH ROW
EXECUTE FUNCTION fn_handle_ticket_assignments_change();

-- Verify
DO $$
BEGIN
  RAISE NOTICE 'View vw_parts_ready_for_pickup updated to support multi-tech assignments';
  RAISE NOTICE 'Triggers added to sync pick lists with ticket_assignments table';
END;
$$;
