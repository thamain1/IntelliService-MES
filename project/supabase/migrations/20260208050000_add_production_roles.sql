/*
  # Add Production Roles

  Adds 'supervisor' and 'operator' roles to support MES functionality.
*/

-- Add supervisor role if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'supervisor' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')) THEN
        ALTER TYPE user_role ADD VALUE 'supervisor';
    END IF;
EXCEPTION WHEN duplicate_object THEN
    -- Ignore if already exists
END $$;

-- Add operator role if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'operator' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')) THEN
        ALTER TYPE user_role ADD VALUE 'operator';
    END IF;
EXCEPTION WHEN duplicate_object THEN
    -- Ignore if already exists
END $$;
