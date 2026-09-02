import React, { useEffect, useMemo, useState } from 'react'
import { CheckIcon as Check, CopyIcon as Copy, ChatTextIcon as MessageSquareText, ArrowsClockwiseIcon as RefreshCcw, PaperPlaneTiltIcon as Send, ShieldCheckIcon as ShieldCheck, DeviceMobileIcon as Smartphone, WalletIcon as Wallet } from '@phosphor-icons/react'
import toast from 'react-hot-toast'
import PageHeader from '../components/PageHeader'
import StatCard from '../components/StatCard'
import TableScroller from '../components/TableScroller'
import Modal from '../components/Modal'
import { formatDate } from '../lib/utils'
import { useLang } from '../context/LanguageContext'
import { getPaymentInfo } from '../services/admin.services'
import {
  getMySmsPurchases,
  getSmsPackages,
  getSmsWallet,
  submitSmsPurchase,
  type SmsPackage,
  type SmsPurchase,
} from '../services/sms.services'
import { NoValue } from '../components/CellValue'

// Buying credits is the same two-step manual flow as a subscription plan:
// send the money over bKash, then hand in the transaction id for the super
// admin to approve. Credits land in the wallet on approval, not on submit.
type Step = 'pay' | 'submit' | 'done'

const badgeFor = (status: string) => {
  const value = String(status).toLowerCase()
  if (value === 'paid') return 'badge-green'
  if (value === 'pending') return 'badge-orange'
  return 'badge-red'
}

