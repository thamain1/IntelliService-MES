/*
  # Add Site Contact Fields

  Adds site contact person fields to customers and tickets tables:
  - site_contact_name: Name of the on-site contact person
  - site_contact_phone: Phone number for the on-site contact
*/

-- Add site contact fields to customers table
ALTER TABLE customers
ADD COLUMN IF NOT EXISTS site_contact_name text,
ADD COLUMN IF NOT EXISTS site_contact_phone text;

-- Add site contact fields to tickets table
ALTER TABLE tickets
ADD COLUMN IF NOT EXISTS site_contact_name text,
ADD COLUMN IF NOT EXISTS site_contact_phone text;

-- Add comments for documentation
COMMENT ON COLUMN customers.site_contact_name IS 'Name of the on-site contact person';
COMMENT ON COLUMN customers.site_contact_phone IS 'Phone number for the on-site contact';
COMMENT ON COLUMN tickets.site_contact_name IS 'Name of the on-site contact person for this ticket';
COMMENT ON COLUMN tickets.site_contact_phone IS 'Phone number for the on-site contact for this ticket';
