import { useState, useEffect } from 'react';
import {
  ClipboardList,
  Plus,
  Pencil,
  Search,
  Filter,
  ChevronDown,
  ChevronRight,
  Trash2,
  Copy,
  CheckCircle2,
  Settings,
  Target,
} from 'lucide-react';
import { QualityExecutionService, InspectionPlan, Characteristic, SamplingPlan } from '../../../services/QualityExecutionService';

type PlanType = 'INCOMING' | 'IN_PROCESS' | 'FINAL' | 'AUDIT';
type CharacteristicType = 'VARIABLE' | 'ATTRIBUTE';

const PLAN_TYPE_OPTIONS: { value: PlanType; label: string; description: string }[] = [
  { value: 'INCOMING', label: 'Incoming', description: 'Incoming material inspection' },
  { value: 'IN_PROCESS', label: 'In-Process', description: 'During production' },
  { value: 'FINAL', label: 'Final', description: 'Final product inspection' },
  { value: 'AUDIT', label: 'Audit', description: 'Quality audit' },
];

const CHARACTERISTIC_TYPE_OPTIONS: { value: CharacteristicType; label: string; description: string }[] = [
  { value: 'VARIABLE', label: 'Variable', description: 'Numeric measurement with spec limits' },
  { value: 'ATTRIBUTE', label: 'Attribute', description: 'Pass/Fail or Go/No-Go' },
];

interface CharacteristicFormData {
  id?: string;
  name: string;
  characteristic_type: CharacteristicType;
  sequence: number;
  uom: string;
  nominal: string;
  lsl: string;
  usl: string;
  is_critical: boolean;
  instructions: string;
}

