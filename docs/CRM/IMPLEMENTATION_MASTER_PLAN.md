# IntelliService CRM-Analytics-Accounting Master Implementation Plan

## Executive Summary

This plan prioritizes the implementation of add-on modules in three phases:
1. **HIGH PRIORITY**: Analytics Pipeline (Problem/Resolution Codes + Operational Intelligence)
2. **MEDIUM PRIORITY**: CRM Module (Sales Engine + Lead Management)
3. **LOWER PRIORITY**: Accounting Maturity (ERP-Grade Compliance)

---

## Current State Analysis (Schema Gaps Identified)

### Missing from `customers` table:
- `status` (enum: lead, active, churned)
- `lead_source` (text)

### Missing from `tickets` table:
- `problem_code` (FK to standard_codes)
- `resolution_code` (FK to standard_codes)

### Missing from `vendors` table:
- `tax_id_number` (encrypted)
- `is_1099_eligible` (boolean)
- `default_1099_box` (text)

### Missing from `gl_entries` table:
- `is_voided` (boolean)
- `voided_at` (timestamp)
- `voided_by` (uuid)
- `void_reason` (text)

### Tables that don't exist:
- `standard_codes` (Problem/Resolution codes)
- `deal_pipelines` / `deal_stages` (Sales pipeline)
- `customer_interactions` (360 view logging)
- `accounting_periods` (Period closing)
- `gl_audit_log` (Forensic trail)
- `tax_jurisdictions` / `tax_ledger` (Tax compliance)
- `tax_authorities` / `tax_zones` / `tax_matrix` (Scalable tax engine)
- `bank_feed_items` (Plaid integration)

### Views that don't exist:
- `vw_problem_pareto` (80/20 analysis)
- `vw_rework_analysis` (Callback detection)
- `vw_equipment_reliability` (MTBF)
- `vw_trial_balance` (CPA view)

---

# PHASE 1: Analytics Pipeline (HIGH PRIORITY)

**Goal**: Enable Pareto analysis, root cause detection, and sales opportunity tagging through standardized codes.

## 1.1 Database Schema

### Migration: `create_standard_codes.sql`

```sql
-- Standard Codes Table (Problem + Resolution)
CREATE TABLE standard_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    code_type TEXT NOT NULL CHECK (code_type IN ('problem', 'resolution')),
    label TEXT NOT NULL,
    description TEXT,
    category TEXT, -- 'electrical', 'airflow', 'refrigerant', 'safety', 'usage'
    severity INTEGER DEFAULT 5 CHECK (severity BETWEEN 1 AND 10),
    triggers_sales_lead BOOLEAN DEFAULT FALSE,
    triggers_urgent_review BOOLEAN DEFAULT FALSE,
    is_critical_safety BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add columns to tickets table
ALTER TABLE tickets
ADD COLUMN problem_code TEXT REFERENCES standard_codes(code),
ADD COLUMN resolution_code TEXT REFERENCES standard_codes(code),
ADD COLUMN sales_opportunity_flag BOOLEAN DEFAULT FALSE,
ADD COLUMN urgent_review_flag BOOLEAN DEFAULT FALSE;

-- Index for analytics queries
CREATE INDEX idx_tickets_problem_code ON tickets(problem_code);
CREATE INDEX idx_tickets_resolution_code ON tickets(resolution_code);
CREATE INDEX idx_tickets_sales_flag ON tickets(sales_opportunity_flag) WHERE sales_opportunity_flag = TRUE;
```

### Seed Data: 11 Problem Codes + 11 Resolution Codes

