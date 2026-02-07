import { useState, useEffect } from 'react';
import {
  AlertTriangle,
  Plus,
  Pencil,
  Search,
  Filter,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';
import { QualityExecutionService, DefectCode } from '../../../services/QualityExecutionService';

interface DefectCodeFormData {
  code: string;
  name: string;
  category: string;
  severity: 'CRITICAL' | 'MAJOR' | 'MINOR' | 'COSMETIC';
  description: string;
  is_active: boolean;
}

const SEVERITY_OPTIONS: { value: DefectCodeFormData['severity']; label: string; color: string }[] = [
  { value: 'CRITICAL', label: 'Critical', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' },
  { value: 'MAJOR', label: 'Major', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300' },
  { value: 'MINOR', label: 'Minor', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' },
  { value: 'COSMETIC', label: 'Cosmetic', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' },
];

const CATEGORY_PRESETS = [
  'Dimensional',
  'Surface',
  'Functional',
  'Visual',
  'Mechanical',
  'Electrical',
  'Assembly',
  'Material',
  'Packaging',
  'Documentation',
];

export function DefectCodesView() {
  const [defectCodes, setDefectCodes] = useState<DefectCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showInactive, setShowInactive] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingCode, setEditingCode] = useState<DefectCode | null>(null);
  const [formData, setFormData] = useState<DefectCodeFormData>({
    code: '',
    name: '',
    category: '',
    severity: 'MINOR',
    description: '',
    is_active: true,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadDefectCodes();
  }, [showInactive]);

  const loadDefectCodes = async () => {
    try {
      setLoading(true);
      const data = await QualityExecutionService.getDefectCodes(!showInactive);
      setDefectCodes(data);
    } catch (error) {
      console.error('Error loading defect codes:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setEditingCode(null);
    setFormData({
      code: '',
      name: '',
      category: '',
      severity: 'MINOR',
      description: '',
      is_active: true,
    });
    setShowModal(true);
  };

  const handleEdit = (code: DefectCode) => {
    setEditingCode(code);
    setFormData({
      code: code.code,
      name: code.name,
      category: code.category || '',
      severity: code.severity as DefectCodeFormData['severity'],
      description: code.description || '',
      is_active: code.is_active,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.code.trim() || !formData.name.trim()) {
      alert('Code and Name are required');
      return;
    }

    setSaving(true);
    try {
      if (editingCode) {
        await QualityExecutionService.updateDefectCode(editingCode.id, formData);
      } else {
        await QualityExecutionService.createDefectCode(formData);
      }
      setShowModal(false);
      loadDefectCodes();
    } catch (error) {
      console.error('Error saving defect code:', error);
      alert('Error saving defect code');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (code: DefectCode) => {
    try {
      await QualityExecutionService.updateDefectCode(code.id, { is_active: !code.is_active });
      loadDefectCodes();
    } catch (error) {
      console.error('Error toggling defect code:', error);
    }
  };

  // Get unique categories
  const categories = [...new Set(defectCodes.map(c => c.category).filter(Boolean))];

  // Filter codes
  const filteredCodes = defectCodes.filter(code => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (!code.code.toLowerCase().includes(query) && !code.name.toLowerCase().includes(query)) {
        return false;
      }
    }
    if (categoryFilter !== 'all' && code.category !== categoryFilter) {
      return false;
    }
    return true;
  });

  // Group by category
  const groupedCodes = filteredCodes.reduce((acc, code) => {
    const cat = code.category || 'Uncategorized';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(code);
    return acc;
  }, {} as Record<string, DefectCode[]>);

  const getSeverityBadge = (severity: string) => {
    const option = SEVERITY_OPTIONS.find(o => o.value === severity);
    return option?.color || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <AlertTriangle className="w-8 h-8 text-orange-600 dark:text-orange-400" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Defect Codes</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Manage defect code taxonomy for quality nonconformances
            </p>
          </div>
        </div>
        <button
          onClick={handleAdd}
          className="flex items-center space-x-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700"
        >
          <Plus className="w-4 h-4" />
          <span>Add Defect Code</span>
        </button>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-col md:flex-row md:items-center space-y-4 md:space-y-0 md:space-x-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search codes..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            <option value="all">All Categories</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="rounded border-gray-300"
            />
            <span className="text-sm text-gray-600 dark:text-gray-400">Show inactive</span>
          </label>
        </div>
      </div>

      {/* Defect Codes by Category */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600"></div>
        </div>
      ) : filteredCodes.length === 0 ? (
        <div className="card p-12 text-center text-gray-500">
          <AlertTriangle className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No defect codes found</p>
          <button
            onClick={handleAdd}
            className="mt-4 text-orange-600 hover:text-orange-700"
          >
            Add your first defect code
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedCodes).sort(([a], [b]) => a.localeCompare(b)).map(([category, codes]) => (
            <div key={category} className="card overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  {category} ({codes.length})
                </h3>
              </div>
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {codes.map((code) => (
                  <div
                    key={code.id}
                    className={`p-4 flex items-center justify-between ${
                      !code.is_active ? 'opacity-50' : ''
                    }`}
                  >
                    <div className="flex items-center space-x-4">
                      <div className="w-20">
                        <span className="font-mono text-sm font-semibold text-gray-900 dark:text-white">
                          {code.code}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">
                          {code.name}
                        </p>
                        {code.description && (
                          <p className="text-sm text-gray-500">{code.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      <span className={`px-2 py-1 text-xs rounded-full ${getSeverityBadge(code.severity)}`}>
                        {code.severity}
                      </span>
                      <button
                        onClick={() => handleToggleActive(code)}
                        className="p-1 text-gray-400 hover:text-gray-600"
                        title={code.is_active ? 'Deactivate' : 'Activate'}
                      >
                        {code.is_active ? (
                          <ToggleRight className="w-5 h-5 text-green-500" />
                        ) : (
                          <ToggleLeft className="w-5 h-5 text-gray-400" />
                        )}
                      </button>
                      <button
                        onClick={() => handleEdit(code)}
                        className="p-1 text-gray-400 hover:text-blue-600"
                        title="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {editingCode ? 'Edit Defect Code' : 'Add Defect Code'}
              </h2>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Code *
                  </label>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                    placeholder="e.g., DIM-001"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-mono"
                    disabled={!!editingCode}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Severity *
                  </label>
                  <select
                    value={formData.severity}
                    onChange={(e) => setFormData({ ...formData, severity: e.target.value as DefectCodeFormData['severity'] })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  >
                    {SEVERITY_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Dimension Out of Tolerance"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Category
                </label>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    placeholder="Select or type..."
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    list="category-presets"
                  />
                  <datalist id="category-presets">
                    {CATEGORY_PRESETS.map(cat => (
                      <option key={cat} value={cat} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Detailed description of the defect..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                />
              </div>

              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="rounded border-gray-300"
                />
                <span className="text-sm text-gray-600 dark:text-gray-400">Active</span>
              </label>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end space-x-3">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
