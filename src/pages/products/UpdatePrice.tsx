import React, { useRef, useState } from 'react'
import {
  FileXlsIcon as FileSpreadsheet,
  UploadSimpleIcon as Upload,
  WarningIcon as Warning,
  CheckCircleIcon as CheckCircle,
  ArrowRightIcon as ArrowRight,
} from '@phosphor-icons/react'
import toast from 'react-hot-toast'
import PageHeader from '../../components/PageHeader'
import TableScroller from '../../components/TableScroller'
import ProgressDialog, { idleProgress, startProgress, type ProgressState } from '../../components/ProgressDialog'
import { useLang } from '../../context/LanguageContext'
import {
  CODE_HEADER_KEYS,
  chunkArray,
  downloadXlsx,
  headerKey,
  parseOptionalNumber,
  readSpreadsheet,
  resolveDiscountColumns,
} from '../../lib/spreadsheet'
import { bulkUpdateProductPrices, type PriceRow, type PriceUpdateResult } from '../../services/product.services'

// The columns the sample carries, and the ones a rollback file is written back
// in - the same shape, so undoing a mistake is just uploading what came out.
const PRICE_SHEET_HEADERS = ['Code', 'DP', 'DP Discount', 'MRP', 'MRP Discount']

// Batched for the same reason the product import is: the API rejects a body
// over 2 MB, and a few thousand rows sails past it.
const SAVE_CHUNK = 100

const DP_KEYS = ['dp', 'dprate', 'dpratecost', 'costprice', 'cost', 'purchaseprice', 'buyingprice']
const MRP_KEYS = ['mrp', 'mrpselling', 'sellingprice', 'sp', 'retail', 'price', 'saleprice']

/**
 * Finds the header row of a price file.
 *
 * ProductList's detector cannot be reused: it insists on a Code *and* a Name
 * column, and a price list has code plus prices and no name. This one wants a
 * Code column plus at least one price column.
 */
function detectPriceHeaderRow(rows: string[][]): number {
  const limit = Math.min(rows.length, 30)
  for (let i = 0; i < limit; i += 1) {
    const keys = (rows[i] || []).map(headerKey)
    const hasCode = keys.some(key => CODE_HEADER_KEYS.includes(key))
    const hasPrice =
      keys.some(key => DP_KEYS.includes(key) || MRP_KEYS.includes(key)) ||
      keys.some(key => key.includes('discount'))
    if (hasCode && hasPrice) return i
  }
  return -1
}

const money = (value: number | undefined) =>
  value === undefined ? '' : Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 })

