const STORAGE_KEY = 'loan_lenders_fallback'

export function isLoanLenderTableMissing(error?: { message?: string } | null) {
  return Boolean(error?.message?.includes('loan_lenders'))
}

export function getStoredLoanLenders() {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    return value ? JSON.parse(value) : []
  } catch {
    return []
  }
}

function setStoredLoanLenders(lenders: any[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lenders))
}

export function saveStoredLoanLender(form: any, editItem?: any) {
  const stored = getStoredLoanLenders()
  const now = new Date().toISOString()
  const key = (editItem?.name || form.name).trim().toLowerCase()
  const lender = {
    ...form,
    id: editItem?.id?.startsWith?.('local:') ? editItem.id : `local:${Date.now()}`,
    lender_type: form.lender_type || 'boss',
    created_at: editItem?.created_at || now,
  }
  const exists = stored.some((item: any) => item.id === editItem?.id || item.name.trim().toLowerCase() === key)
  const next = exists
    ? stored.map((item: any) => item.id === editItem?.id || item.name.trim().toLowerCase() === key ? lender : item)
    : [lender, ...stored]

  setStoredLoanLenders(next)

  return lender
}

export function deleteStoredLoanLender(item: any) {
  const itemKey = String(item.name || '').trim().toLowerCase()
  setStoredLoanLenders(getStoredLoanLenders().filter((lender: any) => {
    if (lender.id === item.id) return false
    return String(lender.name || '').trim().toLowerCase() !== itemKey
  }))
}

export function mergeStoredAndLoanLenders(lenders: any[], activeOnly = false) {
  const byName: Record<string, any> = {}

  lenders.forEach(lender => {
    if (activeOnly && lender.is_active === false) return
    const name = String(lender.name || '').trim()
    if (!name) return
    byName[name.toLowerCase()] = lender
  })

  getStoredLoanLenders().forEach((lender: any) => {
    if (activeOnly && lender.is_active === false) return
    const name = String(lender.name || '').trim()
    if (!name) return
    if (!byName[name.toLowerCase()]) {
      byName[name.toLowerCase()] = lender
    }
  })

  return Object.values(byName).sort((a: any, b: any) => String(a.name || '').localeCompare(String(b.name || '')))
}

export function mergeStoredAndLegacyLoanLenders(loans: any[], activeOnly = false) {
  const byName: Record<string, any> = {}

  loans.forEach(loan => {
    const name = loan.lender_name || loan.loan_lenders?.name
    if (!name) return
    const key = name.trim().toLowerCase()
    if (!byName[key]) {
      byName[key] = {
        id: `legacy:${key}`,
        name,
        lender_type: loan.loan_type === 'bank' ? 'bank' : 'person',
        phone: '',
        address: '',
        opening_balance: 0,
        notes: '',
        is_active: true,
        created_at: loan.created_at,
      }
    }
  })

  getStoredLoanLenders().forEach((lender: any) => {
    if (!activeOnly || lender.is_active !== false) {
      byName[lender.name.trim().toLowerCase()] = lender
    }
  })

  return Object.values(byName).sort((a: any, b: any) => a.name.localeCompare(b.name))
}
