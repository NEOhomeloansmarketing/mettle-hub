export function fmtDate(ts: string | null | undefined): string {
  if (!ts) return ''
  const d = new Date(ts)
  const today = new Date(); today.setHours(0,0,0,0)
  const target = new Date(d); target.setHours(0,0,0,0)
  const diff = Math.round((target.getTime() - today.getTime()) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  if (diff > -7 && diff < 7) return d.toLocaleDateString(undefined, { weekday: 'short' })
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function fmtDateTime(ts: string | null | undefined): string {
  if (!ts) return ''
  return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function relTime(ts: string): string {
  const diff = (Date.now() - new Date(ts).getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago'
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago'
  return Math.floor(diff / 86400) + 'd ago'
}

export function cls(...args: (string | boolean | null | undefined)[]): string {
  return args.filter(Boolean).join(' ')
}

export function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

export function nextRunLabel(config: { day_of_week: number; hour: number; last_runs: Record<string, string> }): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  return `every ${days[config.day_of_week]} at ${config.hour}:00`
}
