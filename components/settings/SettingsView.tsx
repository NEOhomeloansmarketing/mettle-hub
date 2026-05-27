'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Icon } from '@/components/ui/Icon'
import { Avatar } from '@/components/ui/Avatar'
import { Toggle } from '@/components/ui/Toggle'
import { useToast } from '@/components/ui/Toast'
import { CHANNELS } from '@/lib/types'
import type { Account, BrandDoc, ScheduleConfig } from '@/lib/types'
import { cls, relTime } from '@/lib/utils'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const BLOG_CHANNELS = ['CRNA', 'Entrepreneur', 'Physician']
const BRAND_DOC_IDS = ['crna', 'entrepreneur', 'physician', 'rosettastone', 'lawsofmarketing'] as const

type TabId = 'approvals' | 'connection' | 'schedule' | 'crna' | 'entrepreneur' | 'physician' | 'rosettastone' | 'lawsofmarketing' | 'data'

interface SettingsViewProps {
  account: Account
  pendingAccounts: Account[]
  approvedAccounts: Account[]
  brandDocs: BrandDoc[]
  scheduleConfig: ScheduleConfig | null
}

export function SettingsView({
  account,
  pendingAccounts: initialPending,
  approvedAccounts: initialApproved,
  brandDocs: initialDocs,
  scheduleConfig: initialSchedule,
}: SettingsViewProps) {
  const isAdmin = account.role === 'admin'
  const [tab, setTab] = useState<TabId>(
    isAdmin && initialPending.length > 0 ? 'approvals' : 'connection',
  )
  const [pendingAccounts, setPendingAccounts] = useState(initialPending)
  const [approvedAccounts, setApprovedAccounts] = useState(initialApproved)

  const tabs: { id: TabId; label: string }[] = [
    ...(isAdmin ? [{ id: 'approvals' as TabId, label: 'User approvals' }] : []),
    { id: 'connection', label: 'AI connection' },
    { id: 'schedule', label: 'Blog schedule' },
    { id: 'crna', label: 'CRNA voice' },
    { id: 'entrepreneur', label: 'Entrepreneur voice' },
    { id: 'physician', label: 'Physician voice' },
    { id: 'rosettastone', label: 'Rosetta Stone' },
    { id: 'lawsofmarketing', label: 'Laws of Marketing' },
    { id: 'data', label: 'Workspace data' },
  ]

  return (
    <div className="page page--settings">
      <div className="page__head">
        <div>
          <div className="page__kicker">Settings</div>
          <h1 className="page__title">Workspace settings</h1>
          <p className="page__sub">
            {isAdmin ? "You're signed in as the workspace admin." : 'Configure your workspace.'}
          </p>
        </div>
      </div>

      <div className="settings-shell">
        <aside className="settings-rail">
          {tabs.map(t => (
            <button
              key={t.id}
              className={cls('settings-rail__item', tab === t.id && 'settings-rail__item--active')}
              onClick={() => setTab(t.id)}
            >
              {t.label}
              {t.id === 'approvals' && pendingAccounts.length > 0 && (
                <span className="settings-rail__badge">{pendingAccounts.length}</span>
              )}
            </button>
          ))}
        </aside>

        <main className="settings-main">
          {tab === 'approvals' && isAdmin && (
            <ApprovalsPanel
              pending={pendingAccounts}
              approved={approvedAccounts}
              onApprove={id => {
                const a = pendingAccounts.find(x => x.id === id)
                if (!a) return
                setPendingAccounts(prev => prev.filter(x => x.id !== id))
                setApprovedAccounts(prev => [...prev, { ...a, status: 'approved' }])
              }}
              onDeny={id => {
                setPendingAccounts(prev => prev.filter(x => x.id !== id))
              }}
            />
          )}
          {tab === 'connection' && <ConnectionPanel />}
          {tab === 'schedule' && (
            <SchedulePanel initialConfig={initialSchedule} />
          )}
          {(['crna', 'entrepreneur', 'physician'] as const).includes(tab as any) && (
            <GuidePanel
              key={tab}
              docId={tab}
              title={CHANNELS[tab.charAt(0).toUpperCase() + tab.slice(1)]?.label + ' — brand voice guide'}
              description="Upload the brand voice document for this channel. Injected as context when generating blog content."
              channelColor={CHANNELS[tab.charAt(0).toUpperCase() + tab.slice(1)]?.color}
              initialContent={initialDocs.find(d => d.id === tab)?.content ?? ''}
            />
          )}
          {tab === 'rosettastone' && (
            <GuidePanel
              key="rosettastone"
              docId="rosettastone"
              title="Rosetta Stone"
              description="Shared positioning, terminology, and language standards used across all channels."
              initialContent={initialDocs.find(d => d.id === 'rosettastone')?.content ?? ''}
            />
          )}
          {tab === 'lawsofmarketing' && (
            <GuidePanel
              key="lawsofmarketing"
              docId="lawsofmarketing"
              title="Laws of Marketing"
              description="Operating principles for all marketing output. Injected into the blog writer."
              initialContent={initialDocs.find(d => d.id === 'lawsofmarketing')?.content ?? ''}
            />
          )}
          {tab === 'data' && <DataPanel />}
        </main>
      </div>
    </div>
  )
}

