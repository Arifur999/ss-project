import React, { useEffect, useMemo, useState } from 'react'
import { Calendar } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import { useAuth } from '../../context/AuthContext'
import { useLang } from '../../context/LanguageContext'
import { readOtherIncomeFallbackRows } from '../../lib/otherIncomeFallback'
import { supabase } from '../../lib/supabase'
import { isMissingTableError } from '../../lib/supabaseErrors'

const shareholderOpeningAmountFallbackKey = 'shareholder_opening_amount_fallback_v1'
type FilterMode = 'thisMonth' | 'year' | 'custom'

function readShareholderOpeningAmountFallback() {
  try {
    return JSON.parse(localStorage.getItem(shareholderOpeningAmountFallbackKey) || '{}') as Record<string, number>
  } catch {
    return {}
  }
}

export default function ShareholderDashboard() {
  const { user } = useAuth()
  const { formatCurr } = useLang()
  const today = new Date()
  const currentYear = today.getFullYear()
  const currentMonth = `${currentYear}-${String(today.getMonth() + 1).padStart(2, '0')}`
  const [filterMode, setFilterMode] = useState<FilterMode>('thisMonth')
  const [selectedYear, setSelectedYear] = useState(currentYear)
  const [yearSearch, setYearSearch] = useState(String(currentYear))
  const [isYearComboboxOpen, setIsYearComboboxOpen] = useState(false)
  const [customStartDate, setCustomStartDate] = useState(`${currentMonth}-01`)
  const [customEndDate, setCustomEndDate] = useState(today.toISOString().split('T')[0])
  const [shareholders, setShareholders] = useState<any[]>([])
  const [investments, setInvestments] = useState<any[]>([])
  const [profitWithdrawals, setProfitWithdrawals] = useState<any[]>([])
  const [sales, setSales] = useState<any[]>([])
  const [expenses, setExpenses] = useState<any[]>([])
  const [otherIncomes, setOtherIncomes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadAll()
  }, [])

  async function loadAll() {
    try {
      setLoading(true)
      const [shareholderRes, investmentRes, profitRes, salesRes, expensesRes, otherIncomeRes] = await Promise.all([
        supabase.from('shareholders').select('*').order('sort_order'),
        supabase.from('investments').select('*'),
        supabase.from('profit_withdrawals').select('*'),
        supabase.from('sales').select('date, status, sale_items(actual_price, cost_price, qty)').eq('status', 'completed'),
        supabase.from('expenses').select('date, amount'),
        supabase.from('other_incomes').select('date, amount'),
      ])

      setShareholders(shareholderRes.data || [])
      setInvestments(investmentRes.data || [])
      setProfitWithdrawals(profitRes.data || [])
      setSales(salesRes.data || [])
      setExpenses(expensesRes.data || [])
      setOtherIncomes(otherIncomeRes.error && isMissingTableError(otherIncomeRes.error, 'other_incomes') ? readOtherIncomeFallbackRows(user?.id) : otherIncomeRes.data || [])
    } finally {
      setLoading(false)
    }
  }

  function recordOwnerMatches(record: any, shareholder: any) {
    return record.shareholder_id === shareholder.id || (!record.shareholder_id && record.shareholder_name === shareholder.name)
  }

  function monthKeyFromDate(date: string) {
    return String(date || '').slice(0, 7)
  }

  function dateInRange(date: string, startDate: string, endDate: string) {
    const value = String(date || '').slice(0, 10)
    return Boolean(value) && value >= startDate && value <= endDate
  }

  function monthKeyInRange(monthKey: string, startDate: string, endDate: string) {
    if (!monthKey) return false
    const monthStart = `${monthKey}-01`
    const [year, month] = monthKey.split('-').map(Number)
    const monthEnd = `${monthKey}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`
    return monthStart <= endDate && monthEnd >= startDate
  }

  function profitWithdrawalMonthKey(record: any) {
    const month = Number(record.profit_month || 0)
    const year = Number(record.profit_year || 0)
    if (year && month) return `${year}-${String(month).padStart(2, '0')}`
    return monthKeyFromDate(record.date)
  }

  function saleProfit(sale: any) {
    return (sale.sale_items || []).reduce((sum: number, item: any) => {
      const costPrice = Number(item.cost_price || 0)
      if (costPrice <= 0) return sum
      return sum + (Number(item.actual_price || 0) - costPrice) * Number(item.qty || 0)
    }, 0)
  }

  const period = useMemo(() => {
    if (filterMode === 'year') {
      return {
        startDate: `${selectedYear}-01-01`,
        endDate: `${selectedYear}-12-31`,
        label: `${selectedYear}`,
        eyebrow: 'Selected Year',
      }
    }

    if (filterMode === 'custom') {
      const startDate = customStartDate <= customEndDate ? customStartDate : customEndDate
      const endDate = customStartDate <= customEndDate ? customEndDate : customStartDate
      return {
        startDate,
        endDate,
        label: `${startDate} to ${endDate}`,
        eyebrow: 'Custom Range',
      }
    }

    const startDate = `${currentMonth}-01`
    const endDate = `${currentMonth}-${String(new Date(currentYear, today.getMonth() + 1, 0).getDate()).padStart(2, '0')}`
    return {
      startDate,
      endDate,
      label: new Date(`${currentMonth}-01T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      eyebrow: 'This Month',
    }
  }, [filterMode, selectedYear, customStartDate, customEndDate, currentMonth, currentYear, today])

  const yearOptions = useMemo(() => {
    const recordYears = [
      ...investments.map(record => Number(String(record.date || '').slice(0, 4))),
      ...profitWithdrawals.map(record => Number(record.profit_year || String(record.date || '').slice(0, 4))),
      ...sales.map(record => Number(String(record.date || '').slice(0, 4))),
      ...expenses.map(record => Number(String(record.date || '').slice(0, 4))),
      ...otherIncomes.map(record => Number(String(record.date || '').slice(0, 4))),
    ].filter(year => Number.isFinite(year) && year >= 2025)
    const finalYear = Math.max(currentYear + 20, ...recordYears)
    return Array.from({ length: finalYear - 2025 + 1 }, (_, index) => 2025 + index)
  }, [currentYear, investments, profitWithdrawals, sales, expenses, otherIncomes])

  const filteredYearOptions = useMemo(() => {
    const query = yearSearch.trim()
    return yearOptions
      .filter(year => !query || String(year).includes(query))
      .slice(0, 12)
  }, [yearOptions, yearSearch])

  function commitYear(value: string | number) {
    const nextYear = Number(value)
    if (!Number.isInteger(nextYear) || nextYear < 2025) return
    setSelectedYear(nextYear)
    setYearSearch(String(nextYear))
    setIsYearComboboxOpen(false)
  }

  const rows = useMemo(() => {
    const openingAmountFallback = readShareholderOpeningAmountFallback()
    const businessProfitByMonth = new Map<string, number>()
    const periodBusinessProfitByMonth = new Map<string, number>()

    sales.forEach(sale => {
      const key = monthKeyFromDate(sale.date)
      const profit = saleProfit(sale)
      businessProfitByMonth.set(key, (businessProfitByMonth.get(key) || 0) + profit)
      if (dateInRange(sale.date, period.startDate, period.endDate)) {
        periodBusinessProfitByMonth.set(key, (periodBusinessProfitByMonth.get(key) || 0) + profit)
      }
    })
    expenses.forEach(expense => {
      const key = monthKeyFromDate(expense.date)
      const amount = Number(expense.amount || 0)
      businessProfitByMonth.set(key, (businessProfitByMonth.get(key) || 0) - amount)
      if (dateInRange(expense.date, period.startDate, period.endDate)) {
        periodBusinessProfitByMonth.set(key, (periodBusinessProfitByMonth.get(key) || 0) - amount)
      }
    })
    otherIncomes.forEach(income => {
      const key = monthKeyFromDate(income.date)
      const amount = Number(income.amount || 0)
      businessProfitByMonth.set(key, (businessProfitByMonth.get(key) || 0) + amount)
      if (dateInRange(income.date, period.startDate, period.endDate)) {
        periodBusinessProfitByMonth.set(key, (periodBusinessProfitByMonth.get(key) || 0) + amount)
      }
    })

    const monthKeys = Array.from(businessProfitByMonth.keys()).sort()
    const shareholderCapitalAtMonthEnd = (shareholder: any, monthKey: string) => {
      const opening = Number(shareholder.opening_amount ?? openingAmountFallback[shareholder.id] ?? 0)
      const netMovement = investments
        .filter(record => recordOwnerMatches(record, shareholder) && monthKeyFromDate(record.date) <= monthKey)
        .reduce((sum, record) => sum + Number(record.invest_amount || 0) - Number(record.withdraw_amount || 0), 0)
      return opening + netMovement
    }

    const totalCapitalAtMonthEnd = (monthKey: string) => shareholders.reduce((sum, shareholder) => sum + shareholderCapitalAtMonthEnd(shareholder, monthKey), 0)

    return shareholders.map(shareholder => {
      const shareholderInvestments = investments.filter(record => recordOwnerMatches(record, shareholder))
      const shareholderProfits = profitWithdrawals.filter(record => recordOwnerMatches(record, shareholder))
      const periodInvestments = shareholderInvestments.filter(record => dateInRange(record.date, period.startDate, period.endDate))
      const periodProfits = shareholderProfits.filter(record => {
        if (filterMode === 'custom') return dateInRange(record.date, period.startDate, period.endDate)
        return monthKeyInRange(profitWithdrawalMonthKey(record), period.startDate, period.endDate)
      })
      const opening = Number(shareholder.opening_amount ?? openingAmountFallback[shareholder.id] ?? 0)
      const lifetimeInvested = shareholderInvestments.reduce((sum, record) => sum + Number(record.invest_amount || 0), 0)
      const lifetimeWithdrawn = shareholderInvestments.reduce((sum, record) => sum + Number(record.withdraw_amount || 0), 0)
      const periodInvested = periodInvestments.reduce((sum, record) => sum + Number(record.invest_amount || 0), 0)
      const periodWithdrawn = periodInvestments.reduce((sum, record) => sum + Number(record.withdraw_amount || 0), 0)
      const periodProfitWithdrawn = periodProfits.reduce((sum, record) => sum + Number(record.amount || 0), 0)
      const lifetimeProfitWithdrawn = shareholderProfits.reduce((sum, record) => sum + Number(record.amount || 0), 0)
      const periodProfitShare = Array.from(periodBusinessProfitByMonth.entries()).reduce((sum, [monthKey, profit]) => {
        const monthTotalCapital = totalCapitalAtMonthEnd(monthKey)
        const monthCapital = shareholderCapitalAtMonthEnd(shareholder, monthKey)
        return sum + (monthTotalCapital > 0 ? profit * (monthCapital / monthTotalCapital) : 0)
      }, 0)
      const totalHistoricalProfitShare = monthKeys.reduce((sum, monthKey) => {
        const monthTotalCapital = totalCapitalAtMonthEnd(monthKey)
        const monthCapital = shareholderCapitalAtMonthEnd(shareholder, monthKey)
        return sum + (monthTotalCapital > 0 ? (businessProfitByMonth.get(monthKey) || 0) * (monthCapital / monthTotalCapital) : 0)
      }, 0)

      return {
        id: shareholder.id,
        name: shareholder.name,
        phone: shareholder.phone || '',
        address: shareholder.address || '',
        opening,
        periodInvested,
        periodWithdrawn,
        periodProfitShare,
        periodProfitWithdrawn,
        currentRetainedProfit: totalHistoricalProfitShare - lifetimeProfitWithdrawn,
        netCapital: opening + lifetimeInvested - lifetimeWithdrawn,
      }
    })
  }, [shareholders, investments, profitWithdrawals, sales, expenses, otherIncomes, period, filterMode])

  const totalOpening = rows.reduce((sum, row) => sum + row.opening, 0)
  const totalInvested = rows.reduce((sum, row) => sum + row.periodInvested, 0)
  const totalWithdrawn = rows.reduce((sum, row) => sum + row.periodWithdrawn, 0)
  const totalPeriodProfitShare = rows.reduce((sum, row) => sum + row.periodProfitShare, 0)
  const totalProfitWithdrawn = rows.reduce((sum, row) => sum + row.periodProfitWithdrawn, 0)
  const totalRetainedProfit = rows.reduce((sum, row) => sum + row.currentRetainedProfit, 0)
  const totalCapital = rows.reduce((sum, row) => sum + row.netCapital, 0)
  const rowsWithShare = rows.map(row => ({
    ...row,
    totalSharePct: totalCapital > 0 ? (row.netCapital / totalCapital) * 100 : 0,
  }))
  const filterControls = (
    <div className="flex w-full flex-wrap items-center justify-end gap-3">
      <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
        {[
          { key: 'thisMonth', label: 'This Month' },
          { key: 'year', label: 'Year Select' },
          { key: 'custom', label: 'Custom Range' },
        ].map(option => (
          <button
            key={option.key}
            type="button"
            onClick={() => setFilterMode(option.key as FilterMode)}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
              filterMode === option.key
                ? 'bg-brand-green text-white shadow-sm'
                : 'text-slate-600 hover:bg-white hover:text-slate-900'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {filterMode === 'thisMonth' && (
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
          <Calendar size={16} className="text-slate-400" />
          {period.label}
        </div>
      )}

      {filterMode === 'year' && (
        <div className="relative">
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
            <Calendar size={16} className="text-slate-400" />
            <span className="text-sm font-medium text-slate-600">Year</span>
            <input
              type="text"
              inputMode="numeric"
              className="w-16 bg-transparent text-sm font-bold text-slate-800 outline-none"
              value={yearSearch}
              onFocus={() => setIsYearComboboxOpen(true)}
              onChange={e => {
                const value = e.target.value.replace(/\D/g, '').slice(0, 4)
                setYearSearch(value)
                setIsYearComboboxOpen(true)
                if (value.length === 4) commitYear(value)
              }}
              onBlur={() => {
                window.setTimeout(() => {
                  setIsYearComboboxOpen(false)
                  setYearSearch(String(selectedYear))
                }, 120)
              }}
              aria-label="Search year"
            />
          </label>
          {isYearComboboxOpen && (
            <div className="absolute right-0 top-full z-20 mt-1 max-h-56 w-full min-w-[132px] overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
              {filteredYearOptions.map(year => (
                <button
                  key={year}
                  type="button"
                  onMouseDown={event => event.preventDefault()}
                  onClick={() => commitYear(year)}
                  className={`block w-full px-3 py-1.5 text-left text-sm font-medium hover:bg-slate-50 ${
                    year === selectedYear ? 'bg-brand-green text-white hover:bg-brand-green' : 'text-slate-700'
                  }`}
                >
                  {year}
                </button>
              ))}
              {filteredYearOptions.length === 0 && (
                <div className="px-3 py-2 text-sm text-slate-400">No year found</div>
              )}
            </div>
          )}
        </div>
      )}

      {filterMode === 'custom' && (
        <div className="flex flex-wrap items-center justify-end gap-3">
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
            <Calendar size={16} className="text-slate-400" />
            <span className="text-sm font-medium text-slate-600">Start</span>
            <input type="date" className="bg-transparent text-sm font-bold text-slate-800 outline-none" value={customStartDate} onChange={e => setCustomStartDate(e.target.value)} />
          </label>
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
            <Calendar size={16} className="text-slate-400" />
            <span className="text-sm font-medium text-slate-600">End</span>
            <input type="date" className="bg-transparent text-sm font-bold text-slate-800 outline-none" value={customEndDate} onChange={e => setCustomEndDate(e.target.value)} />
          </label>
        </div>
      )}
    </div>
  )

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center p-6">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-green border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="p-6">
      <PageHeader title="Shareholders Dashboard" subtitle="Shareholder investment and withdrawal summary" actions={filterControls} />

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <div className="card"><p className="text-xs text-slate-500">Opening Capital</p><p className="mt-1 text-xl font-bold text-slate-800">{formatCurr(totalOpening)}</p></div>
        <div className="card"><p className="text-xs text-slate-500">Investment ({period.label})</p><p className="mt-1 text-xl font-bold text-brand-green">{formatCurr(totalInvested)}</p></div>
        <div className="card"><p className="text-xs text-slate-500">Withdraw ({period.label})</p><p className="mt-1 text-xl font-bold text-brand-red">{formatCurr(totalWithdrawn)}</p></div>
        <div className="card"><p className="text-xs text-slate-500">Profit / Loss ({period.label})</p><p className={`mt-1 text-xl font-bold ${totalPeriodProfitShare >= 0 ? 'text-brand-green' : 'text-brand-red'}`}>{formatCurr(totalPeriodProfitShare)}</p></div>
        <div className="card"><p className="text-xs text-slate-500">Current Retained Profit</p><p className={`mt-1 text-xl font-bold ${totalRetainedProfit >= 0 ? 'text-blue-700' : 'text-brand-red'}`}>{formatCurr(totalRetainedProfit)}</p></div>
        <div className="card"><p className="text-xs text-slate-500">Net Capital</p><p className="mt-1 text-xl font-bold text-slate-800">{formatCurr(totalCapital)}</p></div>
      </div>

      <div className="card overflow-x-auto p-0">
        <div className="border-b border-slate-100 p-4 font-semibold text-slate-800">Shareholder Summary</div>
        <table className="w-full text-sm">
          <thead className="table-header">
            <tr>
              <th className="px-4 py-2 text-left">#</th>
              <th className="px-4 py-2 text-left">Name</th>
              <th className="px-4 py-2 text-left">Phone</th>
              <th className="px-4 py-2 text-left">Address</th>
              <th className="px-4 py-2 text-right">Opening Amount</th>
              <th className="px-4 py-2 text-right">Investment ({period.label})</th>
              <th className="px-4 py-2 text-right">Withdraw ({period.label})</th>
              <th className="px-4 py-2 text-right">Profit / Loss Share</th>
              <th className="px-4 py-2 text-right">Profit Withdraw</th>
              <th className="px-4 py-2 text-right">Current Retained Profit</th>
              <th className="px-4 py-2 text-right">Net Capital</th>
              <th className="px-4 py-2 text-right">Total Share %</th>
            </tr>
          </thead>
          <tbody>
            {rowsWithShare.map((row, index) => (
              <tr key={row.id} className="table-row">
                <td className="px-4 py-2.5 text-slate-500">{index + 1}</td>
                <td className="px-4 py-2.5 font-medium">{row.name}</td>
                <td className="px-4 py-2.5 text-slate-500">{row.phone || '-'}</td>
                <td className="px-4 py-2.5 text-slate-500">{row.address || '-'}</td>
                <td className="px-4 py-2.5 text-right">{formatCurr(row.opening)}</td>
                <td className="px-4 py-2.5 text-right text-brand-green">{formatCurr(row.periodInvested)}</td>
                <td className="px-4 py-2.5 text-right text-brand-red">{formatCurr(row.periodWithdrawn)}</td>
                <td className={`px-4 py-2.5 text-right ${row.periodProfitShare >= 0 ? 'text-brand-green' : 'text-brand-red'}`}>{formatCurr(row.periodProfitShare)}</td>
                <td className="px-4 py-2.5 text-right text-orange-600">{formatCurr(row.periodProfitWithdrawn)}</td>
                <td className={`px-4 py-2.5 text-right font-semibold ${row.currentRetainedProfit >= 0 ? 'text-blue-700' : 'text-brand-red'}`}>{formatCurr(row.currentRetainedProfit)}</td>
                <td className="px-4 py-2.5 text-right font-bold">{formatCurr(row.netCapital)}</td>
                <td className="px-4 py-2.5 text-right font-bold text-slate-700">{row.totalSharePct.toFixed(2)}%</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={12} className="py-8 text-center text-slate-400">No shareholders found</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
