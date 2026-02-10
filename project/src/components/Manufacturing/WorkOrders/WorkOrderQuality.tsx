import { useState, useEffect, useCallback } from 'react';
import {
  ClipboardCheck,
  Play,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Plus,
  Camera,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { QualityExecutionService, InspectionRun, InspectionPlan, MeasurementInput, Characteristic } from '../../../services/QualityExecutionService';
import { useAuth } from '../../../contexts/AuthContext';

interface WorkOrderQualityProps {
  productionOrderId: string;
  workCenterId?: string;
  operationRunId?: string;
}

export function WorkOrderQuality({ productionOrderId, workCenterId, operationRunId }: WorkOrderQualityProps) {
  const { user } = useAuth();
  const [inspectionRuns, setInspectionRuns] = useState<InspectionRun[]>([]);
  const [availablePlans, setAvailablePlans] = useState<InspectionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeInspection, setActiveInspection] = useState<InspectionRun | null>(null);
  const [showPlanSelector, setShowPlanSelector] = useState(false);
  const [expandedRuns, setExpandedRuns] = useState<Set<string>>(new Set());

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [runs, plans] = await Promise.all([
        QualityExecutionService.getInspectionRuns({ production_order_id: productionOrderId }),
        QualityExecutionService.getInspectionPlans({ activeOnly: true }),
      ]);
      setInspectionRuns(runs);
      setAvailablePlans(plans);
    } catch (error) {
      console.error('Error loading quality data:', error);
    } finally {
      setLoading(false);
    }
  }, [productionOrderId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateInspection = async (planId: string) => {
    try {
      await QualityExecutionService.createInspectionRun({
        inspection_plan_id: planId,
        production_order_id: productionOrderId,
        work_center_id: workCenterId,
        operation_run_id: operationRunId,
      });
      setShowPlanSelector(false);
      loadData();
    } catch (error) {
      console.error('Error creating inspection:', error);
    }
  };

  const handleStartInspection = async (runId: string) => {
    if (!user?.id) return;
    try {
      await QualityExecutionService.startInspection(runId, user.id);
      const run = await QualityExecutionService.getInspectionRun(runId);
      setActiveInspection(run);
    } catch (error) {
      console.error('Error starting inspection:', error);
    }
  };

  const handleCompleteInspection = async () => {
    if (!activeInspection) return;
    try {
      await QualityExecutionService.completeInspection(activeInspection.id);
      setActiveInspection(null);
      loadData();
    } catch (error) {
      console.error('Error completing inspection:', error);
    }
  };

  const toggleRunExpanded = (runId: string) => {
    const newExpanded = new Set(expandedRuns);
    if (newExpanded.has(runId)) {
      newExpanded.delete(runId);
    } else {
      newExpanded.add(runId);
    }
    setExpandedRuns(newExpanded);
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
        return <ClipboardCheck className="w-5 h-5 text-gray-400" />;
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Show active inspection form
  if (activeInspection) {
    return (
      <InspectionForm
        inspection={activeInspection}
        onComplete={handleCompleteInspection}
        onCancel={() => {
          setActiveInspection(null);
          loadData();
        }}
      />
    );
  }

  const pendingRuns = inspectionRuns.filter(r => r.status === 'PENDING');
  const inProgressRuns = inspectionRuns.filter(r => r.status === 'IN_PROGRESS');
  const completedRuns = inspectionRuns.filter(r => ['PASSED', 'FAILED', 'WAIVED'].includes(r.status));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <ClipboardCheck className="w-5 h-5 text-purple-600" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Quality Inspections</h3>
        </div>
        <button
          onClick={() => setShowPlanSelector(true)}
          className="flex items-center space-x-2 px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm"
        >
          <Plus className="w-4 h-4" />
          <span>Add Inspection</span>
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
          <p className="text-sm text-gray-500">Pending</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{pendingRuns.length}</p>
        </div>
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
          <p className="text-sm text-blue-600 dark:text-blue-400">In Progress</p>
          <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{inProgressRuns.length}</p>
        </div>
        <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
          <p className="text-sm text-green-600 dark:text-green-400">Passed</p>
          <p className="text-2xl font-bold text-green-700 dark:text-green-300">
            {completedRuns.filter(r => r.status === 'PASSED').length}
          </p>
        </div>
        <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4">
          <p className="text-sm text-red-600 dark:text-red-400">Failed</p>
          <p className="text-2xl font-bold text-red-700 dark:text-red-300">
            {completedRuns.filter(r => r.status === 'FAILED').length}
          </p>
        </div>
      </div>

      {/* Inspection Runs List */}
      {inspectionRuns.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <ClipboardCheck className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No inspections required for this work order</p>
          <button
            onClick={() => setShowPlanSelector(true)}
            className="mt-4 text-purple-600 hover:text-purple-700"
          >
            Add an inspection
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {inspectionRuns.map((run) => (
            <div
              key={run.id}
              className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
            >
              <div
                className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 cursor-pointer"
                onClick={() => toggleRunExpanded(run.id)}
              >
                <div className="flex items-center space-x-3">
                  {expandedRuns.has(run.id) ? (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  )}
                  {getStatusIcon(run.status)}
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {run.plan?.name || 'Inspection'}
                    </p>
                    <p className="text-sm text-gray-500">
                      {run.plan?.plan_type} • {run.total_characteristics} checks
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <span className={`px-2 py-1 text-xs rounded-full ${getStatusBadge(run.status)}`}>
                    {run.status}
                  </span>
                  {run.status === 'PENDING' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStartInspection(run.id);
                      }}
                      className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                    >
                      Start
                    </button>
                  )}
                  {run.status === 'IN_PROGRESS' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStartInspection(run.id);
                      }}
                      className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                    >
                      Continue
                    </button>
                  )}
                  {run.status === 'FAILED' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        // View NCR
                      }}
                      className="px-3 py-1 bg-red-100 text-red-700 text-sm rounded hover:bg-red-200"
                    >
                      View NCR
                    </button>
                  )}
                </div>
              </div>

              {/* Expanded Details */}
              {expandedRuns.has(run.id) && (
                <div className="px-4 pb-4 bg-gray-50 dark:bg-gray-900/50">
                  <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                    <div className="grid grid-cols-3 gap-4 text-sm mb-3">
                      <div>
                        <span className="text-gray-500">Started:</span>{' '}
                        <span className="text-gray-900 dark:text-white">
                          {run.started_at ? new Date(run.started_at).toLocaleString() : '-'}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Completed:</span>{' '}
                        <span className="text-gray-900 dark:text-white">
                          {run.completed_at ? new Date(run.completed_at).toLocaleString() : '-'}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Results:</span>{' '}
                        <span className="text-green-600">{run.passed_characteristics} passed</span>
                        {run.failed_characteristics > 0 && (
                          <span className="text-red-600"> / {run.failed_characteristics} failed</span>
                        )}
                      </div>
                    </div>

                    {/* Measurements */}
                    {run.measurements && run.measurements.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Measurements</p>
                        <div className="grid gap-2">
                          {run.measurements.map((m) => (
                            <div
                              key={m.id}
                              className={`flex items-center justify-between p-2 rounded text-sm ${
                                m.is_within_spec === false
                                  ? 'bg-red-50 dark:bg-red-900/20'
                                  : 'bg-white dark:bg-gray-800'
                              }`}
                            >
                              <span className="text-gray-700 dark:text-gray-300">
                                {m.characteristic?.name}
                              </span>
                              <span className={m.is_within_spec === false ? 'text-red-600' : 'text-gray-900 dark:text-white'}>
                                {m.measured_value !== null
                                  ? `${m.measured_value} ${m.characteristic?.uom || ''}`
                                  : m.pass_fail !== null
                                  ? (m.pass_fail ? 'PASS' : 'FAIL')
                                  : '-'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Plan Selector Modal */}
      {showPlanSelector && (
        <PlanSelectorModal
          plans={availablePlans}
          onSelect={handleCreateInspection}
          onClose={() => setShowPlanSelector(false)}
        />
      )}
    </div>
  );
}

// =====================================================
// INSPECTION FORM COMPONENT
// =====================================================

interface InspectionFormProps {
  inspection: InspectionRun;
  onComplete: () => void;
  onCancel: () => void;
}

function InspectionForm({ inspection, onComplete, onCancel }: InspectionFormProps) {
  const [measurements, setMeasurements] = useState<Record<string, MeasurementInput>>({});
  const [saving, setSaving] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  const characteristics = inspection.plan?.characteristics?.filter(c => c.is_active) || [];
  const currentChar = characteristics[currentIndex];

  useEffect(() => {
    // Initialize measurements from existing data
    const existing: Record<string, MeasurementInput> = {};
    inspection.measurements?.forEach(m => {
      existing[m.characteristic_id] = {
        characteristic_id: m.characteristic_id,
        measured_value: m.measured_value ?? undefined,
        pass_fail: m.pass_fail ?? undefined,
        defect_count: m.defect_count ?? undefined,
        notes: m.notes ?? undefined,
      };
    });
    setMeasurements(existing);
  }, [inspection]);

  const handleMeasurementChange = (charId: string, field: string, value: string | number | boolean | undefined) => {
    setMeasurements(prev => ({
      ...prev,
      [charId]: {
        ...prev[charId],
        characteristic_id: charId,
        [field]: value,
      },
    }));
  };

  const handleSaveAndNext = async () => {
    if (!currentChar) return;

    setSaving(true);
    try {
      const input = measurements[currentChar.id];
      if (input) {
        await QualityExecutionService.recordMeasurement(inspection.id, input);
      }

      if (currentIndex < characteristics.length - 1) {
        setCurrentIndex(currentIndex + 1);
      }
    } catch (error) {
      console.error('Error saving measurement:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleComplete = async () => {
    setSaving(true);
    try {
      // Save any remaining measurements
      for (const charId of Object.keys(measurements)) {
        await QualityExecutionService.recordMeasurement(inspection.id, measurements[charId]);
      }
      onComplete();
    } catch (error) {
      console.error('Error completing inspection:', error);
    } finally {
      setSaving(false);
    }
  };

  const isWithinSpec = (char: Characteristic, value: number | undefined): boolean | null => {
    if (value === undefined || value === null) return null;
    if (char.lsl !== null && value < char.lsl) return false;
    if (char.usl !== null && value > char.usl) return false;
    return true;
  };

  if (!currentChar) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">No characteristics to inspect</p>
        <button onClick={onCancel} className="mt-4 text-blue-600">
          Go Back
        </button>
      </div>
    );
  }

  const currentMeasurement = measurements[currentChar.id];
  const specStatus = currentChar.char_type === 'VARIABLE'
    ? isWithinSpec(currentChar, currentMeasurement?.measured_value)
    : currentMeasurement?.pass_fail;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {inspection.plan?.name}
          </h3>
          <p className="text-sm text-gray-500">
            Characteristic {currentIndex + 1} of {characteristics.length}
          </p>
        </div>
        <button
          onClick={onCancel}
          className="text-gray-500 hover:text-gray-700"
        >
          Exit
        </button>
      </div>

      {/* Progress */}
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
        <div
          className="bg-purple-600 h-2 rounded-full transition-all"
          style={{ width: `${((currentIndex + 1) / characteristics.length) * 100}%` }}
        />
      </div>

      {/* Characteristic Card */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
        <div className="mb-4">
          <h4 className="text-xl font-medium text-gray-900 dark:text-white">
            {currentChar.name}
          </h4>
          {currentChar.description && (
            <p className="text-sm text-gray-500 mt-1">{currentChar.description}</p>
          )}
        </div>

        {/* Specs Display */}
        {currentChar.char_type === 'VARIABLE' && (
          <div className="flex items-center space-x-4 mb-4 p-3 bg-gray-50 dark:bg-gray-900 rounded">
            {currentChar.lsl !== null && (
              <div>
                <span className="text-xs text-gray-500">LSL</span>
                <p className="font-mono text-red-600">{currentChar.lsl}</p>
              </div>
            )}
            {currentChar.target_value !== null && (
              <div>
                <span className="text-xs text-gray-500">Target</span>
                <p className="font-mono text-green-600">{currentChar.target_value}</p>
              </div>
            )}
            {currentChar.usl !== null && (
              <div>
                <span className="text-xs text-gray-500">USL</span>
                <p className="font-mono text-red-600">{currentChar.usl}</p>
              </div>
            )}
            {currentChar.uom && (
              <div>
                <span className="text-xs text-gray-500">Unit</span>
                <p className="font-mono">{currentChar.uom}</p>
              </div>
            )}
          </div>
        )}

        {/* Input Field */}
        <div className="space-y-4">
          {currentChar.data_capture === 'numeric' || currentChar.char_type === 'VARIABLE' ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Measured Value
              </label>
              <div className="flex items-center space-x-2">
                <input
                  type="number"
                  step="any"
                  value={currentMeasurement?.measured_value ?? ''}
                  onChange={(e) => handleMeasurementChange(
                    currentChar.id,
                    'measured_value',
                    e.target.value ? parseFloat(e.target.value) : undefined
                  )}
                  className={`flex-1 px-4 py-3 text-lg border rounded-lg bg-white dark:bg-gray-900 ${
                    specStatus === false
                      ? 'border-red-500 text-red-600'
                      : specStatus === true
                      ? 'border-green-500'
                      : 'border-gray-300 dark:border-gray-600'
                  }`}
                  placeholder={`Enter value${currentChar.uom ? ` (${currentChar.uom})` : ''}`}
                  autoFocus
                />
                {specStatus !== null && (
                  specStatus ? (
                    <CheckCircle2 className="w-8 h-8 text-green-500" />
                  ) : (
                    <XCircle className="w-8 h-8 text-red-500" />
                  )
                )}
              </div>
            </div>
          ) : currentChar.data_capture === 'pass_fail' ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Result
              </label>
              <div className="flex space-x-4">
                <button
                  onClick={() => handleMeasurementChange(currentChar.id, 'pass_fail', true)}
                  className={`flex-1 py-4 rounded-lg border-2 flex items-center justify-center space-x-2 ${
                    currentMeasurement?.pass_fail === true
                      ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                      : 'border-gray-300 dark:border-gray-600'
                  }`}
                >
                  <CheckCircle2 className="w-6 h-6 text-green-500" />
                  <span className="text-lg font-medium">PASS</span>
                </button>
                <button
                  onClick={() => handleMeasurementChange(currentChar.id, 'pass_fail', false)}
                  className={`flex-1 py-4 rounded-lg border-2 flex items-center justify-center space-x-2 ${
                    currentMeasurement?.pass_fail === false
                      ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                      : 'border-gray-300 dark:border-gray-600'
                  }`}
                >
                  <XCircle className="w-6 h-6 text-red-500" />
                  <span className="text-lg font-medium">FAIL</span>
                </button>
              </div>
            </div>
          ) : currentChar.data_capture === 'count' ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Defect Count
              </label>
              <input
                type="number"
                min="0"
                value={currentMeasurement?.defect_count ?? ''}
                onChange={(e) => handleMeasurementChange(
                  currentChar.id,
                  'defect_count',
                  e.target.value ? parseInt(e.target.value) : undefined
                )}
                className="w-full px-4 py-3 text-lg border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900"
                placeholder="Enter defect count"
              />
            </div>
          ) : null}

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Notes (optional)
            </label>
            <textarea
              value={currentMeasurement?.notes ?? ''}
              onChange={(e) => handleMeasurementChange(currentChar.id, 'notes', e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900"
              placeholder="Add notes..."
            />
          </div>

          {/* Photo capture */}
          {currentChar.data_capture === 'photo' && (
            <button className="flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded-lg">
              <Camera className="w-5 h-5" />
              <span>Capture Photo</span>
            </button>
          )}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
          disabled={currentIndex === 0}
          className="px-4 py-2 text-gray-600 hover:text-gray-800 disabled:opacity-50"
        >
          Previous
        </button>

        <div className="flex items-center space-x-2">
          {characteristics.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentIndex(idx)}
              className={`w-3 h-3 rounded-full ${
                idx === currentIndex
                  ? 'bg-purple-600'
                  : measurements[characteristics[idx].id]
                  ? 'bg-green-500'
                  : 'bg-gray-300'
              }`}
            />
          ))}
        </div>

        {currentIndex < characteristics.length - 1 ? (
          <button
            onClick={handleSaveAndNext}
            disabled={saving}
            className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Next'}
          </button>
        ) : (
          <button
            onClick={handleComplete}
            disabled={saving}
            className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            {saving ? 'Completing...' : 'Complete Inspection'}
          </button>
        )}
      </div>
    </div>
  );
}

// =====================================================
// PLAN SELECTOR MODAL
// =====================================================

interface PlanSelectorModalProps {
  plans: InspectionPlan[];
  onSelect: (planId: string) => void;
  onClose: () => void;
}

function PlanSelectorModal({ plans, onSelect, onClose }: PlanSelectorModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-md mx-4 max-h-[80vh] overflow-auto">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Select Inspection Plan
          </h3>
        </div>
        <div className="p-4 space-y-2">
          {plans.length === 0 ? (
            <p className="text-center text-gray-500 py-4">No inspection plans available</p>
          ) : (
            plans.map((plan) => (
              <button
                key={plan.id}
                onClick={() => onSelect(plan.id)}
                className="w-full p-3 text-left border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <p className="font-medium text-gray-900 dark:text-white">{plan.name}</p>
                <p className="text-sm text-gray-500">
                  {plan.plan_type} • {plan.characteristics?.length || 0} characteristics
                </p>
              </button>
            ))
          )}
        </div>
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}