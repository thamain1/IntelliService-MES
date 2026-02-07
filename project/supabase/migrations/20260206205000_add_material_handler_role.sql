-- Add material_handler role to user_role enum
-- This must run in a separate transaction before MES module migration

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'material_handler';
