import React, { useState, useEffect, useRef } from 'react'
import { Edit2, Trash2, Plus, Search, Printer, Upload } from 'lucide-react'
import { supabase } from '../lib/supabase'
import PageHeader from '../components/PageHeader'
import Modal from '../components/Modal'
import { confirmAction } from '../components/ConfirmDialog'
import toast from 'react-hot-toast'
import { useLang } from '../context/LanguageContext'
import { addRecycleItem } from '../lib/recycleBin'
import { useAuth } from '../context/AuthContext'
import { createOpeningStockBatch } from '../lib/fifoInventory'
import { deleteProduct as deleteProductRequest } from '../services/product.services'

interface Product {
  id: string
  product_code: string
  name: string
  image_url: string | null
  category?: string | null
  supplier_id?: string | null
  cost_price: number
  selling_price: number
  discount?: number | null       // legacy flat amount - no longer edited
  dp_discount?: number | null     // percentage discount on DP/cost
  mrp_discount?: number | null    // percentage discount on MRP/selling
  opening_qty?: number | null
  size: string | null
  weight: string | null
  created_at?: string | null
  suppliers?: { id: string; name: string; company_name: string } | null
}

interface Supplier {
  id: string
  name: string
  company_name: string
}

interface CsvProductImportRow {
  code: string
  product_name: string
  image_link: string | null
  category: string | null
  supplier_id: string
  supplier: string
  dp_rate: number
  dp_discount: number
  mrp: number
  mrp_discount: number
  opening_qty: number
  size: string | null
  weight: string | null
}

interface BusinessSettings {
  name_bn?: string | null
  name_en?: string | null
  phone?: string | null
  email?: string | null
  address?: string | null
}

const productOpeningQtyStorageKey = 'product_opening_qty_v1'
const productListCacheKey = 'product_list_cache_v1'
const productCsvHeaders = ['Code *', 'Product Name *', 'Image Link', 'Category', 'Supplier *', 'DP Rate (Cost)', 'DP Discount %', 'MRP (Selling)', 'MRP Discount %', 'Opening Qty', 'Size', 'Weight']

// One source of truth for a blank product form, reused by every reset site
// so a field can never be forgotten in one place and left stale in another.
const EMPTY_FORM = {
  product_code: '',
  name: '',
  image_url: '',
  category: '',
  supplier_id: '',
  cost_price: 0,
  dp_discount: 0,
  selling_price: 0,
  mrp_discount: 0,
  opening_qty: 0,
  size: '',
  weight: '',
}
const pageSize = 1000
const bulkDeleteChunkSize = 200
const importInventoryChunkSize = 25
const linkedProductDeleteMessage = 'Cannot Delete Product: This item is linked to existing sales or purchase transactions to preserve database history.'

function readStoredOpeningQty() {
  try {
    return JSON.parse(localStorage.getItem(productOpeningQtyStorageKey) || '{}') as Record<string, number>
  } catch {
    return {}
  }
}

function writeStoredOpeningQty(nextMap: Record<string, number>) {
  localStorage.setItem(productOpeningQtyStorageKey, JSON.stringify(nextMap))
}

function writeProductListCache(products: Product[]) {
  // Best-effort only - a full product image can push this past the
  // browser's localStorage quota. A throw here must never block the
  // React state update that already happened (that's what actually
  // makes the product visible), so swallow write failures.
  try {
    localStorage.setItem(productListCacheKey, JSON.stringify(products))
  } catch {
    // ignore quota/serialization errors - the cache is just a cold-start fallback
  }
}

function readProductListCache() {
  try {
    return JSON.parse(localStorage.getItem(productListCacheKey) || '[]') as Product[]
  } catch {
    return []
  }
}

function csvEscape(value: any) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

