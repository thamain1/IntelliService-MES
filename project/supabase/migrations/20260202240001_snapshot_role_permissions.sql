
-- Captured manual change: Create role_permissions table
CREATE TABLE IF NOT EXISTS public.role_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role TEXT NOT NULL,
    permissions TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(role)
);

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access to authenticated users"
ON public.role_permissions FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Allow full access to admins"
ON public.role_permissions FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
);

INSERT INTO public.role_permissions (role, permissions) VALUES
('admin', ARRAY['all']),
('dispatcher', ARRAY['view_all', 'manage_tickets', 'manage_customers']),
('technician', ARRAY['view_assigned', 'update_tickets'])
ON CONFLICT (role) DO NOTHING;
