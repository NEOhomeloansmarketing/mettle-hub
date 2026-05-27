import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

export const maxDuration = 30

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { overview, campaigns, preset } = await req.json()

    const periodLabel = preset === 'last_7d' ? 'last 7 days' : preset === 'last_30d' ? 'last 30 days' : 'last 90 days'

    const prompt = `You are a paid media strategist analyzing Meta Ads performance for NEO Home Loans — a mortgage company targeting CRNAs, Physicians, and Entrepreneurs.

PERFORMANCE DATA (${periodLabel}):
- Total Spend: $${overview.spend.toFixed(2)}
- Impressions: ${overview.impressions.toLocaleString()}
- Reach: ${overview.reach.toLocaleString()}
- Clicks: ${overview.clicks.toLocaleString()}
- CTR: ${overview.ctr.toFixed(2)}%
- CPM: $${overview.cpm.toFixed(2)}
- CPC: $${overview.cpc.toFixed(2)}
- Leads: ${overview.leads}
- Cost per Lead: ${overview.cpl > 0 ? '$' + overview.cpl.toFixed(2) : 'N/A'}

CAMPAIGNS:
${campaigns.map((c: any) => `- ${c.name} (${c.status}): $${c.spend.toFixed(2)} spend, ${c.impressions.toLocaleString()} impressions, ${c.clicks} clicks, ${c.ctr.toFixed(2)}% CTR, ${c.leads} leads, CPL: ${c.cpl > 0 ? '$' + c.cpl.toFixed(2) : 'N/A'}`).join('\n')}

Give 4–5 sharp, specific, actionable insights a marketing director would act on immediately. Focus on:
- What's working and should get more budget
- What's underperforming and why
- Specific optimizations to improve CTR, CPL, or lead volume
- Any notable patterns across campaigns

Format: Return a JSON array of insight objects. Each object has:
- "type": "good" | "warn" | "tip"
- "headline": short bold title (6 words max)
- "body": 1–2 sentence explanation with specific numbers from the data

Return ONLY the JSON array. No markdown wrapper.`

    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = msg.content.filter(b => b.type === 'text').map(b => (b as any).text).join('')
    const match = raw.match(/\[[\s\S]*\]/)
    if (!match) throw new Error('No valid JSON returned')

    const insights = JSON.parse(match[0])
    return NextResponse.json({ insights })
  } catch (err: any) {
    console.error('[meta/insights]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
