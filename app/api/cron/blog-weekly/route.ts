import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { CHANNEL_BRIEFS } from '@/lib/types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function GET(req: NextRequest) {
  // Verify cron secret
  const secret = req.headers.get('authorization')?.replace('Bearer ', '')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = serviceClient()

  // Fetch schedule config
  const { data: config } = await supabase
    .from('schedule_config')
    .select('*')
    .eq('id', 1)
    .maybeSingle()

  if (!config?.enabled) {
    return NextResponse.json({ message: 'Schedule disabled' })
  }

  const channels = config.channels ?? ['CRNA', 'Entrepreneur', 'Physician']
  const results: { channel: string; success: boolean; error?: string }[] = []

  const { data: docs } = await supabase.from('brand_docs').select('*')
  const docMap = Object.fromEntries((docs ?? []).map(d => [d.id, d.content]))

  for (const channel of channels) {
    try {
      const { data: recentPosts } = await supabase
        .from('blog_posts')
        .select('topic')
        .eq('channel', channel)
        .order('created_at', { ascending: false })
        .limit(12)

      const recentTopics = (recentPosts ?? []).map(p => p.topic).filter(Boolean)
      const brief = CHANNEL_BRIEFS[channel]
      if (!brief) continue

      const guide = docMap[channel.toLowerCase()] ?? ''
      const laws = docMap['lawsofmarketing'] ?? ''

      const system = `You are an editorial director writing for a mortgage lender's "${channel} Home Loans" channel.

Audience: ${brief.audience}
Voice: ${brief.voice}
Recommended CTA: ${brief.cta}

HARD RULES — non-negotiable:
- Never make specific rate or APR claims. No "as low as", no rate numbers.
- Always include a relevant call to action at the end.
- Educational, not salesy. Trust-building, expert tone.
- Avoid these recent topics (do not repeat): ${recentTopics.length ? recentTopics.join(', ') : 'none'}

${guide ? `BRAND ROSETTA STONE — definitive guide for voice, positioning, audience, and messaging:\n${guide.slice(0, 6000)}\n\n` : ''}${laws ? `FIVE LAWS OF MARKETING — apply these strategic principles:\n${laws.slice(0, 5000)}\n\n` : ''}Return ONLY a JSON object:
{
  "title": "post title ~60 chars",
  "topic": "short topic slug",
  "trendNote": "1-sentence why this is timely",
  "metaDescription": "150-160 char SEO description",
  "hashtags": ["#tag1", "#tag2", "#tag3"],
  "body": "full blog post markdown, 800-1200 words, H2 sections, CTA at end",
  "linkedin": "LinkedIn caption 3-4 paragraphs ends with CTA",
  "instagram": "Instagram caption punchy line breaks up to 5 hashtags"
}`

      const msg = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        system,
        messages: [{
          role: 'user',
          content: `Generate this week's blog post for the ${channel} channel. Return only the JSON object.`,
        }],
      })

      const raw = msg.content
        .filter(b => b.type === 'text')
        .map(b => (b as { type: 'text'; text: string }).text)
        .join('')

      let txt = raw.trim()
      const m = txt.match(/\{[\s\S]*\}/)
      if (m) txt = m[0]
      const parsed = JSON.parse(txt)

      await supabase.from('blog_posts').insert({
        channel,
        status: 'pending-review',
        title: parsed.title ?? 'Untitled',
        topic: parsed.topic ?? 'untitled',
        trend_note: parsed.trendNote ?? '',
        meta_description: parsed.metaDescription ?? '',
        hashtags: parsed.hashtags ?? [],
        body: parsed.body ?? '',
        linkedin_caption: parsed.linkedin ?? '',
        instagram_caption: parsed.instagram ?? '',
        auto_generated: true,
      })

      await supabase.from('activity').insert({
        kind: 'ai',
        label: `Auto-drafted ${channel} blog: ${parsed.title}`,
      })

      results.push({ channel, success: true })
    } catch (err: any) {
      console.error(`Blog weekly cron error for ${channel}:`, err)
      results.push({ channel, success: false, error: err.message })
    }
  }

  // Update last_runs in schedule_config
  const now = new Date().toISOString()
  const lastRuns = Object.fromEntries(results.map(r => [r.channel, now]))
  await supabase.from('schedule_config').update({ last_runs: lastRuns }).eq('id', 1)

  return NextResponse.json({ results })
}
