import { useState, useEffect, useCallback } from 'react';
import { Plus, BarChart3, CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import { OEEService, ProductionCount, RecordCountInput } from '../../../services/OEEService';
import { DowntimeService, DowntimeReason } from '../../../services/DowntimeService';
import { ProductionSchedulingService, WorkCenterSchedule } from '../../../services/ProductionSchedulingService';
import { useAuth } from '../../../contexts/AuthContext';

interface WorkOrderCountsProps {
  orderId: string;
  orderStatus: string;
  onUpdate: () => void;
}

export function WorkOrderCounts({ orderId, orderStatus, onUpdate }: WorkOrderCountsProps) {
  const { profile } = useAuth();
  const [operationRuns, setOperationRuns] = useState<WorkCenterSchedule[]>([]);
  const [counts, setCounts] = useState<ProductionCount[]>([]);
  const [scrapReasons, setScrapReasons] = useState<DowntimeReason[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddCount, setShowAddCount] = useState(false);
  const [selectedRun, setSelectedRun] = useState<string>('');
  const [newCount, setNewCount] = useState<Partial<RecordCountInput>>({
    total_qty: 0,
    good_qty: 0,
    scrap_qty: 0,
    rework_qty: 0,
  });
  const [actionLoading, setActionLoading] = useState(false);

  const canOperate = profile?.role === 'admin' || profile?.role === 'dispatcher' ||
    profile?.role === 'technician' || profile?.role === 'operator' || profile?.role === 'supervisor';
  const isComplete = orderStatus === 'complete';

  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      // Get operation runs for this order
      const runs = await ProductionSchedulingService.getSchedules({
        production_order_id: orderId,
      });
      setOperationRuns(runs);

      // Get all counts for operation runs
      const allCounts: ProductionCount[] = [];
      for (const run of runs) {
        const runCounts = await OEEService.getCountsByOperationRun(run.id);
        allCounts.push(...runCounts);
      }
      setCounts(allCounts);

      // Get scrap/rework reasons
      const reasons = await DowntimeService.getReasons(true);
      setScrapReasons(reasons.filter(r => r.reason_group === 'quality'));
    } catch (error) {
      console.error('Error loading counts data:', error);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRecordCount = async () => {
    if (!selectedRun) {
      alert('Please select an operation run');
      return;
    }

    const total = (newCount.good_qty || 0) + (newCount.scrap_qty || 0) + (newCount.rework_qty || 0);
    if (total === 0) {
      alert('Please enter at least one count');
      return;
    }

    setActionLoading(true);
    try {
      const run = operationRuns.find(r => r.id === selectedRun);

      const result = await OEEService.recordProductionCount({
        operation_run_id: selectedRun,
        production_order_id: orderId,
        work_center_id: run?.work_center_id || undefined,
        equipment_asset_id: run?.equipment_asset_id || undefined,
        total_qty: total,
        good_qty: newCount.good_qty || 0,
        scrap_qty: newCount.scrap_qty || 0,
        rework_qty: newCount.rework_qty || 0,
        scrap_reason_code_id: newCount.scrap_reason_code_id,
        rework_reason_code_id: newCount.rework_reason_code_id,
        notes: newCount.notes,
      });

      if (result.success) {
        setShowAddCount(false);
        setNewCount({ total_qty: 0, good_qty: 0, scrap_qty: 0, rework_qty: 0 });
        setSelectedRun('');
        loadData();
        onUpdate();
      } else {
        alert(result.error || 'Failed to record count');
      }
    } catch (error) {
      console.error('Error recording count:', error);
    } finally {
      setActionLoading(false);
    }
  };

  // Calculate totals
  const totals = counts.reduce(
    (acc, c) => ({
      total: acc.total + c.total_qty,
      good: acc.good + c.good_qty,
      scrap: acc.scrap + c.scrap_qty,
      rework: acc.rework + c.rework_qty,
    }),
    { total: 0, good: 0, scrap: 0, rework: 0 }
  );

  const qualityRate = totals.total > 0 ? (totals.good / totals.total) * 100 : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <BarChart3 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Total</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{totals.total}</p>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Good</p>
              <p className="text-xl font-bold text-green-600 dark:text-green-400">{totals.good}</p>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
              <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Scrap</p>
              <p className="text-xl font-bold text-red-600 dark:text-red-400">{totals.scrap}</p>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
              <RefreshCw className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Rework</p>
              <p className="text-xl font-bold text-yellow-600 dark:text-yellow-400">{totals.rework}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Quality Rate */}
      {totals.total > 0 && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Quality Rate</span>
            <span className={`text-sm font-bold ${qualityRate >= 95 ? 'text-green-600' : qualityRate >= 85 ? 'text-yellow-600' : 'text-red-600'}`}>
              {qualityRate.toFixed(1)}%
            </span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
            <div
              className={`h-3 rounded-full ${qualityRate >= 95 ? 'bg-green-500' : qualityRate >= 85 ? 'bg-yellow-500' : 'bg-red-500'}`}
              style={{ width: `${qualityRate}%` }}
            />
          </div>
        </div>
      )}

      {/* Counts List */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white">Production Counts</h3>
        </div>
        {counts.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            <BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No counts recorded yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Time</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Total</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Good</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Scrap</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Rework</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {counts.map((count) => (
                  <tr key={count.id}>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                      {new Date(count.count_timestamp).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-gray-900 dark:text-white">
                      {count.total_qty}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-green-600 dark:text-green-400">
                      {count.good_qty}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-red-600 dark:text-red-400">
                      {count.scrap_qty}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-yellow-600 dark:text-yellow-400">
                      {count.rework_qty}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Count */}
      {!isComplete && canOperate && (
        <div className="card">
          {showAddCount ? (
            <div className="p-4 space-y-4">
              <h4 className="font-medium text-gray-900 dark:text-white">Record Count</h4>

              {operationRuns.length === 0 ? (
                <div className="text-center py-4 text-gray-500">
                  <p>No operation runs found. Schedule the order first.</p>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Operation Run *
                    </label>
                    <select
                      value={selectedRun}
                      onChange={(e) => setSelectedRun(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    >
                      <option value="">Select operation...</option>
                      {operationRuns.map(run => (
                        <option key={run.id} value={run.id}>
                          {run.step_name || 'Operation'} @ {run.work_center_name || 'Unknown'}
                          {run.status && ` (${run.status})`}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-green-700 dark:text-green-400 mb-1">
                        Good Count
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={newCount.good_qty || 0}
                        onChange={(e) => setNewCount(c => ({ ...c, good_qty: parseInt(e.target.value) || 0 }))}
                        className="w-full px-3 py-2 border border-green-300 dark:border-green-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-green-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-red-700 dark:text-red-400 mb-1">
                        Scrap Count
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={newCount.scrap_qty || 0}
                        onChange={(e) => setNewCount(c => ({ ...c, scrap_qty: parseInt(e.target.value) || 0 }))}
                        className="w-full px-3 py-2 border border-red-300 dark:border-red-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-red-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-yellow-700 dark:text-yellow-400 mb-1">
                        Rework Count
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={newCount.rework_qty || 0}
                        onChange={(e) => setNewCount(c => ({ ...c, rework_qty: parseInt(e.target.value) || 0 }))}
                        className="w-full px-3 py-2 border border-yellow-300 dark:border-yellow-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-yellow-500"
                      />
                    </div>
                  </div>

                  {((newCount.scrap_qty || 0) > 0 || (newCount.rework_qty || 0) > 0) && scrapReasons.length > 0 && (
                    <div className="grid grid-cols-2 gap-4">
                      {(newCount.scrap_qty || 0) > 0 && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Scrap Reason
                          </label>
                          <select
                            value={newCount.scrap_reason_code_id || ''}
                            onChange={(e) => setNewCount(c => ({ ...c, scrap_reason_code_id: e.target.value || undefined }))}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                          >
                            <option value="">Select reason...</option>
                            {scrapReasons.map(r => (
                              <option key={r.id} value={r.id}>{r.name}</option>
                            ))}
                          </select>
                        </div>
                      )}
                      {(newCount.rework_qty || 0) > 0 && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Rework Reason
                          </label>
                          <select
                            value={newCount.rework_reason_code_id || ''}
                            onChange={(e) => setNewCount(c => ({ ...c, rework_reason_code_id: e.target.value || undefined }))}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                          >
                            <option value="">Select reason...</option>
                            {scrapReasons.map(r => (
                              <option key={r.id} value={r.id}>{r.name}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Notes
                    </label>
                    <textarea
                      value={newCount.notes || ''}
                      onChange={(e) => setNewCount(c => ({ ...c, notes: e.target.value }))}
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      placeholder="Optional notes..."
                    />
                  </div>

                  <div className="flex items-center justify-end space-x-2">
                    <button
                      onClick={() => {
                        setShowAddCount(false);
                        setNewCount({ total_qty: 0, good_qty: 0, scrap_qty: 0, rework_qty: 0 });
                      }}
                      className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleRecordCount}
                      disabled={actionLoading || !selectedRun}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      Record Count
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <button
              onClick={() => setShowAddCount(true)}
              className="w-full p-4 flex items-center justify-center space-x-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
            >
              <Plus className="w-5 h-5" />
              <span>Record Count</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
