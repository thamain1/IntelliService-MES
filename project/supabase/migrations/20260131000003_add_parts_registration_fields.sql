/*
  # Add Registration Fields to Parts Table

  Adds fields to track parts that require warranty registration:
  - requires_registration: boolean flag
  - registration_url: URL where registration can be completed
*/

-- Add registration fields to parts table
ALTER TABLE parts
ADD COLUMN IF NOT EXISTS requires_registration boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS registration_url text;

-- Add comment for documentation
COMMENT ON COLUMN parts.requires_registration IS 'Whether this part requires warranty registration with the manufacturer';
COMMENT ON COLUMN parts.registration_url IS 'URL where warranty registration can be completed';
