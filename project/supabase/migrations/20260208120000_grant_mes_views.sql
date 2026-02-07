/*
  Grant permissions on MES Phase 2 views and tables for PostgREST access.

  PostgREST requires explicit GRANTs on views and tables for the
  authenticated role to access them via the API.
*/

-- Grant SELECT on views to authenticated role
GRANT SELECT ON vw_downtime_log TO authenticated;
GRANT SELECT ON vw_oee_summary TO authenticated;

-- Grant permissions on tables (in case they're missing)
GRANT SELECT, INSERT, UPDATE, DELETE ON production_counts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON equipment_state_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON downtime_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON downtime_reason_codes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON equipment_assets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON production_operation_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON oee_snapshots TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON plant_hierarchy TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON shift_calendars TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON shift_calendar_rules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON planned_downtime_windows TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON material_consumption_log TO authenticated;
GRANT SELECT ON mes_audit_log TO authenticated;

-- Also grant to anon role for any public access patterns
GRANT SELECT ON vw_downtime_log TO anon;
GRANT SELECT ON vw_oee_summary TO anon;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
