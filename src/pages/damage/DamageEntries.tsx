import React, { useEffect, useMemo, useState } from 'react'
import { PlusIcon as Plus, TrashIcon as Trash2, MagnifyingGlassIcon as Search, WrenchIcon as Wrench } from '@phosphor-icons/react'
import toast from 'react-hot-toast'
import PageHeader from '../../components/PageHeader'
import TableScroller from '../../components/TableScroller'
import TableSkeleton from '../../components/TableSkeleton'
import Modal from '../../components/Modal'
import SearchableSelect from '../../components/SearchableSelect'
import PeriodFilter from '../../components/PeriodFilter'
import { NoValue } from '../../components/CellValue'
import { confirmAction } from '../../components/ConfirmDialog'
import { supabase } from '../../lib/supabase'
import { formatDate, todayISO } from '../../lib/utils'
import { filterRows } from '../../lib/searchRows'
import { useProgressiveRows } from '../../lib/useProgressiveRows'
import { inPeriod, type Period } from '../../lib/periodFilter'
import { addRecycleItem } from '../../lib/recycleBin'
import { useLang } from '../../context/LanguageContext'
import { useAuth } from '../../context/AuthContext'
import {
  createDamageEntry, deleteDamageEntry, getDamageEntries,
  type DamageAction, type DamageEntry, type DamageSource,
} from '../../services/damage.services'
import { ACTION_LABELS, needsSupplier, SOURCE_LABELS, STATUS_BADGE, STATUS_LABELS } from './damageRules'

type FormItem = { product_id: string; product_code: string; product_name: string; qty: number; unit_cost: string }

const emptyItem = (): FormItem => ({ product_id: '', product_code: '', product_name: '', qty: 1, unit_cost: '' })

/**
 * Recording damage: what broke, how many, and what happens to it next.
 *
 * Saving takes the goods off sellable stock immediately - the owner's rule is
 * that the book stock must match the godown - and stores what they cost,
 * drawn FIFO from the batches. That cost is the thing the manual stock
 * adjustment this replaces could never tell anybody.
 */
