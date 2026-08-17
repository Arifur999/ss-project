import React, { useEffect, useMemo, useState } from 'react'
import { CalendarCheckIcon as CalendarClock, CheckCircleIcon as CheckCircle2, ClipboardTextIcon as ClipboardList, CircleNotchIcon as Loader2, MegaphoneIcon as Megaphone, ChatTextIcon as MessageSquareText, FloppyDiskIcon as Save, MagnifyingGlassIcon as Search, PaperPlaneTiltIcon as Send, TrashIcon as Trash2, UsersIcon as Users, WalletIcon as Wallet, XIcon as X, XCircleIcon as XCircle } from '@phosphor-icons/react'
import toast from 'react-hot-toast'
import PageHeader from '../components/PageHeader'
import { supabase } from '../lib/supabase'
import { formatDate, roundTaka, todayISO } from '../lib/utils'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LanguageContext'
import { isLoanLenderTableMissing, mergeStoredAndLegacyLoanLenders, mergeStoredAndLoanLenders } from './loans/loanFallback'
import { getPaymentInfo } from '../services/admin.services'
import {
  getSmsPackages,
  getSmsWallet,
  sendSms as sendSmsApi,
  submitSmsPurchase,
  type SmsPackage,
} from '../services/sms.services'
import { hasUnicode, readSmsTemplates, saveSmsTemplate, segmentsFor, type SmsTemplate } from '../lib/smsTemplates'
import {
  addMarketingContact,
  deleteMarketingContact,
  listMarketingContacts,
  type MarketingContact,
} from '../lib/marketingContacts'

