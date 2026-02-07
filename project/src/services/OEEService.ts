/**
 * OEEService
 * Handles OEE (Overall Equipment Effectiveness) calculations, cycle time management,
 * and production count tracking.
 *
 * OEE Formulas:
 * - Availability = (PlannedTime - Downtime) / PlannedTime
 * - Performance = (IdealCycleTime × TotalCount) / RunTime
 * - Quality = GoodCount / TotalCount
 * - OEE = A × P × Q
 */

import { supabase } from '../lib/supabase';

// ========== Type Definitions ==========

export interface OEEMetrics {
  // Time breakdown (in seconds)
  planned_production_time_seconds: number;
  actual_run_time_seconds: number;
  downtime_seconds: number;
  planned_downtime_seconds: number;
  unplanned_downtime_seconds: number;

  // Counts
  total_count: number;
  good_count: number;
  scrap_count: number;
  rework_count: number;

  // Cycle times
  ideal_cycle_time_seconds: number | null;
  actual_cycle_time_seconds: number | null;

  // OEE components (0-1 scale)
  availability: number;
  performance: number;
  quality: number;
  oee: number;

  // Percentages for display
  availability_pct: number;
  performance_pct: number;
  quality_pct: number;
  oee_pct: number;

  // Metadata
  period_start: string;
  period_end: string;
  scope_type: string;
  scope_id: string;
  scope_name?: string;
}

export interface OEETrend {
  period_start: string;
  period_end: string;
  shift_name?: string;
  availability_pct: number;
  performance_pct: number;
  quality_pct: number;
  oee_pct: number;
  total_count: number;
  good_count: number;
  downtime_minutes: number;
}

export interface CycleTimeInfo {
  cycle_time_seconds: number;
  source: 'equipment' | 'work_center' | 'product' | 'default';
  source_id: string | null;
  source_name: string | null;
}

export interface SetCycleTimeInput {
  equipment_asset_id?: string;
  work_center_id?: string;
  part_id?: string;
  cycle_time_seconds: number;
}

export interface RecordCountInput {
  operation_run_id: string;
  production_order_id?: string;
  work_center_id?: string;
  equipment_asset_id?: string;
  total_qty: number;
  good_qty: number;
  scrap_qty?: number;
  rework_qty?: number;
  scrap_reason_code_id?: string;
  rework_reason_code_id?: string;
  notes?: string;
}

export interface ProductionCount {
  id: string;
  operation_run_id: string;
  production_order_id: string | null;
  work_center_id: string | null;
  equipment_asset_id: string | null;
  count_timestamp: string;
  total_qty: number;
  good_qty: number;
  scrap_qty: number;
  rework_qty: number;
  scrap_reason_code_id: string | null;
  rework_reason_code_id: string | null;
  recorded_by: string | null;
  notes: string | null;
  created_at: string;
}

export interface OEEFilters {
  grain?: 'hourly' | 'shift' | 'daily';
  scope_type?: 'work_center' | 'equipment' | 'line' | 'plant' | 'site';
  scope_id?: string;
  from_date?: string;
  to_date?: string;
}

// ========== OEEService Class ==========

export class OEEService {
  // Default shift duration in hours (used when no shift calendar)
  private static readonly DEFAULT_SHIFT_HOURS = 8;
  private static readonly DEFAULT_CYCLE_TIME_SECONDS = 60;

  // ========== OEE Calculation ==========

