import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const ALLOWED_OWNERS = new Set([
  'Matt Smith', 'Ben Kyle', 'Drake Bloebaum', 'Ross Zimmerman',
  'Skyler Ford', 'Mike Jones', 'David Nelson', 'Scott Breen',
])

// Priority-ordered keyword rules — first match wins
const CHANNEL_RULES: { channel: string; test: (s: string) => boolean }[] = [
  { channel: 'CRNA',                 test: s => s.includes('crna') },
  { channel: 'Entrepreneur',         test: s => s.includes('entrepreneur') },
  { channel: 'Physician ADs',        test: s => s.includes('physicianfb') },
  { channel: 'WCI',                  test: s => s.includes('wci') || s.includes('white coat') },
  { channel: 'Better Leads',         test: s => s.includes('neoxbetr') },
  { channel: 'Tax Hive',             test: s => s.includes('tax hive') || s.includes('taxhive') },
  { channel: 'Wealth Juice',         test: s => s.includes('wealth juice') || s.includes('wealthjuice') },
  { channel: 'Past Client / Referral', test: s =>
      s.includes('past client') || s.includes('referral') ||
      s.includes('realtor')     || s.includes('partner')
  },
  // Physician Site — catch-all for anything medical/app that didn't match above
  { channel: 'Physician Site',       test: s =>
      s.includes('website')   || s.includes('josh')      ||
      s.includes('-app')      || s.includes('neoutah')   ||
      s.includes('800')       || s.includes('rnlander')  ||
      s.includes('medpro')    || s.includes('dpt')
  },
]

function matchChannel(source: string): string | null {
  const lower = source.toLowerCase()
  for (const rule of CHANNEL_RULES) {
    if (rule.test(lower)) return rule.channel
  }
  return null
}

function getWeekStart(dateStr?: string): string {
  const date = dateStr ? new Date(dateStr) : new Date()
  const day  = date.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  date.setUTCDate(date.getUTCDate() + diff)
  return date.toISOString().split('T')[0]
}

function extractField(body: any, ...keys: string[]): string {
  for (const key of keys) {
    const val = body[key]
    if (val !== undefined && val !== null && val !== '') return String(val).trim()
  }
  return ''
}

export async function POST(req: NextRequest) {
  const auth   = req.headers.get('authorization') || ''
  const secret = auth.replace('Bearer ', '').trim()
  if (!process.env.ZAPIER_WEBHOOK_SECRET || secret !== process.env.ZAPIER_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: any
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  // Pull the three key fields — support BNTouch field names from Zapier
  const source = extractField(body,
    'Contact Info Added Source', 'contact_info_added_source', 'source', 'lead_source',
  )
  const owner = extractField(body,
    'Record Owner', 'record_owner', 'owner', 'assigned_to',
  )
  const dateRaw = extractField(body,
    'Contact Info Added Date', 'contact_info_added_date', 'date', 'created_date', 'date_added',
  )

  // Skip leads with no source
  if (!source) {
    return NextResponse.json({ skipped: true, reason: 'no_source' })
  }

  // Skip leads not assigned to tracked record owners
  if (!ALLOWED_OWNERS.has(owner)) {
    return NextResponse.json({ skipped: true, reason: 'owner_not_tracked', owner })
  }

  const supabase  = await createClient()
  const weekStart = getWeekStart(dateRaw || undefined)

  // 1. Check for a user-assigned exact mapping first (from the queue UI)
  const { data: exactMapping } = await supabase
    .from('lead_source_mappings')
    .select('display_channel')
    .ilike('bntouch_source', source)
    .maybeSingle()

  // 2. Fall through to keyword rules
  const channel = exactMapping?.display_channel ?? matchChannel(source)

  if (!channel) {
    // Unknown — queue it for the admin to assign
    await supabase.rpc('increment_source_queue_count', { p_source: source })
    return NextResponse.json({ skipped: true, reason: 'unmapped_source', source })
  }

  // Atomically increment the weekly tally
  await supabase.rpc('increment_lead_count', {
    p_week_start: weekStart,
    p_channel:    channel,
  })

  return NextResponse.json({ ok: true, week_start: weekStart, channel })
}
