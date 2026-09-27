import React, { useEffect, useMemo, useState } from 'react'
import { PackageIcon as Package, MagnifyingGlassIcon as Search, ArrowUDownLeftIcon as ArrowBack } from '@phosphor-icons/react'
import toast from 'react-hot-toast'
import PageHeader from '../../components/PageHeader'
import TableScroller from '../../components/TableScroller'
import TableSkeleton from '../../components/TableSkeleton'
import Modal from '../../components/Modal'
import { NoValue } from '../../components/CellValue'
import { supabase } from '../../lib/supabase'
import { formatDate, todayISO } from '../../lib/utils'
import { filterRows } from '../../lib/searchRows'
import { useProgressiveRows } from '../../lib/useProgressiveRows'
import { useLang } from '../../context/LanguageContext'
import { useAuth } from '../../context/AuthContext'
import {
  getDamageEntries, receiveDamageItem,
  type DamageEntry, type DamageItem, type DamageReceiveResult,
} from '../../services/damage.services'
import { ACTION_LABELS, outstandingQty, RESULT_LABELS, returnsStock } from './damageRules'

type PendingLine = { entry: DamageEntry; item: DamageItem; outstanding: number }

/**
 * What is still out, and taking it back.
 *
 * Repaired and replaced goods go back on the shelf at the cost they left
 * with; scrapped ones do not go back at all and book the loss instead. The
 * form says which, before anybody picks, because those are three different
 * things happening to the accounts.
 */
