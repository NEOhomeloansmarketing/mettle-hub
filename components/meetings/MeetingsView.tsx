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
  const [title, setTitle] = useState(meeting.title)
  const [agenda, setAgenda] = useState(meeting.agenda ?? '')
  const [transcript, setTranscript] = useState(meeting.transcript ?? '')
  const [processing, setProcessing] = useState(false)
  const [pushSectionId, setPushSectionId] = useState(sections[0]?.id ?? '')

  useEffect(() => {
    setTitle(meeting.title)
    setAgenda(meeting.agenda ?? '')
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
      const res = await fetch('/api/ai/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: `You read meeting transcripts and extract structured output.
Return ONLY a JSON object matching this schema (no prose, no fences):
{
  "summary": "3-5 sentence summary",
  "actionItems": [
    { "title": "...", "description": "...", "assigneeName": "exact team-member name or empty string", "dueInDays": 7, "priority": "Low|Medium|High|Urgent" }
  ]
}
Known team members: ${teamNames}. If an assignee isn't named in the transcript, leave assigneeName as "".`,
          user: 'Transcript:\n' + transcript.slice(0, 12000),
          maxTokens: 1400,
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
      <header className="mtg-detail__head">
        <div style={{ flex: 1 }}>
          <input
            className="mtg-detail__title"
            value={title}
            onChange={e => setTitle(e.target.value)}
            onBlur={e => onUpdate({ title: e.target.value.trim() || 'Untitled meeting' })}
          />
          <div className="mtg-detail__meta">
            <Icon name="calendar" size={12} />
            <span>{fmtDateTime(meeting.date)}</span>
            <span className="dot-sep">·</span>
            <span>{attendeeIds.length} attending</span>
          </div>
        </div>
        <div className="mtg-detail__actions">
          <button className="icon-btn" onClick={onDelete} title="Delete meeting">
            <Icon name="trash" size={14} />
          </button>
        </div>
      </header>

      <div className="mtg-detail__grid">
        <div className="mtg-detail__col">
          <section className="card card--padded">
            <h4 className="card__h">Attendees</h4>
            <div className="attendee-row">
              {team.map(m => (
                <button
                  key={m.id}
                  className={cls('attendee', attendeeIds.includes(m.id) && 'attendee--on')}
                  onClick={() => toggleAttendee(m.id)}
                >
                  <Avatar user={m} size={22} />
                  <span>{m.name.split(' ')[0]}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="card card--padded">
            <h4 className="card__h">Agenda</h4>
            <textarea
              className="input"
              rows={4}
              value={agenda}
              onChange={e => setAgenda(e.target.value)}
              onBlur={e => onUpdate({ agenda: e.target.value })}
              placeholder="What are you covering?"
              style={{ resize: 'vertical' }}
            />
          </section>

          <section className="card card--padded">
            <div className="card__h-row">
              <h4 className="card__h" style={{ marginBottom: 0 }}>Transcript</h4>
              <button className="btn btn--primary btn--sm" onClick={processTranscript} disabled={processing}>
                <Icon name="sparkle" size={13} />
                {processing ? 'Processing…' : 'Process with AI'}
              </button>
            </div>
            <div style={{ marginTop: 12 }}>
              <textarea
                className="input"
                rows={10}
                value={transcript}
                onChange={e => setTranscript(e.target.value)}
                onBlur={() => onUpdate({ transcript })}
                placeholder="Paste your meeting transcript here. AI will extract a summary and action items."
                style={{ resize: 'vertical' }}
              />
              {processing && <AILoading label="Reading transcript, drafting summary and action items…" />}
            </div>
          </section>
        </div>

        <div className="mtg-detail__col">
          <section className="card card--padded">
            <div className="card__h-row">
              <h4 className="card__h" style={{ marginBottom: 0 }}>AI summary</h4>
              {meeting.summary && (
                <button
                  className="link-btn"
                  onClick={() => { navigator.clipboard.writeText(meeting.summary); toast('Copied') }}
                >
                  <Icon name="copy" size={12} /> Copy
                </button>
              )}
            </div>
            <div style={{ marginTop: 12 }}>
              {meeting.summary
                ? <p className="prose">{meeting.summary}</p>
                : <span className="hint">No summary yet — process a transcript to generate one.</span>}
            </div>
          </section>

          <section className="card card--padded">
            <div className="card__h-row">
              <h4 className="card__h" style={{ marginBottom: 0 }}>
                Action items{' '}
                <span style={{ color: 'var(--muted)', fontWeight: 400 }}>
                  ({(meeting.action_items ?? []).filter(a => a.accepted).length} ready)
                </span>
              </h4>
              {(meeting.action_items ?? []).length > 0 && (
                <div className="action-push">
                  <div className="select-wrap">
                    <select
                      className="select"
                      value={pushSectionId}
                      onChange={e => setPushSectionId(e.target.value)}
                    >
                      {sections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <button className="btn btn--primary btn--sm" onClick={pushToTasks}>
                    <Icon name="arrow-r" size={13} /> Create tasks
                  </button>
                </div>
              )}
            </div>
            <div style={{ marginTop: 12 }}>
              {(meeting.action_items ?? []).length === 0 ? (
                <span className="hint">No action items yet.</span>
              ) : (
                <ul className="action-list">
                  {(meeting.action_items ?? []).map(a => (
                    <li key={a.id} className={cls('action-item', !a.accepted && 'action-item--off')}>
                      <button
                        className="action-item__check"
                        onClick={() => updateItem(a.id, { accepted: !a.accepted })}
                      >
                        {a.accepted
                          ? <Icon name="check-circle" size={15} />
                          : <Icon name="circle" size={15} />}
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
                          <span style={{ color: 'var(--muted)' }}>Assignee</span>
                          <input
                            className="action-item__small"
                            value={a.assigneeName}
                            onChange={e => updateItem(a.id, { assigneeName: e.target.value })}
                            placeholder="Name…"
                          />
                          <span style={{ color: 'var(--muted)' }}>Due in</span>
                          <input
                            type="number"
                            className="action-item__small action-item__small--num"
                            value={a.dueInDays}
                            onChange={e => updateItem(a.id, { dueInDays: Number(e.target.value) })}
                          />
                          <span style={{ color: 'var(--muted)' }}>days</span>
                          <div className="select-wrap">
                            <select
                              className="select"
                              value={a.priority}
                              onChange={e => updateItem(a.id, { priority: e.target.value as ActionItemDraft['priority'] })}
                            >
                              {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                          </div>
                          <button
                            className="icon-btn icon-btn--sm"
                            onClick={() => removeItem(a.id)}
                            title="Remove"
                          >
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

  const [form, setForm] = useState({
    title: '', date: defaultDate, attendees: [currentUserId], agenda: '',
  })

  useEffect(() => {
    if (open) setForm({ title: '', date: defaultDate, attendees: [currentUserId], agenda: '' })
  }, [open])

  function toggleAttendee(id: string) {
    setForm(f => ({
      ...f,
      attendees: f.attendees.includes(id)
        ? f.attendees.filter(a => a !== id)
        : [...f.attendees, id],
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
            onClick={() => onCreate(form)}
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
              <Avatar user={m} size={22} />
              <span>{m.name.split(' ')[0]}</span>
            </button>
          ))}
        </div>
        <label>Agenda</label>
        <textarea
          className="input"
          rows={3}
          value={form.agenda}
          onChange={e => setForm(f => ({ ...f, agenda: e.target.value }))}
          placeholder="Topics to cover…"
          style={{ resize: 'vertical' }}
        />
      </div>
    </Modal>
  )
}
