import { useState, useEffect, useCallback } from 'react';
import { Play, Square, Timer } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { ManufacturingService } from '../../services/ManufacturingService';
import type { Database } from '../../lib/database.types';

type TimeLogRow = Database['public']['Tables']['production_time_logs']['Row'];

interface ProductionTimeClockProps {
  orderId: string;
  onClockAction?: () => void;
}

export function ProductionTimeClock({ orderId, onClockAction }: ProductionTimeClockProps) {
  const { profile: _profile } = useAuth();
  const [activeLog, setActiveLog] = useState<TimeLogRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [elapsedTime, setElapsedTime] = useState<string>('00:00:00');

  const loadActiveLog = useCallback(async () => {
    setLoading(true);
    try {
      const log = await ManufacturingService.getActiveTimeLog(orderId);
      setActiveLog(log);
    } catch (error) {
      console.error('Error loading active time log:', error);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    loadActiveLog();
  }, [loadActiveLog]);

  const handleClockIn = async () => {
    setActionLoading(true);
    try {
      const result = await ManufacturingService.clockIn(orderId);
      if (result.success) {
        await loadActiveLog();
        onClockAction?.();
      }
    } catch (error) {
      console.error('Error clocking in:', error);
    } finally {
      setActionLoading(false);
    }
  };

  const handleClockOut = async () => {
    if (!activeLog) return;

    setActionLoading(true);
    try {
      const result = await ManufacturingService.clockOut(activeLog.id);
      if (result.success) {
        setActiveLog(null);
        setElapsedTime('00:00:00');
        onClockAction?.();
      }
    } catch (error) {
      console.error('Error clocking out:', error);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="card p-4">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  const isClockedIn = activeLog && !activeLog.clock_out;

  return (
    <div className={`card p-4 ${isClockedIn ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' : ''}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className={`p-3 rounded-lg ${isClockedIn ? 'bg-green-100 dark:bg-green-900/30' : 'bg-gray-100 dark:bg-gray-700'}`}>
            <Timer className={`w-6 h-6 ${isClockedIn ? 'text-green-600' : 'text-gray-500'}`} />
          </div>
          <div>
            <h3 className="font-medium text-gray-900 dark:text-white">Time Clock</h3>
            {isClockedIn ? (
              <div className="flex items-center space-x-2 mt-1">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-sm text-green-700 dark:text-green-400">
                  Clocked in since {new Date(activeLog.clock_in).toLocaleTimeString()}
                </span>
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Not clocked in
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-4">
          {isClockedIn && (
            <div className="text-right">
              <p className="text-2xl font-mono font-bold text-green-700 dark:text-green-400">
                {elapsedTime}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Elapsed Time</p>
            </div>
          )}

          {isClockedIn ? (
            <button
              onClick={handleClockOut}
              disabled={actionLoading}
              className="flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              <Square className="w-4 h-4" />
              <span>{actionLoading ? 'Clocking out...' : 'Clock Out'}</span>
            </button>
          ) : (
            <button
              onClick={handleClockIn}
              disabled={actionLoading}
              className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              <Play className="w-4 h-4" />
              <span>{actionLoading ? 'Clocking in...' : 'Clock In'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
