/**
 * ManufacturingService
 * Handles all MES (Manufacturing Execution System) operations including
 * production orders, work centers, BOM, time tracking, and material handling.
 */

import { supabase } from '../lib/supabase';
import type { Database } from '../lib/database.types';
import { MESInventoryService } from './MESInventoryService';

// ========== Type Definitions ==========

type ProductionOrderRow = Database['public']['Tables']['production_orders']['Row'];
type ProductionStepRow = Database['public']['Tables']['production_steps']['Row'];
type BOMItemRow = Database['public']['Tables']['bill_of_materials']['Row'];
type WorkCenterRow = Database['public']['Tables']['work_centers']['Row'];
type MaterialMoveRequestRow = Database['public']['Tables']['material_move_requests']['Row'];
type TimeLogRow = Database['public']['Tables']['production_time_logs']['Row'];
type _WIPTrackingRow = Database['public']['Tables']['wip_tracking']['Row'];

export interface ProductionOrder extends ProductionOrderRow {
  customer?: { id: string; name: string } | null;
  assigned_user?: { id: string; full_name: string } | null;
  ticket?: { id: string; ticket_number: string } | null;
  project?: { id: string; name: string } | null;
}

export interface ProductionStep extends ProductionStepRow {
  work_center?: { id: string; name: string; code: string } | null;
  completed_by_user?: { id: string; full_name: string } | null;
}

export interface BOMItem extends BOMItemRow {
  part?: { id: string; name: string; part_number: string } | null;
  source_location?: { id: string; name: string } | null;
}

export interface WorkCenter extends WorkCenterRow {
  default_technician?: { id: string; full_name: string } | null;
}

export interface MaterialMoveRequest extends MaterialMoveRequestRow {
  order?: { id: string; order_number: string } | null;
  from_location?: { id: string; name: string } | null;
  to_work_center?: { id: string; name: string; code: string } | null;
  to_location?: { id: string; name: string } | null;
  item?: { id: string; name: string; part_number: string } | null;
  requested_by_user?: { id: string; full_name: string } | null;
  assigned_to_user?: { id: string; full_name: string } | null;
}

export interface ProductionDashboardItem {
  id: string;
  order_number: string;
  title: string;
  description: string | null;
  status: string;
  priority: number | null;
  ticket_id: string | null;
  ticket_number: string | null;
  project_id: string | null;
  project_name: string | null;
  customer_id: string | null;
  customer_name: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  quantity_ordered: number | null;
  quantity_completed: number | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  hold_reason: string | null;
  created_at: string | null;
  updated_at: string | null;
  total_steps: number | null;
  completed_steps: number | null;
  current_work_center_id: string | null;
  current_work_center_name: string | null;
  last_move_at: string | null;
}

export interface CreateProductionOrderInput {
  title: string;
  description?: string;
  priority?: number;
  ticket_id?: string;
  project_id?: string;
  customer_id?: string;
  scheduled_start?: string;
  scheduled_end?: string;
  quantity_ordered?: number;
  assigned_to?: string;
}

export interface CreateProductionStepInput {
  name: string;
  description?: string;
  work_center_id?: string;
  estimated_minutes?: number;
}

export interface CreateBOMItemInput {
  part_id: string;
  quantity_required: number;
  source_location_id?: string;
  unit_cost?: number;
  notes?: string;
}

export interface CreateMaterialMoveInput {
  production_order_id?: string;
  from_location_id?: string;
  to_work_center_id?: string;
  to_location_id?: string;
  item_id?: string;
  quantity: number;
  priority?: number;
  notes?: string;
}

export interface ProductionStats {
  total: number;
  byStatus: {
    queued: number;
    in_progress: number;
    hold: number;
    complete: number;
  };
  todayCompleted: number;
  avgCycleTimeHours: number | null;
}

export interface DashboardFilters {
  status?: string;
  priority?: number;
  customerId?: string;
  assignedTo?: string;
  search?: string;
}

export interface MoveQueueFilters {
  status?: string;
  assignedTo?: string;
  workCenterId?: string;
}

// ========== ManufacturingService Class ==========