| Code | Type | Label | Triggers |
|------|------|-------|----------|
| NO-COOL-AIRFLOW | problem | No Cool - Airflow Issue | - |
| NO-COOL-COMPRESSOR | problem | No Cool - Compressor Issue | - |
| WATER-LEAK-PRIMARY | problem | Water Leak - Primary | - |
| NO-HEAT-IGNITION | problem | No Heat - Ignition Failure | - |
| THERMOSTAT-BLANK | problem | Thermostat - No Power | - |
| NOISE-GRINDING | problem | Noise - Grinding/Mechanical | - |
| SMELL-BURNING | problem | Smell - Burning/Electrical | - |
| SMELL-GAS | problem | Smell - Gas Leak | is_critical_safety |
| HIGH-BILLS | problem | High Utility Bills | triggers_sales_lead |
| SYSTEM-FROZEN | problem | System Frozen/Iced | - |
| AGE-CONDITION | problem | Age/Condition - End of Life | triggers_sales_lead |
| RES-REFRIGERANT-CHARGE | resolution | Added Refrigerant | - |
| RES-CAPACITOR-REPLACE | resolution | Replaced Capacitor | - |
| RES-CONTACTOR-REPLACE | resolution | Replaced Contactor | - |
| RES-DRAIN-CLEAR-NITRO | resolution | Cleared Drain Lines | - |
| RES-CLEAN-COIL-CHEM | resolution | Chemical Coil Cleaning | - |
| RES-MOTOR-BLOWER-ECM | resolution | Replaced Blower Motor | - |
| RES-LEAK-SEARCH-FOUND | resolution | Leak Search - Found | triggers_sales_lead |
| RES-COMPRESSOR-REPLACE | resolution | Replaced Compressor | - |
| RES-REPLACE-SYSTEM | resolution | Full System Replacement | - |
| RES-EDUCATE-CUSTOMER | resolution | Customer Education | - |
| RES-TEMP-FIX | resolution | Temporary Fix | triggers_urgent_review |

---

## 1.2 Analytics Views

### Migration: `create_analytics_views.sql`

```sql
-- Pareto Analysis View (Top Problems by Frequency & Cost)
CREATE VIEW vw_problem_pareto AS
SELECT
    sc.code,
    sc.label,
    sc.category,
    COUNT(t.id) as ticket_count,
    COALESCE(SUM(t.billed_amount), 0) as total_revenue,
    ROUND(100.0 * COUNT(t.id) / NULLIF(SUM(COUNT(t.id)) OVER (), 0), 2) as percentage,
    SUM(COUNT(t.id)) OVER (ORDER BY COUNT(t.id) DESC) as cumulative_count
FROM standard_codes sc
LEFT JOIN tickets t ON t.problem_code = sc.code
WHERE sc.code_type = 'problem'
GROUP BY sc.code, sc.label, sc.category
ORDER BY ticket_count DESC;

-- Rework Analysis View (Callbacks within 30 days)
CREATE VIEW vw_rework_analysis AS
SELECT
    t1.id as original_ticket_id,
    t1.ticket_number as original_ticket,
    t1.resolution_code as original_resolution,
    t1.completed_at as original_completed,
    t2.id as callback_ticket_id,
    t2.ticket_number as callback_ticket,
    t2.problem_code as callback_problem,
    t2.created_at as callback_date,
    t1.assigned_to as technician_id,
    p.full_name as technician_name,
    t1.equipment_id,
    t1.customer_id,
    EXTRACT(DAY FROM t2.created_at - t1.completed_at) as days_between
FROM tickets t1
JOIN tickets t2 ON t1.customer_id = t2.customer_id
    AND t1.equipment_id = t2.equipment_id
    AND t2.created_at > t1.completed_at
    AND t2.created_at <= t1.completed_at + INTERVAL '30 days'
    AND t1.id != t2.id
LEFT JOIN profiles p ON t1.assigned_to = p.id
WHERE t1.status = 'completed'
ORDER BY t2.created_at DESC;

-- Equipment Reliability View (MTBF by Model)
CREATE VIEW vw_equipment_reliability AS
SELECT
    e.manufacturer,
    e.model_number,
    e.equipment_type,
    COUNT(DISTINCT e.id) as unit_count,
    COUNT(t.id) as total_failures,
    ROUND(AVG(EXTRACT(DAY FROM t.created_at - LAG(t.created_at)
        OVER (PARTITION BY e.id ORDER BY t.created_at))), 1) as avg_days_between_failures,
    MIN(t.created_at) as first_failure,
    MAX(t.created_at) as last_failure
FROM equipment e
LEFT JOIN tickets t ON t.equipment_id = e.id AND t.status = 'completed'
GROUP BY e.manufacturer, e.model_number, e.equipment_type
HAVING COUNT(t.id) > 0
ORDER BY total_failures DESC;
```

---

## 1.3 UI Components

### A. Ticket Forms (Mobile & Desktop)

**Files to Modify:**
- `src/components/Tickets/NewTicketModal.tsx` - Add Problem Code dropdown (optional)
- `src/components/Tickets/TechnicianTicketView.tsx` - Add Problem + Resolution dropdowns (required to complete)
- `src/components/Dispatch/TicketDetailModal.tsx` - Display and edit codes

