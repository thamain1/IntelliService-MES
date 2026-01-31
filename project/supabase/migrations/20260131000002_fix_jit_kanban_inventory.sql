/*
  # Fix JIT/Kanban Inventory Management System

  ## Fixes
  1. Reserved quantity - calculated from ticket_parts_planned for active tickets
  2. Average daily usage - calculated from parts_usage over last 90 days
  3. Reorder point formula - (avg_daily_usage × lead_days) + safety_stock
  4. Auto-draft PO generation function

  ## Changes
  - Recreates vw_reorder_alerts with proper calculations
  - Adds function fn_generate_reorder_pos() to auto-create draft POs
*/

-- Drop and recreate the reorder alerts view with proper calculations
DROP VIEW IF EXISTS vw_reorder_alerts;

CREATE VIEW vw_reorder_alerts AS
WITH inventory_summary AS (
  -- Current inventory by part and location
  SELECT
    pi.part_id,
    pi.stock_location_id AS location_id,
    SUM(pi.quantity) AS on_hand,
    SUM(pi.quantity * COALESCE(pi.unit_cost, 0)) AS inventory_value
  FROM part_inventory pi
  GROUP BY pi.part_id, pi.stock_location_id
),
reserved_summary AS (
  -- Reserved parts from planned tickets (open, scheduled, in_progress)
  SELECT
    tpp.part_id,
    SUM(tpp.quantity) AS reserved_qty
  FROM ticket_parts_planned tpp
  INNER JOIN tickets t ON t.id = tpp.ticket_id
  WHERE t.status IN ('open', 'scheduled', 'in_progress')
    AND tpp.part_id IS NOT NULL
  GROUP BY tpp.part_id
),
usage_history AS (
  -- Average daily usage over last 90 days
  SELECT
    pu.part_id,
    COALESCE(
      SUM(pu.quantity_used)::numeric / NULLIF(
        (CURRENT_DATE - MIN(pu.created_at::date))::numeric,
        0
      ),
      0
    ) AS avg_daily_usage,
    SUM(pu.quantity_used) AS total_used_90d,
    COUNT(DISTINCT pu.created_at::date) AS days_with_usage
  FROM parts_usage pu
  WHERE pu.created_at >= CURRENT_DATE - INTERVAL '90 days'
  GROUP BY pu.part_id
),
open_po_summary AS (
  -- Inbound quantity from open POs
  SELECT
    pol.part_id,
    po.delivery_location_id AS location_id,
    SUM(pol.quantity_ordered - COALESCE(pol.quantity_received, 0)) AS inbound_qty
  FROM purchase_order_lines pol
  INNER JOIN purchase_orders po ON po.id = pol.po_id
  WHERE po.status IN ('draft', 'submitted', 'approved', 'partial')
  GROUP BY pol.part_id, po.delivery_location_id
),
preferred_vendors AS (
  -- Preferred vendor info for each part
  SELECT DISTINCT ON (vpm.part_id)
    vpm.part_id,
    vpm.vendor_id,
    v.name AS vendor_name,
    vpm.vendor_part_number,
    COALESCE(vpm.last_cost, vpm.standard_cost, 0) AS unit_cost,
    COALESCE(vpm.lead_time_days, v.standard_lead_time_days, 7) AS lead_days,
    COALESCE(vpm.minimum_order_qty, 1) AS moq,
    COALESCE(vpm.pack_qty, 1) AS pack_qty
  FROM vendor_part_mappings vpm
  INNER JOIN vendors v ON v.id = vpm.vendor_id
  WHERE vpm.is_preferred_vendor = true
    AND vpm.is_discontinued IS NOT true
    AND v.is_active = true
  ORDER BY vpm.part_id, vpm.last_purchase_date DESC NULLS LAST
)
SELECT
  p.id AS part_id,
  p.part_number,
  p.description,
  p.category,
  sl.id AS location_id,
  sl.name AS location_name,
  sl.location_type,

  -- Inventory quantities
  COALESCE(inv.on_hand, 0)::integer AS on_hand,
  COALESCE(rs.reserved_qty, 0)::integer AS reserved,
  COALESCE(opo.inbound_qty, 0)::integer AS inbound_open_po,
  (COALESCE(inv.on_hand, 0) - COALESCE(rs.reserved_qty, 0) + COALESCE(opo.inbound_qty, 0))::integer AS available,

  -- Reorder policy settings
  COALESCE(irp.min_qty, 0) AS min_qty,
  COALESCE(irp.max_qty, 0) AS max_qty,
  COALESCE(irp.safety_stock_qty, 0) AS safety_stock,

  -- Lead time (policy override > vendor > default 7)
  COALESCE(irp.lead_days_override, pv.lead_days, 7)::integer AS lead_days,

  -- Usage metrics
  COALESCE(uh.avg_daily_usage, 0)::numeric(10,2) AS avg_daily_usage,

  -- Dynamic reorder point: (avg_daily_usage × lead_days) + safety_stock
  (
    COALESCE(uh.avg_daily_usage, 0) * COALESCE(irp.lead_days_override, pv.lead_days, 7)
    + COALESCE(irp.safety_stock_qty, 0)
  )::integer AS reorder_point,

  -- Suggested order quantity
  CASE
    WHEN COALESCE(irp.max_qty, 0) > 0 THEN
      -- Min/Max method: order up to max
      GREATEST(
        CEILING(
          (COALESCE(irp.max_qty, 0) - COALESCE(inv.on_hand, 0) + COALESCE(rs.reserved_qty, 0))::numeric
          / COALESCE(NULLIF(pv.pack_qty, 0), 1)
        ) * COALESCE(pv.pack_qty, 1),
        COALESCE(pv.moq, 1)
      )
    WHEN COALESCE(uh.avg_daily_usage, 0) > 0 THEN
      -- EOQ-style: order 2 weeks worth + safety stock
      GREATEST(
        CEILING(
          (COALESCE(uh.avg_daily_usage, 0) * 14 + COALESCE(irp.safety_stock_qty, 0))::numeric
          / COALESCE(NULLIF(pv.pack_qty, 0), 1)
        ) * COALESCE(pv.pack_qty, 1),
        COALESCE(pv.moq, 1)
      )
    ELSE
      COALESCE(pv.moq, 1)
  END::numeric AS suggested_order_qty,

  -- Alert flags
  CASE
    WHEN (COALESCE(inv.on_hand, 0) - COALESCE(rs.reserved_qty, 0)) <= (
      COALESCE(uh.avg_daily_usage, 0) * COALESCE(irp.lead_days_override, pv.lead_days, 7)
      + COALESCE(irp.safety_stock_qty, 0)
    ) THEN true
    ELSE false
  END AS below_reorder_point,

  CASE
    WHEN COALESCE(inv.on_hand, 0) = 0 THEN true
    ELSE false
  END AS is_stockout,

  -- Policy info
  irp.reorder_method::text,
  CASE WHEN irp.id IS NOT NULL THEN true ELSE false END AS has_reorder_policy,

  -- Vendor info
  pv.vendor_id,
  pv.vendor_name,
  pv.vendor_part_number,
  COALESCE(pv.unit_cost, 0)::numeric(12,2) AS unit_cost,
  COALESCE(pv.moq, 1) AS moq,
  COALESCE(pv.pack_qty, 1) AS pack_qty,

  -- Value
  COALESCE(inv.inventory_value, 0)::numeric(12,2) AS inventory_value

