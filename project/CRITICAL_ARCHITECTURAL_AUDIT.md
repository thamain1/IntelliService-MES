# Critical Architectural Audit: IntelliService Platform

**Status:** HIGH RISK
**Date:** February 6, 2026
**Subject:** Vulnerability, Integrity, and Maintenance Assessment

---

## 1. SECURITY VULNERABILITIES (Highest Priority)

### 🚨 "Fake Security" (Client-Side Only Enforcement)
The system currently performs role checks (e.g., `is_admin`) in the React frontend while leaving the database wide open.
*   **The Flaw:** Migration `20260207000000` (Inventory Fix) defines RLS policies for `ticket_parts_used` as `CHECK (true)`.
*   **The Risk:** Any authenticated user can bypass the UI and use the API to **DELETE or CORRUPT** every part usage record in the system. They could also inject fake entries to "steal" inventory from a technician's truck.
*   **Required Fix:** RLS must be rewritten to strictly validate `auth.uid()` against `tickets.assigned_to` or verify the user's role via a database-side `profiles` lookup.

### 🚨 Data Enumeration Risk
*   **The Flaw:** Public access tokens for Estimates and Photos use predictable patterns or insufficiently scoped RLS.
*   **The Risk:** Unauthorized parties could potentially enumerate and download customer data, pricing, and site photos.

---

## 2. DATA INTEGRITY & SCHEMA ROT

### 💥 Schema Duplication (The "Double Ledger")
*   **The Flaw:** The system currently maintains two tables for the same data: `parts_usage` (Legacy) and `ticket_parts_used` (New).
*   **The Impact:** Disconnected data. Reporting and Invoicing modules may pull from the old table while Inventory triggers fire on the new one. This guarantees financial discrepancies.
*   **Required Fix:** Migrate all data to `ticket_parts_used` and **DROP** the legacy `parts_usage` table.

### 💥 Fragile Inventory Logic
*   **The Flaw:** The inventory deduction trigger relies on a fallback to `default_vehicle_id` if a specific truck assignment isn't found.
*   **The Impact:** "Silent Failures." If a technician is misconfigured, inventory is deducted from a phantom location or creates "negative inventory," making the stock levels authoritative only in theory.

---

## 3. ARCHITECTURAL FLAWS

### 🏗️ Race Conditions in Auto-Numbering
*   **The Flaw:** Ticket and GL numbering logic has been patched 3+ times to fix concurrency issues.
*   **The Reality:** The system still attempts to calculate IDs using `MAX(id) + 1` or similar SQL functions instead of native Postgres **SEQUENCES**. 
*   **The Risk:** Duplicate ticket numbers will occur under simultaneous load (multiple technicians creating jobs at once).

### 🏗️ View Stacking (Performance Debt)
*   **The Flaw:** Dashboard views like `vw_active_technicians` are built on top of multiple nested views and joins.
*   **The Impact:** Exponential performance degradation. As the `time_logs` table grows, the dashboard will become unresponsive.

---

## 4. MAINTAINABILITY & DEBT

### 🧹 Migration Fragmentation
*   **The Reality:** 100+ migrations with frequent "Fix of Fix" patterns make the database initialization fragile. 
*   **The Risk:** Setting up new environments (like the MES build) is prone to failure because the "Source of Truth" is scattered across 4 months of delta files.

### 🧹 User Lifecycle Breakdown
*   **The Reality:** The existence of diagnostic views to find "Profiles missing Auth entries" proves that the user creation/deletion workflow is not transactionally atomic.
*   **The Impact:** Dirty data and orphaned records that create Auth errors for new employees.

---

## 🛑 THE "BULLETPROOF" ACTION PLAN

1.  **Harden RLS:** Immediately replace all `CHECK (true)` policies with identity-validated policies.
2.  **Schema Consolidation:** Consolidate `parts_usage` into `ticket_parts_used`.
3.  **Native Sequencing:** Replace all custom auto-numbering functions with `CREATE SEQUENCE`.
4.  **Backend Role Enforcement:** Create a `SECURITY DEFINER` function `auth.check_is_admin()` and use it as the gatekeeper for all administrative database operations.
