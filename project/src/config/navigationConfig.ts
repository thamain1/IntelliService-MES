import {
  LayoutDashboard,
  Ticket,
  ClipboardList,
  Calendar,
  MapPin as _MapPin,
  Map,
  Clock,
  Package,
  ShoppingCart,
  ArrowLeftRight,
  FileCheck,
  Wrench,
  Settings as SettingsIcon,
  Shield,
  FolderKanban,
  BarChart2,
  DollarSign,
  Users,
  Building2,
  FileText,
  TrendingUp,
  Receipt,
  Calculator,
  Wallet,
  AlertTriangle,
  LineChart,
  PieChart,
  Settings,
  UserCog,
  Bell,
  PackageCheck,
  Upload,
  HelpCircle,
  LucideIcon,
  Target,
  MessageSquare,
  UserPlus,
  Kanban,
  Activity,
  BarChart3,
  Factory,
  Layers,
  Truck,
  Tag,
  Gauge,
  ClipboardCheck,
  XCircle,
} from 'lucide-react';

export interface NavigationItem {
  id: string;
  label: string;
  icon: LucideIcon;
  roles: string[];
  children?: NavigationItem[];
  badge?: string;
}

export interface NavigationGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  roles: string[];
  children: NavigationItem[];
}

// Role shorthand arrays for readability
const ADMIN_ONLY = ['admin'];
const ADMIN_OPS = ['admin', 'dispatcher', 'office_manager', 'supervisor', 'lead_tech'];
const ALL_FIELD = ['admin', 'dispatcher', 'office_manager', 'supervisor', 'lead_tech', 'technician'];
const FINANCE_ROLES = ['admin', 'dispatcher', 'office_manager', 'supervisor', 'lead_tech', 'accounting'];
const PARTS_ROLES = ['admin', 'dispatcher', 'office_manager', 'supervisor', 'lead_tech', 'material_handler'];
const PARTS_ALL = ['admin', 'dispatcher', 'office_manager', 'supervisor', 'lead_tech', 'technician', 'material_handler'];
const ALL_ROLES = ['admin', 'dispatcher', 'office_manager', 'supervisor', 'lead_tech', 'technician', 'accounting', 'material_handler'];

