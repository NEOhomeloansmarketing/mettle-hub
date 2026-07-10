import Anthropic from '@anthropic-ai/sdk'
import type { Advisor, AdvisorChannel, AuditResult } from '@/lib/types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function repairJson(raw: string): string {
  // Strip trailing commas before ] or }
  return raw
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/\/\/[^\n]*/g, '')
    .trim()
}

export async function runVisibilityAudit(
  advisor: Advisor,
  channels: AdvisorChannel[],
): Promise<AuditResult> {
  const napBlock = [
    `Name: ${advisor.name}`,
    advisor.title       ? `Title: ${advisor.title}`              : null,
    advisor.phone       ? `Phone: ${advisor.phone}`              : null,
    advisor.email       ? `Email: ${advisor.email}`              : null,
    advisor.nmls_number ? `NMLS#: ${advisor.nmls_number}`        : null,
    advisor.street_address ? `Address: ${advisor.street_address}` : null,
    advisor.city || advisor.state || advisor.zip
      ? `City/State/Zip: ${[advisor.city, advisor.state, advisor.zip].filter(Boolean).join(', ')}`
      : null,
    advisor.service_area ? `Service Area: ${advisor.service_area}` : null,
  ].filter(Boolean).join('\n')

  const channelList = channels.length
    ? channels.map(c => `- ${c.platform}: ${c.url}${c.label ? ` (${c.label})` : ''}`).join('\n')
    : '(no channels provided)'

  const systemPrompt = `You are a digital marketing auditor specializing in local search and personal branding for mortgage professionals. Your job is to analyze an advisor's online presence based on their canonical NAP data and known channels, then produce a structured JSON audit.

You do NOT have live internet access. Use your training knowledge of how these platforms (Google Business Profile, LinkedIn, Zillow, Yelp, Realtor.com, etc.) behave and what best practices look like to assess this advisor's likely online presence quality.

Scoring categories (100 points total):
- listingsHealth (30 pts): Are key directories present? GBP, Yelp, Zillow, Realtor. Penalty for missing core listings.
- reviews (20 pts): Estimated review presence/recency based on platforms present and advisor tenure context.
- websiteLocal (20 pts): Does the advisor have a personal website or strong local SEO presence?
- brandConsistency (15 pts): Does NAP appear consistent across provided channels? Flag any known inconsistency risks.
- aiSearchReadiness (15 pts): Is the advisor's profile likely to surface in AI assistants (ChatGPT, Perplexity, Google AI Overviews) for relevant queries?

Return ONLY valid JSON (no markdown, no explanation) matching this exact shape:`

  const userPrompt = `CANONICAL NAP:
${napBlock}

KNOWN ONLINE CHANNELS:
${channelList}

Return this JSON (fill all fields, no markdown fences):
{
  "extractedNap": {
    "name": "",
    "phone": "",
    "email": "",
    "nmls": "",
    "address": "",
    "city": "",
    "state": "",
    "zip": "",
    "serviceArea": ""
  },
  "canonicalBlock": "One clean sentence describing the canonical NAP for this advisor.",
  "score": 0,
  "scoreBreakdown": {
    "listingsHealth":    { "score": 0, "max": 30, "notes": "" },
    "reviews":           { "score": 0, "max": 20, "notes": "" },
    "websiteLocal":      { "score": 0, "max": 20, "notes": "" },
    "brandConsistency":  { "score": 0, "max": 15, "notes": "" },
    "aiSearchReadiness": { "score": 0, "max": 15, "notes": "" }
  },
  "actionItems": [
    { "rank": 1, "platform": "", "action": "", "url": "", "impact": "High" }
  ],
  "conflicts": [
    { "field": "phone", "canonical": "", "issues": [{ "platform": "", "found": "" }] }
  ],
  "socials": [
    { "platform": "", "url": "", "status": "OK", "notes": "" }
  ],
  "queryVisibility": [
    { "query": "", "type": "branded", "assessment": "" },
    { "query": "", "type": "non_branded", "assessment": "" },
    { "query": "", "type": "missed", "assessment": "" }
  ],
  "summary": "2–3 sentence executive summary of this advisor's digital presence.",
  "discoveryQueries": ["query 1", "query 2", "query 3"]
}`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: systemPrompt,
    messages: [
      { role: 'user', content: userPrompt },
      { role: 'assistant', content: [{ type: 'text', text: '{' }] },
    ],
  })

  const raw = '{' + (response.content[0] as { type: string; text: string }).text
  const parsed = JSON.parse(repairJson(raw)) as AuditResult
  return parsed
}