  /**
   * Calculate OEE for a work center over a time period
   */
  static async calculateOEE(
    workCenterId: string,
    fromDate: string,
    toDate: string
  ): Promise<OEEMetrics> {
    try {
      // Get planned production time (from shift calendars or default)
      const plannedTime = await this.getPlannedProductionTime(workCenterId, fromDate, toDate);

      // Get downtime
      const downtime = await this.getDowntimeForPeriod(workCenterId, fromDate, toDate);

      // Get production counts
      const counts = await this.getProductionCounts(workCenterId, fromDate, toDate);
      const totalCount = counts.reduce((sum, c) => sum + c.total_qty, 0);
      const goodCount = counts.reduce((sum, c) => sum + c.good_qty, 0);
      const scrapCount = counts.reduce((sum, c) => sum + c.scrap_qty, 0);
      const reworkCount = counts.reduce((sum, c) => sum + c.rework_qty, 0);

      // Get ideal cycle time
      const cycleTimeInfo = await this.getIdealCycleTime(workCenterId);
      const idealCycleTime = cycleTimeInfo.cycle_time_seconds;

      // Calculate actual run time (planned time - downtime)
      const actualRunTime = Math.max(0, plannedTime - downtime.total);

      // Calculate actual cycle time if we have counts and run time
      const actualCycleTime = totalCount > 0 && actualRunTime > 0
        ? actualRunTime / totalCount
        : null;

      // Calculate OEE components
      const availability = plannedTime > 0
        ? (plannedTime - downtime.total) / plannedTime
        : 0;

      const performance = actualRunTime > 0 && idealCycleTime
        ? (idealCycleTime * totalCount) / actualRunTime
        : 0;

      const quality = totalCount > 0
        ? goodCount / totalCount
        : 0;

      // Calculate OEE
      const oee = availability * performance * quality;

      // Get work center name for scope
      const { data: wc } = await supabase
        .from('work_centers')
        .select('name')
        .eq('id', workCenterId)
        .single();

      return {
        planned_production_time_seconds: plannedTime,
        actual_run_time_seconds: actualRunTime,
        downtime_seconds: downtime.total,
        planned_downtime_seconds: downtime.planned,
        unplanned_downtime_seconds: downtime.unplanned,
        total_count: totalCount,
        good_count: goodCount,
        scrap_count: scrapCount,
        rework_count: reworkCount,
        ideal_cycle_time_seconds: idealCycleTime,
        actual_cycle_time_seconds: actualCycleTime,
        availability: Math.min(1, Math.max(0, availability)),
        performance: Math.min(1, Math.max(0, performance)),
        quality: Math.min(1, Math.max(0, quality)),
        oee: Math.min(1, Math.max(0, oee)),
        availability_pct: Math.round(Math.min(100, Math.max(0, availability * 100)) * 100) / 100,
        performance_pct: Math.round(Math.min(100, Math.max(0, performance * 100)) * 100) / 100,
        quality_pct: Math.round(Math.min(100, Math.max(0, quality * 100)) * 100) / 100,
        oee_pct: Math.round(Math.min(100, Math.max(0, oee * 100)) * 100) / 100,
        period_start: fromDate,
        period_end: toDate,
        scope_type: 'work_center',
        scope_id: workCenterId,
        scope_name: wc?.name,
      };
    } catch (error) {
      console.error('Error calculating OEE:', error);
      return this.getEmptyOEEMetrics(fromDate, toDate, 'work_center', workCenterId);
    }
  }

  /**
   * Calculate OEE for a specific shift
   */
  static async calculateShiftOEE(
    workCenterId: string,
    date: string,
    shiftName?: string
  ): Promise<OEEMetrics> {
    try {
      // Get shift times from calendar or use defaults
      const shiftTimes = await this.getShiftTimes(workCenterId, date, shiftName);

      return this.calculateOEE(workCenterId, shiftTimes.start, shiftTimes.end);
    } catch (error) {
      console.error('Error calculating shift OEE:', error);
      const now = new Date(date);
      return this.getEmptyOEEMetrics(
        now.toISOString(),
        new Date(now.getTime() + this.DEFAULT_SHIFT_HOURS * 60 * 60 * 1000).toISOString(),
        'work_center',
        workCenterId
      );
    }
  }

