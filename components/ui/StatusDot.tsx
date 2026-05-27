'use client'

import { TaskStatus } from '@/lib/types'

const MAP: Record<TaskStatus, { bg: string; ring: string }> = {
  'To Do':       { bg: 'transparent',   ring: 'var(--muted)' },
  'In Progress': { bg: 'var(--accent)', ring: 'var(--accent)' },
  'In Review':   { bg: '#F4C45A',       ring: '#F4C45A' },
  'Done':        { bg: '#6BD49A',       ring: '#6BD49A' },
}

export function StatusDot({ status }: { status: TaskStatus }) {
  const s = MAP[status] || MAP['To Do']
  return <span className="status-dot" style={{ background: s.bg, borderColor: s.ring }} />
}
