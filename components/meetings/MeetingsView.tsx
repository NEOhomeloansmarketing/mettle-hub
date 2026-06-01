'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Icon } from '@/components/ui/Icon'
import { Avatar } from '@/components/ui/Avatar'
import { Modal } from '@/components/ui/Modal'
import { AILoading } from '@/components/ui/AILoading'
import { useToast } from '@/components/ui/Toast'
import { PRIORITIES } from '@/lib/types'
import type { Meeting, ActionItemDraft, Section, Account } from '@/lib/types'
import { cls, fmtDateTime } from '@/lib/utils'

type MeetingWithAttendees = Meeting & {
  meeting_attendees: { account_id: string }[]
}
type TeamMember = Pick<Account, 'id' | 'name' | 'color' | 'initials' | 'email'>

interface MeetingsViewProps {
  initialMeetings: MeetingWithAttendees[]
  sections: Section[]
  team: TeamMember[]
  currentUserId: string
  initialMeetingId?: string | null
}

export function MeetingsView({
  initialMeetings, sections, team, currentUserId, initialMeetingId,
}: MeetingsViewProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { push: toast } = useToast()
  const supabase = createClient()

  const [meetings, setMeetings] = useState<MeetingWithAttendees[]>(initialMeetings)
  const [creating, setCreating] = useState(false)

  const activeMeetingId = searchParams.get('meeting') ?? initialMeetingId ?? meetings[0]?.id ?? null

  function setActive(id: string | null) {
    const p = new URLSearchParams(searchParams.toString())
    if (id) p.set('meeting', id)
    else p.delete('meeting')
    router.push(`/meetings${p.size > 0 ? '?' + p.toString() : ''}`, { scroll: false })
  }

  const activeMeeting = meetings.find(m => m.id === activeMeetingId) ?? null

  async function createMeeting(payload: {
    title: string; date: string; attendees: string[]; agenda: string
  }) {
    const { data, error } = await supabase
      .from('meetings')
      .insert({
        title: payload.title || 'Untitled meeting',
        date: payload.date,
        agenda: payload.agenda,
        transcript: '',
        summary: '',
        action_items: [],
      })
      .select()
      .single()
    if (error) { toast(error.message, 'error'); return }

    if (payload.attendees.length) {
      await supabase.from('meeting_attendees').insert(
        payload.attendees.map(id => ({ meeting_id: data.id, account_id: id })),
      )
    }

    const newMeeting: MeetingWithAttendees = {
      ...(data as Meeting),
      meeting_attendees: payload.attendees.map(id => ({ account_id: id })),
    }
    setMeetings(prev => [newMeeting, ...prev])
    setActive(data.id)
    toast('Meeting created', 'success')
  }

  async function updateMeeting(id: string, patch: Partial<Meeting>) {
    setMeetings(prev => prev.map(m => m.id === id ? { ...m, ...patch } : m))
    const { error } = await supabase.from('meetings').update(patch).eq('id', id)
    if (error) toast(error.message, 'error')
  }

  async function updateAttendees(meetingId: string, accountIds: string[]) {
    setMeetings(prev => prev.map(m =>
      m.id === meetingId
        ? { ...m, meeting_attendees: accountIds.map(id => ({ account_id: id })) }
        : m,
    ))
    await supabase.from('meeting_attendees').delete().eq('meeting_id', meetingId)
    if (accountIds.length) {
      await supabase.from('meeting_attendees').insert(
        accountIds.map(id => ({ meeting_id: meetingId, account_id: id })),
      )
    }
  }

  async function deleteMeeting(id: string) {
    if (!window.confirm('Delete this meeting?')) return
    setMeetings(prev => prev.filter(m => m.id !== id))
    setActive(null)
    const { error } = await supabase.from('meetings').delete().eq('id', id)
    if (error) toast(error.message, 'error')
  }

  const sorted = [...meetings].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  return (
    <div className="page page--meetings">
      <div className="meetings-shell">
        <aside className="mtg-rail">
          <div className="mtg-rail__head">
            <span>Meetings</span>
            <button className="icon-btn icon-btn--sm" onClick={() => setCreating(true)} title="New meeting">
              <Icon name="plus" size={13} />
            </button>
          </div>
          <div className="mtg-rail__list">
            {sorted.length === 0 ? (
              <div style={{ padding: '20px 12px', color: 'var(--muted)', fontSize: 12, textAlign: 'center' }}>
                No meetings yet
              </div>
            ) : sorted.map(m => {
              const upcoming = new Date(m.date).getTime() >= Date.now() - 86400e3
              return (
                <button
                  key={m.id}
                  className={cls('mtg-rail__item', activeMeetingId === m.id && 'mtg-rail__item--active')}
                  onClick={() => setActive(m.id)}
                >
                  <div className="mtg-rail__title">{m.title}</div>
                  <div className="mtg-rail__meta">
                    <span>{fmtDateTime(m.date)}</span>
                    {upcoming && <span className="mtg-rail__upcoming">Upcoming</span>}
                  </div>
                </button>
              )
            })}
          </div>
        </aside>

        <main className="mtg-main">
          {!activeMeeting ? (
            <div className="empty" style={{ marginTop: 80 }}>
              <div className="empty__title">No meeting selected</div>
              <div className="empty__body">Choose a meeting from the left or create a new one.</div>
              <button className="btn btn--primary" onClick={() => setCreating(true)}>
                <Icon name="plus" size={14} /> New meeting
              </button>
            </div>
          ) : (
            <MeetingDetail
              meeting={activeMeeting}
              team={team}
              sections={sections}
              currentUserId={currentUserId}
              onUpdate={patch => updateMeeting(activeMeeting.id, patch)}
              onUpdateAttendees={ids => updateAttendees(activeMeeting.id, ids)}
              onDelete={() => deleteMeeting(activeMeeting.id)}
            />
          )}
        </main>
      </div>

      <CreateMeetingModal
        open={creating}
        onClose={() => setCreating(false)}
        team={team}
        currentUserId={currentUserId}
        onCreate={p => { createMeeting(p); setCreating(false) }}
      />
    </div>
  )
}

