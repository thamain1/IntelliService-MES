/*
  # Assign Final Truck

  Create one more truck and assign it to the remaining technician.
*/

-- Create one more truck
INSERT INTO stock_locations (location_code, name, location_type, is_mobile, is_active)
VALUES ('TRUCK-013', 'Service Truck 13', 'truck', true, true)
ON CONFLICT (location_code) DO NOTHING;

-- Assign it to the technician without a truck
UPDATE profiles
SET default_vehicle_id = (
  SELECT id FROM stock_locations WHERE location_code = 'TRUCK-013'
)
WHERE role = 'technician'
AND is_active = true
AND default_vehicle_id IS NULL;

-- Verify
DO $$
DECLARE
  v_remaining integer;
BEGIN
  SELECT COUNT(*) INTO v_remaining
  FROM profiles
  WHERE role = 'technician'
  AND is_active = true
  AND default_vehicle_id IS NULL;

  IF v_remaining = 0 THEN
    RAISE NOTICE 'All technicians now have trucks assigned!';
  ELSE
    RAISE WARNING 'Still % technicians without trucks', v_remaining;
  END IF;
END;
$$;
