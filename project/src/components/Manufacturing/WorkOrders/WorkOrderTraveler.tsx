import { useState } from 'react';
import {
  CheckCircle,
  Clock,
  PlayCircle,
  SkipForward,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { ManufacturingService, ProductionStep, CreateProductionStepInput } from '../../../services/ManufacturingService';
import { useAuth } from '../../../contexts/AuthContext';

interface WorkOrderTravelerProps {
  orderId: string;
  orderStatus: string;
  steps: ProductionStep[];
  onUpdate: () => void;
}

export function WorkOrderTraveler({ orderId, orderStatus, steps, onUpdate }: WorkOrderTravelerProps) {
  const { profile } = useAuth();
  const [showAddStep, setShowAddStep] = useState(false);
  const [newStep, setNewStep] = useState<CreateProductionStepInput>({
    name: '',
    description: '',
    estimated_minutes: 30,
  });
  const [expandedStep, setExpandedStep] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const canManage = profile?.role === 'admin' || profile?.role === 'dispatcher';
  const canOperate = canManage || profile?.role === 'technician' || profile?.role === 'operator';
  const isComplete = orderStatus === 'complete';

  const handleAddStep = async () => {
    if (!newStep.name.trim()) return;

    setActionLoading('add');
    try {
      const result = await ManufacturingService.addStep(orderId, newStep);
      if (result.success) {
        setShowAddStep(false);
        setNewStep({ name: '', description: '', estimated_minutes: 30 });
        onUpdate();
      }
    } catch (error) {
      console.error('Error adding step:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleStepAction = async (stepId: string, action: 'start' | 'complete' | 'skip') => {
    setActionLoading(`${action}-${stepId}`);
    try {
      let status: 'pending' | 'in_progress' | 'complete' | 'skipped';
      switch (action) {
        case 'start':
          status = 'in_progress';
          break;
        case 'complete':
          status = 'complete';
          break;
        case 'skip':
          status = 'skipped';
          break;
      }

      const result = await ManufacturingService.updateStepStatus(stepId, status);
      if (result.success) {
        onUpdate();
      }
    } catch (error) {
      console.error('Error updating step:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteStep = async (stepId: string) => {
    if (!confirm('Are you sure you want to delete this step?')) return;

    setActionLoading(`delete-${stepId}`);
    try {
      const result = await ManufacturingService.deleteStep(stepId);
      if (result.success) {
        onUpdate();
      }
    } catch (error) {
      console.error('Error deleting step:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const getStepIcon = (status: string) => {
    switch (status) {
      case 'complete':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'in_progress':
        return <PlayCircle className="w-5 h-5 text-blue-500 animate-pulse" />;
      case 'skipped':
        return <SkipForward className="w-5 h-5 text-gray-400" />;
      default:
        return <Clock className="w-5 h-5 text-gray-400" />;
    }
  };

  const getStepBg = (status: string) => {
    switch (status) {
      case 'complete':
        return 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20';
      case 'in_progress':
        return 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20';
      case 'skipped':
        return 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50 opacity-60';
      default:
        return 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800';
    }
  };

  const completedCount = steps.filter(s => s.status === 'complete' || s.status === 'skipped').length;
  const progress = steps.length > 0 ? (completedCount / steps.length) * 100 : 0;

  return (
    <div className="space-y-4">
      {/* Progress Bar */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Progress</span>
          <span className="text-sm text-gray-500">{completedCount} of {steps.length} steps</span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Steps List */}
      <div className="space-y-3">
        {steps.map((step, index) => (
          <div
            key={step.id}
            className={`border rounded-lg transition-colors ${getStepBg(step.status)}`}
          >
            <div className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 text-sm font-medium">
                    {step.step_number}
                  </div>
                  {getStepIcon(step.status)}
                  <div>
                    <h4 className="font-medium text-gray-900 dark:text-white">{step.name}</h4>
                    {step.work_center && (
                      <p className="text-xs text-gray-500">@ {step.work_center.name}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  {step.estimated_minutes && (
                    <span className="text-xs text-gray-500">
                      Est. {step.estimated_minutes} min
                    </span>
                  )}
                  {step.actual_minutes && (
                    <span className="text-xs text-green-600 dark:text-green-400">
                      Actual: {step.actual_minutes} min
                    </span>
                  )}
                  <button
                    onClick={() => setExpandedStep(expandedStep === step.id ? null : step.id)}
                    className="p-1 text-gray-400 hover:text-gray-600"
                  >
                    {expandedStep === step.id ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Expanded Content */}
              {expandedStep === step.id && (
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  {step.description && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                      {step.description}
                    </p>
                  )}

                  {/* Step Actions */}
                  {!isComplete && canOperate && (
                    <div className="flex items-center space-x-2">
                      {step.status === 'pending' && (
                        <>
                          <button
                            onClick={() => handleStepAction(step.id, 'start')}
                            disabled={actionLoading === `start-${step.id}`}
                            className="flex items-center space-x-1 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
                          >
                            <PlayCircle className="w-4 h-4" />
                            <span>Start</span>
                          </button>
                          <button
                            onClick={() => handleStepAction(step.id, 'skip')}
                            disabled={actionLoading === `skip-${step.id}`}
                            className="flex items-center space-x-1 px-3 py-1.5 bg-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 disabled:opacity-50"
                          >
                            <SkipForward className="w-4 h-4" />
                            <span>Skip</span>
                          </button>
                        </>
                      )}
                      {step.status === 'in_progress' && (
                        <button
                          onClick={() => handleStepAction(step.id, 'complete')}
                          disabled={actionLoading === `complete-${step.id}`}
                          className="flex items-center space-x-1 px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50"
                        >
                          <CheckCircle className="w-4 h-4" />
                          <span>Complete</span>
                        </button>
                      )}
                      {canManage && step.status === 'pending' && (
                        <button
                          onClick={() => handleDeleteStep(step.id)}
                          disabled={actionLoading === `delete-${step.id}`}
                          className="flex items-center space-x-1 px-3 py-1.5 text-red-600 text-sm hover:bg-red-50 rounded-lg disabled:opacity-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )}

                  {/* Completion Info */}
                  {step.completed_by_user && step.completed_at && (
                    <p className="text-xs text-gray-500 mt-2">
                      Completed by {step.completed_by_user.full_name} on{' '}
                      {new Date(step.completed_at).toLocaleString()}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Add Step */}
      {!isComplete && canManage && (
        <div className="card">
          {showAddStep ? (
            <div className="p-4 space-y-4">
              <h4 className="font-medium text-gray-900 dark:text-white">Add Step</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Step Name *
                  </label>
                  <input
                    type="text"
                    value={newStep.name}
                    onChange={(e) => setNewStep(s => ({ ...s, name: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    placeholder="e.g., Assembly"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Estimated Minutes
                  </label>
                  <input
                    type="number"
                    value={newStep.estimated_minutes || ''}
                    onChange={(e) => setNewStep(s => ({ ...s, estimated_minutes: parseInt(e.target.value) || undefined }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Description
                  </label>
                  <textarea
                    value={newStep.description || ''}
                    onChange={(e) => setNewStep(s => ({ ...s, description: e.target.value }))}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    placeholder="Step instructions..."
                  />
                </div>
              </div>
              <div className="flex items-center justify-end space-x-2">
                <button
                  onClick={() => setShowAddStep(false)}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddStep}
                  disabled={actionLoading === 'add' || !newStep.name.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  Add Step
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAddStep(true)}
              className="w-full p-4 flex items-center justify-center space-x-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
            >
              <Plus className="w-5 h-5" />
              <span>Add Step</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
