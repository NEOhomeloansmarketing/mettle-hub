'use client'

import { Account } from '@/lib/types'

interface AvatarProps {
  user?: Pick<Account, 'name' | 'color' | 'initials'> | null
  size?: number
}

export function Avatar({ user, size = 24 }: AvatarProps) {
  if (!user) {
    return <span className="avatar avatar--empty" style={{ width: size, height: size }} />
  }
  const initials = user.initials || (user.name || '?').slice(0, 1).toUpperCase()
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, background: user.color || 'var(--accent)', fontSize: size * 0.42 }}
    >
      {initials}
    </span>
  )
}
