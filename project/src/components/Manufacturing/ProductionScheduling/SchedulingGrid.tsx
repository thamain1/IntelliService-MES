import { useState } from 'react';
import { Clock, PlayCircle, Pause, CheckCircle, AlertCircle, ChevronRight } from 'lucide-react';
import { WorkCenterSchedule, WorkCenterCapacity } from '../../../services/ProductionSchedulingService';
import { WorkCenter } from '../../../services/ManufacturingService';

interface SchedulingGridProps {
  schedules: WorkCenterSchedule[];
  workCenters: WorkCenter[];
  dateRange: { start: Date; end: Date };
  capacities: WorkCenterCapacity[];
  onRefresh: () => void;
}

export function SchedulingGrid({
  schedules,
  workCenters,
  dateRange,
  capacities,
  onRefresh: _onRefresh,
}: SchedulingGridProps) {
  const [expandedSchedule, setExpandedSchedule] = useState<string | null>(null);

  // Generate array of dates in range
  const dates: Date[] = [];
  const current = new Date(dateRange.start);
  while (current <= dateRange.end) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'RUNNING':
        return <PlayCircle className="w-3 h-3 text-blue-500" />;
      case 'PAUSED':
        return <Pause className="w-3 h-3 text-yellow-500" />;
      case 'COMPLETED':
        return <CheckCircle className="w-3 h-3 text-green-500" />;
      default:
        return <Clock className="w-3 h-3 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'RUNNING':
        return 'bg-blue-100 border-blue-300 dark:bg-blue-900/30 dark:border-blue-700';
      case 'PAUSED':
        return 'bg-yellow-100 border-yellow-300 dark:bg-yellow-900/30 dark:border-yellow-700';
      case 'COMPLETED':
        return 'bg-green-100 border-green-300 dark:bg-green-900/30 dark:border-green-700';
      default:
        return 'bg-gray-100 border-gray-300 dark:bg-gray-700 dark:border-gray-600';
    }
  };

  const getSchedulesForCell = (workCenterId: string, date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    return schedules.filter(s => {
      if (s.work_center_id !== workCenterId) return false;
      if (!s.scheduled_start_ts) return false;
      // Handle both ISO format (with T) and Postgres format (with space)
      const schedDate = new Date(s.scheduled_start_ts).toISOString().split('T')[0];
      return schedDate === dateStr;
    });
  };

  const getCapacityForCell = (workCenterId: string, date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    return capacities.find(c => c.work_center_id === workCenterId && c.date === dateStr);
  };

  const getCapacityColor = (utilization: number) => {
    if (utilization >= 90) return 'bg-red-50 dark:bg-red-900/10';
    if (utilization >= 70) return 'bg-yellow-50 dark:bg-yellow-900/10';
    return 'bg-white dark:bg-gray-800';
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const isWeekend = (date: Date) => {
    const day = date.getDay();
    return day === 0 || day === 6;
  };

  if (workCenters.length === 0) {
    return (
      <div className="card p-12 text-center">
        <AlertCircle className="w-12 h-12 mx-auto mb-4 text-gray-400" />
        <p className="text-gray-500 dark:text-gray-400">No work centers available</p>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800">
              <th className="sticky left-0 z-10 bg-gray-50 dark:bg-gray-800 px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase border-b border-r border-gray-200 dark:border-gray-700 w-40">
                Work Center
              </th>
              {dates.map((date, i) => (
                <th
                  key={i}
                  className={`px-2 py-3 text-center text-xs font-medium uppercase border-b border-gray-200 dark:border-gray-700 min-w-[120px] ${
                    isToday(date)
                      ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                      : isWeekend(date)
                        ? 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500'
                        : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  <div>{date.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                  <div className="text-lg font-bold">{date.getDate()}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {workCenters.map((wc) => (
              <tr key={wc.id} className="border-b border-gray-200 dark:border-gray-700">
                <td className="sticky left-0 z-10 bg-white dark:bg-gray-900 px-4 py-3 border-r border-gray-200 dark:border-gray-700">
                  <div className="flex flex-col">
                    <span className="font-medium text-gray-900 dark:text-white text-sm">
                      {wc.code}
                    </span>
                    <span className="text-xs text-gray-500 truncate max-w-[150px]">
                      {wc.name}
                    </span>
                  </div>
                </td>
                {dates.map((date, i) => {
                  const cellSchedules = getSchedulesForCell(wc.id, date);
                  const capacity = getCapacityForCell(wc.id, date);

                  return (
                    <td
                      key={i}
                      className={`px-1 py-2 align-top min-h-[80px] ${
                        isToday(date)
                          ? 'bg-blue-50 dark:bg-blue-900/10'
                          : isWeekend(date)
                            ? 'bg-gray-50 dark:bg-gray-800/50'
                            : capacity
                              ? getCapacityColor(capacity.utilization_percent)
                              : 'bg-white dark:bg-gray-900'
                      }`}
                    >
                      <div className="space-y-1">
                        {cellSchedules.map((schedule) => (
                          <div
                            key={schedule.id}
                            onClick={() => setExpandedSchedule(
                              expandedSchedule === schedule.id ? null : schedule.id
                            )}
                            className={`p-1.5 rounded border text-xs cursor-pointer transition-colors ${getStatusColor(schedule.status)}`}
                          >
                            <div className="flex items-center space-x-1">
                              {getStatusIcon(schedule.status)}
                              <span className="font-medium truncate">
                                {schedule.order_number}
                              </span>
                            </div>
                            {schedule.step_name && (
                              <p className="text-xs text-gray-500 truncate mt-0.5">
                                {schedule.step_name}
                              </p>
                            )}
                            {schedule.scheduled_start_ts && (
                              <p className="text-xs text-gray-400 mt-0.5">
                                {new Date(schedule.scheduled_start_ts).toLocaleTimeString('en-US', {
                                  hour: 'numeric',
                                  minute: '2-digit',
                                })}
                              </p>
                            )}

                            {/* Expanded Details */}
                            {expandedSchedule === schedule.id && (
                              <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-600 space-y-1">
                                <p className="text-gray-700 dark:text-gray-300">
                                  {schedule.order_title}
                                </p>
                                {schedule.customer_name && (
                                  <p className="text-gray-500">
                                    Customer: {schedule.customer_name}
                                  </p>
                                )}
                                {schedule.estimated_minutes && (
                                  <p className="text-gray-500">
                                    Est: {schedule.estimated_minutes} min
                                  </p>
                                )}
                                <div className="flex items-center justify-end mt-2">
                                  <button className="flex items-center text-blue-600 hover:text-blue-700 text-xs">
                                    <span>Details</span>
                                    <ChevronRight className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}

                        {/* Capacity indicator */}
                        {capacity && cellSchedules.length === 0 && (
                          <div className="text-center text-xs text-gray-400 py-4">
                            {capacity.utilization_percent}% util
                          </div>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center space-x-6 text-xs">
          <div className="flex items-center space-x-2">
            <Clock className="w-3 h-3 text-gray-400" />
            <span className="text-gray-500">Not Started</span>
          </div>
          <div className="flex items-center space-x-2">
            <PlayCircle className="w-3 h-3 text-blue-500" />
            <span className="text-gray-500">Running</span>
          </div>
          <div className="flex items-center space-x-2">
            <Pause className="w-3 h-3 text-yellow-500" />
            <span className="text-gray-500">Paused</span>
          </div>
          <div className="flex items-center space-x-2">
            <CheckCircle className="w-3 h-3 text-green-500" />
            <span className="text-gray-500">Completed</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded bg-yellow-100 border border-yellow-300"></div>
            <span className="text-gray-500">70-90% Util</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded bg-red-100 border border-red-300"></div>
            <span className="text-gray-500">&gt;90% Util</span>
          </div>
        </div>
      </div>
    </div>
  );
}