**Validation Rules:**
- Problem Code: Optional at creation, **required** before status = 'completed'
- Resolution Code: **Required** before status = 'completed'
- If `SMELL-GAS` selected: Show critical safety warning modal
- If sales trigger code selected: Auto-set `sales_opportunity_flag = true`

### B. Analytics Dashboard Widgets

**New Component:** `src/components/BI/ParetoChart.tsx`
- Bar chart showing top 10 problem codes
- Cumulative line overlay (80/20 visualization)
- Click-through to filtered ticket list

**New Component:** `src/components/BI/ReworkReport.tsx`
- Table showing callbacks grouped by technician
- Columns: Tech Name, Original Resolution, Callback Problem, Days Between
- Color coding for repeat offenders

**New Component:** `src/components/BI/ReliabilityReport.tsx`
- Equipment MTBF rankings
- Manufacturer comparison
- Model-specific failure patterns

---

## 1.4 Automation Triggers

### Database Trigger: `on_ticket_complete_check_flags`

```sql
CREATE OR REPLACE FUNCTION check_ticket_completion_flags()
RETURNS TRIGGER AS $$
BEGIN
    -- Set sales opportunity flag based on problem code
    IF NEW.problem_code IN ('HIGH-BILLS', 'AGE-CONDITION') OR
       NEW.resolution_code IN ('RES-LEAK-SEARCH-FOUND') THEN
        NEW.sales_opportunity_flag := TRUE;
    END IF;

    -- Set urgent review flag for temp fixes
    IF NEW.resolution_code = 'RES-TEMP-FIX' THEN
        NEW.urgent_review_flag := TRUE;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ticket_completion_flags
BEFORE UPDATE ON tickets
FOR EACH ROW
WHEN (NEW.status = 'completed' AND OLD.status != 'completed')
EXECUTE FUNCTION check_ticket_completion_flags();
```

---

## 1.5 Implementation Checklist

- [ ] Create migration: `standard_codes` table
- [ ] Create migration: Add columns to `tickets` table
- [ ] Seed problem codes (11)
- [ ] Seed resolution codes (11)
- [ ] Create analytics views (pareto, rework, reliability)
- [ ] Update `NewTicketModal.tsx` - Problem Code dropdown
- [ ] Update `TechnicianTicketView.tsx` - Problem + Resolution dropdowns (mandatory)
- [ ] Update `TicketDetailModal.tsx` - Display/edit codes
- [ ] Create `ParetoChart.tsx` component
- [ ] Create `ReworkReport.tsx` component
- [ ] Create `ReliabilityReport.tsx` component
- [ ] Add analytics widgets to Dashboard or BI section
- [ ] Create database trigger for flag automation
- [ ] Test full workflow: Create ticket -> Complete with codes -> Verify analytics

---

# PHASE 2: CRM Module (MEDIUM PRIORITY)

**Goal**: Transform from Operations Platform to Sales Engine with lead management, pipeline tracking, and interaction logging.

## 2.1 Database Schema

### Migration: `create_crm_tables.sql`

```sql
-- Customer Status Extension
ALTER TABLE customers
ADD COLUMN status TEXT DEFAULT 'active' CHECK (status IN ('lead', 'active', 'churned')),
ADD COLUMN lead_source TEXT,
ADD COLUMN converted_at TIMESTAMPTZ,
ADD COLUMN churned_at TIMESTAMPTZ;

-- Deal Pipelines (Kanban Boards)
CREATE TABLE deal_pipelines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    is_default BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pipeline Stages
CREATE TABLE deal_stages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pipeline_id UUID REFERENCES deal_pipelines(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    probability INTEGER DEFAULT 0 CHECK (probability BETWEEN 0 AND 100),
    sort_order INTEGER DEFAULT 0,
    is_won BOOLEAN DEFAULT FALSE,
    is_lost BOOLEAN DEFAULT FALSE
);

-- Link Estimates to Pipeline Stages
ALTER TABLE estimates
ADD COLUMN deal_stage_id UUID REFERENCES deal_stages(id),
ADD COLUMN expected_close_date DATE,
ADD COLUMN lost_reason TEXT;

-- Customer Interactions (360 View)
CREATE TABLE customer_interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    interaction_type TEXT NOT NULL CHECK (interaction_type IN ('call', 'email', 'sms', 'meeting', 'note')),
    direction TEXT CHECK (direction IN ('inbound', 'outbound')),
    subject TEXT,
    notes TEXT,
    duration_minutes INTEGER,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_customers_status ON customers(status);
CREATE INDEX idx_estimates_deal_stage ON estimates(deal_stage_id);
CREATE INDEX idx_interactions_customer ON customer_interactions(customer_id);
```

