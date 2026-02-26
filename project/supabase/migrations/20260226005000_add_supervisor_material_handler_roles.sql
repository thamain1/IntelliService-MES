-- Add supervisor and material_handler to user_role enum (safe, idempotent)
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'supervisor';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'material_handler';
