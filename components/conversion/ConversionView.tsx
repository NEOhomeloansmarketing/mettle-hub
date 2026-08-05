'use client'

import { useState, useEffect, useCallback } from 'react'
import { Icon } from '@/components/ui/Icon'

interface ConversionRow {
  user_id: string
  name: string
  email: string
  leads: number
  apps: number
  funded: number
}

function pct(num: number, denom: number) {
  if (!denom) return '—'
  return (num / denom * 100).toFixed(1) + '%'
}

function monthLabel(m: string) {
  const [y, mo] = m.split('-')
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function prevMonth(m: string) {
  const [y, mo] = m.split('-').map(Number)
  const d = new Date(y, mo - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function nextMonth(m: string) {
  const [y, mo] = m.split('-').map(Number)
  const d = new Date(y, mo, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function thisMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

interface EditState { user_id: string; apps: string; funded: string }

export function ConversionView({ isAdmin = false }: { isAdmin?: boolean }) {
  const [month, setMonth]       = useState(thisMonth)
  const [rows, setRows]         = useState<ConversionRow[]>([])
  const [loading, setLoading]   = useState(true)
  const [editing, setEditing]   = useState<EditState | null>(null)
  const [saving, setSaving]     = useState(false)

  const load = useCallback(async (m: string) => {
    setLoading(true)
    const res  = await fetch(`/api/conversion?month=${m}`)
    const data = await res.json()
    setRows(data.rows ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load(month) }, [load, month])

  function startEdit(row: ConversionRow) {
    setEditing({ user_id: row.user_id, apps: String(row.apps), funded: String(row.funded) })
  }

  async function saveEdit() {
    if (!editing) return
    setSaving(true)
    await fetch('/api/conversion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: editing.user_id,
        month,
        apps:   parseInt(editing.apps)   || 0,
        funded: parseInt(editing.funded) || 0,
      }),
    })
    setSaving(false)
    setEditing(null)
    load(month)
  }

  const totals = rows.reduce(
    (acc, r) => ({ leads: acc.leads + r.leads, apps: acc.apps + r.apps, funded: acc.funded + r.funded }),
    { leads: 0, apps: 0, funded: 0 }
  )

  const now = thisMonth()
  const isNext = month > now

  return (
    <div className="cv-page">

      {/* ── Header ── */}
      <div className="cv-header">
        <div className="cv-header__left">
          <div className="cv-header__icon"><Icon name="chart-line" size={16} /></div>
          <div>
            <h1 className="cv-title">Conversion</h1>
            <p className="cv-sub">Leads · Apps · Funded</p>
          </div>
        </div>
        <div className="cv-header__right">
          <div className="cv-month-nav">
            <button className="icon-btn" onClick={() => setMonth(m => prevMonth(m))} title="Previous month">
              <Icon name="chevron" size={14} style={{ transform: 'rotate(180deg)' }} />
            </button>
            <span className="cv-month-label">{monthLabel(month)}</span>
            <button className="icon-btn" onClick={() => setMonth(m => nextMonth(m))} disabled={isNext} title="Next month">
              <Icon name="chevron" size={14} />
            </button>
          </div>
          <button className="icon-btn" onClick={() => load(month)} title="Refresh" disabled={loading}>
            <Icon name="refresh" size={14} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {/* ── Summary cards ── */}
      <div className="cv-summary">
        {[
          { label: 'Total Leads',  value: loading ? '—' : totals.leads.toLocaleString() },
          { label: 'Total Apps',   value: loading ? '—' : totals.apps.toLocaleString()  },
          { label: 'Total Funded', value: loading ? '—' : totals.funded.toLocaleString() },
          { label: 'Lead → App',   value: loading ? '—' : pct(totals.apps,   totals.leads)  },
          { label: 'Lead → Funded',value: loading ? '—' : pct(totals.funded, totals.leads)  },
          { label: 'App → Funded', value: loading ? '—' : pct(totals.funded, totals.apps)   },
        ].map(c => (
          <div key={c.label} className="cv-card">
            <div className="cv-card__val">{c.value}</div>
            <div className="cv-card__label">{c.label}</div>
          </div>
        ))}
      </div>

      {/* ── Table ── */}
      <div className="cv-table-wrap">
        <table className="cv-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Leads</th>
              <th>Apps</th>
              <th>Funded</th>
              <th>L→A</th>
              <th>L→F</th>
              <th>A→F</th>
              {isAdmin && <th />}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="cv-skel-row">
                    {Array.from({ length: isAdmin ? 8 : 7 }).map((_, j) => (
                      <td key={j}><div className="cv-skel" /></td>
                    ))}
                  </tr>
                ))
              : rows.map(row => {
                  const isEditing = editing?.user_id === row.user_id
                  return (
                    <tr key={row.user_id} className={isEditing ? 'cv-row--editing' : ''}>
                      <td className="cv-name">{row.name}</td>
                      <td className="cv-num">{row.leads || '—'}</td>
                      {isEditing ? (
                        <>
                          <td><input className="cv-input" type="number" min={0} value={editing!.apps} onChange={e => setEditing(s => s && ({ ...s, apps: e.target.value }))} /></td>
                          <td><input className="cv-input" type="number" min={0} value={editing!.funded} onChange={e => setEditing(s => s && ({ ...s, funded: e.target.value }))} /></td>
                        </>
                      ) : (
                        <>
                          <td className="cv-num">{row.apps || '—'}</td>
                          <td className="cv-num">{row.funded || '—'}</td>
                        </>
                      )}
                      <td className="cv-pct">{pct(row.apps,   row.leads)}</td>
                      <td className="cv-pct">{pct(row.funded, row.leads)}</td>
                      <td className="cv-pct cv-pct--funded">{pct(row.funded, row.apps)}</td>
                      {isAdmin && (
                        <td className="cv-actions">
                          {isEditing ? (
                            <>
                              <button className="cv-btn cv-btn--save" onClick={saveEdit} disabled={saving}>{saving ? '…' : 'Save'}</button>
                              <button className="cv-btn cv-btn--cancel" onClick={() => setEditing(null)}>✕</button>
                            </>
                          ) : (
                            <button className="cv-btn cv-btn--edit" onClick={() => startEdit(row)}>
                              <Icon name="edit" size={12} /> Edit
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  )
                })
            }
          </tbody>
          {!loading && rows.length > 0 && (
            <tfoot>
              <tr className="cv-totals">
                <td>Total</td>
                <td className="cv-num">{totals.leads || '—'}</td>
                <td className="cv-num">{totals.apps || '—'}</td>
                <td className="cv-num">{totals.funded || '—'}</td>
                <td className="cv-pct">{pct(totals.apps,   totals.leads)}</td>
                <td className="cv-pct">{pct(totals.funded, totals.leads)}</td>
                <td className="cv-pct cv-pct--funded">{pct(totals.funded, totals.apps)}</td>
                {isAdmin && <td />}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {isAdmin && (
        <p className="cv-hint">
          <Icon name="lightning" size={11} /> Leads are pushed automatically via webhook. Click <strong>Edit</strong> on any row to enter apps and funded numbers.
        </p>
      )}

      {/* ── Edit modal ── */}
      {editing && (
        <div className="cv-modal-bg" onClick={() => setEditing(null)}>
          <div className="cv-modal" onClick={e => e.stopPropagation()}>
            <div className="cv-modal__title">
              {rows.find(r => r.user_id === editing.user_id)?.name} — {monthLabel(month)}
            </div>
            <div className="cv-modal__fields">
              <label className="cv-modal__label">
                Applications
                <input className="cv-modal__input" type="number" min={0} value={editing.apps}
                  onChange={e => setEditing(s => s && ({ ...s, apps: e.target.value }))} />
              </label>
              <label className="cv-modal__label">
                Funded
                <input className="cv-modal__input" type="number" min={0} value={editing.funded}
                  onChange={e => setEditing(s => s && ({ ...s, funded: e.target.value }))} />
              </label>
            </div>
            <div className="cv-modal__foot">
              <button className="cv-btn cv-btn--cancel" onClick={() => setEditing(null)}>Cancel</button>
              <button className="cv-btn cv-btn--save" onClick={saveEdit} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
