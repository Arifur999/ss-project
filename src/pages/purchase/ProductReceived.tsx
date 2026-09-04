import React, { useState, useEffect, useMemo } from 'react'
import { TruckIcon as Truck, PencilSimpleIcon as Edit2, TrashIcon as Trash2, MagnifyingGlassIcon as Search } from '@phosphor-icons/react'
import { supabase } from '../../lib/supabase'
import { formatDate, todayISO } from '../../lib/utils'
import PageHeader from '../../components/PageHeader'
import TableScroller from '../../components/TableScroller'
import Modal from '../../components/Modal'
import { confirmAction } from '../../components/ConfirmDialog'
import { deletePurchaseItem, deletePurchaseReceive, receivePurchaseItem, setPurchaseItemReceivedQty } from '../../services/purchase.services'
import toast from 'react-hot-toast'
import { useAuth } from '../../context/AuthContext'
import { useLang } from '../../context/LanguageContext'
import TableSkeleton from '../../components/TableSkeleton'
import { useProgressiveRows } from '../../lib/useProgressiveRows'
import { NoValue } from '../../components/CellValue'

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
  const { formatCurr } = useLang()
  const [pendingItems, setPendingItems] = useState<PendingProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'partial' | 'received'>('all')
  const [showReceiveModal, setShowReceiveModal] = useState(false)
  const [selectedItem, setSelectedItem] = useState<PendingProduct | null>(null)
  const [receiveQty, setReceiveQty] = useState(0)
  const [receiverName, setReceiverName] = useState('')
  const [receiveNote, setReceiveNote] = useState('')
  const [receiveDate, setReceiveDate] = useState(todayISO())
  const [submitting, setSubmitting] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editQty, setEditQty] = useState(0)
  const [deletingId, setDeletingId] = useState<string | null>(null)
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
            date: purchase?.date || todayISO(),
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
    } catch (error: any) {
      toast.error(error?.message || 'Failed to load pending items')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }




  // Receiving a line is done from this page again. It was taken out on the
  // grounds that Purchase Orders can do it too, but this is the page that
  // lists what is still outstanding, so it is where the job gets noticed.
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
      // The backend records the receive, updates the item/inventory/FIFO batch
      // and refreshes the purchase shipping status in one transaction.
      await receivePurchaseItem(selectedItem.purchase_id, {
        purchase_item_id: selectedItem.id,
        receive_date: receiveDate,
        received_qty: receiveQty,
        receiver_name: receiverName,
        condition: 'good',
        notes: receiveNote,
      })

      await touchOwnerActivity(true)
      toast.success('Product received successfully')
      setShowReceiveModal(false)
      setReceiveQty(0)
      setReceiverName('')
      setReceiveNote('')
      setReceiveDate(todayISO())
      loadPendingItems()
    } catch (error: any) {
      // Say what the server said. A generic message with the reason only in the
      // console is why a refused receive looked like a broken app rather than an
      // input that needed fixing.
      toast.error(error?.message || 'Failed to receive product')
      console.error(error)
    } finally {
      setSubmitting(false)
    }
  }

  async function deleteReceive(itemId: string) {
    setDeletingId(itemId)
    try {
      // Reverse any received rows first - the server undoes inventory and FIFO
      // per receive - then delete the purchase line itself. Without the second
      // step a fully pending item (no receives at all) would say "deleted" and
      // stay in the list.
      const { data: receives } = await supabase
        .from('purchase_receives')
        .select('id')
        .eq('purchase_item_id', itemId)

      for (const receive of receives || []) {
        await deletePurchaseReceive(receive.id)
      }

      await deletePurchaseItem(itemId)

      await touchOwnerActivity(true)
      toast.success('Record deleted successfully')
      loadPendingItems()
    } catch (error: any) {
      toast.error(error?.message || 'Failed to delete record')
      console.error(error)
    } finally {
      setDeletingId(null)
    }
  }

  async function handleEditReceive() {
    if (!editingId || editQty < 0) return

    setSubmitting(true)
    try {
      await setPurchaseItemReceivedQty(editingId, editQty)

      await touchOwnerActivity(true)
      toast.success('Updated successfully')
      setShowEditModal(false)
      setEditingId(null)
      loadPendingItems()
    } catch (error: any) {
      toast.error(error?.message || 'Failed to update the received quantity')
      console.error(error)
    } finally {
      setSubmitting(false)
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

  // Draws a slice at a time as the reader scrolls; every row stays in
  // memory so the tabs and totals are unaffected.
  const shown = useProgressiveRows(filteredItems, { initial: 40, step: 40 })

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

  // No full-page blank: the header and the status tabs are usable straight
  // away, and only the table shows that it is still filling in.

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden p-6">
      <PageHeader title="Product Received" />

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
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-neutral-100 hover:text-navy-800'
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

      <div className="card min-h-0 flex-1 flex flex-col p-0">
        <TableScroller wrapClassName="flex min-h-0 flex-1 flex-col" className="min-h-0 flex-1 overflow-auto">
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
              <th className="sticky right-0 min-w-[150px] bg-white px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <TableSkeleton rows={8} cols={15} />}
            {shown.visible.map((item, index) => (
              <tr key={item.id} className="table-row">
                <td className="px-3 py-2.5 text-slate-400">{index + 1}</td>
                <td className="py-2.5 px-3 font-medium text-slate-700">{item.si_no}</td>
                <td className="py-2.5 px-3">{formatDate(item.date)}</td>
                <td className="py-2.5 px-3">{item.supplier_name}</td>
                <td className="py-2.5 px-3 text-sm">{item.product_name}</td>
                <td className="py-2.5 px-3 text-right font-semibold text-slate-700">{item.qty}</td>
                <td className="py-2.5 px-3 text-right font-semibold text-slate-700">{item.received_qty}</td>
                <td className="py-2.5 px-3 text-right font-semibold text-slate-700">{item.undelivered_qty}</td>
                <td className="py-2.5 px-3 text-right">
                  <span className="font-semibold text-slate-700">
                    {item.upcomingQty}
                  </span>
                </td>
                <td className="py-2.5 px-3 text-center">
                  {/* Amber is the app's "still waiting" colour - see the brand
                      palette and .badge-orange. This badge was left on Info
                      blue, the same miss the Sales Ledger's had. */}
                  <span className={`text-xs px-2 py-1 rounded font-medium ${
                    item.undelivered_qty > 0 ? (item.received_qty > 0 ? 'bg-slate-100 text-slate-700' : 'bg-brand-orange-soft text-brand-orange') : 'bg-green-100 text-green-700'
                  }`}>
                    {item.undelivered_qty > 0 ? (item.received_qty > 0 ? 'Partial' : 'Pending') : 'Received'}
                  </span>
                </td>
                <td className="py-2.5 px-3">{item.receive_date ? formatDate(item.receive_date) : <NoValue />}</td>
                <td className="py-2.5 px-3">{item.receiver_name || <NoValue />}</td>
                <td className="py-2.5 px-3 max-w-[220px] truncate" title={item.receive_note || ''}>{item.receive_note || <NoValue />}</td>
                <td className="py-2.5 px-3 text-center text-slate-600">{item.durationLabel}</td>
                <td className="sticky right-0 bg-white px-3 py-2.5 text-right">
                  <div className="flex min-w-[126px] items-center justify-end gap-1">
                    {/* Nothing left outstanding, nothing to receive. */}
                    {item.undelivered_qty > 0 && (
                      <button
                        onClick={() => {
                          setSelectedItem(item)
                          setReceiveQty(Math.min(item.undelivered_qty, 1))
                          setReceiverName('')
                          setReceiveNote('')
                          setReceiveDate(todayISO())
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
                        setEditingId(item.id)
                        setEditQty(item.received_qty)
                        setShowEditModal(true)
                      }}
                      className="bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs py-1 px-2 rounded inline-flex items-center gap-1"
                      title="Edit received quantity"
                      aria-label={`Edit received quantity for ${item.product_name}`}
                    >
                      <Edit2 size={12} />
                    </button>
                    <button
                      onClick={async () => {
                        if (await confirmAction({ message: 'Delete this received record?' })) {
                          deleteReceive(item.id)
                        }
                      }}
                      disabled={deletingId === item.id}
                      className="bg-red-100 hover:bg-red-200 text-red-700 text-xs py-1 px-2 rounded inline-flex items-center gap-1 disabled:cursor-not-allowed disabled:opacity-40"
                      title="Delete received record"
                      aria-label={`Delete received record for ${item.product_name}`}
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
            {/* Draws the next slice before the reader reaches the end. Every
                row stays loaded, so the totals above are untouched. */}
            {shown.hasMore && (
              <tr ref={shown.sentinelRef as unknown as React.Ref<HTMLTableRowElement>}>
                <td colSpan={15} className="py-4 text-center text-sm text-slate-400">
                  {shown.visibleCount.toLocaleString()} of {shown.total.toLocaleString()} shown
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </TableScroller>
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
            <div className="bg-white p-3 rounded-lg text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-xs text-slate-500">Product</p>
                  <p className="font-medium text-slate-700">{selectedItem.product_name}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Pending Qty</p>
                  <p className="font-medium text-brand-orange">{selectedItem.undelivered_qty}</p>
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
              <label className="label" htmlFor="product-received-f1">Received Quantity</label>
              <input id="product-received-f1"
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
              <label className="label" htmlFor="product-received-f2">Receiving Date</label>
              <input id="product-received-f2"
                type="date"
                value={receiveDate}
                onChange={e => setReceiveDate(e.target.value)}
                className="input"
              />
            </div>

            <div>
              <label className="label" htmlFor="product-received-f3">Receiver Name</label>
              <input id="product-received-f3"
                type="text"
                value={receiverName}
                onChange={e => setReceiverName(e.target.value)}
                placeholder="Name"
                className="input"
              />
            </div>

            <div>
              <label className="label" htmlFor="product-received-f4">Note</label>
              <textarea id="product-received-f4"
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
            <label className="label" htmlFor="product-received-f5">Received Quantity</label>
            <input id="product-received-f5"
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
