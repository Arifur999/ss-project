import React, { useState, useEffect, useMemo } from 'react'
import { Plus, Save, ChevronDown, ChevronUp, Truck, Edit2, Trash2, Search, Grid3X3, SlidersHorizontal, Info, Package, ShoppingCart } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatDate, generateSINo } from '../../lib/utils'
import PageHeader from '../../components/PageHeader'
import Modal from '../../components/Modal'
import { confirmAction } from '../../components/ConfirmDialog'
import toast from 'react-hot-toast'
import { useAuth } from '../../context/AuthContext'
import { useLang } from '../../context/LanguageContext'
import { addRecycleItem } from '../../lib/recycleBin'
import { createOpeningStockBatch, createReceiveStockBatch } from '../../lib/fifoInventory'

interface PurchaseItem {
  product_id: string
  product_code: string
  product_name: string
  dp_price: number
  discount_pct: number
  actual_dp: number
  qty: number
  total_amount: number
  sp_amount: number
  deposit_amount: number
  received_qty: number
}

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
        cost_price: Number(row.cost_price || 0),
        selling_price: Number(row.selling_price || 0),
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

export default function PlaceOrder() {
  const { t, formatCurr } = useLang()
  const [purchases, setPurchases] = useState<any[]>([])
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [accounts, setAccounts] = useState<any[]>([])
  const [inventoryByProduct, setInventoryByProduct] = useState<Record<string, number>>({})
  const [supplierBalanceById, setSupplierBalanceById] = useState<Record<string, number>>({})
  const [productSearch, setProductSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [showQuickAddProduct, setShowQuickAddProduct] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showReceiveModal, setShowReceiveModal] = useState(false)
  const [receiveItem, setReceiveItem] = useState<any>(null)
  const [editingReceiveId, setEditingReceiveId] = useState<string | null>(null)
  const [editReceiveQty, setEditReceiveQty] = useState(0)
  const [showEditReceiveModal, setShowEditReceiveModal] = useState(false)
  const [editingPOId, setEditingPOId] = useState<string | null>(null)
  const [showEditPOModal, setShowEditPOModal] = useState(false)
  const [editPOForm, setEditPOForm] = useState({ si_no: '', date: '', supplier_id: '' })
  const { user, touchOwnerActivity } = useAuth()

  const [form, setForm] = useState({
    si_no: generateSINo(), supplier_id: '', supplier_name: '',
    date: new Date().toISOString().split('T')[0],
    account_id: '', notes: '', shipping_status: 'pending' as const,
  })
  const [items, setItems] = useState<PurchaseItem[]>([{
    product_id: '', product_code: '', product_name: '',
    dp_price: 0, discount_pct: 0, actual_dp: 0, qty: 1, total_amount: 0, sp_amount: 0, deposit_amount: 0, received_qty: 0
  }])
  const [paidAmount, setPaidAmount] = useState(0)
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

  const [receiveForm, setReceiveForm] = useState({
    receive_date: new Date().toISOString().split('T')[0],
    receiver_name: '', received_qty: 0, condition: 'good', notes: ''
  })

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    const [poRes, supRes, proRes, accRes, invRes, balancePoRes, payRes] = await Promise.all([
      supabase.from('purchases').select('*, purchase_items(*, purchase_receives(*))').in('shipping_status', ['pending', 'partial']).order('date', { ascending: false }),
      supabase.from('suppliers').select('id, name, company_name, phone, opening_due, due_type').eq('is_active', true),
      supabase.from('products').select('id, product_code, name, cost_price, selling_price, image_url, discount').eq('is_active', true),
      supabase.from('accounts').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('inventory').select('product_id, available_qty'),
      supabase.from('purchases').select('supplier_id, purchase_items(*, purchase_receives(received_qty))'),
      supabase.from('supplier_payments').select('supplier_id, amount'),
    ])
    const pickerProducts = productsForPicker(proRes.data)
    setPurchases(poRes.data || [])
    setSuppliers(supRes.data || [])
    setProducts(pickerProducts)
    setAccounts(accRes.data || [])
    const stockMap: Record<string, number> = {}
    ;(invRes.data || []).forEach((row: any) => {
      stockMap[row.product_id] = (stockMap[row.product_id] || 0) + Number(row.available_qty || 0)
    })
    pickerProducts.forEach((product: any) => {
      if (stockMap[product.id] == null) stockMap[product.id] = Number(product.opening_qty || 0)
    })
    setInventoryByProduct(stockMap)

    const allPurchases = balancePoRes.data || []
    const payments = payRes.data || []
    const balanceMap: Record<string, number> = {}
    ;(supRes.data || []).forEach((sup: any) => {
      const supplierPurchases = allPurchases.filter((purchase: any) => purchase.supplier_id === sup.id)
      const supplierItems = supplierPurchases.flatMap((purchase: any) => purchase.purchase_items || [])
      const openingRaw = Math.abs(Number(sup.opening_due || 0))
      const openingBalance = sup.due_type === 'pawna' ? openingRaw : -openingRaw
      const actualDeposit = payments
        .filter((payment: any) => payment.supplier_id === sup.id)
        .reduce((sum: number, payment: any) => sum + Number(payment.amount || 0), 0)
      const receivedAmount = supplierItems.reduce((sum: number, item: any) => {
        const receivedQty = (item.purchase_receives || []).reduce(
          (total: number, receive: any) => total + Number(receive.received_qty || 0),
          0
        ) || Number(item.received_qty || 0)
        return sum + (receivedQty * Number(item.actual_dp || 0))
      }, 0)
      balanceMap[sup.id] = openingBalance + actualDeposit - receivedAmount
    })
    setSupplierBalanceById(balanceMap)
  }

  function resetQuickProductForm() {
    setQuickProductForm({ product_code: '', name: '', image_url: '', supplier_id: '', cost_price: 0, discount: 0, selling_price: 0, opening_qty: 0, size: '', weight: '' })
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

  async function createQuickProductInventory(productId: string, openingQty: number, costPrice: number, sellingPrice: number) {
    const qty = Number(openingQty || 0)
    const { data: existing, error: lookupError } = await supabase
      .from('inventory')
      .select('id')
      .eq('product_id', productId)
      .is('branch_id', null)
      .maybeSingle()

    if (lookupError) throw lookupError
    if (!existing) {
      const { error } = await supabase.from('inventory').insert({
        product_id: productId,
        branch_id: null,
        available_qty: qty,
        upcoming_qty: 0,
      })
      if (error) throw error
    }

    if (qty > 0) {
      await createOpeningStockBatch({
        productId,
        qty,
        dpPrice: Number(costPrice || 0),
        mrpPrice: Number(sellingPrice || 0),
        userId: user?.id,
      })
    }
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
        supplier_id: quickProductForm.supplier_id,
        cost_price: Number(quickProductForm.cost_price || 0),
        discount: Number(quickProductForm.discount || 0),
        selling_price: Number(quickProductForm.selling_price || 0),
        opening_qty: Number(quickProductForm.opening_qty || 0),
        size: quickProductForm.size || null,
        weight: quickProductForm.weight || null,
        is_active: true,
        owner_id: user?.id,
      }

      let payload = basePayload
      let { data: product, error } = await supabase
        .from('products')
        .insert(payload)
        .select('id, product_code, name, cost_price, selling_price, image_url')
        .maybeSingle()

      for (let attempt = 0; error && attempt < 3; attempt += 1) {
        const retryPayload = removeMissingProductColumn(payload, error)
        if (retryPayload === payload) break
        payload = retryPayload
        const retry = await supabase
          .from('products')
          .insert(payload)
          .select('id, product_code, name, cost_price, selling_price, image_url')
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

      await createQuickProductInventory(product.id, quickProductForm.opening_qty, quickProductForm.cost_price, quickProductForm.selling_price)
      setProducts(current => [product, ...current.filter(item => item.id !== product.id)])
      setItems(current => current.map((item, index) => index === current.length - 1 && !item.product_code
        ? {
            ...item,
            product_id: product.id,
            product_code: product.product_code,
            product_name: product.name,
            dp_price: Number(product.cost_price || 0),
            actual_dp: Number(product.cost_price || 0),
            total_amount: Number(product.cost_price || 0) * item.qty,
            deposit_amount: Math.max(0, Number(product.cost_price || 0) * item.qty - item.sp_amount),
          }
        : item
      ))
      setShowQuickAddProduct(false)
      resetQuickProductForm()
      toast.success('Product added. You can select it now.')
    } catch (error: any) {
      toast.error(error.message || 'Failed to add product')
    }
  }

  function updateItem(idx: number, field: string, value: any) {
    const newItems = [...items]
    newItems[idx] = { ...newItems[idx], [field]: value }

    if (field === 'product_code') {
      const p = products.find(p => p.product_code?.toLowerCase() === value.toLowerCase())
      if (p) {
        newItems[idx].product_id = p.id
        newItems[idx].product_name = p.name
        newItems[idx].dp_price = Number(p.cost_price || 0)
        newItems[idx].discount_pct = Number(p.discount || 0)
      }
    }

    const item = newItems[idx]
    item.actual_dp = item.dp_price * (1 - item.discount_pct / 100)
    item.total_amount = item.actual_dp * item.qty
    item.deposit_amount = Math.max(0, item.total_amount - item.sp_amount)
    newItems[idx] = item
    setItems(newItems)
  }

  const totalAmount = items.reduce((s, i) => s + i.total_amount, 0)
  const selectedSupplier = suppliers.find(s => s.id === form.supplier_id)
  const previousBalance = Number(supplierBalanceById[form.supplier_id] || 0)
  const grossSubtotal = items.reduce((s, i) => s + Number(i.dp_price || 0) * Number(i.qty || 0), 0)
  const discountAmount = Math.max(0, grossSubtotal - totalAmount)
  const totalSpAmount = items.reduce((s, i) => s + Number(i.sp_amount || 0), 0)
  const totalActualDeposit = items.reduce((s, i) => s + Number(i.deposit_amount || 0), 0)
  const totalPayable = totalAmount - previousBalance
  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase()
    if (!q) return products
    return products.filter(product =>
      String(product.name || '').toLowerCase().includes(q) ||
      String(product.product_code || '').toLowerCase().includes(q)
    )
  }, [productSearch, products])

  function addProductToOrder(product: any) {
    const dp = Number(product.cost_price || 0)
    const discount = Number(product.discount || 0)
    const actual = dp * (1 - discount / 100)
    const nextItem: PurchaseItem = {
      product_id: product.id,
      product_code: product.product_code || '',
      product_name: product.name || '',
      dp_price: dp,
      discount_pct: discount,
      actual_dp: actual,
      qty: 1,
      total_amount: actual,
      sp_amount: 0,
      deposit_amount: actual,
      received_qty: 0,
    }

    setItems(current => {
      const emptyIndex = current.findIndex(item => !item.product_code && !item.product_name)
      if (emptyIndex >= 0) {
        const next = [...current]
        next[emptyIndex] = nextItem
        return next
      }
      return [...current, nextItem]
    })
  }

  function removeItem(index: number) {
    setItems(current => current.length > 1
      ? current.filter((_, itemIndex) => itemIndex !== index)
      : [{ product_id: '', product_code: '', product_name: '', dp_price: 0, discount_pct: 0, actual_dp: 0, qty: 1, total_amount: 0, sp_amount: 0, deposit_amount: 0, received_qty: 0 }]
    )
  }

  async function save() {
    if (!form.supplier_id) return toast.error(t('common_fillAllFields'))
    if (items.length === 0) return toast.error(t('purchase_addAtLeastOneProduct'))

    const hasAllFields = items.every(i => i.product_code && i.product_name && i.qty > 0 && i.dp_price > 0)
    if (!hasAllFields) return toast.error(t('purchase_fillAllProductFields'))

    try {
      const sup = suppliers.find(s => s.id === form.supplier_id)
      const due = totalAmount
      console.log('Saving purchase:', { si_no: form.si_no, supplier_id: form.supplier_id, date: form.date, totalAmount, due })

      const { data: po, error } = await supabase.from('purchases').insert({
        si_no: form.si_no,
        supplier_id: form.supplier_id,
        supplier_name: sup?.name || '',
        date: form.date,
        notes: form.notes,
        shipping_status: form.shipping_status,
        total_amount: totalAmount,
        net_amount: totalAmount,
        paid_amount: 0,
        due_amount: due,
        created_by: user?.id,
      }).select().maybeSingle()

      if (error) {
        console.error('Purchase insert error:', error)
        return toast.error(`Error: ${error.message}`)
      }

      if (!po) {
        console.error('No purchase returned')
        return toast.error('Failed to create purchase')
      }

      console.log('Purchase created:', po.id)

      const itemsToInsert = items.map(i => ({
        purchase_id: po.id,
        product_id: dbProductId(i.product_id),
        product_code: i.product_code,
        product_name: i.product_name,
        dp_price: i.dp_price,
        discount_pct: i.discount_pct,
        actual_dp: i.actual_dp,
        qty: i.qty,
        total_amount: i.total_amount,
        sp_pct: 0,
        sp_amount: i.sp_amount,
        received_qty: 0,
      }))

      const { error: itemError } = await supabase.from('purchase_items').insert(itemsToInsert)
      if (itemError) {
        console.error('Item insert error:', itemError)
        return toast.error(`Items error: ${itemError.message}`)
      }

      console.log('Items inserted successfully')
      await touchOwnerActivity(true)
      toast.success(t('common_saved'))
      setShowModal(false)
      setForm({
        si_no: generateSINo(), supplier_id: '', supplier_name: '',
        date: new Date().toISOString().split('T')[0],
        account_id: '', notes: '', shipping_status: 'pending' as const,
      })
      setItems([{ product_id: '', product_code: '', product_name: '', dp_price: 0, discount_pct: 0, actual_dp: 0, qty: 1, total_amount: 0, sp_amount: 0, deposit_amount: 0, received_qty: 0 }])
      loadAll()
    } catch (err: any) {
      console.error('Save exception:', err)
      toast.error(err.message || 'An error occurred')
    }
  }

  async function saveReceive() {
    if (!receiveItem) return
    const { data: pi } = await supabase
      .from('purchase_items')
      .select('*, products(selling_price)')
      .eq('id', receiveItem.id)
      .maybeSingle()
    if (!pi) return

    const { data: receiveRow, error: receiveError } = await supabase
      .from('purchase_receives')
      .insert({
        purchase_id: receiveItem.purchase_id, purchase_item_id: receiveItem.id,
        ...receiveForm, created_by: user?.id,
      })
      .select('id')
      .maybeSingle()
    if (receiveError) throw receiveError

    const newReceivedQty = (pi.received_qty || 0) + receiveForm.received_qty
    await supabase.from('purchase_items').update({ received_qty: newReceivedQty }).eq('id', receiveItem.id)

    const { data: inv } = await supabase.from('inventory').select('*').eq('product_id', pi.product_id).maybeSingle()
    if (inv) {
      await supabase.from('inventory').update({
        available_qty: inv.available_qty + receiveForm.received_qty,
        upcoming_qty: Math.max(0, inv.upcoming_qty - receiveForm.received_qty),
        updated_at: new Date().toISOString()
      }).eq('id', inv.id)
    } else {
      await supabase.from('inventory').insert({
        product_id: pi.product_id, branch_id: null,
        available_qty: receiveForm.received_qty, upcoming_qty: 0,
      })
    }

    await createReceiveStockBatch({
      productId: pi.product_id,
      purchaseItemId: pi.id,
      purchaseReceiveId: receiveRow?.id,
      qty: receiveForm.received_qty,
      dpPrice: Number(pi.actual_dp || pi.dp_price || 0),
      mrpPrice: Number((Array.isArray(pi.products) ? pi.products[0] : pi.products)?.selling_price || 0),
      receiveDate: receiveForm.receive_date,
      userId: user?.id,
    })

    await supabase.from('inventory_history').insert({
      product_id: pi.product_id, product_name: pi.product_name,
      change_type: 'purchase_in', qty_change: receiveForm.received_qty,
      reference_id: receiveItem.purchase_id, reference_type: 'purchase',
      notes: `Received from purchase ${receiveItem.si_no}`, created_by: user?.id,
    })

    const { data: allItems } = await supabase.from('purchase_items').select('*').eq('purchase_id', receiveItem.purchase_id)
    const allReceived = (allItems || []).every(i => (i.received_qty || 0) >= i.qty)
    const someReceived = (allItems || []).some(i => (i.received_qty || 0) > 0)
    await supabase.from('purchases').update({
      shipping_status: allReceived ? 'received' : someReceived ? 'partial' : 'pending'
    }).eq('id', receiveItem.purchase_id)

    await touchOwnerActivity(true)
    toast.success(t('common_saved'))
    setShowReceiveModal(false)
    loadAll()
  }

  async function handleEditReceive() {
    if (!editingReceiveId || editReceiveQty < 0) return
    try {
      const { error } = await supabase
        .from('purchase_receives')
        .update({ received_qty: editReceiveQty })
        .eq('id', editingReceiveId)

      if (error) throw error
      await touchOwnerActivity(true)
      toast.success('Updated successfully')
      setShowEditReceiveModal(false)
      setEditingReceiveId(null)
      loadAll()
    } catch (error) {
      toast.error('Failed to update')
      console.error(error)
    }
  }

  async function handleDeleteReceive(receiveId: string) {
    if (!(await confirmAction({ message: 'Delete this receiving record?' }))) return
    try {
      const { error } = await supabase
        .from('purchase_receives')
        .delete()
        .eq('id', receiveId)

      if (error) throw error
      await touchOwnerActivity(true)
      toast.success('Deleted successfully')
      loadAll()
    } catch (error) {
      toast.error('Failed to delete')
      console.error(error)
    }
  }

  async function handleEditPO(po: any) {
    setEditingPOId(po.id)
    setEditPOForm({ si_no: po.si_no, date: po.date, supplier_id: po.supplier_id })
    setShowEditPOModal(true)
  }

  async function saveEditPO() {
    if (!editingPOId) return
    try {
      const { error } = await supabase
        .from('purchases')
        .update({
          si_no: editPOForm.si_no,
          date: editPOForm.date,
          supplier_id: editPOForm.supplier_id,
        })
        .eq('id', editingPOId)

      if (error) throw error
      await touchOwnerActivity(true)
      toast.success('Updated successfully')
      setShowEditPOModal(false)
      setEditingPOId(null)
      loadAll()
    } catch (error) {
      toast.error('Failed to update')
      console.error(error)
    }
  }

  async function handleDeletePO(poId: string) {
    if (!(await confirmAction({ message: 'Delete this purchase order? This will also delete all receiving records.' }))) return
    try {
      const purchase = purchases.find(po => po.id === poId)
      if (purchase) {
        addRecycleItem({
          type: 'purchases',
          title: purchase.supplier_name || '-',
          subtitle: purchase.si_no || '-',
          amount: Number(purchase.net_amount || 0),
          data: purchase,
        })
      }
      const { error } = await supabase
        .from('purchases')
        .delete()
        .eq('id', poId)

      if (error) throw error
      await touchOwnerActivity(true)
      toast.success('Deleted successfully')
      loadAll()
    } catch (error) {
      toast.error('Failed to delete')
      console.error(error)
    }
  }

  const statusColors: Record<string, string> = {
    pending: 'badge-orange',
    partial: 'badge-blue',
    received: 'badge-green',
  }

  const allProducts = purchases.flatMap(po => {
    return (po.purchase_items || []).map((item: any) => {
      const receivedQty = (item.purchase_receives || []).reduce((sum: number, r: any) => sum + (r.received_qty || 0), 0)
      const pendingQty = item.qty - receivedQty
      return {
        id: item.id,
        si_no: po.si_no,
        purchase_id: po.id,
        date: po.date,
        company: po.supplier_name,
        product_code: item.product_code,
        product_name: item.product_name,
        dp_price: item.dp_price,
        discount_pct: item.discount_pct,
        actual_dp: item.actual_dp,
        qty: item.qty,
        total_amount: item.total_amount,
        discount_amount: (item.dp_price * item.discount_pct / 100) * item.qty,
        deposit_amount: item.deposit_amount || 0,
        received_qty: receivedQty,
        pending_qty: pendingQty,
        shipping_status: po.shipping_status,
      }
    })
  })

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden p-6">
      <PageHeader
        title="Purchase Order"
        subtitle="Create and manage purchase orders for your products"
        actions={
          <div className="flex flex-wrap gap-3 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-navy-800 shadow-sm">
            <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-amber-500" /> Pending Receive</span>
            <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-blue-600" /> Partially Received</span>
            <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-brand-green" /> Received</span>
            <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-red-600" /> Cancelled</span>
          </div>
        }
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 xl:grid-cols-[430px_1fr]">
        <section className="card flex min-h-0 flex-col overflow-hidden p-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-bold text-navy-800">Select Products</h2>
          </div>
          <div className="mb-4 flex gap-2">
            <div className="relative min-w-0 flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="input pl-9"
                value={productSearch}
                onChange={e => setProductSearch(e.target.value)}
                placeholder="Search by product name or code..."
              />
            </div>
            <button onClick={() => setShowQuickAddProduct(true)} className="btn-secondary aspect-square px-3 text-brand-green" title="Add new product">
              <Plus size={18} />
            </button>
            <button className="btn-secondary aspect-square px-3 text-slate-500" title="Grid view">
              <Grid3X3 size={17} />
            </button>
            <button className="btn-secondary aspect-square px-3 text-slate-500" title="Filter">
              <SlidersHorizontal size={17} />
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {filteredProducts.map(product => {
              const stock = inventoryByProduct[product.id] || 0
              return (
                <div key={product.id} className="flex items-center gap-3 rounded-lg border border-slate-100 bg-white p-3 shadow-sm">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-slate-50">
                    {product.image_url ? (
                      <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" />
                    ) : (
                      <Package size={22} className="text-slate-300" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-navy-800">{product.name}</p>
                    <p className="mt-0.5 font-mono text-xs text-slate-500">{product.product_code}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      <span className="text-brand-green">৳</span> Stock: <span className={stock > 0 ? 'text-navy-800' : 'text-brand-red'}>{stock}</span>
                    </p>
                  </div>
                  <button onClick={() => addProductToOrder(product)} className="rounded-md bg-brand-green px-3 py-1.5 text-xs font-bold text-white hover:bg-green-700">
                    Add
                  </button>
                </div>
              )
            })}
            {filteredProducts.length === 0 && (
              <div className="rounded-lg border border-dashed border-slate-200 py-10 text-center text-sm text-slate-400">No products found</div>
            )}
          </div>
        </section>

        <div className="min-h-0 space-y-5 overflow-y-auto pr-1 pb-1">
          <section className="card p-5">
            <h2 className="mb-4 text-base font-bold text-navy-800">Supplier & Purchase Order Info</h2>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <label>
                <span className="label">Supplier <span className="text-brand-red">*</span></span>
                <select className="input" value={form.supplier_id} onChange={e => setForm({ ...form, supplier_id: e.target.value })}>
                  <option value="">Select Supplier</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.company_name || s.name}</option>)}
                </select>
              </label>
              <label>
                <span className="label">Supplier Name</span>
                <input className="input bg-slate-50" value={selectedSupplier?.company_name || selectedSupplier?.name || ''} placeholder="Auto populated" readOnly />
              </label>
              <label>
                <span className="label">Supplier Phone</span>
                <input className="input bg-slate-50" value={selectedSupplier?.phone || ''} placeholder="Auto populated" readOnly />
              </label>
              <label>
                <span className="label">Purchase Order No</span>
                <input className="input font-mono" value={form.si_no} onChange={e => setForm({ ...form, si_no: e.target.value })} />
              </label>
              <label>
                <span className="label">Date</span>
                <input type="date" className="input" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
              </label>
              <label>
                <span className="label">Order Status</span>
                <select className="input text-orange-600" value={form.shipping_status} onChange={e => setForm({ ...form, shipping_status: e.target.value as any })}>
                  <option value="pending">● Pending Receive</option>
                  <option value="partial">● Partially Received</option>
                  <option value="received">● Received</option>
                </select>
              </label>
            </div>
          </section>

          <section className="card p-5">
            <h2 className="mb-4 text-base font-bold text-navy-800">Purchase Items</h2>
            <div className="overflow-x-auto rounded-lg border border-slate-100">
              <table className="w-full min-w-[1080px] text-xs">
                <thead className="bg-slate-50 text-[11px] font-bold uppercase text-navy-800">
                  <tr>
                    <th className="px-3 py-3 text-left">#</th>
                    <th className="px-3 py-3 text-left">Product Code</th>
                    <th className="px-3 py-3 text-left">Product</th>
                    <th className="px-3 py-3 text-right">DP Amount<br />(৳)</th>
                    <th className="px-3 py-3 text-right">Discount<br />%</th>
                    <th className="px-3 py-3 text-right">Actual DP</th>
                    <th className="px-3 py-3 text-right">Quantity</th>
                    <th className="px-3 py-3 text-right">Total</th>
                    <th className="px-3 py-3 text-right">SP Amount<br />(৳)</th>
                    <th className="px-3 py-3 text-right">Actual Deposit<br />Amount</th>
                    <th className="px-3 py-3 text-center">Status</th>
                    <th className="px-3 py-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => {
                    const productImage = products.find(p => p.id === item.product_id)?.image_url
                    return (
                      <tr key={idx} className="border-t border-slate-100 bg-white">
                        <td className="px-3 py-3 font-semibold text-slate-500">{idx + 1}</td>
                        <td className="px-3 py-3">
                          <input className="input h-10 w-24 text-xs" value={item.product_code} onChange={e => updateItem(idx, 'product_code', e.target.value)} list={`product-codes-new-${idx}`} />
                          <datalist id={`product-codes-new-${idx}`}>
                            {products.map(p => <option key={p.id} value={p.product_code || ''} />)}
                          </datalist>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-md bg-slate-50">
                              {productImage ? <img src={productImage} alt={item.product_name} className="h-full w-full object-cover" /> : <Package size={16} className="text-slate-300" />}
                            </div>
                            <span className="max-w-[180px] truncate font-semibold text-navy-800">{item.product_name || '-'}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3"><input type="number" min="0" className="input h-10 w-24 text-right text-xs" value={item.dp_price || ''} onChange={e => updateItem(idx, 'dp_price', Number(e.target.value))} /></td>
                        <td className="px-3 py-3"><input type="number" min="0" max="100" className="input h-10 w-16 text-right text-xs" value={item.discount_pct || ''} onChange={e => updateItem(idx, 'discount_pct', Number(e.target.value))} /></td>
                        <td className="px-3 py-3 text-right font-bold text-navy-800">{formatCurr(item.actual_dp)}</td>
                        <td className="px-3 py-3"><input type="number" min="1" className="input h-10 w-20 text-right text-xs" value={item.qty} onChange={e => updateItem(idx, 'qty', Number(e.target.value))} /></td>
                        <td className="px-3 py-3 text-right font-bold text-navy-800">{formatCurr(item.total_amount)}</td>
                        <td className="px-3 py-3"><input type="number" min="0" className="input h-10 w-24 text-right text-xs" value={item.sp_amount || ''} onChange={e => updateItem(idx, 'sp_amount', Number(e.target.value))} /></td>
                        <td className="px-3 py-3 text-right"><input type="number" min="0" className="input h-10 w-28 text-right text-xs font-bold text-navy-800" value={item.deposit_amount || ''} onChange={e => updateItem(idx, 'deposit_amount', Number(e.target.value))} /></td>
                        <td className="px-3 py-3 text-center"><span className="rounded-md bg-orange-50 px-2 py-1 text-[11px] font-bold text-orange-600">●Pending</span></td>
                        <td className="px-3 py-3 text-center">
                          <button onClick={() => removeItem(idx)} className="rounded-md border border-red-100 bg-red-50 p-2 text-brand-red hover:bg-red-100" title="Remove">
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-xs font-medium text-blue-600">
              <Info size={15} className="mr-2 inline" /> Product code, product name and image are auto-filled from the selected product in the product list.
            </div>
            <button onClick={() => setItems([...items, { product_id: '', product_code: '', product_name: '', dp_price: 0, discount_pct: 0, actual_dp: 0, qty: 1, total_amount: 0, sp_amount: 0, deposit_amount: 0, received_qty: 0 }])} className="btn-secondary mt-4 text-xs">
              <Plus size={14} /> Add New Row
            </button>
          </section>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_420px]">
            <section className="card p-6">
              <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-5 text-center">
                <div>
                  <p className="text-xs font-bold text-navy-800">Previous Balance</p>
                  <p className="mt-1 text-xs text-slate-500">Available supplier balance</p>
                  <p className={`mt-3 text-2xl font-bold ${previousBalance >= 0 ? 'text-brand-green' : 'text-brand-red'}`}>{formatCurr(previousBalance)}</p>
                </div>
                <span className="text-2xl font-bold text-navy-800">+</span>
                <div>
                  <p className="text-xs font-bold text-navy-800">Current Purchase Amount</p>
                  <p className="mt-1 text-xs text-slate-500">This order value</p>
                  <p className="mt-3 text-2xl font-bold text-brand-green">{formatCurr(totalAmount)}</p>
                </div>
                <span className="text-2xl font-bold text-navy-800">=</span>
                <div>
                  <p className="text-xs font-bold text-navy-800">Total Payable</p>
                  <p className="mt-1 text-xs text-slate-500">{totalPayable >= 0 ? 'Amount to Pay' : 'Balance Remaining'}</p>
                  <p className={`mt-3 text-2xl font-bold ${totalPayable >= 0 ? 'text-navy-800' : 'text-brand-green'}`}>{formatCurr(totalPayable)}</p>
                </div>
              </div>
              <div className="mt-8 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-xs font-medium text-blue-600">
                <Info size={15} className="mr-2 inline" /> Previous balance is based on Supplier Dashboard available balance. Total payable is current purchase amount minus previous balance.
              </div>
            </section>

            <section className="card p-5">
              <div className="space-y-4 border-b border-slate-100 pb-4 text-sm">
                <div className="flex justify-between"><span className="text-navy-800">Subtotal</span><span className="font-semibold text-navy-800">{formatCurr(grossSubtotal)}</span></div>
                <div className="flex justify-between"><span className="text-navy-800">Discount</span><span className="font-semibold text-orange-600">-{formatCurr(discountAmount)}</span></div>
                <div className="flex justify-between"><span className="text-navy-800">Transport Cost</span><span className="font-semibold text-navy-800">{formatCurr(0)}</span></div>
                <div className="flex justify-between"><span className="text-navy-800">Other Charges</span><span className="font-semibold text-navy-800">{formatCurr(0)}</span></div>
              </div>
              <div className="mt-5 flex justify-between text-lg font-bold">
                <span className="text-navy-800">Grand Total</span>
                <span className="text-brand-green">{formatCurr(totalActualDeposit || totalAmount)}</span>
              </div>
              <button onClick={save} className="btn-primary mt-6 h-14 w-full justify-center text-base">
                <ShoppingCart size={18} /> Submit Purchase Order
              </button>
            </section>
          </div>

          <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-xs font-medium text-orange-700">
            <Info size={15} className="mr-2 inline" /> After submission, this purchase order will appear in Purchase → Product Received. Inventory will be increased only after you confirm the items are received.
          </div>
        </div>
      </div>

      <div className="hidden">

      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-3">All Ordered Products</h3>
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-xs">
            <thead className="table-header">
              <tr>
                <th className="text-left py-2 px-2">#</th>
                <th className="text-left py-2 px-2">SI No</th>
                <th className="text-left py-2 px-2">Company</th>
                <th className="text-left py-2 px-2">Date</th>
                <th className="text-left py-2 px-2">Product Code</th>
                <th className="text-left py-2 px-2">Product Name</th>
                <th className="text-right py-2 px-2">DP Price</th>
                <th className="text-right py-2 px-2">Discount %</th>
                <th className="text-right py-2 px-2">Actual DP</th>
                <th className="text-right py-2 px-2">QTY</th>
                <th className="text-right py-2 px-2">Total Amount</th>
                <th className="text-right py-2 px-2">Discount Amount</th>
                <th className="text-right py-2 px-2">Actual Deposit</th>
                <th className="text-center py-2 px-2">Received</th>
                <th className="text-center py-2 px-2">Pending</th>
                <th className="text-center py-2 px-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {allProducts.map((product, idx) => (
                <tr key={product.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="py-2 px-2 text-slate-500">{idx + 1}</td>
                  <td className="py-2 px-2 font-medium">{product.si_no}</td>
                  <td className="py-2 px-2">{product.company}</td>
                  <td className="py-2 px-2">{formatDate(product.date)}</td>
                  <td className="py-2 px-2 font-mono text-xs bg-slate-50 px-2 py-1 rounded">{product.product_code}</td>
                  <td className="py-2 px-2 text-slate-700">{product.product_name}</td>
                  <td className="py-2 px-2 text-right">{formatCurr(product.dp_price)}</td>
                  <td className="py-2 px-2 text-right">{product.discount_pct}%</td>
                  <td className="py-2 px-2 text-right font-medium">{formatCurr(product.actual_dp)}</td>
                  <td className="py-2 px-2 text-right font-semibold">{product.qty}</td>
                  <td className="py-2 px-2 text-right font-semibold">{formatCurr(product.total_amount)}</td>
                  <td className="py-2 px-2 text-right">{formatCurr(product.discount_amount)}</td>
                  <td className="py-2 px-2 text-right">{formatCurr(product.deposit_amount)}</td>
                  <td className="py-2 px-2 text-center text-green-600 font-semibold">{product.received_qty}</td>
                  <td className="py-2 px-2 text-center font-semibold" style={{color: product.pending_qty > 0 ? '#f97316' : '#10b981'}}>
                    {product.pending_qty}
                  </td>
                  <td className="py-2 px-2 text-center">
                    <span className={`text-xs px-2 py-1 rounded font-medium ${
                      product.pending_qty === 0 ? 'bg-green-100 text-green-700' :
                      product.pending_qty > 0 && product.shipping_status === 'partial' ? 'bg-blue-100 text-blue-700' :
                      'bg-orange-100 text-orange-700'
                    }`}>
                      {product.pending_qty === 0 ? 'Received' : product.pending_qty > 0 && product.shipping_status === 'partial' ? 'Partial' : 'Pending'}
                    </span>
                  </td>
                </tr>
              ))}
              {allProducts.length === 0 && (
                <tr>
                  <td colSpan={16} className="text-center py-8 text-slate-400">
                    No products found. Create a purchase order first.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Purchase Orders</h3>
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="table-header">
              <tr>
                <th className="py-2 px-3 w-8"></th>
                <th className="text-left py-2 px-3">{t('purchase_colDate')}</th>
                <th className="text-left py-2 px-3">{t('purchase_colSupplier')}</th>
                <th className="text-right py-2 px-3">{t('purchase_colTotal')}</th>
                <th className="text-center py-2 px-3">{t('purchase_colShipping')}</th>
                <th className="text-center py-2 px-3">Status</th>
                <th className="text-center py-2 px-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {purchases.map(po => (
                <React.Fragment key={po.id}>
                  <tr className="table-row cursor-pointer" onClick={() => setExpandedId(expandedId === po.id ? null : po.id)}>
                    <td className="py-2.5 px-3 text-slate-400">{expandedId === po.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</td>
                    <td className="py-2.5 px-3">{formatDate(po.date)}</td>
                    <td className="py-2.5 px-3 font-medium">{po.supplier_name}</td>
                    <td className="py-2.5 px-3 text-right font-medium">{formatCurr(po.total_amount)}</td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`text-xs px-2 py-1 rounded font-medium ${
                        po.shipping_status === 'received' ? 'bg-green-100 text-green-700' :
                        po.shipping_status === 'partial' ? 'bg-blue-100 text-blue-700' :
                        'bg-orange-100 text-orange-700'
                      }`}>
                        {po.shipping_status?.charAt(0).toUpperCase() + po.shipping_status?.slice(1)}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center"><span className={statusColors[po.shipping_status]}>{po.shipping_status}</span></td>
                    <td className="py-2.5 px-3 text-center flex items-center justify-center gap-1" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => handleEditPO(po)}
                        className="text-xs bg-slate-200 hover:bg-slate-300 text-slate-700 px-2 py-1 rounded flex items-center gap-1"
                        title="Edit"
                      >
                        <Edit2 size={12} />
                      </button>
                      <button
                        onClick={() => handleDeletePO(po.id)}
                        className="text-xs bg-red-100 hover:bg-red-200 text-red-700 px-2 py-1 rounded flex items-center gap-1"
                        title="Delete"
                      >
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                  {expandedId === po.id && (
                    <tr><td colSpan={7} className="bg-slate-50 px-4 py-4">
                      <div className="space-y-4">
                        <div>
                          <h4 className="text-xs font-semibold text-slate-700 mb-2">ORDER DETAILS</h4>
                          <table className="w-full text-xs overflow-x-auto">
                            <thead><tr className="bg-slate-100">
                              <th className="text-left py-2 px-2">Line</th>
                              <th className="text-left py-2 px-2">Product Code</th>
                              <th className="text-left py-2 px-2">Product</th>
                              <th className="text-right py-2 px-2">DP Amount (৳)</th>
                              <th className="text-right py-2 px-2">Discount %</th>
                              <th className="text-right py-2 px-2">Actual DP</th>
                              <th className="text-right py-2 px-2">Quantity</th>
                              <th className="text-right py-2 px-2">Total</th>
                              <th className="text-right py-2 px-2">SP Amount (৳)</th>
                              <th className="text-right py-2 px-2">Actual Deposit Amount</th>
                              <th className="text-center py-2 px-2">Status</th>
                            </tr></thead>
                            <tbody>
                              {(po.purchase_items || []).map((item: any, idx: number) => (
                                <tr key={item.id} className="border-t border-slate-200">
                                  <td className="py-2 px-2 font-semibold text-slate-600">{idx + 1}</td>
                                  <td className="py-2 px-2 font-mono text-xs">{item.product_code}</td>
                                  <td className="py-2 px-2">{item.product_name}</td>
                                  <td className="py-2 px-2 text-right">{formatCurr(item.dp_price)}</td>
                                  <td className="py-2 px-2 text-right">{item.discount_pct}%</td>
                                  <td className="py-2 px-2 text-right">{formatCurr(item.actual_dp)}</td>
                                  <td className="py-2 px-2 text-right font-semibold">{item.qty}</td>
                                  <td className="py-2 px-2 text-right">{formatCurr(item.total_amount)}</td>
                                  <td className="py-2 px-2 text-right">{formatCurr(item.sp_amount)}</td>
                                  <td className="py-2 px-2 text-right font-semibold">{formatCurr(item.deposit_amount || 0)}</td>
                                  <td className="py-2 px-2 text-center">
                                    <span className={statusColors[(item.received_qty || 0) >= item.qty ? 'received' : (item.received_qty || 0) > 0 ? 'partial' : 'pending']}>
                                      {(item.received_qty || 0) >= item.qty ? 'Received' : (item.received_qty || 0) > 0 ? 'Partial' : 'Pending'}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        <div>
                          <h4 className="text-xs font-semibold text-slate-700 mb-2">RECEIVING DETAILS</h4>
                          <table className="w-full text-xs">
                            <thead><tr className="bg-slate-100">
                              <th className="text-left py-2 px-2">Line</th>
                              <th className="text-left py-2 px-2">Receiving Date</th>
                              <th className="text-right py-2 px-2">Received QTY</th>
                              <th className="text-right py-2 px-2">Amount (৳)</th>
                              <th className="text-right py-2 px-2">Undelivered QTY</th>
                              <th className="text-right py-2 px-2">Undeliv. Amount (৳)</th>
                              <th className="text-left py-2 px-2">Duration</th>
                              <th className="py-2 px-2"></th>
                            </tr></thead>
                            <tbody>
                              {(po.purchase_items || []).map((item: any, idx: number) => {
                                const undeliveredQty = item.qty - (item.received_qty || 0)
                                const receives = (item.purchase_receives || []).sort((a: any, b: any) => new Date(b.receive_date).getTime() - new Date(a.receive_date).getTime())
                                const lastReceive = receives[0]
                                const daysElapsed = lastReceive
                                  ? Math.floor((new Date().getTime() - new Date(lastReceive.receive_date).getTime()) / (1000 * 60 * 60 * 24))
                                  : Math.floor((new Date().getTime() - new Date(po.date).getTime()) / (1000 * 60 * 60 * 24))
                                const months = Math.floor(daysElapsed / 30)
                                const days = daysElapsed % 30
                                const durationText = undeliveredQty > 0
                                  ? `${months} month${months !== 1 ? 's' : ''} ${days} Days to receive`
                                  : `${months} month${months !== 1 ? 's' : ''} ${days} Days`

                                return (
                                  <React.Fragment key={item.id}>
                                    {receives.length > 0 ? receives.map((receive: any, rIdx: number) => {
                                      const receivedAmount = receive.received_qty * (item.actual_dp)
                                      return (
                                        <tr key={receive.id} className="border-t border-slate-200">
                                          <td className="py-2 px-2">{idx + 1}</td>
                                          <td className="py-2 px-2">{formatDate(receive.receive_date)}</td>
                                          <td className="py-2 px-2 text-right">{receive.received_qty}</td>
                                          <td className="py-2 px-2 text-right">{formatCurr(receivedAmount)}</td>
                                          <td className="py-2 px-2 text-right">{rIdx === 0 ? undeliveredQty : ''}</td>
                                          <td className="py-2 px-2 text-right">{rIdx === 0 ? formatCurr(undeliveredQty * item.actual_dp) : ''}</td>
                                          <td className="py-2 px-2 text-xs">{rIdx === 0 ? durationText : ''}</td>
                                          <td className="py-2 px-2 flex items-center gap-1">
                                            {rIdx === 0 && undeliveredQty > 0 && (
                                              <button
                                                onClick={() => { setReceiveItem({ ...item, purchase_id: po.id, si_no: po.si_no }); setShowReceiveModal(true) }}
                                                className="text-xs bg-brand-green text-white px-2 py-0.5 rounded flex items-center gap-1"
                                              >
                                                <Truck size={10} /> Receive
                                              </button>
                                            )}
                                            <button
                                              onClick={() => {
                                                setEditingReceiveId(receive.id)
                                                setEditReceiveQty(receive.received_qty)
                                                setShowEditReceiveModal(true)
                                              }}
                                              className="text-xs bg-slate-200 hover:bg-slate-300 text-slate-700 px-1.5 py-0.5 rounded flex items-center gap-1"
                                              title="Edit"
                                            >
                                              <Edit2 size={10} />
                                            </button>
                                            <button
                                              onClick={() => handleDeleteReceive(receive.id)}
                                              className="text-xs bg-red-100 hover:bg-red-200 text-red-700 px-1.5 py-0.5 rounded flex items-center gap-1"
                                              title="Delete"
                                            >
                                              <Trash2 size={10} />
                                            </button>
                                          </td>
                                        </tr>
                                      )
                                    }) : (
                                      <tr className="border-t border-slate-200">
                                        <td className="py-2 px-2">{idx + 1}</td>
                                        <td className="py-2 px-2 text-slate-400">-</td>
                                        <td className="py-2 px-2 text-right text-slate-400">0</td>
                                        <td className="py-2 px-2 text-right text-slate-400">0</td>
                                        <td className="py-2 px-2 text-right">{item.qty}</td>
                                        <td className="py-2 px-2 text-right">{formatCurr(item.total_amount)}</td>
                                        <td className="py-2 px-2 text-xs">{durationText}</td>
                                        <td className="py-2 px-2 flex items-center gap-1">
                                          <button
                                            onClick={() => { setReceiveItem({ ...item, purchase_id: po.id, si_no: po.si_no }); setShowReceiveModal(true) }}
                                            className="text-xs bg-brand-green text-white px-2 py-0.5 rounded flex items-center gap-1"
                                          >
                                            <Truck size={10} /> Receive
                                          </button>
                                        </td>
                                      </tr>
                                    )}
                                  </React.Fragment>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </td></tr>
                  )}
                </React.Fragment>
              ))}
              {purchases.length === 0 && <tr><td colSpan={8} className="text-center py-8 text-slate-400">{t('purchase_noOrders')}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={t('purchase_newOrder')} size="xl">
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div><label className="label">SI No</label><input className="input font-mono" value={form.si_no} onChange={e => setForm({ ...form, si_no: e.target.value })} /></div>
            <div><label className="label">{t('common_date')}</label><input type="date" className="input" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
            <div>
              <label className="label">{t('common_supplier')}</label>
              <select className="input" value={form.supplier_id} onChange={e => setForm({ ...form, supplier_id: e.target.value })}>
                <option value="">{t('purchase_selectSupplier')}</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-slate-700">{t('purchase_productsList')}</label>
              <div className="flex gap-2">
                <button onClick={() => setShowQuickAddProduct(true)} className="btn-primary text-xs py-1">
                  <Plus size={12} /> New Product
                </button>
                <button onClick={() => setItems([...items, { product_id: '', product_code: '', product_name: '', dp_price: 0, discount_pct: 0, actual_dp: 0, qty: 1, total_amount: 0, sp_amount: 0, deposit_amount: 0, received_qty: 0 }])} className="btn-secondary text-xs py-1">
                  <Plus size={12} /> {t('purchase_addProduct')}
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="table-header">
                  <tr>
                    <th className="text-left py-2 px-2">{t('purchase_productCode')}</th>
                    <th className="text-left py-2 px-2">{t('purchase_colProduct')}</th>
                    <th className="text-right py-2 px-2">{t('purchase_dpAmount')}</th>
                    <th className="text-right py-2 px-2">{t('purchase_colDiscount')}</th>
                    <th className="text-right py-2 px-2">{t('purchase_actualDp')}</th>
                    <th className="text-right py-2 px-2">{t('purchase_colQty')}</th>
                    <th className="text-right py-2 px-2">{t('purchase_colTotal')}</th>
                    <th className="text-right py-2 px-2">{t('purchase_spAmount')}</th>
                    <th className="text-right py-2 px-2">{t('purchase_actualDepositAmount')}</th>
                    <th className="text-center py-2 px-2">{t('purchase_colStatus')}</th>
                    <th className="py-2 px-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={idx} className="border-b border-slate-100">
                      <td className="py-1.5 px-2">
                        <input
                          type="text"
                          className="input py-1 text-xs w-24"
                          value={item.product_code}
                          onChange={e => updateItem(idx, 'product_code', e.target.value)}
                          placeholder="Code"
                          list={`product-codes-${idx}`}
                        />
                        <datalist id={`product-codes-${idx}`}>
                          {products.map(p => (
                            <option key={p.id} value={p.product_code || ''} />
                          ))}
                        </datalist>
                      </td>
                      <td className="py-1.5 px-2 font-medium text-slate-700">{item.product_name || '—'}</td>
                      <td className="py-1.5 px-2"><input type="number" min="0" className="input py-1 text-xs text-right w-24" value={item.dp_price || ''} onChange={e => updateItem(idx, 'dp_price', Number(e.target.value))} /></td>
                      <td className="py-1.5 px-2"><input type="number" min="0" max="100" className="input py-1 text-xs text-right w-16" value={item.discount_pct || ''} onChange={e => updateItem(idx, 'discount_pct', Number(e.target.value))} /></td>
                      <td className="py-1.5 px-2 text-right font-medium">{formatCurr(item.actual_dp)}</td>
                      <td className="py-1.5 px-2"><input type="number" min="1" className="input py-1 text-xs text-right w-14" value={item.qty} onChange={e => updateItem(idx, 'qty', Number(e.target.value))} /></td>
                      <td className="py-1.5 px-2 text-right font-semibold text-brand-green">{formatCurr(item.total_amount)}</td>
                      <td className="py-1.5 px-2"><input type="number" min="0" className="input py-1 text-xs text-right w-24" value={item.sp_amount || ''} onChange={e => updateItem(idx, 'sp_amount', Number(e.target.value))} placeholder="SP" /></td>
                      <td className="py-1.5 px-2 text-right font-semibold text-slate-700">{formatCurr(item.deposit_amount)}</td>
                      <td className="text-center"><span className="badge-orange text-xs">{t('purchase_statusPending')}</span></td>
                      <td className="py-1.5 px-2">
                        {items.length > 1 && <button onClick={() => setItems(items.filter((_, i) => i !== idx))} className="text-red-400">✕</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="pt-5 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">{t('purchase_totalLabel')}</span><span className="font-bold">{formatCurr(totalAmount)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">{t('purchase_totalSpAmount')}</span><span className="font-semibold text-brand-red">{formatCurr(items.reduce((s, i) => s + i.sp_amount, 0))}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">{t('purchase_totalActualDeposit')}</span><span className="text-brand-green font-semibold">{formatCurr(items.reduce((s, i) => s + i.deposit_amount, 0))}</span></div>
            </div>
          </div>
          <div><label className="label">{t('common_note')}</label><textarea className="input" rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
          <div className="flex gap-2 pt-2">
            <button onClick={save} className="btn-primary flex-1 justify-center"><Save size={16} /> {t('common_submit')}</button>
            <button onClick={() => setShowModal(false)} className="btn-secondary flex-1 justify-center">{t('common_cancel')}</button>
          </div>
        </div>
      </Modal>

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
                resetQuickProductForm()
              }}
              className="btn-secondary flex-1 justify-center"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showReceiveModal} onClose={() => setShowReceiveModal(false)} title={t('purchase_receiveTitle')}>
        {receiveItem && (
          <div className="space-y-3">
            <div className="p-3 bg-slate-50 rounded-xl text-sm">
              <p className="font-medium">{receiveItem.product_name}</p>
              <p className="text-slate-500 text-xs">{t('purchase_orderQty')} {receiveItem.qty} | {t('purchase_receivedQty')} {receiveItem.received_qty || 0}</p>
            </div>
            <div><label className="label">{t('purchase_receiveDate')}</label><input type="date" className="input" value={receiveForm.receive_date} onChange={e => setReceiveForm({ ...receiveForm, receive_date: e.target.value })} /></div>
            <div><label className="label">{t('purchase_receiverName')}</label><input className="input" value={receiveForm.receiver_name} onChange={e => setReceiveForm({ ...receiveForm, receiver_name: e.target.value })} /></div>
            <div><label className="label">{t('purchase_receivedQuantity')}</label><input type="number" min="1" max={receiveItem.qty - (receiveItem.received_qty || 0)} className="input" value={receiveForm.received_qty || ''} onChange={e => setReceiveForm({ ...receiveForm, received_qty: Number(e.target.value) })} /></div>
            <div>
              <label className="label">{t('purchase_condition')}</label>
              <select className="input" value={receiveForm.condition} onChange={e => setReceiveForm({ ...receiveForm, condition: e.target.value })}>
                <option value="good">{t('purchase_conditionGood')}</option>
                <option value="damaged">{t('purchase_conditionDamaged')}</option>
                <option value="partial">{t('purchase_conditionPartial')}</option>
              </select>
            </div>
            <div><label className="label">{t('common_note')}</label><textarea className="input" rows={2} value={receiveForm.notes} onChange={e => setReceiveForm({ ...receiveForm, notes: e.target.value })} /></div>
            <div className="flex gap-2 pt-2">
              <button onClick={saveReceive} className="btn-primary flex-1 justify-center"><Truck size={16} /> {t('purchase_confirmReceive')}</button>
              <button onClick={() => setShowReceiveModal(false)} className="btn-secondary flex-1 justify-center">{t('common_cancel')}</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={showEditReceiveModal} onClose={() => setShowEditReceiveModal(false)} title="Edit Receiving" size="sm">
        <div className="space-y-4">
          <div>
            <label className="label">Received Quantity</label>
            <input
              type="number"
              min="0"
              value={editReceiveQty}
              onChange={e => setEditReceiveQty(Number(e.target.value))}
              className="input"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={handleEditReceive} className="btn-primary flex-1 justify-center"><Edit2 size={16} /> Update</button>
            <button onClick={() => setShowEditReceiveModal(false)} className="btn-secondary flex-1 justify-center">{t('common_cancel')}</button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showEditPOModal} onClose={() => setShowEditPOModal(false)} title="Edit Purchase Order" size="sm">
        <div className="space-y-4">
          <div>
            <label className="label">SI No</label>
            <input
              type="text"
              value={editPOForm.si_no}
              onChange={e => setEditPOForm({ ...editPOForm, si_no: e.target.value })}
              className="input"
            />
          </div>
          <div>
            <label className="label">Date</label>
            <input
              type="date"
              value={editPOForm.date}
              onChange={e => setEditPOForm({ ...editPOForm, date: e.target.value })}
              className="input"
            />
          </div>
          <div>
            <label className="label">Supplier</label>
            <select
              value={editPOForm.supplier_id}
              onChange={e => setEditPOForm({ ...editPOForm, supplier_id: e.target.value })}
              className="input"
            >
              <option value="">Select Supplier</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={saveEditPO} className="btn-primary flex-1 justify-center"><Save size={16} /> Update</button>
            <button onClick={() => setShowEditPOModal(false)} className="btn-secondary flex-1 justify-center">{t('common_cancel')}</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
