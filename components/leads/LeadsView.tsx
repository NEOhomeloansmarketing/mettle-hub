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

interface Insight {
  type: 'good' | 'warn' | 'tip'
  headline: string
  body: string
}

const ALL_CHANNELS = [
  'CRNA', 'Entrepreneur', 'Physician Site', 'Physician ADs',
  'Better Leads', 'WCI', 'Tax Hive', 'Wealth Juice',
  'Past Client / Referral',
]

function formatWeek(w: string) {
  const d   = new Date(w + 'T00:00:00Z')
  const end = new Date(d)
  end.setUTCDate(end.getUTCDate() + 6)
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  return `${d.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', { ...opts, year: 'numeric' })}`
}

export function LeadsView({ isAdmin = false }: { isAdmin?: boolean }) {
  const [weeks, setWeeks]               = useState<string[]>([])
  const [selected, setSelected]         = useState<string | null>(null)
  const [prevWeek, setPrevWeek]         = useState<string | null>(null)
  const [rows, setRows]                 = useState<ChannelRow[]>([])
  const [queue, setQueue]               = useState<QueueItem[]>([])
  const [loading, setLoading]           = useState(true)
  const [insights, setInsights]         = useState<Insight[] | null>(null)
  const [aiLoading, setAiLoading]       = useState(false)
  const [showBackfill, setShowBackfill] = useState(false)
  const [showEdit, setShowEdit]         = useState(false)
  const [showMapModal, setShowMapModal] = useState<QueueItem | null>(null)

  const loadInsights = useCallback(async (current: ChannelRow[], week: string, prev: string | null, daysIn: number) => {
    const total = current.reduce((s, r) => s + r.count, 0)
    if (!total) return
    setAiLoading(true)
    setInsights(null)
    try {
      const res  = await fetch('/api/leads/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current, selectedWeek: week, prevWeek: prev, daysIn }),
      })
      const data = await res.json()
      if (res.ok) setInsights(data.insights)
    } catch { /* fail silently */ }
    finally { setAiLoading(false) }
  }, [])

  const load = useCallback(async (week?: string) => {
    setLoading(true)
    setInsights(null)
    const url  = week ? `/api/leads/weekly?week=${week}` : '/api/leads/weekly'
    const res  = await fetch(url)
    const data = await res.json()
    setWeeks(data.weeks ?? [])
    setSelected(data.selectedWeek ?? null)
    setPrevWeek(data.prevWeek ?? null)
    setRows(data.current ?? [])
    setQueue(data.queue ?? [])
    setLoading(false)
    if (data.selectedWeek && data.current?.length) {
      const daysIn = data.selectedWeek
        ? Math.max(0, Math.floor((Date.now() - new Date(data.selectedWeek + 'T00:00:00Z').getTime()) / 86400000))
        : 7
      loadInsights(data.current, data.selectedWeek, data.prevWeek, daysIn)
    }
  }, [loadInsights])

  useEffect(() => { load() }, [load])

  const total = rows.reduce((s, r) => s + r.count, 0)

  return (
    <div className="lr-page">

      {/* ── Header ── */}
      <div className="lr-header">
        <div className="lr-header__left">
          <div className="lr-header__icon"><Icon name="users" size={16} /></div>
          <div>
            <h1 className="lr-title">Lead Report</h1>
            <p className="lr-sub">BNTouch · by source</p>
          </div>
        </div>
        <div className="lr-header__right">
          {weeks.length > 0 && (
            <select className="lr-week-select" value={selected ?? ''} onChange={e => load(e.target.value)}>
              {weeks.map(w => <option key={w} value={w}>{formatWeek(w)}</option>)}
            </select>
          )}
          {isAdmin && selected && rows.some(r => r.count > 0) && (
            <button className="btn-secondary" onClick={() => setShowEdit(true)}>
              <Icon name="edit" size={13} /> Edit
            </button>
          )}
          {isAdmin && (
            <button className="btn-secondary" onClick={() => setShowBackfill(true)}>
              <Icon name="plus" size={13} /> Add week
            </button>
          )}
          <button className="icon-btn" onClick={() => load(selected ?? undefined)} title="Refresh">
            <Icon name="refresh" size={14} />
          </button>
        </div>
      </div>

      {/* ── Unmapped sources ── */}
      {queue.length > 0 && (
        <div className="lr-queue-banner">
          <Icon name="flag" size={14} />
          <span><strong>{queue.length} unmapped source{queue.length > 1 ? 's' : ''}</strong> weren't counted.</span>
          <div className="lr-queue-items">
            {queue.map(q => (
              <button key={q.bntouch_source} className="lr-queue-chip" onClick={() => setShowMapModal(q)}>
                "{q.bntouch_source}" ({q.sample_count}×) — assign →
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Hero stats ── */}
      {!loading && (
        <div className="lr-hero-row">
          <div className="lr-hero">
            <div className="lr-hero__label">Total Leads</div>
            <div className="lr-hero__value">{total}</div>
            {selected && <div className="lr-hero__sub">{formatWeek(selected)}</div>}
          </div>
        </div>
      )}

      {/* ── Body: channel list + AI insights side by side ── */}
      <div className="lr-body-row">
        {/* Channel breakdown */}
        <div className="lr-card">
          {loading ? (
            <div className="lr-loading">
              {Array.from({ length: 9 }).map((_, i) => <div key={i} className="lr-row-skel" />)}
            </div>
          ) : total === 0 ? (
            <div className="lr-empty">
              <Icon name="users" size={32} />
              <p>No lead data yet. Add a week manually or connect Zapier to start tracking.</p>
            </div>
          ) : (
            <ul className="lr-list">
              {rows.map(r => (
                <li key={r.channel} className={cls('lr-row', r.count === 0 && 'lr-row--zero')}>
                  <span className="lr-row__channel">{r.channel}</span>
                  <span className="lr-row__count">{r.count}</span>
                </li>
              ))}
              <li className="lr-row lr-row--total">
                <span className="lr-row__channel">Total</span>
                <span className="lr-row__count">{total}</span>
              </li>
            </ul>
          )}
        </div>

        {/* AI Insights */}
        {!loading && total > 0 && (
          <div className="lr-insights">
            <div className="lr-insights__head">
              <Icon name="sparkle" size={13} />
              <span>AI Analysis</span>
              {aiLoading && <div className="lr-insights__spinner" />}
            </div>
            {aiLoading && (
              <div className="lr-insights__loading">
                <div className="lr-insight-skel" />
                <div className="lr-insight-skel lr-insight-skel--sm" />
                <div className="lr-insight-skel" />
              </div>
            )}
            {insights && insights.length > 0 && (
              <div className="lr-insights__list">
                {insights.map((ins, i) => (
                  <div key={i} className={cls('lr-insight', `lr-insight--${ins.type}`)}>
                    <div className="lr-insight__dot" />
                    <div>
                      <div className="lr-insight__headline">{ins.headline}</div>
                      <div className="lr-insight__body">{ins.body}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {showEdit && selected && (
        <BackfillModal
          onClose={() => setShowEdit(false)}
          onSaved={week => { setShowEdit(false); load(week) }}
          prefillWeek={selected}
          prefillCounts={Object.fromEntries(rows.map(r => [r.channel, String(r.count)]))}
          title="Edit Week"
        />
      )}
      {showBackfill && (
        <BackfillModal
          onClose={() => setShowBackfill(false)}
          onSaved={week => { setShowBackfill(false); load(week) }}
        />
      )}
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

/* ── Backfill / Edit Modal ── */
function BackfillModal({ onClose, onSaved, prefillWeek, prefillCounts, title = 'Add Past Week' }: {
  onClose: () => void; onSaved: (week: string) => void
  prefillWeek?: string; prefillCounts?: Record<string, string>; title?: string
}) {
  const [weekDate, setWeekDate] = useState(prefillWeek ?? '')
  const [counts, setCounts]     = useState<Record<string, string>>(prefillCounts ?? {})
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const isEdit                  = !!prefillWeek

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
      if (!isNaN(n) && n >= 0) parsed[ch] = n
    }
    setSaving(true)
    const res  = await fetch('/api/leads/weekly', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
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
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose}><Icon name="x" size={14} /></button>
        </div>
        <div className="modal__body">
          <p className="lr-modal__hint">
            {isEdit ? 'Adjust any channel count. Changes overwrite current values.' : 'Pick any date in the week — we\'ll calculate the Monday.'}
          </p>
          <label className="form-label">{isEdit ? 'Week' : 'Any date in that week'}</label>
          <input type="date" className="form-input" value={weekDate}
            onChange={e => setWeekDate(e.target.value)} readOnly={isEdit} />
          <div className="lr-backfill-grid">
            {ALL_CHANNELS.map(ch => (
              <div key={ch} className="lr-backfill-row">
                <label className="lr-backfill-label">{ch}</label>
                <input type="number" min="0" placeholder="0" className="lr-backfill-input"
                  value={counts[ch] ?? ''}
                  onChange={e => setCounts(p => ({ ...p, [ch]: e.target.value }))} />
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
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
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
            BNTouch sent <strong>"{item.bntouch_source}"</strong> ({item.sample_count}×).
            Which channel should this count towards?
          </p>
          <select className="form-input" value={channel} onChange={e => setChannel(e.target.value)}>
            <option value="">Select channel…</option>
            {ALL_CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
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
