import { useState, useEffect } from 'react';
import { Calendar, ChevronLeft, ChevronRight, RefreshCw, Layers } from 'lucide-react';
import { ProductionSchedulingService, WorkCenterSchedule, WorkCenterCapacity } from '../../../services/ProductionSchedulingService';
import { ManufacturingService, WorkCenter } from '../../../services/ManufacturingService';
import { SchedulingGrid } from './SchedulingGrid';
import { useAuth } from '../../../contexts/AuthContext';

export function ProductionSchedulingView() {
  const { profile: _profile } = useAuth();
  const [workCenters, setWorkCenters] = useState<WorkCenter[]>([]);
  const [schedules, setSchedules] = useState<WorkCenterSchedule[]>([]);
  const [capacities, setCapacities] = useState<WorkCenterCapacity[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedWorkCenter, setSelectedWorkCenter] = useState<string>('all');
  const [dateRange, setDateRange] = useState(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { start, end };
  });
  const [_viewMode, _setViewMode] = useState<'grid' | 'list'>('grid');

  const loadWorkCenters = useCallback(async () => {
    try {
      const wcs = await ManufacturingService.getWorkCenters(true);
      setWorkCenters(wcs);
    } catch (error) {
      console.error('Error loading work centers:', error);
    }
  }, []);

  const loadSchedules = useCallback(async () => {
    try {
      setLoading(true);

      const filters: Record<string, string> = {
        from_date: dateRange.start.toISOString(),
        to_date: dateRange.end.toISOString(),
      };

      if (selectedWorkCenter !== 'all') {
        filters.work_center_id = selectedWorkCenter;
      }

      const schedulesData = await ProductionSchedulingService.getSchedules(filters);
      setSchedules(schedulesData);

      // Load capacity for selected work centers
      const wcIds = selectedWorkCenter === 'all'
        ? workCenters.map(wc => wc.id)
        : [selectedWorkCenter];

      if (wcIds.length > 0) {
        const capacityData = await ProductionSchedulingService.getWorkCenterCapacity(
          wcIds,
          dateRange.start.toISOString(),
          dateRange.end.toISOString()
        );
        setCapacities(capacityData);
      }
    } catch (error) {
      console.error('Error loading schedules:', error);
    } finally {
      setLoading(false);
    }
  }, [dateRange, selectedWorkCenter, workCenters]);

  useEffect(() => {
    loadWorkCenters();
  }, [loadWorkCenters]);

  useEffect(() => {
    loadSchedules();
  }, [loadSchedules]);

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
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    setDateRange({ start, end });
  };

  const formatDateRange = () => {
    return `${dateRange.start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${dateRange.end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  };

  const getUtilizationColor = (utilization: number) => {
    if (utilization >= 90) return 'text-red-600 dark:text-red-400';
    if (utilization >= 70) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-green-600 dark:text-green-400';
  };

  // Group capacities by work center for summary
  const capacitySummary = workCenters.map(wc => {
    const wcCapacities = capacities.filter(c => c.work_center_id === wc.id);
    const avgUtilization = wcCapacities.length > 0
      ? wcCapacities.reduce((sum, c) => sum + c.utilization_percent, 0) / wcCapacities.length
      : 0;
    return {
      ...wc,
      avgUtilization: Math.round(avgUtilization),
      scheduledCount: schedules.filter(s => s.work_center_id === wc.id).length,
    };
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Calendar className="w-8 h-8 text-blue-600 dark:text-blue-400" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Production Scheduling</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Schedule and manage work center assignments
            </p>
          </div>
        </div>
      </div>

      {/* Work Center Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {capacitySummary.slice(0, 6).map(wc => (
          <div
            key={wc.id}
            onClick={() => setSelectedWorkCenter(wc.id === selectedWorkCenter ? 'all' : wc.id)}
            className={`card p-4 cursor-pointer transition-colors ${
              selectedWorkCenter === wc.id
                ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/20'
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
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-gray-500">{wc.scheduledCount} jobs</span>
              <span className={`text-xs font-medium ${getUtilizationColor(wc.avgUtilization)}`}>
                {wc.avgUtilization}%
              </span>
            </div>
          </div>
        ))}
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
              className="px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg"
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
              <option value="all">All Work Centers</option>
              {workCenters.map(wc => (
                <option key={wc.id} value={wc.id}>{wc.code} - {wc.name}</option>
              ))}
            </select>
            <button
              onClick={loadSchedules}
              className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              title="Refresh"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Schedule Grid */}
      {loading ? (
        <div className="card">
          <div className="flex items-center justify-center h-96">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        </div>
      ) : (
        <SchedulingGrid
          schedules={schedules}
          workCenters={selectedWorkCenter === 'all' ? workCenters : workCenters.filter(wc => wc.id === selectedWorkCenter)}
          dateRange={dateRange}
          capacities={capacities}
          onRefresh={loadSchedules}
        />
      )}
    </div>
  );
}
