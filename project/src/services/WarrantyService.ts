import { supabase } from '../lib/supabase';

export interface WarrantyClaim {
  id: string;
  claim_number: string;
  serialized_part_id?: string | null;
  equipment_id?: string | null;
  claim_type: 'repair' | 'replacement' | 'refund' | 'labor';
  status: 'draft' | 'submitted' | 'in_review' | 'approved' | 'denied' | 'completed' | 'cancelled';
  description: string;
  failure_description?: string | null;
  failure_date?: string | null;
  provider_name: string;
  provider_contact?: string | null;
  provider_phone?: string | null;
  provider_email?: string | null;
  provider_claim_number?: string | null;
  claim_amount?: number | null;
  approved_amount?: number | null;
  submitted_date?: string | null;
  resolution_date?: string | null;
  resolution_notes?: string | null;
  ticket_id?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface WarrantyClaimSummary extends WarrantyClaim {
  serial_number?: string | null;
  part_name?: string | null;
  part_number?: string | null;
  equipment_type?: string | null;
  equipment_model?: string | null;
  equipment_manufacturer?: string | null;
  customer_name?: string | null;
  item_description?: string | null;
  created_by_name?: string | null;
  attachment_count?: number;
}

export interface WarrantyClaimAttachment {
  id: string;
  claim_id: string;
  file_name: string;
  file_type?: string | null;
  file_size?: number | null;
  file_url: string;
  description?: string | null;
  uploaded_by?: string | null;
  created_at: string;
}

export interface CreateClaimInput {
  serialized_part_id?: string | null;
  equipment_id?: string | null;
  claim_type: WarrantyClaim['claim_type'];
  description: string;
  failure_description?: string;
  failure_date?: string;
  provider_name: string;
  provider_contact?: string;
  provider_phone?: string;
  provider_email?: string;
  claim_amount?: number;
  ticket_id?: string;
}

export class WarrantyService {
  /**
   * Get all warranty claims with summary info
   */
  static async getClaims(filters?: {
    status?: string;
    provider?: string;
    fromDate?: string;
    toDate?: string;
  }): Promise<WarrantyClaimSummary[]> {
    let query = supabase
      .from('vw_warranty_claims_summary')
      .select('*')
      .order('created_at', { ascending: false });

    if (filters?.status && filters.status !== 'all') {
      query = query.eq('status', filters.status);
    }
    if (filters?.provider) {
      query = query.ilike('provider_name', `%${filters.provider}%`);
    }
    if (filters?.fromDate) {
      query = query.gte('created_at', filters.fromDate);
    }
    if (filters?.toDate) {
      query = query.lte('created_at', filters.toDate);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[WarrantyService] Error fetching claims:', error);
      throw error;
    }

    return data || [];
  }

  /**
   * Get a single claim by ID
   */
  static async getClaimById(id: string): Promise<WarrantyClaimSummary | null> {
    const { data, error } = await supabase
      .from('vw_warranty_claims_summary')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    return data;
  }

