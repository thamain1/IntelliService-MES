import { useState, useEffect } from 'react';
import {
  Plus,
  Trash2,
  Package,
  MapPin,
  CheckCircle,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { ManufacturingService, BOMItem, CreateBOMItemInput } from '../../services/ManufacturingService';
import { supabase } from '../../lib/supabase';

interface Part {
  id: string;
  name: string;
  part_number: string;
}

interface StockLocation {
  id: string;
  name: string;
}

interface BOMManagerProps {
  orderId: string;
  items: BOMItem[];
  orderStatus: string;
  onUpdate: () => void;
}

export function BOMManager({ orderId, items, orderStatus, onUpdate }: BOMManagerProps) {
  const { profile } = useAuth();
  const [showAddForm, setShowAddForm] = useState(false);
  const [parts, setParts] = useState<Part[]>([]);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [newItem, setNewItem] = useState<CreateBOMItemInput>({
    part_id: '',
    quantity_required: 1,
    source_location_id: '',
    unit_cost: undefined,
    notes: '',
  });

  const loadFormData = useCallback(async () => {
    try {
      const [partsRes, locationsRes] = await Promise.all([
        supabase.from('parts').select('id, name, part_number').order('name'),
        supabase.from('stock_locations').select('id, name').eq('is_active', true).order('name'),
      ]);

      setParts((partsRes.data as unknown as Part[]) || []);
      setLocations((locationsRes.data as unknown as StockLocation[]) || []);
    } catch (error) {
      console.error('Error loading form data:', error);
    }
  }, []);

  useEffect(() => {
    loadFormData();
  }, [loadFormData]);

  const handleAddItem = async () => {
    if (!newItem.part_id) return;

    setActionLoading('add');
    try {
      const result = await ManufacturingService.addBOMItem(orderId, {
        ...newItem,
        source_location_id: newItem.source_location_id || undefined,
        unit_cost: newItem.unit_cost || undefined,
        notes: newItem.notes || undefined,
      });
      if (result.success) {
        setNewItem({
          part_id: '',
          quantity_required: 1,
          source_location_id: '',
          unit_cost: undefined,
          notes: '',
        });
        setShowAddForm(false);
        onUpdate();
      }
    } catch (error) {
      console.error('Error adding BOM item:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemoveItem = async (itemId: string) => {
    if (!confirm('Are you sure you want to remove this item from the BOM?')) return;

    setActionLoading(itemId);
    try {
      const result = await ManufacturingService.removeBOMItem(itemId);
      if (result.success) {
        onUpdate();
      }
    } catch (error) {
      console.error('Error removing BOM item:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleAllocate = async (item: BOMItem) => {
    if (!item.source_location_id) {
      alert('Please select a source location first');
      return;
    }

    setActionLoading(item.id);
    try {
      const result = await ManufacturingService.allocateBOMItem(
        item.id,
        item.source_location_id,
        Number(item.quantity_required)
      );
      if (result.success) {
        onUpdate();
      }
    } catch (error) {
      console.error('Error allocating BOM item:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const canModify = profile?.role !== 'technician' && orderStatus !== 'complete';

  return (
    <div>
      {/* Add Item Button */}
      {canModify && !showAddForm && (
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center space-x-2 px-4 py-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg"
          >
            <Plus className="w-4 h-4" />
            <span>Add Material</span>
          </button>
        </div>
      )}

      {/* Add Item Form */}
      {showAddForm && (
        <div className="p-4 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Part *
                </label>
                <select
                  value={newItem.part_id}
                  onChange={(e) => setNewItem({ ...newItem, part_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="">Select a part</option>
                  {parts.map((part) => (
                    <option key={part.id} value={part.id}>
                      {part.part_number} - {part.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Quantity Required
                </label>
                <input
                  type="number"
                  min="0.0001"
                  step="0.0001"
                  value={newItem.quantity_required}
                  onChange={(e) => setNewItem({ ...newItem, quantity_required: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Source Location
                </label>
                <select
                  value={newItem.source_location_id}
                  onChange={(e) => setNewItem({ ...newItem, source_location_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="">Select location (optional)</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Unit Cost
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={newItem.unit_cost || ''}
                  onChange={(e) => setNewItem({ ...newItem, unit_cost: e.target.value ? Number(e.target.value) : undefined })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="flex items-center justify-end space-x-3">
              <button
                onClick={() => {
                  setShowAddForm(false);
                  setNewItem({
                    part_id: '',
                    quantity_required: 1,
                    source_location_id: '',
                    unit_cost: undefined,
                    notes: '',
                  });
                }}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleAddItem}
                disabled={!newItem.part_id || actionLoading === 'add'}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {actionLoading === 'add' ? 'Adding...' : 'Add Material'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Items List */}
      {items.length === 0 ? (
        <div className="p-8 text-center">
          <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400">No materials in BOM</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
            Add materials required for this production order
          </p>
        </div>
      ) : (
        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {items.map((item) => (
            <div key={item.id} className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <Package className="w-8 h-8 text-gray-400" />
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-medium text-gray-900 dark:text-white">
                        {item.part?.name || 'Unknown Part'}
                      </span>
                      {item.is_consumed && (
                        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                          Consumed
                        </span>
                      )}
                      {item.is_allocated && !item.is_consumed && (
                        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                          Allocated
                        </span>
                      )}
                    </div>
                    {item.part?.part_number && (
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Part #: {item.part.part_number}
                      </p>
                    )}
                    <div className="flex items-center space-x-4 text-xs text-gray-500 dark:text-gray-400 mt-1">
                      <span>Qty: {item.quantity_required}</span>
                      {item.quantity_allocated && item.quantity_allocated > 0 && (
                        <span>Allocated: {item.quantity_allocated}</span>
                      )}
                      {item.quantity_consumed && item.quantity_consumed > 0 && (
                        <span>Consumed: {item.quantity_consumed}</span>
                      )}
                      {item.source_location && (
                        <span className="flex items-center space-x-1">
                          <MapPin className="w-3 h-3" />
                          <span>{item.source_location.name}</span>
                        </span>
                      )}
                      {item.unit_cost && (
                        <span>@ ${Number(item.unit_cost).toFixed(2)}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center space-x-2">
                  {!item.is_allocated && !item.is_consumed && canModify && (
                    <button
                      onClick={() => handleAllocate(item)}
                      disabled={actionLoading === item.id || !item.source_location_id}
                      className="px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg disabled:opacity-50"
                      title={!item.source_location_id ? 'Set source location first' : 'Allocate inventory'}
                    >
                      Allocate
                    </button>
                  )}

                  {!item.is_consumed && canModify && (
                    <button
                      onClick={() => handleRemoveItem(item.id)}
                      disabled={actionLoading === item.id}
                      className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg disabled:opacity-50"
                      title="Remove"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}

                  {item.is_consumed && (
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Summary */}
      {items.length > 0 && (
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-400">
              Total Items: {items.length}
            </span>
            {items.some(i => i.unit_cost) && (
              <span className="font-medium text-gray-900 dark:text-white">
                Est. Material Cost: $
                {items.reduce((sum, i) => sum + (Number(i.unit_cost || 0) * Number(i.quantity_required)), 0).toFixed(2)}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
