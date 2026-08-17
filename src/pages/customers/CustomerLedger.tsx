import React, { useEffect, useMemo, useRef, useState } from 'react'
import { WarningCircleIcon as AlertCircle, CaretDownIcon as ChevronDown, CreditCardIcon as CreditCard, FileTextIcon as FileText, CircleNotchIcon as Loader2, MapPinIcon as MapPin, PhoneIcon as Phone, PrinterIcon as Printer, MagnifyingGlassIcon as Search, TagIcon as Tag, TrendUpIcon as TrendingUp, UserIcon as User, UsersIcon as Users, WalletIcon as Wallet, XIcon as X } from '@phosphor-icons/react'
import toast from 'react-hot-toast'
import PageHeader from '../../components/PageHeader'
import TableScroller from '../../components/TableScroller'
import { useLang } from '../../context/LanguageContext'
import { supabase } from '../../lib/supabase'
import { formatDate, roundTaka } from '../../lib/utils'
import {
  loadCustomerDashboardDataset,
  parseAmountText,
  parseMetaValue,
  subscribeCustomerDashboardDataset,
  type CustomerDashboardRow,
} from './customerDashboardData'
import { ZeroAmount } from '../../components/CellValue'

type CustomerOption = {
  id: string
  name: string
  phone?: string
}

type CustomerProfile = CustomerOption & {
  address?: string
  opening_due?: number
}

type LedgerEntry = {
  id: string
  date: string
  created_at?: string
  entry_type: 'sale' | 'payment' | 'return' | 'voucher'
  reference: string
  description: string
  product_name?: string | null
  qty?: number
  txIndex?: number
  previous_due: number
  purchase: number
  discount: number
  payment: number
  current_due: number
}

type LedgerSummary = {
  openingDue: number
  totalPurchase: number
  totalDiscount: number
  totalPaid: number
  currentDue: number
}

function customerOptionLabel(customer: CustomerOption) {
  return [customer?.name, customer?.phone].filter(Boolean).join(' - ')
}

function dueCollectionDiscount(payment: any) {
  return parseAmountText(parseMetaValue(payment?.notes || '', 'Discount Amount'))
}

function saleGrossAmount(sale: any) {
  return Number(sale.net_amount || 0) + Number(sale.discount_amount || 0)
}

function sortLedgerEntries(a: any, b: any) {
  const dateDiff = new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime()
  if (dateDiff !== 0) return dateDiff
  return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
}

function formatTk(value: number) {
  return `${roundTaka(value).toLocaleString('en-US')} TK`
}

function pdfEscape(value: string) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

function pdfText(value: string, x: number, y: number, size = 9, options: { bold?: boolean; align?: 'left' | 'right'; max?: number } = {}) {
  const safe = pdfEscape(options.max ? value.slice(0, options.max) : value)
  const font = options.bold ? 'F2' : 'F1'
  const approxWidth = safe.length * size * 0.48
  const left = options.align === 'right' ? x - approxWidth : x
  return `BT /${font} ${size} Tf ${left.toFixed(2)} ${y.toFixed(2)} Td (${safe}) Tj ET\n`
}

function pdfLine(x1: number, y1: number, x2: number, y2: number, color = '0.82 0.86 0.91') {
  return `${color} RG ${x1} ${y1} m ${x2} ${y2} l S\n`
}

function pdfRect(x: number, y: number, w: number, h: number, fill: string, stroke = '0.86 0.89 0.93') {
  return `${fill} rg ${stroke} RG ${x} ${y} ${w} ${h} re B\n`
}

