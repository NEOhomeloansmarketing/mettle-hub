import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { CHANNEL_BRIEFS } from '@/lib/types'

export const maxDuration = 30

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'create_task',
    description: 'Create a new task on the task board. Use when the user asks to create, add, or make a task.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title:       { type: 'string', description: 'Clear, actionable task title' },
        description: { type: 'string', description: 'Additional context or details' },
        priority:    { type: 'string', enum: ['Low', 'Medium', 'High', 'Urgent'] },
        channel:     { type: 'string', enum: ['CRNA', 'Entrepreneur', 'Physician', 'All', 'Internal'] },
        assignee_id: { type: 'string', description: 'UUID of the assignee from the team list. Omit to leave unassigned.' },
        due_date:    { type: 'string', description: 'YYYY-MM-DD format. Omit if no due date.' },
        section_id:  { type: 'string', description: 'UUID of the section. Use "This week" for urgent items.' },
      },
      required: ['title', 'channel', 'priority'],
    },
  },
  {
    name: 'update_task',
    description: 'Update an existing task. Call list_tasks first if you need to find the task ID.',
    input_schema: {
      type: 'object' as const,
      properties: {
        task_id:     { type: 'string', description: 'UUID of the task to update' },
        title:       { type: 'string' },
        description: { type: 'string' },
        status:      { type: 'string', enum: ['To Do', 'In Progress', 'In Review', 'Done'] },
        priority:    { type: 'string', enum: ['Low', 'Medium', 'High', 'Urgent'] },
        assignee_id: { type: 'string', description: 'UUID to assign, or empty string to unassign' },
        due_date:    { type: 'string', description: 'YYYY-MM-DD to set, or empty string to clear' },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'list_tasks',
    description: 'Query tasks from the board. Use before updating to find the task ID, or when the user wants to see tasks.',
    input_schema: {
      type: 'object' as const,
      properties: {
        status:      { type: 'string', enum: ['To Do', 'In Progress', 'In Review', 'Done'] },
        assignee_id: { type: 'string' },
        channel:     { type: 'string' },
        limit:       { type: 'number', description: 'Max results, default 10' },
      },
    },
  },
  {
    name: 'create_note',
    description: 'Create a note in the Notes section. Good for saving research, summaries, or reference content.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string' },
        body:  { type: 'string', description: 'Note content in markdown' },
        tags:  { type: 'array', items: { type: 'string' }, description: 'e.g. ["CRNA", "research"]' },
      },
      required: ['title', 'body'],
    },
  },
  {
    name: 'create_blog_draft',
    description: 'Generate a blog post draft for a channel. It will appear in Blog → Pending Review.',
    input_schema: {
      type: 'object' as const,
      properties: {
        channel:    { type: 'string', enum: ['CRNA', 'Entrepreneur', 'Physician'] },
        topic_hint: { type: 'string', description: 'Optional specific topic or angle to write about' },
      },
      required: ['channel'],
    },
  },
]

