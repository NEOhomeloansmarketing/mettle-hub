'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Advisor, AdvisorChannel, VisibilityAudit } from '@/lib/types'
import { ADVISOR_PLATFORMS } from '@/lib/types'
import { Icon } from '@/components/ui/Icon'

interface AdvisorWithRelations extends Advisor {
  advisor_channels: AdvisorChannel[]
  visibility_audits: Pick<VisibilityAudit, 'id' | 'status' | 'score' | 'created_at' | 'completed_at'>[]
}

interface AuditsViewProps {
  initialAdvisors: AdvisorWithRelations[]
}

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

function platformIcon(platform: string) {
  return ADVISOR_PLATFORMS.find(p => p.value === platform)?.icon ?? '🔗'
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="score-badge score-badge--none">No audit</span>
  const cls = score >= 70 ? 'green' : score >= 45 ? 'yellow' : 'red'
  return <span className={`score-badge score-badge--${cls}`}>{score}/100</span>
}

const EMPTY_FORM = {
  name: '', title: '', email: '', phone: '',
  nmls_number: '', business_name: '', team_name: '',
  street_address: '', city: '', state: '', zip: '',
  service_area: '', bio: '',
}

export function AuditsView({ initialAdvisors }: AuditsViewProps) {
  const router = useRouter()
  const [advisors, setAdvisors] = useState(initialAdvisors)
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)

  const set = (key: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value }))

  const filtered = advisors.filter(a =>
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    (a.title ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (a.city ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (a.state ?? '').toLowerCase().includes(search.toLowerCase())
  )

  const handleAdd = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const { business_name, team_name, ...rest } = form
      const metadata: Record<string, string> = {}
      if (business_name) metadata.business_name = business_name
      if (team_name) metadata.team_name = team_name

      const res = await fetch('/api/advisors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...rest, ...(Object.keys(metadata).length ? { metadata } : {}) }),
      })
      const newAdvisor = await res.json()
      setAdvisors(prev => [{ ...newAdvisor, advisor_channels: [], visibility_audits: [] }, ...prev])
      setShowAdd(false)
      setForm(EMPTY_FORM)
      router.push(`/audits/${newAdvisor.id}`)
    } finally {
      setSaving(false)
    }
  }, [form, router])

  return (
    <div className="audits-shell">

      {/* Page header */}
      <div className="audits-header">
        <div>
          <h1 className="audits-title">Marketing Audits</h1>
          <p className="audits-sub">Digital visibility profiles and AI-powered audits for the advisor team</p>
        </div>
        <button className="btn btn--primary" onClick={() => setShowAdd(true)}>
          <Icon name="plus" size={14} /> Add Advisor
        </button>
      </div>

      {/* Search toolbar */}
      <div className="audits-toolbar">
        <div className="audits-search-wrap">
          <Icon name="search" size={14} />
          <input
            className="audits-search"
            placeholder="Search by name, title, location..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <span className="audits-count">{filtered.length} advisor{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Advisor grid */}
      <div className="advisor-grid">
        {filtered.map(advisor => {
          const latestAudit = advisor.visibility_audits[0] ?? null
          const color = avatarColor(advisor.name)
          return (
            <Link key={advisor.id} href={`/audits/${advisor.id}`} className="advisor-card">
              <div className="advisor-card__head">
                <div className="advisor-avatar" style={{ background: color }}>
                  {initials(advisor.name)}
                </div>
                <div className="advisor-card__meta">
                  <div className="advisor-card__name">{advisor.name}</div>
                  {advisor.title && <div className="advisor-card__title">{advisor.title}</div>}
                  {(advisor.city || advisor.state) && (
                    <div className="advisor-card__location">
                      <Icon name="pin" size={11} />
                      {[advisor.city, advisor.state].filter(Boolean).join(', ')}
                    </div>
                  )}
                </div>
                <div className="advisor-card__score-wrap">
                  <ScoreBadge score={latestAudit?.score ?? null} />
                </div>
              </div>

              {advisor.advisor_channels.length > 0 && (
                <div className="advisor-card__channels">
                  {advisor.advisor_channels.slice(0, 7).map(ch => (
                    <span key={ch.id} className="advisor-channel-dot" title={ch.platform}>
                      {platformIcon(ch.platform)}
                    </span>
                  ))}
                  {advisor.advisor_channels.length > 7 && (
                    <span className="advisor-channel-more">+{advisor.advisor_channels.length - 7}</span>
                  )}
                </div>
              )}

              <div className="advisor-card__foot">
                {advisor.nmls_number
                  ? <span className="advisor-card__nmls">NMLS# {advisor.nmls_number}</span>
                  : <span className="advisor-card__nmls" style={{ opacity: 0.4 }}>No NMLS</span>
                }
                {advisor.advisor_channels.length === 0 && (
                  <span className="advisor-card__no-channels">No channels yet</span>
                )}
              </div>
            </Link>
          )
        })}

        {filtered.length === 0 && (
          <div className="audits-empty">
            <Icon name="users" size={36} />
            <p style={{ margin: 0 }}>
              {search ? 'No advisors match your search.' : 'No advisors yet. Add one to get started.'}
            </p>
          </div>
        )}
      </div>

      {/* Add advisor modal */}
      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <div className="modal__head">
              <h2>Add Advisor</h2>
              <button className="modal__close" onClick={() => setShowAdd(false)}>
                <Icon name="x" size={16} />
              </button>
            </div>

            <form onSubmit={handleAdd} className="advisor-form">

              <div>
                <div className="advisor-form__section-label">Identity</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
                  <div className="advisor-form__row">
                    <label>Full Name *</label>
                    <input required value={form.name} onChange={set('name')} placeholder="Josh Mettle" />
                  </div>
                  <div className="advisor-form__grid2">
                    <div className="advisor-form__row">
                      <label>Title</label>
                      <input value={form.title} onChange={set('title')} placeholder="Mortgage Advisor" />
                    </div>
                    <div className="advisor-form__row">
                      <label>NMLS#</label>
                      <input value={form.nmls_number} onChange={set('nmls_number')} placeholder="1234567" />
                    </div>
                  </div>
                  <div className="advisor-form__grid2">
                    <div className="advisor-form__row">
                      <label>Business Name</label>
                      <input value={form.business_name} onChange={set('business_name')} placeholder="NEO Home Loans" />
                    </div>
                    <div className="advisor-form__row">
                      <label>Team / Brand Name</label>
                      <input value={form.team_name} onChange={set('team_name')} placeholder="Team Mettle" />
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <div className="advisor-form__section-label">Contact</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14 }}>
                  <div className="advisor-form__row">
                    <label>Email</label>
                    <input type="email" value={form.email} onChange={set('email')} />
                  </div>
                  <div className="advisor-form__row">
                    <label>Phone</label>
                    <input type="tel" value={form.phone} onChange={set('phone')} />
                  </div>
                </div>
              </div>

              <div>
                <div className="advisor-form__section-label">Location</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
                  <div className="advisor-form__row">
                    <label>Street Address</label>
                    <input value={form.street_address} onChange={set('street_address')} />
                  </div>
                  <div className="advisor-form__grid3">
                    <div className="advisor-form__row">
                      <label>City</label>
                      <input value={form.city} onChange={set('city')} />
                    </div>
                    <div className="advisor-form__row">
                      <label>State</label>
                      <input value={form.state} onChange={set('state')} placeholder="UT" maxLength={2} />
                    </div>
                    <div className="advisor-form__row">
                      <label>ZIP</label>
                      <input value={form.zip} onChange={set('zip')} />
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <div className="advisor-form__section-label">Market Profile</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
                  <div className="advisor-form__row">
                    <label>Service Area / Top Markets</label>
                    <input value={form.service_area} onChange={set('service_area')} placeholder="Utah, Colorado, Nevada..." />
                  </div>
                  <div className="advisor-form__row">
                    <label>Who You Serve / Target Market</label>
                    <textarea rows={2} value={form.bio} onChange={set('bio')} placeholder="Physicians, CRNAs, and high-income earners..." />
                  </div>
                </div>
              </div>

              <div className="modal__foot">
                <button type="button" className="btn btn--ghost" onClick={() => setShowAdd(false)}>Cancel</button>
                <button type="submit" className="btn btn--primary" disabled={saving}>
                  {saving ? 'Creating...' : 'Create Advisor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
