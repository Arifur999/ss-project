import React, { useMemo, useRef, useState } from 'react'
import { useReactToPrint } from 'react-to-print'
import { CalculatorIcon as Calculator, DownloadSimpleIcon as Download, EraserIcon as Eraser, PaperPlaneTiltIcon as PaperPlane } from '@phosphor-icons/react'
import toast from 'react-hot-toast'
import Modal from './Modal'
import { confirmAction } from './ConfirmDialog'
import { useLang } from '../context/LanguageContext'
import { emailReport } from '../services/report.services'
import { formatDate, todayISO } from '../lib/utils'

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

type Stored = { countedBy: string; date: string; counts: Counts }

function readStored(): Stored {
  const empty = { countedBy: '', date: todayISO(), counts: {} }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return empty
    const parsed = JSON.parse(raw)
    return {
      countedBy: String(parsed?.countedBy || ''),
      // A count left open overnight reopens dated today, not yesterday: the
      // date is what the report is filed under, and a stale one is worse than
      // no memory of it at all.
      date: String(parsed?.date || '') || todayISO(),
      counts: parsed?.counts || {},
    }
  } catch {
    return empty
  }
}

function writeStored(next: Stored) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // A full quota must never stop somebody counting money.
  }
}

export default function CashCounter() {
  const { t, formatCurr, formatNum } = useLang()
  const [open, setOpen] = useState(false)
  const stored = useMemo(readStored, [])
  const [countedBy, setCountedBy] = useState(stored.countedBy)
  const [date, setDate] = useState(stored.date)
  const [counts, setCounts] = useState<Counts>(stored.counts)
  const [sending, setSending] = useState(false)

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
    writeStored({ countedBy, date, counts: next })
  }

  function changeCountedBy(value: string) {
    setCountedBy(value)
    writeStored({ countedBy: value, date, counts })
  }

  function changeDate(value: string) {
    setDate(value)
    writeStored({ countedBy, date: value, counts })
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
    setDate(todayISO())
    setCounts({})
    writeStored({ countedBy: '', date: todayISO(), counts: {} })
  }

  const countedRows = rows.filter(row => row.qty > 0)

  /**
   * Mail the count to the business address.
   *
   * The server looks that address up itself - Settings first, the owner's login
   * email if Settings has none - so there is nothing here to point it anywhere
   * else. The figures go over already formatted, so the email reads exactly
   * like this dialog.
   */
  async function sendReport() {
    if (sending) return
    if (totalNotes === 0) {
      toast.error(t('cash_nothingToSend', 'Count something first'))
      return
    }

    setSending(true)
    try {
      const result = await emailReport({
        title: t('cash_title', 'Cash Counter'),
        period: formatDate(date),
        summary: [
          ...(countedBy.trim() ? [{ label: t('cash_countedBy', 'Counted by'), value: countedBy.trim() }] : []),
          { label: t('cash_totalNotes', 'Total notes'), value: formatNum(totalNotes) },
          { label: t('cash_total', 'Total'), value: formatCurr(totalAmount) },
        ],
        tables: [{
          title: t('cash_title', 'Cash Counter'),
          columns: [t('cash_note', 'Currency'), t('cash_qty', 'Qty'), t('cash_amount', 'Amount')],
          rows: countedRows.map(row => [formatCurr(row.value), formatNum(row.qty), formatCurr(row.amount)]),
        }],
      })
      toast.success(`${t('cash_sent', 'Report sent to')} ${result.email}`)
    } catch (error: any) {
      toast.error(error?.message || t('cash_sendFailed', 'Could not send the report'))
    } finally {
      setSending(false)
    }
  }

  const printRef = useRef<HTMLDivElement>(null)

  /**
   * The count as a PDF.
   *
   * Through the browser's own print, the way every invoice in this app is
   * already turned into a PDF - not a PDF library. jsPDF's built-in fonts are
   * Latin-1, so a counter named in Bangla would come out as boxes; rendering
   * the real page means the real font, and Bangla prints as Bangla. The
   * document title becomes the suggested filename, dated so a folder of them
   * sorts itself.
   */
  const printReport = useReactToPrint({
    content: () => printRef.current,
    documentTitle: `cash-count-${date}`,
  })

  function downloadReport() {
    if (totalNotes === 0) {
      toast.error(t('cash_nothingToSend', 'Count something first'))
      return
    }
    printReport()
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
            <div>
              <label className="label" htmlFor="cash-counter-date">
                {t('cash_date', 'Date')}
              </label>
              {/* Editable, because a drawer counted after closing is often
                  entered the next morning and belongs to the day it was
                  counted, not the day it was typed. */}
              <input
                id="cash-counter-date"
                type="date"
                className="input"
                value={date}
                onChange={event => changeDate(event.target.value)}
              />
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-neutral-200">
            <table className="w-full text-sm">
              <thead className="table-header">
                <tr>
                  <th className="px-4 py-2.5 text-left">{t('cash_note', 'Currency')}</th>
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

          <button
            onClick={sendReport}
            disabled={sending || totalNotes === 0}
            className="btn-primary w-full justify-center disabled:cursor-not-allowed disabled:opacity-50"
          >
            <PaperPlane size={16} />
            {sending ? t('cash_sending', 'Sending...') : t('cash_sendReport', 'Send report')}
          </button>

          <div className="flex gap-2">
            <button
              onClick={downloadReport}
              disabled={totalNotes === 0}
              className="btn-secondary flex-1 justify-center disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download size={16} /> {t('cash_download', 'Download PDF')}
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

      {/* Parked off screen rather than display:none - a node with no layout
          can be copied into the print frame empty. .invoice-print-page is the
          class the app's print stylesheet already knows: it hides everything
          else on the page and lays this out on A4, the same way every invoice
          here is printed. */}
      <div aria-hidden className="pointer-events-none fixed -left-[9999px] top-0">
        <div ref={printRef} className="invoice-print-page" style={{ padding: '8mm', fontFamily: 'inherit', color: '#000' }}>
          <h1 style={{ margin: '0 0 4px', fontSize: '20px', fontWeight: 700 }}>
            {t('cash_title', 'Cash Counter')}
          </h1>
          <p style={{ margin: '0 0 2px', fontSize: '12px' }}>
            {t('cash_date', 'Date')}: {formatDate(date)}
          </p>
          {countedBy.trim() && (
            <p style={{ margin: '0 0 2px', fontSize: '12px' }}>
              {t('cash_countedBy', 'Counted by')}: {countedBy.trim()}
            </p>
          )}

          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '14px', fontSize: '12px' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '6px 4px', borderBottom: '1.5px solid #000' }}>{t('cash_note', 'Currency')}</th>
                <th style={{ textAlign: 'right', padding: '6px 4px', borderBottom: '1.5px solid #000' }}>{t('cash_qty', 'Qty')}</th>
                <th style={{ textAlign: 'right', padding: '6px 4px', borderBottom: '1.5px solid #000' }}>{t('cash_amount', 'Amount')}</th>
              </tr>
            </thead>
            <tbody>
              {/* Only what was counted - a row nobody filled is a blank line in
                  a document somebody is going to keep. */}
              {countedRows.map(row => (
                <tr key={row.value}>
                  <td style={{ padding: '5px 4px', borderBottom: '1px solid #ddd' }}>{formatCurr(row.value)}</td>
                  <td style={{ padding: '5px 4px', borderBottom: '1px solid #ddd', textAlign: 'right' }}>{formatNum(row.qty)}</td>
                  <td style={{ padding: '5px 4px', borderBottom: '1px solid #ddd', textAlign: 'right' }}>{formatCurr(row.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td style={{ padding: '8px 4px', fontWeight: 700, borderTop: '1.5px solid #000' }}>{t('cash_totalNotes', 'Total notes')}</td>
                <td style={{ padding: '8px 4px', fontWeight: 700, borderTop: '1.5px solid #000', textAlign: 'right' }}>{formatNum(totalNotes)}</td>
                <td style={{ padding: '8px 4px', fontWeight: 700, borderTop: '1.5px solid #000', textAlign: 'right' }}>{formatCurr(totalAmount)}</td>
              </tr>
            </tfoot>
          </table>

          <p style={{ marginTop: '18px', fontSize: '16px', fontWeight: 700, textAlign: 'right' }}>
            {t('cash_total', 'Total')}: {formatCurr(totalAmount)}
          </p>
        </div>
      </div>
    </>
  )
}
