import { supabase } from '../lib/supabase';

export interface ContractRenewalReminder {
  contract_id: string;
  contract_name: string;
  customer_name: string;
  customer_email: string | null;
  end_date: string;
  days_until_expiry: number;
  base_fee: number;
  status: string;
}

export interface SLAMetrics {
  contract_id: string;
  contract_name: string;
  customer_name: string;
  response_time_target_hours: number;
  resolution_time_target_hours: number;
  total_tickets: number;
  tickets_in_sla: number;
  tickets_breached: number;
  sla_compliance_rate: number;
  avg_response_time_hours: number;
  avg_resolution_time_hours: number;
}

export interface ContractPerformance {
  contract_id: string;
  contract_name: string;
  customer_name: string;
  start_date: string;
  end_date: string;
  total_visits: number;
  scheduled_visits: number;
  completed_visits: number;
  total_revenue: number;
  total_parts_cost: number;
  total_labor_hours: number;
  profit_margin: number;
}

export interface ContractPlan {
  id: string;
  name: string;
  description: string | null;
  default_base_fee: number | null;
  labor_discount_percent: number | null;
  parts_discount_percent: number | null;
  trip_charge_discount_percent: number | null;
  waive_trip_charge: boolean;
  included_visits_per_year: number | null;
  includes_emergency_service: boolean;
  includes_after_hours_rate_reduction: boolean;
  priority_level: 'normal' | 'priority' | 'vip';
  response_time_sla_hours: number | null;
  is_active: boolean;
}

