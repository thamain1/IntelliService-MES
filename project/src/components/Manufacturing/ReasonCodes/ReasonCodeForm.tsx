import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { DowntimeService, DowntimeReason } from '../../../services/DowntimeService';

interface ReasonCodeFormProps {
  reason?: DowntimeReason | null;
  onClose: () => void;
  onSaved: () => void;
}

type Category = 'planned' | 'unplanned';
type ReasonGroup = 'mechanical' | 'electrical' | 'material' | 'quality' | 'ops' | 'other';

export function ReasonCodeForm({ reason, onClose, onSaved }: ReasonCodeFormProps) {
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    description: '',
    category: 'unplanned' as Category,
    reason_group: 'other' as ReasonGroup,
    is_active: true,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (reason) {
      setFormData({
        code: reason.code,
        name: reason.name,
        description: reason.description || '',
        category: reason.category as Category,
        reason_group: reason.reason_group as ReasonGroup,
        is_active: reason.is_active,
      });
    }
  }, [reason]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.code.trim() || !formData.name.trim()) {
      setError('Code and name are required');
      return;
    }

    setLoading(true);
    try {
      if (reason) {
        // Update existing
        const result = await DowntimeService.updateReason(reason.id, {
          code: formData.code,
          name: formData.name,
          description: formData.description || undefined,
          category: formData.category,
          reason_group: formData.reason_group,
          is_active: formData.is_active,
        });

        if (result.success) {
          onSaved();
        } else {
          setError('Failed to update reason code');
        }
      } else {
        // Create new
        const result = await DowntimeService.createReason({
          code: formData.code,
          name: formData.name,
          description: formData.description || undefined,
          category: formData.category,
          reason_group: formData.reason_group,
        });

        if (result.success) {
          onSaved();
        } else {
          setError('Failed to create reason code');
        }
      }
    } catch (err) {
      console.error('Error saving reason code:', err);
      setError('An error occurred while saving');
    } finally {
      setLoading(false);
    }
  };

  const categoryOptions: { value: Category; label: string; description: string }[] = [
    { value: 'planned', label: 'Planned', description: 'Scheduled maintenance, breaks, changeovers' },
    { value: 'unplanned', label: 'Unplanned', description: 'Unexpected breakdowns, defects, shortages' },
  ];

  const groupOptions: { value: ReasonGroup; label: string; description: string }[] = [
    { value: 'mechanical', label: 'Mechanical', description: 'Equipment breakdowns, wear and tear' },
    { value: 'electrical', label: 'Electrical', description: 'Electrical failures, sensor issues' },
    { value: 'material', label: 'Material', description: 'Material shortages, quality issues' },
    { value: 'quality', label: 'Quality', description: 'Quality holds, inspection failures' },
    { value: 'ops', label: 'Operations', description: 'Changeovers, setups, adjustments' },
    { value: 'other', label: 'Other', description: 'Other reasons not categorized above' },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-lg w-full">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {reason ? 'Edit Reason Code' : 'Create Reason Code'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-4">
            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm">
                {error}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Code *
                </label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  placeholder="e.g., MECH-01"
                  maxLength={20}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  placeholder="e.g., Motor Failure"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData(f => ({ ...f, description: e.target.value }))}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                placeholder="Detailed description of this reason code..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Category *
              </label>
              <div className="grid grid-cols-2 gap-3">
                {categoryOptions.map((opt) => (
                  <div
                    key={opt.value}
                    onClick={() => setFormData(f => ({ ...f, category: opt.value }))}
                    className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                      formData.category === opt.value
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                  >
                    <p className="font-medium text-gray-900 dark:text-white">{opt.label}</p>
                    <p className="text-xs text-gray-500 mt-1">{opt.description}</p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Group *
              </label>
              <div className="grid grid-cols-3 gap-2">
                {groupOptions.map((opt) => (
                  <div
                    key={opt.value}
                    onClick={() => setFormData(f => ({ ...f, reason_group: opt.value }))}
                    className={`p-2 border rounded-lg cursor-pointer transition-colors text-center ${
                      formData.reason_group === opt.value
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                    title={opt.description}
                  >
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{opt.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {reason && (
              <div className="flex items-center space-x-3 pt-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={formData.is_active}
                  onChange={(e) => setFormData(f => ({ ...f, is_active: e.target.checked }))}
                  className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                />
                <label htmlFor="is_active" className="text-sm text-gray-700 dark:text-gray-300">
                  Active (uncheck to disable this reason code)
                </label>
              </div>
            )}
          </div>

          <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Saving...' : reason ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
