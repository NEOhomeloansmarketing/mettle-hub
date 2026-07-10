import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// ── Field parsers ─────────────────────────────────────────────────────────────

function str(val: unknown): string | undefined {
  if (!val || typeof val !== 'string') return undefined
  const s = val.trim()
  return s || undefined
}

// Jotform Address widget sends an object: { addr_line1, city, state, postal, country }
function parseAddress(val: unknown) {
  if (!val) return {}
  if (typeof val === 'string') {
    // Sometimes Jotform sends the address as a pre-formatted string
    return { street: val.split('\n')[0]?.trim() || undefined }
  }
  const v = val as Record<string, string>
  return {
    street: str(v.addr_line1),
    city:   str(v.city),
    state:  str(v.state),
    zip:    str(v.postal),
  }
}

// Jotform Phone widget sends { full, area, phone } OR just a string
function parsePhone(val: unknown): string | undefined {
  if (!val) return undefined
  if (typeof val === 'string') return val.trim() || undefined
  const v = val as Record<string, string>
  return str(v.full) ?? str(v.phone)
}

// Jotform Full Name widget sends { first, last } OR just a string
function parseName(val: unknown): string | undefined {
  if (!val) return undefined
  if (typeof val === 'string') return val.trim() || undefined
  const v = val as Record<string, string>
  return [str(v.first), str(v.last)].filter(Boolean).join(' ') || undefined
}

