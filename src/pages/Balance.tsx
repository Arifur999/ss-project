import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import PageHeader from '../components/PageHeader'
import TableScroller from '../components/TableScroller'
import { useLang } from '../context/LanguageContext'
import { readPageCache, writePageCache } from '../lib/pageCache'
import { amountClass } from '../lib/utils'
import { ZeroAmount } from '../components/CellValue'
import { BALANCE_TABS, accountTotals, saleRemainderForAccount, splitPaymentCoverage, type BalanceColumn } from '../lib/balanceTabs'

const BALANCE_CACHE_KEY = 'balance-accounts'

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

/**
 * The mark beside a figure: an arrow saying which way the money went, or - on
 * the figure that closes a tab - a dot coloured by whether it is in the black.
 *
 * A zero carries no arrow. "Nothing moved" is not a direction, and an arrow on
 * every empty cell is noise across a table where most cells are empty.
 */
function FlowMark({ column, value, onDark = false }: { column: BalanceColumn; value: number; onDark?: boolean }) {
  if (column.closing) {
    return (
      <span
        aria-hidden="true"
        className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${value < 0 ? 'bg-brand-red' : onDark ? 'bg-emerald-400' : 'bg-brand-green'}`}
      />
    )
  }
  if (column.flow === 'none' || !value) return null
  return (
    <span aria-hidden="true" className={`shrink-0 text-[9px] leading-none ${onDark ? 'text-white/60' : 'text-slate-400'}`}>
      {column.flow === 'in' ? '↑' : '↓'}
    </span>
  )
}

export default function Balance() {
  const { t, formatCurr } = useLang()
  // Paint last-known accounts instantly; only show the spinner on a true cold
  // start (no cache yet). The background refetch below refreshes the numbers.
  const cachedAccounts = readPageCache<AccountRow[]>(BALANCE_CACHE_KEY)
  const [accounts, setAccounts] = useState<AccountRow[]>(cachedAccounts || [])
  const [loading, setLoading] = useState(!cachedAccounts)
  // Opens on At a Glance every visit - the page is for answering "where do we
  // stand", and the other tabs are for when that raises a question.
  const [tab, setTab] = useState(BALANCE_TABS[0].key)

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
    // Sales are filtered to status 'completed' above; the payment rows were not.
    // A sale patched to another status kept feeding its payments into the account
    // balance while its own paid_amount had dropped out - so the balance counted
    // money from a sale the rest of the page had stopped counting. A payment with
    // no sale_id at all is kept: it is still money that landed in an account.
    const completedSaleIds = new Set<string>(sales.map((sale: any) => String(sale.id)))
    const belongsToCountedSale = (payment: any) => !payment.sale_id || completedSaleIds.has(payment.sale_id)
    const salePayments = [
      ...dbSalePayments,
      ...fallbackPayments.filter((payment: any) => !dbSplitSaleIds.has(payment.sale_id))
    ].filter(belongsToCountedSale)
    const custPays = custPayRes.data || []
    const supplierPays = supplierPayRes.data || []
    const otherIncomes = otherIncomeRes.data || []

    function sumBy(arr: any[], accountId: string, field: string) {
      return arr.filter(r => r.account_id === accountId).reduce((s, r) => s + Number(r[field] || 0), 0)
    }
    // See splitPaymentCoverage / saleRemainderForAccount in lib/balanceTabs for
    // why this counts the remainder rather than excluding the whole sale.
    const coveredBySplitRows = splitPaymentCoverage(salePayments, completedSaleIds)

    const rows: AccountRow[] = accs.map(acc => {
      const total_invest = sumBy(investments, acc.id, 'invest_amount')
      const invest_withdraw = sumBy(investments, acc.id, 'withdraw_amount')
      const profit_withdraw = sumBy(profits, acc.id, 'amount')
      const loan_recv = loans.filter(r => r.account_id === acc.id).reduce((s, r) => s + Number(r.received_amount || 0), 0)
      const loan_payment = loans.filter(r => r.account_id === acc.id).reduce((s, r) => s + Number(r.payment_amount || 0), 0)
      const supplier_payment = sumBy(supplierPays, acc.id, 'amount')
      const legacyCashSales = sales
        .filter(r => r.account_id === acc.id)
        .reduce((s, r) => s + saleRemainderForAccount(r, coveredBySplitRows), 0)
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
    writePageCache(BALANCE_CACHE_KEY, rows)
    setLoading(false)
  }

  // Closed accounts sink to the bottom: they are history, and with thirteen
  // accounts they were pushing the live ones out of the first screen. Within
  // each group the API sort_order is kept, so the working accounts stay in
  // the order the owner arranged them.
  const displayedAccounts = useMemo(
    () => [...accounts].sort((a, b) => Number(a.is_active === false) - Number(b.is_active === false)),
    [accounts],
  )

  const totalBalance = accounts.reduce((s, a) => s + a.current_balance, 0)
  const inactiveAmount = accounts.filter(a => !a.is_active).reduce((s, a) => s + a.current_balance, 0)
  const availableBalance = accounts.filter(a => a.is_active).reduce((s, a) => s + a.current_balance, 0)

  // Each row carries its own derived figures, so a cell only ever reads a key.
  const tabRows = useMemo(
    () => displayedAccounts.map(account => ({ ...account, ...accountTotals(account) })),
    [displayedAccounts],
  )

  const activeTab = BALANCE_TABS.find(item => item.key === tab) || BALANCE_TABS[0]
  const columns = activeTab.columns

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

      <div className="card p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
          <h3 className="font-semibold text-slate-800">{t('balance_accountDetails')}</h3>
          <div className="flex flex-wrap items-center gap-1">
            {BALANCE_TABS.map(item => (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                aria-pressed={item.key === tab}
                className={
                  item.key === tab
                    ? 'btn-primary !px-3 !py-1.5 !text-xs'
                    : 'rounded-full px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-neutral-100 hover:text-slate-900'
                }
              >
                {t(item.labelKey)}
              </button>
            ))}
          </div>
        </div>
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin w-6 h-6 border-4 border-brand-green border-t-transparent rounded-full" />
          </div>
        ) : (
          // Four to six columns fit, so the first two no longer need to stick
          // - the shadow of a frozen column against a table that does not
          // scroll is just an artefact. TableScroller still catches a narrow
          // window.
          <TableScroller className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="table-header sticky top-0">
                <tr>
                  <th className="w-12 py-3 px-3 text-left">#</th>
                  <th className="min-w-[200px] py-3 px-4 text-left">{t('common_account')}</th>
                  {columns.map(col => (
                    <th key={col.key} className="text-right py-3 px-3 min-w-[110px] whitespace-nowrap">{t(col.labelKey)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tabRows.map((acc, index) => (
                  <tr key={acc.id} className={`table-row ${!acc.is_active ? 'bg-red-50/70 text-red-900 hover:bg-red-50' : ''}`}>
                    <td className="w-12 py-2.5 px-3 font-medium text-slate-500">{index + 1}</td>
                    <td className="py-2.5 px-4 font-medium text-slate-800">
                      <div className="flex max-w-[260px] items-center gap-2 whitespace-nowrap" title={acc.name}>
                        <span className="truncate">{acc.name}</span>
                        {!acc.is_active && <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">{t('common_inactive')}</span>}
                      </div>
                    </td>
                    {columns.map(col => {
                      const val = (acc as any)[col.key] || 0
                      return (
                        <td key={col.key} className={`py-2.5 px-3 text-right ${amountClass(val, col.color)}`}>
                          <span className="inline-flex items-center justify-end gap-1 whitespace-nowrap">
                            {val === 0 ? <ZeroAmount /> : formatCurr(val)}
                            <FlowMark column={col} value={val} />
                          </span>
                        </td>
                      )
                    })}
                  </tr>
                ))}
                <tr className="bg-slate-900 text-white">
                  <td className="w-12 py-2.5 px-3 font-semibold"></td>
                  <td className="py-2.5 px-4 font-semibold">{t('common_total')}</td>
                  {columns.map(col => {
                    const total = tabRows.reduce((s, a) => s + ((a as any)[col.key] || 0), 0)
                    return (
                      // A lighter red than text-brand-red: this row sits on
                      // slate-900, where the darker one is hard to pick out.
                      <td key={col.key} className={`py-2.5 px-3 text-right font-semibold ${total < 0 ? 'text-red-400' : ''}`}>
                        <span className="inline-flex items-center justify-end gap-1 whitespace-nowrap">
                          {total === 0 ? <ZeroAmount /> : formatCurr(total)}
                          <FlowMark column={col} value={total} onDark />
                        </span>
                      </td>
                    )
                  })}
                </tr>
              </tbody>
            </table>
          </TableScroller>
        )}
      </div>
    </div>
  )
}
