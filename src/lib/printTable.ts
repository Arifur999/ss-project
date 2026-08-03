import { formatDate } from './utils'

// Opens a clean print window for a simple data table and triggers the browser
// print dialog. Self-contained (its own styles) so it never touches the app's
// invoice print CSS.
export type PrintColumn = { label: string; align?: 'left' | 'right' | 'center' }

export function printTable(opts: {
  title: string
  subtitle?: string
  columns: PrintColumn[]
  rows: (string | number)[][]
  totalRow?: (string | number)[]
}) {
  const { title, subtitle, columns, rows, totalRow } = opts
  const esc = (v: any) =>
    String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const align = (c: PrintColumn) => c.align || 'left'

  const head = columns.map(c => `<th style="text-align:${align(c)}">${esc(c.label)}</th>`).join('')
  const body = rows
    .map(r => `<tr>${r.map((cell, i) => `<td style="text-align:${align(columns[i] || {})}">${esc(cell)}</td>`).join('')}</tr>`)
    .join('')
  const total = totalRow
    ? `<tr class="total">${totalRow.map((cell, i) => `<td style="text-align:${align(columns[i] || {})}">${esc(cell)}</td>`).join('')}</tr>`
    : ''

  const now = new Date()
  const printedOn = `${formatDate(now)} ${now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; margin: 24px; }
    h1 { font-size: 20px; margin: 0 0 2px; }
    .sub { color: #64748b; font-size: 12px; margin: 0 0 4px; }
    .meta { color: #94a3b8; font-size: 11px; margin: 0 0 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border-bottom: 1px solid #e2e8f0; padding: 8px 10px; }
    thead th { background: #f1f5f9; border-bottom: 2px solid #cbd5e1; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
    tr.total td { font-weight: 700; background: #f8fafc; border-top: 2px solid #cbd5e1; }
    @media print { body { margin: 0; } }
  </style></head><body>
    <h1>${esc(title)}</h1>
    ${subtitle ? `<p class="sub">${esc(subtitle)}</p>` : ''}
    <p class="meta">Printed on ${esc(printedOn)}</p>
    <table><thead><tr>${head}</tr></thead><tbody>${body}${total}</tbody></table>
    <script>window.onload = function(){ window.print(); }</script>
  </body></html>`

  const win = window.open('', '_blank', 'width=1000,height=700')
  if (!win) return
  win.document.open()
  win.document.write(html)
  win.document.close()
}
