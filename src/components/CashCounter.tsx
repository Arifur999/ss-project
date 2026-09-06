import React, { useMemo, useState } from 'react'
import { CalculatorIcon as Calculator, CopyIcon as Copy, EraserIcon as Eraser, CheckIcon as Check } from '@phosphor-icons/react'
import toast from 'react-hot-toast'
import Modal from './Modal'
import { confirmAction } from './ConfirmDialog'
import { useLang } from '../context/LanguageContext'
import { formatDate } from '../lib/utils'

/**
 * Counting the drawer at day end: how many of each note, what that comes to.
 *
 * Bangladeshi notes, largest first. Tk 1,000 is the biggest in circulation -
 * the 2,000 on the app this was modelled on is an Indian note and has no place
 * in a Bangladeshi till.
 *
 * Stops at Tk 5. The two and the one are coins in a shop till, not notes worth
 * counting one by one, and two rows nobody fills are two rows in the way.
 */
const DENOMINATIONS = [1000, 500, 200, 100, 50, 20, 10, 5] as const

/**
 * Kept per browser so a half-finished count survives a reload or an accidental
 * close. Nothing is sent anywhere - this is a calculator, not a record.
 */
const STORAGE_KEY = 'cash_counter_v1'

type Counts = Record<number, number>

function readStored(): { countedBy: string; counts: Counts } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { countedBy: '', counts: {} }
    const parsed = JSON.parse(raw)
    return { countedBy: String(parsed?.countedBy || ''), counts: parsed?.counts || {} }
  } catch {
    return { countedBy: '', counts: {} }
  }
}

function writeStored(countedBy: string, counts: Counts) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ countedBy, counts }))
  } catch {
    // A full quota must never stop somebody counting money.
  }
}

