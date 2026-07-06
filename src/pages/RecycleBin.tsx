import React, { useEffect, useMemo, useState } from 'react'
import { RefreshCw, RotateCcw, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import PageHeader from '../components/PageHeader'
import { confirmAction } from '../components/ConfirmDialog'
import { supabase } from '../lib/supabase'
import { formatCurrency } from '../lib/utils'
import { getRecycleItems, RecycleBinItem, removeRecycleItem } from '../lib/recycleBin'

type TabKey =
  | 'balance'
  | 'transactions'
  | 'loanManagement'
  | 'expenses'
  | 'productList'
  | 'purchase'
  | 'inventory'
  | 'sales'
  | 'customers'
  | 'reports'
  | 'employees'
  | 'settings'

const tabs: { key: TabKey; label: string }[] = [
  { key: 'balance', label: 'Balance' },
  { key: 'transactions', label: 'Shareholders' },
  { key: 'loanManagement', label: 'Loan Management' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'productList', label: 'Product List' },
  { key: 'purchase', label: 'Purchase' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'sales', label: 'Sales' },
  { key: 'customers', label: 'Customers' },
  { key: 'reports', label: 'Reports' },
  { key: 'employees', label: 'Employees' },
  { key: 'settings', label: 'Settings' },
]

const recycleTypeToMenu: Record<string, TabKey> = {
  due: 'customers',
  products: 'productList',
  purchases: 'purchase',
  sales: 'sales',
}

const recycleTypeLabel: Record<string, string> = {
  due: 'Customers',
  products: 'Product List',
  purchases: 'Purchase',
  sales: 'Sales',
  customers: 'Customers',
  transactions: 'Shareholders',
  loanManagement: 'Loan Management',
  expenses: 'Expenses',
  employees: 'Employees',
  settings: 'Settings',
}

function displayDate(value: string) {
  if (!value) return '-'
  return new Date(value).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function cleanRecord(record: any, ignoredKeys: string[]) {
  const copy = { ...record }
  ignoredKeys.forEach(key => delete copy[key])
  return copy
}

export default function RecycleBin() {
  const [activeTab, setActiveTab] = useState<TabKey>('customers')
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<RecycleBinItem[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  useEffect(() => {
    loadAll()
  }, [])

  useEffect(() => {
    setSelectedIds(prev => prev.filter(id => rows.some(row => row.id === id)))
  }, [rows])

  useEffect(() => {
    setSelectedIds([])
  }, [activeTab])

  async function loadAll() {
    setLoading(true)
    try {
      const localRows = getRecycleItems()
      const productRes = await supabase
        .from('products')
        .select('*, suppliers(id, name, company_name)')
        .eq('is_active', false)
        .order('product_code')

      if (productRes.error) throw productRes.error

      const localProductIds = new Set(localRows.filter(item => item.type === 'products').map(item => item.data?.id))
      const inactiveProducts: RecycleBinItem[] = (productRes.data || [])
        .filter(product => !localProductIds.has(product.id))
        .map(product => ({
          id: `products:${product.id}`,
          type: 'products',
          title: product.name || '-',
          subtitle: product.product_code || '-',
          amount: Number(product.selling_price || 0),
          deleted_at: product.updated_at || product.created_at || new Date().toISOString(),
          data: product,
        }))

      setRows([...localRows, ...inactiveProducts])
    } catch (error: any) {
      toast.error(error.message || 'Failed to load recycle bin')
    } finally {
      setLoading(false)
    }
  }

  async function adjustInventory(productId: string, qtyChange: number) {
    if (!productId || !qtyChange) return
    const { data: inv } = await supabase.from('inventory').select('*').eq('product_id', productId).maybeSingle()
    if (inv) {
      await supabase
        .from('inventory')
        .update({
          available_qty: Math.max(0, Number(inv.available_qty || 0) + qtyChange),
          updated_at: new Date().toISOString(),
        })
        .eq('id', inv.id)
    }
  }

  async function restoreDue(row: RecycleBinItem) {
    const payment = cleanRecord(row.data, ['accounts', 'customers'])
    const { error } = await supabase.from('customer_payments').insert(payment)
    if (error) throw error
  }

  async function restoreProduct(row: RecycleBinItem) {
    const { error } = await supabase.from('products').update({ is_active: true }).eq('id', row.data.id)
    if (error) throw error
  }

  async function restoreSale(row: RecycleBinItem) {
    const { error } = await supabase
      .from('sales')
      .update({ status: 'completed', updated_at: new Date().toISOString() })
      .eq('id', row.data.id)
    if (error) throw error

    for (const item of row.data.sale_items || []) {
      await adjustInventory(item.product_id, -Number(item.qty || 0))
    }
  }

  async function restorePurchase(row: RecycleBinItem) {
    const purchase = cleanRecord(row.data, ['purchase_items'])
    const purchaseItems = row.data.purchase_items || []

    const { error: purchaseError } = await supabase.from('purchases').insert(purchase)
    if (purchaseError) throw purchaseError

    for (const item of purchaseItems) {
      const receives = item.purchase_receives || []
      const itemPayload = cleanRecord(item, ['purchase_receives'])
      const { error: itemError } = await supabase.from('purchase_items').insert(itemPayload)
      if (itemError) throw itemError

      if (receives.length > 0) {
        const { error: receiveError } = await supabase.from('purchase_receives').insert(receives)
        if (receiveError) throw receiveError
      }
    }
  }

  async function restoreGeneric(row: RecycleBinItem) {
    if (!row.table) return
    const payload = cleanRecord(row.data, ['accounts', 'customers', 'employees', 'loan_lenders'])
    const { error } = await supabase.from(row.table).insert(payload)
    if (error) throw error
  }

  async function restore(row: RecycleBinItem) {
    try {
      if (row.type === 'due') await restoreDue(row)
      if (row.type === 'products') await restoreProduct(row)
      if (row.type === 'sales') await restoreSale(row)
      if (row.type === 'purchases') await restorePurchase(row)
      if (!['due', 'products', 'sales', 'purchases'].includes(row.type)) await restoreGeneric(row)

      removeRecycleItem(row.id)
      toast.success('Restored successfully')
      loadAll()
    } catch (error: any) {
      toast.error(error.message || 'Failed to restore')
    }
  }

  async function deleteRecycleRow(row: RecycleBinItem) {
    if (row.type === 'products') {
      const { error } = await supabase.from('products').delete().eq('id', row.data.id)
      if (error) throw error
    }

    if (row.type === 'sales') {
      const { error } = await supabase.from('sales').delete().eq('id', row.data.id)
      if (error) throw error
    }

    if (row.type === 'due') {
      await supabase.from('customer_payments').delete().eq('id', row.data.id)
    }

    if (row.type === 'purchases') {
      await supabase.from('purchases').delete().eq('id', row.data.id)
    }

    if (!['due', 'products', 'sales', 'purchases'].includes(row.type) && row.table) {
      await supabase.from(row.table).delete().eq('id', row.data.id)
    }

    removeRecycleItem(row.id)
  }

  async function permanentDelete(row: RecycleBinItem) {
    if (!(await confirmAction({ message: `Permanently delete ${row.title}?` }))) return

    try {
      await deleteRecycleRow(row)
      toast.success('Deleted permanently')
      loadAll()
    } catch (error: any) {
      toast.error(error.message || 'Failed to permanently delete')
    }
  }

  async function permanentDeleteSelected() {
    const selectedRows = visibleRows.filter(row => selectedIds.includes(row.id))
    if (selectedRows.length === 0) return toast.error('Select records first')
    if (!(await confirmAction({ message: `Permanently delete ${selectedRows.length} selected ${selectedRows.length === 1 ? 'record' : 'records'}?` }))) return

    try {
      for (const row of selectedRows) {
        await deleteRecycleRow(row)
      }

      setSelectedIds([])
      toast.success(`${selectedRows.length} records deleted permanently`)
      loadAll()
    } catch (error: any) {
      toast.error(error.message || 'Failed to permanently delete selected records')
      loadAll()
    }
  }

  function toggleSelect(rowId: string) {
    setSelectedIds(prev => prev.includes(rowId) ? prev.filter(id => id !== rowId) : [...prev, rowId])
  }

  function toggleSelectAllVisible() {
    const visibleIds = visibleRows.map(row => row.id)
    const allSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.includes(id))
    setSelectedIds(prev => allSelected
      ? prev.filter(id => !visibleIds.includes(id))
      : Array.from(new Set([...prev, ...visibleIds]))
    )
  }

  function rowMenuKey(row: RecycleBinItem): TabKey {
    return recycleTypeToMenu[row.type] || (row.type as TabKey)
  }

  const visibleRows = useMemo(() => rows.filter(row => rowMenuKey(row) === activeTab), [rows, activeTab])
  const tabCounts = useMemo(() => {
    const counts = tabs.reduce((map, tab) => {
      map[tab.key] = 0
      return map
    }, {} as Record<TabKey, number>)

    rows.forEach(row => {
      const key = rowMenuKey(row)
      if (key in counts) counts[key] += 1
    })

    return counts
  }, [rows])
  const selectedVisibleCount = visibleRows.filter(row => selectedIds.includes(row.id)).length
  const allVisibleSelected = visibleRows.length > 0 && visibleRows.every(row => selectedIds.includes(row.id))
  const activeLabel = tabs.find(tab => tab.key === activeTab)?.label || 'Records'

  return (
    <div className="p-6 space-y-4">
      <PageHeader
        title="Recycle Bin"
        actions={
          <button onClick={loadAll} className="btn-secondary" disabled={loading}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        }
      />

      <div className="flex gap-1 overflow-x-auto bg-slate-200 p-1 rounded-lg">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`h-9 min-w-32 flex-1 rounded-md px-3 text-sm font-medium transition-colors ${activeTab === tab.key ? 'bg-white text-navy-800 shadow-sm' : 'text-slate-600 hover:bg-white/60'}`}
          >
            <span className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap">
              <span>{tab.label}</span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold leading-none ${activeTab === tab.key ? 'bg-slate-100 text-navy-700' : 'bg-white/70 text-slate-500'}`}>
                {tabCounts[tab.key] || 0}
              </span>
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
        <div className="text-sm text-slate-600">
          {selectedVisibleCount > 0
            ? `${selectedVisibleCount} selected from ${visibleRows.length} ${activeLabel}`
            : `${visibleRows.length} ${activeLabel} in recycle bin`}
        </div>
        <div className="flex gap-2">
          <button
            onClick={toggleSelectAllVisible}
            className="btn-secondary"
            disabled={visibleRows.length === 0 || loading}
          >
            {allVisibleSelected ? 'Clear Selection' : 'Select All'}
          </button>
          <button
            onClick={permanentDeleteSelected}
            className="btn-danger"
            disabled={selectedVisibleCount === 0 || loading}
          >
            <Trash2 size={16} /> Delete Selected
          </button>
        </div>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="table-header">
            <tr>
              <th className="text-left py-3 px-4 w-12">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleSelectAllVisible}
                  disabled={visibleRows.length === 0 || loading}
                  className="h-4 w-4 rounded border-slate-300 text-brand-green focus:ring-brand-green"
                  aria-label={`Select all ${activeLabel}`}
                />
              </th>
              <th className="text-left py-3 px-4 w-12">#</th>
              <th className="text-left py-3 px-4">{activeLabel} Name</th>
              <th className="text-left py-3 px-4">Reference</th>
              <th className="text-left py-3 px-4">Type</th>
              <th className="text-right py-3 px-4">Amount</th>
              <th className="text-left py-3 px-4">Date</th>
              <th className="text-right py-3 px-4">Action</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, index) => (
              <tr key={row.id} className="table-row">
                <td className="py-3 px-4">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(row.id)}
                    onChange={() => toggleSelect(row.id)}
                    className="h-4 w-4 rounded border-slate-300 text-brand-green focus:ring-brand-green"
                    aria-label={`Select ${row.title}`}
                  />
                </td>
                <td className="py-3 px-4 text-slate-500">{index + 1}</td>
                <td className="py-3 px-4 font-medium text-slate-800">{row.title}</td>
                <td className="py-3 px-4 text-slate-600">{row.subtitle}</td>
                <td className="py-3 px-4">
                  <span className="bg-blue-100 text-blue-700 text-xs font-medium px-2 py-1 rounded-full">
                    {recycleTypeLabel[row.type] || activeLabel}
                  </span>
                </td>
                <td className={`py-3 px-4 text-right font-semibold ${row.amount > 0 ? 'text-brand-green' : 'text-slate-500'}`}>
                  {formatCurrency(row.amount)}
                </td>
                <td className="py-3 px-4 text-slate-600">{displayDate(row.deleted_at)}</td>
                <td className="py-3 px-4 text-right">
                  <div className="flex justify-end gap-2">
                    <button onClick={() => restore(row)} className="btn-secondary py-1.5 px-2.5 text-blue-600 border-blue-200 hover:bg-blue-50">
                      <RotateCcw size={14} /> Restore
                    </button>
                    <button onClick={() => permanentDelete(row)} className="btn-danger py-1.5 px-2.5">
                      <Trash2 size={14} /> Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && visibleRows.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center py-12 text-slate-400">No deleted records</td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={8} className="text-center py-12 text-slate-400">Loading...</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
