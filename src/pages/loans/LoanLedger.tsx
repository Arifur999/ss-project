import React, { useEffect, useRef, useState } from 'react'
import { useReactToPrint } from 'react-to-print'
import { PrinterIcon as Printer, MagnifyingGlassIcon as Search } from '@phosphor-icons/react'
import toast from 'react-hot-toast'
import PageHeader from '../../components/PageHeader'
import { supabase } from '../../lib/supabase'
import { formatDate, todayISO } from '../../lib/utils'
import { useLang } from '../../context/LanguageContext'
import { categoryDetail, loanBalanceColor, loanBalanceLabel } from './loanUtils'
import { isLoanLenderTableMissing, mergeStoredAndLegacyLoanLenders, mergeStoredAndLoanLenders } from './loanFallback'
import TableSkeleton from '../../components/TableSkeleton'
import { NoValue, ZeroAmount } from '../../components/CellValue'
import { getLenderStatement, type LenderStatement } from '../../services/finance.services'
import { resolveBusinessName } from '../../lib/businessBrand'
import PeriodFilter from '../../components/PeriodFilter'
import { periodToRange, type Period } from '../../lib/periodFilter'

/**
 * One account, one window, read like a passbook.
 *
 * The opening balance is the whole point of the date filter: everything before
 * the from-date is folded into a single carried-forward figure server-side, so
 * a September statement starts exactly where August closed. Computing that here
 * would mean downloading every transaction the business has ever made to show
 * one month.
 *
 * The rule the columns exist for: a PROFIT row shows in Debit or Credit like
 * any other movement, because the cash really moved - but it leaves the running
 * principal exactly where it was, because what is owed did not change.
 */
