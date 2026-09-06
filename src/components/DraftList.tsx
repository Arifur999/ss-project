import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowSquareOutIcon as Open, TrashIcon as Trash2 } from '@phosphor-icons/react'
import toast from 'react-hot-toast'
import PageHeader from './PageHeader'
import TableSkeleton from './TableSkeleton'
import { NoValue } from './CellValue'
import { confirmAction } from './ConfirmDialog'
import { useLang } from '../context/LanguageContext'
import { formatDate } from '../lib/utils'
import { deleteDraft, getDrafts, type Draft, type DraftKind } from '../services/draft.services'

/**
 * The parked orders of one kind, newest first.
 *
 * Both draft pages are the same list with different words, so they share this
 * rather than each keeping its own copy of a table that has to stay in step.
 *
 * Opening one hands the id to the form page in the query string rather than in
 * router state: state dies on refresh, and a reopened draft is exactly the
 * thing somebody will hit F5 on.
 */
export default function DraftList({
  kind,
  title,
  subtitle,
  nameLabel,
  referenceLabel,
  formPath,
}: {
  kind: DraftKind
  title: string
  subtitle: string
  nameLabel: string
  referenceLabel: string
  formPath: string
}) {
  const { formatCurr } = useLang()
  const navigate = useNavigate()
  const [rows, setRows] = useState<Draft[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind])

  async function load() {
    try {
      setLoading(true)
      setRows(await getDrafts(kind))
    } catch (error: any) {
      toast.error(error?.message || 'Could not load drafts')
    } finally {
      setLoading(false)
    }
  }

  async function removeDraft(row: Draft) {
    if (deletingId) return
    if (!(await confirmAction({
      title: 'Delete this draft?',
      message: `${row.title || 'This draft'} will be thrown away. Nothing that was ordered or sold is affected - a draft has never reached your stock or your accounts.`,
      confirmText: 'Yes, Delete',
      cancelText: 'Cancel',
    }))) return

    try {
      setDeletingId(row.id)
      await deleteDraft(row.id)
      setRows(current => current.filter(item => item.id !== row.id))
      toast.success('Draft deleted')
    } catch (error: any) {
      toast.error(error?.message || 'Could not delete the draft')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader title={title} subtitle={subtitle} />

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="table-header">
            <tr>
              <th className="text-left py-3 px-4 w-12">#</th>
              <th className="text-left py-3 px-4">{nameLabel}</th>
              <th className="text-left py-3 px-4">{referenceLabel}</th>
              <th className="text-right py-3 px-4">Amount</th>
              <th className="text-left py-3 px-4">Last edited by</th>
              <th className="text-left py-3 px-4">Last edited</th>
              <th className="text-right py-3 px-4">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading && <TableSkeleton rows={5} cols={7} />}
            {!loading && rows.map((row, index) => (
              <tr key={row.id} className="table-row">
                <td className="py-3 px-4 text-slate-400">{index + 1}</td>
                <td className="py-3 px-4 font-medium text-slate-800">{row.title || <NoValue />}</td>
                <td className="py-3 px-4 font-mono text-xs text-slate-600">{row.subtitle || <NoValue />}</td>
                <td className="py-3 px-4 text-right font-semibold text-slate-800">{formatCurr(Number(row.amount || 0))}</td>
                <td className="py-3 px-4 text-slate-600">{row.updated_by_name || row.created_by_name || <NoValue />}</td>
                <td className="py-3 px-4 text-slate-500">{formatDate(row.updated_at)}</td>
                <td className="py-3 px-4">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => navigate(`${formPath}?draft=${row.id}`)}
                      className="btn-secondary px-3 py-1.5 text-xs"
                      title="Open this draft and carry on"
                    >
                      <Open size={14} /> Open
                    </button>
                    <button
                      onClick={() => removeDraft(row)}
                      disabled={deletingId === row.id}
                      className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-brand-red disabled:cursor-not-allowed disabled:opacity-40"
                      title="Delete this draft"
                      aria-label={`Delete draft ${row.title || row.subtitle}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-400">
                  Nothing parked here. Anything saved as a draft shows up in this list.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