export default function DamageReceive() {
  const { formatCurr, formatNum } = useLang()
  const { touchOwnerActivity } = useAuth()

  const [entries, setEntries] = useState<DamageEntry[]>([])
  const [employees, setEmployees] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  const [selected, setSelected] = useState<PendingLine | null>(null)
  const [form, setForm] = useState({
    receive_date: todayISO(),
    receiver_name: '',
    received_qty: 1,
    result: 'repaired' as DamageReceiveResult,
    notes: '',
  })

  useEffect(() => { void loadAll() }, [])

  async function loadAll() {
    try {
      setLoading(true)
      const [entryRows, employeeRes] = await Promise.all([
        getDamageEntries(['pending', 'partial']),
        supabase.from('employees').select('id, name').eq('is_active', true),
      ])
      setEntries(entryRows || [])
      setEmployees(employeeRes.data || [])
    } catch (error: any) {
      toast.error(error?.message || 'Could not load what is out')
    } finally {
      setLoading(false)
    }
  }

  // One row per line still owing something, not per entry: an entry can have
  // three products of which only one has come back.
  const pending = useMemo<PendingLine[]>(() => {
    const rows: PendingLine[] = []
    for (const entry of entries) {
      for (const item of entry.damage_items) {
        const outstanding = outstandingQty(item)
        if (outstanding > 0) rows.push({ entry, item, outstanding })
      }
    }
    return rows
  }, [entries])

  const filtered = useMemo(() => filterRows(pending, [
    (row: PendingLine) => row.entry.doc_no,
    (row: PendingLine) => row.item.product_name,
    (row: PendingLine) => row.item.product_code,
    (row: PendingLine) => row.entry.supplier_name,
  ], search), [pending, search])

  const shown = useProgressiveRows(filtered, { initial: 40, step: 40 })

  function openReceive(line: PendingLine) {
    setSelected(line)
    setForm({
      receive_date: todayISO(),
      receiver_name: '',
      received_qty: line.outstanding,
      // An entry sent out to be exchanged most often comes back replaced.
      result: line.entry.action === 'exchange' ? 'replaced' : 'repaired',
      notes: '',
    })
  }

  async function save() {
    if (!selected) return
    if (form.received_qty <= 0) return toast.error('How many came back?')
    if (form.received_qty > selected.outstanding) {
      return toast.error(`Only ${selected.outstanding} still to come back on this line`)
    }

    try {
      setSaving(true)
      await receiveDamageItem(selected.entry.id, {
        damage_item_id: selected.item.id,
        receive_date: form.receive_date,
        receiver_name: form.receiver_name,
        received_qty: form.received_qty,
        result: form.result,
        notes: form.notes,
      })
      toast.success(returnsStock(form.result) ? 'Received - back in stock' : 'Written off')
      void touchOwnerActivity(true)
      setSelected(null)
      await loadAll()
    } catch (error: any) {
      toast.error(error?.message || 'Could not save this receive')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-4 sm:p-6">
      <PageHeader title="Receive" subtitle="Goods coming back from repair, return or exchange" />

      <div className="card p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
          <div className="relative min-w-[16rem] flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="input pl-9"
              placeholder="Doc no, product or supplier"
              value={search}
              onChange={event => setSearch(event.target.value)}
            />
          </div>
          <span className="text-xs font-semibold text-slate-500">
            {formatNum(filtered.reduce((sum, row) => sum + row.outstanding, 0))} piece(s) still out
          </span>
        </div>

        <TableScroller>
          <table className="w-full min-w-[920px] text-sm">
            <thead className="table-header">
              <tr>
                <th className="px-4 py-3 text-left">Doc No</th>
                <th className="px-4 py-3 text-left">Sent</th>
                <th className="px-4 py-3 text-left">Product</th>
                <th className="px-4 py-3 text-left">For</th>
                <th className="px-4 py-3 text-right">Out</th>
                <th className="px-4 py-3 text-right">Back</th>
                <th className="px-4 py-3 text-right">Still out</th>
                <th className="px-4 py-3 text-right">Unit cost</th>
                <th className="px-4 py-3 text-center">Receive</th>
              </tr>
            </thead>
            <tbody>
              {shown.visible.map(line => (
                <tr key={line.item.id} className="table-row">
                  <td className="px-4 py-2.5 font-mono text-xs font-semibold text-slate-700">{line.entry.doc_no}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">{formatDate(line.entry.date)}</td>
                  <td className="px-4 py-2.5">
                    <p className="max-w-[16rem] truncate font-medium text-slate-800" title={line.item.product_name}>{line.item.product_name}</p>
                    <span className="font-mono text-[10px] text-slate-400">{line.item.product_code || <NoValue />}</span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{ACTION_LABELS[line.entry.action]}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatNum(line.item.qty)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-brand-green">{formatNum(line.item.received_qty)}</td>
                  <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-brand-orange">{formatNum(line.outstanding)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{formatCurr(Number(line.item.unit_cost || 0))}</td>
                  <td className="px-4 py-2.5 text-center">
                    <button className="btn-secondary !px-2.5 !py-1 text-xs" onClick={() => openReceive(line)}>
                      <ArrowBack size={14} /> Take back
                    </button>
                  </td>
                </tr>
              ))}
              {loading && <TableSkeleton rows={6} cols={9} />}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-slate-400">
                    <Package size={34} className="mx-auto mb-2 opacity-40" />
                    Nothing is out at the moment
                  </td>
                </tr>
              )}
              {shown.hasMore && (
                <tr ref={shown.sentinelRef as unknown as React.Ref<HTMLTableRowElement>}>
                  <td colSpan={9} className="py-4 text-center text-sm text-slate-400">
                    {shown.visibleCount.toLocaleString()} of {shown.total.toLocaleString()} shown
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </TableScroller>
      </div>

      <Modal isOpen={!!selected} onClose={() => setSelected(null)} title="Take goods back" size="md">
        {selected && (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3">
              <p className="font-semibold text-slate-800">{selected.item.product_name}</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {selected.entry.doc_no} &middot; {formatNum(selected.outstanding)} still out &middot; {formatCurr(Number(selected.item.unit_cost || 0))} each
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <label>
                <span className="label">Date</span>
                <input type="date" className="input" value={form.receive_date} onChange={event => setForm({ ...form, receive_date: event.target.value })} />
              </label>
              <label>
                <span className="label">How many</span>
                <input
                  type="number" min={1} max={selected.outstanding} className="input text-right"
                  value={form.received_qty}
                  onChange={event => setForm({ ...form, received_qty: Number(event.target.value) || 0 })}
                />
              </label>
            </div>

            <label className="block">
              <span className="label">What came back</span>
              <select className="input" value={form.result} onChange={event => setForm({ ...form, result: event.target.value as DamageReceiveResult })}>
                <option value="repaired">{RESULT_LABELS.repaired} - goes back in stock</option>
                <option value="replaced">{RESULT_LABELS.replaced} - a new piece, goes in stock</option>
                <option value="scrapped">{RESULT_LABELS.scrapped} - beyond saving, written off</option>
              </select>
            </label>

            {/* Said plainly before saving, because these are three different
                things happening to the books, not three words for one. */}
            <p className={`rounded-lg px-3 py-2.5 text-sm ${returnsStock(form.result) ? 'bg-green-50 text-brand-green' : 'bg-red-50 text-brand-red'}`}>
              {returnsStock(form.result)
                ? `${formatNum(form.received_qty)} piece(s) go back into sellable stock at ${formatCurr(Number(selected.item.unit_cost || 0))} each.`
                : `${formatCurr(form.received_qty * Number(selected.item.unit_cost || 0))} is written off as a loss. Nothing goes back into stock.`}
            </p>

            <div className="grid grid-cols-2 gap-4">
              <label>
                <span className="label">Received by</span>
                <input
                  className="input" list="damage-receivers" value={form.receiver_name}
                  onChange={event => setForm({ ...form, receiver_name: event.target.value })}
                  placeholder="Who took delivery"
                />
                <datalist id="damage-receivers">
                  {employees.map(row => <option key={row.id} value={row.name} />)}
                </datalist>
              </label>
              <label>
                <span className="label">Notes</span>
                <input className="input" value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} />
              </label>
            </div>

            <div className="flex gap-2">
              <button className="btn-secondary flex-1 justify-center" onClick={() => setSelected(null)} disabled={saving}>Cancel</button>
              <button className="btn-primary flex-1 justify-center" onClick={save} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
