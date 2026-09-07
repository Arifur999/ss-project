import React, { useEffect, useRef, useState } from 'react'
import { useReactToPrint } from 'react-to-print'
import { ClockCounterClockwiseIcon as History, DownloadSimpleIcon as Download } from '@phosphor-icons/react'
import toast from 'react-hot-toast'
import Modal from './Modal'
import { useLang } from '../context/LanguageContext'
import { formatDate, todayISO } from '../lib/utils'
import { getDayActivity, type ActivityEvent, type DayActivity } from '../services/activity.services'

/**
 * Everything done today, in the order it was done.
 *
 * Gathered server-side out of the tables the work actually landed in, so there
 * is nothing to keep in step - see module/activity on the API. The feed is
 * dated by when each entry was MADE, not by the date on the invoice, so it can
 * differ from a day's ledger totals. That is the point of it: this answers
 * "what did we get through today", not "what did the day earn".
 */
export default function DayHistory() {
  const { t, formatCurr } = useLang()
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(todayISO())
  const [data, setData] = useState<DayActivity | null>(null)
  const [loading, setLoading] = useState(false)
  const printRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    void load(date)
  }, [open, date])

  async function load(day: string) {
    try {
      setLoading(true)
      setData(await getDayActivity(day))
    } catch (error: any) {
      toast.error(error?.message || 'Could not load the day')
    } finally {
      setLoading(false)
    }
  }

  // Through the browser's own print, like every other PDF in this app: it
  // renders the real page with the real font, so a customer named in Bangla
  // prints as Bangla. The title becomes the suggested filename.
  const printDay = useReactToPrint({
    content: () => printRef.current,
    documentTitle: `day-history-${date}`,
  })

  const events = data?.events ?? []

  const time = (iso: string) => {
    const parsed = new Date(iso)
    if (Number.isNaN(parsed.getTime())) return ''
    return parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const amountCell = (event: ActivityEvent) => {
    if (event.direction === 'none') return <span className="text-neutral-300">-</span>
    return (
      <span className={event.direction === 'in' ? 'text-brand-green' : 'text-brand-red'}>
        {event.direction === 'in' ? '+' : '-'}{formatCurr(event.amount)}
      </span>
    )
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-full p-2 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-navy-900"
        title={t('history_title', "Today's history")}
        aria-label={t('history_title', "Today's history")}
      >
        <History size={20} />
      </button>

      <Modal isOpen={open} onClose={() => setOpen(false)} title={t('history_title', "Today's history")} size="lg">
        <div className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <label className="label" htmlFor="day-history-date">{t('history_date', 'Date')}</label>
              {/* Editable, because "what did we do yesterday" is the next
                  question anybody asks after "what did we do today". */}
              <input
                id="day-history-date"
                type="date"
                className="input w-44"
                value={date}
                max={todayISO()}
                onChange={event => setDate(event.target.value)}
              />
            </div>
            <button
              onClick={() => printDay()}
              disabled={loading || events.length === 0}
              className="btn-secondary disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download size={16} /> {t('history_download', 'Download PDF')}
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl border border-neutral-200 px-3 py-2">
              <p className="text-xs text-neutral-500">{t('history_entries', 'Entries')}</p>
              <p className="mt-0.5 text-lg font-bold tabular-nums text-navy-900">{data?.count ?? 0}</p>
            </div>
            <div className="rounded-xl border border-neutral-200 px-3 py-2">
              <p className="text-xs text-neutral-500">{t('history_moneyIn', 'Money in')}</p>
              <p className="mt-0.5 text-lg font-bold tabular-nums text-brand-green">{formatCurr(data?.totals.in ?? 0)}</p>
            </div>
            <div className="rounded-xl border border-neutral-200 px-3 py-2">
              <p className="text-xs text-neutral-500">{t('history_moneyOut', 'Money out')}</p>
              <p className="mt-0.5 text-lg font-bold tabular-nums text-brand-red">{formatCurr(data?.totals.out ?? 0)}</p>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-neutral-200">
            <table className="w-full text-sm">
              <thead className="table-header">
                <tr>
                  <th className="px-3 py-2.5 text-left">{t('history_time', 'Time')}</th>
                  <th className="px-3 py-2.5 text-left">{t('history_what', 'What')}</th>
                  <th className="px-3 py-2.5 text-left">{t('history_who', 'Who / Detail')}</th>
                  <th className="px-3 py-2.5 text-right">{t('history_amount', 'Amount')}</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={4} className="py-10 text-center text-neutral-400">{t('common_loading', 'Loading...')}</td></tr>
                )}
                {!loading && events.map((event, index) => (
                  <tr key={`${event.at}-${index}`} className="border-t border-neutral-100">
                    <td className="px-3 py-2 tabular-nums text-neutral-500">{time(event.at)}</td>
                    <td className="px-3 py-2 font-medium text-navy-900">{event.kind}</td>
                    <td className="px-3 py-2 text-neutral-600">
                      {event.title}
                      {event.subtitle && <span className="ml-1 text-xs text-neutral-400">{event.subtitle}</span>}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{amountCell(event)}</td>
                  </tr>
                ))}
                {!loading && events.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-10 text-center text-neutral-400">
                      {t('history_empty', 'Nothing was entered on this day.')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>

      {/* Parked off screen rather than display:none - a node with no layout can
          be copied into the print frame empty. */}
      <div aria-hidden className="pointer-events-none fixed -left-[9999px] top-0">
        <div ref={printRef} className="invoice-print-page" style={{ padding: '8mm', color: '#000' }}>
          <h1 style={{ margin: '0 0 4px', fontSize: '20px', fontWeight: 700 }}>{t('history_title', "Today's history")}</h1>
          <p style={{ margin: '0 0 14px', fontSize: '12px' }}>{formatDate(date)}</p>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '6px 4px', borderBottom: '1.5px solid #000' }}>{t('history_time', 'Time')}</th>
                <th style={{ textAlign: 'left', padding: '6px 4px', borderBottom: '1.5px solid #000' }}>{t('history_what', 'What')}</th>
                <th style={{ textAlign: 'left', padding: '6px 4px', borderBottom: '1.5px solid #000' }}>{t('history_who', 'Who / Detail')}</th>
                <th style={{ textAlign: 'right', padding: '6px 4px', borderBottom: '1.5px solid #000' }}>{t('history_amount', 'Amount')}</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event, index) => (
                <tr key={`print-${event.at}-${index}`}>
                  <td style={{ padding: '5px 4px', borderBottom: '1px solid #ddd' }}>{time(event.at)}</td>
                  <td style={{ padding: '5px 4px', borderBottom: '1px solid #ddd' }}>{event.kind}</td>
                  <td style={{ padding: '5px 4px', borderBottom: '1px solid #ddd' }}>
                    {event.title}{event.subtitle ? ` - ${event.subtitle}` : ''}
                  </td>
                  <td style={{ padding: '5px 4px', borderBottom: '1px solid #ddd', textAlign: 'right' }}>
                    {event.direction === 'none' ? '-' : `${event.direction === 'in' ? '+' : '-'}${formatCurr(event.amount)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <table style={{ width: '100%', marginTop: '16px', fontSize: '13px' }}>
            <tbody>
              <tr>
                <td style={{ fontWeight: 700 }}>{t('history_entries', 'Entries')}</td>
                <td style={{ textAlign: 'right' }}>{data?.count ?? 0}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 700 }}>{t('history_moneyIn', 'Money in')}</td>
                <td style={{ textAlign: 'right' }}>{formatCurr(data?.totals.in ?? 0)}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 700 }}>{t('history_moneyOut', 'Money out')}</td>
                <td style={{ textAlign: 'right' }}>{formatCurr(data?.totals.out ?? 0)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
