import Anthropic from '@anthropic-ai/sdk'
import type { Advisor, AdvisorChannel, AuditResult } from '@/lib/types'
import { discoverChannels, type DiscoveredProfile } from '@/lib/discover-channels'

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

  // Discover missing channels with real search URLs
  const discoveredChannels = await discoverChannels(advisor, channels)

  const napForm = advisor.nap_form_url
    ? await fetchNapFormAsBase64(advisor.nap_form_url)
    : null

  const knownProfiles = channels.length
    ? channels.map(c => `- ${c.platform}: ${c.url}${c.label ? ` (${c.label})` : ''}`).join('\n')
    : 'No social profiles on record yet.'

  const discoveredProfilesText = discoveredChannels.length
    ? discoveredChannels
        .map(
          p =>
            `- ${p.platform} [${p.confidence} confidence]: ${p.reason}\n  Search: ${p.searchUrl}${p.url !== p.searchUrl ? `\n  Profile URL: ${p.url}` : ''}`,
        )
        .join('\n')
    : 'No missing channels detected.'

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

KNOWN ONLINE PROFILES ON RECORD (currently managed):
${knownProfiles}

DETECTED MISSING CHANNELS (likely to already exist but not in their active management list):
${discoveredProfilesText}

YOUR TASK:
1. Audit each KNOWN PROFILE for NAP accuracy, completeness, and brand consistency.
2. Identify missing channels that LIKELY ALREADY EXIST (high-confidence detections like NMLS, Zillow, Realtor.com).
3. Generate action items that tell this advisor EXACTLY WHAT TO DO to enhance visibility.

CRITICAL - TWO TYPES OF ACTION ITEMS:
A) FIX EXISTING - For platforms they already claim: specific fixes (NAP mismatches, outdated info, missing content)
B) CLAIM MISSING - For high-confidence detected channels: guide them to find and claim/update the profile

SCOPE RULES:
- Action items must be SPECIFIC and ACTIONABLE - never vague advice.
- For existing profiles: "Update [field] from [current] to [correct]" - be precise.
- For missing channels: "Search [URL provided] and claim the profile - update [specific field]"
- Reference the detected channels and their search URLs for discovering missing profiles.
- Prioritize by impact: NMLS and Google Business Profile first (highest traffic), then Zillow/Realtor (lead generation), then social/niche directories.

WHAT TO CHECK ON EACH KNOWN PROFILE:
1. NAP accuracy - does the name, address, phone, email, and title match canonical exactly?
2. Old employer branding - is any prior company name still showing?
3. Name format - is the name spelled exactly as canonical?
4. Title/category - does the job title or business category match canonical?
5. Incomplete profile data - missing bio, photos, or hours on a profile they already have
6. Website - local keywords, service area language, schema markup, mobile-friendliness
7. AI search readiness - canonical entity signals, structured data, FAQ content
8. Reviews - volume, recency, and response patterns visible from public profile

SCORING (0-100, accounting for both existing and missing channels):
- Listings Health /25: NAP accuracy and completeness on known profiles + discovery of high-confidence missing channels
- Reviews & Reputation /20: review volume, recency, platform diversity across all channels (known + detected)
- Website Local Relevance /20: local keywords, service area pages, schema, mobile-friendliness on primary assets
- Brand & Entity Consistency /20: identical name/title/photo/employer across all known platforms + alignment with missing channels
- Channel Coverage /15: percentage of high-confidence channels claimed (NMLS, Google, Zillow, Realtor, LinkedIn, personal website)

PENALTY for missing channels:
- Not claiming NMLS profile when licensed: -5 points (mandatory for MLOs)
- No Google Business Profile in service area: -3 points
- Missing major directories (Zillow, Realtor for LOs): -2 points each
- No LinkedIn: -1 point
- Limited total platform diversity: -up to 5 points