const money = (n: number) => 'Tk ' + roundTaka(n).toLocaleString('en-US')

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
  // Hand-typed numbers that are not customers / suppliers / employees.
  const [customContacts, setCustomContacts] = useState<MarketingContact[]>([])
  const [newContactName, setNewContactName] = useState('')
  const [newContactPhone, setNewContactPhone] = useState('')
  const [addingContact, setAddingContact] = useState(false)
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState('')
  const [campaignName, setCampaignName] = useState('')
  const [templates, setTemplates] = useState<SmsTemplate[]>(() => readSmsTemplates())
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [campaigns, setCampaigns] = useState<Campaign[]>(() => readStorage(campaignStorageKey, []))
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)

  // SMS wallet + package purchase
  const [balance, setBalance] = useState<number | null>(null)
  const [packages, setPackages] = useState<SmsPackage[]>([])
  const [payInfo, setPayInfo] = useState<{ bkash_number: string; bkash_qr_url: string } | null>(null)
  const [buyOpen, setBuyOpen] = useState(false)
  const [selectedPackage, setSelectedPackage] = useState<SmsPackage | null>(null)
  const [buySender, setBuySender] = useState('')
  const [buyTrx, setBuyTrx] = useState('')
  const [buying, setBuying] = useState(false)

  useEffect(() => {
    loadContacts()
    loadWallet()
    getSmsPackages().then(setPackages).catch(() => setPackages([]))
    getPaymentInfo()
      .then(info => setPayInfo({ bkash_number: info.bkash_number, bkash_qr_url: info.bkash_qr_url }))
      .catch(() => setPayInfo(null))
  }, [])

  async function loadWallet() {
    try {
      const w = await getSmsWallet()
      setBalance(w.balance)
    } catch {
      setBalance(null)
    }
  }

  async function loadContacts() {
    setLoading(true)
    try {
      const [customerRes, supplierRes, employeeRes, contactContacts, customRows] = await Promise.all([
        supabase.from('customers').select('id, name, phone, address').eq('is_active', true).order('name'),
        supabase.from('suppliers').select('id, name, company_name, phone').eq('is_active', true).order('company_name'),
        supabase.from('employees').select('*').order('join_date', { ascending: false }),
        loadBankPersonContacts(),
        // Never let the manual numbers take the rest of the contact list down
        // with them - the other four sources are the important ones.
        listMarketingContacts(user?.id).catch(() => [] as MarketingContact[]),
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

      // Hand-typed numbers join the same "Contact List" group as loan lenders.
      setCustomContacts(customRows)
      const customContactRows = customRows.map((item): Contact => ({
        id: `contact:${item.id}`,
        sourceId: item.id,
        type: 'contact',
        name: item.name,
        phone: item.phone,
        subtitle: item.note || 'Added manually',
      }))

      setContacts([...customerContacts, ...supplierContacts, ...employeeContacts, ...contactContacts, ...customContactRows])
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

  async function addCustomContact() {
    const name = newContactName.trim()
    const phone = newContactPhone.trim()
    if (!/^01[0-9]{9}$/.test(phone)) return toast.error('Enter a valid 11-digit number, e.g. 01712345678')
    if (contacts.some(contact => contact.phone === phone)) return toast.error('That number is already in the contact list')

    setAddingContact(true)
    try {
      const saved = await addMarketingContact(user?.id, { name: name || phone, phone })
      setCustomContacts(prev => [...prev, saved])
      setContacts(prev => [...prev, {
        id: `contact:${saved.id}`,
        sourceId: saved.id,
        type: 'contact',
        name: saved.name,
        phone: saved.phone,
        subtitle: saved.note || 'Added manually',
      }])
      setNewContactName('')
      setNewContactPhone('')
      // Reveal it straight away - the Contact List filter is off by default.
      setTypeFilters(prev => ({ ...prev, contact: true }))
      toast.success('Number added to the contact list')
    } catch (error: any) {
      toast.error(error?.message || 'Failed to add the number')
    } finally {
      setAddingContact(false)
    }
  }

  async function removeCustomContact(id: string) {
    try {
      await deleteMarketingContact(user?.id, id)
      setCustomContacts(prev => prev.filter(row => row.id !== id))
      setContacts(prev => prev.filter(contact => contact.id !== `contact:${id}`))
      setSelectedIds(prev => prev.filter(selected => selected !== `contact:${id}`))
      toast.success('Number removed')
    } catch (error: any) {
      toast.error(error?.message || 'Failed to remove the number')
    }
  }

  const customContactIds = useMemo(
    () => new Set(customContacts.map(row => `contact:${row.id}`)),
    [customContacts]
  )

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
  const todayKey = todayISO()
  const sentToday = campaigns
    .filter(campaign => campaign.created_at.startsWith(todayKey))
    .reduce((sum, campaign) => sum + campaign.success, 0)
  const campaignThisMonth = campaigns.filter(campaign => campaign.created_at.slice(0, 7) === todayKey.slice(0, 7)).length
  const totalSuccess = campaigns.reduce((sum, campaign) => sum + campaign.success, 0)
  const totalRecipients = campaigns.reduce((sum, campaign) => sum + campaign.recipients, 0)
  const deliveryRate = totalRecipients > 0 ? (totalSuccess / totalRecipients) * 100 : 100
  const smsCount = segmentsFor(message)
  const isUnicode = hasUnicode(message)
  // Credits this batch will cost = segments x recipients that actually have a phone.
  const estCredits = smsCount * selectedWithPhone.length
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

  async function sendSms() {
    if (selectedContacts.length === 0) return toast.error('Please select at least one recipient')
    if (!message.trim()) return toast.error('Please write an SMS message')

    const recipients = selectedWithPhone.map(c => c.phone).filter(Boolean)
    if (recipients.length === 0) return toast.error('None of the selected contacts have a phone number')

    if (balance !== null && estCredits > balance) {
      return toast.error(`Not enough SMS credits. This batch needs ${formatNum(estCredits)}, you have ${formatNum(balance)}. Please buy more.`)
    }

    setSending(true)
    try {
      const result = await sendSmsApi({ recipients, message: message.trim() })
      setBalance(result.balance)
      const campaign: Campaign = {
        id: `${Date.now()}`,
        name: campaignName.trim() || `SMS Campaign ${campaigns.length + 1}`,
        message: message.trim(),
        recipients: selectedContacts.length,
        success: result.recipients,
        failed: selectedContacts.length - result.recipients,
        status: 'Completed',
        created_at: new Date().toISOString(),
      }
      persistCampaign(campaign)
      toast.success(`SMS sent to ${formatNum(result.recipients)} recipient${result.recipients === 1 ? '' : 's'} (${formatNum(result.credits_used)} credits used)`)
      // Clear the composer so the next campaign starts fresh and the same
      // message can't be fired twice by accident.
      setMessage('')
      setCampaignName('')
      setSelectedTemplate('')
      setSelectedIds([])
    } catch (error: any) {
      toast.error(error?.message || 'Failed to send SMS')
    } finally {
      setSending(false)
    }
  }

  async function confirmBuy() {
    if (!selectedPackage) return
    if (!/^01[0-9]{9}$/.test(buySender.trim())) return toast.error('Enter the valid 11-digit bKash number you paid from')
    if (buyTrx.trim().length < 6) return toast.error('Enter the bKash transaction ID')
    setBuying(true)
    try {
      await submitSmsPurchase({ package_id: selectedPackage.id, sender_number: buySender.trim(), trx_id: buyTrx.trim() })
      toast.success('Purchase submitted! Credits will be added once the admin approves your payment.')
      setBuyOpen(false)
      setSelectedPackage(null)
      setBuySender('')
      setBuyTrx('')
    } catch (error: any) {
      toast.error(error?.message || 'Failed to submit purchase')
    } finally {
      setBuying(false)
    }
  }

  // Templates are now identified by the Campaign Name: saving stores the name +
  // message, and picking a template fills both back in. These are shared with
  // the Loan dashboard's "send SMS" action.
  function saveTemplate() {
    const name = campaignName.trim()
    const text = message.trim()
    if (!name) return toast.error('Enter a Campaign Name to save this template')
    if (!text) return toast.error('Write a message first')
    const next = saveSmsTemplate(name, text)
    setTemplates(next)
    setSelectedTemplate(name)
    toast.success(`Template "${name}" saved`)
  }

  function clearComposer() {
    setMessage('')
    setCampaignName('')
    setSelectedTemplate('')
  }

  const statCards = [
    { title: 'SMS Balance', value: balance === null ? '...' : formatNum(balance), subtitle: 'Credits left in your wallet', icon: <Wallet size={22} />, tone: 'bg-slate-900 text-white' },
    { title: 'Total Contacts', value: contacts.length, subtitle: 'Customers, suppliers, employees, contacts', icon: <Users size={22} />, tone: 'bg-slate-100 text-slate-700' },
    { title: 'Selected Recipients', value: selectedContacts.length, subtitle: `${selectedWithPhone.length} with phone number`, icon: <ClipboardList size={22} />, tone: 'bg-neutral-100 text-navy-900' },
    { title: 'SMS Sent Today', value: sentToday, subtitle: 'Saved campaign count', icon: <Send size={22} />, tone: 'bg-brand-blue-soft text-brand-blue' },
    { title: 'Campaigns This Month', value: campaignThisMonth, subtitle: 'SMS campaigns only', icon: <Megaphone size={22} />, tone: 'bg-slate-100 text-slate-700' },
    { title: 'Delivery Rate', value: `${deliveryRate.toFixed(1)}%`, subtitle: 'Phone-ready recipients', icon: <CheckCircle2 size={22} />, tone: 'bg-slate-100 text-slate-700' },
  ]

  return (
    <div className="min-h-screen bg-white p-6">
      <PageHeader
        title="Marketing"
        subtitle="Send SMS campaigns to customers, suppliers, employees and contact list"
        actions={
          <button
            type="button"
            onClick={() => setBuyOpen(true)}
            className="btn-primary"
          >
            <MessageSquareText size={16} /> Buy SMS
          </button>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
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
            </div>
            <select className="input mt-3" value={contactFilter} onChange={e => setContactFilter(e.target.value as any)}>
              <option value="all">All Contacts</option>
              <option value="selected">Selected Contacts</option>
              <option value="with_phone">With Phone Number</option>
            </select>

            {/* Numbers that are not in the system at all - typed in by hand and
                kept alongside the rest of the Contact List. */}
            <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-xs font-bold text-slate-700">Add a number manually</p>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <input
                  value={newContactName}
                  onChange={e => setNewContactName(e.target.value)}
                  placeholder="Name (optional)"
                  className="input"
                />
                <input
                  value={newContactPhone}
                  onChange={e => setNewContactPhone(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomContact() } }}
                  placeholder="01712345678"
                  inputMode="numeric"
                  className="input"
                />
                <button
                  type="button"
                  onClick={addCustomContact}
                  disabled={addingContact}
                  className="btn-primary whitespace-nowrap px-4 disabled:opacity-60"
                >
                  {addingContact ? 'Adding...' : 'Add'}
                </button>
              </div>
              {customContacts.length > 0 && (
                <p className="mt-2 text-[11px] font-medium text-slate-500">
                  {formatNum(customContacts.length)} number{customContacts.length === 1 ? '' : 's'} added manually - they appear under Contact list.
                </p>
              )}
            </div>
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
                <div key={contact.id} className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0 hover:bg-neutral-100">
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
                  <span className={`rounded-full px-2 py-1 text-[10px] font-bold capitalize ${contact.phone ? 'bg-neutral-100 text-navy-900' : 'bg-red-50 text-brand-red'}`}>
                    {contact.type}
                  </span>
                  {/* Only hand-typed numbers can be deleted here; the rest are
                      owned by Customers / Suppliers / Employees / Loans. */}
                  {customContactIds.has(contact.id) && (
                    <button
                      type="button"
                      onClick={() => removeCustomContact(contact.sourceId)}
                      title="Remove this number"
                      className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-brand-red"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))
            ) : (
              <div className="py-12 text-center text-sm text-slate-400">No contacts found</div>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm">
            <span className="font-semibold text-slate-800">Selected: {formatNum(selectedContacts.length)}</span>
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
                  <label className="label" htmlFor="marketing-f1">Campaign Name</label>
                  <input id="marketing-f1"
                    className="input"
                    value={campaignName}
                    onChange={e => setCampaignName(e.target.value)}
                    placeholder="e.g., Eid Offer Campaign"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="marketing-f2">Select Template</label>
                  <select id="marketing-f2"
                    className="input"
                    value={selectedTemplate}
                    onChange={e => {
                      const name = e.target.value
                      setSelectedTemplate(name)
                      const tpl = templates.find(t => t.name === name)
                      if (tpl) {
                        setMessage(tpl.message)
                        setCampaignName(tpl.name)
                      }
                    }}
                  >
                    <option value="">Select Template</option>
                    {templates.map((template, index) => (
                      <option key={`${index}-${template.name}`} value={template.name}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-4">
                <label className="label" htmlFor="marketing-f3">Write your SMS message</label>
                <textarea id="marketing-f3"
                  className="input min-h-[180px] resize-none leading-6"
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="Type your SMS message here..."
                />
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs font-medium text-slate-500">
                <div className="flex flex-wrap items-center gap-4">
                  <span>{formatNum(message.length)} Characters</span>
                  <span className="rounded-md bg-green-50 px-3 py-1 font-bold text-brand-green">{formatNum(smsCount)} segment{smsCount === 1 ? '' : 's'}/SMS</span>
                  <span>{isUnicode ? '70 (Bangla) chars/segment' : '160 chars/segment'}</span>
                  {selectedWithPhone.length > 0 && (
                    <span className="rounded-md bg-slate-900 px-3 py-1 font-bold text-white">~{formatNum(estCredits)} credits</span>
                  )}
                </div>
                <span>Balance: {balance === null ? '...' : formatNum(balance)}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-4">
              <button type="button" onClick={sendSms} disabled={sending} className="btn-primary justify-center disabled:opacity-60">
                {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} {sending ? 'Sending...' : 'Send SMS'}
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
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${campaign.status === 'Completed' ? 'bg-neutral-100 text-navy-900' : 'bg-slate-100 text-slate-600'}`}>
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

      {buyOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center">
          <div className="my-8 w-full max-w-3xl rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 p-5">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Buy SMS Credits</h3>
                <p className="text-xs text-slate-500">Pick a package, pay via bKash, then submit your transaction ID.</p>
              </div>
              <button type="button" onClick={() => { setBuyOpen(false); setSelectedPackage(null) }} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">
                <X size={18} />
              </button>
            </div>

            {!selectedPackage ? (
              <div className="p-5">
                {packages.length === 0 ? (
                  <div className="py-10 text-center text-sm text-slate-400">No SMS packages available yet. Please check back later.</div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {packages.map(pkg => (
                      <button
                        key={pkg.id}
                        type="button"
                        onClick={() => setSelectedPackage(pkg)}
                        className="flex flex-col rounded-xl border border-slate-200 p-5 text-left transition-colors hover:border-slate-900 hover:shadow-sm"
                      >
                        <span className="text-xs font-black uppercase tracking-wide text-slate-400">{pkg.name}</span>
                        <span className="mt-2 text-3xl font-black text-slate-900">{formatNum(pkg.sms_count)}</span>
                        <span className="text-xs font-semibold text-slate-500">SMS credits</span>
                        <span className="mt-3 text-lg font-bold text-brand-green">{money(Number(pkg.price))}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 p-5 md:grid-cols-2">
                {/* Left: bKash payment details + QR */}
                <div className="rounded-xl border border-slate-200 p-5">
                  <p className="text-sm font-bold text-slate-900">Pay with bKash</p>
                  <div className="mt-3 flex items-baseline justify-between">
                    <span className="text-xs font-semibold text-slate-500">{selectedPackage.name} · {formatNum(selectedPackage.sms_count)} SMS</span>
                    <span className="text-xl font-black text-slate-900">{money(Number(selectedPackage.price))}</span>
                  </div>
                  <div className="mt-4 flex flex-col items-center">
                    {payInfo?.bkash_qr_url ? (
                      <img src={payInfo.bkash_qr_url} alt="bKash QR" className="aspect-square w-full max-w-[240px] rounded-lg border border-slate-200 object-contain" />
                    ) : (
                      <div className="flex aspect-square w-full max-w-[240px] items-center justify-center rounded-lg border border-dashed border-slate-300 text-xs text-slate-400">QR not set</div>
                    )}
                    <p className="mt-3 text-center text-sm text-slate-600">
                      Send money to <span className="font-black text-slate-900">{payInfo?.bkash_number || 'the admin bKash number'}</span>
                    </p>
                  </div>
                </div>

                {/* Right: submit trx */}
                <div>
                  <p className="text-sm font-bold text-slate-900">Confirm your payment</p>
                  <p className="mt-1 text-xs text-slate-500">After sending {money(Number(selectedPackage.price))} via bKash, enter the details below.</p>
                  <div className="mt-4 space-y-3">
                    <div>
                      <label className="label" htmlFor="marketing-f4">Your bKash number (paid from)</label>
                      <input id="marketing-f4" className="input" value={buySender} onChange={e => setBuySender(e.target.value)} placeholder="01XXXXXXXXX" />
                    </div>
                    <div>
                      <label className="label" htmlFor="marketing-f5">bKash Transaction ID</label>
                      <input id="marketing-f5" className="input" value={buyTrx} onChange={e => setBuyTrx(e.target.value)} placeholder="e.g. 9AB7CDE2FG" />
                    </div>
                  </div>
                  <div className="mt-5 flex gap-3">
                    <button type="button" onClick={() => setSelectedPackage(null)} className="btn-secondary flex-1 justify-center">Back</button>
                    <button type="button" onClick={confirmBuy} disabled={buying} className="btn-primary flex-1 justify-center disabled:opacity-60">
                      {buying ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} {buying ? 'Submitting...' : 'Submit'}
                    </button>
                  </div>
                  <p className="mt-3 text-[11px] text-slate-400">Credits are added to your wallet once the admin approves your payment.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