FROM parts p
CROSS JOIN stock_locations sl
LEFT JOIN inventory_summary inv ON inv.part_id = p.id AND inv.location_id = sl.id
LEFT JOIN reserved_summary rs ON rs.part_id = p.id
LEFT JOIN usage_history uh ON uh.part_id = p.id
LEFT JOIN open_po_summary opo ON opo.part_id = p.id AND opo.location_id = sl.id
LEFT JOIN inventory_reorder_policies irp ON irp.part_id = p.id
  AND (irp.location_id = sl.id OR irp.location_id IS NULL)
  AND irp.is_active = true
LEFT JOIN preferred_vendors pv ON pv.part_id = p.id
WHERE sl.is_active = true
  AND p.item_type = 'part'
  AND (
    -- For warehouses: show all parts (standard behavior)
    sl.location_type = 'warehouse'
    OR
    -- For trucks: only show parts with explicit policy AND min_qty > 0
    (
      sl.location_type = 'truck'
      AND irp.id IS NOT NULL
      AND COALESCE(irp.min_qty, 0) > 0
    )
    OR
    -- For other location types (project_site, customer_site, vendor): show if they have inventory
    (
      sl.location_type NOT IN ('warehouse', 'truck')
      AND COALESCE(inv.on_hand, 0) > 0
    )
  );


