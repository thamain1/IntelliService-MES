-- Accounting Upgrade Schema Definitions
-- Use this to apply the structural changes for the ERP Maturity Plan

-- 1. ACCOUNTING PERIODS (Closing Logic)
CREATE TYPE period_status AS ENUM ('open', 'closing', 'closed');

CREATE TABLE accounting_periods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL, -- e.g., "January 2026"
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status period_status DEFAULT 'open',
    locked_at TIMESTAMP WITH TIME ZONE,
    locked_by UUID REFERENCES auth.users(id),
    organization_id UUID NOT NULL, -- For multi-tenancy context
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast lookup during GL insertion validation
CREATE INDEX idx_accounting_periods_dates ON accounting_periods (start_date, end_date);


-- 2. GL AUDIT LOG (Forensic Trail)
CREATE TYPE audit_action AS ENUM ('insert', 'update', 'void', 'delete_attempt');

CREATE TABLE gl_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gl_entry_id UUID NOT NULL, -- Loose reference to keep log even if entry is archived
    action audit_action NOT NULL,
    changed_fields JSONB, -- Stores before/after snapshot
    reason TEXT,
    performed_by UUID REFERENCES auth.users(id),
    ip_address INET,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);


-- 3. VOID LOGIC (Update existing table)
-- ALTER TABLE gl_entries ADD COLUMN is_voided BOOLEAN DEFAULT FALSE;
-- ALTER TABLE gl_entries ADD COLUMN voided_at TIMESTAMP WITH TIME ZONE;
-- ALTER TABLE gl_entries ADD COLUMN voided_by UUID REFERENCES auth.users(id);
-- ALTER TABLE gl_entries ADD COLUMN void_reason TEXT;


-- 4. TAX COMPLIANCE LAYER
CREATE TABLE tax_jurisdictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL, -- "Austin, TX"
    code TEXT, -- "TX-AUS"
    state_code TEXT, -- "TX"
    tax_rate DECIMAL(10, 4) NOT NULL, -- 0.0825
    agency_name TEXT, -- "Texas Comptroller"
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE tax_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_source_type TEXT NOT NULL, -- 'invoice', 'credit_memo'
    transaction_source_id UUID NOT NULL,
    jurisdiction_id UUID REFERENCES tax_jurisdictions(id),
    taxable_amount DECIMAL(19, 4) NOT NULL,
    tax_amount DECIMAL(19, 4) NOT NULL,
    transaction_date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);


-- 5. BANK FEEDS (Staging Table for Plaid/Yodlee)
CREATE TYPE feed_status AS ENUM ('pending', 'matched', 'created', 'ignored');

CREATE TABLE bank_feed_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID REFERENCES chart_of_accounts(id), -- The internal bank account
    external_id TEXT NOT NULL, -- Plaid Transaction ID
    date DATE NOT NULL,
    amount DECIMAL(19, 4) NOT NULL,
    name TEXT, -- Merchant name
    memo TEXT, -- Description
    status feed_status DEFAULT 'pending',
    matched_gl_entry_id UUID REFERENCES gl_entries(id),
    raw_data JSONB, -- Full payload from provider
    imported_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. VENDOR 1099 UPDATES (Schema Only)
-- ALTER TABLE vendors ADD COLUMN tax_id_number TEXT; -- Needs encryption in app layer
-- ALTER TABLE vendors ADD COLUMN is_1099_eligible BOOLEAN DEFAULT FALSE;
-- ALTER TABLE vendors ADD COLUMN default_1099_box TEXT; -- 'NEC', 'MISC'