export function InspectionPlansView() {
  const [plans, setPlans] = useState<InspectionPlan[]>([]);
  const [samplingPlans, setSamplingPlans] = useState<SamplingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<PlanType | 'all'>('all');
  const [expandedPlans, setExpandedPlans] = useState<Set<string>>(new Set());
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<InspectionPlan | null>(null);
  const [planCharacteristics, setPlanCharacteristics] = useState<Characteristic[]>([]);

  // Plan form state
  const [planFormData, setPlanFormData] = useState({
    name: '',
    plan_type: 'IN_PROCESS' as PlanType,
    version: '1.0',
    part_id: '',
    operation_id: '',
    work_center_id: '',
    sampling_plan_id: '',
    is_active: true,
  });

  // Characteristic modal state
  const [showCharModal, setShowCharModal] = useState(false);
  const [editingChar, setEditingChar] = useState<Characteristic | null>(null);
  const [charFormData, setCharFormData] = useState<CharacteristicFormData>({
    name: '',
    characteristic_type: 'VARIABLE',
    sequence: 1,
    uom: '',
    nominal: '',
    lsl: '',
    usl: '',
    is_critical: false,
    instructions: '',
  });

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [plansData, samplingData] = await Promise.all([
        QualityExecutionService.getInspectionPlans(),
        QualityExecutionService.getSamplingPlans(),
      ]);
      setPlans(plansData);
      setSamplingPlans(samplingData);
    } catch (error) {
      console.error('Error loading plans:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPlanCharacteristics = async (planId: string) => {
    try {
      const chars = await QualityExecutionService.getCharacteristics(planId);
      setPlanCharacteristics(chars);
    } catch (error) {
      console.error('Error loading characteristics:', error);
    }
  };

  const togglePlanExpanded = async (planId: string) => {
    const newExpanded = new Set(expandedPlans);
    if (newExpanded.has(planId)) {
      newExpanded.delete(planId);
    } else {
      newExpanded.add(planId);
      // Load characteristics for this plan
      await loadPlanCharacteristics(planId);
    }
    setExpandedPlans(newExpanded);
  };

  const handleAddPlan = () => {
    setEditingPlan(null);
    setPlanFormData({
      name: '',
      plan_type: 'IN_PROCESS',
      version: '1.0',
      part_id: '',
      operation_id: '',
      work_center_id: '',
      sampling_plan_id: '',
      is_active: true,
    });
    setShowPlanModal(true);
  };

  const handleEditPlan = (plan: InspectionPlan) => {
    setEditingPlan(plan);
    setPlanFormData({
      name: plan.name,
      plan_type: plan.plan_type as PlanType,
      version: plan.version || '1.0',
      part_id: plan.part_id || '',
      operation_id: plan.operation_id || '',
      work_center_id: plan.work_center_id || '',
      sampling_plan_id: plan.sampling_plan_id || '',
      is_active: plan.is_active,
    });
    setShowPlanModal(true);
  };

  const handleSavePlan = async () => {
    if (!planFormData.name.trim()) {
      alert('Plan name is required');
      return;
    }

    setSaving(true);
    try {
      const data = {
        ...planFormData,
        part_id: planFormData.part_id || null,
        operation_id: planFormData.operation_id || null,
        work_center_id: planFormData.work_center_id || null,
        sampling_plan_id: planFormData.sampling_plan_id || null,
      };

      if (editingPlan) {
        await QualityExecutionService.updateInspectionPlan(editingPlan.id, data);
      } else {
        await QualityExecutionService.createInspectionPlan(data);
      }
      setShowPlanModal(false);
      loadData();
    } catch (error) {
      console.error('Error saving plan:', error);
      alert('Error saving inspection plan');
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicatePlan = async (plan: InspectionPlan) => {
    const newName = `${plan.name} (Copy)`;
    try {
      const newPlan = await QualityExecutionService.createInspectionPlan({
        name: newName,
        plan_type: plan.plan_type,
        version: '1.0',
        part_id: plan.part_id,
        operation_id: plan.operation_id,
        work_center_id: plan.work_center_id,
        sampling_plan_id: plan.sampling_plan_id,
        is_active: false, // Start inactive
      });

      // Copy characteristics
      const chars = await QualityExecutionService.getCharacteristics(plan.id);
      for (const char of chars) {
        await QualityExecutionService.createCharacteristic(newPlan.id, {
          name: char.name,
          characteristic_type: char.characteristic_type,
          sequence: char.sequence,
          uom: char.uom,
          nominal: char.nominal,
          lsl: char.lsl,
          usl: char.usl,
          is_critical: char.is_critical,
          instructions: char.instructions,
        });
      }

      loadData();
    } catch (error) {
      console.error('Error duplicating plan:', error);
      alert('Error duplicating plan');
    }
  };

  const handleAddCharacteristic = (planId: string) => {
    setEditingChar(null);
    const maxSeq = planCharacteristics.reduce((max, c) => Math.max(max, c.sequence || 0), 0);
    setCharFormData({
      name: '',
      characteristic_type: 'VARIABLE',
      sequence: maxSeq + 1,
      uom: '',
      nominal: '',
      lsl: '',
      usl: '',
      is_critical: false,
      instructions: '',
    });
    setShowCharModal(true);
  };

  const handleEditCharacteristic = (char: Characteristic) => {
    setEditingChar(char);
    setCharFormData({
      id: char.id,
      name: char.name,
      characteristic_type: char.characteristic_type as CharacteristicType,
      sequence: char.sequence || 1,
      uom: char.uom || '',
      nominal: char.nominal?.toString() || '',
      lsl: char.lsl?.toString() || '',
      usl: char.usl?.toString() || '',
      is_critical: char.is_critical,
      instructions: char.instructions || '',
    });
    setShowCharModal(true);
  };

  const handleSaveCharacteristic = async () => {
    if (!charFormData.name.trim()) {
      alert('Characteristic name is required');
      return;
    }

    const planId = editingPlan?.id || [...expandedPlans][0];
    if (!planId) {
      alert('No plan selected');
      return;
    }

    setSaving(true);
    try {
      const data = {
        name: charFormData.name,
        characteristic_type: charFormData.characteristic_type,
        sequence: charFormData.sequence,
        uom: charFormData.uom || null,
        nominal: charFormData.nominal ? parseFloat(charFormData.nominal) : null,
        lsl: charFormData.lsl ? parseFloat(charFormData.lsl) : null,
        usl: charFormData.usl ? parseFloat(charFormData.usl) : null,
        is_critical: charFormData.is_critical,
        instructions: charFormData.instructions || null,
      };

      if (editingChar) {
        await QualityExecutionService.updateCharacteristic(editingChar.id, data);
      } else {
        await QualityExecutionService.createCharacteristic(planId, data);
      }
      setShowCharModal(false);
      await loadPlanCharacteristics(planId);
    } catch (error) {
      console.error('Error saving characteristic:', error);
      alert('Error saving characteristic');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCharacteristic = async (charId: string, planId: string) => {
    if (!confirm('Are you sure you want to delete this characteristic?')) return;

    try {
      await QualityExecutionService.deleteCharacteristic(charId);
      await loadPlanCharacteristics(planId);
    } catch (error) {
      console.error('Error deleting characteristic:', error);
      alert('Error deleting characteristic');
    }
  };

  // Filter plans
  const filteredPlans = plans.filter(plan => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (!plan.name.toLowerCase().includes(query)) {
        return false;
      }
    }
    if (typeFilter !== 'all' && plan.plan_type !== typeFilter) {
      return false;
    }
    return true;
  });

  const getPlanTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      INCOMING: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
      IN_PROCESS: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
      FINAL: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
      AUDIT: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
    };
    return colors[type] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <ClipboardList className="w-8 h-8 text-blue-600 dark:text-blue-400" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Inspection Plans</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Configure inspection plans and quality characteristics
            </p>
          </div>
        </div>
        <button
          onClick={handleAddPlan}
          className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" />
          <span>Add Plan</span>
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
              placeholder="Search plans..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as PlanType | 'all')}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            <option value="all">All Types</option>
            {PLAN_TYPE_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Plans List */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : filteredPlans.length === 0 ? (
        <div className="card p-12 text-center text-gray-500">
          <ClipboardList className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No inspection plans found</p>
          <button
            onClick={handleAddPlan}
            className="mt-4 text-blue-600 hover:text-blue-700"
          >
            Create your first inspection plan
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredPlans.map((plan) => (
            <div key={plan.id} className="card overflow-hidden">
              {/* Plan Header */}
              <div
                className={`px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 ${
                  !plan.is_active ? 'opacity-50' : ''
                }`}
                onClick={() => togglePlanExpanded(plan.id)}
              >
                <div className="flex items-center space-x-3">
                  {expandedPlans.has(plan.id) ? (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  )}
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-medium text-gray-900 dark:text-white">{plan.name}</span>
                      <span className="text-xs text-gray-400">v{plan.version}</span>
                      {!plan.is_active && (
                        <span className="text-xs text-gray-500">(Inactive)</span>
                      )}
                    </div>
                    <div className="flex items-center space-x-2 text-sm text-gray-500">
                      <span className={`px-2 py-0.5 text-xs rounded-full ${getPlanTypeBadge(plan.plan_type)}`}>
                        {plan.plan_type.replace('_', ' ')}
                      </span>
                      {plan.sampling_plan && (
                        <span>Sampling: {plan.sampling_plan.name}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-2" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => handleDuplicatePlan(plan)}
                    className="p-2 text-gray-400 hover:text-blue-600"
                    title="Duplicate"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleEditPlan(plan)}
                    className="p-2 text-gray-400 hover:text-blue-600"
                    title="Edit Plan"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Expanded Characteristics */}
              {expandedPlans.has(plan.id) && (
                <div className="border-t border-gray-200 dark:border-gray-700">
                  <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800/50 flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                      Characteristics ({planCharacteristics.filter(c => c.plan_id === plan.id).length || 0})
                    </span>
                    <button
                      onClick={() => handleAddCharacteristic(plan.id)}
                      className="text-sm text-blue-600 hover:text-blue-700 flex items-center space-x-1"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Add</span>
                    </button>
                  </div>
                  {planCharacteristics.length === 0 ? (
                    <div className="p-6 text-center text-gray-500 text-sm">
                      No characteristics defined. Add characteristics to this plan.
                    </div>
                  ) : (
                    <table className="w-full">
                      <thead className="text-xs text-gray-500 uppercase bg-gray-50 dark:bg-gray-800/30">
                        <tr>
                          <th className="px-4 py-2 text-left">#</th>
                          <th className="px-4 py-2 text-left">Name</th>
                          <th className="px-4 py-2 text-left">Type</th>
                          <th className="px-4 py-2 text-left">Specs</th>
                          <th className="px-4 py-2 text-center">Critical</th>
                          <th className="px-4 py-2 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {planCharacteristics.map((char) => (
                          <tr key={char.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                            <td className="px-4 py-2 text-sm text-gray-500">
                              {char.sequence}
                            </td>
                            <td className="px-4 py-2">
                              <div>
                                <p className="font-medium text-gray-900 dark:text-white text-sm">
                                  {char.name}
                                </p>
                                {char.instructions && (
                                  <p className="text-xs text-gray-500 truncate max-w-xs">
                                    {char.instructions}
                                  </p>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-2">
                              <span className={`text-xs px-2 py-1 rounded ${
                                char.characteristic_type === 'VARIABLE'
                                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                                  : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                              }`}>
                                {char.characteristic_type}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-sm">
                              {char.characteristic_type === 'VARIABLE' && (
                                <div className="text-gray-600 dark:text-gray-400">
                                  {char.lsl !== null && <span>LSL: {char.lsl}</span>}
                                  {char.nominal !== null && <span className="mx-2">Nom: {char.nominal}</span>}
                                  {char.usl !== null && <span>USL: {char.usl}</span>}
                                  {char.uom && <span className="ml-1 text-gray-400">({char.uom})</span>}
                                </div>
                              )}
                              {char.characteristic_type === 'ATTRIBUTE' && (
                                <span className="text-gray-500">Pass/Fail</span>
                              )}
                            </td>
                            <td className="px-4 py-2 text-center">
                              {char.is_critical && (
                                <Target className="w-4 h-4 text-red-500 inline" />
                              )}
                            </td>
                            <td className="px-4 py-2 text-right">
                              <button
                                onClick={() => handleEditCharacteristic(char)}
                                className="p-1 text-gray-400 hover:text-blue-600"
                                title="Edit"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteCharacteristic(char.id, plan.id)}
                                className="p-1 text-gray-400 hover:text-red-600 ml-1"
                                title="Delete"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Plan Modal */}
      {showPlanModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg mx-4">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {editingPlan ? 'Edit Inspection Plan' : 'Create Inspection Plan'}
              </h2>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Plan Name *
                </label>
                <input
                  type="text"
                  value={planFormData.name}
                  onChange={(e) => setPlanFormData({ ...planFormData, name: e.target.value })}
                  placeholder="e.g., Final Assembly Inspection"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Plan Type *
                  </label>
                  <select
                    value={planFormData.plan_type}
                    onChange={(e) => setPlanFormData({ ...planFormData, plan_type: e.target.value as PlanType })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  >
                    {PLAN_TYPE_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Version
                  </label>
                  <input
                    type="text"
                    value={planFormData.version}
                    onChange={(e) => setPlanFormData({ ...planFormData, version: e.target.value })}
                    placeholder="1.0"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Sampling Plan
                </label>
                <select
                  value={planFormData.sampling_plan_id}
                  onChange={(e) => setPlanFormData({ ...planFormData, sampling_plan_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                >
                  <option value="">None (100% Inspection)</option>
                  {samplingPlans.map(sp => (
                    <option key={sp.id} value={sp.id}>{sp.name} - {sp.method}</option>
                  ))}
                </select>
              </div>

              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={planFormData.is_active}
                  onChange={(e) => setPlanFormData({ ...planFormData, is_active: e.target.checked })}
                  className="rounded border-gray-300"
                />
                <span className="text-sm text-gray-600 dark:text-gray-400">Active</span>
              </label>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end space-x-3">
              <button
                onClick={() => setShowPlanModal(false)}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleSavePlan}
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Plan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Characteristic Modal */}
      {showCharModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg mx-4">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {editingChar ? 'Edit Characteristic' : 'Add Characteristic'}
              </h2>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Name *
                  </label>
                  <input
                    type="text"
                    value={charFormData.name}
                    onChange={(e) => setCharFormData({ ...charFormData, name: e.target.value })}
                    placeholder="e.g., Overall Length"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Sequence
                  </label>
                  <input
                    type="number"
                    value={charFormData.sequence}
                    onChange={(e) => setCharFormData({ ...charFormData, sequence: parseInt(e.target.value) || 1 })}
                    min={1}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Type *
                  </label>
                  <select
                    value={charFormData.characteristic_type}
                    onChange={(e) => setCharFormData({ ...charFormData, characteristic_type: e.target.value as CharacteristicType })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  >
                    {CHARACTERISTIC_TYPE_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Unit of Measure
                  </label>
                  <input
                    type="text"
                    value={charFormData.uom}
                    onChange={(e) => setCharFormData({ ...charFormData, uom: e.target.value })}
                    placeholder="e.g., mm, in, psi"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              {charFormData.characteristic_type === 'VARIABLE' && (
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <label className="block text-sm font-medium text-blue-700 dark:text-blue-300 mb-2">
                    Specification Limits
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">LSL (Lower)</label>
                      <input
                        type="number"
                        value={charFormData.lsl}
                        onChange={(e) => setCharFormData({ ...charFormData, lsl: e.target.value })}
                        placeholder="Min"
                        step="any"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Nominal</label>
                      <input
                        type="number"
                        value={charFormData.nominal}
                        onChange={(e) => setCharFormData({ ...charFormData, nominal: e.target.value })}
                        placeholder="Target"
                        step="any"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">USL (Upper)</label>
                      <input
                        type="number"
                        value={charFormData.usl}
                        onChange={(e) => setCharFormData({ ...charFormData, usl: e.target.value })}
                        placeholder="Max"
                        step="any"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Instructions
                </label>
                <textarea
                  value={charFormData.instructions}
                  onChange={(e) => setCharFormData({ ...charFormData, instructions: e.target.value })}
                  placeholder="How to measure this characteristic..."
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                />
              </div>

              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={charFormData.is_critical}
                  onChange={(e) => setCharFormData({ ...charFormData, is_critical: e.target.checked })}
                  className="rounded border-gray-300"
                />
                <span className="text-sm text-gray-600 dark:text-gray-400">Critical Characteristic (CTQ)</span>
              </label>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end space-x-3">
              <button
                onClick={() => setShowCharModal(false)}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCharacteristic}
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
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
