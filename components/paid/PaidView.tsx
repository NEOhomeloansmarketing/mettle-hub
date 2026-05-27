'use client'

import { useState, useEffect, useCallback } from 'react'
import { Icon } from '@/components/ui/Icon'
import { cls } from '@/lib/utils'

type Preset = 'last_7d' | 'last_30d' | 'last_90d'

interface Overview {
  spend: number
  impressions: number
  reach: number
  clicks: number
  ctr: number
  cpm: number
  cpc: number
  leads: number
  cpl: number
}

interface Campaign {
  id: string
  name: string
  status: string
  spend: number
  impressions: number
  reach: number
  clicks: number
  ctr: number
  cpm: number
  cpc: number
  leads: number
  cpl: number
}

interface Insight {
  type: 'good' | 'warn' | 'tip'
  headline: string
  body: string
}

const PRESETS: { value: Preset; label: string }[] = [
  { value: 'last_7d',  label: '7 days'  },
  { value: 'last_30d', label: '30 days' },
  { value: 'last_90d', label: '90 days' },
]

const STATUS_COLOR: Record<string, string> = {
  ACTIVE:      'ok',
  IN_PROCESS:  'ok',
  PAUSED:      'warn',
  ARCHIVED:    'muted',
  DELETED:     'muted',
  WITH_ISSUES: 'err',
}

function money(n: number) {
  if (!n) return '—'
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function bigMoney(n: number) {
  if (!n) return '$0'
  if (n >= 10000) return '$' + (n / 1000).toFixed(1) + 'K'
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}
function num(n: number) {
  if (!n) return '—'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 10_000)    return (n / 1_000).toFixed(1) + 'K'
  return n.toLocaleString()
}
function pct(n: number) { return n ? n.toFixed(2) + '%' : '—' }

