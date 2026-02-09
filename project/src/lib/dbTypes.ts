/**
 * Database Type Helpers
 *
 * Re-exports generated Supabase types for use in services.
 * This file provides a clean interface to database types without
 * requiring services to define their own interfaces.
 *
 * Usage:
 *   import { TicketRow, TicketInsert, Tables } from '../lib/dbTypes';
 */

import { Database } from './database.types';

// ============================================================
// Generic Type Helpers
// ============================================================

/** Get the Row type for any table */
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];

/** Get the Insert type for any table */
export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];

/** Get the Update type for any table */
export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];

/** Get the type for any view */
export type Views<T extends keyof Database['public']['Views']> =
  Database['public']['Views'][T]['Row'];

/** Get enum values */
export type Enums<T extends keyof Database['public']['Enums']> =
  Database['public']['Enums'][T];

// ============================================================
// Core Entity Types (commonly used)
// ============================================================

// Tickets
export type TicketRow = Tables<'tickets'>;
export type TicketInsert = TablesInsert<'tickets'>;
export type TicketUpdate = TablesUpdate<'tickets'>;

// Customers
export type CustomerRow = Tables<'customers'>;
export type CustomerInsert = TablesInsert<'customers'>;
export type CustomerUpdate = TablesUpdate<'customers'>;

// Customer Locations
export type CustomerLocationRow = Tables<'customer_locations'>;

// Invoices
export type InvoiceRow = Tables<'invoices'>;
export type InvoiceInsert = TablesInsert<'invoices'>;
export type InvoiceUpdate = TablesUpdate<'invoices'>;

// Invoice Line Items
export type InvoiceLineItemRow = Tables<'invoice_line_items'>;
export type InvoiceLineItemInsert = TablesInsert<'invoice_line_items'>;

// Estimates
export type EstimateRow = Tables<'estimates'>;
export type EstimateInsert = TablesInsert<'estimates'>;
export type EstimateUpdate = TablesUpdate<'estimates'>;

// Estimate Line Items
export type EstimateLineItemRow = Tables<'estimate_line_items'>;

// Projects
export type ProjectRow = Tables<'projects'>;
export type ProjectInsert = TablesInsert<'projects'>;
export type ProjectUpdate = TablesUpdate<'projects'>;

// Parts
export type PartRow = Tables<'parts'>;
export type PartInsert = TablesInsert<'parts'>;
export type PartUpdate = TablesUpdate<'parts'>;

// Part Inventory
export type PartInventoryRow = Tables<'part_inventory'>;

// Vendors
export type VendorRow = Tables<'vendors'>;
export type VendorInsert = TablesInsert<'vendors'>;

// Purchase Orders
export type PurchaseOrderRow = Tables<'purchase_orders'>;
export type PurchaseOrderLineRow = Tables<'purchase_order_lines'>;

// Time Logs
export type TimeLogRow = Tables<'time_logs'>;
export type TimeLogInsert = TablesInsert<'time_logs'>;

// Profiles (Users)
export type ProfileRow = Tables<'profiles'>;

// GL Entries
export type GLEntryRow = Tables<'gl_entries'>;
export type GLEntryInsert = TablesInsert<'gl_entries'>;

// Chart of Accounts
export type ChartOfAccountRow = Tables<'chart_of_accounts'>;

// Bills (AP)
export type BillRow = Tables<'bills'>;
export type BillInsert = TablesInsert<'bills'>;

// ============================================================
// MES-Specific Types
// ============================================================

// Production Orders
export type ProductionOrderRow = Tables<'production_orders'>;
export type ProductionOrderInsert = TablesInsert<'production_orders'>;
export type ProductionOrderUpdate = TablesUpdate<'production_orders'>;

// Production Steps
export type ProductionStepRow = Tables<'production_steps'>;
export type ProductionStepInsert = TablesInsert<'production_steps'>;
export type ProductionStepUpdate = TablesUpdate<'production_steps'>;

// Bill of Materials
export type BOMItemRow = Tables<'bill_of_materials'>;
export type BOMItemInsert = TablesInsert<'bill_of_materials'>;

// Work Centers
export type WorkCenterRow = Tables<'work_centers'>;
export type WorkCenterInsert = TablesInsert<'work_centers'>;
export type WorkCenterUpdate = TablesUpdate<'work_centers'>;

// Material Move Requests
export type MaterialMoveRequestRow = Tables<'material_move_requests'>;
export type MaterialMoveRequestInsert = TablesInsert<'material_move_requests'>;

// Production Time Logs
export type ProductionTimeLogRow = Tables<'production_time_logs'>;
export type ProductionTimeLogInsert = TablesInsert<'production_time_logs'>;

// Production Counts
export type ProductionCountRow = Tables<'production_counts'>;
export type ProductionCountInsert = TablesInsert<'production_counts'>;

// OEE Snapshots
export type OEESnapshotRow = Tables<'oee_snapshots'>;
export type OEESnapshotInsert = TablesInsert<'oee_snapshots'>;

// Equipment Assets
export type EquipmentAssetRow = Tables<'equipment_assets'>;
export type EquipmentAssetInsert = TablesInsert<'equipment_assets'>;
export type EquipmentAssetUpdate = TablesUpdate<'equipment_assets'>;

// Production Operation Runs
export type ProductionOperationRunRow = Tables<'production_operation_runs'>;
export type ProductionOperationRunInsert = TablesInsert<'production_operation_runs'>;

// ============================================================
// Enum Types
// ============================================================

export type InvoiceStatus = Enums<'invoice_status'>;
export type TicketStatus = Enums<'ticket_status'>;
export type TicketPriority = Enums<'ticket_priority'>;
export type StockLocationType = Enums<'stock_location_type'>;
export type ProductionOrderStatus = Enums<'production_order_status_enum'>;
export type OperationRunStatus = Enums<'operation_run_status'>;
export type OEEGrain = Enums<'oee_grain'>;
export type DowntimeCategory = Enums<'downtime_category'>;
export type DowntimeGroup = Enums<'downtime_group'>;
export type EquipmentState = Enums<'equipment_state'>;

// ============================================================
// Utility Types for Service Patterns
// ============================================================

/**
 * Make specific properties required (for when DB allows null but business logic requires value)
 * Usage: RequireFields<TicketRow, 'id' | 'customer_id'>
 */
export type RequireFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

/**
 * Extract non-null version of a type
 * Usage: NonNullableFields<TicketRow, 'completed_date'>
 */
export type NonNullableFields<T, K extends keyof T> = T & {
  [P in K]: NonNullable<T[P]>;
};
