# Data Integrity Implementation Report (Phase 2)

**Date:** February 9, 2026
**Migration File:** `supabase/migrations/20260209000001_data_integrity.sql`

---

## Summary

Phase 2 addressed data integrity issues identified in the production-ready plan:
- Consolidated duplicate parts tracking tables
- Replaced race-prone MAX()+1 auto-numbering with sequences
- Added foreign key cascades to prevent orphaned records

---

## Environments Updated

| Environment | Project Ref | Status |
|-------------|-------------|--------|
| **MES Dev** | `vijbnqrewokckwmtbbhi` | Applied |
| **Demo** | `uuarbdrzfakvlhlrnwgc` | Applied |
| **Production** | `trtqrdplgjgysyspwvam` | Applied |

---

## Section 2.1: Parts Usage Consolidation

### Problem
Two tables tracked the same data:
- `parts_usage` (legacy)
- `ticket_parts_used` (current)

This created a "double ledger" problem where some reports read from one table, others from another.

### Solution
1. **Migrated orphaned records** from `parts_usage` to `ticket_parts_used`
2. **Created compatibility view** `vw_parts_usage_compat` for backwards compatibility
3. **Preserved `parts_usage`** until frontend code is updated

### Schema Differences Handled
- MES environment: `ticket_parts_used` has no `unit_cost` column
- Demo/Production: `ticket_parts_used` has `unit_cost` column
- Migration detects column presence and adjusts accordingly

### Code Update Required
The following files still reference `parts_usage` and should be updated to use `ticket_parts_used`:
- `src/services/JobPLService.ts` (lines 429-431, 498-500)
- `src/components/Reports/ReportsView.tsx` (line 98)

After code update, run: `DROP TABLE IF EXISTS parts_usage CASCADE;`

---

## Section 2.2: Sequence-Based Auto-Numbering

### Problem
Code used `MAX(column) + 1` pattern which causes race conditions under concurrent load, potentially creating duplicate numbers.

### Solution
Created PostgreSQL sequences and generator functions:

| Sequence | Function | Format |
|----------|----------|--------|
| `invoice_number_seq` | `generate_invoice_number()` | `INV-000001` |
| `ticket_number_seq` | `generate_ticket_number()` | `TKT-000001` |
| `project_number_seq` | `generate_project_number()` | `PRJ-000001` |
| `po_number_seq` | `generate_po_number()` | `PO-000001` |
| `estimate_number_seq` | `generate_estimate_number()` | `EST-000001` |
| `production_order_number_seq` | `generate_production_order_number()` | `WO-26-00001` (MES only) |

### Sequence Initialization
Each sequence was initialized to the current MAX value in each environment to prevent collisions with existing data.

### Usage
```sql
-- Instead of: SELECT MAX(invoice_number) + 1 FROM invoices
-- Use:
SELECT generate_invoice_number();  -- Returns 'INV-000047'
```

### MES Note
The `generate_production_order_number()` function already existed in MES with a trigger. The migration preserved the existing function to avoid breaking the trigger.

---

## Section 2.3: Foreign Key Cascades

### Problem
Missing `ON DELETE CASCADE` constraints caused:
- Failed deletes due to FK violations
- Orphaned child records when parent deleted via raw SQL
- Data integrity issues

### Cascades Added

| Child Table | Parent Table | Constraint |
|-------------|--------------|------------|
| `invoice_lines` | `invoices` | `invoice_lines_invoice_id_fkey` |
| `ticket_parts_used` | `tickets` | `ticket_parts_used_ticket_id_fkey` |
| `ticket_parts_planned` | `tickets` | `ticket_parts_planned_ticket_id_fkey` |
| `ticket_notes` | `tickets` | `ticket_notes_ticket_id_fkey` |
| `ticket_technicians` | `tickets` | `ticket_technicians_ticket_id_fkey` |
| `ticket_fees` | `tickets` | `ticket_fees_ticket_id_fkey` (AHS) |
| `project_phases` | `projects` | `project_phases_project_id_fkey` |
| `project_tasks` | `project_phases` | `project_tasks_phase_id_fkey` |
| `purchase_order_lines` | `purchase_orders` | `purchase_order_lines_po_id_fkey` |
| `estimate_lines` | `estimates` | `estimate_lines_estimate_id_fkey` |
| `production_steps` | `production_orders` | `production_steps_production_order_id_fkey` (MES) |

---

## Verification Results

### Sequences Created (All Environments)
```
invoice_number_seq
ticket_number_seq
project_number_seq
po_number_seq
estimate_number_seq
production_order_number_seq (MES only)
```

### Generator Functions (All Environments)
```
generate_invoice_number
generate_ticket_number
generate_project_number
generate_po_number
generate_estimate_number
generate_production_order_number (MES only)
```

### Cascade Count by Environment

| Environment | CASCADE Constraints |
|-------------|---------------------|
| MES | 108 |
| Demo | 94 |
| Production | 95 |

MES has additional cascades for manufacturing tables (production_orders, quality_*, equipment_*, etc.)

---

## Issues Encountered & Resolved

### 1. Syntax Error in Production Order Block
**Error:** `syntax error at or near "BEGIN"`
**Cause:** Nested DECLARE/BEGIN blocks inside DO block
**Fix:** Restructured to separate DO blocks

### 2. Missing unit_cost Column
**Error:** `column "unit_cost" of relation "ticket_parts_used" does not exist`
**Cause:** MES environment has different schema
**Fix:** Added column detection before INSERT/VIEW creation

### 3. Integer Overflow on PO Numbers
**Error:** `value "1763624343948" is out of range for type integer`
**Cause:** Some PO numbers are timestamps
**Fix:** Changed all `integer` to `bigint`

### 4. Function Return Type Conflict
**Error:** `cannot change return type of existing function`
**Cause:** MES already had `generate_production_order_number()` with trigger dependency
**Fix:** Only create function if it doesn't already exist

---

## Remaining Work

### Code Updates Required
1. Update `JobPLService.ts` to use `ticket_parts_used` instead of `parts_usage`
2. Update `ReportsView.tsx` to use `ticket_parts_used`
3. Update any service that uses MAX()+1 to use generator functions

### Future Cleanup
After code is updated:
```sql
DROP TABLE IF EXISTS parts_usage CASCADE;
DROP VIEW IF EXISTS vw_parts_usage_compat;
```

---

## Sign-Off

- [x] Migration applied to MES Dev
- [x] Migration applied to Demo
- [x] Migration applied to Production
- [x] Sequences verified on all environments
- [x] Generator functions verified on all environments
- [x] Cascades verified on all environments
- [ ] Frontend code updated (pending)
- [ ] Legacy parts_usage table dropped (pending code update)

---

*Document generated: February 9, 2026*