export default function UpdatePrice() {
  const { t } = useLang()
  const [progress, setProgress] = useState<ProgressState>(idleProgress)
  const [preview, setPreview] = useState<PriceUpdateResult | null>(null)
  const [pendingRows, setPendingRows] = useState<PriceRow[]>([])
  const [fileName, setFileName] = useState('')
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function downloadSample() {
    try {
      await downloadXlsx('price-update-sample.xlsx', PRICE_SHEET_HEADERS, [
        ['P-1001', 12000, 5, 15000, 0],
        ['P-1002', 8500, 0, 11000, 10],
      ], 'Prices')
    } catch (error: any) {
      toast.error(error.message || 'Could not create the sample file')
    }
  }

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // Cleared immediately so picking the same file again still fires a change.
    event.target.value = ''
    if (!file) return

    setPreview(null)
    setPendingRows([])
    setProgress(startProgress(t('price_title'), file.name, t('price_reading')))

    try {
      const allRows = await readSpreadsheet(file, detectPriceHeaderRow)
      const headerRowIndex = detectPriceHeaderRow(allRows)
      if (headerRowIndex < 0) return toast.error(t('price_noHeader'))

      const headers = allRows[headerRowIndex].map(headerKey)
      const columnIndex = (names: string[]) => names.map(name => headers.indexOf(name)).find(index => index >= 0) ?? -1
      const discounts = resolveDiscountColumns(headers)
      const indexes = {
        code: columnIndex(CODE_HEADER_KEYS),
        dp: columnIndex(DP_KEYS),
        mrp: columnIndex(MRP_KEYS),
        dpDiscount: discounts.dp,
        mrpDiscount: discounts.mrp,
      }

      const cell = (row: string[], index: number) => (index >= 0 ? row[index] ?? '' : '')

      setProgress(current => ({ ...current, step: t('price_checking') }))

      const rows: PriceRow[] = []
      for (const row of allRows.slice(headerRowIndex + 1)) {
        const code = cell(row, indexes.code).trim()
        if (!code) continue

        // parseOptionalNumber, not parseCsvNumber: a blank cell has to come
        // back as undefined so it is left out of the payload entirely. Read as
        // 0 it would wipe the price of every product the file left blank.
        const priced: PriceRow = {
          product_code: code,
          cost_price: parseOptionalNumber(cell(row, indexes.dp)),
          selling_price: parseOptionalNumber(cell(row, indexes.mrp)),
          dp_discount: parseOptionalNumber(cell(row, indexes.dpDiscount)),
          mrp_discount: parseOptionalNumber(cell(row, indexes.mrpDiscount)),
        }

        // Strip the undefined keys so they never reach the wire.
        const cleaned: PriceRow = { product_code: code }
        for (const field of ['cost_price', 'selling_price', 'dp_discount', 'mrp_discount'] as const) {
          if (priced[field] !== undefined) cleaned[field] = priced[field]
        }
        if (Object.keys(cleaned).length > 1) rows.push(cleaned)
      }

      if (rows.length === 0) return toast.error(t('price_noRows'))

      // A dry run: every lookup happens, nothing is written.
      const result = await bulkUpdateProductPrices(rows, true)
      setPendingRows(rows)
      setPreview(result)
      setFileName(file.name)
    } catch (error: any) {
      console.error('Price preview failed', error)
      toast.error(error.message || 'Could not read the file')
    } finally {
      setProgress(idleProgress)
    }
  }

  async function apply() {
    if (!preview || preview.matched.length === 0) return
    setSaving(true)

    try {
      // The rollback file goes out first, before a single row is written. If
      // the save fails half way it is still the right file to put back.
      const changing = new Set(preview.matched.map(row => row.product_code))

      // `before` only carries the fields that are actually changing, and
      // `after` carries the full resulting state - so for a field that is not
      // changing, `after` already holds its current value. Falling back from
      // one to the other gives every field exactly as it stands right now,
      // which is what re-uploading this file has to restore.
      const asItStands = (row: PriceUpdateResult['matched'][number], field: string) =>
        row.before[field] ?? row.after[field] ?? ''

      await downloadXlsx(
        `prices-before-${new Date().toISOString().slice(0, 10)}.xlsx`,
        PRICE_SHEET_HEADERS,
        preview.matched.map(row => [
          row.product_code,
          asItStands(row, 'cost_price'),
          asItStands(row, 'dp_discount'),
          asItStands(row, 'selling_price'),
          asItStands(row, 'mrp_discount'),
        ]),
        'Prices',
      )

      const toSave = pendingRows.filter(row => changing.has(row.product_code))
      setProgress(startProgress(t('price_title'), fileName, t('price_saving')))

      let done = 0
      let updated = 0
      for (const chunk of chunkArray(toSave, SAVE_CHUNK)) {
        const result = await bulkUpdateProductPrices(chunk, false)
        updated += result.matched.length
        done += chunk.length
        setProgress(current => ({ ...current, processed: done, total: toSave.length }))
      }

      setProgress(current => ({ ...current, done: true }))
      await new Promise(resolve => setTimeout(resolve, 700))

      toast.success(
        `${updated} ${t('price_willChange').toLowerCase()} · ` +
        `${preview.notFound.length} ${t('price_notFound').toLowerCase()} · ` +
        `${preview.unchanged.length} ${t('price_alreadyCorrect').toLowerCase()}`,
      )
      toast(t('price_rollbackNote'), { icon: '↩️', duration: 6000 })
      setPreview(null)
      setPendingRows([])
    } catch (error: any) {
      console.error('Price update failed', error)
      toast.error(error.message || 'Could not save the prices')
    } finally {
      setProgress(idleProgress)
      setSaving(false)
    }
  }

  const matched = preview?.matched || []
  const notFound = preview?.notFound || []
  const unchanged = preview?.unchanged || []

  return (
    <div className="p-6 space-y-6 bg-white min-h-screen">
      <PageHeader
        title={t('price_title')}
        subtitle={t('price_subtitle')}
        actions={
          <div className="flex flex-wrap gap-2">
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,text/csv" onChange={handleFile} className="hidden" />
            <button onClick={downloadSample} className="btn-secondary flex items-center gap-2 bg-white">
              <FileSpreadsheet size={16} /> {t('price_sample')}
            </button>
            <button onClick={() => fileRef.current?.click()} className="btn-primary flex items-center gap-2">
              <Upload size={16} /> {t('price_upload')}
            </button>
          </div>
        }
      />

      {!preview && (
        <div className="card max-w-3xl p-6">
          <h2 className="text-sm font-bold text-navy-900">{t('price_howTitle')}</h2>
          <ul className="mt-3 space-y-2 text-sm text-neutral-600">
            {['price_how1', 'price_how2', 'price_how3', 'price_how4'].map(key => (
              <li key={key} className="flex gap-2">
                <CheckCircle size={16} weight="duotone" className="mt-0.5 shrink-0 text-brand-green" />
                <span>{t(key)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {preview && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3 max-w-2xl">
            <div className="card p-4">
              <p className="text-xs text-neutral-500">{t('price_willChange')}</p>
              <p className="mt-1 text-2xl font-medium text-brand-green">{matched.length}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-neutral-500">{t('price_alreadyCorrect')}</p>
              <p className="mt-1 text-2xl font-medium text-neutral-500">{unchanged.length}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-neutral-500">{t('price_notFound')}</p>
              <p className="mt-1 text-2xl font-medium text-brand-red">{notFound.length}</p>
            </div>
          </div>

          {notFound.length > 0 && (
            <div className="max-w-3xl rounded-xl border border-surface-border bg-surface p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-navy-900">
                <Warning size={16} weight="duotone" className="text-brand-red" />
                {t('price_notFoundHint')}
              </p>
              <p className="mt-2 break-words font-mono text-xs text-neutral-500">{notFound.join(', ')}</p>
            </div>
          )}

          {matched.length === 0 ? (
            <p className="text-sm text-neutral-500">{t('price_nothingToChange')}</p>
          ) : (
            <TableScroller>
              <table className="w-full min-w-[760px] text-sm">
                <thead className="table-header">
                  <tr>
                    <th className="px-4 py-2.5 text-left">{t('price_colCode')}</th>
                    <th className="px-4 py-2.5 text-left">{t('price_colProduct')}</th>
                    <th className="px-4 py-2.5 text-right">DP</th>
                    <th className="px-4 py-2.5 text-right">DP %</th>
                    <th className="px-4 py-2.5 text-right">MRP</th>
                    <th className="px-4 py-2.5 text-right">MRP %</th>
                  </tr>
                </thead>
                <tbody>
                  {matched.map(row => (
                    <tr key={row.product_code} className="table-row">
                      <td className="px-4 py-2.5 font-mono text-xs">{row.product_code}</td>
                      <td className="px-4 py-2.5 font-medium text-navy-900">{row.name}</td>
                      {(['cost_price', 'dp_discount', 'selling_price', 'mrp_discount'] as const).map(field => (
                        <td key={field} className="px-4 py-2.5 text-right tabular-nums">
                          {row.before[field] === undefined ? (
                            <span className="text-neutral-400">{money(row.after[field])}</span>
                          ) : (
                            <span className="inline-flex items-center justify-end gap-1.5">
                              <span className="text-neutral-400 line-through">{money(row.before[field])}</span>
                              <ArrowRight size={11} className="text-neutral-400" />
                              <span className="font-semibold text-brand-green">{money(row.after[field])}</span>
                            </span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroller>
          )}

          <div className="flex gap-2">
            <button onClick={() => { setPreview(null); setPendingRows([]) }} className="btn-secondary">
              {t('price_cancel')}
            </button>
            {matched.length > 0 && (
              <button onClick={apply} disabled={saving} className="btn-primary">
                {saving ? t('price_applying') : t('price_apply')}
              </button>
            )}
          </div>
        </div>
      )}

      <ProgressDialog state={progress} />
    </div>
  )
}
