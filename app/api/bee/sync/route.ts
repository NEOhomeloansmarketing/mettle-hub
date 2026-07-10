import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

interface BeeTodo {
  id: number
  text: string
  details?: string
}

export async function POST(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret')
  if (!secret || secret !== process.env.BEE_SYNC_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { todos } = await req.json() as { todos: BeeTodo[] }
  if (!todos?.length) return NextResponse.json({ ok: true, inserted: 0 })

  const supabase = serviceClient()

  // Look up Colin Jenson's account ID and General section ID
  const [{ data: colin }, { data: generalSection }] = await Promise.all([
    supabase.from('accounts').select('id').ilike('name', '%colin%jenson%').maybeSingle(),
    supabase.from('sections').select('id').ilike('name', '%general%').maybeSingle(),
  ])

  if (!colin) return NextResponse.json({ error: 'Could not find Colin Jenson account' }, { status: 500 })

  // Use AI to filter work-related tasks only
  const todoList = todos.map((t, i) => `${i + 1}. ${t.text}${t.details ? ` — ${t.details}` : ''}`).join('\n')

  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    system: `You filter a list of todos for a mortgage marketing professional. Return ONLY a JSON array of the 1-based index numbers that are clearly work-related.

Work = anything about: clients, loans, campaigns, websites, marketing, team, meetings, CRM, tools, content, ads, follow-ups, business tasks, onboarding, reporting.
Personal = family, personal appointments, hobbies, health (unless work health), personal errands, non-work social plans.

When in doubt, include it. Return: [1, 3, 5] — just the indices, nothing else.`,
    messages: [{ role: 'user', content: todoList }],
  })

  let workIndices: number[] = []
  try {
    const raw = (msg.content[0] as { type: 'text'; text: string }).text.trim()
    const match = raw.match(/\[[\d,\s]*\]/)
    if (match) workIndices = JSON.parse(match[0])
  } catch {
    // If parsing fails, include all
    workIndices = todos.map((_, i) => i + 1)
  }

  const workTodos = todos.filter((_, i) => workIndices.includes(i + 1))
  if (!workTodos.length) return NextResponse.json({ ok: true, inserted: 0, skipped: todos.length })

  // Check for existing tasks to avoid duplicates (match on bee_todo_id if stored, or title)
  const { data: existingTasks } = await supabase
    .from('tasks')
    .select('title')
    .eq('assignee_id', colin.id)
    .eq('status', 'To Do')

  const existingTitles = new Set((existingTasks ?? []).map(t => t.title.toLowerCase().trim()))

  const rows = workTodos
    .filter(t => !existingTitles.has(t.text.replace(/^[\p{Emoji}\s]+/u, '').trim().toLowerCase()))
    .map(t => ({
      title: t.text.replace(/^[\p{Emoji}\s]+/u, '').trim(),
      description: t.details ?? '',
      assignee_id: colin.id,
      section_id: generalSection?.id ?? null,
      priority: 'Medium' as const,
      channel: 'All' as const,
      status: 'To Do' as const,
      due: null,
      meeting_id: null,
    }))

  if (!rows.length) return NextResponse.json({ ok: true, inserted: 0, message: 'All tasks already exist' })

  const { error } = await supabase.from('tasks').insert(rows)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.from('activity').insert({
    kind: 'task',
    label: `Synced ${rows.length} task${rows.length !== 1 ? 's' : ''} from Bee`,
  })

  return NextResponse.json({ ok: true, inserted: rows.length, skipped: todos.length - workTodos.length })
}
