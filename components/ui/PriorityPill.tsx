'use client'

import { TaskPriority } from '@/lib/types'

const MAP: Record<TaskPriority, { bg: string; fg: string }> = {
  Low:    { bg: 'rgba(255,255,255,0.04)', fg: 'var(--muted)' },
  Medium: { bg: 'rgba(96,140,255,0.10)',  fg: '#9CB6FF' },
  High:   { bg: 'rgba(255,166,87,0.12)',  fg: '#FFB87A' },
  Urgent: { bg: 'rgba(255,99,99,0.14)',   fg: '#FF8E8E' },
}

export function PriorityPill({ value }: { value: TaskPriority }) {
  const s = MAP[value] || MAP.Low
  return <span className="pill" style={{ background: s.bg, color: s.fg }}>{value}</span>
}
