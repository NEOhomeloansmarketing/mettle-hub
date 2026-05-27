'use client'

import { CHANNELS } from '@/lib/types'
import { cls } from '@/lib/utils'

interface ChannelChipProps {
  channel: string
  size?: 'md' | 'sm'
}

export function ChannelChip({ channel, size = 'md' }: ChannelChipProps) {
  const c = CHANNELS[channel] || CHANNELS.All
  return (
    <span
      className={cls('ch-chip', size === 'sm' && 'ch-chip--sm')}
      style={{ background: c.soft, color: c.ink, borderColor: c.ink }}
    >
      <span className="ch-chip__dot" style={{ background: c.color }} />
      {c.short}
    </span>
  )
}
