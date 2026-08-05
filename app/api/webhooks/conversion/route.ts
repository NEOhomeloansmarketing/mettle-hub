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
 * Called by your external lead-tracking system with daily lead counts per person.
 * Each call ADDS to the running monthly total — call it as often as needed.
 *
 * Headers:
 *   x-api-key: <CONVERSION_WEBHOOK_SECRET>
 *
 * Body:
 * {
 *   "date": "2026-08-05",          // used to derive the month YYYY-MM
 *   "entries": [
 *     { "email": "user@neo.com", "leads": 3 },
 *     { "email": "other@neo.com", "leads": 1 }
 *   ]
 * }
 *
 * Response:
 * { "month": "2026-08", "results": [{ "email": "...", "status": "ok" | "no_account" | "error:..." }] }
 */
export async function POST(req: NextRequest) {
  const apiKey = req.headers.get('x-api-key')
  if (!apiKey || apiKey !== process.env.CONVERSION_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { date: string; entries: { email: string; leads: number }[] }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { date, entries } = body
  if (!date || !Array.isArray(entries) || !entries.length) {
    return NextResponse.json({ error: 'date and entries[] required' }, { status: 400 })
  }

  const month = date.slice(0, 7) // YYYY-MM
  const sb = admin()

  // Resolve emails → account IDs in one query
  const emails = entries.map(e => e.email.toLowerCase().trim())
  const { data: accounts } = await sb
    .from('accounts')
    .select('id, email')
    .in('email', emails)

  const emailToId = Object.fromEntries(
    (accounts ?? []).map((a: any) => [a.email.toLowerCase(), a.id])
  )

  const results: { email: string; status: string }[] = []

  for (const entry of entries) {
    const email  = entry.email.toLowerCase().trim()
    const userId = emailToId[email]
    if (!userId) { results.push({ email, status: 'no_account' }); continue }

    // Fetch existing row so we can add to the lead count
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

    results.push({ email, status: error ? `error: ${error.message}` : 'ok' })
  }

  return NextResponse.json({ month, results })
}
