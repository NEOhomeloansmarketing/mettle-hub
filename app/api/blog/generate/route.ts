import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { CHANNEL_BRIEFS } from '@/lib/types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const VALID_CHANNELS = ['CRNA', 'Entrepreneur', 'Physician']

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: account } = await supabase.from('accounts').select('status').eq('id', user.id).single()
  if (!account || account.status !== 'approved') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { channel } = await req.json() as { channel: string }
  if (!VALID_CHANNELS.includes(channel)) {
    return NextResponse.json({ error: 'Invalid channel' }, { status: 400 })
  }

  // Load brand docs and recent topics for dedup
  const [{ data: docs }, { data: recentPosts }] = await Promise.all([
    supabase.from('brand_docs').select('*'),
    supabase
      .from('blog_posts')
      .select('topic')
      .eq('channel', channel)
      .order('created_at', { ascending: false })
      .limit(12),
  ])

  const docMap = Object.fromEntries((docs ?? []).map(d => [d.id, d.content]))
  const recentTopics = (recentPosts ?? []).map(p => p.topic).filter(Boolean)
  const brief = CHANNEL_BRIEFS[channel]
  const guide = docMap[channel.toLowerCase()] ?? ''
  const rosetta = docMap['rosettastone'] ?? ''
  const laws = docMap['lawsofmarketing'] ?? ''

  const system = `You are an editorial director writing for a mortgage lender's "${channel} Home Loans" channel.

Audience: ${brief.audience}
Voice: ${brief.voice}
Recommended CTA: ${brief.cta}

HARD RULES — non-negotiable:
- Never make specific rate or APR claims. No "as low as", no rate numbers.
- Always include a relevant call to action at the end.
- Educational, not salesy. Trust-building, expert tone.
- Avoid these recent topics (do not repeat — pick a different angle): ${recentTopics.length ? recentTopics.join(', ') : 'none'}

${guide ? `Brand voice guide excerpt:\n${guide.slice(0, 1500)}\n\n` : ''}${rosetta ? `Rosetta Stone reference:\n${rosetta.slice(0, 1200)}\n\n` : ''}${laws ? `Laws of Marketing reference (apply these as principles):\n${laws.slice(0, 1200)}\n\n` : ''}Return your response as a single JSON object with NO commentary outside it. Schema:
{
  "title": "post title, ~60 chars",
  "topic": "short topic slug for de-duplication",
  "trendNote": "1-sentence note on why this topic is timely",
  "metaDescription": "150-160 char SEO description",
  "hashtags": ["#tag1", "#tag2", "#tag3"],
  "body": "the full blog post in markdown, 800-1200 words, with H2 sections and a CTA at the end",
  "linkedin": "LinkedIn caption, 3-4 paragraphs, ends with the CTA, no hashtags inline",
  "instagram": "Instagram caption, punchy, line breaks, ends with up to 5 relevant hashtags"
}`

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system,
      messages: [{
        role: 'user',
        content: `Generate this week's blog post for the ${channel} channel. Think about what mortgage-related questions and concerns this audience is actively thinking about right now. Pick ONE concrete, useful topic. Return only the JSON object.`,
      }],
    })

    const raw = msg.content
      .filter(b => b.type === 'text')
      .map(b => (b as { type: 'text'; text: string }).text)
      .join('')

    let txt = raw.trim()
    const m = txt.match(/\{[\s\S]*\}/)
    if (m) txt = m[0]

    let parsed: Record<string, any>
    try { parsed = JSON.parse(txt) }
    catch { throw new Error('AI returned invalid JSON. Try again. Preview: ' + raw.slice(0, 200)) }

    // Insert into DB
    const { data: post, error } = await supabase
      .from('blog_posts')
      .insert({
        channel,
        status: 'pending-review',
        title: parsed.title ?? 'Untitled',
        topic: parsed.topic ?? parsed.title ?? 'untitled',
        trend_note: parsed.trendNote ?? '',
        meta_description: parsed.metaDescription ?? '',
        hashtags: parsed.hashtags ?? [],
        body: parsed.body ?? '',
        linkedin_caption: parsed.linkedin ?? '',
        instagram_caption: parsed.instagram ?? '',
        auto_generated: false,
      })
      .select()
      .single()

    if (error) throw new Error(error.message)

    return NextResponse.json({ post })
  } catch (err: any) {
    console.error('Blog generate error:', err)
    return NextResponse.json({ error: err.message ?? 'Generation failed' }, { status: 500 })
  }
}
