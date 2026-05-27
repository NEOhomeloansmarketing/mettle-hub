import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

export const maxDuration = 30

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SITE_CONTEXT: Record<string, string> = {
  'Medical Professional': 'Physician home loans — targets doctors, residents, and fellows seeking mortgages with no PMI, high DTI flexibility, and delayed income start dates.',
  'CRNA': 'CRNA mortgage loans — targets Certified Registered Nurse Anesthetists who are high earners and often overlooked by traditional mortgage lenders.',
  'Entrepreneur': 'Entrepreneur mortgage loans — targets self-employed business owners and founders who qualify via bank statement loans rather than W-2 income.',
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { site, current, prev, sources, preset } = await req.json()

    if (!current || current.sessions === 0) {
      return NextResponse.json({ insights: [] })
    }

    const ctx = SITE_CONTEXT[site] ?? site
    const periodLabel = preset === '7d' ? 'last 7 days' : preset === '28d' ? 'last 28 days' : 'last 90 days'

    function pct(a: number, b: number) {
      if (!b) return 'no prior data'
      const d = Math.round(((a - b) / b) * 100)
      return `${d >= 0 ? '+' : ''}${d}%`
    }

    const metricsLines = [
      `Sessions:    ${current.sessions.toLocaleString()} (${pct(current.sessions, prev?.sessions)})`,
      `Users:       ${current.users.toLocaleString()} (${pct(current.users, prev?.users)})`,
      `Pageviews:   ${current.pageviews.toLocaleString()} (${pct(current.pageviews, prev?.pageviews)})`,
      `Bounce Rate: ${(current.bounceRate * 100).toFixed(1)}% (${pct(current.bounceRate, prev?.bounceRate)})`,
      `Avg Duration:${Math.round(current.avgDuration)}s (${pct(current.avgDuration, prev?.avgDuration)})`,
    ].join('\n')

    const sourceLines = sources
      .slice(0, 6)
      .map((s: any) => `  ${s.channel}: ${s.sessions} sessions`)
      .join('\n')

    const prompt = `You are a digital marketing strategist specializing in SEO, AEO (Answer Engine Optimization), GEO (Generative Engine Optimization), and LLM Optimization for niche professional financial services.

SITE: ${site}
CONTEXT: ${ctx}

NEO Home Loans is a mortgage company serving high-earning professionals. Their competitive advantage is niche expertise — physicians, CRNAs, and entrepreneurs face unique mortgage challenges that most lenders don't understand.

TRAFFIC DATA (${periodLabel}):
${metricsLines}

TOP CHANNELS:
${sourceLines || '  No channel data'}

Provide 5–6 sharp, actionable insights across these categories:

SEO — Traditional search: keyword opportunities, content gaps, technical improvements, backlinks
AEO — Answer Engine Optimization: structured data (FAQ schema, HowTo, Review), featured snippets, Google AI Overview optimization
GEO — Generative Engine Optimization: content strategies to appear in AI-generated search results (Perplexity, Bing Copilot, SGE)
LLM — LLM Optimization: tactics to get NEO mentioned when people ask ChatGPT/Claude "best physician mortgage lender" or "CRNA home loan"
PERF — Conversion: improve bounce rate, session depth, and lead conversion based on the metrics
CONTENT — Content strategy: specific topics, formats, and angles to create for this audience

Rules:
- Be highly specific to the ${site} audience, not generic
- Reference actual metric numbers in the body
- The "action" must be a concrete task someone can do this week (starts with a verb, 8–15 words)
- If traffic is strong, acknowledge it but still find improvement angles
- Do NOT make rate or APR claims

Return ONLY a valid JSON array. Each object must have exactly:
- "category": "seo" | "aeo" | "geo" | "llm" | "perf" | "content"
- "type": "good" | "warn" | "tip"
- "headline": max 6 words
- "body": 1–2 sentences with specific context and numbers
- "action": the task title (verb-first, 8–15 words)`

    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1200,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw   = msg.content.filter(b => b.type === 'text').map(b => (b as any).text).join('')
    const match = raw.match(/\[[\s\S]*\]/)
    if (!match) throw new Error('No JSON returned')

    return NextResponse.json({ insights: JSON.parse(match[0]) })
  } catch (err: any) {
    console.error('[analytics/insights]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
