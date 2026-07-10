import Anthropic from '@anthropic-ai/sdk'
import type { Advisor, AdvisorChannel, AuditResult } from '@/lib/types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function repairJson(raw: string): string {
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
    advisor.title        ? `Title: ${advisor.title}`                                                  : null,
    advisor.nmls_number  ? `NMLS#: ${advisor.nmls_number}`                                            : null,
    advisor.phone        ? `Phone: ${advisor.phone}`                                                  : null,
    advisor.email        ? `Email: ${advisor.email}`                                                  : null,
    advisor.street_address ? `Street: ${advisor.street_address}`                                      : null,
    (advisor.city || advisor.state || advisor.zip)
      ? `City/State/Zip: ${[advisor.city, advisor.state, advisor.zip].filter(Boolean).join(', ')}`   : null,
    advisor.service_area  ? `Service Area / Top Markets: ${advisor.service_area}`                     : null,
    advisor.bio           ? `Target Audience / Who They Serve: ${advisor.bio}`                        : null,
    advisor.metadata?.competitors ? `Known Competitors: ${advisor.metadata.competitors}`              : null,
  ].filter(Boolean).join('\n')

  const channelList = channels.length
    ? channels.map(c => `- ${c.platform}: ${c.url}${c.label ? ` (${c.label})` : ''}`).join('\n')
    : '(no channels provided — advisor has not submitted social media links yet)'

  const systemPrompt = `You are a senior digital marketing strategist specializing in local search, AI search readiness, and personal branding for mortgage professionals. You have deep expertise in how Google Business Profile, LinkedIn, Facebook, Instagram, Zillow, Yelp, Realtor.com, and other platforms affect a mortgage advisor's ability to be found online — both in traditional search and increasingly in AI-powered search tools like ChatGPT, Perplexity, Claude, and Google AI Overviews.

Your task is to perform a comprehensive, deeply researched AI Visibility Audit for a mortgage advisor at NEO Home Loans (powered by Better Mortgage). NEO Home Loans is a digitally-native mortgage brand that positions its advisors as tech-forward, client-first loan officers. Advisors are often licensed across multiple states and serve specific professional niches (physicians, CRNAs, entrepreneurs, etc.).

You do NOT have live internet access. Use your extensive training knowledge of how these platforms work, what strong vs. weak profiles look like, typical issues for mortgage professionals, and current best practices for AI search readiness to perform a thorough assessment.

---

SCORING RUBRIC (100 points total):

1. listingsHealth (30 pts max)
   — 28–30: GBP claimed + optimized, Zillow/Yelp/Realtor active, consistent citations in directories
   — 20–27: GBP present but incomplete, 2+ directories present but with gaps
   — 10–19: Only 1–2 platforms, GBP unclaimed or missing, major directories absent
   — 0–9: No verifiable directory presence, no GBP, essentially invisible in listings
   Deduct for: missing phone/address, unclaimed GBP, NMLS not visible on profiles, no reviews

2. reviews (20 pts max)
   — 18–20: 50+ Google reviews, 4.8+ star avg, recent reviews (within 60 days), response cadence
   — 12–17: 20–49 reviews or 4.5–4.7 avg or reviews >90 days old
   — 6–11: 5–19 reviews, inconsistent recency, no review strategy visible
   — 0–5: <5 reviews, no review presence, or no GBP to collect reviews on
   Assess based on platform maturity, advisor tenure signals, and number of channels provided

3. websiteLocal (20 pts max)
   — 18–20: Personal/advisor website with local service area pages, schema markup likely, fast load, mobile-optimized
   — 12–17: NEO advisor site present but templated with limited local customization
   — 6–11: Only social profiles, no personal website
   — 0–5: No web presence beyond a GBP listing
   Note: NEO advisor sites (format: [name].neohomeloans.com) are templated — credit for presence but flag limited local SEO control

4. brandConsistency (15 pts max)
   — 13–15: NAP matches exactly across all channels, handles consistent, title/employer current and uniform
   — 9–12: Minor inconsistencies (old employer not marked past, slight name variant, handle abbreviations)
   — 4–8: Significant inconsistencies (wrong employer, missing NMLS, abbreviated names, duplicate profiles)
   — 0–3: Major conflicts (wrong name, wrong company, multiple conflicting profiles)

5. aiSearchReadiness (15 pts max)
   — 13–15: Structured data likely present, authorship signals, consistent entity mentions, FAQ/Q&A content, topical authority signals
   — 9–12: Basic entity consistency but no authorship or Q&A content; AI would find them but not deeply
   — 4–8: Fragmented entity signals, AI tools would struggle to confidently surface this advisor
   — 0–3: Essentially no AI-readable signals; would not appear in AI-powered answers for any query

---

ACTION ITEM QUALITY STANDARDS:
Each action item must be:
- Specific and immediately actionable (not vague like "improve your LinkedIn")
- Tied to a concrete outcome (e.g., "improves NAP consistency score", "makes you eligible for AI answer boxes")
- Platform-specific with the exact URL when applicable
- Ranked by highest impact first
- Include the exact text/copy to use when relevant (e.g., "Update your LinkedIn headline to: 'Mortgage Advisor at NEO Home Loans | NMLS #XXXXX | Serving [city] and [region]'")

Generate at least 8 and up to 12 action items covering all platforms and issue types found.

---

CONFLICT DETECTION:
Identify all cases where the advisor's canonical NAP (from the form data) likely differs from what appears on their platforms. Common mortgage advisor issues:
- Previous employer still showing as current position on LinkedIn
- Facebook page name using abbreviated version of company name ("NEO Mtg" vs "NEO Home Loans")
- Instagram handle using personal name without professional identifiers
- GBP showing city/state only without full street address (hurts local search)
- NMLS number missing from one or more platforms
- Phone number format inconsistency (555-123-4567 vs (555) 123-4567)

---

SOCIAL PLATFORM STATUS:
For each provided channel, assess:
- OK: Profile exists, NAP likely correct, actively used
- ISSUE: Profile exists but has a specific correctable problem
- REMOVE: Duplicate, abandoned, or harmful profile that should be deleted
- MISSING: A platform that should exist but has no URL provided (and is important for this advisor's niche)

Always assess ALL of these platforms regardless of whether a URL was provided:
Google Business Profile, LinkedIn, Personal Website/NEO Advisor Site, Facebook, Instagram, Zillow, Yelp, YouTube, Twitter/X, TikTok

---

QUERY VISIBILITY MAP:
Generate at least 6 queries (3 branded, 2 non-branded, 1+ missed opportunity):
- branded: "[Advisor name] mortgage", "[Advisor name] NMLS [number]", "[Advisor name] [city]"
- non_branded: "[niche] mortgage advisor [city]", "best [loan type] lender [service area]"
- missed: queries the advisor SHOULD be winning but almost certainly isn't based on profile analysis

---

AI SEARCH READINESS SPECIFICS:
Evaluate how likely this advisor is to appear when someone asks an AI assistant:
"Who is the best [physician/CRNA/entrepreneur] mortgage advisor in [city]?"
"What mortgage advisors in [city] specialize in [niche]?"
"[Advisor name] — are they a good mortgage advisor?"

An advisor scores well here if they have:
- Consistent name+employer+NMLS across 5+ platforms (entity disambiguation)
- At least one piece of long-form content (blog post, interview, video transcript)
- FAQ-style content on their website
- Reviews that mention their name + specialty + location in review text
- Schema markup (JSON-LD) on their advisor site

---

DISCOVERY QUERIES:
Generate 6–10 specific search queries a homebuyer would type into Google or an AI assistant to find this advisor or someone like them. Make these highly local and niche-specific based on the advisor's profile.

Return ONLY valid JSON (no markdown, no code fences, no explanation outside the JSON object).`

  const userPrompt = `ADVISOR PROFILE TO AUDIT:

${napBlock}

KNOWN ONLINE CHANNELS:
${channelList}

Perform a comprehensive AI Visibility Audit following the scoring rubric and standards in your system instructions. Be thorough, specific, and actionable. The advisor and their marketing team will act directly on your output, so every action item must be precise enough to implement today.

Return this exact JSON structure (all fields required, no markdown fences):
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
    "serviceArea": "",
    "title": "",
    "businessName": "NEO Home Loans"
  },
  "canonicalBlock": "Full canonical NAP block as a single formatted string showing exactly how name/title/company/NMLS/address/phone should appear consistently everywhere.",
  "score": 0,
  "scoreBreakdown": {
    "listingsHealth":    { "score": 0, "max": 30, "notes": "Specific explanation of what's present, what's missing, and why this score was assigned." },
    "reviews":           { "score": 0, "max": 20, "notes": "Estimated review volume, recency, and gaps. What would move this score up." },
    "websiteLocal":      { "score": 0, "max": 20, "notes": "Website/NEO site assessment and local SEO signals." },
    "brandConsistency":  { "score": 0, "max": 15, "notes": "Specific consistency issues found or likely present." },
    "aiSearchReadiness": { "score": 0, "max": 15, "notes": "Why AI tools would or would not surface this advisor, what's missing." }
  },
  "actionItems": [
    {
      "rank": 1,
      "platform": "Google Business Profile",
      "action": "Full specific action with exact copy or steps to take.",
      "url": "https://...",
      "impact": "High"
    }
  ],
  "conflicts": [
    {
      "field": "employer",
      "canonical": "NEO Home Loans",
      "issues": [
        { "platform": "LinkedIn", "found": "Likely shows previous employer or abbreviated name" }
      ]
    }
  ],
  "socials": [
    {
      "platform": "google_business",
      "url": "",
      "status": "OK",
      "notes": "Specific assessment of this platform's status and any issues."
    }
  ],
  "queryVisibility": [
    { "query": "", "type": "branded", "assessment": "Detailed assessment of visibility for this specific query." },
    { "query": "", "type": "non_branded", "assessment": "" },
    { "query": "", "type": "missed", "assessment": "Why this is a missed opportunity and how to capture it." }
  ],
  "summary": "3–4 sentence executive summary that names the advisor's biggest wins and biggest gaps, and what the single most impactful thing they could do today is.",
  "discoveryQueries": [
    "specific query 1 a buyer would use",
    "specific query 2",
    "specific query 3",
    "specific query 4",
    "specific query 5",
    "specific query 6"
  ]
}`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8096,
    system: systemPrompt,
    messages: [
      { role: 'user', content: userPrompt },
    ],
  })

  let raw = (response.content[0] as { type: string; text: string }).text
  // Strip markdown code fences if the model wrapped the JSON
  raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
  const parsed = JSON.parse(repairJson(raw)) as AuditResult
  return parsed
}
