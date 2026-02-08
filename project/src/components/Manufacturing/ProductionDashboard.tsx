import { useEffect, useState } from 'react';
import {
  Factory,
  Clock,
  Pause,
  CheckCircle,
  AlertCircle,
  Plus,
  Search,
  ChevronRight,
  Layers,
  RefreshCw,
  Package,
  Calendar,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import {
  ManufacturingService,
  ProductionDashboardItem,
  ProductionStats,
  DashboardFilters,
} from '../../services/ManufacturingService';
import { ProductionOrderDetail } from './ProductionOrderDetail';
import { ProductionOrderForm } from './ProductionOrderForm';
import { WorkCenterQueue } from './WorkCenterQueue';

interface ProductionDashboardProps {
  initialView?: 'dashboard' | 'work-centers';
  onNavigate?: (view: string) => void;
}

// Auto-refresh interval in milliseconds (30 seconds)
const AUTO_REFRESH_INTERVAL = 30000;

export function ProductionDashboard({ initialView = 'dashboard', onNavigate }: ProductionDashboardProps) {
  const { profile } = useAuth();
  const [view, setView] = useState<'dashboard' | 'work-centers'>(initialView);
  const [orders, setOrders] = useState<ProductionDashboardItem[]>([]);
  const [stats, setStats] = useState<ProductionStats>({
    total: 0,
    byStatus: { queued: 0, in_progress: 0, hold: 0, complete: 0 },
    todayCompleted: 0,
    avgCycleTimeHours: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null); // M4: Error state
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<number | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // M2: Include searchTerm in dependencies (via debounce pattern)
  useEffect(() => {
    loadData();
  }, [statusFilter, priorityFilter]);

  // M5: Auto-refresh dashboard data
  useEffect(() => {
    const timer = setInterval(() => {
      // Only auto-refresh if not in detail view and not showing modal
      if (!selectedOrderId && !showCreateModal) {
        loadData();
      }
    }, AUTO_REFRESH_INTERVAL);

    return () => clearInterval(timer);
  }, [selectedOrderId, showCreateModal, statusFilter, priorityFilter, searchTerm]);

  const loadData = async () => {
    setLoading(true);
    setError(null); // M4: Clear error on reload
    try {
      const filters: DashboardFilters = {
        search: searchTerm || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        priority: priorityFilter || undefined,
      };

      const [ordersData, statsData] = await Promise.all([
        ManufacturingService.getDashboard(filters),
        ManufacturingService.getStats(),
      ]);

      setOrders(ordersData);
      setStats(statsData);
    } catch (err: any) {
      console.error('Error loading production data:', err);
      setError(err.message || 'Failed to load production data'); // M4: Set error
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    loadData();
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'queued':
        return <Clock className="w-4 h-4 text-gray-500" />;
      case 'in_progress':
        return <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />;
      case 'hold':
        return <Pause className="w-4 h-4 text-yellow-500" />;
      case 'complete':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      default:
        return <AlertCircle className="w-4 h-4 text-gray-500" />;
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
    const badges: Record<number, { label: string; class: string }> = {
      1: { label: 'Critical', class: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' },
      2: { label: 'High', class: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300' },
      3: { label: 'Normal', class: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' },
      4: { label: 'Low', class: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300' },
      5: { label: 'Lowest', class: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400' },
    };
    return badges[priority] || null;
  };

  const statCards = [
    {
      title: 'Total Orders',
      value: stats.total,
      icon: Factory,
      color: 'text-gray-600',
      bgColor: 'bg-gray-100 dark:bg-gray-700',
    },
    {
      title: 'In Progress',
      value: stats.byStatus.in_progress,
      icon: RefreshCw,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100 dark:bg-blue-900/30',
      onClick: () => setStatusFilter('in_progress'),
    },
    {
      title: 'On Hold',
      value: stats.byStatus.hold,
      icon: Pause,
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-100 dark:bg-yellow-900/30',
      onClick: () => setStatusFilter('hold'),
    },
    {
      title: 'Completed Today',
      value: stats.todayCompleted,
      icon: CheckCircle,
      color: 'text-green-600',
      bgColor: 'bg-green-100 dark:bg-green-900/30',
    },
  ];

  if (selectedOrderId) {
    return (
      <ProductionOrderDetail
        orderId={selectedOrderId}
        onBack={() => {
          setSelectedOrderId(null);
          loadData();
        }}
      />
    );
  }

  if (view === 'work-centers') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Work Centers</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">Monitor and manage production work centers</p>
          </div>
          <button
            onClick={() => setView('dashboard')}
            className="flex items-center space-x-2 px-4 py-2 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            <Factory className="w-4 h-4" />
            <span>Back to Dashboard</span>
          </button>
        </div>
        <WorkCenterQueue onSelectOrder={(id) => setSelectedOrderId(id)} />
      </div>
    );
  }

  if (loading && orders.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // M4: Display error message if load failed
  if (error && orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full space-y-4">
        <AlertCircle className="w-12 h-12 text-red-500" />
        <p className="text-lg font-medium text-gray-900 dark:text-white">Failed to load data</p>
        <p className="text-gray-500 dark:text-gray-400">{error}</p>
        <button
          onClick={loadData}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Production Dashboard</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Manage shop floor production orders</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setView('work-centers')}
            className="flex items-center space-x-2 px-4 py-2 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            <Layers className="w-4 h-4" />
            <span>Work Centers</span>
          </button>
          {profile?.role !== 'technician' && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Plus className="w-4 h-4" />
              <span>New Order</span>
            </button>
          )}
        </div>
      </div>

      {/* M4: Error banner (when we have stale data but refresh failed) */}
      {error && orders.length > 0 && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <AlertCircle className="w-5 h-5 text-red-500" />
            <span className="text-red-800 dark:text-red-200">
              Failed to refresh data: {error}
            </span>
          </div>
          <button
            onClick={loadData}
            className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200 font-medium"
          >
            Retry
          </button>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <div
            key={card.title}
            onClick={card.onClick}
            className={`card p-6 ${card.onClick ? 'cursor-pointer hover:shadow-lg transition-shadow' : ''}`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{card.title}</p>
                <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{card.value}</p>
              </div>
              <div className={`${card.bgColor} p-3 rounded-lg`}>
                <card.icon className={`w-6 h-6 ${card.color}`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search orders..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            <option value="all">All Status</option>
            <option value="queued">Queued</option>
            <option value="in_progress">In Progress</option>
            <option value="hold">On Hold</option>
            <option value="complete">Complete</option>
          </select>

          <select
            value={priorityFilter || ''}
            onChange={(e) => setPriorityFilter(e.target.value ? Number(e.target.value) : null)}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            <option value="">All Priorities</option>
            <option value="1">Critical</option>
            <option value="2">High</option>
            <option value="3">Normal</option>
            <option value="4">Low</option>
            <option value="5">Lowest</option>
          </select>

          <button
            onClick={handleSearch}
            className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Orders List */}
      <div className="card">
        {orders.length === 0 ? (
          <div className="p-12 text-center">
            <Factory className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No production orders</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              {statusFilter !== 'all' ? 'No orders match the current filters.' : 'Get started by creating your first production order.'}
            </p>
            {profile?.role !== 'technician' && statusFilter === 'all' && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Plus className="w-4 h-4" />
                <span>Create Order</span>
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {orders.map((order) => {
              const priorityBadge = getPriorityBadge(order.priority);
              // M3: Cap progress at 100% to prevent overflow
              const progress = order.total_steps && order.total_steps > 0
                ? Math.min(100, Math.round((order.completed_steps || 0) / order.total_steps * 100))
                : 0;

              return (
                <div
                  key={order.id}
                  onClick={() => setSelectedOrderId(order.id)}
                  className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      {getStatusIcon(order.status)}
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-medium text-gray-900 dark:text-white">
                            {order.order_number}
                          </span>
                          <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getStatusBadge(order.status)}`}>
                            {order.status.replace('_', ' ')}
                          </span>
                          {priorityBadge && (
                            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${priorityBadge.class}`}>
                              {priorityBadge.label}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
                          {order.title}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-6">
                      {order.customer_name && (
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          <span className="font-medium">{order.customer_name}</span>
                        </div>
                      )}

                      {order.ticket_number && (
                        <div className="flex items-center space-x-1 text-sm text-gray-500 dark:text-gray-400">
                          <Package className="w-4 h-4" />
                          <span>{order.ticket_number}</span>
                        </div>
                      )}

                      {order.scheduled_start && (
                        <div className="flex items-center space-x-1 text-sm text-gray-500 dark:text-gray-400">
                          <Calendar className="w-4 h-4" />
                          <span>{new Date(order.scheduled_start).toLocaleDateString()}</span>
                        </div>
                      )}

                      {order.total_steps && order.total_steps > 0 && (
                        <div className="w-24">
                          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                            <span>Progress</span>
                            <span>{progress}%</span>
                          </div>
                          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                            <div
                              className="bg-blue-600 h-1.5 rounded-full transition-all"
                              style={{ width: `${progress}%` }}
                            ></div>
                          </div>
                        </div>
                      )}

                      <ChevronRight className="w-5 h-5 text-gray-400" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Order Modal */}
      {showCreateModal && (
        <ProductionOrderForm
          onClose={() => setShowCreateModal(false)}
          onSave={() => {
            setShowCreateModal(false);
            loadData();
          }}
        />
      )}
    </div>
  );
}
