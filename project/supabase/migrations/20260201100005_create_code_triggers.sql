/*
  # Create Automation Triggers for Problem/Resolution Codes

  Creates triggers that automatically:
  - Set sales_opportunity_flag when trigger codes are used
  - Set urgent_review_flag for temporary fixes
  - Log activity when flags are set
*/

-- Function to check and set flags based on codes
CREATE OR REPLACE FUNCTION check_ticket_code_flags()
RETURNS TRIGGER AS $$
DECLARE
    problem_triggers_sales BOOLEAN := FALSE;
    resolution_triggers_sales BOOLEAN := FALSE;
    resolution_triggers_urgent BOOLEAN := FALSE;
    is_gas_leak BOOLEAN := FALSE;
BEGIN
    -- Check problem code flags
    IF NEW.problem_code IS NOT NULL THEN
        SELECT
            COALESCE(triggers_sales_lead, FALSE),
            COALESCE(is_critical_safety, FALSE)
        INTO problem_triggers_sales, is_gas_leak
        FROM standard_codes
        WHERE code = NEW.problem_code;
    END IF;

    -- Check resolution code flags
    IF NEW.resolution_code IS NOT NULL THEN
        SELECT
            COALESCE(triggers_sales_lead, FALSE),
            COALESCE(triggers_urgent_review, FALSE)
        INTO resolution_triggers_sales, resolution_triggers_urgent
        FROM standard_codes
        WHERE code = NEW.resolution_code;
    END IF;

    -- Set sales opportunity flag
    IF problem_triggers_sales OR resolution_triggers_sales THEN
        NEW.sales_opportunity_flag := TRUE;
    END IF;

    -- Set urgent review flag
    IF resolution_triggers_urgent THEN
        NEW.urgent_review_flag := TRUE;
    END IF;

    -- Log activity if flags were set (only on changes)
    IF NEW.sales_opportunity_flag = TRUE AND
       (OLD.sales_opportunity_flag IS NULL OR OLD.sales_opportunity_flag = FALSE) THEN
        INSERT INTO activity_log (
            entity_type,
            entity_id,
            action,
            description,
            performed_by
        ) VALUES (
            'ticket',
            NEW.id,
            'flag_set',
            'Sales opportunity flagged based on code: ' ||
                COALESCE(NEW.problem_code, '') || ' / ' || COALESCE(NEW.resolution_code, ''),
            COALESCE(NEW.assigned_to, auth.uid())
        );
    END IF;

    IF NEW.urgent_review_flag = TRUE AND
       (OLD.urgent_review_flag IS NULL OR OLD.urgent_review_flag = FALSE) THEN
        INSERT INTO activity_log (
            entity_type,
            entity_id,
            action,
            description,
            performed_by
        ) VALUES (
            'ticket',
            NEW.id,
            'flag_set',
            'Urgent review required - Temporary fix applied: ' || COALESCE(NEW.resolution_code, ''),
            COALESCE(NEW.assigned_to, auth.uid())
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for code flag checking
DROP TRIGGER IF EXISTS trg_ticket_code_flags ON tickets;
CREATE TRIGGER trg_ticket_code_flags
BEFORE INSERT OR UPDATE OF problem_code, resolution_code ON tickets
FOR EACH ROW
EXECUTE FUNCTION check_ticket_code_flags();

-- Function to validate codes are selected before completion
CREATE OR REPLACE FUNCTION validate_ticket_completion_codes()
RETURNS TRIGGER AS $$
BEGIN
    -- Only check when transitioning to completed status
    IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
        -- Problem code is recommended but not strictly required
        -- Resolution code IS required for completion
        IF NEW.resolution_code IS NULL THEN
            RAISE WARNING 'Resolution code should be set when completing a ticket';
            -- Not raising an exception - just a warning for now
            -- Uncomment below to make it mandatory:
            -- RAISE EXCEPTION 'Resolution code is required to complete a ticket';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for completion validation
DROP TRIGGER IF EXISTS trg_validate_completion_codes ON tickets;
CREATE TRIGGER trg_validate_completion_codes
BEFORE UPDATE ON tickets
FOR EACH ROW
WHEN (NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed')
EXECUTE FUNCTION validate_ticket_completion_codes();

-- Add comments
COMMENT ON FUNCTION check_ticket_code_flags IS 'Automatically sets sales_opportunity_flag and urgent_review_flag based on problem/resolution codes';
COMMENT ON FUNCTION validate_ticket_completion_codes IS 'Validates that required codes are set before ticket completion';
