-- AHS Warranty Enums

ALTER TYPE ticket_type ADD VALUE IF NOT EXISTS 'WARRANTY_AHS';
ALTER TYPE ticket_status ADD VALUE IF NOT EXISTS 'awaiting_ahs_authorization';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payer_type') THEN
    CREATE TYPE payer_type AS ENUM ('AHS', 'CUSTOMER');
  END IF;
END $$;
