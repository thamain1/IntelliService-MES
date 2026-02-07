import { useState, useEffect } from 'react';
import { X, AlertTriangle, CheckCircle } from 'lucide-react';
import { DowntimeService, DowntimeReason, DowntimeEvent } from '../../../services/DowntimeService';

interface DowntimeClassificationModalProps {
  event: DowntimeEvent;
  onClose: () => void;
  onClassified: () => void;
}

export function DowntimeClassificationModal({
  event,
  onClose,
  onClassified,
}: DowntimeClassificationModalProps) {
  const [reasons, setReasons] = useState<DowntimeReason[]>([]);
  const [selectedReasonId, setSelectedReasonId] = useState<string>(event.reason_code_id || '');
  const [notes, setNotes] = useState(event.notes || '');
  const [loading, setLoading] = useState(false);
  const [loadingReasons, setLoadingReasons] = useState(true);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterGroup, setFilterGroup] = useState<string>('all');

  useEffect(() => {
    loadReasons();
  }, []);

  const loadReasons = async () => {
    try {
      setLoadingReasons(true);
      const data = await DowntimeService.getReasons(true);
      setReasons(data);
    } catch (error) {
      console.error('Error loading reasons:', error);
    } finally {
      setLoadingReasons(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedReasonId) return;

    setLoading(true);
    try {
      const result = await DowntimeService.classifyDowntime(event.id, {
        reason_code_id: selectedReasonId,
        notes: notes || undefined,
      });

      if (result.success) {
        onClassified();
      }
    } catch (error) {
      console.error('Error classifying downtime:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredReasons = reasons.filter(r => {
    if (filterCategory !== 'all' && r.category !== filterCategory) return false;
    if (filterGroup !== 'all' && r.reason_group !== filterGroup) return false;
    return true;
  });

  const uniqueCategories = [...new Set(reasons.map(r => r.category))];
  const uniqueGroups = [...new Set(reasons.map(r => r.reason_group))];

  const formatDuration = (minutes: number | null) => {
    if (!minutes) return 'Ongoing';
    if (minutes < 60) return `${Math.round(minutes)} min`;
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'planned':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
      case 'unplanned':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
  };

  const getGroupColor = (group: string) => {
    const colors: Record<string, string> = {
      mechanical: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
      electrical: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
      material: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
      quality: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
      ops: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
      other: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
    };
    return colors[group] || colors.other;
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <AlertTriangle className="w-5 h-5 text-yellow-500" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Classify Downtime Event
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Event Summary */}
        <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-gray-500">Work Center</p>
              <p className="font-medium text-gray-900 dark:text-white">
                {event.work_center_name || 'N/A'}
              </p>
            </div>
            <div>
              <p className="text-gray-500">Equipment</p>
              <p className="font-medium text-gray-900 dark:text-white">
                {event.equipment_asset_name || 'N/A'}
              </p>
            </div>
            <div>
              <p className="text-gray-500">Start Time</p>
              <p className="font-medium text-gray-900 dark:text-white">
                {new Date(event.start_ts).toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-gray-500">Duration</p>
              <p className="font-medium text-gray-900 dark:text-white">
                {formatDuration(event.duration_minutes)}
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 max-h-[50vh] overflow-y-auto">
          {/* Filters */}
          <div className="flex items-center space-x-4">
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
            >
              <option value="all">All Categories</option>
              {uniqueCategories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            <select
              value={filterGroup}
              onChange={(e) => setFilterGroup(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
            >
              <option value="all">All Groups</option>
              {uniqueGroups.map(grp => (
                <option key={grp} value={grp}>{grp}</option>
              ))}
            </select>
          </div>

          {/* Reason Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Select Reason Code *
            </label>
            {loadingReasons ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {filteredReasons.length === 0 ? (
                  <p className="text-gray-500 text-sm py-4 text-center">
                    No reason codes match the filters
                  </p>
                ) : (
                  filteredReasons.map((reason) => (
                    <div
                      key={reason.id}
                      onClick={() => setSelectedReasonId(reason.id)}
                      className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                        selectedReasonId === reason.id
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          {selectedReasonId === reason.id && (
                            <CheckCircle className="w-5 h-5 text-blue-500" />
                          )}
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">
                              {reason.code} - {reason.name}
                            </p>
                            {reason.description && (
                              <p className="text-sm text-gray-500">{reason.description}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className={`text-xs px-2 py-1 rounded-full ${getCategoryColor(reason.category)}`}>
                            {reason.category}
                          </span>
                          <span className={`text-xs px-2 py-1 rounded-full ${getGroupColor(reason.reason_group)}`}>
                            {reason.reason_group}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Notes (Optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              placeholder="Additional notes about this downtime event..."
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !selectedReasonId}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Classifying...' : 'Classify Event'}
          </button>
        </div>
      </div>
    </div>
  );
}
