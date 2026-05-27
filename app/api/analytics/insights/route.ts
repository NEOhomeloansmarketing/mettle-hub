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
    const { site, current, prev, sources, landingPages, devices, newVsReturning, topPages, preset } = await req.json()

    if (!current || current.sessions === 0) {
      return NextResponse.json({ insights: [] })
    }

    const ctx = SITE_CONTEXT[site] ?? site
    const periodLabel = preset === '7d' ? 'last 7 days' : preset === '28d' ? 'last 28 days' : 'last 90 days'

    function chg(a: number, b: number) {
      if (!b) return 'no prior data'
      const d = Math.round(((a - b) / b) * 100)
      return `${d >= 0 ? '+' : ''}${d}%`
    }

    const metricsLines = [
      `Sessions:        ${current.sessions.toLocaleString()} (${chg(current.sessions, prev?.sessions)})`,
      `Users:           ${current.users.toLocaleString()} (${chg(current.users, prev?.users)})`,
      `New Users:       ${current.newUsers?.toLocaleString() ?? '?'}`,
      `Pageviews:       ${current.pageviews.toLocaleString()} (${chg(current.pageviews, prev?.pageviews)})`,
      `Engagement Rate: ${(current.engagementRate * 100).toFixed(1)}% (${chg(current.engagementRate, prev?.engagementRate)})`,
      `Bounce Rate:     ${(current.bounceRate * 100).toFixed(1)}% (${chg(current.bounceRate, prev?.bounceRate)})`,
      `Avg Duration:    ${Math.round(current.avgDuration)}s (${chg(current.avgDuration, prev?.avgDuration)})`,
    ].join('\n')

    const sourceLines = (sources ?? [])
      .slice(0, 8)
      .map((s: any) => `  ${s.channel}: ${s.sessions} sessions`)
      .join('\n')

    const landingLines = (landingPages ?? [])
      .slice(0, 6)
      .map((p: any) => `  ${p.path}: ${p.sessions} sessions, ${(p.bounceRate * 100).toFixed(0)}% bounce, ${Math.round(p.avgDuration)}s avg`)
      .join('\n')

    const deviceLines = (devices ?? [])
      .map((d: any) => `  ${d.device}: ${d.sessions} sessions, ${(d.engagementRate * 100).toFixed(0)}% engaged`)
      .join('\n')

    const nvrLines = (newVsReturning ?? [])
      .map((d: any) => `  ${d.type}: ${d.sessions} sessions, ${(d.engagementRate * 100).toFixed(0)}% engaged`)
      .join('\n')

    const topPageLines = (topPages ?? [])
      .slice(0, 6)
      .map((p: any) => `  "${p.title}": ${p.views} views, ${Math.round(p.avgDuration)}s avg, ${(p.engagementRate * 100).toFixed(0)}% engaged`)
      .join('\n')

    const prompt = `You are a digital marketing strategist specializing in SEO, AEO (Answer Engine Optimization), GEO (Generative Engine Optimization), and LLM Optimization for niche professional financial services.

SITE: ${site}
CONTEXT: ${ctx}

NEO Home Loans is a mortgage company serving high-earning professionals. Their competitive advantage is niche expertise — physicians, CRNAs, and entrepreneurs face unique mortgage challenges that most lenders don't understand.

PERIOD: ${periodLabel}

OVERALL METRICS:
${metricsLines}

TRAFFIC BY CHANNEL:
${sourceLines || '  No channel data'}

TOP LANDING PAGES (entry points):
${landingLines || '  No landing page data'}

DEVICE BREAKDOWN:
${deviceLines || '  No device data'}

NEW vs RETURNING VISITORS:
${nvrLines || '  No data'}

TOP CONTENT PAGES (by views):
${topPageLines || '  No content data'}

Provide 6–7 sharp, actionable insights across these categories:

SEO — Traditional search: keyword opportunities, content gaps, page-specific improvements, technical SEO, internal linking
AEO — Answer Engine Optimization: FAQ schema, HowTo schema, featured snippet optimization, Google AI Overview targeting
GEO — Generative Engine Optimization: content strategies to rank in AI-generated answers (Perplexity, Bing Copilot, ChatGPT Search)
LLM — LLM Optimization: tactics to get NEO mentioned when people ask AI "best physician mortgage lender" or "CRNA home loan"
PERF — Performance: improve bounce rate, engagement, session depth, and conversion based on device/landing page data
CONTENT — Content strategy: specific topics, formats, and angles based on what pages/channels are performing

Rules:
- Be highly specific to the ${site} audience, not generic
- Reference actual metric numbers, page paths, or channel names from the data
- The "action" must be a concrete task someone can do this week (starts with a verb, 8–15 words)
- If a landing page has high bounce rate, call it out specifically
- If mobile traffic is dominant, recommend mobile-first improvements
- Do NOT make rate or APR claims

Return ONLY a valid JSON array. Each object must have exactly:
- "category": "seo" | "aeo" | "geo" | "llm" | "perf" | "content"
- "type": "good" | "warn" | "tip"
- "headline": max 6 words
- "body": 1–2 sentences with specific numbers or page names from the data
- "action": the task title (verb-first, 8–15 words)`

    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
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
