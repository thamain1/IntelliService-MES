/**
 * QualityExecutionService
 *
 * Handles quality execution operations including:
 * - Inspection plan management
 * - Inspection run execution
 * - Measurement recording with audit trail
 * - NCR creation and disposition
 * - CAPA management
 *
 * Integrates with work orders and traveler workflow.
 */

import { supabase } from '../lib/supabase';

// =====================================================
// TYPES
// =====================================================

export type InspectionPlanType = 'INCOMING' | 'IN_PROCESS' | 'FINAL' | 'AUDIT';
export type InspectionAppliesTo = 'PRODUCT' | 'OPERATION' | 'WORK_CENTER' | 'ASSET' | 'VENDOR_PART';
export type CharacteristicType = 'VARIABLE' | 'ATTRIBUTE';
export type DataCaptureType = 'numeric' | 'pass_fail' | 'count' | 'text' | 'photo';
export type SamplingMethod = '100_PERCENT' | 'EVERY_N' | 'PER_LOT' | 'AQL';
export type InspectionRunStatus = 'PENDING' | 'IN_PROGRESS' | 'PASSED' | 'FAILED' | 'WAIVED';
export type NCSource = 'INSPECTION' | 'OPERATOR_REPORTED' | 'CUSTOMER_RETURN' | 'AUDIT';
export type NCSeverity = 'MINOR' | 'MAJOR' | 'CRITICAL';
export type NCStatus = 'OPEN' | 'UNDER_REVIEW' | 'DISPOSITIONED' | 'CLOSED';
export type DispositionType = 'SCRAP' | 'REWORK' | 'USE_AS_IS' | 'RETURN_TO_VENDOR' | 'SORT_100';
export type CAPAStatus = 'OPEN' | 'IN_PROGRESS' | 'VERIFIED' | 'CLOSED';

export interface SamplingPlan {
  id: string;
  name: string;
  description?: string;
  method: SamplingMethod;
  sample_size?: number;
  frequency_n?: number;
  aql_level?: string;
  is_active: boolean;
}

export interface InspectionPlan {
  id: string;
  name: string;
  description?: string;
  plan_type: InspectionPlanType;
  applies_to?: InspectionAppliesTo;
  product_id?: string;
  production_step_id?: string;
  operation_id?: string;
  work_center_id?: string;
  equipment_asset_id?: string;
  vendor_id?: string;
  part_id?: string;
  revision?: string;
  version?: string; // Alias for revision
  effective_date?: string;
  is_active: boolean;
  created_by?: string;
  sampling_plan_id?: string;
  sampling_plan?: SamplingPlan;
  characteristics?: Characteristic[];
}

export interface Characteristic {
  id: string;
  inspection_plan_id?: string;
  plan_id?: string; // Alias for inspection_plan_id
  name: string;
  description?: string;
  char_type?: CharacteristicType;
  characteristic_type?: CharacteristicType; // Alias for char_type
  uom?: string;
  target_value?: number;
  nominal?: number; // Alias for target_value
  lsl?: number;
  usl?: number;
  sampling_plan_id?: string;
  data_capture?: DataCaptureType;
  is_critical?: boolean;
  required?: boolean;
  instructions?: string;
  sequence?: number;
  is_active?: boolean;
}

export interface InspectionRun {
  id: string;
  inspection_plan_id: string;
  production_order_id?: string;
  operation_run_id?: string;
  work_center_id?: string;
  equipment_asset_id?: string;
  lot_id?: string;
  serial_id?: string;
  status: InspectionRunStatus;
  started_at?: string;
  completed_at?: string;
  inspector_id?: string;
  total_characteristics: number;
  passed_characteristics: number;
  failed_characteristics: number;
  notes?: string;
  plan?: InspectionPlan;
  measurements?: Measurement[];
}

export interface Measurement {
  id: string;
  inspection_run_id: string;
  characteristic_id: string;
  measured_value?: number;
  pass_fail?: boolean;
  defect_count?: number;
  notes?: string;
  attachment_url?: string;
  is_within_spec?: boolean;
  revision_number: number;
  recorded_by?: string;
  recorded_at: string;
  characteristic?: Characteristic;
}

export interface MeasurementInput {
  characteristic_id: string;
  measured_value?: number;
  pass_fail?: boolean;
  defect_count?: number;
  notes?: string;
  attachment_url?: string;
}

export interface DefectCode {
  id: string;
  code: string;
  name: string;
  description?: string;
  category?: string;
  severity_default?: NCSeverity;
  severity?: NCSeverity; // Alias for severity_default
  is_active: boolean;
}