export const navigationConfig: NavigationGroup[] = [
  {
    id: 'field-ops',
    label: 'Field Operations',
    icon: Wrench,
    roles: ALL_FIELD,
    children: [
      {
        id: 'dashboard',
        label: 'Dashboard',
        icon: LayoutDashboard,
        roles: ALL_FIELD,
      },
      {
        id: 'tickets',
        label: 'Tickets',
        icon: Ticket,
        roles: ALL_FIELD,
      },
      {
        id: 'estimates',
        label: 'Estimates',
        icon: ClipboardList,
        roles: ALL_FIELD,
      },
      {
        id: 'dispatch',
        label: 'Dispatch',
        icon: Calendar,
        roles: ADMIN_OPS,
      },
      {
        id: 'dispatch-map',
        label: 'Dispatch Map',
        icon: Map,
        roles: ADMIN_OPS,
      },
      {
        id: 'timeclock',
        label: 'Time Clock',
        icon: Clock,
        roles: ALL_FIELD,
      },
    ],
  },
  {
    id: 'service-assets',
    label: 'Service Assets',
    icon: Package,
    roles: PARTS_ALL,
    children: [
      {
        id: 'parts',
        label: 'Parts',
        icon: Package,
        roles: PARTS_ALL,
        children: [
          {
            id: 'parts-requests',
            label: 'Parts Requests',
            icon: ClipboardList,
            roles: PARTS_ROLES,
          },
          {
            id: 'parts-inventory',
            label: 'Stock Levels',
            icon: Package,
            roles: PARTS_ALL,
          },
          {
            id: 'parts-purchase-orders',
            label: 'Purchase Orders',
            icon: ShoppingCart,
            roles: PARTS_ROLES,
          },
          {
            id: 'parts-transfers',
            label: 'Transfers',
            icon: ArrowLeftRight,
            roles: PARTS_ROLES,
          },
          {
            id: 'parts-receiving',
            label: 'Receiving',
            icon: PackageCheck,
            roles: PARTS_ROLES,
          },
          {
            id: 'parts-pickup',
            label: 'Parts Pickup',
            icon: PackageCheck,
            roles: PARTS_ALL,
          },
        ],
      },
      {
        id: 'tools',
        label: 'Tools',
        icon: Wrench,
        roles: PARTS_ALL,
        children: [
          {
            id: 'tools-inventory',
            label: 'Stock Levels',
            icon: Wrench,
            roles: PARTS_ALL,
          },
          {
            id: 'tools-purchase-orders',
            label: 'Purchase Orders',
            icon: ShoppingCart,
            roles: PARTS_ROLES,
          },
          {
            id: 'tools-transfers',
            label: 'Transfers',
            icon: ArrowLeftRight,
            roles: PARTS_ROLES,
          },
          {
            id: 'tools-receiving',
            label: 'Receiving',
            icon: PackageCheck,
            roles: PARTS_ROLES,
          },
        ],
      },
      {
        id: 'equipment',
        label: 'Equipment',
        icon: Wrench,
        roles: ALL_FIELD,
        children: [
          {
            id: 'equipment-installed',
            label: 'Installed Equipment',
            icon: SettingsIcon,
            roles: ALL_FIELD,
          },
          {
            id: 'equipment-parts',
            label: 'Installed Parts',
            icon: Package,
            roles: ALL_FIELD,
          },
          {
            id: 'equipment-warranty',
            label: 'Warranty Tracking',
            icon: Shield,
            roles: ADMIN_OPS,
          },
        ],
      },
    ],
  },
  {
    id: 'projects',
    label: 'Projects',
    icon: FolderKanban,
    roles: ADMIN_OPS,
    children: [
      {
        id: 'projects',
        label: 'Project Overview',
        icon: FolderKanban,
        roles: ADMIN_OPS,
      },
    ],
  },
  // MES-specific: Production & Quality sections (untouched)
  {
    id: 'production',
    label: 'Production',
    icon: Factory,
    roles: ['admin', 'dispatcher', 'operator', 'supervisor', 'material_handler'],
    children: [
      {
        id: 'production-dashboard',
        label: 'Production Dashboard',
        icon: Factory,
        roles: ['admin', 'dispatcher', 'supervisor'],
      },
      {
        id: 'production-work-orders',
        label: 'Work Orders',
        icon: ClipboardList,
        roles: ['admin', 'dispatcher', 'operator', 'supervisor'],
      },
      {
        id: 'production-scheduling',
        label: 'Production Scheduling',
        icon: Calendar,
        roles: ['admin', 'dispatcher', 'supervisor'],
      },
      {
        id: 'production-oee',
        label: 'OEE Dashboard',
        icon: Gauge,
        roles: ['admin', 'dispatcher', 'supervisor'],
      },
      {
        id: 'production-downtime',
        label: 'Downtime Log',
        icon: AlertTriangle,
        roles: ['admin', 'dispatcher', 'operator', 'supervisor'],
      },
      {
        id: 'production-work-centers',
        label: 'Work Centers',
        icon: Layers,
        roles: ['admin', 'dispatcher'],
      },
      {
        id: 'production-material-moves',
        label: 'Material Moves',
        icon: Truck,
        roles: ['admin', 'dispatcher', 'material_handler'],
      },
      {
        id: 'production-reason-codes',
        label: 'Reason Codes',
        icon: Tag,
        roles: ['admin'],
      },
    ],
  },
  {
    id: 'quality',
    label: 'Quality',
    icon: ClipboardCheck,
    roles: ['admin', 'dispatcher', 'operator', 'supervisor', 'quality_inspector'],
    children: [
      {
        id: 'quality-inspection-workbench',
        label: 'Inspection Workbench',
        icon: ClipboardCheck,
        roles: ['admin', 'dispatcher', 'operator', 'supervisor', 'quality_inspector'],
      },
      {
        id: 'quality-nonconformances',
        label: 'Nonconformances',
        icon: XCircle,
        roles: ['admin', 'dispatcher', 'supervisor', 'quality_inspector'],
      },
      {
        id: 'quality-spc',
        label: 'SPC Dashboard',
        icon: LineChart,
        roles: ['admin', 'dispatcher', 'supervisor', 'quality_inspector'],
      },
      {
        id: 'quality-inspection-plans',
        label: 'Inspection Plans',
        icon: ClipboardList,
        roles: ['admin'],
      },
      {
        id: 'quality-defect-codes',
        label: 'Defect Codes',
        icon: AlertTriangle,
        roles: ['admin'],
      },
    ],
  },
  {
    id: 'customers',
    label: 'Customers',
    icon: Users,
    roles: ALL_FIELD,
    children: [
      {
        id: 'customers',
        label: 'Customer Profiles',
        icon: Users,
        roles: ALL_FIELD,
      },
      {
        id: 'service-contracts',
        label: 'Service Contracts',
        icon: FileText,
        roles: [...ADMIN_OPS, 'accounting'],
      },
    ],
  },
  {
    id: 'crm',
    label: 'CRM & Sales',
    icon: Target,
    roles: ADMIN_OPS,
    children: [
      {
        id: 'crm-pipeline',
        label: 'Sales Pipeline',
        icon: Kanban,
        roles: ADMIN_OPS,
      },
      {
        id: 'crm-leads',
        label: 'Leads Inbox',
        icon: UserPlus,
        roles: ADMIN_OPS,
      },
      {
        id: 'crm-opportunities',
        label: 'Sales Opportunities',
        icon: Target,
        roles: ADMIN_OPS,
      },
      {
        id: 'crm-interactions',
        label: 'Interactions',
        icon: MessageSquare,
        roles: ADMIN_OPS,
      },
      {
        id: 'crm-analytics',
        label: 'Analytics',
        icon: BarChart3,
        roles: ADMIN_OPS,
        children: [
          {
            id: 'crm-analytics-pareto',
            label: 'Problem Analysis',
            icon: PieChart,
            roles: ADMIN_OPS,
          },
          {
            id: 'crm-analytics-callbacks',
            label: 'Callback Analysis',
            icon: Activity,
            roles: ADMIN_OPS,
          },
          {
            id: 'crm-analytics-equipment',
            label: 'Equipment Reliability',
            icon: Wrench,
            roles: ADMIN_OPS,
          },
          {
            id: 'crm-analytics-tech-quality',
            label: 'Tech Quality',
            icon: Users,
            roles: ADMIN_OPS,
          },
        ],
      },
    ],
  },
  {
    id: 'finance',
    label: 'Finance',
    icon: DollarSign,
    roles: FINANCE_ROLES,
    children: [
      {
        id: 'invoicing',
        label: 'Invoicing',
        icon: Receipt,
        roles: FINANCE_ROLES,
      },
      {
        id: 'accounting',
        label: 'Accounting',
        icon: Calculator,
        roles: FINANCE_ROLES,
        children: [
          {
            id: 'accounting-ledger',
            label: 'General Ledger',
            icon: FileText,
            roles: FINANCE_ROLES,
          },
          {
            id: 'accounting-ar-ap',
            label: 'AR / AP',
            icon: Wallet,
            roles: FINANCE_ROLES,
          },
          {
            id: 'accounting-chart',
            label: 'Chart of Accounts',
            icon: BarChart2,
            roles: FINANCE_ROLES,
          },
          {
            id: 'accounting-reconciliation',
            label: 'Reconciliations',
            icon: FileCheck,
            roles: FINANCE_ROLES,
          },
        ],
      },
      {
        id: 'payroll',
        label: 'Payroll',
        icon: Wallet,
        roles: ['admin', 'office_manager'],
        children: [
          {
            id: 'payroll-runs',
            label: 'Payroll Runs',
            icon: Calculator,
            roles: ['admin', 'office_manager'],
          },
          {
            id: 'payroll-time-cost',
            label: 'Time Cost Reports',
            icon: Clock,
            roles: ['admin', 'office_manager'],
          },
          {
            id: 'payroll-stubs',
            label: 'Pay Stubs',
            icon: FileText,
            roles: ['admin', 'office_manager'],
          },
        ],
      },
    ],
  },
  {
    id: 'procurement',
    label: 'Procurement',
    icon: Building2,
    roles: [...ADMIN_OPS, 'accounting', 'material_handler'],
    children: [
      {
        id: 'vendors',
        label: 'Vendors',
        icon: Building2,
        roles: [...ADMIN_OPS, 'accounting', 'material_handler'],
        children: [
          {
            id: 'vendors-list',
            label: 'Vendor List',
            icon: Building2,
            roles: [...ADMIN_OPS, 'accounting', 'material_handler'],
          },
          {
            id: 'vendors-contracts',
            label: 'Contracts & Agreements',
            icon: FileText,
            roles: [...ADMIN_OPS, 'accounting'],
          },
          {
            id: 'vendors-performance',
            label: 'Performance Scores',
            icon: TrendingUp,
            roles: [...ADMIN_OPS, 'accounting'],
          },
          {
            id: 'vendors-payments',
            label: 'Payment History',
            icon: Receipt,
            roles: [...ADMIN_OPS, 'accounting'],
          },
        ],
      },
      {
        id: 'parts-ordering',
        label: 'Parts Ordering',
        icon: ShoppingCart,
        roles: [...ADMIN_OPS, 'material_handler'],
        children: [
          {
            id: 'parts-ordering-catalogs',
            label: 'Vendor Catalogs',
            icon: Package,
            roles: [...ADMIN_OPS, 'material_handler'],
          },
          {
            id: 'parts-ordering-reorder',
            label: 'Reorder Alerts',
            icon: AlertTriangle,
            roles: [...ADMIN_OPS, 'material_handler'],
          },
          {
            id: 'parts-ordering-leadtime',
            label: 'Lead Time Reports',
            icon: Clock,
            roles: [...ADMIN_OPS, 'material_handler'],
          },
        ],
      },
    ],
  },
  {
    id: 'business-intelligence',
    label: 'Business Intelligence',
    icon: LineChart,
    roles: FINANCE_ROLES,
    children: [
      {
        id: 'reports',
        label: 'Reports',
        icon: BarChart2,
        roles: FINANCE_ROLES,
        children: [
          {
            id: 'reports-job-cost',
            label: 'Job Cost Reports',
            icon: DollarSign,
            roles: FINANCE_ROLES,
          },
          {
            id: 'reports-financials',
            label: 'Financials',
            icon: Calculator,
            roles: FINANCE_ROLES,
          },
          {
            id: 'reports-technician',
            label: 'Technician Metrics',
            icon: Users,
            roles: FINANCE_ROLES,
          },
          {
            id: 'reports-margins',
            label: 'Project Margins',
            icon: TrendingUp,
            roles: FINANCE_ROLES,
          },
        ],
      },
      {
        id: 'insights',
        label: 'Insights',
        icon: PieChart,
        roles: FINANCE_ROLES,
        children: [
          {
            id: 'insights-revenue',
            label: 'Revenue Trends',
            icon: TrendingUp,
            roles: FINANCE_ROLES,
          },
          {
            id: 'insights-customer',
            label: 'Customer Value',
            icon: Users,
            roles: FINANCE_ROLES,
          },
          {
            id: 'insights-dso',
            label: 'DSO',
            icon: Clock,
            roles: FINANCE_ROLES,
          },
          {
            id: 'insights-labor',
            label: 'Labor Efficiency',
            icon: Wrench,
            roles: FINANCE_ROLES,
          },
        ],
      },
    ],
  },
  {
    id: 'administration',
    label: 'Administration',
    icon: Settings,
    roles: ADMIN_ONLY,
    children: [
      {
        id: 'data-import',
        label: 'Data Import',
        icon: Upload,
        roles: ADMIN_ONLY,
      },
      {
        id: 'settings',
        label: 'Settings',
        icon: Settings,
        roles: ADMIN_ONLY,
        children: [
          {
            id: 'settings-users',
            label: 'User & Role Management',
            icon: UserCog,
            roles: ADMIN_ONLY,
          },
          {
            id: 'settings-labor-rates',
            label: 'Labor Rate Profiles',
            icon: DollarSign,
            roles: ADMIN_ONLY,
          },
          {
            id: 'settings-contract-plans',
            label: 'Contract Plans',
            icon: FileText,
            roles: ADMIN_ONLY,
          },
          {
            id: 'settings-notifications',
            label: 'Notifications & Automation',
            icon: Bell,
            roles: ADMIN_ONLY,
          },
          {
            id: 'settings-permissions',
            label: 'Permissions',
            icon: Shield,
            roles: ADMIN_ONLY,
          },
          {
            id: 'settings-vehicles',
            label: 'Vehicles',
            icon: Truck,
            roles: ADMIN_ONLY,
          },
        ],
      },
    ],
  },
  {
    id: 'help',
    label: 'Help & Support',
    icon: HelpCircle,
    roles: ALL_ROLES,
    children: [
      {
        id: 'help',
        label: 'Help Center',
        icon: HelpCircle,
        roles: ALL_ROLES,
      },
    ],
  },
];
