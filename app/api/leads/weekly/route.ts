import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const ALL_CHANNELS = [
  'CRNA',
  'Entrepreneur',
  'Physician Site',
  'Physician ADs',
  'Better Leads',
  'WCI',
  'Tax Hive',
  'Wealth Juice',
  'Past Client',
  'Partner Referral',
]

// GET — returns all weeks + data for selected week + previous week
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const weekParam = req.nextUrl.searchParams.get('week') // YYYY-MM-DD

  // All weeks that have any data
  const { data: rawWeeks } = await supabase
    .from('lead_weekly_totals')
    .select('week_start')
    .order('week_start', { ascending: false })

  const weeks = [...new Set((rawWeeks ?? []).map((r: any) => r.week_start as string))]

  const selectedWeek = weekParam || weeks[0] || null

  if (!selectedWeek) {
    return NextResponse.json({ weeks: [], current: null, prev: null, queue: [] })
  }

  // Find the previous week
  const currentIdx = weeks.indexOf(selectedWeek)
  const prevWeek   = currentIdx >= 0 && currentIdx < weeks.length - 1
    ? weeks[currentIdx + 1]
    : null

  // Fetch current and previous week data in parallel
  const [{ data: currRows }, { data: prevRows }, { data: queueRows }] = await Promise.all([
    supabase.from('lead_weekly_totals').select('source_channel, count').eq('week_start', selectedWeek),
    prevWeek
      ? supabase.from('lead_weekly_totals').select('source_channel, count').eq('week_start', prevWeek)
      : Promise.resolve({ data: [] }),
    supabase.from('lead_source_queue').select('bntouch_source, sample_count').order('sample_count', { ascending: false }),
  ])

  // Build channel maps
  function toMap(rows: any[]) {
    return Object.fromEntries((rows ?? []).map((r: any) => [r.source_channel, r.count as number]))
  }

  const currMap = toMap(currRows ?? [])
  const prevMap = toMap(prevRows ?? [])

  const current = ALL_CHANNELS.map(ch => ({
    channel:  ch,
    count:    currMap[ch] ?? 0,
    prevCount: prevMap[ch] ?? null,
  }))

  return NextResponse.json({
    weeks,
    selectedWeek,
    prevWeek,
    current,
    queue: queueRows ?? [],
  })
}

// POST — backfill a week manually
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { week_start, counts } = await req.json() as {
    week_start: string
    counts: Record<string, number>
  }

  if (!week_start || !counts) {
    return NextResponse.json({ error: 'week_start and counts required' }, { status: 400 })
  }

  const rows = Object.entries(counts)
    .filter(([, v]) => v > 0)
    .map(([channel, count]) => ({
      week_start,
      source_channel: channel,
      count,
    }))

  if (rows.length === 0) {
    return NextResponse.json({ ok: true, saved: 0 })
  }

  const { error } = await supabase
    .from('lead_weekly_totals')
    .upsert(rows, { onConflict: 'week_start,source_channel' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, saved: rows.length })
}

// PATCH — assign an unmapped source to a channel
export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { bntouch_source, display_channel } = await req.json()

  await supabase
    .from('lead_source_mappings')
    .insert({ bntouch_source, display_channel })
    .select()

  await supabase
    .from('lead_source_queue')
    .delete()
    .eq('bntouch_source', bntouch_source)

  return NextResponse.json({ ok: true })
}