function downloadCsv(filename: string, rows: any[][]) {
  const csv = rows.map(row => row.map(csvEscape).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  window.URL.revokeObjectURL(url)
}

function parseCsv(text: string) {
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

function headerKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
}

function normalizeLookup(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function isDuplicateProductCodeError(error: any) {
  const message = String(error?.message || '')
  return error?.code === '23505' && message.includes('products_product_code_key')
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

function parseCsvNumber(value: string) {
  const normalized = value.replace(/,/g, '').replace(/[^\d.-]/g, '').trim()
  const parsed = Number.parseFloat(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

function parseCsvInteger(value: string) {
  const parsed = Number.parseInt(String(parseCsvNumber(value)), 10)
  return Number.isFinite(parsed) ? parsed : 0
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

async function fetchPaged<T>(queryForRange: (from: number, to: number) => any) {
  const rows: T[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await queryForRange(from, from + pageSize - 1)
    if (error) throw error
    const page = (data || []) as T[]
    rows.push(...page)
    if (page.length < pageSize) break
  }
  return rows
}

export default function ProductList() {
  const { t, formatCurr } = useLang()
  const { user, profile } = useAuth()
  const [products, setProducts] = useState<Product[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [business, setBusiness] = useState<BusinessSettings | null>(null)
  const [openingQtyMap, setOpeningQtyMap] = useState<Record<string, number>>({})
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [tagProduct, setTagProduct] = useState<Product | null>(null)
  const [tagCopies, setTagCopies] = useState(1)
  const [printCopies, setPrintCopies] = useState(0)
  const [showTagModal, setShowTagModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const csvInputRef = useRef<HTMLInputElement>(null)
  const ownerId = profile?.owner_id || user?.id || null

  const [form, setForm] = useState({ ...EMPTY_FORM })

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    setSelectedIds(prev => prev.filter(id => products.some(product => product.id === id)))
  }, [products])

  async function ensureInventory(_productId: string, _openingQty?: number) {
    // Inventory rows are bootstrapped by the backend on product create.
  }

  async function updateOpeningStockBatch(_productId: string, _openingQty: number, _dpPrice: number, _mrpPrice: number) {
    // Opening stock batches are synced by the backend on product update
    // (PATCH /products/:id adjusts batch + inventory when opening_qty changes).
  }

  function isMissingOpeningQtyColumn(error: any) {
    const message = String(error?.message || '')
    return message.includes("'opening_qty' column") || message.includes('opening_qty')
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

  function hasMissingProductColumn(payload: any, error: any) {
    return removeMissingProductColumn(payload, error) !== payload
  }

  function isMissingInventoryTable(error: any) {
    const message = String(error?.message || '')
    return message.includes('inventory') || message.includes('inventory_batches')
  }

  function isRlsError(error: any) {
    const message = String(error?.message || '').toLowerCase()
    return error?.status === 403 || message.includes('row-level security') || message.includes('permission denied')
  }

  function productDatabasePayload(row: CsvProductImportRow, nextOwnerId: string | null) {
    return {
      product_code: row.code,
      name: row.product_name,
      image_url: row.image_link,
      category: row.category,
      supplier_id: row.supplier_id,
      cost_price: row.dp_rate,
      selling_price: row.mrp,
      dp_discount: row.dp_discount,
      mrp_discount: row.mrp_discount,
      opening_qty: row.opening_qty,
      size: row.size,
      weight: row.weight,
      is_active: true,
      owner_id: nextOwnerId,
    }
  }

  async function lookupCsvProducts(rows: CsvProductImportRow[]) {
    const codes = rows.map(row => row.code).filter(Boolean)
    if (codes.length === 0) return []
    try {
      const { data, error } = await supabase
        .from('products')
        .select('id, product_code')
        .in('product_code', codes)

      if (error) throw error
      return (data || []) as { id: string; product_code: string }[]
    } catch (error) {
      console.warn('CSV product lookup skipped', error)
      return []
    }
  }

  async function saveCsvProducts(rows: CsvProductImportRow[]) {
    const ownerCandidates = Array.from(new Set([ownerId, user?.id].filter(Boolean))) as string[]
    let lastError: any = null

    for (const nextOwnerId of ownerCandidates) {
      let databasePayloads = rows.map(row => productDatabasePayload(row, nextOwnerId))

      let result = await supabase
        .from('products')
        .upsert(databasePayloads, { onConflict: 'product_code' })
        .select('id, product_code')

      for (let attempt = 0; result.error && attempt < 5; attempt += 1) {
        const removeOpeningQty = isMissingOpeningQtyColumn(result.error)
        const retryPayloads = databasePayloads.map(payload => {
          if (removeOpeningQty && 'opening_qty' in payload) {
            const { opening_qty, ...nextPayload } = payload
            return nextPayload
          }
          return removeMissingProductColumn(payload, result.error)
        })
        const changed = retryPayloads.some((payload, index) => payload !== databasePayloads[index])
        if (!changed) break
        databasePayloads = retryPayloads as typeof databasePayloads
        result = await supabase
          .from('products')
          .upsert(databasePayloads, { onConflict: 'product_code' })
          .select('id, product_code')
      }

      if (!result.error) return (result.data || []) as { id: string; product_code: string }[]
      lastError = result.error

      const insertResult = await supabase
        .from('products')
        .insert(databasePayloads)

      if (!insertResult.error) {
        return await lookupCsvProducts(rows)
      }
      lastError = insertResult.error

      if (String(insertResult.error.message || '').toLowerCase().includes('duplicate')) {
        let updateFailed = false
        for (const payload of databasePayloads) {
          const { error } = await supabase
            .from('products')
            .update(payload)
            .eq('product_code', payload.product_code)
          if (error) {
            lastError = error
            updateFailed = true
            break
          }
        }
        if (!updateFailed) return await lookupCsvProducts(rows)
      }

      if (!isRlsError(result.error) && !isRlsError(insertResult.error)) break
    }

    throw lastError
  }

  function optimisticProductsFromCsv(rows: CsvProductImportRow[], savedProducts: { id: string; product_code: string }[]) {
    const savedByCode = new Map(savedProducts.map(product => [product.product_code.toLowerCase(), product]))
    const supplierById = new Map(suppliers.map(supplier => [supplier.id, supplier]))
    const now = new Date().toISOString()

    return rows.map(row => {
      const saved = savedByCode.get(row.code.toLowerCase())
      const supplier = supplierById.get(row.supplier_id)
      return {
        id: saved?.id || `csv-${row.code}`,
        product_code: row.code,
        name: row.product_name,
        image_url: row.image_link,
        category: row.category,
        supplier_id: row.supplier_id,
        cost_price: row.dp_rate,
        selling_price: row.mrp,
        dp_discount: row.dp_discount,
        mrp_discount: row.mrp_discount,
        opening_qty: row.opening_qty,
        size: row.size,
        weight: row.weight,
        is_active: true,
        created_at: now,
        suppliers: supplier
          ? { id: supplier.id, name: supplier.name, company_name: supplier.company_name }
          : { id: row.supplier_id || row.supplier, name: row.supplier, company_name: row.supplier },
      } as Product
    })
  }

  function mergeProductsForDisplay(importedProducts: Product[]) {
    setProducts(prev => {
      const nextByCode = new Map(prev.map(product => [product.product_code.toLowerCase(), product]))
      for (const product of importedProducts) {
        nextByCode.set(product.product_code.toLowerCase(), product)
      }
      const nextProducts = Array.from(nextByCode.values())
      writeProductListCache(nextProducts)
      return nextProducts
    })
  }

  async function saveCsvSupplier(name: string) {
    const ownerCandidates = Array.from(new Set([ownerId, user?.id].filter(Boolean))) as string[]
    let lastError: any = null

    for (const nextOwnerId of ownerCandidates) {
    const payload: any = {
      name,
      company_name: name,
      person_name: '',
      phone: '',
      email: '',
      address: '',
      opening_due: 0,
      is_active: true,
      owner_id: nextOwnerId,
    }

    let result = await supabase
      .from('suppliers')
      .insert(payload)
      .select('id, name, company_name')
      .single()

    for (let attempt = 0; result.error && attempt < 3; attempt += 1) {
      const nextPayload = removeMissingProductColumn(payload, result.error)
      if (nextPayload === payload) break
      Object.keys(payload).forEach(key => delete payload[key])
      Object.assign(payload, nextPayload)
      result = await supabase
        .from('suppliers')
        .insert(payload)
        .select('id, name, company_name')
        .single()
    }

      if (!result.error) return result.data as Supplier
      lastError = result.error
      if (!isRlsError(result.error)) break
    }

    throw lastError
  }

  function productPayload(includeOpeningQty = true) {
    const payload: any = {
      product_code: form.product_code.trim(),
      name: form.name.trim(),
      image_url: form.image_url || null,
      category: form.category.trim() || null,
      supplier_id: form.supplier_id,
      // Empty numeric fields go as null - the backend normalizes null to the
      // column default, so DP Rate / MRP / discounts are all optional.
      cost_price: form.cost_price || null,
      selling_price: form.selling_price || null,
      dp_discount: form.dp_discount || null,
      mrp_discount: form.mrp_discount || null,
      size: form.size || null,
      weight: form.weight || null,
      owner_id: ownerId,
    }

    if (includeOpeningQty) payload.opening_qty = form.opening_qty || 0
    return payload
  }

  function openingQtyForProduct(product: Product) {
    return Number(product.opening_qty ?? openingQtyMap[product.id] ?? 0)
  }

  function rememberOpeningQty(productId: string, qty: number) {
    const next = { ...readStoredOpeningQty(), [productId]: qty || 0 }
    writeStoredOpeningQty(next)
    setOpeningQtyMap(prev => ({ ...prev, [productId]: qty || 0 }))
  }

  function updateLocalCachedProduct(productId: string) {
    const supplier = suppliers.find(item => item.id === form.supplier_id)
    const nextProduct: Product = {
      id: productId,
      product_code: form.product_code.trim(),
      name: form.name.trim(),
      image_url: form.image_url || null,
      category: form.category.trim() || null,
      supplier_id: form.supplier_id,
      cost_price: Number(form.cost_price || 0),
      selling_price: Number(form.selling_price || 0),
      dp_discount: Number(form.dp_discount || 0),
      mrp_discount: Number(form.mrp_discount || 0),
      opening_qty: Number(form.opening_qty || 0),
      size: form.size || null,
      weight: form.weight || null,
      is_active: true,
      created_at: products.find(product => product.id === productId)?.created_at || new Date().toISOString(),
      suppliers: supplier ? { id: supplier.id, name: supplier.name, company_name: supplier.company_name } : null,
    } as Product

    setProducts(current => {
      const nextProducts = current.map(product => product.id === productId ? nextProduct : product)
      writeProductListCache(nextProducts)
      return nextProducts
    })
    rememberOpeningQty(productId, Number(form.opening_qty || 0))
  }

  async function loadData() {
    try {
      const [productRows, supplierRows, openingBatchRows, businessRes] = await Promise.all([
        fetchPaged<Product>((from, to) =>
          supabase
            .from('products')
            .select('*, suppliers(id, name, company_name)')
            .eq('is_active', true)
            .order('created_at', { ascending: false })
            .range(from, to)
        ),
        fetchPaged<Supplier>((from, to) =>
          supabase
            .from('suppliers')
            .select('*')
            .eq('is_active', true)
            .order('company_name')
            .range(from, to)
        // A transient failure here must not wipe out the product list below -
        // Promise.all rejects as a whole otherwise, so setProducts would never
        // run and a just-added product would stay invisible until reload.
        ).catch(() => suppliers),
        fetchPaged<{ product_id: string; received_qty: number }>((from, to) =>
          supabase
            .from('inventory_batches')
            .select('product_id, received_qty')
            .eq('source_type', 'opening_stock')
            .range(from, to)
        ).catch(() => []),
        supabase.from('business_settings').select('name_bn, name_en, phone, email, address').maybeSingle(),
      ])

      const nextOpeningQtyMap: Record<string, number> = readStoredOpeningQty()
      for (const batch of openingBatchRows || []) {
        if (nextOpeningQtyMap[batch.product_id] == null) {
          nextOpeningQtyMap[batch.product_id] = Number(batch.received_qty || 0)
        }
      }

      const productsWithOpeningQty = (productRows || []).map(product => ({
        ...product,
        opening_qty: Number(product.opening_qty ?? nextOpeningQtyMap[product.id] ?? 0),
      }))
      const cachedProducts = readProductListCache()
      const nextProducts = productsWithOpeningQty.length > 0 ? productsWithOpeningQty : cachedProducts

      setProducts(nextProducts)
      writeProductListCache(nextProducts)
      setSuppliers(supplierRows || [])
      setBusiness((businessRes as any).data || null)
      setOpeningQtyMap(nextOpeningQtyMap)
    } catch (error) {
      toast.error('Failed to load data')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    const productCode = form.product_code.trim()
    const productName = form.name.trim()

    if (!productCode || !productName || !form.supplier_id) {
      return toast.error('Code, Product Name, and Supplier are required')
    }

    try {
      const isLocalCachedEdit = Boolean(editingId && !isUuid(editingId))

      if (isLocalCachedEdit && editingId) {
        const duplicateLocal = products.find(product =>
          product.id !== editingId &&
          product.product_code.trim().toLowerCase() === productCode.toLowerCase()
        )
        if (duplicateLocal) {
          return toast.error('Product code already exists. Please use a different code.')
        }
        updateLocalCachedProduct(editingId)
        toast.success('Product updated')
        setShowModal(false)
        setEditingId(null)
        setForm({ ...EMPTY_FORM })
        return
      }

      if (!editingId || isUuid(editingId)) {
        const { data: duplicateProduct, error: duplicateLookupError } = await supabase
          .from('products')
          .select('id')
          .eq('product_code', productCode)
          .maybeSingle()

        if (duplicateLookupError) throw duplicateLookupError
        if (duplicateProduct && duplicateProduct.id !== editingId) {
          return toast.error('Product code already exists. Please use a different code.')
        }
      }

      if (editingId) {
        const payload = productPayload(true)
        let { error } = await supabase
          .from('products')
          .update(payload)
          .eq('id', editingId)

        if (error && (isMissingOpeningQtyColumn(error) || hasMissingProductColumn(payload, error))) {
          const retryPayload = isMissingOpeningQtyColumn(error)
            ? productPayload(false)
            : removeMissingProductColumn(payload, error)
          const retry = await supabase
            .from('products')
            .update(retryPayload)
            .eq('id', editingId)
          error = retry.error
        }

        if (error) throw error
        await ensureInventory(editingId, form.opening_qty || 0)
        await updateOpeningStockBatch(editingId, form.opening_qty || 0, form.cost_price || 0, form.selling_price || 0)
        rememberOpeningQty(editingId, form.opening_qty || 0)

        // Same reasoning as the create path below: reflect the edit right
        // away rather than waiting on loadData()'s parallel refetch.
        const editedSupplier = suppliers.find(s => s.id === form.supplier_id)
        setProducts(prev => {
          const next = prev.map(p => p.id === editingId
            ? {
                ...p,
                ...payload,
                opening_qty: Number(form.opening_qty || 0),
                suppliers: editedSupplier
                  ? { id: editedSupplier.id, name: editedSupplier.name, company_name: editedSupplier.company_name }
                  : p.suppliers,
              }
            : p)
          writeProductListCache(next)
          return next
        })

        toast.success('Product updated')
      } else {
        const payload = { ...productPayload(true), is_active: true }
        let { data: product, error } = await supabase
          .from('products')
          .insert(payload)
          .select('id')
          .single()

        if (error && (isMissingOpeningQtyColumn(error) || hasMissingProductColumn(payload, error))) {
          const retryPayload = isMissingOpeningQtyColumn(error)
            ? { ...productPayload(false), is_active: true }
            : removeMissingProductColumn(payload, error)
          const retry = await supabase
            .from('products')
            .insert(retryPayload)
            .select('id')
            .single()
          product = retry.data
          error = retry.error
        }

        if (error) throw error
        if (!product) throw new Error('Failed to create product')
        await ensureInventory(product.id, form.opening_qty || 0)
        await createOpeningStockBatch({
          productId: product.id,
          qty: form.opening_qty || 0,
          dpPrice: form.cost_price || 0,
          mrpPrice: form.selling_price || 0,
          userId: user?.id,
        })
        rememberOpeningQty(product.id, form.opening_qty || 0)

        // Show the new product immediately instead of waiting on the
        // loadData() refetch below - that refetch runs several parallel
        // requests (suppliers, inventory, business settings) and any one of
        // them being slow/flaky must not delay the product the user just
        // added from appearing.
        const createdSupplier = suppliers.find(s => s.id === form.supplier_id)
        const optimisticProduct: Product = {
          // The insert only returns { id }, so fill the rest from the form so
          // the new row renders complete without waiting for loadData().
          id: (product as any).id,
          product_code: form.product_code.trim(),
          name: form.name.trim(),
          image_url: form.image_url || null,
          category: form.category.trim() || null,
          supplier_id: form.supplier_id || null,
          cost_price: Number(form.cost_price || 0),
          selling_price: Number(form.selling_price || 0),
          dp_discount: Number(form.dp_discount || 0),
          mrp_discount: Number(form.mrp_discount || 0),
          opening_qty: Number(form.opening_qty || 0),
          size: form.size || null,
          weight: form.weight || null,
          created_at: new Date().toISOString(),
          suppliers: createdSupplier
            ? { id: createdSupplier.id, name: createdSupplier.name, company_name: createdSupplier.company_name }
            : null,
        }
        setProducts(prev => {
          const next = [optimisticProduct, ...prev.filter(p => p.id !== optimisticProduct.id)]
          writeProductListCache(next)
          return next
        })

        toast.success('Product added')
      }

      setShowModal(false)
      setEditingId(null)
      setForm({ ...EMPTY_FORM })
      loadData()
    } catch (error: any) {
      if (isDuplicateProductCodeError(error)) {
        return toast.error('Product code already exists. Please use a different code.')
      }
      toast.error(error.message || 'Failed to save product')
    }
  }

  async function handleEdit(product: Product) {
    setEditingId(product.id)
    setForm({
      product_code: product.product_code,
      name: product.name,
      image_url: product.image_url || '',
      category: product.category || '',
      supplier_id: (product as any).suppliers?.id || product.supplier_id || '',
      cost_price: product.cost_price || 0,
      selling_price: product.selling_price || 0,
      dp_discount: Number(product.dp_discount || 0),
      mrp_discount: Number(product.mrp_discount || 0),
      opening_qty: openingQtyForProduct(product),
      size: product.size || '',
      weight: product.weight || '',
    })
    setShowModal(true)
  }

  async function productHasTransactionLinks(productId: string) {
    const [salesRes, purchaseRes] = await Promise.all([
      supabase
        .from('sale_items')
        .select('id', { count: 'exact', head: true })
        .eq('product_id', productId),
      supabase
        .from('purchase_items')
        .select('id', { count: 'exact', head: true })
        .eq('product_id', productId),
    ])

    if (salesRes.error) throw salesRes.error
    if (purchaseRes.error) throw purchaseRes.error

    return Number(salesRes.count || 0) > 0 || Number(purchaseRes.count || 0) > 0
  }

  async function handleDelete(id: string, code: string) {
    if (!(await confirmAction({
      title: 'Delete Product?',
      message: 'Are you sure you want to permanently delete this product? This action cannot be undone.',
      confirmText: 'Yes, Delete',
      cancelText: 'No, Cancel',
    }))) return

    try {
      if (await productHasTransactionLinks(id)) {
        toast.error(linkedProductDeleteMessage)
        return
      }

      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', id)

      if (error) throw error
      setSelectedIds(prev => prev.filter(selectedId => selectedId !== id))
      toast.success('Product deleted successfully.')
      loadData()
    } catch (error: any) {
      const message = String(error?.message || '')
      if (message.includes('linked to existing sales or purchase transactions')) {
        toast.error(linkedProductDeleteMessage)
        return
      }
      toast.error(error.message || 'Failed to delete product')
    }
  }

  async function handleBulkDelete() {
    const selectedProducts = products.filter(product => selectedIds.includes(product.id))
    if (selectedProducts.length === 0) return toast.error('Select products first')
    if (!(await confirmAction({ message: `Delete ${selectedProducts.length} selected product${selectedProducts.length === 1 ? '' : 's'}?` }))) return

    try {
      for (const product of selectedProducts) {
        addRecycleItem({
          type: 'products',
          title: product.name || product.product_code,
          subtitle: product.product_code,
          amount: Number(product.selling_price || 0),
          data: product,
        })
      }

      // Server-side soft delete puts each product into the recycle bin.
      for (const product of selectedProducts) {
        await deleteProductRequest(product.id)
      }

      setSelectedIds([])
      toast.success(`${selectedProducts.length} products deleted`)
      loadData()
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete selected products')
    }
  }

  function handleOpenNew() {
    setEditingId(null)
    setForm({ ...EMPTY_FORM })
    setShowModal(true)
  }

  function handleExportCSV() {
    if (filteredProducts.length === 0) {
      return toast.error('No products to export')
    }

    const rows = filteredProducts.map((p, idx) => {
      const supplier = (p as any).suppliers?.company_name || (p as any).suppliers?.name || ''
      return [
        p.product_code,
        p.name,
        p.image_url || '',
        p.category || '',
        supplier,
        p.cost_price || 0,
        Number(p.dp_discount || 0),
        p.selling_price || 0,
        Number(p.mrp_discount || 0),
        openingQtyForProduct(p),
        p.size || '',
        p.weight || '',
      ]
    })

    downloadCsv(`product-list-${new Date().toISOString().split('T')[0]}.csv`, [productCsvHeaders, ...rows])
    toast.success('CSV downloaded')
  }

  function handleDownloadSampleCSV() {
    const supplierName = suppliers[0]?.company_name || suppliers[0]?.name || 'Supplier Name'
    downloadCsv('product-import-sample.csv', [
      productCsvHeaders,
      ['SKU-001', 'Wooden Chair', 'https://example.com/chair.jpg', 'Chair', supplierName, 2500, 0, 3500, 5, 10, '45x50cm', '5kg'],
      ['SKU-002', 'Dining Table', '', 'Table', supplierName, 12000, 2, 18000, 10, 5, '6 seater', '35kg'],
    ])
    toast.success('Sample CSV downloaded')
  }

  function handleImportCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string
        const csvRows = parseCsv(text)
        if (csvRows.length < 2) return toast.error('CSV must have header and data rows')

        const headers = csvRows[0].map(headerKey)
        const columnIndex = (names: string[]) => names.map(headerKey).map(name => headers.indexOf(name)).find(index => index >= 0) ?? -1
        const indexes = {
          code: columnIndex(['Code', 'Product Code', 'SKU Number', 'SKU']),
          productName: columnIndex(['Product Name', 'Name']),
          imageLink: columnIndex(['Image Link', 'Image URL']),
          category: columnIndex(['Category']),
          supplier: columnIndex(['Supplier', 'Supplier ID', 'Supplier Name', 'Supplier Company']),
          dpRate: columnIndex(['DP Rate (Cost)', 'DP Rate', 'DP', 'Cost Price', 'DP Rate Cost']),
          dpDiscount: columnIndex(['DP Discount %', 'DP Discount', 'DP Disc']),
          mrp: columnIndex(['MRP (Selling)', 'MRP', 'Selling Price', 'MRP Selling']),
          mrpDiscount: columnIndex(['MRP Discount %', 'MRP Discount', 'MRP Disc', 'Discount', 'Discount Amount']),
          openingQty: columnIndex(['Opening Qty', 'Opening QTY', 'Opening Quantity']),
          size: columnIndex(['Size']),
          weight: columnIndex(['Weight']),
        }

        if (indexes.code < 0 || indexes.productName < 0) {
          return toast.error('CSV must include Code and Product Name columns')
        }
        if (!ownerId) {
          return toast.error('Unable to identify current workspace owner')
        }

        const value = (row: string[], index: number) => index >= 0 ? row[index]?.trim() || '' : ''
        const rows = csvRows.slice(1)

        const supplierByName = new Map<string, Supplier>()
        const supplierById = new Map<string, Supplier>()
        for (const supplier of suppliers) {
          supplierById.set(supplier.id, supplier)
          if (supplier.name) supplierByName.set(normalizeLookup(supplier.name), supplier)
          if (supplier.company_name) supplierByName.set(normalizeLookup(supplier.company_name), supplier)
        }

        const supplierNames = Array.from(new Set(rows
          .map(row => value(row, indexes.supplier))
          .filter(Boolean)
          .map(normalizeLookup)
        ))

        for (const supplierKey of supplierNames) {
          if (supplierByName.has(supplierKey)) continue
          const supplierName = rows.map(row => value(row, indexes.supplier)).find(name => normalizeLookup(name) === supplierKey) || supplierKey
          const createdSupplier = await saveCsvSupplier(supplierName)
          setSuppliers(prev => prev.some(supplier => supplier.id === createdSupplier.id) ? prev : [...prev, createdSupplier])
          supplierById.set(createdSupplier.id, createdSupplier)
          supplierByName.set(supplierKey, createdSupplier)
          if (createdSupplier.name) supplierByName.set(normalizeLookup(createdSupplier.name), createdSupplier)
          if (createdSupplier.company_name) supplierByName.set(normalizeLookup(createdSupplier.company_name), createdSupplier)
        }

        const invalidRows: string[] = []
        const importedRows = rows
          .map((row, rowIndex) => ({ row, rowNumber: rowIndex + 2 }))
          .filter(({ row }) => value(row, indexes.code) && value(row, indexes.productName))
          .map(({ row, rowNumber }) => {
            const supplierReference = value(row, indexes.supplier)
            const supplier = supplierById.get(supplierReference) || supplierByName.get(normalizeLookup(supplierReference))
            if (!supplier) {
              invalidRows.push(`row ${rowNumber}: supplier "${supplierReference || 'blank'}" not found`)
            }
            const imported: CsvProductImportRow = {
              code: value(row, indexes.code),
              product_name: value(row, indexes.productName),
              image_link: value(row, indexes.imageLink) || null,
              category: value(row, indexes.category) || null,
              supplier_id: supplier?.id || '',
              supplier: supplierReference,
              dp_rate: parseCsvNumber(value(row, indexes.dpRate)),
              dp_discount: parseCsvNumber(value(row, indexes.dpDiscount)),
              mrp: parseCsvNumber(value(row, indexes.mrp)),
              mrp_discount: parseCsvNumber(value(row, indexes.mrpDiscount)),
              opening_qty: parseCsvInteger(value(row, indexes.openingQty)),
              size: value(row, indexes.size) || null,
              weight: value(row, indexes.weight) || null,
            }
            return imported
          })

        if (importedRows.length === 0) {
          return toast.error('No valid products in CSV')
        }

        if (invalidRows.length > 0) {
          return toast.error(`CSV supplier not matched (${invalidRows.slice(0, 3).join(', ')})`)
        }

        const uniqueProducts: CsvProductImportRow[] = Array.from(
          new Map(importedRows.map(row => [row.code.toLowerCase(), row])).values()
        )

        const savedProducts = await saveCsvProducts(uniqueProducts)
        const importedProducts = optimisticProductsFromCsv(uniqueProducts, savedProducts)
        mergeProductsForDisplay(importedProducts)

        for (const chunk of chunkArray(savedProducts, importInventoryChunkSize)) {
          await Promise.all(chunk.map(async product => {
            const imported = uniqueProducts.find(row => row.code === product.product_code)
            rememberOpeningQty(product.id, imported?.opening_qty || 0)
            try {
              await ensureInventory(product.id, imported?.opening_qty || 0)
              await updateOpeningStockBatch(product.id, imported?.opening_qty || 0, imported?.dp_rate || 0, imported?.mrp || 0)
            } catch (error) {
              if (!isMissingInventoryTable(error)) throw error
            }
          }))
        }
        setSearch('')
        setShowModal(false)
        setEditingId(null)
        setSelectedIds([])
        toast.dismiss()
        toast.success(`${uniqueProducts.length} products imported/updated`)
        loadData()
      } catch (error: any) {
        console.error('CSV import failed', error)
        toast.error(error.message || 'Failed to import CSV')
      }
    }
    reader.readAsText(file)
    if (csvInputRef.current) csvInputRef.current.value = ''
  }

  function openTagPrint(product: Product) {
    setTagProduct(product)
    setTagCopies(1)
    setShowTagModal(true)
  }

  function confirmTagPrint() {
    if (!tagProduct) return
    const copies = Math.max(1, Math.min(200, Math.floor(Number(tagCopies) || 1)))
    setPrintCopies(copies)
    setShowTagModal(false)
    document.body.classList.add('product-tag-printing')
    window.setTimeout(() => window.print(), 120)
  }

  useEffect(() => {
    function cleanupPrintState() {
      document.body.classList.remove('product-tag-printing')
      setPrintCopies(0)
    }

    window.addEventListener('afterprint', cleanupPrintState)
    return () => {
      window.removeEventListener('afterprint', cleanupPrintState)
      document.body.classList.remove('product-tag-printing')
    }
  }, [])

  const filteredProducts = products.filter(p =>
    !search ||
    p.product_code.toLowerCase().includes(search.toLowerCase()) ||
    p.name.toLowerCase().includes(search.toLowerCase())
  )
  // Distinct categories already in use, for the Category field's suggestion
  // dropdown. Derived from the loaded products so it needs no extra request.
  const categoryOptions = Array.from(
    new Set(products.map(p => (p.category || '').trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b))
  const filteredIds = filteredProducts.map(product => product.id)
  const selectedCount = selectedIds.length
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every(id => selectedIds.includes(id))

  function toggleProductSelection(productId: string) {
    setSelectedIds(prev => prev.includes(productId)
      ? prev.filter(id => id !== productId)
      : [...prev, productId]
    )
  }

  function toggleFilteredSelection() {
    setSelectedIds(prev => {
      if (allFilteredSelected) {
        return prev.filter(id => !filteredIds.includes(id))
      }
      return Array.from(new Set([...prev, ...filteredIds]))
    })
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-brand-green border-t-transparent rounded-full" />
      </div>
    )
  }

  const tagItems = tagProduct && printCopies > 0 ? Array.from({ length: printCopies }, (_, index) => ({ product: tagProduct, index })) : []
  const businessPhones = String(business?.phone || '').split(',').map(phone => phone.trim()).filter(Boolean)
  const businessName = business?.name_en || business?.name_bn || 'Hatim Furniture'
  const footerInfo = {
    phone1: businessPhones[0] || '-',
    phone2: businessPhones[1] || '-',
    email: business?.email || '-',
    address: business?.address || '-',
  }

  return (
    <>
    <div className="product-list-screen p-6 space-y-6 bg-white min-h-screen">
      <PageHeader
        title="Product List"
        subtitle="Manage your products"
        actions={
          <div className="flex gap-2">
            <input ref={csvInputRef} type="file" accept=".csv,text/csv" onChange={handleImportCSV} className="hidden" />
            <button onClick={() => csvInputRef.current?.click()} className="btn-secondary flex items-center gap-2 bg-white">
              <Upload size={16} /> Upload CSV
            </button>
            <button onClick={handleOpenNew} className="btn-primary flex items-center gap-2">
              <Plus size={16} /> Add Product
            </button>
          </div>
        }
      />

      <div className="flex gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by code or name..."
            className="input pl-9"
          />
        </div>
      </div>

      {selectedCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-100 bg-red-50 px-4 py-3">
          <p className="text-sm font-semibold text-red-700">{selectedCount} product selected</p>
          <button onClick={handleBulkDelete} className="btn-danger">
            <Trash2 size={14} /> Delete Selected
          </button>
        </div>
      )}

      {filteredProducts.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-slate-400 mb-4">No products found.</p>
          <button onClick={handleOpenNew} className="btn-primary">
            <Plus size={16} /> Add Product
          </button>
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <div className="max-h-[calc(100vh-220px)] overflow-auto">
          <table className="w-full min-w-[1180px]">
            <thead className="table-header">
              <tr className="border-b border-slate-200">
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleFilteredSelection}
                    className="h-4 w-4 rounded border-slate-300 accent-brand-green"
                    title="Select all visible products"
                    aria-label="Select all visible products"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600">#</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600">Code</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600">Product Name</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600">Category</th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-slate-600">Image</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600">Supplier</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-slate-600">Opening QTY</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-slate-600">DP Rate</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-slate-600">MRP</th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-slate-600">Print Tag</th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-slate-600">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((product, index) => {
                const supplier = (product as any).suppliers?.company_name || (product as any).suppliers?.name || '-'
                return (
                  <tr key={product.id} className="border-b border-slate-200 hover:bg-slate-50 transition">
                    <td className="px-6 py-4 text-sm text-slate-600">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(product.id)}
                        onChange={() => toggleProductSelection(product.id)}
                        className="h-4 w-4 rounded border-slate-300 accent-brand-green"
                        aria-label={`Select product ${product.product_code}`}
                      />
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">{index + 1}</td>
                    <td className="px-6 py-4 text-sm font-mono text-slate-700 font-medium">{product.product_code}</td>
                    <td className="px-6 py-4 text-sm text-slate-700 font-medium">{product.name}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">{product.category || '-'}</td>
                    <td className="px-6 py-4 text-sm text-center">
                      {product.image_url ? (
                        <img
                          src={product.image_url}
                          alt={product.name}
                          className="h-10 w-10 object-cover rounded inline-block"
                          onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
                        />
                      ) : (
                        <span className="text-slate-400 text-xs">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">{supplier}</td>
                    <td className="px-6 py-4 text-sm text-right text-slate-700">{openingQtyForProduct(product)}</td>
                    <td className="px-6 py-4 text-sm text-right text-slate-700 font-semibold">
                      {formatCurr(product.cost_price || 0)}
                      {Number(product.dp_discount || 0) > 0 && (
                        <span className="ml-1 text-xs font-normal text-brand-red">-{Number(product.dp_discount)}%</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-right text-slate-700 font-semibold">
                      {formatCurr(product.selling_price || 0)}
                      {Number(product.mrp_discount || 0) > 0 && (
                        <span className="ml-1 text-xs font-normal text-brand-red">-{Number(product.mrp_discount)}%</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => openTagPrint(product)}
                        className="inline-flex items-center justify-center rounded-lg p-2 text-slate-500 transition hover:bg-green-50 hover:text-brand-green"
                        title="Print Tag"
                        aria-label={`Print tag for ${product.product_code}`}
                      >
                        <Printer size={15} />
                      </button>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex flex-row items-center justify-center gap-2 whitespace-nowrap">
                        <button
                          onClick={() => handleEdit(product)}
                          className="inline-flex items-center justify-center rounded-lg p-1.5 text-slate-400 transition hover:bg-blue-50 hover:text-blue-600"
                          title="Edit"
                          aria-label={`Edit product ${product.product_code}`}
                        >
                          <Edit2 size={15} />
                        </button>
                        <button
                          onClick={() => handleDelete(product.id, product.product_code)}
                          className="inline-flex items-center justify-center rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-brand-red"
                          title="Delete"
                          aria-label={`Delete product ${product.product_code}`}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingId ? 'Edit Product' : 'Add New Product'} size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Code *</label>
              <input
                type="text"
                className="input"
                value={form.product_code}
                onChange={(e) => setForm({ ...form, product_code: e.target.value })}
                placeholder="e.g., SKU-001"
              />
            </div>
            <div>
              <label className="label">Product Name *</label>
              <input
                type="text"
                className="input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g., Wooden Chair"
              />
            </div>
          </div>

          <div>
            <label className="label">Image Link</label>
            <input
              type="url"
              className="input"
              value={form.image_url}
              onChange={(e) => setForm({ ...form, image_url: e.target.value })}
              placeholder="https://example.com/image.jpg"
            />
            {form.image_url && (
              <img src={form.image_url} alt="Preview" className="h-20 w-20 object-cover rounded mt-2 border border-slate-200" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Supplier *</label>
              <select
                className="input"
                value={form.supplier_id}
                onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}
              >
                <option value="">Select a supplier</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.company_name || s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Category</label>
              {/* Free-text with suggestions: existing categories show up in the
                  dropdown, and typing a brand-new one just adds it. */}
              <input
                type="text"
                className="input"
                list="product-category-options"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="e.g., Bed, Sofa, Chair"
              />
              <datalist id="product-category-options">
                {categoryOptions.map((cat) => (
                  <option key={cat} value={cat} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">DP Rate (Cost)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="input"
                value={form.cost_price || ''}
                onChange={(e) => setForm({ ...form, cost_price: Number(e.target.value) })}
                placeholder="0.00 (optional)"
              />
            </div>
            <div>
              <label className="label">DP Discount (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                className="input"
                value={form.dp_discount || ''}
                onChange={(e) => setForm({ ...form, dp_discount: Number(e.target.value) })}
                placeholder="0"
              />
            </div>
            <div>
              <label className="label">MRP (Selling)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="input"
                value={form.selling_price || ''}
                onChange={(e) => setForm({ ...form, selling_price: Number(e.target.value) })}
                placeholder="0.00 (optional)"
              />
            </div>
            <div>
              <label className="label">MRP Discount (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                className="input"
                value={form.mrp_discount || ''}
                onChange={(e) => setForm({ ...form, mrp_discount: Number(e.target.value) })}
                placeholder="0"
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
                value={form.opening_qty || ''}
                onChange={(e) => setForm({ ...form, opening_qty: Number(e.target.value) })}
                placeholder="0"
              />
            </div>
            <div>
              <label className="label">Size</label>
              <input type="text" className="input" value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} placeholder="e.g., 45x50cm" />
            </div>
            <div>
              <label className="label">Weight</label>
              <input type="text" className="input" value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} placeholder="e.g., 5kg" />
            </div>
          </div>

          <div className="flex gap-2 pt-4">
            <button onClick={handleSave} className="btn-primary flex-1 justify-center">
              {editingId ? 'Update Product' : 'Add Product'}
            </button>
            <button onClick={() => setShowModal(false)} className="btn-secondary flex-1 justify-center">
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showTagModal} onClose={() => setShowTagModal(false)} title="Print Product Tag" size="sm">
        <div className="space-y-4">
          <p className="text-sm font-medium text-slate-700">Enter number of copies to print:</p>
          <input
            type="number"
            min="1"
            max="200"
            className="input"
            value={tagCopies}
            onChange={event => setTagCopies(Number(event.target.value))}
            autoFocus
          />
          {tagProduct && (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
              {tagProduct.product_code} - {tagProduct.name}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setShowTagModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={confirmTagPrint} className="btn-primary">OK / Confirm</button>
          </div>
        </div>
      </Modal>
    </div>
    <div className="product-tag-print-area" aria-hidden={printCopies === 0}>
      {tagItems.map(({ product, index }) => {
        const regularPrice = Number(product.selling_price || 0)

        return (
          <section className="product-tag-card" key={`${product.id}-${index}`}>
            <div className="product-tag-top-heading">{businessName}</div>

            <section className="product-tag-section product-tag-name-section">
              <p className="product-tag-label">Product Name:</p>
              <div className="product-tag-value-box product-tag-name-box">
                <p className="product-tag-name">{product.name}</p>
              </div>
            </section>

            <section className="product-tag-section product-tag-description-section">
              <p className="product-tag-label">Product Description:</p>
              <div className="product-tag-value-box product-tag-description-box">
                <p className="product-tag-description-line">{product.product_code || '-'}</p>
                <p className="product-tag-description-line">{product.size || '-'}</p>
              </div>
            </section>

            <section className="product-tag-section product-tag-regular-price-section">
              <p className="product-tag-label">Regular Price</p>
              <div className="product-tag-value-box product-tag-price-box">
                <p className="product-tag-price">{formatCurr(regularPrice)}</p>
              </div>
            </section>

            <section className="product-tag-image-section">
              <div className="product-tag-image-box">
                {product.image_url ? (
                  <img src={product.image_url} alt={product.name} className="product-tag-image" />
                ) : (
                  <span className="product-tag-image-empty">No Image</span>
                )}
              </div>
            </section>

            <div className="product-tag-footer-row">
              <span>Phone 1: {footerInfo.phone1}</span>
              <span>Phone 2: {footerInfo.phone2}</span>
              <span>Email: {footerInfo.email}</span>
              <span>Address: {footerInfo.address}</span>
            </div>
          </section>
        )
      })}
    </div>
    </>
  )
}
