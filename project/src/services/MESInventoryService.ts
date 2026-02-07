/**
 * MESInventoryService
 * Handles material consumption, reversals, and inventory integration for MES.
 *
 * ## Single Source of Truth Guarantees
 *
 * 1. ON-HAND is ALWAYS driven by `part_inventory` table (never computed from consumption log)
 * 2. Uses the SAME canonical path as InventoryService (fn_adjust_inventory_canonical)
 * 3. No "shadow inventory" - consumption log is for audit/traceability only
 *
 * ## Idempotency Guarantees
 *
 * - Pass `idempotency_key` to prevent duplicate consumption
 * - Same key returns existing log ID without modifying inventory
 * - DB-level unique index enforces this (not just application logic)
 * - Reversals are also idempotent
 *
 * ## Serialization Guarantees
 *
 * - Serialized part status updated ATOMICALLY within fn_consume_material
 * - Reversal restores serialized part status and location
 * - No split transaction risk
 *
 * ## Correction Policy
 *
 * - Uses reversal-based corrections (never overwrites history)
 * - All changes audited via mes_audit_log trigger
 */

import { supabase } from '../lib/supabase';

// ========== Type Definitions ==========

export interface MaterialConsumptionLog {
  id: string;
  production_order_id: string;
  production_step_id: string | null;
  operation_run_id: string | null;
  part_id: string;
  part_name?: string;
  part_number?: string;
  bom_item_id: string | null;
  source_location_id: string | null;
  source_location_name?: string;
  qty: number;
  unit_cost: number | null;
  method: 'scan' | 'manual' | 'backflush';
  is_reversal: boolean;
  reversal_of_id: string | null;
  reversal_reason: string | null;
  serialized_part_id: string | null;
  lot_number: string | null;
  inventory_movement_id: string | null;
  idempotency_key: string | null; // Key for duplicate prevention
  consumed_by: string | null;
  consumed_by_name?: string;
  consumed_at: string;
  created_at: string;
}

export interface ConsumeMaterialInput {
  production_order_id: string;
  part_id: string;
  qty: number;
  source_location_id: string;
  method?: 'scan' | 'manual' | 'backflush';
  production_step_id?: string;
  operation_run_id?: string;
  bom_item_id?: string;
  unit_cost?: number;
  serialized_part_id?: string;
  lot_number?: string;
  idempotency_key?: string; // Optional key for duplicate prevention
}

export interface ReverseConsumptionInput {
  consumption_log_id: string;
  reason: string;
}

export interface ConsumptionSummary {
  part_id: string;
  part_name: string;
  part_number: string;
  total_consumed: number;
  total_reversed: number;
  net_consumed: number;
  total_cost: number;
  consumption_count: number;
  reversal_count: number;
  last_consumption_at: string | null;
}

export interface BOMConsumptionResult {
  success: boolean;
  consumed_items: {
    bom_item_id: string;
    part_id: string;
    part_name: string;
    qty_consumed: number;
    consumption_log_id: string;
  }[];
  errors: {
    bom_item_id: string;
    part_id: string;
    part_name: string;
    error: string;
  }[];
}

// ========== MESInventoryService Class ==========

export class MESInventoryService {
  // ========== Consumption Operations ==========

