import * as React from 'react';
import { Building2, FileText, TrendingUp, Receipt } from 'lucide-react';

interface VendorManagementLayoutProps {
  activeView: string;
  onViewChange: (view: string) => void;
  vendorId?: string;
  children: React.ReactNode;
}

export function VendorManagementLayout({ activeView, onViewChange, vendorId, children }: VendorManagementLayoutProps) {
  const tabs = vendorId
    ? [
        { id: 'vendor-details', label: 'Vendor Details', icon: Building2 },
        { id: 'vendor-contracts', label: 'Contracts', icon: FileText },
        { id: 'vendor-performance', label: 'Performance', icon: TrendingUp },
        { id: 'vendor-payments', label: 'Payment History', icon: Receipt },
      ]
    : [
        { id: 'vendors-list', label: 'Vendors', icon: Building2 },
        { id: 'vendors-contracts', label: 'All Contracts', icon: FileText },
        { id: 'vendors-performance', label: 'Performance Scores', icon: TrendingUp },
        { id: 'vendors-payments', label: 'Payment History', icon: Receipt },
      ];

  const normalizeActiveView = (view: string) => {
    if (view === 'list' || view === 'vendors' || view === 'vendors-list') return 'vendors-list';
    if (view === 'contracts' || view === 'vendors-contracts') return 'vendors-contracts';
    if (view === 'performance' || view === 'vendors-performance') return 'vendors-performance';
    if (view === 'payments' || view === 'vendors-payments') return 'vendors-payments';
    return view;
  };

  const normalizedActiveView = normalizeActiveView(activeView);

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="px-6 py-4">
          <nav className="flex space-x-4" aria-label="Tabs">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = normalizedActiveView === tab.id;

              return (
                <button
                  key={tab.id}
                  onClick={() => onViewChange(tab.id)}
                  className={`flex items-center space-x-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                    isActive
                      ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {children}
      </div>
    </div>
  );
}
