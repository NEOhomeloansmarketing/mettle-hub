import type { Advisor, AdvisorChannel } from '@/lib/types'

export interface DiscoveredProfile {
  platform: string
  name: string
  url: string
  confidence: 'High' | 'Medium' | 'Low'
  searchUrl: string
  reason: string
  status: 'exists' | 'likely' | 'unknown'
  notes?: string
}

async function fetchWithTimeout(
  url: string,
  timeout = 10000,
): Promise<string | null> {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    })

    clearTimeout(timeoutId)

    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '')
  } catch {
    return url
  }
}

// NMLS Consumer Access — everyone with an NMLS number has a public profile
async function searchNMLSConsumerAccess(
  advisor: Advisor,
): Promise<DiscoveredProfile | null> {
  if (!advisor.nmls_number) return null

  const searchUrl = `https://www.nmlsconsumeraccess.org/Search.aspx?type=Individual&Name=${encodeURIComponent(advisor.name)}`
  const likelyUrl = `https://www.nmlsconsumeraccess.org/Individual/${advisor.nmls_number}`

  return {
    platform: 'NMLS Consumer Access',
    name: advisor.name,
    url: likelyUrl,
    confidence: 'High',
    searchUrl,
    reason: `Every licensed MLO has a public NMLS profile. NMLS #${advisor.nmls_number} should resolve to a profile page with licensing, history, and complaints.`,
    status: 'likely',
    notes:
      'Verify the profile shows current employer and licensing status. Check for old complaints or violations.',
  }
}

// Zillow advisor directory
async function searchZillow(advisor: Advisor): Promise<DiscoveredProfile | null> {
  if (!advisor.city || !advisor.state) return null

  const searchUrl = `https://www.zillow.com/lender/mortgage-professionals?q=${encodeURIComponent(advisor.name)}%20${advisor.city}%20${advisor.state}`

  return {
    platform: 'Zillow',
    name: advisor.name,
    url: searchUrl,
    confidence: 'Medium',
    searchUrl,
    reason: `Zillow auto-creates profiles for loan officers from industry data. They likely have a profile page with their photo, bio, and reviews.`,
    status: 'likely',
    notes: 'Update profile photo, bio, and ensure contact info is current.',
  }
}

// Realtor.com advisor directory
async function searchRealtorDotCom(
  advisor: Advisor,
): Promise<DiscoveredProfile | null> {
  if (!advisor.city || !advisor.state) return null

  const searchUrl = `https://www.realtor.com/mortgage/loans/loanOfficers/find?q=${encodeURIComponent(advisor.name)}%20${advisor.city}`

  return {
    platform: 'Realtor.com',
    name: advisor.name,
    url: searchUrl,
    confidence: 'Medium',
    searchUrl,
    reason: `Realtor.com auto-creates lender profiles from national data. They likely display loan officer contact info.`,
    status: 'likely',
    notes:
      'Verify profile is claimed and updated with current contact and company branding.',
  }
}

// Google Maps Business Profile search
async function searchGoogleMaps(advisor: Advisor): Promise<DiscoveredProfile[]> {
  const results: DiscoveredProfile[] = []

  if (advisor.city && advisor.state) {
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(advisor.name)}%20mortgage%20advisor%20${advisor.city}%20${advisor.state}`

    results.push({
      platform: 'Google Business Profile',
      name: advisor.name,
      url: searchUrl,
      confidence: 'Medium',
      searchUrl,
      reason: `A Google Business Profile would let them appear in local search results when homebuyers search for mortgage advisors in their area.`,
      status: 'unknown',
      notes:
        'Search to check if a profile already exists or if one should be created.',
    })
  }

  if (advisor.nmls_number) {
    const nmlsSearchUrl = `https://www.google.com/search?q=NMLS%20${advisor.nmls_number}%20${encodeURIComponent(advisor.name)}`

    results.push({
      platform: 'Google (NMLS Search)',
      name: advisor.name,
      url: nmlsSearchUrl,
      confidence: 'High',
      searchUrl: nmlsSearchUrl,
      reason: `Searching for their NMLS number shows what profiles currently rank for their licensing ID.`,
      status: 'unknown',
      notes:
        'Check what profiles appear. Should be NMLS Consumer Access as #1 result.',
    })
  }

  return results
}

