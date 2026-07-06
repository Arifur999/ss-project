import React, { useState, useEffect, useMemo } from 'react'
import { Truck, Edit2, Trash2, Search } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatDate } from '../../lib/utils'
import PageHeader from '../../components/PageHeader'
import Modal from '../../components/Modal'
import { confirmAction } from '../../components/ConfirmDialog'
import toast from 'react-hot-toast'
import { useAuth } from '../../context/AuthContext'
import { useLang } from '../../context/LanguageContext'
import { createReceiveStockBatch } from '../../lib/fifoInventory'

interface PendingProduct {
  id: string
  purchase_id: string
  si_no: string
  product_id: string
  product_code: string
  product_name: string
  qty: number
  received_qty: number
  undelivered_qty: number
  actual_dp: number
  date: string
  supplier_name: string
  upcomingQty: number
  status: 'in_stock' | 'upcoming' | 'out_of_stock'
  durationDays: number
  durationLabel: string
  receive_date: string
  receiver_name: string
  receive_note: string
}

function isUuid(value: unknown) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export default function ReceiveProduct() {
  const { t, formatCurr } = useLang()
  const [pendingItems, setPendingItems] = useState<PendingProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [showReceiveModal, setShowReceiveModal] = useState(false)
  const [selectedItem, setSelectedItem] = useState<PendingProduct | null>(null)
  const [receiveQty, setReceiveQty] = useState(0)
  const [receiverName, setReceiverName] = useState('')
  const [receiveNote, setReceiveNote] = useState('')
  const [receiveDate, setReceiveDate] = useState(new Date().toISOString().split('T')[0])
  const [submitting, setSubmitting] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editQty, setEditQty] = useState(0)
  const [showEditModal, setShowEditModal] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'partial' | 'received'>('all')
  const { user, touchOwnerActivity } = useAuth()

  useEffect(() => {
    loadPendingItems()
  }, [user])

  async function loadPendingItems() {
    try {
      // First get all purchase items with their related data
      const { data: items, error: itemsError } = await supabase
        .from('purchase_items')
        .select('*')

      if (itemsError) throw itemsError

      if (!items || items.length === 0) {
        setPendingItems([])
        setLoading(false)
        return
      }

      // Get all purchase data
      const purchaseIds = [...new Set((items || []).map(i => i.purchase_id))]
      const { data: purchases, error: purchasesError } = await supabase
        .from('purchases')
        .select('*')
        .in('id', purchaseIds)

      if (purchasesError) throw purchasesError

      // Get all receive data
      const itemIds = (items || []).map(i => i.id)
      const { data: receives, error: receivesError } = await supabase
        .from('purchase_receives')
        .select('*')
        .in('purchase_item_id', itemIds)

      if (receivesError) throw receivesError

      // Build purchase map
      const purchaseMap: any = {}
      ;(purchases || []).forEach(p => {
        purchaseMap[p.id] = p
      })

      // Build receive totals map
      const receiveMap: any = {}
      const receiveDateMap: any = {}
      const receiveInfoMap: any = {}
      ;(receives || []).forEach(r => {
        if (!receiveMap[r.purchase_item_id]) {
          receiveMap[r.purchase_item_id] = 0
        }
        receiveMap[r.purchase_item_id] += r.received_qty || 0

        const currentDate = receiveDateMap[r.purchase_item_id]
        if (!currentDate || new Date(r.receive_date).getTime() > new Date(currentDate).getTime()) {
          receiveDateMap[r.purchase_item_id] = r.receive_date
          receiveInfoMap[r.purchase_item_id] = r
        }
      })

      // Get inventory data
      const productIds = [...new Set((items || []).map(i => i.product_id).filter(isUuid))]
      let inventories: any[] = []
      if (productIds.length > 0) {
        const { data, error: invError } = await supabase
          .from('inventory')
          .select('*')
          .in('product_id', productIds)

        if (invError) throw invError
        inventories = data || []
      }

      // Build inventory map
      const inventoryMap: any = {}
      ;(inventories || []).forEach(inv => {
        inventoryMap[inv.product_id] = inv
      })

      // Build pending items
      const pending = (items || [])
        .map((item: any) => {
          const purchase = purchaseMap[item.purchase_id]
          const totalReceived = receiveMap[item.id] || 0
          const inventory = inventoryMap[item.product_id]
          const upcomingQty = inventory?.upcoming_qty || 0
          const availableQty = inventory?.available_qty || 0

          // Determine status
          let status: 'in_stock' | 'upcoming' | 'out_of_stock' = 'out_of_stock'
          if (availableQty > 0) status = 'in_stock'
          else if (upcomingQty > 0) status = 'upcoming'

          // Calculate duration from order date to receive date. Pending rows use today.
          const orderDate = new Date(purchase?.date || new Date())
          const receiveDate = receiveDateMap[item.id]
          const endDate = receiveDate ? new Date(receiveDate) : new Date()
          const durationDays = Math.max(0, Math.floor((endDate.getTime() - orderDate.getTime()) / (1000 * 60 * 60 * 24)))
          const durationMonths = Math.floor(durationDays / 30)
          const remainingDays = durationDays % 30
          const durationStatus = totalReceived >= Number(item.qty || 0) ? 'to receive' : 'pending'
          const durationLabel = `${durationMonths} month ${remainingDays} Days ${durationStatus}`

          return {
            id: item.id,
            purchase_id: item.purchase_id,
            si_no: purchase?.si_no || '',
            product_id: item.product_id,
            product_code: item.product_code,
            product_name: item.product_name,
            qty: item.qty,
            received_qty: totalReceived,
            undelivered_qty: item.qty - totalReceived,
            actual_dp: item.actual_dp,
            date: purchase?.date || new Date().toISOString().split('T')[0],
            supplier_name: purchase?.supplier_name || '',
            upcomingQty,
            status,
            durationDays,
            durationLabel,
            receive_date: receiveInfoMap[item.id]?.receive_date || '',
            receiver_name: receiveInfoMap[item.id]?.receiver_name || '',
            receive_note: receiveInfoMap[item.id]?.notes || '',
          }
        })
        .sort((a, b) => {
          const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime()
          if (dateDiff !== 0) return dateDiff
          const siDiff = String(b.si_no || '').localeCompare(String(a.si_no || ''), undefined, { numeric: true })
          if (siDiff !== 0) return siDiff
          return String(b.id || '').localeCompare(String(a.id || ''))
        })

      setPendingItems(pending)
    } catch (error) {
      toast.error('Failed to load pending items')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  async function handleReceive() {
    if (!selectedItem || receiveQty <= 0) {
      toast.error('Please enter valid quantity')
      return
    }

    if (receiveQty > selectedItem.undelivered_qty) {
      toast.error(`Cannot receive more than ${selectedItem.undelivered_qty}`)
      return
    }

    setSubmitting(true)
    try {
      const { data: receiveRow, error } = await supabase
        .from('purchase_receives')
        .insert({
          purchase_item_id: selectedItem.id,
          purchase_id: selectedItem.purchase_id,
          receive_date: receiveDate,
          received_qty: receiveQty,
          receiver_name: receiverName,
          condition: 'good',
          notes: receiveNote,
          created_by: user?.id,
        })
        .select('id')
        .maybeSingle()

      if (error) throw error

      await supabase
        .from('purchase_items')
        .update({ received_qty: Number(selectedItem.received_qty || 0) + receiveQty })
        .eq('id', selectedItem.id)

      const { data: product } = await supabase
        .from('products')
        .select('selling_price')
        .eq('id', selectedItem.product_id)
        .maybeSingle()

      const { data: inv } = await supabase
        .from('inventory')
        .select('*')
        .eq('product_id', selectedItem.product_id)
        .maybeSingle()

      if (inv) {
        await supabase.from('inventory').update({
          available_qty: Number(inv.available_qty || 0) + receiveQty,
          upcoming_qty: Math.max(0, Number(inv.upcoming_qty || 0) - receiveQty),
          updated_at: new Date().toISOString(),
        }).eq('id', inv.id)
      } else {
        await supabase.from('inventory').insert({
          product_id: selectedItem.product_id,
          branch_id: null,
          available_qty: receiveQty,
          upcoming_qty: 0,
        })
      }

      await createReceiveStockBatch({
        productId: selectedItem.product_id,
        purchaseItemId: selectedItem.id,
        purchaseReceiveId: receiveRow?.id,
        qty: receiveQty,
        dpPrice: Number(selectedItem.actual_dp || 0),
        mrpPrice: Number(product?.selling_price || 0),
        receiveDate,
        userId: user?.id,
      })

      await supabase.from('inventory_history').insert({
        product_id: selectedItem.product_id,
        product_name: selectedItem.product_name,
        change_type: 'purchase_in',
        qty_change: receiveQty,
        reference_id: selectedItem.purchase_id,
        reference_type: 'purchase',
        notes: `Received from purchase ${selectedItem.si_no}`,
        created_by: user?.id,
      })

      // Update purchase shipping status
      const { data: allItems } = await supabase
        .from('purchase_items')
        .select('*, purchase_receives(received_qty)')
        .eq('purchase_id', selectedItem.purchase_id)

      if (allItems) {
        const allReceived = allItems.every(i => {
          const totalRcvd = (i.purchase_receives || []).reduce((sum: number, r: any) => sum + (r.received_qty || 0), 0)
          return totalRcvd >= i.qty
        })
        const someReceived = allItems.some(i => {
          const totalRcvd = (i.purchase_receives || []).reduce((sum: number, r: any) => sum + (r.received_qty || 0), 0)
          return totalRcvd > 0
        })

        const newStatus = allReceived ? 'received' : someReceived ? 'partial' : 'pending'
        await supabase
          .from('purchases')
          .update({ shipping_status: newStatus })
          .eq('id', selectedItem.purchase_id)
      }

      await touchOwnerActivity(true)
      toast.success('Product received successfully')
      setShowReceiveModal(false)
      setReceiveQty(0)
      setReceiverName('')
      setReceiveNote('')
      setReceiveDate(new Date().toISOString().split('T')[0])
      loadPendingItems()
    } catch (error) {
      toast.error('Failed to receive product')
      console.error(error)
    } finally {
      setSubmitting(false)
    }
  }

  async function deleteReceive(itemId: string) {
    setDeleting(true)
    try {
      const { error } = await supabase
        .from('purchase_receives')
        .delete()
        .eq('purchase_item_id', itemId)

      if (error) throw error

      await touchOwnerActivity(true)
      toast.success('Record deleted successfully')
      loadPendingItems()
    } catch (error) {
      toast.error('Failed to delete record')
      console.error(error)
    } finally {
      setDeleting(false)
    }
  }

  async function handleEditReceive() {
    if (editingId && editQty >= 0) {
      setSubmitting(true)
      try {
        const { error } = await supabase
          .from('purchase_items')
          .update({ received_qty: editQty })
          .eq('id', editingId)

        if (error) throw error

        await touchOwnerActivity(true)
        toast.success('Updated successfully')
        setShowEditModal(false)
        setEditingId(null)
        loadPendingItems()
      } catch (error) {
        toast.error('Failed to update')
        console.error(error)
      } finally {
        setSubmitting(false)
      }
    }
  }

  function receiveStatus(item: PendingProduct) {
    if (Number(item.undelivered_qty || 0) <= 0) return 'received'
    if (Number(item.received_qty || 0) > 0) return 'partial'
    return 'pending'
  }

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase()
    return pendingItems.filter(item => {
      const matchesSearch = !q ||
        item.si_no.toLowerCase().includes(q) ||
        item.supplier_name.toLowerCase().includes(q) ||
        item.product_name.toLowerCase().includes(q) ||
        String(item.product_code || '').toLowerCase().includes(q)
      const matchesStatus = statusFilter === 'all' || receiveStatus(item) === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [pendingItems, search, statusFilter])

  const totalPurchaseAmount = filteredItems.reduce(
    (sum, item) => sum + (Number(item.actual_dp || 0) * Number(item.qty || 0)),
    0
  )

  const statusTabs = [
    { key: 'all', label: 'All' },
    { key: 'pending', label: 'Pending' },
    { key: 'partial', label: 'Partial' },
    { key: 'received', label: 'Received' },
  ] as const

  if (loading) {
    return (
      <div className="p-6">
        <PageHeader title="Receive Products" subtitle="Receive and track all ordered products" />
        <div className="text-center py-8 text-slate-500">Loading...</div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden p-6">
      <PageHeader title="Product Received" subtitle="Product Received" />

      <div className="mb-4 flex flex-shrink-0 flex-wrap items-center gap-3">
        <div className="relative min-w-[280px] flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            className="input pl-9"
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="SI no, supplier or product name..."
          />
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
          {statusTabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={`min-w-[72px] rounded-md px-4 py-2 text-xs font-semibold transition-colors ${
                statusFilter === tab.key
                  ? 'bg-navy-800 text-white'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-navy-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 shadow-sm">
          Total Purchase: <strong className="text-brand-green">{formatCurr(totalPurchaseAmount)}</strong>
        </div>
      </div>

      <div className="card min-h-0 flex-1 overflow-auto p-0">
        <table className="w-full min-w-[1560px] text-sm">
          <thead className="table-header">
            <tr>
              <th className="w-12 px-3 py-2 text-left">#</th>
              <th className="text-left py-2 px-3">SI No</th>
              <th className="text-left py-2 px-3">Date</th>
              <th className="text-left py-2 px-3">Supplier</th>
              <th className="text-left py-2 px-3">Product</th>
              <th className="text-right py-2 px-3">Ordered</th>
              <th className="text-right py-2 px-3">Received</th>
              <th className="text-right py-2 px-3">Pending</th>
              <th className="text-right py-2 px-3">Upcoming Qty</th>
              <th className="text-center py-2 px-3">Status</th>
              <th className="text-left py-2 px-3">Receiving Date</th>
              <th className="text-left py-2 px-3">Receiver Name</th>
              <th className="text-left py-2 px-3">Note</th>
              <th className="text-center py-2 px-3">Duration (Days)</th>
              <th className="sticky right-0 min-w-[150px] bg-slate-50 px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map((item, index) => (
              <tr key={item.id} className="table-row">
                <td className="px-3 py-2.5 text-slate-400">{index + 1}</td>
                <td className="py-2.5 px-3 font-medium text-slate-700">{item.si_no}</td>
                <td className="py-2.5 px-3">{formatDate(item.date)}</td>
                <td className="py-2.5 px-3">{item.supplier_name}</td>
                <td className="py-2.5 px-3 text-sm">{item.product_name}</td>
                <td className="py-2.5 px-3 text-right font-semibold">{item.qty}</td>
                <td className="py-2.5 px-3 text-right text-green-600 font-semibold">{item.received_qty}</td>
                <td className="py-2.5 px-3 text-right font-semibold text-orange-600">{item.undelivered_qty}</td>
                <td className="py-2.5 px-3 text-right">
                  <span className={item.upcomingQty > 0 ? 'text-blue-600 font-semibold' : 'text-slate-400'}>
                    {item.upcomingQty}
                  </span>
                </td>
                <td className="py-2.5 px-3 text-center">
                  <span className={`text-xs px-2 py-1 rounded font-medium ${
                    item.undelivered_qty > 0 ? (item.received_qty > 0 ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700') : 'bg-green-100 text-green-700'
                  }`}>
                    {item.undelivered_qty > 0 ? (item.received_qty > 0 ? 'Partial' : 'Pending') : 'Received'}
                  </span>
                </td>
                <td className="py-2.5 px-3">{item.receive_date ? formatDate(item.receive_date) : '-'}</td>
                <td className="py-2.5 px-3">{item.receiver_name || '-'}</td>
                <td className="py-2.5 px-3 max-w-[220px] truncate" title={item.receive_note || ''}>{item.receive_note || '-'}</td>
                <td className="py-2.5 px-3 text-center text-slate-600">{item.durationLabel}</td>
                <td className="sticky right-0 bg-white px-3 py-2.5 text-right">
                  <div className="flex min-w-[126px] items-center justify-end gap-1">
                    {item.undelivered_qty > 0 && (
                      <button
                        onClick={() => {
                          setSelectedItem(item)
                          setReceiveQty(Math.min(item.undelivered_qty, 1))
                          setReceiverName('')
                          setReceiveNote('')
                          setShowReceiveModal(true)
                        }}
                        className="btn-secondary text-xs py-1 px-2 inline-flex items-center gap-1"
                        title="Receive product"
                      >
                        <Truck size={12} /> Receive
                      </button>
                    )}
                    <button
                      onClick={() => {
                        const receives = pendingItems.filter(p => p.id === item.id)
                        if (receives.length > 0) {
                          setEditingId(item.id)
                          setEditQty(item.received_qty)
                          setShowEditModal(true)
                        }
                      }}
                      className="bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs py-1 px-2 rounded inline-flex items-center gap-1"
                      title="Edit received quantity"
                    >
                      <Edit2 size={12} />
                    </button>
                    <button
                      onClick={async () => {
                        if (await confirmAction({ message: 'Delete this received record?' })) {
                          deleteReceive(item.id)
                        }
                      }}
                      className="bg-red-100 hover:bg-red-200 text-red-700 text-xs py-1 px-2 rounded inline-flex items-center gap-1"
                      title="Delete received record"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredItems.length === 0 && (
              <tr>
                <td colSpan={15} className="text-center py-8 text-slate-400">
                  No products found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal
        isOpen={showReceiveModal}
        onClose={() => {
          setShowReceiveModal(false)
          setReceiveNote('')
        }}
        title="Receive Product"
        size="sm"
      >
        {selectedItem && (
          <div className="space-y-4">
            <div className="bg-slate-50 p-3 rounded-lg text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-xs text-slate-500">Product</p>
                  <p className="font-medium text-slate-700">{selectedItem.product_name}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Pending Qty</p>
                  <p className="font-medium text-orange-600">{selectedItem.undelivered_qty}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Unit Price</p>
                  <p className="font-medium text-slate-700">{formatCurr(selectedItem.actual_dp)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">SI No</p>
                  <p className="font-medium text-slate-700">{selectedItem.si_no}</p>
                </div>
              </div>
            </div>

            <div>
              <label className="label">Received Quantity</label>
              <input
                type="number"
                min="1"
                max={selectedItem.undelivered_qty}
                value={receiveQty}
                onChange={e => setReceiveQty(Number(e.target.value))}
                className="input"
              />
              <p className="text-xs text-slate-500 mt-1">
                Max: {selectedItem.undelivered_qty}
              </p>
            </div>

            <div>
              <label className="label">Receiving Date</label>
              <input
                type="date"
                value={receiveDate}
                onChange={e => setReceiveDate(e.target.value)}
                className="input"
              />
            </div>

            <div>
              <label className="label">Receiver Name</label>
              <input
                type="text"
                value={receiverName}
                onChange={e => setReceiverName(e.target.value)}
                placeholder="Name"
                className="input"
              />
            </div>

            <div>
              <label className="label">Note</label>
              <textarea
                value={receiveNote}
                onChange={e => setReceiveNote(e.target.value)}
                placeholder="Note"
                className="input"
                rows={2}
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={handleReceive}
                disabled={submitting}
                className="btn-primary flex-1"
              >
                {submitting ? 'Receiving...' : 'Confirm Receive'}
              </button>
              <button
                onClick={() => {
                  setShowReceiveModal(false)
                  setReceiveNote('')
                }}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Edit Received Quantity"
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <label className="label">Received Quantity</label>
            <input
              type="number"
              min="0"
              value={editQty}
              onChange={e => setEditQty(Number(e.target.value))}
              className="input"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={handleEditReceive}
              disabled={submitting}
              className="btn-primary flex-1"
            >
              {submitting ? 'Updating...' : 'Update'}
            </button>
            <button
              onClick={() => setShowEditModal(false)}
              className="btn-secondary flex-1"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
