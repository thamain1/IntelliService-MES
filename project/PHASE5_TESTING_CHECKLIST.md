# Phase 5: Testing & Validation Checklist

**Date:** February 9, 2026
**Purpose:** Verify MES workflows function correctly in real-world scenarios

---

## Test Environment

| Environment | URL | Purpose |
|-------------|-----|---------|
| MES Dev | `vijbnqrewokckwmtbbhi.supabase.co` | MES test environment |

> **Note:** MES is a standalone module. Do NOT test against the IntelliServiceBeta/Demo environment.

---

## Test 1: Operator Can Start a Job

### Scenario
An operator logs in, views the production queue, and starts working on a job.

### Prerequisites
- [ ] At least one production order exists with status `queued` or `released`
- [ ] At least one work center exists
- [ ] Test user has `operator` role

### Steps

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1.1 | Log in as operator | Dashboard loads, Production nav visible |
| 1.2 | Navigate to Production Dashboard | Production orders list displays |
| 1.3 | Click on a queued order | Order detail view opens |
| 1.4 | Click "Start" or "Clock In" | Timer starts, order status → `in_progress` |
| 1.5 | Verify in database | `production_orders.status = 'in_progress'` |

### Verification Query
```sql
-- Check order status changed
SELECT id, order_number, status, updated_at
FROM production_orders
WHERE id = '<order_id>';

-- Check time log created
SELECT id, production_order_id, clock_in, clock_out
FROM production_time_logs
WHERE production_order_id = '<order_id>'
ORDER BY clock_in DESC
LIMIT 1;
```

### Result
- [ ] **PASS** - Operator can start job, status updates correctly
- [ ] **FAIL** - Document issue: _______________________

---

## Test 2: OEE Dashboard Renders

### Scenario
A supervisor views the OEE dashboard and sees accurate metrics.

### Prerequisites
- [ ] At least one work center with production history
- [ ] Some production counts recorded (good/scrap)
- [ ] Some downtime events recorded
- [ ] Test user has `supervisor` or `admin` role

### Steps

| Step | Action | Expected Result |
|------|--------|-----------------|
| 2.1 | Navigate to Production → OEE Dashboard | OEE page loads without errors |
| 2.2 | Select a work center | Metrics populate |
| 2.3 | Verify Availability tile | Shows percentage, not NaN or 0% |
| 2.4 | Verify Performance tile | Shows percentage with calculation visible |
| 2.5 | Verify Quality tile | Shows percentage based on good/total |
| 2.6 | Verify OEE score | Shows A × P × Q result |
| 2.7 | Check trend chart | Graph renders with data points |
| 2.8 | Click downtime drilldown | Downtime events display |

### Verification Query
```sql
-- Check raw data exists for OEE calculation
SELECT
  wc.name as work_center,
  COUNT(DISTINCT pc.id) as count_records,
  SUM(pc.good_qty) as total_good,
  SUM(pc.scrap_qty) as total_scrap
FROM work_centers wc
LEFT JOIN production_counts pc ON pc.work_center_id = wc.id
GROUP BY wc.id, wc.name;

-- Check downtime exists
SELECT work_center_id, COUNT(*) as downtime_events
FROM downtime_events
GROUP BY work_center_id;
```

### Result
- [ ] **PASS** - OEE dashboard renders with accurate data
- [ ] **FAIL** - Document issue: _______________________

---

## Test 3: Inventory Deducts on Work Order Completion

### Scenario
When a production order is completed, the BOM materials are consumed from inventory.

### Prerequisites
- [ ] Production order with BOM items defined
- [ ] BOM parts have inventory in stock location
- [ ] Note starting inventory quantities

### Steps

| Step | Action | Expected Result |
|------|--------|-----------------|
| 3.1 | Record starting inventory | Note qty for each BOM part |
| 3.2 | Open production order with BOM | BOM items visible |
| 3.3 | Complete all production steps | Steps marked complete |
| 3.4 | Complete the order | Order status → `complete` |
| 3.5 | Check inventory levels | Quantities reduced by BOM amounts |
| 3.6 | Check inventory_movements | Consumption records created |

### Verification Query (Before)
```sql
-- Record BEFORE quantities
SELECT
  p.part_number,
  p.name,
  pi.quantity_on_hand,
  sl.name as location
FROM part_inventory pi
JOIN parts p ON p.id = pi.part_id
JOIN stock_locations sl ON sl.id = pi.stock_location_id
WHERE p.id IN (
  SELECT part_id FROM bill_of_materials
  WHERE production_order_id = '<order_id>'
);
```

### Verification Query (After)
```sql
-- Record AFTER quantities (should be reduced)
SELECT
  p.part_number,
  p.name,
  pi.quantity_on_hand,
  sl.name as location
FROM part_inventory pi
JOIN parts p ON p.id = pi.part_id
JOIN stock_locations sl ON sl.id = pi.stock_location_id
WHERE p.id IN (
  SELECT part_id FROM bill_of_materials
  WHERE production_order_id = '<order_id>'
);

-- Check inventory movements created
SELECT
  im.id,
  p.part_number,
  im.quantity,
  im.movement_type,
  im.reference_type,
  im.created_at
FROM inventory_movements im
JOIN parts p ON p.id = im.part_id
WHERE im.reference_type = 'production_order'
  AND im.reference_id = '<order_id>';
```

### Result
- [ ] **PASS** - Inventory correctly deducted on completion
- [ ] **FAIL** - Document issue: _______________________

---

## Test 4: Security Hardening Verification

### Scenario
Verify the Phase 1 security fixes are working.

### Steps

| Step | Action | Expected Result |
|------|--------|-----------------|
| 4.1 | Log in as technician | Limited nav options |
| 4.2 | Try to access /invoices directly | Access denied or empty |
| 4.3 | Try to access /gl-entries directly | Access denied or empty |
| 4.4 | Log in as dispatcher | Can see invoices |
| 4.5 | Log in as admin | Can see GL entries |

### Verification Query
```sql
-- Check RLS is blocking technician from invoices
-- Run as authenticated user with technician role
SELECT COUNT(*) FROM invoices; -- Should be 0 or filtered
```

### Result
- [ ] **PASS** - Role-based access working
- [ ] **FAIL** - Document issue: _______________________

---

## Test 5: Audit Trail Verification

### Scenario
Verify Phase 3 audit columns are being populated.

### Steps

| Step | Action | Expected Result |
|------|--------|-----------------|
| 5.1 | Create a new invoice | created_at, created_by populated |
| 5.2 | Update the invoice | updated_at, updated_by populated |
| 5.3 | Check ticket update | Audit fields populated |

### Verification Query
```sql
-- Check audit fields on recently modified records
SELECT
  id,
  invoice_number,
  created_at,
  created_by,
  updated_at,
  updated_by
FROM invoices
ORDER BY updated_at DESC
LIMIT 5;
```

### Result
- [ ] **PASS** - Audit trail working
- [ ] **FAIL** - Document issue: _______________________

---

## Test Summary

| Test | Status | Notes |
|------|--------|-------|
| 1. Operator Start Job | | |
| 2. OEE Dashboard | | |
| 3. Inventory Deduction | | |
| 4. Security (RLS) | | |
| 5. Audit Trail | | |

---

## Issues Found

| # | Test | Issue Description | Severity | Resolution |
|---|------|-------------------|----------|------------|
| 1 | | | | |
| 2 | | | | |

---

## Sign-Off

- [ ] All critical tests pass
- [ ] Issues documented and prioritized
- [ ] Ready for production use

**Tested By:** _______________________
**Date:** _______________________

---

*Document created: February 9, 2026*
