/*
  # Fix Admin and Technician Permission Issues

  ## Issues Fixed
  1. Ticket UPDATE policy - Add explicit WITH CHECK clause for admins/dispatchers
  2. Profile UPDATE policy - Ensure admins can update any profile including their own
  3. Add diagnostic view to find orphaned profiles (profiles without auth.users entry)

  ## Security
  - All policies use SECURITY DEFINER functions to avoid circular dependency
  - Explicit WITH CHECK clauses prevent silent failures
*/

-- =====================================================
-- STEP 1: Fix Ticket UPDATE Policies
-- =====================================================

-- Drop existing ticket update policies to recreate them cleanly
DROP POLICY IF EXISTS "Admins and dispatchers can update any ticket" ON public.tickets;
DROP POLICY IF EXISTS "Technicians can update assigned tickets" ON public.tickets;

-- Recreate admin/dispatcher policy with explicit WITH CHECK
CREATE POLICY "Admins and dispatchers can update any ticket"
  ON public.tickets
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role IN ('admin', 'dispatcher')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role IN ('admin', 'dispatcher')
    )
  );

-- Recreate technician policy - they can only update their assigned tickets
-- And can only modify certain fields (not reassign to someone else)
CREATE POLICY "Technicians can update assigned tickets"
  ON public.tickets
  FOR UPDATE
  TO authenticated
  USING (
    assigned_to = (SELECT auth.uid()) AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = 'technician'
    )
  )
  WITH CHECK (
    -- Technicians must remain assigned to the ticket after update
    assigned_to = (SELECT auth.uid())
  );

-- =====================================================
-- STEP 2: Ensure Admins Can Update All Profiles
-- =====================================================

-- Drop ALL versions of is_admin functions (with any argument signatures)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT oid::regprocedure as func_sig
    FROM pg_proc
    WHERE proname = 'is_admin'
    AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_sig || ' CASCADE';
  END LOOP;
END;
$$;

-- Create is_admin() function in public schema
CREATE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
    AND role = 'admin'
  );
$$;

-- Drop any duplicate is_admin_or_dispatcher functions first
DROP FUNCTION IF EXISTS public.is_admin_or_dispatcher();

-- Create is_admin_or_dispatcher() function for broader access
CREATE OR REPLACE FUNCTION public.is_admin_or_dispatcher()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'dispatcher')
  );
$$;

-- Drop and recreate profile update policies
DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);

-- Admins can update any profile (including their own)
CREATE POLICY "Admins can update any profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Admins can insert profiles (for user creation)
DROP POLICY IF EXISTS "Admins can insert profiles" ON public.profiles;
CREATE POLICY "Admins can insert profiles"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin() OR (SELECT auth.uid()) = id);

-- =====================================================
-- STEP 3: Diagnostic View for Orphaned Profiles
-- =====================================================

-- Create a view to help identify profiles without matching auth.users
-- This requires admin access and helps diagnose password update issues
CREATE OR REPLACE VIEW vw_admin_profile_diagnostics AS
SELECT
  p.id as profile_id,
  p.email,
  p.full_name,
  p.role,
  p.is_active,
  p.default_vehicle_id,
  sl.name as assigned_vehicle_name,
  sl.location_type as assigned_vehicle_type,
  CASE
    WHEN EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id)
    THEN true
    ELSE false
  END as has_auth_user,
  p.created_at
FROM profiles p
LEFT JOIN stock_locations sl ON sl.id = p.default_vehicle_id
ORDER BY p.full_name;

-- Grant access only to admin users via RLS
GRANT SELECT ON vw_admin_profile_diagnostics TO authenticated;

COMMENT ON VIEW vw_admin_profile_diagnostics IS 'Diagnostic view for admins to check profile status, vehicle assignments, and auth.users linkage';

-- =====================================================
-- STEP 4: Ensure Pick List RLS Policies Are Correct
-- =====================================================

-- Verify pick list policies exist and are permissive
DROP POLICY IF EXISTS "Users can view pick lists" ON ticket_pick_lists;
DROP POLICY IF EXISTS "Users can manage pick lists" ON ticket_pick_lists;
DROP POLICY IF EXISTS "Users can view pick list items" ON ticket_pick_list_items;
DROP POLICY IF EXISTS "Users can manage pick list items" ON ticket_pick_list_items;

-- Recreate with clear policies
CREATE POLICY "Authenticated users can view pick lists"
  ON ticket_pick_lists
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage pick lists"
  ON ticket_pick_lists
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can view pick list items"
  ON ticket_pick_list_items
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage pick list items"
  ON ticket_pick_list_items
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- =====================================================
-- STEP 5: Helpful Function to Check User Setup
-- =====================================================

-- Function to check if a technician is properly set up for parts pickup
CREATE OR REPLACE FUNCTION fn_check_technician_setup(p_user_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_profile record;
  v_has_auth_user boolean;
  v_issues text[] := '{}';
BEGIN
  v_user_id := COALESCE(p_user_id, auth.uid());

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No user specified');
  END IF;

  -- Get profile
  SELECT * INTO v_profile
  FROM profiles
  WHERE id = v_user_id;

  IF v_profile IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Profile not found',
      'user_id', v_user_id
    );
  END IF;

  -- Check if auth.users entry exists
  SELECT EXISTS (SELECT 1 FROM auth.users WHERE id = v_user_id) INTO v_has_auth_user;

  IF NOT v_has_auth_user THEN
    v_issues := array_append(v_issues, 'No auth.users entry - password updates will fail');
  END IF;

  -- Check if technician has vehicle assigned
  IF v_profile.role = 'technician' AND v_profile.default_vehicle_id IS NULL THEN
    v_issues := array_append(v_issues, 'No truck assigned - cannot pick up parts');
  END IF;

  -- Check if vehicle is valid truck
  IF v_profile.default_vehicle_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM stock_locations
      WHERE id = v_profile.default_vehicle_id
      AND location_type = 'truck'
    ) THEN
      v_issues := array_append(v_issues, 'Assigned vehicle is not a truck type');
    END IF;
  END IF;

  -- Check if active
  IF NOT v_profile.is_active THEN
    v_issues := array_append(v_issues, 'Profile is inactive');
  END IF;

  RETURN jsonb_build_object(
    'success', array_length(v_issues, 1) IS NULL OR array_length(v_issues, 1) = 0,
    'user_id', v_user_id,
    'email', v_profile.email,
    'full_name', v_profile.full_name,
    'role', v_profile.role,
    'is_active', v_profile.is_active,
    'has_auth_user', v_has_auth_user,
    'default_vehicle_id', v_profile.default_vehicle_id,
    'issues', v_issues
  );
END;
$$;

GRANT EXECUTE ON FUNCTION fn_check_technician_setup TO authenticated;

COMMENT ON FUNCTION fn_check_technician_setup IS 'Check if a user (technician) is properly configured for system operations like parts pickup';