// ── ConnectionPanel ───────────────────────────────────────────────
function ConnectionPanel() {
  const { push: toast } = useToast()
  const [testing, setTesting] = useState(false)
  const [status, setStatus] = useState<'idle' | 'ok' | 'error'>('idle')

  async function testConnection() {
    setTesting(true); setStatus('idle')
    try {
      const res = await fetch('/api/ai/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: 'Say "connection OK" and nothing else.', maxTokens: 20 }),
      })
      if (res.ok) { setStatus('ok'); toast('AI connection is working', 'success') }
      else { setStatus('error'); toast('AI connection failed', 'error') }
    } catch {
      setStatus('error'); toast('AI connection failed', 'error')
    } finally { setTesting(false) }
  }

  return (
    <section className="settings-card">
      <h3>Anthropic API connection</h3>
      <p className="muted">
        The API key is configured server-side via environment variable.
        Use the button below to verify the connection is working.
      </p>
      <div className="settings-actions">
        <button className="btn btn--primary" onClick={testConnection} disabled={testing}>
          <Icon name="sparkle" size={13} /> {testing ? 'Testing…' : 'Test connection'}
        </button>
      </div>
      {status !== 'idle' && (
        <div className="settings-status" style={{ marginTop: 4 }}>
          <span className={cls('status-pill', status === 'ok' ? 'status-pill--ok' : 'status-pill--warn')}>
            {status === 'ok' ? 'Connected — API key is valid' : 'Connection failed — check ANTHROPIC_API_KEY'}
          </span>
        </div>
      )}
      <div style={{ marginTop: 8 }}>
        <span className="status-pill status-pill--ok">
          <Icon name="sparkle" size={11} /> claude-sonnet-4-6
        </span>
      </div>
    </section>
  )
}

