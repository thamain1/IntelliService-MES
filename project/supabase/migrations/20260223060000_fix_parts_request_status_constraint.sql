-- Fix the check constraint on ticket_parts_requests to allow 'ordered' and 'received' statuses
-- These statuses are needed for the procurement workflow

-- Drop the existing constraint
ALTER TABLE ticket_parts_requests DROP CONSTRAINT IF EXISTS ticket_parts_requests_status_check;

-- Add the updated constraint with all valid statuses
ALTER TABLE ticket_parts_requests ADD CONSTRAINT ticket_parts_requests_status_check
  CHECK (status IN ('open', 'ordered', 'received', 'fulfilled', 'cancelled'));

-- Add comment explaining the statuses
COMMENT ON COLUMN ticket_parts_requests.status IS 'Status of the parts request: open (awaiting PO), ordered (PO created), received (parts received), fulfilled (parts used/installed), cancelled (request cancelled)';
