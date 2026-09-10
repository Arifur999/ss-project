import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useReactToPrint } from 'react-to-print'
import { PrinterIcon as Printer } from '@phosphor-icons/react'
import toast from 'react-hot-toast'
import PageHeader from '../components/PageHeader'
import PeriodFilter from '../components/PeriodFilter'
import SearchableSelect from '../components/SearchableSelect'
import TableSkeleton from '../components/TableSkeleton'
import { NoValue, ZeroAmount } from '../components/CellValue'
import { supabase } from '../lib/supabase'
import { formatDate, todayISO } from '../lib/utils'
import { useLang } from '../context/LanguageContext'
import { periodLabel, periodToRange, type Period } from '../lib/periodFilter'
import { buildAccountLedger, type AccountLedgerSources } from '../lib/accountLedger'
import { resolveBusinessName } from '../lib/businessBrand'
import { fallbackSalePayments } from '../lib/salePaymentsFallback'

/**
 * One cash or bank account, read like a passbook.
 *
 * The Balance Dashboard says what is IN an account. This says how it got there:
 * every movement from all eleven tables that touch an account, in date order,
 * with the balance running down the right-hand edge.
 *
 * Built in the browser rather than on the server, unlike the Loan Statement -
 * because the Balance Dashboard already loads exactly these eleven tables to
 * compute its figures, so the data is the cost this section already pays. The
 * arithmetic itself lives in lib/accountLedger.ts, where a test pins its
 * closing balance to the Balance Dashboard's own expression.
 */