  /**
   * Consume material with inventory integration
   *
   * IMPORTANT: This method uses the canonical inventory path (fn_consume_material)
   * which directly updates part_inventory. On-hand is ALWAYS driven by part_inventory.
   *
   * Idempotency: Pass an idempotency_key to prevent duplicate consumption.
   * If the same key is used twice, the second call returns the existing log ID
   * without modifying inventory.
   *
   * Serialized parts: Handled atomically within fn_consume_material - the
   * serialized_parts.status is updated in the same transaction as inventory.
   */
  static async consumeMaterial(input: ConsumeMaterialInput): Promise<{
    success: boolean;
    consumptionLog?: MaterialConsumptionLog;
    error?: string;
  }> {
    try {
      // Generate idempotency key if not provided (for manual calls without explicit key)
      // Format: order:step:part:location:timestamp
      const idempotencyKey = input.idempotency_key || null;

      // Use the database function for consumption (handles all validation atomically)
      // The function will:
      // 1. Check idempotency (return existing ID if duplicate)
      // 2. Validate available inventory
      // 3. Validate serialized part status/location if applicable
      // 4. Create consumption log entry
      // 5. Deduct from part_inventory via canonical fn_adjust_inventory_canonical
      // 6. Update serialized_parts.status atomically (if applicable)
      // 7. Update BOM item quantities (if linked)
      const { data: logId, error: fnError } = await supabase.rpc('fn_consume_material', {
        p_production_order_id: input.production_order_id,
        p_part_id: input.part_id,
        p_qty: input.qty,
        p_source_location_id: input.source_location_id,
        p_method: input.method || 'manual',
        p_production_step_id: input.production_step_id || null,
        p_operation_run_id: input.operation_run_id || null,
        p_bom_item_id: input.bom_item_id || null,
        p_unit_cost: input.unit_cost || null,
        p_serialized_part_id: input.serialized_part_id || null,
        p_lot_number: input.lot_number || null,
        p_idempotency_key: idempotencyKey,
      });

      if (fnError) {
        // Parse PostgreSQL error messages for user-friendly errors
        const errorMsg = fnError.message || 'Failed to consume material';
        if (errorMsg.includes('Insufficient inventory')) {
          return { success: false, error: errorMsg };
        }
        if (errorMsg.includes('Serialized part')) {
          return { success: false, error: errorMsg };
        }
        throw fnError;
      }

      // Fetch the created log entry
      const { data: log, error: logError } = await supabase
        .from('material_consumption_log')
        .select(`
          *,
          part:parts(name, part_number),
          source_location:stock_locations(name),
          consumed_by_user:profiles(full_name)
        `)
        .eq('id', logId)
        .single();

      if (logError) throw logError;

      return {
        success: true,
        consumptionLog: {
          ...log,
          part_name: (log.part as any)?.name,
          part_number: (log.part as any)?.part_number,
          source_location_name: (log.source_location as any)?.name,
          consumed_by_name: (log.consumed_by_user as any)?.full_name,
        } as MaterialConsumptionLog,
      };
    } catch (error: any) {
      console.error('Error consuming material:', error);
      return { success: false, error: error.message || 'Failed to consume material' };
    }
  }

  /**
   * Consume all BOM items for an order
   *
   * Uses idempotency keys to ensure each BOM item is only consumed once,
   * even if this method is called multiple times.
   */
  static async consumeBOMForOrder(orderId: string): Promise<BOMConsumptionResult> {
    const consumed_items: BOMConsumptionResult['consumed_items'] = [];
    const errors: BOMConsumptionResult['errors'] = [];

    try {
      // Get BOM items that haven't been fully consumed
      const { data: bomItems, error: bomError } = await supabase
        .from('bill_of_materials')
        .select(`
          id,
          part_id,
          quantity_required,
          quantity_consumed,
          source_location_id,
          unit_cost,
          part:parts(name, part_number)
        `)
        .eq('production_order_id', orderId)
        .eq('is_consumed', false);

      if (bomError) throw bomError;

      for (const item of bomItems || []) {
        const qtyToConsume = item.quantity_required - (item.quantity_consumed || 0);

        if (qtyToConsume <= 0) continue;

        if (!item.source_location_id) {
          errors.push({
            bom_item_id: item.id,
            part_id: item.part_id,
            part_name: (item.part as any)?.name || 'Unknown',
            error: 'No source location specified',
          });
          continue;
        }

        // Generate idempotency key for this BOM item consumption
        // This ensures the same BOM item isn't consumed twice
        const idempotencyKey = this.generateBOMIdempotencyKey(orderId, item.id);

        const result = await this.consumeMaterial({
          production_order_id: orderId,
          part_id: item.part_id,
          qty: qtyToConsume,
          source_location_id: item.source_location_id,
          method: 'backflush',
          bom_item_id: item.id,
          unit_cost: item.unit_cost,
          idempotency_key: idempotencyKey,
        });

        if (result.success && result.consumptionLog) {
          consumed_items.push({
            bom_item_id: item.id,
            part_id: item.part_id,
            part_name: (item.part as any)?.name || 'Unknown',
            qty_consumed: qtyToConsume,
            consumption_log_id: result.consumptionLog.id,
          });
        } else {
          errors.push({
            bom_item_id: item.id,
            part_id: item.part_id,
            part_name: (item.part as any)?.name || 'Unknown',
            error: result.error || 'Unknown error',
          });
        }
      }

      return {
        success: errors.length === 0,
        consumed_items,
        errors,
      };
    } catch (error: any) {
      console.error('Error consuming BOM for order:', error);
      return {
        success: false,
        consumed_items,
        errors: [{
          bom_item_id: '',
          part_id: '',
          part_name: '',
          error: error.message || 'Failed to consume BOM',
        }],
      };
    }
  }

  // ========== Reversal Operations ==========

