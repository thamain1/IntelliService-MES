import { useState, useEffect } from 'react';
import { Clock, AlertTriangle, ChevronDown, ChevronUp, TrendingDown } from 'lucide-react';
import { DowntimeService, DowntimeParetoItem, DowntimeEvent } from '../../../services/DowntimeService';

interface OEEDowntimeDrilldownProps {
  workCenterId: string;
  workCenterName: string;
  fromDate: Date;
  toDate: Date;
}

type ParetoView = 'reason' | 'category' | 'group';

export function OEEDowntimeDrilldown({
  workCenterId,
  workCenterName,
  fromDate,
  toDate,
}: OEEDowntimeDrilldownProps) {
  const [paretoView, setParetoView] = useState<ParetoView>('reason');
  const [paretoData, setParetoData] = useState<DowntimeParetoItem[]>([]);
  const [recentEvents, setRecentEvents] = useState<DowntimeEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [workCenterId, fromDate, toDate, paretoView]);

  const loadData = async () => {
    try {
      setLoading(true);
      const fromDateStr = fromDate.toISOString();
      const toDateStr = toDate.toISOString();

      // Load pareto data based on view
      let pareto: DowntimeParetoItem[] = [];
      switch (paretoView) {
        case 'reason':
          pareto = await DowntimeService.getParetoByReason(workCenterId, fromDateStr, toDateStr, 10);
          break;
        case 'category':
          pareto = await DowntimeService.getParetoByCategory(workCenterId, fromDateStr, toDateStr);
          break;
        case 'group':
          pareto = await DowntimeService.getParetoByGroup(workCenterId, fromDateStr, toDateStr);
          break;
      }
      setParetoData(pareto);

      // Load recent downtime events
      const events = await DowntimeService.getDowntimeEvents({
        work_center_id: workCenterId,
        from_date: fromDateStr,
        to_date: toDateStr,
        limit: 10,
      });
      setRecentEvents(events);
    } catch (error) {
      console.error('Error loading downtime drilldown:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${Math.round(minutes)}m`;
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

  const maxDuration = paretoData.length > 0 ? Math.max(...paretoData.map(p => p.total_duration_minutes)) : 0;

  if (loading) {
    return (
      <div className="card p-6">
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Pareto Chart */}
      <div className="card">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <TrendingDown className="w-5 h-5 text-red-500" />
            <h3 className="font-semibold text-gray-900 dark:text-white">
              Downtime Pareto - {workCenterName}
            </h3>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setParetoView('reason')}
              className={`px-3 py-1 text-sm rounded-lg ${
                paretoView === 'reason'
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                  : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              By Reason
            </button>
            <button
              onClick={() => setParetoView('category')}
              className={`px-3 py-1 text-sm rounded-lg ${
                paretoView === 'category'
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                  : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              By Category
            </button>
            <button
              onClick={() => setParetoView('group')}
              className={`px-3 py-1 text-sm rounded-lg ${
                paretoView === 'group'
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                  : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              By Group
            </button>
          </div>
        </div>

        <div className="p-4">
          {paretoData.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <AlertTriangle className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No downtime data for selected period</p>
            </div>
          ) : (
            <div className="space-y-3">
              {paretoData.map((item, index) => (
                <div key={item.key} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center space-x-2">
                      <span className="text-gray-400 w-6">{index + 1}.</span>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {item.label}
                      </span>
                      {paretoView === 'reason' && item.category && (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${getCategoryColor(item.category)}`}>
                          {item.category}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center space-x-4">
                      <span className="text-gray-500">{item.event_count} events</span>
                      <span className="font-medium text-gray-900 dark:text-white w-20 text-right">
                        {formatDuration(item.total_duration_minutes)}
                      </span>
                      <span className="text-gray-500 w-12 text-right">
                        {item.percentage.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className="bg-red-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${(item.total_duration_minutes / maxDuration) * 100}%` }}
                      />
                    </div>
                    {/* Cumulative line indicator */}
                    <div className="w-12 text-right">
                      <span className="text-xs text-gray-400">
                        {item.cumulative_percentage.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Events */}
      <div className="card">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-2">
            <Clock className="w-5 h-5 text-gray-400" />
            <h3 className="font-semibold text-gray-900 dark:text-white">Recent Downtime Events</h3>
          </div>
        </div>

        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {recentEvents.length === 0 ? (
            <div className="p-6 text-center text-gray-500">No recent downtime events</div>
          ) : (
            recentEvents.map((event) => (
              <div key={event.id} className="p-4">
                <div
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => setExpandedEvent(expandedEvent === event.id ? null : event.id)}
                >
                  <div className="flex items-center space-x-3">
                    <div className={`p-2 rounded-lg ${
                      event.is_classified
                        ? 'bg-green-100 dark:bg-green-900/30'
                        : 'bg-yellow-100 dark:bg-yellow-900/30'
                    }`}>
                      <AlertTriangle className={`w-4 h-4 ${
                        event.is_classified
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-yellow-600 dark:text-yellow-400'
                      }`} />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {event.reason_code_name || 'Unclassified'}
                      </p>
                      <p className="text-sm text-gray-500">
                        {new Date(event.start_ts).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    {event.reason_category && (
                      <span className={`text-xs px-2 py-1 rounded-full ${getCategoryColor(event.reason_category)}`}>
                        {event.reason_category}
                      </span>
                    )}
                    {event.reason_group && (
                      <span className={`text-xs px-2 py-1 rounded-full ${getGroupColor(event.reason_group)}`}>
                        {event.reason_group}
                      </span>
                    )}
                    <span className="font-medium text-gray-900 dark:text-white">
                      {event.duration_minutes ? formatDuration(event.duration_minutes) : 'Ongoing'}
                    </span>
                    {expandedEvent === event.id ? (
                      <ChevronUp className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    )}
                  </div>
                </div>

                {expandedEvent === event.id && (
                  <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
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
                      <p className="text-gray-500">End Time</p>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {event.end_ts ? new Date(event.end_ts).toLocaleString() : 'Ongoing'}
                      </p>
                    </div>
                    {event.notes && (
                      <div className="col-span-4">
                        <p className="text-gray-500">Notes</p>
                        <p className="font-medium text-gray-900 dark:text-white">{event.notes}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
