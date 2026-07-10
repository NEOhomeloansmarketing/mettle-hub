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
    system: `You are filtering a list of candidate tasks for a mortgage marketing professional named Colin.

Your job: return ONLY the indices of candidates that are:
1. Work-related (not personal errands, shopping, family, health appointments, etc.)
2. NOT already covered by an existing open task — even if worded differently. Be smart about semantic matches (e.g. "send URLs to Josh" and "email Josh with site URLs" are the same thing).
3. Genuinely actionable (not vague observations)

Return a JSON array of 1-based indices: [1, 3, 5]
Return [] if nothing new and work-related is found.`,
    messages: [{
      role: 'user',
      content: `EXISTING OPEN TASKS (do not duplicate these):\n${existingList}\n\nCANDIDATE TASKS:\n${candidateList}`,
    }],
  })

  let newIndices: number[] = []
  try {
    const raw = (msg.content[0] as { type: 'text'; text: string }).text.trim()
    const match = raw.match(/\[[\d,\s]*\]/)
    if (match) newIndices = JSON.parse(match[0])
  } catch {
    newIndices = []
  }

  const toInsert = todos.filter((_, i) => newIndices.includes(i + 1))
  if (!toInsert.length) return NextResponse.json({ ok: true, inserted: 0, skipped: todos.length })

  const rows = toInsert.map(t => ({
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

  const { error } = await supabase.from('tasks').insert(rows)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.from('activity').insert({
    kind: 'task',
    label: `Synced ${rows.length} task${rows.length !== 1 ? 's' : ''} from Bee`,
  })

  return NextResponse.json({ ok: true, inserted: rows.length, skipped: todos.length - toInsert.length })
}
