'use client'

import { cls } from '@/lib/utils'

interface ToggleProps {
  checked: boolean
  onChange: (v: boolean) => void
  label?: string
}

export function Toggle({ checked, onChange, label }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={cls('toggle', checked && 'toggle--on')}
      onClick={() => onChange(!checked)}
      aria-label={label}
    >
      <span className="toggle__dot" />
    </button>
  )
}
