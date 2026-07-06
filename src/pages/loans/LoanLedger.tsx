import React, { useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, ChevronDown, Search, X } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import { supabase } from '../../lib/supabase'
import { formatDate } from '../../lib/utils'
import { useLang } from '../../context/LanguageContext'
import { lenderKey, lenderKeyFromLoan, loanBalanceColor, loanBalanceLabel, loanDisplayName, transactionAmounts, transactionLabel } from './loanUtils'
import { isLoanLenderTableMissing, mergeStoredAndLegacyLoanLenders, mergeStoredAndLoanLenders } from './loanFallback'

export default function LoanLedger() {
  const { formatCurr } = useLang()
  const [lenders, setLenders] = useState<any[]>([])
  const [loans, setLoans] = useState<any[]>([])
  const [selectedKey, setSelectedKey] = useState('')
  const [lenderSearch, setLenderSearch] = useState('')
  const [showLenderOptions, setShowLenderOptions] = useState(false)
  const lenderBoxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadAll()
    const channel = supabase
      .channel('loan-ledger-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'loans' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'loan_lenders' }, loadAll)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (lenderBoxRef.current && !lenderBoxRef.current.contains(event.target as Node)) {
        setShowLenderOptions(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function loadAll() {
    const [lenderRes, loanRes] = await Promise.all([
      supabase.from('loan_lenders').select('*').order('name'),
      supabase.from('loans').select('*, loan_lenders(*)').order('date', { ascending: true }).order('created_at', { ascending: true }),
    ])
    if (isLoanLenderTableMissing(lenderRes.error) || isLoanLenderTableMissing(loanRes.error)) {
      const legacyLoanRes = await supabase.from('loans').select('*').order('date', { ascending: true }).order('created_at', { ascending: true })
      const legacyLoans = legacyLoanRes.data || []
      setLoans(legacyLoans)
      setLenders(mergeStoredAndLegacyLoanLenders(legacyLoans))
      return
    }
    setLenders(mergeStoredAndLoanLenders(lenderRes.data || []))
    setLoans(loanRes.data || [])
  }

  const lenderOptionKeys = new Set(lenders.map(lender => lenderKey(lender)))
  const legacyOptions = loans
    .filter(loan => !loan.lender_id)
    .reduce((map: Record<string, any>, loan) => {
      const key = lenderKeyFromLoan(loan)
      if (!lenderOptionKeys.has(key)) {
        map[key] = { key, name: loanDisplayName(loan), opening_balance: 0 }
      }
      return map
    }, {})

  const options = [
    ...lenders.map(lender => ({ key: lenderKey(lender), name: lender.name, opening_balance: Number(lender.opening_balance || 0), lender })),
    ...Object.values(legacyOptions),
  ] as any[]

  const filteredOptions = useMemo(() => {
    const query = lenderSearch.trim().toLowerCase()
    return options.filter(option => {
      if (!query) return true
      return String(option.name || '').toLowerCase().includes(query)
    })
  }, [lenderSearch, options])

  const selected = options.find(option => option.key === selectedKey)
  const selectedLoans = loans.filter(loan => lenderKeyFromLoan(loan) === selectedKey)
  let runningBalance = Number(selected?.opening_balance || 0)
  const ledger = selectedLoans.map(loan => {
    const amounts = transactionAmounts(loan)
    runningBalance += amounts.balanceEffect
    return { ...loan, amounts, running_balance: runningBalance }
  }).reverse()

  const totalReceived = selectedLoans.reduce((s, loan) => s + transactionAmounts(loan).received, 0)
  const totalPaid = selectedLoans.reduce((s, loan) => s + transactionAmounts(loan).paid, 0)
  const totalInterest = selectedLoans.reduce((s, loan) => s + transactionAmounts(loan).interest, 0)
  const currentBalance = Number(selected?.opening_balance || 0) - totalReceived + totalInterest + totalPaid

  function selectLender(option: any) {
    setSelectedKey(option.key)
    setLenderSearch(option.name || '')
    setShowLenderOptions(false)
  }

  function clearLender() {
    setSelectedKey('')
    setLenderSearch('')
    setShowLenderOptions(true)
  }

  return (
    <div className="p-6">
      <PageHeader title="Loan Ledger" subtitle="Complete statement by bank/person" />

      <div className="w-full max-w-sm mb-6">
        <label className="label">Select Bank / Person</label>
        <div ref={lenderBoxRef} className="relative">
          <Search className="absolute left-3 top-1/2 z-10 -translate-y-1/2 text-slate-400" size={17} />
          <input
            type="text"
            className="input h-10 pl-10 pr-20"
            value={lenderSearch}
            onFocus={() => setShowLenderOptions(true)}
            onChange={event => {
              setLenderSearch(event.target.value)
              setSelectedKey('')
              setShowLenderOptions(true)
            }}
            placeholder="-- Select Bank / Person --"
            autoComplete="off"
            role="combobox"
            aria-expanded={showLenderOptions}
            aria-controls="loan-lender-options"
          />
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 z-10 -translate-y-1/2 text-slate-500" size={17} />
          {lenderSearch && (
            <button
              type="button"
              onClick={clearLender}
              className="absolute right-9 top-1/2 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 hover:bg-red-50 hover:text-brand-red"
              aria-label="Clear bank/person"
            >
              <X size={14} />
            </button>
          )}

          {showLenderOptions && (
            <div id="loan-lender-options" className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl">
              {filteredOptions.length > 0 ? (
                filteredOptions.map(option => (
                  <button
                    key={option.key}
                    type="button"
                    onMouseDown={event => event.preventDefault()}
                    onClick={() => selectLender(option)}
                    className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm transition hover:bg-green-50 ${
                      selectedKey === option.key ? 'bg-green-50 text-brand-green' : 'text-slate-700'
                    }`}
                  >
                    <span className="min-w-0 truncate font-medium">{option.name}</span>
                    {selectedKey === option.key && <span className="shrink-0 text-xs font-bold">Selected</span>}
                  </button>
                ))
              ) : (
                <div className="px-4 py-5 text-center text-sm text-slate-400">No bank/person found</div>
              )}
            </div>
          )}
        </div>
      </div>

      {!selectedKey && (
        <div className="card text-center py-12 text-slate-400">
          <BookOpen size={46} className="mx-auto mb-3 opacity-30" />
          Select a bank/person to view loan statement
        </div>
      )}

      {selectedKey && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
            <div className="card"><p className="text-xs text-slate-500">Opening Balance</p><p className={`text-xl font-bold mt-1 ${loanBalanceColor(Number(selected?.opening_balance || 0))}`}>{formatCurr(Number(selected?.opening_balance || 0))}</p></div>
            <div className="card"><p className="text-xs text-slate-500">Receive</p><p className="text-xl font-bold text-brand-green mt-1">{formatCurr(totalReceived)}</p></div>
            <div className="card"><p className="text-xs text-slate-500">Payment</p><p className="text-xl font-bold text-brand-red mt-1">{formatCurr(totalPaid)}</p></div>
            <div className="card"><p className="text-xs text-slate-500">Interest</p><p className="text-xl font-bold text-orange-600 mt-1">{formatCurr(totalInterest)}</p></div>
            <div className="card"><p className="text-xs text-slate-500">Current Balance</p><p className={`text-xl font-bold mt-1 ${loanBalanceColor(currentBalance)}`}>{formatCurr(currentBalance)} <span className="text-xs">({loanBalanceLabel(currentBalance)})</span></p></div>
          </div>

          <div className="card overflow-x-auto p-0">
            <div className="p-4 border-b border-slate-100 font-semibold text-slate-800">Transaction History</div>
            <table className="w-full text-sm">
              <thead className="table-header">
                <tr>
                  <th className="text-left py-2 px-4">Date</th>
                  <th className="text-left py-2 px-4">Type</th>
                  <th className="text-right py-2 px-4">Receive</th>
                  <th className="text-right py-2 px-4">Payment</th>
                  <th className="text-right py-2 px-4">Interest</th>
                  <th className="text-right py-2 px-4">Current Balance</th>
                  <th className="text-left py-2 px-4">Notes</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map(entry => (
                  <tr key={entry.id} className="table-row">
                    <td className="py-2.5 px-4">{formatDate(entry.date)}</td>
                    <td className="py-2.5 px-4"><span className="badge-blue">{transactionLabel(entry.amounts.type)}</span></td>
                    <td className="py-2.5 px-4 text-right text-brand-green">{entry.amounts.received ? formatCurr(entry.amounts.received) : '-'}</td>
                    <td className="py-2.5 px-4 text-right text-brand-red">{entry.amounts.paid ? formatCurr(entry.amounts.paid) : '-'}</td>
                    <td className="py-2.5 px-4 text-right text-orange-600">{entry.amounts.interest ? formatCurr(entry.amounts.interest) : '-'}</td>
                    <td className={`py-2.5 px-4 text-right font-semibold ${loanBalanceColor(entry.running_balance)}`}>
                      {formatCurr(entry.running_balance)}
                      <div className="text-xs">({loanBalanceLabel(entry.running_balance)})</div>
                    </td>
                    <td className="py-2.5 px-4 text-slate-500">{entry.notes || '-'}</td>
                  </tr>
                ))}
                {ledger.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-slate-400">No transactions</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
