/*
  # CRM Module - Phase 2

  This migration creates the CRM infrastructure:
  - Customer status and lead tracking
  - Deal pipelines and stages
  - Customer interactions (360 view)
  - Estimate pipeline linkage
*/

-- Add customer CRM columns
ALTER TABLE customers
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' CHECK (status IN ('lead', 'active', 'churned')),
ADD COLUMN IF NOT EXISTS lead_source TEXT,
ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS churned_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS prospect_replacement_flag BOOLEAN DEFAULT FALSE;

-- Create indexes for customer status
CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);
CREATE INDEX IF NOT EXISTS idx_customers_lead_source ON customers(lead_source) WHERE lead_source IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_prospect_flag ON customers(prospect_replacement_flag) WHERE prospect_replacement_flag = TRUE;

-- Deal Pipelines (Kanban Boards)
CREATE TABLE IF NOT EXISTS deal_pipelines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    is_default BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pipeline Stages
CREATE TABLE IF NOT EXISTS deal_stages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pipeline_id UUID NOT NULL REFERENCES deal_pipelines(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    probability INTEGER DEFAULT 0 CHECK (probability BETWEEN 0 AND 100),
    sort_order INTEGER DEFAULT 0,
    is_won BOOLEAN DEFAULT FALSE,
    is_lost BOOLEAN DEFAULT FALSE,
    color TEXT DEFAULT '#6b7280',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deal_stages_pipeline ON deal_stages(pipeline_id);

-- Customer Interactions (360 View Timeline)
CREATE TABLE IF NOT EXISTS customer_interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    interaction_type TEXT NOT NULL CHECK (interaction_type IN ('call', 'email', 'sms', 'meeting', 'note', 'site_visit')),
    direction TEXT CHECK (direction IN ('inbound', 'outbound')),
    subject TEXT,
    notes TEXT,
    duration_minutes INTEGER,
    outcome TEXT,
    follow_up_date DATE,
    related_ticket_id UUID REFERENCES tickets(id),
    related_estimate_id UUID REFERENCES estimates(id),
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_interactions_customer ON customer_interactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_interactions_type ON customer_interactions(interaction_type);
CREATE INDEX IF NOT EXISTS idx_interactions_created_at ON customer_interactions(created_at);
CREATE INDEX IF NOT EXISTS idx_interactions_follow_up ON customer_interactions(follow_up_date) WHERE follow_up_date IS NOT NULL;

-- Add pipeline fields to estimates
ALTER TABLE estimates
ADD COLUMN IF NOT EXISTS deal_stage_id UUID REFERENCES deal_stages(id),
ADD COLUMN IF NOT EXISTS expected_close_date DATE,
ADD COLUMN IF NOT EXISTS lost_reason TEXT,
ADD COLUMN IF NOT EXISTS days_in_stage INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS stage_entered_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_estimates_deal_stage ON estimates(deal_stage_id) WHERE deal_stage_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_estimates_close_date ON estimates(expected_close_date) WHERE expected_close_date IS NOT NULL;

-- RLS for deal_pipelines
ALTER TABLE deal_pipelines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Pipelines viewable by authenticated users"
    ON deal_pipelines FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Only admins can modify pipelines"
    ON deal_pipelines FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'owner')
        )
    );

-- RLS for deal_stages
ALTER TABLE deal_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Stages viewable by authenticated users"
    ON deal_stages FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Only admins can modify stages"
    ON deal_stages FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'owner')
        )
    );

-- RLS for customer_interactions
ALTER TABLE customer_interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Interactions viewable by authenticated users"
    ON customer_interactions FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Users can create interactions"
    ON customer_interactions FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Users can update their own interactions"
    ON customer_interactions FOR UPDATE
    TO authenticated
    USING (created_by = auth.uid() OR EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'owner', 'dispatcher')
    ));

-- Seed default pipeline
INSERT INTO deal_pipelines (name, description, is_default, sort_order) VALUES
('Residential Sales', 'Standard sales pipeline for residential equipment replacement', TRUE, 1),
('Commercial Contracts', 'Pipeline for commercial service contracts and larger projects', FALSE, 2)
ON CONFLICT DO NOTHING;

-- Seed default stages for Residential Sales pipeline
DO $$
DECLARE
    residential_pipeline_id UUID;
BEGIN
    SELECT id INTO residential_pipeline_id FROM deal_pipelines WHERE name = 'Residential Sales' LIMIT 1;

    IF residential_pipeline_id IS NOT NULL THEN
        INSERT INTO deal_stages (pipeline_id, name, description, probability, sort_order, color) VALUES
        (residential_pipeline_id, 'New Lead', 'Initial contact, needs qualification', 10, 1, '#6b7280'),
        (residential_pipeline_id, 'Site Visit Scheduled', 'Appointment set for assessment', 25, 2, '#3b82f6'),
        (residential_pipeline_id, 'Proposal Sent', 'Estimate delivered to customer', 50, 3, '#8b5cf6'),
        (residential_pipeline_id, 'Negotiation', 'Customer reviewing, may have questions', 75, 4, '#f59e0b'),
        (residential_pipeline_id, 'Won', 'Deal closed, work scheduled', 100, 5, '#22c55e'),
        (residential_pipeline_id, 'Lost', 'Customer declined or chose competitor', 0, 6, '#ef4444')
        ON CONFLICT DO NOTHING;

        -- Mark Won and Lost stages
        UPDATE deal_stages SET is_won = TRUE WHERE pipeline_id = residential_pipeline_id AND name = 'Won';
        UPDATE deal_stages SET is_lost = TRUE WHERE pipeline_id = residential_pipeline_id AND name = 'Lost';
    END IF;
