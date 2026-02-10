/**
 * SPCService
 *
 * Statistical Process Control service for Six Sigma-style analysis:
 * - Control chart datasets (X-bar, R, Individual-MR)
 * - Cp/Cpk and Pp/Ppk calculations
 * - DPMO and Sigma level calculations
 * - Western Electric / Nelson rule violation detection
 *
 * Does not overbuild - stores points/subgroups and computes metrics in service layer.
 */

import { supabase } from '../lib/supabase';

// =====================================================
// TYPES
// =====================================================

export type SPCViolationType =
  | 'WESTERN_ELECTRIC_1' | 'WESTERN_ELECTRIC_2' | 'WESTERN_ELECTRIC_3' | 'WESTERN_ELECTRIC_4'
  | 'NELSON_1' | 'NELSON_2' | 'NELSON_3' | 'NELSON_4' | 'NELSON_5' | 'NELSON_6' | 'NELSON_7' | 'NELSON_8';

export interface SPCSubgroup {
  id: string;
  characteristic_id: string;
  work_center_id?: string;
  equipment_asset_id?: string;
  product_id?: string;
  operation_id?: string;
  subgroup_ts: string;
  n: number;
  mean?: number;
  range_value?: number;
  stddev?: number;
  min_value?: number;
  max_value?: number;
  points?: SPCPoint[];
}

export interface SPCPoint {
  id: string;
  subgroup_id: string;
  measured_value: number;
  sequence: number;
  measurement_id?: string;
}

export interface SPCRuleViolation {
  id: string;
  characteristic_id: string;
  subgroup_id?: string;
  violation_type: SPCViolationType;
  detected_at: string;
  details?: Record<string, unknown>;
  acknowledged_by?: string;
  acknowledged_at?: string;
  acknowledgment_notes?: string;
}

export interface ControlLimits {
  ucl: number; // Upper Control Limit
  lcl: number; // Lower Control Limit
  centerLine: number; // Mean/center line
  usl?: number; // Upper Spec Limit (from characteristic)
  lsl?: number; // Lower Spec Limit (from characteristic)
  target?: number; // Target value (from characteristic)
}

export interface ProcessCapability {
  cp?: number;
  cpk?: number;
  pp?: number;
  ppk?: number;
  cpu?: number; // Upper capability
  cpl?: number; // Lower capability
  sigmaLevel?: number;
  dpmo?: number;
  ppm?: number;
  mean: number;
  stddev: number;
  n: number;
}

export interface ControlChartData {
  characteristic_id: string;
  characteristic_name: string;
  chart_type: 'XBAR_R' | 'XBAR_S' | 'IMR' | 'P' | 'NP' | 'C' | 'U';
  subgroups: SPCSubgroup[];
  controlLimits: ControlLimits;
  capability?: ProcessCapability;
  violations: SPCRuleViolation[];
}

export interface CreateSubgroupInput {
  characteristic_id: string;
  work_center_id?: string;
  equipment_asset_id?: string;
  product_id?: string;
  operation_id?: string;
  values: number[];
  subgroup_ts?: string;
}

// =====================================================
// CONSTANTS
// =====================================================

// Control chart constants for X-bar R charts
const A2_FACTORS: Record<number, number> = {
  2: 1.880, 3: 1.023, 4: 0.729, 5: 0.577,
  6: 0.483, 7: 0.419, 8: 0.373, 9: 0.337, 10: 0.308
};

const _D3_FACTORS: Record<number, number> = {
  2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0.076, 8: 0.136, 9: 0.184, 10: 0.223
};

const _D4_FACTORS: Record<number, number> = {
  2: 3.267, 3: 2.575, 4: 2.282, 5: 2.115,
  6: 2.004, 7: 1.924, 8: 1.864, 9: 1.816, 10: 1.777
};

const _d2_FACTORS: Record<number, number> = {
  2: 1.128, 3: 1.693, 4: 2.059, 5: 2.326,
  6: 2.534, 7: 2.704, 8: 2.847, 9: 2.970, 10: 3.078
};

// =====================================================
// SERVICE CLASS
// =====================================================

class SPCServiceClass {
  // =====================================================
  // SUBGROUPS & POINTS
  // =====================================================

