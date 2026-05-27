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
    const { current, selectedWeek, prevWeek, daysIn = 7 } = await req.json()

    const total     = current.reduce((s: number, r: any) => s + r.count, 0)
    const prevTotal = current.reduce((s: number, r: any) => s + (r.prevCount ?? 0), 0)

    if (total === 0) return NextResponse.json({ insights: [] })

    const weekLabel = new Date(selectedWeek + 'T00:00:00Z')
      .toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

    const channelLines = current
      .filter((r: any) => r.count > 0 || r.prevCount > 0)
      .map((r: any) => {
        const prev = r.prevCount ?? 0
        const diff = r.count - prev
        return `- ${r.channel}: ${r.count} leads this week${prev ? ` (${diff >= 0 ? '+' : ''}${diff} vs last week's ${prev})` : ' (no prior data)'}`
      }).join('\n')

    const prompt = `You are a mortgage marketing analyst reviewing weekly lead performance for NEO Home Loans.

NEO Home Loans channels:
- CRNA: Certified Registered Nurse Anesthetists
- Entrepreneur: Self-employed, founders, business owners
- Physician Site / Physician ADs: Doctors, residents, fellows
- Better Leads: Paid lead generation partner (NEOxBETR)
- WCI: White Coat Investor — physician/CRNA finance community
- Tax Hive / Wealth Juice: Entrepreneur-adjacent referral partners
- Past Client / Referral: Realtors, past clients, word of mouth

WEEK OF ${weekLabel}:
Total leads: ${total}${prevWeek ? ` (${total >= prevTotal ? '+' : ''}${total - prevTotal} vs last week's ${prevTotal} total)` : ''}

BY CHANNEL:
${channelLines}

Give 3–4 sharp insights a marketing director would act on. Focus on:
- Notable channel movements (big gains or drops)
- Which sources are most reliable vs volatile
- One specific action to take this coming week based on the data

${daysIn <= 2 ? `IMPORTANT: This is only ${daysIn + 1} day(s) into the week — leads are still coming in. Do NOT flag any channel as a concern for low or zero numbers. Only return "good" and "tip" type insights. Save any "warn" observations for end of week.` : ''}

Return ONLY a JSON array. Each object:
- "type": "good" | "warn" | "tip"  ${daysIn <= 2 ? '(only "good" and "tip" allowed this early in the week)' : ''}
- "headline": 5 words max
- "body": 1–2 sentences with specific numbers`

    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw   = msg.content.filter(b => b.type === 'text').map(b => (b as any).text).join('')
    const match = raw.match(/\[[\s\S]*\]/)
    if (!match) throw new Error('No JSON returned')

    return NextResponse.json({ insights: JSON.parse(match[0]) })
  } catch (err: any) {
    console.error('[leads/insights]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
