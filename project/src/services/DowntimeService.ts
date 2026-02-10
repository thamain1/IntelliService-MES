/**
 * DowntimeService
 * Handles downtime event management, classification, reason codes, and Pareto reporting.
 */

import { supabase } from '../lib/supabase';

// ========== Type Definitions ==========

export interface DowntimeEvent {
  id: string;
  equipment_state_event_id: string;
  equipment_asset_id: string;
  equipment_name: string | null;
  asset_code: string | null;
  work_center_id: string | null;
  work_center_name: string | null;
  work_center_code: string | null;
  state: 'RUN' | 'STOP' | 'IDLE' | 'CHANGEOVER' | 'PLANNED_STOP';
  start_ts: string;
  end_ts: string | null;
  duration_seconds: number | null;
  reason_code_id: string | null;
  reason_code: string | null;
  reason_name: string | null;
  reason_category: 'planned' | 'unplanned' | null;
  reason_group: 'mechanical' | 'electrical' | 'material' | 'quality' | 'ops' | 'other' | null;
  is_classified: boolean;
  is_planned: boolean;
  classification_notes: string | null;
  classified_by: string | null;
  classified_by_name: string | null;
  classified_at: string | null;
  source: string | null;
  notes: string | null;
}

export interface DowntimeReason {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: 'planned' | 'unplanned';
  reason_group: 'mechanical' | 'electrical' | 'material' | 'quality' | 'ops' | 'other';
  parent_code_id: string | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface StartDowntimeInput {
  equipment_asset_id: string;
  state?: 'STOP' | 'IDLE' | 'CHANGEOVER' | 'PLANNED_STOP';
  reason_code_id?: string;
  notes?: string;
  external_event_id?: string;
  source?: string;
}

export interface ClassifyDowntimeInput {
  reason_code_id: string;
  is_planned?: boolean;
  classification_notes?: string;
}

export interface CreateReasonInput {
  code: string;
  name: string;
  description?: string;
  category: 'planned' | 'unplanned';
  reason_group: 'mechanical' | 'electrical' | 'material' | 'quality' | 'ops' | 'other';
  parent_code_id?: string;
  display_order?: number;
}

export interface DowntimeSummary {
  total_events: number;
  total_duration_seconds: number;
  classified_events: number;
  unclassified_events: number;
  planned_duration_seconds: number;
  unplanned_duration_seconds: number;
  avg_duration_seconds: number;
  by_category: { category: string; count: number; duration_seconds: number }[];
  by_group: { group: string; count: number; duration_seconds: number }[];
}

export interface DowntimeParetoItem {
  code: string;
  name: string;
  category: 'planned' | 'unplanned';
  reason_group: string;
  count: number;
  duration_seconds: number;
  duration_minutes: number;
  percentage_of_total: number;
  cumulative_percentage: number;
}

export interface DowntimeFilters {
  work_center_id?: string;
  equipment_asset_id?: string;
  from_date?: string;
  to_date?: string;
  is_classified?: boolean;
  category?: 'planned' | 'unplanned';
  reason_group?: string;
}

// ========== DowntimeService Class ==========

export class DowntimeService {
  // ========== Event Operations ==========

