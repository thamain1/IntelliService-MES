# Production Rollout & Replication Plan (Monday Go-Live)

This document details the step-by-step execution plan to fork the current IntelliService build into 5 distinct environments:
1.  **Demo/Dev** (Retains Mock Data)
2.  **Dunaway Heating and Cooling** (Production - Payzer Data Import)
3.  **All Signs** (Production - Clean)
4.  **Recovery Hydration** (Production - Clean)
5.  **4wardmotion Solutions** (Internal Admin - Clean)

---

## Phase 1: The "Clean Seed" Preparation
*Objective: Create a database state that has the full Schema and Configuration (Drop-downs, Settings) but ZERO Customers or Tickets.*

1.  **Audit Migrations:**
    *   Review `supabase/migrations`.
    *   Identify the file `20251110220256_seed_initial_data.sql` (or similar). This file likely contains the "Mock Customers."
    *   **Action:** Create a new file `scripts/seed_production_essentials.sql`.
    *   **Content:** Copy *only* the configuration inserts from the original seed file (e.g., `contract_plans`, `tax_jurisdictions`, `accounting_settings`, `parts` if standard).
    *   **Exclude:** All `INSERT INTO customers`, `tickets`, `technicians`, `activity_log`.

---

## Phase 2: Infrastructure Provisioning (The "5 Buckets")
*Objective: Create the isolated containers for each client.*

### Step A: Backend (Supabase)
For **each** of the 4 new clients (Dunaway, All Signs, Recovery, 4wardmotion):
1.  **Create Project:** Create a new Supabase Project (e.g., `is-prod-dunaway`).
2.  **Push Schema:** Run `supabase db push` to apply the structure (Tables, RPCs, Triggers).
3.  **Apply Clean Seed:** Run `psql ... < scripts/seed_production_essentials.sql`.
    *   *Result:* A pristine database ready for business logic.
4.  **Config Auth:** Set up the Admin User (Invite the owner via email).

### Step B: Frontend (Cloudflare Pages)
For **each** of the 4 new clients:
1.  **Create Project:** Create a new Cloudflare Pages project (e.g., `dunaway-hvac`).
2.  **Environment Variables:** Inject the *specific* Supabase keys for that client:
    *   `VITE_SUPABASE_URL`: [Client Specific URL]
    *   `VITE_SUPABASE_ANON_KEY`: [Client Specific Key]
3.  **Deploy:** Trigger the build.
    *   *Result:* 4 separate URLs, each looking at its own private database.

---

## Phase 3: The "Dunaway" Migration (Priority: Monday Go-Live)
*Objective: Migrate legacy Payzer data into the Dunaway Production environment.*

### 1. Data Cleaning & Mapping
*   **Source:** `payzer_customers_geocoded_final_v2.csv` (Located in root).
*   **Target:** Supabase `customers` and `customer_locations` tables.
*   **Action:**
    *   Verify column mapping: `Payzer Name` -> `customers.name`, `Payzer Address` -> `customer_locations.address`.
    *   Ensure Geocodes (Lat/Long) are valid (Payzer CSV suggests they are already done).

### 2. Execution (The Import)
*   **Tool:** Use a Python script (or Supabase Table Editor for smaller sets) to load the CSV.
*   **Sequence:**
    1.  **Customers:** Import the companies/people.
    2.  **Locations:** Import the addresses (linked to Customer ID).
    3.  **Equipment (If available):** Import installed units (ACs, Furnaces).
    4.  **History (Optional for Monday):** Import past ticket summaries as "Notes" if full history is too complex for 48 hours.

### 3. Verification
*   **Sanity Check:** Log in to `dunaway-hvac.pages.dev`.
*   **Search Test:** Search for a known customer. Verify address and map pin appear.
*   **Workflow Test:** Create a test ticket for that customer. Dispatch it. Invoice it.
*   **Cleanup:** Delete the test ticket.

---

## Phase 4: The "Clean Clones" (All Signs, Recovery, 4wardmotion)
*Objective: Stand up the empty environments.*

1.  **Repeat Phase 2:** Ensure Supabase and Cloudflare are linked.
2.  **User Setup:** Manually create the "Owner" account for each organization.
3.  **Settings Config:**
    *   *All Signs:* Configure specific `contract_plans` or `tax_rates` relevant to their industry.
    *   *Recovery Hydration:* Configure `accounting_settings` if they have unique GL needs.
4.  **Handover:** Send login credentials to the respective stakeholders.

---

## Phase 5: The "Demo" System
*Objective: Preserve the current state for sales/demos.*

1.  **No Action Required on DB:** The current `IntelliServiceBeta` Supabase project becomes the "Demo" instance.
2.  **Rename Frontend:** Rename the current Cloudflare project to `intelliservice-demo` to avoid confusion.
3.  **Data Policy:** This environment allows "Mock Data" and aggressive testing. It is the *only* environment where `seed_initial_data.sql` (the messy one) is allowed.

---

## Summary Checklist for Monday Morning
- [ ] **Dunaway DB:** Schema Pushed + Clean Seed + Payzer Data Imported.
- [ ] **Dunaway App:** Deployed to Cloudflare with correct ENV keys.
- [ ] **Dunaway Admin:** Owner account created and tested.
- [ ] **Clean Builds:** All Signs, Recovery, and 4wardmotion URLs active (even if empty).
- [ ] **DNS:** Domains (e.g., `app.dunawayhvac.com`) pointed to Cloudflare.