// ── SchedulePanel ─────────────────────────────────────────────────
function SchedulePanel({ initialConfig }: { initialConfig: ScheduleConfig | null }) {
  const { push: toast } = useToast()
  const supabase = createClient()
  const [sched, setSched] = useState<ScheduleConfig>(initialConfig ?? {
    id: 1,
    enabled: false,
    day_of_week: 1,
    hour: 8,
    channels: ['CRNA', 'Entrepreneur', 'Physician'],
    last_runs: {},
  })

  async function save() {
    const { error } = await supabase
      .from('schedule_config')
      .upsert({ ...sched, id: 1 })
    if (error) toast(error.message, 'error')
    else toast('Schedule saved', 'success')
  }

  function toggleChannel(c: string) {
    setSched(s => ({
      ...s,
      channels: s.channels.includes(c) ? s.channels.filter(x => x !== c) : [...s.channels, c],
    }))
  }

  const nextRun = computeNextRun(sched)

  return (
    <section className="settings-card">
      <h3>Weekly blog schedule</h3>
      <p className="muted">
        Auto-generate a draft post for each enabled channel every week.
        Drafts land in <strong>Pending review</strong> in the Blog Engine; you approve and post manually.
      </p>

      <div className="sched-form">
        <div className="sched-form__row">
          <label className="sched-form__lbl">Enabled</label>
          <Toggle checked={sched.enabled} onChange={v => setSched(s => ({ ...s, enabled: v }))} />
        </div>
        <div className="sched-form__row">
          <label className="sched-form__lbl">Run on</label>
          <div className="select-wrap" style={{ maxWidth: 220 }}>
            <select
              className="select"
              value={sched.day_of_week}
              onChange={e => setSched(s => ({ ...s, day_of_week: Number(e.target.value) }))}
            >
              {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
            </select>
          </div>
        </div>
        <div className="sched-form__row">
          <label className="sched-form__lbl">Hour (local)</label>
          <div className="select-wrap" style={{ maxWidth: 220 }}>
            <select
              className="select"
              value={sched.hour}
              onChange={e => setSched(s => ({ ...s, hour: Number(e.target.value) }))}
            >
              {Array.from({ length: 24 }, (_, i) => {
                const d = new Date(); d.setHours(i, 0, 0, 0)
                return <option key={i} value={i}>{d.toLocaleTimeString(undefined, { hour: 'numeric' })}</option>
              })}
            </select>
          </div>
        </div>
        <div className="sched-form__row sched-form__row--top">
          <label className="sched-form__lbl">Channels</label>
          <div className="sched-channels">
            {BLOG_CHANNELS.map(c => {
              const on = sched.channels.includes(c)
              const info = CHANNELS[c]
              return (
                <button
                  key={c}
                  className={cls('sched-channel', on && 'sched-channel--on')}
                  style={on ? { borderColor: info.color, background: info.soft, color: info.ink } : undefined}
                  onClick={() => toggleChannel(c)}
                >
                  <span className="sched-channel__dot" style={{ background: info.color }} />
                  {info.label}
                  {on && <Icon name="check" size={13} />}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="settings-actions">
        <button className="btn btn--primary" onClick={save}>Save schedule</button>
      </div>

      <div className="sched-summary">
        <div>
          <div style={{ color: 'var(--muted)', fontSize: 11 }}>Next run</div>
          <div className="sched-summary__val">{sched.enabled ? nextRun : '—'}</div>
        </div>
        <div>
          <div style={{ color: 'var(--muted)', fontSize: 11 }}>Last runs</div>
          <div className="sched-summary__val">
            {Object.keys(sched.last_runs ?? {}).length > 0
              ? Object.entries(sched.last_runs).map(([ch, ts]) => `${ch}: ${relTime(ts)}`).join(' · ')
              : '—'}
          </div>
        </div>
      </div>
    </section>
  )
}

// ── GuidePanel ────────────────────────────────────────────────────
function GuidePanel({
  docId, title, description, channelColor, initialContent,
}: {
  docId: string
  title: string
  description: string
  channelColor?: string
  initialContent: string
}) {
  const { push: toast } = useToast()
  const supabase = createClient()
  const [content, setContent] = useState(initialContent)
  const fileRef = useRef<HTMLInputElement>(null)

  async function save(val: string) {
    const { error } = await supabase
      .from('brand_docs')
      .upsert({ id: docId, content: val, updated_at: new Date().toISOString() })
    if (error) toast(error.message, 'error')
    else toast('Saved', 'success')
  }

  function onUpload(file: File | null) {
    if (!file) return
    if (file.size > 2_000_000) { toast('Keep files under ~2MB of text.', 'error'); return }
    const reader = new FileReader()
    reader.onload = e => {
      const text = e.target?.result as string
      setContent(text)
      save(text)
      toast('Uploaded ' + file.name, 'success')
    }
    reader.readAsText(file)
  }

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0

  return (
    <section className="settings-card">
      <div className="settings-card__head">
        {channelColor && <span className="settings-card__bar" style={{ background: channelColor }} />}
        <h3>{title}</h3>
      </div>
      <p className="muted">{description}</p>
      <div className="upload-row">
        <label className="upload-btn" onClick={() => fileRef.current?.click()}>
          <Icon name="upload" size={13} /> Upload .txt
        </label>
        <input
          ref={fileRef}
          type="file"
          accept=".txt,.md,text/plain"
          onChange={e => onUpload(e.target.files?.[0] ?? null)}
          hidden
        />
        <span style={{ color: 'var(--muted)', fontSize: 11 }}>
          {wordCount} words stored · paste below or upload a text file
        </span>
      </div>
      <textarea
        className="input"
        rows={16}
        value={content}
        onChange={e => setContent(e.target.value)}
        onBlur={e => save(e.target.value)}
        placeholder="Paste the document text here. This will be injected into AI prompts."
        style={{ resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: 13 }}
      />
    </section>
  )
}

// ── ApprovalsPanel ────────────────────────────────────────────────
function ApprovalsPanel({
  pending, approved, onApprove, onDeny,
}: {
  pending: Account[]
  approved: Account[]
  onApprove: (id: string) => void
  onDeny: (id: string) => void
}) {
  const { push: toast } = useToast()
  const supabase = createClient()

  async function approve(id: string) {
    const { error } = await supabase
      .from('accounts')
      .update({ status: 'approved', approved_at: new Date().toISOString(), approver_email: 'colin.jenson@neohomeloans.com' })
      .eq('id', id)
    if (error) { toast(error.message, 'error'); return }
    onApprove(id)
    toast('Access granted', 'success')
  }

  async function deny(id: string) {
    if (!window.confirm('Deny this access request?')) return
    const { error } = await supabase.from('accounts').update({ status: 'denied' }).eq('id', id)
    if (error) { toast(error.message, 'error'); return }
    onDeny(id)
    toast('Request denied')
  }

  return (
    <section className="settings-card">
      <h3>User approvals</h3>
      <p className="muted">
        New sign-up requests from <strong>@neohomeloans.com</strong> emails land here.
        Approve to grant access, deny to block.
      </p>

      <div className="approvals-section">
        <div className="approvals-section__head">
          <h4>Pending <span style={{ color: 'var(--muted)', fontWeight: 400 }}>· {pending.length}</span></h4>
        </div>
        {pending.length === 0 ? (
          <span className="hint">No requests waiting.</span>
        ) : (
          <ul className="approvals-list">
            {pending.map(a => (
              <li key={a.id} className="approval-row">
                <Avatar user={{ name: a.name, color: '#7B8CFF', initials: getInitials(a.name) }} size={36} />
                <div className="approval-row__main">
                  <div className="approval-row__name">{a.name}</div>
                  <div className="approval-row__email">{a.email}</div>
                  <div className="approval-row__time">Requested {relTime(a.created_at)}</div>
                </div>
                <div className="approval-row__actions">
                  <button className="btn btn--ghost btn--sm" onClick={() => deny(a.id)}>Deny</button>
                  <button className="btn btn--primary btn--sm" onClick={() => approve(a.id)}>
                    <Icon name="check" size={13} /> Approve
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {approved.length > 0 && (
        <div className="approvals-section">
          <div className="approvals-section__head">
            <h4>Approved <span style={{ color: 'var(--muted)', fontWeight: 400 }}>· {approved.length}</span></h4>
          </div>
          <ul className="approvals-list">
            {approved.map(a => (
              <li key={a.id} className="approval-row approval-row--quiet">
                <Avatar user={{ name: a.name, color: '#4D7FFF', initials: getInitials(a.name) }} size={28} />
                <div className="approval-row__main">
                  <div className="approval-row__name">{a.name}</div>
                  <div className="approval-row__email">{a.email}</div>
                </div>
                <span className="pill pill--approved">Approved</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

// ── DataPanel ─────────────────────────────────────────────────────
function DataPanel() {
  const { push: toast } = useToast()

  async function exportData() {
    const res = await fetch('/api/workspace/export')
    if (!res.ok) { toast('Export failed', 'error'); return }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'mettle-hub-export.json'; a.click()
    URL.revokeObjectURL(url)
    toast('Workspace exported', 'success')
  }

  return (
    <section className="settings-card">
      <h3>Workspace data</h3>
      <p className="muted">Export a snapshot of all workspace data as JSON.</p>
      <div className="settings-actions">
        <button className="btn btn--ghost" onClick={exportData}>
          <Icon name="upload" size={13} /> Export workspace
        </button>
      </div>
    </section>
  )
}

function getInitials(name: string) {
  return name.trim().split(/\s+/).map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function computeNextRun(cfg: ScheduleConfig): string {
  const now = new Date()
  const next = new Date()
  const daysUntil = (cfg.day_of_week - now.getDay() + 7) % 7 || 7
  next.setDate(now.getDate() + daysUntil)
  next.setHours(cfg.hour, 0, 0, 0)
  return next.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) +
    ' at ' + new Date(next).toLocaleTimeString(undefined, { hour: 'numeric' })
}