ACTION ITEMS - FORMAT RULES:
- Numbered 1 through N, sorted by impact (highest impact first)
- SHORT - one bold key term, then 1-2 tight sentences max
- SPECIFIC - include exact URLs, exact current values, exact replacement values
- Format: "Bold Action: Specific instruction with exact steps and current vs. desired state."
- Priority mapping: 1-3 = High Impact (NMLS, Google, main website), 4-6 = Medium Impact (Zillow, Realtor), 7+ = Lower Impact (social, niche)
- Examples:
  * GOOD (fix existing): "Claim NMLS Profile: Visit https://www.nmlsconsumeraccess.org/Individual/12345 and update your employer field from 'OldBank' to 'NEO Home Loans'. Add your current photo and ensure phone number is [correct number]."
  * GOOD (claim missing): "Create Google Business Profile: Search yourself at https://business.google.com. If found, claim it and update hours, call-to-action, and add 3+ photos. If not found, create one for your service area."
  * GOOD (update): "Fix LinkedIn Headline: Change from 'Loan Officer' to 'Mortgage Advisor at NEO Home Loans | NMLS #12345' to include your company and license number."
  * BAD: "Update your profiles" (too vague)

CONFLICTS - FORMAT RULES:
- Only list conflicts found on the known profiles
- Format each as a plain string: "Main conflict N: [Type] - [Platform] shows '[wrong value]' but canonical [field] is '[correct value]'"

MISSING CHANNEL ANALYSIS:
The system has identified these likely pre-existing profiles the advisor should manage. For each:
- Verify the profile actually exists using the searchUrl provided
- If found: claim it and update all fields (NAP, photo, title, company)
- If not found: note in your analysis that it doesn't exist (rare for high-confidence channels)
- Prioritize by confidence level and traffic potential

Format for discoveredChannels output:
{
  "platform": "<Platform name exactly as shown in DETECTED MISSING CHANNELS list>",
  "searchUrl": "<The exact search URL provided to find this profile>",
  "likelyUrl": "<Predicted direct profile URL if pattern is known, or null>",
  "confidence": "<High|Medium|Low - as shown in DETECTED MISSING CHANNELS>",
  "reason": "<Why this advisor likely has this profile, based on their NMLS, location, niche>",
  "action": "<Claim if exists|Verify if unsure|Update if found|Remove if shows old employer>"
}

Return 5-12 items covering:
- High-confidence (mandatory): NMLS, Google Business Profile, Zillow, Realtor.com
- Medium-confidence (common): LinkedIn, LendingTree, Bankrate, Better.com
- Low-confidence (niche): Yelp, BBB, Nextdoor, Facebook

Skip any platform already listed in KNOWN ONLINE PROFILES on record.

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
    "listingsHealth":        { "score": 0, "max": 25, "notes": "<2-3 specific sentences about NAP accuracy, profile completeness, and discovered channels.>" },
    "reviews":               { "score": 0, "max": 20, "notes": "<2-3 sentences about estimated volume, recency, and gaps across all platforms.>" },
    "websiteLocalRelevance": { "score": 0, "max": 20, "notes": "<2-3 sentences about website/advisor site assessment and local SEO signals.>" },
    "brandConsistency":      { "score": 0, "max": 20, "notes": "<2-3 sentences about specific consistency issues found across all known and detected platforms.>" },
    "channelCoverage":       { "score": 0, "max": 15, "notes": "<2-3 sentences about what % of high-confidence channels are claimed and updated.>" }
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
  },
  "discoveredChannels": [
    {
      "platform": "<Platform name>",
      "searchUrl": "<URL to search for or verify the profile - e.g. a Google search URL or the platform's search page>",
      "likelyUrl": "<Predicted profile URL based on known naming patterns, or null if unpredictable>",
      "confidence": "<High|Medium|Low>",
      "reason": "<Specific sentence about why this profile likely already exists for this advisor>",
      "action": "<Claim|Update|Remove|Verify>"
    }
  ]
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
