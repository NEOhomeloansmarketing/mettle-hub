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

function ScorePill({ score }: { score: number | null }) {
  if (score === null) return <span className="audit-score audit-score--none">No audit</span>
  const color = score >= 70 ? 'green' : score >= 45 ? 'yellow' : 'red'
  return <span className={`audit-score audit-score--${color}`}>{score}/100</span>
}

function platformIcon(platform: string) {
  return ADVISOR_PLATFORMS.find(p => p.value === platform)?.icon ?? '🔗'
}

export function AuditsView({ initialAdvisors }: AuditsViewProps) {
  const router = useRouter()
  const [advisors, setAdvisors] = useState(initialAdvisors)
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    name: '', title: '', email: '', phone: '',
    nmls_number: '', street_address: '', city: '', state: '', zip: '',
    service_area: '', bio: '',
  })

  const filtered = advisors.filter(a =>
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    (a.city ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (a.state ?? '').toLowerCase().includes(search.toLowerCase())
  )

  const handleAdd = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch('/api/advisors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const newAdvisor = await res.json()
      setAdvisors(prev => [{ ...newAdvisor, advisor_channels: [], visibility_audits: [] }, ...prev])
      setShowAdd(false)
      setForm({ name: '', title: '', email: '', phone: '', nmls_number: '', street_address: '', city: '', state: '', zip: '', service_area: '', bio: '' })
      router.push(`/audits/${newAdvisor.id}`)
    } finally {
      setSaving(false)
    }
  }, [form, router])

  return (
    <div className="audits-shell">
      <div className="audits-header">
        <div>
          <h1 className="audits-title">Marketing Audits</h1>
          <p className="audits-sub">Digital visibility profiles for mortgage advisors</p>
        </div>
        <button className="btn btn--primary" onClick={() => setShowAdd(true)}>
          <Icon name="plus" size={14} /> Add Advisor
        </button>
      </div>

      <div className="audits-toolbar">
        <input
          className="audits-search"
          placeholder="Search advisors..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <span className="audits-count">{filtered.length} advisor{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="advisor-grid">
        {filtered.map(advisor => {
          const latestAudit = advisor.visibility_audits[0] ?? null
          return (
            <Link key={advisor.id} href={`/audits/${advisor.id}`} className="advisor-card">
              <div className="advisor-card__top">
                <div className="advisor-card__info">
                  <div className="advisor-card__name">{advisor.name}</div>
                  {advisor.title && <div className="advisor-card__title">{advisor.title}</div>}
                  {(advisor.city || advisor.state) && (
                    <div className="advisor-card__location">
                      <Icon name="pin" size={12} />
                      {[advisor.city, advisor.state].filter(Boolean).join(', ')}
                    </div>
                  )}
                </div>
                <ScorePill score={latestAudit?.score ?? null} />
              </div>

              <div className="advisor-card__channels">
                {advisor.advisor_channels.slice(0, 6).map(ch => (
                  <span key={ch.id} className="advisor-channel-dot" title={ch.platform}>
                    {platformIcon(ch.platform)}
                  </span>
                ))}
                {advisor.advisor_channels.length > 6 && (
                  <span className="advisor-channel-more">+{advisor.advisor_channels.length - 6}</span>
                )}
                {advisor.advisor_channels.length === 0 && (
                  <span className="advisor-card__no-channels">No channels yet</span>
                )}
              </div>

              {advisor.nmls_number && (
                <div className="advisor-card__nmls">NMLS# {advisor.nmls_number}</div>
              )}
            </Link>
          )
        })}

        {filtered.length === 0 && (
          <div className="audits-empty">
            <Icon name="users" size={32} />
            <p>{search ? 'No advisors match your search.' : 'No advisors yet. Add one to get started.'}</p>
          </div>
        )}
      </div>

      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal__head">
              <h2>Add Advisor</h2>
              <button className="modal__close" onClick={() => setShowAdd(false)}>
                <Icon name="x" size={16} />
              </button>
            </div>
            <form onSubmit={handleAdd} className="advisor-form">
              <div className="advisor-form__row">
                <label>Full Name *</label>
                <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="advisor-form__row">
                <label>Title</label>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Mortgage Advisor" />
              </div>
              <div className="advisor-form__grid2">
                <div className="advisor-form__row">
                  <label>Email</label>
                  <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                </div>
                <div className="advisor-form__row">
                  <label>Phone</label>
                  <input type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
                </div>
              </div>
              <div className="advisor-form__row">
                <label>NMLS#</label>
                <input value={form.nmls_number} onChange={e => setForm(f => ({ ...f, nmls_number: e.target.value }))} />
              </div>
              <div className="advisor-form__row">
                <label>Street Address</label>
                <input value={form.street_address} onChange={e => setForm(f => ({ ...f, street_address: e.target.value }))} />
              </div>
              <div className="advisor-form__grid3">
                <div className="advisor-form__row">
                  <label>City</label>
                  <input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
                </div>
                <div className="advisor-form__row">
                  <label>State</label>
                  <input value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} placeholder="CO" maxLength={2} />
                </div>
                <div className="advisor-form__row">
                  <label>ZIP</label>
                  <input value={form.zip} onChange={e => setForm(f => ({ ...f, zip: e.target.value }))} />
                </div>
              </div>
              <div className="advisor-form__row">
                <label>Service Area</label>
                <input value={form.service_area} onChange={e => setForm(f => ({ ...f, service_area: e.target.value }))} placeholder="e.g., Colorado, Wyoming, Nebraska" />
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
