/**
 * ProductionSchedulingService
 * Handles production scheduling, conflict detection, and work center capacity management.
 */

import { supabase } from '../lib/supabase';

// ========== Type Definitions ==========

export interface WorkCenterSchedule {
  id: string;
  production_order_id: string;
  order_number: string;
  order_title: string;
  order_priority: number | null;
  customer_id: string | null;
  customer_name: string | null;
  production_step_id: string | null;
  step_number: number | null;
  step_name: string | null;
  work_center_id: string | null;
  work_center_name: string | null;
  work_center_code: string | null;
  equipment_asset_id: string | null;
  equipment_name: string | null;
  status: 'NOT_STARTED' | 'RUNNING' | 'PAUSED' | 'COMPLETED';
  scheduled_start_ts: string | null;
  scheduled_end_ts: string | null;
  actual_start_ts: string | null;
  actual_end_ts: string | null;
  sequence_number: number;
  estimated_minutes: number | null;
  capacity_per_hour: number | null;
}

export interface ScheduleConflict {
  type: 'overlap' | 'capacity' | 'resource';
  message: string;
  conflicting_schedule_id?: string;
  conflicting_order_number?: string;
  start_ts: string;
  end_ts: string;
}

export interface ScheduleInput {
  production_order_id: string;
  production_step_id?: string;
  work_center_id: string;
  equipment_asset_id?: string;
  scheduled_start_ts: string;
  scheduled_end_ts?: string;
  sequence_number?: number;
}

export interface ScheduleValidationResult {
  valid: boolean;
  conflicts: ScheduleConflict[];
  warnings: string[];
}

export interface WorkCenterCapacity {
  work_center_id: string;
  work_center_name: string;
  work_center_code: string;
  date: string;
  total_capacity_minutes: number;
  scheduled_minutes: number;
  available_minutes: number;
  utilization_percent: number;
}

export interface ScheduleFilters {
  work_center_id?: string;
  status?: 'NOT_STARTED' | 'RUNNING' | 'PAUSED' | 'COMPLETED';
  from_date?: string;
  to_date?: string;
  production_order_id?: string;
}

// ========== ProductionSchedulingService Class ==========

export class ProductionSchedulingService {
  // ========== Scheduling Operations ==========

  /**
   * Schedule a production order/step to a work center
   */
  static async scheduleOrder(input: ScheduleInput): Promise<{
    success: boolean;
    schedule?: WorkCenterSchedule;
    conflicts?: ScheduleConflict[];
    error?: string;
  }> {
    try {
      // Validate schedule first
      const validation = await this.validateSchedule(input);
      if (!validation.valid && validation.conflicts.length > 0) {
        return { success: false, conflicts: validation.conflicts };
      }

      // Get next sequence number if not provided
      let sequenceNumber = input.sequence_number;
      if (sequenceNumber === undefined) {
        const { data: existing } = await supabase
          .from('production_operation_runs')
          .select('sequence_number')
          .eq('work_center_id', input.work_center_id)
          .order('sequence_number', { ascending: false })
          .limit(1);

        sequenceNumber = (existing?.[0]?.sequence_number ?? 0) + 1;
      }

      const { data: user } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from('production_operation_runs')
        .insert({
          production_order_id: input.production_order_id,
          production_step_id: input.production_step_id,
          work_center_id: input.work_center_id,
          equipment_asset_id: input.equipment_asset_id,
          scheduled_start_ts: input.scheduled_start_ts,
          scheduled_end_ts: input.scheduled_end_ts,
          sequence_number: sequenceNumber,
          status: 'NOT_STARTED',
          started_by: user?.user?.id,
        })
        .select()
        .single();

      if (error) throw error;

      return { success: true, schedule: data as WorkCenterSchedule };
    } catch (error: any) {
      console.error('Error scheduling order:', error);
      return { success: false, error: error.message || 'Failed to schedule order' };
    }
  }

