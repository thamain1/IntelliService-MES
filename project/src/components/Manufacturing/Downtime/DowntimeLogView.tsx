import { useState, useEffect } from 'react';
import {
  AlertTriangle,
  Calendar,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Plus,
  Clock,
  CheckCircle,
  X,
  Layers,
} from 'lucide-react';
import { DowntimeService, DowntimeEvent, DowntimeSummary, DowntimeReason } from '../../../services/DowntimeService';
import { ManufacturingService, WorkCenter } from '../../../services/ManufacturingService';
import { DowntimeClassificationModal } from './DowntimeClassificationModal';
import { DowntimeParetoChart } from './DowntimeParetoChart';
import { useAuth } from '../../../contexts/AuthContext';

type FilterStatus = 'all' | 'classified' | 'unclassified';
type FilterCategory = 'all' | 'planned' | 'unplanned';

export function DowntimeLogView() {
  const { profile } = useAuth();
  const [events, setEvents] = useState<DowntimeEvent[]>([]);
  const [workCenters, setWorkCenters] = useState<WorkCenter[]>([]);
  const [_summary, setSummary] = useState<DowntimeSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedWorkCenter, setSelectedWorkCenter] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [filterCategory, setFilterCategory] = useState<FilterCategory>('all');
  const [dateRange, setDateRange] = useState(() => {
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const start = new Date(end);
    start.setDate(start.getDate() - 7);
    start.setHours(0, 0, 0, 0);
    return { start, end };
  });
  const [classifyingEvent, setClassifyingEvent] = useState<DowntimeEvent | null>(null);
  const [showNewDowntime, setShowNewDowntime] = useState(false);
  const [showPareto, setShowPareto] = useState(false);

  // New downtime form state
  const [newDowntime, setNewDowntime] = useState({
    work_center_id: '',
    equipment_asset_id: '',
    reason_code_id: '',
    start_ts: new Date().toISOString().slice(0, 16),
    end_ts: '',
    notes: '',
  });
  const [reasons, setReasons] = useState<DowntimeReason[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const canManage = profile?.role === 'admin' || profile?.role === 'dispatcher' || profile?.role === 'supervisor';
  const canClassify = canManage || profile?.role === 'operator';

  const loadWorkCenters = useCallback(async () => {
    try {
      const wcs = await ManufacturingService.getWorkCenters(true);
      setWorkCenters(wcs);
    } catch (error) {
      console.error('Error loading work centers:', error);
    }
  }, []);

  const loadReasons = useCallback(async () => {
    try {
      const data = await DowntimeService.getReasons(true);
      setReasons(data);
    } catch (error) {
      console.error('Error loading reasons:', error);
    }
  }, []);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const fromDate = dateRange.start.toISOString();
      const toDate = dateRange.end.toISOString();

      // Build filters
      const filters: Record<string, string | boolean> = {
        from_date: fromDate,
        to_date: toDate,
      };

      if (selectedWorkCenter !== 'all') {
        filters.work_center_id = selectedWorkCenter;
      }

      if (filterStatus === 'classified') {
        filters.is_classified = true;
      } else if (filterStatus === 'unclassified') {
        filters.is_classified = false;
      }

      if (filterCategory !== 'all') {
        filters.category = filterCategory;
      }

      const [eventsData, summaryData] = await Promise.all([
        DowntimeService.getDowntimeEvents(filters),
        selectedWorkCenter !== 'all'
          ? DowntimeService.getDowntimeSummary(selectedWorkCenter, fromDate, toDate)
          : null,
      ]);

      setEvents(eventsData);
      setSummary(summaryData);
    } catch (error) {
      console.error('Error loading downtime data:', error);
    } finally {
      setLoading(false);
    }
  }, [dateRange, selectedWorkCenter, filterStatus, filterCategory]);

  useEffect(() => {
    loadWorkCenters();
    loadReasons();
  }, [loadWorkCenters, loadReasons]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handlePrevWeek = () => {
    setDateRange(prev => ({
      start: new Date(prev.start.getTime() - 7 * 24 * 60 * 60 * 1000),
      end: new Date(prev.end.getTime() - 7 * 24 * 60 * 60 * 1000),
    }));
  };

  const handleNextWeek = () => {
    setDateRange(prev => ({
      start: new Date(prev.start.getTime() + 7 * 24 * 60 * 60 * 1000),
      end: new Date(prev.end.getTime() + 7 * 24 * 60 * 60 * 1000),
    }));
  };

  const handleToday = () => {
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const start = new Date(end);
    start.setDate(start.getDate() - 7);
    start.setHours(0, 0, 0, 0);
    setDateRange({ start, end });
  };

  const handleCreateDowntime = async () => {
    if (!newDowntime.work_center_id) return;

    setSubmitting(true);
    try {
      const result = await DowntimeService.startDowntime({
        work_center_id: newDowntime.work_center_id,
        equipment_asset_id: newDowntime.equipment_asset_id || undefined,
        reason_code_id: newDowntime.reason_code_id || undefined,
        start_ts: new Date(newDowntime.start_ts).toISOString(),
        notes: newDowntime.notes || undefined,
      });

      if (result.success && result.event && newDowntime.end_ts) {
        // End the downtime if end time provided
        await DowntimeService.endDowntime(result.event.id, new Date(newDowntime.end_ts).toISOString());
      }

      if (result.success) {
        setShowNewDowntime(false);
        setNewDowntime({
          work_center_id: '',
          equipment_asset_id: '',
          reason_code_id: '',
          start_ts: new Date().toISOString().slice(0, 16),
          end_ts: '',
          notes: '',
        });
        loadData();
      }
    } catch (error) {
      console.error('Error creating downtime:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const formatDateRange = () => {
    return `${dateRange.start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${dateRange.end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  };

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

  // Stats
  const totalDowntime = events.reduce((sum, e) => sum + (e.duration_minutes || 0), 0);
  const unclassifiedCount = events.filter(e => !e.is_classified).length;
  const plannedCount = events.filter(e => e.reason_category === 'planned').length;
  const unplannedCount = events.filter(e => e.reason_category === 'unplanned').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Downtime Log</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Track and classify equipment downtime events
            </p>
          </div>
        </div>
        {canManage && (
          <button
            onClick={() => setShowNewDowntime(true)}
            className="flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            <Plus className="w-4 h-4" />
            <span>Log Downtime</span>
          </button>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="flex items-center space-x-2 mb-2">
            <Clock className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-500">Total Downtime</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {formatDuration(totalDowntime)}
          </p>
          <p className="text-xs text-gray-500">{events.length} events</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center space-x-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-yellow-500" />
            <span className="text-sm text-gray-500">Unclassified</span>
          </div>
          <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
            {unclassifiedCount}
          </p>
          <p className="text-xs text-gray-500">events need review</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center space-x-2 mb-2">
            <CheckCircle className="w-4 h-4 text-blue-500" />
            <span className="text-sm text-gray-500">Planned</span>
          </div>
          <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {plannedCount}
          </p>
          <p className="text-xs text-gray-500">events</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center space-x-2 mb-2">
            <X className="w-4 h-4 text-red-500" />
            <span className="text-sm text-gray-500">Unplanned</span>
          </div>
          <p className="text-2xl font-bold text-red-600 dark:text-red-400">
            {unplannedCount}
          </p>
          <p className="text-xs text-gray-500">events</p>
        </div>
      </div>

      {/* Controls */}
      <div className="card p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between space-y-4 md:space-y-0">
          {/* Date Navigation */}
          <div className="flex items-center space-x-4">
            <button
              onClick={handlePrevWeek}
              className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center space-x-2">
              <Calendar className="w-4 h-4 text-gray-400" />
              <span className="font-medium text-gray-900 dark:text-white">
                {formatDateRange()}
              </span>
            </div>
            <button
              onClick={handleNextWeek}
              className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
            <button
              onClick={handleToday}
              className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
            >
              Today
            </button>
          </div>

          {/* Filters */}
          <div className="flex items-center space-x-4">
            <select
              value={selectedWorkCenter}
              onChange={(e) => setSelectedWorkCenter(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
            >
              <option value="all">All Work Centers</option>
              {workCenters.map(wc => (
                <option key={wc.id} value={wc.id}>{wc.code} - {wc.name}</option>
              ))}
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
            >
              <option value="all">All Status</option>
              <option value="classified">Classified</option>
              <option value="unclassified">Unclassified</option>
            </select>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value as FilterCategory)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
            >
              <option value="all">All Categories</option>
              <option value="planned">Planned</option>
              <option value="unplanned">Unplanned</option>
            </select>
            <button
              onClick={() => setShowPareto(!showPareto)}
              className={`px-3 py-2 text-sm rounded-lg ${
                showPareto
                  ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                  : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              Pareto
            </button>
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

      {/* Pareto Chart */}
      {showPareto && (
        <DowntimeParetoChart
          workCenterId={selectedWorkCenter !== 'all' ? selectedWorkCenter : undefined}
          fromDate={dateRange.start.toISOString()}
          toDate={dateRange.end.toISOString()}
        />
      )}

      {/* Events List */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white">
            Downtime Events ({events.length})
          </h3>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600"></div>
          </div>
        ) : events.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <AlertTriangle className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No downtime events found</p>
            <p className="text-sm mt-2">Try adjusting your filters or date range</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {events.map((event) => (
              <div
                key={event.id}
                className={`p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 ${
                  !event.is_classified ? 'bg-yellow-50 dark:bg-yellow-900/10' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className={`p-2 rounded-lg ${
                      event.is_classified
                        ? 'bg-green-100 dark:bg-green-900/30'
                        : 'bg-yellow-100 dark:bg-yellow-900/30'
                    }`}>
                      {event.is_classified ? (
                        <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                      ) : (
                        <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <p className="font-medium text-gray-900 dark:text-white">
                          {event.reason_code_name || 'Unclassified'}
                        </p>
                        {event.reason_category && (
                          <span className={`text-xs px-2 py-0.5 rounded-full ${getCategoryColor(event.reason_category)}`}>
                            {event.reason_category}
                          </span>
                        )}
                        {event.reason_group && (
                          <span className={`text-xs px-2 py-0.5 rounded-full ${getGroupColor(event.reason_group)}`}>
                            {event.reason_group}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center space-x-3 mt-1 text-sm text-gray-500">
                        <div className="flex items-center space-x-1">
                          <Layers className="w-3 h-3" />
                          <span>{event.work_center_name || 'Unknown'}</span>
                        </div>
                        {event.equipment_asset_name && (
                          <span>| {event.equipment_asset_name}</span>
                        )}
                        <span>| {new Date(event.start_ts).toLocaleString()}</span>
                      </div>
                      {event.notes && (
                        <p className="text-sm text-gray-500 mt-1">{event.notes}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    <div className="text-right">
                      <p className="font-medium text-gray-900 dark:text-white">
                        {formatDuration(event.duration_minutes)}
                      </p>
                      <p className="text-xs text-gray-500">
                        {event.end_ts ? 'Ended' : 'Ongoing'}
                      </p>
                    </div>
                    {!event.is_classified && canClassify && (
                      <button
                        onClick={() => setClassifyingEvent(event)}
                        className="px-3 py-1 bg-yellow-100 text-yellow-800 text-sm rounded-lg hover:bg-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:hover:bg-yellow-900/50"
                      >
                        Classify
                      </button>
                    )}
                    {event.is_classified && canClassify && (
                      <button
                        onClick={() => setClassifyingEvent(event)}
                        className="px-3 py-1 text-gray-500 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                      >
                        Reclassify
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Classification Modal */}
      {classifyingEvent && (
        <DowntimeClassificationModal
          event={classifyingEvent}
          onClose={() => setClassifyingEvent(null)}
          onClassified={() => {
            setClassifyingEvent(null);
            loadData();
          }}
        />
      )}

      {/* New Downtime Modal */}
      {showNewDowntime && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-lg w-full">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Log Downtime Event
              </h2>
              <button
                onClick={() => setShowNewDowntime(false)}
                className="p-2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Work Center *
                </label>
                <select
                  value={newDowntime.work_center_id}
                  onChange={(e) => setNewDowntime(n => ({ ...n, work_center_id: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                >
                  <option value="">Select work center...</option>
                  {workCenters.map(wc => (
                    <option key={wc.id} value={wc.id}>{wc.code} - {wc.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Reason Code
                </label>
                <select
                  value={newDowntime.reason_code_id}
                  onChange={(e) => setNewDowntime(n => ({ ...n, reason_code_id: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                >
                  <option value="">Select reason (optional)...</option>
                  {reasons.map(r => (
                    <option key={r.id} value={r.id}>{r.code} - {r.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Start Time *
                  </label>
                  <input
                    type="datetime-local"
                    value={newDowntime.start_ts}
                    onChange={(e) => setNewDowntime(n => ({ ...n, start_ts: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    End Time
                  </label>
                  <input
                    type="datetime-local"
                    value={newDowntime.end_ts}
                    onChange={(e) => setNewDowntime(n => ({ ...n, end_ts: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Notes
                </label>
                <textarea
                  value={newDowntime.notes}
                  onChange={(e) => setNewDowntime(n => ({ ...n, notes: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  placeholder="Additional notes..."
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end space-x-3">
              <button
                onClick={() => setShowNewDowntime(false)}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateDowntime}
                disabled={submitting || !newDowntime.work_center_id || !newDowntime.start_ts}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {submitting ? 'Creating...' : 'Log Downtime'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