---

## 2.2 UI Components

### A. Sales Pipeline Board (Kanban)

**New File:** `src/components/Sales/PipelineBoard.tsx`
- Drag-and-drop Kanban (using `@dnd-kit/core` or `react-beautiful-dnd`)
- Columns = Deal Stages
- Cards = Estimates
- Card shows: Customer Name, Value ($), Days in Stage
- Drag to update stage

### B. Lead Inbox

**New File:** `src/components/Sales/LeadsView.tsx`
- Filtered list of customers where `status = 'lead'`
- Quick actions: Call, Convert to Customer, Add Note
- Lead source breakdown chart

### C. Customer 360 View

**Modify:** `src/components/Customers/CustomerDetailModal.tsx`
- Add Interaction Timeline tab
- Log Call/Email/Meeting buttons
- Show estimate pipeline position
- Display sales opportunity flags from tickets

### D. Campaign Segment Builder (Future)

**New File:** `src/components/Marketing/SegmentBuilder.tsx`
- Query builder for customer targeting
- Example: "Equipment age > 10 AND last_service > 6 months"
- Export to email list or trigger campaign

---

## 2.3 Automation Triggers

### Tech Upsell Loop

```sql
-- When ticket closes with sales trigger, create interaction
CREATE OR REPLACE FUNCTION create_sales_opportunity_from_ticket()
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
            created_by
        ) VALUES (
            NEW.customer_id,
            'note',
            'outbound',
            'Sales Opportunity Flagged',
            'Ticket #' || NEW.ticket_number || ' flagged for sales follow-up. Problem: ' ||
                COALESCE(NEW.problem_code, 'N/A') || ', Resolution: ' || COALESCE(NEW.resolution_code, 'N/A'),
            NEW.assigned_to
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

---

## 2.4 Implementation Checklist

- [ ] Create migration: Customer status/lead_source columns
- [ ] Create migration: `deal_pipelines` and `deal_stages` tables
- [ ] Create migration: `customer_interactions` table
- [ ] Create migration: Estimate pipeline linkage
- [ ] Seed default pipeline (New Lead -> Qualified -> Proposal -> Negotiation -> Won/Lost)
- [ ] Create `PipelineBoard.tsx` component
- [ ] Create `LeadsView.tsx` component
- [ ] Update `CustomerDetailModal.tsx` with interaction timeline
- [ ] Add "Log Interaction" modal
- [ ] Create sales opportunity automation trigger
- [ ] Add Sales section to navigation
- [ ] Test full workflow: Lead -> Estimate -> Pipeline -> Won -> Customer

---

# PHASE 3: Accounting Maturity (LOWER PRIORITY)

**Goal**: Upgrade from Operational GL to Compliance-Ready ERP with audit trails, period closing, and tax compliance.

## 3.1 Database Schema

### Migration: `create_accounting_compliance.sql`

```sql
-- Accounting Periods (Month Closing)
CREATE TYPE period_status AS ENUM ('open', 'closing', 'closed');

CREATE TABLE accounting_periods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status period_status DEFAULT 'open',
    locked_at TIMESTAMPTZ,
    locked_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- GL Audit Log
CREATE TYPE audit_action AS ENUM ('insert', 'update', 'void', 'delete_attempt');

CREATE TABLE gl_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gl_entry_id UUID,
    action audit_action NOT NULL,
    changed_fields JSONB,
    reason TEXT,
    performed_by UUID REFERENCES profiles(id),
    ip_address INET,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Void Logic for GL Entries
ALTER TABLE gl_entries
ADD COLUMN is_voided BOOLEAN DEFAULT FALSE,
ADD COLUMN voided_at TIMESTAMPTZ,
ADD COLUMN voided_by UUID REFERENCES profiles(id),
ADD COLUMN void_reason TEXT;

-- Prevent deletes, only allow voids
CREATE OR REPLACE FUNCTION prevent_gl_delete()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO gl_audit_log (gl_entry_id, action, performed_by)
    VALUES (OLD.id, 'delete_attempt', auth.uid());

    RAISE EXCEPTION 'GL entries cannot be deleted. Use void instead.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_gl_delete
BEFORE DELETE ON gl_entries
FOR EACH ROW EXECUTE FUNCTION prevent_gl_delete();