  /**
   * Validate a schedule before creating/updating
   */
  static async validateSchedule(input: ScheduleInput): Promise<ScheduleValidationResult> {
    const conflicts: ScheduleConflict[] = [];
    const warnings: string[] = [];

    try {
      // Check for overlapping schedules at the same work center
      if (input.scheduled_start_ts && input.work_center_id) {
        const endTs = input.scheduled_end_ts || new Date(
          new Date(input.scheduled_start_ts).getTime() + 60 * 60 * 1000 // Default 1 hour
        ).toISOString();

        const overlaps = await this.detectConflicts(
          input.work_center_id,
          input.scheduled_start_ts,
          endTs
        );

        conflicts.push(...overlaps);
      }

      // Check if production order exists and is schedulable
      const { data: order, error: orderError } = await supabase
        .from('production_orders')
        .select('id, status, order_number')
        .eq('id', input.production_order_id)
        .single();

      if (orderError || !order) {
        conflicts.push({
          type: 'resource',
          message: 'Production order not found',
          start_ts: input.scheduled_start_ts,
          end_ts: input.scheduled_end_ts || input.scheduled_start_ts,
        });
      } else if (order.status === 'complete') {
        warnings.push('Production order is already complete');
      } else if (order.status === 'hold') {
        warnings.push('Production order is on hold');
      }

      // Check work center exists and is active
      const { data: workCenter, error: wcError } = await supabase
        .from('work_centers')
        .select('id, is_active, name')
        .eq('id', input.work_center_id)
        .single();

      if (wcError || !workCenter) {
        conflicts.push({
          type: 'resource',
          message: 'Work center not found',
          start_ts: input.scheduled_start_ts,
          end_ts: input.scheduled_end_ts || input.scheduled_start_ts,
        });
      } else if (!workCenter.is_active) {
        warnings.push(`Work center "${workCenter.name}" is inactive`);
      }

      return {
        valid: conflicts.length === 0,
        conflicts,
        warnings,
      };
    } catch (error) {
      console.error('Error validating schedule:', error);
      return {
        valid: false,
        conflicts: [{
          type: 'resource',
          message: 'Validation error occurred',
          start_ts: input.scheduled_start_ts,
          end_ts: input.scheduled_end_ts || input.scheduled_start_ts,
        }],
        warnings,
      };
    }
  }

  /**
   * Update an existing schedule
   */
  static async updateSchedule(
    scheduleId: string,
    updates: Partial<{
      scheduled_start_ts: string;
      scheduled_end_ts: string;
      work_center_id: string;
      equipment_asset_id: string;
      sequence_number: number;
      status: 'NOT_STARTED' | 'RUNNING' | 'PAUSED' | 'COMPLETED';
    }>
  ): Promise<{ success: boolean; conflicts?: ScheduleConflict[]; error?: string }> {
    try {
      // If changing time or work center, validate first
      if (updates.scheduled_start_ts || updates.work_center_id) {
        const { data: existing } = await supabase
          .from('production_operation_runs')
          .select('*')
          .eq('id', scheduleId)
          .single();

        if (existing) {
          const input: ScheduleInput = {
            production_order_id: existing.production_order_id,
            work_center_id: updates.work_center_id || existing.work_center_id,
            scheduled_start_ts: updates.scheduled_start_ts || existing.scheduled_start_ts,
            scheduled_end_ts: updates.scheduled_end_ts || existing.scheduled_end_ts,
          };

          // Detect conflicts excluding current schedule
          const conflicts = await this.detectConflicts(
            input.work_center_id,
            input.scheduled_start_ts,
            input.scheduled_end_ts || input.scheduled_start_ts,
            scheduleId
          );

          if (conflicts.length > 0) {
            return { success: false, conflicts };
          }
        }
      }

      const { error } = await supabase
        .from('production_operation_runs')
        .update(updates)
        .eq('id', scheduleId);

      if (error) throw error;

      return { success: true };
    } catch (error: any) {
      console.error('Error updating schedule:', error);
      return { success: false, error: error.message || 'Failed to update schedule' };
    }
  }

