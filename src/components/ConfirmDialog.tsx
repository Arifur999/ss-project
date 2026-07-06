import React, { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'

type ConfirmOptions = {
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
}

type ConfirmRequest = Required<ConfirmOptions> & {
  resolve: (confirmed: boolean) => void
}

let openConfirm: ((request: ConfirmRequest) => void) | null = null

export function confirmAction(options: ConfirmOptions) {
  return new Promise<boolean>(resolve => {
    if (!openConfirm) {
      resolve(false)
      return
    }

    openConfirm({
      title: options.title || 'Confirm Delete',
      message: options.message,
      confirmText: options.confirmText || 'Confirm',
      cancelText: options.cancelText || 'Cancel',
      resolve,
    })
  })
}

export default function ConfirmDialogHost() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null)

  useEffect(() => {
    openConfirm = setRequest
    return () => {
      openConfirm = null
    }
  }, [])

  if (!request) return null

  function close(confirmed: boolean) {
    request?.resolve(confirmed)
    setRequest(null)
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm" onClick={() => close(false)} aria-label="Cancel confirmation" />
      <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-red-50 text-brand-red">
            <AlertTriangle size={22} />
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-slate-900">{request.title}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">{request.message}</p>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={() => close(false)} className="btn-secondary min-w-28 justify-center">
            {request.cancelText}
          </button>
          <button type="button" onClick={() => close(true)} className="btn-danger min-w-28 justify-center">
            {request.confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
