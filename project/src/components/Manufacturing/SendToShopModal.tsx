import { useState, useEffect } from 'react';
import { X, Factory, Calendar, User, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { ManufacturingService } from '../../services/ManufacturingService';

interface Profile {
  id: string;
  full_name: string;
}

interface SendToShopModalProps {
  ticketId: string;
  ticketNumber?: string;
  ticketTitle?: string;
  onClose: () => void;
  onSuccess: (orderId: string) => void;
}

export function SendToShopModal({
  ticketId,
  ticketNumber,
  ticketTitle,
  onClose,
  onSuccess,
}: SendToShopModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [technicians, setTechnicians] = useState<Profile[]>([]);
  const [formData, setFormData] = useState({
    priority: 3,
    scheduled_start: '',
    assigned_to: '',
  });

  useEffect(() => {
    loadTechnicians();
  }, []);

  const loadTechnicians = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('role', ['admin', 'dispatcher', 'technician'])
        .order('full_name');

      if (error) throw error;
      setTechnicians(data || []);
    } catch (error) {
      console.error('Error loading technicians:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const result = await ManufacturingService.createFromTicket(ticketId, {
        priority: formData.priority,
        scheduled_start: formData.scheduled_start
          ? new Date(formData.scheduled_start).toISOString()
          : undefined,
        assigned_to: formData.assigned_to || undefined,
      });

      if (result.success && result.order) {
        onSuccess(result.order.id);
      } else {
        setError(result.error || 'Failed to create production order');
      }
    } catch (err: unknown) {
      console.error('Error creating production order:', err);
      setError(err instanceof Error ? err.message : 'Failed to create production order');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-3">
            <Factory className="w-6 h-6 text-blue-600" />
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Send to Shop</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Ticket Info */}
          <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <p className="text-sm text-gray-600 dark:text-gray-400">Creating production order from:</p>
            <p className="font-medium text-gray-900 dark:text-white mt-1">
              {ticketNumber && <span className="text-blue-600 dark:text-blue-400">{ticketNumber}</span>}
              {ticketNumber && ticketTitle && ' - '}
              {ticketTitle}
            </p>
          </div>

          {error && (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="flex items-center space-x-2 text-red-800 dark:text-red-200">
                <AlertCircle className="w-5 h-5" />
                <span>{error}</span>
              </div>
            </div>
          )}

          {/* Priority */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              <AlertCircle className="w-4 h-4 inline mr-1" />
              Priority
            </label>
            <select
              value={formData.priority}
              onChange={(e) => setFormData({ ...formData, priority: Number(e.target.value) })}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
            >
              <option value={1}>Critical</option>
              <option value={2}>High</option>
              <option value={3}>Normal</option>
              <option value={4}>Low</option>
              <option value={5}>Lowest</option>
            </select>
          </div>

          {/* Scheduled Start */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              <Calendar className="w-4 h-4 inline mr-1" />
              Scheduled Start
            </label>
            <input
              type="date"
              value={formData.scheduled_start}
              onChange={(e) => setFormData({ ...formData, scheduled_start: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Assigned To */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              <User className="w-4 h-4 inline mr-1" />
              Assign To
            </label>
            <select
              value={formData.assigned_to}
              onChange={(e) => setFormData({ ...formData, assigned_to: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Unassigned</option>
              {technicians.map((tech) => (
                <option key={tech.id} value={tech.id}>
                  {tech.full_name}
                </option>
              ))}
            </select>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end space-x-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <Factory className="w-4 h-4" />
              <span>{loading ? 'Creating...' : 'Create Production Order'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
