import { useMemo } from 'react';
import { format, differenceInDays, addDays, startOfDay } from 'date-fns';

type Phase = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: string;
  percent_complete: number;
};

type Task = {
  id: string;
  phase_id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: string;
  completion_percent: number;
  profiles?: { full_name: string };
};

type GanttChartProps = {
  phases: Phase[];
  tasks: Task[];
  projectStartDate: string;
  projectEndDate: string | null;
};

export function GanttChart({ phases, tasks, projectStartDate, projectEndDate }: GanttChartProps) {
  const { timelineStart, timelineEnd, totalDays, items } = useMemo(() => {
    // Determine timeline bounds
    const allDates: Date[] = [];

    if (projectStartDate) {
      allDates.push(new Date(projectStartDate));
    }
    if (projectEndDate) {
      allDates.push(new Date(projectEndDate));
    }

    phases.forEach(phase => {
      if (phase.start_date) allDates.push(new Date(phase.start_date));
      if (phase.end_date) allDates.push(new Date(phase.end_date));
    });

    tasks.forEach(task => {
      if (task.start_date) allDates.push(new Date(task.start_date));
      if (task.end_date) allDates.push(new Date(task.end_date));
    });

    if (allDates.length === 0) {
      const today = new Date();
      allDates.push(today);
      allDates.push(addDays(today, 30));
    }

    const minDate = new Date(Math.min(...allDates.map(d => d.getTime())));
    const maxDate = new Date(Math.max(...allDates.map(d => d.getTime())));

    // Add padding
    const timelineStart = startOfDay(addDays(minDate, -7));
    const timelineEnd = startOfDay(addDays(maxDate, 14));
    const totalDays = differenceInDays(timelineEnd, timelineStart) + 1;

    // Build items list (phases with their tasks nested)
    const items: Array<{
      type: 'phase' | 'task';
      id: string;
      name: string;
      startDate: Date;
      endDate: Date;
      status: string;
      percentComplete: number;
      assignee?: string;
      phaseId?: string;
    }> = [];

    phases.forEach(phase => {
      items.push({
        type: 'phase',
        id: phase.id,
        name: phase.name,
        startDate: new Date(phase.start_date),
        endDate: phase.end_date ? new Date(phase.end_date) : addDays(new Date(phase.start_date), 7),
        status: phase.status,
        percentComplete: phase.percent_complete || 0,
      });

      // Add tasks for this phase
      const phaseTasks = tasks.filter(t => t.phase_id === phase.id);
      phaseTasks.forEach(task => {
        items.push({
          type: 'task',
          id: task.id,
          name: task.name,
          startDate: new Date(task.start_date),
          endDate: task.end_date ? new Date(task.end_date) : addDays(new Date(task.start_date), 1),
          status: task.status,
          percentComplete: task.completion_percent || 0,
          assignee: task.profiles?.full_name,
          phaseId: phase.id,
        });
      });
    });

    // Add tasks without phases
    const orphanTasks = tasks.filter(t => !t.phase_id);
    orphanTasks.forEach(task => {
      items.push({
        type: 'task',
        id: task.id,
        name: task.name,
        startDate: new Date(task.start_date),
        endDate: task.end_date ? new Date(task.end_date) : addDays(new Date(task.start_date), 1),
        status: task.status,
        percentComplete: task.completion_percent || 0,
        assignee: task.profiles?.full_name,
      });
    });

    return { timelineStart, timelineEnd, totalDays, items };
  }, [phases, tasks, projectStartDate, projectEndDate]);

  // Generate month headers
  const months = useMemo(() => {
    const result: Array<{ label: string; startDay: number; days: number }> = [];
    let currentDate = new Date(timelineStart);

    while (currentDate <= timelineEnd) {
      const monthStart = currentDate;
      const monthLabel = format(monthStart, 'MMM yyyy');
      const startDay = differenceInDays(monthStart, timelineStart);

      // Find end of month or timeline end
      const nextMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);
      const monthEnd = nextMonth > timelineEnd ? timelineEnd : addDays(nextMonth, -1);
      const days = differenceInDays(monthEnd, monthStart) + 1;

      result.push({ label: monthLabel, startDay, days });
      currentDate = nextMonth;
    }

    return result;
  }, [timelineStart, timelineEnd]);

  // Calculate bar position and width
  const getBarStyle = (startDate: Date, endDate: Date) => {
    const startDay = Math.max(0, differenceInDays(startDate, timelineStart));
    const duration = differenceInDays(endDate, startDate) + 1;
    const leftPercent = (startDay / totalDays) * 100;
    const widthPercent = (duration / totalDays) * 100;

    return {
      left: `${leftPercent}%`,
      width: `${Math.max(widthPercent, 1)}%`,
    };
  };

  const getStatusColor = (status: string, type: 'phase' | 'task') => {
    if (type === 'phase') {
      switch (status) {
        case 'completed': return 'bg-green-600';
        case 'in_progress': return 'bg-blue-600';
        case 'blocked': return 'bg-red-600';
        default: return 'bg-gray-400';
      }
    } else {
      switch (status) {
        case 'completed': return 'bg-green-500';
        case 'in_progress': return 'bg-blue-500';
        case 'blocked': return 'bg-red-500';
        default: return 'bg-gray-300';
      }
    }
  };

  const today = startOfDay(new Date());
  const todayPosition = differenceInDays(today, timelineStart);
  const todayPercent = (todayPosition / totalDays) * 100;
  const showTodayLine = todayPosition >= 0 && todayPosition <= totalDays;

  if (items.length === 0) {
    return (
      <div className="card p-12 text-center">
        <p className="text-gray-600 dark:text-gray-400">
          No phases or tasks to display. Add phases and tasks to see the Gantt chart.
        </p>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <div className="min-w-[1000px]">
          {/* Header with months */}
          <div className="flex border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
            <div className="w-64 flex-shrink-0 p-3 font-medium text-gray-700 dark:text-gray-300 border-r border-gray-200 dark:border-gray-700">
              Task / Phase
            </div>
            <div className="flex-1 relative">
              <div className="flex">
                {months.map((month, idx) => (
                  <div
                    key={idx}
                    className="text-center text-sm font-medium text-gray-600 dark:text-gray-400 py-3 border-r border-gray-200 dark:border-gray-700"
                    style={{ width: `${(month.days / totalDays) * 100}%` }}
                  >
                    {month.label}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Gantt rows */}
          <div className="relative">
            {/* Today line */}
            {showTodayLine && (
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10"
                style={{ left: `calc(256px + ${todayPercent}% * (100% - 256px) / 100)` }}
              >
                <div className="absolute -top-1 left-1/2 transform -translate-x-1/2 bg-red-500 text-white text-xs px-1 rounded">
                  Today
                </div>
              </div>
            )}

            {items.map((item, _idx) => (
              <div
                key={item.id}
                className={`flex border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 ${
                  item.type === 'phase' ? 'bg-gray-50/50 dark:bg-gray-800/30' : ''
                }`}
              >
                {/* Task name column */}
                <div className={`w-64 flex-shrink-0 p-3 border-r border-gray-200 dark:border-gray-700 ${
                  item.type === 'task' && item.phaseId ? 'pl-8' : ''
                }`}>
                  <div className="flex items-center space-x-2">
                    {item.type === 'phase' ? (
                      <span className="w-2 h-2 bg-blue-600 rounded-sm flex-shrink-0" />
                    ) : (
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full flex-shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className={`truncate ${
                        item.type === 'phase'
                          ? 'font-semibold text-gray-900 dark:text-white'
                          : 'text-sm text-gray-700 dark:text-gray-300'
                      }`}>
                        {item.name}
                      </p>
                      {item.assignee && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {item.assignee}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Gantt bar column */}
                <div className="flex-1 relative py-2 px-1">
                  <div className="relative h-8">
                    {/* Background bar */}
                    <div
                      className={`absolute h-full rounded ${
                        item.type === 'phase' ? 'rounded-md' : 'rounded'
                      } ${getStatusColor(item.status, item.type)} opacity-30`}
                      style={getBarStyle(item.startDate, item.endDate)}
                    />
                    {/* Progress bar */}
                    <div
                      className={`absolute h-full rounded ${
                        item.type === 'phase' ? 'rounded-md' : 'rounded'
                      } ${getStatusColor(item.status, item.type)}`}
                      style={{
                        ...getBarStyle(item.startDate, item.endDate),
                        width: `calc(${getBarStyle(item.startDate, item.endDate).width} * ${item.percentComplete / 100})`,
                      }}
                    />
                    {/* Label on bar */}
                    <div
                      className="absolute h-full flex items-center px-2 text-xs font-medium text-white truncate"
                      style={getBarStyle(item.startDate, item.endDate)}
                    >
                      <span className="drop-shadow-sm">
                        {item.percentComplete > 0 && `${item.percentComplete}%`}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <span className="font-medium text-gray-700 dark:text-gray-300">Legend:</span>
              <div className="flex items-center space-x-2">
                <span className="w-3 h-3 bg-gray-400 rounded" />
                <span className="text-gray-600 dark:text-gray-400">Pending</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="w-3 h-3 bg-blue-500 rounded" />
                <span className="text-gray-600 dark:text-gray-400">In Progress</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="w-3 h-3 bg-green-500 rounded" />
                <span className="text-gray-600 dark:text-gray-400">Completed</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="w-3 h-3 bg-red-500 rounded" />
                <span className="text-gray-600 dark:text-gray-400">Blocked</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="w-0.5 h-4 bg-red-500" />
                <span className="text-gray-600 dark:text-gray-400">Today</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
