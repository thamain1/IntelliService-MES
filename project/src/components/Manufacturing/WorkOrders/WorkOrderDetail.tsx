import { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Factory,
  Clock,
  CheckCircle,
  Pause,
  PlayCircle,
  AlertTriangle,
  Package,
  ListChecks,
  History,
  BarChart3,
  ClipboardCheck,
} from 'lucide-react';
import { ManufacturingService, ProductionOrder, ProductionStep, BOMItem } from '../../../services/ManufacturingService';
import { WorkOrderTraveler } from './WorkOrderTraveler';
import { WorkOrderMaterials } from './WorkOrderMaterials';
import { WorkOrderCounts } from './WorkOrderCounts';
import { WorkOrderQuality } from './WorkOrderQuality';
import { useAuth } from '../../../contexts/AuthContext';

interface WorkOrderDetailProps {
  orderId: string;
  onBack: () => void;
}

type TabId = 'traveler' | 'materials' | 'counts' | 'quality' | 'downtime' | 'history';

export function WorkOrderDetail({ orderId, onBack }: WorkOrderDetailProps) {
  const { profile } = useAuth();
  const [order, setOrder] = useState<ProductionOrder | null>(null);
  const [steps, setSteps] = useState<ProductionStep[]>([]);
  const [bom, setBom] = useState<BOMItem[]>([]);
  const [timeLogs, setTimeLogs] = useState<any[]>([]);
  const [materialMoves, setMaterialMoves] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>('traveler');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    loadOrder();
  }, [orderId]);

  const loadOrder = async () => {
    try {
      setLoading(true);
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
  };

  const handleStatusAction = async (action: 'start' | 'pause' | 'resume' | 'complete') => {
    if (!order) return;

    setActionLoading(action);
    try {
      let result;
      switch (action) {
        case 'start':
          result = await ManufacturingService.updateOrder(order.id, {
            status: 'in_progress',
            actual_start: new Date().toISOString(),
          });
          break;
        case 'pause':
          const reason = prompt('Enter hold reason:');
          if (reason) {
            result = await ManufacturingService.putOnHold(order.id, reason);
          }
          break;
        case 'resume':
          result = await ManufacturingService.resumeOrder(order.id);
          break;
        case 'complete':
          result = await ManufacturingService.completeOrder(order.id, order.quantity_ordered || undefined);
          break;
      }

      if (result?.success) {
        loadOrder();
      }
    } catch (error) {
      console.error('Error updating order:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { bg: string; icon: JSX.Element }> = {
      queued: {
        bg: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
        icon: <Clock className="w-4 h-4" />,
      },
      in_progress: {
        bg: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
        icon: <PlayCircle className="w-4 h-4" />,
      },
      hold: {
        bg: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
        icon: <Pause className="w-4 h-4" />,
      },
      complete: {
        bg: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
        icon: <CheckCircle className="w-4 h-4" />,
      },
    };
    return badges[status] || badges.queued;
  };

  const tabs: { id: TabId; label: string; icon: JSX.Element }[] = [
    { id: 'traveler', label: 'Traveler', icon: <ListChecks className="w-4 h-4" /> },
    { id: 'materials', label: 'Materials', icon: <Package className="w-4 h-4" /> },
    { id: 'counts', label: 'Counts', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'quality', label: 'Quality', icon: <ClipboardCheck className="w-4 h-4" /> },
    { id: 'downtime', label: 'Downtime', icon: <AlertTriangle className="w-4 h-4" /> },
    { id: 'history', label: 'History', icon: <History className="w-4 h-4" /> },
  ];

  const canManage = profile?.role === 'admin' || profile?.role === 'dispatcher' || profile?.role === 'supervisor';

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="text-center py-12">
        <Factory className="w-12 h-12 mx-auto mb-4 text-gray-400" />
        <p className="text-gray-500 dark:text-gray-400">Order not found</p>
        <button
          onClick={onBack}
          className="mt-4 text-blue-600 hover:text-blue-700 dark:text-blue-400"
        >
          Go back
        </button>
      </div>
    );
  }

  const statusBadge = getStatusBadge(order.status);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={onBack}
            className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center space-x-3">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {order.order_number}
              </h1>
              <span className={`flex items-center space-x-1 px-3 py-1 rounded-full ${statusBadge.bg}`}>
                {statusBadge.icon}
                <span className="capitalize">{order.status.replace('_', ' ')}</span>
              </span>
            </div>
            <p className="text-gray-600 dark:text-gray-400">{order.title}</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-2">
          {order.status === 'queued' && canManage && (
            <button
              onClick={() => handleStatusAction('start')}
              disabled={actionLoading === 'start'}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <PlayCircle className="w-4 h-4" />
              <span>Start</span>
            </button>
          )}
          {order.status === 'in_progress' && (
            <>
              <button
                onClick={() => handleStatusAction('pause')}
                disabled={actionLoading === 'pause'}
                className="flex items-center space-x-2 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50"
              >
                <Pause className="w-4 h-4" />
                <span>Hold</span>
              </button>
              {canManage && (
                <button
                  onClick={() => handleStatusAction('complete')}
                  disabled={actionLoading === 'complete'}
                  className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>Complete</span>
                </button>
              )}
            </>
          )}
          {order.status === 'hold' && canManage && (
            <button
              onClick={() => handleStatusAction('resume')}
              disabled={actionLoading === 'resume'}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <PlayCircle className="w-4 h-4" />
              <span>Resume</span>
            </button>
          )}
        </div>
      </div>

      {/* Order Info */}
      <div className="card p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {order.customer && (
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Customer</p>
              <p className="font-medium text-gray-900 dark:text-white">{order.customer.name}</p>
            </div>
          )}
          {order.project && (
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Project</p>
              <p className="font-medium text-gray-900 dark:text-white">{order.project.name}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Quantity</p>
            <p className="font-medium text-gray-900 dark:text-white">
              {order.quantity_completed || 0} / {order.quantity_ordered || 1}
            </p>
          </div>
          {order.assigned_user && (
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Assigned To</p>
              <p className="font-medium text-gray-900 dark:text-white">{order.assigned_user.full_name}</p>
            </div>
          )}
          {order.scheduled_start && (
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Scheduled Start</p>
              <p className="font-medium text-gray-900 dark:text-white">
                {new Date(order.scheduled_start).toLocaleDateString()}
              </p>
            </div>
          )}
          {order.actual_start && (
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Actual Start</p>
              <p className="font-medium text-gray-900 dark:text-white">
                {new Date(order.actual_start).toLocaleString()}
              </p>
            </div>
          )}
          {order.hold_reason && (
            <div className="col-span-2">
              <p className="text-xs text-gray-500 dark:text-gray-400">Hold Reason</p>
              <p className="font-medium text-yellow-600 dark:text-yellow-400">{order.hold_reason}</p>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex space-x-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center space-x-2 px-4 py-3 border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'traveler' && (
          <WorkOrderTraveler
            orderId={order.id}
            orderStatus={order.status}
            steps={steps}
            onUpdate={loadOrder}
          />
        )}
        {activeTab === 'materials' && (
          <WorkOrderMaterials
            orderId={order.id}
            orderStatus={order.status}
            bom={bom}
            onUpdate={loadOrder}
          />
        )}
        {activeTab === 'counts' && (
          <WorkOrderCounts
            orderId={order.id}
            orderStatus={order.status}
            onUpdate={loadOrder}
          />
        )}
        {activeTab === 'quality' && (
          <WorkOrderQuality
            productionOrderId={order.id}
            workCenterId={order.work_center_id || undefined}
          />
        )}
        {activeTab === 'downtime' && (
          <div className="card p-6 text-center text-gray-500 dark:text-gray-400">
            <AlertTriangle className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Downtime tracking coming soon</p>
          </div>
        )}
        {activeTab === 'history' && (
          <div className="card">
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <h3 className="font-semibold text-gray-900 dark:text-white">Activity History</h3>
            </div>
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {timeLogs.length === 0 && materialMoves.length === 0 ? (
                <div className="p-6 text-center text-gray-500">No activity recorded</div>
              ) : (
                <>
                  {timeLogs.map((log) => (
                    <div key={log.id} className="p-4">
                      <div className="flex items-center space-x-3">
                        <Clock className="w-4 h-4 text-gray-400" />
                        <div>
                          <p className="text-sm text-gray-900 dark:text-white">
                            Time logged: {log.clock_in ? new Date(log.clock_in).toLocaleString() : 'N/A'}
                            {log.clock_out && ` - ${new Date(log.clock_out).toLocaleString()}`}
                          </p>
                          {log.notes && (
                            <p className="text-xs text-gray-500">{log.notes}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
