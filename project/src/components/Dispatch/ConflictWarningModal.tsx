import { AlertTriangle, X, Clock, User } from 'lucide-react';
import type { ConflictingTicket } from '../../services/ScheduleConflictService';

interface ConflictWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  conflictingTickets: ConflictingTicket[];
  proposedTicketNumber: string;
  technicianName: string;
  proposedTime: Date;
}

export function ConflictWarningModal({
  isOpen,
  onClose,
  onConfirm,
  conflictingTickets,
  proposedTicketNumber,
  technicianName,
  proposedTime,
}: ConflictWarningModalProps) {
  if (!isOpen) return null;

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const formatTimeRange = (start: Date, end: Date) => {
    return `${formatTime(start)} - ${formatTime(end)}`;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg max-w-lg w-full shadow-xl">
        <div className="bg-yellow-50 dark:bg-yellow-900/30 border-b border-yellow-200 dark:border-yellow-800 px-6 py-4 flex items-center justify-between rounded-t-lg">
          <div className="flex items-center space-x-3">
            <div className="flex-shrink-0 w-10 h-10 bg-yellow-100 dark:bg-yellow-900/50 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-yellow-800 dark:text-yellow-200">
                Schedule Conflict Detected
              </h2>
              <p className="text-sm text-yellow-600 dark:text-yellow-400">
                Double-booking warning
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-yellow-100 dark:hover:bg-yellow-900/50 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-2">
              <User className="w-4 h-4 text-gray-500" />
              <span className="font-medium text-gray-900 dark:text-white">{technicianName}</span>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Assigning <span className="font-semibold text-gray-900 dark:text-white">{proposedTicketNumber}</span> at{' '}
              <span className="font-semibold text-gray-900 dark:text-white">{formatTime(proposedTime)}</span> will
              overlap with {conflictingTickets.length} existing ticket{conflictingTickets.length > 1 ? 's' : ''}.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Conflicting Tickets:
            </h3>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {conflictingTickets.map((ticket) => (
                <div
                  key={ticket.ticketId}
                  className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-red-800 dark:text-red-300">
                        {ticket.ticketNumber}
                      </span>
                      {ticket.customerName && (
                        <span className="text-red-600 dark:text-red-400 text-sm ml-2">
                          - {ticket.customerName}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center text-red-600 dark:text-red-400 text-sm">
                      <Clock className="w-3 h-3 mr-1" />
                      {formatTimeRange(ticket.start, ticket.end)}
                    </div>
                  </div>
                  <p className="text-sm text-red-700 dark:text-red-300 mt-1 line-clamp-1">
                    {ticket.title}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              <AlertTriangle className="w-4 h-4 inline mr-1" />
              Assigning this ticket will create a double-booking for {technicianName}.
              The technician may not be able to complete all jobs on time.
            </p>
          </div>
        </div>

        <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-4 flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors flex items-center"
          >
            <AlertTriangle className="w-4 h-4 mr-2" />
            Assign Anyway
          </button>
        </div>
      </div>
    </div>
  );
}