export default function LoanLedger() {
  const { formatCurr } = useLang()
  const [lenders, setLenders] = useState<any[]>([])
  const [lenderId, setLenderId] = useState('')
  const [lenderSearch, setLenderSearch] = useState('')
  const [showLenderOptions, setShowLenderOptions] = useState(false)
  // 'all' by default: the statement opens on the whole account. To Date used
  // to be pre-filled with today while From Date sat empty, which read as a
  // range that had been chosen when it had not.
  const [period, setPeriod] = useState<Period>('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [statement, setStatement] = useState<LenderStatement | null>(null)
  const [business, setBusiness] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const lenderBoxRef = useRef<HTMLDivElement>(null)
  const printRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void loadLenders()
    void loadBusiness()
  }, [])

  // Whose statement this is. A printed page that leaves the shop off is a page
  // the person receiving it cannot file.
  async function loadBusiness() {
    const { data } = await supabase.from('business_settings').select('name_bn, name_en, phone, email, address').maybeSingle()
    setBusiness(data || null)
  }

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (lenderBoxRef.current && !lenderBoxRef.current.contains(event.target as Node)) {
        setShowLenderOptions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function loadLenders() {
    const lenderRes = await supabase.from('loan_lenders').select('*').order('name')
    if (isLoanLenderTableMissing(lenderRes.error)) {
      const legacy = await supabase.from('loans').select('*')
      setLenders(mergeStoredAndLegacyLoanLenders(legacy.data || []))
      return
    }
    setLenders(mergeStoredAndLoanLenders(lenderRes.data || []))
  }

  async function generate() {
    if (!lenderId) {
      toast.error('Choose a bank / person first')
      return
    }

    try {
      setLoading(true)
      // periodToRange turns the dropdown into the bounds the server takes.
      // All Time sends neither, which is what makes the whole history come back.
      const range = periodToRange(period, fromDate, toDate)
      setStatement(await getLenderStatement(lenderId, range.from, range.to))
    } catch (error: any) {
      toast.error(error?.message || 'Could not build the statement')
      setStatement(null)
    } finally {
      setLoading(false)
    }
  }

  // The house print pattern, so this comes out on A4 like every invoice.
  const handlePrint = useReactToPrint({
    content: () => printRef.current,
    // todayISO(), not toDate: on All Time there is no to-date, and a file named
    // "statement-Arif-" helps nobody find it again.
    documentTitle: `statement-${statement?.lender.name || 'account'}-${statement?.to || todayISO()}`,
  })

  const filteredLenders = lenders.filter(lender =>
    !lenderSearch.trim() ||
    String(lender.name || '').toLowerCase().includes(lenderSearch.trim().toLowerCase()) ||
    String(lender.phone || '').includes(lenderSearch.trim())
  )

  const selectedLender = lenders.find(lender => lender.id === lenderId)
  const rows = statement?.rows ?? []

  const balanceText = (amount: number) => {
    const label = loanBalanceLabel(amount)
    return label === 'Balanced' ? formatCurr(0) : `${label} ${formatCurr(Math.abs(amount))}`
  }

  // Phone and email on one line, and nothing at all when Settings holds
  // neither - an empty "Phone:  Email:" is worse than no line.
  function businessContactLine() {
    return [
      business?.phone ? `Phone: ${business.phone}` : '',
      business?.email ? `Email: ${business.email}` : '',
    ].filter(Boolean).join('  |  ')
  }

  // The window as a sentence, for the printed header.
  const periodText = statement
    ? `${statement.from ? formatDate(statement.from) : 'the beginning'} to ${statement.to ? formatDate(statement.to) : formatDate(todayISO())}`
    : ''

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        title="Loan Statement"
        subtitle="One account, one date range, with the balance carried forward"
        actions={
          <button
            onClick={() => handlePrint()}
            disabled={!statement || rows.length === 0}
            className="btn-secondary disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Printer size={16} /> Print / PDF
          </button>
        }
      />

      {/* Three tracks now, not four: the two date boxes became one dropdown. */}
      <div className="card grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] md:items-end">
        <div ref={lenderBoxRef} className="relative">
          <label className="label">Bank / Person</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 z-10 -translate-y-1/2 text-slate-400" size={16} />
            <input
              className="input pl-9"
              placeholder="Search by name or phone..."
              value={selectedLender && !showLenderOptions ? selectedLender.name : lenderSearch}
              onFocus={() => { setShowLenderOptions(true); setLenderSearch('') }}
              onChange={event => { setLenderSearch(event.target.value); setShowLenderOptions(true) }}
            />
          </div>
          {showLenderOptions && (
            <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-neutral-200 bg-white shadow-lg">
              {filteredLenders.length === 0 && (
                <p className="px-3 py-3 text-sm text-neutral-400">No match</p>
              )}
              {filteredLenders.map(lender => (
                <button
                  key={lender.id}
                  type="button"
                  onClick={() => {
                    setLenderId(lender.id)
                    setLenderSearch('')
                    setShowLenderOptions(false)
                    // The old statement belongs to the old account.
                    setStatement(null)
                  }}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-neutral-50"
                >
                  <span className="font-medium text-navy-900">{lender.name}</span>
                  <span className="text-xs text-neutral-400">{lender.phone || ''}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* One dropdown, All Time by default - the same control every other
            list uses. All Time sends no bounds at all, so the statement opens
            on the account's whole history and the opening balance is simply the
            account's own, with nothing folded into it. The from/to pair appears
            only under Custom Range. */}
        <div>
          <label className="label">Period</label>
          <PeriodFilter
            period={period} setPeriod={setPeriod}
            from={fromDate} setFrom={setFromDate}
            to={toDate} setTo={setToDate}
          />
        </div>

        <button onClick={generate} disabled={loading} className="btn-primary h-11 justify-center disabled:opacity-60">
          {loading ? 'Generating...' : 'Generate'}
        </button>
      </div>

      {statement && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <div className="card">
            <p className="text-xs text-neutral-500">Opening Balance</p>
            <p className={`mt-1 text-lg font-bold tabular-nums ${loanBalanceColor(statement.opening_principal)}`}>
              {balanceText(statement.opening_principal)}
            </p>
          </div>
          <div className="card">
            <p className="text-xs text-neutral-500">Total Paid</p>
            <p className="mt-1 text-lg font-bold tabular-nums text-brand-red">{formatCurr(statement.total_paid)}</p>
          </div>
          <div className="card">
            <p className="text-xs text-neutral-500">Total Received</p>
            <p className="mt-1 text-lg font-bold tabular-nums text-brand-green">{formatCurr(statement.total_received)}</p>
          </div>
          <div className="card">
            <p className="text-xs text-neutral-500">Total Profit</p>
            <p className="mt-1 text-lg font-bold tabular-nums text-brand-orange">{formatCurr(statement.total_profit)}</p>
          </div>
          <div className="card">
            <p className="text-xs text-neutral-500">Net Closing Balance</p>
            <p className={`mt-1 text-lg font-bold tabular-nums ${loanBalanceColor(statement.closing_principal)}`}>
              {balanceText(statement.closing_principal)}
            </p>
          </div>
        </div>
      )}

      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="table-header">
            <tr>
              <th className="text-left py-2.5 px-4">Date</th>
              <th className="text-left py-2.5 px-4">Ref</th>
              <th className="text-left py-2.5 px-4">Description</th>
              <th className="text-left py-2.5 px-4">Category</th>
              <th className="text-right py-2.5 px-4">Debit (Paid)</th>
              <th className="text-right py-2.5 px-4">Credit (Received)</th>
              <th className="text-right py-2.5 px-4">Running Principal</th>
            </tr>
          </thead>
          <tbody>
            {loading && <TableSkeleton rows={6} cols={7} />}

            {!loading && statement && (
              <tr className="border-t border-neutral-100 bg-neutral-50">
                <td className="py-2.5 px-4 text-neutral-500">
                  {statement.from ? formatDate(statement.from) : ''}
                </td>
                <td className="py-2.5 px-4" />
                <td className="py-2.5 px-4 font-semibold text-navy-900" colSpan={4}>Opening Balance</td>
                <td className={`py-2.5 px-4 text-right font-bold tabular-nums ${loanBalanceColor(statement.opening_principal)}`}>
                  {formatCurr(statement.opening_principal)}
                </td>
              </tr>
            )}

            {!loading && rows.map((entry, index) => (
              <tr key={entry.row.id || index} className="border-t border-neutral-100">
                <td className="py-2.5 px-4">{formatDate(entry.row.date)}</td>
                <td className="py-2.5 px-4 font-mono text-xs text-neutral-500">
                  {String(entry.row.id || '').slice(0, 8) || <NoValue />}
                </td>
                <td className="py-2.5 px-4 text-neutral-600">
                  {entry.row.notes || entry.row.account_name || <NoValue />}
                </td>
                <td className="py-2.5 px-4">
                  {entry.is_profit
                    ? <>
                        <span className="rounded bg-brand-orange-soft px-2 py-0.5 text-xs font-medium text-brand-orange">Profit</span>
                        {/* This is the screen the owner reconciles against the
                            Expenses page, so it answers the next question. */}
                        {categoryDetail(entry.row) && <div className="mt-0.5 text-xs text-neutral-400">{categoryDetail(entry.row)}</div>}
                      </>
                    : <span className="text-neutral-500">Principal</span>}
                </td>
                <td className="py-2.5 px-4 text-right tabular-nums text-brand-red">
                  {entry.debit ? formatCurr(entry.debit) : <ZeroAmount />}
                </td>
                <td className="py-2.5 px-4 text-right tabular-nums text-brand-green">
                  {entry.credit ? formatCurr(entry.credit) : <ZeroAmount />}
                </td>
                {/* Held still by a profit row - greyed so an unchanged number
                    reads as deliberate rather than as a figure that failed to
                    update. */}
                <td className={`py-2.5 px-4 text-right font-semibold tabular-nums ${entry.is_profit ? 'text-neutral-400' : ''}`}>
                  {formatCurr(entry.running_principal)}
                </td>
              </tr>
            ))}

            {!loading && statement && rows.length > 0 && (
              <tr className="table-total border-t-2 border-navy-900">
                <td className="py-3 px-4 font-bold" colSpan={4}>Closing Balance</td>
                <td className="py-3 px-4 text-right font-bold tabular-nums">{formatCurr(statement.total_paid)}</td>
                <td className="py-3 px-4 text-right font-bold tabular-nums">{formatCurr(statement.total_received)}</td>
                <td className="py-3 px-4 text-right font-bold tabular-nums">{formatCurr(statement.closing_principal)}</td>
              </tr>
            )}

            {!loading && !statement && (
              <tr>
                <td colSpan={7} className="py-12 text-center text-neutral-400">
                  Choose an account and a date range, then press Generate.
                </td>
              </tr>
            )}

            {!loading && statement && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="py-12 text-center text-neutral-400">
                  Nothing moved on this account in that range.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Parked off screen rather than display:none - a node with no layout can
          be copied into the print frame empty. */}
      <div aria-hidden className="pointer-events-none fixed -left-[9999px] top-0">
        <div ref={printRef} className="invoice-print-page" style={{ padding: '8mm', color: '#000' }}>
          {/* The shop first, the way a letterhead reads - this page goes out to
              somebody who needs to know who sent it. */}
          <div style={{ borderBottom: '2px solid #000', paddingBottom: '8px', marginBottom: '12px' }}>
            <p style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>{resolveBusinessName(business)}</p>
            {businessContactLine() && (
              <p style={{ margin: '2px 0 0', fontSize: '11px' }}>{businessContactLine()}</p>
            )}
            {business?.address && (
              <p style={{ margin: '1px 0 0', fontSize: '11px' }}>{business.address}</p>
            )}
          </div>

          <h1 style={{ margin: '0 0 6px', fontSize: '17px', fontWeight: 700 }}>Loan Statement</h1>
          <p style={{ margin: '0 0 2px', fontSize: '13px', fontWeight: 700 }}>{statement?.lender.name}</p>
          {statement?.lender.phone && (
            <p style={{ margin: '0 0 2px', fontSize: '12px' }}>{statement.lender.phone}</p>
          )}
          <p style={{ margin: '0 0 14px', fontSize: '12px' }}>{periodText}</p>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
            <thead>
              <tr>
                {['Date', 'Ref', 'Description', 'Category', 'Debit', 'Credit', 'Running Principal'].map((column, index) => (
                  <th
                    key={column}
                    style={{
                      textAlign: index >= 4 ? 'right' : 'left',
                      padding: '6px 4px', borderBottom: '1.5px solid #000',
                    }}
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding: '5px 4px', borderBottom: '1px solid #ddd' }}>
                  {statement?.from ? formatDate(statement.from) : ''}
                </td>
                <td style={{ padding: '5px 4px', borderBottom: '1px solid #ddd' }} />
                <td style={{ padding: '5px 4px', borderBottom: '1px solid #ddd', fontWeight: 700 }} colSpan={4}>
                  Opening Balance
                </td>
                <td style={{ padding: '5px 4px', borderBottom: '1px solid #ddd', textAlign: 'right', fontWeight: 700 }}>
                  {formatCurr(statement?.opening_principal ?? 0)}
                </td>
              </tr>
              {rows.map((entry, index) => (
                <tr key={`print-${entry.row.id || index}`}>
                  <td style={{ padding: '5px 4px', borderBottom: '1px solid #ddd' }}>{formatDate(entry.row.date)}</td>
                  <td style={{ padding: '5px 4px', borderBottom: '1px solid #ddd' }}>{String(entry.row.id || '').slice(0, 8)}</td>
                  <td style={{ padding: '5px 4px', borderBottom: '1px solid #ddd' }}>{entry.row.notes || entry.row.account_name || '-'}</td>
                  <td style={{ padding: '5px 4px', borderBottom: '1px solid #ddd' }}>
                    {entry.is_profit ? `Profit${categoryDetail(entry.row) ? ` - ${categoryDetail(entry.row)}` : ''}` : 'Principal'}
                  </td>
                  <td style={{ padding: '5px 4px', borderBottom: '1px solid #ddd', textAlign: 'right' }}>{entry.debit ? formatCurr(entry.debit) : '-'}</td>
                  <td style={{ padding: '5px 4px', borderBottom: '1px solid #ddd', textAlign: 'right' }}>{entry.credit ? formatCurr(entry.credit) : '-'}</td>
                  <td style={{ padding: '5px 4px', borderBottom: '1px solid #ddd', textAlign: 'right' }}>{formatCurr(entry.running_principal)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <table style={{ width: '100%', marginTop: '16px', fontSize: '12px' }}>
            <tbody>
              <tr><td style={{ fontWeight: 700 }}>Total Paid</td><td style={{ textAlign: 'right' }}>{formatCurr(statement?.total_paid ?? 0)}</td></tr>
              <tr><td style={{ fontWeight: 700 }}>Total Received</td><td style={{ textAlign: 'right' }}>{formatCurr(statement?.total_received ?? 0)}</td></tr>
              <tr><td style={{ fontWeight: 700 }}>Total Profit</td><td style={{ textAlign: 'right' }}>{formatCurr(statement?.total_profit ?? 0)}</td></tr>
              <tr>
                <td style={{ fontWeight: 700, paddingTop: '6px', borderTop: '1.5px solid #000' }}>Net Closing Balance</td>
                <td style={{ textAlign: 'right', fontWeight: 700, paddingTop: '6px', borderTop: '1.5px solid #000' }}>
                  {balanceText(statement?.closing_principal ?? 0)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
