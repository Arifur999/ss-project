import React, { useState, useEffect, useRef } from 'react'
import { Plus, Save, Search, Printer, Pencil, Trash2, Image, Barcode, Filter, Truck, ChevronDown, ChevronUp, Calendar, Clipboard, Eye, EyeOff } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatDate, generateInvoiceNo } from '../lib/utils'
import PageHeader from '../components/PageHeader'
import Modal from '../components/Modal'
import { confirmAction } from '../components/ConfirmDialog'
import toast from 'react-hot-toast'
import { useAuth } from '../context/AuthContext'
import { useReactToPrint } from 'react-to-print'
import { useLang } from '../context/LanguageContext'
import { useLocation } from 'react-router-dom'
import { addRecycleItem } from '../lib/recycleBin'
import { createOpeningStockBatch, recalculateFifoSaleCosts, releaseFifoForSaleItem, setManualCostForSaleItem } from '../lib/fifoInventory'
import { addSaleDelivery, createSale as createSaleRequest, deleteSale as deleteSaleRequest, setManualSaleItemCost, updateSale as updateSaleRequest } from '../services/sale.services'

interface SaleItem {
  product_id: string
  product_code: string
  product_name: string
  selling_price: number
  discount_amount: number
  discount_pct: number
  actual_price: number
  qty: number
  total_amount: number
  cost_price: number
  delivery_status: 'delivered' | 'undelivered'
  image_url?: string | null
}

type CostBatch = {
  product_id: string
  date: string
  created_at?: string
  actual_dp: number
  remaining_qty: number
}

type PaymentRow = {
  id: string
  account_id: string
  account_name: string
  amount: number
}

type QuickCustomerValidationErrors = Partial<Record<'name' | 'phone', string>>

type LedgerDateFilter = 'all' | 'today' | 'yesterday' | 'month' | 'year' | 'custom'

const REQUIRED_FIELD_MESSAGE = 'This field is required!'
const productListCacheKey = 'product_list_cache_v1'

function readProductListCache() {
  if (typeof window === 'undefined') return []
  try {
    const cached = JSON.parse(window.localStorage.getItem(productListCacheKey) || '[]')
    if (!Array.isArray(cached)) return []
    return cached
      .map((row: any) => ({
        id: row.id,
        product_code: row.product_code || '',
        name: row.name || '',
        selling_price: Number(row.selling_price || 0),
        cost_price: Number(row.cost_price || 0),
        image_url: row.image_url || null,
        discount: Number(row.discount || 0),
        opening_qty: Number(row.opening_qty || 0),
      }))
      .filter((row: any) => row.id && row.product_code && row.name)
  } catch {
    return []
  }
}

