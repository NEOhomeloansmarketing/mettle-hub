'use client'

import { useState, useEffect, useCallback } from 'react'
import { Icon } from '@/components/ui/Icon'
import { cls } from '@/lib/utils'

interface SiteMetrics {
  sessions: number
  users: number
  pageviews: number
  bounceRate: number
  avgDuration: number
  engagementRate: number
  newUsers: number
}

interface LandingPage {
  path: string
  sessions: number
  bounceRate: number
  avgDuration: number
  engagementRate: number
}

interface Device {
  device: string
  sessions: number
  engagementRate: number
}

interface UserType {
  type: string
  sessions: number
  engagementRate: number
}

interface TopPage {
  title: string
  views: number
  avgDuration: number
  engagementRate: number
}

interface GscQuery {
  query: string
  clicks: number
  impressions: number
  ctr: number
  position: number
}

interface GscPage {
  page: string
  clicks: number
  impressions: number
  ctr: number
  position: number
}

interface GscData {
  queries:  GscQuery[]
  pages:    GscPage[]
  nearMiss: GscQuery[]
  summary:  { totalImpressions: number; totalClicks: number; avgPosition: number; avgCtr: number }
  notConfigured?: boolean
  scopeNeeded?:   boolean
  error?:         string
}

interface SiteData {
  id: string
  name: string
  current: SiteMetrics | null
  prev: SiteMetrics | null
  sources: { channel: string; sessions: number }[]
  landingPages: LandingPage[]
  devices: Device[]
  newVsReturning: UserType[]
  topPages: TopPage[]
  error: string | null
}

interface Insight {
  category: 'seo' | 'aeo' | 'geo' | 'llm' | 'perf' | 'content'
  type: 'good' | 'warn' | 'tip'
  headline: string
  body: string
  action: string
}

interface TeamMember { id: string; name: string }

type Preset = '7d' | '28d' | '90d'

const PRESET_LABELS: Record<Preset, string> = {
  '7d':  'Last 7 days',
  '28d': 'Last 28 days',
  '90d': 'Last 90 days',
}

const CATEGORY_META: Record<string, { label: string; cls: string }> = {
  seo:     { label: 'SEO',     cls: 'cat--seo'     },
  aeo:     { label: 'AEO',     cls: 'cat--aeo'     },
  geo:     { label: 'GEO',     cls: 'cat--geo'     },
  llm:     { label: 'LLM',     cls: 'cat--llm'     },
  perf:    { label: 'Perf',    cls: 'cat--perf'    },
  content: { label: 'Content', cls: 'cat--content' },
}

const DEVICE_ICON: Record<string, string> = {
  mobile:  'mobile',
  desktop: 'monitor',
  tablet:  'tablet',
}

