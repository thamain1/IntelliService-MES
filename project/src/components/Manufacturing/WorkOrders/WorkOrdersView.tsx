import { useState, useEffect } from 'react';
import {
  Factory,
  Search,
  Filter,
  Plus,
  ChevronRight,
  Clock,
  CheckCircle,
  AlertCircle,
  Pause,
  PlayCircle,
  RefreshCw,
} from 'lucide-react';
import { ManufacturingService, ProductionDashboardItem, ProductionStats } from '../../../services/ManufacturingService';
import { useAuth } from '../../../contexts/AuthContext';

interface WorkOrdersViewProps {
  onSelectOrder?: (orderId: string) => void;
  onCreateOrder?: () => void;
}

export function WorkOrdersView({ onSelectOrder, onCreateOrder }: WorkOrdersViewProps) {
  const { profile } = useAuth();
  const [orders, setOrders] = useState<ProductionDashboardItem[]>([]);
  const [stats, setStats] = useState<ProductionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    status: 'all',
    priority: '',
    search: '',
  });
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    loadData();
  }, [filters]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [ordersData, statsData] = await Promise.all([
        ManufacturingService.getDashboard({
          status: filters.status !== 'all' ? filters.status : undefined,
          priority: filters.priority ? parseInt(filters.priority) : undefined,
          search: filters.search || undefined,
        }),
        ManufacturingService.getStats(),
      ]);
      setOrders(ordersData);
      setStats(statsData);
    } catch (error) {
      console.error('Error loading work orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'queued':
        return <Clock className="w-4 h-4 text-gray-500" />;
      case 'in_progress':
        return <PlayCircle className="w-4 h-4 text-blue-500" />;
      case 'hold':
        return <Pause className="w-4 h-4 text-yellow-500" />;
      case 'complete':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      default:
        return <AlertCircle className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, string> = {
      queued: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
      in_progress: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
      hold: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
      complete: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    };
    return badges[status] || badges.queued;
  };

  const getPriorityBadge = (priority: number | null) => {
    if (!priority) return null;
    const colors: Record<number, string> = {
      1: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
      2: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
      3: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
      4: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
      5: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
    };
    return (
      <span className={`px-2 py-0.5 text-xs rounded-full ${colors[priority] || colors[3]}`}>
        P{priority}
      </span>
    );
  };

  const canCreate = profile?.role === 'admin' || profile?.role === 'dispatcher';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Factory className="w-8 h-8 text-blue-600 dark:text-blue-400" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Work Orders</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Production orders and shop floor tracking
            </p>
          </div>
        </div>
        {canCreate && (
          <button
            onClick={onCreateOrder}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>New Work Order</span>
          </button>
        )}
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="card p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Queued</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.byStatus.queued}</p>
              </div>
              <Clock className="w-8 h-8 text-gray-400" />
            </div>
          </div>
          <div className="card p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">In Progress</p>
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.byStatus.in_progress}</p>
              </div>
              <PlayCircle className="w-8 h-8 text-blue-400" />
            </div>
          </div>
          <div className="card p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">On Hold</p>
                <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{stats.byStatus.hold}</p>
              </div>
              <Pause className="w-8 h-8 text-yellow-400" />
            </div>
          </div>
          <div className="card p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Completed Today</p>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.todayCompleted}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-400" />
            </div>
          </div>
        </div>
      )}

      {/* Search and Filters */}
      <div className="card p-4">
        <div className="flex flex-col md:flex-row md:items-center space-y-4 md:space-y-0 md:space-x-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search orders..."
              value={filters.search}
              onChange={(e) => setFilters(f => ({ ...f, search: e.target.value }))}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="flex items-center space-x-4">
            <select
              value={filters.status}
              onChange={(e) => setFilters(f => ({ ...f, status: e.target.value }))}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Status</option>
              <option value="queued">Queued</option>
              <option value="in_progress">In Progress</option>
              <option value="hold">On Hold</option>
              <option value="complete">Complete</option>
            </select>
            <select
              value={filters.priority}
              onChange={(e) => setFilters(f => ({ ...f, priority: e.target.value }))}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Priorities</option>
              <option value="1">P1 - Critical</option>
              <option value="2">P2 - High</option>
              <option value="3">P3 - Normal</option>
              <option value="4">P4 - Low</option>
              <option value="5">P5 - Minimal</option>
            </select>
            <button
              onClick={loadData}
              className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              title="Refresh"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Orders List */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500 dark:text-gray-400">
            <Factory className="w-12 h-12 mb-4 opacity-50" />
            <p>No work orders found</p>
            {canCreate && (
              <button
                onClick={onCreateOrder}
                className="mt-4 text-blue-600 hover:text-blue-700 dark:text-blue-400"
              >
                Create your first work order
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {orders.map((order) => (
              <div
                key={order.id}
                onClick={() => onSelectOrder?.(order.id)}
                className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    {getStatusIcon(order.status)}
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-medium text-gray-900 dark:text-white">
                          {order.order_number}
                        </span>
                        <span className={`px-2 py-0.5 text-xs rounded-full ${getStatusBadge(order.status)}`}>
                          {order.status.replace('_', ' ')}
                        </span>
                        {getPriorityBadge(order.priority)}
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{order.title}</p>
                      {order.customer_name && (
                        <p className="text-xs text-gray-500 dark:text-gray-500">
                          Customer: {order.customer_name}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    <div className="text-right text-sm">
                      {order.total_steps && order.total_steps > 0 && (
                        <div className="flex items-center space-x-2">
                          <div className="w-24 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                            <div
                              className="bg-blue-600 h-2 rounded-full"
                              style={{
                                width: `${Math.min(100, ((order.completed_steps || 0) / order.total_steps) * 100)}%`,
                              }}
                            />
                          </div>
                          <span className="text-xs text-gray-500">
                            {order.completed_steps || 0}/{order.total_steps}
                          </span>
                        </div>
                      )}
                      {order.current_work_center_name && (
                        <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                          @ {order.current_work_center_name}
                        </p>
                      )}
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