  /**
   * Reorder schedules at a work center
   */
  static async reorderSchedules(
    workCenterId: string,
    newOrder: string[]
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Update sequence numbers based on new order
      for (let i = 0; i < newOrder.length; i++) {
        const { error } = await supabase
          .from('production_operation_runs')
          .update({ sequence_number: i + 1 })
          .eq('id', newOrder[i])
          .eq('work_center_id', workCenterId);

        if (error) throw error;
      }

      return { success: true };
    } catch (error: any) {
      console.error('Error reordering schedules:', error);
      return { success: false, error: error.message || 'Failed to reorder schedules' };
    }
  }

  /**
   * Detect conflicts at a work center for a given time range
   */
  static async detectConflicts(
    workCenterId: string,
    startTs: string,
    endTs: string,
    excludeScheduleId?: string
  ): Promise<ScheduleConflict[]> {
    const conflicts: ScheduleConflict[] = [];

    try {
      let query = supabase
        .from('production_operation_runs')
        .select(`
          id,
          production_order_id,
          scheduled_start_ts,
          scheduled_end_ts,
          production_order:production_orders(order_number)
        `)
        .eq('work_center_id', workCenterId)
        .not('status', 'eq', 'COMPLETED')
        .not('scheduled_start_ts', 'is', null);

      if (excludeScheduleId) {
        query = query.not('id', 'eq', excludeScheduleId);
      }

      const { data: existingSchedules, error } = await query;

      if (error) throw error;

      // Check for overlaps
      const newStart = new Date(startTs).getTime();
      const newEnd = new Date(endTs).getTime();

      for (const schedule of existingSchedules || []) {
        if (!schedule.scheduled_start_ts) continue;

        const existingStart = new Date(schedule.scheduled_start_ts).getTime();
        const existingEnd = schedule.scheduled_end_ts
          ? new Date(schedule.scheduled_end_ts).getTime()
          : existingStart + 60 * 60 * 1000; // Default 1 hour

        // Check for overlap
        if (newStart < existingEnd && newEnd > existingStart) {
          conflicts.push({
            type: 'overlap',
            message: `Overlaps with order ${(schedule.production_order as any)?.order_number || 'Unknown'}`,
            conflicting_schedule_id: schedule.id,
            conflicting_order_number: (schedule.production_order as any)?.order_number,
            start_ts: schedule.scheduled_start_ts,
            end_ts: schedule.scheduled_end_ts || new Date(existingEnd).toISOString(),
          });
        }
      }

      return conflicts;
    } catch (error) {
      console.error('Error detecting conflicts:', error);
      return [];
    }
  }

  // ========== Query Operations ==========

  /**
   * Get schedules with optional filters
   */
  static async getSchedules(filters: ScheduleFilters = {}): Promise<WorkCenterSchedule[]> {
    try {
      const { data, error } = await supabase
        .from('vw_work_center_schedule')
        .select('*');

      if (error) throw error;

      let results = data || [];

      // Apply filters
      if (filters.work_center_id) {
        results = results.filter(s => s.work_center_id === filters.work_center_id);
      }

      if (filters.status) {
        results = results.filter(s => s.status === filters.status);
      }

      if (filters.production_order_id) {
        results = results.filter(s => s.production_order_id === filters.production_order_id);
      }

      if (filters.from_date) {
        // Compare dates only (ignore time/timezone) for scheduling purposes
        const fromDateStr = new Date(filters.from_date).toISOString().split('T')[0];
        results = results.filter(s => {
          if (!s.scheduled_start_ts) return false;
          const schedDateStr = new Date(s.scheduled_start_ts).toISOString().split('T')[0];
          return schedDateStr >= fromDateStr;
        });
      }

      if (filters.to_date) {
        const toDateStr = new Date(filters.to_date).toISOString().split('T')[0];
        results = results.filter(s => {
          if (!s.scheduled_start_ts) return false;
          const schedDateStr = new Date(s.scheduled_start_ts).toISOString().split('T')[0];
          return schedDateStr <= toDateStr;
        });
      }

      return results as WorkCenterSchedule[];
    } catch (error) {
      console.error('Error getting schedules:', error);
      return [];
    }
  }

  /**
   * Get timeline for a specific work center
   */
  static async getWorkCenterTimeline(
    workCenterId: string,
    fromDate: string,
    toDate: string
  ): Promise<WorkCenterSchedule[]> {
    try {
      const { data, error } = await supabase
        .from('vw_work_center_schedule')
        .select('*')
        .eq('work_center_id', workCenterId)
        .gte('scheduled_start_ts', fromDate)
        .lte('scheduled_start_ts', toDate)
        .order('scheduled_start_ts', { ascending: true });

      if (error) throw error;

      return (data || []) as WorkCenterSchedule[];
    } catch (error) {
      console.error('Error getting work center timeline:', error);
      return [];
    }
  }

  /**
   * Get capacity information for work centers
   */
  static async getWorkCenterCapacity(
    workCenterIds: string[],
    fromDate: string,
    toDate: string
  ): Promise<WorkCenterCapacity[]> {
    const capacities: WorkCenterCapacity[] = [];

    try {
      // Get work centers
      const { data: workCenters, error: wcError } = await supabase
        .from('work_centers')
        .select('id, name, code, capacity_per_hour')
        .in('id', workCenterIds);

      if (wcError) throw wcError;

      // Get schedules in date range
      const { data: schedules, error: schedError } = await supabase
        .from('production_operation_runs')
        .select('work_center_id, scheduled_start_ts, scheduled_end_ts, status')
        .in('work_center_id', workCenterIds)
        .gte('scheduled_start_ts', fromDate)
        .lte('scheduled_start_ts', toDate)
        .not('status', 'eq', 'COMPLETED');

      if (schedError) throw schedError;

      // Calculate capacity per day for each work center
      const from = new Date(fromDate);
      const to = new Date(toDate);

      for (const wc of workCenters || []) {
        // Assuming 8 hours/day capacity if not specified
        const hoursPerDay = 8;
        const totalMinutesPerDay = hoursPerDay * 60;

        // Group schedules by date
        const wcSchedules = (schedules || []).filter(s => s.work_center_id === wc.id);

        // For each day in range
        const current = new Date(from);
        while (current <= to) {
          const dayStart = new Date(current).setHours(0, 0, 0, 0);
          const dayEnd = new Date(current).setHours(23, 59, 59, 999);

          let scheduledMinutes = 0;

          for (const schedule of wcSchedules) {
            if (!schedule.scheduled_start_ts) continue;

            const schedStart = new Date(schedule.scheduled_start_ts).getTime();
            const schedEnd = schedule.scheduled_end_ts
              ? new Date(schedule.scheduled_end_ts).getTime()
              : schedStart + 60 * 60 * 1000;

            // Check if schedule overlaps with this day
            if (schedStart <= dayEnd && schedEnd >= dayStart) {
              const overlapStart = Math.max(schedStart, dayStart);
              const overlapEnd = Math.min(schedEnd, dayEnd);
              scheduledMinutes += (overlapEnd - overlapStart) / (1000 * 60);
            }
          }

          capacities.push({
            work_center_id: wc.id,
            work_center_name: wc.name,
            work_center_code: wc.code,
            date: current.toISOString().split('T')[0],
            total_capacity_minutes: totalMinutesPerDay,
            scheduled_minutes: Math.round(scheduledMinutes),
            available_minutes: Math.round(totalMinutesPerDay - scheduledMinutes),
            utilization_percent: Math.round((scheduledMinutes / totalMinutesPerDay) * 100),
          });

          current.setDate(current.getDate() + 1);
        }
      }

      return capacities;
    } catch (error) {
      console.error('Error getting work center capacity:', error);
      return [];
    }
  }

  /**
   * Start a scheduled operation
   */
  static async startOperation(scheduleId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { data: user } = await supabase.auth.getUser();

      const { error } = await supabase
        .from('production_operation_runs')
        .update({
          status: 'RUNNING',
          start_ts: new Date().toISOString(),
          started_by: user?.user?.id,
        })
        .eq('id', scheduleId);

      if (error) throw error;

      return { success: true };
    } catch (error: any) {
      console.error('Error starting operation:', error);
      return { success: false, error: error.message || 'Failed to start operation' };
    }
  }

  /**
   * Pause a running operation
   */
  static async pauseOperation(scheduleId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from('production_operation_runs')
        .update({ status: 'PAUSED' })
        .eq('id', scheduleId);

      if (error) throw error;

      return { success: true };
    } catch (error: any) {
      console.error('Error pausing operation:', error);
      return { success: false, error: error.message || 'Failed to pause operation' };
    }
  }

  /**
   * Complete an operation
   */
  static async completeOperation(scheduleId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { data: user } = await supabase.auth.getUser();

      const { error } = await supabase
        .from('production_operation_runs')
        .update({
          status: 'COMPLETED',
          end_ts: new Date().toISOString(),
          completed_by: user?.user?.id,
        })
        .eq('id', scheduleId);

      if (error) throw error;

      return { success: true };
    } catch (error: any) {
      console.error('Error completing operation:', error);
      return { success: false, error: error.message || 'Failed to complete operation' };
    }
  }

  /**
   * Delete a schedule (only if NOT_STARTED)
   */
  static async deleteSchedule(scheduleId: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Check if schedule can be deleted
      const { data: schedule, error: fetchError } = await supabase
        .from('production_operation_runs')
        .select('status')
        .eq('id', scheduleId)
        .single();

      if (fetchError) throw fetchError;

      if (schedule?.status !== 'NOT_STARTED') {
        return { success: false, error: 'Can only delete schedules that have not started' };
      }

      const { error } = await supabase
        .from('production_operation_runs')
        .delete()
        .eq('id', scheduleId);

      if (error) throw error;

      return { success: true };
    } catch (error: any) {
      console.error('Error deleting schedule:', error);
      return { success: false, error: error.message || 'Failed to delete schedule' };
    }
  }
}
