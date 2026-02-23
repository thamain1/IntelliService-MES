-- Fix inventory movement trigger to not reference non-existent unit_cost column
-- The inventory_movements table doesn't have a unit_cost column

CREATE OR REPLACE FUNCTION fn_process_inventory_movement()
RETURNS TRIGGER AS $$
DECLARE
  v_from_inventory_id UUID;
  v_to_inventory_id UUID;
  v_current_from_qty INTEGER;
  v_current_to_qty INTEGER;
BEGIN
  -- Handle different movement types
  CASE NEW.movement_type

    -- TRANSFER: Move inventory from one location to another
    WHEN 'transfer' THEN
      -- Validate required fields
      IF NEW.from_location_id IS NULL THEN
        RAISE EXCEPTION 'from_location_id is required for transfer movements';
      END IF;
      IF NEW.to_location_id IS NULL THEN
        RAISE EXCEPTION 'to_location_id is required for transfer movements';
      END IF;
      IF NEW.from_location_id = NEW.to_location_id THEN
        RAISE EXCEPTION 'Cannot transfer to the same location';
      END IF;

      -- Get current quantity at source location
      SELECT id, quantity INTO v_from_inventory_id, v_current_from_qty
      FROM part_inventory
      WHERE part_id = NEW.part_id AND stock_location_id = NEW.from_location_id;

      -- Check sufficient quantity
      IF v_current_from_qty IS NULL OR v_current_from_qty < NEW.quantity THEN
        RAISE EXCEPTION 'Insufficient quantity at source location. Available: %, Requested: %',
          COALESCE(v_current_from_qty, 0), NEW.quantity;
      END IF;

      -- Subtract from source location
      UPDATE part_inventory
      SET quantity = quantity - NEW.quantity,
          updated_at = NOW()
      WHERE id = v_from_inventory_id;

      -- Add to destination location (insert or update)
      INSERT INTO part_inventory (part_id, stock_location_id, quantity, created_at, updated_at)
      VALUES (NEW.part_id, NEW.to_location_id, NEW.quantity, NOW(), NOW())
      ON CONFLICT (part_id, stock_location_id)
      DO UPDATE SET
        quantity = part_inventory.quantity + NEW.quantity,
        updated_at = NOW();

    -- RECEIPT: Receive inventory (e.g., from PO)
    WHEN 'receipt' THEN
      IF NEW.to_location_id IS NULL THEN
        RAISE EXCEPTION 'to_location_id is required for receipt movements';
      END IF;

      -- Add to destination location
      INSERT INTO part_inventory (part_id, stock_location_id, quantity, created_at, updated_at)
      VALUES (NEW.part_id, NEW.to_location_id, NEW.quantity, NOW(), NOW())
      ON CONFLICT (part_id, stock_location_id)
      DO UPDATE SET
        quantity = part_inventory.quantity + NEW.quantity,
        updated_at = NOW();

    -- INSTALLATION: Part used/installed on a ticket
    WHEN 'installation' THEN
      IF NEW.from_location_id IS NULL THEN
        RAISE EXCEPTION 'from_location_id is required for installation movements';
      END IF;

      -- Get current quantity at source location
      SELECT id, quantity INTO v_from_inventory_id, v_current_from_qty
      FROM part_inventory
      WHERE part_id = NEW.part_id AND stock_location_id = NEW.from_location_id;

      -- Check sufficient quantity
      IF v_current_from_qty IS NULL OR v_current_from_qty < NEW.quantity THEN
        RAISE EXCEPTION 'Insufficient quantity for installation. Available: %, Requested: %',
          COALESCE(v_current_from_qty, 0), NEW.quantity;
      END IF;

      -- Subtract from source location
      UPDATE part_inventory
      SET quantity = quantity - NEW.quantity,
          updated_at = NOW()
      WHERE id = v_from_inventory_id;

    -- RETURN: Part returned to inventory
    WHEN 'return' THEN
      IF NEW.to_location_id IS NULL THEN
        RAISE EXCEPTION 'to_location_id is required for return movements';
      END IF;

      -- Add to destination location
      INSERT INTO part_inventory (part_id, stock_location_id, quantity, created_at, updated_at)
      VALUES (NEW.part_id, NEW.to_location_id, NEW.quantity, NOW(), NOW())
      ON CONFLICT (part_id, stock_location_id)
      DO UPDATE SET
        quantity = part_inventory.quantity + NEW.quantity,
        updated_at = NOW();

    -- ADJUSTMENT: Manual inventory adjustment
    WHEN 'adjustment' THEN
      -- Adjustment can be positive or negative
      -- If to_location_id is set, adjust that location
      -- If from_location_id is set, subtract from that location
      IF NEW.to_location_id IS NOT NULL THEN
        INSERT INTO part_inventory (part_id, stock_location_id, quantity, created_at, updated_at)
        VALUES (NEW.part_id, NEW.to_location_id, NEW.quantity, NOW(), NOW())
        ON CONFLICT (part_id, stock_location_id)
        DO UPDATE SET
          quantity = part_inventory.quantity + NEW.quantity,
          updated_at = NOW();
      ELSIF NEW.from_location_id IS NOT NULL THEN
        UPDATE part_inventory
        SET quantity = GREATEST(0, quantity - NEW.quantity),
            updated_at = NOW()
        WHERE part_id = NEW.part_id AND stock_location_id = NEW.from_location_id;
      ELSE
        RAISE EXCEPTION 'Either from_location_id or to_location_id is required for adjustment movements';
      END IF;

    -- DISPOSAL: Part disposed/written off
    WHEN 'disposal' THEN
      IF NEW.from_location_id IS NULL THEN
        RAISE EXCEPTION 'from_location_id is required for disposal movements';
      END IF;

      -- Get current quantity at source location
      SELECT id, quantity INTO v_from_inventory_id, v_current_from_qty
      FROM part_inventory
      WHERE part_id = NEW.part_id AND stock_location_id = NEW.from_location_id;

      -- Subtract from source location (allow going to 0)
      IF v_from_inventory_id IS NOT NULL THEN
        UPDATE part_inventory
        SET quantity = GREATEST(0, quantity - NEW.quantity),
            updated_at = NOW()
        WHERE id = v_from_inventory_id;
      END IF;

    ELSE
      -- Unknown movement type - log warning but don't fail
      RAISE WARNING 'Unknown movement type: %. No inventory adjustment made.', NEW.movement_type;
  END CASE;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
