import { supabase } from '../lib/supabase';

export type RateType = 'standard' | 'after_hours' | 'emergency';
export type RateSource = 'settings' | 'contract' | 'customer' | 'override';

export interface ResolveRateContext {
  customerId: string;
  locationId?: string;
  equipmentId?: string;
  ticketId?: string;
  rateType?: RateType;
  workDate?: string;
  overrideRate?: number;
  overrideReason?: string;
  overrideBy?: string;
}

export interface ResolvedRate {
  rateType: RateType;
  billRate: number;
  rateSource: RateSource;
  contractIdApplied: string | null;
  isCovered: boolean;
  overrideAllowed: boolean;
  message: string;
  overrideReason?: string;
  overriddenBy?: string;
  error?: boolean;
}

export interface LaborRateSnapshot {
  rateType: RateType;
  billRate: number;
  rateSource: RateSource;
  contractIdApplied: string | null;
  isCovered: boolean;
  overrideReason?: string;
  overriddenBy?: string;
  overriddenAt?: string;
}

export class RateService {
  static async resolveLaborRate(
    context: ResolveRateContext
  ): Promise<ResolvedRate> {
    try {
      const payload = {
        customer_id: context.customerId,
        location_id: context.locationId,
        equipment_id: context.equipmentId,
        ticket_id: context.ticketId,
        rate_type: context.rateType || 'standard',
        work_date: context.workDate || new Date().toISOString().split('T')[0],
        override_rate: context.overrideRate,
        override_reason: context.overrideReason,
        override_by: context.overrideBy,
      };

      const { data, error } = await supabase.rpc('fn_resolve_labor_rate', {
        context: payload,
      });

      if (error) {
        console.error('Error resolving labor rate:', error);
        throw new Error(`Failed to resolve labor rate: ${error.message}`);
      }

      if (data.error) {
        throw new Error(data.message || 'Rate resolution failed');
      }

      return {
        rateType: data.rate_type,
        billRate: parseFloat(data.bill_rate || 0),
        rateSource: data.rate_source,
        contractIdApplied: data.contract_id_applied,
        isCovered: data.is_covered || false,
        overrideAllowed: data.override_allowed || false,
        message: data.message || '',
        overrideReason: data.override_reason,
        overriddenBy: data.overridden_by,
      };
    } catch (error) {
      console.error('Error in resolveLaborRate:', error);
      throw error;
    }
  }

  static async getDefaultRate(rateType: RateType = 'standard'): Promise<number> {
    try {
      const settingKey =
        rateType === 'after_hours'
          ? 'after_hours_labor_rate'
          : rateType === 'emergency'
          ? 'emergency_labor_rate'
          : 'standard_labor_rate';

      const { data, error } = await supabase
        .from('accounting_settings')
        .select('setting_value')
        .eq('setting_key', settingKey)
        .maybeSingle();

      if (error) {
        console.error('Error fetching default rate:', error);
        return 0;
      }

      return parseFloat(data?.setting_value || '0');
    } catch (error) {
      console.error('Error in getDefaultRate:', error);
      return 0;
    }
  }

  static async getAllDefaultRates(): Promise<{
    standard: number;
    afterHours: number;
    emergency: number;
  }> {
    try {
      const { data, error } = await supabase
        .from('accounting_settings')
        .select('setting_key, setting_value')
        .in('setting_key', [
          'standard_labor_rate',
          'after_hours_labor_rate',
          'emergency_labor_rate',
        ]);

      if (error) {
        console.error('Error fetching default rates:', error);
        return { standard: 0, afterHours: 0, emergency: 0 };
      }

      const rates = {
        standard: 0,
        afterHours: 0,
        emergency: 0,
      };

      data?.forEach((setting) => {
        const value = parseFloat(setting.setting_value || '0');
        if (setting.setting_key === 'standard_labor_rate') {
          rates.standard = value;
        } else if (setting.setting_key === 'after_hours_labor_rate') {
          rates.afterHours = value;
        } else if (setting.setting_key === 'emergency_labor_rate') {
          rates.emergency = value;
        }
      });

      return rates;
    } catch (error) {
      console.error('Error in getAllDefaultRates:', error);
      return { standard: 0, afterHours: 0, emergency: 0 };
    }
  }

  static createSnapshot(resolvedRate: ResolvedRate): LaborRateSnapshot {
    return {
      rateType: resolvedRate.rateType,
      billRate: resolvedRate.billRate,
      rateSource: resolvedRate.rateSource,
      contractIdApplied: resolvedRate.contractIdApplied,
      isCovered: resolvedRate.isCovered,
      overrideReason: resolvedRate.overrideReason,
      overriddenBy: resolvedRate.overriddenBy,
      overriddenAt: resolvedRate.overriddenBy ? new Date().toISOString() : undefined,
    };
  }

  static formatRateSource(source: RateSource): string {
    switch (source) {
      case 'settings':
        return 'Default Rate';
      case 'contract':
        return 'Service Contract';
      case 'customer':
        return 'Customer Rate';
      case 'override':
        return 'Manual Override';
      default:
        return 'Unknown';
    }
  }

  static formatRateType(type: RateType): string {
    switch (type) {
      case 'standard':
        return 'Standard';
      case 'after_hours':
        return 'After Hours';
      case 'emergency':
        return 'Emergency';
      default:
        return 'Standard';
    }
  }

  static getRateTypeIcon(type: RateType): string {
    switch (type) {
      case 'standard':
        return 'Clock';
      case 'after_hours':
        return 'Moon';
      case 'emergency':
        return 'AlertCircle';
      default:
        return 'Clock';
    }
  }

  static getRateSourceColor(source: RateSource): string {
    switch (source) {
      case 'settings':
        return 'gray';
      case 'contract':
        return 'blue';
      case 'customer':
        return 'green';
      case 'override':
        return 'yellow';
      default:
        return 'gray';
    }
  }

  static async verifyRateSnapshot(
    timeLogId: string
  ): Promise<{ isValid: boolean; currentRate: number; snapshotRate: number }> {
    try {
      const { data: timeLog, error } = await supabase
        .from('time_logs')
        .select(
          `
          id,
          billing_rate_applied,
          rate_tier,
          rate_source,
          contract_id_applied,
          ticket_id,
          project_id,
          clock_in_time,
          ticket:tickets(customer_id, location_id, equipment_id)
        `
        )
        .eq('id', timeLogId)
        .maybeSingle();

      if (error || !timeLog) {
        console.error('Error fetching time log:', error);
        return { isValid: false, currentRate: 0, snapshotRate: 0 };
      }

      const ticket = timeLog.ticket as unknown as { customer_id?: string } | null;
      if (!ticket) {
        return {
          isValid: false,
          currentRate: 0,
          snapshotRate: timeLog.billing_rate_applied || 0,
        };
      }

      const currentResolution = await this.resolveLaborRate({
        customerId: ticket.customer_id,
        locationId: ticket.location_id,
        equipmentId: ticket.equipment_id,
        rateType: timeLog.rate_tier as RateType,
        workDate: new Date(timeLog.clock_in_time).toISOString().split('T')[0],
      });

      const snapshotRate = timeLog.billing_rate_applied || 0;
      const currentRate = currentResolution.billRate;

      return {
        isValid: Math.abs(snapshotRate - currentRate) < 0.01,
        currentRate,
        snapshotRate,
      };
    } catch (error) {
      console.error('Error in verifyRateSnapshot:', error);
      return { isValid: false, currentRate: 0, snapshotRate: 0 };
    }
  }
}