export interface Nonconformance {
  id: string;
  nc_number: string;
  source: NCSource;
  inspection_run_id?: string;
  production_order_id?: string;
  operation_run_id?: string;
  lot_id?: string;
  serial_id?: string;
  part_id?: string;
  product_id?: string;
  severity: NCSeverity;
  status: NCStatus;
  title: string;
  description?: string;
  qty_affected: number;
  reported_by?: string;
  assigned_to?: string;
  reported_at: string;
  closed_at?: string;
  defects?: NCDefect[];
  disposition?: Disposition;
  capa?: CAPA;
}

export interface NCDefect {
  id: string;
  nonconformance_id: string;
  defect_code_id: string;
  qty_affected: number;
  notes?: string;
  defect_code?: DefectCode;
}

export interface Disposition {
  id: string;
  nonconformance_id: string;
  disposition: DispositionType;
  instructions?: string;
  approved_by?: string;
  approved_at?: string;
  executed_by?: string;
  executed_at?: string;
  execution_notes?: string;
}

export interface CAPA {
  id: string;
  capa_number: string;
  nonconformance_id?: string;
  root_cause?: string;
  root_cause_method?: string;
  corrective_action?: string;
  corrective_due_date?: string;
  corrective_completed_at?: string;
  preventive_action?: string;
  preventive_due_date?: string;
  preventive_completed_at?: string;
  owner_id?: string;
  status: CAPAStatus;
  verified_by?: string;
  verified_at?: string;
  verification_notes?: string;
}

export interface CreateInspectionRunInput {
  inspection_plan_id: string;
  production_order_id?: string;
  operation_run_id?: string;
  work_center_id?: string;
  equipment_asset_id?: string;
  lot_id?: string;
  serial_id?: string;
}

export interface CreateNCInput {
  source: NCSource;
  inspection_run_id?: string;
  production_order_id?: string;
  operation_run_id?: string;
  lot_id?: string;
  serial_id?: string;
  part_id?: string;
  product_id?: string;
  severity: NCSeverity;
  title: string;
  description?: string;
  qty_affected?: number;
  defect_codes?: { defect_code_id: string; qty_affected?: number; notes?: string }[];
}

export interface DispositionInput {
  nonconformance_id: string;
  disposition: DispositionType;
  instructions?: string;
}

// =====================================================
// SERVICE CLASS
// =====================================================

class QualityExecutionServiceClass {
  // =====================================================
  // SAMPLING PLANS
  // =====================================================

