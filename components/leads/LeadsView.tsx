'use client'

import { useState, useEffect, useCallback } from 'react'
import { Icon } from '@/components/ui/Icon'
import { cls } from '@/lib/utils'

interface ChannelRow {
  channel: string
  count: number
  prevCount: number | null
}

interface QueueItem {
  bntouch_source: string
  sample_count: number
}

const ALL_CHANNELS = [
  'CRNA', 'Entrepreneur', 'Physician Site', 'Physician ADs',
  'Better Leads', 'WCI', 'Tax Hive', 'Wealth Juice',
  'Past Client', 'Partner Referral',
]

function formatWeek(w: string) {
  const d = new Date(w + 'T00:00:00Z')
  const end = new Date(d)
  end.setUTCDate(end.getUTCDate() + 6)
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  return `${d.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', { ...opts, year: 'numeric' })}`
}

function Trend({ count, prev }: { count: number; prev: number | null }) {
  if (prev === null || prev === undefined) return null
  if (count === 0 && prev === 0) return null
  if (prev === 0) return <span className="lr-trend lr-trend--up">New</span>
  const diff = count - prev
  if (diff === 0) return <span className="lr-trend lr-trend--flat">—</span>
  const pct = Math.round(Math.abs(diff / prev) * 100)
  return (
    <span className={cls('lr-trend', diff > 0 ? 'lr-trend--up' : 'lr-trend--down')}>
      {diff > 0 ? '↑' : '↓'} {pct}%
    </span>
  )
}

