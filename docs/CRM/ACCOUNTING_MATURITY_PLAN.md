# Accounting Maturity Plan: Replacing QuickBooks/Sage

This document outlines the architectural roadmap to upgrade the IntelliService General Ledger from an "Operational" system to a "Compliance-Ready" ERP.

## 1. Safety Nets (Audit & Control)

### A. Accounting Periods & Closing Logic
**Goal:** Prevent modification of historical data that has already been reported to the IRS/Investors.

*   **New Table:** `accounting_periods`
    *   `id`: UUID
    *   `start_date`: Date (e.g., 2025-01-01)
    *   `end_date`: Date (e.g., 2025-01-31)
    *   `status`: Enum (`open`, `closing`, `closed`)
    *   `closed_at`: Timestamp
    *   `closed_by`: User UUID
*   **Logic (Database Trigger):**
    *   `BEFORE INSERT/UPDATE/DELETE` on `gl_entries`:
    *   Check `transaction_date` against `accounting_periods`.
    *   IF status is `closed`, RAISE EXCEPTION "Period is Closed."

### B. Forensic Audit Trail
**Goal:** Traceability of *every* financial change.

*   **New Table:** `gl_audit_log` (Distinct from general activity log)
    *   `gl_entry_id`: UUID
    *   `action`: Enum (`insert`, `update`, `soft_delete`)
    *   `changed_fields`: JSONB (Stores `{ "amount": { "old": 100, "new": 200 } }`)
    *   `reason`: Text (Mandatory for voiding/modifying posted entries)
    *   `user_id`: UUID
    *   `ip_address`: Inet

### C. Immutability (Void vs. Delete)
**Goal:** Enforce standard accounting practices.

*   **Schema Change:** Add `is_voided` (Boolean) and `voided_at` (Timestamp) to `gl_entries`.
*   **Logic:**
    *   Remove `DELETE` permissions on `gl_entries` for *all* roles.
    *   "Voiding" a transaction creates a **Reversing Entry** automatically (e.g., if original was Debit Cash $100, new entry is Credit Cash $100).

---

## 2. Tax & Compliance Layer

### A. Sales Tax Liability Engine
**Goal:** Track tax collected *per jurisdiction* to facilitate remittance.

*   **New Table:** `tax_jurisdictions`
    *   `id`: UUID
    *   `name`: String (e.g., "Travis County", "State of Texas")
    *   `rate`: Decimal
    *   `agency_name`: String
*   **New Table:** `tax_ledger`
    *   `id`: UUID
    *   `invoice_id`: UUID
    *   `jurisdiction_id`: UUID
    *   `taxable_amount`: Money
    *   `tax_collected`: Money
    *   `transaction_date`: Date
*   **Reporting:**
    *   "Sales Tax Liability Report": Sum of `tax_collected` grouped by `jurisdiction_id` for a date range.

### B. 1099 Vendor Tracking
**Goal:** Automate year-end contractor reporting.

*   **Schema Change:** Update `vendors` table.
    *   Add `tax_id_number` (Encrypted text).
    *   Add `is_1099_eligible` (Boolean).
    *   Add `default_1099_box` (Enum: `NEC`, `MISC`).
*   **Reporting:**
    *   "1099 Preparation Report": Sum of `bills` paid to `is_1099_eligible` vendors > $600/year.

---

## 3. Advanced Reporting Architecture

### A. The "CPA View" (Trial Balance)
**Goal:** Prove the mathematical integrity of the books.

*   **View Definition:** `vw_trial_balance`
    *   Aggregate `gl_entries` by `account_id`.
    *   Columns: `account_code`, `account_name`, `beginning_balance`, `debit_activity`, `credit_activity`, `ending_balance`.
    *   Constraint: Sum of `ending_balance` must always equal 0.

### B. Cash vs. Accrual Toggle
**Goal:** Support both management (Accrual) and tax (Cash) reporting.

*   **Challenge:** The current system records Revenue when Invoiced (Accrual).
*   **Solution:**
    *   **Accrual Ledger:** Uses standard `gl_entries` based on `invoice_date`.
    *   **Cash Ledger (Virtual):** A function `get_cash_basis_report()` that:
        *   Ignores Invoices/Bills.
        *   Looks only at `payment_receipts` and `bill_payments`.
        *   Maps those payments back to the Revenue/Expense GL accounts of the original invoice/bill.

---

## 4. Banking Integration (Bank Feeds)

### A. Data Aggregation Architecture
**Goal:** Import transactions without manual entry.

*   **Provider:** Integrate with **Plaid** or **Yodlee** (Industry Standards).
*   **New Table:** `bank_feed_items`
    *   `external_id`: String (from Plaid)
    *   `amount`: Money
    *   `date`: Date
    *   `description`: String
    *   `status`: Enum (`pending`, `matched`, `ignored`)
    *   `matched_gl_entry_id`: UUID

### B. The Matching Algorithm
*   **Logic:**
    *   When a user opens the Reconciliation screen:
    *   System fetches `bank_feed_items` where `status = pending`.
    *   System fuzzy-matches against `gl_entries` (Check for same Date +/- 3 days AND same Amount).
    *   User confirms match -> Updates `bank_reconciliations` status.
