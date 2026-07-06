import React, { useEffect, useMemo, useState } from 'react'
import {
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Filter,
  Megaphone,
  MessageSquareText,
  Save,
  Search,
  Send,
  Trash2,
  Users,
  XCircle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import PageHeader from '../components/PageHeader'
import { supabase } from '../lib/supabase'
import { formatDate } from '../lib/utils'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LanguageContext'
import { isLoanLenderTableMissing, mergeStoredAndLegacyLoanLenders, mergeStoredAndLoanLenders } from './loans/loanFallback'

type ContactType = 'customer' | 'supplier' | 'employee' | 'contact'

type Contact = {
  id: string
  sourceId: string
  type: ContactType
  name: string
  phone: string
  subtitle?: string
}

type Campaign = {
  id: string
  name: string
  message: string
  recipients: number
  success: number
  failed: number
  status: 'Completed' | 'Scheduled'
  created_at: string
  scheduled_for?: string
}

const campaignStorageKey = 'sms_marketing_campaigns_v1'
const templateStorageKey = 'sms_marketing_templates_v1'

function readStorage<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || '') || fallback
  } catch {
    return fallback
  }
}

function writeStorage<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value))
}

function initials(name: string) {
  return (name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0])
    .join('')
    .toUpperCase()
}

export default function Marketing() {
  const { formatNum } = useLang()
  const { user, profile } = useAuth()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [typeFilters, setTypeFilters] = useState<Record<ContactType, boolean>>({
    customer: true,
    supplier: false,
    employee: false,
    contact: false,
  })
  const [contactFilter, setContactFilter] = useState<'all' | 'selected' | 'with_phone'>('all')
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState('')
  const [campaignName, setCampaignName] = useState('')
  const [scheduledFor, setScheduledFor] = useState('')
  const [templates, setTemplates] = useState<string[]>(() => readStorage(templateStorageKey, []))
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [campaigns, setCampaigns] = useState<Campaign[]>(() => readStorage(campaignStorageKey, []))
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadContacts()
  }, [])

  async function loadContacts() {
    setLoading(true)
    try {
      const [customerRes, supplierRes, employeeRes, contactContacts] = await Promise.all([
        supabase.from('customers').select('id, name, phone, address').eq('is_active', true).order('name'),
        supabase.from('suppliers').select('id, name, company_name, phone').eq('is_active', true).order('company_name'),
        supabase.from('employees').select('*').order('join_date', { ascending: false }),
        loadBankPersonContacts(),
      ])

      const customerContacts = (customerRes.data || []).map((item: any): Contact => ({
        id: `customer:${item.id}`,
        sourceId: item.id,
        type: 'customer',
        name: item.name || 'Customer',
        phone: item.phone || '',
        subtitle: item.address || 'Customer',
      }))

      const supplierContacts = (supplierRes.data || []).map((item: any): Contact => ({
        id: `supplier:${item.id}`,
        sourceId: item.id,
        type: 'supplier',
        name: item.company_name || item.name || 'Supplier',
        phone: item.phone || '',
        subtitle: item.name || 'Supplier',
      }))

      const employeeContacts = (employeeRes.data || [])
        .filter((item: any) => item.is_active !== false && !item.resign_date)
        .map((item: any): Contact => ({
          id: `employee:${item.id}`,
          sourceId: item.id,
          type: 'employee',
          name: item.name || 'Employee',
          phone: item.phone || '',
          subtitle: item.designation || item.address || 'Employee',
        }))

      setContacts([...customerContacts, ...supplierContacts, ...employeeContacts, ...contactContacts])
    } catch (error: any) {
      toast.error(error.message || 'Failed to load contacts')
    } finally {
      setLoading(false)
    }
  }

  async function loadBankPersonContacts(): Promise<Contact[]> {
    const lenderRes = await supabase
      .from('loan_lenders')
      .select('id, name, phone, lender_type, address, is_active, created_at')
      .eq('is_active', true)
      .order('name')

    if (isLoanLenderTableMissing(lenderRes.error)) {
      const legacyLoanRes = await supabase
        .from('loans')
        .select('*, loan_lenders(*)')
        .order('created_at', { ascending: false })
      return mapBankPersonContacts(mergeStoredAndLegacyLoanLenders(legacyLoanRes.data || [], true))
    }

    if (lenderRes.error) throw lenderRes.error
    return mapBankPersonContacts(mergeStoredAndLoanLenders(lenderRes.data || [], true))
  }

  function mapBankPersonContacts(items: any[]): Contact[] {
    return items.map((item: any): Contact => ({
      id: `contact:${item.id}`,
      sourceId: item.id,
      type: 'contact',
      name: item.name || 'Unnamed Contact',
      phone: item.phone || '',
      subtitle: item.lender_type || item.address || 'Contact list',
    }))
  }

  const filteredContacts = useMemo(() => {
    const query = search.trim().toLowerCase()
    return contacts.filter(contact => {
      const matchesType = typeFilters[contact.type]
      const matchesSearch = !query || [contact.name, contact.phone, contact.subtitle].some(value =>
        String(value || '').toLowerCase().includes(query)
      )
      const matchesFilter =
        contactFilter === 'all' ||
        (contactFilter === 'selected' && selectedIds.includes(contact.id)) ||
        (contactFilter === 'with_phone' && Boolean(contact.phone))
      return matchesType && matchesSearch && matchesFilter
    })
  }, [contacts, contactFilter, search, selectedIds, typeFilters])

  const selectedContacts = contacts.filter(contact => selectedIds.includes(contact.id))
  const selectedWithPhone = selectedContacts.filter(contact => contact.phone)
  const todayKey = new Date().toISOString().split('T')[0]
  const sentToday = campaigns
    .filter(campaign => campaign.created_at.startsWith(todayKey))
    .reduce((sum, campaign) => sum + campaign.success, 0)
  const campaignThisMonth = campaigns.filter(campaign => campaign.created_at.slice(0, 7) === todayKey.slice(0, 7)).length
  const totalSuccess = campaigns.reduce((sum, campaign) => sum + campaign.success, 0)
  const totalRecipients = campaigns.reduce((sum, campaign) => sum + campaign.recipients, 0)
  const deliveryRate = totalRecipients > 0 ? (totalSuccess / totalRecipients) * 100 : 100
  const smsCount = Math.max(1, Math.ceil(message.length / 160))
  const allVisibleSelected = filteredContacts.length > 0 && filteredContacts.every(contact => selectedIds.includes(contact.id))

  function toggleType(type: ContactType) {
    setTypeFilters(prev => ({ ...prev, [type]: !prev[type] }))
  }

  function toggleContact(id: string) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id])
  }

  function toggleVisibleContacts() {
    setSelectedIds(prev => {
      if (allVisibleSelected) return prev.filter(id => !filteredContacts.some(contact => contact.id === id))
      return Array.from(new Set([...prev, ...filteredContacts.map(contact => contact.id)]))
    })
  }

  function persistCampaign(next: Campaign) {
    const updated = [next, ...campaigns].slice(0, 50)
    setCampaigns(updated)
    writeStorage(campaignStorageKey, updated)
  }

  function buildCampaign(status: Campaign['status']): Campaign | null {
    if (selectedContacts.length === 0) {
      toast.error('Please select at least one recipient')
      return null
    }
    if (!message.trim()) {
      toast.error('Please write an SMS message')
      return null
    }
    if (status === 'Scheduled' && !scheduledFor) {
      toast.error('Please select schedule date and time')
      return null
    }

    const failed = selectedContacts.length - selectedWithPhone.length
    return {
      id: `${Date.now()}`,
      name: campaignName.trim() || `SMS Campaign ${campaigns.length + 1}`,
      message: message.trim(),
      recipients: selectedContacts.length,
      success: selectedWithPhone.length,
      failed,
      status,
      scheduled_for: status === 'Scheduled' ? scheduledFor : undefined,
      created_at: new Date().toISOString(),
    }
  }

  function sendSms() {
    const campaign = buildCampaign('Completed')
    if (!campaign) return
    persistCampaign(campaign)
    toast.success(`SMS campaign saved for ${formatNum(campaign.success)} recipient${campaign.success === 1 ? '' : 's'}`)
  }

  function scheduleCampaign() {
    const campaign = buildCampaign('Scheduled')
    if (!campaign) return
    persistCampaign(campaign)
    toast.success('SMS campaign scheduled')
  }

  function saveTemplate() {
    const text = message.trim()
    if (!text) return toast.error('Write a message first')
    const next = Array.from(new Set([text, ...templates])).slice(0, 20)
    setTemplates(next)
    writeStorage(templateStorageKey, next)
    setSelectedTemplate(text)
    toast.success('SMS template saved')
  }

  function clearComposer() {
    setMessage('')
    setCampaignName('')
    setScheduledFor('')
    setSelectedTemplate('')
  }

  const statCards = [
    { title: 'Total Contacts', value: contacts.length, subtitle: 'Customers, suppliers, employees, contacts', icon: <Users size={22} />, tone: 'bg-blue-50 text-blue-600' },
    { title: 'Selected Recipients', value: selectedContacts.length, subtitle: `${selectedWithPhone.length} with phone number`, icon: <ClipboardList size={22} />, tone: 'bg-green-50 text-brand-green' },
    { title: 'SMS Sent Today', value: sentToday, subtitle: 'Saved campaign count', icon: <Send size={22} />, tone: 'bg-orange-50 text-orange-600' },
    { title: 'Campaigns This Month', value: campaignThisMonth, subtitle: 'SMS campaigns only', icon: <Megaphone size={22} />, tone: 'bg-purple-50 text-purple-600' },
    { title: 'Delivery Rate', value: `${deliveryRate.toFixed(1)}%`, subtitle: 'Phone-ready recipients', icon: <CheckCircle2 size={22} />, tone: 'bg-teal-50 text-teal-600' },
  ]

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <PageHeader
        title="Marketing"
        subtitle="Send SMS campaigns to customers, suppliers, employees and contact list"
        actions={
          <button
            type="button"
            onClick={() => toast.success('SMS balance purchase flow will be connected with your SMS provider')}
            className="btn-primary"
          >
            <MessageSquareText size={16} /> Buy SMS
          </button>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {statCards.map(card => (
          <div key={card.title} className="card flex items-center gap-4">
            <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg ${card.tone}`}>
              {card.icon}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-500">{card.title}</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{typeof card.value === 'number' ? formatNum(card.value) : card.value}</p>
              <p className="mt-1 truncate text-xs text-slate-500">{card.subtitle}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(360px,0.8fr)_minmax(0,1.6fr)]">
        <section className="card p-0">
          <div className="border-b border-slate-100 p-4">
            <h2 className="text-base font-bold text-slate-900">1. Select Recipients</h2>
            <div className="mt-4 flex flex-wrap gap-4">
              {(['customer', 'supplier', 'employee', 'contact'] as ContactType[]).map(type => (
                <label key={type} className="flex items-center gap-2 text-sm font-medium capitalize text-slate-700">
                  <input
                    type="checkbox"
                    checked={typeFilters[type]}
                    onChange={() => toggleType(type)}
                    className="h-4 w-4 rounded border-slate-300 accent-brand-green"
                  />
                  {type === 'contact' ? 'Contact list' : type}
                </label>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search by name or phone..."
                  className="input pl-9"
                />
              </div>
              <button type="button" className="btn-secondary px-3" title="Filter contacts">
                <Filter size={16} />
              </button>
            </div>
            <select className="input mt-3" value={contactFilter} onChange={e => setContactFilter(e.target.value as any)}>
              <option value="all">All Contacts</option>
              <option value="selected">Selected Contacts</option>
              <option value="with_phone">With Phone Number</option>
            </select>
          </div>

          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 text-xs font-semibold text-slate-600">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={toggleVisibleContacts}
                className="h-4 w-4 rounded border-slate-300 accent-brand-green"
              />
              Select visible ({formatNum(filteredContacts.length)})
            </label>
            <span>Total: {formatNum(contacts.length)}</span>
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {loading ? (
              <div className="flex h-36 items-center justify-center">
                <div className="h-7 w-7 animate-spin rounded-full border-4 border-brand-green border-t-transparent" />
              </div>
            ) : filteredContacts.length > 0 ? (
              filteredContacts.map(contact => (
                <div key={contact.id} className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(contact.id)}
                    onChange={() => toggleContact(contact.id)}
                    className="h-4 w-4 rounded border-slate-300 accent-brand-green"
                  />
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                    {initials(contact.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-800">{contact.name}</p>
                    <p className="truncate text-xs text-slate-500">{contact.phone || 'No phone number'}</p>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-bold capitalize ${contact.phone ? 'bg-green-50 text-brand-green' : 'bg-red-50 text-brand-red'}`}>
                    {contact.type}
                  </span>
                </div>
              ))
            ) : (
              <div className="py-12 text-center text-sm text-slate-400">No contacts found</div>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm">
            <span className="font-semibold text-blue-600">Selected: {formatNum(selectedContacts.length)}</span>
            <button type="button" onClick={() => setSelectedIds([])} className="text-sm font-semibold text-brand-red hover:text-red-700">
              Clear All
            </button>
          </div>
        </section>

        <section className="space-y-6">
          <div className="card p-0">
            <div className="border-b border-slate-100 p-4">
              <h2 className="text-base font-bold text-slate-900">2. Compose SMS</h2>
              <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_260px]">
                <div>
                  <label className="label">Campaign Name</label>
                  <input
                    className="input"
                    value={campaignName}
                    onChange={e => setCampaignName(e.target.value)}
                    placeholder="e.g., Eid Offer Campaign"
                  />
                </div>
                <div>
                  <label className="label">Select Template</label>
                  <select
                    className="input"
                    value={selectedTemplate}
                    onChange={e => {
                      setSelectedTemplate(e.target.value)
                      if (e.target.value) setMessage(e.target.value)
                    }}
                  >
                    <option value="">Select Template</option>
                    {templates.map((template, index) => (
                      <option key={`${index}-${template.slice(0, 12)}`} value={template}>
                        {template.slice(0, 36)}{template.length > 36 ? '...' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-4">
                <label className="label">Write your SMS message</label>
                <textarea
                  className="input min-h-[180px] resize-none leading-6"
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="Type your SMS message here..."
                />
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs font-medium text-slate-500">
                <div className="flex flex-wrap items-center gap-4">
                  <span>{formatNum(message.length)} Characters</span>
                  <span className="rounded-md bg-green-50 px-3 py-1 font-bold text-brand-green">{formatNum(smsCount)} SMS</span>
                  <span>160 Characters/SMS</span>
                </div>
                <span>Sender ID: Hatim Furniture</span>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto]">
                <div>
                  <label className="label">Schedule Date & Time</label>
                  <input
                    type="datetime-local"
                    className="input"
                    value={scheduledFor}
                    onChange={e => setScheduledFor(e.target.value)}
                  />
                </div>
                <div className="flex items-end">
                  <button type="button" onClick={scheduleCampaign} className="btn-secondary h-10 px-4">
                    <CalendarClock size={16} /> Schedule SMS
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-4">
              <button type="button" onClick={sendSms} className="btn-primary justify-center">
                <Send size={16} /> Send SMS
              </button>
              <button type="button" onClick={saveTemplate} className="btn-secondary justify-center">
                <Save size={16} /> Save Template
              </button>
              <button type="button" onClick={clearComposer} className="btn-secondary justify-center">
                <Trash2 size={16} /> Clear
              </button>
              <button type="button" onClick={loadContacts} className="btn-secondary justify-center">
                <Users size={16} /> Refresh Contacts
              </button>
            </div>
          </div>

          <div className="card overflow-x-auto p-0">
            <div className="flex items-center justify-between border-b border-slate-100 p-4">
              <h2 className="font-bold text-slate-900">SMS Campaign History</h2>
              <span className="text-xs font-semibold text-slate-500">Last {formatNum(campaigns.length)} campaigns</span>
            </div>
            <table className="w-full min-w-[780px] text-sm">
              <thead className="table-header">
                <tr>
                  <th className="px-4 py-3 text-left">Date & Time</th>
                  <th className="px-4 py-3 text-left">Campaign Name</th>
                  <th className="px-4 py-3 text-right">Recipients</th>
                  <th className="px-4 py-3 text-right">Success</th>
                  <th className="px-4 py-3 text-right">Failed</th>
                  <th className="px-4 py-3 text-right">Delivery Rate</th>
                  <th className="px-4 py-3 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map(campaign => {
                  const rate = campaign.recipients > 0 ? (campaign.success / campaign.recipients) * 100 : 0
                  return (
                    <tr key={campaign.id} className="table-row">
                      <td className="px-4 py-3 text-slate-600">{formatDate(campaign.created_at)}</td>
                      <td className="px-4 py-3 font-semibold text-slate-800">{campaign.name}</td>
                      <td className="px-4 py-3 text-right">{formatNum(campaign.recipients)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-brand-green">{formatNum(campaign.success)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-brand-red">{formatNum(campaign.failed)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-brand-green">{rate.toFixed(1)}%</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${campaign.status === 'Completed' ? 'bg-green-50 text-brand-green' : 'bg-blue-50 text-blue-600'}`}>
                          {campaign.status === 'Completed' ? <CheckCircle2 size={13} /> : <CalendarClock size={13} />}
                          {campaign.status}
                        </span>
                      </td>
                    </tr>
                  )
                })}
                {campaigns.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-slate-400">
                      <XCircle size={34} className="mx-auto mb-2 opacity-40" />
                      No SMS campaigns yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}
