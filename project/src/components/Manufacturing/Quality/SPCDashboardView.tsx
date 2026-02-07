import { useState, useEffect } from 'react';
import {
  LineChart,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Target,
  Activity,
  BarChart3,
  RefreshCw,
  Filter,
  ChevronDown,
} from 'lucide-react';
import { SPCService, ControlChartData, SPCRuleViolation, ProcessCapability } from '../../../services/SPCService';
import { QualityExecutionService, InspectionPlan, Characteristic } from '../../../services/QualityExecutionService';

export function SPCDashboardView() {
  const [plans, setPlans] = useState<InspectionPlan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [selectedChar, setSelectedChar] = useState<string | null>(null);
  const [chartData, setChartData] = useState<ControlChartData | null>(null);
  const [violations, setViolations] = useState<SPCRuleViolation[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(false);

  useEffect(() => {
    loadPlans();
    loadViolations();
  }, []);

  useEffect(() => {
    if (selectedChar) {
      loadChartData(selectedChar);
    }
  }, [selectedChar]);

  const loadPlans = async () => {
    try {
      const data = await QualityExecutionService.getInspectionPlans({ activeOnly: true });
      setPlans(data);
      setLoading(false);
    } catch (error) {
      console.error('Error loading plans:', error);
      setLoading(false);
    }
  };

  const loadViolations = async () => {
    try {
      const data = await SPCService.getViolations({ acknowledged: false });
      setViolations(data);
    } catch (error) {
      console.error('Error loading violations:', error);
    }
  };

  const loadChartData = async (characteristicId: string) => {
    setChartLoading(true);
    try {
      const data = await SPCService.getControlChartData(characteristicId, {
        minSubgroups: 5, // Lower threshold for demo
      });
      setChartData(data);
    } catch (error) {
      console.error('Error loading chart data:', error);
    } finally {
      setChartLoading(false);
    }
  };

  const handleAcknowledgeViolation = async (violationId: string) => {
    try {
      await SPCService.acknowledgeViolation(violationId, 'user-id', 'Acknowledged');
      loadViolations();
    } catch (error) {
      console.error('Error acknowledging violation:', error);
    }
  };

  const selectedPlanData = plans.find(p => p.id === selectedPlan);
  const variableChars = selectedPlanData?.characteristics?.filter(
    c => c.char_type === 'VARIABLE' && c.is_active
  ) || [];

  const getCapabilityColor = (value: number | undefined) => {
    if (value === undefined) return 'text-gray-500';
    if (value >= 1.33) return 'text-green-600';
    if (value >= 1.0) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getCapabilityStatus = (cpk: number | undefined) => {
    if (cpk === undefined) return 'N/A';
    if (cpk >= 1.67) return 'Excellent';
    if (cpk >= 1.33) return 'Good';
    if (cpk >= 1.0) return 'Marginal';
    return 'Poor';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center space-x-3">
        <LineChart className="w-8 h-8 text-blue-600 dark:text-blue-400" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">SPC Dashboard</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Statistical Process Control - Control Charts & Capability Analysis
          </p>
        </div>
      </div>

      {/* Violations Alert */}
      {violations.length > 0 && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <div className="flex items-center space-x-2 mb-2">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            <span className="font-medium text-red-800 dark:text-red-200">
              {violations.length} Unacknowledged Rule Violation(s)
            </span>
          </div>
          <div className="space-y-2">
            {violations.slice(0, 3).map((v) => (
              <div key={v.id} className="flex items-center justify-between text-sm">
                <span className="text-red-700 dark:text-red-300">
                  {v.violation_type.replace(/_/g, ' ')} - {new Date(v.detected_at).toLocaleString()}
                </span>
                <button
                  onClick={() => handleAcknowledgeViolation(v.id)}
                  className="text-red-600 hover:text-red-800 underline"
                >
                  Acknowledge
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Selection */}
      <div className="card p-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Inspection Plan
            </label>
            <select
              value={selectedPlan || ''}
              onChange={(e) => {
                setSelectedPlan(e.target.value || null);
                setSelectedChar(null);
                setChartData(null);
              }}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800"
            >
              <option value="">Select a plan...</option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Variable Characteristic
            </label>
            <select
              value={selectedChar || ''}
              onChange={(e) => setSelectedChar(e.target.value || null)}
              disabled={!selectedPlan || variableChars.length === 0}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 disabled:opacity-50"
            >
              <option value="">Select a characteristic...</option>
              {variableChars.map((char) => (
                <option key={char.id} value={char.id}>
                  {char.name} {char.uom ? `(${char.uom})` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Chart & Capability */}
      {chartLoading ? (
        <div className="card p-12 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : chartData ? (
        <div className="grid grid-cols-3 gap-6">
          {/* Control Chart */}
          <div className="col-span-2 card p-4">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4">
              Control Chart: {chartData.characteristic_name}
            </h3>

            {chartData.subgroups.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-gray-500">
                No data available. Record measurements to populate the chart.
              </div>
            ) : (
              <div className="space-y-4">
                {/* Control Limits Info */}
                <div className="flex items-center space-x-6 text-sm">
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-0.5 bg-red-500"></div>
                    <span className="text-gray-600 dark:text-gray-400">
                      UCL: {chartData.controlLimits.ucl.toFixed(4)}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-0.5 bg-green-500"></div>
                    <span className="text-gray-600 dark:text-gray-400">
                      CL: {chartData.controlLimits.centerLine.toFixed(4)}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-0.5 bg-red-500"></div>
                    <span className="text-gray-600 dark:text-gray-400">
                      LCL: {chartData.controlLimits.lcl.toFixed(4)}
                    </span>
                  </div>
                </div>

                {/* Simple Chart Visualization */}
                <div className="h-48 relative border border-gray-200 dark:border-gray-700 rounded">
                  {/* UCL/LCL/CL lines */}
                  <div className="absolute inset-x-0 top-[10%] border-t border-dashed border-red-400"></div>
                  <div className="absolute inset-x-0 top-1/2 border-t border-green-500"></div>
                  <div className="absolute inset-x-0 bottom-[10%] border-t border-dashed border-red-400"></div>

                  {/* Data points */}
                  <div className="absolute inset-0 flex items-end justify-around px-2 pb-4">
                    {chartData.subgroups.slice(-20).map((sg, idx) => {
                      const range = chartData.controlLimits.ucl - chartData.controlLimits.lcl;
                      const value = sg.mean || 0;
                      const pct = ((value - chartData.controlLimits.lcl) / range) * 80 + 10;
                      const isViolation = value > chartData.controlLimits.ucl || value < chartData.controlLimits.lcl;

                      return (
                        <div
                          key={sg.id}
                          className="relative group"
                          style={{ height: `${Math.max(5, Math.min(95, pct))}%` }}
                        >
                          <div
                            className={`w-2 h-2 rounded-full ${
                              isViolation ? 'bg-red-500' : 'bg-blue-500'
                            }`}
                          />
                          <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap">
                            {value.toFixed(4)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Data Table */}
                <div className="max-h-48 overflow-y-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left">Time</th>
                        <th className="px-3 py-2 text-right">n</th>
                        <th className="px-3 py-2 text-right">Mean</th>
                        <th className="px-3 py-2 text-right">Range</th>
                        <th className="px-3 py-2 text-right">Std Dev</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {chartData.subgroups.slice(-10).reverse().map((sg) => (
                        <tr key={sg.id}>
                          <td className="px-3 py-2">
                            {new Date(sg.subgroup_ts).toLocaleString()}
                          </td>
                          <td className="px-3 py-2 text-right">{sg.n}</td>
                          <td className="px-3 py-2 text-right font-mono">
                            {sg.mean?.toFixed(4) || '-'}
                          </td>
                          <td className="px-3 py-2 text-right font-mono">
                            {sg.range_value?.toFixed(4) || '-'}
                          </td>
                          <td className="px-3 py-2 text-right font-mono">
                            {sg.stddev?.toFixed(4) || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Capability Panel */}
          <div className="space-y-4">
            {/* Spec Limits */}
            <div className="card p-4">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                Specification Limits
              </h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">USL</span>
                  <span className="font-mono">
                    {chartData.controlLimits.usl?.toFixed(4) || 'Not Set'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Target</span>
                  <span className="font-mono">
                    {chartData.controlLimits.target?.toFixed(4) || 'Not Set'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">LSL</span>
                  <span className="font-mono">
                    {chartData.controlLimits.lsl?.toFixed(4) || 'Not Set'}
                  </span>
                </div>
              </div>
            </div>

            {/* Process Capability */}
            {chartData.capability && (
              <div className="card p-4">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Process Capability
                </h4>
                <div className="space-y-3">
                  <div className="text-center py-2 bg-gray-50 dark:bg-gray-900 rounded">
                    <p className="text-xs text-gray-500">Cpk</p>
                    <p className={`text-3xl font-bold ${getCapabilityColor(chartData.capability.cpk)}`}>
                      {chartData.capability.cpk?.toFixed(2) || 'N/A'}
                    </p>
                    <p className={`text-sm ${getCapabilityColor(chartData.capability.cpk)}`}>
                      {getCapabilityStatus(chartData.capability.cpk)}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="bg-gray-50 dark:bg-gray-900 p-2 rounded text-center">
                      <p className="text-xs text-gray-500">Cp</p>
                      <p className={`font-bold ${getCapabilityColor(chartData.capability.cp)}`}>
                        {chartData.capability.cp?.toFixed(2) || 'N/A'}
                      </p>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-900 p-2 rounded text-center">
                      <p className="text-xs text-gray-500">Sigma Level</p>
                      <p className="font-bold text-blue-600">
                        {chartData.capability.sigmaLevel?.toFixed(2) || 'N/A'}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Mean</span>
                      <span className="font-mono">{chartData.capability.mean.toFixed(4)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Std Dev</span>
                      <span className="font-mono">{chartData.capability.stddev.toFixed(4)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Sample Size</span>
                      <span className="font-mono">{chartData.capability.n}</span>
                    </div>
                    {chartData.capability.dpmo && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">DPMO</span>
                        <span className="font-mono">{Math.round(chartData.capability.dpmo)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Violations */}
            {chartData.violations.length > 0 && (
              <div className="card p-4 border-l-4 border-red-500">
                <h4 className="text-sm font-medium text-red-700 dark:text-red-400 mb-2">
                  Rule Violations ({chartData.violations.length})
                </h4>
                <div className="space-y-2 text-sm">
                  {chartData.violations.slice(0, 5).map((v) => (
                    <div key={v.id} className="text-red-600 dark:text-red-400">
                      {v.violation_type.replace(/_/g, ' ')}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : selectedChar ? (
        <div className="card p-12 text-center text-gray-500">
          <LineChart className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>Not enough data to generate control chart</p>
          <p className="text-sm mt-2">Record more measurements to see SPC analysis</p>
        </div>
      ) : (
        <div className="card p-12 text-center text-gray-500">
          <Target className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>Select a plan and characteristic to view SPC data</p>
        </div>
      )}

      {/* Capability Reference */}
      <div className="card p-4">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
          Capability Index Reference
        </h4>
        <div className="grid grid-cols-4 gap-4 text-sm">
          <div className="text-center p-2 bg-red-50 dark:bg-red-900/20 rounded">
            <p className="font-bold text-red-600">Cpk &lt; 1.0</p>
            <p className="text-gray-600 dark:text-gray-400">Poor</p>
          </div>
          <div className="text-center p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded">
            <p className="font-bold text-yellow-600">1.0 ≤ Cpk &lt; 1.33</p>
            <p className="text-gray-600 dark:text-gray-400">Marginal</p>
          </div>
          <div className="text-center p-2 bg-green-50 dark:bg-green-900/20 rounded">
            <p className="font-bold text-green-600">1.33 ≤ Cpk &lt; 1.67</p>
            <p className="text-gray-600 dark:text-gray-400">Good</p>
          </div>
          <div className="text-center p-2 bg-blue-50 dark:bg-blue-900/20 rounded">
            <p className="font-bold text-blue-600">Cpk ≥ 1.67</p>
            <p className="text-gray-600 dark:text-gray-400">Excellent</p>
          </div>
        </div>
      </div>
    </div>
  );
}
