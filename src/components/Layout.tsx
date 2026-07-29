import React, { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Settings, Wallet, TrendingUp, ArrowLeftRight,
  CreditCard, Package, ShoppingCart, Boxes, Users, BarChart3,
  Calendar, LogOut, ChevronDown, ChevronRight, Menu, X,
  FileText, Building2, UserCircle, Globe, Briefcase, Plus,
  BookOpen, Trash2, ShieldCheck, Bell, Activity, Megaphone, FileBarChart, Sparkles,
  UserCheck, UserX
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
    { key: 'superAdminFreeTrial', label: t('nav_freeTrial'), icon: <Sparkles size={18} />, path: '/super-admin/free-trial' },
    { key: 'superAdminActiveCustomers', label: 'Active Customers', icon: <UserCheck size={18} />, path: '/super-admin/active-customers' },
    { key: 'superAdminChurned', label: 'Churned Customers', icon: <UserX size={18} />, path: '/super-admin/churned' },
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
        { key: 'otherIncome', label: t('nav_otherIncome', 'Others Income'), icon: <FileText size={16} />, path: '/purchase/other-income' },
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
        // The old MonthlyReport (/reports/monthly) page still exists and works
        // by URL - only hidden from the sidebar. The Report summary page is now
        // labelled "Monthly" here.
        { key: 'yearly', label: t('nav_yearly'), icon: <BarChart3 size={16} />, path: '/reports/yearly' },
        { key: 'reportSummary', label: t('nav_monthly'), icon: <FileBarChart size={16} />, path: '/reports' },
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
    businessNavGroups.push({ key: 'currentPlan', label: t('nav_currentPlan', 'Current Plan'), icon: <CreditCard size={18} />, path: '/current-plan' } as any)
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
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-slate-600 hover:bg-slate-100 hover:text-slate-900"
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
            <div className="ml-4 mt-0.5 space-y-0.5 border-l border-slate-200 pl-3">
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
    <div className="flex h-screen overflow-hidden bg-[#eef0f6] antialiased">
      <aside className={`${collapsed ? 'w-16' : 'w-64'} bg-white border-r border-slate-200 flex flex-col transition-all duration-300 flex-shrink-0`}>
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          {!collapsed && (
            <div>
              <h1 className="text-slate-900 font-bold text-sm">{t('appName')}</h1>
              <p className="text-slate-500 text-xs">{t('appSubtitle')}</p>
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="text-slate-400 hover:text-slate-900 transition-colors p-1"
          >
            {collapsed ? <Menu size={18} /> : <X size={18} />}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
          {navGroups.map(item => renderItem(item))}
        </nav>

        <div className="p-3 border-t border-slate-200">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="w-8 h-8 overflow-hidden bg-slate-900 rounded-full flex items-center justify-center flex-shrink-0">
              {businessBrand.logoUrl ? (
                <img src={businessBrand.logoUrl} alt={businessBrand.name} className="h-full w-full object-cover" />
              ) : (
                <UserCircle size={18} className="text-white" />
              )}
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-slate-900 text-xs font-medium truncate">{businessBrand.name}</p>
                <p className="text-slate-500 text-xs capitalize">{profile?.role?.replace('_', ' ') || 'owner'}</p>
              </div>
            )}
            <button onClick={handleSignOut} className="text-slate-400 hover:text-slate-900 transition-colors">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="h-12 bg-white border-b border-slate-200 flex items-center justify-end px-5 flex-shrink-0">
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

      {profile?.role !== 'super_admin' && <WhatsAppSupport />}
    </div>
  )
}

// Dummy support WhatsApp number - replace with the real one later.
const WHATSAPP_SUPPORT_NUMBER = '8801700000000'

function WhatsAppSupport() {
  const href = `https://wa.me/${WHATSAPP_SUPPORT_NUMBER}?text=${encodeURIComponent('Hi, I need help with my Furniture Management account.')}`
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title="Chat with support on WhatsApp"
      aria-label="Chat with support on WhatsApp"
      className="group fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-[#25D366] py-3 pl-3 pr-3 text-white shadow-lg shadow-green-600/30 transition hover:bg-[#20bd5a] hover:pr-4"
    >
      <svg viewBox="0 0 32 32" width="24" height="24" fill="currentColor" aria-hidden="true">
        <path d="M16.01 3C9.38 3 4 8.37 4 15c0 2.1.55 4.15 1.6 5.96L4 29l8.24-1.56A12.9 12.9 0 0 0 16 27c6.63 0 12-5.37 12-12S22.64 3 16.01 3zm0 21.8c-1.9 0-3.77-.5-5.4-1.46l-.39-.23-4.9.93.93-4.78-.25-.4A9.77 9.77 0 0 1 6.2 15c0-5.4 4.4-9.8 9.8-9.8 5.42 0 9.82 4.4 9.82 9.8s-4.4 9.8-9.81 9.8zm5.6-7.34c-.3-.15-1.8-.9-2.08-1-.28-.1-.48-.15-.68.15-.2.3-.78 1-.96 1.2-.18.2-.35.22-.65.08-.3-.15-1.28-.47-2.44-1.5-.9-.8-1.5-1.8-1.68-2.1-.18-.3-.02-.46.13-.6.13-.13.3-.34.45-.5.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.68-1.63-.93-2.23-.24-.58-.5-.5-.68-.5l-.58-.01c-.2 0-.52.07-.8.37-.28.3-1.05 1.02-1.05 2.5s1.08 2.9 1.23 3.1c.15.2 2.12 3.24 5.14 4.55.72.3 1.28.48 1.71.62.72.23 1.37.2 1.9.12.58-.09 1.8-.74 2.05-1.45.25-.72.25-1.33.18-1.46-.07-.13-.27-.2-.57-.35z" />
      </svg>
      <span className="max-w-0 overflow-hidden whitespace-nowrap text-sm font-semibold opacity-0 transition-all duration-300 group-hover:max-w-[90px] group-hover:opacity-100">Support</span>
    </a>
  )
}