function makeCustomerLedgerPdf(customer: CustomerProfile, summary: LedgerSummary, ledger: LedgerEntry[]) {
  const pageWidth = 842
  const pageHeight = 595
  const margin = 34
  const pageStreams: string[] = []
  let content = ''
  let y = pageHeight - margin

  function addPage() {
    if (content) pageStreams.push(content)
    content = '1 w\n'
    y = pageHeight - margin
  }

  function ensureSpace(height: number) {
    if (y - height < margin) {
      addPage()
      drawHeader(true)
      drawTableHeader()
    }
  }

  function drawHeader(compact = false) {
    content += pdfText('Customer Ledger', margin, y, compact ? 15 : 19, { bold: true })
    content += pdfText(`Generated: ${formatDate(new Date())}`, pageWidth - margin, y, 8, { align: 'right' })
    y -= compact ? 22 : 30
    content += pdfLine(margin, y, pageWidth - margin, y)
    y -= compact ? 18 : 24
  }

  function drawInfoBoxes() {
    const boxGap = 14
    const boxW = (pageWidth - margin * 2 - boxGap) / 2
    const boxH = 102
    const top = y - boxH

    content += pdfRect(margin, top, boxW, boxH, '0.99 1 1')
    content += pdfRect(margin + boxW + boxGap, top, boxW, boxH, '0.99 1 1')
    content += pdfText('Customer Profile Details', margin + 14, y - 20, 12, { bold: true })
    content += pdfText('Dynamic Transaction Summary', margin + boxW + boxGap + 14, y - 20, 12, { bold: true })

    const profileX = margin + 14
    content += pdfText(`Customer Name: ${customer.name || '-'}`, profileX, y - 45, 9)
    content += pdfText(`Customer Phone: ${customer.phone || '-'}`, profileX, y - 62, 9)
    content += pdfText(`Address: ${customer.address || '-'}`, profileX, y - 79, 9, { max: 54 })
    content += pdfText(`Opening Due: ${formatTk(summary.openingDue)}`, profileX, y - 96, 9, { bold: true })

    const summaryX = margin + boxW + boxGap + 14
    const colW = (boxW - 28) / 4
    const labels = ['Total Purchase', 'Total Discount', 'Total Paid', 'Current Due']
    const values = [summary.totalPurchase, summary.totalDiscount, summary.totalPaid, summary.currentDue]
    labels.forEach((label, index) => {
      const x = summaryX + colW * index
      content += pdfText(label, x, y - 48, 8)
      content += pdfText(formatTk(values[index]), x, y - 70, 11, { bold: true })
    })

    y = top - 26
  }

  function drawTableHeader() {
    content += pdfText('Transaction History', margin, y, 12, { bold: true })
    y -= 18
    content += pdfRect(margin, y - 18, pageWidth - margin * 2, 24, '0.95 0.97 0.99')
    const cols = [margin + 10, margin + 38, margin + 104, margin + 174, margin + 300, margin + 405, margin + 505, margin + 608, pageWidth - margin - 12]
    ;['#', 'Date', 'Type', 'Reference', 'Previous Due', 'Purchase', 'Discount', 'Payment', 'Current Due'].forEach((label, index) => {
      content += pdfText(label, cols[index], y - 8, 7.5, { bold: true, align: index > 4 ? 'right' : 'left' })
    })
    y -= 26
  }

  addPage()
  drawHeader()
  drawInfoBoxes()
  drawTableHeader()

  ledger.forEach((entry, index) => {
    ensureSpace(22)
    const cols = [margin + 10, margin + 38, margin + 104, margin + 174, margin + 372, margin + 484, margin + 588, margin + 690, pageWidth - margin - 12]
    content += pdfLine(margin, y - 8, pageWidth - margin, y - 8, '0.90 0.93 0.96')
    content += pdfText(String(index + 1), cols[0], y, 7.5)
    content += pdfText(formatDate(entry.date), cols[1], y, 7.5)
    content += pdfText(entry.entry_type === 'sale' ? 'Sale' : entry.entry_type === 'payment' ? 'Payment' : entry.entry_type, cols[2], y, 7.5, { max: 12 })
    content += pdfText(entry.reference || '-', cols[3], y, 7.5, { max: 24 })
    content += pdfText(formatTk(entry.previous_due), cols[4], y, 7.5, { align: 'right' })
    content += pdfText(formatTk(entry.purchase || 0), cols[5], y, 7.5, { align: 'right' })
    content += pdfText(formatTk(entry.discount || 0), cols[6], y, 7.5, { align: 'right' })
    content += pdfText(formatTk(entry.payment || 0), cols[7], y, 7.5, { align: 'right' })
    content += pdfText(formatTk(entry.current_due), cols[8], y, 7.5, { bold: true, align: 'right' })
    y -= 20
  })

  if (ledger.length === 0) {
    content += pdfText('No transaction history found.', margin + 10, y, 9)
  }

  pageStreams.push(content)

  const objects: string[] = []
  objects.push('<< /Type /Catalog /Pages 2 0 R >>')
  objects.push(`<< /Type /Pages /Kids ${pageStreams.map((_, i) => `${3 + i * 2} 0 R`).join(' ')} /Count ${pageStreams.length} >>`)

  pageStreams.forEach((stream, index) => {
    const pageObj = 3 + index * 2
    const contentObj = pageObj + 1
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> /F2 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> >> >> /Contents ${contentObj} 0 R >>`)
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`)
  })

  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((object, index) => {
    offsets.push(pdf.length)
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xrefOffset = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  offsets.slice(1).forEach(offset => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  })
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
  return pdf
}