  /**
   * Start a downtime event
   *
   * Includes duplicate check - will not create a new event if equipment
   * already has an active (ongoing) downtime.
   */
  static async startDowntime(input: StartDowntimeInput): Promise<{
    success: boolean;
    event?: DowntimeEvent;
    error?: string;
  }> {
    try {
      const { data: user } = await supabase.auth.getUser();

      // Check for existing active downtime on this equipment
      const { data: activeEvent } = await supabase
        .from('equipment_state_events')
        .select('id')
        .eq('equipment_asset_id', input.equipment_asset_id)
        .in('state', ['STOP', 'IDLE', 'CHANGEOVER', 'PLANNED_STOP'])
        .is('end_ts', null)
        .maybeSingle();

      if (activeEvent) {
        // Return the existing active event instead of creating duplicate
        const { data: existingDowntime } = await supabase
          .from('vw_downtime_log')
          .select('*')
          .eq('equipment_state_event_id', activeEvent.id)
          .single();

        return {
          success: false,
          error: 'Equipment already has an active downtime event. End the current event before starting a new one.',
          event: existingDowntime as DowntimeEvent,
        };
      }

      // Get work center from equipment asset
      const { data: asset } = await supabase
        .from('equipment_assets')
        .select('work_center_id')
        .eq('id', input.equipment_asset_id)
        .single();

      // Create equipment state event
      const { data: stateEvent, error: stateError } = await supabase
        .from('equipment_state_events')
        .insert({
          equipment_asset_id: input.equipment_asset_id,
          work_center_id: asset?.work_center_id,
          state: input.state || 'STOP',
          start_ts: new Date().toISOString(),
          external_event_id: input.external_event_id,
          source: input.source || 'manual',
          notes: input.notes,
          created_by: user?.user?.id,
        })
        .select()
        .single();

      if (stateError) throw stateError;

      // Create downtime event (auto-created by trigger, but we can update it)
      if (input.reason_code_id) {
        const { error: classifyError } = await supabase
          .from('downtime_events')
          .update({
            reason_code_id: input.reason_code_id,
            is_classified: true,
            classified_by: user?.user?.id,
            classified_at: new Date().toISOString(),
          })
          .eq('equipment_state_event_id', stateEvent.id);

        if (classifyError) console.error('Error pre-classifying downtime:', classifyError);
      }

      // Fetch the full downtime event
      const { data: downtimeEvent } = await supabase
        .from('vw_downtime_log')
        .select('*')
        .eq('equipment_state_event_id', stateEvent.id)
        .single();

      return { success: true, event: downtimeEvent as DowntimeEvent };
    } catch (error: unknown) {
      console.error('Error starting downtime:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to start downtime' 
      };
    }
  }

  /**
   * End a downtime event
   */
  static async endDowntime(
    equipmentStateEventId: string,
    endTs?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from('equipment_state_events')
        .update({
          end_ts: endTs || new Date().toISOString(),
        })
        .eq('id', equipmentStateEventId);

      if (error) throw error;

      return { success: true };
    } catch (error: unknown) {
      console.error('Error ending downtime:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to end downtime' 
      };
    }
  }