function productsForPicker(databaseProducts: any[] | null | undefined) {
  const rows = databaseProducts || []
  if (rows.length > 0) return rows
  return readProductListCache()
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function dbProductId(value: string) {
  return isUuid(value) ? value : null
}

export default function Sales() {
  const { lang, t, formatCurr, formatNum } = useLang()
  const location = useLocation()
  const [sales, setSales] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [customers, setCustomers] = useState<any[]>([])
  const [accounts, setAccounts] = useState<any[]>([])
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [business, setBusiness] = useState<any>(null)
  const [profilesMap, setProfilesMap] = useState<Record<string, any>>({})
  const [customerPayments, setCustomerPayments] = useState<any[]>([])
  const [customerDueById, setCustomerDueById] = useState<Record<string, number>>({})
  const [customerDueLoading, setCustomerDueLoading] = useState(false)
  const [inventoryMap, setInventoryMap] = useState<Record<string, number>>({})

  // View modes: 'create' for new invoice, 'history' for past sales list
  const [viewMode, setViewMode] = useState<'create' | 'history'>(() =>
    location.pathname === '/sales/ledger' ? 'history' : 'create'
  )
  const [showLedgerFinancials, setShowLedgerFinancials] = useState(false)
  
  // Modal states
  const [showInvoice, setShowInvoice] = useState(false)
  const [showQuickAddCustomer, setShowQuickAddCustomer] = useState(false)
  const [showQuickAddProduct, setShowQuickAddProduct] = useState(false)
  const [showDeliveryModal, setShowDeliveryModal] = useState(false)
  const [selectedSale, setSelectedSale] = useState<any>(null)
  const [expandedSaleId, setExpandedSaleId] = useState<string | null>(null)
  const [deliveryItem, setDeliveryItem] = useState<any>(null)
  const [deliveryForm, setDeliveryForm] = useState({
    delivery_date: new Date().toISOString().split('T')[0],
    delivered_by: '',
    delivered_qty: 1,
    notes: ''
  })
  
  // Editing states
  const [editingSale, setEditingSale] = useState<any>(null)
  
  // Search states
  const [search, setSearch] = useState('') // For history search
  const [deliveryFilter, setDeliveryFilter] = useState<'all' | 'pending' | 'partial' | 'delivered'>('all')
  const [ledgerDateFilter, setLedgerDateFilter] = useState<LedgerDateFilter>('all')
  const [customDateFrom, setCustomDateFrom] = useState('')
  const [customDateTo, setCustomDateTo] = useState('')
  const [productSearch, setProductSearch] = useState('') // For product selection search
  const [customerSearch, setCustomerSearch] = useState('')
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false)
  const [productSort, setProductSort] = useState<'none' | 'highToLow' | 'lowToHigh'>('none')
  const [showProductSort, setShowProductSort] = useState(false)
  
  // Auth state
  const { user, profile, touchOwnerActivity } = useAuth()
  const invoiceRef = useRef<HTMLDivElement>(null)

  // Invoice creation state
  const emptyItem = (): SaleItem => ({
    product_id: '',
    product_code: '',
    product_name: '',
    selling_price: 0,
    discount_amount: 0,
    discount_pct: 0,
    actual_price: 0,
    qty: 1,
    total_amount: 0,
    cost_price: 0,
    delivery_status: 'undelivered'
  })

  const [form, setForm] = useState({
    invoice_no: generateInvoiceNo(),
    date: new Date().toISOString().split('T')[0],
    customer_id: '',
    customer_name: '',
    customer_phone: '',
    customer_address: '',
    account_id: '',
    account_name: '',
    notes: ''
  })
  
  const [items, setItems] = useState<SaleItem[]>([emptyItem()])
  const [paymentRows, setPaymentRows] = useState<PaymentRow[]>([emptyPaymentRow()])
  const [deliveryCharge, setDeliveryCharge] = useState(0)
  const [quickCustomerForm, setQuickCustomerForm] = useState({ name: '', phone: '', address: '' })
  const [quickCustomerErrors, setQuickCustomerErrors] = useState<QuickCustomerValidationErrors>({})
  const [quickProductForm, setQuickProductForm] = useState({
    product_code: '',
    name: '',
    image_url: '',
    supplier_id: '',
    cost_price: 0,
    discount: 0,
    selling_price: 0,
    opening_qty: 0,
    size: '',
    weight: '',
  })

  function emptyPaymentRow(): PaymentRow {
    return { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, account_id: '', account_name: '', amount: 0 }
  }
  const deliveryFallbackKey = 'sales_delivery_fallback_v1'
  const costFallbackKey = 'sales_item_cost_fallback_v1'
  const salePaymentsFallbackKey = 'sales_split_payment_fallback_v1'

  useEffect(() => {
    loadAll()
    const channel = supabase
      .channel('sales-ledger-account-links')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'accounts' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sale_payments' }, loadAll)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  useEffect(() => {
    setViewMode(location.pathname === '/sales/ledger' ? 'history' : 'create')
  }, [location.pathname])

  useEffect(() => {
    if (!form.customer_id) {
      setCustomerDueLoading(false)
      return
    }

    let cancelled = false

    async function loadSelectedCustomerDue() {
      const customerId = form.customer_id
      setCustomerDueById(prev => ({
        ...prev,
        [customerId]: calculateCustomerPreviousDue(customerId)
      }))
      setCustomerDueLoading(true)

      try {
        const [salesRes, paymentsRes, customerRes] = await Promise.all([
          supabase
            .from('sales')
            .select('id, invoice_no, customer_id, net_amount, paid_amount, due_amount')
            .eq('customer_id', customerId)
            .eq('status', 'completed'),
          supabase
            .from('customer_payments')
            .select('customer_id, amount')
            .eq('customer_id', customerId),
          supabase
            .from('customers')
            .select('id, opening_due')
            .eq('id', customerId)
            .maybeSingle(),
        ])

        if (salesRes.error) throw salesRes.error
        if (paymentsRes.error) throw paymentsRes.error
        if (customerRes.error) throw customerRes.error

        const customer = customers.find(c => c.id === customerId)
        const selectedCustomer = {
          ...customer,
          opening_due: customerRes.data?.opening_due ?? customer?.opening_due ?? 0,
        }
        const freshDue = calculateCustomerPreviousDue(
          customerId,
          selectedCustomer,
          salesRes.data || [],
          paymentsRes.data || []
        )

        if (!cancelled) {
          setCustomerDueById(prev => ({ ...prev, [customerId]: freshDue }))
        }
      } catch (err: any) {
        if (!cancelled) {
          toast.error(err.message || 'Failed to load customer previous due')
        }
      } finally {
        if (!cancelled) setCustomerDueLoading(false)
      }
    }

    loadSelectedCustomerDue()

    return () => {
      cancelled = true
    }
  }, [form.customer_id, editingSale?.id])

  async function loadAll() {
    try {
      await recalculateFifoSaleCosts(user?.id, { skipSaleItemIds: Object.keys(readStorageMap(costFallbackKey)) })

      const [salRes, proRes, custRes, accRes, bizRes, invRes, profileRes, customerPayRes, supplierRes] = await Promise.all([
        supabase
          .from('sales')
          .select('*, sale_items(*)')
          .eq('status', 'completed')
          .order('date', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(100),
        supabase.from('products').select('id, product_code, name, selling_price, cost_price, image_url').eq('is_active', true),
        supabase
          .from('customers')
          .select('id, name, phone, address, opening_due, created_at')
          .order('created_at', { ascending: false })
          .order('id', { ascending: false }),
        supabase.from('accounts').select('*').eq('is_active', true).order('sort_order'),
        supabase.from('business_settings').select('*').maybeSingle(),
        supabase.from('inventory').select('product_id, available_qty').is('branch_id', null),
        supabase.from('profiles').select('id, full_name, phone, role'),
        supabase.from('customer_payments').select('customer_id, amount, date, created_at'),
        supabase.from('suppliers').select('id, name, company_name').eq('is_active', true).order('company_name'),
      ])

      if (salRes.error) throw salRes.error

      await backfillSaleAccountIds(salRes.data || [], accRes.data || [])
      const salesWithPayments = await attachSalePayments(salRes.data || [], accRes.data || [])
      const pickerProducts = productsForPicker(proRes.data)
      setSales(sortLatestSalesFirst(await attachSaleDeliveries(salesWithPayments)))
      setProducts(pickerProducts)
      setCustomers(custRes.data || [])
      setAccounts(accRes.data || [])
      setSuppliers(supplierRes.data || [])
      setBusiness(bizRes.data)
      setProfilesMap(Object.fromEntries((profileRes.data || []).map((p: any) => [p.id, p])))
      setCustomerPayments(customerPayRes.data || [])

      const invMap: Record<string, number> = {}
      for (const inv of invRes.data || []) {
        invMap[inv.product_id] = inv.available_qty || 0
      }
      for (const product of pickerProducts) {
        if (invMap[product.id] == null) invMap[product.id] = Number(product.opening_qty || 0)
      }
      setInventoryMap(invMap)
    } catch (err: any) {
      toast.error('Failed to load initial data')
      console.error(err)
    }
  }

  function saleSortTime(sale: any) {
    const raw = sale.created_at || sale.date
    const time = raw ? new Date(raw).getTime() : 0
    return Number.isNaN(time) ? 0 : time
  }

  function sortLatestSalesFirst(salesList: any[]) {
    return [...salesList].sort((a, b) =>
      saleSortTime(b) - saleSortTime(a) ||
      String(b.invoice_no || '').localeCompare(String(a.invoice_no || ''))
    )
  }

  function normalizeAccountName(value: string) {
    return safeText(value).toLowerCase().replace(/\s+/g, ' ').trim()
  }

  function accountNameById(accountId?: string, accountList: any[] = accounts) {
    if (!accountId) return ''
    return safeText(accountList.find(account => account.id === accountId)?.name)
  }

  function accountIdByName(accountName?: string, accountList: any[] = accounts) {
    const normalized = normalizeAccountName(accountName || '')
    if (!normalized) return ''
    return accountList.find(account => normalizeAccountName(account.name) === normalized)?.id || ''
  }

  function hydratePaymentAccount(payment: any, accountList: any[] = accounts) {
    const accountId = payment.account_id || accountIdByName(payment.account_name, accountList)
    return {
      ...payment,
      account_id: accountId,
      account_name: accountNameById(accountId, accountList) || safeText(payment.account_name),
    }
  }

  async function backfillSaleAccountIds(salesList: any[], accountList: any[]) {
    const updates = salesList
      .filter(sale => !sale.account_id && sale.account_name)
      .map(sale => ({ sale, accountId: accountIdByName(sale.account_name, accountList) }))
      .filter(item => item.accountId)

    if (updates.length === 0) return

    await Promise.all(updates.map(({ sale, accountId }) =>
      supabase.from('sales').update({ account_id: accountId, account_name: '' }).eq('id', sale.id)
    ))

    updates.forEach(({ sale, accountId }) => {
      sale.account_id = accountId
      sale.account_name = ''
    })
  }

  async function backfillSalePaymentAccountIds(paymentsList: any[], accountList: any[]) {
    const updates = paymentsList
      .filter(payment => !payment.account_id && payment.account_name)
      .map(payment => ({ payment, accountId: accountIdByName(payment.account_name, accountList) }))
      .filter(item => item.accountId)

    if (updates.length === 0) return

    await Promise.all(updates.map(({ payment, accountId }) =>
      supabase.from('sale_payments').update({ account_id: accountId, account_name: '' }).eq('id', payment.id)
    ))

    updates.forEach(({ payment, accountId }) => {
      payment.account_id = accountId
      payment.account_name = ''
    })
  }

  async function attachSalePayments(salesList: any[], accountList: any[] = accounts) {
    const saleIds = salesList.map(sale => sale.id).filter(Boolean)
    if (saleIds.length === 0) return salesList
    const fallbackPayments = readStorageMap(salePaymentsFallbackKey)

    const { data, error } = await supabase
      .from('sale_payments')
      .select('*')
      .in('sale_id', saleIds)

    if (error) {
      console.warn('Sale split payments could not be loaded', error)
      return mergeSalePayments(salesList, {}, fallbackPayments, accountList)
    }

    await backfillSalePaymentAccountIds(data || [], accountList)

    const paymentsBySale = (data || []).reduce((map: Record<string, any[]>, payment: any) => {
      if (!payment.sale_id) return map
      map[payment.sale_id] = [...(map[payment.sale_id] || []), payment]
      return map
    }, {})

    return mergeSalePayments(salesList, paymentsBySale, fallbackPayments, accountList)
  }

  function mergeSalePayments(salesList: any[], paymentsBySale: Record<string, any[]>, fallbackPayments: Record<string, any>, accountList: any[] = accounts) {
    return salesList.map(sale => ({
      ...sale,
      sale_payments: paymentsBySale[sale.id]?.length
        ? paymentsBySale[sale.id].map(payment => hydratePaymentAccount(payment, accountList))
        : salePaymentFallbackRows(fallbackPayments, sale.id).map(payment => hydratePaymentAccount(payment, accountList))
    }))
  }

  async function attachSaleDeliveries(salesList: any[]) {
    const saleIds = salesList.map(sale => sale.id).filter(Boolean)
    if (saleIds.length === 0) return salesList

    const fallbackDeliveries = readStorageMap(deliveryFallbackKey)
    const fallbackCosts = readStorageMap(costFallbackKey)

    const { data: deliveries, error } = await supabase
      .from('sale_deliveries')
      .select('*')
      .in('sale_id', saleIds)

    if (error) {
      if (isSaleDeliveriesMissing(error)) return mergeSaleItemFallbacks(salesList, {}, fallbackDeliveries, fallbackCosts)
      throw error
    }

    const deliveriesByItem = (deliveries || []).reduce((map: Record<string, any[]>, delivery: any) => {
      if (!delivery.sale_item_id) return map
      map[delivery.sale_item_id] = [...(map[delivery.sale_item_id] || []), delivery]
      return map
    }, {})

    return mergeSaleItemFallbacks(salesList, deliveriesByItem, fallbackDeliveries, fallbackCosts)
  }

  function readStorageMap(key: string) {
    try {
      return JSON.parse(localStorage.getItem(key) || '{}')
    } catch {
      return {}
    }
  }

  function writeStorageMap(key: string, nextMap: Record<string, any>) {
    localStorage.setItem(key, JSON.stringify(nextMap))
  }

  function saveStorageValue(key: string, itemId: string, value: any) {
    if (!itemId) return
    const current = readStorageMap(key)
    writeStorageMap(key, { ...current, [itemId]: value })
  }

  function saveStorageRows(key: string, itemId: string, rows: any[]) {
    if (!itemId) return
    const current = readStorageMap(key)
    writeStorageMap(key, { ...current, [itemId]: rows })
  }

  function salePaymentFallbackRows(fallbackPayments: Record<string, any>, saleId: string) {
    const value = fallbackPayments[saleId]
    if (!value) return []
    return Array.isArray(value) ? value : [value]
  }

  function deliveryFallbackRows(fallbackDeliveries: Record<string, any>, itemId: string) {
    const value = fallbackDeliveries[itemId]
    if (!value) return []
    return Array.isArray(value) ? value : [value]
  }

  function saveDeliveryFallback(itemId: string, delivery: any) {
    if (!itemId) return
    const current = readStorageMap(deliveryFallbackKey)
    const existing = deliveryFallbackRows(current, itemId)
    const nextRows = [...existing.filter((row: any) => row.id !== delivery.id), delivery]
    writeStorageMap(deliveryFallbackKey, { ...current, [itemId]: nextRows })
  }

  function mergeSaleItemFallbacks(
    salesList: any[],
    deliveriesByItem: Record<string, any[]>,
    fallbackDeliveries: Record<string, any>,
    fallbackCosts: Record<string, number>
  ) {
    return salesList.map(sale => ({
      ...sale,
      sale_items: (sale.sale_items || []).map((item: any) => ({
        ...item,
        cost_price: Number(item.cost_price || 0) || Number(fallbackCosts[item.id] || 0),
        sale_deliveries: deliveriesByItem[item.id]?.length
          ? deliveriesByItem[item.id]
          : deliveryFallbackRows(fallbackDeliveries, item.id)
      }))
    }))
  }

  function addProductToCart(product: any) {
    const existingIndex = items.findIndex(item => item.product_id === product.id)
    if (existingIndex > -1) {
      const newItems = [...items]
      newItems[existingIndex].qty += 1
      const item = newItems[existingIndex]
      item.total_amount = item.actual_price * item.qty
      setItems(newItems)
      toast.success(`${product.name} quantity increased`)
    } else {
      const productName = String(product.name || product.product_code || 'Manual Item').trim()
      const newItem: SaleItem = {
        product_id: product.id,
        product_code: product.product_code,
        product_name: productName,
        selling_price: Number(product.selling_price || 0),
        discount_amount: 0,
        discount_pct: 0,
        actual_price: Number(product.selling_price || 0),
        qty: 1,
        total_amount: Number(product.selling_price || 0),
        cost_price: Number(product.cost_price || 0),
        delivery_status: 'delivered',
        image_url: product.image_url
      }
      if (items.length === 1 && !items[0].product_name) {
        setItems([newItem])
      } else {
        setItems([...items, newItem])
      }
      toast.success(`Added ${productName} to invoice`)
    }
  }

  function updateItem(idx: number, field: string, value: any) {
    const newItems = [...items]
    newItems[idx] = { ...newItems[idx], [field]: value }
    
    if (field === 'product_name') {
      const p = products.find(p => p.name.toLowerCase() === String(value).trim().toLowerCase())
      newItems[idx].product_id = p?.id || ''
      newItems[idx].product_code = p?.product_code || ''
      newItems[idx].cost_price = Number(p?.cost_price || 0)
      if (p) {
        newItems[idx].selling_price = Number(p.selling_price || 0)
        newItems[idx].image_url = p.image_url
        newItems[idx].delivery_status = 'delivered'
      }
    }
    
    const item = newItems[idx]
    item.discount_amount = Math.min(Math.max(0, Number(item.discount_amount || 0)), Number(item.selling_price || 0))
    item.discount_pct = item.selling_price > 0 ? (item.discount_amount / item.selling_price) * 100 : 0
    item.actual_price = Math.max(0, item.selling_price - item.discount_amount)
    item.total_amount = item.actual_price * item.qty
    setItems(newItems)
  }

  function clearCart() {
    setItems([])
    toast.success('Cart cleared')
  }

  function openQuickAddCustomer() {
    setQuickCustomerForm({ name: '', phone: '', address: '' })
    setQuickCustomerErrors({})
    setShowQuickAddCustomer(true)
  }

  function closeQuickAddCustomer() {
    setShowQuickAddCustomer(false)
    setQuickCustomerForm({ name: '', phone: '', address: '' })
    setQuickCustomerErrors({})
  }

  const quickCustomerInputClass = (field: keyof QuickCustomerValidationErrors) =>
    `input ${quickCustomerErrors[field] ? 'border-red-500 focus:ring-red-500' : ''}`

  const clearQuickCustomerError = (field: keyof QuickCustomerValidationErrors) => {
    if (!quickCustomerErrors[field]) return
    setQuickCustomerErrors(current => {
      const next = { ...current }
      delete next[field]
      return next
    })
  }

  async function handleAddCustomer(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault()

    const payload = {
      name: quickCustomerForm.name.trim(),
      phone: quickCustomerForm.phone.trim(),
      address: quickCustomerForm.address.trim(),
      opening_due: 0,
      is_active: true
    }
    const nextErrors: QuickCustomerValidationErrors = {}

    if (!payload.name) nextErrors.name = REQUIRED_FIELD_MESSAGE
    if (!payload.phone) nextErrors.phone = REQUIRED_FIELD_MESSAGE

    setQuickCustomerErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    try {
      const { data, error } = await supabase
        .from('customers')
        .insert(payload)
        .select('id, name, phone, address, opening_due, created_at')
        .single()

      if (error) throw error
      toast.success('Customer added successfully')
      setCustomers(prev => [data, ...prev.filter(customer => customer.id !== data.id)])
      setForm(prev => ({
        ...prev,
        customer_id: data.id,
        customer_name: data.name,
        customer_phone: data.phone || '',
        customer_address: data.address || ''
      }))
      setCustomerSearch(`${data.name || ''}${data.phone ? ` (${data.phone})` : ''}`)
      setShowCustomerSuggestions(false)
      closeQuickAddCustomer()
    } catch (e: any) {
      toast.error(e.message || 'Failed to add customer')
    }
  }

  function removeMissingProductColumn(payload: any, error: any) {
    const message = String(error?.message || '')
    const match = message.match(/'([^']+)' column|column "([^"]+)"/i)
    const column = match?.[1] || match?.[2]
    if (!column || !(column in payload)) return payload
    const next = { ...payload }
    delete next[column]
    return next
  }

  async function createQuickProductInventory(_productId: string, _openingQty: number, _costPrice: number, _sellingPrice: number) {
    // The backend bootstraps inventory + opening stock batch when the
    // product is created (POST /products) - nothing to do client-side.
  }

  async function handleAddProduct() {
    const productCode = quickProductForm.product_code.trim()
    const productName = quickProductForm.name.trim()

    if (!productCode || !productName || !quickProductForm.supplier_id) {
      toast.error('Code, Product Name, and Supplier are required')
      return
    }

    try {
      const basePayload: any = {
        product_code: productCode,
        name: productName,
        image_url: quickProductForm.image_url || null,
        supplier_id: quickProductForm.supplier_id || null,
        cost_price: Number(quickProductForm.cost_price || 0),
        discount: Number(quickProductForm.discount || 0),
        selling_price: Number(quickProductForm.selling_price || 0),
        opening_qty: Number(quickProductForm.opening_qty || 0),
        size: quickProductForm.size || null,
        weight: quickProductForm.weight || null,
        is_active: true,
        owner_id: profile?.owner_id || user?.id,
      }

      let payload = basePayload
      let { data: product, error } = await supabase
        .from('products')
        .insert(payload)
        .select('id, product_code, name, selling_price, cost_price, image_url')
        .maybeSingle()

      for (let attempt = 0; error && attempt < 3; attempt += 1) {
        const retryPayload = removeMissingProductColumn(payload, error)
        if (retryPayload === payload) break
        payload = retryPayload
        const retry = await supabase
          .from('products')
          .insert(payload)
          .select('id, product_code, name, selling_price, cost_price, image_url')
          .maybeSingle()
        product = retry.data
        error = retry.error
      }

      if (error) {
        if (error.code === '23505' || String(error.message || '').toLowerCase().includes('duplicate')) {
          toast.error('Product code already exists')
          return
        }
        throw error
      }
      if (!product) throw new Error('Failed to create product')

      const openingQty = Number(quickProductForm.opening_qty || 0)
      await createQuickProductInventory(product.id, openingQty, quickProductForm.cost_price, quickProductForm.selling_price)

      setProducts(prev => [product, ...prev.filter(item => item.id !== product.id)])
      setInventoryMap(prev => ({ ...prev, [product.id]: openingQty }))
      setProductSearch(product.name)
      setShowQuickAddProduct(false)
      setQuickProductForm({ product_code: '', name: '', image_url: '', supplier_id: '', cost_price: 0, discount: 0, selling_price: 0, opening_qty: 0, size: '', weight: '' })
      toast.success('Product added. You can sell it now.')
    } catch (error: any) {
      toast.error(error.message || 'Failed to add product')
    }
  }

  // Calculations
  const subtotal = items.reduce((s, i) => s + (i.selling_price * i.qty), 0)
  const totalDiscount = items.reduce((s, i) => s + (i.discount_amount * i.qty), 0)
  const discountedSubtotal = items.reduce((s, i) => s + i.total_amount, 0)
  const grandTotal = discountedSubtotal + deliveryCharge
  const paymentRowsWithAmount = paymentRows.map(row => ({
    ...row,
    amount: Math.max(0, Number(row.amount || 0)),
  }))
  const totalPaid = paymentRowsWithAmount.reduce((sum, row) => sum + row.amount, 0)
  const due = Math.max(0, grandTotal - totalPaid)
  const validPaymentRows = paymentRowsWithAmount.filter(row => row.account_id && row.amount > 0)

  function updatePaymentRow(rowId: string, field: 'account_id' | 'amount', value: string | number) {
    setPaymentRows(current => current.map(row => {
      if (row.id !== rowId) return row
      if (field === 'account_id') {
        const account = accounts.find(item => item.id === value)
        return { ...row, account_id: String(value || ''), account_name: account?.name || '' }
      }
      return { ...row, amount: Math.max(0, Number(value || 0)) }
    }))
  }

  function removePaymentRow(rowId: string) {
    setPaymentRows(current => current.length > 1
      ? current.filter(row => row.id !== rowId)
      : [emptyPaymentRow()]
    )
  }

  function saleNotesForPaymentStatus(notes: string, paidAmount: number) {
    const trimmedNotes = String(notes || '').trim()
    if (paidAmount > 0 || trimmedNotes.toLowerCase().includes('due sell')) return trimmedNotes
    return [trimmedNotes, 'Due Sell'].filter(Boolean).join('\n')
  }

  function itemHasSaleValue(item: SaleItem) {
    return Boolean(
      String(item.product_name || item.product_code || '').trim() ||
      Number(item.selling_price || 0) > 0 ||
      Number(item.total_amount || 0) > 0
    )
  }

  function saleItemName(item: SaleItem) {
    return String(item.product_name || item.product_code || 'Manual Item').trim()
  }

  async function invoiceNoExists(invoiceNo: string) {
    if (!invoiceNo) return false
    const { data, error } = await supabase
      .from('sales')
      .select('id')
      .eq('invoice_no', invoiceNo)
      .maybeSingle()
    if (error) throw error
    return Boolean(data)
  }

  async function getAvailableInvoiceNo(preferredInvoiceNo?: string) {
    if (preferredInvoiceNo && !(await invoiceNoExists(preferredInvoiceNo))) {
      return preferredInvoiceNo
    }

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const invoiceNo = generateInvoiceNo()
      if (!(await invoiceNoExists(invoiceNo))) return invoiceNo
    }

    return `INV-${Date.now()}`
  }

  function saleOutstandingAmount(sale: any) {
    const storedDue = Number(sale.due_amount || 0)
    const calculatedDue = Number(sale.net_amount || 0) - Number(sale.paid_amount || 0)
    return Math.max(0, storedDue, calculatedDue)
  }

  async function adjustInventory(_productId: string, _qtyChange: number) {
    // Inventory rollbacks/deductions now happen inside the backend sale
    // transactions (POST/PUT/DELETE /sales) - adjusting here would double-count.
  }

  async function applyFifoCostToSaleItem(row: any, source: SaleItem, qty: number) {
    if (!row?.id || !source?.product_id || !isUuid(source.product_id) || qty <= 0) return Number(source.cost_price || 0)
    const manualCost = Number(source.cost_price || 0)
    const unitCost = await setManualCostForSaleItem({
      saleId: row.sale_id,
      saleItemId: row.id,
      productId: source.product_id,
      qty,
      unitCost: manualCost,
      userId: user?.id,
    })
    saveStorageValue(costFallbackKey, row.id, unitCost)
    row.cost_price = unitCost
    return unitCost
  }

  function consumeCostBatches(batches: CostBatch[], qty: number) {
    let remainingQty = Math.max(0, Number(qty || 0))
    let costTotal = 0
    let costedQty = 0

    for (const batch of batches) {
      if (remainingQty <= 0) break
      const takeQty = Math.min(batch.remaining_qty, remainingQty)
      if (takeQty <= 0) continue

      costTotal += takeQty * batch.actual_dp
      costedQty += takeQty
      batch.remaining_qty -= takeQty
      remainingQty -= takeQty
    }

    return costedQty > 0 ? costTotal / costedQty : 0
  }

  async function calculateFifoCostPrices(sourceItems: SaleItem[]) {
    const productIds = Array.from(new Set(sourceItems.map(item => item.product_id).filter(Boolean)))
    if (productIds.length === 0) return sourceItems.map(item => Number(item.cost_price || 0))

    const [purchaseRes, salesRes] = await Promise.all([
      supabase
        .from('purchase_items')
        .select('id, product_id, actual_dp, received_qty, purchases(date, created_at)')
        .in('product_id', productIds),
      supabase
        .from('sales')
        .select('id, date, created_at, sale_items(product_id, qty)')
        .eq('status', 'completed')
        .lte('date', form.date)
    ])

    if (purchaseRes.error) throw purchaseRes.error
    if (salesRes.error) throw salesRes.error

    const batchesByProduct: Record<string, CostBatch[]> = {}
    for (const row of purchaseRes.data || []) {
      const productId = row.product_id
      const receivedQty = Number(row.received_qty || 0)
      if (!productId || receivedQty <= 0) continue

      const purchase = Array.isArray(row.purchases) ? row.purchases[0] : row.purchases
      const batch: CostBatch = {
        product_id: productId,
        date: purchase?.date || '',
        created_at: purchase?.created_at || '',
        actual_dp: Number(row.actual_dp || 0),
        remaining_qty: receivedQty
      }
      batchesByProduct[productId] = [...(batchesByProduct[productId] || []), batch]
    }

    Object.values(batchesByProduct).forEach(batches => {
      batches.sort((a, b) =>
        new Date(a.date || a.created_at || 0).getTime() - new Date(b.date || b.created_at || 0).getTime() ||
        String(a.created_at || '').localeCompare(String(b.created_at || ''))
      )
    })

    const previousSaleItems = (salesRes.data || [])
      .filter((sale: any) => sale.id !== editingSale?.id)
      .sort((a: any, b: any) =>
        new Date(a.date || a.created_at || 0).getTime() - new Date(b.date || b.created_at || 0).getTime() ||
        String(a.created_at || '').localeCompare(String(b.created_at || ''))
      )
      .flatMap((sale: any) => sale.sale_items || [])

    for (const saleItem of previousSaleItems) {
      const productId = saleItem.product_id
      if (!productId || !batchesByProduct[productId]) continue
      consumeCostBatches(batchesByProduct[productId], Number(saleItem.qty || 0))
    }

    return sourceItems.map(item => {
      const batches = batchesByProduct[item.product_id] || []
      const fifoCost = consumeCostBatches(batches, Number(item.qty || 0))
      return fifoCost > 0 ? fifoCost : Number(item.cost_price || 0)
    })
  }

  async function createInitialDeliveries(saleId: string, invoiceNo: string, insertedItems: any[], sourceItems: SaleItem[]) {
    const deliveryRows = insertedItems
      .map((row: any, idx: number) => ({ row, source: sourceItems[idx] }))
      .filter(({ source }) => source?.delivery_status === 'delivered' && Number(source.qty || 0) > 0)

    for (const { row, source } of deliveryRows) {
      const deliveryPayload = {
        sale_id: saleId,
        sale_item_id: row.id,
        delivery_date: form.date,
        delivered_qty: source.qty,
        delivered_by: profile?.full_name || '',
        notes: 'Delivered at order time',
        created_by: user?.id,
      }
      const { data: insertedDeliveryData, error: deliveryError } = await supabase
        .from('sale_deliveries')
        .insert(deliveryPayload)
        .select()
        .maybeSingle()

      if (deliveryError) {
        if (!isSaleDeliveriesMissing(deliveryError)) throw deliveryError
      }

      const insertedDelivery = insertedDeliveryData || {
        ...deliveryPayload,
        id: `${row.id}-delivery`
      }
      saveDeliveryFallback(row.id, insertedDelivery)

      const { error: deliveredQtyError } = await supabase
        .from('sale_items')
        .update({ delivered_qty: source.qty })
        .eq('id', row.id)
      if (deliveredQtyError && !String(deliveredQtyError.message || '').includes('delivered_qty')) throw deliveredQtyError

      await applyFifoCostToSaleItem(row, source, source.qty)
      await adjustInventory(source.product_id, -source.qty)
      if (source.product_id) {
        await supabase.from('inventory_history').insert({
          product_id: source.product_id,
          product_name: source.product_name,
          change_type: 'sales_out',
          qty_change: -source.qty,
          reference_id: saleId,
          reference_type: 'sale_delivery',
          notes: `Delivered for invoice ${invoiceNo}`,
          created_by: user?.id
        })
      }
    }

    if (deliveryRows.length > 0) {
      await refreshDeliveryStatus(saleId)
    }
  }

  function previewSalePayments(saleId: string, invoiceNo: string, rows: PaymentRow[]) {
    return rows.map((row, index) => ({
      ...row,
      id: row.id || `${saleId}-payment-${index}`,
      sale_id: saleId,
      invoice_no: invoiceNo,
      date: form.date,
      customer_id: form.customer_id || null,
      customer_name: form.customer_name || '',
    }))
  }

  function salePaymentPayloads(saleId: string, invoiceNo: string, rows: PaymentRow[]) {
    return rows.map(row => ({
      sale_id: saleId,
      invoice_no: invoiceNo,
      date: form.date,
      customer_id: form.customer_id || null,
      customer_name: form.customer_name || '',
      account_id: row.account_id,
      account_name: '',
      amount: row.amount,
      created_by: user?.id,
    }))
  }

  function ledgerSaleFromSavedSale(sale: any, savedValues: any, insertedItems: any[], sourceItems: SaleItem[], salePayments: any[] = []) {
    const saleItems = insertedItems.map((item: any, idx: number) => {
      const source = sourceItems[idx]
      const deliveredQty = source?.delivery_status === 'delivered' ? Number(source.qty || 0) : 0

      return {
        ...item,
        delivered_qty: deliveredQty,
        sale_deliveries: deliveredQty > 0
          ? [{ id: `${item.id}-delivery`, delivery_date: savedValues.date, delivered_qty: deliveredQty, delivered_by: profile?.full_name || '' }]
          : []
      }
    })

    return { ...sale, ...savedValues, sale_items: saleItems, sale_payments: salePayments }
  }

  function rememberInsertedItemCosts(insertedItems: any[], sourceItems: SaleItem[]) {
    insertedItems.forEach((item: any, idx: number) => {
      if (!item?.id) return
      saveStorageValue(costFallbackKey, item.id, Number(sourceItems[idx]?.cost_price || 0))
    })
  }

  async function save(isCashSale: boolean) {
    if ((!form.customer_name && !form.customer_phone) || items.every(i => !itemHasSaleValue(i))) {
      toast.error(t('sales_fillAllFields')); return
    }

    if (totalPaid > grandTotal) {
      toast.error('Total paid cannot be greater than total bill')
      return
    }

    const rowsWithPositiveAmount = paymentRowsWithAmount.filter(row => row.amount > 0)
    if (totalPaid > 0 && validPaymentRows.length !== rowsWithPositiveAmount.length) {
      toast.error('Please select an account for each payment amount')
      return
    }

    const validItems = items.filter(itemHasSaleValue)
    const itemRows = validItems.map((item) => ({
      product_id: dbProductId(item.product_id),
      product_code: item.product_code || saleItemName(item),
      product_name: saleItemName(item),
      selling_price: item.selling_price,
      discount_pct: item.discount_pct,
      actual_price: item.actual_price,
      qty: item.qty,
      total_amount: item.total_amount,
      cost_price: item.cost_price,
    }))

    const finalPaid = validPaymentRows.length > 0
      ? validPaymentRows.reduce((sum, row) => sum + row.amount, 0)
      : 0
    const finalDue = Math.max(0, grandTotal - finalPaid)
    const primaryPayment = validPaymentRows[0]

    const invoiceNo = editingSale ? form.invoice_no : await getAvailableInvoiceNo(form.invoice_no)
    const saleValues = {
      ...form,
      invoice_no: invoiceNo,
      customer_id: form.customer_id || null,
      customer_name: form.customer_name || form.customer_phone || 'Walk-in Customer',
      customer_address: form.customer_address || '',
      account_id: primaryPayment?.account_id || null,
      account_name: '',
      subtotal: subtotal,
      discount_amount: totalDiscount,
      net_amount: grandTotal,
      paid_amount: finalPaid,
      due_amount: finalDue,
      notes: saleNotesForPaymentStatus(form.notes, finalPaid),
      status: 'completed'
    }
    const previewItems = validItems.map((item, idx) => ({
      ...itemRows[idx],
      id: `${invoiceNo}-${idx}`,
      delivered_qty: item.delivery_status === 'delivered' ? item.qty : 0,
      sale_deliveries: item.delivery_status === 'delivered'
        ? [{ id: `${invoiceNo}-${idx}-delivery`, delivery_date: form.date, delivered_qty: item.qty, delivered_by: profile?.full_name || '' }]
        : []
    }))

    try {
      // The backend saves the sale, items, payments, deliveries and runs the
      // FIFO costing in one transaction (POST /sales, PUT /sales/:id).
      const salePayload = {
        ...saleValues,
        items: validItems.map((item, idx) => ({
          ...itemRows[idx],
          delivered_qty: item.delivery_status === 'delivered' ? Number(item.qty || 0) : 0,
        })),
        payments: validPaymentRows.map(row => ({
          date: form.date,
          account_id: row.account_id,
          account_name: '',
          amount: row.amount,
        })),
      }

      if (editingSale) {
        const savedSale = await updateSaleRequest(editingSale.id, salePayload)

        await touchOwnerActivity(true)
        toast.success(t('common_updated'))
        setSales(prev => prev.map(s => s.id === editingSale.id ? savedSale : s))
        setSelectedSale(savedSale)
        setShowInvoice(true)
        setViewMode('history')
        await loadAll()
        resetForm()
        return
      }

      const savedSale = await createSaleRequest(salePayload)

      await touchOwnerActivity(true)
      toast.success(t('sales_saved'))
      setSales(prev => [savedSale, ...prev.filter(s => s.id !== savedSale.id)])
      setSelectedSale(savedSale)
      setShowInvoice(true)
      setViewMode('history')
      await loadAll()
      resetForm()
    } catch (err: any) {
      toast.error(err.message || t('common_error'))
    }
  }

  async function saveSalePayments(saleId: string, invoiceNo: string, paymentRowsToSave: PaymentRow[]) {
    try {
      const { error: deleteError } = await supabase.from('sale_payments').delete().eq('sale_id', saleId)
      if (deleteError) throw deleteError
      if (paymentRowsToSave.length === 0) {
        saveStorageRows(salePaymentsFallbackKey, saleId, [])
        return
      }
      const rows = salePaymentPayloads(saleId, invoiceNo, paymentRowsToSave)
      const { error } = await supabase.from('sale_payments').insert(rows)
      if (error) throw error
      saveStorageRows(salePaymentsFallbackKey, saleId, [])
    } catch (error: any) {
      const message = String(error?.message || '')
      if (message.toLowerCase().includes('sale_payments') || message.toLowerCase().includes('does not exist')) {
        saveStorageRows(salePaymentsFallbackKey, saleId, previewSalePayments(saleId, invoiceNo, paymentRowsToSave))
        toast.success('Split payment saved with local fallback.')
        return
      }
      throw error
    }
  }

  function resetForm() {
    setEditingSale(null)
    setForm({
      invoice_no: generateInvoiceNo(),
      date: new Date().toISOString().split('T')[0],
      customer_id: '',
      customer_name: '',
      customer_phone: '',
      customer_address: '',
      account_id: '',
      account_name: '',
      notes: ''
    })
    setCustomerSearch('')
    setShowCustomerSuggestions(false)
    setItems([emptyItem()])
    setPaymentRows([emptyPaymentRow()])
    setDeliveryCharge(0)
  }

  function editSale(sale: any) {
    setEditingSale(sale)
    setForm({
      invoice_no: sale.invoice_no,
      date: sale.date,
      customer_id: sale.customer_id || '',
      customer_name: sale.customer_name || '',
      customer_phone: sale.customer_phone || '',
      customer_address: sale.customer_address || '',
      account_id: sale.account_id || '',
      account_name: sale.account_name || '',
      notes: sale.notes || '',
    })
    setCustomerSearch(`${sale.customer_name || ''}${sale.customer_phone ? ` (${sale.customer_phone})` : ''}`)
    setShowCustomerSuggestions(false)
    
    setItems((sale.sale_items || []).map((item: any) => {
      // Find matching product image from memory
      const matchingProduct = products.find(p => p.id === item.product_id)
      return {
        product_id: item.product_id,
        product_code: item.product_code,
        product_name: item.product_name,
        selling_price: Number(item.selling_price || 0),
        discount_amount: Math.max(0, Number(item.selling_price || 0) - Number(item.actual_price || 0)),
        discount_pct: Number(item.discount_pct || 0),
        actual_price: Number(item.actual_price || 0),
        qty: Number(item.qty || 0),
        total_amount: Number(item.total_amount || 0),
        cost_price: Number(item.cost_price || 0),
        delivery_status: pendingQty(item) > 0 ? 'undelivered' : 'delivered',
        image_url: matchingProduct?.image_url
      }
    }))
    
    const existingPayments = salePaymentRowsForInvoice(sale)
    setPaymentRows(existingPayments.length > 0
      ? existingPayments.map((payment, index) => ({
          id: payment.id || `${sale.id || Date.now()}-payment-${index}`,
          account_id: payment.account_id || '',
          account_name: payment.account_name || '',
          amount: Number(payment.amount || 0),
        }))
      : [emptyPaymentRow()]
    )
    
    // Infer delivery charge: net_amount - (subtotal - discount_amount)
    const saleSub = (sale.sale_items || []).reduce((s: number, item: any) => s + Number(item.selling_price || 0) * Number(item.qty || 0), 0)
    const saleDisc = (sale.sale_items || []).reduce((s: number, item: any) => s + Math.max(0, Number(item.selling_price || 0) - Number(item.actual_price || 0)) * Number(item.qty || 0), 0)
    const inferredDelivery = Number(sale.net_amount || 0) - (saleSub - saleDisc)
    setDeliveryCharge(Math.max(0, inferredDelivery))
    
    setViewMode('create')
  }

  async function deleteSale(sale: any) {
    if (!(await confirmAction({ message: `${t('common_delete')} ${sale.invoice_no}?` }))) return
    try {
      // The backend releases FIFO layers, restores inventory and snapshots
      // the sale into the recycle bin in one transaction.
      await deleteSaleRequest(sale.id, {
        type: 'sales',
        title: sale.customer_name || '-',
        subtitle: sale.invoice_no || '-',
        amount: Number(sale.net_amount || 0),
      })
      await touchOwnerActivity(true)
      toast.success(t('common_deleted'))
      loadAll()
    } catch (err: any) {
      toast.error(err.message || t('common_error'))
    }
  }

  function saleDiscount(sale: any) {
    const stored = Number(sale.discount_amount || 0)
    return stored || (sale.sale_items || []).reduce((sum: number, item: any) =>
      sum + (Number(item.selling_price || 0) - Number(item.actual_price || 0)) * Number(item.qty || 0), 0)
  }

  function saleGrossTotal(sale: any) {
    const itemTotal = (sale.sale_items || []).reduce((sum: number, item: any) =>
      sum + Number(item.selling_price || 0) * Number(item.qty || 0), 0)
    return itemTotal || Number(sale.subtotal || 0) || Number(sale.net_amount || 0) + saleDiscount(sale)
  }

  function saleSubtotalAfterDiscount(sale: any) {
    return Math.max(0, saleGrossTotal(sale) - saleDiscount(sale))
  }

  function salePurchaseAmount(sale: any) {
    return (sale.sale_items || []).reduce((sum: number, item: any) =>
      sum + Number(item.cost_price || 0) * Number(item.qty || 0), 0)
  }

  function saleProfit(sale: any) {
    const saleItems = sale.sale_items || []
    if (saleItems.length === 0) return 0
    return saleItems.reduce((sum: number, item: any) => sum + itemProfit(item), 0)
  }

  function saleHasMissingPurchaseAmount(sale: any) {
    const saleItems = sale.sale_items || []
    return saleItems.some((item: any) => Number(item.cost_price || 0) <= 0)
  }

  function formatInvoiceDateTime(value?: string) {
    const date = value ? new Date(value) : new Date()
    if (Number.isNaN(date.getTime())) return '-'
    const datePart = date.toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-GB', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    })
    const timePart = date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })
    return `${datePart} at ${timePart}`
  }

  const handlePrint = useReactToPrint({ content: () => invoiceRef.current })
  const safeText = (value: unknown) => String(value ?? '')
  const safeLower = (value: unknown) => safeText(value).toLowerCase()
  const isSaleDeliveriesMissing = (error: any) =>
    String(error?.message || '').includes('sale_deliveries') ||
    String(error?.message || '').includes('public.sale_deliveries')

  function deliveredQty(item: any) {
    const fromHistory = (item.sale_deliveries || []).reduce((sum: number, delivery: any) => sum + Number(delivery.delivered_qty || 0), 0)
    return fromHistory || Number(item.delivered_qty || 0)
  }

  function pendingQty(item: any) {
    return Math.max(0, Number(item.qty || 0) - deliveredQty(item))
  }

  function saleDeliveredQty(sale: any) {
    return (sale.sale_items || []).reduce((sum: number, item: any) => sum + deliveredQty(item), 0)
  }

  function salePendingQty(sale: any) {
    return (sale.sale_items || []).reduce((sum: number, item: any) => sum + pendingQty(item), 0)
  }

  function deliveryStatus(sale: any) {
    const pending = salePendingQty(sale)
    const delivered = saleDeliveredQty(sale)
    if (pending <= 0) return 'delivered'
    if (delivered > 0) return 'partial'
    return 'pending'
  }

  async function refreshDeliveryStatus(saleId: string) {
    const { data: allItems, error } = await supabase
      .from('sale_items')
      .select('id, qty, delivered_qty')
      .eq('sale_id', saleId)

    if (error) {
      if (String(error.message || '').includes('delivered_qty')) return
      throw error
    }

    const { data: deliveries, error: deliveriesError } = await supabase
      .from('sale_deliveries')
      .select('sale_item_id, delivered_qty')
      .eq('sale_id', saleId)

    let deliveryRows = deliveries || []
    if (deliveriesError) {
      if (!isSaleDeliveriesMissing(deliveriesError)) throw deliveriesError
      deliveryRows = []
    }

    const deliveriesByItem = deliveryRows.reduce((map: Record<string, number>, delivery: any) => {
      if (!delivery.sale_item_id) return map
      map[delivery.sale_item_id] = (map[delivery.sale_item_id] || 0) + Number(delivery.delivered_qty || 0)
      return map
    }, {})

    const delivered = (allItems || []).reduce((sum: number, item: any) => {
      const historyQty = deliveriesByItem[item.id] || 0
      return sum + (historyQty || Number(item.delivered_qty || 0))
    }, 0)
    const total = (allItems || []).reduce((sum: number, item: any) => sum + Number(item.qty || 0), 0)
    const status = total > 0 && delivered >= total ? 'delivered' : delivered > 0 ? 'partial' : 'pending'
    const { error: statusError } = await supabase
      .from('sales')
      .update({ delivery_status: status, updated_at: new Date().toISOString() })
      .eq('id', saleId)

    if (statusError && !String(statusError.message || '').includes('delivery_status')) {
      throw statusError
    }
  }

  async function saveDelivery() {
    if (!deliveryItem) return
    const maxQty = pendingQty(deliveryItem)
    if (deliveryForm.delivered_qty <= 0 || deliveryForm.delivered_qty > maxQty) {
      toast.error(`Delivery quantity must be between 1 and ${maxQty}`)
      return
    }

    try {
      // POST /sales/:id/deliveries records the delivery, bumps the item's
      // delivered_qty and refreshes the sale delivery status atomically.
      await addSaleDelivery(deliveryItem.sale_id, {
        sale_item_id: deliveryItem.id,
        delivery_date: deliveryForm.delivery_date,
        delivered_qty: deliveryForm.delivered_qty,
        delivered_by: deliveryForm.delivered_by,
        notes: deliveryForm.notes,
      })

      await touchOwnerActivity(true)
      toast.success('Product delivered successfully')
      setShowDeliveryModal(false)
      setDeliveryItem(null)
      setDeliveryForm({
        delivery_date: new Date().toISOString().split('T')[0],
        delivered_by: '',
        delivered_qty: 1,
        notes: ''
      })
      await loadAll()
    } catch (err: any) {
      toast.error(err.message || t('common_error'))
    }
  }

  async function updateSaleItemCost(itemId: string, costPrice: number) {
    saveStorageValue(costFallbackKey, itemId, costPrice)

    try {
      // Server releases the old cost layers and re-applies the manual rate.
      await setManualSaleItemCost(itemId, costPrice)
    } catch (err: any) {
      toast.error(err.message || 'Failed to update purchase rate')
      return
    }

    setSales(prev => prev.map(sale => ({
      ...sale,
      sale_items: (sale.sale_items || []).map((item: any) =>
        item.id === itemId ? { ...item, cost_price: costPrice } : item
      )
    })))
    toast.success('Purchase rate updated')
  }
  
  function dateInputValue(date: Date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  function ledgerDateRange() {
    const now = new Date()
    const today = dateInputValue(now)

    if (ledgerDateFilter === 'all') return { from: '', to: '' }
    if (ledgerDateFilter === 'today') return { from: today, to: today }
    if (ledgerDateFilter === 'yesterday') {
      const yesterday = new Date(now)
      yesterday.setDate(now.getDate() - 1)
      const value = dateInputValue(yesterday)
      return { from: value, to: value }
    }
    if (ledgerDateFilter === 'month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      return { from: dateInputValue(firstDay), to: dateInputValue(lastDay) }
    }
    if (ledgerDateFilter === 'year') {
      return { from: `${now.getFullYear()}-01-01`, to: `${now.getFullYear()}-12-31` }
    }

    return { from: customDateFrom, to: customDateTo }
  }

  function saleDateValue(sale: any) {
    return safeText(sale?.date || sale?.created_at).slice(0, 10)
  }

  function isSaleInLedgerDateRange(sale: any) {
    const { from, to } = ledgerDateRange()
    const saleDate = saleDateValue(sale)
    if (!saleDate) return false
    if (from && saleDate < from) return false
    if (to && saleDate > to) return false
    return true
  }

  // History table search filter
  const normalizedSearch = search.toLowerCase()
  const filteredSales = sales.filter(s =>
    (
      !search ||
      safeLower(s.customer_name).includes(normalizedSearch) ||
      safeLower(s.invoice_no).includes(normalizedSearch) ||
      safeLower(saleAccountDisplay(s)).includes(normalizedSearch) ||
      safeText(s.customer_phone).includes(search)
    ) &&
    (deliveryFilter === 'all' || deliveryStatus(s) === deliveryFilter) &&
    isSaleInLedgerDateRange(s)
  )
  const filteredSalesTotal = filteredSales.reduce((sum, sale) => sum + saleSubtotalAfterDiscount(sale), 0)
  const deliveryFilterOptions = [
    { key: 'all', label: 'All' },
    { key: 'pending', label: 'Pending' },
    { key: 'partial', label: 'Partial' },
    { key: 'delivered', label: 'Delivered' },
  ] as const
  const ledgerDateFilterOptions: { key: LedgerDateFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'today', label: 'Today' },
    { key: 'yesterday', label: 'Yesterday' },
    { key: 'month', label: 'This Month' },
    { key: 'year', label: 'This Year' },
    { key: 'custom', label: 'Custom Range' },
  ]

  function selectLedgerDateFilter(nextFilter: LedgerDateFilter) {
    setLedgerDateFilter(nextFilter)
    if (nextFilter === 'all') {
      setCustomDateFrom('')
      setCustomDateTo('')
    }
  }

  // Products left panel search filter
  const normalizedProductSearch = productSearch.toLowerCase()
  const productMatches = products.filter(p =>
    !productSearch ||
    safeLower(p.name).includes(normalizedProductSearch) ||
    safeLower(p.product_code).includes(normalizedProductSearch)
  )
  const filteredProducts = productSort === 'none'
    ? productMatches
    : [...productMatches].sort((a, b) => {
        const priceA = Number(a.selling_price || 0)
        const priceB = Number(b.selling_price || 0)
        return productSort === 'highToLow' ? priceB - priceA : priceA - priceB
      })

  const invoiceLabels = lang === 'bn' ? {
    invoice: 'ইনভয়েস',
    originalCopy: 'মূল কপি (Original Copy)',
    invoiceNo: 'ইনভয়েস নম্বর',
    date: 'তারিখ',
    printTime: 'প্রিন্ট করার সময়',
    customerName: 'ক্রেতার নাম',
    mobile: 'মোবাইল',
    address: 'ঠিকানা',
    sellerName: 'বিক্রেতার নাম',
    sellerPhone: 'বিক্রেতার মোবাইল',
    sellerType: 'বিক্রেতার ধরন',
    productName: 'পণ্যের নাম',
    productCode: 'প্রোডাক্ট কোড',
    qty: 'পরিমাণ',
    unit: 'ইউনিট',
    unitPrice: 'ইউনিট মূল্য',
    total: 'মোট',
    pcs: 'পিস',
    previousDue: 'পূর্বের বাকি',
    currentDue: 'বর্তমান বাকি',
    totalDue: 'মোট বাকি',
    subtotal: 'সাব টোটাল',
    discount: '(-) ছাড়',
    deliveryCharge: 'ডেলিভারি চার্জ',
    otherCharge: 'অন্যান্য চার্জ',
    grandTotal: 'মোট',
    paid: 'পরিশোধিত',
    due: 'বাকি রয়েছে',
    amountWords: 'এমাউন্ট (কথায়)',
    amountWordsValue: 'হিসাব অনুযায়ী মোট টাকা মাত্র।',
    customerSignature: 'ক্রেতার স্বাক্ষর',
    sellerSignature: 'বিক্রেতার স্বাক্ষর',
    thankYou: 'ধন্যবাদ, আবার আসবেন।',
    noAddress: '[ক্রেতার ঠিকানা]',
  } : {
    invoice: 'Invoice',
    originalCopy: 'Original Copy',
    invoiceNo: 'Invoice No',
    date: 'Date',
    printTime: 'Print Time',
    customerName: 'Customer Name',
    mobile: 'Mobile',
    address: 'Address',
    sellerName: 'Seller Name',
    sellerPhone: 'Seller Phone',
    sellerType: 'Seller Type',
    productName: 'Product Name',
    productCode: 'Product Code',
    qty: 'Qty',
    unit: 'Unit',
    unitPrice: 'Unit Price',
    total: 'Total',
    pcs: 'Pcs',
    previousDue: 'Previous Due',
    currentDue: 'Current Due',
    totalDue: 'Total Due',
    subtotal: 'Subtotal',
    discount: '(-) Discount',
    deliveryCharge: 'Delivery Charge',
    otherCharge: 'Other Charge',
    grandTotal: 'Total',
    paid: 'Paid',
    due: 'Due',
    amountWords: 'Amount In Words',
    amountWordsValue: 'Only the total amount shown above.',
    customerSignature: 'Customer Signature',
    sellerSignature: 'Seller Signature',
    thankYou: 'Thank you, please visit again.',
    noAddress: '[Customer address]',
  }

  function invoiceItemSubtotal(sale: any) {
    return (sale.sale_items || []).reduce((sum: number, item: any) =>
      sum + Number(item.selling_price || 0) * Number(item.qty || 0), 0)
  }

  function invoiceTotalQty(sale: any) {
    return (sale.sale_items || []).reduce((sum: number, item: any) => sum + Number(item.qty || 0), 0)
  }

  function itemImageUrl(item: any) {
    return item.image_url || products.find(p => p.id === item.product_id)?.image_url || ''
  }

  function itemDiscountTotal(item: any) {
    return Math.max(0, Number(item.selling_price || 0) - Number(item.actual_price || 0)) * Number(item.qty || 0)
  }

  function itemProfit(item: any) {
    const costPrice = Number(item.cost_price || 0)
    if (costPrice <= 0) return 0
    return (Number(item.actual_price || 0) - costPrice) * Number(item.qty || 0)
  }

  function itemLatestDeliveryDate(item: any) {
    const deliveries = item.sale_deliveries || []
    if (deliveries.length === 0) return ''

    return deliveries
      .map((delivery: any) => delivery.delivery_date)
      .filter(Boolean)
      .sort((a: string, b: string) => new Date(b).getTime() - new Date(a).getTime())[0] || ''
  }

  function saleDeliveryRows(sale: any) {
    return (sale.sale_items || []).flatMap((item: any) =>
      (item.sale_deliveries || []).map((delivery: any) => ({ ...delivery, product_name: item.product_name }))
    )
  }

  function invoiceDeliveryCharge(sale: any) {
    const beforeCharge = invoiceItemSubtotal(sale) - saleDiscount(sale)
    return Math.max(0, Number(sale.net_amount || 0) - beforeCharge)
  }

  function numberToWords(value: number): string {
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

    const belowHundred = (n: number) => {
      if (n < 20) return ones[n]
      return [tens[Math.floor(n / 10)], ones[n % 10]].filter(Boolean).join(' ')
    }

    const belowThousand = (n: number) => {
      const hundred = Math.floor(n / 100)
      const rest = n % 100
      return [
        hundred ? `${ones[hundred]} Hundred` : '',
        rest ? belowHundred(rest) : '',
      ].filter(Boolean).join(' ')
    }

    if (value === 0) return 'Zero'

    return [
      { label: 'Crore', amount: Math.floor(value / 10000000) },
      { label: 'Lakh', amount: Math.floor((value % 10000000) / 100000) },
      { label: 'Thousand', amount: Math.floor((value % 100000) / 1000) },
      { label: '', amount: value % 1000 },
    ]
      .filter(part => part.amount > 0)
      .map(part => `${belowThousand(part.amount)} ${part.label}`.trim())
      .join(' ')
  }

  function amountInWords(amount: number): string {
    const normalizedAmount = Math.max(Number(amount || 0), 0)
    const taka = Math.floor(normalizedAmount)
    const paisa = Math.round((normalizedAmount - taka) * 100)
    const paisaText = paisa ? ` and ${numberToWords(paisa)} Paisa` : ''
    return `${numberToWords(taka)} Taka${paisaText} Only`
  }

  function roleLabel(role?: string) {
    const labels: Record<string, { en: string; bn: string }> = {
      owner: { en: 'Owner', bn: 'মালিক' },
      manager: { en: 'Manager', bn: 'ম্যানেজার' },
      sales_staff: { en: 'Sales Staff', bn: 'বিক্রয়কর্মী' },
      accountant: { en: 'Accountant', bn: 'হিসাবরক্ষক' },
    }
    return labels[role || '']?.[lang] || safeText(role).replace('_', ' ') || '-'
  }

  function saleSeller(sale: any) {
    return profilesMap[sale.created_by] || (sale.created_by === user?.id ? profile : null) || profile
  }

  function entryTime(entry: any) {
    const raw = entry.created_at || entry.date
    const time = raw ? new Date(raw).getTime() : 0
    return Number.isNaN(time) ? 0 : time
  }

  function previousDueForSale(sale: any) {
    if (!sale.customer_id) return 0
    const customer = customers.find(c => c.id === sale.customer_id)
    const saleTime = entryTime(sale)
    const openingDue = Number(customer?.opening_due || 0)
    const previousSalesDue = sales
      .filter(s => s.customer_id === sale.customer_id)
      .filter(s => s.id !== sale.id && s.invoice_no !== sale.invoice_no)
      .filter(s => !saleTime || entryTime(s) < saleTime)
      .reduce((sum, s) => sum + saleOutstandingAmount(s), 0)
    const paymentsBeforeSale = customerPayments
      .filter(payment => payment.customer_id === sale.customer_id)
      .filter(payment => !saleTime || entryTime(payment) < saleTime)
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0)

    return Math.max(0, openingDue + previousSalesDue - paymentsBeforeSale)
  }

  function calculateCustomerPreviousDue(
    customerId: string,
    customerOverride?: any,
    customerSales: any[] = sales,
    paymentsList: any[] = customerPayments
  ) {
    if (!customerId) return 0
    const customer = customerOverride || customers.find(c => c.id === customerId)
    const openingDue = Number(customer?.opening_due || 0)
    const salesDue = customerSales
      .filter(s => s.customer_id === customerId)
      .filter(s => !editingSale || s.id !== editingSale.id)
      .reduce((sum, s) => sum + saleOutstandingAmount(s), 0)
    const payments = paymentsList
      .filter(payment => payment.customer_id === customerId)
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0)

    return Math.max(0, openingDue + salesDue - payments)
  }

  function currentCustomerPreviousDue(customerId: string) {
    if (!customerId) return 0
    return customerDueById[customerId] ?? calculateCustomerPreviousDue(customerId)
  }

  function saleCustomerAddress(sale: any) {
    const storedAddress = safeText(sale?.customer_address)
    if (storedAddress) return storedAddress

    const salePhone = safeText(sale?.customer_phone).replace(/\D/g, '')
    const saleName = safeText(sale?.customer_name).trim().toLowerCase()
    const customer = sale?.customer_id
      ? customers.find(c => c.id === sale.customer_id)
      : customers.find(c => {
          const customerPhone = safeText(c.phone).replace(/\D/g, '')
          const customerName = safeText(c.name).trim().toLowerCase()
          return (salePhone && customerPhone === salePhone) || (saleName && customerName === saleName)
        })

    return safeText(customer?.address)
  }

  function salePaymentRowsForInvoice(sale: any): PaymentRow[] {
    const splitPayments = Array.isArray(sale?.sale_payments)
      ? sale.sale_payments
          .map((payment: any, index: number) => ({
            id: payment.id || `${sale.id || 'sale'}-payment-${index}`,
            account_id: payment.account_id || '',
            account_name: accountNameById(payment.account_id) || safeText(payment.account_name),
            amount: Math.max(0, Number(payment.amount || 0)),
          }))
          .filter((payment: PaymentRow) => payment.amount > 0)
      : []

    if (splitPayments.length > 0) return splitPayments

    const paidAmount = Math.max(0, Number(sale?.paid_amount || 0))
    if (paidAmount <= 0) return []

    return [{
      id: `${sale?.id || 'sale'}-payment`,
      account_id: sale?.account_id || '',
      account_name: accountNameById(sale?.account_id) || safeText(sale?.account_name),
      amount: paidAmount,
    }]
  }

  function saleAccountDisplay(sale: any) {
    const accountNames = salePaymentRowsForInvoice(sale)
      .map(payment => safeText(payment.account_name))
      .filter(Boolean)

    const uniqueNames = accountNames.filter((name, index) => accountNames.indexOf(name) === index)
    if (uniqueNames.length > 0) return uniqueNames.join(' & ')

    return safeText(sale?.account_name) || '-'
  }

  const selectedSalePreviousDue = selectedSale ? previousDueForSale(selectedSale) : 0
  const selectedSaleInvoiceAmount = Number(selectedSale?.net_amount || 0)
  const selectedSalePaidAmount = Number(selectedSale?.paid_amount || 0)
  const selectedSaleTotalDue = selectedSalePreviousDue + selectedSaleInvoiceAmount
  const selectedSaleCurrentDue = Math.max(0, selectedSaleTotalDue - selectedSalePaidAmount)
  const selectedSaleCustomerAddress = selectedSale ? saleCustomerAddress(selectedSale) : ''
  const selectedSalePaymentRows = selectedSale ? salePaymentRowsForInvoice(selectedSale) : []
  const customerPreviousDue = currentCustomerPreviousDue(form.customer_id)
  const totalCustomerDue = Math.max(0, customerPreviousDue + due)
  const normalizedCustomerSearch = customerSearch.trim().toLowerCase()
  const customerSuggestions = normalizedCustomerSearch
    ? customers
        .filter(customer =>
          safeLower(customer.name).includes(normalizedCustomerSearch) ||
          safeText(customer.phone).toLowerCase().includes(normalizedCustomerSearch)
        )
        .slice(0, 8)
    : []

  function selectCustomer(customer: any) {
    setForm(current => ({
      ...current,
      customer_id: customer.id,
      customer_name: customer.name || '',
      customer_phone: customer.phone || '',
      customer_address: customer.address || '',
    }))
    setCustomerSearch(`${customer.name || ''}${customer.phone ? ` (${customer.phone})` : ''}`)
    setShowCustomerSuggestions(false)
  }

  useEffect(() => {
    const value = customerSearch.trim()
    if (!value || form.customer_id) return

    const valueDigits = value.replace(/\D/g, '')
    const exactCustomer = customers.find(customer => {
      const nameMatches = safeLower(customer.name) === value.toLowerCase()
      const phoneDigits = safeText(customer.phone).replace(/\D/g, '')
      const phoneMatches = valueDigits.length >= 6 && phoneDigits === valueDigits
      return nameMatches || phoneMatches
    })

    if (exactCustomer) selectCustomer(exactCustomer)
  }, [customerSearch, customers, form.customer_id])

  return (
    <div className={viewMode === 'create' ? 'p-6 space-y-6 bg-slate-50 min-h-screen' : 'flex h-full min-h-0 flex-col overflow-hidden bg-slate-50 p-6'}>
      <PageHeader
        title={viewMode === 'create' ? 'New Sale / Create Invoice' : t('sales_ledger', 'Sales Ledger')}
        subtitle={viewMode === 'create' ? 'Manage and generate retail invoices' : 'Invoice ledger and profit management'}
        actions={
          viewMode === 'create' ? (
            <button
              onClick={() => {
                setViewMode('history')
                resetForm()
              }}
              className="btn-secondary flex items-center gap-2 border border-slate-200"
            >
              <Printer size={16} /> Sales Ledger
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowLedgerFinancials(value => !value)}
              className="btn-secondary flex items-center gap-2 border border-slate-200"
              title={showLedgerFinancials ? 'Hide purchase and profit' : 'Show purchase and profit'}
              aria-label={showLedgerFinancials ? 'Hide purchase and profit' : 'Show purchase and profit'}
            >
              {showLedgerFinancials ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          )
        }
      />

      {viewMode === 'create' ? (
        <div className="grid grid-cols-12 gap-6 items-start">
          {/* LEFT COLUMN: Product Selector (3 cols) */}
          <div className="col-span-12 lg:col-span-4 xl:col-span-3 card h-[calc(100vh-170px)] flex flex-col p-4 bg-white">
            <h3 className="text-sm font-semibold text-slate-800 mb-3">Select Products</h3>
            
            <div className="flex gap-2 mb-4 flex-shrink-0">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  value={productSearch}
                  onChange={e => setProductSearch(e.target.value)}
                  placeholder="Search by product name or code..."
                  className="input pl-9 text-xs"
                />
              </div>
              <button 
                onClick={() => setShowQuickAddProduct(true)}
                className="p-2 border border-green-200 bg-green-50 rounded-lg text-brand-green hover:bg-green-100 transition"
                title="Add New Product"
                aria-label="Add New Product"
              >
                <Plus size={16} />
              </button>
              <button 
                onClick={() => toast.success('Barcode scan active')} 
                className="p-2 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50 transition"
                title="Barcode Scanner Mode"
              >
                <Barcode size={16} />
              </button>
              <div className="relative">
                <button
                  onClick={() => setShowProductSort(current => !current)}
                  className={`p-2 border rounded-lg transition ${
                    productSort === 'none'
                      ? 'border-slate-200 text-slate-500 hover:bg-slate-50'
                      : 'border-brand-green bg-green-50 text-brand-green'
                  }`}
                  title="Filter Options"
                >
                  <Filter size={16} />
                </button>
                {showProductSort && (
                  <div className="absolute right-0 top-11 z-20 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 text-xs font-semibold shadow-lg">
                    <button
                      onClick={() => {
                        setProductSort('highToLow')
                        setShowProductSort(false)
                      }}
                      className={`block w-full px-3 py-2 text-left hover:bg-slate-50 ${productSort === 'highToLow' ? 'text-brand-green' : 'text-slate-700'}`}
                    >
                      High to low price
                    </button>
                    <button
                      onClick={() => {
                        setProductSort('lowToHigh')
                        setShowProductSort(false)
                      }}
                      className={`block w-full px-3 py-2 text-left hover:bg-slate-50 ${productSort === 'lowToHigh' ? 'text-brand-green' : 'text-slate-700'}`}
                    >
                      Low to high price
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {filteredProducts.map(p => {
                const stock = inventoryMap[p.id] || 0
                return (
                  <div 
                    key={p.id} 
                    className="flex items-center gap-3 p-3 border border-slate-100 rounded-xl hover:border-slate-200 hover:shadow-sm transition bg-white"
                  >
                    {p.image_url ? (
                      <img 
                        src={p.image_url} 
                        alt={safeText(p.name)} 
                        className="w-12 h-12 object-cover rounded-lg border border-slate-100 flex-shrink-0" 
                        onError={e => ((e.target as HTMLImageElement).style.display = 'none')} 
                      />
                    ) : (
                      <div className="w-12 h-12 bg-slate-50 rounded-lg flex items-center justify-center border border-slate-100 text-slate-300 flex-shrink-0">
                        <Image size={16} />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-700 truncate" title={safeText(p.name)}>{safeText(p.name) || '-'}</p>
                      <p className="text-[10px] text-slate-400 font-mono">{safeText(p.product_code) || '-'}</p>
                      <p className="text-[11px] text-slate-500 mt-1">
                        <span className="font-semibold text-brand-green">{formatCurr(Number(p.selling_price || 0))}</span>
                        <span className="mx-1 text-slate-300">|</span>
                        <span>Stock: <strong className={stock > 0 ? 'text-slate-600' : 'text-brand-red'}>{stock}</strong></span>
                      </p>
                    </div>
                    <button
                      onClick={() => addProductToCart(p)}
                      className="px-2.5 py-1.5 bg-brand-green hover:bg-green-700 text-white rounded-lg text-xs font-semibold transition"
                    >
                      Add
                    </button>
                  </div>
                )
              })}
              {filteredProducts.length === 0 && (
                <div className="text-center py-8 text-slate-400 text-xs">No active products found</div>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN: Invoice Builder (9 cols) */}
          <div className="col-span-12 lg:col-span-8 xl:col-span-9 space-y-6 h-[calc(100vh-170px)] overflow-y-auto pr-1">
            
            {/* Customer & Invoice Info Panel */}
            <div className="card space-y-4 bg-white p-5">
              <h3 className="text-sm font-semibold text-slate-800">Customer & Invoice Info</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <div>
                  <label className="label">Customer *</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        className="input"
                        value={customerSearch || form.customer_name}
                        onChange={e => {
                          const value = e.target.value
                          const phoneLike = /^[\d+\-\s()]+$/.test(value.trim()) && /\d/.test(value)
                          setCustomerSearch(value)
                          setShowCustomerSuggestions(true)
                          setForm({
                            ...form,
                            customer_id: '',
                            customer_name: phoneLike ? '' : value,
                            customer_phone: phoneLike ? value : '',
                            customer_address: '',
                          })
                        }}
                        onFocus={() => setShowCustomerSuggestions(true)}
                        placeholder="Type customer name or phone..."
                      />
                      {showCustomerSuggestions && customerSuggestions.length > 0 && (
                        <div className="absolute left-0 right-0 top-11 z-30 max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                          {customerSuggestions.map(customer => (
                            <button
                              key={customer.id}
                              type="button"
                              onClick={() => selectCustomer(customer)}
                              className="block w-full px-3 py-2 text-left text-xs hover:bg-slate-50"
                            >
                              <span className="block font-semibold text-slate-800">{customer.name}</span>
                              <span className="block text-slate-500">{customer.phone || 'No phone'}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={openQuickAddCustomer}
                      className="p-2 bg-green-50 text-brand-green border border-green-200 rounded-lg hover:bg-green-100 transition flex-shrink-0"
                      title="Quick Add Customer"
                    >
                      <Plus size={18} />
                    </button>
                  </div>
                  {form.customer_id && (
                    <p className={`mt-1 text-xs font-semibold ${customerPreviousDue > 0 ? 'text-brand-red' : 'text-slate-500'}`}>
                      Previous Due: {customerDueLoading ? 'Loading...' : formatCurr(customerPreviousDue)}
                    </p>
                  )}
                </div>

                <div>
                  <label className="label">Customer Name</label>
                  <input
                    type="text"
                    className="input"
                    value={form.customer_name}
                    onChange={e => {
                      setCustomerSearch(e.target.value)
                      setForm({ ...form, customer_id: '', customer_name: e.target.value })
                    }}
                    placeholder="Customer name"
                  />
                </div>
                <div>
                  <label className="label">Customer Phone</label>
                  <input
                    type="text"
                    className="input"
                    value={form.customer_phone}
                    onChange={e => {
                      setCustomerSearch(e.target.value)
                      setForm({ ...form, customer_id: '', customer_phone: e.target.value })
                    }}
                    placeholder="Customer phone"
                  />
                </div>
                <div>
                  <label className="label">Customer Address</label>
                  <input
                    type="text"
                    className="input"
                    value={form.customer_address}
                    onChange={e => setForm({ ...form, customer_address: e.target.value })}
                    placeholder="Customer address"
                  />
                </div>

                <div>
                  <label className="label">Invoice No</label>
                  <input
                    type="text"
                    className="input bg-slate-50 text-slate-500 font-mono cursor-not-allowed"
                    value={form.invoice_no}
                    disabled
                  />
                </div>

                <div>
                  <label className="label">Date</label>
                  <input
                    type="date"
                    className="input"
                    value={form.date}
                    onChange={e => setForm({ ...form, date: e.target.value })}
                  />
                </div>
              </div>
            </div>

            {/* Invoice Items Table Panel */}
            <div className="card space-y-4 bg-white p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-800">Invoice Items</h3>
                <button
                  type="button"
                  onClick={clearCart}
                  className="text-brand-red hover:text-red-700 flex items-center gap-1 text-xs font-semibold"
                >
                  <Trash2 size={14} /> Clear Cart
                </button>
              </div>

              <div className="overflow-x-auto border border-slate-100 rounded-xl">
                <table className="w-full text-xs text-left min-w-[940px]">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      <th className="py-3 px-3 text-slate-500 w-10 text-center">#</th>
                      <th className="py-3 px-3 text-slate-500 w-60">Product Name</th>
                      <th className="py-3 px-3 text-slate-500 text-right w-28">Unit MRP</th>
                      <th className="py-3 px-3 text-slate-500 text-center w-28">Qty</th>
                      <th className="py-3 px-3 text-slate-500 text-right w-28">Subtotal</th>
                      <th className="py-3 px-3 text-slate-500 text-right w-24">Discount</th>
                      <th className="py-3 px-3 text-slate-500 text-right w-28">Subtotal</th>
                      <th className="py-3 px-3 text-slate-500 text-center w-32">Status</th>
                      <th className="py-3 px-3 text-center w-14">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => {
                      return (
                        <tr key={idx} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                          <td className="py-3 px-3 text-slate-400 text-center font-medium">{idx + 1}</td>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2">
                              {item.image_url ? (
                                <img 
                                  src={item.image_url} 
                                  alt="" 
                                  className="w-8 h-8 object-cover rounded-md border border-slate-100 flex-shrink-0"
                                  onError={e => ((e.target as HTMLImageElement).style.display = 'none')}
                                />
                              ) : (
                                <div className="w-8 h-8 bg-slate-50 rounded-md flex items-center justify-center border border-slate-100 text-slate-300 flex-shrink-0">
                                  <Image size={12} />
                                </div>
                              )}
                              <div className="min-w-0">
                                <p className="truncate px-2 py-0.5 text-xs font-medium text-slate-700" title={item.product_name || '-'}>
                                  {item.product_name || '-'}
                                </p>
                                {item.product_code && (
                                  <span className="text-[10px] text-slate-400 font-mono ml-2 block">{item.product_code}</span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <input 
                              type="number" 
                              min="0" 
                              className="input py-1 px-2 text-xs text-right w-full" 
                              value={item.selling_price || ''} 
                              onChange={e => updateItem(idx, 'selling_price', Number(e.target.value))} 
                            />
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-1 justify-center">
                              <button
                                type="button"
                                onClick={() => updateItem(idx, 'qty', Math.max(1, item.qty - 1))}
                                className="w-6 h-6 border border-slate-200 rounded flex items-center justify-center hover:bg-slate-50 text-slate-500 font-bold transition"
                              >
                                -
                              </button>
                              <input
                                type="number"
                                min="1"
                                className="w-10 border border-slate-200 rounded py-0.5 text-center text-xs focus:outline-none"
                                value={item.qty}
                                onChange={e => updateItem(idx, 'qty', Math.max(1, Number(e.target.value)))}
                              />
                              <button
                                type="button"
                                onClick={() => updateItem(idx, 'qty', item.qty + 1)}
                                className="w-6 h-6 border border-slate-200 rounded flex items-center justify-center hover:bg-slate-50 text-slate-500 font-bold transition"
                              >
                                +
                              </button>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-right font-medium text-slate-700">
                            {formatCurr(item.selling_price * item.qty)}
                          </td>
                          <td className="py-3 px-3">
                            <input 
                              type="number" 
                              min="0" 
                              className="input py-1 px-2 text-xs text-right w-full" 
                              value={item.discount_amount || ''} 
                              onChange={e => updateItem(idx, 'discount_amount', Number(e.target.value))} 
                            />
                          </td>
                          <td className="py-3 px-3 text-right font-medium text-slate-700">
                            {formatCurr(item.total_amount)}
                          </td>
                          <td className="py-3 px-3">
                            <select
                              className="input py-1 px-2 text-xs"
                              value={item.delivery_status}
                              onChange={e => updateItem(idx, 'delivery_status', e.target.value)}
                            >
                              <option value="delivered">Delivered</option>
                              <option value="undelivered">Undelivered</option>
                            </select>
                          </td>
                          <td className="py-3 px-3 text-center">
                            {items.length > 1 && (
                              <button 
                                onClick={() => setItems(items.filter((_, i) => i !== idx))} 
                                className="p-1.5 text-brand-red hover:bg-red-50 rounded-lg transition"
                                title="Remove Item"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              
            </div>

            {/* Subtotal, Discount & Save Buttons layout */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="card bg-white p-5">
                <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
                  <div className="py-2 sm:py-0 sm:px-4 first:pl-0">
                    <p className="text-[11px] font-semibold text-slate-500">Previous Due</p>
                    <p className={`mt-2 text-xl font-bold ${customerPreviousDue > 0 ? 'text-brand-red' : 'text-slate-700'}`}>
                      {formatCurr(customerPreviousDue)}
                    </p>
                  </div>
                  <div className="py-2 sm:py-0 sm:px-4">
                    <p className="text-[11px] font-semibold text-slate-500">Current Invoice Due</p>
                    <p className={`mt-2 text-xl font-bold ${due > 0 ? 'text-brand-red' : 'text-green-600'}`}>
                      {formatCurr(due)}
                    </p>
                  </div>
                  <div className="py-2 sm:py-0 sm:px-4 last:pr-0">
                    <p className="text-[11px] font-semibold text-slate-500">Total Due</p>
                    <p className={`mt-2 text-xl font-bold ${totalCustomerDue > 0 ? 'text-slate-900' : 'text-green-600'}`}>
                      {formatCurr(totalCustomerDue)}
                    </p>
                  </div>
                </div>
              </div>
              {/* Totals panel */}
              <div className="card space-y-3 bg-white p-5 md:sticky md:top-6 md:h-[calc(100vh-50px)] md:overflow-y-auto">
                <div className="flex justify-between items-center text-xs py-1 border-b border-slate-50">
                  <span className="text-slate-500">Subtotal</span>
                  <span className="font-semibold text-slate-800">{formatCurr(discountedSubtotal)}</span>
                </div>
                <div className="flex justify-between items-center text-xs py-1 border-b border-slate-50">
                  <span className="text-slate-500">Total Discount</span>
                  <span className="font-semibold text-amber-600">-{formatCurr(totalDiscount)}</span>
                </div>
                <div className="flex justify-between items-center text-xs py-1 border-b border-slate-50">
                  <span className="text-slate-500">Delivery Charge</span>
                  <div className="w-28">
                    <input
                      type="number"
                      min="0"
                      className="input py-0.5 px-2 text-right text-xs"
                      value={deliveryCharge || ''}
                      placeholder="0"
                      onChange={e => setDeliveryCharge(Number(e.target.value))}
                    />
                  </div>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-slate-100">
                  <span className="text-sm font-semibold text-slate-700">Grand Total</span>
                  <span className="text-lg font-bold text-brand-green">{formatCurr(grandTotal)}</span>
                </div>
                <div className="space-y-3 border-b border-slate-100 py-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-slate-800">Split Payment / Multi-Account Selection</p>
                  </div>
                  <div className="space-y-2">
                    {paymentRows.map((row, index) => (
                      <div key={row.id} className="grid grid-cols-[28px_1fr_120px_32px] items-end gap-2">
                        <div className="flex h-9 w-7 items-center justify-center rounded-md bg-green-50 text-xs font-bold text-brand-green">
                          {index + 1}
                        </div>
                        <label>
                          <span className="label mb-0.5">Account</span>
                          <select
                            className="input h-9 py-1 text-xs"
                            value={row.account_id}
                            onChange={e => updatePaymentRow(row.id, 'account_id', e.target.value)}
                          >
                            <option value="">Select Account</option>
                            {accounts.map(account => (
                              <option key={account.id} value={account.id}>{account.name}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span className="label mb-0.5">Amount</span>
                          <input
                            type="number"
                            min="0"
                            className="input h-9 py-1 text-right text-xs"
                            value={row.amount || ''}
                            placeholder="0"
                            onChange={e => updatePaymentRow(row.id, 'amount', Number(e.target.value))}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => removePaymentRow(row.id)}
                          className="mb-0.5 flex h-9 w-8 items-center justify-center rounded-md border border-red-100 bg-red-50 text-brand-red hover:bg-red-100"
                          title="Remove payment method"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setPaymentRows(current => [...current, emptyPaymentRow()])}
                    className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-green-200 bg-green-50 text-xs font-bold text-brand-green hover:bg-green-100"
                  >
                    <Plus size={15} /> Add Payment Method
                  </button>
                </div>

                <div className="space-y-2 py-2">
                  <div className="flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm font-bold text-slate-800">
                    <span>Total Bill</span>
                    <span>{formatCurr(grandTotal)}</span>
                  </div>
                  <div className="flex justify-between rounded-lg bg-green-50 px-3 py-2 text-sm font-bold text-brand-green">
                    <span>Total Paid</span>
                    <span>{formatCurr(totalPaid)}</span>
                  </div>
                  <div className={`flex justify-between rounded-lg px-3 py-2 text-sm font-bold ${due > 0 ? 'bg-red-50 text-brand-red' : 'bg-green-50 text-brand-green'}`}>
                    <span>Due Amount</span>
                    <span>{formatCurr(due)}</span>
                  </div>
                </div>

                <div className="pt-3">
                  <button
                    onClick={() => save(false)}
                    className="btn-primary w-full justify-center py-2.5 font-bold flex items-center gap-1.5 bg-brand-green hover:bg-green-700 transition"
                  >
                    <Save size={16} /> Sale
                  </button>
                </div>
              </div>
            </div>
            
          </div>
        </div>
      ) : (
        /* HISTORY MODE VIEW (Original list representation) */
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="mb-4 flex flex-shrink-0 flex-wrap gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input 
                value={search} 
                onChange={e => setSearch(e.target.value)} 
                placeholder={t('sales_searchPlaceholder')} 
                className="input pl-9" 
              />
            </div>
            <div className="relative w-full sm:w-[190px]">
              <Calendar className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
              <select
                value={ledgerDateFilter}
                onChange={e => selectLedgerDateFilter(e.target.value as LedgerDateFilter)}
                className="input h-10 appearance-none pl-9 pr-9 text-xs font-semibold text-slate-600 shadow-sm"
                aria-label="Filter by Date"
              >
                {ledgerDateFilterOptions.map(option => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
              {ledgerDateFilter === 'custom' && (
                <div className="absolute right-0 top-[calc(100%+0.5rem)] z-30 w-[330px] rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs font-semibold text-slate-500">
                      <span className="mb-1 block">Start Date</span>
                      <input
                        type="date"
                        className="input h-9 py-1 text-xs"
                        value={customDateFrom}
                        onChange={e => setCustomDateFrom(e.target.value)}
                      />
                    </label>
                    <label className="text-xs font-semibold text-slate-500">
                      <span className="mb-1 block">End Date</span>
                      <input
                        type="date"
                        className="input h-9 py-1 text-xs"
                        value={customDateTo}
                        onChange={e => setCustomDateTo(e.target.value)}
                      />
                    </label>
                  </div>
                </div>
              )}
            </div>
            <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
              {deliveryFilterOptions.map(option => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setDeliveryFilter(option.key)}
                  className={`min-w-[76px] rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                    deliveryFilter === option.key
                      ? option.key === 'pending'
                        ? 'bg-orange-100 text-orange-700'
                        : option.key === 'partial'
                          ? 'bg-blue-100 text-blue-700'
                          : option.key === 'delivered'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-slate-800 text-white'
                      : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="card px-4 py-2 text-sm min-w-fit flex items-center bg-white shadow-sm border border-slate-100">
              {t('sales_totalSales')}&nbsp;<strong className="text-brand-green">{formatCurr(filteredSalesTotal)}</strong>
            </div>
          </div>

          <div className="card min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-0 bg-white">
            <table className="w-full table-fixed text-xs whitespace-nowrap">
              <colgroup>
                <col style={{ width: '2%' }} />
                <col style={{ width: '3%' }} />
                <col style={{ width: '7%' }} />
                <col style={{ width: '7%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '6.5%' }} />
                <col style={{ width: '6%' }} />
                <col style={{ width: '7%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '5.5%' }} />
                <col style={{ width: '6.5%' }} />
                <col style={{ width: '7.5%' }} />
                <col style={{ width: '5%' }} />
                <col style={{ width: '5.5%' }} />
                <col style={{ width: '5.5%' }} />
              </colgroup>
              <thead className="table-header">
                <tr className="border-b border-slate-100 bg-slate-50/55">
                  <th className="py-2 px-1"></th>
                  <th className="text-left py-2 px-1">#</th>
                  <th className="text-left py-2 px-2">Invoice</th>
                  <th className="text-left py-2 px-2">{t('sales_colDate')}</th>
                  <th className="text-left py-2 px-2">{t('sales_colCustomerName', 'Customer name')}</th>
                  <th className="text-left py-2 px-2">{t('common_phone')}</th>
                  <th className="text-right py-2 px-2">{t('sales_colTotal')}</th>
                  <th className="text-right py-2 px-2">{t('sales_colDiscount', 'Discount')}</th>
                  <th className="text-right py-2 px-2">Subtotal</th>
                  <th className="text-right py-2 px-2">Purchase Amount</th>
                  <th className="text-right py-2 px-2">Profit</th>
                  <th className="text-right py-2 px-2">{t('sales_colPaid')}</th>
                  <th className="text-left py-2 px-2">{t('sales_colAccount')}</th>
                  <th className="text-right py-2 px-2">{t('sales_colDue')}</th>
                  <th className="text-center py-2 px-2">Delivery</th>
                  <th className="py-2 px-2 text-center whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSales.map((s, index) => {
                  const status = deliveryStatus(s)
                  const purchaseAmount = salePurchaseAmount(s)
                  const profit = saleProfit(s)
                  const grossTotal = saleGrossTotal(s)
                  const subtotalAfterDiscount = saleSubtotalAfterDiscount(s)
                  const missingPurchaseAmount = saleHasMissingPurchaseAmount(s)
                  return (
                    <React.Fragment key={s.id}>
                  <tr className={`table-row border-b border-slate-100 transition-colors ${missingPurchaseAmount ? 'bg-amber-50 hover:bg-amber-100/70' : 'hover:bg-slate-50/50'}`}>
                    <td className="py-2 px-1 text-center">
                      <button
                        onClick={() => setExpandedSaleId(expandedSaleId === s.id ? null : s.id)}
                        className="p-1 text-slate-400 hover:text-slate-700"
                        title="Delivery details"
                      >
                        {expandedSaleId === s.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                    </td>
                    <td className="py-2 px-1 text-slate-400">{index + 1}</td>
                    <td className="py-2 px-2 font-mono truncate" title={safeText(s.invoice_no) || '-'}>{safeText(s.invoice_no) || '-'}</td>
                    <td className="py-2 px-2">{formatDate(s.date)}</td>
                    <td className="py-2 px-2 font-medium text-slate-700 truncate" title={safeText(s.customer_name) || '-'}>
                      {safeText(s.customer_name) || '-'}
                    </td>
                    <td className="py-2 px-2 text-slate-500 truncate" title={s.customer_phone || '-'}>{s.customer_phone || '-'}</td>
                    <td className="py-2 px-2 text-right font-medium text-slate-700">{formatCurr(grossTotal)}</td>
                    <td className="py-2 px-2 text-right text-amber-600">{formatCurr(saleDiscount(s))}</td>
                    <td className="py-2 px-2 text-right font-semibold text-brand-green">{formatCurr(subtotalAfterDiscount)}</td>
                    <td className="py-2 px-2 text-right font-medium text-slate-700">
                      {showLedgerFinancials ? (purchaseAmount > 0 ? formatCurr(purchaseAmount) : '-') : '****'}
                    </td>
                    <td className={`py-2 px-2 text-right font-bold ${profit === null ? 'text-slate-400' : profit >= 0 ? 'text-green-600' : 'text-brand-red'}`}>
                      {showLedgerFinancials ? (profit === null ? '-' : formatCurr(profit)) : '****'}
                    </td>
                    <td className="py-2 px-2 text-right text-brand-green font-medium">{formatCurr(Number(s.paid_amount || 0))}</td>
                    <td className="py-2 px-2 text-slate-500 truncate" title={saleAccountDisplay(s)}>{saleAccountDisplay(s)}</td>
                    <td className="py-2 px-2 text-right text-brand-red font-semibold">{s.due_amount > 0 ? formatCurr(s.due_amount) : '-'}</td>
                    <td className="py-2 px-2 text-center">
                      <span className={`text-xs px-2 py-1 rounded font-medium ${
                        status === 'delivered' ? 'bg-green-100 text-green-700' :
                        status === 'partial' ? 'bg-blue-100 text-blue-700' :
                        'bg-orange-100 text-orange-700'
                      }`}>
                        {status === 'delivered' ? 'Delivered' : status === 'partial' ? 'Partial' : 'Pending'}
                      </span>
                      <div className="text-[11px] text-slate-400 mt-1">
                        {saleDeliveredQty(s)} / {invoiceTotalQty(s)}
                      </div>
                    </td>
                    <td className="py-2 px-2 text-center whitespace-nowrap">
                      <div className="flex flex-row items-center justify-center gap-1.5 whitespace-nowrap">
                        <button 
                          onClick={() => { setSelectedSale(s); setShowInvoice(true) }} 
                          className="text-slate-400 hover:text-slate-700 p-1"
                        >
                          <Printer size={14} />
                        </button>
                        <button 
                          title={t('common_edit')} 
                          onClick={() => editSale(s)} 
                          className="p-1 text-slate-400 hover:text-blue-600"
                        >
                          <Pencil size={14} />
                        </button>
                        <button 
                          title={t('common_delete')} 
                          onClick={() => deleteSale(s)} 
                          className="p-1 text-slate-400 hover:text-brand-red"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                      {expandedSaleId === s.id && (
                        <tr>
                          <td colSpan={16} className="bg-white px-3 py-0">
                            <div className="my-3 overflow-hidden border-2 border-blue-400 bg-white shadow-sm">
                              <div className="flex items-center justify-between border-b border-slate-100 bg-white px-4 py-3">
                                <h4 className="flex items-center gap-2 text-xs font-bold uppercase text-slate-800">
                                  <Truck size={15} className="text-slate-700" /> ORDER ITEMS
                                </h4>
                                <button
                                  onClick={() => setExpandedSaleId(null)}
                                  className="p-1 text-slate-400 hover:text-slate-700"
                                  title="Collapse"
                                >
                                  <ChevronUp size={14} />
                                </button>
                              </div>

                              <div className="overflow-x-auto">
                                <table className="w-full min-w-[1120px] text-xs">
                                  <thead className="bg-slate-50 text-[11px] uppercase text-slate-600">
                                    <tr>
                                      <th className="text-left py-3 px-4 w-[280px]">Product</th>
                                      <th className="text-right py-3 px-3">Price (৳)</th>
                                      <th className="text-right py-3 px-3">Discount (৳)</th>
                                      <th className="text-center py-3 px-3">Ordered</th>
                                      <th className="text-right py-3 px-3">TOTAL (৳)</th>
                                      <th className="text-right py-3 px-3">Purchase Rate (৳)</th>
                                      <th className="text-right py-3 px-3">Profit (৳)</th>
                                      <th className="text-center py-3 px-3">Status</th>
                                      <th className="text-left py-3 px-3">Delivery Date</th>
                                      <th className="text-center py-3 px-3">Note</th>
                                      <th className="text-center py-3 px-4">Action</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(s.sale_items || []).map((item: any) => {
                                      const itemPending = pendingQty(item)
                                      const imageUrl = itemImageUrl(item)
                                      const profit = itemProfit(item)
                                      const latestDeliveryDate = itemLatestDeliveryDate(item)
                                      return (
                                        <tr key={item.id} className="border-t border-slate-100 align-middle">
                                          <td className="py-4 px-4">
                                            <div className="flex items-center gap-3">
                                              <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded border border-slate-100 bg-slate-50">
                                                {imageUrl ? (
                                                  <img src={imageUrl} alt={item.product_name} className="h-full w-full object-cover" />
                                                ) : (
                                                  <div className="flex h-full w-full items-center justify-center text-slate-300">
                                                    <Image size={18} />
                                                  </div>
                                                )}
                                              </div>
                                              <div className="min-w-0">
                                                <p className="truncate font-bold text-slate-800">{item.product_name}</p>
                                                <p className="mt-1 text-[11px] text-slate-400">{item.product_code || '-'}</p>
                                              </div>
                                            </div>
                                          </td>
                                          <td className="py-4 px-3 text-right font-semibold text-slate-700">{formatCurr(Number(item.selling_price || 0))}</td>
                                          <td className="py-4 px-3 text-right font-semibold text-slate-600">{formatCurr(itemDiscountTotal(item))}</td>
                                          <td className="py-4 px-3 text-center font-semibold text-slate-500">{formatNum(Number(item.qty || 0))}</td>
                                          <td className="py-4 px-3 text-right font-bold text-slate-800">{formatCurr(Number(item.total_amount || 0))}</td>
                                          <td className="py-4 px-3 text-right">
                                            {showLedgerFinancials ? (
                                              <input
                                                type="number"
                                                min="0"
                                                className="input inline-block h-8 w-24 py-1 px-2 text-right text-xs"
                                                value={Number(item.cost_price || 0) || ''}
                                                onChange={e => {
                                                  const nextCost = Number(e.target.value)
                                                  saveStorageValue(costFallbackKey, item.id, nextCost)
                                                  setSales(prev => prev.map(sale => ({
                                                    ...sale,
                                                    sale_items: (sale.sale_items || []).map((saleItem: any) =>
                                                      saleItem.id === item.id ? { ...saleItem, cost_price: nextCost } : saleItem
                                                    )
                                                  })))
                                                }}
                                                onBlur={e => updateSaleItemCost(item.id, Number(e.target.value || 0))}
                                                placeholder="0"
                                              />
                                            ) : (
                                              <span className="font-semibold text-slate-500">****</span>
                                            )}
                                          </td>
                                          <td className={`py-4 px-3 text-right font-bold ${profit === null ? 'text-slate-400' : profit >= 0 ? 'text-green-600' : 'text-brand-red'}`}>
                                            {showLedgerFinancials ? (profit === null ? '-' : formatCurr(profit)) : '****'}
                                          </td>
                                          <td className="py-4 px-3 text-center">
                                            <span className={`inline-flex rounded px-2 py-1 text-xs font-semibold ${
                                              itemPending > 0 ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'
                                            }`}>
                                              {itemPending > 0 ? 'Pending' : 'Delivered'}
                                            </span>
                                          </td>
                                          <td className="py-4 px-3 text-slate-600">
                                            {latestDeliveryDate ? (
                                              <span className="inline-flex items-center gap-1.5">
                                                <Calendar size={13} className="text-slate-400" />
                                                {formatDate(latestDeliveryDate)}
                                              </span>
                                            ) : (
                                              <span className="text-slate-400">-</span>
                                            )}
                                          </td>
                                          <td className="py-4 px-3 text-center text-slate-400">-</td>
                                          <td className="py-4 px-4 text-center">
                                            {itemPending > 0 ? (
                                              <button
                                                onClick={() => {
                                                  setDeliveryItem({ ...item, sale_id: s.id, invoice_no: s.invoice_no })
                                                  setDeliveryForm({
                                                    delivery_date: new Date().toISOString().split('T')[0],
                                                    delivered_by: profile?.full_name || '',
                                                    delivered_qty: Math.min(1, itemPending),
                                                    notes: ''
                                                  })
                                                  setShowDeliveryModal(true)
                                                }}
                                                className="inline-flex items-center gap-1.5 rounded bg-brand-green px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-green-700"
                                              >
                                                <Truck size={13} /> Deliver
                                              </button>
                                            ) : (
                                              <span className="text-xs text-slate-400">Done</span>
                                            )}
                                          </td>
                                        </tr>
                                      )
                                    })}
                                  </tbody>
                                </table>
                              </div>

                              <div className="border-t border-slate-100">
                                <div className="flex items-center justify-between bg-white px-4 py-3">
                                  <h4 className="flex items-center gap-2 text-xs font-bold uppercase text-slate-800">
                                    <Truck size={15} className="text-slate-700" /> DELIVERY DETAILS
                                  </h4>
                                  <ChevronUp size={14} className="text-slate-400" />
                                </div>
                                <table className="w-full text-xs">
                                  <thead className="bg-slate-50 text-[11px] uppercase text-slate-600">
                                    <tr>
                                      <th className="text-left py-3 px-4">Date</th>
                                      <th className="text-left py-3 px-4">Product</th>
                                      <th className="text-right py-3 px-4">Delivered Qty</th>
                                      <th className="text-left py-3 px-4">Delivered By</th>
                                      <th className="text-left py-3 px-4">Notes</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {saleDeliveryRows(s).map((delivery: any) => (
                                      <tr key={delivery.id} className="border-t border-slate-100">
                                        <td className="py-3 px-4">{formatDate(delivery.delivery_date)}</td>
                                        <td className="py-3 px-4 font-medium text-slate-700">{delivery.product_name}</td>
                                        <td className="py-3 px-4 text-right font-bold text-green-600">{delivery.delivered_qty}</td>
                                        <td className="py-3 px-4">{delivery.delivered_by || '-'}</td>
                                        <td className="py-3 px-4 text-slate-500">{delivery.notes || '-'}</td>
                                      </tr>
                                    ))}
                                    {saleDeliveryRows(s).length === 0 && (
                                      <tr>
                                        <td colSpan={5} className="py-10 text-center">
                                          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-blue-100 bg-blue-50 text-blue-400">
                                            <Clipboard size={28} />
                                          </div>
                                          <p className="mt-3 text-xs font-medium text-slate-400">No delivery yet</p>
                                        </td>
                                      </tr>
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
                {filteredSales.length === 0 && (
                  <tr>
                    <td colSpan={16} className="text-center py-10 text-slate-400">{t('sales_noSales')}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal
        isOpen={showDeliveryModal}
        onClose={() => setShowDeliveryModal(false)}
        title="Deliver Product"
        size="sm"
      >
        {deliveryItem && (
          <div className="space-y-4">
            <div className="bg-slate-50 p-3 rounded-lg text-sm">
              <p className="font-medium text-slate-700">{deliveryItem.product_name}</p>
              <p className="text-xs text-slate-500 mt-1">
                Ordered: {deliveryItem.qty} | Delivered: {deliveredQty(deliveryItem)} | Pending: {pendingQty(deliveryItem)}
              </p>
              <p className="text-xs text-slate-400 mt-1">Invoice: {deliveryItem.invoice_no}</p>
            </div>

            <div>
              <label className="label">Delivery Date</label>
              <input
                type="date"
                className="input"
                value={deliveryForm.delivery_date}
                onChange={e => setDeliveryForm({ ...deliveryForm, delivery_date: e.target.value })}
              />
            </div>

            <div>
              <label className="label">Delivered Quantity</label>
              <input
                type="number"
                min="1"
                max={pendingQty(deliveryItem)}
                className="input"
                value={deliveryForm.delivered_qty || ''}
                onChange={e => setDeliveryForm({ ...deliveryForm, delivered_qty: Number(e.target.value) })}
              />
              <p className="text-xs text-slate-500 mt-1">Max: {pendingQty(deliveryItem)}</p>
            </div>

            <div>
              <label className="label">Delivered By</label>
              <input
                className="input"
                value={deliveryForm.delivered_by}
                onChange={e => setDeliveryForm({ ...deliveryForm, delivered_by: e.target.value })}
                placeholder="Name"
              />
            </div>

            <div>
              <label className="label">Notes</label>
              <textarea
                className="input"
                rows={2}
                value={deliveryForm.notes}
                onChange={e => setDeliveryForm({ ...deliveryForm, notes: e.target.value })}
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button onClick={saveDelivery} className="btn-primary flex-1 justify-center">
                <Truck size={16} /> Confirm Delivery
              </button>
              <button onClick={() => setShowDeliveryModal(false)} className="btn-secondary flex-1 justify-center">
                {t('common_cancel')}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* QUICK ADD CUSTOMER MODAL */}
      <Modal 
        isOpen={showQuickAddCustomer} 
        onClose={closeQuickAddCustomer} 
        title="Quick Add Customer" 
        size="sm"
      >
        <form className="space-y-4" onSubmit={handleAddCustomer} noValidate>
          <div>
            <label className="label">Customer Name *</label>
            <input
              type="text"
              className={quickCustomerInputClass('name')}
              value={quickCustomerForm.name}
              required
              aria-invalid={!!quickCustomerErrors.name}
              onChange={e => {
                clearQuickCustomerError('name')
                setQuickCustomerForm({ ...quickCustomerForm, name: e.target.value })
              }}
              placeholder="e.g. John Doe"
            />
            {quickCustomerErrors.name && <p className="mt-1 text-xs font-medium text-red-600">{quickCustomerErrors.name}</p>}
          </div>
          <div>
            <label className="label">Phone Number *</label>
            <input
              type="text"
              className={quickCustomerInputClass('phone')}
              value={quickCustomerForm.phone}
              required
              aria-invalid={!!quickCustomerErrors.phone}
              onChange={e => {
                clearQuickCustomerError('phone')
                setQuickCustomerForm({ ...quickCustomerForm, phone: e.target.value })
              }}
              placeholder="e.g. 01700000000"
            />
            {quickCustomerErrors.phone && <p className="mt-1 text-xs font-medium text-red-600">{quickCustomerErrors.phone}</p>}
          </div>
          <div>
            <label className="label">Address</label>
            <textarea
              className="input h-16"
              value={quickCustomerForm.address}
              onChange={e => setQuickCustomerForm({ ...quickCustomerForm, address: e.target.value })}
              placeholder="e.g. Dhaka, Bangladesh"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <button type="submit" className="btn-primary flex-1 justify-center">
              Add Customer
            </button>
            <button 
              type="button"
              onClick={closeQuickAddCustomer} 
              className="btn-secondary flex-1 justify-center"
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>

      {/* QUICK ADD PRODUCT MODAL */}
      <Modal
        isOpen={showQuickAddProduct}
        onClose={() => setShowQuickAddProduct(false)}
        title="Add New Product"
        size="lg"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Code *</label>
              <input
                type="text"
                className="input"
                value={quickProductForm.product_code}
                onChange={e => setQuickProductForm({ ...quickProductForm, product_code: e.target.value })}
                placeholder="e.g., SKU-001"
              />
            </div>
            <div>
              <label className="label">Product Name *</label>
              <input
                type="text"
                className="input"
                value={quickProductForm.name}
                onChange={e => setQuickProductForm({ ...quickProductForm, name: e.target.value })}
                placeholder="e.g., Wooden Chair"
              />
            </div>
          </div>

          <div>
            <label className="label">Image Link</label>
            <input
              type="url"
              className="input"
              value={quickProductForm.image_url}
              onChange={e => setQuickProductForm({ ...quickProductForm, image_url: e.target.value })}
              placeholder="https://example.com/image.jpg"
            />
            {quickProductForm.image_url && (
              <img
                src={quickProductForm.image_url}
                alt="Preview"
                className="h-20 w-20 object-cover rounded mt-2 border border-slate-200"
                onError={e => ((e.target as HTMLImageElement).style.display = 'none')}
              />
            )}
          </div>

          <div>
            <label className="label">Supplier *</label>
            <select
              className="input"
              value={quickProductForm.supplier_id}
              onChange={e => setQuickProductForm({ ...quickProductForm, supplier_id: e.target.value })}
            >
              <option value="">Select a supplier</option>
              {suppliers.map(supplier => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.company_name || supplier.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">DP Rate (Cost)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="input"
                value={quickProductForm.cost_price || ''}
                onChange={e => setQuickProductForm({ ...quickProductForm, cost_price: Number(e.target.value) })}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="label">Discount</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="input"
                value={quickProductForm.discount || ''}
                onChange={e => setQuickProductForm({ ...quickProductForm, discount: Number(e.target.value) })}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="label">MRP (Selling)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="input"
                value={quickProductForm.selling_price || ''}
                onChange={e => setQuickProductForm({ ...quickProductForm, selling_price: Number(e.target.value) })}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">Opening Qty</label>
              <input
                type="number"
                min="0"
                className="input"
                value={quickProductForm.opening_qty || ''}
                onChange={e => setQuickProductForm({ ...quickProductForm, opening_qty: Number(e.target.value) })}
                placeholder="0"
              />
            </div>
            <div>
              <label className="label">Size</label>
              <input
                type="text"
                className="input"
                value={quickProductForm.size}
                onChange={e => setQuickProductForm({ ...quickProductForm, size: e.target.value })}
                placeholder="e.g., 45x50cm"
              />
            </div>
            <div>
              <label className="label">Weight</label>
              <input
                type="text"
                className="input"
                value={quickProductForm.weight}
                onChange={e => setQuickProductForm({ ...quickProductForm, weight: e.target.value })}
                placeholder="e.g., 5kg"
              />
            </div>
          </div>

          <div className="flex gap-2 pt-4">
            <button onClick={handleAddProduct} className="btn-primary flex-1 justify-center">
              <Plus size={16} /> Add Product
            </button>
            <button
              onClick={() => {
                setShowQuickAddProduct(false)
                setQuickProductForm({ product_code: '', name: '', image_url: '', supplier_id: '', cost_price: 0, discount: 0, selling_price: 0, opening_qty: 0, size: '', weight: '' })
              }}
              className="btn-secondary flex-1 justify-center"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* PRINT INVOICE PREVIEW MODAL */}
      <Modal isOpen={showInvoice} onClose={() => setShowInvoice(false)} title={t('sales_invoicePreview')} size="xl">
        {selectedSale && (
          <>
            <div ref={invoiceRef} className="invoice-print-page sales-invoice-print-page bg-white text-slate-950">
              <div className="invoice-print-inner sales-invoice-print-inner">
                <h2 className="m-0 text-center text-[24px] font-normal leading-none text-slate-950">Invoice Bill</h2>
                <div className="relative border-b border-slate-400">
                  <div className="absolute -left-1 -top-5">
                    {business?.logo_url ? (
                      <img
                        src={business.logo_url}
                        alt={business?.name_en || t('appName')}
                        className="h-20 w-20 object-contain"
                      />
                    ) : (
                      <div className="h-20 w-20 flex items-center justify-center text-slate-950 text-[18px]">
                        Logo
                      </div>
                    )}
                  </div>
                  <div className="mx-auto max-w-[6.8in] text-center">
                    <h1 className="text-[42px] font-bold leading-none tracking-normal text-slate-950">
                      {lang === 'bn' ? business?.name_bn || business?.name_en || t('appName') : business?.name_en || business?.name_bn || t('appName')}
                    </h1>
                    <div className="mt-2 pt-1 text-[17px] italic leading-tight text-slate-700">
                      <p className="whitespace-nowrap">{business?.address ? `Address: ${business.address}` : 'Where Quality Meets Style'}</p>
                      {(business?.phone || business?.email) && (
                        <p className="whitespace-nowrap">
                          {business?.phone ? `Phone : ${business.phone}` : ''}
                          {business?.phone && business?.email ? ' , ' : ''}
                          {business?.email ? `Gmail : ${business.email}` : ''}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-[1fr_auto] gap-28 pb-1.5 pt-3 text-[16px] leading-tight">
                  <div className="min-w-0 space-y-1">
                    <p><span className="font-bold">{invoiceLabels.customerName}:</span> {safeText(selectedSale.customer_name) || '-'}</p>
                    <p><span className="font-bold">{invoiceLabels.mobile}:</span> {safeText(selectedSale.customer_phone) || '-'}</p>
                    <p className="whitespace-nowrap"><span className="font-bold">{invoiceLabels.address}:</span> {selectedSaleCustomerAddress || invoiceLabels.noAddress}</p>
                  </div>
                  {(() => {
                    const seller = saleSeller(selectedSale)
                    return (
                      <div className="w-[255px] space-y-2">
                        <p><span className="font-bold">{invoiceLabels.sellerName}:</span> {safeText(seller?.full_name) || '-'}</p>
                        <p><span className="font-bold">{invoiceLabels.sellerPhone}:</span> {safeText(seller?.phone) || '-'}</p>
                        <p><span className="font-bold">{invoiceLabels.date}:</span> {formatInvoiceDateTime(selectedSale.created_at || selectedSale.date)}</p>
                      </div>
                    )
                  })()}
                </div>

                <table className="mt-3 w-full text-[12px] border border-slate-600">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="border border-slate-600 py-1 px-1 w-8">#</th>
                      <th className="border border-slate-600 py-1 px-2 text-center min-w-0">{invoiceLabels.productName}</th>
                      <th className="border border-slate-600 py-1 px-1 text-center w-20">Unit MRP</th>
                      <th className="border border-slate-600 py-1 px-1 text-center w-12">Qty</th>
                      <th className="border border-slate-600 py-1 px-1 text-center w-24">Subtotal</th>
                      <th className="border border-slate-600 py-1 px-1 text-center w-20">Discount</th>
                      <th className="border border-slate-600 py-1 px-2 text-center w-24">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedSale.sale_items || []).map((item: any, index: number) => {
                      const qty = Number(item.qty || 0)
                      const unitMrp = Number(item.selling_price || 0)
                      const unitSubtotal = Number(item.actual_price ?? item.selling_price ?? 0)
                      const totalValue = unitMrp * qty
                      const discountTotal = Math.max(0, unitMrp - unitSubtotal) * qty
                      const subtotal = Number(item.total_amount ?? unitSubtotal * qty)

                      return (
                        <tr key={item.id || `${item.product_code}-${index}`}>
                          <td className="border border-slate-600 py-1 px-1 text-center align-top">{formatNum(index + 1)}.</td>
                          <td className="border border-slate-600 py-1 px-2 align-top">
                            <p className="font-medium">{safeText(item.product_name) || '-'}</p>
                          </td>
                          <td className="border border-slate-600 py-1 px-1 text-right align-top">{formatCurr(unitMrp)}</td>
                          <td className="border border-slate-600 py-1 px-1 text-center align-top">{formatNum(qty)}</td>
                          <td className="border border-slate-600 py-1 px-1 text-right align-top">{formatCurr(totalValue)}</td>
                          <td className="border border-slate-600 py-1 px-1 text-right align-top">{discountTotal > 0 ? formatCurr(discountTotal) : '-'}</td>
                          <td className="border border-slate-600 py-1 px-2 text-right align-top font-semibold">{formatCurr(subtotal)}</td>
                        </tr>
                      )
                    })}
                    <tr className="font-bold">
                      <td className="border border-slate-600 py-1 px-2 text-center" colSpan={3}>{invoiceLabels.total}</td>
                      <td className="border border-slate-600 py-1 px-1 text-center">{formatNum(invoiceTotalQty(selectedSale))}</td>
                      <td className="border border-slate-600 py-1 px-1 text-right">{formatCurr(invoiceItemSubtotal(selectedSale))}</td>
                      <td className="border border-slate-600 py-1 px-1 text-right">{saleDiscount(selectedSale) > 0 ? formatCurr(saleDiscount(selectedSale)) : '-'}</td>
                      <td className="border border-slate-600 py-1 px-2 text-right">{formatCurr(Number(selectedSale.net_amount || 0))}</td>
                    </tr>
                  </tbody>
                </table>

                <div className="grid grid-cols-2 gap-10 mt-3 text-[11px] leading-tight">
                  <div>
                    <div className="space-y-1.5 max-w-sm">
                      <div className="flex justify-between"><span className="font-semibold">{invoiceLabels.previousDue}:</span><span>{formatCurr(selectedSalePreviousDue)}</span></div>
                      <div className="flex justify-between"><span className="font-semibold">Invoice Amount:</span><span>{formatCurr(selectedSaleInvoiceAmount)}</span></div>
                      <div className="border-t border-slate-400 pt-1.5 flex justify-between"><span className="font-bold">{invoiceLabels.totalDue}:</span><span>{formatCurr(selectedSaleTotalDue)}</span></div>
                      <div className="flex justify-between"><span className="font-semibold">Paid Amount:</span><span>{formatCurr(selectedSalePaidAmount)}</span></div>
                      <div className="border-t border-slate-400 pt-1.5 flex justify-between"><span className="font-bold">Current Due:</span><span>{formatCurr(selectedSaleCurrentDue)}</span></div>
                    </div>
                    <div className="mt-3">
                      <p className="font-bold">{invoiceLabels.amountWords}:</p>
                      <p className="mt-1">{amountInWords(Number(selectedSale.net_amount || 0))}</p>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between"><span>{invoiceLabels.subtotal}</span><span>{formatCurr(invoiceItemSubtotal(selectedSale))}</span></div>
                    <div className="flex justify-between"><span>{invoiceLabels.discount}</span><span>{formatCurr(saleDiscount(selectedSale))}</span></div>
                    <div className="flex justify-between"><span>{invoiceLabels.deliveryCharge}</span><span>{formatCurr(invoiceDeliveryCharge(selectedSale))}</span></div>
                    <div className="border-t border-slate-400 pt-1.5 flex justify-between font-bold text-[13px]"><span>{invoiceLabels.grandTotal}</span><span>{formatCurr(Number(selectedSale.net_amount || 0))}</span></div>
                    <div className="flex justify-between"><span>{invoiceLabels.paid}</span><span>{formatCurr(Number(selectedSale.paid_amount || 0))}</span></div>
                    <div className="border-t border-slate-400 pt-1.5 flex justify-between font-semibold"><span>{invoiceLabels.due}</span><span>{formatCurr(Number(selectedSale.due_amount || 0))}</span></div>
                    <div className="border-t border-slate-400 pt-1.5 text-[10px]">
                      <span className="font-bold">Payment Info:</span>
                      {selectedSalePaymentRows.length > 0 ? (
                        <div className="mt-1 space-y-0.5">
                          {selectedSalePaymentRows.map((payment: PaymentRow, index: number) => (
                            <div key={payment.id || `${payment.account_id}-${index}`} className="flex justify-between gap-3">
                              <span>{safeText(payment.account_name) || '-'}</span>
                              <span>{formatCurr(payment.amount)}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span> -</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-24 mt-32 text-center text-[11px]">
                  <div>
                    <div className="border-t border-slate-600 mx-8 pt-3 font-semibold">{invoiceLabels.customerSignature}</div>
                  </div>
                  <div>
                    <div className="border-t border-slate-600 mx-8 pt-3 font-semibold">{invoiceLabels.sellerSignature}</div>
                  </div>
                </div>

                <div className="mt-4 text-center text-[11px]">
                  {invoiceLabels.thankYou}
                </div>
              </div>
            </div>
            <button onClick={handlePrint} className="btn-primary w-full justify-center mt-4"><Printer size={16} /> {t('sales_printInvoice')}</button>
          </>
        )}
      </Modal>
    </div>
  )
}
