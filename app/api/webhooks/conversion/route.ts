import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/**
 * POST /api/webhooks/conversion
 *
 * Headers:
 *   x-api-key: <CONVERSION_WEBHOOK_SECRET>
 *
 * Body:
 * {
 *   "date": "2026-08-05",
 *   "entries": [
 *     { "name": "Matt Smith", "leads": 3 },
 *     { "name": "Ben Kyle",   "leads": 1 }
 *   ]
 * }
 */
export async function POST(req: NextRequest) {
  const apiKey = req.headers.get('x-api-key')
  if (!apiKey || apiKey !== process.env.CONVERSION_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { date: string; entries: { name: string; leads: number }[] }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { date, entries } = body
  if (!date || !Array.isArray(entries) || !entries.length) {
    return NextResponse.json({ error: 'date and entries[] required' }, { status: 400 })
  }

  const month = date.slice(0, 7)
  const sb = admin()

  const names = entries.map(e => e.name.trim())
  const { data: profiles } = await sb
    .from('profiles')
    .select('id, full_name')
    .in('full_name', names)

  const nameToId = Object.fromEntries(
    (profiles ?? []).map((p: any) => [p.full_name.trim(), p.id])
  )

  const results: { name: string; status: string }[] = []

  for (const entry of entries) {
    const name   = entry.name.trim()
    const userId = nameToId[name]
    if (!userId) { results.push({ name, status: 'no_account' }); continue }

    const { data: existing } = await sb
      .from('conversion_entries')
      .select('leads, apps, funded')
      .eq('user_id', userId)
      .eq('month', month)
      .maybeSingle()

    const { error } = await sb.from('conversion_entries').upsert(
      {
        user_id: userId,
        month,
        leads:  (existing?.leads  ?? 0) + (entry.leads ?? 0),
        apps:    existing?.apps   ?? 0,
        funded:  existing?.funded ?? 0,
      },
      { onConflict: 'user_id,month', ignoreDuplicates: false },
    )

    results.push({ name, status: error ? `error: ${error.message}` : 'ok' })
  }

  return NextResponse.json({ month, results })
}