  async getSubgroups(filters: {
    characteristic_id: string;
    work_center_id?: string;
    product_id?: string;
    from?: string;
    to?: string;
    limit?: number;
  }): Promise<SPCSubgroup[]> {
    let query = supabase
      .from('spc_subgroups')
      .select(`
        *,
        points:spc_points(*)
      `)
      .eq('characteristic_id', filters.characteristic_id)
      .order('subgroup_ts', { ascending: true });

    if (filters.work_center_id) {
      query = query.eq('work_center_id', filters.work_center_id);
    }
    if (filters.product_id) {
      query = query.eq('product_id', filters.product_id);
    }
    if (filters.from) {
      query = query.gte('subgroup_ts', filters.from);
    }
    if (filters.to) {
      query = query.lte('subgroup_ts', filters.to);
    }
    if (filters.limit) {
      query = query.limit(filters.limit);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async createSubgroup(input: CreateSubgroupInput): Promise<SPCSubgroup> {
    const { values, ...subgroupData } = input;

    // Create subgroup
    const { data: subgroup, error: subgroupError } = await supabase
      .from('spc_subgroups')
      .insert({
        ...subgroupData,
        subgroup_ts: input.subgroup_ts || new Date().toISOString(),
        n: values.length,
      })
      .select()
      .single();

    if (subgroupError) throw subgroupError;

    // Create points
    const points = values.map((value, index) => ({
      subgroup_id: subgroup.id,
      measured_value: value,
      sequence: index + 1,
    }));

    const { error: pointsError } = await supabase
      .from('spc_points')
      .insert(points);

    if (pointsError) throw pointsError;

    // Stats are computed by trigger, but we can return updated subgroup
    const { data: updatedSubgroup, error: fetchError } = await supabase
      .from('spc_subgroups')
      .select('*, points:spc_points(*)')
      .eq('id', subgroup.id)
      .single();

    if (fetchError) throw fetchError;

    // Check for rule violations
    await this.detectViolationsForSubgroup(updatedSubgroup);

    return updatedSubgroup;
  }

  async addPointToSubgroup(subgroupId: string, value: number, measurementId?: string): Promise<SPCPoint> {
    // Get current max sequence
    const { data: existing } = await supabase
      .from('spc_points')
      .select('sequence')
      .eq('subgroup_id', subgroupId)
      .order('sequence', { ascending: false })
      .limit(1);

    const nextSequence = (existing?.[0]?.sequence || 0) + 1;

    const { data, error } = await supabase
      .from('spc_points')
      .insert({
        subgroup_id: subgroupId,
        measured_value: value,
        sequence: nextSequence,
        measurement_id: measurementId,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // =====================================================
  // CONTROL CHART DATA
  // =====================================================

  async getControlChartData(
    characteristicId: string,
    options?: {
      work_center_id?: string;
      product_id?: string;
      from?: string;
      to?: string;
      minSubgroups?: number;
    }
  ): Promise<ControlChartData | null> {
    // Get characteristic specs
    const { data: characteristic, error: charError } = await supabase
      .from('quality_characteristics')
      .select('*')
      .eq('id', characteristicId)
      .single();

    if (charError) throw charError;
    if (!characteristic) return null;

    // Get subgroups
    const subgroups = await this.getSubgroups({
      characteristic_id: characteristicId,
      work_center_id: options?.work_center_id,
      product_id: options?.product_id,
      from: options?.from,
      to: options?.to,
    });

    const minSubgroups = options?.minSubgroups || 20;
    if (subgroups.length < minSubgroups) {
      // Not enough data for reliable control limits
      return {
        characteristic_id: characteristicId,
        characteristic_name: characteristic.name,
        chart_type: 'XBAR_R',
        subgroups,
        controlLimits: {
          ucl: 0,
          lcl: 0,
          centerLine: 0,
          usl: characteristic.usl,
          lsl: characteristic.lsl,
          target: characteristic.target_value,
        },
        violations: [],
      };
    }

    // Calculate control limits
    const controlLimits = this.calculateControlLimits(subgroups, characteristic);

    // Calculate process capability
    const capability = this.calculateProcessCapability(subgroups, characteristic);

    // Get existing violations (table may not exist yet)
    let violations: SPCRuleViolation[] = [];
    try {
      const { data } = await supabase
        .from('spc_rule_violations')
        .select('*')
        .eq('characteristic_id', characteristicId)
        .order('detected_at', { ascending: false });
      violations = data || [];
    } catch {
      // Table doesn't exist yet - ignore
    }

    return {
      characteristic_id: characteristicId,
      characteristic_name: characteristic.name,
      chart_type: 'XBAR_R',
      subgroups,
      controlLimits,
      capability,
      violations: violations || [],
    };
  }

  // =====================================================
  // CONTROL LIMIT CALCULATIONS
  // =====================================================

  private calculateControlLimits(
    subgroups: SPCSubgroup[],
    characteristic: { usl?: number | null; lsl?: number | null; target_value?: number | null }
  ): ControlLimits {
    if (subgroups.length === 0) {
      return {
        ucl: 0,
        lcl: 0,
        centerLine: 0,
        usl: characteristic.usl,
        lsl: characteristic.lsl,
        target: characteristic.target_value,
      };
    }

    // Calculate X-bar (grand mean)
    const validSubgroups = subgroups.filter(s => s.mean !== null && s.mean !== undefined);
    const xBar = validSubgroups.reduce((sum, s) => sum + (s.mean || 0), 0) / validSubgroups.length;

    // Calculate R-bar (average range)
    const validRanges = subgroups.filter(s => s.range_value !== null && s.range_value !== undefined);
    const rBar = validRanges.reduce((sum, s) => sum + (s.range_value || 0), 0) / validRanges.length;

    // Get typical subgroup size
    const avgN = Math.round(subgroups.reduce((sum, s) => sum + s.n, 0) / subgroups.length);
    const n = Math.min(Math.max(avgN, 2), 10); // Clamp to 2-10

    // Calculate X-bar control limits
    const A2 = A2_FACTORS[n] || 0.577;
    const ucl = xBar + A2 * rBar;
    const lcl = xBar - A2 * rBar;

    return {
      ucl,
      lcl,
      centerLine: xBar,
      usl: characteristic.usl,
      lsl: characteristic.lsl,
      target: characteristic.target_value,
    };
  }

  // =====================================================
  // PROCESS CAPABILITY CALCULATIONS
  // =====================================================

  calculateProcessCapability(
    subgroups: SPCSubgroup[],
    characteristic: { usl?: number | null; lsl?: number | null; target_value?: number | null }
  ): ProcessCapability | undefined {
    if (!characteristic.usl && !characteristic.lsl) {
      // Can't calculate capability without spec limits
      return undefined;
    }

    // Collect all individual values
    const allValues: number[] = [];
    for (const sg of subgroups) {
      if (sg.points) {
        for (const p of sg.points) {
          allValues.push(p.measured_value);
        }
      }
    }

    if (allValues.length < 30) {
      // Not enough data for reliable capability
      return undefined;
    }

    // Calculate overall statistics
    const n = allValues.length;
    const mean = allValues.reduce((a, b) => a + b, 0) / n;
    const variance = allValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (n - 1);
    const stddev = Math.sqrt(variance);

    if (stddev === 0) return undefined;

    const usl = characteristic.usl;
    const lsl = characteristic.lsl;

    let cp: number | undefined;
    let cpk: number | undefined;
    let cpu: number | undefined;
    let cpl: number | undefined;

    // Cp = (USL - LSL) / (6 * sigma)
    if (usl !== null && lsl !== null) {
      cp = (usl - lsl) / (6 * stddev);
    }

    // Cpk = min(Cpu, Cpl)
    if (usl !== null) {
      cpu = (usl - mean) / (3 * stddev);
    }
    if (lsl !== null) {
      cpl = (mean - lsl) / (3 * stddev);
    }

    if (cpu !== undefined && cpl !== undefined) {
      cpk = Math.min(cpu, cpl);
    } else if (cpu !== undefined) {
      cpk = cpu;
    } else if (cpl !== undefined) {
      cpk = cpl;
    }

    // Pp/Ppk use overall standard deviation (same as Cp/Cpk in this calculation)
    const pp = cp;
    const ppk = cpk;

    // Estimate sigma level from Cpk
    const sigmaLevel = cpk !== undefined ? cpk * 3 : undefined;

    // Calculate DPMO (Defects Per Million Opportunities)
    let dpmo: number | undefined;
    let ppm: number | undefined;
    if (sigmaLevel !== undefined) {
      // Approximate DPMO from sigma level
      // This is a simplification; actual DPMO depends on distribution
      const zUpper = usl !== null ? (usl - mean) / stddev : Infinity;
      const zLower = lsl !== null ? (mean - lsl) / stddev : Infinity;

      // Using normal distribution approximation
      const pUpper = usl !== null ? this.normalCDF(-zUpper) : 0;
      const pLower = lsl !== null ? this.normalCDF(-zLower) : 0;
      const totalDefectRate = pUpper + pLower;

      dpmo = totalDefectRate * 1000000;
      ppm = dpmo;
    }

    return {
      cp,
      cpk,
      pp,
      ppk,
      cpu,
      cpl,
      sigmaLevel,
      dpmo,
      ppm,
      mean,
      stddev,
      n,
    };
  }

  // Normal CDF approximation
  private normalCDF(z: number): number {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = z < 0 ? -1 : 1;
    z = Math.abs(z) / Math.sqrt(2);

    const t = 1.0 / (1.0 + p * z);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);

    return 0.5 * (1.0 + sign * y);
  }

  // =====================================================
  // RULE VIOLATION DETECTION
  // =====================================================

  async detectViolationsForSubgroup(subgroup: SPCSubgroup): Promise<SPCRuleViolation[]> {
    // Get historical data for this characteristic
    const subgroups = await this.getSubgroups({
      characteristic_id: subgroup.characteristic_id,
      limit: 50,
    });

    // Get characteristic for specs
    const { data: characteristic } = await supabase
      .from('quality_characteristics')
      .select('*')
      .eq('id', subgroup.characteristic_id)
      .single();

    if (!characteristic || subgroups.length < 8) {
      // Not enough data for rule detection
      return [];
    }

    const controlLimits = this.calculateControlLimits(subgroups, characteristic);
    const violations: SPCRuleViolation[] = [];

    // Find index of current subgroup
    const currentIndex = subgroups.findIndex(s => s.id === subgroup.id);
    if (currentIndex === -1) return [];

    // Get recent means for rule checking
    const recentMeans = subgroups
      .slice(Math.max(0, currentIndex - 8), currentIndex + 1)
      .map(s => s.mean)
      .filter((m): m is number => m !== null && m !== undefined);

    if (recentMeans.length === 0) return [];

    const currentMean = subgroup.mean;
    if (currentMean === null || currentMean === undefined) return [];

    const sigma = (controlLimits.ucl - controlLimits.centerLine) / 3;
    const sigma2 = sigma * 2;
    const sigma1 = sigma;

    // Western Electric Rule 1: One point beyond 3 sigma
    if (currentMean > controlLimits.ucl || currentMean < controlLimits.lcl) {
      violations.push(await this.createViolation(
        subgroup.characteristic_id,
        subgroup.id,
        'WESTERN_ELECTRIC_1',
        { value: currentMean, ucl: controlLimits.ucl, lcl: controlLimits.lcl }
      ));
    }

    // Western Electric Rule 2: 2 of 3 consecutive points beyond 2 sigma (same side)
    if (recentMeans.length >= 3) {
      const last3 = recentMeans.slice(-3);
      const aboveLimit = last3.filter(m => m > controlLimits.centerLine + sigma2).length;
      const belowLimit = last3.filter(m => m < controlLimits.centerLine - sigma2).length;

      if (aboveLimit >= 2 || belowLimit >= 2) {
        violations.push(await this.createViolation(
          subgroup.characteristic_id,
          subgroup.id,
          'WESTERN_ELECTRIC_2',
          { points: last3, limit: sigma2 }
        ));
      }
    }

    // Western Electric Rule 3: 4 of 5 consecutive points beyond 1 sigma (same side)
    if (recentMeans.length >= 5) {
      const last5 = recentMeans.slice(-5);
      const aboveLimit = last5.filter(m => m > controlLimits.centerLine + sigma1).length;
      const belowLimit = last5.filter(m => m < controlLimits.centerLine - sigma1).length;

      if (aboveLimit >= 4 || belowLimit >= 4) {
        violations.push(await this.createViolation(
          subgroup.characteristic_id,
          subgroup.id,
          'WESTERN_ELECTRIC_3',
          { points: last5, limit: sigma1 }
        ));
      }
    }

    // Western Electric Rule 4: 8 consecutive points on same side of center line
    if (recentMeans.length >= 8) {
      const last8 = recentMeans.slice(-8);
      const allAbove = last8.every(m => m > controlLimits.centerLine);
      const allBelow = last8.every(m => m < controlLimits.centerLine);

      if (allAbove || allBelow) {
        violations.push(await this.createViolation(
          subgroup.characteristic_id,
          subgroup.id,
          'WESTERN_ELECTRIC_4',
          { points: last8, side: allAbove ? 'above' : 'below' }
        ));
      }
    }

    return violations;
  }

  private async createViolation(
    characteristicId: string,
    subgroupId: string,
    violationType: SPCViolationType,
    details: Record<string, unknown>
  ): Promise<SPCRuleViolation | null> {
    try {
      const { data, error } = await supabase
        .from('spc_rule_violations')
        .insert({
          characteristic_id: characteristicId,
          subgroup_id: subgroupId,
          violation_type: violationType,
          details,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch {
      // Table doesn't exist yet - log and return null
      console.warn('spc_rule_violations table not found - skipping violation creation');
      return null;
    }
  }

  // =====================================================
  // VIOLATIONS MANAGEMENT
  // =====================================================

  async getViolations(filters?: {
    characteristic_id?: string;
    acknowledged?: boolean;
    from?: string;
    to?: string;
  }): Promise<SPCRuleViolation[]> {
    let query = supabase
      .from('spc_rule_violations')
      .select('*')
      .order('detected_at', { ascending: false });

    if (filters?.characteristic_id) {
      query = query.eq('characteristic_id', filters.characteristic_id);
    }
    if (filters?.acknowledged === true) {
      query = query.not('acknowledged_at', 'is', null);
    }
    if (filters?.acknowledged === false) {
      query = query.is('acknowledged_at', null);
    }
    if (filters?.from) {
      query = query.gte('detected_at', filters.from);
    }
    if (filters?.to) {
      query = query.lte('detected_at', filters.to);
    }

    try {
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    } catch {
      // Table doesn't exist yet - return empty array
      console.warn('spc_rule_violations table not found - returning empty array');
      return [];
    }
  }

  async acknowledgeViolation(
    violationId: string,
    acknowledgedBy: string,
    notes?: string
  ): Promise<SPCRuleViolation | null> {
    try {
      const { data, error } = await supabase
        .from('spc_rule_violations')
        .update({
          acknowledged_by: acknowledgedBy,
          acknowledged_at: new Date().toISOString(),
          acknowledgment_notes: notes,
        })
        .eq('id', violationId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch {
      console.warn('spc_rule_violations table not found - cannot acknowledge violation');
      return null;
    }
  }

  // =====================================================
  // SIGMA LEVEL & DPMO CALCULATIONS
  // =====================================================

  calculateSigmaLevel(defects: number, opportunities: number, units: number): {
    dpmo: number;
    dpu: number;
    sigmaLevel: number;
  } {
    const totalOpportunities = opportunities * units;
    const dpmo = (defects / totalOpportunities) * 1000000;
    const dpu = defects / units;

    // Convert DPMO to sigma level (approximate)
    // Using the relationship: Sigma ≈ 0.8406 + sqrt(29.37 - 2.221 * ln(DPMO))
    let sigmaLevel: number;
    if (dpmo <= 3.4) {
      sigmaLevel = 6.0;
    } else if (dpmo >= 933200) {
      sigmaLevel = 0;
    } else {
      sigmaLevel = 0.8406 + Math.sqrt(29.37 - 2.221 * Math.log(dpmo));
    }

    return { dpmo, dpu, sigmaLevel: Math.max(0, Math.min(6, sigmaLevel)) };
  }

  // =====================================================
  // HELPER: Create SPC data from inspection measurement
  // =====================================================

  async recordMeasurementForSPC(
    measurementId: string,
    characteristicId: string,
    value: number,
    context?: {
      work_center_id?: string;
      product_id?: string;
      operation_id?: string;
    }
  ): Promise<SPCSubgroup> {
    // For individual measurements, each becomes its own subgroup (n=1)
    // This is common for Individual-Moving Range (IMR) charts

    const { data: subgroup, error } = await supabase
      .from('spc_subgroups')
      .insert({
        characteristic_id: characteristicId,
        work_center_id: context?.work_center_id,
        product_id: context?.product_id,
        operation_id: context?.operation_id,
        subgroup_ts: new Date().toISOString(),
        n: 1,
        mean: value,
        min_value: value,
        max_value: value,
      })
      .select()
      .single();

    if (error) throw error;

    // Add the point
    await supabase
      .from('spc_points')
      .insert({
        subgroup_id: subgroup.id,
        measured_value: value,
        sequence: 1,
        measurement_id: measurementId,
      });

    // Check for violations
    await this.detectViolationsForSubgroup(subgroup);

    return subgroup;
  }
}

export const SPCService = new SPCServiceClass();