  /**
   * Get OEE trend data
   */
  static async getOEETrend(
    workCenterId: string,
    fromDate: string,
    toDate: string,
    granularity: 'hourly' | 'shift' | 'daily'
  ): Promise<OEETrend[]> {
    const trends: OEETrend[] = [];

    try {
      // First check if we have pre-computed snapshots
      const { data: snapshots, error } = await supabase
        .from('vw_oee_summary')
        .select('*')
        .eq('scope_type', 'work_center')
        .eq('scope_id', workCenterId)
        .eq('grain', granularity)
        .gte('period_start', fromDate)
        .lte('period_end', toDate)
        .order('period_start', { ascending: true });

      if (!error && snapshots && snapshots.length > 0) {
        return snapshots.map(s => ({
          period_start: s.period_start,
          period_end: s.period_end,
          shift_name: s.shift_name,
          availability_pct: s.availability_pct,
          performance_pct: s.performance_pct,
          quality_pct: s.quality_pct,
          oee_pct: s.oee_pct,
          total_count: s.total_count,
          good_count: s.good_count,
          downtime_minutes: Math.round(s.downtime_seconds / 60),
        }));
      }

      // Otherwise calculate on the fly (for daily granularity)
      if (granularity === 'daily') {
        const from = new Date(fromDate);
        const to = new Date(toDate);
        const current = new Date(from);

        while (current <= to) {
          const dayStart = new Date(current);
          dayStart.setHours(0, 0, 0, 0);
          const dayEnd = new Date(current);
          dayEnd.setHours(23, 59, 59, 999);

          const oee = await this.calculateOEE(
            workCenterId,
            dayStart.toISOString(),
            dayEnd.toISOString()
          );

          trends.push({
            period_start: dayStart.toISOString(),
            period_end: dayEnd.toISOString(),
            availability_pct: oee.availability_pct,
            performance_pct: oee.performance_pct,
            quality_pct: oee.quality_pct,
            oee_pct: oee.oee_pct,
            total_count: oee.total_count,
            good_count: oee.good_count,
            downtime_minutes: Math.round(oee.downtime_seconds / 60),
          });

          current.setDate(current.getDate() + 1);
        }
      }

      return trends;
    } catch (error) {
      console.error('Error getting OEE trend:', error);
      return [];
    }
  }

  // ========== Cycle Time Management ==========

  /**
   * Get ideal cycle time with precedence: equipment > work_center > product+operation > default
   */
  static async getIdealCycleTime(
    workCenterId: string,
    equipmentAssetId?: string,
    productId?: string
  ): Promise<CycleTimeInfo> {
    try {
      // 1. Check equipment asset
      if (equipmentAssetId) {
        const { data: equipment } = await supabase
          .from('equipment_assets')
          .select('id, name, ideal_cycle_time_seconds')
          .eq('id', equipmentAssetId)
          .single();

        if (equipment?.ideal_cycle_time_seconds) {
          return {
            cycle_time_seconds: equipment.ideal_cycle_time_seconds,
            source: 'equipment',
            source_id: equipment.id,
            source_name: equipment.name,
          };
        }
      }

      // 2. Check work center
      const { data: workCenter } = await supabase
        .from('work_centers')
        .select('id, name, ideal_cycle_time_seconds')
        .eq('id', workCenterId)
        .single();

      if (workCenter?.ideal_cycle_time_seconds) {
        return {
          cycle_time_seconds: workCenter.ideal_cycle_time_seconds,
          source: 'work_center',
          source_id: workCenter.id,
          source_name: workCenter.name,
        };
      }

      // 3. Check product (if provided) - would need a product_cycle_times table
      // For now, skip this as it's not in the schema

      // 4. Return default
      return {
        cycle_time_seconds: this.DEFAULT_CYCLE_TIME_SECONDS,
        source: 'default',
        source_id: null,
        source_name: 'System Default',
      };
    } catch (error) {
      console.error('Error getting ideal cycle time:', error);
      return {
        cycle_time_seconds: this.DEFAULT_CYCLE_TIME_SECONDS,
        source: 'default',
        source_id: null,
        source_name: 'System Default',
      };
    }
  }

  /**
   * Set ideal cycle time for equipment or work center
   */
  static async setIdealCycleTime(input: SetCycleTimeInput): Promise<{
    success: boolean;
    cycleTime?: CycleTimeInfo;
    error?: string;
  }> {
    try {
      if (input.equipment_asset_id) {
        const { error } = await supabase
          .from('equipment_assets')
          .update({ ideal_cycle_time_seconds: input.cycle_time_seconds })
          .eq('id', input.equipment_asset_id);

        if (error) throw error;

        const { data: equipment } = await supabase
          .from('equipment_assets')
          .select('id, name')
          .eq('id', input.equipment_asset_id)
          .single();

        return {
          success: true,
          cycleTime: {
            cycle_time_seconds: input.cycle_time_seconds,
            source: 'equipment',
            source_id: input.equipment_asset_id,
            source_name: equipment?.name || null,
          },
        };
      }

      if (input.work_center_id) {
        const { error } = await supabase
          .from('work_centers')
          .update({ ideal_cycle_time_seconds: input.cycle_time_seconds })
          .eq('id', input.work_center_id);

        if (error) throw error;

        const { data: wc } = await supabase
          .from('work_centers')
          .select('id, name')
          .eq('id', input.work_center_id)
          .single();

        return {
          success: true,
          cycleTime: {
            cycle_time_seconds: input.cycle_time_seconds,
            source: 'work_center',
            source_id: input.work_center_id,
            source_name: wc?.name || null,
          },
        };
      }

      return { success: false, error: 'Must specify equipment_asset_id or work_center_id' };
    } catch (error: any) {
      console.error('Error setting cycle time:', error);
      return { success: false, error: error.message || 'Failed to set cycle time' };
    }
  }

