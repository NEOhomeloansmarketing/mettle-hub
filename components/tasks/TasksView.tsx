'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Icon } from '@/components/ui/Icon'
import { Avatar } from '@/components/ui/Avatar'
import { Modal } from '@/components/ui/Modal'
import { AILoading } from '@/components/ui/AILoading'
import { useToast } from '@/components/ui/Toast'
import { CHANNELS, STATUSES, PRIORITIES } from '@/lib/types'
import type { Task, TaskComment, Section, Account } from '@/lib/types'
import { cls, fmtDate, relTime } from '@/lib/utils'

type TaskRow = Task & {
  accounts: Pick<Account, 'id' | 'name' | 'color' | 'initials'> | null
}
type TeamMember = Pick<Account, 'id' | 'name' | 'color' | 'initials' | 'email'>

interface TasksViewProps {
  initialSections: Section[]
  initialTasks: TaskRow[]
  team: TeamMember[]
  currentUserId: string
  initialTaskId?: string | null
}

export function TasksView({ initialSections, initialTasks, team, currentUserId, initialTaskId }: TasksViewProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { push: toast } = useToast()
  const supabase = createClient()

  const [sections, setSections] = useState<Section[]>(initialSections)
  const [tasks, setTasks] = useState<TaskRow[]>(initialTasks)
  const [view, setView] = useState<'mine' | 'team' | 'done'>('mine')
  const [filter, setFilter] = useState({ status: 'all', priority: 'all', channel: 'all', assignee: 'all' })
  const [createInSection, setCreateInSection] = useState<string | null>(null)
  const [aiPanelOpen, setAiPanelOpen] = useState(false)

  const openTaskId = searchParams.get('task') ?? initialTaskId ?? null

  function setOpenTask(id: string | null) {
    const p = new URLSearchParams(searchParams.toString())
    if (id) p.set('task', id)
    else p.delete('task')
    router.push(`/tasks${p.size > 0 ? '?' + p.toString() : ''}`, { scroll: false })
  }

  const sortedSections = useMemo(
    () => [...sections].sort((a, b) => a.order_index - b.order_index),
    [sections],
  )

  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      if (view === 'done') return t.status === 'Done'
      if (t.status === 'Done') return false
      if (view === 'mine' && t.assignee_id !== currentUserId) return false
      if (view === 'team' && t.assignee_id === currentUserId) return false
      if (filter.status !== 'all' && t.status !== filter.status) return false
      if (filter.priority !== 'all' && t.priority !== filter.priority) return false
      if (filter.assignee !== 'all' && t.assignee_id !== filter.assignee) return false
      if (filter.channel !== 'all' && t.channel !== filter.channel) return false
      return true
    })
  }, [tasks, filter, view, currentUserId])

  const tasksBySection = useMemo(() => {
    const map: Record<string, TaskRow[]> = {}
    sortedSections.forEach(s => (map[s.id] = []))
    const firstId = sortedSections[0]?.id
    filteredTasks.forEach(t => {
      const key = t.section_id && map[t.section_id] !== undefined ? t.section_id : firstId
      if (key) map[key].push(t)
    })
    const statusOrder: Record<string, number> = { 'To Do': 0, 'In Progress': 1, 'In Review': 2, 'Done': 3 }
    Object.values(map).forEach(arr =>
      arr.sort((a, b) =>
        (statusOrder[a.status] ?? 0) - (statusOrder[b.status] ?? 0) ||
        (a.due && b.due ? a.due.localeCompare(b.due) : a.due ? -1 : b.due ? 1 : 0),
      ),
    )
    return map
  }, [filteredTasks, sortedSections])

  // ── Task CRUD ──────────────────────────────────────────────────
  async function createTask(payload: {
    title: string
    description?: string
    assignee_id?: string
    due?: string | null
    status?: string
    priority?: string
    channel?: string
    section_id?: string
  }) {
    const { data, error } = await supabase
      .from('tasks')
      .insert({
        title: payload.title,
        description: payload.description ?? '',
        assignee_id: payload.assignee_id ?? currentUserId,
        due: payload.due ?? null,
        status: (payload.status as Task['status']) ?? 'To Do',
        priority: (payload.priority as Task['priority']) ?? 'Medium',
        channel: (payload.channel as Task['channel']) ?? 'All',
        section_id: payload.section_id ?? sortedSections[0]?.id ?? null,
        meeting_id: null,
      })
      .select('*, accounts!tasks_assignee_id_fkey(id,name,color,initials)')
      .single()
    if (error) { toast(error.message, 'error'); return }
    setTasks(prev => [data as TaskRow, ...prev])
    toast('Task created', 'success')
    await supabase.from('activity').insert({ kind: 'task', label: `Task created: ${payload.title}` })
  }

  async function updateTask(id: string, patch: Partial<TaskRow>) {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t))
    const { error } = await supabase.from('tasks').update(patch).eq('id', id)
    if (error) toast(error.message, 'error')
  }

  async function deleteTask(id: string) {
    const title = tasks.find(t => t.id === id)?.title
    setTasks(prev => prev.filter(t => t.id !== id))
    setOpenTask(null)
    const { error } = await supabase.from('tasks').delete().eq('id', id)
    if (error) toast(error.message, 'error')
    else toast('Task deleted')
  }

  // ── Section ops ────────────────────────────────────────────────
  async function createSection(name: string) {
    const maxIdx = sections.reduce((m, s) => Math.max(m, s.order_index), -1)
    const { data, error } = await supabase
      .from('sections')
      .insert({ name: name.trim(), order_index: maxIdx + 1 })
      .select()
      .single()
    if (error) { toast(error.message, 'error'); return }
    setSections(prev => [...prev, data as Section])
  }

  async function renameSection(id: string, name: string) {
    setSections(prev => prev.map(s => s.id === id ? { ...s, name } : s))
    const { error } = await supabase.from('sections').update({ name }).eq('id', id)
    if (error) toast(error.message, 'error')
  }

  async function deleteSection(id: string) {
    const fallback = sortedSections.find(s => s.id !== id)
    if (!fallback) { toast('Keep at least one section.', 'error'); return }
    if (!window.confirm(`Delete this section? Its tasks will move to "${fallback.name}".`)) return
    setTasks(prev => prev.map(t => t.section_id === id ? { ...t, section_id: fallback.id } : t))
    setSections(prev => prev.filter(s => s.id !== id))
    await supabase.from('tasks').update({ section_id: fallback.id }).eq('section_id', id)
    const { error } = await supabase.from('sections').delete().eq('id', id)
    if (error) toast(error.message, 'error')
    else toast('Section deleted')
  }

  async function moveSection(id: string, dir: -1 | 1) {
    const idx = sortedSections.findIndex(s => s.id === id)
    const newIdx = idx + dir
    if (newIdx < 0 || newIdx >= sortedSections.length) return
    const next = [...sortedSections]
    ;[next[idx], next[newIdx]] = [next[newIdx], next[idx]]
    const updated = next.map((s, i) => ({ ...s, order_index: i }))
    setSections(updated)
    await Promise.all(updated.map(s => supabase.from('sections').update({ order_index: s.order_index }).eq('id', s.id)))
  }

  const openTask = tasks.find(t => t.id === openTaskId) ?? null

  return (
    <div className="page page--tasks">
      <div className={cls('tasks-shell tasks-shell--flat', openTask && 'tasks-shell--with-drawer')}>
        <main className="tasks-main">
          <div className="tasks-main__head">
            <div>
              <div className="tasks-main__kicker">My workspace</div>
              <h2 className="tasks-main__title">Tasks</h2>
              <p className="tasks-main__desc">
                {filteredTasks.length} task{filteredTasks.length !== 1 ? 's' : ''} across{' '}
                {sortedSections.length} section{sortedSections.length !== 1 ? 's' : ''}.
              </p>
            </div>
            <div className="tasks-main__actions">
              <div className="paid-tabs">
                <button
                  className={cls('paid-tab', view === 'mine' && 'paid-tab--on')}
                  onClick={() => setView('mine')}
                >
                  My Tasks
                </button>
                <button
                  className={cls('paid-tab', view === 'team' && 'paid-tab--on')}
                  onClick={() => setView('team')}
                >
                  Team Tasks
                </button>
                <button
                  className={cls('paid-tab', view === 'done' && 'paid-tab--on')}
                  onClick={() => setView('done')}
                >
                  Finished
                </button>
              </div>
              <button className="btn btn--ghost" onClick={() => setAiPanelOpen(true)}>
                <Icon name="sparkle" size={14} /> Ask AI
              </button>
              {view !== 'done' && (
                <button
                  className="btn btn--primary"
                  onClick={() => setCreateInSection(sortedSections[0]?.id ?? null)}
                >
                  <Icon name="plus" size={14} /> New task
                </button>
              )}
            </div>
          </div>

          <div className="filter-row">
            <div className="filter-row__group">
              <Icon name="filter" size={13} />
              <div className="select-wrap">
                <select className="select" value={filter.status} onChange={e => setFilter(f => ({ ...f, status: e.target.value }))}>
                  <option value="all">All statuses</option>
                  {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="select-wrap">
                <select className="select" value={filter.priority} onChange={e => setFilter(f => ({ ...f, priority: e.target.value }))}>
                  <option value="all">Any priority</option>
                  {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="select-wrap">
                <select className="select" value={filter.channel} onChange={e => setFilter(f => ({ ...f, channel: e.target.value }))}>
                  <option value="all">Any channel</option>
                  {Object.keys(CHANNELS).map(c => <option key={c} value={c}>{CHANNELS[c].label}</option>)}
                </select>
              </div>
              <div className="select-wrap">
                <select className="select" value={filter.assignee} onChange={e => setFilter(f => ({ ...f, assignee: e.target.value }))}>
                  <option value="all">Any assignee</option>
                  {team.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
            </div>
            <div className="filter-row__count">
              {filteredTasks.length} {filteredTasks.length === 1 ? 'task' : 'tasks'}
            </div>
          </div>

          <div className="asana-table">
            <div className="asana-thead">
              <div className="asana-col asana-col--name">Task</div>
              <div className="asana-col asana-col--assignee">Assignee</div>
              <div className="asana-col asana-col--due">Due date</div>
              <div className="asana-col asana-col--priority">Priority</div>
              <div className="asana-col asana-col--channel">Channel</div>
              <div className="asana-col asana-col--add" />
            </div>
            {sortedSections.map((sec, i) => (
              <SectionGroup
                key={sec.id}
                section={sec}
                isFirst={i === 0}
                isLast={i === sortedSections.length - 1}
                tasks={tasksBySection[sec.id] ?? []}
                team={team}
                sections={sortedSections}
                readOnly={view === 'done'}
                onRename={name => renameSection(sec.id, name)}
                onDelete={() => deleteSection(sec.id)}
                onMove={dir => moveSection(sec.id, dir)}
                onAddTask={() => setCreateInSection(sec.id)}
                onOpenTask={id => setOpenTask(id)}
                onUpdateTask={(id, patch) => updateTask(id, patch)}
              />
            ))}
            {view !== 'done' && (
              <button
                className="asana-addsection"
                onClick={() => {
                  const name = window.prompt('Section name?')
                  if (name?.trim()) createSection(name.trim())
                }}
              >
                <Icon name="plus" size={13} /> Add section
              </button>
            )}
          </div>
        </main>

        {openTask && (
          <TaskDrawer
            task={openTask}
            team={team}
            sections={sortedSections}
            currentUserId={currentUserId}
            onClose={() => setOpenTask(null)}
            onUpdate={patch => updateTask(openTask.id, patch)}
            onDelete={() => deleteTask(openTask.id)}
          />
        )}
      </div>

      <CreateTaskModal
        open={createInSection !== null}
        onClose={() => setCreateInSection(null)}
        team={team}
        sections={sortedSections}
        currentUserId={currentUserId}
        defaultSectionId={createInSection ?? sortedSections[0]?.id ?? ''}
        onCreate={payload => { createTask(payload); setCreateInSection(null) }}
      />

      {aiPanelOpen && (
        <AskAIModal tasks={filteredTasks} onClose={() => setAiPanelOpen(false)} />
      )}
    </div>
  )
}

// ── SectionGroup ──────────────────────────────────────────────────
function SectionGroup({
  section, isFirst, isLast, tasks, team, sections, readOnly,
  onRename, onDelete, onMove, onAddTask, onOpenTask, onUpdateTask,
}: {
  section: Section
  isFirst: boolean
  isLast: boolean
  tasks: TaskRow[]
  team: TeamMember[]
  sections: Section[]
  readOnly?: boolean
  onRename: (name: string) => void
  onDelete: () => void
  onMove: (dir: -1 | 1) => void
  onAddTask: () => void
  onOpenTask: (id: string) => void
  onUpdateTask: (id: string, patch: Partial<TaskRow>) => void
}) {
  const [open, setOpen] = useState(true)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(section.name)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => setName(section.name), [section.name])

  function commit() {
    if (name.trim() && name.trim() !== section.name) onRename(name.trim())
    else setName(section.name)
    setEditing(false)
  }

  return (
    <div className={cls('asana-section', !open && 'asana-section--collapsed')}>
      <div className="asana-section__head">
        <button
          className="asana-section__toggle"
          onClick={() => setOpen(x => !x)}
          aria-label="Toggle section"
        >
          <span style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.15s', display: 'block' }}>
            <Icon name="chev-down" size={11} />
          </span>
        </button>
        {editing ? (
          <input
            className="asana-section__edit"
            value={name}
            onChange={e => setName(e.target.value)}
            onBlur={commit}
            onKeyDown={e => {
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') { setName(section.name); setEditing(false) }
            }}
            autoFocus
          />
        ) : (
          <button className="asana-section__name" onClick={() => setEditing(true)} title="Click to rename">
            {section.name}
          </button>
        )}
        <span className="asana-section__count">{tasks.length}</span>
        <div className="asana-section__menu">
          <button
            className="icon-btn icon-btn--sm"
            onClick={() => setMenuOpen(x => !x)}
            title="Section options"
          >
            <Icon name="more" size={14} />
          </button>
          {menuOpen && (
            <div className="popover" onMouseLeave={() => setMenuOpen(false)}>
              <button className="popover__item" onClick={() => { setEditing(true); setMenuOpen(false) }}>
                <Icon name="edit" size={13} /> Rename
              </button>
              <button className="popover__item" disabled={isFirst} onClick={() => { onMove(-1); setMenuOpen(false) }}>
                <Icon name="arrow-up" size={13} /> Move up
              </button>
              <button className="popover__item" disabled={isLast} onClick={() => { onMove(1); setMenuOpen(false) }}>
                <Icon name="arrow-down" size={13} /> Move down
              </button>
              <button className="popover__item popover__item--danger" onClick={() => { onDelete(); setMenuOpen(false) }}>
                <Icon name="trash" size={13} /> Delete section
              </button>
            </div>
          )}
        </div>
      </div>
      {open && (
        <div className="asana-section__body">
          {tasks.length === 0 && (
            <div className="asana-section__empty">No tasks here yet.</div>
          )}
          {tasks.map(t => (
            <AsanaRow
              key={t.id}
              task={t}
              team={team}
              onClick={() => onOpenTask(t.id)}
              onUpdate={patch => onUpdateTask(t.id, patch)}
            />
          ))}
          {!readOnly && (
            <button className="asana-add" onClick={onAddTask}>
              <Icon name="plus" size={12} /> Add task
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── AsanaRow ──────────────────────────────────────────────────────
function AsanaRow({
  task, team, onClick, onUpdate,
}: {
  task: TaskRow
  team: TeamMember[]
  onClick: () => void
  onUpdate: (patch: Partial<TaskRow>) => void
}) {
  const now = Date.now()
  const late = task.due && new Date(task.due).getTime() < now && task.status !== 'Done'

  return (
    <div className="asana-row" onClick={onClick}>
      <div className="asana-col asana-col--name">
        <button
          className="asana-row__check"
          onClick={e => {
            e.stopPropagation()
            onUpdate({ status: task.status === 'Done' ? 'To Do' : 'Done' })
          }}
        >
          {task.status === 'Done'
            ? <Icon name="check-circle" size={15} />
            : <Icon name="circle" size={15} />}
        </button>
        <span className={cls('asana-row__title', task.status === 'Done' && 'asana-row__title--done')}>
          {task.title}
        </span>
      </div>
      <div className="asana-col asana-col--assignee" onClick={e => e.stopPropagation()}>
        <div className="select-wrap" style={{ width: '100%' }}>
          <select
            className="select"
            value={task.assignee_id ?? ''}
            onChange={e => onUpdate({ assignee_id: e.target.value || null })}
          >
            <option value="">Unassigned</option>
            {team.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
      </div>
      <div className={cls('asana-col asana-col--due', late && 'asana-col--due-late')} onClick={e => e.stopPropagation()}>
        <input
          type="date"
          className="asana-date"
          value={task.due ? task.due.slice(0, 10) : ''}
          onChange={e => onUpdate({ due: e.target.value || null })}
        />
      </div>
      <div className="asana-col asana-col--priority" onClick={e => e.stopPropagation()}>
        <div className="select-wrap" style={{ width: '100%' }}>
          <select
            className="select"
            value={task.priority}
            onChange={e => onUpdate({ priority: e.target.value as Task['priority'] })}
          >
            {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>
      <div className="asana-col asana-col--channel" onClick={e => e.stopPropagation()}>
        <div className="select-wrap" style={{ width: '100%' }}>
          <select
            className="select"
            value={task.channel}
            onChange={e => onUpdate({ channel: e.target.value as Task['channel'] })}
          >
            {Object.keys(CHANNELS).map(c => <option key={c} value={c}>{CHANNELS[c].short}</option>)}
          </select>
        </div>
      </div>
      <div className="asana-col asana-col--add" />
    </div>
  )
}

// ── TaskDrawer ────────────────────────────────────────────────────
function TaskDrawer({
  task, team, sections, currentUserId, onClose, onUpdate, onDelete,
}: {
  task: TaskRow
  team: TeamMember[]
  sections: Section[]
  currentUserId: string
  onClose: () => void
  onUpdate: (patch: Partial<TaskRow>) => void
  onDelete: () => void
}) {
  const supabase = createClient()
  const { push: toast } = useToast()
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description ?? '')
  const [comments, setComments] = useState<TaskComment[]>([])
  const [commentText, setCommentText] = useState('')
  const [aiOpen, setAiOpen] = useState(false)
  const [aiQ, setAiQ] = useState('')
  const [aiReply, setAiReply] = useState('')
  const [aiLoading, setAiLoading] = useState(false)

  useEffect(() => {
    setTitle(task.title)
    setDescription(task.description ?? '')
    setAiReply('')
    setAiQ('')
  }, [task.id])

  useEffect(() => {
    supabase
      .from('task_comments')
      .select('*')
      .eq('task_id', task.id)
      .order('created_at', { ascending: true })
      .then(({ data }) => setComments(data ?? []))
  }, [task.id])

  async function addComment() {
    if (!commentText.trim()) return
    const { data, error } = await supabase
      .from('task_comments')
      .insert({ task_id: task.id, author_id: currentUserId, body: commentText.trim() })
      .select()
      .single()
    if (error) { toast(error.message, 'error'); return }
    setComments(prev => [...prev, data as TaskComment])
    setCommentText('')
  }

  async function askAI() {
    if (!aiQ.trim()) return
    setAiLoading(true); setAiReply('')
    try {
      const res = await fetch('/api/ai/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: 'You are a senior marketing operations assistant. Be concise and actionable.',
          user: `Task: ${task.title}\nDescription: ${task.description}\nStatus: ${task.status}\nPriority: ${task.priority}\nChannel: ${task.channel}\n\nQuestion: ${aiQ}`,
          maxTokens: 700,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'AI error')
      setAiReply(json.text)
      await supabase.from('activity').insert({ kind: 'ai', label: `AI assist on task: ${task.title}` })
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setAiLoading(false)
    }
  }

  return (
    <aside className="drawer">
      <header className="drawer__head">
        <div className="drawer__head-l">
          <input
            className="drawer__title"
            value={title}
            onChange={e => setTitle(e.target.value)}
            onBlur={e => { if (e.target.value.trim()) onUpdate({ title: e.target.value.trim() }) }}
          />
        </div>
        <div className="drawer__head-r">
          <button
            className="icon-btn"
            title="Delete task"
            onClick={() => { if (window.confirm('Delete this task?')) onDelete() }}
          >
            <Icon name="trash" size={14} />
          </button>
          <button className="icon-btn" title="Close" onClick={onClose}>
            <Icon name="x" size={14} />
          </button>
        </div>
      </header>

      <div className="drawer__meta">
        <div className="drawer__row">
          <label>Status</label>
          <div className="select-wrap">
            <select className="select" value={task.status} onChange={e => onUpdate({ status: e.target.value as Task['status'] })}>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div className="drawer__row">
          <label>Priority</label>
          <div className="select-wrap">
            <select className="select" value={task.priority} onChange={e => onUpdate({ priority: e.target.value as Task['priority'] })}>
              {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>
        <div className="drawer__row">
          <label>Assignee</label>
          <div className="select-wrap">
            <select className="select" value={task.assignee_id ?? ''} onChange={e => onUpdate({ assignee_id: e.target.value || null })}>
              <option value="">Unassigned</option>
              {team.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
        </div>
        <div className="drawer__row">
          <label>Due date</label>
          <input
            type="date"
            className="input"
            value={task.due ? task.due.slice(0, 10) : ''}
            onChange={e => onUpdate({ due: e.target.value || null })}
          />
        </div>
        <div className="drawer__row">
          <label>Section</label>
          <div className="select-wrap">
            <select className="select" value={task.section_id ?? ''} onChange={e => onUpdate({ section_id: e.target.value || null })}>
              {sections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>
        <div className="drawer__row">
          <label>Channel</label>
          <div className="select-wrap">
            <select className="select" value={task.channel} onChange={e => onUpdate({ channel: e.target.value as Task['channel'] })}>
              {Object.keys(CHANNELS).map(c => <option key={c} value={c}>{CHANNELS[c].label}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="drawer__section">
        <label>Description</label>
        <textarea
          className="input"
          rows={3}
          value={description}
          onChange={e => setDescription(e.target.value)}
          onBlur={e => onUpdate({ description: e.target.value })}
          placeholder="Add details, links, or context…"
          style={{ resize: 'vertical' }}
        />
      </div>

      <div className="drawer__section">
        <div className="drawer__section-label">
          <span>Comments</span>
          <button className="link-btn" onClick={() => setAiOpen(x => !x)}>
            <Icon name="sparkle" size={11} /> Ask AI
          </button>
        </div>

        {aiOpen && (
          <div className="ai-block">
            <input
              className="input"
              value={aiQ}
              onChange={e => setAiQ(e.target.value)}
              placeholder="e.g. Break this into subtasks for the week."
              onKeyDown={e => { if (e.key === 'Enter') askAI() }}
            />
            <button className="btn btn--primary btn--sm" onClick={askAI} disabled={aiLoading || !aiQ.trim()}>
              <Icon name="sparkle" size={13} /> {aiLoading ? 'Thinking…' : 'Ask'}
            </button>
            {aiLoading && <AILoading label="AI is reasoning about this task…" />}
            {aiReply && (
              <div className="ai-block__reply">
                {aiReply.split('\n').filter(Boolean).map((line, i) => <p key={i}>{line}</p>)}
              </div>
            )}
          </div>
        )}

        {comments.length > 0 && (
          <ul className="comments">
            {comments.map(c => {
              const author = team.find(m => m.id === c.author_id)
              return (
                <li key={c.id} className="comment">
                  <Avatar user={author ?? { name: '?', color: '#666', initials: '?' }} size={26} />
                  <div className="comment__body">
                    <div className="comment__head">
                      <span className="comment__name">{author?.name ?? 'Someone'}</span>
                      <span className="comment__time">{relTime(c.created_at)}</span>
                    </div>
                    <div className="comment__text">{c.body}</div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        <textarea
          className="input"
          rows={2}
          value={commentText}
          onChange={e => setCommentText(e.target.value)}
          placeholder="Add a comment…"
          onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') addComment() }}
          style={{ resize: 'none' }}
        />
        <div className="drawer__send">
          <span className="hint">
            <kbd>⌘</kbd>+<kbd>Enter</kbd> to send
          </span>
          <button className="btn btn--primary btn--sm" onClick={addComment} disabled={!commentText.trim()}>
            <Icon name="send" size={13} /> Comment
          </button>
        </div>
      </div>
    </aside>
  )
}

// ── CreateTaskModal ───────────────────────────────────────────────
function CreateTaskModal({
  open, onClose, team, sections, currentUserId, defaultSectionId, onCreate,
}: {
  open: boolean
  onClose: () => void
  team: TeamMember[]
  sections: Section[]
  currentUserId: string
  defaultSectionId: string
  onCreate: (payload: {
    title: string; description?: string; assignee_id?: string; due?: string | null
    status?: string; priority?: string; channel?: string; section_id?: string
  }) => void
}) {
  const [form, setForm] = useState({
    title: '', description: '', assignee_id: currentUserId, due: '',
    status: 'To Do', priority: 'Medium', channel: 'All', section_id: defaultSectionId,
  })

  useEffect(() => {
    if (open) setForm(f => ({ ...f, title: '', description: '', section_id: defaultSectionId }))
  }, [open, defaultSectionId])

  function submit() {
    if (!form.title.trim()) return
    onCreate({ ...form, due: form.due || null })
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="New task"
      footer={
        <>
          <button className="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn--primary" disabled={!form.title.trim()} onClick={submit}>
            Create task
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
          placeholder="What needs to happen?"
          autoFocus
          onKeyDown={e => { if (e.key === 'Enter') submit() }}
        />
        <label>Description</label>
        <textarea
          className="input"
          rows={3}
          value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          placeholder="Optional details, links, references."
          style={{ resize: 'vertical' }}
        />
        <div className="form-row">
          <div>
            <label>Section</label>
            <div className="select-wrap">
              <select className="select" value={form.section_id} onChange={e => setForm(f => ({ ...f, section_id: e.target.value }))}>
                {sections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label>Assignee</label>
            <div className="select-wrap">
              <select className="select" value={form.assignee_id} onChange={e => setForm(f => ({ ...f, assignee_id: e.target.value }))}>
                {team.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label>Due date</label>
            <input type="date" className="input" value={form.due} onChange={e => setForm(f => ({ ...f, due: e.target.value }))} />
          </div>
          <div>
            <label>Priority</label>
            <div className="select-wrap">
              <select className="select" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
        </div>
        <label>Channel</label>
        <div className="select-wrap">
          <select className="select" value={form.channel} onChange={e => setForm(f => ({ ...f, channel: e.target.value }))}>
            {Object.keys(CHANNELS).map(c => <option key={c} value={c}>{CHANNELS[c].label}</option>)}
          </select>
        </div>
      </div>
    </Modal>
  )
}

// ── AskAIModal ────────────────────────────────────────────────────
function AskAIModal({ tasks, onClose }: { tasks: TaskRow[]; onClose: () => void }) {
  const { push: toast } = useToast()
  const supabase = createClient()
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)
  const [reply, setReply] = useState('')

  async function run() {
    if (!q.trim()) return
    setLoading(true); setReply('')
    try {
      const taskList = tasks.slice(0, 20)
        .map(t => `- [${t.status}] ${t.title} (${t.priority}, ${t.channel})`)
        .join('\n')
      const res = await fetch('/api/ai/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: 'You are an expert marketing project manager. Be concise, structured, and grounded in the task context provided.',
          user: `My current tasks:\n${taskList}\n\nMy question: ${q}`,
          maxTokens: 900,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'AI error')
      setReply(json.text)
      await supabase.from('activity').insert({ kind: 'ai', label: 'AI consult across tasks' })
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={<span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="sparkle" size={14} /> Ask AI about your tasks</span>}
      footer={
        <>
          <button className="btn btn--ghost" onClick={onClose}>Close</button>
          <button className="btn btn--primary" onClick={run} disabled={loading || !q.trim()}>
            <Icon name="sparkle" size={13} /> {loading ? 'Thinking…' : 'Ask'}
          </button>
        </>
      }
    >
      <div className="form-stack">
        <textarea
          className="input"
          rows={3}
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="e.g. What's at risk this week? Suggest 3 tasks I should pull in next."
          onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') run() }}
          autoFocus
          style={{ resize: 'vertical' }}
        />
        {loading && <AILoading label="Reasoning across your tasks…" />}
        {reply && (
          <div className="ai-block__reply ai-block__reply--lg">
            {reply.split('\n').filter(Boolean).map((line, i) => <p key={i}>{line}</p>)}
          </div>
        )}
      </div>
    </Modal>
  )
}
