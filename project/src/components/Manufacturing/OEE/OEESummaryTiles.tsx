import { Activity, Clock, TrendingUp, Target, AlertTriangle } from 'lucide-react';

export interface OEEMetricsData {
  availability: number;
  performance: number;
  quality: number;
  oee: number;
  // Denominators for transparency
  planned_time_minutes: number;
  run_time_minutes: number;
  downtime_minutes: number;
  ideal_cycle_time_seconds: number;
  total_count: number;
  good_count: number;
  scrap_count: number;
  rework_count: number;
}

interface OEESummaryTilesProps {
  metrics: OEEMetricsData | null;
  loading?: boolean;
  showDenominators?: boolean;
}

export function OEESummaryTiles({ metrics, loading, showDenominators = true }: OEESummaryTilesProps) {
  const getOEEColor = (value: number) => {
    if (value >= 85) return 'text-green-600 dark:text-green-400';
    if (value >= 60) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getOEEBgColor = (value: number) => {
    if (value >= 85) return 'bg-green-100 dark:bg-green-900/30';
    if (value >= 60) return 'bg-yellow-100 dark:bg-yellow-900/30';
    return 'bg-red-100 dark:bg-red-900/30';
  };

  const formatPercent = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  const formatMinutes = (minutes: number) => {
    if (minutes < 60) return `${Math.round(minutes)}m`;
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="card p-4 animate-pulse">
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-20 mb-2"></div>
            <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-16 mb-2"></div>
            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-24"></div>
          </div>
        ))}
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {['Availability', 'Performance', 'Quality', 'OEE'].map((label) => (
          <div key={label} className="card p-4">
            <div className="flex items-center space-x-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</span>
            </div>
            <p className="text-2xl font-bold text-gray-400">--</p>
            <p className="text-xs text-gray-400 mt-1">No data available</p>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {/* Availability */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2">
            <Clock className="w-4 h-4 text-blue-500" />
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Availability</span>
          </div>
          <span className={`text-xs px-2 py-0.5 rounded-full ${getOEEBgColor(metrics.availability)}`}>
            A
          </span>
        </div>
        <p className={`text-2xl font-bold ${getOEEColor(metrics.availability)}`}>
          {formatPercent(metrics.availability)}
        </p>
        {showDenominators && (
          <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 space-y-1">
            <p className="text-xs text-gray-500">
              Run: {formatMinutes(metrics.run_time_minutes)}
            </p>
            <p className="text-xs text-gray-500">
              Planned: {formatMinutes(metrics.planned_time_minutes)}
            </p>
            <p className="text-xs text-red-500">
              Downtime: {formatMinutes(metrics.downtime_minutes)}
            </p>
          </div>
        )}
      </div>

      {/* Performance */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2">
            <TrendingUp className="w-4 h-4 text-purple-500" />
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Performance</span>
          </div>
          <span className={`text-xs px-2 py-0.5 rounded-full ${getOEEBgColor(metrics.performance)}`}>
            P
          </span>
        </div>
        <p className={`text-2xl font-bold ${getOEEColor(metrics.performance)}`}>
          {formatPercent(metrics.performance)}
        </p>
        {showDenominators && (
          <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 space-y-1">
            <p className="text-xs text-gray-500">
              Ideal Cycle: {metrics.ideal_cycle_time_seconds}s
            </p>
            <p className="text-xs text-gray-500">
              Total Count: {metrics.total_count.toLocaleString()}
            </p>
            <p className="text-xs text-gray-500">
              Run Time: {formatMinutes(metrics.run_time_minutes)}
            </p>
          </div>
        )}
      </div>

      {/* Quality */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2">
            <Target className="w-4 h-4 text-green-500" />
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Quality</span>
          </div>
          <span className={`text-xs px-2 py-0.5 rounded-full ${getOEEBgColor(metrics.quality)}`}>
            Q
          </span>
        </div>
        <p className={`text-2xl font-bold ${getOEEColor(metrics.quality)}`}>
          {formatPercent(metrics.quality)}
        </p>
        {showDenominators && (
          <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 space-y-1">
            <p className="text-xs text-green-600">
              Good: {metrics.good_count.toLocaleString()}
            </p>
            <p className="text-xs text-red-500">
              Scrap: {metrics.scrap_count.toLocaleString()}
            </p>
            <p className="text-xs text-yellow-600">
              Rework: {metrics.rework_count.toLocaleString()}
            </p>
          </div>
        )}
      </div>

      {/* OEE */}
      <div className={`card p-4 ${getOEEBgColor(metrics.oee)}`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2">
            <Activity className="w-4 h-4 text-indigo-500" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">OEE</span>
          </div>
          <span className="text-xs px-2 py-0.5 rounded-full bg-white dark:bg-gray-800">
            A×P×Q
          </span>
        </div>
        <p className={`text-3xl font-bold ${getOEEColor(metrics.oee)}`}>
          {formatPercent(metrics.oee)}
        </p>
        {showDenominators && (
          <div className="mt-2 pt-2 border-t border-gray-300 dark:border-gray-600 space-y-1">
            <p className="text-xs text-gray-600 dark:text-gray-400">
              {formatPercent(metrics.availability)} × {formatPercent(metrics.performance)} × {formatPercent(metrics.quality)}
            </p>
            <p className="text-xs text-gray-500">
              = {formatPercent(metrics.oee)}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
