/*
  # Add Problem/Resolution Code Columns to Tickets

  Adds the columns needed to link tickets to standard codes
  and track sales opportunities and urgent reviews.
*/

-- Add code columns to tickets table
ALTER TABLE tickets
ADD COLUMN IF NOT EXISTS problem_code TEXT REFERENCES standard_codes(code),
ADD COLUMN IF NOT EXISTS resolution_code TEXT REFERENCES standard_codes(code),
ADD COLUMN IF NOT EXISTS sales_opportunity_flag BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS urgent_review_flag BOOLEAN DEFAULT FALSE;

-- Create indexes for analytics queries
CREATE INDEX IF NOT EXISTS idx_tickets_problem_code ON tickets(problem_code);
CREATE INDEX IF NOT EXISTS idx_tickets_resolution_code ON tickets(resolution_code);
CREATE INDEX IF NOT EXISTS idx_tickets_sales_flag ON tickets(sales_opportunity_flag) WHERE sales_opportunity_flag = TRUE;
CREATE INDEX IF NOT EXISTS idx_tickets_urgent_flag ON tickets(urgent_review_flag) WHERE urgent_review_flag = TRUE;

-- Add comments
COMMENT ON COLUMN tickets.problem_code IS 'Standardized problem code from standard_codes table';
COMMENT ON COLUMN tickets.resolution_code IS 'Standardized resolution code from standard_codes table';
COMMENT ON COLUMN tickets.sales_opportunity_flag IS 'Auto-set when problem/resolution codes indicate sales potential';
COMMENT ON COLUMN tickets.urgent_review_flag IS 'Auto-set when resolution indicates temporary fix requiring review';