export default function SmsPackages() {
  const { formatCurr, formatNum, lang } = useLang()
  const bn = lang === 'bn'

  const [packages, setPackages] = useState<SmsPackage[]>([])
  const [purchases, setPurchases] = useState<SmsPurchase[]>([])
  const [balance, setBalance] = useState<number | null>(null)
  const [payment, setPayment] = useState<{ bkash_number: string; bkash_qr_url: string } | null>(null)
  const [loading, setLoading] = useState(true)

  const [selected, setSelected] = useState<SmsPackage | null>(null)
  const [step, setStep] = useState<Step>('pay')
  const [senderNumber, setSenderNumber] = useState('')
  const [trxId, setTrxId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    // Each of these can fail on its own - no payment number configured yet, or
    // no purchases ever made. One failure must not blank out the whole page.
    const [packagesResult, purchasesResult, walletResult, paymentResult] = await Promise.allSettled([
      getSmsPackages(),
      getMySmsPurchases(),
      getSmsWallet(),
      getPaymentInfo(),
    ])

    if (packagesResult.status === 'fulfilled') setPackages(packagesResult.value || [])
    else toast.error(bn ? 'প্যাকেজ আনা যায়নি' : 'Could not load packages')

    setPurchases(purchasesResult.status === 'fulfilled' ? purchasesResult.value || [] : [])
    setBalance(walletResult.status === 'fulfilled' ? Number(walletResult.value?.balance || 0) : null)
    setPayment(paymentResult.status === 'fulfilled' ? paymentResult.value : null)
    setLoading(false)
  }

  // Super admin can retire a package; an owner should only ever see live ones.
  const availablePackages = useMemo(
    () => packages.filter(p => p.active !== false).sort((a, b) => Number(a.price) - Number(b.price)),
    [packages]
  )

  const pendingCount = purchases.filter(p => p.status === 'pending').length
  const totalSpent = purchases
    .filter(p => p.status === 'paid')
    .reduce((sum, p) => sum + Number(p.amount || 0), 0)

  // What one SMS works out to on this package. Not shown any more - rounded to
  // the taka it read "Per SMS Tk 1" on three packages and "Tk 0" on the fourth,
  // which compares nothing. It still decides which card wears the Best rate
  // badge, where only the ordering matters.
  const perSmsRate = (pkg: SmsPackage) => {
    const count = Number(pkg.sms_count || 0)
    if (!count) return null
    return Number(pkg.price || 0) / count
  }

  const cheapestRate = useMemo(() => {
    const rates = availablePackages.map(perSmsRate).filter((r): r is number => r !== null && r > 0)
    return rates.length ? Math.min(...rates) : null
  }, [availablePackages])

  function openCheckout(pkg: SmsPackage) {
    setSelected(pkg)
    setStep('pay')
    setSenderNumber('')
    setTrxId('')
    setCopied(false)
  }

  function closeCheckout() {
    // A submitted purchase changes the history behind the modal, so refresh on
    // the way out rather than leaving a stale list on screen.
    const shouldReload = step === 'done'
    setSelected(null)
    setStep('pay')
    if (shouldReload) load()
  }

  async function copyNumber() {
    if (!payment?.bkash_number) return
    try {
      await navigator.clipboard.writeText(payment.bkash_number)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error(bn ? 'কপি করা যায়নি' : 'Could not copy')
    }
  }

  async function handleSubmit() {
    if (!selected) return

    const phone = senderNumber.trim()
    const trx = trxId.trim()
    if (!/^01\d{9}$/.test(phone)) {
      toast.error(bn ? 'সঠিক ১১ ডিজিটের বিকাশ নম্বর দিন' : 'Enter a valid 11-digit bKash number')
      return
    }
    if (trx.length < 4) {
      toast.error(bn ? 'ট্রানজেকশন আইডি দিন' : 'Enter the transaction ID')
      return
    }

    setSubmitting(true)
    try {
      await submitSmsPurchase({ package_id: selected.id, sender_number: phone, trx_id: trx })
      setStep('done')
      toast.success(bn ? 'জমা হয়েছে, অনুমোদনের অপেক্ষায়' : 'Submitted for approval')
    } catch (error: any) {
      toast.error(error?.message || (bn ? 'জমা দেওয়া যায়নি' : 'Could not submit'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-white p-4 sm:p-6">
      <PageHeader
        title={bn ? 'এসএমএস প্যাকেজ' : 'SMS Packages'}
        subtitle={bn ? 'এসএমএস ক্রেডিট কিনুন এবং আপনার ব্যালেন্স দেখুন' : 'Buy SMS credits and track your balance'}
        actions={
          <button className="btn-secondary" onClick={load}>
            <RefreshCcw size={16} /> {bn ? 'রিফ্রেশ' : 'Refresh'}
          </button>
        }
      />

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          title={bn ? 'এসএমএস ব্যালেন্স' : 'SMS balance'}
          value={balance === null ? <NoValue /> : formatNum(balance)}
          subtitle={bn ? 'বাকি ক্রেডিট' : 'Credits remaining'}
          icon={<Wallet size={20} />}
          color="green"
        />
        <StatCard
          title={bn ? 'অনুমোদনের অপেক্ষায়' : 'Awaiting approval'}
          value={formatNum(pendingCount)}
          subtitle={bn ? 'জমা দেওয়া অর্ডার' : 'Submitted orders'}
          icon={<ShieldCheck size={20} />}
          color="orange"
        />
        <StatCard
          title={bn ? 'এসএমএসে মোট খরচ' : 'Spent on SMS'}
          value={formatCurr(totalSpent)}
          subtitle={bn ? 'অনুমোদিত কেনাকাটা' : 'Approved purchases'}
          icon={<MessageSquareText size={20} />}
          color="blue"
        />
      </div>

      <div className="card mb-5 p-4 sm:p-5">
        <h2 className="mb-1 text-base font-bold text-slate-900">
          {bn ? 'উপলব্ধ প্যাকেজ' : 'Available packages'}
        </h2>
        <p className="mb-4 text-sm text-slate-500">
          {bn
            ? 'প্যাকেজ বেছে বিকাশে টাকা পাঠান। অনুমোদনের পর ক্রেডিট আপনার ব্যালেন্সে যোগ হবে।'
            : 'Pick a package and pay via bKash. Credits are added to your balance once approved.'}
        </p>

        {loading && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map(key => (
              <div key={key} className="h-44 animate-pulse rounded-xl border border-slate-100 bg-white" />
            ))}
          </div>
        )}

        {!loading && availablePackages.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-200 px-4 py-12 text-center text-slate-400">
            {bn ? 'এখনো কোনো প্যাকেজ যোগ করা হয়নি' : 'No packages have been added yet'}
          </div>
        )}

        {!loading && availablePackages.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {availablePackages.map(pkg => {
              const rate = perSmsRate(pkg)
              const isBestRate = rate !== null && cheapestRate !== null && rate === cheapestRate && availablePackages.length > 1
              return (
                <div
                  key={pkg.id}
                  className={`relative flex flex-col rounded-xl border p-5 transition-shadow hover:shadow-md ${
                    isBestRate ? 'border-brand-green bg-green-50/40' : 'border-slate-200 bg-white'
                  }`}
                >
                  {isBestRate && (
                    <span className="absolute -top-2.5 right-4 rounded-full bg-brand-green px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
                      {bn ? 'সেরা দাম' : 'Best rate'}
                    </span>
                  )}

                  <div className="flex items-center gap-2 text-slate-500">
                    <MessageSquareText size={16} />
                    <span className="text-sm font-semibold">{pkg.name}</span>
                  </div>

                  <p className="mt-3 text-3xl font-bold tabular-nums text-slate-900">
                    {formatNum(Number(pkg.sms_count || 0))}
                    <span className="ml-1.5 text-sm font-semibold text-slate-500">
                      {bn ? 'এসএমএস' : 'SMS'}
                    </span>
                  </p>

                  <p className="mt-1 text-lg font-bold text-brand-green">{formatCurr(Number(pkg.price || 0))}</p>

                  <button className="btn-primary mt-4 w-full justify-center" onClick={() => openCheckout(pkg)}>
                    <Send size={16} /> {bn ? 'কিনুন' : 'Buy now'}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="card overflow-hidden p-0">
        <div className="border-b border-slate-100 p-4">
          <h2 className="text-base font-bold text-slate-900">{bn ? 'আমার এসএমএস কেনাকাটা' : 'My SMS purchases'}</h2>
        </div>

        <TableScroller className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="table-header">
              <tr>
                <th className="px-4 py-3 text-left">{bn ? 'তারিখ' : 'Date'}</th>
                <th className="px-4 py-3 text-left">{bn ? 'প্যাকেজ' : 'Package'}</th>
                <th className="px-4 py-3 text-right">{bn ? 'এসএমএস' : 'SMS'}</th>
                <th className="px-4 py-3 text-left">{bn ? 'ইনভয়েস' : 'Invoice'}</th>
                <th className="px-4 py-3 text-left">TrxID</th>
                <th className="px-4 py-3 text-left">{bn ? 'অবস্থা' : 'Status'}</th>
                <th className="px-4 py-3 text-right">{bn ? 'টাকা' : 'Amount'}</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">{bn ? 'লোড হচ্ছে...' : 'Loading...'}</td></tr>
              )}
              {!loading && purchases.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">{bn ? 'এখনো কিছু কেনা হয়নি' : 'Nothing purchased yet'}</td></tr>
              )}
              {!loading && purchases.map(row => (
                <tr key={row.id} className="table-row">
                  <td className="px-4 py-3 text-slate-600">{row.date || row.created_at ? formatDate(row.date || row.created_at) : <NoValue />}</td>
                  <td className="px-4 py-3 font-semibold text-slate-800">{row.package_name || <NoValue />}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-700">{formatNum(Number(row.sms_count || 0))}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{row.invoice_no || <NoValue />}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{row.trx_id || <NoValue />}</td>
                  <td className="px-4 py-3"><span className={badgeFor(row.status)}>{row.status}</span></td>
                  <td className="px-4 py-3 text-right font-bold tabular-nums text-slate-800">{formatCurr(Number(row.amount || 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroller>
      </div>

      <Modal
        isOpen={selected !== null}
        onClose={closeCheckout}
        title={
          step === 'done'
            ? (bn ? 'জমা হয়েছে' : 'Submitted')
            : (bn ? 'এসএমএস প্যাকেজ কিনুন' : 'Buy SMS package')
        }
        size="md"
      >
        {selected && step === 'pay' && (
          <div className="space-y-4">
            <div className="rounded-xl bg-white p-4">
              <p className="text-sm font-semibold text-slate-700">{selected.name}</p>
              <p className="mt-1 text-sm text-slate-500">
                {formatNum(Number(selected.sms_count || 0))} {bn ? 'এসএমএস ক্রেডিট' : 'SMS credits'}
              </p>
              <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500">
                {bn ? 'যত টাকা পাঠাবেন' : 'Amount to send'}
              </p>
              <p className="text-2xl font-bold text-brand-green">{formatCurr(Number(selected.price || 0))}</p>
            </div>

            {payment?.bkash_number ? (
              <div>
                <p className="mb-1.5 text-sm font-medium text-slate-700">
                  {bn ? 'এই বিকাশ নম্বরে Send Money করুন' : 'Send Money to this bKash number'}
                </p>
                <div className="flex items-center gap-2">
                  <div className="flex flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                    <Smartphone size={16} className="text-slate-400" />
                    <span className="font-mono text-base font-bold tracking-wide text-slate-800">{payment.bkash_number}</span>
                  </div>
                  <button className="btn-secondary" onClick={copyNumber}>
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                    {copied ? (bn ? 'কপি হয়েছে' : 'Copied') : (bn ? 'কপি' : 'Copy')}
                  </button>
                </div>

                {payment.bkash_qr_url && (
                  <div className="mt-3 text-center">
                    <p className="mb-2 text-xs text-slate-500">
                      {bn ? 'অথবা বিকাশ অ্যাপে এই QR স্ক্যান করুন' : 'Or scan this QR in your bKash app'}
                    </p>
                    <img
                      src={payment.bkash_qr_url}
                      alt="bKash QR"
                      loading="lazy"
                      className="mx-auto h-40 w-40 rounded-lg border border-slate-200 object-contain"
                    />
                  </div>
                )}
              </div>
            ) : (
              <p className="rounded-lg bg-brand-blue-soft px-3 py-2.5 text-sm text-brand-blue">
                {bn
                  ? 'পেমেন্ট নম্বর এখনো সেট করা হয়নি। সুপার অ্যাডমিনের সাথে যোগাযোগ করুন।'
                  : 'No payment number has been set yet. Please contact the super admin.'}
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <button className="btn-secondary flex-1 justify-center" onClick={closeCheckout}>
                {bn ? 'বাতিল' : 'Cancel'}
              </button>
              <button className="btn-primary flex-1 justify-center" onClick={() => setStep('submit')}>
                {bn ? 'টাকা পাঠিয়েছি - পরবর্তী' : 'I have paid - Next'}
              </button>
            </div>
          </div>
        )}

        {selected && step === 'submit' && (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">
              {bn
                ? 'যে বিকাশ নম্বর থেকে টাকা পাঠিয়েছেন সেটি এবং কনফার্মেশন এসএমএসের TrxID দিন।'
                : 'Enter the bKash number you paid from and the TrxID from your confirmation SMS.'}
            </p>

            <div>
              <label className="label" htmlFor="sms-packages-f1">{bn ? 'আপনার বিকাশ নম্বর' : 'Your bKash number'}</label>
              <input id="sms-packages-f1"
                className="input"
                value={senderNumber}
                onChange={e => setSenderNumber(e.target.value)}
                placeholder="01XXXXXXXXX"
                inputMode="numeric"
                maxLength={11}
              />
            </div>

            <div>
              <label className="label" htmlFor="sms-packages-f2">{bn ? 'ট্রানজেকশন আইডি (TrxID)' : 'Transaction ID (TrxID)'}</label>
              <input id="sms-packages-f2"
                className="input"
                value={trxId}
                onChange={e => setTrxId(e.target.value.toUpperCase())}
                placeholder={bn ? 'যেমন 9J7K2L1M0N' : 'e.g. 9J7K2L1M0N'}
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button className="btn-secondary flex-1 justify-center" onClick={() => setStep('pay')} disabled={submitting}>
                {bn ? 'পেছনে' : 'Back'}
              </button>
              <button className="btn-primary flex-1 justify-center" onClick={handleSubmit} disabled={submitting}>
                {submitting
                  ? (bn ? 'জমা হচ্ছে...' : 'Submitting...')
                  : (bn ? 'অনুমোদনের জন্য পাঠান' : 'Submit for approval')}
              </button>
            </div>
          </div>
        )}

        {step === 'done' && (
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-50">
              <ShieldCheck size={28} className="text-brand-green" />
            </div>
            <div>
              <p className="text-base font-bold text-slate-900">
                {bn ? 'আপনার অর্ডার জমা হয়েছে' : 'Your order has been submitted'}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {bn
                  ? 'সুপার অ্যাডমিন অনুমোদন করলেই ক্রেডিট আপনার ব্যালেন্সে যোগ হবে।'
                  : 'The credits will be added to your balance as soon as the super admin approves it.'}
              </p>
            </div>
            <button className="btn-primary w-full justify-center" onClick={closeCheckout}>
              {bn ? 'ঠিক আছে' : 'Done'}
            </button>
          </div>
        )}
      </Modal>
    </div>
  )
}
