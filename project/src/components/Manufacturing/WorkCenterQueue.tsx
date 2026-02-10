import { useEffect, useState } from 'react';
import {
  Layers,
  Clock,
  ChevronRight,
  RefreshCw,
  AlertCircle,
  Settings,
} from 'lucide-react';
import { ManufacturingService, WorkCenter } from '../../services/ManufacturingService';
import { WorkCenterModal } from './WorkCenterModal';

interface QueueItem {
  step_id: string;
  production_order_id: string;
  order_number: string;
  order_title: string;
  order_priority: number | null;
  customer_name: string | null;
  step_number: number;
  step_name: string;
  work_center_id: string | null;
  work_center_name: string | null;
  work_center_code: string | null;
  step_status: string;
  estimated_minutes: number | null;
}

interface WorkCenterQueueProps {
  onSelectOrder: (orderId: string) => void;
}

export function WorkCenterQueue({ onSelectOrder }: WorkCenterQueueProps) {
  const [workCenters, setWorkCenters] = useState<WorkCenter[]>([]);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCenter, setSelectedCenter] = useState<string | null>(null);
  const [editingWorkCenter, setEditingWorkCenter] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [centers, queue] = await Promise.all([
        ManufacturingService.getWorkCenters(),
        ManufacturingService.getWorkCenterQueue(),
      ]);
      setWorkCenters(centers);
      setQueueItems(queue);
    } catch (error) {
      console.error('Error loading work center data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { class: string; label: string }> = {
      pending: { class: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300', label: 'Pending' },
      in_progress: { class: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300', label: 'In Progress' },
      complete: { class: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300', label: 'Complete' },
      skipped: { class: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400', label: 'Skipped' },
    };
    return badges[status] || badges.pending;
  };

  const getPriorityBadge = (priority: number | null) => {
    if (!priority || priority > 2) return null;
    const badges: Record<number, { label: string; class: string }> = {
      1: { label: 'Critical', class: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' },
      2: { label: 'High', class: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300' },
    };
    return badges[priority] || null;
  };

  const formatDuration = (minutes: number | null | undefined) => {
    if (!minutes) return '-';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const getQueueForCenter = (centerId: string | null) => {
    if (centerId === null) {
      return queueItems.filter(q => !q.work_center_id);
    }
    return queueItems.filter(q => q.work_center_id === centerId);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const filteredQueue = selectedCenter !== null
    ? getQueueForCenter(selectedCenter)
    : queueItems;

  return (
    <div className="space-y-6">
      {/* Work Center Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* All Centers Card */}
        <div
          onClick={() => setSelectedCenter(null)}
          className={`card p-4 cursor-pointer transition-all ${
            selectedCenter === null
              ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : 'hover:shadow-lg'
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">All Centers</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                {queueItems.length}
              </p>
            </div>
            <Layers className="w-8 h-8 text-gray-400" />
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Total steps in queue
          </p>
        </div>

        {/* Individual Work Center Cards */}
        {workCenters.map((center) => {
          const centerQueue = getQueueForCenter(center.id);
          const inProgress = centerQueue.filter(q => q.step_status === 'in_progress').length;

          return (
            <div
              key={center.id}
              onClick={() => setSelectedCenter(center.id)}
              className={`card p-4 cursor-pointer transition-all ${
                selectedCenter === center.id
                  ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'hover:shadow-lg'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{center.code}</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                    {centerQueue.length}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingWorkCenter(center.id);
                    }}
                    className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                    title="Work Center Settings"
                  >
                    <Settings className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                  </button>
                  <div className={`p-2 rounded-lg ${
                    inProgress > 0 ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-gray-100 dark:bg-gray-700'
                  }`}>
                    <Layers className={`w-6 h-6 ${
                      inProgress > 0 ? 'text-blue-600' : 'text-gray-400'
                    }`} />
                  </div>
                </div>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                {center.name}
              </p>
              {inProgress > 0 && (
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                  {inProgress} in progress
                </p>
              )}
            </div>
          );
        })}

        {/* Unassigned Card */}
        <div
          onClick={() => setSelectedCenter('')}
          className={`card p-4 cursor-pointer transition-all ${
            selectedCenter === ''
              ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : 'hover:shadow-lg'
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Unassigned</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                {getQueueForCenter(null).length}
              </p>
            </div>
            <AlertCircle className="w-8 h-8 text-yellow-500" />
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            No work center assigned
          </p>
        </div>
      </div>

      {/* Refresh Button */}
      <div className="flex justify-end">
        <button
          onClick={loadData}
          className="flex items-center space-x-2 px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Refresh</span>
        </button>
      </div>

      {/* Queue List */}
      <div className="card">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="font-medium text-gray-900 dark:text-white">
            {selectedCenter === null
              ? 'All Work - Queue'
              : selectedCenter === ''
                ? 'Unassigned Steps'
                : `${workCenters.find(c => c.id === selectedCenter)?.name || 'Work Center'} - Queue`}
          </h3>
        </div>

        {filteredQueue.length === 0 ? (
          <div className="p-8 text-center">
            <Layers className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400">No items in queue</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {filteredQueue.map((item) => {
              const statusBadge = getStatusBadge(item.step_status);
              const priorityBadge = getPriorityBadge(item.order_priority);

              return (
                <div
                  key={item.step_id}
                  onClick={() => onSelectOrder(item.production_order_id)}
                  className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 font-medium text-sm">
                        {item.step_number}
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-medium text-gray-900 dark:text-white">
                            {item.order_number}
                          </span>
                          <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${statusBadge.class}`}>
                            {statusBadge.label}
                          </span>
                          {priorityBadge && (
                            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${priorityBadge.class}`}>
                              {priorityBadge.label}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
                          {item.step_name}
                        </p>
                        <div className="flex items-center space-x-3 text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {item.customer_name && (
                            <span>{item.customer_name}</span>
                          )}
                          {item.work_center_code && (
                            <span className="flex items-center space-x-1">
                              <Layers className="w-3 h-3" />
                              <span>{item.work_center_code}</span>
                            </span>
                          )}
                          {item.estimated_minutes && (
                            <span className="flex items-center space-x-1">
                              <Clock className="w-3 h-3" />
                              <span>{formatDuration(item.estimated_minutes)}</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Work Center Settings Modal */}
      {editingWorkCenter && (
        <WorkCenterModal
          workCenterId={editingWorkCenter}
          onClose={() => setEditingWorkCenter(null)}
          onSave={() => loadData()}
        />
      )}
    </div>
  );
}
