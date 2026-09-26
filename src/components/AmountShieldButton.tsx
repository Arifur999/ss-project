import React from 'react'
import { EyeIcon as Eye, EyeSlashIcon as EyeOff } from '@phosphor-icons/react'

/** The eye that reveals the figures, so every page carrying one looks the same. */
export default function AmountShieldButton({ visible, onToggle }: { visible: boolean; onToggle: () => void }) {
  const label = visible ? 'Hide amounts' : 'Show amounts'
  return (
    <button
      type="button"
      onClick={onToggle}
      className="btn-secondary h-9 flex items-center justify-center gap-2 border border-slate-200 px-3"
      title={label}
      aria-label={label}
      aria-pressed={visible}
    >
      {visible ? <EyeOff size={16} /> : <Eye size={16} />}
    </button>
  )
}