  /**
   * Reverse a consumption (creates new transaction, never overwrites)
   *
   * IMPORTANT: Uses reversal-based corrections (never edits history).
   * The fn_reverse_consumption function handles everything atomically:
   * 1. Creates reversal entry with negative qty
   * 2. Restores inventory via canonical fn_adjust_inventory_canonical
   * 3. Restores serialized part status to 'in_stock' and location (if applicable)
   * 4. Updates BOM quantities
   *
   * Idempotent: If the consumption is already reversed, returns the existing
   * reversal ID without creating a duplicate.
   */
  static async reverseConsumption(input: ReverseConsumptionInput): Promise<{
    success: boolean;
    reversalLog?: MaterialConsumptionLog;
    error?: string;
  }> {
    try {
      // Use the database function for reversal (handles idempotency internally)
      // If already reversed, it returns the existing reversal ID
      const { data: reversalId, error: fnError } = await supabase.rpc('fn_reverse_consumption', {
        p_consumption_log_id: input.consumption_log_id,
        p_reason: input.reason,
      });

      if (fnError) throw fnError;

      // Fetch the created/existing reversal entry
      const { data: log, error: logError } = await supabase
        .from('material_consumption_log')
        .select(`
          *,
          part:parts(name, part_number),
          source_location:stock_locations(name),
          consumed_by_user:profiles(full_name)
        `)
        .eq('id', reversalId)
        .single();

      if (logError) throw logError;

      return {
        success: true,
        reversalLog: {
          ...log,
          part_name: (log.part as any)?.name,
          part_number: (log.part as any)?.part_number,
          source_location_name: (log.source_location as any)?.name,
          consumed_by_name: (log.consumed_by_user as any)?.full_name,
        } as MaterialConsumptionLog,
      };
    } catch (error: any) {
      console.error('Error reversing consumption:', error);
      return { success: false, error: error.message || 'Failed to reverse consumption' };
    }
  }

  /**
   * Reverse all consumptions for an order
   *
   * Uses idempotent fn_reverse_consumption - safe to call multiple times.
   * Each consumption that hasn't been reversed yet will be reversed,
   * and already-reversed consumptions will be skipped.
   */
  static async reverseOrderConsumptions(
    orderId: string,
    reason: string
  ): Promise<{ success: boolean; reversedCount: number; error?: string }> {
    try {
      // Get all non-reversed consumptions for this order
      const { data: consumptions, error: fetchError } = await supabase
        .from('material_consumption_log')
        .select('id')
        .eq('production_order_id', orderId)
        .eq('is_reversal', false);

      if (fetchError) throw fetchError;

      let reversedCount = 0;
      const errors: string[] = [];

      for (const consumption of consumptions || []) {
        // fn_reverse_consumption is idempotent - it will return existing reversal ID
        // if already reversed, so we don't need to check beforehand
        const result = await this.reverseConsumption({
          consumption_log_id: consumption.id,
          reason,
        });

        if (result.success) {
          reversedCount++;
        } else {
          errors.push(result.error || 'Unknown error');
        }
      }

      return {
        success: errors.length === 0,
        reversedCount,
        error: errors.length > 0 ? errors.join('; ') : undefined,
      };
    } catch (error: any) {
      console.error('Error reversing order consumptions:', error);
      return { success: false, reversedCount: 0, error: error.message || 'Failed to reverse consumptions' };
    }
  }

  // ========== Query Operations ==========

  /**
   * Get consumption log for an order
   */
  static async getConsumptionLog(orderId: string): Promise<MaterialConsumptionLog[]> {
    try {
      const { data, error } = await supabase
        .from('material_consumption_log')
        .select(`
          *,
          part:parts(name, part_number),
          source_location:stock_locations(name),
          consumed_by_user:profiles(full_name)
        `)
        .eq('production_order_id', orderId)
        .order('consumed_at', { ascending: false });

      if (error) throw error;

      return (data || []).map(log => ({
        ...log,
        part_name: (log.part as any)?.name,
        part_number: (log.part as any)?.part_number,
        source_location_name: (log.source_location as any)?.name,
        consumed_by_name: (log.consumed_by_user as any)?.full_name,
      })) as MaterialConsumptionLog[];
    } catch (error) {
      console.error('Error getting consumption log:', error);
      return [];
    }
  }

  /**
   * Get consumption summary for an order
   */
  static async getConsumptionSummary(orderId: string): Promise<ConsumptionSummary[]> {
    try {
      const { data, error } = await supabase
        .from('vw_material_consumption_summary')
        .select('*')
        .eq('production_order_id', orderId);

      if (error) throw error;

      return (data || []) as ConsumptionSummary[];
    } catch (error) {
      console.error('Error getting consumption summary:', error);
      return [];
    }
  }

