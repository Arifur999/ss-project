import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import PageHeader from '../components/PageHeader'
import { useLang } from '../context/LanguageContext'

interface AccountRow {
  id: string; name: string; type: string; opening_balance: number; is_active: boolean
  total_invest: number; invest_withdraw: number; profit_withdraw: number
  loan_received: number; loan_payment: number; supplier_payment: number
  cash_sales: number; customer_due_received: number; other_income: number; expense_pay: number
  transfer_in: number; transfer_out: number; current_balance: number
}

const salePaymentsFallbackKey = 'sales_split_payment_fallback_v1'

function readStorageMap(key: string) {
  try {
    return JSON.parse(localStorage.getItem(key) || '{}')
  } catch {
    return {}
  }
}

function fallbackSalePayments() {
  const map = readStorageMap(salePaymentsFallbackKey)
  return Object.values(map).flatMap((value: any) => Array.isArray(value) ? value : value ? [value] : [])
}

export default function Balance() {
  const { t, formatCurr } = useLang()
  const [accounts, setAccounts] = useState<AccountRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadBalance()
    const channel = supabase
      .channel('balance-dashboard-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'loans' }, loadBalance)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'accounts' }, loadBalance)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, loadBalance)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sale_payments' }, loadBalance)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_payments' }, loadBalance)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  async function loadBalance() {
    setLoading(true)
    const [accsRes, investRes, profitRes, loanRes, transferRes, expenseRes, salesRes, salePayRes, custPayRes, supplierPayRes, otherIncomeRes] = await Promise.all([
      supabase.from('accounts').select('*').order('sort_order'),
      supabase.from('investments').select('*'),
      supabase.from('profit_withdrawals').select('*'),
      supabase.from('loans').select('*'),
      supabase.from('account_transfers').select('*'),
      supabase.from('expenses').select('*'),
      supabase.from('sales').select('*').eq('status', 'completed'),
      supabase.from('sale_payments').select('*'),
      supabase.from('customer_payments').select('*'),
      supabase.from('supplier_payments').select('*'),
      supabase.from('other_incomes').select('*'),
    ])

    const accs = accsRes.data || []
    const investments = investRes.data || []
    const profits = profitRes.data || []
    const loans = loanRes.data || []
    const transfers = transferRes.data || []
    const expenses = expenseRes.data || []
    const sales = salesRes.data || []
    const dbSalePayments = salePayRes.data || []
    const fallbackPayments = fallbackSalePayments()
    const dbSplitSaleIds = new Set(dbSalePayments.map((payment: any) => payment.sale_id).filter(Boolean))
    const salePayments = [
      ...dbSalePayments,
      ...fallbackPayments.filter((payment: any) => !dbSplitSaleIds.has(payment.sale_id))
    ]
    const custPays = custPayRes.data || []
    const supplierPays = supplierPayRes.data || []
    const otherIncomes = otherIncomeRes.data || []

    function sumBy(arr: any[], accountId: string, field: string) {
      return arr.filter(r => r.account_id === accountId).reduce((s, r) => s + Number(r[field] || 0), 0)
    }
    const splitSaleIds = new Set(salePayments.map((payment: any) => payment.sale_id).filter(Boolean))

    const rows: AccountRow[] = accs.map(acc => {
      const total_invest = sumBy(investments, acc.id, 'invest_amount')
      const invest_withdraw = sumBy(investments, acc.id, 'withdraw_amount')
      const profit_withdraw = sumBy(profits, acc.id, 'amount')
      const loan_recv = loans.filter(r => r.account_id === acc.id).reduce((s, r) => s + Number(r.received_amount || 0), 0)
      const loan_payment = loans.filter(r => r.account_id === acc.id).reduce((s, r) => s + Number(r.payment_amount || 0), 0)
      const supplier_payment = sumBy(supplierPays, acc.id, 'amount')
      const legacyCashSales = sales
        .filter(r => !splitSaleIds.has(r.id) && r.account_id === acc.id)
        .reduce((s, r) => s + Number(r.paid_amount || 0), 0)
      const splitCashSales = sumBy(salePayments, acc.id, 'amount')
      const cash_sales = legacyCashSales + splitCashSales
      const customer_due_received = sumBy(custPays, acc.id, 'amount')
      const other_income = sumBy(otherIncomes, acc.id, 'amount')
      const expense_pay = sumBy(expenses, acc.id, 'amount')
      const transfer_in = transfers.filter(r => r.to_account_id === acc.id).reduce((s, r) => s + Number(r.amount || 0), 0)
      const transfer_out = transfers.filter(r => r.from_account_id === acc.id).reduce((s, r) => s + Number(r.amount || 0), 0)
      const current_balance = Number(acc.opening_balance) + total_invest - invest_withdraw - profit_withdraw + loan_recv - loan_payment - supplier_payment + cash_sales + customer_due_received + other_income - expense_pay + transfer_in - transfer_out

      return { id: acc.id, name: acc.name, type: acc.type, opening_balance: acc.opening_balance, is_active: acc.is_active !== false, total_invest, invest_withdraw, profit_withdraw, loan_received: loan_recv, loan_payment, supplier_payment, cash_sales, customer_due_received, other_income, expense_pay, transfer_in, transfer_out, current_balance }
    })

    setAccounts(rows)
    setLoading(false)
  }

  const totalBalance = accounts.reduce((s, a) => s + a.current_balance, 0)
  const inactiveAmount = accounts.filter(a => !a.is_active).reduce((s, a) => s + a.current_balance, 0)
  const availableBalance = accounts.filter(a => a.is_active).reduce((s, a) => s + a.current_balance, 0)

  const columns = [
    { key: 'opening_balance', labelKey: 'balance_openingBalance', color: '' },
    { key: 'total_invest', labelKey: 'balance_investment', color: 'text-brand-green' },
    { key: 'invest_withdraw', labelKey: 'balance_withdrawal', color: 'text-brand-red' },
    { key: 'profit_withdraw', labelKey: 'balance_profitWithdrawal', color: 'text-brand-red' },
    { key: 'loan_received', labelKey: 'balance_loanReceived', color: 'text-brand-green' },
    { key: 'loan_payment', labelKey: 'balance_loanPaid', color: 'text-brand-red' },
    { key: 'supplier_payment', labelKey: 'balance_supplierPayment', color: 'text-brand-red' },
    { key: 'cash_sales', labelKey: 'balance_cashSales', color: 'text-brand-green' },
    { key: 'customer_due_received', labelKey: 'balance_customerCollection', color: 'text-brand-green' },
    { key: 'other_income', labelKey: 'balance_otherIncome', color: 'text-brand-green' },
    { key: 'expense_pay', labelKey: 'balance_expensePaid', color: 'text-brand-red' },
    { key: 'transfer_in', labelKey: 'balance_transferIn', color: 'text-brand-green' },
    { key: 'transfer_out', labelKey: 'balance_transferOut', color: 'text-brand-red' },
    { key: 'current_balance', labelKey: 'balance_currentBalance', color: 'font-bold text-slate-800' },
  ]

  return (
    <div className="p-6">
      <PageHeader title={t('balance_title')} subtitle={t('balance_subtitle')} />

      <div className="grid grid-cols-1 gap-4 mb-6 md:grid-cols-2 xl:grid-cols-4">
        <div className="card">
          <p className="text-xs text-slate-500 uppercase font-medium">{t('balance_totalAccounts')}</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{accounts.length}</p>
        </div>
        <div className="card">
          <p className="text-xs text-slate-500 uppercase font-medium">{t('balance_totalBalance')}</p>
          <p className={`text-2xl font-bold mt-1 ${totalBalance >= 0 ? 'text-brand-green' : 'text-brand-red'}`}>{formatCurr(totalBalance)}</p>
        </div>
        <div className="card">
          <p className="text-xs text-slate-500 uppercase font-medium">{t('balance_inactiveAmount')}</p>
          <p className="text-2xl font-bold text-brand-red mt-1">{formatCurr(inactiveAmount)}</p>
        </div>
        <div className="card">
          <p className="text-xs text-slate-500 uppercase font-medium">{t('balance_availableBalance')}</p>
          <p className={`text-2xl font-bold mt-1 ${availableBalance >= 0 ? 'text-brand-green' : 'text-brand-red'}`}>{formatCurr(availableBalance)}</p>
        </div>
      </div>

      <div className="card overflow-x-auto p-0">
        <div className="p-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-800">{t('balance_accountDetails')}</h3>
        </div>
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin w-6 h-6 border-4 border-brand-green border-t-transparent rounded-full" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="table-header sticky top-0">
                <tr>
                  <th className="sticky left-0 z-30 w-12 bg-slate-50 py-3 px-3 text-left shadow-[1px_0_0_#e2e8f0]">#</th>
                  <th className="sticky left-12 z-30 min-w-[220px] bg-slate-50 py-3 px-4 text-left shadow-[1px_0_0_#e2e8f0]">{t('common_account')}</th>
                  {columns.map(col => (
                    <th key={col.key} className="text-right py-3 px-3 min-w-[100px] whitespace-nowrap">{t(col.labelKey)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {accounts.map((acc, index) => (
                  <tr key={acc.id} className={`table-row ${!acc.is_active ? 'bg-red-50/70 text-red-900 hover:bg-red-50' : ''}`}>
                    <td className={`sticky left-0 z-20 w-12 py-2.5 px-3 font-medium text-slate-500 shadow-[1px_0_0_#e2e8f0] ${!acc.is_active ? 'bg-red-50' : 'bg-white'}`}>{index + 1}</td>
                    <td className={`sticky left-12 z-20 py-2.5 px-4 font-medium text-slate-800 shadow-[1px_0_0_#e2e8f0] ${!acc.is_active ? 'bg-red-50' : 'bg-white'}`}>
                      <div className="flex max-w-[260px] items-center gap-2 whitespace-nowrap" title={acc.name}>
                        <span className="truncate">{acc.name}</span>
                        {!acc.is_active && <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">{t('common_inactive')}</span>}
                      </div>
                    </td>
                    {columns.map(col => {
                      const val = (acc as any)[col.key] || 0
                      return (
                        <td key={col.key} className={`py-2.5 px-3 text-right ${col.color} ${col.key === 'current_balance' ? 'bg-slate-50' : ''}`}>
                          {val === 0 ? '—' : formatCurr(val)}
                        </td>
                      )
                    })}
                  </tr>
                ))}
                <tr className="bg-navy-800 text-white">
                  <td className="sticky left-0 z-20 w-12 bg-navy-800 py-2.5 px-3 font-semibold shadow-[1px_0_0_rgba(255,255,255,0.18)]"></td>
                  <td className="sticky left-12 z-20 bg-navy-800 py-2.5 px-4 font-semibold shadow-[1px_0_0_rgba(255,255,255,0.18)]">{t('common_total')}</td>
                  {columns.map(col => {
                    const total = accounts.reduce((s, a) => s + ((a as any)[col.key] || 0), 0)
                    return (
                      <td key={col.key} className="py-2.5 px-3 text-right font-semibold">
                        {total === 0 ? '—' : formatCurr(total)}
                      </td>
                    )
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
