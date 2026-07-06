import React, { useState, useEffect, useRef } from 'react'
import { Plus, Edit2, Trash2, Download, Upload } from 'lucide-react'
import { supabase } from '../lib/supabase'
import PageHeader from '../components/PageHeader'
import Modal from '../components/Modal'
import { confirmAction } from '../components/ConfirmDialog'
import toast from 'react-hot-toast'
import { useLang } from '../context/LanguageContext'
import { addRecycleItem } from '../lib/recycleBin'

interface Product {
  id: string
  product_code: string
  name: string
  image_url: string | null
  cost_price: number
  selling_price: number
  size: string | null
  weight: string | null
  is_active: boolean
  created_at: string
}

function isDuplicateProductCodeError(error: any) {
  const message = String(error?.message || '')
  return error?.code === '23505' && message.includes('products_product_code_key')
}

export default function Products() {
  const { t, formatCurr } = useLang()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const csvInputRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    product_code: '',
    name: '',
    image_url: '',
    cost_price: 0,
    selling_price: 0,
    size: '',
    weight: '',
    discount_pct: 0,
  })

  useEffect(() => {
    loadProducts()
  }, [])

  async function loadProducts() {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('is_active', true)
        .order('product_code')

      if (error) throw error
      setProducts(data || [])
    } catch (error) {
      toast.error('Failed to load products')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    const productCode = form.product_code.trim()
    const productName = form.name.trim()

    if (!productCode || !productName) {
      return toast.error('SKU Number and Product Name required')
    }
    if (form.cost_price <= 0 || form.selling_price <= 0) {
      return toast.error('DP and MRP must be greater than 0')
    }

    try {
      const { data: duplicateProduct, error: duplicateLookupError } = await supabase
        .from('products')
        .select('id')
        .eq('product_code', productCode)
        .maybeSingle()

      if (duplicateLookupError) throw duplicateLookupError
      if (duplicateProduct && duplicateProduct.id !== editingId) {
        return toast.error('Product code already exists. Please use a different code.')
      }

      if (editingId) {
        const { error } = await supabase
          .from('products')
          .update({
            product_code: productCode,
            name: productName,
            image_url: form.image_url || null,
            cost_price: form.cost_price,
            selling_price: form.selling_price,
            size: form.size || null,
            weight: form.weight || null,
          })
          .eq('id', editingId)

        if (error) throw error
        toast.success('Product updated')
      } else {
        const { error } = await supabase
          .from('products')
          .insert({
            product_code: productCode,
            name: productName,
            image_url: form.image_url || null,
            cost_price: form.cost_price,
            selling_price: form.selling_price,
            size: form.size || null,
            weight: form.weight || null,
            is_active: true,
          })

        if (error) throw error
        toast.success('Product added')
      }

      setShowModal(false)
      setEditingId(null)
      setForm({ product_code: '', name: '', image_url: '', cost_price: 0, selling_price: 0, size: '', weight: '', discount_pct: 0 })
      loadProducts()
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
      cost_price: product.cost_price,
      selling_price: product.selling_price,
      size: product.size || '',
      weight: product.weight || '',
      discount_pct: 0,
    })
    setShowModal(true)
  }

  async function handleDelete(id: string, code: string) {
    if (!(await confirmAction({ message: `Delete product ${code}?` }))) return

    try {
      const product = products.find(p => p.id === id)
      if (product) {
        addRecycleItem({
          type: 'products',
          title: product.name || code,
          subtitle: product.product_code || code,
          amount: Number(product.selling_price || 0),
          data: product,
        })
      }
      const { error } = await supabase
        .from('products')
        .update({ is_active: false })
        .eq('id', id)

      if (error) throw error
      toast.success('Product deleted')
      loadProducts()
    } catch (error) {
      toast.error('Failed to delete product')
    }
  }

  function handleOpenNew() {
    setEditingId(null)
    setForm({ product_code: '', name: '', image_url: '', cost_price: 0, selling_price: 0, size: '', weight: '', discount_pct: 0 })
    setShowModal(true)
  }

  function handleExportCSV() {
    if (products.length === 0) {
      return toast.error('No products to export')
    }

    const headers = ['SKU Number', 'Product Name', 'Image URL', 'DP (Cost Price)', 'MRP (Selling Price)', 'Discount %', 'Size', 'Weight']
    const rows = products.map(p => [
      p.product_code,
      p.name,
      p.image_url || '',
      p.cost_price,
      p.selling_price,
      0,
      p.size || '',
      p.weight || '',
    ])

    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `products-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    window.URL.revokeObjectURL(url)
    toast.success('CSV downloaded')
  }

  function handleImportCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string
        const lines = text.trim().split('\n')
        if (lines.length < 2) return toast.error('CSV file must have header and data rows')

        const rows = lines.slice(1).map(line => {
          const cells = line.split(',').map(cell => cell.replace(/^"|"$/g, '').replace(/""/g, '"'))
          return cells
        })

        const newProducts = rows
          .filter(row => row[0] && row[1])
          .map(row => ({
            product_code: row[0].trim(),
            name: row[1].trim(),
            image_url: row[2]?.trim() || null,
            cost_price: parseFloat(row[3]) || 0,
            selling_price: parseFloat(row[4]) || 0,
            size: row[6]?.trim() || null,
            weight: row[7]?.trim() || null,
            is_active: true,
          }))

        if (newProducts.length === 0) {
          return toast.error('No valid products in CSV')
        }

        const { error } = await supabase
          .from('products')
          .insert(newProducts)

        if (error) throw error
        toast.success(`${newProducts.length} products imported`)
        loadProducts()
      } catch (error: any) {
        toast.error(error.message || 'Failed to import CSV')
      }
    }
    reader.readAsText(file)
    if (csvInputRef.current) csvInputRef.current.value = ''
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-brand-green border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 bg-white min-h-screen">
      <PageHeader
        title="Products"
        subtitle="Manage your product catalog"
        actions={
          <div className="flex gap-2">
            <button onClick={handleOpenNew} className="btn-primary flex items-center gap-2">
              <Plus size={16} /> Add Product
            </button>
            <button onClick={handleExportCSV} className="btn-secondary flex items-center gap-2">
              <Download size={16} /> Export CSV
            </button>
            <button onClick={() => csvInputRef.current?.click()} className="btn-secondary flex items-center gap-2">
              <Upload size={16} /> Import CSV
            </button>
            <input ref={csvInputRef} type="file" accept=".csv" onChange={handleImportCSV} className="hidden" />
          </div>
        }
      />

      {products.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-slate-400 mb-4">No products yet. Create your first product!</p>
          <button onClick={handleOpenNew} className="btn-primary">
            <Plus size={16} /> Add Product
          </button>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600">#</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600">SKU Number</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600">Product Name</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600">Image</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-slate-600">DP</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-slate-600">Discount</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-slate-600">MRP</th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-slate-600">Action</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product, index) => (
                <tr key={product.id} className="border-b border-slate-200 hover:bg-slate-50 transition">
                  <td className="px-6 py-4 text-sm text-slate-600">{index + 1}</td>
                  <td className="px-6 py-4 text-sm font-mono text-slate-700">{product.product_code}</td>
                  <td className="px-6 py-4 text-sm text-slate-700 font-medium">{product.name}</td>
                  <td className="px-6 py-4 text-sm">
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="h-10 w-10 object-cover rounded"
                        onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
                      />
                    ) : (
                      <span className="text-slate-400 text-xs">No image</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-right text-slate-700">{formatCurr(product.cost_price)}</td>
                  <td className="px-6 py-4 text-sm text-right text-slate-500">-</td>
                  <td className="px-6 py-4 text-sm text-right font-semibold text-slate-700">{formatCurr(product.selling_price)}</td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex justify-center gap-2">
                      <button
                        onClick={() => handleEdit(product)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded transition"
                        title="Edit"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => handleDelete(product.id, product.product_code)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded transition"
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingId ? 'Edit Product' : 'Add New Product'} size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">SKU Number *</label>
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
              <label className="label">DP Amount (Cost) *</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="input"
                value={form.cost_price || ''}
                onChange={(e) => setForm({ ...form, cost_price: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="label">MRP Amount (Selling) *</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="input"
                value={form.selling_price || ''}
                onChange={(e) => setForm({ ...form, selling_price: Number(e.target.value) })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
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
    </div>
  )
}
