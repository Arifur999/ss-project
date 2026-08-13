import React, { useEffect, useState } from 'react'
import { EnvelopeSimpleIcon as Mail, QrCodeIcon as QrCode, ArrowCounterClockwiseIcon as RotateCcw, FloppyDiskIcon as Save, PaperPlaneTiltIcon as Send, CloudArrowUpIcon as UploadCloud, WalletIcon as Wallet } from '@phosphor-icons/react'
import toast from 'react-hot-toast'
import PageHeader from '../../components/PageHeader'
import { getPlatformSettings, resetReminderTemplate, savePlatformSettings, sendTestReminder } from '../../services/admin.services'
import { uploadImage } from '../../services/product.services'

interface PlatformSettings {
  id: string
  bkash_number: string
  bkash_qr_url: string
  yearly_price: number
  yearly_original_price: number
  monthly_price: number
  support_number: string
  reminder_subject: string
  reminder_body: string
}

// Placeholders the reminder template can use - filled in automatically when
// an actual reminder (or the test email) is sent. Shown as a cheat-sheet so
// the super admin doesn't have to guess the exact token spelling.
const TEMPLATE_PLACEHOLDERS = ['{{name}}', '{{business_name}}', '{{days_left}}', '{{expiry_date}}', '{{plan}}']

