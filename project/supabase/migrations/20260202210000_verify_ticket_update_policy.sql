/*
  # Verify and Fix Ticket Update Policy

  Ensure the admin/dispatcher update policy exists and works correctly.
*/

-- Drop and recreate to ensure it's correct
DROP POLICY IF EXISTS "Admins and dispatchers can update any ticket" ON public.tickets;

CREATE POLICY "Admins and dispatchers can update any ticket"
  ON public.tickets
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'dispatcher')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'dispatcher')
    )
  );

-- Verify the policy exists
DO $$
DECLARE
  v_policy_count integer;
BEGIN
  SELECT COUNT(*) INTO v_policy_count
  FROM pg_policies
  WHERE tablename = 'tickets'
  AND schemaname = 'public'
  AND policyname = 'Admins and dispatchers can update any ticket';

  IF v_policy_count = 1 THEN
    RAISE NOTICE 'Policy "Admins and dispatchers can update any ticket" exists and is active.';
  ELSE
    RAISE WARNING 'Policy not found! Count: %', v_policy_count;
  END IF;
END;
$$;

-- Also verify technician policy exists
DO $$
DECLARE
  v_policy_count integer;
BEGIN
  SELECT COUNT(*) INTO v_policy_count
  FROM pg_policies
  WHERE tablename = 'tickets'
  AND schemaname = 'public'
  AND policyname = 'Technicians can update assigned tickets';

  IF v_policy_count = 1 THEN
    RAISE NOTICE 'Policy "Technicians can update assigned tickets" exists and is active.';
  ELSE
    RAISE WARNING 'Technician update policy not found! Count: %', v_policy_count;
  END IF;
END;
$$;
