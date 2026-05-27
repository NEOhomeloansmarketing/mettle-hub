import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: account } = await supabase.from('accounts').select('status').eq('id', user.id).single()
  if (!account || account.status !== 'approved') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { description } = await req.json() as { description: string }
  if (!description?.trim()) return NextResponse.json({ error: 'Description required' }, { status: 400 })

  const system = `You are an AI agent architect for a mortgage marketing team at Neo Home Loans.
The team has three content channels: CRNA Home Loans, Entrepreneur Home Loans, and Physician Home Loans.
Their hub has these capabilities:
- Tasks: create task cards on a Kanban board for the team to action
- Blog Posts: draft blog posts (pending review before publishing)
- Notes: create research notes or summaries
- Activity: log a summary entry to the activity feed

Given a plain-English description of what the user wants an agent to do, return ONLY a JSON object:
{
  "name": "Short agent name, 3-5 words",
  "description": "One sentence — what this agent does",
  "systemPrompt": "Detailed, comprehensive instructions for the agent. Tell it exactly what to research, analyze, and produce. Be specific about format, depth, and tone. Do not include output format instructions — those are added automatically.",
  "outputType": "task" | "blog" | "note" | "activity",
  "channels": [] array from ["CRNA", "Entrepreneur", "Physician"] — which channels are relevant (empty if general),
  "useRosetta": true if brand voice/positioning docs would help,
  "useLaws": true if Five Laws of Marketing strategic framework would help
}`

  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system,
    messages: [{ role: 'user', content: description }],
  })

  const raw = msg.content.filter(b => b.type === 'text').map(b => (b as any).text).join('')
  const m = raw.match(/\{[\s\S]*\}/)
  if (!m) return NextResponse.json({ error: 'AI returned invalid response' }, { status: 500 })

  try {
    const parsed = JSON.parse(m[0])
    return NextResponse.json(parsed)
  } catch {
    return NextResponse.json({ error: 'AI returned invalid JSON' }, { status: 500 })
  }
}
