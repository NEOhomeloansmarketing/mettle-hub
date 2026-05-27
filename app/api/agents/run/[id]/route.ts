import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import type { AgentOutputType } from '@/lib/types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const OUTPUT_SCHEMAS: Record<AgentOutputType, string> = {
  task: `Return ONLY a JSON object:
{
  "items": [
    { "title": "task title", "description": "detail", "priority": "Low|Medium|High|Urgent", "channel": "CRNA|Entrepreneur|Physician|All|Internal" }
  ]
}
Create 2-5 tasks. Each should be a concrete, actionable item.`,

  blog: `Return ONLY a JSON object:
{
  "items": [
    {
      "channel": "CRNA|Entrepreneur|Physician",
      "title": "post title ~60 chars",
      "topic": "short slug",
      "trendNote": "1-sentence why timely",
      "metaDescription": "150-160 char SEO description",
      "hashtags": ["#tag1", "#tag2", "#tag3"],
      "body": "full blog post markdown 800-1200 words with H2 sections and CTA at end",
      "linkedin": "LinkedIn caption 3-4 paragraphs ending with CTA",
      "instagram": "Instagram caption punchy with up to 5 hashtags"
    }
  ]
}
Create one post per relevant channel. Never make specific rate or APR claims. Always end with a CTA.`,

  note: `Return ONLY a JSON object:
{
  "items": [
    { "title": "note title", "body": "full note content in markdown", "tags": ["CRNA"|"Entrepreneur"|"Physician"] }
  ]
}
Create 1-2 notes. Be thorough and structured.`,

  activity: `Return ONLY a JSON object:
{
  "items": [
    { "label": "concise activity log entry, max 120 chars" }
  ]
}
Create 1 activity entry summarizing what the agent found or did.`,
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: account } = await supabase.from('accounts').select('status').eq('id', user.id).single()
  if (!account || account.status !== 'approved') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const { data: agent } = await supabase.from('agents').select('*').eq('id', id).single()
  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

  const { data: docs } = await supabase.from('brand_docs').select('*')
  const docMap = Object.fromEntries((docs ?? []).map((d: any) => [d.id, d.content]))

  // Build brand knowledge context
  const channels: string[] = agent.channels ?? []
  const rosettaSections: string[] = []

  if (agent.use_rosetta) {
    for (const ch of channels) {
      const content = docMap[ch.toLowerCase()]
      if (content) {
        rosettaSections.push(`${ch} Rosetta Stone:\n${(content as string).slice(0, 3000)}`)
      }
    }
    if (channels.length === 0) {
      const all = ['crna', 'entrepreneur', 'physician']
      for (const key of all) {
        const content = docMap[key]
        if (content) rosettaSections.push(`${key.charAt(0).toUpperCase() + key.slice(1)} Rosetta Stone:\n${(content as string).slice(0, 2000)}`)
      }
    }
  }

  const lawsContent = agent.use_laws ? (docMap['lawsofmarketing'] as string | undefined) : null

  const system = [
    agent.system_prompt,
    rosettaSections.length > 0 ? `\nBRAND KNOWLEDGE:\n${rosettaSections.join('\n\n')}` : '',
    lawsContent ? `\nFIVE LAWS OF MARKETING:\n${lawsContent.slice(0, 3000)}` : '',
    `\nOUTPUT FORMAT:\n${OUTPUT_SCHEMAS[agent.output_type as AgentOutputType]}`,
  ].filter(Boolean).join('\n')

  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    system,
    messages: [{ role: 'user', content: 'Execute your instructions now. Return only the JSON object.' }],
  })

  const raw = msg.content.filter(b => b.type === 'text').map(b => (b as any).text).join('')
  const m = raw.match(/\{[\s\S]*\}/)
  if (!m) throw new Error('AI returned no valid JSON')

  const parsed = JSON.parse(m[0])
  const items: any[] = parsed.items ?? []
  let created = 0

  for (const item of items) {
    if (agent.output_type === 'task') {
      await supabase.from('tasks').insert({
        title: item.title ?? 'Untitled',
        description: item.description ?? '',
        priority: item.priority ?? 'Medium',
        channel: item.channel ?? 'All',
        status: 'To Do',
        assignee_id: null,
        section_id: null,
        due: null,
        meeting_id: null,
      })
      created++
    } else if (agent.output_type === 'blog') {
      await supabase.from('blog_posts').insert({
        channel: item.channel ?? (channels[0] ?? 'CRNA'),
        status: 'pending-review',
        title: item.title ?? 'Untitled',
        topic: item.topic ?? 'untitled',
        trend_note: item.trendNote ?? '',
        meta_description: item.metaDescription ?? '',
        hashtags: item.hashtags ?? [],
        body: item.body ?? '',
        linkedin_caption: item.linkedin ?? '',
        instagram_caption: item.instagram ?? '',
        auto_generated: true,
      })
      created++
    } else if (agent.output_type === 'note') {
      await supabase.from('notes').insert({
        title: item.title ?? 'Agent Note',
        body: item.body ?? '',
        tags: item.tags ?? [],
      })
      created++
    } else if (agent.output_type === 'activity') {
      await supabase.from('activity').insert({
        kind: 'ai',
        label: item.label ?? `${agent.name} ran`,
      })
      created++
    }
  }

  // Log the run
  await supabase.from('activity').insert({
    kind: 'ai',
    label: `Agent "${agent.name}" ran — created ${created} ${agent.output_type}${created !== 1 ? 's' : ''}`,
  })

  // Update last_run
  await supabase.from('agents').update({ last_run: new Date().toISOString() }).eq('id', id)

  return NextResponse.json({ created })
}
