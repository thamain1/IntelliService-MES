import { useState, useEffect } from 'react';
import { Tag, Plus, Search, Edit, ToggleLeft, ToggleRight, Filter } from 'lucide-react';
import { DowntimeService, DowntimeReason } from '../../../services/DowntimeService';
import { ReasonCodeForm } from './ReasonCodeForm';
import { useAuth } from '../../../contexts/AuthContext';

type FilterCategory = 'all' | 'planned' | 'unplanned';
type FilterGroup = 'all' | 'mechanical' | 'electrical' | 'material' | 'quality' | 'ops' | 'other';
type FilterStatus = 'all' | 'active' | 'inactive';

export function ReasonCodesView() {
  const { profile } = useAuth();
  const [reasons, setReasons] = useState<DowntimeReason[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<FilterCategory>('all');
  const [filterGroup, setFilterGroup] = useState<FilterGroup>('all');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('active');
  const [editingReason, setEditingReason] = useState<DowntimeReason | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const canManage = profile?.role === 'admin';

  useEffect(() => {
    loadReasons();
  }, []);

  const loadReasons = async () => {
    try {
      setLoading(true);
      // Load all reasons (including inactive) for admin view
      const data = await DowntimeService.getReasons(false);
      setReasons(data);
    } catch (error) {
      console.error('Error loading reasons:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (reason: DowntimeReason) => {
    setActionLoading(reason.id);
    try {
      if (reason.is_active) {
        await DowntimeService.deactivateReason(reason.id);
      } else {
        await DowntimeService.updateReason(reason.id, { is_active: true });
      }
      loadReasons();
    } catch (error) {
      console.error('Error toggling reason status:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const filteredReasons = reasons.filter(r => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (!r.code.toLowerCase().includes(query) &&
          !r.name.toLowerCase().includes(query) &&
          !(r.description || '').toLowerCase().includes(query)) {
        return false;
      }
    }

    // Category filter
    if (filterCategory !== 'all' && r.category !== filterCategory) {
      return false;
    }

    // Group filter
    if (filterGroup !== 'all' && r.reason_group !== filterGroup) {
      return false;
    }

    // Status filter
    if (filterStatus === 'active' && !r.is_active) return false;
    if (filterStatus === 'inactive' && r.is_active) return false;

    return true;
  });

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'planned':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
      case 'unplanned':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
  };

  const getGroupColor = (group: string) => {
    const colors: Record<string, string> = {
      mechanical: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
      electrical: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
      material: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
      quality: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
      ops: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
      other: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
    };
    return colors[group] || colors.other;
  };

  // Stats
  const activeCount = reasons.filter(r => r.is_active).length;
  const plannedCount = reasons.filter(r => r.category === 'planned').length;
  const unplannedCount = reasons.filter(r => r.category === 'unplanned').length;

  // Group stats
  const groupStats = reasons.reduce((acc, r) => {
    acc[r.reason_group] = (acc[r.reason_group] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Tag className="w-8 h-8 text-purple-600 dark:text-purple-400" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Reason Codes</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Manage downtime reason code taxonomy
            </p>
          </div>
        </div>
        {canManage && (
          <button
            onClick={() => {
              setEditingReason(null);
              setShowForm(true);
            }}
            className="flex items-center space-x-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
          >
            <Plus className="w-4 h-4" />
            <span>Add Reason Code</span>
          </button>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="flex items-center space-x-2 mb-2">
            <Tag className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-500">Total Codes</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {reasons.length}
          </p>
          <p className="text-xs text-gray-500">{activeCount} active</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center space-x-2 mb-2">
            <div className="w-3 h-3 rounded-full bg-blue-500"></div>
            <span className="text-sm text-gray-500">Planned</span>
          </div>
          <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {plannedCount}
          </p>
          <p className="text-xs text-gray-500">reason codes</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center space-x-2 mb-2">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <span className="text-sm text-gray-500">Unplanned</span>
          </div>
          <p className="text-2xl font-bold text-red-600 dark:text-red-400">
            {unplannedCount}
          </p>
          <p className="text-xs text-gray-500">reason codes</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center space-x-2 mb-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-500">Groups</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {Object.keys(groupStats).length}
          </p>
          <p className="text-xs text-gray-500">categories</p>
        </div>
      </div>

      {/* Group Distribution */}
      <div className="card p-4">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
          Reason Groups Distribution
        </h3>
        <div className="flex flex-wrap gap-2">
          {Object.entries(groupStats).map(([group, count]) => (
            <button
              key={group}
              onClick={() => setFilterGroup(filterGroup === group ? 'all' : group as FilterGroup)}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                filterGroup === group
                  ? 'ring-2 ring-purple-500'
                  : ''
              } ${getGroupColor(group)}`}
            >
              {group}: {count}
            </button>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-col md:flex-row md:items-center space-y-4 md:space-y-0 md:space-x-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search reason codes..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
          </div>

          {/* Category Filter */}
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value as FilterCategory)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            <option value="all">All Categories</option>
            <option value="planned">Planned</option>
            <option value="unplanned">Unplanned</option>
          </select>

          {/* Group Filter */}
          <select
            value={filterGroup}
            onChange={(e) => setFilterGroup(e.target.value as FilterGroup)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            <option value="all">All Groups</option>
            <option value="mechanical">Mechanical</option>
            <option value="electrical">Electrical</option>
            <option value="material">Material</option>
            <option value="quality">Quality</option>
            <option value="ops">Operations</option>
            <option value="other">Other</option>
          </select>

          {/* Status Filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      {/* Reason Codes List */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white">
            Reason Codes ({filteredReasons.length})
          </h3>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
          </div>
        ) : filteredReasons.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <Tag className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No reason codes found</p>
            <p className="text-sm mt-2">Try adjusting your filters or create a new reason code</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Code
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Category
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Group
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Status
                  </th>
                  {canManage && (
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredReasons.map((reason) => (
                  <tr
                    key={reason.id}
                    className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 ${
                      !reason.is_active ? 'opacity-60' : ''
                    }`}
                  >
                    <td className="px-4 py-3">
                      <span className="font-mono text-sm font-medium text-gray-900 dark:text-white">
                        {reason.code}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">{reason.name}</p>
                        {reason.description && (
                          <p className="text-sm text-gray-500 truncate max-w-xs">
                            {reason.description}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full ${getCategoryColor(reason.category)}`}>
                        {reason.category}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full ${getGroupColor(reason.reason_group)}`}>
                        {reason.reason_group}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {reason.is_active ? (
                        <span className="flex items-center text-green-600 dark:text-green-400 text-sm">
                          <ToggleRight className="w-4 h-4 mr-1" />
                          Active
                        </span>
                      ) : (
                        <span className="flex items-center text-gray-400 text-sm">
                          <ToggleLeft className="w-4 h-4 mr-1" />
                          Inactive
                        </span>
                      )}
                    </td>
                    {canManage && (
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => {
                              setEditingReason(reason);
                              setShowForm(true);
                            }}
                            className="p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                            title="Edit"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleToggleActive(reason)}
                            disabled={actionLoading === reason.id}
                            className={`p-1 ${
                              reason.is_active
                                ? 'text-green-600 hover:text-green-700'
                                : 'text-gray-400 hover:text-gray-600'
                            }`}
                            title={reason.is_active ? 'Deactivate' : 'Activate'}
                          >
                            {reason.is_active ? (
                              <ToggleRight className="w-5 h-5" />
                            ) : (
                              <ToggleLeft className="w-5 h-5" />
                            )}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Form Modal */}
      {showForm && (
        <ReasonCodeForm
          reason={editingReason}
          onClose={() => {
            setShowForm(false);
            setEditingReason(null);
          }}
          onSaved={() => {
            setShowForm(false);
            setEditingReason(null);
            loadReasons();
          }}
        />
      )}
    </div>
  );
}