  // ========== Production Counts ==========

  /**
   * Record production counts
   */
  static async recordProductionCount(input: RecordCountInput): Promise<{
    success: boolean;
    count?: ProductionCount;
    error?: string;
  }> {
    try {
      const { data: user } = await supabase.auth.getUser();

      // Validate that total = good + scrap + rework
      const scrapQty = input.scrap_qty ?? 0;
      const reworkQty = input.rework_qty ?? 0;
      const calculatedTotal = input.good_qty + scrapQty + reworkQty;

      if (Math.abs(calculatedTotal - input.total_qty) > 0.0001) {
        return {
          success: false,
          error: `Total quantity (${input.total_qty}) must equal good (${input.good_qty}) + scrap (${scrapQty}) + rework (${reworkQty})`,
        };
      }

      const { data, error } = await supabase
        .from('production_counts')
        .insert({
          operation_run_id: input.operation_run_id,
          production_order_id: input.production_order_id,
          work_center_id: input.work_center_id,
          equipment_asset_id: input.equipment_asset_id,
          count_timestamp: new Date().toISOString(),
          total_qty: input.total_qty,
          good_qty: input.good_qty,
          scrap_qty: scrapQty,
          rework_qty: reworkQty,
          scrap_reason_code_id: input.scrap_reason_code_id,
          rework_reason_code_id: input.rework_reason_code_id,
          recorded_by: user?.user?.id,
          notes: input.notes,
        })
        .select()
        .single();

      if (error) throw error;

      return { success: true, count: data as ProductionCount };
    } catch (error: any) {
      console.error('Error recording production count:', error);
      return { success: false, error: error.message || 'Failed to record count' };
    }
  }

  /**
   * Get production counts for a work center/period
   */
  static async getProductionCounts(
    workCenterId: string,
    fromDate: string,
    toDate: string
  ): Promise<ProductionCount[]> {
    try {
      const { data, error } = await supabase
        .from('production_counts')
        .select('*')
        .eq('work_center_id', workCenterId)
        .gte('count_timestamp', fromDate)
        .lte('count_timestamp', toDate)
        .order('count_timestamp', { ascending: true });

      if (error) throw error;

      return (data || []) as ProductionCount[];
    } catch (error) {
      console.error('Error getting production counts:', error);
      return [];
    }
  }

  /**
   * Get counts by operation run
   */
  static async getCountsByOperationRun(operationRunId: string): Promise<ProductionCount[]> {
    try {
      const { data, error } = await supabase
        .from('production_counts')
        .select('*')
        .eq('operation_run_id', operationRunId)
        .order('count_timestamp', { ascending: true });

      if (error) throw error;

      return (data || []) as ProductionCount[];
    } catch (error) {
      console.error('Error getting counts by operation run:', error);
      return [];
    }
  }

  /**
   * Get OEE snapshots
   */
  static async getOEESnapshots(filters: OEEFilters = {}): Promise<OEEMetrics[]> {
    try {
      let query = supabase
        .from('vw_oee_summary')
        .select('*')
        .order('period_start', { ascending: false });

      if (filters.grain) {
        query = query.eq('grain', filters.grain);
      }

      if (filters.scope_type) {
        query = query.eq('scope_type', filters.scope_type);
      }

      if (filters.scope_id) {
        query = query.eq('scope_id', filters.scope_id);
      }

      if (filters.from_date) {
        query = query.gte('period_start', filters.from_date);
      }

      if (filters.to_date) {
        query = query.lte('period_end', filters.to_date);
      }

      const { data, error } = await query;

      if (error) throw error;

      return (data || []).map(s => ({
        planned_production_time_seconds: s.planned_production_time_seconds,
        actual_run_time_seconds: s.actual_run_time_seconds,
        downtime_seconds: s.downtime_seconds,
        planned_downtime_seconds: s.planned_downtime_seconds,
        unplanned_downtime_seconds: s.unplanned_downtime_seconds,
        total_count: s.total_count,
        good_count: s.good_count,
        scrap_count: s.scrap_count,
        rework_count: s.rework_count,
        ideal_cycle_time_seconds: s.ideal_cycle_time_seconds,
        actual_cycle_time_seconds: s.actual_cycle_time_seconds,
        availability: s.availability_pct / 100,
        performance: s.performance_pct / 100,
        quality: s.quality_pct / 100,
        oee: s.oee_pct / 100,
        availability_pct: s.availability_pct,
        performance_pct: s.performance_pct,
        quality_pct: s.quality_pct,
        oee_pct: s.oee_pct,
        period_start: s.period_start,
        period_end: s.period_end,
        scope_type: s.scope_type,
        scope_id: s.scope_id,
        scope_name: s.scope_name,
      }));
    } catch (error) {
      console.error('Error getting OEE snapshots:', error);
      return [];
    }
  }

