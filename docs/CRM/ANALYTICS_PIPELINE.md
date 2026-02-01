# Analytics Pipeline Strategy: Operational Intelligence & Root Cause

This document defines the logic flows that process "Problem Codes" and "Resolution Codes" to automate operational decisions and drive root cause analysis.

**Phase 1 Goal:** Implement high-value analytics and reporting *within the FSM context*, laying the groundwork for future CRM integration.

---

## 1. The Data Foundation (Standardization)
To enable analytics, we must standardize the input.
*   **Table:** `standard_codes`
    *   `code`: String (PK) (e.g., "NO-COOL-COMPRESSOR")
    *   `type`: Enum (`problem`, `resolution`)
    *   `category`: Enum (`electrical`, `airflow`, `refrigerant`, `usage`)
    *   `severity`: Int (1-10)

---

## 2. Root Cause & Pareto Reporting Architecture
These views aggregate the raw data to power the "Strategic Intelligence" dashboards.

### A. Pareto Analysis (The "80/20" Rule)
*   **Logic:** Aggregates `problem_code` frequency to identify the "Vital Few" issues causing the most volume.
*   **View Definition:** `vw_problem_pareto`
    *   Select `problem_code`, Count(*), Sum(`total_ticket_cost`)
    *   Calculate `cumulative_percentage`
    *   **Insight:** "20% of our failures (Capacitors) are causing 80% of our truck rolls."

### B. Root Cause / Rework Analysis (The "Lemon Detector")
*   **Logic:** Identifies when a "Resolution" fails to solve a "Problem" permanently.
*   **View Definition:** `vw_rework_analysis`
    *   Find Tickets where `customer_id` and `equipment_id` are same.
    *   AND `created_at` is within 30 days of previous ticket.
    *   **Output:** `technician_id`, `initial_resolution_code`, `callback_problem_code`.
    *   **Insight:** "Tech Mike fixed a 'Noise' issue (Resolution: Tightened Panel), but the unit failed 2 days later with 'Compressor Failure'. Root cause was likely internal compressor damage, not a loose panel."

### C. MTBF (Mean Time Between Failures)
*   **Logic:** Calculates the average lifespan of repairs for specific equipment models.
*   **View Definition:** `vw_equipment_reliability`
    *   Group by `equipment_model`.
    *   Avg days between `ticket_created_at` dates.
    *   **Insight:** "Carrier Infinity models are averaging 4 years between failures, while Trane XR models are averaging 6 years."

---

## 3. Operational Trigger Pipelines
These automations run immediately upon ticket completion.

### Pipeline A: The "Temporary Fix" Alert (Quality Control)
**Goal:** Catch "Band-aid" repairs before they turn into customer anger.
*   **Trigger:** Ticket Closed with `Resolution Code` = `RES-TEMP-FIX` (e.g., "Added gas but didn't find leak").
*   **Action:**
    1.  Update Ticket Status to `Job Complete - Urgent Review`.
    2.  Create `activity_log` entry: *"System Flag: Temporary Repair Detected."*
    3.  (Future CRM Hook): *Would eventually trigger sales follow-up.*

### Pipeline B: The "Inventory Velocity" Trigger
**Goal:** Prevent stockouts on high-moving parts.
*   **Trigger:** `Resolution Code` in (`RES-CAPACITOR`, `RES-CONTACTOR`).
*   **Action:**
    1.  Check `vw_technician_truck_inventory` for the specific tech.
    2.  If stock < 2, create `inventory_transfer_request` (Restock Request) automatically.

### Pipeline C: The "Sales Opportunity" Tagger (Pre-CRM)
**Goal:** Identify sales potential without a full CRM.
*   **Trigger:** `Problem Code` = `HIGH-BILLS` OR `Equipment Age` > 12 Years.
*   **Action:**
    1.  Add a generic tag/flag to the Customer Profile: `PROSPECT_REPLACEMENT`.
    2.  This allows Dispatchers to see *"This customer needs a new unit"* directly on the Dispatch Board next time they call.

---

## 4. Implementation Requirements

### A. Database
- [ ] Create `standard_codes` table.
- [ ] Create Views: `vw_problem_pareto`, `vw_rework_analysis`, `vw_equipment_reliability`.

### B. UI/UX
- [ ] **Mobile:** Enforce "Code Selection" on Ticket Close.
- [ ] **Dashboard:** Add "Top 5 Recurring Problems" widget (Pareto View).
- [ ] **Customer Profile:** Display "Reliability Score" (calculated from MTBF).