export default function DamageEntries() {
  const { formatCurr, formatNum } = useLang()
  const { touchOwnerActivity } = useAuth()

  const [entries, setEntries] = useState<DamageEntry[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [search, setSearch] = useState('')
  const [period, setPeriod] = useState<Period>('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({
    date: todayISO(),
    source: 'own_stock' as DamageSource,
    action: 'repair' as DamageAction,
    supplier_id: '',
    notes: '',
  })
  const [items, setItems] = useState<FormItem[]>([emptyItem()])

  useEffect(() => { void loadAll() }, [])

  async function loadAll() {
    try {
      setLoading(true)
      const [entryRows, productRes, supplierRes] = await Promise.all([
        getDamageEntries(),
        supabase.from('products').select('id, product_code, name').eq('is_active', true),
        supabase.from('suppliers').select('id, name, company_name').eq('is_active', true),
      ])
      setEntries(entryRows || [])
      setProducts(productRes.data || [])
      setSuppliers(supplierRes.data || [])
    } catch (error: any) {
      toast.error(error?.message || 'Could not load damage entries')
    } finally {
      setLoading(false)
    }
  }

  const supplierRequired = needsSupplier(form.source, form.action)

  function resetForm() {
    setForm({ date: todayISO(), source: 'own_stock', action: 'repair', supplier_id: '', notes: '' })
    setItems([emptyItem()])
    setShowModal(false)
  }

  function pickProduct(index: number, productId: string) {
    const product = products.find(row => row.id === productId)
    setItems(current => current.map((item, position) => position === index
      ? { ...item, product_id: productId, product_code: product?.product_code || '', product_name: product?.name || '' }
      : item))
  }

  async function save() {
    const validItems = items.filter(item => item.product_id && item.qty > 0)
    if (validItems.length === 0) return toast.error('Add at least one product')
    if (supplierRequired && !form.supplier_id) {
      return toast.error('Choose the supplier this is going back to')
    }

    try {
      setSaving(true)
      const supplier = suppliers.find(row => row.id === form.supplier_id)
      await createDamageEntry({
        date: form.date,
        source: form.source,
        action: form.action,
        supplier_id: form.supplier_id || null,
        supplier_name: supplier?.name || supplier?.company_name || '',
        notes: form.notes,
        // A blank price means "work it out" - the server draws the real FIFO
        // cost off the batches, which is the normal case. A typed one wins,
        // and is the only figure there is when the batches hold nothing.
        items: validItems.map(item => ({
          product_id: item.product_id,
          product_code: item.product_code,
          product_name: item.product_name,
          qty: item.qty,
          ...(Number(item.unit_cost) > 0 ? { unit_cost: Number(item.unit_cost) } : {}),
        })),
      })
      toast.success('Damage recorded - stock updated')
      void touchOwnerActivity(true)
      resetForm()
      await loadAll()
    } catch (error: any) {
      toast.error(error?.message || 'Could not save this entry')
    } finally {
      setSaving(false)
    }
  }

  async function removeEntry(entry: DamageEntry) {
    const ok = await confirmAction({
      message: `Delete ${entry.doc_no}? The stock it took will go back where it came from.`,
    })
    if (!ok) return

    const value = entry.damage_items.reduce((sum, item) => sum + Number(item.total_cost || 0), 0)
    addRecycleItem({
      type: 'damage',
      title: entry.doc_no,
      subtitle: entry.supplier_name || SOURCE_LABELS[entry.source],
      amount: value,
      data: entry as unknown as Record<string, unknown>,
    })

    try {
      await deleteDamageEntry(entry.id)
      toast.success('Entry deleted')
      await loadAll()
    } catch (error: any) {
      toast.error(error?.message || 'Could not delete this entry')
    }
  }

  const filtered = useMemo(() => {
    const byPeriod = entries.filter(entry => inPeriod(String(entry.date || ''), period, fromDate, toDate))
    return filterRows(byPeriod, [
      (row: DamageEntry) => row.doc_no,
      (row: DamageEntry) => row.supplier_name,
      (row: DamageEntry) => row.damage_items.map(item => item.product_name).join(' '),
    ], search)
  }, [entries, search, period, fromDate, toDate])

  const shown = useProgressiveRows(filtered, { initial: 40, step: 40 })

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        title="Repair / Return / Change"
        subtitle="Record what broke, and what happens to it next"
        actions={<button className="btn-primary" onClick={() => setShowModal(true)}><Plus size={16} /> Record damage</button>}
      />

      <div className="card p-0">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 p-4">
          <div className="relative min-w-[16rem] flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="input pl-9"
              placeholder="Doc no, supplier or product"
              value={search}
              onChange={event => setSearch(event.target.value)}
            />
          </div>
          <PeriodFilter
            period={period} setPeriod={setPeriod}
            from={fromDate} setFrom={setFromDate}
            to={toDate} setTo={setToDate}
          />
        </div>

        <TableScroller>
          <table className="w-full min-w-[980px] text-sm">
            <thead className="table-header">
              <tr>
                <th className="px-4 py-3 text-left">Doc No</th>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Products</th>
                <th className="px-4 py-3 text-right">Qty</th>
                <th className="px-4 py-3 text-right">Value out</th>
                <th className="px-4 py-3 text-left">Source</th>
                <th className="px-4 py-3 text-left">Action</th>
                <th className="px-4 py-3 text-left">Supplier</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-center">Delete</th>
              </tr>
            </thead>
            <tbody>
              {shown.visible.map(entry => {
                const qty = entry.damage_items.reduce((sum, item) => sum + Number(item.qty || 0), 0)
                const value = entry.damage_items.reduce((sum, item) => sum + Number(item.total_cost || 0), 0)
                return (
                  <tr key={entry.id} className="table-row">
                    <td className="px-4 py-2.5 font-mono text-xs font-semibold text-slate-700">{entry.doc_no}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{formatDate(entry.date)}</td>
                    <td className="px-4 py-2.5">
                      <p className="max-w-[18rem] truncate" title={entry.damage_items.map(item => item.product_name).join(', ')}>
                        {entry.damage_items.map(item => item.product_name).join(', ') || <NoValue />}
                      </p>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatNum(qty)}</td>
                    {/* What the goods cost, drawn FIFO - not the list DP. */}
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-slate-800">{formatCurr(value)}</td>
                    <td className="px-4 py-2.5 text-slate-600">{SOURCE_LABELS[entry.source]}</td>
                    <td className="px-4 py-2.5 text-slate-600">{ACTION_LABELS[entry.action]}</td>
                    <td className="px-4 py-2.5 text-slate-600">{entry.supplier_name || <NoValue />}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_BADGE[entry.status]}`}>
                        {STATUS_LABELS[entry.status]}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <button
                        onClick={() => removeEntry(entry)}
                        className="text-slate-400 transition-colors hover:text-brand-red"
                        title="Delete entry"
                        aria-label="Delete entry"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                )
              })}
              {loading && <TableSkeleton rows={6} cols={10} />}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-10 text-center text-slate-400">
                    <Wrench size={34} className="mx-auto mb-2 opacity-40" />
                    Nothing damaged in this period
                  </td>
                </tr>
              )}
              {shown.hasMore && (
                <tr ref={shown.sentinelRef as unknown as React.Ref<HTMLTableRowElement>}>
                  <td colSpan={10} className="py-4 text-center text-sm text-slate-400">
                    {shown.visibleCount.toLocaleString()} of {shown.total.toLocaleString()} shown
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </TableScroller>
      </div>

      <Modal isOpen={showModal} onClose={resetForm} title="Record damage" size="xl">
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <label>
              <span className="label">Date</span>
              <input type="date" className="input" value={form.date} onChange={event => setForm({ ...form, date: event.target.value })} />
            </label>
            <label>
              <span className="label">Where from</span>
              <select className="input" value={form.source} onChange={event => setForm({ ...form, source: event.target.value as DamageSource })}>
                <option value="own_stock">Own stock</option>
                <option value="supplier">Came damaged</option>
              </select>
            </label>
            <label>
              <span className="label">What next</span>
              <select className="input" value={form.action} onChange={event => setForm({ ...form, action: event.target.value as DamageAction })}>
                <option value="repair">Repair</option>
                <option value="return">Return</option>
                <option value="exchange">Change</option>
              </select>
            </label>
            <div>
              {/* Greyed out for own-stock repair by the same rule the server
                  refuses by - a showroom breakage goes to a carpenter, not a
                  supplier, and demanding one would have somebody invent one. */}
              <span className="label">
                Supplier {supplierRequired && <span className="text-brand-red">*</span>}
              </span>
              <SearchableSelect
                value={form.supplier_id}
                onChange={value => setForm({ ...form, supplier_id: value })}
                options={suppliers.map(row => ({ value: row.id, label: row.name || row.company_name }))}
                placeholder={supplierRequired ? 'Choose a supplier' : 'Not needed'}
              />
            </div>
          </div>

          <div className="card p-0">
            <table className="w-full text-sm">
              <thead className="table-header">
                <tr>
                  <th className="px-3 py-2.5 text-left">Product</th>
                  <th className="px-3 py-2.5 text-right w-24">Qty</th>
                  <th className="px-3 py-2.5 text-right w-36">Unit cost</th>
                  <th className="px-3 py-2.5 text-center w-14"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={index} className="border-b border-slate-50">
                    <td className="px-3 py-2">
                      <SearchableSelect
                        value={item.product_id}
                        onChange={value => pickProduct(index, value)}
                        options={products.map(row => ({ value: row.id, label: `${row.name} (${row.product_code})` }))}
                        placeholder="Choose a product"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={1}
                        className="input text-right"
                        value={item.qty}
                        onChange={event => setItems(current => current.map((row, position) =>
                          position === index ? { ...row, qty: Number(event.target.value) || 0 } : row))}
                      />
                    </td>
                    <td className="px-3 py-2">
                      {/* Optional on purpose. Left alone it is drawn FIFO from
                          the batches, which is the figure worth trusting;
                          typing one is for the case where the batches hold
                          nothing to draw from. */}
                      <input
                        type="number"
                        min={0}
                        className="input text-right"
                        placeholder="Auto"
                        value={item.unit_cost}
                        onChange={event => setItems(current => current.map((row, position) =>
                          position === index ? { ...row, unit_cost: event.target.value } : row))}
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        onClick={() => setItems(current => current.length === 1 ? [emptyItem()] : current.filter((_, position) => position !== index))}
                        className="text-slate-400 transition-colors hover:text-brand-red"
                        title="Clear this line"
                        aria-label="Clear this line"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="p-3">
              <button className="btn-secondary" onClick={() => setItems(current => [...current, emptyItem()])}>
                <Plus size={15} /> Add row
              </button>
            </div>
          </div>

          <label className="block">
            <span className="label">Notes</span>
            <input className="input" value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} placeholder="What happened" />
          </label>

          <p className="rounded-lg bg-brand-blue-soft px-3 py-2.5 text-sm text-brand-blue">
            Saving takes these off sellable stock straight away. Leave the unit cost blank and it is worked out from what you actually paid for that stock.
          </p>

          <div className="flex gap-2">
            <button className="btn-secondary flex-1 justify-center" onClick={resetForm} disabled={saving}>Cancel</button>
            <button className="btn-primary flex-1 justify-center" onClick={save} disabled={saving}>
              {saving ? 'Saving...' : 'Record damage'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