-- Period Lock Enforcement
CREATE OR REPLACE FUNCTION enforce_period_lock()
RETURNS TRIGGER AS $$
DECLARE
    period_record accounting_periods%ROWTYPE;
BEGIN
    SELECT * INTO period_record
    FROM accounting_periods
    WHERE NEW.entry_date BETWEEN start_date AND end_date
    LIMIT 1;

    IF period_record.status = 'closed' THEN
        RAISE EXCEPTION 'Cannot modify entries in closed period: %', period_record.name;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enforce_period_lock
BEFORE INSERT OR UPDATE ON gl_entries
FOR EACH ROW EXECUTE FUNCTION enforce_period_lock();
```

---

## 3.2 Tax Compliance Schema

### Migration: `create_tax_engine.sql`

```sql
-- Tax Jurisdictions
CREATE TABLE tax_jurisdictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    code TEXT,
    state_code TEXT,
    tax_rate DECIMAL(10, 4) NOT NULL,
    agency_name TEXT,
    is_active BOOLEAN DEFAULT TRUE
);

-- Tax Ledger (Per-Invoice Tax Tracking)
CREATE TABLE tax_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_source_type TEXT NOT NULL,
    transaction_source_id UUID NOT NULL,
    jurisdiction_id UUID REFERENCES tax_jurisdictions(id),
    taxable_amount DECIMAL(19, 4) NOT NULL,
    tax_amount DECIMAL(19, 4) NOT NULL,
    transaction_date DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vendor 1099 Tracking
ALTER TABLE vendors
ADD COLUMN tax_id_number TEXT,
ADD COLUMN is_1099_eligible BOOLEAN DEFAULT FALSE,
ADD COLUMN default_1099_box TEXT CHECK (default_1099_box IN ('NEC', 'MISC'));
```

---

## 3.3 Reporting Views

### Migration: `create_accounting_views.sql`

```sql
-- Trial Balance View
CREATE VIEW vw_trial_balance AS
SELECT
    coa.account_code,
    coa.account_name,
    coa.account_type,
    COALESCE(SUM(gle.debit_amount), 0) as total_debits,
    COALESCE(SUM(gle.credit_amount), 0) as total_credits,
    COALESCE(SUM(gle.debit_amount), 0) - COALESCE(SUM(gle.credit_amount), 0) as balance
FROM chart_of_accounts coa
LEFT JOIN gl_entries gle ON coa.id = gle.account_id AND gle.is_voided = FALSE
GROUP BY coa.id, coa.account_code, coa.account_name, coa.account_type
ORDER BY coa.account_code;

-- Sales Tax Liability Report View
CREATE VIEW vw_sales_tax_liability AS
SELECT
    tj.name as jurisdiction,
    tj.agency_name,
    DATE_TRUNC('month', tl.transaction_date) as period,
    SUM(tl.taxable_amount) as taxable_sales,
    SUM(tl.tax_amount) as tax_collected
FROM tax_ledger tl
JOIN tax_jurisdictions tj ON tl.jurisdiction_id = tj.id
GROUP BY tj.id, tj.name, tj.agency_name, DATE_TRUNC('month', tl.transaction_date)
ORDER BY period DESC, jurisdiction;

-- 1099 Report View
CREATE VIEW vw_1099_report AS
SELECT
    v.name as vendor_name,
    v.tax_id_number,
    v.default_1099_box,
    EXTRACT(YEAR FROM vp.payment_date) as tax_year,
    SUM(vp.amount) as total_paid