// LinkedIn profile search
async function searchLinkedIn(advisor: Advisor): Promise<DiscoveredProfile | null> {
  const searchUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(advisor.name)}`

  return {
    platform: 'LinkedIn',
    name: advisor.name,
    url: searchUrl,
    confidence: 'Medium',
    searchUrl,
    reason: `Most professionals have a LinkedIn profile. This shows industry presence and credibility.`,
    status: 'unknown',
    notes:
      'Check if profile exists, is claimed, and has recent activity. Update headline to include NMLS number and "Mortgage Advisor at NEO Home Loans".',
  }
}

// Facebook business page search
async function searchFacebook(advisor: Advisor): Promise<DiscoveredProfile | null> {
  const searchUrl = `https://www.facebook.com/search/people/?q=${encodeURIComponent(advisor.name)}`

  return {
    platform: 'Facebook',
    name: advisor.name,
    url: searchUrl,
    confidence: 'Low',
    searchUrl,
    reason: `A Facebook personal profile or business page could build community and share educational content.`,
    status: 'unknown',
    notes: 'Check if a personal profile or business page exists.',
  }
}

// Better.com (popular lending platform)
async function searchBetterDotCom(
  advisor: Advisor,
): Promise<DiscoveredProfile | null> {
  if (!advisor.nmls_number) return null

  const searchUrl = `https://www.better.com/search?q=${advisor.nmls_number}`

  return {
    platform: 'Better.com',
    name: advisor.name,
    url: searchUrl,
    confidence: 'Medium',
    searchUrl,
    reason: `Better.com is a major lending marketplace where loan officers build profiles to attract direct borrower leads.`,
    status: 'unknown',
    notes:
      'If they have a Better profile, it should be actively maintained with current contact and rates.',
  }
}

// LendingTree (loan officer directory)
async function searchLendingTree(advisor: Advisor): Promise<DiscoveredProfile | null> {
  if (!advisor.city || !advisor.state) return null

  const searchUrl = `https://www.lendingtree.com/home/lenders/?q=${encodeURIComponent(advisor.name)}`

  return {
    platform: 'LendingTree',
    name: advisor.name,
    url: searchUrl,
    confidence: 'Medium',
    searchUrl,
    reason: `LendingTree is a major lead source for loan officers. They likely have a profile generating inquiries.`,
    status: 'unknown',
    notes:
      'Verify profile is claimed, active, and rates are competitive.',
  }
}

// Bankrate (loan officer directory)
async function searchBankrate(advisor: Advisor): Promise<DiscoveredProfile | null> {
  if (!advisor.city || !advisor.state) return null

  const searchUrl = `https://www.bankrate.com/mortgages/lenders/loan-officers/?q=${encodeURIComponent(advisor.name)}`

  return {
    platform: 'Bankrate',
    name: advisor.name,
    url: searchUrl,
    confidence: 'Medium',
    searchUrl,
    reason: `Bankrate lists loan officers in their directory, making them discoverable by rate-shopping borrowers.`,
    status: 'unknown',
    notes: 'Check if profile exists and is actively maintaining rates and reviews.',
  }
}

// Yelp (local reviews & business directory)
async function searchYelp(advisor: Advisor): Promise<DiscoveredProfile | null> {
  if (!advisor.city || !advisor.state) return null

  const searchUrl = `https://www.yelp.com/search?q=${encodeURIComponent(advisor.name)}%20mortgage%20${advisor.city}`

  return {
    platform: 'Yelp',
    name: advisor.name,
    url: searchUrl,
    confidence: 'Low',
    searchUrl,
    reason: `Yelp profiles for loan officers can build trust through verified reviews and business information.`,
    status: 'unknown',
    notes:
      'If a Yelp listing exists, update hours, description, and encourage client reviews.',
  }
}

