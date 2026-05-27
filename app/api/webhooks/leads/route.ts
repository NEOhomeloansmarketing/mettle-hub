import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Record owners whose leads we count — exact names as in BNTouch
const ALLOWED_OWNERS = new Set([
  'Matt Smith',
  'Ben Kyle',
  'Drake Bloebaum',
  'Ross Zimmerman',
  'Skyler Ford',
  'Mike Jones',
  'David Nelson',
  'Scott Breen',
])

function getWeekStart(dateStr?: string): string {
  const date = dateStr ? new Date(dateStr) : new Date()
  const day  = date.getUTCDay() // 0 = Sun
  const diff = day === 0 ? -6 : 1 - day  // roll back to Monday
  date.setUTCDate(date.getUTCDate() + diff)
  return date.toISOString().split('T')[0]
}

// Zapier sends BNTouch field names — support both raw names and our mapped names
function extractField(body: any, ...keys: string[]): string {
  for (const key of keys) {
    if (body[key] !== undefined && body[key] !== null && body[key] !== '') {
      return String(body[key]).trim()
    }
  }
  return ''
}

export async function POST(req: NextRequest) {
  // Verify shared secret sent by Zapier in Authorization header
  const auth   = req.headers.get('authorization') || ''
  const secret = auth.replace('Bearer ', '').trim()
  if (!process.env.ZAPIER_WEBHOOK_SECRET || secret !== process.env.ZAPIER_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: any
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  // Pull the three fields — support exact BNTouch names from Zapier
  const source = extractField(body,
    'Contact Info Added Source',
    'contact_info_added_source',
    'source',
    'lead_source',
  )
  const owner = extractField(body,
    'Record Owner',
    'record_owner',
    'owner',
    'assigned_to',
  )
  const dateRaw = extractField(body,
    'Contact Info Added Date',
    'contact_info_added_date',
    'date',
    'created_date',
    'date_added',
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

  // Look up the display channel for this source (case-insensitive)
  const { data: mapping } = await supabase
    .from('lead_source_mappings')
    .select('display_channel')
    .ilike('bntouch_source', source)
    .maybeSingle()

  if (!mapping) {
    // Unknown source — queue it for admin to map
    await supabase.rpc('increment_source_queue_count', { p_source: source })
    return NextResponse.json({ skipped: true, reason: 'unmapped_source', source })
  }

  // Atomically increment the weekly tally
  await supabase.rpc('increment_lead_count', {
    p_week_start: weekStart,
    p_channel:    mapping.display_channel,
  })

  return NextResponse.json({
    ok:         true,
    week_start: weekStart,
    channel:    mapping.display_channel,
  })
}
