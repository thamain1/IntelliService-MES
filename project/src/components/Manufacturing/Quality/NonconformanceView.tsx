import { useState, useEffect, useCallback } from 'react';
import {
  AlertOctagon,
  Search,
  Plus,
  AlertTriangle,
  ChevronRight,
  X,
} from 'lucide-react';
import {
  QualityExecutionService,
  Nonconformance,
  NCStatus,
  NCSeverity,
  DefectCode,
  DispositionType,
  CreateNCInput,
} from '../../../services/QualityExecutionService';
import { useAuth } from '../../../contexts/AuthContext';

export function NonconformanceView() {
  const { profile } = useAuth();
  const [nonconformances, setNonconformances] = useState<Nonconformance[]>([]);
  const [defectCodes, setDefectCodes] = useState<DefectCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<NCStatus | 'all'>('all');
  const [severityFilter, setSeverityFilter] = useState<NCSeverity | 'all'>('all');
  const [selectedNC, setSelectedNC] = useState<Nonconformance | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const canDisposition = profile?.role === 'admin' || profile?.role === 'supervisor';

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const filters: { status?: NCStatus; severity?: NCSeverity } = {};
      if (statusFilter !== 'all') filters.status = statusFilter;
      if (severityFilter !== 'all') filters.severity = severityFilter;

      const [ncs, codes] = await Promise.all([
        QualityExecutionService.getNonconformances(filters),
        QualityExecutionService.getDefectCodes(),
      ]);
      setNonconformances(ncs);
      setDefectCodes(codes);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, severityFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const getSeverityBadge = (severity: NCSeverity) => {
    const styles: Record<NCSeverity, string> = {
      MINOR: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
      MAJOR: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
      CRITICAL: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    };
    return styles[severity];
  };

  const getStatusBadge = (status: NCStatus) => {
    const styles: Record<NCStatus, string> = {
      OPEN: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
      UNDER_REVIEW: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
      DISPOSITIONED: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
      CLOSED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    };
    return styles[status];
  };

  const filteredNCs = nonconformances.filter(nc => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (
        !nc.nc_number.toLowerCase().includes(query) &&
        !nc.title.toLowerCase().includes(query)
      ) {
        return false;
      }
    }
    return true;
  });

  const openCount = nonconformances.filter(nc => nc.status === 'OPEN').length;
  const criticalCount = nonconformances.filter(nc => nc.severity === 'CRITICAL' && nc.status !== 'CLOSED').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <AlertOctagon className="w-8 h-8 text-red-600 dark:text-red-400" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Nonconformances</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Manage NCRs, dispositions, and corrective actions
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
        >
          <Plus className="w-4 h-4" />
          <span>Create NCR</span>
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="card p-4">
          <p className="text-sm text-gray-500">Total NCRs</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{nonconformances.length}</p>
        </div>
        <div className="card p-4 border-l-4 border-red-500">
          <p className="text-sm text-gray-500">Open</p>
          <p className="text-2xl font-bold text-red-600 dark:text-red-400">{openCount}</p>
        </div>
        <div className="card p-4 border-l-4 border-orange-500">
          <p className="text-sm text-gray-500">Critical</p>
          <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{criticalCount}</p>
        </div>
        <div className="card p-4 border-l-4 border-green-500">
          <p className="text-sm text-gray-500">Closed This Month</p>
          <p className="text-2xl font-bold text-green-600 dark:text-green-400">
            {nonconformances.filter(nc => {
              if (nc.status !== 'CLOSED' || !nc.closed_at) return false;
              const thisMonth = new Date().getMonth();
              return new Date(nc.closed_at).getMonth() === thisMonth;
            }).length}
          </p>
        </div>
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
              placeholder="Search by NCR number or title..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as NCStatus | 'all')}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            <option value="all">All Status</option>
            <option value="OPEN">Open</option>
            <option value="UNDER_REVIEW">Under Review</option>
            <option value="DISPOSITIONED">Dispositioned</option>
            <option value="CLOSED">Closed</option>
          </select>
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value as NCSeverity | 'all')}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            <option value="all">All Severity</option>
            <option value="MINOR">Minor</option>
            <option value="MAJOR">Major</option>
            <option value="CRITICAL">Critical</option>
          </select>
        </div>
      </div>

      {/* NCR List */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white">
            NCR List ({filteredNCs.length})
          </h3>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600"></div>
          </div>
        ) : filteredNCs.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <AlertOctagon className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No nonconformances found</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {filteredNCs.map((nc) => (
              <div
                key={nc.id}
                className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer"
                onClick={() => setSelectedNC(nc)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className={`p-2 rounded-lg ${
                      nc.severity === 'CRITICAL' ? 'bg-red-100 dark:bg-red-900/30' :
                      nc.severity === 'MAJOR' ? 'bg-orange-100 dark:bg-orange-900/30' :
                      'bg-yellow-100 dark:bg-yellow-900/30'
                    }`}>
                      <AlertTriangle className={`w-5 h-5 ${
                        nc.severity === 'CRITICAL' ? 'text-red-600' :
                        nc.severity === 'MAJOR' ? 'text-orange-600' :
                        'text-yellow-600'
                      }`} />
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <p className="font-mono font-medium text-gray-900 dark:text-white">
                          {nc.nc_number}
                        </p>
                        <span className={`px-2 py-0.5 text-xs rounded ${getSeverityBadge(nc.severity)}`}>
                          {nc.severity}
                        </span>
                        <span className={`px-2 py-0.5 text-xs rounded ${getStatusBadge(nc.status)}`}>
                          {nc.status.replace('_', ' ')}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{nc.title}</p>
                      <div className="flex items-center space-x-3 mt-1 text-xs text-gray-500">
                        <span>{nc.source}</span>
                        <span>•</span>
                        <span>Qty: {nc.qty_affected}</span>
                        <span>•</span>
                        <span>{new Date(nc.reported_at).toLocaleDateString()}</span>
                        {nc.defects && nc.defects.length > 0 && (
                          <>
                            <span>•</span>
                            <span>{nc.defects.length} defect(s)</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedNC && (
        <NCDetailModal
          nc={selectedNC}
          canDisposition={canDisposition}
          onClose={() => setSelectedNC(null)}
          onUpdate={() => {
            loadData();
            setSelectedNC(null);
          }}
        />
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <CreateNCModal
          defectCodes={defectCodes}
          onClose={() => setShowCreateModal(false)}
          onCreate={() => {
            loadData();
            setShowCreateModal(false);
          }}
        />
      )}
    </div>
  );
}

// =====================================================
// NC DETAIL MODAL
// =====================================================

interface NCDetailModalProps {
  nc: Nonconformance;
  canDisposition: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

function NCDetailModal({ nc, canDisposition, onClose, onUpdate }: NCDetailModalProps) {
  const { user } = useAuth();
  const [showDispositionForm, setShowDispositionForm] = useState(false);
  const [disposition, setDisposition] = useState<DispositionType>('REWORK');
  const [instructions, setInstructions] = useState('');
  const [saving, setSaving] = useState(false);

  const handleCreateDisposition = async () => {
    setSaving(true);
    try {
      await QualityExecutionService.createDisposition({
        nonconformance_id: nc.id,
        disposition,
        instructions,
      });
      onUpdate();
    } catch (error) {
      console.error('Error creating disposition:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleApproveDisposition = async () => {
    if (!nc.disposition || !user?.id) return;
    setSaving(true);
    try {
      await QualityExecutionService.approveDisposition(nc.disposition.id, user.id);
      onUpdate();
    } catch (error) {
      console.error('Error approving disposition:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-2xl max-h-[90vh] overflow-auto">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between sticky top-0 bg-white dark:bg-gray-800">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {nc.nc_number}
            </h3>
            <p className="text-sm text-gray-500">{nc.title}</p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-500 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-6">
          {/* Status & Severity */}
          <div className="flex items-center space-x-3">
            <span className={`px-3 py-1 text-sm rounded-full ${
              nc.severity === 'CRITICAL' ? 'bg-red-100 text-red-800' :
              nc.severity === 'MAJOR' ? 'bg-orange-100 text-orange-800' :
              'bg-yellow-100 text-yellow-800'
            }`}>
              {nc.severity}
            </span>
            <span className={`px-3 py-1 text-sm rounded-full ${
              nc.status === 'OPEN' ? 'bg-red-100 text-red-800' :
              nc.status === 'CLOSED' ? 'bg-green-100 text-green-800' :
              'bg-blue-100 text-blue-800'
            }`}>
              {nc.status.replace('_', ' ')}
            </span>
            <span className="text-sm text-gray-500">
              Source: {nc.source}
            </span>
          </div>

          {/* Description */}
          {nc.description && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</h4>
              <p className="text-gray-600 dark:text-gray-400">{nc.description}</p>
            </div>
          )}

          {/* Details */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Quantity Affected:</span>
              <span className="ml-2 text-gray-900 dark:text-white">{nc.qty_affected}</span>
            </div>
            <div>
              <span className="text-gray-500">Reported:</span>
              <span className="ml-2 text-gray-900 dark:text-white">
                {new Date(nc.reported_at).toLocaleString()}
              </span>
            </div>
          </div>

          {/* Defects */}
          {nc.defects && nc.defects.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Defects</h4>
              <div className="space-y-2">
                {nc.defects.map((defect) => (
                  <div
                    key={defect.id}
                    className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-900 rounded"
                  >
                    <div>
                      <span className="font-mono text-sm">{defect.defect_code?.code}</span>
                      <span className="ml-2 text-gray-600 dark:text-gray-400">
                        {defect.defect_code?.name}
                      </span>
                    </div>
                    <span className="text-sm text-gray-500">Qty: {defect.qty_affected}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Disposition */}
          {nc.disposition ? (
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Disposition</h4>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-sm">
                    {nc.disposition.disposition.replace('_', ' ')}
                  </span>
                  {nc.disposition.approved_at && (
                    <span className="text-sm text-green-600">
                      Approved {new Date(nc.disposition.approved_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
                {nc.disposition.instructions && (
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {nc.disposition.instructions}
                  </p>
                )}
                {!nc.disposition.approved_at && canDisposition && (
                  <button
                    onClick={handleApproveDisposition}
                    disabled={saving}
                    className="mt-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                  >
                    {saving ? 'Approving...' : 'Approve Disposition'}
                  </button>
                )}
              </div>
            </div>
          ) : canDisposition && nc.status !== 'CLOSED' ? (
            showDispositionForm ? (
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Create Disposition
                </h4>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                      Disposition Type
                    </label>
                    <select
                      value={disposition}
                      onChange={(e) => setDisposition(e.target.value as DispositionType)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900"
                    >
                      <option value="REWORK">Rework</option>
                      <option value="SCRAP">Scrap</option>
                      <option value="USE_AS_IS">Use As Is</option>
                      <option value="RETURN_TO_VENDOR">Return to Vendor</option>
                      <option value="SORT_100">100% Sort</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                      Instructions
                    </label>
                    <textarea
                      value={instructions}
                      onChange={(e) => setInstructions(e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900"
                      placeholder="Enter disposition instructions..."
                    />
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={handleCreateDisposition}
                      disabled={saving}
                      className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
                    >
                      {saving ? 'Creating...' : 'Create Disposition'}
                    </button>
                    <button
                      onClick={() => setShowDispositionForm(false)}
                      className="px-4 py-2 border border-gray-300 rounded-lg"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowDispositionForm(true)}
                className="w-full px-4 py-2 border border-purple-600 text-purple-600 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-900/20"
              >
                Add Disposition
              </button>
            )
          ) : null}

          {/* CAPA */}
          {nc.capa && (
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                CAPA: {nc.capa.capa_number}
              </h4>
              <div className="space-y-2 text-sm">
                {nc.capa.root_cause && (
                  <div>
                    <span className="text-gray-500">Root Cause:</span>
                    <p className="text-gray-900 dark:text-white">{nc.capa.root_cause}</p>
                  </div>
                )}
                {nc.capa.corrective_action && (
                  <div>
                    <span className="text-gray-500">Corrective Action:</span>
                    <p className="text-gray-900 dark:text-white">{nc.capa.corrective_action}</p>
                  </div>
                )}
                <div>
                  <span className={`px-2 py-1 rounded text-xs ${
                    nc.capa.status === 'CLOSED' ? 'bg-green-100 text-green-800' :
                    nc.capa.status === 'VERIFIED' ? 'bg-blue-100 text-blue-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {nc.capa.status}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// =====================================================
// CREATE NC MODAL
// =====================================================

interface CreateNCModalProps {
  defectCodes: DefectCode[];
  onClose: () => void;
  onCreate: () => void;
}

function CreateNCModal({ defectCodes, onClose, onCreate }: CreateNCModalProps) {
  const [formData, setFormData] = useState<Partial<CreateNCInput>>({
    source: 'OPERATOR_REPORTED',
    severity: 'MINOR',
    title: '',
    description: '',
    qty_affected: 1,
  });
  const [selectedDefects, setSelectedDefects] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title) return;

    setSaving(true);
    try {
      await QualityExecutionService.createNonconformance({
        source: formData.source || 'OPERATOR_REPORTED',
        severity: formData.severity || 'MINOR',
        title: formData.title,
        description: formData.description,
        qty_affected: formData.qty_affected,
        defect_codes: selectedDefects.map(id => ({ defect_code_id: id })),
      });
      onCreate();
    } catch (error) {
      console.error('Error creating NCR:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-lg">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Create Nonconformance
          </h3>
          <button onClick={onClose} className="p-2 text-gray-500 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Title *
            </label>
            <input
              type="text"
              value={formData.title || ''}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Source
              </label>
              <select
                value={formData.source}
                onChange={(e) => setFormData({ ...formData, source: e.target.value as 'OPERATOR_REPORTED' | 'INSPECTION' | 'CUSTOMER_RETURN' | 'AUDIT' })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900"
              >
                <option value="OPERATOR_REPORTED">Operator Reported</option>
                <option value="INSPECTION">Inspection</option>
                <option value="CUSTOMER_RETURN">Customer Return</option>
                <option value="AUDIT">Audit</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Severity
              </label>
              <select
                value={formData.severity}
                onChange={(e) => setFormData({ ...formData, severity: e.target.value as 'MINOR' | 'MAJOR' | 'CRITICAL' })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900"
              >
                <option value="MINOR">Minor</option>
                <option value="MAJOR">Major</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Quantity Affected
            </label>
            <input
              type="number"
              min="1"
              value={formData.qty_affected || 1}
              onChange={(e) => setFormData({ ...formData, qty_affected: parseInt(e.target.value) })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Description
            </label>
            <textarea
              value={formData.description || ''}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Defect Codes
            </label>
            <div className="max-h-32 overflow-y-auto border border-gray-300 dark:border-gray-600 rounded-lg p-2 space-y-1">
              {defectCodes.map((code) => (
                <label key={code.id} className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedDefects.includes(code.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedDefects([...selectedDefects, code.id]);
                      } else {
                        setSelectedDefects(selectedDefects.filter(id => id !== code.id));
                      }
                    }}
                    className="rounded"
                  />
                  <span className="font-mono text-sm">{code.code}</span>
                  <span className="text-sm text-gray-600 dark:text-gray-400">{code.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex space-x-3 pt-4">
            <button
              type="submit"
              disabled={saving || !formData.title}
              className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              {saving ? 'Creating...' : 'Create NCR'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}