# Database Integrity & Performance Policy (The "Guardrails")

This document defines the strict "Don't Do" rules and optimization standards for the IntelliService platform to prevent technical debt and regressive data corruption.

## 1. Data Integrity "Don't Do's"
- **NO DELETES on Financials:** No `DELETE` command shall ever be executed on `gl_entries`, `invoices`, or `bills`. All errors must be handled via a `void` status and a reversing entry.
- **NO HARD-CODED LOGIC:** No business logic specific to a Client, State, or Part Type should be written in the application code. All such logic must reside in a Database Table (e.g., `tax_matrix`, `accounting_settings`).
- **NO BYPASSING RLS:** Row Level Security (RLS) must be enabled on every table. No service-role bypasses are allowed in the frontend.
- **NO FREE-TEXT ANALYTICS:** Any data intended for the Analytics Pipeline (Problem/Resolution codes) must be selected from a restricted dropdown. Free-text "Notes" are for humans only and are ignored by the "Hunter" logic.

## 2. Regressive Prevention (Safety Nets)
- **The Period Lock:** Before any update to a financial record, the system must verify the `accounting_period` is `open`. If it is `closed` or `locked`, the transaction must be rejected.
- **The Audit Chain:** Any change to a sensitive field (User Role, Password, GL Amount, Tax Rate) must trigger a `gl_audit_log` or `admin_audit_events` entry containing the User, Timestamp, Old Value, and New Value.

## 3. Optimization Standards
- **Index-First Development:** Every foreign key (`_id`) and every column used in a `WHERE` clause or `JOIN` must have an index.
- **Aggregated Views:** Complex reporting (MTBF, Pareto, Trial Balance) must be performed using Database Views or Materialized Views to ensure sub-second response times.
- **Computed Columns:** Calculations like `total_amount` (Subtotal + Tax) should be stored or handled via a generated column to avoid recalculating on every page load.
