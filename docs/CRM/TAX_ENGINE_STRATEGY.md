# Scalable Tax Engine Strategy (Tri-State Pilot)

This document outlines the architecture for a data-driven Sales Tax Engine. It is designed to be fully scalable to all 50 states but will initially launch with data restricted to MS, LA, and AL.

## 1. Core Philosophy: Data-Driven Logic
**Rule:** No `IF state = 'MS'` statements in the code.
**Solution:** The application simply queries the database: *"What are the rules for Zip Code 39201?"*

If we expand to Tennessee later, we simply add Tennessee's rules to the database rows. The code remains untouched.

---

## 2. Database Schema Architecture

### A. The "Who" (Tax Authorities)
We need to define who is asking for the money.
*   **Table:** `tax_authorities`
    *   `id`: UUID
    *   `name`: String ("State of MS", "Hinds County", "City of Jackson")
    *   `level`: Enum (State, County, City, Special)
    *   **Tri-State Data:** We will populate this with ~150 rows covering the counties/parishes of MS, LA, and AL.

### B. The "Where" (Geospatial Mapping)
We map locations to authorities.
*   **Table:** `tax_zones` (Zip Code mappings)
    *   `zip_code`: String (PK)
    *   `state_code`: String (MS, LA, AL)
    *   `authorities`: JSONB Array (`['uuid-state-ms', 'uuid-county-hinds', 'uuid-city-jackson']`)
    *   **Strategy:** When an invoice is created, we look up the Customer's Zip. This returns the list of Authorities applicable to that ticket.

### C. The "What" (Taxability Rules)
This is the critical piece. MS taxes labor; others might not.
*   **Table:** `tax_matrix`
    *   `authority_id`: UUID (Link to MS State)
    *   `item_type`: Enum (`labor`, `parts`, `freight`, `subscription`)
    *   `is_taxable`: Boolean
    *   `rate`: Decimal (0.0700)
    *   `cap_amount`: Money (Some taxes stop after $X)

---

## 3. The Calculation Workflow

### Step 1: Zone Resolution
*   **Input:** Job Location Zip Code (e.g., `39201`).
*   **Action:** Query `tax_zones`.
*   **Result:** System identifies 3 Authorities: MS State, Hinds County, Jackson City.

### Step 2: Line Item Evaluation
*   **Input:** Ticket contains:
    1.  Compressor (Part) - $500
    2.  Labor (Service) - $200
*   **Action:** System loops through the 3 Authorities for *each* line item.
    *   *Query:* "Does MS State tax 'Parts'?" -> Yes (7%).
    *   *Query:* "Does MS State tax 'Labor'?" -> Yes (7%).
    *   *Query:* "Does Hinds County tax 'Labor'?" -> Yes (1%).

### Step 3: Ledger Generation
*   **Output:** The system generates a `tax_liability` record:
    *   MS State: $49.00 (7% of $700)
    *   Hinds County: $7.00 (1% of $700)
    *   Jackson City: $7.00 (1% of $700)
    *   **Total Tax:** $63.00

---

## 4. Implementation Plan (Tri-State Scope)

### Phase 1: Structure (The Engine)
1.  Create the 3 tables defined above (`tax_authorities`, `tax_zones`, `tax_matrix`).
2.  Write the "Calculator Function" (Edge Function) that accepts a Zip + Cart and returns the Tax Total.

### Phase 2: Data Population (The Content)
This is where we limit scope to save time.
1.  **Mississippi:** Import all counties/cities. Set `Labor = Taxable` globally for MS authorities.
2.  **Alabama:** Import major counties. Set `Labor = Exempt` (generally) for AL authorities.
3.  **Louisiana:** Import Parishes. Set Parish-specific rates.

### Phase 3: Validation
1.  Create "Test Invoices" for known addresses in Jackson MS, Birmingham AL, and New Orleans LA.
2.  Compare system output against manual tax tables to verify accuracy.

---

## 5. Future Expansion
To add Tennessee:
1.  Insert TN Authorities into `tax_authorities`.
2.  Upload TN Zip Codes to `tax_zones`.
3.  Define TN rules in `tax_matrix`.
**No code changes required.**
