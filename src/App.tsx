import React, { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './context/AuthContext'
import { LanguageProvider } from './context/LanguageContext'
import ConfirmDialogHost from './components/ConfirmDialog'
import Layout from './components/Layout'
// Login stays eager: it is the one screen a signed-out visitor always lands
// on, so making it a separate chunk would add a round trip to the very first
// paint. Register and ForgotPassword are rarely opened, and a signed-in owner
// - which is most traffic, every day - never opens any of them, so those two
// leave the entry chunk.
import Login from './pages/Login'
const Register = lazy(() => import('./pages/Register'))
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'))

// Each screen is its own chunk, fetched the first time it is opened. Before
// this, App.tsx imported all 56 of them up front, so every visit downloaded
// and parsed the entire application before the first screen could render -
// which is why a page showing twenty rows took as long as one showing three
// thousand.
const SubscriptionPlans = lazy(() => import('./pages/SubscriptionPlans'))
const SubscriptionCheckout = lazy(() => import('./pages/SubscriptionPlans').then(m => ({ default: m.SubscriptionCheckout })))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Balance = lazy(() => import('./pages/Balance'))
const InvestWithdraw = lazy(() => import('./pages/transactions/Invest'))
const ProfitWithdraw = lazy(() => import('./pages/transactions/ProfitWithdraw'))
const Adjustments = lazy(() => import('./pages/transactions/Adjustments'))
const ShareholderDashboard = lazy(() => import('./pages/transactions/ShareholderDashboard'))
const ExpenseDashboard = lazy(() => import('./pages/expenses/ExpenseDashboard'))
const ExpenseTransactions = lazy(() => import('./pages/expenses/ExpenseTransactions'))
const ProductList = lazy(() => import('./pages/ProductList'))
const PurchaseOrders = lazy(() => import('./pages/purchase/PurchaseOrders'))
const ProductReceived = lazy(() => import('./pages/purchase/ProductReceived'))
const SupplierPayments = lazy(() => import('./pages/purchase/SupplierPayments'))
const SupplierDashboard = lazy(() => import('./pages/purchase/SupplierDashboard'))
const PurchaseHistory = lazy(() => import('./pages/purchase/PurchaseHistory'))
const PurchaseLedger = lazy(() => import('./pages/purchase/PurchaseLedger'))
const OtherIncome = lazy(() => import('./pages/purchase/OtherIncome'))
const Inventory = lazy(() => import('./pages/Inventory'))
const Sales = lazy(() => import('./pages/Sales'))
const SalesHistory = lazy(() => import('./pages/SalesHistory'))
const CustomerList = lazy(() => import('./pages/customers/CustomerList'))
const CustomerDueReceived = lazy(() => import('./pages/customers/CustomerDueReceived'))
const CustomerLedger = lazy(() => import('./pages/customers/CustomerLedger'))
const CustomerDashboard = lazy(() => import('./pages/customers/CustomerDashboard'))
const MonthlyReport = lazy(() => import('./pages/reports/MonthlyReport'))
const YearlyReport = lazy(() => import('./pages/reports/YearlyReport'))
const ReportSummary = lazy(() => import('./pages/reports/ReportSummary'))
const Settings = lazy(() => import('./pages/Settings'))
const CurrentPlan = lazy(() => import('./pages/CurrentPlan'))
const BillingHistory = lazy(() => import('./pages/BillingHistory'))
const SmsPackages = lazy(() => import('./pages/SmsPackages'))
const EmployeeDashboard = lazy(() => import('./pages/employees/EmployeeDashboard'))
const EmployeeList = lazy(() => import('./pages/employees/EmployeeList'))
const EmployeeTransactions = lazy(() => import('./pages/employees/EmployeeTransactions'))
const EmployeeAttendance = lazy(() => import('./pages/employees/EmployeeAttendance'))
const LoanLenderList = lazy(() => import('./pages/loans/LoanLenderList'))
const LoanTransactions = lazy(() => import('./pages/loans/LoanTransactions'))
const LoanLedger = lazy(() => import('./pages/loans/LoanLedger'))
const LoanDashboard = lazy(() => import('./pages/loans/LoanDashboard'))
const Marketing = lazy(() => import('./pages/Marketing'))
const RecycleBin = lazy(() => import('./pages/RecycleBin'))
const SuperAdminDashboard = lazy(() => import('./pages/super-admin/SuperAdminDashboard'))
const SuperAdminOwners = lazy(() => import('./pages/super-admin/SuperAdminOwners'))
const SuperAdminFreeTrial = lazy(() => import('./pages/super-admin/SuperAdminFreeTrial'))
const SuperAdminActiveCustomers = lazy(() => import('./pages/super-admin/SuperAdminActiveCustomers'))
const SuperAdminChurned = lazy(() => import('./pages/super-admin/SuperAdminChurned'))
const SuperAdminManageOwners = lazy(() => import('./pages/super-admin/SuperAdminManageOwners'))
const SuperAdminPayments = lazy(() => import('./pages/super-admin/SuperAdminPayments'))
const SuperAdminFinance = lazy(() => import('./pages/super-admin/SuperAdminFinance'))
const SuperAdminReports = lazy(() => import('./pages/super-admin/SuperAdminReports'))
const SuperAdminSettings = lazy(() => import('./pages/super-admin/SuperAdminSettings'))
const SuperAdminActivity = lazy(() => import('./pages/super-admin/SuperAdminActivity'))
const SuperAdminSms = lazy(() => import('./pages/super-admin/SuperAdminSms'))
const SuperAdminNotifications = lazy(() => import('./pages/super-admin/SuperAdminNotifications'))


function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, subscription, subscriptionStatus, subscriptionLocked, signOut } = useAuth()
  const lockContent = {
    pending: {
      title: 'Waiting for admin approval',
      message: 'Your registration request has been submitted. You can login, but app access will start after super admin approval.',
      tone: 'bg-blue-50 text-blue-600',
    },
    blocked: {
      title: 'Account blocked',
      message: 'Your owner account is currently blocked. Please contact the super admin to restore access.',
      tone: 'bg-red-50 text-brand-red',
    },
    suspended: {
      title: 'Account suspended',
      message: 'Your owner account is currently suspended. Please contact administration to restore access.',
      tone: 'bg-red-50 text-brand-red',
    },
    none: {
      title: 'Account not ready',
      message: 'Your owner account setup is not complete yet. Please contact the super admin.',
      tone: 'bg-slate-100 text-slate-600',
    },
  } as const
  const currentLock = lockContent[(subscriptionStatus === 'trial' || subscriptionStatus === 'active') ? 'none' : subscriptionStatus as keyof typeof lockContent] || lockContent.none
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <div className="animate-spin w-10 h-10 border-4 border-brand-green border-t-transparent rounded-full mx-auto mb-3" />
        <p className="text-slate-500 text-sm">Loading...</p>
      </div>
    </div>
  )
  if (!user) return <Navigate to="/login" replace />
  // Expired trial/subscription: send the owner straight to plan selection
  // instead of a dead-end message - that's the only place they can actually
  // pay and regain access, so there's nothing useful to show them here.
  if (subscriptionStatus === 'expired') return <Navigate to="/choose-plan" replace />
  if (subscriptionLocked) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-xl">
        <div className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl ${currentLock.tone}`}>
          <span className="text-2xl font-bold">!</span>
        </div>
        <h1 className="text-xl font-bold text-slate-900">{currentLock.title}</h1>
        <p className="mt-2 text-sm text-slate-500">
          {currentLock.message}
        </p>
        {subscription?.blocked_reason && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-brand-red">
            {subscription.blocked_reason}
          </p>
        )}
        <button onClick={signOut} className="btn-primary mt-6 w-full justify-center">
          Sign out
        </button>
      </div>
    </div>
  )
  return <>{children}</>
}

function SuperAdminRoute({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth()
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <div className="animate-spin w-10 h-10 border-4 border-brand-green border-t-transparent rounded-full mx-auto mb-3" />
        <p className="text-slate-500 text-sm">Loading...</p>
      </div>
    </div>
  )
  if (profile?.role !== 'super_admin') return <Navigate to="/" replace />
  return <>{children}</>
}

// Shown for the moment a screen's own chunk is being fetched. Deliberately the
// same spinner ProtectedRoute already uses while the session loads, so moving
// between screens looks no different than it did when everything was in one
// bundle.
function RouteFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="animate-spin w-8 h-8 border-4 border-brand-green border-t-transparent rounded-full" />
    </div>
  )
}

function AppRoutes() {
  const { user, profile } = useAuth()
  return (
    <Suspense fallback={<RouteFallback />}>
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/register" element={user ? <Navigate to="/" replace /> : <Register />} />
      <Route path="/forgot-password" element={user ? <Navigate to="/" replace /> : <ForgotPassword />} />
      <Route path="/choose-plan" element={user ? <SubscriptionPlans /> : <Navigate to="/register" replace />} />
      <Route path="/subscription-checkout" element={user ? <SubscriptionCheckout /> : <Navigate to="/login" replace />} />
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/" element={profile?.role === 'super_admin' ? <Navigate to="/super-admin" replace /> : <Dashboard />} />
        <Route path="/super-admin" element={<SuperAdminRoute><SuperAdminDashboard /></SuperAdminRoute>} />
        <Route path="/super-admin/owners" element={<SuperAdminRoute><SuperAdminOwners /></SuperAdminRoute>} />
        <Route path="/super-admin/free-trial" element={<SuperAdminRoute><SuperAdminFreeTrial /></SuperAdminRoute>} />
        <Route path="/super-admin/active-customers" element={<SuperAdminRoute><SuperAdminActiveCustomers /></SuperAdminRoute>} />
        <Route path="/super-admin/churned" element={<SuperAdminRoute><SuperAdminChurned /></SuperAdminRoute>} />
        <Route path="/super-admin/manage-owners" element={<SuperAdminRoute><SuperAdminManageOwners /></SuperAdminRoute>} />
        <Route path="/super-admin/payments" element={<SuperAdminRoute><SuperAdminPayments /></SuperAdminRoute>} />
        <Route path="/super-admin/finance" element={<SuperAdminRoute><SuperAdminFinance /></SuperAdminRoute>} />
        <Route path="/super-admin/sms" element={<SuperAdminRoute><SuperAdminSms /></SuperAdminRoute>} />
        <Route path="/super-admin/notifications" element={<SuperAdminRoute><SuperAdminNotifications /></SuperAdminRoute>} />
        <Route path="/super-admin/reports" element={<SuperAdminRoute><SuperAdminReports /></SuperAdminRoute>} />
        <Route path="/super-admin/settings" element={<SuperAdminRoute><SuperAdminSettings /></SuperAdminRoute>} />
        <Route path="/super-admin/activity" element={<SuperAdminRoute><SuperAdminActivity /></SuperAdminRoute>} />
        <Route path="/balance" element={<Balance />} />
        <Route path="/balance/transfer" element={<Adjustments />} />
        <Route path="/transactions/dashboard" element={<ShareholderDashboard />} />
        <Route path="/transactions/invest" element={<InvestWithdraw />} />
        <Route path="/transactions/profit" element={<ProfitWithdraw />} />
        <Route path="/transactions/loans" element={<Navigate to="/loan-management/transactions" replace />} />
        <Route path="/transactions/adjustments" element={<Adjustments />} />
        <Route path="/loan-management" element={<Navigate to="/loan-management/dashboard" replace />} />
        <Route path="/loan-management/lenders" element={<LoanLenderList />} />
        <Route path="/loan-management/transactions" element={<LoanTransactions />} />
        <Route path="/loan-management/ledger" element={<LoanLedger />} />
        <Route path="/loan-management/dashboard" element={<LoanDashboard />} />
        <Route path="/expenses" element={<ExpenseDashboard />} />
        <Route path="/expenses/transactions" element={<ExpenseTransactions />} />
        <Route path="/products" element={<ProductList />} />
        <Route path="/purchase/orders" element={<PurchaseOrders />} />
        <Route path="/purchase/ledger" element={<PurchaseLedger />} />
        <Route path="/purchase/product-received" element={<ProductReceived />} />
        <Route path="/purchase/payments" element={<SupplierPayments />} />
        <Route path="/purchase/suppliers" element={<SupplierDashboard />} />
        <Route path="/purchase/history" element={<PurchaseHistory />} />
        <Route path="/purchase/other-income" element={<OtherIncome />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/sales" element={<Sales />} />
        <Route path="/sales/ledger" element={<Sales />} />
        <Route path="/sales/history" element={<SalesHistory />} />
        <Route path="/customers" element={<CustomerList />} />
        <Route path="/customers/due-received" element={<CustomerDueReceived />} />
        <Route path="/customers/ledger" element={<CustomerLedger />} />
        <Route path="/customers/dashboard" element={<CustomerDashboard />} />
        <Route path="/reports" element={<ReportSummary />} />
        <Route path="/reports/monthly" element={<MonthlyReport />} />
        <Route path="/reports/yearly" element={<YearlyReport />} />
        <Route path="/marketing" element={<Marketing />} />
        <Route path="/recycle-bin" element={<RecycleBin />} />
        <Route path="/employees" element={<EmployeeDashboard />} />
        <Route path="/employees/list" element={<EmployeeList />} />
        <Route path="/employees/transactions" element={<EmployeeTransactions />} />
        <Route path="/employees/attendance" element={<EmployeeAttendance />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/current-plan" element={<CurrentPlan />} />
        <Route path="/package/billing-history" element={<BillingHistory />} />
        <Route path="/package/sms" element={<SmsPackages />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <LanguageProvider>
      <AuthProvider>
        <AppRoutes />
        <ConfirmDialogHost />
        <Toaster
          position="top-right"
          toastOptions={{
            style: { background: '#1e293b', color: '#fff', borderRadius: '12px', fontSize: '13px' },
            success: { style: { background: '#1D9E75' } },
            error: { style: { background: '#E24B4A' } },
          }}
        />
      </AuthProvider>
      </LanguageProvider>
    </BrowserRouter>
  )
}
