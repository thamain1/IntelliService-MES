import { supabase } from '../lib/supabase';

export interface VendorCatalogItem {
  catalogItemId: string;
  vendorId: string;
  vendorName: string;
  vendorCode: string;
  partId: string;
  partNumber: string;
  partDescription: string;
  partCategory: string | null;
  vendorPartNumber: string | null;
  vendorPartDescription: string | null;
  standardCost: number | null;
  lastCost: number | null;
  lastPurchaseDate: string | null;
  leadTimeDays: number | null;
  moq: number | null;
  packQty: number;
  uom: string | null;
  isPreferredVendor: boolean;
  isDiscontinued: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReorderAlert {
  partId: string;
  partNumber: string;
  description: string;
  category: string | null;
  locationId: string;
  locationName: string;
  locationType: string;
  onHand: number;
  reserved: number;
  inboundOpenPo: number;
  available: number;
  minQty: number;
  maxQty: number;
  safetyStock: number;
  leadDays: number;
  avgDailyUsage: number;
  reorderPoint: number;
  suggestedOrderQty: number;
  belowReorderPoint: boolean;
  isStockout: boolean;
  reorderMethod: string | null;
  hasReorderPolicy: boolean;
  vendorId: string | null;
  vendorName: string | null;
  vendorPartNumber: string | null;
  unitCost: number;
  moq: number;
  packQty: number;
  inventoryValue: number;
}

export interface VendorLeadTimeMetrics {
  vendorId: string;
  vendorName: string;
  vendorCode: string;
  totalPoLines: number;
  receivedPoLines: number;
  avgLeadDays: number | null;
  medianLeadDays: number | null;
  p90LeadDays: number | null;
  stddevLeadDays: number | null;
  minLeadDays: number | null;
  maxLeadDays: number | null;
  avgDaysVariance: number | null;
  onTimePct: number | null;
  fillRatePct: number | null;
  earliestOrderDate: string | null;
  latestReceiptDate: string | null;
}

export interface ReorderPolicy {
  id: string;
  partId: string;
  locationId: string | null;
  minQty: number;
  maxQty: number;
  safetyStockQty: number;
  leadDaysOverride: number | null;
  reviewPeriodDays: number;
  reorderMethod: 'rop' | 'minmax';
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GetVendorCatalogParams {
  vendorId?: string;
  partId?: string;
  category?: string;
  preferredOnly?: boolean;
  search?: string;
}

export interface GetReorderAlertsParams {
  locationId?: string;
  vendorId?: string;
  criticalOnly?: boolean;
  belowRopOnly?: boolean;
  stockoutsOnly?: boolean;
}

export interface GetLeadTimeMetricsParams {
  vendorId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export class PartsOrderingService {
  static async getVendorCatalogItems(
    params: GetVendorCatalogParams = {}
  ): Promise<VendorCatalogItem[]> {
    try {
      let query = supabase
        .from('vw_vendor_catalog_items')
        .select('*')
        .order('vendor_name', { ascending: true })
        .order('part_number', { ascending: true });

      if (params.vendorId) {
        query = query.eq('vendor_id', params.vendorId);
      }

      if (params.partId) {
        query = query.eq('part_id', params.partId);
      }

      if (params.category) {
        query = query.eq('part_category', params.category);
      }

      if (params.preferredOnly) {
        query = query.eq('is_preferred_vendor', true);
      }

      if (params.search) {
        query = query.or(
          `part_number.ilike.%${params.search}%,part_description.ilike.%${params.search}%,vendor_part_number.ilike.%${params.search}%`
        );
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching vendor catalog items:', error);
        throw new Error(`Failed to fetch vendor catalog: ${error.message}`);
      }

      return (data || []).map((row: Record<string, unknown>) => ({
        catalogItemId: row.catalog_item_id as string,
        vendorId: row.vendor_id as string,
        vendorName: row.vendor_name as string,
        vendorCode: row.vendor_code as string,
        partId: row.part_id as string,
        partNumber: row.part_number as string,
        partDescription: row.part_description as string,
        partCategory: row.part_category as string,
        vendorPartNumber: row.vendor_part_number as string,
        vendorPartDescription: row.vendor_part_description as string,
        standardCost: parseFloat(String(row.standard_cost || 0)),
        lastCost: parseFloat(String(row.last_cost || 0)),
        lastPurchaseDate: row.last_purchase_date as string | null,
        leadTimeDays: parseInt(String(row.lead_time_days || 0)),
        moq: parseInt(String(row.moq || 0)),
        packQty: parseInt(String(row.pack_qty || 1)),
        uom: row.uom as string,
        isPreferredVendor: (row.is_preferred_vendor as boolean) || false,
        isDiscontinued: (row.is_discontinued as boolean) || false,
        notes: row.notes as string | null,
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string,
      }));
    } catch (error) {
      console.error('Error in getVendorCatalogItems:', error);
      throw error;
    }
  }

  static async getReorderAlerts(
    params: GetReorderAlertsParams = {}
  ): Promise<ReorderAlert[]> {
    try {
      let query = supabase
        .from('vw_reorder_alerts')
        .select('*')
        .order('below_reorder_point', { ascending: false })
        .order('is_stockout', { ascending: false })
        .order('on_hand', { ascending: true });

      if (params.locationId) {
        query = query.eq('location_id', params.locationId);
      }

      if (params.vendorId) {
        query = query.eq('vendor_id', params.vendorId);
      }

      if (params.criticalOnly) {
        query = query.lte('on_hand', 5);
      }

      if (params.belowRopOnly) {
        query = query.eq('below_reorder_point', true);
      }

      if (params.stockoutsOnly) {
        query = query.eq('is_stockout', true);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching reorder alerts:', error);
        throw new Error(`Failed to fetch reorder alerts: ${error.message}`);
      }

      return (data || []).map((row: Record<string, unknown>) => ({
        partId: row.part_id as string,
        partNumber: row.part_number as string,
        description: row.description as string,
        category: row.category as string,
        locationId: row.location_id as string,
        locationName: row.location_name as string,
        locationType: row.location_type as string,
        onHand: parseInt(String(row.on_hand || 0)),
        reserved: parseInt(String(row.reserved || 0)),
        inboundOpenPo: parseFloat(String(row.inbound_open_po || 0)),
        available: parseInt(String(row.available || 0)),
        minQty: parseInt(String(row.min_qty || 0)),
        maxQty: parseInt(String(row.max_qty || 0)),
        safetyStock: parseInt(String(row.safety_stock || 0)),
        leadDays: parseInt(String(row.lead_days || 7)),
        avgDailyUsage: parseFloat(String(row.avg_daily_usage || 0)),
        reorderPoint: parseInt(String(row.reorder_point || 0)),
        suggestedOrderQty: parseFloat(String(row.suggested_order_qty || 0)),
        belowReorderPoint: (row.below_reorder_point as boolean) || false,
        isStockout: (row.is_stockout as boolean) || false,
        reorderMethod: row.reorder_method as string,
        hasReorderPolicy: (row.has_reorder_policy as boolean) || false,
        vendorId: row.vendor_id as string | null,
        vendorName: row.vendor_name as string | null,
        vendorPartNumber: row.vendor_part_number as string | null,
        unitCost: parseFloat(String(row.unit_cost || 0)),
        moq: parseInt(String(row.moq || 1)),
        packQty: parseInt(String(row.pack_qty || 1)),
        inventoryValue: parseFloat(String(row.inventory_value || 0)),
      }));
    } catch (error) {
      console.error('Error in getReorderAlerts:', error);
      throw error;
    }
  }

  static async getVendorLeadTimeMetrics(
    params: GetLeadTimeMetricsParams = {}
  ): Promise<VendorLeadTimeMetrics[]> {
    try {
      let query = supabase
        .from('vw_vendor_lead_time_metrics')
        .select('*')
        .order('vendor_name', { ascending: true });

      if (params.vendorId) {
        query = query.eq('vendor_id', params.vendorId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching lead time metrics:', error);
        throw new Error(`Failed to fetch lead time metrics: ${error.message}`);
      }

      return (data || []).map((row: Record<string, unknown>) => ({
        vendorId: row.vendor_id as string,
        vendorName: row.vendor_name as string,
        vendorCode: row.vendor_code as string,
        totalPoLines: parseInt(String(row.total_po_lines || 0)),
        receivedPoLines: parseInt(String(row.received_po_lines || 0)),
        avgLeadDays: parseFloat(String(row.avg_lead_days || 0)),
        medianLeadDays: parseFloat(String(row.median_lead_days || 0)),
        p90LeadDays: parseFloat(String(row.p90_lead_days || 0)),
        stddevLeadDays: parseFloat(String(row.stddev_lead_days || 0)),
        minLeadDays: parseFloat(String(row.min_lead_days || 0)),
        maxLeadDays: parseFloat(String(row.max_lead_days || 0)),
        avgDaysVariance: parseFloat(String(row.avg_days_variance || 0)),
        onTimePct: parseFloat(String(row.on_time_pct || 0)),
        fillRatePct: parseFloat(String(row.fill_rate_pct || 0)),
        earliestOrderDate: row.earliest_order_date as string | null,
        latestReceiptDate: row.latest_receipt_date as string | null,
      }));
    } catch (error) {
      console.error('Error in getVendorLeadTimeMetrics:', error);
      throw error;
    }
  }

  static async getReorderPolicy(
    partId: string,
    locationId?: string
  ): Promise<ReorderPolicy | null> {
    try {
      let query = supabase
        .from('inventory_reorder_policies')
        .select('*')
        .eq('part_id', partId)
        .eq('is_active', true);

      if (locationId) {
        query = query.eq('location_id', locationId);
      } else {
        query = query.is('location_id', null);
      }

      const { data, error } = await query.maybeSingle();

      if (error) {
        console.error('Error fetching reorder policy:', error);
        throw new Error(`Failed to fetch reorder policy: ${error.message}`);
      }

      if (!data) return null;

      return {
        id: data.id,
        partId: data.part_id,
        locationId: data.location_id,
        minQty: data.min_qty,
        maxQty: data.max_qty,
        safetyStockQty: data.safety_stock_qty,
        leadDaysOverride: data.lead_days_override,
        reviewPeriodDays: data.review_period_days,
        reorderMethod: data.reorder_method,
        isActive: data.is_active,
        notes: data.notes,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    } catch (error) {
      console.error('Error in getReorderPolicy:', error);
      throw error;
    }
  }

  static async upsertReorderPolicy(policy: Partial<ReorderPolicy>): Promise<ReorderPolicy> {
    try {
      const payload: Record<string, unknown> = {
        part_id: policy.partId,
        location_id: policy.locationId,
        min_qty: policy.minQty || 0,
        max_qty: policy.maxQty || 0,
        safety_stock_qty: policy.safetyStockQty || 0,
        lead_days_override: policy.leadDaysOverride,
        review_period_days: policy.reviewPeriodDays || 7,
        reorder_method: policy.reorderMethod || 'rop',
        is_active: policy.isActive !== false,
        notes: policy.notes,
      };

      if (policy.id) {
        payload.id = policy.id;
      }

      const { data, error } = await supabase
        .from('inventory_reorder_policies')
        .upsert(payload)
        .select()
        .single();

      if (error) {
        console.error('Error upserting reorder policy:', error);
        throw new Error(`Failed to save reorder policy: ${error.message}`);
      }

      return {
        id: data.id,
        partId: data.part_id,
        locationId: data.location_id,
        minQty: data.min_qty,
        maxQty: data.max_qty,
        safetyStockQty: data.safety_stock_qty,
        leadDaysOverride: data.lead_days_override,
        reviewPeriodDays: data.review_period_days,
        reorderMethod: data.reorder_method,
        isActive: data.is_active,
        notes: data.notes,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    } catch (error) {
      console.error('Error in upsertReorderPolicy:', error);
      throw error;
    }
  }
}