FROM vendors v
JOIN vendor_payments vp ON v.id = vp.vendor_id
WHERE v.is_1099_eligible = TRUE
GROUP BY v.id, v.name, v.tax_id_number, v.default_1099_box, EXTRACT(YEAR FROM vp.payment_date)
HAVING SUM(vp.amount) >= 600
ORDER BY tax_year DESC, total_paid DESC;
```

---

## 3.4 UI Components

### A. Period Management

**New File:** `src/components/Accounting/PeriodManagement.tsx`
- List of accounting periods
- Close period button (with confirmation)
- Reopen period (admin only with reason)

### B. Void Entry Modal

**Modify:** `src/components/Accounting/GLEntryDetail.tsx`
- Add "Void Entry" button
- Require reason for void
- Auto-create reversing entry

### C. Audit Log Viewer

**New File:** `src/components/Accounting/AuditLogViewer.tsx`
- Filterable log of GL changes
- User, date, action, before/after values

### D. Tax Reports

**New File:** `src/components/Accounting/TaxLiabilityReport.tsx`
- Sales tax by jurisdiction
- Date range filter
- Export for tax filing

---

## 3.5 Implementation Checklist

- [ ] Create migration: `accounting_periods` table
- [ ] Create migration: `gl_audit_log` table
- [ ] Create migration: GL void columns
- [ ] Create migration: Period lock trigger
- [ ] Create migration: Delete prevention trigger
- [ ] Create migration: Tax jurisdiction tables
- [ ] Create migration: Vendor 1099 columns
- [ ] Create `vw_trial_balance` view
- [ ] Create `vw_sales_tax_liability` view
- [ ] Create `vw_1099_report` view
- [ ] Create `PeriodManagement.tsx` component
- [ ] Add void functionality to GL entries
- [ ] Create `AuditLogViewer.tsx` component
- [ ] Create `TaxLiabilityReport.tsx` component
- [ ] Test period closing workflow
- [ ] Test void + reversing entry workflow

---

# Implementation Timeline

| Phase | Component | Priority | Dependencies |
|-------|-----------|----------|--------------|
| 1.1 | Standard Codes Schema | HIGH | None |
| 1.2 | Analytics Views | HIGH | 1.1 |
| 1.3 | Ticket Form Updates | HIGH | 1.1 |
| 1.4 | Analytics Dashboard | HIGH | 1.2 |
| 1.5 | Automation Triggers | HIGH | 1.1 |
| 2.1 | CRM Schema | MEDIUM | 1.5 (for sales flags) |
| 2.2 | Pipeline Board | MEDIUM | 2.1 |
| 2.3 | Lead Management | MEDIUM | 2.1 |
| 2.4 | Customer 360 | MEDIUM | 2.1 |
| 3.1 | Accounting Periods | LOWER | None |
| 3.2 | GL Audit & Void | LOWER | 3.1 |
| 3.3 | Tax Engine | LOWER | None |
| 3.4 | Tax Reports | LOWER | 3.3 |

---

# Risk Mitigation

## Data Integrity Rules (from DATABASE_INTEGRITY_POLICY.md)

1. **NO FREE-TEXT ANALYTICS**: Problem/Resolution codes MUST be dropdown selections
2. **NO DELETES ON FINANCIALS**: GL entries void only, never delete
3. **PERIOD LOCK ENFORCEMENT**: Validate period status before any GL write
4. **AUDIT EVERYTHING**: Log all sensitive field changes

## Regression Prevention

- Run existing test suite after each migration
- Create test tickets with each problem/resolution code
- Verify analytics views return expected data
- Test period lock before production deployment

---

# File Summary

## New Migrations (11)
1. `XXXXXX_create_standard_codes.sql`
2. `XXXXXX_add_ticket_code_columns.sql`
3. `XXXXXX_seed_hvac_codes.sql`
4. `XXXXXX_create_analytics_views.sql`
5. `XXXXXX_create_crm_tables.sql`
6. `XXXXXX_add_customer_crm_columns.sql`
7. `XXXXXX_create_accounting_periods.sql`
8. `XXXXXX_create_gl_audit_log.sql`
9. `XXXXXX_add_gl_void_columns.sql`
10. `XXXXXX_create_tax_engine.sql`
11. `XXXXXX_create_accounting_views.sql`

## New Components (12)
1. `src/components/BI/ParetoChart.tsx`
2. `src/components/BI/ReworkReport.tsx`
3. `src/components/BI/ReliabilityReport.tsx`
4. `src/components/Sales/PipelineBoard.tsx`
5. `src/components/Sales/LeadsView.tsx`
6. `src/components/Sales/SalesDashboard.tsx`
7. `src/components/Marketing/SegmentBuilder.tsx`
8. `src/components/Accounting/PeriodManagement.tsx`
9. `src/components/Accounting/AuditLogViewer.tsx`
10. `src/components/Accounting/TaxLiabilityReport.tsx`
11. `src/components/Accounting/VoidEntryModal.tsx`
12. `src/components/Customers/InteractionTimeline.tsx`

## Modified Components (5)
1. `src/components/Tickets/NewTicketModal.tsx`
2. `src/components/Tickets/TechnicianTicketView.tsx`
3. `src/components/Dispatch/TicketDetailModal.tsx`
4. `src/components/Customers/CustomerDetailModal.tsx`
5. `src/components/Accounting/GLEntryDetail.tsx`
