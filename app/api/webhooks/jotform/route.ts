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
  if (!val) return undefined
  if (typeof val !== 'string') return undefined
  const s = val.trim()
  return s || undefined
}

// Jotform Address widget: { addr_line1, city, state, postal } OR formatted string
function parseAddress(val: unknown) {
  if (!val) return {}
  if (typeof val === 'string') {
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

// Jotform Phone widget: { full, area, phone } OR string
function parsePhone(val: unknown): string | undefined {
  if (!val) return undefined
  if (typeof val === 'string') return val.trim() || undefined
  const v = val as Record<string, string>
  return str(v.full) ?? str(v.phone)
}

// Jotform Name widget: { first, last } OR string
function parseName(val: unknown): string | undefined {
  if (!val) return undefined
  if (typeof val === 'string') return val.trim() || undefined
  const v = val as Record<string, string>
  return [str(v.first), str(v.last)].filter(Boolean).join(' ') || undefined
}

function extractUrls(val: unknown): string[] {
  if (!val || typeof val !== 'string') return []
  return val
    .split(/[\n,\s]+/)
    .map(s => s.trim())
    .filter(s => s.includes('.') && !s.includes(' ') && s.length > 5)
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret')
  if (process.env.JOTFORM_WEBHOOK_SECRET && secret !== process.env.JOTFORM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const text = await req.text()
  const params = new URLSearchParams(text)
  const rawRequest = params.get('rawRequest')

  let data: Record<string, unknown>
  if (rawRequest) {
    try { data = JSON.parse(rawRequest) } catch {
      return NextResponse.json({ error: 'Invalid rawRequest JSON' }, { status: 400 })
    }
  } else {
    try { data = JSON.parse(text) } catch {
      return NextResponse.json({ error: 'No parseable body' }, { status: 400 })
    }
  }

  return processSubmission(data)
}

async function processSubmission(data: Record<string, unknown>) {
  // ── Extract fields using the actual Jotform variable names ────────

  const fullName    = parseName(data.name)          // {name}
  const nmls        = str(data.nmls)                // {nmls}
  const businessName = str(data.businessName)       // {businessName}
  const teamName    = str(data.teamOr)              // {teamOr}
  const address     = parseAddress(data.q3_address1)// {q3_address1}
  const phone       = parsePhone(data.q4_phone2)    // {q4_phone2}
  const email       = str(data.businessEmail)       // {businessEmail}
  const title       = str(data.title)               // {title}
  const serviceArea = str(data.top5)                // {top5}
  const bio         = str(data.whoYou)              // {whoYou}
  const competitors = str(data.top3)                // {top3}
  const microSites  = str(data.doYou)               // {doYou}
  const anyOther    = str(data.anyOther)             // {anyOther}

  // ── Build channels ────────────────────────────────────────────────

  type Ch = { platform: string; url: string; label?: string }
  const channels: Ch[] = []

  const addCh = (platform: string, val: unknown, label?: string) => {
    const url = str(val as string)
    if (url) channels.push({ platform, url, ...(label ? { label } : {}) })
  }

  addCh('google_business', data.googleBusiness)
  addCh('linkedin',        data.linkedinLink)
  addCh('website',         data.personalWebsite, 'Personal Website')
  addCh('facebook',        data.facebookPage)
  addCh('instagram',       data.instagramPage)
  addCh('twitter',         data.xtwitter)
  addCh('tiktok',          data.tiktokPage)
  addCh('youtube',         data.personalYoutube)
  addCh('zillow',          data.zillowLink)
  addCh('yelp',            data.yelpLink)

  if (microSites) {
    const urls = extractUrls(microSites)
    if (urls.length) {
      urls.forEach(url => channels.push({ platform: 'other', url, label: 'Micro-site' }))
    } else {
      channels.push({ platform: 'other', url: microSites, label: 'Micro-site' })
    }
  }
  if (anyOther) {
    extractUrls(anyOther).forEach(url => channels.push({ platform: 'other', url }))
  }

  // ── Find or create the advisor ────────────────────────────────────

  const db = svc()
  let advisorId: string | null = null
  let created = false

  // 1. NMLS (most unique)
  if (nmls) {
    const { data: found } = await db.from('advisors').select('id').eq('nmls_number', nmls).maybeSingle()
    if (found) advisorId = found.id
  }

  // 2. Email
  if (!advisorId && email) {
    const { data: found } = await db.from('advisors').select('id').ilike('email', email).maybeSingle()
    if (found) advisorId = found.id
  }

  // 3. Full name
  if (!advisorId && fullName) {
    const { data: found } = await db.from('advisors').select('id').ilike('name', fullName).maybeSingle()
    if (found) advisorId = found.id
  }

  // 4. Auto-create if no match found
  if (!advisorId) {
    const newName = fullName ?? businessName ?? email ?? 'Unknown Advisor'
    const { data: newAdvisor, error } = await db
      .from('advisors')
      .insert({
        name:           newName,
        title:          title ?? null,
        email:          email ?? null,
        phone:          phone ?? null,
        nmls_number:    nmls ?? null,
        street_address: address.street ?? null,
        city:           address.city ?? null,
        state:          address.state ?? null,
        zip:            address.zip ?? null,
        service_area:   serviceArea ?? null,
        bio:            bio ?? null,
      })
      .select('id')
      .single()

    if (error || !newAdvisor) {
      console.error('[jotform] Auto-create failed', error)
      return NextResponse.json({ error: 'Could not create advisor' }, { status: 500 })
    }

    advisorId = newAdvisor.id
    created = true
  }

  // ── Update existing advisor fields ────────────────────────────────

  if (!created) {
    const metadata: Record<string, string> = {}
    if (teamName)     metadata.team_name     = teamName
    if (businessName) metadata.business_name = businessName
    if (competitors)  metadata.competitors   = competitors

    const update: Record<string, unknown> = {}
    if (fullName)        update.name           = fullName
    if (email)           update.email          = email
    if (phone)           update.phone          = phone
    if (title)           update.title          = title
    if (serviceArea)     update.service_area   = serviceArea
    if (bio)             update.bio            = bio
    if (nmls)            update.nmls_number    = nmls
    if (address.street)  update.street_address = address.street
    if (address.city)    update.city           = address.city
    if (address.state)   update.state          = address.state
    if (address.zip)     update.zip            = address.zip
    if (Object.keys(metadata).length) update.metadata = metadata

    if (Object.keys(update).length) {
      const { error } = await db.from('advisors').update(update).eq('id', advisorId)
      if (error) console.error('[jotform] Update failed', error)
    }
  } else {
    // Store extra metadata on the newly created advisor
    const metadata: Record<string, string> = {}
    if (teamName)     metadata.team_name     = teamName
    if (businessName) metadata.business_name = businessName
    if (competitors)  metadata.competitors   = competitors
    if (Object.keys(metadata).length) {
      await db.from('advisors').update({ metadata }).eq('id', advisorId)
    }
  }

  // ── Upsert channels ───────────────────────────────────────────────

  if (channels.length) {
    // Replace all known-platform entries (so stale links get cleared)
    const knownPlatforms = [...new Set(
      channels.filter(c => c.platform !== 'other').map(c => c.platform)
    )]
    if (knownPlatforms.length) {
      await db.from('advisor_channels').delete()
        .eq('advisor_id', advisorId).in('platform', knownPlatforms)
    }

    // Dedup 'other' against existing
    const { data: existingOther } = await db
      .from('advisor_channels').select('url')
      .eq('advisor_id', advisorId).eq('platform', 'other')
    const seenUrls = new Set((existingOther ?? []).map(c => c.url))

    const toInsert = [
      ...channels.filter(c => c.platform !== 'other'),
      ...channels.filter(c => c.platform === 'other' && !seenUrls.has(c.url)),
    ].map(c => ({ ...c, advisor_id: advisorId }))

    if (toInsert.length) {
      await db.from('advisor_channels').insert(toInsert)
    }
  }

  return NextResponse.json({
    ok: true,
    advisorId,
    created,
    fieldsUpdated: created ? 'all' : 'merged',
    channelsUpdated: channels.length,
  })
}
