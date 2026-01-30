/*
  # Create Warranty Claims System

  1. New Tables
    - `warranty_claims` - Track warranty claims for serialized parts and equipment
    - `warranty_claim_attachments` - Store claim-related documents/photos

  2. Features
    - Link claims to serialized_parts or equipment
    - Track claim lifecycle (draft → submitted → approved/denied → completed)
    - Store provider contact info and claim amounts
    - Support file attachments for documentation

  3. Security
    - RLS enabled with policies for authenticated users
*/

-- =====================================================
-- STEP 1: Create warranty_claims table
-- =====================================================

CREATE TABLE IF NOT EXISTS warranty_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Claim identification
  claim_number text NOT NULL UNIQUE,

  -- Link to warrantied item (one of these should be set)
  serialized_part_id uuid REFERENCES serialized_parts(id) ON DELETE SET NULL,
  equipment_id uuid REFERENCES equipment(id) ON DELETE SET NULL,

  -- Claim details
  claim_type text NOT NULL CHECK (claim_type IN ('repair', 'replacement', 'refund', 'labor')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'in_review', 'approved', 'denied', 'completed', 'cancelled')),

  -- Descriptions
  description text NOT NULL,
  failure_description text,
  failure_date date,

  -- Provider information
  provider_name text NOT NULL,
  provider_contact text,
  provider_phone text,
  provider_email text,
  provider_claim_number text, -- Their reference number

  -- Financial
  claim_amount numeric(12,2),
  approved_amount numeric(12,2),

  -- Resolution
  resolution_date date,
  resolution_notes text,

  -- Tracking
  submitted_date date,
  submitted_by uuid REFERENCES profiles(id),
  reviewed_by uuid REFERENCES profiles(id),
  review_date date,

  -- Related ticket (if claim originated from service call)
  ticket_id uuid REFERENCES tickets(id) ON DELETE SET NULL,

  -- Metadata
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- =====================================================
-- STEP 2: Create warranty_claim_attachments table
-- =====================================================

CREATE TABLE IF NOT EXISTS warranty_claim_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL REFERENCES warranty_claims(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_type text,
  file_size integer,
  file_url text NOT NULL,
  description text,
  uploaded_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);

-- =====================================================
-- STEP 3: Create indexes for performance
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_warranty_claims_status ON warranty_claims(status);
CREATE INDEX IF NOT EXISTS idx_warranty_claims_serialized_part ON warranty_claims(serialized_part_id) WHERE serialized_part_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_warranty_claims_equipment ON warranty_claims(equipment_id) WHERE equipment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_warranty_claims_provider ON warranty_claims(provider_name);
CREATE INDEX IF NOT EXISTS idx_warranty_claims_created_at ON warranty_claims(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_warranty_claim_attachments_claim ON warranty_claim_attachments(claim_id);

-- =====================================================
-- STEP 4: Create updated_at trigger
-- =====================================================

CREATE OR REPLACE FUNCTION fn_warranty_claims_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_warranty_claims_updated_at ON warranty_claims;
CREATE TRIGGER trg_warranty_claims_updated_at
  BEFORE UPDATE ON warranty_claims
  FOR EACH ROW
  EXECUTE FUNCTION fn_warranty_claims_updated_at();

-- =====================================================
-- STEP 5: Create claim number generator
-- =====================================================

CREATE OR REPLACE FUNCTION fn_generate_warranty_claim_number()
RETURNS TRIGGER AS $$
DECLARE
  v_year text;
  v_month text;
  v_sequence integer;
BEGIN
  IF NEW.claim_number IS NULL OR NEW.claim_number = '' THEN
    v_year := to_char(CURRENT_DATE, 'YY');
    v_month := to_char(CURRENT_DATE, 'MM');

    -- Get next sequence for this month
    SELECT COALESCE(MAX(
      CAST(NULLIF(REGEXP_REPLACE(claim_number, '^WC-' || v_year || v_month || '-', ''), '') AS INTEGER)
    ), 0) + 1
    INTO v_sequence
    FROM warranty_claims
    WHERE claim_number LIKE 'WC-' || v_year || v_month || '-%';

    NEW.claim_number := 'WC-' || v_year || v_month || '-' || LPAD(v_sequence::text, 4, '0');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_warranty_claim_number ON warranty_claims;
CREATE TRIGGER trg_warranty_claim_number
  BEFORE INSERT ON warranty_claims
  FOR EACH ROW
  EXECUTE FUNCTION fn_generate_warranty_claim_number();

-- =====================================================
-- STEP 6: Create view for claim summary
-- =====================================================

CREATE OR REPLACE VIEW vw_warranty_claims_summary AS
SELECT
  wc.id,
  wc.claim_number,
  wc.claim_type,
  wc.status,
  wc.description,
  wc.failure_date,
  wc.provider_name,
  wc.provider_claim_number,
  wc.claim_amount,
  wc.approved_amount,
  wc.submitted_date,
  wc.resolution_date,
  wc.created_at,

  -- Serialized part info
  sp.serial_number,
  p.name as part_name,
  p.part_number,

  -- Equipment info
  e.equipment_type,
  e.model_number as equipment_model,
  e.manufacturer as equipment_manufacturer,

  -- Customer info (from serialized part or equipment)
  COALESCE(c1.name, c2.name) as customer_name,

  -- Item identifier for display
  CASE
    WHEN wc.serialized_part_id IS NOT NULL THEN 'Part: ' || sp.serial_number
    WHEN wc.equipment_id IS NOT NULL THEN 'Equipment: ' || e.equipment_type || ' ' || e.model_number
    ELSE 'Unknown'
  END as item_description,

  -- Created by
  pr.full_name as created_by_name,

  -- Attachment count
  (SELECT COUNT(*) FROM warranty_claim_attachments WHERE claim_id = wc.id) as attachment_count

FROM warranty_claims wc
LEFT JOIN serialized_parts sp ON sp.id = wc.serialized_part_id
LEFT JOIN parts p ON p.id = sp.part_id
LEFT JOIN customer_locations cl ON cl.id = sp.installed_at_site_id
LEFT JOIN customers c1 ON c1.id = cl.customer_id
LEFT JOIN equipment e ON e.id = wc.equipment_id
LEFT JOIN customers c2 ON c2.id = e.customer_id
LEFT JOIN profiles pr ON pr.id = wc.created_by;

-- =====================================================
-- STEP 7: Enable RLS
-- =====================================================

ALTER TABLE warranty_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE warranty_claim_attachments ENABLE ROW LEVEL SECURITY;

-- Policies for warranty_claims
CREATE POLICY "Users can view all warranty claims"
  ON warranty_claims FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can create warranty claims"
  ON warranty_claims FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update warranty claims"
  ON warranty_claims FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Policies for warranty_claim_attachments
CREATE POLICY "Users can view claim attachments"
  ON warranty_claim_attachments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can add claim attachments"
  ON warranty_claim_attachments FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can delete own attachments"
  ON warranty_claim_attachments FOR DELETE
  TO authenticated
  USING (uploaded_by = auth.uid());

-- =====================================================
-- STEP 8: Grant permissions
-- =====================================================

GRANT SELECT, INSERT, UPDATE ON warranty_claims TO authenticated;
GRANT SELECT, INSERT, DELETE ON warranty_claim_attachments TO authenticated;
GRANT SELECT ON vw_warranty_claims_summary TO authenticated;
