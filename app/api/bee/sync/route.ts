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

interface BeeCandidate {
  source?: string
  text: string
  details?: string
}

export async function POST(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret')
  if (!secret || secret !== process.env.BEE_SYNC_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { todos, existingTasks: passedExisting } = await req.json() as {
    todos: BeeCandidate[]
    existingTasks?: { title: string }[]
  }
  if (!todos?.length) return NextResponse.json({ ok: true, inserted: 0 })

  const supabase = serviceClient()

  const [{ data: colin }, { data: generalSection }] = await Promise.all([
    supabase.from('accounts').select('id').ilike('name', '%colin%jenson%').maybeSingle(),
    supabase.from('sections').select('id').ilike('name', '%general%').maybeSingle(),
  ])

  if (!colin) return NextResponse.json({ error: 'Could not find Colin Jenson account' }, { status: 500 })

  // Fetch existing open tasks if not passed in
  let existingTitles: string[] = passedExisting?.map(t => t.title) ?? []
  if (!existingTitles.length) {
    const { data: dbTasks } = await supabase
      .from('tasks')
      .select('title')
      .eq('assignee_id', colin.id)
      .neq('status', 'Done')
    existingTitles = (dbTasks ?? []).map(t => t.title)
  }

  // Build prompt with full context so AI can deduplicate semantically
  const candidateList = todos
    .map((t, i) => `${i + 1}. ${t.text}${t.details ? ` — ${t.details}` : ''}`)
    .join('\n')

  const existingList = existingTitles.length
    ? existingTitles.map((t, i) => `${i + 1}. ${t}`).join('\n')
    : 'None'

  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: `You are filtering candidate tasks for Colin, a mortgage marketing professional.

Return ONLY tasks that are:
1. Work-related (not personal errands, shopping, family, health, etc.)
2. NOT already covered by an existing open task — even if worded differently
3. Genuinely actionable

For each qualifying task, assess:
- urgent: true if it sounds time-sensitive today/tomorrow, has a deadline, or is blocking someone
- priority: "High" if urgent or critical, "Medium" for normal work, "Low" for minor/someday items

Return ONLY a JSON array (no explanation):
[{"index": 1, "urgent": false, "priority": "Medium"}, {"index": 3, "urgent": true, "priority": "High"}]
Return [] if nothing qualifies.`,
    messages: [{
      role: 'user',
      content: `EXISTING OPEN TASKS (do not duplicate these):\n${existingList}\n\nCANDIDATE TASKS:\n${candidateList}`,
    }],
  })

  interface AiTask { index: number; urgent: boolean; priority: string }
  let aiTasks: AiTask[] = []
  try {
    const raw = (msg.content[0] as { type: 'text'; text: string }).text.trim()
    const match = raw.match(/\[[\s\S]*\]/)
    if (match) aiTasks = JSON.parse(match[0])
  } catch {
    aiTasks = []
  }

  if (!aiTasks.length) return NextResponse.json({ ok: true, inserted: 0, skipped: todos.length })

  const today = new Date()
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
  const nextWeek = new Date(today); nextWeek.setDate(today.getDate() + 7)
  const isoDate = (d: Date) => d.toISOString().split('T')[0]

  const toInsert = aiTasks
    .map(ai => ({ candidate: todos[ai.index - 1], ai }))
    .filter(({ candidate }) => candidate != null)

  if (!toInsert.length) return NextResponse.json({ ok: true, inserted: 0, skipped: todos.length })

  const rows = toInsert.map(({ candidate: t, ai }) => ({
    title: t.text.replace(/^[\p{Emoji}\s]+/u, '').trim(),
    description: t.details ?? '',
    assignee_id: colin.id,
    section_id: generalSection?.id ?? null,
    priority: (ai.priority ?? 'Medium') as 'High' | 'Medium' | 'Low',
    channel: 'All' as const,
    status: 'To Do' as const,
    due: ai.urgent ? isoDate(tomorrow) : isoDate(nextWeek),
    meeting_id: null,
  }))

  const { error } = await supabase.from('tasks').insert(rows)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.from('activity').insert({
    kind: 'task',
    label: `Synced ${rows.length} task${rows.length !== 1 ? 's' : ''} from Bee`,
  })

  return NextResponse.json({ ok: true, inserted: rows.length, skipped: todos.length - toInsert.length })
}
