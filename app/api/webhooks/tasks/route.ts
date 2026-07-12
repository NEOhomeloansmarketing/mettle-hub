import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// Task payload from the calling app.
// All fields optional except title.
interface IncomingTask {
  title: string
  description?: string
  priority?: 'Low' | 'Medium' | 'High' | 'Urgent'
  status?: 'To Do' | 'In Progress' | 'In Review' | 'Done'
  channel?: 'CRNA' | 'Entrepreneur' | 'Physician' | 'All' | 'Internal'
  due?: string | null         // ISO date string e.g. "2026-07-15"
  assignee?: string | null    // name or email — matched against accounts table
  section?: string | null     // section name — matched against sections table
}

export async function POST(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret')
  if (!secret || secret !== process.env.TASKS_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // Accept a single task object or an array of tasks
  const tasks: IncomingTask[] = Array.isArray(body) ? body : [body as IncomingTask]

  if (!tasks.length || !tasks[0]?.title) {
    return NextResponse.json({ error: 'At least one task with a title is required' }, { status: 400 })
  }

  const db = svc()

  // Pre-fetch assignee IDs and section IDs for unique name/email lookups
  const assigneeNames = [...new Set(tasks.map(t => t.assignee).filter(Boolean))] as string[]
  const sectionNames  = [...new Set(tasks.map(t => t.section).filter(Boolean))]  as string[]

  const assigneeMap: Record<string, string> = {}
  const sectionMap:  Record<string, string> = {}

  if (assigneeNames.length) {
    const { data: accounts } = await db
      .from('accounts')
      .select('id, name, email')

    for (const lookup of assigneeNames) {
      const lower = lookup.toLowerCase()
      const match = (accounts ?? []).find(
        a => a.name?.toLowerCase().includes(lower) || a.email?.toLowerCase() === lower,
      )
      if (match) assigneeMap[lookup] = match.id
    }
  }

  if (sectionNames.length) {
    const { data: sections } = await db
      .from('sections')
      .select('id, name')

    for (const name of sectionNames) {
      const match = (sections ?? []).find(
        s => s.name?.toLowerCase().includes(name.toLowerCase()),
      )
      if (match) sectionMap[name] = match.id
    }
  }

  const rows = tasks
    .filter(t => t.title?.trim())
    .map(t => ({
      title:       t.title.trim(),
      description: t.description ?? '',
      priority:    t.priority  ?? 'Medium',
      status:      t.status    ?? 'To Do',
      channel:     t.channel   ?? 'Internal',
      due:         t.due       ?? null,
      assignee_id: t.assignee ? (assigneeMap[t.assignee] ?? null) : null,
      section_id:  t.section  ? (sectionMap[t.section]  ?? null) : null,
      meeting_id:  null,
    }))

  if (!rows.length) {
    return NextResponse.json({ ok: true, inserted: 0 })
  }

  const { error } = await db.from('tasks').insert(rows)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  try {
    await db.from('activity').insert({
      kind: 'task',
      label: `${rows.length} task${rows.length !== 1 ? 's' : ''} pushed via webhook`,
    })
  } catch {}

  return NextResponse.json({ ok: true, inserted: rows.length })
}
