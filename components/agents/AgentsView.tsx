'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Agent, AgentOutputType } from '@/lib/types'
import { Icon } from '@/components/ui/Icon'
import { Toggle } from '@/components/ui/Toggle'
import { Modal } from '@/components/ui/Modal'
import { AILoading } from '@/components/ui/AILoading'
import { cls } from '@/lib/utils'

// ─── Config ───────────────────────────────────────────────────

const OUTPUT_CONFIG: Record<AgentOutputType, { label: string; color: string; bg: string; icon: string }> = {
  task:     { label: 'Creates Tasks',     color: '#4D7FFF', bg: '#4D7FFF22', icon: 'tasks' },
  blog:     { label: 'Drafts Blog Posts', color: '#9b59b6', bg: '#9b59b622', icon: 'blog' },
  note:     { label: 'Writes Notes',      color: '#27ae60', bg: '#27ae6022', icon: 'notes' },
  activity: { label: 'Logs Activity',     color: '#888',    bg: '#88888822', icon: 'sparkle' },
}

const CHANNEL_OPTIONS = ['CRNA', 'Entrepreneur', 'Physician']

const DAY_OPTIONS = [
  { value: null,  label: 'Every day' },
  { value: 0,     label: 'Sunday' },
  { value: 1,     label: 'Monday' },
  { value: 2,     label: 'Tuesday' },
  { value: 3,     label: 'Wednesday' },
  { value: 4,     label: 'Thursday' },
  { value: 5,     label: 'Friday' },
  { value: 6,     label: 'Saturday' },
]

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => {
  const h = i === 0 ? 12 : i > 12 ? i - 12 : i
  const ampm = i < 12 ? 'AM' : 'PM'
  return { value: i, label: `${h}:00 ${ampm} UTC` }
})

function scheduleText(agent: Agent): string {
  if (!agent.schedule_enabled) return 'Manual only'
  const day = agent.day_of_week == null ? 'Every day' : DAY_OPTIONS.find(d => d.value === agent.day_of_week)?.label ?? 'Unknown'
  const time = HOUR_OPTIONS[agent.hour]?.label ?? `${agent.hour}:00 UTC`
  return `${day} · ${time}`
}

