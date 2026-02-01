# CRM Integration Plan: "The Sales Engine"

This document outlines the roadmap to transform IntelliService from an Operations Platform into a Sales & Marketing Engine.

## 1. Schema Extensions (Database)
The goal is to reuse existing tables where possible but distinguish "Sales Data" from "Operational Data."

### A. Leads vs. Customers (The "Prospect" Flag)
Instead of a separate `leads` table (which causes data duplication when they convert), we will add a `status` column to the `customers` table.
- **Modification:** Add `status` enum to `customers` table:
  - `lead`: New prospect, no work history.
  - `active`: Current customer with booked jobs.
  - `churned`: Former customer.
- **Modification:** Add `lead_source` column to `customers` (e.g., "Referral", "Google Ads", "Tech upsell").

### B. The Sales Pipeline (Pipeline Stages)
We need granular tracking of where a deal is.
- **New Table:** `deal_pipelines`
  - `id`: UUID
  - `name`: string (e.g., "Residential Replacements", "Commercial Contracts")
- **New Table:** `deal_stages`
  - `pipeline_id`: UUID
  - `name`: string (e.g., "Site Visit Scheduled", "Proposal Sent")
  - `probability`: integer (0-100%)
- **Modification:** Link `estimates` to `deal_stages`.

### C. Interaction Logging (The 360 View)
- **New Table:** `customer_interactions`
  - `customer_id`: UUID
  - `type`: enum ("call", "email", "sms", "meeting")
  - `direction`: enum ("inbound", "outbound")
  - `notes`: text
  - `created_by`: UUID (User)

---

## 2. UI/UX Modules (Frontend)

### A. The Sales Pipeline Board (Kanban)
*   **Location:** New Menu Item: `Sales > Pipeline`
*   **Design:** A drag-and-drop Kanban board (like Trello).
    *   **Columns:** Defined by `deal_stages`.
    *   **Cards:** Represent `estimates` or `opportunities`.
    *   **Card Data:** Customer Name, Value ($), "Days in Stage" (color-coded for urgency).
*   **Action:** Dragging a card updates its stage and triggers automations.

### B. Lead "Inbox"
*   **Location:** `Sales > Leads`
*   **Design:** A streamlined list view for rapid qualification.
*   **Features:** "Quick Call" button, "Convert to Customer" button.

### C. Campaign Segment Builder
*   **Location:** `Marketing > Segments`
*   **Design:** A query builder allowing users to target specific groups.
    *   *Example:* "Select Customers where `equipment_age` > 10 AND `last_service_date` > 6 months."
    *   **Action:** "Send Email Blast" (via SendGrid/Postmark integration).

---

## 3. Automation & Logic (Edge Functions)

### A. "Stale Estimate" Nurturing
*   **Trigger:** Cron job runs nightly.
*   **Logic:** Find estimates in "Sent" stage > 3 days old with no activity.
*   **Action:** Send automated email: *"Just checking in on the quote for your new AC..."*

### B. The "Tech Upsell" Loop
*   **Trigger:** Technician closes a ticket with resolution "Equipment End of Life".
*   **Action:**
    1.  Automatically create a "Lead" in the "Replacements" Pipeline.
    2.  Notify the Sales Manager: *"Tech John just flagged a system for replacement at 123 Main St."*

---

## 4. Implementation "To Do" List

### Phase 1: Database Foundation
- [ ] Run Migration: Add `status`, `lead_source` to `customers`.
- [ ] Run Migration: Create `deal_pipelines` and `deal_stages` tables.
- [ ] Run Migration: Create `customer_interactions` table.

### Phase 2: The Visuals (React)
- [ ] Component: Build `PipelineBoard` (using `react-beautiful-dnd`).
- [ ] Component: Update `CustomerProfile` to show `InteractionTimeline`.
- [ ] Page: Create `SalesDashboard` (Pipeline + Activity Feed).

### Phase 3: The Brains (Supabase)
- [ ] Function: `auto-nurture-estimates` (Cron job for follow-ups).
- [ ] Trigger: `on_ticket_close_create_opportunity` (The Upsell Loop).