// Pull multiple URLs out of a multi-line or comma-separated text field
function extractUrls(val: unknown): string[] {
  if (!val || typeof val !== 'string') return []
  return val
    .split(/[\n,]+/)
    .map(s => s.trim())
    .filter(s => s.startsWith('http') || s.startsWith('www.') || s.includes('.'))
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Optional: protect with ?secret=xxx in your Jotform webhook URL
  const secret = req.nextUrl.searchParams.get('secret')
  if (process.env.JOTFORM_WEBHOOK_SECRET && secret !== process.env.JOTFORM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Jotform posts URL-encoded body with a `rawRequest` key containing JSON
  const text = await req.text()
  const params = new URLSearchParams(text)
  const rawRequest = params.get('rawRequest')

  if (!rawRequest) {
    // Some Jotform setups send JSON directly
    let direct: Record<string, unknown>
    try { direct = JSON.parse(text) } catch { direct = {} }
    if (!Object.keys(direct).length) {
      return NextResponse.json({ error: 'No rawRequest in body' }, { status: 400 })
    }
    return processSubmission(direct)
  }

  let data: Record<string, unknown>
  try {
    data = JSON.parse(rawRequest)
  } catch {
    return NextResponse.json({ error: 'Could not parse rawRequest JSON' }, { status: 400 })
  }

  return processSubmission(data)
}

async function processSubmission(data: Record<string, unknown>) {
  // ── Extract NAP fields ────────────────────────────────────────────

  const email       = str(data.businessEmail)
  const phone       = parsePhone(data.q4_phone2)
  const address     = parseAddress(data.q3_address1)
  const title       = str(data.title)
  const serviceArea = str(data.top5)
  const bio         = str(data.whoYou)
  const competitors = str(data.top3)
  const teamName    = str(data.teamOr)
  const businessName = str(data.businessName)
  const microSites  = str(data.doYou)
  const anyOther    = str(data.anyOther)

  // NMLS — the user said they added this field; try likely variable names
  const nmls =
    str(data.nmlsNumber) ?? str(data.nmls) ?? str(data.nmlsId) ??
    str(data.nmlsNum)    ?? str(data.licenseNumber) ?? str(data.license)

  // Full name — Jotform Name widget sends { first, last }; also try plain text fields
  const fullName =
    parseName(data.fullName) ?? parseName(data.advisorName) ??
    parseName(data.yourName) ?? parseName(data.name) ??
    str(data.fullName)

  // ── Map social/directory links to channels ────────────────────────

  type ChannelInput = { platform: string; url: string; label?: string }
  const channels: ChannelInput[] = []

  const addCh = (platform: string, val: unknown, label?: string) => {
    const url = str(val as string)
    if (url) channels.push({ platform, url, ...(label ? { label } : {}) })
  }

  addCh('google_business', data.googleBusiness)
  addCh('linkedin',        data.linkedinLink)
  addCh('website',         data.personalWebsite,  'Personal Website')
  addCh('facebook',        data.facebookPage)
  addCh('instagram',       data.instagramPage)
  addCh('twitter',         data.xtwitter)
  addCh('tiktok',          data.tiktokPage)
  addCh('youtube',         data.personalYoutube)
  addCh('zillow',          data.zillowLink)
  addCh('yelp',            data.yelpLink)

  // Micro-sites / LinkTree / custom domains
  if (microSites) {
    const urls = extractUrls(microSites)
    if (urls.length) {
      urls.forEach(url => channels.push({ platform: 'other', url, label: 'Micro-site' }))
    } else if (microSites.length < 200) {
      channels.push({ platform: 'other', url: microSites, label: 'Micro-site' })
    }
  }

  // Any other links field
  if (anyOther) {
    extractUrls(anyOther).forEach(url => channels.push({ platform: 'other', url }))
  }

  // ── Find the advisor ──────────────────────────────────────────────

  const db = svc()
  let advisorId: string | null = null

  // 1. NMLS (most reliable)
  if (nmls) {
    const { data: found } = await db
      .from('advisors').select('id').eq('nmls_number', nmls).maybeSingle()
    if (found) advisorId = found.id
  }

  // 2. Email (very reliable — each advisor has a unique work email)
  if (!advisorId && email) {
    const { data: found } = await db
      .from('advisors').select('id').ilike('email', email).maybeSingle()
    if (found) advisorId = found.id
  }

  // 3. Full name fuzzy match
  if (!advisorId && fullName) {
    const { data: found } = await db
      .from('advisors').select('id').ilike('name', fullName).maybeSingle()
    if (found) advisorId = found.id
  }

  if (!advisorId) {
    console.error('[jotform-webhook] Could not match advisor', { nmls, email, fullName })
    return NextResponse.json(
      { error: 'No matching advisor found', tried: { nmls, email, fullName } },
      { status: 404 },
    )
  }

  // ── Update advisor profile ────────────────────────────────────────

  // Store extra fields (competitors, team/brand name) in metadata JSONB
  const metadata: Record<string, string> = {}
  if (teamName)     metadata.team_name     = teamName
  if (businessName) metadata.business_name = businessName
  if (competitors)  metadata.competitors   = competitors

  const update: Record<string, unknown> = {}
  if (email)          update.email          = email
  if (phone)          update.phone          = phone
  if (title)          update.title          = title
  if (serviceArea)    update.service_area   = serviceArea
  if (bio)            update.bio            = bio
  if (nmls)           update.nmls_number    = nmls
  if (address.street) update.street_address = address.street
  if (address.city)   update.city           = address.city
  if (address.state)  update.state          = address.state
  if (address.zip)    update.zip            = address.zip
  if (Object.keys(metadata).length) update.metadata = metadata

  const { error: updateErr } = await db
    .from('advisors').update(update).eq('id', advisorId)

  if (updateErr) {
    console.error('[jotform-webhook] Update failed', updateErr)
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  // ── Upsert channels ───────────────────────────────────────────────
  // For known platforms (not 'other'): delete the old entry and re-insert so
  // it reflects whatever the advisor entered. For 'other': only add if not
  // already present (avoid duplicate LinkTree rows).

  if (channels.length) {
    const knownPlatforms = [...new Set(
      channels.filter(c => c.platform !== 'other').map(c => c.platform)
    )]

    // Remove stale known-platform entries for this advisor
    if (knownPlatforms.length) {
      await db
        .from('advisor_channels')
        .delete()
        .eq('advisor_id', advisorId)
        .in('platform', knownPlatforms)
    }

    // Dedup 'other' channels against what already exists
    const { data: existingOther } = await db
      .from('advisor_channels')
      .select('url')
      .eq('advisor_id', advisorId)
      .eq('platform', 'other')

    const existingOtherUrls = new Set((existingOther ?? []).map(c => c.url))

    const toInsert = [
      ...channels.filter(c => c.platform !== 'other'),
      ...channels.filter(c => c.platform === 'other' && !existingOtherUrls.has(c.url)),
    ].map(c => ({ ...c, advisor_id: advisorId }))

    if (toInsert.length) {
      const { error: insertErr } = await db.from('advisor_channels').insert(toInsert)
      if (insertErr) console.error('[jotform-webhook] Channel insert failed', insertErr)
    }
  }

  return NextResponse.json({
    ok: true,
    advisorId,
    fieldsUpdated: Object.keys(update),
    channelsUpdated: channels.length,
  })
}