  // ========== Private Helper Methods ==========

  private static async getPlannedProductionTime(
    workCenterId: string,
    fromDate: string,
    toDate: string
  ): Promise<number> {
    // Calculate based on shift calendar or default
    // For now, use a simple calculation based on business hours
    const from = new Date(fromDate);
    const to = new Date(toDate);
    const diffMs = to.getTime() - from.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    // Assume 8 hours per day, 5 days a week
    // This is a simplification - in production, use shift calendars
    const hoursPerDay = this.DEFAULT_SHIFT_HOURS;
    const totalHours = Math.ceil(diffDays) * hoursPerDay;

    return totalHours * 60 * 60; // Return in seconds
  }

  private static async getDowntimeForPeriod(
    workCenterId: string,
    fromDate: string,
    toDate: string
  ): Promise<{ total: number; planned: number; unplanned: number }> {
    try {
      const { data: events, error } = await supabase
        .from('vw_downtime_log')
        .select('duration_seconds, is_planned')
        .eq('work_center_id', workCenterId)
        .gte('start_ts', fromDate)
        .lte('start_ts', toDate);

      if (error) throw error;

      let total = 0;
      let planned = 0;
      let unplanned = 0;

      for (const event of events || []) {
        const duration = event.duration_seconds || 0;
        total += duration;
        if (event.is_planned) {
          planned += duration;
        } else {
          unplanned += duration;
        }
      }

      return { total, planned, unplanned };
    } catch (error) {
      console.error('Error getting downtime for period:', error);
      return { total: 0, planned: 0, unplanned: 0 };
    }
  }

  private static async getShiftTimes(
    workCenterId: string,
    date: string,
    shiftName?: string
  ): Promise<{ start: string; end: string }> {
    // Get shift calendar for work center
    // For now, return defaults based on shift name
    const d = new Date(date);

    if (shiftName === '1st Shift') {
      d.setHours(6, 0, 0, 0);
      const start = d.toISOString();
      d.setHours(14, 0, 0, 0);
      return { start, end: d.toISOString() };
    } else if (shiftName === '2nd Shift') {
      d.setHours(14, 0, 0, 0);
      const start = d.toISOString();
      d.setHours(22, 0, 0, 0);
      return { start, end: d.toISOString() };
    } else if (shiftName === '3rd Shift') {
      d.setHours(22, 0, 0, 0);
      const start = d.toISOString();
      d.setDate(d.getDate() + 1);
      d.setHours(6, 0, 0, 0);
      return { start, end: d.toISOString() };
    }

    // Default: full day
    d.setHours(0, 0, 0, 0);
    const start = d.toISOString();
    d.setHours(23, 59, 59, 999);
    return { start, end: d.toISOString() };
  }

  private static getEmptyOEEMetrics(
    fromDate: string,
    toDate: string,
    scopeType: string,
    scopeId: string
  ): OEEMetrics {
    return {
      planned_production_time_seconds: 0,
      actual_run_time_seconds: 0,
      downtime_seconds: 0,
      planned_downtime_seconds: 0,
      unplanned_downtime_seconds: 0,
      total_count: 0,
      good_count: 0,
      scrap_count: 0,
      rework_count: 0,
      ideal_cycle_time_seconds: null,
      actual_cycle_time_seconds: null,
      availability: 0,
      performance: 0,
      quality: 0,
      oee: 0,
      availability_pct: 0,
      performance_pct: 0,
      quality_pct: 0,
      oee_pct: 0,
      period_start: fromDate,
      period_end: toDate,
      scope_type: scopeType,
      scope_id: scopeId,
    };
  }
}
