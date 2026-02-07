import { useState, useEffect } from 'react';
import { Package, Plus, Trash2, CheckCircle, AlertTriangle, RotateCcw } from 'lucide-react';
import { ManufacturingService, BOMItem, CreateBOMItemInput } from '../../../services/ManufacturingService';
import { MESInventoryService, MaterialConsumptionLog } from '../../../services/MESInventoryService';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';

interface WorkOrderMaterialsProps {
  orderId: string;
  orderStatus: string;
  bom: BOMItem[];
  onUpdate: () => void;
}

interface Part {
  id: string;
  name: string;
  part_number: string;
}

interface Location {
  id: string;
  name: string;
  location_type: string;
}

export function WorkOrderMaterials({ orderId, orderStatus, bom, onUpdate }: WorkOrderMaterialsProps) {
  const { profile } = useAuth();
  const [showAddItem, setShowAddItem] = useState(false);
  const [parts, setParts] = useState<Part[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [consumptionLog, setConsumptionLog] = useState<MaterialConsumptionLog[]>([]);
  const [newItem, setNewItem] = useState<CreateBOMItemInput>({
    part_id: '',
    quantity_required: 1,
  });
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showConsumptionLog, setShowConsumptionLog] = useState(false);

  const canManage = profile?.role === 'admin' || profile?.role === 'dispatcher';
  const canConsume = canManage || profile?.role === 'technician' || profile?.role === 'operator' || profile?.role === 'material_handler';
  const isComplete = orderStatus === 'complete';

  useEffect(() => {
    loadReferenceData();
    loadConsumptionLog();
  }, [orderId]);

  const loadReferenceData = async () => {
    try {
      const [partsResult, locationsResult] = await Promise.all([
        supabase.from('parts').select('id, name, part_number').eq('is_active', true).order('name'),
        supabase.from('stock_locations').select('id, name, location_type').eq('is_active', true).order('name'),
      ]);

      setParts(partsResult.data || []);
      setLocations(locationsResult.data || []);
    } catch (error) {
      console.error('Error loading reference data:', error);
    }
  };

  const loadConsumptionLog = async () => {
    try {
      const log = await MESInventoryService.getConsumptionLog(orderId);
      setConsumptionLog(log);
    } catch (error) {
      console.error('Error loading consumption log:', error);
    }
  };

  const handleAddItem = async () => {
    if (!newItem.part_id) return;

    setActionLoading('add');
    try {
      const result = await ManufacturingService.addBOMItem(orderId, newItem);
      if (result.success) {
        setShowAddItem(false);
        setNewItem({ part_id: '', quantity_required: 1 });
        onUpdate();
      }
    } catch (error) {
      console.error('Error adding BOM item:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemoveItem = async (itemId: string) => {
    if (!confirm('Remove this material from the BOM?')) return;

    setActionLoading(`remove-${itemId}`);
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

  const handleConsumeItem = async (item: BOMItem) => {
    if (!item.source_location_id) {
      alert('Please allocate a source location first');
      return;
    }

    const qtyToConsume = item.quantity_required - (item.quantity_consumed || 0);
    if (qtyToConsume <= 0) {
      alert('This item is already fully consumed');
      return;
    }

    setActionLoading(`consume-${item.id}`);
    try {
      const result = await MESInventoryService.consumeMaterial({
        production_order_id: orderId,
        part_id: item.part_id,
        qty: qtyToConsume,
        source_location_id: item.source_location_id,
        method: 'manual',
        bom_item_id: item.id,
        unit_cost: item.unit_cost || undefined,
      });

      if (result.success) {
        onUpdate();
        loadConsumptionLog();
      } else {
        alert(result.error || 'Failed to consume material');
      }
    } catch (error) {
      console.error('Error consuming material:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleReverseConsumption = async (logId: string) => {
    const reason = prompt('Enter reversal reason:');
    if (!reason) return;

    setActionLoading(`reverse-${logId}`);
    try {
      const result = await MESInventoryService.reverseConsumption({
        consumption_log_id: logId,
        reason,
      });

      if (result.success) {
        onUpdate();
        loadConsumptionLog();
      } else {
        alert(result.error || 'Failed to reverse consumption');
      }
    } catch (error) {
      console.error('Error reversing consumption:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleAllocateItem = async (itemId: string, locationId: string) => {
    const item = bom.find(b => b.id === itemId);
    if (!item) return;

    setActionLoading(`allocate-${itemId}`);
    try {
      const result = await ManufacturingService.allocateBOMItem(
        itemId,
        locationId,
        item.quantity_required
      );

      if (result.success) {
        onUpdate();
      }
    } catch (error) {
      console.error('Error allocating item:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const getConsumptionStatus = (item: BOMItem) => {
    const consumed = item.quantity_consumed || 0;
    const required = item.quantity_required;

    if (consumed >= required) {
      return { status: 'complete', color: 'text-green-600', bg: 'bg-green-100 dark:bg-green-900/30' };
    } else if (consumed > 0) {
      return { status: 'partial', color: 'text-yellow-600', bg: 'bg-yellow-100 dark:bg-yellow-900/30' };
    }
    return { status: 'pending', color: 'text-gray-500', bg: 'bg-gray-100 dark:bg-gray-700' };
  };

  return (
    <div className="space-y-4">
      {/* BOM List */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 dark:text-white">Bill of Materials</h3>
          <button
            onClick={() => setShowConsumptionLog(!showConsumptionLog)}
            className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
          >
            {showConsumptionLog ? 'Show BOM' : 'View Consumption Log'}
          </button>
        </div>

        {showConsumptionLog ? (
          // Consumption Log View
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {consumptionLog.length === 0 ? (
              <div className="p-6 text-center text-gray-500">No consumption recorded</div>
            ) : (
              consumptionLog.map((log) => (
                <div
                  key={log.id}
                  className={`p-4 ${log.is_reversal ? 'bg-red-50 dark:bg-red-900/10' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      {log.is_reversal ? (
                        <RotateCcw className="w-4 h-4 text-red-500" />
                      ) : (
                        <Package className="w-4 h-4 text-gray-400" />
                      )}
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">
                          {log.part_name || 'Unknown Part'}
                          {log.is_reversal && <span className="text-red-600 ml-2">(Reversed)</span>}
                        </p>
                        <p className="text-sm text-gray-500">
                          {log.qty > 0 ? '+' : ''}{log.qty} from {log.source_location_name || 'Unknown'}
                        </p>
                        <p className="text-xs text-gray-400">
                          {log.consumed_by_name} - {new Date(log.consumed_at).toLocaleString()}
                        </p>
                        {log.reversal_reason && (
                          <p className="text-xs text-red-600">Reason: {log.reversal_reason}</p>
                        )}
                      </div>
                    </div>
                    {!log.is_reversal && canManage && !isComplete && (
                      <button
                        onClick={() => handleReverseConsumption(log.id)}
                        disabled={actionLoading === `reverse-${log.id}`}
                        className="text-sm text-red-600 hover:text-red-700"
                        title="Reverse"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          // BOM View
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {bom.length === 0 ? (
              <div className="p-6 text-center text-gray-500">
                <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No materials added</p>
              </div>
            ) : (
              bom.map((item) => {
                const consumptionStatus = getConsumptionStatus(item);
                return (
                  <div key={item.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className={`p-2 rounded-lg ${consumptionStatus.bg}`}>
                          {consumptionStatus.status === 'complete' ? (
                            <CheckCircle className="w-5 h-5 text-green-600" />
                          ) : (
                            <Package className="w-5 h-5 text-gray-500" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">
                            {item.part?.name || 'Unknown Part'}
                          </p>
                          <p className="text-sm text-gray-500">
                            {item.part?.part_number}
                          </p>
                          {item.source_location && (
                            <p className="text-xs text-gray-400">
                              Source: {item.source_location.name}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center space-x-4">
                        <div className="text-right">
                          <p className={`font-medium ${consumptionStatus.color}`}>
                            {item.quantity_consumed || 0} / {item.quantity_required}
                          </p>
                          {item.unit_cost && (
                            <p className="text-xs text-gray-500">
                              ${(item.unit_cost * item.quantity_required).toFixed(2)}
                            </p>
                          )}
                        </div>

                        {/* Actions */}
                        {!isComplete && (
                          <div className="flex items-center space-x-2">
                            {!item.is_allocated && canManage && (
                              <select
                                onChange={(e) => {
                                  if (e.target.value) {
                                    handleAllocateItem(item.id, e.target.value);
                                  }
                                }}
                                className="text-sm px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
                                disabled={actionLoading === `allocate-${item.id}`}
                              >
                                <option value="">Allocate...</option>
                                {locations.map(loc => (
                                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                                ))}
                              </select>
                            )}
                            {item.is_allocated && !item.is_consumed && canConsume && (
                              <button
                                onClick={() => handleConsumeItem(item)}
                                disabled={actionLoading === `consume-${item.id}`}
                                className="text-sm px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                              >
                                Consume
                              </button>
                            )}
                            {canManage && !item.is_consumed && (
                              <button
                                onClick={() => handleRemoveItem(item.id)}
                                disabled={actionLoading === `remove-${item.id}`}
                                className="p-1 text-red-600 hover:bg-red-50 rounded"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Add Item */}
      {!isComplete && canManage && !showConsumptionLog && (
        <div className="card">
          {showAddItem ? (
            <div className="p-4 space-y-4">
              <h4 className="font-medium text-gray-900 dark:text-white">Add Material</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Part *
                  </label>
                  <select
                    value={newItem.part_id}
                    onChange={(e) => setNewItem(n => ({ ...n, part_id: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  >
                    <option value="">Select part...</option>
                    {parts.map(part => (
                      <option key={part.id} value={part.id}>
                        {part.part_number} - {part.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Quantity *
                  </label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={newItem.quantity_required}
                    onChange={(e) => setNewItem(n => ({ ...n, quantity_required: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Source Location
                  </label>
                  <select
                    value={newItem.source_location_id || ''}
                    onChange={(e) => setNewItem(n => ({ ...n, source_location_id: e.target.value || undefined }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  >
                    <option value="">Select location...</option>
                    {locations.map(loc => (
                      <option key={loc.id} value={loc.id}>{loc.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex items-center justify-end space-x-2">
                <button
                  onClick={() => setShowAddItem(false)}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddItem}
                  disabled={actionLoading === 'add' || !newItem.part_id}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  Add Material
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAddItem(true)}
              className="w-full p-4 flex items-center justify-center space-x-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
            >
              <Plus className="w-5 h-5" />
              <span>Add Material</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