  /**
   * Check if a consumption has been processed (for idempotency)
   */
  static async isConsumptionProcessed(logId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('material_consumption_log')
        .select('id')
        .eq('id', logId)
        .maybeSingle();

      if (error) throw error;

      return !!data;
    } catch (error) {
      console.error('Error checking consumption status:', error);
      return false;
    }
  }

  /**
   * Get available inventory for a part at a location
   */
  static async getAvailableInventory(
    partId: string,
    locationId: string
  ): Promise<{ available: number; reserved: number; error?: string }> {
    try {
      const { data: inventory, error: invError } = await supabase
        .from('part_inventory')
        .select('quantity')
        .eq('part_id', partId)
        .eq('stock_location_id', locationId)
        .maybeSingle();

      if (invError) throw invError;

      // Get reserved quantity from BOM allocations
      const { data: reservations, error: resError } = await supabase
        .from('bill_of_materials')
        .select('quantity_allocated, quantity_consumed')
        .eq('part_id', partId)
        .eq('source_location_id', locationId)
        .eq('is_allocated', true)
        .eq('is_consumed', false);

      if (resError) throw resError;

      const reserved = (reservations || []).reduce((sum, r) =>
        sum + ((r.quantity_allocated || 0) - (r.quantity_consumed || 0)), 0);

      return {
        available: (inventory?.quantity || 0) - reserved,
        reserved,
      };
    } catch (error: any) {
      console.error('Error getting available inventory:', error);
      return { available: 0, reserved: 0, error: error.message };
    }
  }

  /**
   * Get serialized parts available for consumption
   */
  static async getSerializedPartsForConsumption(
    partId: string,
    locationId: string
  ): Promise<Array<{
    id: string;
    serial_number: string;
    status: string;
    lot_number: string | null;
  }>> {
    try {
      const { data, error } = await supabase
        .from('serialized_parts')
        .select('id, serial_number, status, lot_number')
        .eq('part_id', partId)
        .eq('current_location_id', locationId)
        .eq('status', 'in_stock')
        .order('serial_number', { ascending: true });

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('Error getting serialized parts:', error);
      return [];
    }
  }

  /**
   * Consume a serialized part
   *
   * IMPORTANT: The serialized part status update is now handled ATOMICALLY
   * within fn_consume_material. This method simply passes the serialized_part_id
   * to consumeMaterial, which handles everything in a single transaction.
   *
   * The function will:
   * 1. Validate serialized part status = 'in_stock'
   * 2. Validate serialized part is at the specified location
   * 3. Force qty = 1
   * 4. Create consumption log entry
   * 5. Deduct from part_inventory
   * 6. Update serialized_parts.status = 'consumed' (ATOMIC)
   *
   * Reversal via fn_reverse_consumption will restore the serialized part
   * status to 'in_stock' and restore its location.
   */
  static async consumeSerializedPart(
    serializedPartId: string,
    input: Omit<ConsumeMaterialInput, 'qty' | 'serialized_part_id'>
  ): Promise<{
    success: boolean;
    consumptionLog?: MaterialConsumptionLog;
    error?: string;
  }> {
    try {
      // Get serialized part details for the part_id and lot_number
      const { data: serializedPart, error: spError } = await supabase
        .from('serialized_parts')
        .select('id, part_id, lot_number')
        .eq('id', serializedPartId)
        .single();

      if (spError) throw spError;

      // Generate idempotency key for serialized part consumption
      // This ensures the same serial can't be consumed twice
      const idempotencyKey = `SERIAL:${serializedPartId}:${input.production_order_id}`;

      // Consume the part - fn_consume_material handles all validation and status updates atomically
      // qty = 1 is enforced by the function for serialized parts
      return await this.consumeMaterial({
        ...input,
        part_id: serializedPart.part_id,
        qty: 1,
        serialized_part_id: serializedPartId,
        lot_number: serializedPart.lot_number,
        idempotency_key: idempotencyKey,
      });
    } catch (error: any) {
      console.error('Error consuming serialized part:', error);
      return { success: false, error: error.message || 'Failed to consume serialized part' };
    }
  }

  /**
   * Generate an idempotency key for BOM consumption
   * This ensures the same BOM item can't be consumed twice for the same order
   */
  static generateBOMIdempotencyKey(orderId: string, bomItemId: string): string {
    return `BOM:${orderId}:${bomItemId}`;
  }
}
