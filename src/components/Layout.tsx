import React, { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Settings, Wallet, TrendingUp, ArrowLeftRight,
  CreditCard, Package, ShoppingCart, Boxes, Users, BarChart3,
  Calendar, LogOut, ChevronDown, ChevronRight, Menu, X,
  FileText, Building2, UserCircle, Globe, Briefcase, Plus,
  BookOpen, Trash2, ShieldCheck, Bell, Activity, Megaphone, FileBarChart
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LanguageContext'
import { useBusinessBrand } from '../lib/businessBrand'
import toast from 'react-hot-toast'

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false)
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)
  const { profile, signOut } = useAuth()
  const { lang, setLang, t } = useLang()
  const businessBrand = useBusinessBrand()
  const navigate = useNavigate()

  function toggleGroup(key: string) {
    setExpandedGroup(prev => (prev === key ? null : key))
  }

  async function handleSignOut() {
    await signOut()
    toast.success(t('common_signedOut'))
    navigate('/login')
  }

  const superAdminNavGroups = [
    { key: 'superAdminDashboard', label: t('nav_superAdmin'), icon: <ShieldCheck size={18} />, path: '/super-admin' },
    { key: 'superAdminOwners', label: t('nav_owners'), icon: <Users size={18} />, path: '/super-admin/owners' },
    { key: 'superAdminPayments', label: t('nav_payments'), icon: <CreditCard size={18} />, path: '/super-admin/payments' },
    { key: 'superAdminReports', label: t('nav_reports'), icon: <BarChart3 size={18} />, path: '/super-admin/reports' },
    { key: 'superAdminActivity', label: t('nav_logsActivity'), icon: <Activity size={18} />, path: '/super-admin/activity' },
    { key: 'superAdminSettings', label: t('nav_settings'), icon: <Bell size={18} />, path: '/super-admin/settings' },
  ]

  const businessNavGroups = [
    { key: 'dashboard', label: t('nav_dashboard'), icon: <LayoutDashboard size={18} />, path: '/' },
    {
      key: 'balance', label: t('nav_balance'), icon: <Wallet size={18} />,
      children: [
        { key: 'balanceOverview', label: t('nav_overview'), icon: <Wallet size={16} />, path: '/balance' },
        { key: 'balanceTransfer', label: t('nav_adjustments'), icon: <ArrowLeftRight size={16} />, path: '/balance/transfer' },
      ],
    },
    {
      key: 'transactions', label: t('nav_transactions'), icon: <ArrowLeftRight size={18} />,
      children: [
        { key: 'shareholderDashboard', label: t('nav_dashboard'), icon: <LayoutDashboard size={16} />, path: '/transactions/dashboard' },
        { key: 'invest', label: t('nav_investWithdraw'), icon: <Wallet size={16} />, path: '/transactions/invest' },
        { key: 'profit', label: t('nav_profitWithdraw'), icon: <TrendingUp size={16} />, path: '/transactions/profit' },
      ],
    },
    {
      key: 'loanManagement', label: t('nav_loanManagement'), icon: <CreditCard size={18} />,
      children: [
        { key: 'loanLenders', label: t('nav_bankPersonList'), icon: <Building2 size={16} />, path: '/loan-management/lenders' },
        { key: 'loanTransactions', label: t('nav_transaction'), icon: <FileText size={16} />, path: '/loan-management/transactions' },
        { key: 'loanLedger', label: t('nav_ledger'), icon: <BookOpen size={16} />, path: '/loan-management/ledger' },
        { key: 'loanDashboard', label: t('nav_dashboard'), icon: <LayoutDashboard size={16} />, path: '/loan-management/dashboard' },
      ],
    },
    {
      key: 'expenses', label: t('nav_expenses'), icon: <FileText size={18} />,
      children: [
        { key: 'expOverview', label: t('nav_overview'), icon: <BarChart3 size={16} />, path: '/expenses' },
        { key: 'expTx', label: t('nav_transactionsList'), icon: <FileText size={16} />, path: '/expenses/transactions' },
      ],
    },
    { key: 'productList', label: t('nav_productList'), icon: <Package size={18} />, path: '/products' },
    {
      key: 'purchase', label: t('nav_purchase'), icon: <ShoppingCart size={18} />,
      children: [
        { key: 'purchOrders', label: t('nav_purchaseOrders'), icon: <ShoppingCart size={16} />, path: '/purchase/orders' },
        { key: 'purchaseLedger', label: t('nav_purchaseLedger', 'Purchase Ledger'), icon: <FileText size={16} />, path: '/purchase/ledger' },
        { key: 'productReceived', label: t('nav_productReceived'), icon: <Package size={16} />, path: '/purchase/product-received' },
        { key: 'purchPayments', label: t('nav_supplierPayments'), icon: <CreditCard size={16} />, path: '/purchase/payments' },
        { key: 'suppDash', label: t('nav_supplierDashboard'), icon: <Building2 size={16} />, path: '/purchase/suppliers' },
        { key: 'purchaseHistory', label: t('nav_purchaseHistory'), icon: <BookOpen size={16} />, path: '/purchase/history' },
        { key: 'otherIncome', label: t('nav_otherIncome', 'Other Income'), icon: <FileText size={16} />, path: '/purchase/other-income' },
      ],
    },
    { key: 'inventory', label: t('nav_inventory'), icon: <Boxes size={18} />, path: '/inventory' },
    {
      key: 'sales', label: t('nav_sales'), icon: <TrendingUp size={18} />,
      children: [
        { key: 'salesNew', label: t('sales_newEntry'), icon: <Plus size={16} />, path: '/sales' },
        { key: 'salesLedger', label: t('sales_ledger', 'Sales Ledger'), icon: <FileText size={16} />, path: '/sales/ledger' },
        { key: 'salesHistory', label: t('nav_salesHistory'), icon: <BookOpen size={16} />, path: '/sales/history' },
      ],
    },
    {
      key: 'customers', label: t('nav_customers'), icon: <Users size={18} />,
      children: [
        { key: 'custList', label: t('nav_customerList'), icon: <Users size={16} />, path: '/customers' },
        { key: 'custDueReceived', label: t('customers_dueReceived', 'Due received'), icon: <FileText size={16} />, path: '/customers/due-received' },
        { key: 'custLedger', label: t('nav_ledger'), icon: <FileText size={16} />, path: '/customers/ledger' },
        { key: 'custDash', label: t('nav_dashboard'), icon: <LayoutDashboard size={16} />, path: '/customers/dashboard' },
      ],
    },
    {
      key: 'reports', label: t('nav_reports'), icon: <BarChart3 size={18} />,
      children: [
        { key: 'monthly', label: t('nav_monthly'), icon: <Calendar size={16} />, path: '/reports/monthly' },
        { key: 'yearly', label: t('nav_yearly'), icon: <BarChart3 size={16} />, path: '/reports/yearly' },
        { key: 'reportSummary', label: 'Report', icon: <FileBarChart size={16} />, path: '/reports' },
      ],
    },
    { key: 'marketing', label: t('nav_marketing'), icon: <Megaphone size={18} />, path: '/marketing' },
    { key: 'recycleBin', label: t('nav_recycleBin'), icon: <Trash2 size={18} />, path: '/recycle-bin' },
    {
      key: 'employees', label: t('nav_employees'), icon: <Briefcase size={18} />,
      children: [
        { key: 'empDash', label: t('nav_dashboard'), icon: <LayoutDashboard size={16} />, path: '/employees' },
        { key: 'empList', label: t('nav_employeeList'), icon: <Users size={16} />, path: '/employees/list' },
        { key: 'empTx', label: t('nav_employeeTransactions'), icon: null, path: '/employees/transactions' },
        { key: 'empAtt', label: t('nav_attendance'), icon: <Calendar size={16} />, path: '/employees/attendance' },
      ],
    },
  ]

  if (profile?.role === 'owner') {
    businessNavGroups.push({ key: 'settings', label: t('nav_settings'), icon: <Settings size={18} />, path: '/settings' } as any)
  }

  const navGroups = profile?.role === 'super_admin' ? superAdminNavGroups : businessNavGroups

  function renderItem(item: any, depth = 0): React.ReactNode {
    if (item.children) {
      const isExpanded = expandedGroup === item.key
      return (
        <div key={item.key}>
          <button
            onClick={() => toggleGroup(item.key)}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all text-slate-300 hover:bg-navy-700 hover:text-white"
          >
            {item.icon}
            {!collapsed && (
              <>
                <span className="flex-1 text-left">{item.label}</span>
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </>
            )}
          </button>
          {isExpanded && !collapsed && (
            <div className="ml-4 mt-0.5 space-y-0.5 border-l border-navy-700 pl-3">
              {item.children.map((child: any) => renderItem(child, depth + 1))}
            </div>
          )}
        </div>
      )
    }

    return (
      <NavLink
        key={item.path}
        to={item.path}
        end
        className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
      >
        {item.icon}
        {!collapsed && <span>{item.label}</span>}
      </NavLink>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 antialiased">
      <aside className={`${collapsed ? 'w-16' : 'w-64'} bg-navy-800 flex flex-col transition-all duration-300 flex-shrink-0`}>
        <div className="flex items-center justify-between p-4 border-b border-navy-700">
          {!collapsed && (
            <div>
              <h1 className="text-white font-bold text-sm">{t('appName')}</h1>
              <p className="text-slate-400 text-xs">{t('appSubtitle')}</p>
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="text-slate-400 hover:text-white transition-colors p-1"
          >
            {collapsed ? <Menu size={18} /> : <X size={18} />}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
          {navGroups.map(item => renderItem(item))}
        </nav>

        <div className="p-3 border-t border-navy-700">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 overflow-hidden bg-brand-green rounded-full flex items-center justify-center flex-shrink-0">
              {businessBrand.logoUrl ? (
                <img src={businessBrand.logoUrl} alt={businessBrand.name} className="h-full w-full object-cover" />
              ) : (
                <UserCircle size={18} className="text-white" />
              )}
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-white text-xs font-medium truncate">{businessBrand.name}</p>
                <p className="text-slate-400 text-xs capitalize">{profile?.role?.replace('_', ' ') || 'owner'}</p>
              </div>
            )}
            <button onClick={handleSignOut} className="text-slate-400 hover:text-white transition-colors">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="h-10 bg-white border-b border-slate-100 flex items-center justify-end px-5 flex-shrink-0">
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
            <Globe size={13} className="text-slate-400 ml-1.5" />
            <button
              onClick={() => setLang('en')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${lang === 'en' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              EN
            </button>
            <button
              onClick={() => setLang('bn')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${lang === 'bn' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              বাংলা
            </button>
          </div>
        </div>

        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
