import { useState, useEffect } from 'react';
import { X, Factory, Clock, Calendar, Save, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface WorkCenterData {
  id: string;
  name: string;
  code: string;
  description: string | null;
  hours_per_day: number;
  days_per_week: number;
  ideal_cycle_time_seconds: number | null;
  is_active: boolean;
}

interface WorkCenterModalProps {
  workCenterId: string;
  onClose: () => void;
  onSave?: () => void;
}

export function WorkCenterModal({
  workCenterId,
  onClose,
  onSave,
}: WorkCenterModalProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [workCenter, setWorkCenter] = useState<WorkCenterData | null>(null);
  const [formData, setFormData] = useState({
    hours_per_day: 8,
    days_per_week: 5,
    ideal_cycle_time_seconds: null as number | null,
  });

  useEffect(() => {
    loadWorkCenter();
  }, [workCenterId]);

  const loadWorkCenter = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('work_centers')
        .select('id, name, code, description, hours_per_day, days_per_week, ideal_cycle_time_seconds, is_active')
        .eq('id', workCenterId)
        .single();

      if (fetchError) throw fetchError;

      if (data) {
        setWorkCenter(data as WorkCenterData);
        setFormData({
          hours_per_day: data.hours_per_day ?? 8,
          days_per_week: data.days_per_week ?? 5,
          ideal_cycle_time_seconds: data.ideal_cycle_time_seconds,
        });
      }
    } catch (err) {
      console.error('Error loading work center:', err);
      setError(err instanceof Error ? err.message : 'Failed to load work center');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const { error: updateError } = await supabase
        .from('work_centers')
        .update({
          hours_per_day: formData.hours_per_day,
          days_per_week: formData.days_per_week,
          ideal_cycle_time_seconds: formData.ideal_cycle_time_seconds,
        })
        .eq('id', workCenterId);

      if (updateError) throw updateError;

      setSuccess(true);
      if (onSave) onSave();

      // Auto-close after brief success message
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      console.error('Error updating work center:', err);
      setError(err instanceof Error ? err.message : 'Failed to update work center');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Factory className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Work Center Settings
              </h2>
              {workCenter && (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {workCenter.code} - {workCenter.name}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : error && !workCenter ? (
            <div className="flex items-center gap-2 p-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-lg">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <p>{error}</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Capacity Settings Section */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Capacity Settings
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                  Configure operating hours for accurate OEE calculations
                </p>

                <div className="grid grid-cols-2 gap-4">
                  {/* Hours per Day */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Hours per Day
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="24"
                      step="0.5"
                      value={formData.hours_per_day}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          hours_per_day: parseFloat(e.target.value) || 8,
                        }))
                      }
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Standard shift hours (e.g., 8, 10, 12)
                    </p>
                  </div>

                  {/* Days per Week */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Days per Week
                    </label>
                    <select
                      value={formData.days_per_week}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          days_per_week: parseInt(e.target.value) || 5,
                        }))
                      }
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value={5}>5 days (Mon-Fri)</option>
                      <option value={6}>6 days (Mon-Sat)</option>
                      <option value={7}>7 days (All week)</option>
                    </select>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Operating days per week
                    </p>
                  </div>
                </div>
              </div>

              {/* Cycle Time Section */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Performance Settings
                </h3>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Ideal Cycle Time (seconds)
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={formData.ideal_cycle_time_seconds ?? ''}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        ideal_cycle_time_seconds: e.target.value
                          ? parseInt(e.target.value)
                          : null,
                      }))
                    }
                    placeholder="Leave empty to use product defaults"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Default cycle time for OEE performance calculation
                  </p>
                </div>
              </div>

              {/* Calculated Capacity Info */}
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Weekly Capacity Summary
                </h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Hours/Week:</span>
                    <span className="ml-2 font-medium text-gray-900 dark:text-white">
                      {(formData.hours_per_day * formData.days_per_week).toFixed(1)}h
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Hours/Month:</span>
                    <span className="ml-2 font-medium text-gray-900 dark:text-white">
                      {(formData.hours_per_day * formData.days_per_week * 4.33).toFixed(0)}h
                    </span>
                  </div>
                </div>
              </div>

              {/* Error/Success Messages */}
              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-lg text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <p>{error}</p>
                </div>
              )}

              {success && (
                <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 rounded-lg text-sm">
                  <Save className="w-4 h-4 flex-shrink-0" />
                  <p>Settings saved successfully!</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Save Settings
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
