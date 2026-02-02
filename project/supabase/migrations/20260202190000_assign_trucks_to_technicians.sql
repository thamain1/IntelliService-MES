/*
  # Assign Trucks to Technicians

  ## Purpose
  Fix the parts pickup issue by ensuring all technicians have trucks assigned.

  ## Changes
  1. Create additional trucks if needed
  2. Assign trucks to technicians who don't have one
  3. Report on any remaining issues
*/

-- =====================================================
-- STEP 1: Ensure we have enough trucks for all technicians
-- =====================================================

-- Add more trucks if we have more technicians than trucks
DO $$
DECLARE
  v_tech_count integer;
  v_truck_count integer;
  v_trucks_needed integer;
  v_i integer;
BEGIN
  -- Count active technicians without trucks
  SELECT COUNT(*) INTO v_tech_count
  FROM profiles
  WHERE role = 'technician'
  AND is_active = true
  AND default_vehicle_id IS NULL;

  -- Count available trucks
  SELECT COUNT(*) INTO v_truck_count
  FROM stock_locations
  WHERE location_type = 'truck'
  AND is_active = true;

  -- Calculate how many more trucks we need
  v_trucks_needed := GREATEST(0, v_tech_count - v_truck_count);

  -- Create additional trucks if needed
  FOR v_i IN 1..v_trucks_needed LOOP
    INSERT INTO stock_locations (location_code, name, location_type, is_mobile, is_active)
    VALUES (
      'TRUCK-' || LPAD((v_truck_count + v_i)::text, 3, '0'),
      'Service Truck ' || (v_truck_count + v_i),
      'truck',
      true,
      true
    )
    ON CONFLICT (location_code) DO NOTHING;
  END LOOP;

  IF v_trucks_needed > 0 THEN
    RAISE NOTICE 'Created % additional truck(s)', v_trucks_needed;
  END IF;
END;
$$;

-- =====================================================
-- STEP 2: Assign trucks to technicians without vehicles
-- =====================================================

DO $$
DECLARE
  v_tech record;
  v_truck record;
  v_assigned integer := 0;
BEGIN
  -- Loop through technicians without trucks
  FOR v_tech IN
    SELECT p.id, p.full_name, p.email
    FROM profiles p
    WHERE p.role = 'technician'
    AND p.is_active = true
    AND p.default_vehicle_id IS NULL
    ORDER BY p.full_name
  LOOP
    -- Find an available truck (one not assigned to any technician)
    SELECT sl.id, sl.name INTO v_truck
    FROM stock_locations sl
    WHERE sl.location_type = 'truck'
    AND sl.is_active = true
    AND NOT EXISTS (
      SELECT 1 FROM profiles p2
      WHERE p2.default_vehicle_id = sl.id
    )
    ORDER BY sl.name
    LIMIT 1;

    IF v_truck.id IS NOT NULL THEN
      -- Assign the truck to the technician
      UPDATE profiles
      SET default_vehicle_id = v_truck.id
      WHERE id = v_tech.id;

      v_assigned := v_assigned + 1;
      RAISE NOTICE 'Assigned % to %', v_truck.name, v_tech.full_name;
    ELSE
      RAISE WARNING 'No available truck for technician: %', v_tech.full_name;
    END IF;
  END LOOP;

  IF v_assigned > 0 THEN
    RAISE NOTICE 'Total assignments made: %', v_assigned;
  ELSE
    RAISE NOTICE 'All technicians already have trucks assigned or no technicians found.';
  END IF;
END;
$$;

-- =====================================================
-- STEP 3: Report current state
-- =====================================================

DO $$
DECLARE
  v_tech_without_truck integer;
  v_tech_with_truck integer;
BEGIN
  SELECT COUNT(*) INTO v_tech_without_truck
  FROM profiles
  WHERE role = 'technician'
  AND is_active = true
  AND default_vehicle_id IS NULL;

  SELECT COUNT(*) INTO v_tech_with_truck
  FROM profiles
  WHERE role = 'technician'
  AND is_active = true
  AND default_vehicle_id IS NOT NULL;

  RAISE NOTICE '=== Technician Status ===';
  RAISE NOTICE 'Technicians with trucks: %', v_tech_with_truck;
  RAISE NOTICE 'Technicians without trucks: %', v_tech_without_truck;

  IF v_tech_without_truck > 0 THEN
    RAISE WARNING 'Some technicians still need truck assignments!';
  ELSE
    RAISE NOTICE 'All active technicians have trucks assigned.';
  END IF;
END;
$$;