// BBB (Better Business Bureau)
async function searchBBB(advisor: Advisor): Promise<DiscoveredProfile | null> {
  if (!advisor.city || !advisor.state) return null

  const searchUrl = `https://www.bbb.org/search?q=${encodeURIComponent(advisor.name)}`

  return {
    platform: 'Better Business Bureau (BBB)',
    name: advisor.name,
    url: searchUrl,
    confidence: 'Low',
    searchUrl,
    reason: `BBB listing builds credibility with serious homebuyers who verify advisor credentials there.`,
    status: 'unknown',
    notes: 'Check if a business listing exists. If so, respond to any negative reviews promptly.',
  }
}

// Nextdoor (neighborhood social network)
async function searchNextdoor(advisor: Advisor): Promise<DiscoveredProfile | null> {
  if (!advisor.city) return null

  const searchUrl = `https://nextdoor.com/search?q=${encodeURIComponent(advisor.name)}`

  return {
    platform: 'Nextdoor',
    name: advisor.name,
    url: searchUrl,
    confidence: 'Low',
    searchUrl,
    reason: `Nextdoor is where neighbors ask for mortgage referrals. A profile here reaches micro-local leads.`,
    status: 'unknown',
    notes: 'Create or claim a profile to participate in local lending conversations.',
  }
}

export async function discoverChannels(
  advisor: Advisor,
  existingChannels: AdvisorChannel[],
): Promise<DiscoveredProfile[]> {
  // Get list of platforms already on file
  const existingPlatforms = new Set(
    existingChannels.map(c => c.platform.toLowerCase()),
  )

  const discovered: DiscoveredProfile[] = []

  // High-confidence checks
  const nmls = await searchNMLSConsumerAccess(advisor)
  if (nmls && !existingPlatforms.has('nmls')) discovered.push(nmls)

  const zillow = await searchZillow(advisor)
  if (zillow && !existingPlatforms.has('zillow')) discovered.push(zillow)

  const realtor = await searchRealtorDotCom(advisor)
  if (realtor && !existingPlatforms.has('realtor')) discovered.push(realtor)

  // Medium-confidence checks
  const gmaps = await searchGoogleMaps(advisor)
  gmaps.forEach(g => {
    if (!existingPlatforms.has('google')) discovered.push(g)
  })

  const linkedin = await searchLinkedIn(advisor)
  if (linkedin && !existingPlatforms.has('linkedin')) discovered.push(linkedin)

  const lendingtree = await searchLendingTree(advisor)
  if (lendingtree && !existingPlatforms.has('lendingtree'))
    discovered.push(lendingtree)

  const better = await searchBetterDotCom(advisor)
  if (better && !existingPlatforms.has('better')) discovered.push(better)

  const bankrate = await searchBankrate(advisor)
  if (bankrate && !existingPlatforms.has('bankrate')) discovered.push(bankrate)

  // Lower-confidence checks
  const fb = await searchFacebook(advisor)
  if (fb && !existingPlatforms.has('facebook')) discovered.push(fb)

  const yelp = await searchYelp(advisor)
  if (yelp && !existingPlatforms.has('yelp')) discovered.push(yelp)

  const bbb = await searchBBB(advisor)
  if (bbb && !existingPlatforms.has('bbb')) discovered.push(bbb)

  const nextdoor = await searchNextdoor(advisor)
  if (nextdoor && !existingPlatforms.has('nextdoor')) discovered.push(nextdoor)

  // Sort by confidence
  const confidenceOrder = { High: 0, Medium: 1, Low: 2 }
  discovered.sort(
    (a, b) =>
      confidenceOrder[a.confidence] - confidenceOrder[b.confidence],
  )

  return discovered
}
