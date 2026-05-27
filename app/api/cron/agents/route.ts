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
}`,
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
Never make specific rate or APR claims. Always end with a CTA.`,
  note: `Return ONLY a JSON object:
{
  "items": [
    { "title": "note title", "body": "full note in markdown", "tags": [] }
  ]
}`,
  activity: `Return ONLY a JSON object:
{
  "items": [
    { "label": "concise activity log entry, max 120 chars" }
  ]
}`,
}

export async function GET(req: NextRequest) {
  const secret = req.headers.get('authorization')?.replace('Bearer ', '')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()
  const now = new Date()
  const currentDay = now.getUTCDay()

  // Runs daily at 8am UTC — pick up all scheduled agents for today
  const { data: candidates } = await supabase
    .from('agents')
    .select('*')
    .eq('enabled', true)
    .eq('schedule_enabled', true)

  const results: { id: string; name: string; success: boolean; created?: number; error?: string }[] = []

  for (const agent of candidates ?? []) {
    // Check day of week (null = every day)
    if (agent.day_of_week !== null && agent.day_of_week !== currentDay) continue

    // Avoid double-running: skip if last_run was within the last 50 minutes
    if (agent.last_run) {
      const minsAgo = (Date.now() - new Date(agent.last_run).getTime()) / 60000
      if (minsAgo < 50) continue
    }

    try {
      const { data: docs } = await supabase.from('brand_docs').select('*')
      const docMap = Object.fromEntries((docs ?? []).map((d: any) => [d.id, d.content]))

      const channels: string[] = agent.channels ?? []
      const rosettaSections: string[] = []

      if (agent.use_rosetta) {
        const targets = channels.length > 0 ? channels : ['CRNA', 'Entrepreneur', 'Physician']
        for (const ch of targets) {
          const content = docMap[ch.toLowerCase()]
          if (content) rosettaSections.push(`${ch} Rosetta Stone:\n${(content as string).slice(0, 2500)}`)
        }
      }

      const lawsContent = agent.use_laws ? (docMap['lawsofmarketing'] as string | undefined) : null

      const system = [
        agent.system_prompt,
        rosettaSections.length > 0 ? `\nBRAND KNOWLEDGE:\n${rosettaSections.join('\n\n')}` : '',
        lawsContent ? `\nFIVE LAWS OF MARKETING:\n${lawsContent.slice(0, 2500)}` : '',
        `\nOUTPUT FORMAT:\n${OUTPUT_SCHEMAS[agent.output_type as AgentOutputType]}`,
      ].filter(Boolean).join('\n')

      const msg = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        system,
        messages: [{ role: 'user', content: 'Execute your instructions now. Return only the JSON object.' }],
      })

      const raw = msg.content.filter(b => b.type === 'text').map(b => (b as any).text).join('')
      const match = raw.match(/\{[\s\S]*\}/)
      if (!match) throw new Error('AI returned no valid JSON')

      const parsed = JSON.parse(match[0])
      const items: any[] = parsed.items ?? []
      let created = 0

      for (const item of items) {
        if (agent.output_type === 'task') {
          await supabase.from('tasks').insert({
            title: item.title ?? 'Untitled', description: item.description ?? '',
            priority: item.priority ?? 'Medium', channel: item.channel ?? 'All',
            status: 'To Do', assignee_id: null, section_id: null, due: null, meeting_id: null,
          })
          created++
        } else if (agent.output_type === 'blog') {
          await supabase.from('blog_posts').insert({
            channel: item.channel ?? (channels[0] ?? 'CRNA'),
            status: 'pending-review', title: item.title ?? 'Untitled', topic: item.topic ?? 'untitled',
            trend_note: item.trendNote ?? '', meta_description: item.metaDescription ?? '',
            hashtags: item.hashtags ?? [], body: item.body ?? '',
            linkedin_caption: item.linkedin ?? '', instagram_caption: item.instagram ?? '',
            auto_generated: true,
          })
          created++
        } else if (agent.output_type === 'note') {
          await supabase.from('notes').insert({
            title: item.title ?? 'Agent Note', body: item.body ?? '', tags: item.tags ?? [],
          })
          created++
        } else if (agent.output_type === 'activity') {
          await supabase.from('activity').insert({ kind: 'ai', label: item.label ?? `${agent.name} ran` })
          created++
        }
      }

      await supabase.from('activity').insert({
        kind: 'ai',
        label: `Scheduled agent "${agent.name}" ran — created ${created} ${agent.output_type}${created !== 1 ? 's' : ''}`,
      })
      await supabase.from('agents').update({ last_run: new Date().toISOString() }).eq('id', agent.id)
      results.push({ id: agent.id, name: agent.name, success: true, created })
    } catch (err: any) {
      results.push({ id: agent.id, name: agent.name, success: false, error: err.message })
    }
  }

  return NextResponse.json({ ran: results.length, results })
}
