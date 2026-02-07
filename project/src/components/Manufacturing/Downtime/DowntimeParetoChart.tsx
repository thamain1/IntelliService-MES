import { useState, useEffect } from 'react';
import { TrendingDown, AlertTriangle } from 'lucide-react';
import { DowntimeService, DowntimeParetoItem } from '../../../services/DowntimeService';

interface DowntimeParetoChartProps {
  workCenterId?: string;
  fromDate: string;
  toDate: string;
}

type ParetoView = 'reason' | 'category' | 'group';

export function DowntimeParetoChart({
  workCenterId,
  fromDate,
  toDate,
}: DowntimeParetoChartProps) {
  const [paretoView, setParetoView] = useState<ParetoView>('reason');
  const [paretoData, setParetoData] = useState<DowntimeParetoItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadParetoData();
  }, [workCenterId, fromDate, toDate, paretoView]);

  const loadParetoData = async () => {
    try {
      setLoading(true);
      let data: DowntimeParetoItem[] = [];

      switch (paretoView) {
        case 'reason':
          data = await DowntimeService.getParetoByReason(workCenterId, fromDate, toDate, 10);
          break;
        case 'category':
          data = await DowntimeService.getParetoByCategory(workCenterId, fromDate, toDate);
          break;
        case 'group':
          data = await DowntimeService.getParetoByGroup(workCenterId, fromDate, toDate);
          break;
      }

      setParetoData(data);
    } catch (error) {
      console.error('Error loading pareto data:', error);
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
        return 'bg-blue-500';
      case 'unplanned':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getGroupColor = (group: string) => {
    const colors: Record<string, string> = {
      mechanical: 'bg-orange-500',
      electrical: 'bg-yellow-500',
      material: 'bg-purple-500',
      quality: 'bg-red-500',
      ops: 'bg-blue-500',
      other: 'bg-gray-500',
    };
    return colors[group] || colors.other;
  };

  const getBarColor = (item: DowntimeParetoItem) => {
    if (paretoView === 'category') return getCategoryColor(item.key);
    if (paretoView === 'group') return getGroupColor(item.key);
    return item.category === 'planned' ? 'bg-blue-500' : 'bg-red-500';
  };

  const maxDuration = paretoData.length > 0
    ? Math.max(...paretoData.map(p => p.total_duration_minutes))
    : 0;

  if (loading) {
    return (
      <div className="card p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <TrendingDown className="w-5 h-5 text-red-500" />
          <h3 className="font-semibold text-gray-900 dark:text-white">Downtime Pareto</h3>
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
          <div className="text-center py-12 text-gray-500">
            <AlertTriangle className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No downtime data for selected period</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Bar Chart */}
            <div className="space-y-3">
              {paretoData.map((item, index) => (
                <div key={item.key} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center space-x-2 flex-1 min-w-0">
                      <span className="text-gray-400 w-6 flex-shrink-0">{index + 1}.</span>
                      <span className="font-medium text-gray-900 dark:text-white truncate">
                        {item.label}
                      </span>
                    </div>
                    <div className="flex items-center space-x-4 flex-shrink-0">
                      <span className="text-gray-500 text-xs">{item.event_count} events</span>
                      <span className="font-medium text-gray-900 dark:text-white w-16 text-right">
                        {formatDuration(item.total_duration_minutes)}
                      </span>
                      <span className="text-gray-500 w-14 text-right">
                        {item.percentage.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                      <div
                        className={`${getBarColor(item)} h-3 rounded-full transition-all duration-300`}
                        style={{ width: `${(item.total_duration_minutes / maxDuration) * 100}%` }}
                      />
                    </div>
                    {/* Cumulative percentage marker */}
                    <div className="w-16 text-right">
                      <span className="text-xs text-gray-400">
                        {item.cumulative_percentage.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Cumulative Line (simplified representation) */}
            <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between text-sm text-gray-500">
                <span>Cumulative Impact</span>
                <div className="flex items-center space-x-2">
                  {paretoData.map((item, index) => (
                    <div
                      key={item.key}
                      className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-xs"
                      title={`${item.label}: ${item.cumulative_percentage.toFixed(0)}%`}
                    >
                      {item.cumulative_percentage.toFixed(0)}
                    </div>
                  ))}
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                {paretoData.filter(p => p.cumulative_percentage <= 80).length} items account for ~80% of downtime
              </p>
            </div>

            {/* Legend */}
            {paretoView === 'reason' && (
              <div className="flex items-center space-x-4 text-xs text-gray-500 pt-4 border-t border-gray-200 dark:border-gray-700">
                <div className="flex items-center space-x-1">
                  <div className="w-3 h-3 bg-blue-500 rounded"></div>
                  <span>Planned</span>
                </div>
                <div className="flex items-center space-x-1">
                  <div className="w-3 h-3 bg-red-500 rounded"></div>
                  <span>Unplanned</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