export class ContractAutomationService {
  /**
   * Get contracts expiring within specified days
   */
  static async getExpiringContracts(daysThreshold: number = 30): Promise<ContractRenewalReminder[]> {
    const today = new Date();
    const futureDate = new Date(today.getTime() + daysThreshold * 24 * 60 * 60 * 1000);

    const { data, error } = await supabase
      .from('service_contracts')
      .select(`
        id,
        name,
        end_date,
        base_fee,
        status,
        customers(name, email)
      `)
      .eq('status', 'active')
      .gte('end_date', today.toISOString().split('T')[0])
      .lte('end_date', futureDate.toISOString().split('T')[0])
      .order('end_date', { ascending: true });

    if (error) throw error;

    return (data || []).map((contract: any) => ({
      contract_id: contract.id,
      contract_name: contract.name,
      customer_name: contract.customers?.name || 'Unknown',
      customer_email: contract.customers?.email || null,
      end_date: contract.end_date,
      days_until_expiry: Math.ceil(
        (new Date(contract.end_date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      ),
      base_fee: contract.base_fee || 0,
      status: contract.status,
    }));
  }

  /**
   * Get SLA metrics for contracts
   */
  static async getSLAMetrics(contractId?: string): Promise<SLAMetrics[]> {
    let contractQuery = supabase
      .from('service_contracts')
      .select(`
        id,
        name,
        response_time_hours,
        resolution_time_hours,
        customers(name)
      `)
      .eq('status', 'active');

    if (contractId) {
      contractQuery = contractQuery.eq('id', contractId);
    }

    const { data: contracts, error: contractError } = await contractQuery;
    if (contractError) throw contractError;

    const metrics: SLAMetrics[] = [];

    for (const contract of contracts || []) {
      // Get tickets for this contract's customer
      const { data: tickets, error: ticketError } = await supabase
        .from('tickets')
        .select('id, created_at, first_response_at, completed_at, status')
        .eq('service_contract_id', contract.id);

      if (ticketError) {
        console.error('Error fetching tickets:', ticketError);
        continue;
      }

      const responseTimeTarget = contract.response_time_hours || 24;
      const resolutionTimeTarget = contract.resolution_time_hours || 48;

      let ticketsInSLA = 0;
      let ticketsBreeched = 0;
      let totalResponseTime = 0;
      let totalResolutionTime = 0;
      let responseCount = 0;
      let resolutionCount = 0;

      for (const ticket of tickets || []) {
        const createdAt = new Date(ticket.created_at);

        // Check response time
        if (ticket.first_response_at) {
          const responseTime = (new Date(ticket.first_response_at).getTime() - createdAt.getTime()) / (1000 * 60 * 60);
          totalResponseTime += responseTime;
          responseCount++;

          if (responseTime <= responseTimeTarget) {
            ticketsInSLA++;
          } else {
            ticketsBreeched++;
          }
        }

        // Check resolution time
        if (ticket.completed_at) {
          const resolutionTime = (new Date(ticket.completed_at).getTime() - createdAt.getTime()) / (1000 * 60 * 60);
          totalResolutionTime += resolutionTime;
          resolutionCount++;
        }
      }

      const totalTickets = tickets?.length || 0;

      metrics.push({
        contract_id: contract.id,
        contract_name: contract.name,
        customer_name: (contract as any).customers?.name || 'Unknown',
        response_time_target_hours: responseTimeTarget,
        resolution_time_target_hours: resolutionTimeTarget,
        total_tickets: totalTickets,
        tickets_in_sla: ticketsInSLA,
        tickets_breached: ticketsBreeched,
        sla_compliance_rate: totalTickets > 0 ? (ticketsInSLA / totalTickets) * 100 : 100,
        avg_response_time_hours: responseCount > 0 ? totalResponseTime / responseCount : 0,
        avg_resolution_time_hours: resolutionCount > 0 ? totalResolutionTime / resolutionCount : 0,
      });
    }

    return metrics;
  }

  /**
   * Get performance metrics for a contract
   */
  static async getContractPerformance(contractId: string): Promise<ContractPerformance | null> {
    const { data: contract, error } = await supabase
      .from('service_contracts')
      .select(`
        id,
        name,
        start_date,
        end_date,
        visits_per_year,
        customers(name)
      `)
      .eq('id', contractId)
      .single();

    if (error || !contract) return null;

    // Get tickets for this contract
    const { data: tickets } = await supabase
      .from('tickets')
      .select('id, status, total_amount')
      .eq('service_contract_id', contractId);

    // Get invoices for this contract
    const { data: invoices } = await supabase
      .from('invoices')
      .select('total_amount')
      .eq('service_contract_id', contractId)
      .eq('status', 'paid');

    const totalVisits = tickets?.length || 0;
    const completedVisits = tickets?.filter((t) => t.status === 'completed').length || 0;
    const totalRevenue = invoices?.reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0) || 0;

    return {
      contract_id: contract.id,
      contract_name: contract.name,
      customer_name: (contract as any).customers?.name || 'Unknown',
      start_date: contract.start_date,
      end_date: contract.end_date,
      total_visits: totalVisits,
      scheduled_visits: contract.visits_per_year || 0,
      completed_visits: completedVisits,
      total_revenue: totalRevenue,
      total_parts_cost: 0, // Would need parts tracking per contract
      total_labor_hours: 0, // Would need labor tracking per contract
      profit_margin: totalRevenue > 0 ? 100 : 0, // Simplified
    };
  }

  /**
   * Get contract plans from database
   */
  static async getContractPlans(): Promise<ContractPlan[]> {
    const { data, error } = await supabase
      .from('contract_plans')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (error) {
      console.error('[ContractAutomation] Error fetching plans:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Get a specific contract plan by ID
   */
  static async getContractPlan(planId: string): Promise<ContractPlan | null> {
    const { data, error } = await supabase
      .from('contract_plans')
      .select('*')
      .eq('id', planId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      console.error('[ContractAutomation] Error fetching plan:', error);
      return null;
    }

    return data;
  }

  /**
   * Auto-renew a contract
   */
  static async renewContract(
    contractId: string,
    options: {
      newEndDate: string;
      newBaseFee?: number;
      notes?: string;
    }
  ): Promise<{ success: boolean; newContractId?: string; error?: string }> {
    try {
      // Get existing contract
      const { data: existingContract, error: fetchError } = await supabase
        .from('service_contracts')
        .select('*')
        .eq('id', contractId)
        .single();

      if (fetchError || !existingContract) {
        throw new Error('Contract not found');
      }

      // Create new contract based on existing
      const newContract = {
        customer_id: existingContract.customer_id,
        customer_location_id: existingContract.customer_location_id,
        contract_plan_id: existingContract.contract_plan_id,
        name: existingContract.name + ' (Renewed)',
        start_date: existingContract.end_date, // Start where old one ends
        end_date: options.newEndDate,
        base_fee: options.newBaseFee || existingContract.base_fee,
        billing_frequency: existingContract.billing_frequency,
        visits_per_year: existingContract.visits_per_year,
        response_time_hours: existingContract.response_time_hours,
        resolution_time_hours: existingContract.resolution_time_hours,
        parts_coverage: existingContract.parts_coverage,
        labor_coverage: existingContract.labor_coverage,
        notes: options.notes || `Renewed from contract ${existingContract.name}`,
        status: 'active',
        previous_contract_id: contractId,
      };

      const { data: newContractData, error: insertError } = await supabase
        .from('service_contracts')
        .insert([newContract])
        .select()
        .single();

      if (insertError) throw insertError;

      // Mark old contract as expired
      await supabase
        .from('service_contracts')
        .update({ status: 'expired' })
        .eq('id', contractId);

      return { success: true, newContractId: newContractData.id };
    } catch (error: any) {
      console.error('[ContractAutomation] Renewal error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Create contract from a contract plan
   */
  static async createFromPlan(
    planId: string,
    customerId: string,
    locationId: string,
    startDate: string,
    endDate: string
  ): Promise<{ success: boolean; contractId?: string; error?: string }> {
    const plan = await this.getContractPlan(planId);
    if (!plan) {
      return { success: false, error: 'Contract plan not found' };
    }

    try {
      const { data, error } = await supabase
        .from('service_contracts')
        .insert([{
          customer_id: customerId,
          customer_location_id: locationId,
          contract_plan_id: planId,
          name: plan.name,
          start_date: startDate,
          end_date: endDate,
          base_fee: plan.default_base_fee || 0,
          billing_frequency: 'yearly',
          included_visits_per_year: plan.included_visits_per_year || 0,
          labor_discount_percent: plan.labor_discount_percent || 0,
          parts_discount_percent: plan.parts_discount_percent || 0,
          priority_level: plan.priority_level,
          response_time_sla_hours: plan.response_time_sla_hours,
          status: 'draft',
        }])
        .select()
        .single();

      if (error) throw error;

      return { success: true, contractId: data.id };
    } catch (error: any) {
      console.error('[ContractAutomation] Create from plan error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get contracts needing attention (expiring, SLA breaches, etc.)
   */
  static async getContractsNeedingAttention(): Promise<{
    expiring: ContractRenewalReminder[];
    slaBreeches: SLAMetrics[];
    overdue: number;
  }> {
    const [expiring, slaMetrics] = await Promise.all([
      this.getExpiringContracts(30),
      this.getSLAMetrics(),
    ]);

    const slaBreeches = slaMetrics.filter((m) => m.sla_compliance_rate < 80);

    return {
      expiring,
      slaBreeches,
      overdue: expiring.filter((c) => c.days_until_expiry <= 0).length,
    };
  }

  /**
   * Format renewal reminder message
   */
  static formatRenewalReminderEmail(reminder: ContractRenewalReminder): {
    subject: string;
    body: string;
  } {
    return {
      subject: `Service Contract Renewal Reminder - ${reminder.contract_name}`,
      body: `
Dear ${reminder.customer_name},

Your service contract "${reminder.contract_name}" is expiring on ${new Date(reminder.end_date).toLocaleDateString()}.

Contract Details:
- Contract: ${reminder.contract_name}
- Expiration: ${new Date(reminder.end_date).toLocaleDateString()}
- Days Remaining: ${reminder.days_until_expiry}
- Annual Fee: $${reminder.base_fee.toFixed(2)}

To ensure continued coverage and priority service, please contact us to renew your contract.

Thank you for being a valued customer!

Best regards,
Your Service Team
      `.trim(),
    };
  }
}