export class ManufacturingService {
  // ========== Dashboard & Stats ==========

  /**
   * Get production dashboard items with optional filters
   */
  static async getDashboard(filters: DashboardFilters = {}): Promise<ProductionDashboardItem[]> {
    try {
      const { data, error } = await supabase
        .from('vw_production_dashboard')
        .select('*')
        .order('priority', { ascending: true })
        .order('scheduled_start', { ascending: true });

      if (error) throw error;

      let results = data || [];

      // Apply filters
      if (filters.status && filters.status !== 'all') {
        results = results.filter(item => item.status === filters.status);
      }

      if (filters.priority) {
        results = results.filter(item => item.priority === filters.priority);
      }

      if (filters.customerId) {
        results = results.filter(item => item.customer_id === filters.customerId);
      }

      if (filters.assignedTo) {
        results = results.filter(item => item.assigned_to === filters.assignedTo);
      }

      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        results = results.filter(item =>
          item.order_number?.toLowerCase().includes(searchLower) ||
          item.title?.toLowerCase().includes(searchLower) ||
          item.customer_name?.toLowerCase().includes(searchLower) ||
          item.ticket_number?.toLowerCase().includes(searchLower)
        );
      }

      return results;
    } catch (error) {
      console.error('Error loading production dashboard:', error);
      throw error;
    }
  }

  /**
   * Get production statistics
   */
  static async getStats(): Promise<ProductionStats> {
    try {
      // Get all orders for counting
      const { data: orders, error: ordersError } = await supabase
        .from('production_orders')
        .select('id, status, actual_start, actual_end');

      if (ordersError) throw ordersError;

      const allOrders = orders || [];

      // Count by status
      const byStatus = {
        queued: allOrders.filter(o => o.status === 'queued').length,
        in_progress: allOrders.filter(o => o.status === 'in_progress').length,
        hold: allOrders.filter(o => o.status === 'hold').length,
        complete: allOrders.filter(o => o.status === 'complete').length,
      };

      // Today's completed orders
      const today = new Date().toISOString().split('T')[0];
      const todayCompleted = allOrders.filter(o =>
        o.status === 'complete' && o.actual_end?.startsWith(today)
      ).length;

      // Calculate average cycle time for completed orders with both start and end
      const completedWithTimes = allOrders.filter(o =>
        o.status === 'complete' && o.actual_start && o.actual_end
      );

      let avgCycleTimeHours: number | null = null;
      if (completedWithTimes.length > 0) {
        const totalHours = completedWithTimes.reduce((sum, o) => {
          const start = new Date(o.actual_start!).getTime();
          const end = new Date(o.actual_end!).getTime();
          return sum + (end - start) / (1000 * 60 * 60);
        }, 0);
        avgCycleTimeHours = Math.round((totalHours / completedWithTimes.length) * 10) / 10;
      }

      return {
        total: allOrders.length,
        byStatus,
        todayCompleted,
        avgCycleTimeHours,
      };
    } catch (error) {
      console.error('Error loading production stats:', error);
      return {
        total: 0,
        byStatus: { queued: 0, in_progress: 0, hold: 0, complete: 0 },
        todayCompleted: 0,
        avgCycleTimeHours: null,
      };
    }
  }

  // ========== Production Orders ==========

  /**
   * Get a single production order with all related data
   */
  static async getOrderById(id: string): Promise<{
    order: ProductionOrder;
    steps: ProductionStep[];
    bom: BOMItem[];
    timeLogs: TimeLogRow[];
    materialMoves: MaterialMoveRequest[];
  } | null> {
    try {
      // Get order
      const { data: order, error: orderError } = await supabase
        .from('production_orders')
        .select(`
          *,
          customer:customers(id, name),
          assigned_user:profiles!production_orders_assigned_to_fkey(id, full_name),
          ticket:tickets(id, ticket_number),
          project:projects(id, name)
        `)
        .eq('id', id)
        .single();

      if (orderError) throw orderError;
      if (!order) return null;

      // Get steps
      const { data: steps, error: stepsError } = await supabase
        .from('production_steps')
        .select(`
          *,
          work_center:work_centers(id, name, code),
          completed_by_user:profiles!production_steps_completed_by_fkey(id, full_name)
        `)
        .eq('production_order_id', id)
        .order('step_number', { ascending: true });

      if (stepsError) throw stepsError;

      // Get BOM items
      const { data: bom, error: bomError } = await supabase
        .from('bill_of_materials')
        .select(`
          *,
          part:parts(id, name, part_number),
          source_location:stock_locations(id, name)
        `)
        .eq('production_order_id', id)
        .order('created_at', { ascending: true });

      if (bomError) throw bomError;

      // Get time logs
      const { data: timeLogs, error: timeLogsError } = await supabase
        .from('production_time_logs')
        .select('*')
        .eq('production_order_id', id)
        .order('clock_in', { ascending: false });

      if (timeLogsError) throw timeLogsError;

      // Get material moves
      const { data: materialMoves, error: movesError } = await supabase
        .from('material_move_requests')
        .select(`
          *,
          order:production_orders(id, order_number),
          from_location:stock_locations!material_move_requests_from_location_id_fkey(id, name),
          to_work_center:work_centers(id, name, code),
          to_location:stock_locations!material_move_requests_to_location_id_fkey(id, name),
          item:parts(id, name, part_number),
          requested_by_user:profiles!material_move_requests_requested_by_fkey(id, full_name),
          assigned_to_user:profiles!material_move_requests_assigned_to_fkey(id, full_name)
        `)
        .eq('production_order_id', id)
        .order('created_at', { ascending: false });

      if (movesError) throw movesError;

      return {
        order: order as ProductionOrder,
        steps: (steps || []) as ProductionStep[],
        bom: (bom || []) as BOMItem[],
        timeLogs: timeLogs || [],
        materialMoves: (materialMoves || []) as MaterialMoveRequest[],
      };
    } catch (error) {
      console.error('Error loading production order:', error);
      throw error;
    }
  }

  /**
   * Create a new production order
   */
  static async createOrder(input: CreateProductionOrderInput): Promise<{ success: boolean; order?: ProductionOrder; error?: string }> {
    try {
      const { data: user } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from('production_orders')
        .insert({
          ...input,
          created_by: user?.user?.id,
        })
        .select()
        .single();

      if (error) throw error;

      return { success: true, order: data as ProductionOrder };
    } catch (error: unknown) {
      console.error('Error creating production order:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to create order' 
      };
    }
  }

  /**
   * Create a production order from an existing ticket
   */
  static async createFromTicket(
    ticketId: string,
    options?: {
      priority?: number;
      scheduled_start?: string;
      assigned_to?: string;
    }
  ): Promise<{ success: boolean; order?: ProductionOrder; error?: string }> {
    try {
      // Get ticket details
      const { data: ticket, error: ticketError } = await supabase
        .from('tickets')
        .select('id, title, description, customer_id, project_id')
        .eq('id', ticketId)
        .single();

      if (ticketError) throw ticketError;
      if (!ticket) throw new Error('Ticket not found');

      return await this.createOrder({
        title: ticket.title,
        description: ticket.description,
        ticket_id: ticket.id,
        customer_id: ticket.customer_id,
        project_id: ticket.project_id,
        priority: options?.priority ?? 3,
        scheduled_start: options?.scheduled_start,
        assigned_to: options?.assigned_to,
      });
    } catch (error: unknown) {
      console.error('Error creating order from ticket:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to create order from ticket' 
      };
    }
  }

  /**
   * Update a production order
   */
  static async updateOrder(
    id: string,
    updates: Partial<ProductionOrderRow>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from('production_orders')
        .update(updates)
        .eq('id', id);

      if (error) throw error;

      return { success: true };
    } catch (error: unknown) {
      console.error('Error updating production order:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to update order' 
      };
    }
  }

  /**
   * Put a production order on hold
   */
  static async putOnHold(id: string, reason: string): Promise<{ success: boolean; error?: string }> {
    return this.updateOrder(id, { status: 'hold', hold_reason: reason });
  }

  /**
   * Resume a production order from hold
   */
  static async resumeOrder(id: string): Promise<{ success: boolean; error?: string }> {
    return this.updateOrder(id, { status: 'in_progress', hold_reason: null });
  }

  /**
   * Complete a production order
   *
   * This method:
   * 1. Consumes all BOM materials (with idempotency protection)
   * 2. Updates the order status to complete
   * 3. Sets the actual_end timestamp
   */
  static async completeOrder(id: string, quantity?: number): Promise<{
    success: boolean;
    error?: string;
    consumptionResult?: {
      consumed_items: { part_name: string; qty_consumed: number }[];
      errors: { part_name: string; error: string }[];
    };
  }> {
    try {
      // First, consume all BOM materials
      // This is idempotent - if already consumed, will return existing logs
      const consumptionResult = await MESInventoryService.consumeBOMForOrder(id);

      // If there are consumption errors, we can still complete the order
      // but we'll report the errors back
      if (!consumptionResult.success && consumptionResult.errors.length > 0) {
        // Check if ALL items failed - if so, don't complete the order
        const allFailed = consumptionResult.consumed_items.length === 0 &&
                         consumptionResult.errors.length > 0;

        if (allFailed) {
          console.error('All BOM consumption failed:', consumptionResult.errors);
          return {
            success: false,
            error: `Failed to consume materials: ${consumptionResult.errors.map(e => `${e.part_name}: ${e.error}`).join('; ')}`,
            consumptionResult: {
              consumed_items: consumptionResult.consumed_items.map(i => ({
                part_name: i.part_name,
                qty_consumed: i.qty_consumed
              })),
              errors: consumptionResult.errors.map(e => ({
                part_name: e.part_name,
                error: e.error
              })),
            },
          };
        }

        // Partial consumption - log warning but continue
        console.warn('Partial BOM consumption:', consumptionResult.errors);
      }

      // Update the order status
      const updates: Partial<ProductionOrderRow> = {
        status: 'complete',
        actual_end: new Date().toISOString(),
      };

      if (quantity !== undefined) {
        updates.quantity_completed = quantity;
      }

      const updateResult = await this.updateOrder(id, updates);

      if (!updateResult.success) {
        return updateResult;
      }

      return {
        success: true,
        consumptionResult: {
          consumed_items: consumptionResult.consumed_items.map(i => ({
            part_name: i.part_name,
            qty_consumed: i.qty_consumed
          })),
          errors: consumptionResult.errors.map(e => ({
            part_name: e.part_name,
            error: e.error
          })),
        },
      };
    } catch (error: unknown) {
      console.error('Error completing order:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to complete order' 
      };
    }
  }

  // ========== Production Steps ==========

  /**
   * Add a step to a production order
   */
  static async addStep(
    orderId: string,
    step: CreateProductionStepInput
  ): Promise<{ success: boolean; step?: ProductionStep; error?: string }> {
    try {
      // Get the next step number
      const { data: existingSteps } = await supabase
        .from('production_steps')
        .select('step_number')
        .eq('production_order_id', orderId)
        .order('step_number', { ascending: false })
        .limit(1);

      const nextStepNumber = (existingSteps?.[0]?.step_number ?? 0) + 1;

      const { data, error } = await supabase
        .from('production_steps')
        .insert({
          production_order_id: orderId,
          step_number: nextStepNumber,
          ...step,
        })
        .select()
        .single();

      if (error) throw error;

      return { success: true, step: data as ProductionStep };
    } catch (error: unknown) {
      console.error('Error adding step:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to add step' 
      };
    }
  }

  /**
   * Update step status
   */
  static async updateStepStatus(
    stepId: string,
    status: 'pending' | 'in_progress' | 'complete' | 'skipped'
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { data: user } = await supabase.auth.getUser();

      const updates: Partial<ProductionStepRow> = { status };

      if (status === 'in_progress') {
        updates.started_at = new Date().toISOString();
      } else if (status === 'complete' || status === 'skipped') {
        updates.completed_at = new Date().toISOString();
        updates.completed_by = user?.user?.id;

        // Calculate actual minutes if started
        const { data: step } = await supabase
          .from('production_steps')
          .select('started_at')
          .eq('id', stepId)
          .single();

        if (step?.started_at) {
          const startTime = new Date(step.started_at).getTime();
          const endTime = Date.now();
          updates.actual_minutes = Math.round((endTime - startTime) / 60000);
        }
      }

      const { error } = await supabase
        .from('production_steps')
        .update(updates)
        .eq('id', stepId);

      if (error) throw error;

      return { success: true };
    } catch (error: unknown) {
      console.error('Error updating step status:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to update step status' 
      };
    }
  }

  /**
   * Delete a production step
   */
  static async deleteStep(stepId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from('production_steps')
        .delete()
        .eq('id', stepId);

      if (error) throw error;

      return { success: true };
    } catch (error: unknown) {
      console.error('Error deleting step:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to delete step' 
      };
    }
  }

  // ========== Bill of Materials ==========

  /**
   * Add an item to the BOM
   */
  static async addBOMItem(
    orderId: string,
    item: CreateBOMItemInput
  ): Promise<{ success: boolean; item?: BOMItem; error?: string }> {
    try {
      const { data, error } = await supabase
        .from('bill_of_materials')
        .insert({
          production_order_id: orderId,
          ...item,
        })
        .select()
        .single();

      if (error) throw error;

      return { success: true, item: data as BOMItem };
    } catch (error: unknown) {
      console.error('Error adding BOM item:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to add BOM item' 
      };
    }
  }

  /**
   * Remove an item from the BOM
   */
  static async removeBOMItem(itemId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from('bill_of_materials')
        .delete()
        .eq('id', itemId);

      if (error) throw error;

      return { success: true };
    } catch (error: unknown) {
      console.error('Error removing BOM item:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to remove BOM item' 
      };
    }
  }

  /**
   * Allocate inventory to a BOM item
   */
  static async allocateBOMItem(
    itemId: string,
    locationId: string,
    quantity: number
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from('bill_of_materials')
        .update({
          source_location_id: locationId,
          quantity_allocated: quantity,
          is_allocated: true,
        })
        .eq('id', itemId);

      if (error) throw error;

      return { success: true };
    } catch (error: unknown) {
      console.error('Error allocating BOM item:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to allocate BOM item' 
      };
    }
  }

  // ========== Work Centers ==========

  /**
   * Get all work centers
   */
  static async getWorkCenters(activeOnly = true): Promise<WorkCenter[]> {
    try {
      let query = supabase
        .from('work_centers')
        .select(`
          *,
          default_technician:profiles(id, full_name)
        `)
        .order('code', { ascending: true });

      if (activeOnly) {
        query = query.eq('is_active', true);
      }

      const { data, error } = await query;

      if (error) throw error;

      return (data || []) as WorkCenter[];
    } catch (error) {
      console.error('Error loading work centers:', error);
      return [];
    }
  }

  /**
   * Get work center queue
   */
  static async getWorkCenterQueue(centerId?: string): Promise<unknown[]> {
    try {
      let query = supabase
        .from('vw_work_center_queue')
        .select('*');

      if (centerId) {
        query = query.eq('work_center_id', centerId);
      }

      const { data, error } = await query;

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('Error loading work center queue:', error);
      return [];
    }
  }

  // ========== Time Tracking ==========

  /**
   * Clock in to a production order
   */
  static async clockIn(
    orderId: string,
    stepId?: string,
    centerId?: string
  ): Promise<{ success: boolean; timeLogId?: string; error?: string }> {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user?.user?.id) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('production_time_logs')
        .insert({
          production_order_id: orderId,
          production_step_id: stepId,
          work_center_id: centerId,
          technician_id: user.user.id,
          clock_in: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (error) throw error;

      return { success: true, timeLogId: data.id };
    } catch (error: unknown) {
      console.error('Error clocking in:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to clock in' 
      };
    }
  }

  /**
   * Clock out from a time log
   */
  static async clockOut(timeLogId: string, notes?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const updates: Partial<TimeLogRow> = {
        clock_out: new Date().toISOString(),
      };

      if (notes) {
        updates.notes = notes;
      }

      const { error } = await supabase
        .from('production_time_logs')
        .update(updates)
        .eq('id', timeLogId);

      if (error) throw error;

      return { success: true };
    } catch (error: unknown) {
      console.error('Error clocking out:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to clock out' 
      };
    }
  }

  /**
   * Get active time log for current user
   */
  static async getActiveTimeLog(orderId: string): Promise<TimeLogRow | null> {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user?.user?.id) return null;

      const { data, error } = await supabase
        .from('production_time_logs')
        .select('*')
        .eq('production_order_id', orderId)
        .eq('technician_id', user.user.id)
        .is('clock_out', null)
        .order('clock_in', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      return data;
    } catch (error) {
      console.error('Error getting active time log:', error);
      return null;
    }
  }

  // ========== Material Handling ==========

  /**
   * Get material move queue
   */
  static async getMoveQueue(filters: MoveQueueFilters = {}): Promise<MaterialMoveRequest[]> {
    try {
      const { data, error } = await supabase
        .from('vw_material_moves_queue')
        .select('*');

      if (error) throw error;

      let results = data || [];

      if (filters.status && filters.status !== 'all') {
        results = results.filter(m => m.status === filters.status);
      }

      if (filters.assignedTo) {
        results = results.filter(m => m.assigned_to === filters.assignedTo);
      }

      if (filters.workCenterId) {
        results = results.filter(m => m.to_work_center_id === filters.workCenterId);
      }

      return results as MaterialMoveRequest[];
    } catch (error) {
      console.error('Error loading move queue:', error);
      return [];
    }
  }

  /**
   * Request a material move
   */
  static async requestMaterialMove(
    input: CreateMaterialMoveInput
  ): Promise<{ success: boolean; id?: string; error?: string }> {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user?.user?.id) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('material_move_requests')
        .insert({
          ...input,
          requested_by: user.user.id,
        })
        .select('id')
        .single();

      if (error) throw error;

      return { success: true, id: data.id };
    } catch (error) {
      console.error('Error requesting material move:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to request move' };
    }
  }

  /**
   * Assign a move to a handler
   */
  static async assignMove(moveId: string, assigneeId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from('material_move_requests')
        .update({ assigned_to: assigneeId })
        .eq('id', moveId);

      if (error) throw error;

      return { success: true };
    } catch (error) {
      console.error('Error assigning move:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to assign move' };
    }
  }

  /**
   * Start a material move
   */
  static async startMove(moveId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { data: user } = await supabase.auth.getUser();

      const { error } = await supabase
        .from('material_move_requests')
        .update({
          status: 'in_transit',
          started_at: new Date().toISOString(),
          assigned_to: user?.user?.id,
        })
        .eq('id', moveId);

      if (error) throw error;

      return { success: true };
    } catch (error) {
      console.error('Error starting move:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to start move' };
    }
  }

  /**
   * Complete a material move
   */
  static async completeMaterialMove(moveId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from('material_move_requests')
        .update({
          status: 'delivered',
          completed_at: new Date().toISOString(),
        })
        .eq('id', moveId);

      if (error) throw error;

      return { success: true };
    } catch (error) {
      console.error('Error completing move:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to complete move' };
    }
  }

  /**
   * Cancel a material move
   */
  static async cancelMove(moveId: string, reason?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from('material_move_requests')
        .update({
          status: 'cancelled',
          notes: reason,
        })
        .eq('id', moveId);

      if (error) throw error;

      return { success: true };
    } catch (error) {
      console.error('Error cancelling move:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to cancel move' };
    }
  }

  /**
   * Claim a move (assign to current user and start)
   */
  static async claimMove(moveId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user?.user?.id) throw new Error('User not authenticated');

      const { error } = await supabase
        .from('material_move_requests')
        .update({
          assigned_to: user.user.id,
          status: 'in_transit',
          started_at: new Date().toISOString(),
        })
        .eq('id', moveId);

      if (error) throw error;

      return { success: true };
    } catch (error) {
      console.error('Error claiming move:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to claim move' };
    }
  }
}