  /**
   * Classify a downtime event
   */
  static async classifyDowntime(
    downtimeEventId: string,
    input: ClassifyDowntimeInput
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { data: user } = await supabase.auth.getUser();

      // Get reason code to determine if planned
      const { data: reasonCode } = await supabase
        .from('downtime_reason_codes')
        .select('category')
        .eq('id', input.reason_code_id)
        .single();

      const isPlanned = input.is_planned ?? (reasonCode?.category === 'planned');

      const { error } = await supabase
        .from('downtime_events')
        .update({
          reason_code_id: input.reason_code_id,
          is_classified: true,
          is_planned: isPlanned,
          classification_notes: input.classification_notes,
          classified_by: user?.user?.id,
          classified_at: new Date().toISOString(),
        })
        .eq('id', downtimeEventId);

      if (error) throw error;

      return { success: true };
    } catch (error: unknown) {
      console.error('Error classifying downtime:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to classify downtime' 
      };
    }
  }

  /**
   * Auto-create downtime event (for external integration)
   */
  static async autoCreateDowntime(
    equipmentAssetId: string,
    startTs: string,
    endTs: string,
    externalEventId?: string
  ): Promise<{ success: boolean; event?: DowntimeEvent; error?: string }> {
    try {
      // Use the database function for idempotent ingestion
      const { data: eventId, error: fnError } = await supabase.rpc('fn_ingest_equipment_state_event', {
        p_equipment_asset_id: equipmentAssetId,
        p_state: 'STOP',
        p_start_ts: startTs,
        p_end_ts: endTs,
        p_external_event_id: externalEventId,
        p_source: 'auto',
      });

      if (fnError) throw fnError;

      // Fetch the created event
      const { data: event } = await supabase
        .from('vw_downtime_log')
        .select('*')
        .eq('equipment_state_event_id', eventId)
        .single();

      return { success: true, event: event as DowntimeEvent };
    } catch (error: unknown) {
      console.error('Error auto-creating downtime:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to auto-create downtime' 
      };
    }
  }

  /**
   * Get downtime events with filters
   */
  static async getDowntimeEvents(filters: DowntimeFilters = {}): Promise<DowntimeEvent[]> {
    try {
      let query = supabase
        .from('vw_downtime_log')
        .select('*')
        .order('start_ts', { ascending: false });

      if (filters.work_center_id) {
        query = query.eq('work_center_id', filters.work_center_id);
      }

      if (filters.equipment_asset_id) {
        query = query.eq('equipment_asset_id', filters.equipment_asset_id);
      }

      if (filters.from_date) {
        query = query.gte('start_ts', filters.from_date);
      }

      if (filters.to_date) {
        query = query.lte('start_ts', filters.to_date);
      }

      if (filters.is_classified !== undefined) {
        query = query.eq('is_classified', filters.is_classified);
      }

      if (filters.category) {
        query = query.eq('reason_category', filters.category);
      }

      if (filters.reason_group) {
        query = query.eq('reason_group', filters.reason_group);
      }

      const { data, error } = await query;

      if (error) throw error;

      return (data || []) as DowntimeEvent[];
    } catch (error) {
      console.error('Error getting downtime events:', error);
      return [];
    }
  }

  // ========== Reason Code Operations ==========

  /**
   * Get all reason codes
   */
  static async getReasons(activeOnly = true): Promise<DowntimeReason[]> {
    try {
      let query = supabase
        .from('downtime_reason_codes')
        .select('*')
        .order('display_order', { ascending: true })
        .order('name', { ascending: true });

      if (activeOnly) {
        query = query.eq('is_active', true);
      }

      const { data, error } = await query;

      if (error) throw error;

      return (data || []) as DowntimeReason[];
    } catch (error) {
      console.error('Error getting reason codes:', error);
      return [];
    }
  }

  /**
   * Create a new reason code
   */
  static async createReason(input: CreateReasonInput): Promise<{
    success: boolean;
    reason?: DowntimeReason;
    error?: string;
  }> {
    try {
      const { data, error } = await supabase
        .from('downtime_reason_codes')
        .insert({
          code: input.code,
          name: input.name,
          description: input.description,
          category: input.category,
          reason_group: input.reason_group,
          parent_code_id: input.parent_code_id,
          display_order: input.display_order ?? 0,
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;

      return { success: true, reason: data as DowntimeReason };
    } catch (error: unknown) {
      console.error('Error creating reason code:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to create reason code' 
      };
    }
  }

  /**
   * Update a reason code
   */
  static async updateReason(
    id: string,
    updates: Partial<CreateReasonInput & { is_active: boolean }>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from('downtime_reason_codes')
        .update(updates)
        .eq('id', id);

      if (error) throw error;

      return { success: true };
    } catch (error: unknown) {
      console.error('Error updating reason code:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to update reason code' 
      };
    }
  }

  /**
   * Deactivate a reason code (soft delete)
   */
  static async deactivateReason(id: string): Promise<{ success: boolean; error?: string }> {
    return this.updateReason(id, { is_active: false });
  }

  // ========== Reporting Operations ==========

  /**
   * Get downtime summary for a work center/equipment
   */
  static async getDowntimeSummary(
    workCenterId: string | null,
    fromDate: string,
    toDate: string
  ): Promise<DowntimeSummary> {
    try {
      const events = await this.getDowntimeEvents({
        work_center_id: workCenterId || undefined,
        from_date: fromDate,
        to_date: toDate,
      });

      const totalDuration = events.reduce((sum, e) => sum + (e.duration_seconds || 0), 0);
      const classifiedEvents = events.filter(e => e.is_classified);
      const plannedDuration = events
        .filter(e => e.is_planned)
        .reduce((sum, e) => sum + (e.duration_seconds || 0), 0);

      // Group by category
      const byCategory = new Map<string, { count: number; duration_seconds: number }>();
      const byGroup = new Map<string, { count: number; duration_seconds: number }>();

      for (const event of events) {
        const cat = event.reason_category || 'unclassified';
        const grp = event.reason_group || 'unclassified';

        if (!byCategory.has(cat)) {
          byCategory.set(cat, { count: 0, duration_seconds: 0 });
        }
        byCategory.get(cat)!.count++;
        byCategory.get(cat)!.duration_seconds += event.duration_seconds || 0;

        if (!byGroup.has(grp)) {
          byGroup.set(grp, { count: 0, duration_seconds: 0 });
        }
        byGroup.get(grp)!.count++;
        byGroup.get(grp)!.duration_seconds += event.duration_seconds || 0;
      }

      return {
        total_events: events.length,
        total_duration_seconds: totalDuration,
        classified_events: classifiedEvents.length,
        unclassified_events: events.length - classifiedEvents.length,
        planned_duration_seconds: plannedDuration,
        unplanned_duration_seconds: totalDuration - plannedDuration,
        avg_duration_seconds: events.length > 0 ? totalDuration / events.length : 0,
        by_category: Array.from(byCategory.entries()).map(([category, data]) => ({
          category,
          ...data,
        })),
        by_group: Array.from(byGroup.entries()).map(([group, data]) => ({
          group,
          ...data,
        })),
      };
    } catch (error) {
      console.error('Error getting downtime summary:', error);
      return {
        total_events: 0,
        total_duration_seconds: 0,
        classified_events: 0,
        unclassified_events: 0,
        planned_duration_seconds: 0,
        unplanned_duration_seconds: 0,
        avg_duration_seconds: 0,
        by_category: [],
        by_group: [],
      };
    }
  }

  /**
   * Get Pareto data by reason code
   */
  static async getParetoByReason(
    workCenterId: string | null,
    fromDate: string,
    toDate: string
  ): Promise<DowntimeParetoItem[]> {
    try {
      const events = await this.getDowntimeEvents({
        work_center_id: workCenterId || undefined,
        from_date: fromDate,
        to_date: toDate,
      });

      // Group by reason code
      const byReason = new Map<string, {
        code: string;
        name: string;
        category: 'planned' | 'unplanned';
        reason_group: string;
        count: number;
        duration_seconds: number;
      }>();

      for (const event of events) {
        const key = event.reason_code || 'UNCLASSIFIED';
        if (!byReason.has(key)) {
          byReason.set(key, {
            code: event.reason_code || 'UNCLASSIFIED',
            name: event.reason_name || 'Unclassified',
            category: event.reason_category || 'unplanned',
            reason_group: event.reason_group || 'other',
            count: 0,
            duration_seconds: 0,
          });
        }
        byReason.get(key)!.count++;
        byReason.get(key)!.duration_seconds += event.duration_seconds || 0;
      }

      // Sort by duration descending and calculate percentages
      const sorted = Array.from(byReason.values())
        .sort((a, b) => b.duration_seconds - a.duration_seconds);

      const totalDuration = sorted.reduce((sum, r) => sum + r.duration_seconds, 0);
      let cumulativeDuration = 0;

      return sorted.map(item => {
        cumulativeDuration += item.duration_seconds;
        return {
          ...item,
          duration_minutes: Math.round(item.duration_seconds / 60),
          percentage_of_total: totalDuration > 0 ? (item.duration_seconds / totalDuration) * 100 : 0,
          cumulative_percentage: totalDuration > 0 ? (cumulativeDuration / totalDuration) * 100 : 0,
        };
      });
    } catch (error) {
      console.error('Error getting Pareto by reason:', error);
      return [];
    }
  }

  /**
   * Get Pareto data by category
   */
  static async getParetoByCategory(
    workCenterId: string | null,
    fromDate: string,
    toDate: string
  ): Promise<DowntimeParetoItem[]> {
    try {
      const events = await this.getDowntimeEvents({
        work_center_id: workCenterId || undefined,
        from_date: fromDate,
        to_date: toDate,
      });

      // Group by category
      const byCategory = new Map<string, {
        code: string;
        name: string;
        category: 'planned' | 'unplanned';
        reason_group: string;
        count: number;
        duration_seconds: number;
      }>();

      for (const event of events) {
        const cat = event.reason_category || 'unplanned';
        if (!byCategory.has(cat)) {
          byCategory.set(cat, {
            code: cat.toUpperCase(),
            name: cat.charAt(0).toUpperCase() + cat.slice(1),
            category: cat as 'planned' | 'unplanned',
            reason_group: 'all',
            count: 0,
            duration_seconds: 0,
          });
        }
        byCategory.get(cat)!.count++;
        byCategory.get(cat)!.duration_seconds += event.duration_seconds || 0;
      }

      // Sort by duration descending and calculate percentages
      const sorted = Array.from(byCategory.values())
        .sort((a, b) => b.duration_seconds - a.duration_seconds);

      const totalDuration = sorted.reduce((sum, r) => sum + r.duration_seconds, 0);
      let cumulativeDuration = 0;

      return sorted.map(item => {
        cumulativeDuration += item.duration_seconds;
        return {
          ...item,
          duration_minutes: Math.round(item.duration_seconds / 60),
          percentage_of_total: totalDuration > 0 ? (item.duration_seconds / totalDuration) * 100 : 0,
          cumulative_percentage: totalDuration > 0 ? (cumulativeDuration / totalDuration) * 100 : 0,
        };
      });
    } catch (error) {
      console.error('Error getting Pareto by category:', error);
      return [];
    }
  }

  /**
   * Get Pareto data by reason group
   */
  static async getParetoByGroup(
    workCenterId: string | null,
    fromDate: string,
    toDate: string
  ): Promise<DowntimeParetoItem[]> {
    try {
      const events = await this.getDowntimeEvents({
        work_center_id: workCenterId || undefined,
        from_date: fromDate,
        to_date: toDate,
      });

      // Group by reason_group
      const byGroup = new Map<string, {
        code: string;
        name: string;
        category: 'planned' | 'unplanned';
        reason_group: string;
        count: number;
        duration_seconds: number;
      }>();

      for (const event of events) {
        const grp = event.reason_group || 'other';
        if (!byGroup.has(grp)) {
          byGroup.set(grp, {
            code: grp.toUpperCase(),
            name: grp.charAt(0).toUpperCase() + grp.slice(1),
            category: 'unplanned',
            reason_group: grp,
            count: 0,
            duration_seconds: 0,
          });
        }
        byGroup.get(grp)!.count++;
        byGroup.get(grp)!.duration_seconds += event.duration_seconds || 0;
      }

      // Sort by duration descending and calculate percentages
      const sorted = Array.from(byGroup.values())
        .sort((a, b) => b.duration_seconds - a.duration_seconds);

      const totalDuration = sorted.reduce((sum, r) => sum + r.duration_seconds, 0);
      let cumulativeDuration = 0;

      return sorted.map(item => {
        cumulativeDuration += item.duration_seconds;
        return {
          ...item,
          duration_minutes: Math.round(item.duration_seconds / 60),
          percentage_of_total: totalDuration > 0 ? (item.duration_seconds / totalDuration) * 100 : 0,
          cumulative_percentage: totalDuration > 0 ? (cumulativeDuration / totalDuration) * 100 : 0,
        };
      });
    } catch (error) {
      console.error('Error getting Pareto by group:', error);
      return [];
    }
  }

  /**
   * Get active (ongoing) downtime events
   */
  static async getActiveDowntimeEvents(workCenterId?: string): Promise<DowntimeEvent[]> {
    try {
      let query = supabase
        .from('vw_downtime_log')
        .select('*')
        .is('end_ts', null)
        .order('start_ts', { ascending: false });

      if (workCenterId) {
        query = query.eq('work_center_id', workCenterId);
      }

      const { data, error } = await query;

      if (error) throw error;

      return (data || []) as DowntimeEvent[];
    } catch (error) {
      console.error('Error getting active downtime events:', error);
      return [];
    }
  }
}
