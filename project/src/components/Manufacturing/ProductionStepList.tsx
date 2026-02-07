import { useState } from 'react';
import {
  Plus,
  Play,
  CheckCircle,
  SkipForward,
  Trash2,
  Clock,
  Layers,
  GripVertical,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { ManufacturingService, ProductionStep, CreateProductionStepInput } from '../../services/ManufacturingService';
import { supabase } from '../../lib/supabase';
import { useEffect } from 'react';

interface WorkCenter {
  id: string;
  code: string;
  name: string;
}

interface ProductionStepListProps {
  orderId: string;
  steps: ProductionStep[];
  orderStatus: string;
  onUpdate: () => void;
}

export function ProductionStepList({ orderId, steps, orderStatus, onUpdate }: ProductionStepListProps) {
  const { profile } = useAuth();
  const [showAddForm, setShowAddForm] = useState(false);
  const [workCenters, setWorkCenters] = useState<WorkCenter[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [newStep, setNewStep] = useState<CreateProductionStepInput>({
    name: '',
    description: '',
    work_center_id: '',
    estimated_minutes: undefined,
  });

  useEffect(() => {
    loadWorkCenters();
  }, []);

  const loadWorkCenters = async () => {
    const centers = await ManufacturingService.getWorkCenters();
    setWorkCenters(centers);
  };

  const handleAddStep = async () => {
    if (!newStep.name.trim()) return;

    setActionLoading('add');
    try {
      const result = await ManufacturingService.addStep(orderId, {
        ...newStep,
        work_center_id: newStep.work_center_id || undefined,
      });
      if (result.success) {
        setNewStep({ name: '', description: '', work_center_id: '', estimated_minutes: undefined });
        setShowAddForm(false);
        onUpdate();
      }
    } catch (error) {
      console.error('Error adding step:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleStartStep = async (stepId: string) => {
    setActionLoading(stepId);
    try {
      const result = await ManufacturingService.updateStepStatus(stepId, 'in_progress');
      if (result.success) {
        onUpdate();
      }
    } catch (error) {
      console.error('Error starting step:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCompleteStep = async (stepId: string) => {
    setActionLoading(stepId);
    try {
      const result = await ManufacturingService.updateStepStatus(stepId, 'complete');
      if (result.success) {
        onUpdate();
      }
    } catch (error) {
      console.error('Error completing step:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleSkipStep = async (stepId: string) => {
    if (!confirm('Are you sure you want to skip this step?')) return;

    setActionLoading(stepId);
    try {
      const result = await ManufacturingService.updateStepStatus(stepId, 'skipped');
      if (result.success) {
        onUpdate();
      }
    } catch (error) {
      console.error('Error skipping step:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteStep = async (stepId: string) => {
    if (!confirm('Are you sure you want to delete this step?')) return;

    setActionLoading(stepId);
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

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { class: string; label: string }> = {
      pending: { class: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300', label: 'Pending' },
      in_progress: { class: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300', label: 'In Progress' },
      complete: { class: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300', label: 'Complete' },
      skipped: { class: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400', label: 'Skipped' },
    };
    return badges[status] || badges.pending;
  };

  const formatDuration = (minutes: number | null | undefined) => {
    if (!minutes) return '-';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const canModify = profile?.role !== 'technician' && orderStatus !== 'complete';
  const canStart = orderStatus !== 'complete' && orderStatus !== 'hold';

  return (
    <div>
      {/* Add Step Button */}
      {canModify && !showAddForm && (
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center space-x-2 px-4 py-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg"
          >
            <Plus className="w-4 h-4" />
            <span>Add Step</span>
          </button>
        </div>
      )}

      {/* Add Step Form */}
      {showAddForm && (
        <div className="p-4 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Step Name *
                </label>
                <input
                  type="text"
                  value={newStep.name}
                  onChange={(e) => setNewStep({ ...newStep, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="e.g., Cut material, Assemble parts"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Work Center
                </label>
                <select
                  value={newStep.work_center_id}
                  onChange={(e) => setNewStep({ ...newStep, work_center_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="">Select work center (optional)</option>
                  {workCenters.map((wc) => (
                    <option key={wc.id} value={wc.id}>
                      {wc.code} - {wc.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={newStep.description}
                  onChange={(e) => setNewStep({ ...newStep, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="Additional details (optional)"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Estimated Time (minutes)
                </label>
                <input
                  type="number"
                  min="0"
                  value={newStep.estimated_minutes || ''}
                  onChange={(e) => setNewStep({ ...newStep, estimated_minutes: e.target.value ? Number(e.target.value) : undefined })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="e.g., 30"
                />
              </div>
            </div>
            <div className="flex items-center justify-end space-x-3">
              <button
                onClick={() => {
                  setShowAddForm(false);
                  setNewStep({ name: '', description: '', work_center_id: '', estimated_minutes: undefined });
                }}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleAddStep}
                disabled={!newStep.name.trim() || actionLoading === 'add'}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {actionLoading === 'add' ? 'Adding...' : 'Add Step'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Steps List */}
      {steps.length === 0 ? (
        <div className="p-8 text-center">
          <Layers className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400">No steps defined</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
            Add production steps to track the workflow
          </p>
        </div>
      ) : (
        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {steps.map((step, index) => {
            const statusBadge = getStatusBadge(step.status);
            const isCurrentStep = step.status === 'pending' && index === steps.findIndex(s => s.status === 'pending');

            return (
              <div
                key={step.id}
                className={`p-4 ${isCurrentStep ? 'bg-blue-50 dark:bg-blue-900/10' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 font-medium">
                      {step.step_number}
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-medium text-gray-900 dark:text-white">{step.name}</span>
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${statusBadge.class}`}>
                          {statusBadge.label}
                        </span>
                      </div>
                      {step.description && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{step.description}</p>
                      )}
                      <div className="flex items-center space-x-4 text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {step.work_center && (
                          <span className="flex items-center space-x-1">
                            <Layers className="w-3 h-3" />
                            <span>{step.work_center.code}</span>
                          </span>
                        )}
                        {step.estimated_minutes && (
                          <span className="flex items-center space-x-1">
                            <Clock className="w-3 h-3" />
                            <span>Est: {formatDuration(step.estimated_minutes)}</span>
                          </span>
                        )}
                        {step.actual_minutes && (
                          <span className="flex items-center space-x-1">
                            <Clock className="w-3 h-3" />
                            <span>Actual: {formatDuration(step.actual_minutes)}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center space-x-2">
                    {step.status === 'pending' && canStart && (
                      <button
                        onClick={() => handleStartStep(step.id)}
                        disabled={actionLoading === step.id}
                        className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg disabled:opacity-50"
                        title="Start"
                      >
                        <Play className="w-4 h-4" />
                      </button>
                    )}

                    {step.status === 'in_progress' && canStart && (
                      <button
                        onClick={() => handleCompleteStep(step.id)}
                        disabled={actionLoading === step.id}
                        className="p-2 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg disabled:opacity-50"
                        title="Complete"
                      >
                        <CheckCircle className="w-4 h-4" />
                      </button>
                    )}

                    {(step.status === 'pending' || step.status === 'in_progress') && canModify && (
                      <button
                        onClick={() => handleSkipStep(step.id)}
                        disabled={actionLoading === step.id}
                        className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg disabled:opacity-50"
                        title="Skip"
                      >
                        <SkipForward className="w-4 h-4" />
                      </button>
                    )}

                    {step.status === 'pending' && canModify && (
                      <button
                        onClick={() => handleDeleteStep(step.id)}
                        disabled={actionLoading === step.id}
                        className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg disabled:opacity-50"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
