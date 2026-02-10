import { useEffect, useState, useCallback } from 'react';
import {
  ArrowLeft,
  Clock,
  Pause,
  Play,
  CheckCircle,
  Package,
  Calendar,
  User,
  Building,
  AlertCircle,
  Truck,
  List,
  Timer,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import {
  ManufacturingService,
  ProductionOrder,
  ProductionStep,
  BOMItem,
  MaterialMoveRequest,
} from '../../services/ManufacturingService';
import type { Database } from '../../lib/database.types';
import { ProductionStepList } from './ProductionStepList';
import { BOMManager } from './BOMManager';
import { ProductionTimeClock } from './ProductionTimeClock';

type TimeLogRow = Database['public']['Tables']['production_time_logs']['Row'];

interface ProductionOrderDetailProps {
  orderId: string;
  onBack: () => void;
}

type TabType = 'steps' | 'materials' | 'time' | 'moves';

export function ProductionOrderDetail({ orderId, onBack }: ProductionOrderDetailProps) {
  const { profile } = useAuth();
  const [order, setOrder] = useState<ProductionOrder | null>(null);
  const [steps, setSteps] = useState<ProductionStep[]>([]);
  const [bom, setBom] = useState<BOMItem[]>([]);
  const [timeLogs, setTimeLogs] = useState<TimeLogRow[]>([]);
  const [materialMoves, setMaterialMoves] = useState<MaterialMoveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('steps');
  const [actionLoading, setActionLoading] = useState(false);
  const [showHoldModal, setShowHoldModal] = useState(false);
  const [holdReason, setHoldReason] = useState('');

  const loadOrderData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await ManufacturingService.getOrderById(orderId);
      if (result) {
        setOrder(result.order);
        setSteps(result.steps);
        setBom(result.bom);
        setTimeLogs(result.timeLogs);
        setMaterialMoves(result.materialMoves);
      }
    } catch (error) {
      console.error('Error loading order:', error);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    loadOrderData();
  }, [loadOrderData]);

  const handlePutOnHold = async () => {
    if (!holdReason.trim()) return;
    setActionLoading(true);
    try {
      const result = await ManufacturingService.putOnHold(orderId, holdReason);
      if (result.success) {
        setShowHoldModal(false);
        setHoldReason('');
        await loadOrderData();
      }
    } catch (error) {
      console.error('Error putting order on hold:', error);
    } finally {
      setActionLoading(false);
    }
  };

  const handleResume = async () => {
    setActionLoading(true);
    try {
      const result = await ManufacturingService.resumeOrder(orderId);
      if (result.success) {
        await loadOrderData();
      }
    } catch (error) {
      console.error('Error resuming order:', error);
    } finally {
      setActionLoading(false);
    }
  };

  const handleComplete = async () => {
    if (!confirm('Are you sure you want to mark this order as complete?')) return;
    setActionLoading(true);
    try {
      const result = await ManufacturingService.completeOrder(orderId);
      if (result.success) {
        await loadOrderData();
      }
    } catch (error) {
      console.error('Error completing order:', error);
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { class: string; label: string }> = {
      queued: { class: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300', label: 'Queued' },
      in_progress: { class: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300', label: 'In Progress' },
      hold: { class: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300', label: 'On Hold' },
      complete: { class: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300', label: 'Complete' },
    };
    return badges[status] || badges.queued;
  };

  const getPriorityLabel = (priority: number | null) => {
    const labels: Record<number, string> = {
      1: 'Critical',
      2: 'High',
      3: 'Normal',
      4: 'Low',
      5: 'Lowest',
    };
    return priority ? labels[priority] || 'Normal' : 'Normal';
  };

  const formatDuration = (minutes: number | null) => {
    if (!minutes) return '-';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-white">Order not found</h3>
        <button onClick={onBack} className="mt-4 text-blue-600 hover:text-blue-700">
          Go back
        </button>
      </div>
    );
  }

  const statusBadge = getStatusBadge(order.status);
  const progress = steps.length > 0
    ? Math.round(steps.filter(s => s.status === 'complete' || s.status === 'skipped').length / steps.length * 100)
    : 0;

  const tabs = [
    { id: 'steps' as TabType, label: 'Steps', icon: List, count: steps.length },
    { id: 'materials' as TabType, label: 'Materials', icon: Package, count: bom.length },
    { id: 'time' as TabType, label: 'Time Logs', icon: Timer, count: timeLogs.length },
    { id: 'moves' as TabType, label: 'Material Moves', icon: Truck, count: materialMoves.length },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={onBack}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center space-x-3">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {order.order_number}
              </h1>
              <span className={`px-3 py-1 text-sm font-medium rounded-full ${statusBadge.class}`}>
                {statusBadge.label}
              </span>
            </div>
            <p className="text-gray-600 dark:text-gray-400 mt-1">{order.title}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center space-x-3">
          {order.status === 'hold' && profile?.role !== 'technician' && (
            <button
              onClick={handleResume}
              disabled={actionLoading}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <Play className="w-4 h-4" />
              <span>Resume</span>
            </button>
          )}

          {order.status !== 'hold' && order.status !== 'complete' && profile?.role !== 'technician' && (
            <button
              onClick={() => setShowHoldModal(true)}
              disabled={actionLoading}
              className="flex items-center space-x-2 px-4 py-2 text-yellow-700 bg-yellow-100 rounded-lg hover:bg-yellow-200 disabled:opacity-50"
            >
              <Pause className="w-4 h-4" />
              <span>Put on Hold</span>
            </button>
          )}

          {order.status !== 'complete' && profile?.role !== 'technician' && (
            <button
              onClick={handleComplete}
              disabled={actionLoading}
              className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              <CheckCircle className="w-4 h-4" />
              <span>Complete</span>
            </button>
          )}
        </div>
      </div>

      {/* Order Details Card */}
      <div className="card p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {order.customer && (
            <div className="flex items-start space-x-3">
              <Building className="w-5 h-5 text-gray-400 mt-0.5" />
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Customer</p>
                <p className="font-medium text-gray-900 dark:text-white">{order.customer.name}</p>
              </div>
            </div>
          )}

          {order.assigned_user && (
            <div className="flex items-start space-x-3">
              <User className="w-5 h-5 text-gray-400 mt-0.5" />
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Assigned To</p>
                <p className="font-medium text-gray-900 dark:text-white">{order.assigned_user.full_name}</p>
              </div>
            </div>
          )}

          {order.scheduled_start && (
            <div className="flex items-start space-x-3">
              <Calendar className="w-5 h-5 text-gray-400 mt-0.5" />
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Scheduled Start</p>
                <p className="font-medium text-gray-900 dark:text-white">
                  {new Date(order.scheduled_start).toLocaleDateString()}
                </p>
              </div>
            </div>
          )}

          <div className="flex items-start space-x-3">
            <AlertCircle className="w-5 h-5 text-gray-400 mt-0.5" />
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Priority</p>
              <p className="font-medium text-gray-900 dark:text-white">{getPriorityLabel(order.priority)}</p>
            </div>
          </div>

          {order.ticket && (
            <div className="flex items-start space-x-3">
              <Package className="w-5 h-5 text-gray-400 mt-0.5" />
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Linked Ticket</p>
                <p className="font-medium text-blue-600 dark:text-blue-400">{order.ticket.ticket_number}</p>
              </div>
            </div>
          )}

          <div className="flex items-start space-x-3">
            <RefreshCw className="w-5 h-5 text-gray-400 mt-0.5" />
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Quantity</p>
              <p className="font-medium text-gray-900 dark:text-white">
                {order.quantity_completed || 0} / {order.quantity_ordered || 1}
              </p>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        {steps.length > 0 && (
          <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400 mb-2">
              <span>Overall Progress</span>
              <span>{progress}% ({steps.filter(s => s.status === 'complete' || s.status === 'skipped').length}/{steps.length} steps)</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
          </div>
        )}

        {/* Hold Reason */}
        {order.status === 'hold' && order.hold_reason && (
          <div className="mt-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <div className="flex items-start space-x-2">
              <Pause className="w-5 h-5 text-yellow-600 mt-0.5" />
              <div>
                <p className="font-medium text-yellow-800 dark:text-yellow-200">On Hold</p>
                <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">{order.hold_reason}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Time Clock Widget */}
      <ProductionTimeClock orderId={orderId} onClockAction={loadOrderData} />

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              <span>{tab.label}</span>
              {tab.count > 0 && (
                <span className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 rounded-full">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="card">
        {activeTab === 'steps' && (
          <ProductionStepList
            orderId={orderId}
            steps={steps}
            orderStatus={order.status}
            onUpdate={loadOrderData}
          />
        )}

        {activeTab === 'materials' && (
          <BOMManager
            orderId={orderId}
            items={bom}
            orderStatus={order.status}
            onUpdate={loadOrderData}
          />
        )}

        {activeTab === 'time' && (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {timeLogs.length === 0 ? (
              <div className="p-8 text-center">
                <Clock className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500 dark:text-gray-400">No time logs recorded</p>
              </div>
            ) : (
              timeLogs.map((log) => (
                <div key={log.id} className="p-4 flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <Clock className="w-5 h-5 text-gray-400" />
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {new Date(log.clock_in).toLocaleString()}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {log.clock_out ? `Clocked out: ${new Date(log.clock_out).toLocaleString()}` : 'Still clocked in'}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-gray-900 dark:text-white">
                      {formatDuration(log.duration_minutes)}
                    </p>
                    {log.notes && (
                      <p className="text-sm text-gray-500 dark:text-gray-400">{log.notes}</p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'moves' && (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {materialMoves.length === 0 ? (
              <div className="p-8 text-center">
                <Truck className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500 dark:text-gray-400">No material moves recorded</p>
              </div>
            ) : (
              materialMoves.map((move) => (
                <div key={move.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <Truck className="w-5 h-5 text-gray-400" />
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">
                          {move.item?.name || 'Unknown item'} x{move.quantity}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {move.from_location?.name || 'Unknown'} → {move.to_work_center?.name || move.to_location?.name || 'Unknown'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                        move.status === 'delivered' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' :
                        move.status === 'in_transit' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' :
                        move.status === 'cancelled' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' :
                        'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                      }`}>
                        {move.status}
                      </span>
                      {move.assigned_to_user && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                          {move.assigned_to_user.full_name}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Hold Modal */}
      {showHoldModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Put Order on Hold</h3>
            <textarea
              value={holdReason}
              onChange={(e) => setHoldReason(e.target.value)}
              placeholder="Enter reason for hold..."
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex justify-end space-x-3 mt-4">
              <button
                onClick={() => {
                  setShowHoldModal(false);
                  setHoldReason('');
                }}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handlePutOnHold}
                disabled={!holdReason.trim() || actionLoading}
                className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50"
              >
                {actionLoading ? 'Saving...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