function formatDuration(secs: number) {
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}m ${s.toString().padStart(2, '0')}s`
}

function pctChange(current: number, prev: number): number | null {
  if (!prev) return null
  return Math.round(((current - prev) / prev) * 100)
}

function TrendBadge({ current, prev, higherIsBetter = true }: {
  current: number; prev: number; higherIsBetter?: boolean
}) {
  const pct = pctChange(current, prev)
  if (pct === null) return null
  const isGood = higherIsBetter ? pct >= 0 : pct <= 0
  return (
    <span className={cls('an-trend', isGood ? 'an-trend--up' : 'an-trend--down')}>
      {pct >= 0 ? '↑' : '↓'} {Math.abs(pct)}%
    </span>
  )
}

function PosBadge({ pos }: { pos: number }) {
  const r   = Math.round(pos)
  const cls = r <= 3 ? 'pos--top' : r <= 10 ? 'pos--p1' : r <= 20 ? 'pos--p2' : 'pos--deep'
  return <span className={`pos-badge ${cls}`}>#{r}</span>
}

function fmtCtr(n: number) { return (n * 100).toFixed(1) + '%' }

function shortenPath(path: string) {
  // Remove query string, keep first 50 chars
  const clean = path.split('?')[0]
  return clean.length > 48 ? clean.slice(0, 46) + '…' : clean
}

export function AnalyticsView() {
  const [preset, setPreset]         = useState<Preset>('7d')
  const [sites, setSites]           = useState<SiteData[]>([])
  const [loading, setLoading]       = useState(true)
  const [activeTab, setActiveTab]   = useState(0)
  const [insights, setInsights]     = useState<Record<number, Insight[] | null>>({})
  const [aiLoading, setAiLoading]   = useState<Record<number, boolean>>({})
  const [team, setTeam]             = useState<TeamMember[]>([])
  const [taskState, setTaskState]   = useState<Record<string, 'idle' | 'open' | 'saving' | 'done'>>({})
  const [taskOwner, setTaskOwner]   = useState<Record<string, string>>({})
  const [gscData, setGscData]       = useState<Record<number, GscData | null>>({})
  const [gscLoading, setGscLoading] = useState<Record<number, boolean>>({})
  const [gscSites, setGscSites]     = useState<string[]>([])
  const [showNearMiss, setShowNearMiss] = useState(true)

  useEffect(() => {
    fetch('/api/team').then(r => r.json()).then(d => setTeam(d.team ?? []))
  }, [])

  const loadInsights = useCallback(async (idx: number, site: SiteData) => {
    if (!site.current || site.current.sessions === 0) return
    setAiLoading(p => ({ ...p, [idx]: true }))
    setInsights(p => ({ ...p, [idx]: null }))
    try {
      const res  = await fetch('/api/analytics/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          site:           site.name,
          current:        site.current,
          prev:           site.prev,
          sources:        site.sources,
          landingPages:   site.landingPages,
          devices:        site.devices,
          newVsReturning: site.newVsReturning,
          topPages:       site.topPages,
          preset,
        }),
      })
      const data = await res.json()
      if (res.ok) setInsights(p => ({ ...p, [idx]: data.insights }))
    } catch { /* fail silently */ }
    finally { setAiLoading(p => ({ ...p, [idx]: false })) }
  }, [preset])

  const loadGsc = useCallback(async (idx: number, siteName: string, p: Preset) => {
    setGscLoading(prev => ({ ...prev, [idx]: true }))
    try {
      const res  = await fetch(`/api/analytics/gsc?site=${encodeURIComponent(siteName)}&preset=${p}`)
      const data = await res.json()
      setGscData(prev => ({ ...prev, [idx]: data }))
      // If scope is needed, try discovery to show available sites
      if (data.scopeNeeded || data.notConfigured) {
        const dr = await fetch('/api/analytics/gsc?discover=1')
        const dd = await dr.json()
        if (dd.sites) setGscSites(dd.sites)
      }
    } catch {
      setGscData(prev => ({ ...prev, [idx]: null }))
    } finally {
      setGscLoading(prev => ({ ...prev, [idx]: false }))
    }
  }, [])

  async function load(p: Preset) {
    setLoading(true)
    setInsights({})
    setGscData({})
    try {
      const res  = await fetch(`/api/analytics/stats?preset=${p}`)
      const data = await res.json()
      const loaded: SiteData[] = data.sites ?? []
      setSites(loaded)
      const active = loaded[activeTab]
      if (active) {
        loadInsights(activeTab, active)
        loadGsc(activeTab, active.name, p)
      }
    } catch { /* fail silently */ }
    finally { setLoading(false) }
  }

  useEffect(() => { load(preset) }, [preset])

  useEffect(() => {
    const site = sites[activeTab]
    if (!site) return
    if (insights[activeTab] === undefined && !aiLoading[activeTab]) {
      loadInsights(activeTab, site)
    }
    if (gscData[activeTab] === undefined && !gscLoading[activeTab]) {
      loadGsc(activeTab, site.name, preset)
    }
  }, [activeTab, sites])

  function insightKey(tabIdx: number, insightIdx: number) {
    return `${tabIdx}-${insightIdx}`
  }

  async function createTask(key: string, insight: Insight) {
    setTaskState(p => ({ ...p, [key]: 'saving' }))
    try {
      await fetch('/api/analytics/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title:       insight.action,
          description: `${insight.headline} — ${insight.body}`,
          assignee_id: taskOwner[key] || null,
        }),
      })
      setTaskState(p => ({ ...p, [key]: 'done' }))
    } catch {
      setTaskState(p => ({ ...p, [key]: 'open' }))
    }
  }

  const site          = sites[activeTab]
  const siteInsights  = insights[activeTab] ?? null
  const siteAiLoading = aiLoading[activeTab] ?? false
  const TAB_NAMES     = sites.length > 0
    ? sites.map(s => s.name)
    : ['Medical Professional', 'CRNA', 'Entrepreneur']

  return (
    <div className="an-page">

      {/* ── Header ───────────────────────────────────── */}
      <div className="an-header">
        <div className="an-header__left">
          <div className="an-header__icon"><Icon name="chart-line" size={16} /></div>
          <div>
            <h1 className="an-title">Website Analytics</h1>
            <p className="an-sub">Google Analytics · by property</p>
          </div>
        </div>
        <div className="an-header__right">
          <select className="lr-week-select" value={preset} onChange={e => setPreset(e.target.value as Preset)}>
            {(Object.entries(PRESET_LABELS) as [Preset, string][]).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <button className="icon-btn" onClick={() => load(preset)} title="Refresh">
            <Icon name="refresh" size={14} />
          </button>
        </div>
      </div>

      {/* ── Tabs ─────────────────────────────────────── */}
      <div className="an-tabs">
        {TAB_NAMES.map((name, i) => (
          <button key={i} className={cls('an-tab', i === activeTab && 'an-tab--active')} onClick={() => setActiveTab(i)}>
            {name}
          </button>
        ))}
      </div>

      {/* ── Content ──────────────────────────────────── */}
      {loading ? (
        <div className="an-loading">
          <div className="an-skel an-skel--metrics" />
          <div className="an-skel an-skel--card" />
        </div>
      ) : site?.error ? (
        <div className="an-error">
          <Icon name="flag" size={28} />
          <p>Couldn't load data for {site.name}.</p>
          <p className="an-error__detail">{site.error}</p>
        </div>
      ) : site?.current ? (
        <>
          {/* ── 6 Metric cards ─────────────────────── */}
          <div className="an-metrics">
            {[
              { label: 'Sessions',        val: site.current.sessions.toLocaleString(),              cmp: site.current.sessions,        prev: site.prev?.sessions        ?? 0, hib: true  },
              { label: 'Users',           val: site.current.users.toLocaleString(),                 cmp: site.current.users,           prev: site.prev?.users           ?? 0, hib: true  },
              { label: 'Pageviews',       val: site.current.pageviews.toLocaleString(),             cmp: site.current.pageviews,       prev: site.prev?.pageviews       ?? 0, hib: true  },
              { label: 'Engagement Rate', val: `${(site.current.engagementRate * 100).toFixed(1)}%`, cmp: site.current.engagementRate,  prev: site.prev?.engagementRate  ?? 0, hib: true  },
              { label: 'Bounce Rate',     val: `${(site.current.bounceRate * 100).toFixed(1)}%`,    cmp: site.current.bounceRate,      prev: site.prev?.bounceRate      ?? 0, hib: false },
              { label: 'Avg Duration',    val: formatDuration(site.current.avgDuration),            cmp: site.current.avgDuration,     prev: site.prev?.avgDuration     ?? 0, hib: true  },
            ].map(m => (
              <div key={m.label} className="an-metric">
                <div className="an-metric__label">{m.label}</div>
                <div className="an-metric__value">{m.val}</div>
                {site.prev && <TrendBadge current={m.cmp} prev={m.prev} higherIsBetter={m.hib} />}
              </div>
            ))}
          </div>

          {/* ── Body: data column + insights ───────── */}
          <div className="an-body-row">

            {/* Left: stacked data panels */}
            <div className="an-data-col">

              {/* Traffic channels */}
              <div className="an-card">
                <div className="an-card__head">Traffic by Channel</div>
                <ul className="an-list">
                  {site.sources.length > 0 ? site.sources.map(s => {
                    const total = site.sources.reduce((a, b) => a + b.sessions, 0)
                    const pct   = total > 0 ? Math.round((s.sessions / total) * 100) : 0
                    return (
                      <li key={s.channel} className="an-row">
                        <span className="an-row__channel">{s.channel}</span>
                        <div className="an-row__right">
                          <div className="an-bar-wrap">
                            <div className="an-bar" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="an-row__count">{s.sessions.toLocaleString()}</span>
                        </div>
                      </li>
                    )
                  }) : (
                    <li className="an-row an-row--empty">No channel data</li>
                  )}
                </ul>
              </div>

              {/* Devices + New vs Returning */}
              <div className="an-panels-2">

                {/* Devices */}
                <div className="an-card">
                  <div className="an-card__head">Devices</div>
                  {site.devices.length > 0 ? (() => {
                    const total = site.devices.reduce((a, b) => a + b.sessions, 0)
                    return site.devices.map(d => {
                      const pct = total > 0 ? Math.round((d.sessions / total) * 100) : 0
                      return (
                        <div key={d.device} className="an-dev-row">
                          <span className="an-dev-name">{d.device}</span>
                          <div className="an-dev-bar-wrap">
                            <div className="an-dev-bar" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="an-dev-pct">{pct}%</span>
                        </div>
                      )
                    })
                  })() : (
                    <div className="an-panel-empty">No device data</div>
                  )}
                </div>

                {/* New vs Returning */}
                <div className="an-card">
                  <div className="an-card__head">New vs Returning</div>
                  {site.newVsReturning.length > 0 ? (() => {
                    const total = site.newVsReturning.reduce((a, b) => a + b.sessions, 0)
                    return site.newVsReturning.map(d => {
                      const pct = total > 0 ? Math.round((d.sessions / total) * 100) : 0
                      const label = d.type === 'new' ? 'New visitors' : 'Returning'
                      return (
                        <div key={d.type} className="an-nv-row">
                          <div className="an-nv-left">
                            <span className="an-nv-label">{label}</span>
                            <span className="an-nv-sub">{(d.engagementRate * 100).toFixed(0)}% engaged</span>
                          </div>
                          <div className="an-nv-right">
                            <span className="an-nv-pct">{pct}%</span>
                            <span className="an-nv-count">{d.sessions.toLocaleString()}</span>
                          </div>
                        </div>
                      )
                    })
                  })() : (
                    <div className="an-panel-empty">No data</div>
                  )}
                </div>

              </div>

              {/* Landing pages table */}
              {site.landingPages.length > 0 && (
                <div className="an-card">
                  <div className="an-card__head">Top Landing Pages</div>
                  <div className="an-table-scroll">
                    <table className="an-lp-table">
                      <thead>
                        <tr>
                          <th>Page</th>
                          <th className="r">Sessions</th>
                          <th className="r">Bounce</th>
                          <th className="r">Avg Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {site.landingPages.slice(0, 8).map((lp, i) => (
                          <tr key={i}>
                            <td><span className="an-lp-path" title={lp.path}>{shortenPath(lp.path)}</span></td>
                            <td className="an-lp-num">{lp.sessions.toLocaleString()}</td>
                            <td className="an-lp-muted">{(lp.bounceRate * 100).toFixed(0)}%</td>
                            <td className="an-lp-muted">{formatDuration(lp.avgDuration)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Top content pages */}
              {site.topPages.length > 0 && (
                <div className="an-card">
                  <div className="an-card__head">Top Content Pages</div>
                  <div className="an-table-scroll">
                    <table className="an-lp-table">
                      <thead>
                        <tr>
                          <th>Page Title</th>
                          <th className="r">Views</th>
                          <th className="r">Avg Time</th>
                          <th className="r">Engaged</th>
                        </tr>
                      </thead>
                      <tbody>
                        {site.topPages.slice(0, 8).map((p, i) => (
                          <tr key={i}>
                            <td><span className="an-page-title" title={p.title}>{p.title.length > 52 ? p.title.slice(0, 50) + '…' : p.title}</span></td>
                            <td className="an-lp-num">{p.views.toLocaleString()}</td>
                            <td className="an-lp-muted">{formatDuration(p.avgDuration)}</td>
                            <td className="an-lp-muted">{(p.engagementRate * 100).toFixed(0)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── Rank Tracking (coming soon) ──────── */}
              <div className="an-card an-card--soon">
                <div className="an-card__head">
                  <span>Rank Tracking</span>
                  <span className="soon-badge">Coming Soon</span>
                </div>
                <div className="an-soon-body">
                  <Icon name="chart-line" size={24} />
                  <p>Keyword rankings, search impressions, and near-page-1 opportunities — powered by Google Search Console.</p>
                </div>
              </div>

            </div>

            {/* Right: AI Insights */}
            <div className="an-insights">
              <div className="an-insights__head">
                <Icon name="sparkle" size={13} />
                <span>AI Insights</span>
                <div className="an-insights__cats">
                  {Object.entries(CATEGORY_META).map(([k, v]) => (
                    <span key={k} className={cls('an-cat-pill', v.cls)}>{v.label}</span>
                  ))}
                </div>
                {siteAiLoading && <div className="an-insights__spinner" />}
              </div>

              {siteAiLoading && (
                <div className="an-insights__loading">
                  {[1,2,3,4].map(i => <div key={i} className="an-iskel" />)}
                </div>
              )}

              {!siteAiLoading && siteInsights && siteInsights.length > 0 && (
                <div className="an-insights__list">
                  {siteInsights.map((ins, i) => {
                    const key  = insightKey(activeTab, i)
                    const ts   = taskState[key] ?? 'idle'
                    const meta = CATEGORY_META[ins.category] ?? CATEGORY_META.content
                    return (
                      <div key={i} className={cls('an-insight', `an-insight--${ins.type}`)}>
                        <div className="an-insight__top">
                          <span className={cls('an-cat', meta.cls)}>{meta.label}</span>
                          <div className="an-insight__dot" />
                          <span className="an-insight__headline">{ins.headline}</span>
                        </div>
                        <p className="an-insight__body">{ins.body}</p>
                        <div className="an-insight__action">
                          <span className="an-insight__task-label">↳ {ins.action}</span>
                          {ts === 'done' ? (
                            <span className="an-task-done"><Icon name="check" size={12} /> Created</span>
                          ) : ts === 'open' || ts === 'saving' ? (
                            <div className="an-task-form">
                              <select
                                className="an-task-owner"
                                value={taskOwner[key] ?? ''}
                                onChange={e => setTaskOwner(p => ({ ...p, [key]: e.target.value }))}
                              >
                                <option value="">Unassigned</option>
                                {team.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                              </select>
                              <button
                                className="an-task-submit"
                                disabled={ts === 'saving'}
                                onClick={() => createTask(key, ins)}
                              >
                                {ts === 'saving' ? '…' : 'Create'}
                              </button>
                              <button className="an-task-cancel icon-btn" onClick={() => setTaskState(p => ({ ...p, [key]: 'idle' }))}>
                                <Icon name="x" size={11} />
                              </button>
                            </div>
                          ) : (
                            <button className="an-task-btn" onClick={() => setTaskState(p => ({ ...p, [key]: 'open' }))}>
                              + Task
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {!siteAiLoading && !siteInsights && (
                <div className="an-insights__empty"><p>No insights yet.</p></div>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="an-error">
          <Icon name="chart-line" size={28} />
          <p>No data available for this period.</p>
        </div>
      )}
    </div>
  )
}
