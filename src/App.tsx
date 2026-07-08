import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './context/AuthContext'
import { LanguageProvider } from './context/LanguageContext'
import ConfirmDialogHost from './components/ConfirmDialog'
import Layout from './components/Layout'
import Login from './pages/Login'
import Register from './pages/Register'
import SubscriptionPlans, { SubscriptionCheckout } from './pages/SubscriptionPlans'
import Dashboard from './pages/Dashboard'
import Balance from './pages/Balance'
import InvestWithdraw from './pages/transactions/Invest'
import ProfitWithdraw from './pages/transactions/ProfitWithdraw'
import Adjustments from './pages/transactions/Adjustments'
import ShareholderDashboard from './pages/transactions/ShareholderDashboard'
import ExpenseDashboard from './pages/expenses/ExpenseDashboard'
import ExpenseTransactions from './pages/expenses/ExpenseTransactions'
import ProductList from './pages/ProductList'
import PurchaseOrders from './pages/purchase/PurchaseOrders'
import ProductReceived from './pages/purchase/ProductReceived'
import SupplierPayments from './pages/purchase/SupplierPayments'
import SupplierDashboard from './pages/purchase/SupplierDashboard'
import PurchaseHistory from './pages/purchase/PurchaseHistory'
import PurchaseLedger from './pages/purchase/PurchaseLedger'
import OtherIncome from './pages/purchase/OtherIncome'
import Inventory from './pages/Inventory'
import Sales from './pages/Sales'
import SalesHistory from './pages/SalesHistory'
import CustomerList from './pages/customers/CustomerList'
import CustomerDueReceived from './pages/customers/CustomerDueReceived'
import CustomerLedger from './pages/customers/CustomerLedger'
import CustomerDashboard from './pages/customers/CustomerDashboard'
import MonthlyReport from './pages/reports/MonthlyReport'
import YearlyReport from './pages/reports/YearlyReport'
import ReportSummary from './pages/reports/ReportSummary'
import Settings from './pages/Settings'
import EmployeeDashboard from './pages/employees/EmployeeDashboard'
import EmployeeList from './pages/employees/EmployeeList'
import EmployeeTransactions from './pages/employees/EmployeeTransactions'
import EmployeeAttendance from './pages/employees/EmployeeAttendance'
import LoanLenderList from './pages/loans/LoanLenderList'
import LoanTransactions from './pages/loans/LoanTransactions'
import LoanLedger from './pages/loans/LoanLedger'
import LoanDashboard from './pages/loans/LoanDashboard'
import Marketing from './pages/Marketing'
import RecycleBin from './pages/RecycleBin'
import SuperAdminDashboard from './pages/super-admin/SuperAdminDashboard'
import SuperAdminOwners from './pages/super-admin/SuperAdminOwners'
import SuperAdminPayments from './pages/super-admin/SuperAdminPayments'
import SuperAdminReports from './pages/super-admin/SuperAdminReports'
import SuperAdminSettings from './pages/super-admin/SuperAdminSettings'
import SuperAdminActivity from './pages/super-admin/SuperAdminActivity'

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

function AppRoutes() {
  const { user, profile } = useAuth()
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/register" element={user ? <Navigate to="/" replace /> : <Register />} />
      <Route path="/choose-plan" element={user ? <SubscriptionPlans /> : <Navigate to="/register" replace />} />
      <Route path="/subscription-checkout" element={user ? <SubscriptionCheckout /> : <Navigate to="/login" replace />} />
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/" element={profile?.role === 'super_admin' ? <Navigate to="/super-admin" replace /> : <Dashboard />} />
        <Route path="/super-admin" element={<SuperAdminRoute><SuperAdminDashboard /></SuperAdminRoute>} />
        <Route path="/super-admin/owners" element={<SuperAdminRoute><SuperAdminOwners /></SuperAdminRoute>} />
        <Route path="/super-admin/payments" element={<SuperAdminRoute><SuperAdminPayments /></SuperAdminRoute>} />
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
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
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