export default function CashCounter() {
  const { t, formatCurr, formatNum } = useLang()
  const [open, setOpen] = useState(false)
  const stored = useMemo(readStored, [])
  const [countedBy, setCountedBy] = useState(stored.countedBy)
  const [counts, setCounts] = useState<Counts>(stored.counts)
  const [copied, setCopied] = useState(false)

  const rows = DENOMINATIONS.map(value => {
    const qty = Math.max(0, Math.floor(Number(counts[value] || 0)))
    return { value, qty, amount: value * qty }
  })

  const totalNotes = rows.reduce((sum, row) => sum + row.qty, 0)
  const totalAmount = rows.reduce((sum, row) => sum + row.amount, 0)
  const hasAnything = totalNotes > 0 || countedBy.trim().length > 0

  function setCount(value: number, raw: string) {
    // Blank clears the row rather than storing 0, so the cell reads empty
    // instead of a zero somebody has to select and delete.
    const qty = raw === '' ? 0 : Math.max(0, Math.floor(Number(raw) || 0))
    const next = { ...counts, [value]: qty }
    setCounts(next)
    writeStored(countedBy, next)
  }

  function changeCountedBy(value: string) {
    setCountedBy(value)
    writeStored(value, counts)
  }

  async function clearAll() {
    if (!hasAnything) return
    if (!(await confirmAction({
      title: t('cash_clearTitle', 'Clear the count?'),
      message: t('cash_clearMessage', 'Every quantity typed here will be cleared. This cannot be undone.'),
      confirmText: t('cash_clearConfirm', 'Yes, Clear'),
      cancelText: t('common_cancel', 'Cancel'),
    }))) return

    setCountedBy('')
    setCounts({})
    writeStored('', {})
  }

  /**
   * A plain-text breakdown for pasting into WhatsApp or a message - what the
   * phone app this was modelled on called "Share". Only the rows that were
   * actually counted, so a count of three notes is three lines.
   */
  function summaryText() {
    const lines = [
      `${t('cash_title', 'Cash Counter')} - ${formatDate(new Date())}`,
      countedBy.trim() ? `${t('cash_countedBy', 'Counted by')}: ${countedBy.trim()}` : '',
      '',
      ...rows.filter(row => row.qty > 0).map(row =>
        `${formatNum(row.value)} x ${formatNum(row.qty)} = ${formatNum(row.amount)}`
      ),
      '',
      `${t('cash_totalNotes', 'Total notes')}: ${formatNum(totalNotes)}`,
      `${t('cash_total', 'Total')}: ${formatCurr(totalAmount)}`,
    ]
    return lines.filter((line, index) => line !== '' || index > 0).join('\n')
  }

  async function copySummary() {
    if (totalNotes === 0) {
      toast.error(t('cash_nothingToCopy', 'Nothing counted yet'))
      return
    }
    try {
      await navigator.clipboard.writeText(summaryText())
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
      toast.success(t('cash_copied', 'Breakdown copied'))
    } catch {
      toast.error(t('cash_copyFailed', 'Could not copy - your browser refused clipboard access'))
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="relative rounded-full p-2 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-navy-900"
        title={t('cash_title', 'Cash Counter')}
        aria-label={t('cash_title', 'Cash Counter')}
      >
        <Calculator size={20} />
      </button>

      <Modal isOpen={open} onClose={() => setOpen(false)} title={t('cash_title', 'Cash Counter')} size="md">
        <div className="space-y-4">
          <div>
            <label className="label" htmlFor="cash-counter-counted-by">
              {t('cash_countedBy', 'Counted by')}
            </label>
            {/* Typed, not picked. Whoever counts the till is often a shop hand
                who is not in the employee list, so a lookup would ask for a
                record that does not exist to write down a name. */}
            <input
              id="cash-counter-counted-by"
              className="input"
              value={countedBy}
              onChange={event => changeCountedBy(event.target.value)}
              placeholder={t('cash_countedByPlaceholder', 'Type the name')}
            />
          </div>

          <div className="overflow-hidden rounded-xl border border-neutral-200">
            <table className="w-full text-sm">
              <thead className="table-header">
                <tr>
                  <th className="px-4 py-2.5 text-left">{t('cash_note', 'Note')}</th>
                  <th className="px-4 py-2.5 text-center">{t('cash_qty', 'Qty')}</th>
                  <th className="px-4 py-2.5 text-right">{t('cash_amount', 'Amount')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.value} className="border-t border-neutral-100">
                    <td className="px-4 py-1.5 font-semibold text-navy-900 tabular-nums">
                      {formatCurr(row.value)}
                    </td>
                    <td className="px-4 py-1.5">
                      <div className="flex items-center justify-center gap-2 text-neutral-400">
                        <span className="text-xs">×</span>
                        <input
                          type="number"
                          min="0"
                          inputMode="numeric"
                          className="input h-8 w-20 text-center tabular-nums"
                          value={row.qty || ''}
                          onChange={event => setCount(row.value, event.target.value)}
                          aria-label={`${formatCurr(row.value)} ${t('cash_qty', 'Qty')}`}
                        />
                      </div>
                    </td>
                    {/* A row nobody has counted stays grey, so the eye runs
                        straight down the ones that carry money. */}
                    <td className={`px-4 py-1.5 text-right font-semibold tabular-nums ${row.qty > 0 ? 'text-navy-900' : 'text-neutral-300'}`}>
                      {formatCurr(row.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="sticky bottom-0 -mx-6 -mb-4 space-y-3 bg-white px-6 pb-4 pt-3">
          <div className="rounded-2xl bg-navy-900 px-5 py-4 text-white">
            <div className="flex items-center justify-between text-xs text-white/60">
              <span>{t('cash_totalNotes', 'Total notes')}</span>
              <span className="tabular-nums">{formatNum(totalNotes)}</span>
            </div>
            <div className="mt-2 flex items-end justify-between border-t border-white/10 pt-3">
              <span className="text-sm font-medium text-white/70">{t('cash_total', 'Total')}</span>
              <span className="text-3xl font-bold tabular-nums">{formatCurr(totalAmount)}</span>
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={copySummary} className="btn-primary flex-1 justify-center">
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? t('cash_copied', 'Breakdown copied') : t('cash_copy', 'Copy breakdown')}
            </button>
            <button
              onClick={clearAll}
              disabled={!hasAnything}
              className="btn-secondary justify-center disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Eraser size={16} /> {t('cash_clear', 'Clear')}
            </button>
          </div>
          </div>
        </div>
      </Modal>
    </>
  )
}
