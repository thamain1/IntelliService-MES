import { useEffect, useState, useCallback } from 'react';
import { User, ChevronLeft, ChevronRight, ArrowLeft, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Database } from '../../lib/database.types';
import { TicketDetailModal } from './TicketDetailModal';
import { getConflictsForDateRange } from '../../services/ScheduleConflictService';

type Ticket = Database['public']['Tables']['tickets']['Row'] & {
  customers?: { name: string };
  profiles?: { full_name: string };
};

type Profile = Database['public']['Tables']['profiles']['Row'];

interface DispatchWeekViewProps {
  selectedDate: Date;
  onDateChange: (date: Date) => void;
  onBackToCalendar: () => void;
  onNavigateToDayView: (date: Date) => void;
}

export function DispatchWeekView({
  selectedDate,
  onDateChange,
  onBackToCalendar,
  onNavigateToDayView,
}: DispatchWeekViewProps) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [technicians, setTechnicians] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [conflictsByDate, setConflictsByDate] = useState<Map<string, number>>(new Map());

  // Get the start and end of the week (Sunday to Saturday)
  const getWeekDates = useCallback(() => {
    const startOfWeek = new Date(selectedDate);
    const dayOfWeek = startOfWeek.getDay();
    startOfWeek.setDate(startOfWeek.getDate() - dayOfWeek);
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(endOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    const weekDates: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(date.getDate() + i);
      weekDates.push(date);
    }

    return { startOfWeek, endOfWeek, weekDates };
  }, [selectedDate]);

  const loadData = useCallback(async () => {
    try {
      const { startOfWeek, endOfWeek } = getWeekDates();

      const [ticketsResult, techsResult] = await Promise.all([
        supabase
          .from('tickets')
          .select('*, customers!tickets_customer_id_fkey(name), profiles!tickets_assigned_to_fkey(full_name)')
          .gte('scheduled_date', startOfWeek.toISOString())
          .lte('scheduled_date', endOfWeek.toISOString())
          .in('status', ['open', 'scheduled', 'in_progress'])
          .order('scheduled_date', { ascending: true }),
        supabase
          .from('profiles')
          .select('*')
          .eq('role', 'technician')
          .order('full_name', { ascending: true }),
      ]);

      if (ticketsResult.error) throw ticketsResult.error;
      if (techsResult.error) throw techsResult.error;

      setTickets((ticketsResult.data as Ticket[]) || []);
      setTechnicians(techsResult.data || []);
    } catch (error) {
      console.error('Error loading week view data:', error);
    } finally {
      setLoading(false);
    }
  }, [getWeekDates]);

  const loadConflicts = useCallback(async () => {
    const { startOfWeek, endOfWeek } = getWeekDates();
    const conflicts = await getConflictsForDateRange(startOfWeek, endOfWeek);
    setConflictsByDate(conflicts);
  }, [getWeekDates]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!loading) {
      loadConflicts();
    }
  }, [loading, loadConflicts]);

  const previousWeek = () => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() - 7);
    onDateChange(newDate);
  };

  const nextWeek = () => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + 7);
    onDateChange(newDate);
  };

  const getTicketsForTechnicianOnDate = (technicianId: string, date: Date) => {
    return tickets.filter((ticket) => {
      if (!ticket.scheduled_date || ticket.assigned_to !== technicianId) return false;
      const ticketDate = new Date(ticket.scheduled_date);
      return (
        ticketDate.getDate() === date.getDate() &&
        ticketDate.getMonth() === date.getMonth() &&
        ticketDate.getFullYear() === date.getFullYear()
      );
    });
  };

  const { weekDates, startOfWeek, endOfWeek } = getWeekDates();

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      open: 'bg-red-500',
      scheduled: 'bg-blue-500',
      in_progress: 'bg-yellow-500',
      completed: 'bg-green-500',
      cancelled: 'bg-gray-500',
    };
    return colors[status] || 'bg-gray-500';
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  };

  const formatWeekRange = () => {
    const start = startOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const end = endOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `${start} - ${end}`;
  };

  const getDateKey = (date: Date) => date.toISOString().split('T')[0];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button
          onClick={onBackToCalendar}
          className="btn btn-outline flex items-center space-x-2"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Calendar</span>
        </button>

        <div className="flex items-center space-x-4">
          <button
            onClick={previousWeek}
            className="btn btn-outline p-2"
            aria-label="Previous week"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            {formatWeekRange()}
          </h2>

          <button onClick={nextWeek} className="btn btn-outline p-2" aria-label="Next week">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        <div className="w-[150px]"></div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-900/50">
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-300 w-48 border-b border-gray-200 dark:border-gray-700">
                  Technician
                </th>
                {weekDates.map((date) => {
                  const dateKey = getDateKey(date);
                  const conflictCount = conflictsByDate.get(dateKey) || 0;
                  return (
                    <th
                      key={date.toISOString()}
                      className={`px-2 py-3 text-center text-sm font-semibold border-b border-l border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${
                        isToday(date) ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                      }`}
                      onClick={() => onNavigateToDayView(date)}
                    >
                      <div className="text-gray-700 dark:text-gray-300">
                        {date.toLocaleDateString('en-US', { weekday: 'short' })}
                      </div>
                      <div className={`text-lg ${isToday(date) ? 'text-blue-600 dark:text-blue-400 font-bold' : 'text-gray-900 dark:text-white'}`}>
                        {date.getDate()}
                      </div>
                      {conflictCount > 0 && (
                        <div className="flex items-center justify-center mt-1">
                          <span className="inline-flex items-center px-2 py-0.5 text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-full">
                            <AlertTriangle className="w-3 h-3 mr-1" />
                            {conflictCount}
                          </span>
                        </div>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {technicians.map((tech) => (
                <tr key={tech.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-center space-x-2">
                      <User className="w-4 h-4 text-gray-500" />
                      <span className="font-medium text-gray-900 dark:text-white text-sm">
                        {tech.full_name}
                      </span>
                    </div>
                  </td>
                  {weekDates.map((date) => {
                    const dayTickets = getTicketsForTechnicianOnDate(tech.id, date);
                    return (
                      <td
                        key={date.toISOString()}
                        className={`px-2 py-2 border-b border-l border-gray-200 dark:border-gray-700 align-top cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${
                          isToday(date) ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                        }`}
                        onClick={() => onNavigateToDayView(date)}
                      >
                        <div className="space-y-1 min-h-[60px]">
                          {dayTickets.slice(0, 3).map((ticket) => (
                            <button
                              key={ticket.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedTicketId(ticket.id);
                              }}
                              className="w-full text-left p-2 rounded bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-500 transition-colors text-xs"
                            >
                              <div className="flex items-center space-x-1">
                                <div className={`w-2 h-2 rounded-full ${getStatusColor(ticket.status ?? '')}`}></div>
                                <span className="font-semibold text-gray-900 dark:text-white truncate">
                                  {ticket.ticket_number}
                                </span>
                              </div>
                              <p className="text-gray-600 dark:text-gray-400 truncate mt-0.5">
                                {ticket.customers?.name}
                              </p>
                            </button>
                          ))}
                          {dayTickets.length > 3 && (
                            <div className="text-xs text-blue-600 dark:text-blue-400 font-medium text-center">
                              +{dayTickets.length - 3} more
                            </div>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
              {technicians.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                    No technicians found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <TicketDetailModal
        isOpen={selectedTicketId !== null}
        onClose={() => setSelectedTicketId(null)}
        ticketId={selectedTicketId || ''}
        onUpdate={loadData}
      />
    </div>
  );
}
