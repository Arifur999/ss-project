import React, { useState, useEffect } from 'react'
import { Users, UserCheck, UserX, Gift, Wallet } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import PageHeader from '../../components/PageHeader'
import StatCard from '../../components/StatCard'
import { useLang } from '../../context/LanguageContext'

export default function EmployeeDashboard() {
  const { t, formatCurr } = useLang()
  const [stats, setStats] = useState({
    totalEmployees: 0,
    activeEmployees: 0,
    resignedEmployees: 0,
    totalSalary: 0,
    totalBonus: 0
  })
  const [employees, setEmployees] = useState<any[]>([])
  const [employeeSalaries, setEmployeeSalaries] = useState<{ [key: string]: { salary: number; bonus: number } }>({})

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const [empRes, txnRes] = await Promise.all([
      supabase.from('employees').select('*'),
      supabase.from('salary_transactions').select('*')
    ])

    const emps = empRes.data || []
    const txns = txnRes.data || []

    // Calculate totals across all employees
    const totalSalary = txns.reduce((s, t) => s + Number(t.amount || 0), 0)
    const totalBonus = txns.reduce((s, t) => s + Number(t.bonus || 0), 0)

    // Group transactions by employee
    const salaryByEmployee: { [key: string]: { salary: number; bonus: number } } = {}
    txns.forEach(txn => {
      if (!salaryByEmployee[txn.employee_id]) {
        salaryByEmployee[txn.employee_id] = { salary: 0, bonus: 0 }
      }
      salaryByEmployee[txn.employee_id].salary += Number(txn.amount || 0)
      salaryByEmployee[txn.employee_id].bonus += Number(txn.bonus || 0)
    })

    setEmployees(emps)
    setEmployeeSalaries(salaryByEmployee)
    setStats({
      totalEmployees: emps.length,
      activeEmployees: emps.filter(e => e.is_active).length,
      resignedEmployees: emps.filter(e => !e.is_active && e.resign_date).length,
      totalSalary,
      totalBonus
    })
  }

  const calculateWorkingDays = (employee: any) => {
    const join = new Date(employee.join_date)
    const end = employee.resign_date ? new Date(employee.resign_date) : new Date()
    const days = Math.floor((end.getTime() - join.getTime()) / (1000 * 60 * 60 * 24))
    const months = Math.floor(days / 30)
    return `${months} মাস ${days % 30} দিন`
  }

  return (
    <div className="p-6">
      <PageHeader title={t('employee_dashboardTitle')} subtitle={t('employee_dashboardSubtitle')} />

      <div className="employee-summary-grid mb-6">
        <StatCard title={t('employee_totalEmployees')} value={String(stats.totalEmployees)} icon={<Users size={18} />} color="blue" />
        <StatCard title={t('employee_resigned')} value={String(stats.resignedEmployees)} icon={<UserX size={18} />} color="red" />
        <StatCard title={t('employee_activeEmployees')} value={String(stats.activeEmployees)} icon={<UserCheck size={18} />} color="green" />
        <StatCard title={t('employee_totalSalary')} value={formatCurr(stats.totalSalary)} icon={<Wallet size={18} />} color="green" />
        <StatCard title={t('employee_totalBonus')} value={formatCurr(stats.totalBonus)} icon={<Gift size={18} />} color="blue" />
      </div>

      <div className="card overflow-x-auto p-0">
        <div className="p-4 border-b border-slate-100 font-semibold text-slate-800">{t('employee_activeEmployeeList')}</div>
        <table className="w-full min-w-[1600px] text-sm">
          <thead className="table-header">
            <tr>
              <th className="text-left py-2 px-4">#</th>
              <th className="text-left py-2 px-4">{t('common_name')}</th>
              <th className="text-left py-2 px-4">{t('common_phone')}</th>
              <th className="text-left py-2 px-4">{t('common_address')}</th>
              <th className="text-right py-2 px-4">{t('employee_totalSalary')}</th>
              <th className="text-right py-2 px-4">{t('employee_totalBonus')}</th>
              <th className="text-right py-2 px-4">{t('employee_subtotal')}</th>
              <th className="text-left py-2 px-4">{t('employee_joinDate')}</th>
              <th className="text-left py-2 px-4">{t('employee_resignDate')}</th>
              <th className="text-left py-2 px-4">Resign Note</th>
              <th className="text-right py-2 px-4">{t('employee_workingDuration')}</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((emp, index) => {
              const empSalary = employeeSalaries[emp.id] || { salary: 0, bonus: 0 }
              const subtotal = empSalary.salary + empSalary.bonus
              return (
                <tr key={emp.id} className={emp.is_active ? 'table-row' : 'table-row bg-red-50/40'}>
                  <td className="py-2.5 px-4 font-medium text-slate-500">{index + 1}</td>
                  <td className="py-2.5 px-4 font-medium">{emp.name}</td>
                  <td className="py-2.5 px-4 text-slate-500">{emp.phone || '—'}</td>
                  <td className="py-2.5 px-4 text-slate-500">{emp.address || '-'}</td>
                  <td className="py-2.5 px-4 text-right text-brand-green font-medium">{formatCurr(empSalary.salary)}</td>
                  <td className="py-2.5 px-4 text-right text-brand-blue font-medium">{formatCurr(empSalary.bonus)}</td>
                  <td className="py-2.5 px-4 text-right font-semibold">{formatCurr(subtotal)}</td>
                  <td className="py-2.5 px-4 text-slate-500">{new Date(emp.join_date).toLocaleDateString()}</td>
                  <td className="py-2.5 px-4" style={{ color: emp.resign_date ? '#dc2626' : '#64748b' }}>
                    {emp.resign_date ? new Date(emp.resign_date).toLocaleDateString() : '—'}
                  </td>
                  <td className="py-2.5 px-4 text-slate-500">{emp.notes || '-'}</td>
                  <td className="py-2.5 px-4 text-right text-slate-600">{calculateWorkingDays(emp)}</td>
                </tr>
              )
            })}
            {employees.length === 0 && <tr><td colSpan={11} className="text-center py-8 text-slate-400">{t('employee_noRecords')}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
