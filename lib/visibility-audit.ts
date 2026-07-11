import Anthropic from '@anthropic-ai/sdk'
import type { Advisor, AdvisorChannel, AuditResult } from '@/lib/types'

async function fetchNapFormAsBase64(
  url: string,
): Promise<{ data: string; mediaType: string } | null> {
  try {
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 15_000)
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) return null
    const contentType = res.headers.get('content-type') ?? ''
    const buffer = await res.arrayBuffer()
    const data = Buffer.from(buffer).toString('base64')
    if (contentType.includes('pdf') || url.toLowerCase().endsWith('.pdf'))
      return { data, mediaType: 'application/pdf' }
    if (contentType.includes('png') || url.toLowerCase().endsWith('.png'))
      return { data, mediaType: 'image/png' }
    if (contentType.includes('webp') || url.toLowerCase().endsWith('.webp'))
      return { data, mediaType: 'image/webp' }
    if (contentType.includes('image') || /\.(jpg|jpeg)$/i.test(url))
      return { data, mediaType: 'image/jpeg' }
    return null
  } catch {
    return null
  }
}

function repairJson(raw: string): string {
  return raw
    .replace(/(?<![":,\w])\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/,(\s*[}\]])/g, '$1')
    .replace(/—/g, '-')
    .trim()
}

export async function runVisibilityAudit(
  advisor: Advisor,
  channels: AdvisorChannel[],
): Promise<AuditResult> {
  const client = new Anthropic()

  const napForm = advisor.nap_form_url
    ? await fetchNapFormAsBase64(advisor.nap_form_url)
    : null

  const knownProfiles = channels.length
    ? channels.map(c => `- ${c.platform}: ${c.url}${c.label ? ` (${c.label})` : ''}`).join('\n')
    : 'No social profiles on record yet.'

  const fallbackNap = [
    `Name: ${advisor.name}`,
    advisor.title        ? `Title: ${advisor.title}`        : null,
    advisor.nmls_number  ? `NMLS#: ${advisor.nmls_number}`  : null,
    advisor.phone        ? `Phone: ${advisor.phone}`         : null,
    advisor.email        ? `Email: ${advisor.email}`         : null,
    advisor.street_address ? `Street: ${advisor.street_address}` : null,
    (advisor.city || advisor.state || advisor.zip)
      ? `City/State/Zip: ${[advisor.city, advisor.state, advisor.zip].filter(Boolean).join(', ')}` : null,
    advisor.service_area  ? `Service Area: ${advisor.service_area}` : null,
    advisor.bio           ? `Who They Serve: ${advisor.bio}` : null,
    advisor.metadata?.competitors ? `Known Competitors: ${advisor.metadata.competitors}` : null,
  ].filter(Boolean).join('\n')

  const prompt = `You are the NEO Home Loans Advisor Visibility Strategist - a compliance-aware digital visibility auditor.

CORE RULES:
- Write like a real strategist advising a real person - plain English, specific, short, actionable.
- Every action item must reference THIS advisor's actual data. No generic advice.
- Never guarantee rankings, verification, leads, or outcomes.
- Never use em dashes. Use a regular hyphen (-) instead.

${napForm
    ? `The attached document is this advisor's NAP (Name, Address, Phone) form. This is the CANONICAL SOURCE OF TRUTH. Extract every field precisely as written on the form. Every discrepancy found on any platform must be compared against these canonical values.`
    : `No NAP form uploaded. Use this profile data as the canonical NAP:\n${fallbackNap}`
  }

KNOWN ONLINE PROFILES ON RECORD (these are the ONLY platforms to audit):
${knownProfiles}

YOUR TASK:
Audit each of the known profiles listed above against the canonical NAP. You are NOT recommending new platforms - only review what already exists. Identify what needs to be UPDATED or FIXED on the platforms they already have.

SCOPE RULES:
- Only create action items for platforms listed in KNOWN ONLINE PROFILES.
- Do NOT suggest creating new accounts on platforms not already listed.
- Base all findings on the canonical NAP vs. the listed profile URLs.

WHAT TO CHECK ON EACH KNOWN PROFILE:
1. NAP accuracy - does the name, address, phone, email, and title match canonical exactly?
2. Old employer branding - is any prior company name still showing?
3. Name format - is the name spelled exactly as canonical?
4. Title/category - does the job title or business category match canonical?
5. Incomplete profile data - missing bio, photos, or hours on a profile they already have
6. Website - local keywords, service area language, schema markup, mobile-friendliness
7. AI search readiness - canonical entity signals, structured data, FAQ content
8. Reviews - volume, recency, and response patterns visible from public profile

SCORING (conservative - only award points with real evidence):
- Listings Health /30: NAP accuracy across directory/listing profiles
- Reviews & Reputation /20: review volume, recency, platform diversity, sentiment signals
- Website Local Relevance /20: local keywords, service area pages, schema, mobile-friendliness
- Brand & Entity Consistency /15: identical name/title/photo/employer on all known platforms
- AI Search Readiness /15: canonical entity signals, structured data, FAQ content

ACTION ITEMS - FORMAT RULES:
- Numbered 1 through N, most urgent first
- SHORT - one bold key term, then 1-2 tight sentences max
- Only reference platforms from the known list above
- Include the profile URL in the "url" field
- Format: "Bold Key Term: One or two specific sentences telling them exactly what to fix and what the correct value should be."
- Good example: "Update Facebook Title: Your Facebook page still shows 'Loan Officer at OldCompany.' Change it to 'Mortgage Advisor at NEO Home Loans'."
- Bad example: "Consider updating your social profiles to reflect your current employer." (too vague)

CONFLICTS - FORMAT RULES:
- Only list conflicts found on the known profiles
- Format each as a plain string: "Main conflict N: [Type] - [Platform] shows '[wrong value]' but canonical [field] is '[correct value]'"

Return ONLY raw JSON - no markdown, no code fences, no explanation. All fields required:

{
  "canonicalEntityStatement": "<1-2 sentences. Full canonical identity of this advisor as it should appear everywhere.>",
  "extractedNap": {
    "name": "",
    "teamName": "",
    "title": "",
    "address": "",
    "phone": "",
    "email": "",
    "category": "",
    "serviceArea": "",
    "primaryUrl": "",
    "primaryUrlNote": "",
    "nmlsNumber": ""
  },
  "canonicalBlock": "<Exact multi-line NAP block to copy-paste everywhere. Include name, title, company, NMLS, address, phone, email, website. Separate lines with \\n.>",
  "canonicalPublicDisplay": "<One-line display: 'Name | Title | NEO Home Loans | NMLS #XXXXX | City, State'>",
  "positioningStatement": "<1-2 sentences. What this advisor should say everywhere about who they serve and what makes them different.>",
  "bestDifferenceLanguage": "<1 sentence. The single most differentiating thing about this advisor.>",
  "score": 0,
  "scoreBreakdown": {
    "listingsHealth":        { "score": 0, "max": 30, "notes": "<2-3 specific sentences about what is present, what is missing, and why this score.>" },
    "reviews":               { "score": 0, "max": 20, "notes": "<2-3 sentences about estimated volume, recency, and gaps.>" },
    "websiteLocalRelevance": { "score": 0, "max": 20, "notes": "<2-3 sentences about website/advisor site assessment and local SEO signals.>" },
    "brandConsistency":      { "score": 0, "max": 15, "notes": "<2-3 sentences about specific consistency issues found or likely present.>" },
    "aiSearchReadiness":     { "score": 0, "max": 15, "notes": "<2-3 sentences about why AI tools would or would not surface this advisor.>" }
  },
  "actionItems": [
    {
      "priority": 1,
      "platform": "<Platform name>",
      "action": "<Bold Key Term: 1-2 tight sentences with exact wrong value and correct value.>",
      "url": "<direct URL to the profile or management page>"
    }
  ],
  "conflicts": [
    "<Main conflict 1: [Type] - [Platform] shows '[wrong value]' but canonical [field] is '[correct value]'>"
  ],
  "competitiveGapAnalysis": {
    "advantages": ["<Specific thing this advisor does well vs competitors>"],
    "gaps": ["<Specific area where competitors are currently beating them>"]
  },
  "mainAudienceServed": "<1-2 paragraphs. Who this advisor actually serves based on their profile data and stated niche.>",
  "whoYouAppearToServe": "<1-2 paragraphs. The audience that comes through in their current public profiles - may differ from intended audience.>",
  "perceivedStrengths": [
    "<Strength 1 based on review signals, bio content, or positioning>",
    "<Strength 2>",
    "<Strength 3>"
  ],
  "socials": [
    {
      "platform": "<platform key>",
      "url": "<full URL>",
      "status": "<OK|ISSUE|REMOVE|MISSING>",
      "notes": "<Specific issue if ISSUE/REMOVE/MISSING, empty string if OK.>"
    }
  ],
  "contentThemes": [
    "<Specific recurring content topic tailored to this advisor's market and audience>",
    "<5-8 total topics>"
  ],
  "queryVisibility": {
    "branded": "<Assessment of branded search visibility - searches by name or NMLS.>",
    "nonBranded": "<Assessment of non-branded local search - generic category plus city searches.>",
    "topicClusters": ["<Topic cluster where this advisor already has strength>"],
    "missedOpportunities": [
      "Homebuyers: <specific queries this advisor is missing>",
      "Refinancers: <specific refinance queries being missed>",
      "Referral partners: <specific partner-facing queries missed>"
    ],
    "serviceAreaExpansion": "<Specific cities or areas this advisor could realistically expand into.>"
  }
}`

  const messageContent: Anthropic.Messages.ContentBlockParam[] = []

  if (napForm) {
    if (napForm.mediaType === 'application/pdf') {
      messageContent.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: napForm.data },
      } as Anthropic.Messages.ContentBlockParam)
    } else {
      messageContent.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: napForm.mediaType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
          data: napForm.data,
        },
      } as Anthropic.Messages.ContentBlockParam)
    }
  }

  messageContent.push({ type: 'text', text: prompt })

  // Prefill the assistant turn with `{` to force pure JSON output with no preamble.
  // claude-sonnet-4-5 supports this; resume from `{` and prepend it back before parsing.
  const message = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 8192,
    messages: [
      { role: 'user', content: messageContent },
      { role: 'assistant', content: [{ type: 'text', text: '{' }] },
    ],
  })

  const continuation = message.content[0].type === 'text' ? message.content[0].text : ''
  let jsonStr = ('{' + continuation).trim()

  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) jsonStr = fenceMatch[1].trim()

  jsonStr = repairJson(jsonStr)

  try {
    return JSON.parse(jsonStr) as AuditResult
  } catch (err) {
    const pos = (err as SyntaxError).message.match(/position (\d+)/)?.[1]
    const at = pos ? Number(pos) : jsonStr.length
    console.error(
      '[visibility-audit] JSON parse failed:',
      (err as SyntaxError).message,
      '\n--- context around failure ---\n',
      jsonStr.slice(Math.max(0, at - 120), at + 120),
    )
    throw err
  }
}