export default function SuperAdminSettings() {
  const [settings, setSettings] = useState<PlatformSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingQr, setUploadingQr] = useState(false)
  const [sendingTest, setSendingTest] = useState(false)
  const [resetting, setResetting] = useState(false)

  useEffect(() => {
    loadSettings()
  }, [])

  async function loadSettings() {
    setLoading(true)
    try {
      const data = await getPlatformSettings()
      setSettings(data)
    } catch (error: any) {
      toast.error(error.message || 'Failed to load settings')
    } finally {
      setLoading(false)
    }
  }

  function updateField<K extends keyof PlatformSettings>(field: K, value: PlatformSettings[K]) {
    setSettings(prev => (prev ? { ...prev, [field]: value } : prev))
  }

  async function handleQrUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file later
    if (!file) return

    setUploadingQr(true)
    try {
      const result = await uploadImage(file)
      updateField('bkash_qr_url', result.url)
      toast.success('QR code uploaded - remember to save')
    } catch (error: any) {
      toast.error(error.message || 'Failed to upload QR code')
    } finally {
      setUploadingQr(false)
    }
  }

  async function handleSave() {
    if (!settings) return
    setSaving(true)
    try {
      const saved = await savePlatformSettings({
        bkash_number: settings.bkash_number,
        bkash_qr_url: settings.bkash_qr_url,
        yearly_price: Number(settings.yearly_price) || 0,
        yearly_original_price: Number(settings.yearly_original_price) || 0,
        monthly_price: Number(settings.monthly_price) || 0,
        support_number: settings.support_number || '',
        reminder_subject: settings.reminder_subject,
        reminder_body: settings.reminder_body,
      })
      setSettings(saved)
      toast.success('Settings saved successfully')
    } catch (error: any) {
      toast.error(error.message || 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  async function handleResetTemplate() {
    setResetting(true)
    try {
      const updated = await resetReminderTemplate()
      setSettings(updated)
      toast.success('Reminder template reset to the latest default (with the Payment Now button)')
    } catch (error: any) {
      toast.error(error.message || 'Failed to reset template')
    } finally {
      setResetting(false)
    }
  }

  async function handleSendTest() {
    setSendingTest(true)
    try {
      const result = await sendTestReminder()
      toast.success(
        result.sent
          ? 'Test email sent - check your inbox'
          : 'Email is not configured yet - the rendered preview was printed to the server console'
      )
    } catch (error: any) {
      toast.error(error.message || 'Failed to send test email')
    } finally {
      setSendingTest(false)
    }
  }

  if (loading || !settings) {
    return (
      <div className="p-4 sm:p-6">
        <PageHeader title="Super Admin Settings" subtitle="Manage payment collection and reminder emails" />
        <div className="card py-10 text-center text-sm text-slate-400">Loading settings...</div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        title="Super Admin Settings"
        subtitle="Manage manual bKash payment details and subscription reminder emails"
        actions={
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            <Save size={16} />
            {saving ? 'Saving...' : 'Save settings'}
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* Manual bKash payment collection details, shown to owners on the checkout page */}
        <div className="card">
          <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-800">
            <Wallet size={18} className="text-slate-700" />
            Payment settings (bKash)
          </h2>

          <div className="space-y-4">
            <div>
              <label className="label" htmlFor="super-admin-settings-f1">bKash number</label>
              <input id="super-admin-settings-f1"
                className="input"
                value={settings.bkash_number}
                onChange={e => updateField('bkash_number', e.target.value.replace(/\D/g, '').slice(0, 11))}
                placeholder="01XXXXXXXXX"
              />
              <p className="mt-1 text-xs text-slate-400">Customers will "Send Money" to this number.</p>
            </div>

            <div>
              <label className="label" htmlFor="super-admin-settings-f2">Support number</label>
              <input id="super-admin-settings-f2"
                className="input"
                value={settings.support_number || ''}
                onChange={e => updateField('support_number', e.target.value)}
                placeholder="+880 1XXXXXXXXX"
              />
              <p className="mt-1 text-xs text-slate-400">Shown to owners while their payment is awaiting approval.</p>
            </div>

            <div>
              <label className="label" htmlFor="super-admin-settings-f3">Monthly plan price (৳)</label>
              <input id="super-admin-settings-f3"
                type="number"
                min={0}
                className="input"
                value={settings.monthly_price}
                onChange={e => updateField('monthly_price', Number(e.target.value))}
              />
              <p className="mt-1 text-xs text-slate-400">Charged when an owner picks the Monthly plan (no yearly discount).</p>
            </div>

            <div>
              <label className="label" htmlFor="super-admin-settings-f4">Yearly plan price (৳)</label>
              <input id="super-admin-settings-f4"
                type="number"
                min={0}
                className="input"
                value={settings.yearly_price}
                onChange={e => updateField('yearly_price', Number(e.target.value))}
              />
              <p className="mt-1 text-xs text-slate-400">This is what the owner actually pays.</p>
            </div>

            <div>
              <label className="label" htmlFor="super-admin-settings-f5">Original price shown crossed-out (৳)</label>
              <input id="super-admin-settings-f5"
                type="number"
                min={0}
                className="input"
                value={settings.yearly_original_price}
                onChange={e => updateField('yearly_original_price', Number(e.target.value))}
              />
              <p className="mt-1 text-xs text-slate-400">
                Marketing only - shown struck-through next to the real price so the discount is visible. Must be higher than the price above or it won't show.
              </p>
            </div>

            <div>
              <label className="label">bKash QR code</label>
              <div className="flex items-center gap-4">
                {settings.bkash_qr_url ? (
                  <img src={settings.bkash_qr_url} alt="bKash QR" className="h-20 w-20 rounded-lg border border-slate-200 object-contain p-1" />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-dashed border-slate-300 text-slate-300">
                    <QrCode size={28} />
                  </div>
                )}
                <label className="btn-secondary cursor-pointer">
                  <UploadCloud size={16} />
                  {uploadingQr ? 'Uploading...' : 'Upload QR image'}
                  <input type="file" accept="image/*" className="hidden" onChange={handleQrUpload} disabled={uploadingQr} />
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Expiry reminder email template - editable placeholders, live test send */}
        <div className="card">
          <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-800">
            <Mail size={18} className="text-slate-700" />
            Expiry reminder email
          </h2>
          <p className="mb-3 text-xs text-slate-500">
            Sent automatically 15, 7 and 3 days before an owner&apos;s subscription expires. Use these placeholders anywhere in the subject or body:
          </p>
          <div className="mb-4 flex flex-wrap gap-1.5">
            {TEMPLATE_PLACEHOLDERS.map(token => (
              <code key={token} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">{token}</code>
            ))}
          </div>

          <div className="space-y-4">
            <div>
              <label className="label" htmlFor="super-admin-settings-f6">Subject</label>
              <input id="super-admin-settings-f6"
                className="input"
                value={settings.reminder_subject}
                onChange={e => updateField('reminder_subject', e.target.value)}
              />
            </div>

            <div>
              <label className="label" htmlFor="super-admin-settings-f7">Body (HTML)</label>
              <textarea id="super-admin-settings-f7"
                className="input min-h-[220px] font-mono text-xs"
                value={settings.reminder_body}
                onChange={e => updateField('reminder_body', e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <button type="button" className="btn-secondary flex-1 justify-center" onClick={handleSendTest} disabled={sendingTest}>
                <Send size={16} />
                {sendingTest ? 'Sending...' : 'Send test email to myself'}
              </button>
              <button type="button" className="btn-secondary flex-1 justify-center" onClick={handleResetTemplate} disabled={resetting}>
                <RotateCcw size={16} />
                {resetting ? 'Resetting...' : 'Reset to default template'}
              </button>
            </div>
            <p className="text-xs text-slate-400">
              "Reset to default" restores the built-in template, including the clickable "Payment Now" button.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