END $$;

-- Create view for customer 360 timeline
CREATE OR REPLACE VIEW vw_customer_timeline AS
SELECT
    c.id as customer_id,
    c.name as customer_name,
    'interaction' as event_type,
    ci.id as event_id,
    ci.interaction_type as event_subtype,
    ci.subject as event_title,
    ci.notes as event_description,
    ci.created_at as event_date,
    p.full_name as created_by_name
FROM customers c
JOIN customer_interactions ci ON c.id = ci.customer_id
LEFT JOIN profiles p ON ci.created_by = p.id
UNION ALL
SELECT
    c.id as customer_id,
    c.name as customer_name,
    'ticket' as event_type,
    t.id as event_id,
    t.service_type as event_subtype,
    t.title as event_title,
    t.description as event_description,
    t.created_at as event_date,
    p.full_name as created_by_name
FROM customers c
JOIN tickets t ON c.id = t.customer_id
LEFT JOIN profiles p ON t.created_by = p.id
UNION ALL
SELECT
    c.id as customer_id,
    c.name as customer_name,
    'estimate' as event_type,
    e.id as event_id,
    e.status as event_subtype,
    e.title as event_title,
    e.description as event_description,
    e.created_at as event_date,
    p.full_name as created_by_name
FROM customers c
JOIN estimates e ON c.id = e.customer_id
LEFT JOIN profiles p ON e.created_by = p.id
ORDER BY event_date DESC;

-- Create view for leads inbox
CREATE OR REPLACE VIEW vw_leads_inbox AS
SELECT
    c.id,
    c.name,
    c.email,
    c.phone,
    c.lead_source,
    c.created_at,
    c.address,
    c.city,
    c.state,
    COUNT(DISTINCT ci.id) as interaction_count,
    MAX(ci.created_at) as last_interaction,
    COUNT(DISTINCT e.id) as estimate_count,
    SUM(CASE WHEN e.status = 'sent' THEN e.total_amount ELSE 0 END) as pending_estimate_value
FROM customers c
LEFT JOIN customer_interactions ci ON c.id = ci.customer_id
LEFT JOIN estimates e ON c.id = e.customer_id
WHERE c.status = 'lead'
GROUP BY c.id
ORDER BY c.created_at DESC;

-- Create view for sales pipeline
CREATE OR REPLACE VIEW vw_sales_pipeline AS
SELECT
    e.id as estimate_id,
    e.estimate_number,
    e.title,
    e.total_amount,
    e.status,
    e.deal_stage_id,
    ds.name as stage_name,
    ds.probability,
    ds.sort_order as stage_order,
    dp.name as pipeline_name,
    e.expected_close_date,
    e.days_in_stage,
    e.stage_entered_at,
    c.id as customer_id,
    c.name as customer_name,
    c.phone as customer_phone,
    e.created_at,
    e.updated_at
FROM estimates e
LEFT JOIN deal_stages ds ON e.deal_stage_id = ds.id
LEFT JOIN deal_pipelines dp ON ds.pipeline_id = dp.id
LEFT JOIN customers c ON e.customer_id = c.id
WHERE e.deal_stage_id IS NOT NULL
ORDER BY ds.sort_order, e.updated_at DESC;

-- Trigger to auto-create interaction when sales opportunity flagged
CREATE OR REPLACE FUNCTION create_sales_interaction_from_ticket()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.sales_opportunity_flag = TRUE AND
       (OLD.sales_opportunity_flag IS NULL OR OLD.sales_opportunity_flag = FALSE) THEN

        INSERT INTO customer_interactions (
            customer_id,
            interaction_type,
            direction,
            subject,
            notes,
            related_ticket_id,
            created_by
        ) VALUES (
            NEW.customer_id,
            'note',
            'outbound',
            'Sales Opportunity Identified',
            'Technician flagged potential sales opportunity on Ticket #' || NEW.ticket_number ||
                '. Problem: ' || COALESCE(NEW.problem_code, 'N/A') ||
                ', Resolution: ' || COALESCE(NEW.resolution_code, 'N/A'),
            NEW.id,
            COALESCE(NEW.assigned_to, auth.uid())
        );

        -- Also flag customer for replacement prospect
        UPDATE customers
        SET prospect_replacement_flag = TRUE
        WHERE id = NEW.customer_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_ticket_sales_interaction ON tickets;
CREATE TRIGGER trg_ticket_sales_interaction
AFTER UPDATE ON tickets
FOR EACH ROW
WHEN (NEW.sales_opportunity_flag = TRUE AND (OLD.sales_opportunity_flag IS NULL OR OLD.sales_opportunity_flag = FALSE))
EXECUTE FUNCTION create_sales_interaction_from_ticket();

-- Comments
COMMENT ON TABLE deal_pipelines IS 'Sales pipelines for tracking deals through stages';
COMMENT ON TABLE deal_stages IS 'Stages within a sales pipeline (Kanban columns)';
COMMENT ON TABLE customer_interactions IS 'Customer touchpoint logging for 360-degree view';
COMMENT ON VIEW vw_customer_timeline IS 'Unified timeline of all customer touchpoints';
COMMENT ON VIEW vw_leads_inbox IS 'Lead management inbox showing qualification status';
COMMENT ON VIEW vw_sales_pipeline IS 'Kanban view of deals in pipeline stages';
