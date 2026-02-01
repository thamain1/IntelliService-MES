# IntelliService - Project Context for Claude

## Overview
IntelliService is a field service management application for HVAC companies. It handles dispatching, ticketing, inventory management, invoicing, and business intelligence reporting.

## Tech Stack
- **Frontend**: React + TypeScript + Vite
- **Styling**: Tailwind CSS
- **Database**: Supabase (PostgreSQL)
- **Auth**: Supabase Auth
- **Hosting**: Cloudflare Pages
- **Repository**: https://github.com/thamain1/IntelliServiceBeta

## Project Structure
```
project/
├── src/
│   ├── components/          # React components by feature
│   │   ├── Accounting/      # GL, reconciliation, invoices
│   │   ├── BI/              # Business intelligence reports
│   │   ├── Parts/           # Inventory, vendors, POs, reorder alerts
│   │   ├── Scheduling/      # Dispatch board, calendar
│   │   ├── Tickets/         # Service tickets
│   │   └── ...
│   ├── services/            # Business logic services
│   ├── hooks/               # Custom React hooks
│   ├── lib/                 # Supabase client, database types
│   └── types/               # TypeScript types
├── supabase/
│   └── migrations/          # SQL migrations (run manually in Supabase)
└── dist/                    # Build output (deployed to Cloudflare)
```

## Database
- **109 tables** in Supabase PostgreSQL
- Types generated via: `npx supabase gen types typescript --project-id uuarbdrzfakvlhlrnwgc`
- Types file: `src/lib/database.types.ts`
- Migrations are in `supabase/migrations/` but must be run manually in Supabase SQL Editor

## Key Modules

### Parts & Inventory (JIT/Kanban)
- **Tables**: `parts`, `part_inventory`, `stock_locations`, `inventory_reorder_policies`, `vendor_part_mappings`
- **View**: `vw_reorder_alerts` - calculates reorder points, reserved qty, avg daily usage
- **Functions**: `fn_create_po_from_alert()`, `fn_generate_reorder_pos()`
- **Location Types**: `warehouse`, `truck`, `project_site`, `customer_site`, `vendor`
- **Truck Filtering**: Trucks only show parts with explicit reorder policy AND min_qty > 0

### Purchase Orders
- **Tables**: `purchase_orders`, `purchase_order_lines`
- **Statuses**: draft, submitted, approved, partial, received, cancelled

### Vendors
- **Tables**: `vendors`, `vendor_part_mappings`, `vendor_contacts`
- `vendor_part_mappings.is_preferred_vendor` determines which vendor appears in reorder alerts

### Tickets
- **Tables**: `tickets`, `ticket_parts_planned`, `ticket_parts_used`
- Reserved inventory calculated from `ticket_parts_planned` for active tickets

### Time Tracking
- **Table**: `time_logs`
- RLS policy allows admins to view all time logs (needed for BI reports)

### Invoicing
- **Table**: `invoices`
- **Statuses**: draft, sent, paid, overdue, cancelled, partially_paid, written_off (NOT 'void')

### BI Reports
- Located in `src/components/BI/`
- Use `useBIDateRange` hook for date filtering
- Reports: Financials, Technician Metrics, Project Margins, DSO, Labor Efficiency, Revenue Trends, Customer Value

## User Roles
- `admin` - Full access, can view all data
- `dispatcher` - Scheduling and dispatch
- `technician` - Field work, limited access

## Important Patterns

### RLS (Row Level Security)
- Most tables have RLS enabled
- Admins typically have full access
- Technicians often restricted to their own data
- Check RLS policies when data isn't appearing

### Views
- Complex reporting uses PostgreSQL views (e.g., `vw_reorder_alerts`, `vw_ap_aging`)
- Views must be recreated to modify (DROP VIEW + CREATE VIEW)

### Enums
- `stock_location_type`: warehouse, truck, project_site, customer_site, vendor
- `invoice_status`: draft, sent, paid, overdue, cancelled, partially_paid, written_off

## Deployment
1. Code pushed to GitHub `master` branch
2. Cloudflare Pages auto-deploys from GitHub
3. Database migrations run manually in Supabase SQL Editor

## Common Issues & Fixes

### "void" is not a valid invoice status
Use `cancelled` instead. Valid statuses in `invoice_status` enum don't include 'void'.

### BI reports showing limited data
Check RLS policies. Admins need policies that allow viewing all records.

### Trucks showing all parts in reorder alerts
The view was fixed to only show truck parts that have explicit `inventory_reorder_policies` with `min_qty > 0`.

### EXTRACT(DAY FROM date_diff) error
PostgreSQL date subtraction already returns integer days. Don't use EXTRACT on the result.

## Recent Changes (Jan 2026)
1. Fixed RLS policy for `time_logs` - admins can now view all staff time logs
2. Fixed JIT/Kanban inventory view with proper reserved qty, daily usage, reorder point calculations
3. Added `fn_create_po_from_alert()` and `fn_generate_reorder_pos()` functions
4. Added Edit Part functionality with preferred vendor assignment
5. Fixed truck filtering in `vw_reorder_alerts`
6. Added escalation support contact (Jesse Morgan) to Help Center
7. Technician workflow improvements:
   - Clock-in required before starting work on tickets (with popup alert)
   - "Get Directions" button opens native maps app for customer location
   - Ticket completion success modal with clear feedback
   - Completed tickets show "Ticket Completed" indicator instead of Quick Actions
8. Parts workflow improvements:
   - "Add Part" modal only shows parts from technician's truck inventory (no fallback to all parts)
   - "No Parts on Truck" message with link to request parts
   - New "Need Parts" modal with proper form (part selection from full catalog, quantity, urgency)
   - Ticket goes on hold when parts are requested

## Technician Ticket Workflow
- **Clock-in required**: Technicians must clock in via Time Clock before starting work
- **Add Part (used)**: Shows ONLY parts from truck inventory (`vw_technician_truck_inventory`)
- **Need Parts**: Opens modal to request parts from full catalog, puts ticket on hold
- **Mark Complete**: Stops timer, shows success modal, navigates back to ticket list
- **Get Directions**: Opens Google Maps with customer address

## Parts Management
- **Track by Serial Number**: Enable for parts requiring individual serial number tracking
- **Requires Registration**: Enable for parts requiring warranty registration with manufacturer
  - When checked, must provide Registration URL
  - Stored in `parts.requires_registration` and `parts.registration_url` columns
