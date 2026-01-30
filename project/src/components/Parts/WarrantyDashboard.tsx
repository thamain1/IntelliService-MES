import { useEffect, useState } from 'react';
import { Shield, AlertTriangle, CheckCircle, Clock, Search, Calendar, MapPin, Package, Plus, FileText, DollarSign } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { WarrantyService, type WarrantyClaimSummary } from '../../services/WarrantyService';
import { WarrantyClaimModal } from './WarrantyClaimModal';

type WarrantyRecord = {
  id: string;
  serial_number: string;
  part_name: string;
  part_number: string;
  warranty_status: 'ACTIVE' | 'EXPIRED' | 'EXPIRING_SOON' | 'MISSING_DATES';
  warranty_type: string;
  start_date: string;
  end_date: string;
  days_remaining: number;
  duration_months: number | null;
  vendor_name: string | null;
  warranty_provider: string | null;
  customer_name: string | null;
  location_name: string | null;
  equipment_type: string | null;
  stock_location_name: string | null;
  serialized_part_status: string;
};

type WarrantyStatus = 'active' | 'expired' | 'expiring_soon' | 'missing_dates';
type TabView = 'warranties' | 'claims';

export function WarrantyDashboard() {
  const [activeTab, setActiveTab] = useState<TabView>('warranties');
  const [warranties, setWarranties] = useState<WarrantyRecord[]>([]);
  const [claims, setClaims] = useState<WarrantyClaimSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [claimStatusFilter, setClaimStatusFilter] = useState<string>('all');

  // Modal state
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [selectedWarranty, setSelectedWarranty] = useState<WarrantyRecord | null>(null);
  const [selectedClaim, setSelectedClaim] = useState<WarrantyClaimSummary | null>(null);

  useEffect(() => {
    loadWarranties();
    loadClaims();
  }, []);

  const loadWarranties = async () => {
    try {
      const { data, error } = await supabase
        .from('vw_warranty_tracking')
        .select('*')
        .order('end_date', { ascending: true });

      if (error) throw error;
      setWarranties(data || []);
    } catch (error) {
      console.error('Error loading warranties:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadClaims = async () => {
    try {
      const data = await WarrantyService.getClaims();
      setClaims(data);
    } catch (error) {
      console.error('Error loading claims:', error);
    }
  };

  const handleFileClaim = (warranty: WarrantyRecord) => {
    setSelectedWarranty(warranty);
    setSelectedClaim(null);
    setShowClaimModal(true);
  };

  const handleEditClaim = (claim: WarrantyClaimSummary) => {
    setSelectedClaim(claim);
    setSelectedWarranty(null);
    setShowClaimModal(true);
  };

  const handleClaimSuccess = () => {
    loadClaims();
    setShowClaimModal(false);
    setSelectedWarranty(null);
    setSelectedClaim(null);
  };

  const getWarrantyStatus = (warranty: WarrantyRecord): WarrantyStatus => {
    return warranty.warranty_status.toLowerCase() as WarrantyStatus;
  };

  const getDaysRemaining = (warranty: WarrantyRecord) => {
    return warranty.days_remaining;
  };

  const filteredWarranties = warranties.filter((warranty) => {
    const matchesSearch =
      warranty.serial_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      warranty.part_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      warranty.part_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      warranty.customer_name?.toLowerCase().includes(searchTerm.toLowerCase());

    const status = getWarrantyStatus(warranty);
    const matchesStatus = statusFilter === 'all' || status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const filteredClaims = claims.filter((claim) => {
    const matchesSearch =
      claim.claim_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      claim.serial_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      claim.part_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      claim.provider_name?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = claimStatusFilter === 'all' || claim.status === claimStatusFilter;

    return matchesSearch && matchesStatus;
  });

  const statusCounts = {
    all: warranties.length,
    active: warranties.filter((w) => getWarrantyStatus(w) === 'active').length,
    expiring_soon: warranties.filter((w) => getWarrantyStatus(w) === 'expiring_soon').length,
    expired: warranties.filter((w) => getWarrantyStatus(w) === 'expired').length,
    missing_dates: warranties.filter((w) => getWarrantyStatus(w) === 'missing_dates').length,
  };

  const claimCounts = {
    all: claims.length,
    draft: claims.filter((c) => c.status === 'draft').length,
    submitted: claims.filter((c) => c.status === 'submitted').length,
    approved: claims.filter((c) => c.status === 'approved').length,
    completed: claims.filter((c) => c.status === 'completed').length,
  };

  const getStatusColor = (status: WarrantyStatus) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'expiring_soon':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'expired':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
      case 'missing_dates':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Warranty Management</h2>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Track warranties and manage claims
          </p>
        </div>
        <button
          onClick={() => {
            setSelectedWarranty(null);
            setSelectedClaim(null);
            setShowClaimModal(true);
          }}
          className="btn btn-primary flex items-center space-x-2"
        >
          <Plus className="w-5 h-5" />
          <span>New Claim</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="card p-1">
        <div className="flex space-x-1">
          <button
            onClick={() => setActiveTab('warranties')}
            className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors flex items-center justify-center space-x-2 ${
              activeTab === 'warranties'
                ? 'bg-blue-600 text-white'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <Shield className="w-4 h-4" />
            <span>Warranties ({warranties.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('claims')}
            className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors flex items-center justify-center space-x-2 ${
              activeTab === 'claims'
                ? 'bg-blue-600 text-white'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Claims ({claims.length})</span>
          </button>
        </div>
      </div>

      {activeTab === 'warranties' ? (
        <>
          {/* Warranty Stats */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              { id: 'all', label: 'All Warranties', count: statusCounts.all, icon: Shield },
              {
                id: 'active',
                label: 'Active',
                count: statusCounts.active,
                icon: CheckCircle,
                color: 'text-green-600 dark:text-green-400',
              },
              {
                id: 'expiring_soon',
                label: 'Expiring Soon',
                count: statusCounts.expiring_soon,
                icon: AlertTriangle,
                color: 'text-yellow-600 dark:text-yellow-400',
              },
              {
                id: 'expired',
                label: 'Expired',
                count: statusCounts.expired,
                icon: Clock,
                color: 'text-gray-600 dark:text-gray-400',
              },
              {
                id: 'missing_dates',
                label: 'Missing Dates',
                count: statusCounts.missing_dates,
                icon: AlertTriangle,
                color: 'text-orange-600 dark:text-orange-400',
              },
            ].map((stat) => {
              const Icon = stat.icon;
              return (
                <button
                  key={stat.id}
                  onClick={() => setStatusFilter(stat.id)}
                  className={`card p-4 text-left transition-all ${
                    statusFilter === stat.id
                      ? 'ring-2 ring-blue-500 dark:ring-blue-400'
                      : 'hover:shadow-md'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{stat.label}</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                        {stat.count}
                      </p>
                    </div>
                    <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                      <Icon className={`w-6 h-6 ${stat.color || 'text-blue-600 dark:text-blue-400'}`} />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Search & Table */}
          <div className="card">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by serial number, part name, customer..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="input pl-10"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Serial Number
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Part
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Location
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Provider
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      End Date
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Days Left
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                  {filteredWarranties.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-4 py-8 text-center text-gray-500 dark:text-gray-400"
                      >
                        {searchTerm || statusFilter !== 'all'
                          ? 'No warranties match your filters'
                          : 'No warranty records yet'}
                      </td>
                    </tr>
                  ) : (
                    filteredWarranties.map((warranty) => {
                      const status = getWarrantyStatus(warranty);
                      const daysRemaining = getDaysRemaining(warranty);
                      const isExpiringSoon = status === 'expiring_soon';
                      const canFileClaim = status === 'active' || status === 'expiring_soon';

                      return (
                        <tr
                          key={warranty.id}
                          className={`hover:bg-gray-50 dark:hover:bg-gray-800 ${
                            isExpiringSoon ? 'bg-yellow-50 dark:bg-yellow-900/10' : ''
                          }`}
                        >
                          <td className="px-4 py-3">
                            <span className="font-mono text-sm font-medium text-gray-900 dark:text-white">
                              {warranty.serial_number}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-gray-900 dark:text-white">
                              {warranty.part_name}
                            </div>
                            <div className="text-sm text-gray-500 dark:text-gray-400">
                              {warranty.part_number}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {warranty.customer_name ? (
                              <div>
                                <div className="flex items-center space-x-1 text-sm text-gray-900 dark:text-white">
                                  <MapPin className="w-3 h-3" />
                                  <span>{warranty.customer_name}</span>
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                  {warranty.location_name || 'No location'}
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center space-x-1 text-sm text-gray-600 dark:text-gray-400">
                                <Package className="w-3 h-3" />
                                <span>{warranty.stock_location_name || 'In stock'}</span>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(
                                status
                              )}`}
                            >
                              {status.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                            {warranty.warranty_provider || warranty.vendor_name || '-'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                            <div className="flex items-center space-x-1">
                              <Calendar className="w-4 h-4" />
                              <span>{new Date(warranty.end_date).toLocaleDateString()}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {status === 'active' || isExpiringSoon ? (
                              <div
                                className={`flex items-center space-x-1 ${
                                  isExpiringSoon
                                    ? 'text-yellow-600 dark:text-yellow-400 font-semibold'
                                    : 'text-gray-600 dark:text-gray-400'
                                }`}
                              >
                                <Clock className="w-4 h-4" />
                                <span>{daysRemaining} days</span>
                                {isExpiringSoon && <AlertTriangle className="w-4 h-4 ml-1" />}
                              </div>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {canFileClaim && (
                              <button
                                onClick={() => handleFileClaim(warranty)}
                                className="btn btn-sm btn-outline flex items-center space-x-1"
                              >
                                <FileText className="w-3 h-3" />
                                <span>File Claim</span>
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Warnings */}
          {statusCounts.expiring_soon > 0 && (
            <div className="card bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800">
              <div className="p-4 flex items-start space-x-3">
                <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-yellow-900 dark:text-yellow-100">
                    Warranties Expiring Soon
                  </h3>
                  <p className="text-sm text-yellow-800 dark:text-yellow-200 mt-1">
                    {statusCounts.expiring_soon} {statusCounts.expiring_soon === 1 ? 'warranty expires' : 'warranties expire'} within the next 30 days. Consider filing claims for any issues before expiration.
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          {/* Claims Stats */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              { id: 'all', label: 'All Claims', count: claimCounts.all },
              { id: 'draft', label: 'Draft', count: claimCounts.draft, color: 'text-gray-600' },
              { id: 'submitted', label: 'Submitted', count: claimCounts.submitted, color: 'text-blue-600' },
              { id: 'approved', label: 'Approved', count: claimCounts.approved, color: 'text-green-600' },
              { id: 'completed', label: 'Completed', count: claimCounts.completed, color: 'text-green-600' },
            ].map((stat) => (
              <button
                key={stat.id}
                onClick={() => setClaimStatusFilter(stat.id)}
                className={`card p-4 text-left transition-all ${
                  claimStatusFilter === stat.id
                    ? 'ring-2 ring-blue-500 dark:ring-blue-400'
                    : 'hover:shadow-md'
                }`}
              >
                <p className="text-sm text-gray-600 dark:text-gray-400">{stat.label}</p>
                <p className={`text-2xl font-bold mt-1 ${stat.color || 'text-gray-900 dark:text-white'}`}>
                  {stat.count}
                </p>
              </button>
            ))}
          </div>

          {/* Claims Table */}
          <div className="card">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search claims..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="input pl-10"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Claim #
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Item
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Provider
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                  {filteredClaims.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-4 py-8 text-center text-gray-500 dark:text-gray-400"
                      >
                        {searchTerm || claimStatusFilter !== 'all'
                          ? 'No claims match your filters'
                          : 'No warranty claims yet. File a claim from the Warranties tab.'}
                      </td>
                    </tr>
                  ) : (
                    filteredClaims.map((claim) => {
                      const statusDisplay = WarrantyService.getStatusDisplay(claim.status);
                      return (
                        <tr key={claim.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                          <td className="px-4 py-3">
                            <span className="font-mono text-sm font-medium text-gray-900 dark:text-white">
                              {claim.claim_number}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-sm text-gray-900 dark:text-white">
                              {claim.item_description || '-'}
                            </div>
                            {claim.customer_name && (
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                {claim.customer_name}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                            {WarrantyService.getClaimTypeDisplay(claim.claim_type)}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                            {claim.provider_name}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`badge ${statusDisplay.color}`}>
                              {statusDisplay.label}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {claim.claim_amount ? (
                              <div className="text-sm">
                                <div className="text-gray-900 dark:text-white">
                                  ${claim.claim_amount.toFixed(2)}
                                </div>
                                {claim.approved_amount && (
                                  <div className="text-xs text-green-600 dark:text-green-400">
                                    Approved: ${claim.approved_amount.toFixed(2)}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                            {new Date(claim.created_at).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => handleEditClaim(claim)}
                              className="btn btn-sm btn-outline"
                            >
                              {claim.status === 'draft' ? 'Edit' : 'View'}
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Claim Modal */}
      {showClaimModal && (
        <WarrantyClaimModal
          onClose={() => {
            setShowClaimModal(false);
            setSelectedWarranty(null);
            setSelectedClaim(null);
          }}
          onSuccess={handleClaimSuccess}
          warrantyRecord={selectedWarranty ? {
            id: selectedWarranty.id,
            serial_number: selectedWarranty.serial_number,
            part_name: selectedWarranty.part_name,
            warranty_provider: selectedWarranty.warranty_provider,
            vendor_name: selectedWarranty.vendor_name,
          } : undefined}
          existingClaim={selectedClaim || undefined}
        />
      )}
    </div>
  );
}
