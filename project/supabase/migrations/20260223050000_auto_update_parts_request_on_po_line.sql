/*
  # Auto-Update Parts Request Status on PO Line Insert

  This trigger automatically updates the ticket_parts_requests status to 'ordered'
  when a purchase_order_line is inserted with a linked_request_id.

  This is more reliable than relying on frontend code to make the update.
*/

-- Create trigger function
CREATE OR REPLACE FUNCTION fn_auto_link_po_to_parts_request()
RETURNS TRIGGER AS $$
BEGIN
  -- If this PO line is linked to a parts request, update the request
  IF NEW.linked_request_id IS NOT NULL THEN
    UPDATE ticket_parts_requests
    SET
      po_id = NEW.po_id,
      status = 'ordered'
    WHERE id = NEW.linked_request_id
    AND status = 'open';  -- Only update if still open (prevent re-updates)
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on purchase_order_lines
DROP TRIGGER IF EXISTS trg_auto_link_po_to_parts_request ON purchase_order_lines;
CREATE TRIGGER trg_auto_link_po_to_parts_request
AFTER INSERT ON purchase_order_lines
FOR EACH ROW
EXECUTE FUNCTION fn_auto_link_po_to_parts_request();

-- Also add a comment for documentation
COMMENT ON FUNCTION fn_auto_link_po_to_parts_request() IS
  'Automatically updates ticket_parts_requests to ordered status when a PO line is inserted with linked_request_id';

COMMENT ON TRIGGER trg_auto_link_po_to_parts_request ON purchase_order_lines IS
  'Fires after PO line insert to auto-update linked parts requests to ordered status';