export default function CustomerLedger() {
  const { t, formatCurr } = useLang()
  const [customers, setCustomers] = useState<CustomerDashboardRow[]>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerProfile | null>(null)
  const [customerSearch, setCustomerSearch] = useState('')
  const [showCustomerOptions, setShowCustomerOptions] = useState(false)
  const [ledger, setLedger] = useState<LedgerEntry[]>([])
  const [loadingCustomers, setLoadingCustomers] = useState(true)
  const [loadingLedger, setLoadingLedger] = useState(false)
  const customerBoxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadCustomers()
    return subscribeCustomerDashboardDataset(loadCustomers)
  }, [])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (customerBoxRef.current && !customerBoxRef.current.contains(event.target as Node)) {
        setShowCustomerOptions(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (!selectedCustomerId || customers.length === 0) return

    let cancelled = false
    async function loadSelectedLedger() {
      setLoadingLedger(true)
      setLedger([])

      try {
        const dashboardCustomer = customers.find(customer => customer.id === selectedCustomerId)
        if (!dashboardCustomer) {
          setSelectedCustomerId('')
          setSelectedCustomer(null)
          setCustomerSearch('')
          setShowCustomerOptions(true)
          return
        }

        setSelectedCustomer(dashboardCustomer)

        const [salesRes, paymentsRes] = await Promise.all([
          supabase
            .from('sales')
            .select('id, invoice_no, date, created_at, net_amount, discount_amount, paid_amount, due_amount, notes, sale_items(product_name, qty, total_amount)')
            .eq('customer_id', selectedCustomerId)
            .eq('status', 'completed')
            .order('date', { ascending: true })
            .order('created_at', { ascending: true }),
          supabase
            .from('customer_payments')
            .select('id, date, created_at, amount, account_name, invoice_no, notes')
            .eq('customer_id', selectedCustomerId)
            .order('date', { ascending: true })
            .order('created_at', { ascending: true }),
        ])

        if (salesRes.error) throw salesRes.error
        if (paymentsRes.error) throw paymentsRes.error

        const profile = dashboardCustomer as CustomerProfile

        // Build one date-sorted stream of sale + payment transactions, then
        // expand each sale into ONE ROW PER PRODUCT. A multi-product invoice
        // therefore shows each item on its own ledger line; the sale-level
        // discount/payment attach to the item's last row so the running due
        // still reconciles exactly (sum of line total_amount = sale gross).
        type Tx =
          | { kind: 'sale'; date: string; created_at?: string; sale: any }
          | { kind: 'payment'; date: string; created_at?: string; payment: any }

        const transactions: Tx[] = [
          ...(salesRes.data || []).map((sale: any) => ({ kind: 'sale' as const, date: sale.date, created_at: sale.created_at, sale })),
          ...(paymentsRes.data || []).map((payment: any) => ({ kind: 'payment' as const, date: payment.date, created_at: payment.created_at, payment })),
        ].sort(sortLedgerEntries)

        let runningDue = Number(profile?.opening_due || 0)
        let txIndex = 0
        const nextLedger: LedgerEntry[] = []

        for (const tx of transactions) {
          txIndex += 1
          if (tx.kind === 'payment') {
            const payment = tx.payment
            const discount = dueCollectionDiscount(payment)
            const paid = Number(payment.amount || 0)
            const previousDue = runningDue
            runningDue = Math.max(0, runningDue - discount - paid)
            nextLedger.push({
              id: payment.id,
              date: payment.date,
              created_at: payment.created_at,
              entry_type: 'payment',
              reference: payment.invoice_no || payment.notes || 'Due voucher',
              description: payment.account_name ? `Due received - ${payment.account_name}` : 'Due received',
              txIndex,
              previous_due: previousDue,
              purchase: 0,
              discount,
              payment: paid,
              current_due: runningDue,
            })
            continue
          }

          const sale = tx.sale
          const items: any[] = Array.isArray(sale.sale_items) ? sale.sale_items : []
          const saleDiscount = Number(sale.discount_amount || 0)
          const salePayment = Number(sale.paid_amount || 0)

          // 0 or 1 product: keep a single row (uses the sale's gross so it stays
          // identical to the previous behaviour for single-item invoices).
          if (items.length <= 1) {
            const previousDue = runningDue
            const purchase = saleGrossAmount(sale)
            runningDue = Math.max(0, runningDue + purchase - saleDiscount - salePayment)
            const onlyQty = Number(items[0]?.qty || 0)
            nextLedger.push({
              id: sale.id,
              date: sale.date,
              created_at: sale.created_at,
              entry_type: 'sale',
              reference: sale.invoice_no || '-',
              description: items[0]?.product_name || 'Invoice sale',
              product_name: items[0]?.product_name || null,
              qty: onlyQty || undefined,
              txIndex,
              previous_due: previousDue,
              purchase,
              discount: saleDiscount,
              payment: salePayment,
              current_due: runningDue,
            })
            continue
          }

          items.forEach((item, itemIndex) => {
            const isLast = itemIndex === items.length - 1
            const linePurchase = Number(item.total_amount || 0)
            const lineDiscount = isLast ? saleDiscount : 0
            const linePayment = isLast ? salePayment : 0
            const previousDue = runningDue
            runningDue = Math.max(0, runningDue + linePurchase - lineDiscount - linePayment)
            const qty = Number(item.qty || 0)
            nextLedger.push({
              id: `${sale.id}-${itemIndex}`,
              date: sale.date,
              created_at: sale.created_at,
              entry_type: 'sale',
              reference: sale.invoice_no || '-',
              description: `${item.product_name || 'Product'}${qty ? ` × ${qty}` : ''}`,
              product_name: item.product_name || null,
              qty: qty || undefined,
              txIndex,
              previous_due: previousDue,
              purchase: linePurchase,
              discount: lineDiscount,
              payment: linePayment,
              current_due: runningDue,
            })
          })
        }

        if (!cancelled) {
          setSelectedCustomer(profile)
          setLedger(nextLedger)
        }
      } catch (err: any) {
        if (!cancelled) toast.error(err.message || 'Failed to load customer ledger')
      } finally {
        if (!cancelled) setLoadingLedger(false)
      }
    }

    loadSelectedLedger()
    return () => {
      cancelled = true
    }
  }, [selectedCustomerId, customers])

  async function loadCustomers() {
    try {
      setLoadingCustomers(true)
      const dataset = await loadCustomerDashboardDataset()
      setCustomers(dataset.customerList)
    } catch (err: any) {
      toast.error(err.message || 'Failed to load customers')
    } finally {
      setLoadingCustomers(false)
    }
  }

  const filteredCustomers = useMemo(() => {
    const query = customerSearch.trim().toLowerCase()
    return customers.filter(customer => {
      if (!query) return true
      return [customer.name, customer.phone].some(value => String(value || '').toLowerCase().includes(query))
    })
  }, [customerSearch, customers])

  const summary = useMemo<LedgerSummary>(() => {
    const openingDue = Number(selectedCustomer?.opening_due || 0)
    const totalPurchase = ledger.reduce((sum, entry) => sum + Number(entry.purchase || 0), 0)
    const totalDiscount = ledger.reduce((sum, entry) => sum + Number(entry.discount || 0), 0)
    const totalPaid = ledger.reduce((sum, entry) => sum + Number(entry.payment || 0), 0)
    return {
      openingDue,
      totalPurchase,
      totalDiscount,
      totalPaid,
      currentDue: Math.max(0, openingDue + totalPurchase - totalDiscount - totalPaid),
    }
  }, [ledger, selectedCustomer])

  function selectCustomer(customer: CustomerOption) {
    setSelectedCustomerId(customer.id)
    setCustomerSearch(customerOptionLabel(customer))
    setShowCustomerOptions(false)
    setSelectedCustomer(null)
    setLedger([])
  }

  function clearCustomer() {
    setSelectedCustomerId('')
    setSelectedCustomer(null)
    setLedger([])
    setCustomerSearch('')
    setShowCustomerOptions(true)
  }

  function printLedger() {
    if (!selectedCustomer) return toast.error('Select a customer first')
    window.print()
  }

  // Newest transaction first, but keep the product rows WITHIN a sale in their
  // natural order (stable sort on the per-transaction index).
  const visibleLedger = [...ledger].sort((a, b) => (b.txIndex ?? 0) - (a.txIndex ?? 0))

  return (
    <div className="min-h-screen bg-white p-6">
      <PageHeader
        title={t('ledger_title', 'Customer Ledger')}
        subtitle={t('ledger_title', 'Customer Ledger')}
        actions={
          <button
            onClick={printLedger}
            disabled={!selectedCustomer || loadingLedger}
            className="btn-primary h-11 rounded-lg px-5 shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Printer size={17} /> Print
          </button>
        }
      />

      <div className="mb-6 max-w-xl">
        <label className="label text-slate-900">{t('ledger_selectCustomer', 'Select Customer')}</label>
        <div ref={customerBoxRef} className="relative">
          <Search className="absolute left-4 top-1/2 z-10 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            className="input h-12 rounded-lg border-slate-200 bg-white pl-12 pr-20 font-semibold shadow-sm"
            value={customerSearch}
            onFocus={() => setShowCustomerOptions(true)}
            onChange={event => {
              setCustomerSearch(event.target.value)
              setSelectedCustomerId('')
              setSelectedCustomer(null)
              setLedger([])
              setShowCustomerOptions(true)
            }}
            placeholder="Search customer by name or phone..."
            autoComplete="off"
          />
          <ChevronDown className="pointer-events-none absolute right-4 top-1/2 z-10 -translate-y-1/2 text-slate-500" size={18} />
          {customerSearch && (
            <button
              type="button"
              onClick={clearCustomer}
              className="absolute right-11 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 hover:bg-red-50 hover:text-brand-red"
              aria-label="Clear customer"
            >
              <X size={15} />
            </button>
          )}

          {showCustomerOptions && (
            <div className="absolute z-30 mt-2 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl">
              {loadingCustomers ? (
                <div className="flex items-center justify-center gap-2 px-3 py-6 text-sm text-slate-400">
                  <Loader2 size={16} className="animate-spin" /> Loading customers...
                </div>
              ) : filteredCustomers.length > 0 ? (
                filteredCustomers.map(customer => (
                  <button
                    key={customer.id}
                    type="button"
                    onMouseDown={event => event.preventDefault()}
                    onClick={() => selectCustomer(customer)}
                    className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm transition hover:bg-neutral-100 ${
                      selectedCustomerId === customer.id ? 'bg-neutral-100 text-navy-900' : 'text-slate-700'
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-bold">{customer.name}</span>
                      <span className="block truncate text-xs text-slate-500">{customer.phone || 'No phone number'}</span>
                    </span>
                    {selectedCustomerId === customer.id && <span className="text-xs font-bold">Selected</span>}
                  </button>
                ))
              ) : (
                <div className="px-3 py-6 text-center text-sm text-slate-400">No matching customer found</div>
              )}
            </div>
          )}
        </div>
      </div>

      {loadingLedger && (
        <div className="card flex min-h-[240px] items-center justify-center gap-3 text-slate-500">
          <Loader2 className="animate-spin text-brand-green" size={24} />
          Loading selected customer ledger...
        </div>
      )}

      {!selectedCustomerId && !loadingLedger && (
        <div className="card flex min-h-[260px] flex-col items-center justify-center text-center text-slate-400">
          <Users size={48} className="mb-3 opacity-30" />
          <p>{t('ledger_selectToView', 'Select a customer to view ledger')}</p>
        </div>
      )}

      {selectedCustomer && !loadingLedger && (
        <div className="space-y-5">
          <section className="customer-ledger-print">
            <h1>Customer Summary</h1>
            <div className="customer-ledger-print-profile">
              <div>
                <span>Customer Name</span>
                <strong>{selectedCustomer.name || '-'}</strong>
              </div>
              <div>
                <span>Customer Phone</span>
                <strong>{selectedCustomer.phone || '-'}</strong>
              </div>
              <div>
                <span>Address</span>
                <strong>{selectedCustomer.address || '-'}</strong>
              </div>
              <div>
                <span>Opening Due</span>
                <strong>{formatCurr(summary.openingDue)}</strong>
              </div>
            </div>
            <h2>Transaction History</h2>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Reference</th>
                  <th>Previous Due</th>
                  <th>Purchase</th>
                  <th>Discount</th>
                  <th>Payment</th>
                  <th>Current Due</th>
                </tr>
              </thead>
              <tbody>
                {visibleLedger.map((entry, index) => (
                  <tr key={`print-${entry.id}`}>
                    <td>{visibleLedger.length - index}</td>
                    <td>{formatDate(entry.date)}</td>
                    <td>{entry.entry_type === 'sale' ? 'Sale' : 'Payment'}</td>
                    <td>
                      <strong>{entry.reference || '-'}</strong>
                      <span>{entry.description}</span>
                    </td>
                    <td>{formatCurr(entry.previous_due)}</td>
                    <td>{entry.purchase ? formatCurr(entry.purchase) : <ZeroAmount />}</td>
                    <td>{entry.discount ? formatCurr(entry.discount) : <ZeroAmount />}</td>
                    <td>{entry.payment ? formatCurr(entry.payment) : <ZeroAmount />}</td>
                    <td>{formatCurr(entry.current_due)}</td>
                  </tr>
                ))}
                {visibleLedger.length === 0 && (
                  <tr>
                    <td colSpan={9}>No transaction history found</td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[0.9fr_1.45fr]">
            <section className="overflow-hidden rounded-lg border border-slate-100 bg-white shadow-sm">
              <div className="flex items-center gap-4 border-b border-slate-100 px-6 py-5">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                  <User size={22} />
                </div>
                <h2 className="text-base font-bold text-slate-900">Customer Profile</h2>
              </div>
              <div className="divide-y divide-slate-100">
                <ProfileRow icon={<User size={18} />} label="Customer Name" value={selectedCustomer.name || '-'} />
                <ProfileRow icon={<Phone size={18} />} label="Customer Phone" value={selectedCustomer.phone || '-'} />
                <ProfileRow icon={<MapPin size={18} />} label="Address" value={selectedCustomer.address || '-'} />
                <ProfileRow icon={<Wallet size={18} />} label="Opening Due" value={formatCurr(summary.openingDue)} danger />
              </div>
            </section>

            <section className="overflow-hidden rounded-lg border border-slate-100 bg-white shadow-sm">
              <div className="flex items-center gap-4 border-b border-slate-100 px-6 py-5">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-green-50 text-brand-green">
                  <TrendingUp size={22} />
                </div>
                <h2 className="text-base font-bold text-slate-900">Transaction Summary</h2>
              </div>
              <div className="grid grid-cols-1 divide-y divide-slate-100 p-6 sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
                <SummaryCell icon={<Wallet size={20} />} label="Total Purchase Amount" value={formatCurr(summary.totalPurchase)} tone="green" />
                <SummaryCell icon={<Tag size={20} />} label="Total Discount Given" value={formatCurr(summary.totalDiscount)} note="Invoice + Extra Discount" tone="red" />
                <SummaryCell icon={<CreditCard size={20} />} label="Total Paid Amount" value={formatCurr(summary.totalPaid)} note="Cash + Due Collection" tone="green" />
                <SummaryCell icon={<AlertCircle size={20} />} label="Current Due" value={formatCurr(summary.currentDue)} tone={summary.currentDue > 0 ? 'red' : 'green'} strong />
              </div>
            </section>
          </div>

          <section className="rounded-lg border border-slate-100 bg-white shadow-sm">
            <div className="flex items-center gap-3 border-b border-slate-100 px-6 py-5">
              <FileText size={21} className="text-slate-700" />
              <h2 className="text-base font-bold text-slate-900">Transaction History</h2>
            </div>
            <TableScroller className="w-full overflow-x-auto rounded-lg shadow-sm">
              <table className="w-full min-w-[1120px] text-sm">
                <thead className="table-header">
                  <tr className="border-b border-slate-100">
                    <th className="px-4 py-3 text-left">#</th>
                    <th className="px-4 py-3 text-left">Date</th>
                    <th className="px-4 py-3 text-left">Type</th>
                    <th className="px-4 py-3 text-left">Reference</th>
                    <th className="px-4 py-3 text-right">Previous Due</th>
                    <th className="px-4 py-3 text-right">Purchase</th>
                    <th className="px-4 py-3 text-right">Discount</th>
                    <th className="px-4 py-3 text-right">Payment</th>
                    <th className="px-4 py-3 text-right">Current Due</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleLedger.map((entry, index) => (
                    <tr key={entry.id} className="table-row">
                      <td className="px-4 py-3 font-semibold text-slate-500">{visibleLedger.length - index}</td>
                      <td className="px-4 py-3 font-semibold text-slate-800">{formatDate(entry.date)}</td>
                      <td className="px-4 py-3">
                        <span className={entry.entry_type === 'sale' ? 'badge-green' : 'badge-blue'}>
                          {entry.entry_type === 'sale' ? 'Sale' : 'Payment'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-mono text-xs font-semibold text-slate-700">{entry.reference || '-'}</p>
                        <p className="mt-1 text-xs text-slate-400">{entry.description}</p>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-700">{formatCurr(entry.previous_due)}</td>
                      <td className="px-4 py-3 text-right font-bold text-brand-green">{entry.purchase ? formatCurr(entry.purchase) : <ZeroAmount />}</td>
                      <td className="px-4 py-3 text-right font-bold text-brand-red">{entry.discount ? formatCurr(entry.discount) : <ZeroAmount />}</td>
                      <td className="px-4 py-3 text-right font-bold text-brand-green">{entry.payment ? formatCurr(entry.payment) : <ZeroAmount />}</td>
                      <td className={`px-4 py-3 text-right text-base font-extrabold ${entry.current_due > 0 ? 'text-brand-red' : 'text-brand-green'}`}>
                        {formatCurr(entry.current_due)}
                      </td>
                    </tr>
                  ))}
                  {visibleLedger.length === 0 && (
                    <tr>
                      <td colSpan={9} className="py-10 text-center text-slate-400">
                        {t('ledger_noTx', 'No transaction history found')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </TableScroller>
          </section>
        </div>
      )}
    </div>
  )
}

function ProfileRow({ icon, label, value, danger }: { icon: React.ReactNode; label: string; value: string; danger?: boolean }) {
  return (
    <div className="grid grid-cols-[28px_1fr_auto] items-center gap-3 px-6 py-4">
      <div className="text-slate-600">{icon}</div>
      <div className="text-sm font-semibold text-slate-600">{label}</div>
      <div className={`max-w-[220px] truncate text-right text-sm font-extrabold ${danger ? 'text-brand-red' : 'text-slate-900'}`}>{value}</div>
    </div>
  )
}

function SummaryCell({
  icon,
  label,
  value,
  note,
  tone,
  strong,
}: {
  icon: React.ReactNode
  label: string
  value: string
  note?: string
  tone: 'green' | 'red'
  strong?: boolean
}) {
  const color = tone === 'green' ? 'text-brand-green' : 'text-brand-red'
  const iconBg = tone === 'green' ? 'bg-green-50' : 'bg-red-50'

  return (
    <div className="flex min-h-[128px] flex-col items-center justify-between px-4 py-3 text-center">
      <div>
        <p className="text-xs font-semibold text-slate-600">{label}</p>
        <p className={`mt-4 ${strong ? 'text-2xl' : 'text-xl'} font-extrabold ${color}`}>{value}</p>
        {note && <p className="mt-2 text-xs font-semibold text-slate-500">{note}</p>}
      </div>
      <div className={`mt-4 flex h-11 w-11 items-center justify-center rounded-lg ${iconBg} ${color}`}>{icon}</div>
    </div>
  )
}
