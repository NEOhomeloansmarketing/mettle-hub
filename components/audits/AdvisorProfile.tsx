'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type {
  Advisor, AdvisorChannel, VisibilityAudit,
  AuditActionItem, AuditConflict, AuditSocialStatus, AuditQueryVisibility,
} from '@/lib/types'
import { ADVISOR_PLATFORMS, type AdvisorChannelPlatform } from '@/lib/types'
import { Icon } from '@/components/ui/Icon'

interface AdvisorWithRelations extends Advisor {
  advisor_channels: AdvisorChannel[]
  visibility_audits: VisibilityAudit[]
}

interface AdvisorProfileProps {
  advisor: AdvisorWithRelations
}

function platformMeta(platform: string) {
  return ADVISOR_PLATFORMS.find(p => p.value === platform) ?? { label: platform, icon: '🔗', value: platform }
}

function ScoreGauge({ score }: { score: number }) {
  const color = score >= 70 ? '#22c55e' : score >= 45 ? '#f59e0b' : '#ef4444'
  const pct = Math.min(100, Math.max(0, score))
  return (
    <div className="score-gauge">
      <svg viewBox="0 0 120 120" className="score-gauge__svg">
        <circle cx="60" cy="60" r="50" fill="none" stroke="var(--border)" strokeWidth="10" />
        <circle
          cx="60" cy="60" r="50" fill="none"
          stroke={color} strokeWidth="10"
          strokeDasharray={`${pct * 3.14159} 314.159`}
          strokeLinecap="round"
          transform="rotate(-90 60 60)"
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
      </svg>
      <div className="score-gauge__num" style={{ color }}>{score}</div>
      <div className="score-gauge__label">/ 100</div>
    </div>
  )
}

function ImpactBadge({ impact }: { impact: 'High' | 'Medium' | 'Low' }) {
  const map = { High: 'red', Medium: 'yellow', Low: 'gray' }
  return <span className={`impact-badge impact-badge--${map[impact]}`}>{impact}</span>
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = { OK: 'green', ISSUE: 'yellow', REMOVE: 'red', MISSING: 'gray' }
  return <span className={`audit-status-badge audit-status-badge--${map[status] ?? 'gray'}`}>{status}</span>
}

type Tab = 'profile' | 'channels' | 'audit'

