'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Icon } from '@/components/ui/Icon'
import { ChannelChip } from '@/components/ui/ChannelChip'
import { AILoading } from '@/components/ui/AILoading'
import { useToast } from '@/components/ui/Toast'
import { CHANNELS } from '@/lib/types'
import type { Note } from '@/lib/types'
import { cls, relTime, stripHtml } from '@/lib/utils'

interface NotesViewProps {
  initialNotes: Note[]
}

export function NotesView({ initialNotes }: NotesViewProps) {
  const { push: toast } = useToast()
  const supabase = createClient()

  const [notes, setNotes] = useState<Note[]>(initialNotes)
  const [activeId, setActiveId] = useState<string | null>(initialNotes[0]?.id ?? null)
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!search.trim()) return notes
    const q = search.toLowerCase()
    return notes.filter(n =>
      n.title.toLowerCase().includes(q) || (n.body ?? '').toLowerCase().includes(q),
    )
  }, [notes, search])

  const sorted = [...filtered].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  )

  async function createNote() {
    const { data, error } = await supabase
      .from('notes')
      .insert({ title: 'Untitled note', body: '', tags: [] })
      .select()
      .single()
    if (error) { toast(error.message, 'error'); return }
    setNotes(prev => [data as Note, ...prev])
    setActiveId(data.id)
  }

  async function updateNote(id: string, patch: Partial<Note>) {
    const updatedAt = new Date().toISOString()
    setNotes(prev => prev.map(n => n.id === id ? { ...n, ...patch, updated_at: updatedAt } : n))
    const { error } = await supabase.from('notes').update({ ...patch, updated_at: updatedAt }).eq('id', id)
    if (error) toast(error.message, 'error')
  }

  async function deleteNote(id: string) {
    if (!window.confirm('Delete this note?')) return
    setNotes(prev => prev.filter(n => n.id !== id))
    setActiveId(prev => prev === id ? (notes.find(n => n.id !== id)?.id ?? null) : prev)
    const { error } = await supabase.from('notes').delete().eq('id', id)
    if (error) toast(error.message, 'error')
  }

  const activeNote = notes.find(n => n.id === activeId) ?? null

  return (
    <div className="page page--notes">
      <div className="notes-shell">
        <aside className="notes-rail">
          <div className="notes-rail__head">
            <div className="notes-rail__search">
              <Icon name="search" size={13} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search notes…"
              />
            </div>
            <button className="icon-btn icon-btn--sm" onClick={createNote} title="New note">
              <Icon name="plus" size={13} />
            </button>
          </div>
          <div className="notes-rail__list">
            {sorted.length === 0 ? (
              <div style={{ padding: '20px 12px', color: 'var(--muted)', fontSize: 12, textAlign: 'center' }}>
                No notes found
              </div>
            ) : sorted.map(n => (
              <button
                key={n.id}
                className={cls('notes-rail__item', activeId === n.id && 'notes-rail__item--active')}
                onClick={() => setActiveId(n.id)}
              >
                <div className="notes-rail__title">{n.title || 'Untitled'}</div>
                <div className="notes-rail__preview">
                  {stripHtml(n.body ?? '').slice(0, 60) || 'No content yet'}
                </div>
                <div className="notes-rail__meta">
                  <span>{relTime(n.updated_at)}</span>
                  {n.tags && n.tags.length > 0 && (
                    <span className="notes-rail__tags">
                      {n.tags.slice(0, 2).map(t => <ChannelChip key={t} channel={t as any} size="sm" />)}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </aside>

        <main className="notes-main">
          {!activeNote ? (
            <div className="empty" style={{ marginTop: 80 }}>
              <div className="empty__title">No note selected</div>
              <div className="empty__body">Pick a note from the left or create a new one.</div>
              <button className="btn btn--primary" onClick={createNote}>
                <Icon name="plus" size={14} /> New note
              </button>
            </div>
          ) : (
            <NoteEditor
              note={activeNote}
              onUpdate={patch => updateNote(activeNote.id, patch)}
              onDelete={() => deleteNote(activeNote.id)}
            />
          )}
        </main>
      </div>
    </div>
  )
}

// ── NoteEditor ────────────────────────────────────────────────────
function NoteEditor({
  note, onUpdate, onDelete,
}: {
  note: Note
  onUpdate: (patch: Partial<Note>) => void
  onDelete: () => void
}) {
  const { push: toast } = useToast()
  const supabase = createClient()
  const editorRef = useRef<HTMLDivElement>(null)
  const [title, setTitle] = useState(note.title)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiOut, setAiOut] = useState('')
  const [aiMode, setAiMode] = useState<'summarize' | 'tasks'>('summarize')

  useEffect(() => {
    setTitle(note.title)
    if (editorRef.current && editorRef.current.innerHTML !== (note.body ?? '')) {
      editorRef.current.innerHTML = note.body ?? ''
    }
    setAiOut('')
  }, [note.id])

  function exec(cmd: string, val?: string) {
    document.execCommand(cmd, false, val)
    if (editorRef.current) {
      editorRef.current.focus()
      onUpdate({ body: editorRef.current.innerHTML })
    }
  }

  function toggleTag(t: string) {
    const tags = note.tags ?? []
    const next = tags.includes(t) ? tags.filter(x => x !== t) : [...tags, t]
    onUpdate({ tags: next })
  }

  async function runAI(mode: 'summarize' | 'tasks') {
    setAiBusy(true); setAiMode(mode); setAiOut('')
    try {
      const body = stripHtml(note.body ?? '')
      if (!body.trim()) { toast('Add some content first.', 'error'); setAiBusy(false); return }
      const prompt = mode === 'summarize'
        ? `Summarize this note in 3-5 crisp bullet points:\n\n${body}`
        : `Convert this note into a list of actionable tasks. Each task on its own line as "- [Priority] Task title". Use priorities Low/Medium/High/Urgent.\n\n${body}`
      const res = await fetch('/api/ai/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: 'You are an expert marketing assistant. Be terse and useful.',
          user: prompt,
          maxTokens: 700,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'AI error')
      setAiOut(json.text)
      await supabase.from('activity').insert({
        kind: 'ai',
        label: `AI ${mode === 'summarize' ? 'summarized' : 'task-ified'} note: ${note.title}`,
      })
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setAiBusy(false)
    }
  }

  return (
    <div className="note-editor">
      <header className="note-editor__head">
        <input
          className="note-editor__title"
          value={title}
          onChange={e => setTitle(e.target.value)}
          onBlur={() => onUpdate({ title: title.trim() || 'Untitled' })}
          placeholder="Note title"
        />
        <div className="note-editor__actions">
          <button className="icon-btn" onClick={onDelete} title="Delete note">
            <Icon name="trash" size={14} />
          </button>
        </div>
      </header>

      <div className="note-editor__bar">
        <div className="rt-bar">
          <button className="rt-btn" onClick={() => exec('bold')} title="Bold"><strong>B</strong></button>
          <button className="rt-btn" onClick={() => exec('italic')} title="Italic"><em>I</em></button>
          <button className="rt-btn" onClick={() => exec('formatBlock', 'h2')} title="Heading">H</button>
          <button className="rt-btn" onClick={() => exec('insertUnorderedList')} title="Bullets">•</button>
          <button className="rt-btn" onClick={() => exec('insertOrderedList')} title="Numbered">1.</button>
        </div>
        <div className="note-tags">
          <span style={{ color: 'var(--muted)', fontSize: 11 }}>Tag:</span>
          {Object.keys(CHANNELS).slice(0, 3).map(c => {
            const on = (note.tags ?? []).includes(c)
            return (
              <button
                key={c}
                className={cls('note-tag', on && 'note-tag--on')}
                style={on ? {
                  background: CHANNELS[c].soft,
                  color: CHANNELS[c].ink,
                  borderColor: CHANNELS[c].ink,
                } : undefined}
                onClick={() => toggleTag(c)}
              >
                {CHANNELS[c].short}
              </button>
            )
          })}
        </div>
        <div className="note-ai">
          <button className="btn btn--ghost btn--sm" onClick={() => runAI('summarize')} disabled={aiBusy}>
            <Icon name="sparkle" size={13} /> Summarize
          </button>
          <button className="btn btn--ghost btn--sm" onClick={() => runAI('tasks')} disabled={aiBusy}>
            <Icon name="sparkle" size={13} /> Turn into tasks
          </button>
        </div>
      </div>

      <div
        ref={editorRef}
        className="note-editor__body"
        contentEditable
        suppressContentEditableWarning
        onInput={e => onUpdate({ body: (e.currentTarget as HTMLDivElement).innerHTML })}
      />

      {(aiBusy || aiOut) && (
        <div className="ai-out">
          <div className="ai-out__head">
            <span><Icon name="sparkle" size={12} /> AI {aiMode === 'summarize' ? 'summary' : 'tasks'}</span>
            {aiOut && (
              <button
                className="link-btn"
                onClick={() => { navigator.clipboard.writeText(aiOut); toast('Copied') }}
              >
                <Icon name="copy" size={11} /> Copy
              </button>
            )}
          </div>
          {aiBusy
            ? <AILoading />
            : <div className="ai-out__body">{aiOut.split('\n').filter(Boolean).map((l, i) => <p key={i}>{l}</p>)}</div>}
        </div>
      )}
    </div>
  )
}
