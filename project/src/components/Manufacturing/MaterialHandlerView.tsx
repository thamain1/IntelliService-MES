import { useEffect, useState, useCallback } from 'react';
import {
  Truck,
  Package,
  MapPin,
  Clock,
  CheckCircle,
  Play,
  X,
  RefreshCw,
  AlertCircle,
  User,
  ArrowRight,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { ManufacturingService, MaterialMoveRequest } from '../../services/ManufacturingService';

type TabType = 'pending' | 'my-moves' | 'completed';

export function MaterialHandlerView() {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('pending');
  const [moves, setMoves] = useState<MaterialMoveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const loadMoves = useCallback(async () => {
    setLoading(true);
    try {
      const data = await ManufacturingService.getMoveQueue();
      setMoves(data);
      setLastRefresh(new Date());
    } catch (error) {
      console.error('Error loading moves:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMoves();
    // Auto-refresh every 30 seconds
    const interval = setInterval(loadMoves, 30000);
    return () => clearInterval(interval);
  }, [loadMoves]);

  const handleClaimMove = async (moveId: string) => {
    setActionLoading(moveId);
    try {
      const result = await ManufacturingService.claimMove(moveId);
      if (result.success) {
        await loadMoves();
      }
    } catch (error) {
      console.error('Error claiming move:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const _handleStartMove = async (moveId: string) => {
    setActionLoading(moveId);
    try {
      const result = await ManufacturingService.startMove(moveId);
      if (result.success) {
        await loadMoves();
      }
    } catch (error) {
      console.error('Error starting move:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCompleteMove = async (moveId: string) => {
    setActionLoading(moveId);
    try {
      const result = await ManufacturingService.completeMaterialMove(moveId);
      if (result.success) {
        await loadMoves();
      }
    } catch (error) {
      console.error('Error completing move:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancelMove = async (moveId: string) => {
    if (!confirm('Are you sure you want to cancel this move?')) return;
    setActionLoading(moveId);
    try {
      const result = await ManufacturingService.cancelMove(moveId, 'Cancelled by handler');
      if (result.success) {
        await loadMoves();
      }
    } catch (error) {
      console.error('Error cancelling move:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const getPriorityColor = (priority: number | null) => {
    if (!priority) return 'border-gray-300 dark:border-gray-600';
    const colors: Record<number, string> = {
      1: 'border-red-500 bg-red-50 dark:bg-red-900/20',
      2: 'border-orange-500 bg-orange-50 dark:bg-orange-900/20',
      3: 'border-blue-500',
      4: 'border-gray-400',
      5: 'border-gray-300',
    };
    return colors[priority] || 'border-gray-300';
  };

  const getPriorityBadge = (priority: number | null) => {
    if (!priority || priority > 2) return null;
    return (
      <span className={`px-3 py-1 text-sm font-bold rounded-full ${
        priority === 1 ? 'bg-red-600 text-white' : 'bg-orange-500 text-white'
      }`}>
        {priority === 1 ? 'URGENT' : 'HIGH'}
      </span>
    );
  };

  // Filter moves based on active tab
  const filteredMoves = moves.filter((move) => {
    switch (activeTab) {
      case 'pending':
        return move.status === 'requested';
      case 'my-moves':
        return move.assigned_to === profile?.id && move.status === 'in_transit';
      case 'completed':
        return move.status === 'delivered' || move.status === 'cancelled';
      default:
        return true;
    }
  });

  const pendingCount = moves.filter(m => m.status === 'requested').length;
  const myMovesCount = moves.filter(m => m.assigned_to === profile?.id && m.status === 'in_transit').length;
  const completedCount = moves.filter(m => m.status === 'delivered' || m.status === 'cancelled').length;

  const tabs = [
    { id: 'pending' as TabType, label: 'Pending', count: pendingCount },
    { id: 'my-moves' as TabType, label: 'My Moves', count: myMovesCount },
    { id: 'completed' as TabType, label: 'Completed', count: completedCount },
  ];

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      {/* Header - Large touch-friendly */}
      <div className="bg-white dark:bg-gray-800 shadow-sm p-4 sm:p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Truck className="w-8 h-8 sm:w-10 sm:h-10 text-blue-600" />
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Material Moves</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Last updated: {lastRefresh.toLocaleTimeString()}
              </p>
            </div>
          </div>
          <button
            onClick={loadMoves}
            disabled={loading}
            className="p-3 sm:p-4 bg-blue-100 dark:bg-blue-900/30 text-blue-600 rounded-xl hover:bg-blue-200 dark:hover:bg-blue-900/50 disabled:opacity-50"
          >
            <RefreshCw className={`w-6 h-6 sm:w-8 sm:h-8 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Tabs - Large touch targets */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="flex">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-4 sm:py-5 px-4 text-center font-medium text-base sm:text-lg transition-colors relative ${
                activeTab === tab.id
                  ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              <span>{tab.label}</span>
              {tab.count > 0 && (
                <span className={`ml-2 px-2 py-0.5 text-sm rounded-full ${
                  activeTab === tab.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300'
                }`}>
                  {tab.count}
                </span>
              )}
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-600"></div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="p-4 sm:p-6 space-y-4">
        {loading && filteredMoves.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        ) : filteredMoves.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-xl p-12 text-center">
            <Truck className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-medium text-gray-900 dark:text-white mb-2">
              {activeTab === 'pending' ? 'No pending moves' :
               activeTab === 'my-moves' ? 'No active moves' :
               'No completed moves'}
            </h3>
            <p className="text-gray-500 dark:text-gray-400">
              {activeTab === 'pending' ? 'All material move requests have been handled.' :
               activeTab === 'my-moves' ? "You don't have any moves in progress." :
               'Completed moves will appear here.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredMoves.map((move) => (
              <div
                key={move.id}
                className={`bg-white dark:bg-gray-800 rounded-xl border-l-4 shadow-sm overflow-hidden ${getPriorityColor(move.priority)}`}
              >
                {/* Card Header */}
                <div className="p-4 sm:p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <Package className="w-8 h-8 text-blue-600" />
                      <div>
                        <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">
                          {move.item?.name || 'Unknown Item'}
                        </h3>
                        {move.item?.part_number && (
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            Part #: {move.item.part_number}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {getPriorityBadge(move.priority)}
                      <span className="text-2xl font-bold text-gray-900 dark:text-white">
                        x{move.quantity}
                      </span>
                    </div>
                  </div>

                  {/* From/To */}
                  <div className="flex items-center space-x-4 mb-4">
                    <div className="flex-1 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                      <div className="flex items-center space-x-2 text-gray-500 dark:text-gray-400 mb-1">
                        <MapPin className="w-4 h-4" />
                        <span className="text-sm font-medium">FROM</span>
                      </div>
                      <p className="text-lg font-semibold text-gray-900 dark:text-white">
                        {move.from_location?.name || 'Unknown Location'}
                      </p>
                    </div>

                    <ArrowRight className="w-6 h-6 text-gray-400 flex-shrink-0" />

                    <div className="flex-1 p-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
                      <div className="flex items-center space-x-2 text-blue-600 dark:text-blue-400 mb-1">
                        <MapPin className="w-4 h-4" />
                        <span className="text-sm font-medium">TO</span>
                      </div>
                      <p className="text-lg font-semibold text-gray-900 dark:text-white">
                        {move.to_work_center?.name || move.to_location?.name || 'Unknown'}
                      </p>
                    </div>
                  </div>

                  {/* Meta info */}
                  <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                    {move.order?.order_number && (
                      <div className="flex items-center space-x-1">
                        <Package className="w-4 h-4" />
                        <span>{move.order.order_number}</span>
                      </div>
                    )}
                    {move.requested_by_user && (
                      <div className="flex items-center space-x-1">
                        <User className="w-4 h-4" />
                        <span>Requested by {move.requested_by_user.full_name}</span>
                      </div>
                    )}
                    <div className="flex items-center space-x-1">
                      <Clock className="w-4 h-4" />
                      <span>{new Date(move.created_at!).toLocaleString()}</span>
                    </div>
                  </div>

                  {move.notes && (
                    <div className="mt-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                      <p className="text-sm text-yellow-800 dark:text-yellow-200">
                        <AlertCircle className="w-4 h-4 inline mr-1" />
                        {move.notes}
                      </p>
                    </div>
                  )}
                </div>

                {/* Actions - Large touch-friendly buttons */}
                {move.status !== 'delivered' && move.status !== 'cancelled' && (
                  <div className="px-4 sm:px-6 pb-4 sm:pb-6 flex flex-wrap gap-3">
                    {move.status === 'requested' && (
                      <button
                        onClick={() => handleClaimMove(move.id)}
                        disabled={actionLoading === move.id}
                        className="flex-1 min-w-[140px] flex items-center justify-center space-x-2 py-4 px-6 bg-blue-600 text-white text-lg font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
                      >
                        {actionLoading === move.id ? (
                          <RefreshCw className="w-6 h-6 animate-spin" />
                        ) : (
                          <>
                            <Play className="w-6 h-6" />
                            <span>Claim & Start</span>
                          </>
                        )}
                      </button>
                    )}

                    {move.status === 'in_transit' && move.assigned_to === profile?.id && (
                      <>
                        <button
                          onClick={() => handleCompleteMove(move.id)}
                          disabled={actionLoading === move.id}
                          className="flex-1 min-w-[140px] flex items-center justify-center space-x-2 py-4 px-6 bg-green-600 text-white text-lg font-semibold rounded-xl hover:bg-green-700 disabled:opacity-50 transition-colors"
                        >
                          {actionLoading === move.id ? (
                            <RefreshCw className="w-6 h-6 animate-spin" />
                          ) : (
                            <>
                              <CheckCircle className="w-6 h-6" />
                              <span>Complete</span>
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => handleCancelMove(move.id)}
                          disabled={actionLoading === move.id}
                          className="flex items-center justify-center space-x-2 py-4 px-6 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-lg font-semibold rounded-xl hover:bg-red-200 dark:hover:bg-red-900/50 disabled:opacity-50 transition-colors"
                        >
                          <X className="w-6 h-6" />
                          <span>Cancel</span>
                        </button>
                      </>
                    )}
                  </div>
                )}

                {/* Status badge for completed */}
                {(move.status === 'delivered' || move.status === 'cancelled') && (
                  <div className="px-4 sm:px-6 pb-4 sm:pb-6">
                    <div className={`inline-flex items-center space-x-2 px-4 py-2 rounded-lg ${
                      move.status === 'delivered'
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                        : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                    }`}>
                      {move.status === 'delivered' ? (
                        <CheckCircle className="w-5 h-5" />
                      ) : (
                        <X className="w-5 h-5" />
                      )}
                      <span className="font-medium">
                        {move.status === 'delivered' ? 'Delivered' : 'Cancelled'}
                        {move.completed_at && ` - ${new Date(move.completed_at).toLocaleString()}`}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