export function AdvisorProfile({ advisor: initial }: AdvisorProfileProps) {
  const router = useRouter()
  const [advisor, setAdvisor] = useState(initial)
  const [tab, setTab] = useState<Tab>('profile')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [auditing, setAuditing] = useState(false)
  const [profileForm, setProfileForm] = useState({ ...initial })

  // Channel editing
  const [editingChannels, setEditingChannels] = useState(false)
  const [channelDraft, setChannelDraft] = useState<Omit<AdvisorChannel, 'id' | 'advisor_id' | 'created_at'>[]>(
    initial.advisor_channels.map(c => ({ platform: c.platform, url: c.url, label: c.label }))
  )
  const [newChannel, setNewChannel] = useState<{ platform: AdvisorChannelPlatform; url: string; label: string }>({
    platform: 'google_business', url: '', label: '',
  })

  const latestAudit = advisor.visibility_audits[0] ?? null

  // ── Profile save ──────────────────────────────────────────────────

  const saveProfile = useCallback(async () => {
    setSaving(true)
    try {
      const { advisor_channels: _c, visibility_audits: _v, ...fields } = profileForm as AdvisorWithRelations
      const res = await fetch(`/api/advisors/${advisor.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      })
      const updated = await res.json()
      setAdvisor(prev => ({ ...prev, ...updated }))
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }, [advisor.id, profileForm])

  // ── Channel save ──────────────────────────────────────────────────

  const saveChannels = useCallback(async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/advisors/${advisor.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channels: channelDraft }),
      })
      const updated = await res.json()
      setAdvisor(prev => ({ ...prev, advisor_channels: updated.advisor_channels ?? [] }))
      setEditingChannels(false)
    } finally {
      setSaving(false)
    }
  }, [advisor.id, channelDraft])

  const addChannel = useCallback(() => {
    if (!newChannel.url.trim()) return
    setChannelDraft(prev => [...prev, { ...newChannel }])
    setNewChannel({ platform: 'google_business', url: '', label: '' })
  }, [newChannel])

  // ── Run audit ─────────────────────────────────────────────────────

  const runAudit = useCallback(async () => {
    setAuditing(true)
    try {
      const res = await fetch(`/api/advisors/${advisor.id}/audit`, { method: 'POST' })
      if (!res.ok) throw new Error(await res.text())
      const newAudit = await res.json()
      setAdvisor(prev => ({
        ...prev,
        visibility_audits: [newAudit, ...prev.visibility_audits],
      }))
      setTab('audit')
    } finally {
      setAuditing(false)
    }
  }, [advisor.id])

  // ── Delete advisor ────────────────────────────────────────────────

  const deleteAdvisor = useCallback(async () => {
    if (!confirm(`Delete ${advisor.name}? This cannot be undone.`)) return
    await fetch(`/api/advisors/${advisor.id}`, { method: 'DELETE' })
    router.push('/audits')
  }, [advisor.id, advisor.name, router])

  // ─────────────────────────────────────────────────────────────────

  return (
    <div className="profile-shell">

      {/* Header */}
      <div className="profile-header">
        <div className="profile-header__left">
          <Link href="/audits" className="profile-back">
            <Icon name="arrow-left" size={14} /> All Advisors
          </Link>
          <h1 className="profile-name">{advisor.name}</h1>
          {advisor.title && <div className="profile-title">{advisor.title}</div>}
          {advisor.nmls_number && <div className="profile-nmls">NMLS# {advisor.nmls_number}</div>}
        </div>
        <div className="profile-header__actions">
          <button
            className="btn btn--primary"
            onClick={runAudit}
            disabled={auditing}
          >
            {auditing ? (
              <><span className="spinner" /> Running Audit...</>
            ) : (
              <><Icon name="sparkle" size={14} /> Run AI Audit</>
            )}
          </button>
          <button className="btn btn--ghost btn--danger" onClick={deleteAdvisor}>
            <Icon name="trash" size={14} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="profile-tabs">
        {(['profile', 'channels', 'audit'] as Tab[]).map(t => (
          <button
            key={t}
            className={`profile-tab${tab === t ? ' profile-tab--active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'profile' ? 'Profile / NAP' : t === 'channels' ? `Channels (${advisor.advisor_channels.length})` : 'Audit Results'}
            {t === 'audit' && latestAudit?.score != null && (
              <span className={`profile-tab-score ${latestAudit.score >= 70 ? 'green' : latestAudit.score >= 45 ? 'yellow' : 'red'}`}>
                {latestAudit.score}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Profile Tab ────────────────────────────────────────────── */}
      {tab === 'profile' && (
        <div className="profile-content">
          {!editing ? (
            <>
              <div className="profile-section">
                <div className="profile-section__head">
                  <h2>NAP Information</h2>
                  <button className="btn btn--ghost btn--sm" onClick={() => setEditing(true)}>
                    <Icon name="pencil" size={13} /> Edit
                  </button>
                </div>
                <div className="nap-grid">
                  {[
                    { label: 'Full Name',     value: advisor.name },
                    { label: 'Title',         value: advisor.title },
                    { label: 'Email',         value: advisor.email },
                    { label: 'Phone',         value: advisor.phone },
                    { label: 'NMLS#',         value: advisor.nmls_number },
                    { label: 'Address',       value: advisor.street_address },
                    { label: 'City',          value: advisor.city },
                    { label: 'State',         value: advisor.state },
                    { label: 'ZIP',           value: advisor.zip },
                    { label: 'Service Area',  value: advisor.service_area },
                  ].map(({ label, value }) => (
                    <div key={label} className="nap-row">
                      <span className="nap-row__label">{label}</span>
                      <span className="nap-row__value">{value ?? <em className="nap-empty">—</em>}</span>
                    </div>
                  ))}
                </div>
                {advisor.bio && (
                  <div className="nap-bio">
                    <div className="nap-row__label">Bio</div>
                    <p className="nap-bio__text">{advisor.bio}</p>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="profile-section">
              <div className="profile-section__head">
                <h2>Edit NAP Information</h2>
              </div>
              <div className="advisor-form">
                {([
                  { key: 'name',           label: 'Full Name *',    type: 'text'  },
                  { key: 'title',          label: 'Title',          type: 'text'  },
                  { key: 'email',          label: 'Email',          type: 'email' },
                  { key: 'phone',          label: 'Phone',          type: 'tel'   },
                  { key: 'nmls_number',    label: 'NMLS#',          type: 'text'  },
                  { key: 'street_address', label: 'Street Address', type: 'text'  },
                  { key: 'city',           label: 'City',           type: 'text'  },
                  { key: 'state',          label: 'State',          type: 'text'  },
                  { key: 'zip',            label: 'ZIP',            type: 'text'  },
                  { key: 'service_area',   label: 'Service Area',   type: 'text'  },
                ] as { key: keyof Advisor; label: string; type: string }[]).map(({ key, label, type }) => (
                  <div key={key} className="advisor-form__row">
                    <label>{label}</label>
                    <input
                      type={type}
                      value={(profileForm[key] as string) ?? ''}
                      onChange={e => setProfileForm(f => ({ ...f, [key]: e.target.value }))}
                    />
                  </div>
                ))}
                <div className="advisor-form__row">
                  <label>Bio</label>
                  <textarea
                    rows={4}
                    value={profileForm.bio ?? ''}
                    onChange={e => setProfileForm(f => ({ ...f, bio: e.target.value }))}
                  />
                </div>
                <div className="advisor-form__actions">
                  <button className="btn btn--ghost" onClick={() => { setEditing(false); setProfileForm({ ...advisor }) }}>Cancel</button>
                  <button className="btn btn--primary" onClick={saveProfile} disabled={saving}>
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Channels Tab ───────────────────────────────────────────── */}
      {tab === 'channels' && (
        <div className="profile-content">
          <div className="profile-section">
            <div className="profile-section__head">
              <h2>Online Channels</h2>
              {!editingChannels && (
                <button className="btn btn--ghost btn--sm" onClick={() => setEditingChannels(true)}>
                  <Icon name="pencil" size={13} /> Edit
                </button>
              )}
            </div>

            {!editingChannels ? (
              <>
                {advisor.advisor_channels.length === 0 ? (
                  <div className="channels-empty">
                    No channels yet. Add links to this advisor&apos;s online profiles.
                  </div>
                ) : (
                  <div className="channels-list">
                    {advisor.advisor_channels.map(ch => {
                      const meta = platformMeta(ch.platform)
                      return (
                        <a
                          key={ch.id}
                          href={ch.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="channel-row"
                        >
                          <span className="channel-row__icon">{meta.icon}</span>
                          <div className="channel-row__info">
                            <span className="channel-row__platform">{meta.label}</span>
                            {ch.label && <span className="channel-row__label">{ch.label}</span>}
                            <span className="channel-row__url">{ch.url}</span>
                          </div>
                          <Icon name="external-link" size={13} className="channel-row__ext" />
                        </a>
                      )
                    })}
                  </div>
                )}
              </>
            ) : (
              <div className="channels-edit">
                {/* Existing channels */}
                {channelDraft.map((ch, i) => {
                  const meta = platformMeta(ch.platform)
                  return (
                    <div key={i} className="channel-edit-row">
                      <span className="channel-row__icon">{meta.icon}</span>
                      <div className="channel-edit-row__fields">
                        <select
                          value={ch.platform}
                          onChange={e => setChannelDraft(d => d.map((c, j) => j === i ? { ...c, platform: e.target.value as AdvisorChannelPlatform } : c))}
                        >
                          {ADVISOR_PLATFORMS.map(p => (
                            <option key={p.value} value={p.value}>{p.icon} {p.label}</option>
                          ))}
                        </select>
                        <input
                          placeholder="URL"
                          value={ch.url}
                          onChange={e => setChannelDraft(d => d.map((c, j) => j === i ? { ...c, url: e.target.value } : c))}
                        />
                        <input
                          placeholder="Label (optional)"
                          value={ch.label ?? ''}
                          onChange={e => setChannelDraft(d => d.map((c, j) => j === i ? { ...c, label: e.target.value } : c))}
                        />
                      </div>
                      <button
                        className="btn btn--ghost btn--icon"
                        onClick={() => setChannelDraft(d => d.filter((_, j) => j !== i))}
                      >
                        <Icon name="x" size={14} />
                      </button>
                    </div>
                  )
                })}

                {/* Add new channel */}
                <div className="channel-edit-row channel-edit-row--new">
                  <span className="channel-row__icon">{platformMeta(newChannel.platform).icon}</span>
                  <div className="channel-edit-row__fields">
                    <select
                      value={newChannel.platform}
                      onChange={e => setNewChannel(c => ({ ...c, platform: e.target.value as AdvisorChannelPlatform }))}
                    >
                      {ADVISOR_PLATFORMS.map(p => (
                        <option key={p.value} value={p.value}>{p.icon} {p.label}</option>
                      ))}
                    </select>
                    <input
                      placeholder="URL"
                      value={newChannel.url}
                      onChange={e => setNewChannel(c => ({ ...c, url: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && addChannel()}
                    />
                    <input
                      placeholder="Label (optional)"
                      value={newChannel.label}
                      onChange={e => setNewChannel(c => ({ ...c, label: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && addChannel()}
                    />
                  </div>
                  <button className="btn btn--ghost btn--sm" onClick={addChannel}>Add</button>
                </div>

                <div className="advisor-form__actions">
                  <button className="btn btn--ghost" onClick={() => { setEditingChannels(false); setChannelDraft(advisor.advisor_channels.map(c => ({ platform: c.platform, url: c.url, label: c.label }))); }}>
                    Cancel
                  </button>
                  <button className="btn btn--primary" onClick={saveChannels} disabled={saving}>
                    {saving ? 'Saving...' : 'Save Channels'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Audit Tab ──────────────────────────────────────────────── */}
      {tab === 'audit' && (
        <div className="profile-content">
          {latestAudit == null ? (
            <div className="audit-empty">
              <Icon name="sparkle" size={32} />
              <p>No audit run yet.</p>
              <button className="btn btn--primary" onClick={runAudit} disabled={auditing}>
                {auditing ? 'Running...' : 'Run First Audit'}
              </button>
            </div>
          ) : latestAudit.status === 'RUNNING' ? (
            <div className="audit-running">
              <span className="spinner spinner--lg" />
              <p>Audit is running...</p>
            </div>
          ) : latestAudit.status === 'FAILED' ? (
            <div className="audit-empty">
              <p>Last audit failed.</p>
              <button className="btn btn--primary" onClick={runAudit} disabled={auditing}>Retry</button>
            </div>
          ) : (
            <div className="audit-results">

              {/* Score summary */}
              <div className="audit-top">
                {latestAudit.score != null && <ScoreGauge score={latestAudit.score} />}
                <div className="audit-summary">
                  <div className="audit-summary__date">
                    Last audit: {new Date(latestAudit.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                  {latestAudit.raw_result?.summary && (
                    <p className="audit-summary__text">{latestAudit.raw_result.summary}</p>
                  )}
                </div>
              </div>

              {/* Score breakdown */}
              {latestAudit.score_breakdown && (
                <div className="audit-section">
                  <h3>Score Breakdown</h3>
                  <div className="score-breakdown">
                    {(Object.entries(latestAudit.score_breakdown) as [string, { score: number; max: number; notes: string }][]).map(([key, val]) => {
                      const labels: Record<string, string> = {
                        listingsHealth: 'Listings Health',
                        reviews: 'Reviews',
                        websiteLocal: 'Website / Local SEO',
                        brandConsistency: 'Brand Consistency',
                        aiSearchReadiness: 'AI Search Readiness',
                      }
                      const pct = Math.round((val.score / val.max) * 100)
                      const color = pct >= 70 ? '#22c55e' : pct >= 45 ? '#f59e0b' : '#ef4444'
                      return (
                        <div key={key} className="score-row">
                          <div className="score-row__label">{labels[key] ?? key}</div>
                          <div className="score-row__bar-wrap">
                            <div className="score-row__bar">
                              <div className="score-row__fill" style={{ width: `${pct}%`, background: color }} />
                            </div>
                            <span className="score-row__num">{val.score}/{val.max}</span>
                          </div>
                          {val.notes && <div className="score-row__notes">{val.notes}</div>}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Action items */}
              {latestAudit.action_items && latestAudit.action_items.length > 0 && (
                <div className="audit-section">
                  <h3>Action Items</h3>
                  <div className="action-list">
                    {(latestAudit.action_items as AuditActionItem[]).map((item, i) => (
                      <div key={i} className="action-item">
                        <span className="action-item__rank">{item.rank}</span>
                        <div className="action-item__body">
                          <div className="action-item__top">
                            <span className="action-item__platform">{item.platform}</span>
                            <ImpactBadge impact={item.impact} />
                          </div>
                          <div className="action-item__action">{item.action}</div>
                          {item.url && (
                            <a href={item.url} target="_blank" rel="noopener noreferrer" className="action-item__url">
                              {item.url}
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* NAP Conflicts */}
              {latestAudit.conflicts && latestAudit.conflicts.length > 0 && (
                <div className="audit-section">
                  <h3>NAP Conflicts</h3>
                  <div className="conflicts-list">
                    {(latestAudit.conflicts as AuditConflict[]).map((c, i) => (
                      <div key={i} className="conflict-card">
                        <div className="conflict-card__field">{c.field}</div>
                        <div className="conflict-card__canonical">Canonical: <strong>{c.canonical}</strong></div>
                        {c.issues.map((issue, j) => (
                          <div key={j} className="conflict-card__issue">
                            <Icon name="alert" size={12} />
                            <span>{issue.platform}: <em>{issue.found}</em></span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Social status */}
              {latestAudit.socials && latestAudit.socials.length > 0 && (
                <div className="audit-section">
                  <h3>Channel Assessment</h3>
                  <div className="socials-list">
                    {(latestAudit.socials as AuditSocialStatus[]).map((s, i) => (
                      <div key={i} className="social-row">
                        <span className="social-row__icon">{platformMeta(s.platform).icon}</span>
                        <div className="social-row__info">
                          <div className="social-row__top">
                            <span className="social-row__platform">{s.platform}</span>
                            <StatusBadge status={s.status} />
                          </div>
                          {s.notes && <div className="social-row__notes">{s.notes}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Query visibility */}
              {latestAudit.query_visibility && latestAudit.query_visibility.length > 0 && (
                <div className="audit-section">
                  <h3>Search Visibility</h3>
                  <div className="query-list">
                    {(latestAudit.query_visibility as AuditQueryVisibility[]).map((q, i) => (
                      <div key={i} className="query-row">
                        <div className="query-row__query">"{q.query}"</div>
                        <span className={`query-type query-type--${q.type}`}>{q.type.replace('_', ' ')}</span>
                        <div className="query-row__assessment">{q.assessment}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Discovery queries */}
              {latestAudit.raw_result?.discoveryQueries && latestAudit.raw_result.discoveryQueries.length > 0 && (
                <div className="audit-section">
                  <h3>Recommended Discovery Queries</h3>
                  <div className="discovery-queries">
                    {latestAudit.raw_result.discoveryQueries.map((q, i) => (
                      <div key={i} className="discovery-query">
                        <Icon name="search" size={12} /> {q}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Audit history */}
              {advisor.visibility_audits.length > 1 && (
                <div className="audit-section">
                  <h3>Audit History</h3>
                  <div className="audit-history">
                    {advisor.visibility_audits.map((a, i) => (
                      <div key={a.id} className={`audit-history-row${i === 0 ? ' audit-history-row--current' : ''}`}>
                        <span>{new Date(a.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                        <span className={`audit-score audit-score--${a.score != null ? (a.score >= 70 ? 'green' : a.score >= 45 ? 'yellow' : 'red') : 'none'}`}>
                          {a.score != null ? `${a.score}/100` : a.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
