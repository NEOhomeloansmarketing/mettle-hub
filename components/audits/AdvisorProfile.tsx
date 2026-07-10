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

type EditSection = 'identity' | 'contact' | 'location' | 'market' | null

// ── Module-level helpers ──────────────────────────────────────────────

const AVATAR_COLORS = [
  '#6366f1','#8b5cf6','#ec4899','#14b8a6',
  '#f59e0b','#ef4444','#22c55e','#3b82f6','#f97316','#06b6d4',
]

function avatarColor(name: string) {
  let h = 0
  for (const c of name) h = ((h << 5) - h + c.charCodeAt(0)) | 0
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

function platformMeta(platform: string) {
  return ADVISOR_PLATFORMS.find(p => p.value === platform) ?? { label: platform, icon: '🔗', value: platform }
}

// ── Sub-components (defined at module level) ──────────────────────────

function ScoreGauge({ score }: { score: number }) {
  const color = score >= 70 ? '#22c55e' : score >= 45 ? '#f59e0b' : '#ef4444'
  const pct = Math.min(100, Math.max(0, score))
  return (
    <div className="score-gauge">
      <svg viewBox="0 0 120 120" className="score-gauge__svg">
        <circle cx="60" cy="60" r="50" fill="none" stroke="var(--line-soft)" strokeWidth="10" />
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

function FieldItem({
  label, value, mono, wide,
}: { label: string; value?: string | null; mono?: boolean; wide?: boolean }) {
  return (
    <div className={`field-item${wide ? ' field-item--wide' : ''}`}>
      <div className="field-label">{label}</div>
      {value
        ? <div className={`field-value${mono ? ' field-value--mono' : ''}`}>{value}</div>
        : <div className="field-value field-value--empty">—</div>
      }
    </div>
  )
}

function SectionCard({
  id, title, editSection, onEdit, saving, onSave, onCancel, editForm, children,
}: {
  id: EditSection
  title: string
  editSection: EditSection
  onEdit: (id: EditSection) => void
  saving: boolean
  onSave: (id: EditSection) => void
  onCancel: () => void
  editForm: React.ReactNode
  children: React.ReactNode
}) {
  const isEditing = editSection === id
  return (
    <div className="prof-section">
      <div className="prof-section__head">
        <div className="prof-section__title">{title}</div>
        {!isEditing && (
          <button className="btn btn--ghost btn--sm" onClick={() => onEdit(id)}>
            <Icon name="pencil" size={12} /> Edit
          </button>
        )}
      </div>
      <div className="prof-section__body">
        {isEditing ? (
          <div className="section-form">
            {editForm}
            <div className="section-form__actions">
              <button className="btn btn--ghost" onClick={onCancel}>Cancel</button>
              <button className="btn btn--primary" onClick={() => onSave(id)} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        ) : children}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────

type Tab = 'profile' | 'channels' | 'audit'

export function AdvisorProfile({ advisor: initial }: AdvisorProfileProps) {
  const router = useRouter()
  const [advisor, setAdvisor] = useState(initial)
  const [tab, setTab] = useState<Tab>('profile')
  const [editSection, setEditSection] = useState<EditSection>(null)
  const [saving, setSaving] = useState(false)
  const [auditing, setAuditing] = useState(false)

  const [form, setForm] = useState({
    name:           initial.name,
    title:          initial.title ?? '',
    email:          initial.email ?? '',
    phone:          initial.phone ?? '',
    nmls_number:    initial.nmls_number ?? '',
    business_name:  initial.metadata?.business_name ?? '',
    team_name:      initial.metadata?.team_name ?? '',
    street_address: initial.street_address ?? '',
    city:           initial.city ?? '',
    state:          initial.state ?? '',
    zip:            initial.zip ?? '',
    service_area:   initial.service_area ?? '',
    bio:            initial.bio ?? '',
    competitors:    initial.metadata?.competitors ?? '',
  })

  const setF = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value }))

  // Channel editing
  const [editingChannels, setEditingChannels] = useState(false)
  const [channelDraft, setChannelDraft] = useState<Omit<AdvisorChannel, 'id' | 'advisor_id' | 'created_at'>[]>(
    initial.advisor_channels.map(c => ({ platform: c.platform, url: c.url, label: c.label }))
  )
  const [newChannel, setNewChannel] = useState<{ platform: AdvisorChannelPlatform; url: string; label: string }>({
    platform: 'google_business', url: '', label: '',
  })

  const latestAudit = advisor.visibility_audits[0] ?? null
  const color = avatarColor(advisor.name)

  // ── Section save ──────────────────────────────────────────────────

  const saveSection = useCallback(async (section: EditSection) => {
    if (!section) return
    setSaving(true)
    try {
      let payload: Record<string, unknown> = {}

      if (section === 'identity') {
        payload = {
          name:        form.name,
          title:       form.title || null,
          nmls_number: form.nmls_number || null,
          metadata: {
            ...(advisor.metadata ?? {}),
            business_name: form.business_name || undefined,
            team_name:     form.team_name || undefined,
          },
        }
      } else if (section === 'contact') {
        payload = { email: form.email || null, phone: form.phone || null }
      } else if (section === 'location') {
        payload = {
          street_address: form.street_address || null,
          city:  form.city  || null,
          state: form.state || null,
          zip:   form.zip   || null,
        }
      } else if (section === 'market') {
        payload = {
          service_area: form.service_area || null,
          bio:          form.bio || null,
          metadata: {
            ...(advisor.metadata ?? {}),
            competitors: form.competitors || undefined,
          },
        }
      }

      const res = await fetch(`/api/advisors/${advisor.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const updated = await res.json()
      setAdvisor(prev => ({ ...prev, ...updated }))
      setEditSection(null)
    } finally {
      setSaving(false)
    }
  }, [advisor.id, advisor.metadata, form])

  const cancelSection = useCallback(() => {
    setForm({
      name:           advisor.name,
      title:          advisor.title ?? '',
      email:          advisor.email ?? '',
      phone:          advisor.phone ?? '',
      nmls_number:    advisor.nmls_number ?? '',
      business_name:  advisor.metadata?.business_name ?? '',
      team_name:      advisor.metadata?.team_name ?? '',
      street_address: advisor.street_address ?? '',
      city:           advisor.city ?? '',
      state:          advisor.state ?? '',
      zip:            advisor.zip ?? '',
      service_area:   advisor.service_area ?? '',
      bio:            advisor.bio ?? '',
      competitors:    advisor.metadata?.competitors ?? '',
    })
    setEditSection(null)
  }, [advisor])

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
      setAdvisor(prev => ({ ...prev, visibility_audits: [newAudit, ...prev.visibility_audits] }))
      setTab('audit')
    } finally {
      setAuditing(false)
    }
  }, [advisor.id])

  // ── Delete ────────────────────────────────────────────────────────

  const deleteAdvisor = useCallback(async () => {
    if (!confirm(`Delete ${advisor.name}? This cannot be undone.`)) return
    await fetch(`/api/advisors/${advisor.id}`, { method: 'DELETE' })
    router.push('/audits')
  }, [advisor.id, advisor.name, router])

  // ─────────────────────────────────────────────────────────────────

  return (
    <div className="profile-shell">

      <Link href="/audits" className="profile-back">
        <Icon name="arrow-left" size={13} /> All Advisors
      </Link>

      {/* Hero */}
      <div className="profile-hero">
        <div className="profile-hero__avatar" style={{ background: color }}>
          {initials(advisor.name)}
        </div>
        <div className="profile-hero__info">
          <div className="profile-hero__name">{advisor.name}</div>
          {advisor.title && <div className="profile-hero__title">{advisor.title}</div>}
          <div className="profile-hero__meta">
            {advisor.nmls_number && (
              <span className="profile-hero__chip">NMLS# {advisor.nmls_number}</span>
            )}
            {(advisor.city || advisor.state) && (
              <span className="profile-hero__chip">
                <Icon name="pin" size={11} />
                {[advisor.city, advisor.state].filter(Boolean).join(', ')}
              </span>
            )}
            {advisor.advisor_channels.length > 0 && (
              <span className="profile-hero__chip">
                {advisor.advisor_channels.length} channel{advisor.advisor_channels.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
        <div className="profile-hero__actions">
          <button className="btn btn--primary" onClick={runAudit} disabled={auditing}>
            {auditing
              ? <><span className="spinner" /> Running...</>
              : <><Icon name="sparkle" size={14} /> Run AI Audit</>
            }
          </button>
          <button className="btn btn--ghost btn--danger" onClick={deleteAdvisor} title="Delete advisor">
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
            {t === 'profile' ? 'Profile'
              : t === 'channels' ? `Channels (${advisor.advisor_channels.length})`
              : 'Audit Results'}
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

          <SectionCard
            id="identity" title="Identity & Brand"
            editSection={editSection} onEdit={setEditSection}
            saving={saving} onSave={saveSection} onCancel={cancelSection}
            editForm={
              <div className="section-form__grid">
                <div className="section-form__row">
                  <label>Full Name</label>
                  <input value={form.name} onChange={setF('name')} />
                </div>
                <div className="section-form__row">
                  <label>Title</label>
                  <input value={form.title} onChange={setF('title')} placeholder="Mortgage Advisor" />
                </div>
                <div className="section-form__row">
                  <label>NMLS#</label>
                  <input value={form.nmls_number} onChange={setF('nmls_number')} />
                </div>
                <div className="section-form__row">
                  <label>Business Name</label>
                  <input value={form.business_name} onChange={setF('business_name')} placeholder="NEO Home Loans" />
                </div>
                <div className="section-form__row section-form__row--span">
                  <label>Team / Brand Name</label>
                  <input value={form.team_name} onChange={setF('team_name')} placeholder="Team Mettle" />
                </div>
              </div>
            }
          >
            <div className="field-grid">
              <FieldItem label="Full Name"         value={advisor.name} />
              <FieldItem label="Title"              value={advisor.title} />
              <FieldItem label="NMLS#"              value={advisor.nmls_number} mono />
              <FieldItem label="Business Name"      value={advisor.metadata?.business_name} />
              <FieldItem label="Team / Brand Name"  value={advisor.metadata?.team_name} />
            </div>
          </SectionCard>

          <SectionCard
            id="contact" title="Contact Information"
            editSection={editSection} onEdit={setEditSection}
            saving={saving} onSave={saveSection} onCancel={cancelSection}
            editForm={
              <div className="section-form__grid">
                <div className="section-form__row">
                  <label>Email</label>
                  <input type="email" value={form.email} onChange={setF('email')} />
                </div>
                <div className="section-form__row">
                  <label>Phone</label>
                  <input type="tel" value={form.phone} onChange={setF('phone')} />
                </div>
              </div>
            }
          >
            <div className="field-grid">
              <FieldItem label="Email" value={advisor.email} />
              <FieldItem label="Phone" value={advisor.phone} />
            </div>
          </SectionCard>

          <SectionCard
            id="location" title="Location / NAP"
            editSection={editSection} onEdit={setEditSection}
            saving={saving} onSave={saveSection} onCancel={cancelSection}
            editForm={
              <div className="section-form__grid">
                <div className="section-form__row section-form__row--span">
                  <label>Street Address</label>
                  <input value={form.street_address} onChange={setF('street_address')} />
                </div>
                <div className="section-form__row">
                  <label>City</label>
                  <input value={form.city} onChange={setF('city')} />
                </div>
                <div className="section-form__row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div className="section-form__row">
                    <label>State</label>
                    <input value={form.state} onChange={setF('state')} maxLength={2} placeholder="UT" />
                  </div>
                  <div className="section-form__row">
                    <label>ZIP</label>
                    <input value={form.zip} onChange={setF('zip')} />
                  </div>
                </div>
              </div>
            }
          >
            <div className="field-grid">
              <FieldItem label="Street Address" value={advisor.street_address} wide />
              <FieldItem label="City"  value={advisor.city} />
              <FieldItem label="State" value={advisor.state} />
              <FieldItem label="ZIP"   value={advisor.zip} mono />
            </div>
          </SectionCard>

          <SectionCard
            id="market" title="Market Profile"
            editSection={editSection} onEdit={setEditSection}
            saving={saving} onSave={saveSection} onCancel={cancelSection}
            editForm={
              <div className="section-form__grid">
                <div className="section-form__row section-form__row--span">
                  <label>Service Area / Top Markets</label>
                  <input
                    value={form.service_area}
                    onChange={setF('service_area')}
                    placeholder="Utah, Colorado, Nevada, Arizona..."
                  />
                </div>
                <div className="section-form__row section-form__row--span">
                  <label>Who You Serve / Target Market</label>
                  <textarea
                    rows={3} value={form.bio} onChange={setF('bio')}
                    placeholder="Physicians, CRNAs, and high-income professionals..."
                  />
                </div>
                <div className="section-form__row section-form__row--span">
                  <label>Top Competitors</label>
                  <textarea
                    rows={2} value={form.competitors} onChange={setF('competitors')}
                    placeholder="Local credit unions, national lenders..."
                  />
                </div>
              </div>
            }
          >
            <div className="field-grid field-grid--1col">
              <FieldItem label="Service Area / Top Markets"    value={advisor.service_area} />
              <FieldItem label="Who You Serve / Target Market" value={advisor.bio} />
              <FieldItem label="Top Competitors"               value={advisor.metadata?.competitors} />
            </div>
          </SectionCard>

        </div>
      )}

      {/* ── Channels Tab ───────────────────────────────────────────── */}
      {tab === 'channels' && (
        <div className="profile-content">
          <div className="prof-section">
            <div className="prof-section__head">
              <div className="prof-section__title">Online Channels</div>
              {!editingChannels && (
                <button className="btn btn--ghost btn--sm" onClick={() => setEditingChannels(true)}>
                  <Icon name="pencil" size={12} /> Edit
                </button>
              )}
            </div>
            <div className="prof-section__body">
              {!editingChannels ? (
                advisor.advisor_channels.length === 0 ? (
                  <div className="channels-empty">
                    No channels added yet. Click Edit to add links to this advisor&apos;s online profiles.
                  </div>
                ) : (
                  <div className="channels-list">
                    {advisor.advisor_channels.map(ch => {
                      const meta = platformMeta(ch.platform)
                      return (
                        <a key={ch.id} href={ch.url} target="_blank" rel="noopener noreferrer" className="channel-row">
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
                )
              ) : (
                <div className="channels-edit">
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
                        <button className="btn btn--ghost btn--icon" onClick={() => setChannelDraft(d => d.filter((_, j) => j !== i))}>
                          <Icon name="x" size={14} />
                        </button>
                      </div>
                    )
                  })}

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

                  <div className="section-form__actions">
                    <button className="btn btn--ghost" onClick={() => {
                      setEditingChannels(false)
                      setChannelDraft(advisor.advisor_channels.map(c => ({ platform: c.platform, url: c.url, label: c.label })))
                    }}>
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
        </div>
      )}

      {/* ── Audit Tab ──────────────────────────────────────────────── */}
      {tab === 'audit' && (
        <div className="profile-content">
          {latestAudit == null ? (
            <div className="audit-empty">
              <Icon name="sparkle" size={36} />
              <p style={{ margin: 0 }}>No audit run yet.</p>
              <button className="btn btn--primary" onClick={runAudit} disabled={auditing}>
                {auditing ? <><span className="spinner" /> Running...</> : 'Run First Audit'}
              </button>
            </div>
          ) : latestAudit.status === 'RUNNING' ? (
            <div className="audit-running">
              <span className="spinner spinner--lg" />
              <p style={{ margin: 0 }}>AI audit in progress...</p>
            </div>
          ) : latestAudit.status === 'FAILED' ? (
            <div className="audit-empty">
              <p style={{ margin: 0 }}>Last audit failed.</p>
              <button className="btn btn--primary" onClick={runAudit} disabled={auditing}>Retry</button>
            </div>
          ) : (
            <div className="audit-results">

              <div className="audit-score-card">
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

              {latestAudit.score_breakdown && (
                <div className="audit-section">
                  <h3>Score Breakdown</h3>
                  <div className="score-breakdown">
                    {(Object.entries(latestAudit.score_breakdown) as [string, { score: number; max: number; notes: string }][]).map(([key, val]) => {
                      const labels: Record<string, string> = {
                        listingsHealth:    'Listings Health',
                        reviews:           'Reviews',
                        websiteLocal:      'Website / Local SEO',
                        brandConsistency:  'Brand Consistency',
                        aiSearchReadiness: 'AI Search Readiness',
                      }
                      const pct = Math.round((val.score / val.max) * 100)
                      const fill = pct >= 70 ? '#22c55e' : pct >= 45 ? '#f59e0b' : '#ef4444'
                      return (
                        <div key={key} className="score-row">
                          <div className="score-row__label">{labels[key] ?? key}</div>
                          <div className="score-row__bar-wrap">
                            <div className="score-row__bar">
                              <div className="score-row__fill" style={{ width: `${pct}%`, background: fill }} />
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

              {latestAudit.socials && latestAudit.socials.length > 0 && (
                <div className="audit-section">
                  <h3>Channel Assessment</h3>
                  <div className="socials-list">
                    {(latestAudit.socials as AuditSocialStatus[]).map((s, i) => (
                      <div key={i} className="social-row">
                        <span className="social-row__icon">{platformMeta(s.platform).icon}</span>
                        <div className="social-row__info">
                          <div className="social-row__top">
                            <span className="social-row__platform">{platformMeta(s.platform).label}</span>
                            <StatusBadge status={s.status} />
                          </div>
                          {s.notes && <div className="social-row__notes">{s.notes}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {latestAudit.query_visibility && latestAudit.query_visibility.length > 0 && (
                <div className="audit-section">
                  <h3>Search Visibility</h3>
                  <div className="query-list">
                    {(latestAudit.query_visibility as AuditQueryVisibility[]).map((q, i) => (
                      <div key={i} className="query-row">
                        <div className="query-row__query">&ldquo;{q.query}&rdquo;</div>
                        <span className={`query-type query-type--${q.type}`}>{q.type.replace('_', ' ')}</span>
                        <div className="query-row__assessment">{q.assessment}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

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