function timeAgo(ts: string | null): string {
  if (!ts) return 'Never run'
  const mins = Math.floor((Date.now() - new Date(ts).getTime()) / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ─── Agent Card ───────────────────────────────────────────────

interface CardProps {
  agent: Agent
  running: boolean
  onToggle: () => void
  onRun: () => void
  onSettings: () => void
}

function AgentCard({ agent, running, onToggle, onRun, onSettings }: CardProps) {
  const out = OUTPUT_CONFIG[agent.output_type]
  return (
    <div className={cls('agent-card', !agent.enabled && 'agent-card--off')}>
      <div className="agent-card__head">
        <div className="agent-card__name-row">
          <span className="agent-card__dot" style={{ background: agent.enabled ? '#22c55e' : 'var(--muted-2)' }} />
          <span className="agent-card__name">{agent.name}</span>
        </div>
        <span className="agent-type-pill" style={{ background: out.bg, color: out.color }}>
          <Icon name={out.icon} size={10} /> {out.label}
        </span>
      </div>

      {agent.description && <p className="agent-card__desc">{agent.description}</p>}

      <div className="agent-card__meta">
        {agent.channels.length > 0 && (
          <div className="agent-card__channels">
            {agent.channels.map(c => <span key={c} className="agent-card__ch">{c}</span>)}
          </div>
        )}
        <div className="agent-card__info-row">
          <Icon name="calendar" size={11} />
          <span>{scheduleText(agent)}</span>
        </div>
        <div className="agent-card__info-row">
          <Icon name="refresh" size={11} />
          <span>{timeAgo(agent.last_run)}</span>
        </div>
        <div className="agent-card__info-row">
          {agent.use_rosetta && <span className="agent-card__badge">Rosetta Stone</span>}
          {agent.use_laws && <span className="agent-card__badge">5 Laws</span>}
        </div>
      </div>

      <div className="agent-card__foot">
        <button className="btn btn--sm" onClick={onRun} disabled={running || !agent.enabled}>
          {running ? <AILoading label="" /> : <><Icon name="play" size={12} /> Run Now</>}
        </button>
        <button className="btn btn--sm btn--ghost" onClick={onSettings}>
          <Icon name="settings" size={12} /> Settings
        </button>
        <div style={{ marginLeft: 'auto' }}>
          <Toggle checked={agent.enabled} onChange={onToggle} />
        </div>
      </div>
    </div>
  )
}

// ─── Empty State ──────────────────────────────────────────────

function EmptyAgents({ onNew }: { onNew: () => void }) {
  return (
    <div className="agents-empty">
      <div className="agents-empty__icon"><Icon name="agent" size={36} /></div>
      <h2 className="agents-empty__title">No agents yet</h2>
      <p className="agents-empty__body">
        AI agents run on a schedule and automatically create tasks, blog drafts, notes, or activity logs —
        guided by your Rosetta Stones and Five Laws of Marketing. Describe what you want in plain English
        and the AI will configure the agent for you.
      </p>
      <div className="agents-empty__examples">
        <span>"Every Monday, research trending CRNA mortgage topics and create 3 task ideas"</span>
        <span>"Weekly, draft a blog post for each channel based on what's timely"</span>
        <span>"Daily, write a competitive intel note on entrepreneur lending trends"</span>
      </div>
      <button className="btn btn--primary" onClick={onNew}>
        <Icon name="plus" size={14} /> Create your first agent
      </button>
    </div>
  )
}

// ─── Shared Form ──────────────────────────────────────────────

interface FormData {
  name: string
  description: string
  system_prompt: string
  output_type: AgentOutputType
  channels: string[]
  use_rosetta: boolean
  use_laws: boolean
  schedule_enabled: boolean
  day_of_week: number | null
  hour: number
  enabled: boolean
}

const DEFAULT_FORM: FormData = {
  name: '', description: '', system_prompt: '',
  output_type: 'task', channels: [],
  use_rosetta: true, use_laws: true,
  schedule_enabled: false, day_of_week: null, hour: 8, enabled: true,
}

function AgentForm({ form, onChange }: { form: FormData; onChange: (f: FormData) => void }) {
  function set<K extends keyof FormData>(k: K, v: FormData[K]) { onChange({ ...form, [k]: v }) }

  function toggleChannel(c: string) {
    set('channels', form.channels.includes(c) ? form.channels.filter(x => x !== c) : [...form.channels, c])
  }

  return (
    <div className="agent-form">
      <div className="agent-form__grid2">
        <div className="agent-form__field">
          <label className="agent-form__label">Agent Name</label>
          <input className="input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. CRNA Trend Researcher" />
        </div>
        <div className="agent-form__field">
          <label className="agent-form__label">Description <span className="agent-form__hint">(shown on card)</span></label>
          <input className="input" value={form.description} onChange={e => set('description', e.target.value)} placeholder="One line summary" />
        </div>
      </div>

      <div className="agent-form__field">
        <label className="agent-form__label">
          Instructions <span className="agent-form__hint">— tell the agent exactly what to research, analyze, and produce</span>
        </label>
        <textarea
          className="input agent-form__prompt"
          value={form.system_prompt}
          onChange={e => set('system_prompt', e.target.value)}
          placeholder="Be specific: what should it look for, what tone should it use, how many items should it create, what perspective should it take..."
          rows={7}
        />
      </div>

      <div className="agent-form__field">
        <label className="agent-form__label">Output Type</label>
        <div className="agent-form__output-row">
          {(Object.entries(OUTPUT_CONFIG) as [AgentOutputType, typeof OUTPUT_CONFIG.task][]).map(([type, cfg]) => (
            <button
              key={type}
              type="button"
              className={cls('agent-output-btn', form.output_type === type && 'agent-output-btn--on')}
              style={form.output_type === type ? { borderColor: cfg.color, color: cfg.color, background: cfg.bg } : {}}
              onClick={() => set('output_type', type)}
            >
              <Icon name={cfg.icon} size={13} />
              <span>{cfg.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="agent-form__row">
        <div className="agent-form__field" style={{ flex: 1 }}>
          <label className="agent-form__label">Channels</label>
          <div className="agent-form__chips">
            {CHANNEL_OPTIONS.map(c => (
              <button
                key={c}
                type="button"
                className={cls('agent-chip', form.channels.includes(c) && 'agent-chip--on')}
                onClick={() => toggleChannel(c)}
              >{c}</button>
            ))}
            <span className="agent-form__hint" style={{ alignSelf: 'center' }}>leave empty for all</span>
          </div>
        </div>

        <div className="agent-form__field" style={{ flex: 1 }}>
          <label className="agent-form__label">Brand Knowledge</label>
          <div className="agent-form__checks">
            <label className="agent-form__check">
              <input type="checkbox" checked={form.use_rosetta} onChange={e => set('use_rosetta', e.target.checked)} />
              <span>Rosetta Stones <span className="agent-form__hint">(brand voice + positioning)</span></span>
            </label>
            <label className="agent-form__check">
              <input type="checkbox" checked={form.use_laws} onChange={e => set('use_laws', e.target.checked)} />
              <span>Five Laws of Marketing</span>
            </label>
          </div>
        </div>
      </div>

      <div className="agent-form__field">
        <div className="agent-form__schedule-head">
          <label className="agent-form__label">Schedule</label>
          <Toggle checked={form.schedule_enabled} onChange={v => set('schedule_enabled', v)} />
        </div>
        {form.schedule_enabled && (
          <div className="agent-form__schedule-row">
            <div className="agent-form__field" style={{ flex: 1 }}>
              <label className="agent-form__sublabel">Day</label>
              <select
                className="input select"
                value={form.day_of_week ?? ''}
                onChange={e => set('day_of_week', e.target.value === '' ? null : Number(e.target.value))}
              >
                {DAY_OPTIONS.map(d => (
                  <option key={String(d.value)} value={d.value ?? ''}>{d.label}</option>
                ))}
              </select>
            </div>
            <div className="agent-form__field" style={{ flex: 1 }}>
              <label className="agent-form__sublabel">Time (UTC)</label>
              <select className="input select" value={form.hour} onChange={e => set('hour', Number(e.target.value))}>
                {HOUR_OPTIONS.map(h => (
                  <option key={h.value} value={h.value}>{h.label}</option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Builder Modal ────────────────────────────────────────────

function BuilderModal({ onSave, onClose }: { onSave: (f: FormData) => void; onClose: () => void }) {
  const [phase, setPhase] = useState<'describe' | 'configure'>('describe')
  const [desc, setDesc] = useState('')
  const [building, setBuilding] = useState(false)
  const [buildError, setBuildError] = useState('')
  const [form, setForm] = useState<FormData>(DEFAULT_FORM)

  async function buildWithAI() {
    if (!desc.trim()) return
    setBuilding(true); setBuildError('')
    try {
      const res = await fetch('/api/agents/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: desc }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Build failed')
      setForm({
        name: data.name ?? '',
        description: data.description ?? '',
        system_prompt: data.systemPrompt ?? '',
        output_type: data.outputType ?? 'task',
        channels: data.channels ?? [],
        use_rosetta: data.useRosetta ?? true,
        use_laws: data.useLaws ?? true,
        schedule_enabled: false, day_of_week: null, hour: 8, enabled: true,
      })
      setPhase('configure')
    } catch (err: any) {
      setBuildError(err.message || 'Build failed')
    } finally {
      setBuilding(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={phase === 'describe' ? 'New AI Agent' : 'Configure Agent'}
      width={640}
      footer={
        phase === 'describe' ? (
          <div className="modal__foot-row">
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn btn--primary" onClick={buildWithAI} disabled={building || !desc.trim()}>
              {building ? <><AILoading label="" /> Building…</> : <><Icon name="sparkle" size={14} /> Build with AI</>}
            </button>
          </div>
        ) : (
          <div className="modal__foot-row">
            <button className="btn" onClick={() => setPhase('describe')}>← Back</button>
            <button
              className="btn btn--primary"
              onClick={() => onSave(form)}
              disabled={!form.name.trim() || !form.system_prompt.trim()}
            >Save Agent</button>
          </div>
        )
      }
    >
      {phase === 'describe' ? (
        <div className="agent-describe">
          <p className="agent-describe__sub">
            Describe what you want this agent to do in plain English. The AI will write the instructions,
            pick the output type, and configure the channels automatically.
          </p>
          <textarea
            className="input agent-describe__input"
            value={desc}
            onChange={e => setDesc(e.target.value)}
            placeholder={'e.g. "Every Monday morning, look at what CRNAs are asking about mortgages and create 3 blog post ideas as tasks for the team to review this week"\n\ne.g. "Every week, draft a timely blog post for each of our three channels based on current trends in each market"'}
            rows={7}
            autoFocus
          />
          {buildError && <div className="agent-describe__error">{buildError}</div>}
          <div className="agent-describe__note">
            <Icon name="sparkle" size={12} />
            AI will configure name, instructions, output type, and brand knowledge based on your description.
            You can edit everything before saving.
          </div>
        </div>
      ) : (
        <AgentForm form={form} onChange={setForm} />
      )}
    </Modal>
  )
}

// ─── Settings Modal ───────────────────────────────────────────

function SettingsModal({ agent, onSave, onDelete, onClose }: {
  agent: Agent; onSave: (f: FormData) => void; onDelete: () => void; onClose: () => void
}) {
  const [form, setForm] = useState<FormData>({
    name: agent.name, description: agent.description, system_prompt: agent.system_prompt,
    output_type: agent.output_type, channels: agent.channels,
    use_rosetta: agent.use_rosetta, use_laws: agent.use_laws,
    schedule_enabled: agent.schedule_enabled, day_of_week: agent.day_of_week,
    hour: agent.hour, enabled: agent.enabled,
  })
  const [confirmDel, setConfirmDel] = useState(false)

  return (
    <Modal
      open
      onClose={onClose}
      title="Agent Settings"
      width={640}
      footer={
        confirmDel ? (
          <div className="modal__foot-row">
            <span className="agent-del-confirm">Delete this agent permanently?</span>
            <button className="btn" onClick={() => setConfirmDel(false)}>Cancel</button>
            <button className="btn btn--danger" onClick={onDelete}>Delete</button>
          </div>
        ) : (
          <div className="modal__foot-row">
            <button className="btn btn--ghost agent-del-btn" onClick={() => setConfirmDel(true)}>
              <Icon name="trash" size={13} /> Delete agent
            </button>
            <button className="btn" onClick={onClose}>Cancel</button>
            <button
              className="btn btn--primary"
              onClick={() => onSave(form)}
              disabled={!form.name.trim() || !form.system_prompt.trim()}
            >Save Changes</button>
          </div>
        )
      }
    >
      <AgentForm form={form} onChange={setForm} />
    </Modal>
  )
}

// ─── Main View ────────────────────────────────────────────────

export function AgentsView({ initialAgents }: { initialAgents: Agent[] }) {
  const supabase = createClient()
  const [agents, setAgents] = useState<Agent[]>(initialAgents)
  const [showBuilder, setShowBuilder] = useState(false)
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null)
  const [runningId, setRunningId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 4000)
  }

  async function handleToggle(agent: Agent) {
    const enabled = !agent.enabled
    setAgents(a => a.map(x => x.id === agent.id ? { ...x, enabled } : x))
    await supabase.from('agents').update({ enabled }).eq('id', agent.id)
  }

  async function handleRun(agent: Agent) {
    setRunningId(agent.id)
    try {
      const res = await fetch(`/api/agents/run/${agent.id}`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Run failed')
      const n = data.created ?? 0
      showToast(`${agent.name} created ${n} ${n === 1 ? 'item' : 'items'}`)
      setAgents(a => a.map(x => x.id === agent.id ? { ...x, last_run: new Date().toISOString() } : x))
    } catch (err: any) {
      showToast(err.message || 'Run failed', false)
    } finally {
      setRunningId(null)
    }
  }

  async function handleSave(data: FormData, id?: string) {
    if (id) {
      const { data: updated } = await supabase.from('agents').update(data).eq('id', id).select().single()
      if (updated) setAgents(a => a.map(x => x.id === id ? (updated as Agent) : x))
      showToast('Agent saved')
    } else {
      const { data: created } = await supabase.from('agents').insert(data as any).select().single()
      if (created) setAgents(a => [...a, created as Agent])
      showToast('Agent created')
    }
    setShowBuilder(false)
    setEditingAgent(null)
  }

  async function handleDelete(id: string) {
    await supabase.from('agents').delete().eq('id', id)
    setAgents(a => a.filter(x => x.id !== id))
    setEditingAgent(null)
    showToast('Agent deleted')
  }

  return (
    <div className="agents-page">
      <div className="agents-page__header">
        <div>
          <h1 className="agents-page__title">AI Agents</h1>
          <p className="agents-page__sub">
            Automated AI workflows scheduled to run on your behalf — powered by your Rosetta Stones,
            Five Laws of Marketing, and brand knowledge.
          </p>
        </div>
        <button className="btn btn--primary" onClick={() => setShowBuilder(true)}>
          <Icon name="plus" size={14} /> New Agent
        </button>
      </div>

      {agents.length === 0 ? (
        <EmptyAgents onNew={() => setShowBuilder(true)} />
      ) : (
        <div className="agents-grid">
          {agents.map(agent => (
            <AgentCard
              key={agent.id}
              agent={agent}
              running={runningId === agent.id}
              onToggle={() => handleToggle(agent)}
              onRun={() => handleRun(agent)}
              onSettings={() => setEditingAgent(agent)}
            />
          ))}
        </div>
      )}

      {showBuilder && (
        <BuilderModal
          onSave={data => handleSave(data)}
          onClose={() => setShowBuilder(false)}
        />
      )}

      {editingAgent && (
        <SettingsModal
          agent={editingAgent}
          onSave={data => handleSave(data, editingAgent.id)}
          onDelete={() => handleDelete(editingAgent.id)}
          onClose={() => setEditingAgent(null)}
        />
      )}

      {toast && (
        <div className={cls('toast', !toast.ok && 'toast--error')}>
          <Icon name={toast.ok ? 'check-circle' : 'x'} size={14} />
          {toast.msg}
        </div>
      )}
    </div>
  )
}