  /**
   * Get claims for a specific serialized part
   */
  static async getClaimsForPart(serializedPartId: string): Promise<WarrantyClaimSummary[]> {
    const { data, error } = await supabase
      .from('vw_warranty_claims_summary')
      .select('*')
      .eq('serialized_part_id', serializedPartId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  /**
   * Get claims for a specific equipment
   */
  static async getClaimsForEquipment(equipmentId: string): Promise<WarrantyClaimSummary[]> {
    const { data, error } = await supabase
      .from('vw_warranty_claims_summary')
      .select('*')
      .eq('equipment_id', equipmentId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  /**
   * Create a new warranty claim
   */
  static async createClaim(input: CreateClaimInput): Promise<{ success: boolean; claim?: WarrantyClaim; error?: string }> {
    try {
      const { data: userData } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from('warranty_claims')
        .insert([{
          ...input,
          status: 'draft',
          created_by: userData.user?.id,
        }])
        .select()
        .single();

      if (error) throw error;

      return { success: true, claim: data };
    } catch (error: any) {
      console.error('[WarrantyService] Error creating claim:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update a warranty claim
   */
  static async updateClaim(
    id: string,
    updates: Partial<WarrantyClaim>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from('warranty_claims')
        .update(updates)
        .eq('id', id);

      if (error) throw error;

      return { success: true };
    } catch (error: any) {
      console.error('[WarrantyService] Error updating claim:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Submit a draft claim
   */
  static async submitClaim(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { data: userData } = await supabase.auth.getUser();

      const { error } = await supabase
        .from('warranty_claims')
        .update({
          status: 'submitted',
          submitted_date: new Date().toISOString().split('T')[0],
          submitted_by: userData.user?.id,
        })
        .eq('id', id);

      if (error) throw error;

      return { success: true };
    } catch (error: any) {
      console.error('[WarrantyService] Error submitting claim:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Approve or deny a claim
   */
  static async reviewClaim(
    id: string,
    approved: boolean,
    approvedAmount?: number,
    notes?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { data: userData } = await supabase.auth.getUser();

      const { error } = await supabase
        .from('warranty_claims')
        .update({
          status: approved ? 'approved' : 'denied',
          approved_amount: approved ? approvedAmount : null,
          resolution_notes: notes,
          reviewed_by: userData.user?.id,
          review_date: new Date().toISOString().split('T')[0],
        })
        .eq('id', id);

      if (error) throw error;

      return { success: true };
    } catch (error: any) {
      console.error('[WarrantyService] Error reviewing claim:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Complete a claim
   */
  static async completeClaim(id: string, notes?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from('warranty_claims')
        .update({
          status: 'completed',
          resolution_date: new Date().toISOString().split('T')[0],
          resolution_notes: notes,
        })
        .eq('id', id);

      if (error) throw error;

      return { success: true };
    } catch (error: any) {
      console.error('[WarrantyService] Error completing claim:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get claim attachments
   */
  static async getClaimAttachments(claimId: string): Promise<WarrantyClaimAttachment[]> {
    const { data, error } = await supabase
      .from('warranty_claim_attachments')
      .select('*')
      .eq('claim_id', claimId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  /**
   * Add attachment to claim
   */
  static async addAttachment(
    claimId: string,
    file: File,
    description?: string
  ): Promise<{ success: boolean; attachment?: WarrantyClaimAttachment; error?: string }> {
    try {
      const { data: userData } = await supabase.auth.getUser();

      // Upload file to storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${claimId}/${Date.now()}.${fileExt}`;
      const filePath = `warranty-claims/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('attachments')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('attachments')
        .getPublicUrl(filePath);

      // Create attachment record
      const { data, error } = await supabase
        .from('warranty_claim_attachments')
        .insert([{
          claim_id: claimId,
          file_name: file.name,
          file_type: file.type,
          file_size: file.size,
          file_url: publicUrl,
          description,
          uploaded_by: userData.user?.id,
        }])
        .select()
        .single();

      if (error) throw error;

      return { success: true, attachment: data };
    } catch (error: any) {
      console.error('[WarrantyService] Error adding attachment:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get claim statistics
   */
  static async getClaimStats(): Promise<{
    total: number;
    byStatus: Record<string, number>;
    totalClaimed: number;
    totalApproved: number;
  }> {
    const { data, error } = await supabase
      .from('warranty_claims')
      .select('status, claim_amount, approved_amount');

    if (error) throw error;

    const claims = data || [];
    const byStatus: Record<string, number> = {};

    claims.forEach((claim) => {
      byStatus[claim.status] = (byStatus[claim.status] || 0) + 1;
    });

    return {
      total: claims.length,
      byStatus,
      totalClaimed: claims.reduce((sum, c) => sum + (c.claim_amount || 0), 0),
      totalApproved: claims.reduce((sum, c) => sum + (c.approved_amount || 0), 0),
    };
  }

  /**
   * Get status display info
   */
  static getStatusDisplay(status: WarrantyClaim['status']): { label: string; color: string } {
    const statusMap: Record<string, { label: string; color: string }> = {
      draft: { label: 'Draft', color: 'badge-gray' },
      submitted: { label: 'Submitted', color: 'badge-blue' },
      in_review: { label: 'In Review', color: 'badge-yellow' },
      approved: { label: 'Approved', color: 'badge-green' },
      denied: { label: 'Denied', color: 'badge-red' },
      completed: { label: 'Completed', color: 'badge-green' },
      cancelled: { label: 'Cancelled', color: 'badge-gray' },
    };
    return statusMap[status] || { label: status, color: 'badge-gray' };
  }

  /**
   * Get claim type display
   */
  static getClaimTypeDisplay(type: WarrantyClaim['claim_type']): string {
    const typeMap: Record<string, string> = {
      repair: 'Repair Service',
      replacement: 'Part Replacement',
      refund: 'Refund Request',
      labor: 'Labor Coverage',
    };
    return typeMap[type] || type;
  }

  /**
   * Common HVAC warranty providers
   */
  static getCommonProviders(): Array<{ name: string; phone?: string; website?: string }> {
    return [
      { name: 'Carrier', phone: '1-800-227-7437', website: 'carrier.com' },
      { name: 'Trane', phone: '1-888-883-3220', website: 'trane.com' },
      { name: 'Lennox', phone: '1-800-953-6669', website: 'lennox.com' },
      { name: 'Rheem', phone: '1-866-720-2076', website: 'rheem.com' },
      { name: 'Goodman', phone: '1-877-254-4729', website: 'goodmanmfg.com' },
      { name: 'Daikin', phone: '1-800-432-1342', website: 'daikincomfort.com' },
      { name: 'York', phone: '1-877-874-7378', website: 'york.com' },
      { name: 'American Standard', phone: '1-800-554-8005', website: 'americanstandardair.com' },
    ];
  }
}