  async getSamplingPlans(activeOnly = true): Promise<SamplingPlan[]> {
    let query = supabase
      .from('quality_sampling_plans')
      .select('*')
      .order('name');

    if (activeOnly) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  // =====================================================
  // INSPECTION PLANS
  // =====================================================

  async getInspectionPlans(filters?: {
    plan_type?: InspectionPlanType;
    applies_to?: InspectionAppliesTo;
    product_id?: string;
    work_center_id?: string;
    activeOnly?: boolean;
  }): Promise<InspectionPlan[]> {
    let query = supabase
      .from('quality_inspection_plans')
      .select(`
        *,
        characteristics:quality_characteristics(*),
        sampling_plan:quality_sampling_plans(*)
      `)
      .order('name');

    if (filters?.plan_type) {
      query = query.eq('plan_type', filters.plan_type);
    }
    if (filters?.applies_to) {
      query = query.eq('applies_to', filters.applies_to);
    }
    if (filters?.product_id) {
      query = query.eq('product_id', filters.product_id);
    }
    if (filters?.work_center_id) {
      query = query.eq('work_center_id', filters.work_center_id);
    }
    if (filters?.activeOnly !== false) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Map compatibility fields
    return (data || []).map(p => ({
      ...p,
      version: p.revision,
    }));
  }

  async getInspectionPlan(id: string): Promise<InspectionPlan | null> {
    const { data, error } = await supabase
      .from('quality_inspection_plans')
      .select(`
        *,
        characteristics:quality_characteristics(*)
      `)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return data;
  }

  async createInspectionPlan(input: Partial<InspectionPlan>): Promise<InspectionPlan> {
    // Map compatibility fields
    const plan: Record<string, unknown> = {
      name: input.name,
      plan_type: input.plan_type,
      revision: input.version || input.revision || '1.0',
      is_active: input.is_active ?? true,
      applies_to: input.applies_to || 'OPERATION',
    };

    if (input.part_id) plan.part_id = input.part_id;
    if (input.operation_id) plan.production_step_id = input.operation_id;
    if (input.work_center_id) plan.work_center_id = input.work_center_id;
    if (input.sampling_plan_id) plan.sampling_plan_id = input.sampling_plan_id;
    if (input.description) plan.description = input.description;

    const { data, error } = await supabase
      .from('quality_inspection_plans')
      .insert(plan)
      .select()
      .single();

    if (error) throw error;
    return {
      ...data,
      version: data.revision,
    };
  }

  async updateInspectionPlan(id: string, updates: Partial<InspectionPlan>): Promise<InspectionPlan> {
    // Map compatibility fields
    const dbUpdates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.plan_type !== undefined) dbUpdates.plan_type = updates.plan_type;
    if (updates.version !== undefined) dbUpdates.revision = updates.version;
    if (updates.revision !== undefined) dbUpdates.revision = updates.revision;
    if (updates.is_active !== undefined) dbUpdates.is_active = updates.is_active;
    if (updates.sampling_plan_id !== undefined) dbUpdates.sampling_plan_id = updates.sampling_plan_id;
    if (updates.description !== undefined) dbUpdates.description = updates.description;

    const { data, error } = await supabase
      .from('quality_inspection_plans')
      .update(dbUpdates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return {
      ...data,
      version: data.revision,
    };
  }

  // =====================================================
  // CHARACTERISTICS
  // =====================================================

  async getCharacteristics(planId: string): Promise<Characteristic[]> {
    const { data, error } = await supabase
      .from('quality_characteristics')
      .select('*')
      .eq('inspection_plan_id', planId)
      .eq('is_active', true)
      .order('sequence');

    if (error) throw error;

    // Map field names for compatibility
    return (data || []).map(c => ({
      ...c,
      plan_id: c.inspection_plan_id,
      characteristic_type: c.char_type,
      nominal: c.target_value,
    }));
  }

  async createCharacteristic(planId: string, input: Partial<Characteristic>): Promise<Characteristic> {
    const characteristic = {
      inspection_plan_id: planId,
      name: input.name,
      char_type: input.characteristic_type || input.char_type || 'VARIABLE',
      target_value: input.nominal ?? input.target_value,
      lsl: input.lsl,
      usl: input.usl,
      uom: input.uom,
      is_critical: input.is_critical || false,
      instructions: input.instructions,
      sequence: input.sequence || 1,
      is_active: true,
      required: true,
      data_capture: 'numeric',
    };

    const { data, error } = await supabase
      .from('quality_characteristics')
      .insert(characteristic)
      .select()
      .single();

    if (error) throw error;
    return {
      ...data,
      plan_id: data.inspection_plan_id,
      characteristic_type: data.char_type,
      nominal: data.target_value,
    };
  }

  async createCharacteristicLegacy(characteristic: Omit<Characteristic, 'id'>): Promise<Characteristic> {
    const { data, error } = await supabase
      .from('quality_characteristics')
      .insert(characteristic)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async updateCharacteristic(id: string, updates: Partial<Characteristic>): Promise<Characteristic> {
    // Map compatibility fields to database fields
    const dbUpdates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.characteristic_type !== undefined) dbUpdates.char_type = updates.characteristic_type;
    if (updates.char_type !== undefined) dbUpdates.char_type = updates.char_type;
    if (updates.nominal !== undefined) dbUpdates.target_value = updates.nominal;
    if (updates.target_value !== undefined) dbUpdates.target_value = updates.target_value;
    if (updates.lsl !== undefined) dbUpdates.lsl = updates.lsl;
    if (updates.usl !== undefined) dbUpdates.usl = updates.usl;
    if (updates.uom !== undefined) dbUpdates.uom = updates.uom;
    if (updates.is_critical !== undefined) dbUpdates.is_critical = updates.is_critical;
    if (updates.instructions !== undefined) dbUpdates.instructions = updates.instructions;
    if (updates.sequence !== undefined) dbUpdates.sequence = updates.sequence;

    const { data, error } = await supabase
      .from('quality_characteristics')
      .update(dbUpdates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return {
      ...data,
      plan_id: data.inspection_plan_id,
      characteristic_type: data.char_type,
      nominal: data.target_value,
    };
  }

  async deleteCharacteristic(id: string): Promise<void> {
    // Soft delete by deactivating
    const { error } = await supabase
      .from('quality_characteristics')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;
  }

  // =====================================================
  // INSPECTION RUNS
  // =====================================================

  async getInspectionRuns(filters?: {
    status?: InspectionRunStatus;
    production_order_id?: string;
    operation_run_id?: string;
    work_center_id?: string;
    inspector_id?: string;
  }): Promise<InspectionRun[]> {
    let query = supabase
      .from('quality_inspection_runs')
      .select(`
        *,
        plan:quality_inspection_plans(*),
        measurements:quality_measurements(
          *,
          characteristic:quality_characteristics(*)
        )
      `)
      .order('created_at', { ascending: false });

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.production_order_id) {
      query = query.eq('production_order_id', filters.production_order_id);
    }
    if (filters?.operation_run_id) {
      query = query.eq('operation_run_id', filters.operation_run_id);
    }
    if (filters?.work_center_id) {
      query = query.eq('work_center_id', filters.work_center_id);
    }
    if (filters?.inspector_id) {
      query = query.eq('inspector_id', filters.inspector_id);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async getInspectionRun(id: string): Promise<InspectionRun | null> {
    const { data, error } = await supabase
      .from('quality_inspection_runs')
      .select(`
        *,
        plan:quality_inspection_plans(
          *,
          characteristics:quality_characteristics(*)
        ),
        measurements:quality_measurements(
          *,
          characteristic:quality_characteristics(*)
        )
      `)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return data;
  }

  async createInspectionRun(input: CreateInspectionRunInput): Promise<InspectionRun> {
    // Get the plan to count characteristics
    const plan = await this.getInspectionPlan(input.inspection_plan_id);
    if (!plan) {
      throw new Error('Inspection plan not found');
    }

    const activeCharacteristics = plan.characteristics?.filter(c => c.is_active && c.required) || [];

    const { data, error } = await supabase
      .from('quality_inspection_runs')
      .insert({
        ...input,
        status: 'PENDING',
        total_characteristics: activeCharacteristics.length,
        passed_characteristics: 0,
        failed_characteristics: 0,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async startInspection(runId: string, inspectorId: string): Promise<InspectionRun> {
    const { data, error } = await supabase
      .from('quality_inspection_runs')
      .update({
        status: 'IN_PROGRESS',
        started_at: new Date().toISOString(),
        inspector_id: inspectorId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', runId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async recordMeasurement(runId: string, input: MeasurementInput): Promise<Measurement> {
    // Get characteristic to determine spec compliance
    const { data: characteristic, error: charError } = await supabase
      .from('quality_characteristics')
      .select('*')
      .eq('id', input.characteristic_id)
      .single();

    if (charError) throw charError;

    // Determine if within spec
    let isWithinSpec: boolean | null = null;

    if (characteristic.char_type === 'VARIABLE' && input.measured_value !== undefined) {
      const value = input.measured_value;
      const hasLsl = characteristic.lsl !== null;
      const hasUsl = characteristic.usl !== null;

      if (hasLsl && hasUsl) {
        isWithinSpec = value >= characteristic.lsl && value <= characteristic.usl;
      } else if (hasLsl) {
        isWithinSpec = value >= characteristic.lsl;
      } else if (hasUsl) {
        isWithinSpec = value <= characteristic.usl;
      } else {
        isWithinSpec = true; // No limits defined
      }
    } else if (characteristic.char_type === 'ATTRIBUTE' && input.pass_fail !== undefined) {
      isWithinSpec = input.pass_fail;
    }

    // Check if measurement already exists for this characteristic
    const { data: existingMeasurement } = await supabase
      .from('quality_measurements')
      .select('id')
      .eq('inspection_run_id', runId)
      .eq('characteristic_id', input.characteristic_id)
      .single();

    let measurement: Measurement;

    if (existingMeasurement) {
      // Update existing measurement (will trigger audit)
      const { data, error } = await supabase
        .from('quality_measurements')
        .update({
          ...input,
          is_within_spec: isWithinSpec,
          recorded_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingMeasurement.id)
        .select()
        .single();

      if (error) throw error;
      measurement = data;
    } else {
      // Create new measurement
      const { data, error } = await supabase
        .from('quality_measurements')
        .insert({
          inspection_run_id: runId,
          ...input,
          is_within_spec: isWithinSpec,
          revision_number: 1,
          recorded_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;
      measurement = data;
    }

    // Update run statistics
    await this.updateRunStatistics(runId);

    return measurement;
  }

  async recordMeasurements(runId: string, measurements: MeasurementInput[]): Promise<Measurement[]> {
    const results: Measurement[] = [];

    for (const m of measurements) {
      const result = await this.recordMeasurement(runId, m);
      results.push(result);
    }

    return results;
  }

  private async updateRunStatistics(runId: string): Promise<void> {
    // Count passed/failed measurements
    const { data: measurements, error } = await supabase
      .from('quality_measurements')
      .select('is_within_spec')
      .eq('inspection_run_id', runId);

    if (error) throw error;

    const passed = measurements?.filter(m => m.is_within_spec === true).length || 0;
    const failed = measurements?.filter(m => m.is_within_spec === false).length || 0;

    await supabase
      .from('quality_inspection_runs')
      .update({
        passed_characteristics: passed,
        failed_characteristics: failed,
        updated_at: new Date().toISOString(),
      })
      .eq('id', runId);
  }

  async completeInspection(runId: string): Promise<InspectionRun> {
    // Get current run with measurements
    const run = await this.getInspectionRun(runId);
    if (!run) throw new Error('Inspection run not found');

    // Determine pass/fail status
    const status: InspectionRunStatus = run.failed_characteristics > 0 ? 'FAILED' : 'PASSED';

    const { data, error } = await supabase
      .from('quality_inspection_runs')
      .update({
        status,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', runId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async waiveInspection(runId: string, reason: string): Promise<InspectionRun> {
    const { data, error } = await supabase
      .from('quality_inspection_runs')
      .update({
        status: 'WAIVED',
        notes: reason,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', runId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // =====================================================
  // AUTO-CREATE INSPECTIONS
  // =====================================================

  async createInspectionsForWorkOrder(
    productionOrderId: string,
    workCenterId?: string,
    operationRunId?: string
  ): Promise<InspectionRun[]> {
    // Find applicable inspection plans
    const plans = await this.getInspectionPlans({
      plan_type: 'IN_PROCESS',
      activeOnly: true,
    });

    const runs: InspectionRun[] = [];

    for (const plan of plans) {
      // Check if plan applies to this context
      if (plan.work_center_id && plan.work_center_id !== workCenterId) continue;

      const run = await this.createInspectionRun({
        inspection_plan_id: plan.id,
        production_order_id: productionOrderId,
        operation_run_id: operationRunId,
        work_center_id: workCenterId,
      });

      runs.push(run);
    }

    return runs;
  }

  // =====================================================
  // DEFECT CODES
  // =====================================================

  async getDefectCodes(activeOnly = true): Promise<DefectCode[]> {
    let query = supabase
      .from('quality_defect_codes')
      .select('*')
      .order('category')
      .order('code');

    if (activeOnly) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async createDefectCode(code: Omit<DefectCode, 'id'>): Promise<DefectCode> {
    const { data, error } = await supabase
      .from('quality_defect_codes')
      .insert(code)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async updateDefectCode(id: string, updates: Partial<DefectCode>): Promise<DefectCode> {
    const { data, error } = await supabase
      .from('quality_defect_codes')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async deactivateDefectCode(id: string): Promise<void> {
    const { error } = await supabase
      .from('quality_defect_codes')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;
  }

  // =====================================================
  // NONCONFORMANCES
  // =====================================================

  async getNonconformances(filters?: {
    status?: NCStatus;
    severity?: NCSeverity;
    source?: NCSource;
    production_order_id?: string;
    part_id?: string;
  }): Promise<Nonconformance[]> {
    let query = supabase
      .from('quality_nonconformances')
      .select(`
        *,
        defects:quality_nc_defects(
          *,
          defect_code:quality_defect_codes(*)
        ),
        disposition:quality_dispositions(*),
        capa:quality_capa(*)
      `)
      .order('reported_at', { ascending: false });

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.severity) {
      query = query.eq('severity', filters.severity);
    }
    if (filters?.source) {
      query = query.eq('source', filters.source);
    }
    if (filters?.production_order_id) {
      query = query.eq('production_order_id', filters.production_order_id);
    }
    if (filters?.part_id) {
      query = query.eq('part_id', filters.part_id);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async getNonconformance(id: string): Promise<Nonconformance | null> {
    const { data, error } = await supabase
      .from('quality_nonconformances')
      .select(`
        *,
        defects:quality_nc_defects(
          *,
          defect_code:quality_defect_codes(*)
        ),
        disposition:quality_dispositions(*),
        capa:quality_capa(*)
      `)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return data;
  }

  async createNonconformance(input: CreateNCInput): Promise<Nonconformance> {
    const { defect_codes, ...ncData } = input;

    // Create the NCR
    const { data: nc, error: ncError } = await supabase
      .from('quality_nonconformances')
      .insert({
        ...ncData,
        qty_affected: ncData.qty_affected || 1,
      })
      .select()
      .single();

    if (ncError) throw ncError;

    // Add defect codes if provided
    if (defect_codes && defect_codes.length > 0) {
      const defects = defect_codes.map(d => ({
        nonconformance_id: nc.id,
        defect_code_id: d.defect_code_id,
        qty_affected: d.qty_affected || 1,
        notes: d.notes,
      }));

      const { error: defectError } = await supabase
        .from('quality_nc_defects')
        .insert(defects);

      if (defectError) throw defectError;
    }

    return nc;
  }

  async updateNonconformance(id: string, updates: Partial<Nonconformance>): Promise<Nonconformance> {
    const { data, error } = await supabase
      .from('quality_nonconformances')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async addDefectToNC(ncId: string, defectCodeId: string, qtyAffected?: number, notes?: string): Promise<NCDefect> {
    const { data, error } = await supabase
      .from('quality_nc_defects')
      .insert({
        nonconformance_id: ncId,
        defect_code_id: defectCodeId,
        qty_affected: qtyAffected || 1,
        notes,
      })
      .select(`
        *,
        defect_code:quality_defect_codes(*)
      `)
      .single();

    if (error) throw error;
    return data;
  }

  // =====================================================
  // DISPOSITIONS
  // =====================================================

  async createDisposition(input: DispositionInput): Promise<Disposition> {
    const { data, error } = await supabase
      .from('quality_dispositions')
      .insert(input)
      .select()
      .single();

    if (error) throw error;

    // Update NC status
    await this.updateNonconformance(input.nonconformance_id, {
      status: 'DISPOSITIONED',
    });

    return data;
  }

  async approveDisposition(dispositionId: string, approvedBy: string): Promise<Disposition> {
    const { data, error } = await supabase
      .from('quality_dispositions')
      .update({
        approved_by: approvedBy,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', dispositionId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async executeDisposition(
    dispositionId: string,
    executedBy: string,
    notes?: string
  ): Promise<Disposition> {
    const { data, error } = await supabase
      .from('quality_dispositions')
      .update({
        executed_by: executedBy,
        executed_at: new Date().toISOString(),
        execution_notes: notes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', dispositionId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // =====================================================
  // CAPA
  // =====================================================

  async getCAPAs(filters?: {
    status?: CAPAStatus;
    owner_id?: string;
    nonconformance_id?: string;
  }): Promise<CAPA[]> {
    let query = supabase
      .from('quality_capa')
      .select('*')
      .order('created_at', { ascending: false });

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.owner_id) {
      query = query.eq('owner_id', filters.owner_id);
    }
    if (filters?.nonconformance_id) {
      query = query.eq('nonconformance_id', filters.nonconformance_id);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async createCAPA(input: Partial<CAPA>): Promise<CAPA> {
    const { data, error } = await supabase
      .from('quality_capa')
      .insert(input)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async updateCAPA(id: string, updates: Partial<CAPA>): Promise<CAPA> {
    const { data, error } = await supabase
      .from('quality_capa')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async verifyCAPA(id: string, verifiedBy: string, notes?: string): Promise<CAPA> {
    const { data, error } = await supabase
      .from('quality_capa')
      .update({
        status: 'VERIFIED',
        verified_by: verifiedBy,
        verified_at: new Date().toISOString(),
        verification_notes: notes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async closeCAPA(id: string): Promise<CAPA> {
    const { data, error } = await supabase
      .from('quality_capa')
      .update({
        status: 'CLOSED',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // =====================================================
  // REPORTING
  // =====================================================

  async getInspectionQueue(workCenterId?: string): Promise<InspectionRun[]> {
    let query = supabase
      .from('vw_quality_inspection_queue')
      .select('*')
      .in('status', ['PENDING', 'IN_PROGRESS'])
      .order('created_at');

    if (workCenterId) {
      query = query.eq('work_center_id', workCenterId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async getNCRSummary(): Promise<Record<string, unknown>[]> {
    const { data, error } = await supabase
      .from('vw_quality_ncr_summary')
      .select('*')
      .order('reported_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async getDefectPareto(): Promise<Record<string, unknown>[]> {
    const { data, error } = await supabase
      .from('vw_quality_defect_pareto')
      .select('*')
      .order('occurrence_count', { ascending: false });

    if (error) throw error;
    return data || [];
  }
}

export const QualityExecutionService = new QualityExecutionServiceClass();