export async function POST(req: NextRequest) {
  try {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: account } = await supabase.from('accounts').select('status').eq('id', user.id).single()
  if (!account || account.status !== 'approved') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { messages } = await req.json() as { messages: { role: 'user' | 'assistant'; content: string }[] }
  if (!messages?.length) return NextResponse.json({ error: 'Messages required' }, { status: 400 })

  // Load all context in parallel
  const [{ data: docs }, { data: team }, { data: sections }] = await Promise.all([
    supabase.from('brand_docs').select('*'),
    supabase.from('accounts').select('id, name').eq('status', 'approved'),
    supabase.from('sections').select('*').order('order_index'),
  ])

  const docMap = Object.fromEntries((docs ?? []).map(d => [d.id, d.content]))
  const today = new Date().toISOString().split('T')[0]

  const system = `You are the NEO Home Loans marketing AI assistant. You can answer questions AND take actions in the system — creating tasks, notes, blog drafts, and updating existing tasks.

Today's date: ${today}

TEAM (use these exact IDs when assigning tasks):
${(team ?? []).map(m => `- ${m.name}: ${m.id}`).join('\n')}

SECTIONS (use these IDs when placing tasks):
${(sections ?? []).map(s => `- "${s.name}": ${s.id}`).join('\n')}

CHANNELS: CRNA, Entrepreneur, Physician, All, Internal

When the user mentions a name, match it to the closest team member above.
When dates are relative ("tomorrow", "Friday", "next week"), calculate from today's date.
When taking an action, confirm clearly what you did. Be concise and direct.

${docMap['crna'] ? `CRNA ROSETTA STONE:\n${(docMap['crna'] as string).slice(0, 2000)}\n` : ''}
${docMap['entrepreneur'] ? `ENTREPRENEUR ROSETTA STONE:\n${(docMap['entrepreneur'] as string).slice(0, 2000)}\n` : ''}
${docMap['physician'] ? `PHYSICIAN ROSETTA STONE:\n${(docMap['physician'] as string).slice(0, 2000)}\n` : ''}
${docMap['lawsofmarketing'] ? `FIVE LAWS OF MARKETING:\n${(docMap['lawsofmarketing'] as string).slice(0, 3000)}\n` : ''}`

  const actions: { type: string; label: string; ok: boolean }[] = []
  const msgs: Anthropic.MessageParam[] = messages.map(m => ({ role: m.role, content: m.content }))

  let response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    system,
    tools: TOOLS,
    messages: msgs,
  })

  // Agentic loop — keep running until no more tool calls
  while (response.stop_reason === 'tool_use') {
    const toolUses = response.content.filter(b => b.type === 'tool_use') as Anthropic.ToolUseBlock[]
    const toolResults: Anthropic.ToolResultBlockParam[] = []

    for (const tu of toolUses) {
      const inp = tu.input as any
      let result: any

      try {
        if (tu.name === 'create_task') {
          const { data } = await supabase.from('tasks').insert({
            title: inp.title,
            description: inp.description ?? '',
            priority: inp.priority ?? 'Medium',
            channel: inp.channel ?? 'All',
            status: 'To Do',
            assignee_id: inp.assignee_id || null,
            due: inp.due_date || null,
            section_id: inp.section_id || null,
            meeting_id: null,
          }).select().single()

          const assigneeName = (team ?? []).find(m => m.id === inp.assignee_id)?.name
          const label = `Created task: "${inp.title}"${assigneeName ? ` → ${assigneeName}` : ''} · ${inp.priority}`
          actions.push({ type: 'create_task', label, ok: true })
          await supabase.from('activity').insert({ kind: 'task', label: `AI created task: "${inp.title}"` })
          result = { success: true, task_id: data?.id, title: inp.title }

        } else if (tu.name === 'update_task') {
          const updates: Record<string, any> = {}
          if (inp.title !== undefined)       updates.title = inp.title
          if (inp.description !== undefined) updates.description = inp.description
          if (inp.status !== undefined)      updates.status = inp.status
          if (inp.priority !== undefined)    updates.priority = inp.priority
          if (inp.assignee_id !== undefined) updates.assignee_id = inp.assignee_id || null
          if (inp.due_date !== undefined)    updates.due = inp.due_date || null

          const { data } = await supabase.from('tasks').update(updates).eq('id', inp.task_id).select().single()
          const label = `Updated: "${data?.title ?? inp.task_id}"${inp.status ? ` → ${inp.status}` : ''}`
          actions.push({ type: 'update_task', label, ok: true })
          result = { success: true, task: data }

        } else if (tu.name === 'list_tasks') {
          let q = supabase.from('tasks').select('id, title, status, priority, channel, assignee_id, due')
          if (inp.status)      q = q.eq('status', inp.status)
          if (inp.assignee_id) q = q.eq('assignee_id', inp.assignee_id)
          if (inp.channel)     q = q.eq('channel', inp.channel)
          const { data: tasks } = await q.limit(inp.limit ?? 10)
          result = {
            tasks: (tasks ?? []).map(t => ({
              ...t,
              assignee_name: (team ?? []).find(m => m.id === t.assignee_id)?.name ?? null,
            })),
          }

        } else if (tu.name === 'create_note') {
          const { data } = await supabase.from('notes').insert({
            title: inp.title,
            body: inp.body,
            tags: inp.tags ?? [],
          }).select().single()
          actions.push({ type: 'create_note', label: `Created note: "${inp.title}"`, ok: true })
          result = { success: true, note_id: data?.id }

        } else if (tu.name === 'create_blog_draft') {
          const ch = inp.channel as string
          const brief = CHANNEL_BRIEFS[ch]
          const guide = docMap[ch.toLowerCase()] ?? ''
          const laws = docMap['lawsofmarketing'] ?? ''

          const { data: recent } = await supabase.from('blog_posts').select('topic').eq('channel', ch).order('created_at', { ascending: false }).limit(12)
          const recentTopics = (recent ?? []).map((p: any) => p.topic).filter(Boolean).join(', ')

          const blogSystem = `You are an editorial director for NEO Home Loans ${ch} channel.
${brief ? `Audience: ${brief.audience}\nVoice: ${brief.voice}\nCTA: ${brief.cta}` : ''}
HARD RULES: Never make specific rate or APR claims. Always end with a CTA.
${guide ? `ROSETTA STONE:\n${(guide as string).slice(0, 3000)}` : ''}
${laws ? `FIVE LAWS:\n${(laws as string).slice(0, 2000)}` : ''}
Avoid these recent topics: ${recentTopics || 'none'}
Return ONLY a JSON object: { "title": "...", "topic": "...", "trendNote": "...", "metaDescription": "...", "hashtags": [...], "body": "...markdown...", "linkedin": "...", "instagram": "..." }`

          const blogMsg = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 4096,
            system: blogSystem,
            messages: [{ role: 'user', content: inp.topic_hint ? `Write about: ${inp.topic_hint}` : 'Generate a timely blog post. Return only JSON.' }],
          })

          const raw = blogMsg.content.filter(b => b.type === 'text').map(b => (b as any).text).join('')
          const m = raw.match(/\{[\s\S]*\}/)
          const parsed = m ? JSON.parse(m[0]) : {}

          const { data: post } = await supabase.from('blog_posts').insert({
            channel: ch,
            status: 'pending-review',
            title: parsed.title ?? 'Untitled',
            topic: parsed.topic ?? 'untitled',
            trend_note: parsed.trendNote ?? '',
            meta_description: parsed.metaDescription ?? '',
            hashtags: parsed.hashtags ?? [],
            body: parsed.body ?? '',
            linkedin_caption: parsed.linkedin ?? '',
            instagram_caption: parsed.instagram ?? '',
            auto_generated: false,
          }).select().single()

          actions.push({ type: 'create_blog_draft', label: `Created blog draft: "${parsed.title}" (${ch})`, ok: true })
          result = { success: true, post_id: (post as any)?.id, title: parsed.title }
        }
      } catch (err: any) {
        result = { error: err.message }
        actions.push({ type: tu.name, label: `Failed: ${err.message}`, ok: false })
      }

      toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(result) })
    }

    msgs.push({ role: 'assistant', content: response.content })
    msgs.push({ role: 'user', content: toolResults })

    response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system,
      tools: TOOLS,
      messages: msgs,
    })
  }

  const text = response.content.filter(b => b.type === 'text').map(b => (b as any).text).join('')
  return NextResponse.json({ text, actions })

  } catch (err: any) {
    console.error('[chat] unhandled error:', err)
    return NextResponse.json({ error: err?.message ?? 'Unexpected error' }, { status: 500 })
  }
}
