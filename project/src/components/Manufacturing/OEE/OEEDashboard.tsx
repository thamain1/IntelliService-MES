import { useState, useEffect } from 'react';
import { Activity, Calendar, ChevronLeft, ChevronRight, RefreshCw, TrendingUp, TrendingDown, Layers } from 'lucide-react';
import { OEEService, OEEMetrics, OEETrend } from '../../../services/OEEService';
import { ManufacturingService, WorkCenter } from '../../../services/ManufacturingService';
import { OEESummaryTiles, OEEMetricsData } from './OEESummaryTiles';
import { OEEDowntimeDrilldown } from './OEEDowntimeDrilldown';
import { useAuth } from '../../../contexts/AuthContext';

type Granularity = 'hourly' | 'daily' | 'shift';
type ViewMode = 'overview' | 'drilldown';

export function OEEDashboard() {
  const { profile: _profile } = useAuth();
  const [workCenters, setWorkCenters] = useState<WorkCenter[]>([]);
  const [selectedWorkCenter, setSelectedWorkCenter] = useState<string>('');
  const [metrics, setMetrics] = useState<OEEMetrics | null>(null);
  const [trend, setTrend] = useState<OEETrend[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('overview');
  const [granularity, setGranularity] = useState<Granularity>('daily');
  const [dateRange, setDateRange] = useState(() => {
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const start = new Date(end);
    start.setDate(start.getDate() - 7);
    start.setHours(0, 0, 0, 0);
    return { start, end };
  });

  const loadWorkCenters = useCallback(async () => {
    try {
      const wcs = await ManufacturingService.getWorkCenters(true);
      setWorkCenters(wcs);
      if (wcs.length > 0 && !selectedWorkCenter) {
        setSelectedWorkCenter(wcs[0].id);
      }
    } catch (error) {
      console.error('Error loading work centers:', error);
    }
  }, [selectedWorkCenter]);

  const loadOEEData = useCallback(async () => {
    if (!selectedWorkCenter) return;
    try {
      setLoading(true);
      const fromDate = dateRange.start.toISOString();
      const toDate = dateRange.end.toISOString();

      const [oeeMetrics, oeeTrend] = await Promise.all([
        OEEService.calculateOEE(selectedWorkCenter, fromDate, toDate),
        OEEService.getOEETrend(selectedWorkCenter, fromDate, toDate, granularity),
      ]);

      setMetrics(oeeMetrics);
      setTrend(oeeTrend);
    } catch (error) {
      console.error('Error loading OEE data:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedWorkCenter, dateRange, granularity]);

  useEffect(() => {
    loadWorkCenters();
  }, [loadWorkCenters]);

  useEffect(() => {
    loadOEEData();
  }, [loadOEEData]);

  const handlePrevPeriod = () => {
    const days = granularity === 'hourly' ? 1 : 7;
    setDateRange(prev => ({
      start: new Date(prev.start.getTime() - days * 24 * 60 * 60 * 1000),
      end: new Date(prev.end.getTime() - days * 24 * 60 * 60 * 1000),
    }));
  };

  const handleNextPeriod = () => {
    const days = granularity === 'hourly' ? 1 : 7;
    setDateRange(prev => ({
      start: new Date(prev.start.getTime() + days * 24 * 60 * 60 * 1000),
      end: new Date(prev.end.getTime() + days * 24 * 60 * 60 * 1000),
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

  const formatDateRange = () => {
    if (granularity === 'hourly') {
      return dateRange.start.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    }
    return `${dateRange.start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${dateRange.end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  };

  const metricsData: OEEMetricsData | null = metrics ? {
    availability: metrics.availability_pct,
    performance: metrics.performance_pct,
    quality: metrics.quality_pct,
    oee: metrics.oee_pct,
    planned_time_minutes: metrics.planned_production_time_seconds / 60,
    run_time_minutes: metrics.actual_run_time_seconds / 60,
    downtime_minutes: metrics.downtime_seconds / 60,
    ideal_cycle_time_seconds: metrics.ideal_cycle_time_seconds ?? 60,
    total_count: metrics.total_count,
    good_count: metrics.good_count,
    scrap_count: metrics.scrap_count,
    rework_count: metrics.rework_count,
  } : null;

  const selectedWorkCenterData = workCenters.find(wc => wc.id === selectedWorkCenter);

  const getOEEColor = (value: number) => {
    if (value >= 85) return 'text-green-600 dark:text-green-400';
    if (value >= 60) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getTrendIcon = (current: number, previous: number | undefined) => {
    if (!previous) return null;
    if (current > previous) {
      return <TrendingUp className="w-4 h-4 text-green-500" />;
    } else if (current < previous) {
      return <TrendingDown className="w-4 h-4 text-red-500" />;
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Activity className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">OEE Dashboard</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Overall Equipment Effectiveness tracking
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setViewMode('overview')}
            className={`px-4 py-2 text-sm rounded-lg ${
              viewMode === 'overview'
                ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
                : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setViewMode('drilldown')}
            className={`px-4 py-2 text-sm rounded-lg ${
              viewMode === 'drilldown'
                ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
                : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            Downtime Drilldown
          </button>
        </div>
      </div>

      {/* Work Center Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {workCenters.slice(0, 6).map(wc => (
          <div
            key={wc.id}
            onClick={() => setSelectedWorkCenter(wc.id)}
            className={`card p-4 cursor-pointer transition-colors ${
              selectedWorkCenter === wc.id
                ? 'ring-2 ring-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                : 'hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
          >
            <div className="flex items-center space-x-2 mb-2">
              <Layers className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                {wc.code}
              </span>
            </div>
            <p className="text-xs text-gray-500 truncate">{wc.name}</p>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="card p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between space-y-4 md:space-y-0">
          {/* Date Navigation */}
          <div className="flex items-center space-x-4">
            <button
              onClick={handlePrevPeriod}
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
              onClick={handleNextPeriod}
              className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
            <button
              onClick={handleToday}
              className="px-3 py-1 text-sm text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg"
            >
              Today
            </button>
          </div>

          {/* Filters */}
          <div className="flex items-center space-x-4">
            <select
              value={selectedWorkCenter}
              onChange={(e) => setSelectedWorkCenter(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              {workCenters.map(wc => (
                <option key={wc.id} value={wc.id}>{wc.code} - {wc.name}</option>
              ))}
            </select>
            <select
              value={granularity}
              onChange={(e) => setGranularity(e.target.value as Granularity)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              <option value="hourly">Hourly</option>
              <option value="shift">By Shift</option>
              <option value="daily">Daily</option>
            </select>
            <button
              onClick={loadOEEData}
              className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              title="Refresh"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      {viewMode === 'overview' ? (
        <>
          {/* OEE Summary Tiles */}
          <OEESummaryTiles metrics={metricsData} loading={loading} showDenominators={true} />

          {/* OEE Trend Chart */}
          <div className="card">
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <h3 className="font-semibold text-gray-900 dark:text-white">OEE Trend</h3>
            </div>
            <div className="p-4">
              {loading ? (
                <div className="h-64 flex items-center justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                </div>
              ) : trend.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-gray-500">
                  No trend data available
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Simple bar chart representation */}
                  <div className="flex items-end space-x-1 h-48">
                    {trend.map((point) => (
                      <div
                        key={point.period_start}
                        className="flex-1 flex flex-col items-center justify-end"
                      >
                        <div
                          className={`w-full rounded-t transition-all ${
                            point.oee_pct >= 85
                              ? 'bg-green-500'
                              : point.oee_pct >= 60
                                ? 'bg-yellow-500'
                                : 'bg-red-500'
                          }`}
                          style={{ height: `${Math.max(point.oee_pct * 1.8, 2)}px` }}
                          title={`${point.oee_pct.toFixed(1)}%`}
                        />
                      </div>
                    ))}
                  </div>
                  {/* X-axis labels */}
                  <div className="flex space-x-1 text-xs text-gray-500 overflow-x-auto">
                    {trend.map((point) => (
                      <div key={point.period_start} className="flex-1 text-center truncate">
                        {granularity === 'hourly'
                          ? new Date(point.period_start).toLocaleTimeString('en-US', { hour: 'numeric' })
                          : granularity === 'shift'
                            ? point.shift_name || point.period_start
                            : new Date(point.period_start).toLocaleDateString('en-US', { weekday: 'short' })
                        }
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Detailed Trend Table */}
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <h3 className="font-semibold text-gray-900 dark:text-white">Detailed Metrics</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Period</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Availability</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Performance</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Quality</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">OEE</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Good</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Scrap</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Downtime</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                        Loading...
                      </td>
                    </tr>
                  ) : trend.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                        No data available
                      </td>
                    </tr>
                  ) : (
                    trend.map((point, index) => (
                      <tr key={point.period_start} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                          {granularity === 'hourly'
                            ? new Date(point.period_start).toLocaleString('en-US', {
                                weekday: 'short',
                                hour: 'numeric',
                                minute: '2-digit',
                              })
                            : granularity === 'shift'
                              ? point.shift_name || point.period_start
                              : new Date(point.period_start).toLocaleDateString('en-US', {
                                  weekday: 'short',
                                  month: 'short',
                                  day: 'numeric',
                                })
                          }
                        </td>
                        <td className={`px-4 py-3 text-sm text-right ${getOEEColor(point.availability_pct)}`}>
                          <div className="flex items-center justify-end space-x-1">
                            {getTrendIcon(point.availability_pct, trend[index - 1]?.availability_pct)}
                            <span>{point.availability_pct.toFixed(1)}%</span>
                          </div>
                        </td>
                        <td className={`px-4 py-3 text-sm text-right ${getOEEColor(point.performance_pct)}`}>
                          <div className="flex items-center justify-end space-x-1">
                            {getTrendIcon(point.performance_pct, trend[index - 1]?.performance_pct)}
                            <span>{point.performance_pct.toFixed(1)}%</span>
                          </div>
                        </td>
                        <td className={`px-4 py-3 text-sm text-right ${getOEEColor(point.quality_pct)}`}>
                          <div className="flex items-center justify-end space-x-1">
                            {getTrendIcon(point.quality_pct, trend[index - 1]?.quality_pct)}
                            <span>{point.quality_pct.toFixed(1)}%</span>
                          </div>
                        </td>
                        <td className={`px-4 py-3 text-sm text-right font-medium ${getOEEColor(point.oee_pct)}`}>
                          <div className="flex items-center justify-end space-x-1">
                            {getTrendIcon(point.oee_pct, trend[index - 1]?.oee_pct)}
                            <span>{point.oee_pct.toFixed(1)}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-green-600">
                          {point.good_count.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-red-600">
                          {(point.total_count - point.good_count).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-gray-500">
                          {Math.round(point.downtime_minutes)}m
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        /* Downtime Drilldown View */
        selectedWorkCenterData && (
          <OEEDowntimeDrilldown
            workCenterId={selectedWorkCenter}
            workCenterName={selectedWorkCenterData.name}
            fromDate={dateRange.start}
            toDate={dateRange.end}
          />
        )
      )}
    </div>
  );
}
