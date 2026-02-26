/*
  # Fix Tickets RLS — Multi-Tech Assignments & New Roles

  ## Problem
  1. Technicians assigned to tickets via `ticket_assignments` (not `tickets.assigned_to`)
     cannot see those tickets because the RLS SELECT policy only checks `assigned_to`.
  2. New roles (office_manager, supervisor, lead_tech) are not included in the
     "full access" clause of the tickets SELECT and UPDATE policies.

  ## Fix
  - tickets SELECT: add ticket_assignments subquery path + expand operational roles
  - tickets UPDATE (ops): expand roles to include office_manager, supervisor, lead_tech
  - tickets UPDATE (tech): add ticket_assignments path so multi-assigned techs can update
*/

-- ── SELECT ────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view tickets they're involved with" ON public.tickets;
CREATE POLICY "Users can view tickets they're involved with"
  ON public.tickets
  FOR SELECT
  TO authenticated
  USING (
    -- Directly assigned or created the ticket
    assigned_to = (SELECT auth.uid()) OR
    created_by  = (SELECT auth.uid()) OR
    -- Assigned via ticket_assignments (multi-tech / team scheduling)
    EXISTS (
      SELECT 1 FROM public.ticket_assignments
      WHERE ticket_assignments.ticket_id    = tickets.id
        AND ticket_assignments.technician_id = (SELECT auth.uid())
    ) OR
    -- Operations roles can see all tickets
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id   = (SELECT auth.uid())
        AND profiles.role IN (
          'admin', 'dispatcher', 'office_manager', 'supervisor', 'lead_tech'
        )
    )
  );

-- ── UPDATE (operations staff) ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins and dispatchers can update any ticket" ON public.tickets;
CREATE POLICY "Ops staff can update any ticket"
  ON public.tickets
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id   = (SELECT auth.uid())
        AND profiles.role IN (
          'admin', 'dispatcher', 'office_manager', 'supervisor', 'lead_tech'
        )
    )
  );

-- ── UPDATE (technicians) ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Technicians can update assigned tickets" ON public.tickets;
CREATE POLICY "Technicians can update assigned tickets"
  ON public.tickets
  FOR UPDATE
  TO authenticated
  USING (
    assigned_to = (SELECT auth.uid()) OR
    EXISTS (
      SELECT 1 FROM public.ticket_assignments
      WHERE ticket_assignments.ticket_id    = tickets.id
        AND ticket_assignments.technician_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    assigned_to = (SELECT auth.uid()) OR
    EXISTS (
      SELECT 1 FROM public.ticket_assignments
      WHERE ticket_assignments.ticket_id    = tickets.id
        AND ticket_assignments.technician_id = (SELECT auth.uid())
    )
  );