export default function AccountLedger() {
  const { formatCurr } = useLang()
  const [accounts, setAccounts] = useState<any[]>([])
  const [accountId, setAccountId] = useState('')
  const [sources, setSources] = useState<AccountLedgerSources | null>(null)
  const [business, setBusiness] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<Period>('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const printRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void loadAll()
  }, [])

  async function loadAll() {
    try {
      setLoading(true)
      // The same eleven reads the Balance Dashboard makes, for the same reason:
      // an account's history is spread across every module that moves money.
      const [
        accountRes, investRes, profitRes, loanRes, transferRes, expenseRes,
        salesRes, salePayRes, custPayRes, supplierPayRes, otherIncomeRes, businessRes,
      ] = await Promise.all([
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
        supabase.from('business_settings').select('name_bn, name_en, phone, email, address').maybeSingle(),
      ])

      const sales = salesRes.data || []
      const dbSalePayments = salePayRes.data || []
      // Lifted from Balance.tsx unchanged, and it has to be: a payment row for a
      // sale that is no longer completed must drop out with the sale, or this
      // ledger counts money the dashboard has stopped counting. A payment with
      // no sale_id is kept - it still landed in an account.
      const dbSplitSaleIds = new Set(dbSalePayments.map((payment: any) => payment.sale_id).filter(Boolean))
      const completedSaleIds = new Set<string>(sales.map((sale: any) => String(sale.id)))
      const salePayments = [
        ...dbSalePayments,
        ...fallbackSalePayments().filter((payment: any) => !dbSplitSaleIds.has(payment.sale_id)),
      ].filter((payment: any) => !payment.sale_id || completedSaleIds.has(payment.sale_id))

      setAccounts(accountRes.data || [])
      setBusiness(businessRes.data || null)
      setSources({
        investments: investRes.data || [],
        profitWithdrawals: profitRes.data || [],
        loans: loanRes.data || [],
        transfers: transferRes.data || [],
        expenses: expenseRes.data || [],
        sales,
        salePayments,
        customerPayments: custPayRes.data || [],
        supplierPayments: supplierPayRes.data || [],
        otherIncomes: otherIncomeRes.data || [],
      })
    } catch (error: any) {
      toast.error(error?.message || 'Could not load the account ledger')
    } finally {
      setLoading(false)
    }
  }

  const account = accounts.find(row => row.id === accountId) || null

  const ledger = useMemo(() => {
    if (!account || !sources) return null
    const range = periodToRange(period, fromDate, toDate)
    return buildAccountLedger({ account, sources, from: range.from, to: range.to })
  }, [account, sources, period, fromDate, toDate])

  const handlePrint = useReactToPrint({
    content: () => printRef.current,
    documentTitle: `account-${account?.name || 'ledger'}-${todayISO()}`,
  })

  // Phone and email on one line, and nothing at all when Settings holds
  // neither - an empty "Phone:  Email:" is worse than no line.
  function businessContactLine() {
    return [
      business?.phone ? `Phone: ${business.phone}` : '',
      business?.email ? `Email: ${business.email}` : '',
    ].filter(Boolean).join('  |  ')
  }

  const balanceClass = (amount: number) => (amount < 0 ? 'text-brand-red' : 'text-brand-green')

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        title="Account Ledger"
        subtitle="One account, every movement through it, with the balance carried forward"
        actions={
          <button
            onClick={() => handlePrint()}
            disabled={!ledger}
            className="btn-secondary disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Printer size={16} /> Print / PDF
          </button>
        }
      />

      <div className="card grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] md:items-end">
        <div>
          <label className="label">Account</label>
          <SearchableSelect
            value={accountId}
            onChange={setAccountId}
            options={accounts.map(row => ({ value: row.id, label: row.name }))}
            placeholder="Select an account"
          />
        </div>
        {/* All Time by default, so choosing an account is enough to see the
            whole passbook. Everything before the window is folded into the
            opening balance, never dropped. */}
        <div>
          <label className="label">Period</label>
          <PeriodFilter
            period={period} setPeriod={setPeriod}
            from={fromDate} setFrom={setFromDate}
            to={toDate} setTo={setToDate}
          />
        </div>
      </div>

      {ledger && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="card">
            <p className="text-xs text-neutral-500">Opening Balance</p>
            <p className={`mt-1 text-lg font-bold tabular-nums ${balanceClass(ledger.opening)}`}>{formatCurr(ledger.opening)}</p>
          </div>
          <div className="card">
            <p className="text-xs text-neutral-500">Total In</p>
            <p className="mt-1 text-lg font-bold tabular-nums text-brand-green">{formatCurr(ledger.total_in)}</p>
          </div>
          <div className="card">
            <p className="text-xs text-neutral-500">Total Out</p>
            <p className="mt-1 text-lg font-bold tabular-nums text-brand-red">{formatCurr(ledger.total_out)}</p>
          </div>
          <div className="card">
            <p className="text-xs text-neutral-500">Closing Balance</p>
            <p className={`mt-1 text-lg font-bold tabular-nums ${balanceClass(ledger.closing)}`}>{formatCurr(ledger.closing)}</p>
          </div>
        </div>
      )}

      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="table-header">
            <tr>
              <th className="text-left py-2.5 px-4">Date</th>
              <th className="text-left py-2.5 px-4">Type</th>
              <th className="text-left py-2.5 px-4">Reference</th>
              <th className="text-left py-2.5 px-4">Description</th>
              <th className="text-right py-2.5 px-4">In</th>
              <th className="text-right py-2.5 px-4">Out</th>
              <th className="text-right py-2.5 px-4">Balance</th>
            </tr>
          </thead>
          <tbody>
            {loading && <TableSkeleton rows={6} cols={7} />}

            {!loading && ledger && (
              <tr className="border-t border-neutral-100 bg-neutral-50">
                <td className="py-2.5 px-4 text-neutral-500">{fromDate && period === 'custom' ? formatDate(fromDate) : ''}</td>
                <td className="py-2.5 px-4 font-semibold text-navy-900" colSpan={5}>Opening Balance</td>
                <td className={`py-2.5 px-4 text-right font-bold tabular-nums ${balanceClass(ledger.opening)}`}>
                  {formatCurr(ledger.opening)}
                </td>
              </tr>
            )}

            {!loading && ledger?.rows.map((row, index) => (
              <tr key={`${row.kind}-${row.date}-${index}`} className="border-t border-neutral-100">
                <td className="py-2.5 px-4">{row.date ? formatDate(row.date) : <NoValue />}</td>
                <td className="py-2.5 px-4 text-neutral-600">{row.kind}</td>
                <td className="py-2.5 px-4 text-neutral-600">{row.reference || <NoValue />}</td>
                <td className="py-2.5 px-4 text-neutral-600">{row.description || <NoValue />}</td>
                <td className="py-2.5 px-4 text-right tabular-nums text-brand-green">
                  {row.direction === 'in' ? formatCurr(row.amount) : <ZeroAmount />}
                </td>
                <td className="py-2.5 px-4 text-right tabular-nums text-brand-red">
                  {row.direction === 'out' ? formatCurr(row.amount) : <ZeroAmount />}
                </td>
                <td className={`py-2.5 px-4 text-right font-semibold tabular-nums ${balanceClass(row.balance)}`}>
                  {formatCurr(row.balance)}
                </td>
              </tr>
            ))}

            {!loading && !ledger && (
              <tr>
                <td colSpan={7} className="py-16 text-center text-neutral-400">
                  Choose an account to see its ledger.
                </td>
              </tr>
            )}

            {!loading && ledger && ledger.rows.length === 0 && (
              <tr>
                <td colSpan={7} className="py-16 text-center text-neutral-400">
                  No movements in this period.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Parked off-screen rather than hidden: display:none would give
          react-to-print nothing to measure. The house pattern. */}
      <div className="fixed -left-[9999px] top-0">
        <div ref={printRef} className="invoice-print-page" style={{ padding: '8mm', color: '#000' }}>
          <div style={{ borderBottom: '2px solid #000', paddingBottom: '8px', marginBottom: '12px' }}>
            <p style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>{resolveBusinessName(business)}</p>
            {businessContactLine() && <p style={{ margin: '2px 0 0', fontSize: '11px' }}>{businessContactLine()}</p>}
            {business?.address && <p style={{ margin: '1px 0 0', fontSize: '11px' }}>{business.address}</p>}
          </div>

          <h1 style={{ margin: '0 0 6px', fontSize: '17px', fontWeight: 700 }}>Account Ledger</h1>
          <p style={{ margin: '0 0 2px', fontSize: '13px', fontWeight: 700 }}>{account?.name}</p>
          <p style={{ margin: '0 0 14px', fontSize: '12px' }}>{periodLabel(period, fromDate, toDate)}</p>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
            <thead>
              <tr>
                {['Date', 'Type', 'Reference', 'Description', 'In', 'Out', 'Balance'].map((label, index) => (
                  <th
                    key={label}
                    style={{ textAlign: index > 3 ? 'right' : 'left', padding: '6px 4px', borderBottom: '1.5px solid #000' }}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding: '5px 4px', borderBottom: '1px solid #ddd' }}>
                  {fromDate && period === 'custom' ? formatDate(fromDate) : ''}
                </td>
                <td style={{ padding: '5px 4px', borderBottom: '1px solid #ddd', fontWeight: 700 }} colSpan={5}>Opening Balance</td>
                <td style={{ padding: '5px 4px', borderBottom: '1px solid #ddd', textAlign: 'right', fontWeight: 700 }}>
                  {formatCurr(ledger?.opening || 0)}
                </td>
              </tr>
              {ledger?.rows.map((row, index) => (
                <tr key={`print-${row.kind}-${row.date}-${index}`}>
                  <td style={{ padding: '5px 4px', borderBottom: '1px solid #ddd' }}>{row.date ? formatDate(row.date) : '-'}</td>
                  <td style={{ padding: '5px 4px', borderBottom: '1px solid #ddd' }}>{row.kind}</td>
                  <td style={{ padding: '5px 4px', borderBottom: '1px solid #ddd' }}>{row.reference || '-'}</td>
                  <td style={{ padding: '5px 4px', borderBottom: '1px solid #ddd' }}>{row.description || '-'}</td>
                  <td style={{ padding: '5px 4px', borderBottom: '1px solid #ddd', textAlign: 'right' }}>
                    {row.direction === 'in' ? formatCurr(row.amount) : '-'}
                  </td>
                  <td style={{ padding: '5px 4px', borderBottom: '1px solid #ddd', textAlign: 'right' }}>
                    {row.direction === 'out' ? formatCurr(row.amount) : '-'}
                  </td>
                  <td style={{ padding: '5px 4px', borderBottom: '1px solid #ddd', textAlign: 'right', fontWeight: 600 }}>
                    {formatCurr(row.balance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <table style={{ width: '100%', marginTop: '16px', fontSize: '12px' }}>
            <tbody>
              <tr>
                <td style={{ fontWeight: 700 }}>Total In</td>
                <td style={{ textAlign: 'right' }}>{formatCurr(ledger?.total_in || 0)}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 700 }}>Total Out</td>
                <td style={{ textAlign: 'right' }}>{formatCurr(ledger?.total_out || 0)}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 700, paddingTop: '6px', borderTop: '1.5px solid #000' }}>Closing Balance</td>
                <td style={{ textAlign: 'right', fontWeight: 700, paddingTop: '6px', borderTop: '1.5px solid #000' }}>
                  {formatCurr(ledger?.closing || 0)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