export function PaidView() {
  const [preset, setPreset]         = useState<Preset>('last_30d')
  const [overview, setOverview]     = useState<Overview | null>(null)
  const [campaigns, setCampaigns]   = useState<Campaign[]>([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)
  const [insights, setInsights]     = useState<Insight[] | null>(null)
  const [aiLoading, setAiLoading]   = useState(false)
  const [hidden, setHidden]         = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('paid_hidden') ?? '[]')) }
    catch { return new Set() }
  })
  const [showHidden, setShowHidden] = useState(false)

  function toggleHide(id: string) {
    setHidden(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      localStorage.setItem('paid_hidden', JSON.stringify([...next]))
      return next
    })
  }

  const loadInsights = useCallback(async (ov: Overview, camps: Campaign[], p: Preset) => {
    if (!ov || !camps.length) return
    setAiLoading(true)
    setInsights(null)
    try {
      const res  = await fetch('/api/meta/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overview: ov, campaigns: camps, preset: p }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setInsights(data.insights)
    } catch {
      // fail silently — insights are a bonus
    } finally {
      setAiLoading(false)
    }
  }, [])

  const load = useCallback(async (p: Preset) => {
    setLoading(true)
    setError(null)
    setInsights(null)
    try {
      const res  = await fetch(`/api/meta/stats?preset=${p}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load stats')
      setOverview(data.overview)
      setCampaigns(data.campaigns)
      loadInsights(data.overview, data.campaigns, p)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [loadInsights])

  useEffect(() => { load(preset) }, [preset, load])

  const ov = overview

  return (
    <div className="paid-page">

      {/* ── Header ─────────────────────────────────── */}
      <div className="paid-header">
        <div className="paid-header__left">
          <div className="paid-header__icon">
            <Icon name="chart-bar" size={18} />
          </div>
          <div>
            <h1 className="paid-title">Paid Marketing</h1>
            <p className="paid-sub">Meta Ads performance</p>
          </div>
        </div>
        <div className="paid-header__right">
          <div className="paid-tabs">
            {PRESETS.map(p => (
              <button
                key={p.value}
                className={cls('paid-tab', preset === p.value && 'paid-tab--on')}
                onClick={() => setPreset(p.value)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button className="icon-btn" onClick={() => load(preset)} title="Refresh" disabled={loading}>
            <Icon name="refresh" size={14} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {/* ── Error ──────────────────────────────────── */}
      {error && (
        <div className="paid-error">
          <Icon name="x" size={14} />
          <span>{error}</span>
        </div>
      )}

      {/* ── Hero row: 4 primary metrics ────────────── */}
      <div className="paid-hero-row">
        {(['spend','leads','cpl','ctr'] as const).map(key => {
          const labels: Record<string, string> = { spend: 'Total Spend', leads: 'Leads', cpl: 'Cost per Lead', ctr: 'Click-through Rate' }
          const values: Record<string, string> = loading ? {} : {
            spend: bigMoney(ov?.spend ?? 0),
            leads: ov?.leads ? ov.leads.toLocaleString() : '—',
            cpl:   money(ov?.cpl ?? 0),
            ctr:   pct(ov?.ctr ?? 0),
          }
          return (
            <div key={key} className={cls('paid-hero', loading && 'paid-hero--skel')}>
              {!loading && (
                <>
                  <div className="paid-hero__label">{labels[key]}</div>
                  <div className="paid-hero__value">{values[key]}</div>
                </>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Secondary metrics: 5 supporting stats ──── */}
      <div className="paid-sec-row">
        {[
          { key: 'impressions', label: 'Impressions',    val: num(ov?.impressions ?? 0) },
          { key: 'reach',       label: 'Reach',          val: num(ov?.reach       ?? 0) },
          { key: 'clicks',      label: 'Clicks',         val: num(ov?.clicks      ?? 0) },
          { key: 'cpm',         label: 'CPM',            val: money(ov?.cpm       ?? 0) },
          { key: 'cpc',         label: 'CPC',            val: money(ov?.cpc       ?? 0) },
        ].map(s => (
          <div key={s.key} className={cls('paid-sec', loading && 'paid-sec--skel')}>
            {!loading && (
              <>
                <div className="paid-sec__label">{s.label}</div>
                <div className="paid-sec__value">{s.val}</div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* ── AI Insights ────────────────────────────── */}
      {(aiLoading || insights) && (
        <div className="paid-insights">
          <div className="paid-insights__head">
            <Icon name="sparkle" size={14} />
            <span>AI Analysis</span>
            {aiLoading && <div className="paid-insights__spinner" />}
          </div>
          {aiLoading && (
            <div className="paid-insights__loading">
              <div className="paid-insight-skel" />
              <div className="paid-insight-skel" />
              <div className="paid-insight-skel paid-insight-skel--sm" />
            </div>
          )}
          {insights && (
            <div className="paid-insights__list">
              {insights.map((ins, i) => (
                <div key={i} className={cls('paid-insight', `paid-insight--${ins.type}`)}>
                  <div className="paid-insight__dot" />
                  <div className="paid-insight__content">
                    <div className="paid-insight__headline">{ins.headline}</div>
                    <div className="paid-insight__body">{ins.body}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Campaign table ─────────────────────────── */}
      {!loading && campaigns.length > 0 && (
        <div className="paid-table-wrap">
          <div className="paid-table-top">
            <h2 className="paid-section-title">Campaigns</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {hidden.size > 0 && (
                <button className="paid-show-hidden" onClick={() => setShowHidden(s => !s)}>
                  {showHidden ? 'Hide archived' : `${hidden.size} hidden`}
                </button>
              )}
              <span className="paid-count">
                {campaigns.filter(c => !hidden.has(c.id)).length} campaign{campaigns.filter(c => !hidden.has(c.id)).length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
          <div className="paid-scroll">
            <table className="paid-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th className="r">Spend</th>
                  <th className="r">Impressions</th>
                  <th className="r">Clicks</th>
                  <th className="r">CTR</th>
                  <th className="r">CPM</th>
                  <th className="r">Leads</th>
                  <th className="r">CPL</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {campaigns
                  .filter(c => showHidden || !hidden.has(c.id))
                  .map(c => (
                  <tr key={c.id} className={hidden.has(c.id) ? 'paid-row--hidden' : ''}>
                    <td className="paid-camp-name" title={c.name}>{c.name}</td>
                    <td>
                      <span className={cls('paid-pill', `paid-pill--${STATUS_COLOR[c.status] ?? 'muted'}`)}>
                        {c.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="r fw">{money(c.spend)}</td>
                    <td className="r">{num(c.impressions)}</td>
                    <td className="r">{num(c.clicks)}</td>
                    <td className="r">{pct(c.ctr)}</td>
                    <td className="r">{money(c.cpm)}</td>
                    <td className="r fw">{c.leads > 0 ? c.leads : '—'}</td>
                    <td className="r">{money(c.cpl)}</td>
                    <td>
                      <button
                        className="paid-hide-btn"
                        onClick={() => toggleHide(c.id)}
                        title={hidden.has(c.id) ? 'Show campaign' : 'Hide campaign'}
                      >
                        <Icon name={hidden.has(c.id) ? 'eye' : 'x'} size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Empty ──────────────────────────────────── */}
      {!loading && !error && campaigns.length === 0 && (
        <div className="paid-empty">
          <Icon name="chart-bar" size={36} />
          <p>No campaign data found for this time period.</p>
        </div>
      )}

    </div>
  )
}
