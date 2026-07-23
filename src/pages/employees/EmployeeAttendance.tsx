import React, { useState, useEffect, useMemo } from 'react'
import { Plus, Edit2, Trash2, Download } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatDate } from '../../lib/utils'
import PageHeader from '../../components/PageHeader'
import Modal from '../../components/Modal'
import { confirmAction } from '../../components/ConfirmDialog'
import toast from 'react-hot-toast'
import { useLang } from '../../context/LanguageContext'
import { addRecycleItem } from '../../lib/recycleBin'

export default function EmployeeAttendance() {
  const { t } = useLang()
  const [attendance, setAttendance] = useState<any[]>([])
  const [employees, setEmployees] = useState<any[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [employeeFilter, setEmployeeFilter] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [form, setForm] = useState({
    employee_id: '',
    date: new Date().toISOString().split('T')[0],
    present: true,
    start_time: '',
    end_time: '',
    total_hours: 0,
    notes: ''
  })

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    const [attRes, empRes] = await Promise.all([
      supabase.from('attendance').select('*').order('date', { ascending: false }),
      supabase.from('employees').select('*').eq('is_active', true).order('name')
    ])
    setAttendance(attRes.data || [])
    setEmployees(empRes.data || [])
  }

  async function save() {
    if (!form.employee_id) { toast.error(t('employee_fillRequired')); return }

    const startTime = normalizeTimeForDatabase(form.start_time)
    const endTime = normalizeTimeForDatabase(form.end_time)
    const totalHours = calculateTotalHours(startTime || '', endTime || '')
    const basePayload = {
      employee_id: form.employee_id,
      date: form.date,
      present: form.present,
      notes: form.notes || ''
    }
    const payload = {
      ...basePayload,
      start_time: startTime,
      end_time: endTime,
      total_hours: String(Number.isFinite(totalHours) ? totalHours : 0),
    }

    let savedWithLegacySchema = false

    if (editingId) {
      const { error } = await supabase.from('attendance').update(payload).eq('id', editingId)
      if (error) {
        savedWithLegacySchema = await saveWithLegacyAttendanceSchema(error, basePayload, startTime, endTime, totalHours)
        if (!savedWithLegacySchema) return
      }
      if (!savedWithLegacySchema) toast.success(t('common_updated'))
    } else {
      const { error } = await supabase.from('attendance').insert([payload])
      if (error) {
        savedWithLegacySchema = await saveWithLegacyAttendanceSchema(error, basePayload, startTime, endTime, totalHours)
        if (!savedWithLegacySchema) return
      }
      if (!savedWithLegacySchema) toast.success(t('common_created'))
    }
    resetForm()
    await loadAll()
  }

  async function saveWithLegacyAttendanceSchema(
    originalError: any,
    basePayload: { employee_id: string; date: string; present: boolean; notes: string },
    startTime: string | null,
    endTime: string | null,
    totalHours: number
  ) {
    console.error('Attendance save failed:', originalError)

    if (!isAttendanceShiftSchemaError(originalError)) {
      toast.error(originalError.message || 'Could not save attendance')
      return false
    }

    const shiftNotes = [
      basePayload.notes,
      startTime ? `Start Time: ${formatTime(startTime)}` : '',
      endTime ? `End Time: ${formatTime(endTime)}` : '',
      Number.isFinite(totalHours) && totalHours > 0 ? `Total Hours: ${formatTotalHours(totalHours)}` : '',
    ].filter(Boolean).join('\n')

    const legacyPayload = {
      ...basePayload,
      notes: shiftNotes
    }

    const query = editingId
      ? supabase.from('attendance').update(legacyPayload).eq('id', editingId)
      : supabase.from('attendance').insert([legacyPayload])
    const { error } = await query

    if (error) {
      console.error('Attendance legacy save failed:', error)
      toast.error(error.message || 'Could not save attendance')
      return false
    }

    toast('Attendance saved. Run the latest attendance migration to save shift time columns.')
    return true
  }

  function isAttendanceShiftSchemaError(error: any) {
    const message = String(error?.message || error?.details || '').toLowerCase()
    return error?.code === 'PGRST204'
      || message.includes('start_time')
      || message.includes('end_time')
      || message.includes('total_hours')
      || message.includes('schema cache')
  }

  function editAttendance(att: any) {
    const display = getAttendanceDisplay(att)
    const startTime = normalizeTimeForInput(display.start_time)
    const endTime = normalizeTimeForInput(display.end_time)
    setEditingId(att.id)
    setForm({
      employee_id: att.employee_id,
      date: att.date,
      present: att.present,
      start_time: startTime,
      end_time: endTime,
      total_hours: Number(att.total_hours || calculateTotalHours(startTime, endTime) || 0),
      notes: display.notes
    })
    setShowModal(true)
  }

  async function deleteAttendance(id: string) {
    if (!(await confirmAction({
      title: 'Delete Attendance Record?',
      message: 'Are you sure you want to permanently delete this attendance entry?',
      confirmText: 'Yes, Delete',
      cancelText: 'No, Cancel',
    }))) return
    const attendanceRow = attendance.find(att => att.id === id)
    const employee = employees.find(emp => emp.id === attendanceRow?.employee_id)
    if (attendanceRow) {
      addRecycleItem({
        type: 'employees',
        table: 'attendance',
        title: employee?.name || '-',
        subtitle: attendanceRow.date || '-',
        amount: 0,
        data: attendanceRow,
      })
    }
    const { error } = await supabase.from('attendance').delete().eq('id', id)
    if (error) { toast.error(error.message || t('common_error')); return }
    toast.success(t('common_deleted'))
    loadAll()
  }

  function resetForm() {
    setEditingId(null)
    setForm({ employee_id: '', date: new Date().toISOString().split('T')[0], present: true, start_time: '', end_time: '', total_hours: 0, notes: '' })
    setShowModal(false)
  }

  function calculateTotalHours(startTime: string, endTime: string) {
    const startTotalMinutes = parseTimeToMinutes(startTime)
    const endTotalMinutes = parseTimeToMinutes(endTime)
    if (startTotalMinutes === null || endTotalMinutes === null) return 0

    let diffMinutes = endTotalMinutes - startTotalMinutes
    if (diffMinutes < 0) diffMinutes += 24 * 60
    return Math.round((diffMinutes / 60) * 100) / 100
  }

  function formatTotalHours(hours: number) {
    const safeHours = Number.isFinite(hours) ? Math.max(0, hours) : 0
    if (!safeHours) return '0 Hours'
    const wholeHours = Math.floor(safeHours)
    const minutes = Math.round((safeHours - wholeHours) * 60)
    if (minutes === 0) return `${wholeHours} ${wholeHours === 1 ? 'Hour' : 'Hours'}`
    if (wholeHours === 0) return `${minutes} Min`
    return `${wholeHours} ${wholeHours === 1 ? 'Hour' : 'Hours'} ${minutes} Min`
  }

  function updateShiftTime(field: 'start_time' | 'end_time', value: string) {
    setForm(current => {
      const next = { ...current, [field]: value }
      return {
        ...next,
        total_hours: calculateTotalHours(next.start_time, next.end_time)
      }
    })
  }

  function formatTime(value: string) {
    const totalMinutes = parseTimeToMinutes(value)
    if (totalMinutes === null) return '-'
    const date = new Date()
    date.setHours(Math.floor(totalMinutes / 60), totalMinutes % 60, 0, 0)
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  }

  function parseTimeToMinutes(value: string | null | undefined) {
    const rawValue = String(value || '').trim()
    if (!rawValue) return null

    const amPmMatch = rawValue.match(/\s*(AM|PM)$/i)
    const timeValue = rawValue.replace(/\s*(AM|PM)$/i, '').trim()
    const parts = timeValue.split(':')
    if (parts.length < 2) return null

    let hour = Number(parts[0])
    const minute = Number(parts[1])
    if (!Number.isFinite(hour) || !Number.isFinite(minute) || minute < 0 || minute > 59) return null

    if (amPmMatch) {
      const period = amPmMatch[1].toUpperCase()
      if (hour < 1 || hour > 12) return null
      if (hour === 12) hour = 0
      if (period === 'PM') hour += 12
    } else if (hour < 0 || hour > 23) {
      return null
    }

    return hour * 60 + minute
  }

  function normalizeTimeForInput(value: string | null | undefined) {
    const totalMinutes = parseTimeToMinutes(value)
    if (totalMinutes === null) return ''
    const hour = Math.floor(totalMinutes / 60)
    const minute = totalMinutes % 60
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  }

  function normalizeTimeForDatabase(value: string | null | undefined) {
    return normalizeTimeForInput(value) || null
  }

  function parseLegacyAttendanceNotes(notes: string | null | undefined) {
    const text = String(notes || '')
    const startMatch = text.match(/Start Time:\s*(.*?)(?=\s*End Time:|\s*Total Hours:|$)/i)
    const endMatch = text.match(/End Time:\s*(.*?)(?=\s*Start Time:|\s*Total Hours:|$)/i)
    const totalMatch = text.match(/Total Hours:\s*(.*?)(?=\s*Start Time:|\s*End Time:|$)/i)
    const metadataIndexes = ['Start Time:', 'End Time:', 'Total Hours:']
      .map(label => text.toLowerCase().indexOf(label.toLowerCase()))
      .filter(index => index >= 0)
    const firstMetadataIndex = metadataIndexes.length ? Math.min(...metadataIndexes) : -1

    return {
      start_time: normalizeTimeForInput(startMatch?.[1]),
      end_time: normalizeTimeForInput(endMatch?.[1]),
      total_hours_label: totalMatch?.[1]?.trim() || '',
      notes: firstMetadataIndex >= 0 ? text.slice(0, firstMetadataIndex).trim() : text.trim()
    }
  }

  function getAttendanceDisplay(att: any) {
    const legacy = parseLegacyAttendanceNotes(att.notes)
    const startTime = normalizeTimeForInput(att.start_time) || legacy.start_time
    const endTime = normalizeTimeForInput(att.end_time) || legacy.end_time
    const numericHours = Number(att.total_hours)
    const calculatedHours = calculateTotalHours(startTime, endTime)
    const hasStoredHours = Number.isFinite(numericHours) && numericHours > 0

    return {
      start_time: startTime,
      end_time: endTime,
      total_hours_label: hasStoredHours
        ? formatTotalHours(numericHours)
        : legacy.total_hours_label || formatTotalHours(calculatedHours),
      notes: legacy.notes
    }
  }

  const employeeById = useMemo(() => {
    return employees.reduce((map, employee) => {
      map[employee.id] = employee
      return map
    }, {} as Record<string, any>)
  }, [employees])

  const filteredAttendance = useMemo(() => {
    return attendance.filter(att => {
      if (employeeFilter && att.employee_id !== employeeFilter) return false
      if (fromDate && att.date < fromDate) return false
      if (toDate && att.date > toDate) return false
      return true
    })
  }, [attendance, employeeFilter, fromDate, toDate])

  const presentCount = filteredAttendance.filter(a => a.present).length
  const absentCount = filteredAttendance.filter(a => !a.present).length
  const totalDays = filteredAttendance.length

  function pdfEscape(value: any) {
    return String(value ?? '-')
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
      .replace(/[^\x20-\x7E]/g, '?')
  }

  function pdfText(text: string, x: number, y: number, size = 10, bold = false) {
    return `BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x} ${y} Td (${pdfEscape(text)}) Tj ET\n`
  }

  function pdfLine(x1: number, y1: number, x2: number, y2: number) {
    return `0.75 w ${x1} ${y1} m ${x2} ${y2} l S\n`
  }

  function downloadAttendancePdf() {
    const pageWidth = 842
    const pageHeight = 595
    const margin = 36
    const rowHeight = 22
    const selectedEmployee = employeeFilter ? employeeById[employeeFilter]?.name || 'Selected Employee' : 'All Employees'
    const dateLabel = [fromDate || 'Start', toDate || 'End'].join(' to ')
    const headers = ['#', 'Date', 'Name', 'Phone', 'Address', 'Status', 'Start', 'End', 'Hours', 'Note']
    const colX = [margin, 60, 128, 236, 326, 438, 498, 548, 598, 650]
    let y = pageHeight - margin
    let content = ''

    content += pdfText('Employee Attendance Report', margin, y, 16, true)
    y -= 22
    content += pdfText(`Employee: ${selectedEmployee}`, margin, y, 10)
    content += pdfText(`Date: ${dateLabel}`, 410, y, 10)
    y -= 22
    content += pdfText(`Total Days: ${totalDays}`, margin, y, 11, true)
    content += pdfText(`Present Days: ${presentCount}`, 220, y, 11, true)
    content += pdfText(`Absent Days: ${absentCount}`, 420, y, 11, true)
    y -= 18
    content += pdfLine(margin, y, pageWidth - margin, y)
    y -= 18

    headers.forEach((header, index) => {
      content += pdfText(header, colX[index], y, 9, true)
    })
    y -= 8
    content += pdfLine(margin, y, pageWidth - margin, y)
    y -= 16

    filteredAttendance.forEach((att, index) => {
      if (y < 42) return
      const emp = employeeById[att.employee_id]
      const display = getAttendanceDisplay(att)
      const row = [
        String(index + 1),
        formatDate(att.date),
        emp?.name || att.employee_id || '-',
        emp?.phone || '-',
        emp?.address || '-',
        att.present ? 'Present' : 'Absent',
        formatTime(display.start_time),
        formatTime(display.end_time),
        display.total_hours_label,
        display.notes || '-',
      ]
      row.forEach((value, cellIndex) => {
        const maxLength = cellIndex === 9 ? 28 : cellIndex === 4 ? 18 : 14
        content += pdfText(String(value).slice(0, maxLength), colX[cellIndex], y, 8)
      })
      y -= rowHeight
    })

    if (filteredAttendance.length === 0) {
      content += pdfText('No records found', margin, y, 10)
    }

    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> /F2 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> >> >> /Contents 4 0 R >>`,
      `<< /Length ${content.length} >>\nstream\n${content}endstream`,
    ]
    let pdf = '%PDF-1.4\n'
    const offsets = [0]
    objects.forEach((object, index) => {
      offsets.push(pdf.length)
      pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
    })
    const xrefOffset = pdf.length
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
    offsets.slice(1).forEach(offset => {
      pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
    })
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`

    const blob = new Blob([pdf], { type: 'application/pdf' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'employee-attendance.pdf'
    link.click()
    URL.revokeObjectURL(link.href)
  }

  return (
    <div className="p-6">
      <PageHeader title={t('employee_attendanceTitle')} subtitle={t('employee_attendanceSubtitle')}
        actions={<button onClick={() => setShowModal(true)} className="btn-primary"><Plus size={16} /> {t('employee_addAttendance')}</button>}
      />

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="card"><p className="text-xs text-slate-500">Total Days</p><p className="text-2xl font-bold text-slate-700 mt-1">{totalDays}</p></div>
        <div className="card"><p className="text-xs text-slate-500">Present Days</p><p className="text-2xl font-bold text-brand-green mt-1">{presentCount}</p></div>
        <div className="card"><p className="text-xs text-slate-500">Absent Days</p><p className="text-2xl font-bold text-brand-red mt-1">{absentCount}</p></div>
      </div>

      <div className="card overflow-x-auto p-0">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="font-semibold text-slate-800">{t('employee_attendanceList')}</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[190px_150px_150px_auto]">
            <select className="input h-10" value={employeeFilter} onChange={e => setEmployeeFilter(e.target.value)}>
              <option value="">All</option>
              {employees.map(employee => (
                <option key={employee.id} value={employee.id}>{employee.name}</option>
              ))}
            </select>
            <input type="date" className="input h-10" value={fromDate} onChange={e => setFromDate(e.target.value)} />
            <input type="date" className="input h-10" value={toDate} onChange={e => setToDate(e.target.value)} />
            <button type="button" onClick={downloadAttendancePdf} className="btn-secondary h-10 justify-center">
              <Download size={15} /> PDF
            </button>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead className="table-header">
            <tr>
              <th className="text-left py-2 px-4">#</th>
              <th className="text-left py-2 px-4">{t('common_date')}</th>
              <th className="text-left py-2 px-4">{t('common_name')}</th>
              <th className="text-left py-2 px-4">{t('common_phone')}</th>
              <th className="text-left py-2 px-4">{t('common_address')}</th>
              <th className="text-center py-2 px-4">{t('employee_status')}</th>
              <th className="text-left py-2 px-4">Start Time</th>
              <th className="text-left py-2 px-4">End Time</th>
              <th className="text-left py-2 px-4">Total Hours</th>
              <th className="text-left py-2 px-4">Note</th>
              <th className="text-right py-2 px-4">Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredAttendance.map((att, index) => {
              const emp = employeeById[att.employee_id]
              const display = getAttendanceDisplay(att)
              return (
                <tr key={att.id} className="table-row">
                  <td className="py-2.5 px-4 font-medium text-slate-500">{index + 1}</td>
                  <td className="py-2.5 px-4 text-slate-500">{formatDate(att.date)}</td>
                  <td className="py-2.5 px-4 font-medium">{emp?.name || att.employee_id}</td>
                  <td className="py-2.5 px-4 text-slate-500">{emp?.phone || '-'}</td>
                  <td className="py-2.5 px-4 text-slate-500">{emp?.address || '-'}</td>
                  <td className="py-2.5 px-4 text-center">
                    <span className={`text-xs font-semibold px-2 py-1 rounded ${att.present ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {att.present ? t('employee_present') : t('employee_absent')}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-slate-500">{formatTime(display.start_time)}</td>
                  <td className="py-2.5 px-4 text-slate-500">{formatTime(display.end_time)}</td>
                  <td className="py-2.5 px-4 font-semibold text-slate-700">{display.total_hours_label}</td>
                  <td className="py-2.5 px-4 text-slate-400 text-xs">{display.notes || '-'}</td>
                  <td className="py-2.5 px-4 text-right">
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => editAttendance(att)} className="text-blue-500 hover:text-blue-600"><Edit2 size={14} /></button>
                      <button onClick={() => deleteAttendance(att.id)} className="text-red-500 hover:text-red-600"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {filteredAttendance.length === 0 && <tr><td colSpan={11} className="text-center py-8 text-slate-400">{t('employee_noRecords')}</td></tr>}
          </tbody>
        </table>
      </div>

      <Modal isOpen={showModal} onClose={resetForm} title={editingId ? t('employee_editAttendance') : t('employee_newAttendance')}>
        <div className="space-y-3">
          <div>
            <label className="label">{t('common_name')} *</label>
            <select className="input" value={form.employee_id} onChange={e => setForm({ ...form, employee_id: e.target.value })}>
              <option value="">{t('common_select')}</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div><label className="label">{t('common_date')} *</label><input type="date" className="input" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
          <div>
            <label className="label">{t('employee_status')} *</label>
            <select className="input" value={form.present ? 'present' : 'absent'} onChange={e => setForm({ ...form, present: e.target.value === 'present' })}>
              <option value="present">{t('employee_present')}</option>
              <option value="absent">{t('employee_absent')}</option>
            </select>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_140px]">
            <div>
              <label className="label">Start Time</label>
              <input
                type="time"
                className="input"
                value={form.start_time}
                onChange={e => updateShiftTime('start_time', e.target.value)}
              />
            </div>
            <div>
              <label className="label">End Time</label>
              <input
                type="time"
                className="input"
                value={form.end_time}
                onChange={e => updateShiftTime('end_time', e.target.value)}
              />
            </div>
            <div>
              <label className="label">Total Hours</label>
              <div className="flex h-10 items-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-700">
                {formatTotalHours(form.total_hours)}
              </div>
            </div>
          </div>
          <div><label className="label">{t('common_notes')}</label><textarea className="input" rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
          <div className="flex gap-2 pt-2">
            <button onClick={save} className="btn-primary flex-1 justify-center">{t('common_save')}</button>
            <button onClick={resetForm} className="btn-secondary flex-1 justify-center">{t('common_cancel')}</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
