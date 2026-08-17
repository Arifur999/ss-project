/**
 * Reading and writing the spreadsheets people actually send.
 *
 * Extracted from ProductList so the price-update page can use the same parser.
 * Two copies of this would drift, and the drift would show up as one page
 * accepting a supplier's file and the other rejecting it for no visible reason.
 */
import { actualDp } from './purchaseAmounts'

export const CODE_HEADER_KEYS = ['code', 'productcode', 'prodcode', 'sku', 'skunumber', 'itemcode']
export const NAME_HEADER_KEYS = ['productname', 'name', 'prodname', 'itemname', 'description']

/** Normalises a header cell so "DP Rate (Cost)" and "dp_rate_cost" match. */
export function headerKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function normalizeLookup(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

/**
 * A number from a spreadsheet cell, or 0 when there isn't one.
 *
 * Callers that must tell "blank" apart from "zero" - a price update, where a
 * blank means leave it alone and a zero means make it free - want
 * `parseOptionalNumber` instead.
 */
export function parseCsvNumber(value: string) {
  const normalized = value.replace(/,/g, '').replace(/[^\d.-]/g, '').trim()
  const parsed = Number.parseFloat(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

export function parseCsvInteger(value: string) {
  const parsed = Number.parseInt(String(parseCsvNumber(value)), 10)
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * The same number, but `undefined` for an empty cell rather than 0.
 *
 * A blank cell in a price file means "this price is not changing". Reading it
 * as 0 would quietly set the price to zero across every row the supplier left
 * out, which is the worst thing this feature could do.
 */
export function parseOptionalNumber(value: string): number | undefined {
  if (value == null) return undefined
  const trimmed = String(value).trim()
  if (trimmed === '') return undefined
  const normalized = trimmed.replace(/,/g, '').replace(/[^\d.-]/g, '').trim()
  if (normalized === '' || normalized === '-') return undefined
  const parsed = Number.parseFloat(normalized)
  return Number.isFinite(parsed) ? parsed : undefined
}

/**
 * Price after a percentage discount, to the whole taka.
 *
 * Delegates so there is one discount rule in the app: see actualDp for why it
 * subtracts the discount rather than multiplying by (1 - pct/100), and why that
 * is what makes an exact half round up.
 */
export function afterDiscount(price: number, discountPct: number) {
  return actualDp(price, discountPct)
}

export function parseCsv(text: string) {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    const next = text[i + 1]

    if (char === '"' && inQuotes && next === '"') {
      cell += '"'
      i += 1
    } else if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      row.push(cell)
      cell = ''
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i += 1
      row.push(cell)
      if (row.some(value => value.trim() !== '')) rows.push(row)
      row = []
      cell = ''
    } else {
      cell += char
    }
  }

  row.push(cell)
  if (row.some(value => value.trim() !== '')) rows.push(row)
  return rows
}

/**
 * Read an uploaded spreadsheet (.xlsx/.xls via SheetJS, or .csv) into a plain
 * array-of-string-rows so the rest of the import logic is format-agnostic.
 *
 * For multi-sheet workbooks, pick the first sheet whose header row the caller
 * recognises - product-ish sheet names (Furniture/Product/Price/...) are tried
 * first, so a leading "Top-Sheet"/cover tab is skipped automatically. The
 * caller decides what a header row looks like, because a full product import
 * and a price-only file do not want the same test.
 */
export async function readSpreadsheet(
  file: File,
  detectHeader: (rows: string[][]) => number,
): Promise<string[][]> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const XLSX = await import('xlsx')
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: 'array' })
    const toRows = (sheetName: string): string[][] => {
      const sheet = workbook.Sheets[sheetName]
      if (!sheet) return []
      return XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, blankrows: false, defval: '' })
        .map(row => (row || []).map(cell => (cell == null ? '' : String(cell))))
    }
    const names = workbook.SheetNames
    const preferred = names.filter(n => /furniture|product|price|item|list|stock/i.test(n))
    const ordered = [...preferred, ...names.filter(n => !preferred.includes(n))]
    for (const sheetName of ordered) {
      const rows = toRows(sheetName)
      if (detectHeader(rows) >= 0) return rows
    }
    return names[0] ? toRows(names[0]) : []
  }
  const text = await file.text()
  return parseCsv(text)
}

/**
 * The layout can have two columns both titled "Discount" - the first belongs to
 * DP, the second to MRP. Explicit "DP Discount"/"MRP Discount" headers win;
 * plain "Discount" columns are then assigned in order (1st -> DP, 2nd -> MRP).
 */
export function resolveDiscountColumns(headers: string[]) {
  const discountCols = headers
    .map((header, index) => ({ header, index }))
    .filter(({ header }) => header.includes('discount'))

  let dp = discountCols.find(({ header }) => header.includes('dp'))?.index ?? -1
  let mrp = discountCols.find(({ header }) => header.includes('mrp'))?.index ?? -1
  const generic = discountCols
    .filter(({ header }) => !header.includes('dp') && !header.includes('mrp'))
    .map(({ index }) => index)

  if (dp < 0) dp = generic[0] ?? -1
  if (mrp < 0) mrp = generic.filter(index => index !== dp)[0] ?? -1
  return { dp, mrp }
}

function csvEscape(value: any) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

export function downloadCsv(filename: string, rows: any[][]) {
  const csv = rows.map(row => row.map(csvEscape).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  window.URL.revokeObjectURL(url)
}

/**
 * Write a real .xlsx (SheetJS) so downloads open cleanly in Excel and match the
 * format users upload from. SheetJS is loaded on demand (it's ~440KB) so it
 * never weighs down the initial app load - only when actually used.
 */
export async function downloadXlsx(filename: string, headers: string[], rows: any[][], sheetName = 'Products') {
  const XLSX = await import('xlsx')
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows])
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName)
  XLSX.writeFile(workbook, filename)
}
