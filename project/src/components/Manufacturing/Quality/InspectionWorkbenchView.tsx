import { useState, useEffect } from 'react';
import {
  ClipboardCheck,
  Play,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Search,
  Clock,
  Factory,
} from 'lucide-react';
import { QualityExecutionService, InspectionRun, InspectionRunStatus } from '../../../services/QualityExecutionService';
import { useAuth } from '../../../contexts/AuthContext';

export function InspectionWorkbenchView() {
  const { user } = useAuth();
  const [inspections, setInspections] = useState<InspectionRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<InspectionRunStatus | 'all'>('all');

  const loadInspections = useCallback(async () => {
    try {
      setLoading(true);
      const filters: { status?: InspectionRunStatus } = {};
      if (statusFilter !== 'all') {
        filters.status = statusFilter;
      }
      const data = await QualityExecutionService.getInspectionRuns(filters);
      setInspections(data);
    } catch (error) {
      console.error('Error loading inspections:', error);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadInspections();
  }, [loadInspections]);

  const handleStartInspection = async (runId: string) => {
    if (!user?.id) return;
    try {
      await QualityExecutionService.startInspection(runId, user.id);
      const run = await QualityExecutionService.getInspectionRun(runId);
      setSelectedInspection(run);
    } catch (error) {
      console.error('Error starting inspection:', error);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'PASSED':
        return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case 'FAILED':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'IN_PROGRESS':
        return <Play className="w-5 h-5 text-blue-500" />;
      case 'WAIVED':
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      default:
        return <Clock className="w-5 h-5 text-gray-400" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      PENDING: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
      IN_PROGRESS: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
      PASSED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
      FAILED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
      WAIVED: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
    };
    return styles[status] || styles.PENDING;
  };

  const filteredInspections = inspections.filter(insp => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const planName = insp.plan?.name?.toLowerCase() || '';
      if (!planName.includes(query)) {
        return false;
      }
    }
    return true;
  });

  const pendingCount = inspections.filter(i => i.status === 'PENDING').length;
  const inProgressCount = inspections.filter(i => i.status === 'IN_PROGRESS').length;
  const completedTodayCount = inspections.filter(i => {
    if (!['PASSED', 'FAILED'].includes(i.status)) return false;
    if (!i.completed_at) return false;
    const today = new Date().toDateString();
    return new Date(i.completed_at).toDateString() === today;
  }).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center space-x-3">
        <ClipboardCheck className="w-8 h-8 text-purple-600 dark:text-purple-400" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Inspection Workbench</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Execute and manage quality inspections
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-4">
          <div className="flex items-center space-x-2 mb-2">
            <Clock className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-500">Pending</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{pendingCount}</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center space-x-2 mb-2">
            <Play className="w-4 h-4 text-blue-500" />
            <span className="text-sm text-gray-500">In Progress</span>
          </div>
          <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{inProgressCount}</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center space-x-2 mb-2">
            <CheckCircle2 className="w-4 h-4 text-green-500" />
            <span className="text-sm text-gray-500">Completed Today</span>
          </div>
          <p className="text-2xl font-bold text-green-600 dark:text-green-400">{completedTodayCount}</p>
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
              placeholder="Search inspections..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as InspectionRunStatus | 'all')}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            <option value="all">All Status</option>
            <option value="PENDING">Pending</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="PASSED">Passed</option>
            <option value="FAILED">Failed</option>
            <option value="WAIVED">Waived</option>
          </select>
        </div>
      </div>

      {/* Inspection Queue */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white">
            Inspection Queue ({filteredInspections.length})
          </h3>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
          </div>
        ) : filteredInspections.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <ClipboardCheck className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No inspections found</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {filteredInspections.map((inspection) => (
              <div
                key={inspection.id}
                className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    {getStatusIcon(inspection.status)}
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {inspection.plan?.name || 'Inspection'}
                      </p>
                      <div className="flex items-center space-x-3 text-sm text-gray-500">
                        <span className="flex items-center space-x-1">
                          <Factory className="w-3 h-3" />
                          <span>{inspection.plan?.plan_type}</span>
                        </span>
                        <span>{inspection.total_characteristics} checks</span>
                        {inspection.started_at && (
                          <span className="flex items-center space-x-1">
                            <Clock className="w-3 h-3" />
                            <span>{new Date(inspection.started_at).toLocaleString()}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <span className={`px-2 py-1 text-xs rounded-full ${getStatusBadge(inspection.status)}`}>
                      {inspection.status}
                    </span>
                    {inspection.status === 'PENDING' && (
                      <button
                        onClick={() => handleStartInspection(inspection.id)}
                        className="px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700"
                      >
                        Start
                      </button>
                    )}
                    {inspection.status === 'IN_PROGRESS' && (
                      <button
                        onClick={() => handleStartInspection(inspection.id)}
                        className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
                      >
                        Continue
                      </button>
                    )}
                    {['PASSED', 'FAILED'].includes(inspection.status) && (
                      <button
                        onClick={() => setSelectedInspection(inspection)}
                        className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                      >
                        View
                      </button>
                    )}
                  </div>
                </div>

                {/* Results summary for completed */}
                {['PASSED', 'FAILED'].includes(inspection.status) && (
                  <div className="mt-3 flex items-center space-x-4 text-sm">
                    <span className="text-green-600">
                      {inspection.passed_characteristics} passed
                    </span>
                    {inspection.failed_characteristics > 0 && (
                      <span className="text-red-600">
                        {inspection.failed_characteristics} failed
                      </span>
                    )}
                    {inspection.completed_at && (
                      <span className="text-gray-500">
                        Completed: {new Date(inspection.completed_at).toLocaleString()}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
