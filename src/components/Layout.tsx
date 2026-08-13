import React, { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { GaugeIcon as Gauge, BankIcon as Bank, HandshakeIcon as Handshake, HandCoinsIcon as HandCoins,
  ReceiptIcon as Receipt, ArmchairIcon as Armchair, WarehouseIcon as Warehouse, ShoppingBagIcon as ShoppingBag,
  UsersThreeIcon as UsersThree, ChartLineUpIcon as ChartLineUp, RecycleIcon as Recycle,
  IdentificationBadgeIcon as IdentificationBadge, SquaresFourIcon as LayoutDashboard, GearSixIcon as Settings, WalletIcon as Wallet, TrendUpIcon as TrendingUp, ArrowsLeftRightIcon as ArrowLeftRight, CreditCardIcon as CreditCard, PackageIcon as Package, ShoppingCartSimpleIcon as ShoppingCart, CubeIcon as Boxes, UsersIcon as Users, ChartBarIcon as BarChart3, CalendarBlankIcon as Calendar, SignOutIcon as LogOut, CaretDownIcon as ChevronDown, CaretRightIcon as ChevronRight, ListIcon as Menu, XIcon as X, FileTextIcon as FileText, BuildingsIcon as Building2, GlobeIcon as Globe, BriefcaseIcon as Briefcase, PlusIcon as Plus, BookOpenIcon as BookOpen, TrashIcon as Trash2, ShieldCheckIcon as ShieldCheck, BellIcon as Bell, PulseIcon as Activity, MegaphoneIcon as Megaphone, FileTextIcon as FileBarChart, SparkleIcon as Sparkles, UserCheckIcon as UserCheck, UserMinusIcon as UserX, ChatTextIcon as MessageSquareText, TargetIcon as Target, UserGearIcon as UserCog, TruckIcon as Truck, TagIcon as Tag } from '@phosphor-icons/react'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LanguageContext'
import { whatsAppLink } from '../lib/support'
import NotificationBell from './NotificationBell'
import ProfileMenu from './ProfileMenu'
import ErrorBoundary from './ErrorBoundary'
import ExpiryReminder from './ExpiryReminder'
import toast from 'react-hot-toast'

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false)
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)
  const { profile, signOut } = useAuth()
  const { lang, setLang, t } = useLang()
  const navigate = useNavigate()
  const location = useLocation()

  // The page scrolls inside <main>, not the window, so a route change left the
  // new page showing wherever the last one was scrolled to - land on a sales
  // ledger halfway down its own table and it reads as missing rows. Put every
  // new page back at the top.
  const mainRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, left: 0 })
  }, [location.pathname])

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
    { key: 'superAdminManageOwners', label: 'Manage Owners', icon: <Trash2 size={18} />, path: '/super-admin/manage-owners' },
    { key: 'superAdminPayments', label: t('nav_payments'), icon: <CreditCard size={18} />, path: '/super-admin/payments' },
    { key: 'superAdminFinance', label: 'Finance', icon: <Wallet size={18} />, path: '/super-admin/finance' },
    { key: 'superAdminSms', label: 'SMS', icon: <MessageSquareText size={18} />, path: '/super-admin/sms' },
    { key: 'superAdminNotifications', label: 'Notifications', icon: <Bell size={18} />, path: '/super-admin/notifications' },
    { key: 'superAdminReports', label: t('nav_reports'), icon: <BarChart3 size={18} />, path: '/super-admin/reports' },
    { key: 'superAdminActivity', label: t('nav_logsActivity'), icon: <Activity size={18} />, path: '/super-admin/activity' },
    { key: 'superAdminSettings', label: t('nav_settings'), icon: <Bell size={18} />, path: '/super-admin/settings' },
  ]

  const businessNavGroups = [
    { key: 'dashboard', label: t('nav_dashboard'), icon: <Gauge size={18} weight="duotone" />, path: '/' },
    {
      key: 'balance', label: t('nav_balance'), icon: <Bank size={18} weight="duotone" />,
      children: [
        { key: 'balanceOverview', label: t('nav_overview'), icon: <Wallet size={16} />, path: '/balance' },
        { key: 'balanceTransfer', label: t('nav_adjustments'), icon: <ArrowLeftRight size={16} />, path: '/balance/transfer' },
        { key: 'balanceWallet', label: t('nav_wallet', 'Wallet'), icon: <Wallet size={16} />, path: '/balance/wallet' },
      ],
    },
    {
      key: 'transactions', label: t('nav_transactions'), icon: <Handshake size={18} weight="duotone" />,
      children: [
        { key: 'shareholderDashboard', label: t('nav_dashboard'), icon: <LayoutDashboard size={16} />, path: '/transactions/dashboard' },
        { key: 'invest', label: t('nav_investWithdraw'), icon: <Wallet size={16} />, path: '/transactions/invest' },
        { key: 'profit', label: t('nav_profitWithdraw'), icon: <TrendingUp size={16} />, path: '/transactions/profit' },
        { key: 'shareholderList', label: t('settings_shareholderList'), icon: <Users size={16} />, path: '/transactions/shareholders' },
      ],
    },
    {
      key: 'loanManagement', label: t('nav_loanManagement'), icon: <HandCoins size={18} weight="duotone" />,
      children: [
        { key: 'loanLenders', label: t('nav_bankPersonList'), icon: <Building2 size={16} />, path: '/loan-management/lenders' },
        { key: 'loanTransactions', label: t('nav_transaction'), icon: <FileText size={16} />, path: '/loan-management/transactions' },
        { key: 'loanLedger', label: t('nav_ledger'), icon: <BookOpen size={16} />, path: '/loan-management/ledger' },
        { key: 'loanDashboard', label: t('nav_dashboard'), icon: <LayoutDashboard size={16} />, path: '/loan-management/dashboard' },
      ],
    },
    {
      key: 'expenses', label: t('nav_expenses'), icon: <Receipt size={18} weight="duotone" />,
      children: [
        { key: 'expOverview', label: t('nav_overview'), icon: <BarChart3 size={16} />, path: '/expenses' },
        { key: 'expTx', label: t('nav_transactionsList'), icon: <FileText size={16} />, path: '/expenses/transactions' },
      ],
    },
    {
      key: 'productList', label: t('nav_productList'), icon: <Armchair size={18} weight="duotone" />,
      children: [
        { key: 'productAll', label: t('nav_productList'), icon: <Armchair size={16} />, path: '/products' },
        { key: 'updatePrice', label: t('nav_updatePrice'), icon: <Tag size={16} />, path: '/products/update-price' },
      ],
    },
    {
      key: 'purchase', label: 'Supplier', icon: <Truck size={18} weight="duotone" />,
      children: [
        { key: 'purchOrders', label: t('nav_purchaseOrders'), icon: <ShoppingCart size={16} />, path: '/purchase/orders' },
        { key: 'purchaseLedger', label: t('nav_purchaseLedger', 'Purchase Ledger'), icon: <FileText size={16} />, path: '/purchase/ledger' },
        { key: 'productReceived', label: t('nav_productReceived'), icon: <Package size={16} />, path: '/purchase/product-received' },
        { key: 'purchPayments', label: t('nav_supplierPayments'), icon: <CreditCard size={16} />, path: '/purchase/payments' },
        { key: 'suppDash', label: t('nav_supplierDashboard'), icon: <Building2 size={16} />, path: '/purchase/suppliers' },
        { key: 'purchaseHistory', label: t('nav_purchaseHistory'), icon: <BookOpen size={16} />, path: '/purchase/history' },
        { key: 'otherIncome', label: t('nav_otherIncome', 'Others Income'), icon: <FileText size={16} />, path: '/purchase/other-income' },
        { key: 'supplierList', label: t('settings_supplierList', 'Suppliers list'), icon: <Truck size={16} />, path: '/purchase/suppliers-list' },
      ],
    },
    { key: 'inventory', label: t('nav_inventory'), icon: <Warehouse size={18} weight="duotone" />, path: '/inventory' },
    {
      key: 'sales', label: t('nav_sales'), icon: <ShoppingBag size={18} weight="duotone" />,
      children: [
        { key: 'salesNew', label: t('sales_newEntry'), icon: <Plus size={16} />, path: '/sales' },
        { key: 'salesLedger', label: t('sales_ledger', 'Sales Ledger'), icon: <FileText size={16} />, path: '/sales/ledger' },
        { key: 'salesHistory', label: t('nav_salesHistory'), icon: <BookOpen size={16} />, path: '/sales/history' },
      ],
    },
    {
      key: 'customers', label: t('nav_customers'), icon: <UsersThree size={18} weight="duotone" />,
      children: [
        { key: 'custList', label: t('nav_customerList'), icon: <Users size={16} />, path: '/customers' },
        { key: 'custDueReceived', label: t('customers_dueReceived', 'Due received'), icon: <FileText size={16} />, path: '/customers/due-received' },
        { key: 'custLedger', label: t('nav_ledger'), icon: <FileText size={16} />, path: '/customers/ledger' },
        { key: 'custDash', label: t('nav_dashboard'), icon: <LayoutDashboard size={16} />, path: '/customers/dashboard' },
      ],
    },
    {
      key: 'reports', label: t('nav_targetReport'), icon: <ChartLineUp size={18} weight="duotone" />,
      children: [
        // The old MonthlyReport (/reports/monthly) page still exists and works
        // by URL - only hidden from the sidebar. The Report summary page is now
        // labelled "Monthly" here.
        { key: 'reportSummary', label: t('nav_monthly'), icon: <FileBarChart size={16} />, path: '/reports' },
        { key: 'yearly', label: t('nav_yearly'), icon: <BarChart3 size={16} />, path: '/reports/yearly' },
        { key: 'monthlyTarget', label: t('nav_salesTarget'), icon: <Target size={16} />, path: '/reports/monthly-target' },
        { key: 'purchaseTarget', label: t('nav_purchaseTarget'), icon: <Target size={16} />, path: '/reports/purchase-target' },
      ],
    },
    {
      key: 'marketing', label: t('nav_marketing'), icon: <Megaphone size={18} weight="duotone" />,
      children: [
        { key: 'campaign', label: t('nav_campaign'), icon: <Megaphone size={16} />, path: '/marketing' },
        { key: 'buySms', label: t('nav_buySms'), icon: <MessageSquareText size={16} />, path: '/marketing/buy-sms' },
      ],
    },
    {
      key: 'employees', label: t('nav_employees'), icon: <IdentificationBadge size={18} weight="duotone" />,
      children: [
        { key: 'empDash', label: t('nav_dashboard'), icon: <LayoutDashboard size={16} />, path: '/employees' },
        { key: 'empList', label: t('nav_employeeList'), icon: <Users size={16} />, path: '/employees/list' },
        { key: 'empTx', label: t('nav_employeeTransactions'), icon: null, path: '/employees/transactions' },
        { key: 'empAtt', label: t('nav_attendance'), icon: <Calendar size={16} />, path: '/employees/attendance' },
      ],
    },
  ]

  if (profile?.role === 'owner') {
    businessNavGroups.push({
      key: 'package', label: t('nav_package'), icon: <Package size={18} weight="duotone" />,
      children: [
        { key: 'billingHistory', label: t('nav_billingHistory', 'Billing History'), icon: <FileText size={16} />, path: '/package/billing-history' },
        { key: 'currentPlan', label: t('nav_plan', 'Plan'), icon: <CreditCard size={16} />, path: '/current-plan' },
      ],
    } as any)
  }

  const adminChildren: any[] = []
  if (profile?.role === 'owner') {
    adminChildren.push({ key: 'settings', label: t('settings_userManagement'), icon: <UserCog size={16} />, path: '/user-management' })
  }
  adminChildren.push({ key: 'recycleBin', label: t('nav_recycleBin'), icon: <Recycle size={16} />, path: '/recycle-bin' })
  businessNavGroups.push({
    key: 'admin', label: t('nav_admin'), icon: <UserCog size={18} weight="duotone" />,
    children: adminChildren,
  } as any)

  const navGroups = profile?.role === 'super_admin' ? superAdminNavGroups : businessNavGroups

  // Keep the sidebar in sync with the current route: whenever the URL changes
  // (clicks, programmatic redirects, refresh), auto-open the group that owns the
  // active page so it's visible + highlighted, and collapse groups otherwise.
  useEffect(() => {
    const pathname = location.pathname
    const activeGroup = navGroups.find((group: any) =>
      group.children?.some((child: any) =>
        pathname === child.path || pathname.startsWith(child.path + '/')
      )
    )
    setExpandedGroup(activeGroup ? activeGroup.key : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  function renderItem(item: any, depth = 0): React.ReactNode {
    if (item.children) {
      const isExpanded = expandedGroup === item.key
      return (
        <div key={item.key}>
          <button
            onClick={() => toggleGroup(item.key)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-full text-sm font-medium transition-all text-white/85 hover:bg-white/10 hover:text-white"
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
            <div className="ml-4 mt-0.5 space-y-0.5 border-l border-white/15 pl-3">
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
    // The app sits inside a dark frame: the sidebar shares the frame's colour
    // and the working area is a white sheet inset within it.
    <div className="flex h-screen gap-0 overflow-hidden bg-shell p-3 antialiased">
      <aside className={`${collapsed ? 'w-16' : 'w-64'} bg-shell flex flex-col transition-all duration-300 flex-shrink-0`}>
        <div className="flex items-center justify-between p-4">
          {!collapsed && (
            // The light mark, because the sidebar shares the dark frame. It is
            // hidden when collapsed - the sidebar is 64px there and a wordmark
            // this wide would only squash.
            <img src="/logo-light.png" alt={t('appName')} className="h-7 w-auto object-contain" />
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="text-white/70 hover:text-white transition-colors p-1"
          >
            {collapsed ? <Menu size={18} /> : <X size={18} />}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
          {navGroups.map(item => renderItem(item))}
        </nav>

        {/* Who is signed in now lives in the header, beside the bell, so the
            sidebar ends with the one action it needs. */}
        <div className="border-t border-white/10 p-3">
          <button
            onClick={handleSignOut}
            className="sidebar-link w-full"
            title={t('common_signOut', 'Logout')}
          >
            <LogOut size={18} />
            {!collapsed && <span>{t('common_signOut', 'Logout')}</span>}
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden rounded-2xl bg-white">
        {/* The bar was 48px tall, which left the bell and the avatar pressed
            against the top edge of the sheet. */}
        <div className="flex h-16 flex-shrink-0 items-center justify-end gap-3 rounded-t-2xl border-b border-neutral-200 bg-white px-6">
          <NotificationBell />
          <div className="flex items-center gap-1 bg-neutral-100 rounded-full p-0.5">
            <Globe size={13} className="text-neutral-500 ml-1.5" />
            <button
              onClick={() => setLang('en')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-full transition-all ${lang === 'en' ? 'bg-white text-navy-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'}`}
            >
              EN
            </button>
            <button
              onClick={() => setLang('bn')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-full transition-all ${lang === 'bn' ? 'bg-white text-navy-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'}`}
            >
              বাংলা
            </button>
          </div>
          <ProfileMenu />
        </div>

        <main ref={mainRef} className="flex-1 overflow-auto">
          <ErrorBoundary resetKey={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>

      {profile?.role !== 'super_admin' && <WhatsAppSupport />}
      {profile?.role !== 'super_admin' && <ExpiryReminder />}
    </div>
  )
}

function WhatsAppSupport() {
  // The number itself lives in lib/support.ts so it is defined in one place.
  const href = whatsAppLink()
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