-- Function to auto-generate draft POs for items below reorder point
CREATE OR REPLACE FUNCTION fn_generate_reorder_pos(
  p_location_id uuid DEFAULT NULL,
  p_vendor_id uuid DEFAULT NULL
)
RETURNS TABLE (
  po_id uuid,
  po_number text,
  vendor_id uuid,
  vendor_name text,
  line_count integer,
  total_amount numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_vendor RECORD;
  v_po_id uuid;
  v_po_number text;
  v_line_number integer;
  v_subtotal numeric;
  v_alert RECORD;
BEGIN
  -- Get the next PO number base
  SELECT COALESCE(MAX(SUBSTRING(po_number FROM 'PO-(\d+)')::integer), 0) + 1
  INTO v_line_number
  FROM purchase_orders;

  -- Loop through vendors with items below reorder point
  FOR v_vendor IN
    SELECT DISTINCT ra.vendor_id, ra.vendor_name
    FROM vw_reorder_alerts ra
    WHERE ra.below_reorder_point = true
      AND ra.vendor_id IS NOT NULL
      AND (p_location_id IS NULL OR ra.location_id = p_location_id)
      AND (p_vendor_id IS NULL OR ra.vendor_id = p_vendor_id)
    ORDER BY ra.vendor_name
  LOOP
    -- Generate PO number
    v_po_number := 'PO-' || LPAD(v_line_number::text, 6, '0');
    v_line_number := v_line_number + 1;

    -- Create the PO header
    INSERT INTO purchase_orders (
      po_number,
      vendor_id,
      order_date,
      status,
      notes,
      created_by
    ) VALUES (
      v_po_number,
      v_vendor.vendor_id,
      CURRENT_DATE,
      'draft',
      'Auto-generated from reorder alerts',
      auth.uid()
    )
    RETURNING id INTO v_po_id;

    -- Add line items for all alerts for this vendor
    v_subtotal := 0;
    FOR v_alert IN
      SELECT
        ra.part_id,
        ra.part_number,
        ra.description,
        ra.suggested_order_qty,
        ra.unit_cost,
        ra.vendor_part_number,
        ra.location_id
      FROM vw_reorder_alerts ra
      WHERE ra.vendor_id = v_vendor.vendor_id
        AND ra.below_reorder_point = true
        AND (p_location_id IS NULL OR ra.location_id = p_location_id)
      ORDER BY ra.part_number
    LOOP
      INSERT INTO purchase_order_lines (
        po_id,
        part_id,
        line_number,
        description,
        quantity_ordered,
        unit_price,
        line_total
      ) VALUES (
        v_po_id,
        v_alert.part_id,
        (SELECT COALESCE(MAX(line_number), 0) + 1 FROM purchase_order_lines WHERE po_id = v_po_id),
        COALESCE(v_alert.description, v_alert.part_number),
        v_alert.suggested_order_qty,
        v_alert.unit_cost,
        v_alert.suggested_order_qty * v_alert.unit_cost
      );

      v_subtotal := v_subtotal + (v_alert.suggested_order_qty * v_alert.unit_cost);
    END LOOP;

    -- Update PO totals
    UPDATE purchase_orders
    SET subtotal = v_subtotal,
        total_amount = v_subtotal
    WHERE id = v_po_id;

    -- Return the created PO info
    po_id := v_po_id;
    po_number := v_po_number;
    vendor_id := v_vendor.vendor_id;
    vendor_name := v_vendor.vendor_name;
    SELECT COUNT(*) INTO line_count FROM purchase_order_lines WHERE po_id = v_po_id;
    total_amount := v_subtotal;

    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$$;


-- Function to create a single PO from a specific reorder alert
CREATE OR REPLACE FUNCTION fn_create_po_from_alert(
  p_part_id uuid,
  p_location_id uuid,
  p_quantity numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_alert RECORD;
  v_po_id uuid;
  v_po_number text;
  v_quantity numeric;
BEGIN
  -- Get the alert details
  SELECT * INTO v_alert
  FROM vw_reorder_alerts
  WHERE part_id = p_part_id
    AND location_id = p_location_id
  LIMIT 1;

  IF v_alert IS NULL THEN
    RAISE EXCEPTION 'No reorder alert found for part % at location %', p_part_id, p_location_id;
  END IF;

  IF v_alert.vendor_id IS NULL THEN
    RAISE EXCEPTION 'No preferred vendor configured for part %', p_part_id;
  END IF;

  -- Use provided quantity or suggested quantity
  v_quantity := COALESCE(p_quantity, v_alert.suggested_order_qty);

  -- Generate PO number
  SELECT 'PO-' || LPAD((COALESCE(MAX(SUBSTRING(po_number FROM 'PO-(\d+)')::integer), 0) + 1)::text, 6, '0')
  INTO v_po_number
  FROM purchase_orders;

  -- Create PO
  INSERT INTO purchase_orders (
    po_number,
    vendor_id,
    order_date,
    delivery_location_id,
    status,
    notes,
    created_by
  ) VALUES (
    v_po_number,
    v_alert.vendor_id,
    CURRENT_DATE,
    p_location_id,
    'draft',
    'Created from reorder alert for ' || v_alert.part_number,
    auth.uid()
  )
  RETURNING id INTO v_po_id;

  -- Add line item
  INSERT INTO purchase_order_lines (
    po_id,
    part_id,
    line_number,
    description,
    quantity_ordered,
    unit_price,
    line_total
  ) VALUES (
    v_po_id,
    p_part_id,
    1,
    v_alert.description,
    v_quantity,
    v_alert.unit_cost,
    v_quantity * v_alert.unit_cost
  );

  -- Update PO totals
  UPDATE purchase_orders
  SET subtotal = v_quantity * v_alert.unit_cost,
      total_amount = v_quantity * v_alert.unit_cost
  WHERE id = v_po_id;

  RETURN v_po_id;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION fn_generate_reorder_pos TO authenticated;
GRANT EXECUTE ON FUNCTION fn_create_po_from_alert TO authenticated;