// ── MeetingDetail ─────────────────────────────────────────────────
function MeetingDetail({
  meeting, team, sections, currentUserId, onUpdate, onUpdateAttendees, onDelete,
}: {
  meeting: MeetingWithAttendees
  team: TeamMember[]
  sections: Section[]
  currentUserId: string
  onUpdate: (patch: Partial<Meeting>) => void
  onUpdateAttendees: (ids: string[]) => void
  onDelete: () => void
}) {
  const { push: toast } = useToast()
  const supabase = createClient()
  const [title, setTitle]           = useState(meeting.title)
  const [transcript, setTranscript] = useState(meeting.transcript ?? '')
  const [processing, setProcessing] = useState(false)
  const [pushSectionId, setPushSectionId] = useState(sections[0]?.id ?? '')

  interface AgendaItem { title: string; description: string }

  function parseAgendaItems(raw: string): AgendaItem[] {
    if (raw) {
      // Try JSON (new format)
      try {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          const items: AgendaItem[] = parsed.map((p: any) =>
            typeof p === 'string'
              ? { title: p, description: '' }
              : { title: p.title ?? '', description: p.description ?? '' }
          )
          while (items.length < 4) items.push({ title: '', description: '' })
          return items
        }
      } catch {}
      // Fall back: plain newline-separated strings (old format)
      const lines = raw.split('\n')
      const items: AgendaItem[] = lines.map(l => ({ title: l, description: '' }))
      while (items.length < 4) items.push({ title: '', description: '' })
      return items
    }
    return [{ title: '', description: '' }, { title: '', description: '' }, { title: '', description: '' }, { title: '', description: '' }]
  }

  function serializeAgenda(items: AgendaItem[]): string {
    return JSON.stringify(items)
  }

  const [agendaItems, setAgendaItems]   = useState<AgendaItem[]>(() => parseAgendaItems(meeting.agenda ?? ''))
  const [expandedAgenda, setExpandedAgenda] = useState<Set<number>>(new Set())

  function saveAgenda(items: AgendaItem[]) {
    onUpdate({ agenda: serializeAgenda(items) })
  }

  function setAgendaField(i: number, field: keyof AgendaItem, val: string) {
    setAgendaItems(prev => { const n = [...prev]; n[i] = { ...n[i], [field]: val }; return n })
  }

  function removeAgendaItem(i: number) {
    const next = agendaItems.filter((_, idx) => idx !== i)
    setAgendaItems(next)
    saveAgenda(next)
    setExpandedAgenda(prev => {
      const s = new Set<number>()
      prev.forEach(idx => { if (idx < i) s.add(idx); else if (idx > i) s.add(idx - 1) })
      return s
    })
  }

  function toggleAgendaExpand(i: number) {
    setExpandedAgenda(prev => {
      const s = new Set(prev)
      s.has(i) ? s.delete(i) : s.add(i)
      return s
    })
  }

  function addAgendaItem() {
    setAgendaItems(prev => [...prev, { title: '', description: '' }])
  }

  useEffect(() => {
    setTitle(meeting.title)
    setAgendaItems(parseAgendaItems(meeting.agenda ?? ''))
    setExpandedAgenda(new Set())
    setTranscript(meeting.transcript ?? '')
  }, [meeting.id])

  const attendeeIds = meeting.meeting_attendees.map(a => a.account_id)

  function toggleAttendee(id: string) {
    const next = attendeeIds.includes(id)
      ? attendeeIds.filter(a => a !== id)
      : [...attendeeIds, id]
    onUpdateAttendees(next)
  }

  function updateItem(itemId: string, patch: Partial<ActionItemDraft>) {
    const next = (meeting.action_items ?? []).map(a => a.id === itemId ? { ...a, ...patch } : a)
    onUpdate({ action_items: next })
  }

  function removeItem(itemId: string) {
    onUpdate({ action_items: (meeting.action_items ?? []).filter(a => a.id !== itemId) })
  }

  async function processTranscript() {
    if (!transcript.trim()) { toast('Paste a transcript first.', 'error'); return }
    setProcessing(true)
    try {
      const teamNames = team.map(m => m.name).join(', ')

      const agendaText = agendaItems
        .filter(a => a.title.trim())
        .map((a, i) => `${i + 1}. ${a.title}${a.description ? ` — ${a.description}` : ''}`)
        .join('\n')

      const res = await fetch('/api/ai/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: `You are an expert meeting assistant for a mortgage marketing team. Your job is to extract EVERY action item from meeting transcripts — miss nothing.

Return ONLY a JSON object (no prose, no fences):
{
  "summary": "3-5 sentence summary of what was discussed and decided",
  "actionItems": [
    { "title": "concise task title", "description": "more detail or context", "assigneeName": "exact team-member name or empty string", "dueInDays": 7, "priority": "Low|Medium|High|Urgent" }
  ]
}

Rules:
- Extract EVERY task, follow-up, and deliverable mentioned — including recurring ones like blog posts, content creation, ad updates, reports.
- If an agenda topic was discussed and needs work done on it, create an action item for it even if not explicitly called out as a "task".
- Blog posts, social content, weekly reports, campaign updates = always create tasks for these when mentioned.
- Known team members: ${teamNames}. Match names loosely (first name is enough). Leave assigneeName as "" if unclear.
- Be thorough — it is better to have too many action items than to miss one.`,
          user: `${agendaText ? `AGENDA:\n${agendaText}\n\n` : ''}TRANSCRIPT:\n${transcript.slice(0, 14000)}`,
          maxTokens: 3000,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'AI error')

      let txt = (json.text as string).trim()
      const m = txt.match(/\{[\s\S]*\}/)
      if (m) txt = m[0]
      let parsed: { summary: string; actionItems: any[] }
      try { parsed = JSON.parse(txt) }
      catch { throw new Error('AI returned malformed output. Try again.') }

      const items: ActionItemDraft[] = (parsed.actionItems ?? []).map((a: any) => ({
        id: crypto.randomUUID(),
        title: a.title || 'Action item',
        description: a.description || '',
        assigneeName: a.assigneeName || '',
        dueInDays: typeof a.dueInDays === 'number' ? a.dueInDays : 7,
        priority: PRIORITIES.includes(a.priority) ? a.priority : 'Medium',
        accepted: true,
      }))

      onUpdate({ transcript, summary: parsed.summary || '', action_items: items })
      await supabase.from('activity').insert({ kind: 'ai', label: `Processed transcript: ${meeting.title}` })
      toast('Transcript processed', 'success')
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setProcessing(false)
    }
  }

  async function pushToTasks() {
    if (!pushSectionId) { toast('Choose a section first.', 'error'); return }
    const accepted = (meeting.action_items ?? []).filter(a => a.accepted)
    if (!accepted.length) { toast('No accepted action items.', 'error'); return }

    const rows = accepted.map(a => {
      const match = team.find(m =>
        a.assigneeName && m.name.toLowerCase().includes(a.assigneeName.toLowerCase().split(' ')[0]),
      )
      const dueDate = new Date()
      dueDate.setDate(dueDate.getDate() + (a.dueInDays ?? 7))
      return {
        title: a.title,
        description: a.description,
        assignee_id: match?.id ?? currentUserId,
        due: dueDate.toISOString().slice(0, 10),
        status: 'To Do' as const,
        priority: a.priority,
        channel: 'All' as const,
        section_id: pushSectionId,
        meeting_id: meeting.id,
      }
    })

    const { error } = await supabase.from('tasks').insert(rows)
    if (error) { toast(error.message, 'error'); return }
    await supabase.from('activity').insert({
      kind: 'task',
      label: `Created ${rows.length} task${rows.length !== 1 ? 's' : ''} from: ${meeting.title}`,
    })
    toast(`Created ${rows.length} task${rows.length !== 1 ? 's' : ''}`, 'success')
  }

  return (
    <div className="mtg-detail">

      {/* ── Header ─────────────────────────────────── */}
      <header className="mtg-detail__head">
        <div className="mtg-detail__head-left">
          <input
            className="mtg-detail__title"
            value={title}
            onChange={e => setTitle(e.target.value)}
            onBlur={e => onUpdate({ title: e.target.value.trim() || 'Untitled meeting' })}
            placeholder="Meeting title"
          />
          <div className="mtg-detail__meta">
            <Icon name="calendar" size={12} />
            <span>{fmtDateTime(meeting.date)}</span>
            <span className="dot-sep">·</span>
            <div className="attendee-row attendee-row--inline">
              {team.filter(m => attendeeIds.includes(m.id)).map(m => (
                <Avatar key={m.id} user={m} size={18} />
              ))}
              {attendeeIds.length === 0 && <span>No attendees</span>}
            </div>
          </div>
        </div>
        <button className="icon-btn" onClick={onDelete} title="Delete meeting">
          <Icon name="trash" size={14} />
        </button>
      </header>

      <div className="mtg-detail__grid">

        {/* ── Left column ──────────────────────────── */}
        <div className="mtg-detail__col">

          {/* Attendees */}
          <section className="card card--padded">
            <h4 className="card__h">Attendees</h4>
            <div className="attendee-row">
              {team.map(m => (
                <button
                  key={m.id}
                  className={cls('attendee', attendeeIds.includes(m.id) && 'attendee--on')}
                  onClick={() => toggleAttendee(m.id)}
                >
                  <Avatar user={m} size={20} />
                  <span>{m.name.split(' ')[0]}</span>
                </button>
              ))}
            </div>
          </section>

          {/* Agenda */}
          <section className="card card--padded">
            <h4 className="card__h">Agenda</h4>
            <ul className="agenda-list">
              {agendaItems.map((item, i) => {
                const expanded = expandedAgenda.has(i)
                return (
                  <li key={i} className={cls('agenda-item', expanded && 'agenda-item--open')}>
                    <div className="agenda-item__row">
                      <span className="agenda-item__num">{i + 1}</span>
                      <input
                        className="agenda-item__input"
                        value={item.title}
                        onChange={e => setAgendaField(i, 'title', e.target.value)}
                        onBlur={() => saveAgenda(agendaItems)}
                        placeholder={`Topic ${i + 1}`}
                      />
                      <button
                        className={cls('agenda-item__expand', expanded && 'agenda-item__expand--open')}
                        onClick={() => toggleAgendaExpand(i)}
                        title={expanded ? 'Collapse' : 'Add description'}
                      >
                        <Icon name="chev-down" size={12} />
                      </button>
                      {agendaItems.length > 1 && (
                        <button className="icon-btn icon-btn--sm" onClick={() => removeAgendaItem(i)} title="Remove">
                          <Icon name="x" size={11} />
                        </button>
                      )}
                    </div>
                    {expanded && (
                      <textarea
                        className="agenda-item__desc"
                        rows={3}
                        value={item.description}
                        onChange={e => setAgendaField(i, 'description', e.target.value)}
                        onBlur={() => saveAgenda(agendaItems)}
                        placeholder="Notes, context, or talking points…"
                        autoFocus
                      />
                    )}
                  </li>
                )
              })}
            </ul>
            <button className="agenda-add" onClick={addAgendaItem}>
              <Icon name="plus" size={12} /> Add item
            </button>
          </section>

          {/* Transcript */}
          <section className="card card--padded">
            <div className="card__h-row">
              <h4 className="card__h" style={{ marginBottom: 0 }}>Transcript</h4>
              <button className="btn btn--primary btn--sm" onClick={processTranscript} disabled={processing}>
                <Icon name="sparkle" size={13} />
                {processing ? 'Processing…' : 'Process with AI'}
              </button>
            </div>
            <div className="mtg-transcript">
              <textarea
                className="input"
                rows={10}
                value={transcript}
                onChange={e => setTranscript(e.target.value)}
                onBlur={() => onUpdate({ transcript })}
                placeholder="Paste your meeting transcript here. AI will extract a summary and action items."
              />
              {processing && <AILoading label="Reading transcript, drafting summary and action items…" />}
            </div>
          </section>
        </div>

        {/* ── Right column ─────────────────────────── */}
        <div className="mtg-detail__col">

          {/* AI Summary */}
          <section className="card card--padded">
            <div className="card__h-row">
              <h4 className="card__h" style={{ marginBottom: 0 }}>AI Summary</h4>
              {meeting.summary && (
                <button className="link-btn" onClick={() => { navigator.clipboard.writeText(meeting.summary); toast('Copied') }}>
                  <Icon name="copy" size={12} /> Copy
                </button>
              )}
            </div>
            <div className="mtg-summary">
              {meeting.summary
                ? <p className="prose">{meeting.summary}</p>
                : <span className="hint">Process a transcript to generate a summary.</span>}
            </div>
          </section>

          {/* Action Items */}
          <section className="card card--padded">
            <div className="card__h-row">
              <h4 className="card__h" style={{ marginBottom: 0 }}>
                Action Items
                {(meeting.action_items ?? []).length > 0 && (
                  <span className="mtg-ai-count">{(meeting.action_items ?? []).filter(a => a.accepted).length} ready</span>
                )}
              </h4>
              {(meeting.action_items ?? []).length > 0 && (
                <div className="action-push">
                  <div className="select-wrap">
                    <select className="select" value={pushSectionId} onChange={e => setPushSectionId(e.target.value)}>
                      {sections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <button className="btn btn--primary btn--sm" onClick={pushToTasks}>
                    <Icon name="arrow-r" size={13} /> Create tasks
                  </button>
                </div>
              )}
            </div>
            <div className="mtg-action-body">
              {(meeting.action_items ?? []).length === 0 ? (
                <span className="hint">No action items yet — process a transcript first.</span>
              ) : (
                <ul className="action-list">
                  {(meeting.action_items ?? []).map(a => (
                    <li key={a.id} className={cls('action-item', !a.accepted && 'action-item--off')}>
                      <button className="action-item__check" onClick={() => updateItem(a.id, { accepted: !a.accepted })}>
                        {a.accepted ? <Icon name="check-circle" size={15} /> : <Icon name="circle" size={15} />}
                      </button>
                      <div className="action-item__main">
                        <input
                          className="action-item__title"
                          value={a.title}
                          onChange={e => updateItem(a.id, { title: e.target.value })}
                        />
                        <textarea
                          className="action-item__desc"
                          rows={2}
                          value={a.description}
                          onChange={e => updateItem(a.id, { description: e.target.value })}
                        />
                        <div className="action-item__row">
                          <span className="action-item__label">Assignee</span>
                          <input
                            className="action-item__small"
                            value={a.assigneeName}
                            onChange={e => updateItem(a.id, { assigneeName: e.target.value })}
                            placeholder="Name…"
                          />
                          <span className="action-item__label">Due in</span>
                          <input
                            type="number"
                            className="action-item__small action-item__small--num"
                            value={a.dueInDays}
                            onChange={e => updateItem(a.id, { dueInDays: Number(e.target.value) })}
                          />
                          <span className="action-item__label">days</span>
                          <div className="select-wrap">
                            <select
                              className="select"
                              value={a.priority}
                              onChange={e => updateItem(a.id, { priority: e.target.value as ActionItemDraft['priority'] })}
                            >
                              {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                          </div>
                          <button className="icon-btn icon-btn--sm" onClick={() => removeItem(a.id)} title="Remove">
                            <Icon name="x" size={12} />
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

// ── CreateMeetingModal ────────────────────────────────────────────
function CreateMeetingModal({
  open, onClose, team, currentUserId, onCreate,
}: {
  open: boolean
  onClose: () => void
  team: TeamMember[]
  currentUserId: string
  onCreate: (p: { title: string; date: string; attendees: string[]; agenda: string }) => void
}) {
  const now = new Date()
  now.setHours(now.getHours() + 1, 0, 0, 0)
  const defaultDate = now.toISOString().slice(0, 16)

  interface ModalAgendaItem { title: string; description: string }
  const blankItems = (): ModalAgendaItem[] => [
    { title: '', description: '' }, { title: '', description: '' },
    { title: '', description: '' }, { title: '', description: '' },
  ]

  const [form, setForm]           = useState({ title: '', date: defaultDate, attendees: [currentUserId] })
  const [agendaItems, setAgendaItems] = useState<ModalAgendaItem[]>(blankItems)
  const [expandedModal, setExpandedModal] = useState<Set<number>>(new Set())

  useEffect(() => {
    if (open) {
      setForm({ title: '', date: defaultDate, attendees: [currentUserId] })
      setAgendaItems(blankItems())
      setExpandedModal(new Set())
    }
  }, [open])

  function toggleAttendee(id: string) {
    setForm(f => ({
      ...f,
      attendees: f.attendees.includes(id) ? f.attendees.filter(a => a !== id) : [...f.attendees, id],
    }))
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New meeting"
      footer={
        <>
          <button className="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn btn--primary"
            disabled={!form.title.trim()}
            onClick={() => onCreate({ ...form, agenda: JSON.stringify(agendaItems) })}
          >
            Create meeting
          </button>
        </>
      }
    >
      <div className="form-stack">
        <label>Title</label>
        <input
          className="input"
          value={form.title}
          onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
          placeholder="e.g. Weekly content sync"
          autoFocus
        />
        <label>Date &amp; time</label>
        <input
          type="datetime-local"
          className="input"
          value={form.date}
          onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
          style={{ colorScheme: 'dark' }}
        />
        <label>Attendees</label>
        <div className="attendee-row">
          {team.map(m => (
            <button
              key={m.id}
              className={cls('attendee', form.attendees.includes(m.id) && 'attendee--on')}
              onClick={() => toggleAttendee(m.id)}
            >
              <Avatar user={m} size={20} />
              <span>{m.name.split(' ')[0]}</span>
            </button>
          ))}
        </div>
        <label>Agenda</label>
        <ul className="agenda-list">
          {agendaItems.map((item, i) => {
            const exp = expandedModal.has(i)
            return (
              <li key={i} className={cls('agenda-item', exp && 'agenda-item--open')}>
                <div className="agenda-item__row">
                  <span className="agenda-item__num">{i + 1}</span>
                  <input
                    className="agenda-item__input"
                    value={item.title}
                    onChange={e => setAgendaItems(prev => { const n = [...prev]; n[i] = { ...n[i], title: e.target.value }; return n })}
                    placeholder={`Topic ${i + 1}`}
                  />
                  <button
                    className={cls('agenda-item__expand', exp && 'agenda-item__expand--open')}
                    onClick={() => setExpandedModal(prev => { const s = new Set(prev); s.has(i) ? s.delete(i) : s.add(i); return s })}
                  >
                    <Icon name="chev-down" size={12} />
                  </button>
                  {agendaItems.length > 1 && (
                    <button className="icon-btn icon-btn--sm" onClick={() => setAgendaItems(prev => prev.filter((_, idx) => idx !== i))}>
                      <Icon name="x" size={11} />
                    </button>
                  )}
                </div>
                {exp && (
                  <textarea
                    className="agenda-item__desc"
                    rows={2}
                    value={item.description}
                    onChange={e => setAgendaItems(prev => { const n = [...prev]; n[i] = { ...n[i], description: e.target.value }; return n })}
                    placeholder="Notes or talking points…"
                    autoFocus
                  />
                )}
              </li>
            )
          })}
        </ul>
        <button className="agenda-add" onClick={() => setAgendaItems(prev => [...prev, { title: '', description: '' }])}>
          <Icon name="plus" size={12} /> Add item
        </button>
      </div>
    </Modal>
  )
}
