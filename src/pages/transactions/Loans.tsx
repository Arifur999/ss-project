import React, { useState, useEffect } from 'react'
import { Plus, Save } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatDate } from '../../lib/utils'
import PageHeader from '../../components/PageHeader'
import Modal from '../../components/Modal'
import toast from 'react-hot-toast'
import { useAuth } from '../../context/AuthContext'
import { useLang } from '../../context/LanguageContext'

export default function Loans() {
  const { t, formatCurr } = useLang()
  const [records, setRecords] = useState<any[]>([])
  const [accounts, setAccounts] = useState<any[]>([])
  const [showModal, setShowModal] = useState(false)
  const { user } = useAuth()
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    lender_name: '', loan_type: 'personal',
    received_amount: 0, payment_amount: 0,
    account_id: '', account_name: '', notes: ''
  })

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    const [recRes, accRes] = await Promise.all([
      supabase.from('loans').select('*').order('date', { ascending: false }),
      supabase.from('accounts').select('*').eq('is_active', true).order('sort_order'),
    ])
    setRecords(recRes.data || [])
    setAccounts(accRes.data || [])
  }

  async function save() {
    if (!form.lender_name || !form.account_id) return toast.error(t('loans_fillAllFields'))
    const acc = accounts.find(a => a.id === form.account_id)
    await supabase.from('loans').insert({ ...form, account_name: acc?.name || '', created_by: user?.id })
    toast.success(t('loans_saved'))
    setShowModal(false)
    loadAll()
  }

  const byLender: Record<string, { received: number; paid: number }> = {}
  records.forEach(r => {
    if (!byLender[r.lender_name]) byLender[r.lender_name] = { received: 0, paid: 0 }
    byLender[r.lender_name].received += Number(r.received_amount || 0)
    byLender[r.lender_name].paid += Number(r.payment_amount || 0)
  })

  const totalReceived = records.reduce((s, r) => s + Number(r.received_amount || 0), 0)
  const totalPaid = records.reduce((s, r) => s + Number(r.payment_amount || 0), 0)
  const outstanding = totalReceived - totalPaid

  return (
    <div className="p-6">
      <PageHeader title={t('loans_subtitle')} subtitle={t('loans_title')} actions={<button onClick={() => setShowModal(true)} className="btn-primary"><Plus size={16} /> {t('loans_new')}</button>} />

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="card"><p className="text-xs text-slate-500">{t('loans_totalReceived')}</p><p className="text-2xl font-bold text-brand-green mt-1">{formatCurr(totalReceived)}</p></div>
        <div className="card"><p className="text-xs text-slate-500">{t('loans_totalPaid')}</p><p className="text-2xl font-bold text-slate-800 mt-1">{formatCurr(totalPaid)}</p></div>
        <div className="card"><p className="text-xs text-slate-500">{t('loans_outstanding')}</p><p className={`text-2xl font-bold mt-1 ${outstanding > 0 ? 'text-brand-red' : 'text-brand-green'}`}>{formatCurr(outstanding)}</p></div>
      </div>

      {Object.keys(byLender).length > 0 && (
        <div className="card mb-6">
          <h3 className="font-semibold text-slate-800 mb-3">{t('loans_lenderSummary')}</h3>
          <div className="grid grid-cols-3 gap-3">
            {Object.entries(byLender).map(([name, data]) => (
              <div key={name} className="p-3 bg-slate-50 rounded-xl">
                <p className="font-semibold text-slate-800 text-sm">{name}</p>
                <div className="flex justify-between mt-2 text-xs">
                  <span className="text-slate-500">{t('loans_summaryReceived')} <span className="text-brand-green font-medium">{formatCurr(data.received)}</span></span>
                  <span className="text-slate-500">{t('loans_summaryPaid')} <span className="text-slate-800 font-medium">{formatCurr(data.paid)}</span></span>
                </div>
                <p className="text-xs mt-1 font-semibold" style={{ color: data.received - data.paid > 0 ? '#E24B4A' : '#1D9E75' }}>
                  {t('loans_summaryOutstanding')} {formatCurr(data.received - data.paid)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card overflow-x-auto p-0">
        <div className="p-4 border-b border-slate-100 font-semibold text-slate-800">{t('loans_list')}</div>
        <table className="w-full text-sm">
          <thead className="table-header">
            <tr>
              <th className="text-left py-2 px-4">{t('common_date')}</th>
              <th className="text-left py-2 px-4">{t('loans_colLender')}</th>
              <th className="text-left py-2 px-4">{t('loans_colType')}</th>
              <th className="text-right py-2 px-4">{t('loans_colReceived')}</th>
              <th className="text-right py-2 px-4">{t('loans_colPaid')}</th>
              <th className="text-left py-2 px-4">{t('invest_colAccount')}</th>
            </tr>
          </thead>
          <tbody>
            {records.map(r => (
              <tr key={r.id} className="table-row">
                <td className="py-2.5 px-4">{formatDate(r.date)}</td>
                <td className="py-2.5 px-4 font-medium">{r.lender_name}</td>
                <td className="py-2.5 px-4"><span className="badge-blue capitalize">{r.loan_type === 'personal' ? t('loans_typePersonal') : t('loans_typeBank')}</span></td>
                <td className="py-2.5 px-4 text-right text-brand-green">{r.received_amount > 0 ? formatCurr(r.received_amount) : '—'}</td>
                <td className="py-2.5 px-4 text-right text-brand-red">{r.payment_amount > 0 ? formatCurr(r.payment_amount) : '—'}</td>
                <td className="py-2.5 px-4 text-slate-500">{r.account_name}</td>
              </tr>
            ))}
            {records.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-slate-400">{t('loans_noRecords')}</td></tr>}
          </tbody>
        </table>
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={t('loans_newTitle')}>
        <div className="space-y-3">
          <div><label className="label">{t('common_date')}</label><input type="date" className="input" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
          <div><label className="label">{t('loans_lenderName')}</label><input className="input" value={form.lender_name} onChange={e => setForm({ ...form, lender_name: e.target.value })} /></div>
          <div>
            <label className="label">{t('loans_loanType')}</label>
            <select className="input" value={form.loan_type} onChange={e => setForm({ ...form, loan_type: e.target.value })}>
              <option value="personal">{t('loans_typePersonal')}</option>
              <option value="bank">{t('loans_typeBank')}</option>
            </select>
          </div>
          <div><label className="label">{t('loans_receivedAmount')}</label><input type="number" min="0" className="input" value={form.received_amount || ''} onChange={e => setForm({ ...form, received_amount: Number(e.target.value) })} /></div>
          <div><label className="label">{t('loans_paidAmount')}</label><input type="number" min="0" className="input" value={form.payment_amount || ''} onChange={e => setForm({ ...form, payment_amount: Number(e.target.value) })} /></div>
          <div>
            <label className="label">{t('invest_colAccount')}</label>
            <select className="input" value={form.account_id} onChange={e => setForm({ ...form, account_id: e.target.value })}>
              <option value="">{t('common_select')}</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div><label className="label">{t('common_note')}</label><textarea className="input" rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
          <div className="flex gap-2 pt-2">
            <button onClick={save} className="btn-primary flex-1 justify-center"><Save size={16} /> {t('common_save')}</button>
            <button onClick={() => setShowModal(false)} className="btn-secondary flex-1 justify-center">{t('common_cancel')}</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