export function LeadsView() {
  const [weeks, setWeeks]             = useState<string[]>([])
  const [selected, setSelected]       = useState<string | null>(null)
  const [rows, setRows]               = useState<ChannelRow[]>([])
  const [prevWeek, setPrevWeek]       = useState<string | null>(null)
  const [queue, setQueue]             = useState<QueueItem[]>([])
  const [loading, setLoading]         = useState(true)
  const [showBackfill, setShowBackfill] = useState(false)
  const [showMapModal, setShowMapModal] = useState<QueueItem | null>(null)

  const load = useCallback(async (week?: string) => {
    setLoading(true)
    const url = week ? `/api/leads/weekly?week=${week}` : '/api/leads/weekly'
    const res  = await fetch(url)
    const data = await res.json()
    setWeeks(data.weeks ?? [])
    setSelected(data.selectedWeek ?? null)
    setPrevWeek(data.prevWeek ?? null)
    setRows(data.current ?? [])
    setQueue(data.queue ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const total     = rows.reduce((s, r) => s + r.count, 0)
  const prevTotal = rows.every(r => r.prevCount === null)
    ? null
    : rows.reduce((s, r) => s + (r.prevCount ?? 0), 0)

  return (
    <div className="lr-page">

      {/* ── Header ── */}
      <div className="lr-header">
        <div className="lr-header__left">
          <div className="lr-header__icon"><Icon name="users" size={16} /></div>
          <div>
            <h1 className="lr-title">Weekly Lead Report</h1>
            <p className="lr-sub">BNTouch · by source</p>
          </div>
        </div>
        <div className="lr-header__right">
          {weeks.length > 0 && (
            <select
              className="lr-week-select"
              value={selected ?? ''}
              onChange={e => load(e.target.value)}
            >
              {weeks.map(w => (
                <option key={w} value={w}>{formatWeek(w)}</option>
              ))}
            </select>
          )}
          <button className="btn-secondary" onClick={() => setShowBackfill(true)}>
            <Icon name="plus" size={13} /> Add week
          </button>
          <button className="icon-btn" onClick={() => load(selected ?? undefined)} title="Refresh">
            <Icon name="refresh" size={14} />
          </button>
        </div>
      </div>

      {/* ── Unmapped sources warning ── */}
      {queue.length > 0 && (
        <div className="lr-queue-banner">
          <Icon name="flag" size={14} />
          <span><strong>{queue.length} unmapped source{queue.length > 1 ? 's' : ''}</strong> arrived from BNTouch and weren't counted.</span>
          <div className="lr-queue-items">
            {queue.map(q => (
              <button key={q.bntouch_source} className="lr-queue-chip" onClick={() => setShowMapModal(q)}>
                "{q.bntouch_source}" ({q.sample_count}×) — assign →
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Main report card ── */}
      <div className="lr-card">
        {prevWeek && (
          <div className="lr-compare-note">
            Comparing to week of {formatWeek(prevWeek)}
          </div>
        )}

        {loading ? (
          <div className="lr-loading">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="lr-row-skel" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="lr-empty">
            <Icon name="users" size={32} />
            <p>No lead data yet. Add a week manually or connect Zapier to start tracking.</p>
          </div>
        ) : (
          <ul className="lr-list">
            {rows.map(r => (
              <li key={r.channel} className={cls('lr-row', r.count === 0 && 'lr-row--zero')}>
                <span className="lr-row__channel">{r.channel}</span>
                <span className="lr-row__right">
                  <Trend count={r.count} prev={r.prevCount} />
                  <span className="lr-row__count">{r.count}</span>
                </span>
              </li>
            ))}
            <li className="lr-row lr-row--total">
              <span className="lr-row__channel">Total</span>
              <span className="lr-row__right">
                <Trend count={total} prev={prevTotal} />
                <span className="lr-row__count">{total}</span>
              </span>
            </li>
          </ul>
        )}
      </div>

      {/* ── Backfill modal ── */}
      {showBackfill && (
        <BackfillModal
          onClose={() => setShowBackfill(false)}
          onSaved={(week) => { setShowBackfill(false); load(week) }}
        />
      )}

      {/* ── Map source modal ── */}
      {showMapModal && (
        <MapSourceModal
          item={showMapModal}
          onClose={() => setShowMapModal(null)}
          onSaved={() => { setShowMapModal(null); load(selected ?? undefined) }}
        />
      )}

    </div>
  )
}

/* ── Backfill Modal ── */
function BackfillModal({ onClose, onSaved }: { onClose: () => void; onSaved: (week: string) => void }) {
  const [weekDate, setWeekDate] = useState('')
  const [counts, setCounts]     = useState<Record<string, string>>({})
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')

  function getMonday(d: string) {
    const date = new Date(d + 'T00:00:00Z')
    const day  = date.getUTCDay()
    const diff = day === 0 ? -6 : 1 - day
    date.setUTCDate(date.getUTCDate() + diff)
    return date.toISOString().split('T')[0]
  }

  async function save() {
    if (!weekDate) { setError('Pick a date'); return }
    const week_start = getMonday(weekDate)
    const parsed: Record<string, number> = {}
    for (const [ch, v] of Object.entries(counts)) {
      const n = parseInt(v)
      if (!isNaN(n) && n > 0) parsed[ch] = n
    }
    setSaving(true)
    const res  = await fetch('/api/leads/weekly', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ week_start, counts: parsed }),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { setError(data.error); return }
    onSaved(week_start)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal lr-modal" onClick={e => e.stopPropagation()}>
        <div className="modal__head">
          <h3>Add Past Week</h3>
          <button className="icon-btn" onClick={onClose}><Icon name="x" size={14} /></button>
        </div>
        <div className="modal__body">
          <p className="lr-modal__hint">Pick any date in the week. We'll calculate the Monday automatically.</p>
          <label className="form-label">Any date in that week</label>
          <input
            type="date" className="form-input" value={weekDate}
            onChange={e => setWeekDate(e.target.value)}
          />
          <div className="lr-backfill-grid">
            {ALL_CHANNELS.map(ch => (
              <div key={ch} className="lr-backfill-row">
                <label className="lr-backfill-label">{ch}</label>
                <input
                  type="number" min="0" placeholder="0" className="lr-backfill-input"
                  value={counts[ch] ?? ''}
                  onChange={e => setCounts(p => ({ ...p, [ch]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          {error && <div className="form-error">{error}</div>}
        </div>
        <div className="modal__foot">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save week'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Map Source Modal ── */
function MapSourceModal({ item, onClose, onSaved }: { item: QueueItem; onClose: () => void; onSaved: () => void }) {
  const [channel, setChannel] = useState('')
  const [saving, setSaving]   = useState(false)

  async function save() {
    if (!channel) return
    setSaving(true)
    await fetch('/api/leads/weekly', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bntouch_source: item.bntouch_source, display_channel: channel }),
    })
    setSaving(false)
    onSaved()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal lr-modal" onClick={e => e.stopPropagation()}>
        <div className="modal__head">
          <h3>Map Source</h3>
          <button className="icon-btn" onClick={onClose}><Icon name="x" size={14} /></button>
        </div>
        <div className="modal__body">
          <p className="lr-modal__hint">
            BNTouch sent <strong>"{item.bntouch_source}"</strong> ({item.sample_count} time{item.sample_count > 1 ? 's' : ''}).
            Which channel should this count towards?
          </p>
          <select className="form-input" value={channel} onChange={e => setChannel(e.target.value)}>
            <option value="">Select channel…</option>
            {ALL_CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
            <option value="__skip">Skip this source (don't count)</option>
          </select>
        </div>
        <div className="modal__foot">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={!channel || saving}>
            {saving ? 'Saving…' : 'Save mapping'}
          </button>
        </div>
      </div>
    </div>
  )
}
