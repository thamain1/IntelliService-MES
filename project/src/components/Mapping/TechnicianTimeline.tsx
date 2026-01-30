import { useMemo, useRef } from 'react';
import { ChevronLeft, ChevronRight, Navigation } from 'lucide-react';
import type { TechnicianMapData } from '../../types/map.types';

interface TechnicianTimelineProps {
  technicians: TechnicianMapData[];
  selectedDate: Date;
  onDateChange: (date: Date) => void;
  onTechnicianClick: (techId: string) => void;
  selectedTechnicianId: string | null;
}

export function TechnicianTimeline({
  technicians,
  selectedDate,
  onDateChange,
  onTechnicianClick,
  selectedTechnicianId,
}: TechnicianTimelineProps) {
  const timelineRef = useRef<HTMLDivElement>(null);

  // Generate hours for the timeline (6 AM to 8 PM)
  const hours = useMemo(() => {
    const result = [];
    for (let i = 6; i <= 20; i++) {
      result.push(i);
    }
    return result;
  }, []);

  const formatHour = (hour: number) => {
    if (hour === 12) return '12:00pm';
    if (hour > 12) return `${hour - 12}:00pm`;
    return `${hour}:00am`;
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const goToToday = () => {
    onDateChange(new Date());
  };

  const goToPrevDay = () => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() - 1);
    onDateChange(newDate);
  };

  const goToNextDay = () => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + 1);
    onDateChange(newDate);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'in_progress':
        return 'bg-yellow-500';
      case 'scheduled':
        return 'bg-blue-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusBgColor = (status: string) => {
    switch (status) {
      case 'in_progress':
        return 'bg-yellow-100 border-yellow-300 dark:bg-yellow-900/30 dark:border-yellow-700';
      case 'scheduled':
        return 'bg-blue-100 border-blue-300 dark:bg-blue-900/30 dark:border-blue-700';
      default:
        return 'bg-gray-100 border-gray-300 dark:bg-gray-700 dark:border-gray-600';
    }
  };

  // Calculate position and width of a job block on the timeline
  const getJobPosition = (scheduledDate: string | null, duration: number | null) => {
    if (!scheduledDate) return null;

    const jobDate = new Date(scheduledDate);
    const jobHour = jobDate.getHours() + jobDate.getMinutes() / 60;

    // Check if job is on selected date
    const selectedDateStart = new Date(selectedDate);
    selectedDateStart.setHours(0, 0, 0, 0);
    const selectedDateEnd = new Date(selectedDate);
    selectedDateEnd.setHours(23, 59, 59, 999);

    if (jobDate < selectedDateStart || jobDate > selectedDateEnd) {
      return null;
    }

    // Timeline starts at 6 AM (hour 6) and ends at 8 PM (hour 20)
    const startHour = 6;
    const endHour = 20;
    const totalHours = endHour - startHour;

    if (jobHour < startHour || jobHour > endHour) {
      return null;
    }

    const left = ((jobHour - startHour) / totalHours) * 100;
    const widthHours = duration || 1; // Default 1 hour if no duration
    const width = Math.min((widthHours / totalHours) * 100, 100 - left);

    return { left: `${left}%`, width: `${width}%` };
  };

  // Calculate stats
  const stats = useMemo(() => {
    let totalJobs = 0;
    let totalHours = 0;

    technicians.forEach((tech) => {
      tech.activeTickets.forEach((ticket) => {
        if (ticket.scheduled_date) {
          const jobDate = new Date(ticket.scheduled_date);
          const selectedDateStart = new Date(selectedDate);
          selectedDateStart.setHours(0, 0, 0, 0);
          const selectedDateEnd = new Date(selectedDate);
          selectedDateEnd.setHours(23, 59, 59, 999);

          if (jobDate >= selectedDateStart && jobDate <= selectedDateEnd) {
            totalJobs++;
            totalHours += ticket.estimated_duration || 1;
          }
        }
      });
    });

    const utilization = technicians.length > 0
      ? Math.round((totalHours / (technicians.length * 8)) * 100)
      : 0;

    return { totalJobs, totalHours, utilization };
  }, [technicians, selectedDate]);

  const onlineTechs = technicians.filter(t => t.status === 'online').length;

  return (
    <div className="space-y-4">
      {/* Date Navigation & Stats */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-2">
          <button
            onClick={goToToday}
            className="btn btn-outline btn-sm"
          >
            Today
          </button>
          <button
            onClick={goToPrevDay}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={goToNextDay}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          <span className="font-medium text-gray-900 dark:text-white">
            {formatDate(selectedDate)}
          </span>
        </div>

        <div className="flex items-center space-x-6 text-sm">
          <div>
            <span className="text-gray-500 dark:text-gray-400">Techs: </span>
            <span className="font-semibold text-gray-900 dark:text-white">{technicians.length}</span>
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400">Online: </span>
            <span className="font-semibold text-green-600">{onlineTechs}</span>
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400">Jobs: </span>
            <span className="font-semibold text-gray-900 dark:text-white">{stats.totalJobs}</span>
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400">Hours: </span>
            <span className="font-semibold text-gray-900 dark:text-white">{stats.totalHours}h</span>
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400">Utilization: </span>
            <span className="font-semibold text-purple-600">{stats.utilization}%</span>
          </div>
        </div>
      </div>

      {/* Timeline Grid */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        {/* Timeline Header */}
        <div className="flex border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <div className="w-48 flex-shrink-0 p-2 border-r border-gray-200 dark:border-gray-700">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
              Technician
            </span>
          </div>
          <div className="flex-1 flex" ref={timelineRef}>
            {hours.map((hour) => (
              <div
                key={hour}
                className="flex-1 min-w-[60px] p-2 border-r border-gray-200 dark:border-gray-700 last:border-r-0 text-center"
              >
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  {formatHour(hour)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Technician Rows */}
        <div className="max-h-[350px] overflow-y-auto">
          {technicians.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              No technicians available
            </div>
          ) : (
            technicians.map((tech) => (
              <div
                key={tech.id}
                className={`flex border-b border-gray-200 dark:border-gray-700 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer ${
                  selectedTechnicianId === tech.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                }`}
                onClick={() => onTechnicianClick(tech.id)}
              >
                {/* Technician Info */}
                <div className="w-48 flex-shrink-0 p-2 border-r border-gray-200 dark:border-gray-700">
                  <div className="flex items-center space-x-2">
                    <div className="relative">
                      <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-red-600 rounded-full flex items-center justify-center">
                        <span className="text-white font-bold text-xs">
                          {tech.full_name.charAt(0)}
                        </span>
                      </div>
                      <div
                        className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white dark:border-gray-800 ${
                          tech.status === 'online'
                            ? 'bg-green-500'
                            : tech.status === 'recent'
                            ? 'bg-yellow-500'
                            : 'bg-red-500'
                        }`}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {tech.full_name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {tech.activeTickets.length} job{tech.activeTickets.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                    {tech.location && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(
                            `https://www.google.com/maps/dir/?api=1&destination=${tech.location!.latitude},${tech.location!.longitude}`,
                            '_blank'
                          );
                        }}
                        className="p-1 text-gray-400 hover:text-blue-600"
                        title="Get directions"
                      >
                        <Navigation className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Timeline */}
                <div className="flex-1 relative h-16">
                  {/* Hour grid lines */}
                  <div className="absolute inset-0 flex">
                    {hours.map((hour) => (
                      <div
                        key={hour}
                        className="flex-1 min-w-[60px] border-r border-gray-100 dark:border-gray-700/50 last:border-r-0"
                      />
                    ))}
                  </div>

                  {/* Job blocks */}
                  {tech.activeTickets.map((ticket) => {
                    const position = getJobPosition(ticket.scheduled_date, ticket.estimated_duration);
                    if (!position) return null;

                    return (
                      <div
                        key={ticket.id}
                        className={`absolute top-2 bottom-2 rounded border ${getStatusBgColor(ticket.status)} overflow-hidden`}
                        style={{ left: position.left, width: position.width, minWidth: '60px' }}
                        title={`${ticket.ticket_number}: ${ticket.title}\n${ticket.customer_name}`}
                      >
                        <div className="p-1 h-full flex flex-col justify-center">
                          <p className="text-xs font-medium text-gray-900 dark:text-white truncate">
                            {ticket.title}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                            {ticket.ticket_number}
                          </p>
                        </div>
                        <div
                          className={`absolute left-0 top-0 bottom-0 w-1 ${getStatusColor(ticket.status)}`}
                        />
                      </div>
                    );
                  })}

                  {/* Current time indicator */}
                  {selectedDate.toDateString() === new Date().toDateString() && (
                    <CurrentTimeIndicator />
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded bg-blue-500" />
            <span className="text-gray-600 dark:text-gray-400">Scheduled</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded bg-yellow-500" />
            <span className="text-gray-600 dark:text-gray-400">In Progress</span>
          </div>
        </div>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span className="text-gray-600 dark:text-gray-400">Online</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded-full bg-yellow-500" />
            <span className="text-gray-600 dark:text-gray-400">Recent</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <span className="text-gray-600 dark:text-gray-400">Offline</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Current time indicator component
function CurrentTimeIndicator() {
  const now = new Date();
  const currentHour = now.getHours() + now.getMinutes() / 60;
  const startHour = 6;
  const endHour = 20;
  const totalHours = endHour - startHour;

  if (currentHour < startHour || currentHour > endHour) {
    return null;
  }

  const left = ((currentHour - startHour) / totalHours) * 100;

  return (
    <div
      className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10"
      style={{ left: `${left}%` }}
    >
      <div className="absolute -top-1 -left-1 w-2 h-2 rounded-full bg-red-500" />
    </div>
  );
}
