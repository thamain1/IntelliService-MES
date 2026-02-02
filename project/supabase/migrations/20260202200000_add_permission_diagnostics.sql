/*
  # Add Permission Diagnostics

  Create diagnostic functions to troubleshoot permission issues.
*/

-- Function to check current user's permissions for ticket operations
CREATE OR REPLACE FUNCTION fn_diagnose_ticket_permissions(p_ticket_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_profile record;
  v_ticket record;
  v_can_update boolean := false;
  v_policies jsonb;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Get user's profile
  SELECT id, email, full_name, role, is_active INTO v_profile
  FROM profiles
  WHERE id = v_user_id;

  IF v_profile IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Profile not found',
      'user_id', v_user_id
    );
  END IF;

  -- Check if user can update tickets based on role
  IF v_profile.role IN ('admin', 'dispatcher') THEN
    v_can_update := true;
  END IF;

  -- If ticket_id provided, check specific ticket
  IF p_ticket_id IS NOT NULL THEN
    SELECT id, ticket_number, assigned_to, status INTO v_ticket
    FROM tickets
    WHERE id = p_ticket_id;

    IF v_ticket IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Ticket not found',
        'ticket_id', p_ticket_id,
        'user_role', v_profile.role
      );
    END IF;

    -- Check if technician can update this specific ticket
    IF v_profile.role = 'technician' AND v_ticket.assigned_to = v_user_id THEN
      v_can_update := true;
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'user_id', v_user_id,
      'user_email', v_profile.email,
      'user_name', v_profile.full_name,
      'user_role', v_profile.role,
      'user_active', v_profile.is_active,
      'ticket_id', v_ticket.id,
      'ticket_number', v_ticket.ticket_number,
      'ticket_assigned_to', v_ticket.assigned_to,
      'ticket_status', v_ticket.status,
      'can_update', v_can_update,
      'reason', CASE
        WHEN v_profile.role IN ('admin', 'dispatcher') THEN 'Admin/Dispatcher can update any ticket'
        WHEN v_profile.role = 'technician' AND v_ticket.assigned_to = v_user_id THEN 'Technician can update assigned ticket'
        WHEN v_profile.role = 'technician' THEN 'Technician cannot update - not assigned to this ticket'
        ELSE 'Unknown role - cannot update'
      END
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_user_id,
    'user_email', v_profile.email,
    'user_name', v_profile.full_name,
    'user_role', v_profile.role,
    'user_active', v_profile.is_active,
    'can_update_tickets', v_can_update,
    'reason', CASE
      WHEN v_profile.role IN ('admin', 'dispatcher') THEN 'Admin/Dispatcher can update any ticket'
      WHEN v_profile.role = 'technician' THEN 'Technician can only update assigned tickets'
      ELSE 'Unknown role'
    END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION fn_diagnose_ticket_permissions TO authenticated;

-- List all current policies on tickets table (for debugging)
CREATE OR REPLACE VIEW vw_ticket_policies AS
SELECT
  policyname as policy_name,
  cmd as operation,
  permissive,
  roles,
  qual as using_expression,
  with_check
FROM pg_policies
WHERE tablename = 'tickets'
AND schemaname = 'public'
ORDER BY policyname;

GRANT SELECT ON vw_ticket_policies TO authenticated;

-- Also check if there are any restrictive policies that might be blocking
DO $$
DECLARE
  v_restrictive_count integer;
BEGIN
  SELECT COUNT(*) INTO v_restrictive_count
  FROM pg_policies
  WHERE tablename = 'tickets'
  AND schemaname = 'public'
  AND permissive = 'RESTRICTIVE';

  IF v_restrictive_count > 0 THEN
    RAISE WARNING 'Found % RESTRICTIVE policies on tickets table - these can block other policies!', v_restrictive_count;
  ELSE
    RAISE NOTICE 'No restrictive policies on tickets table.';
  END IF;
END;
$$;
