import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as adminClient } from '@supabase/supabase-js'

function admin() {
  return adminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// GET /api/conversion?month=2026-08
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const month = req.nextUrl.searchParams.get('month') ?? new Date().toISOString().slice(0, 7)

  const sb = admin()
  const [{ data: team }, { data: entries }] = await Promise.all([
    sb.from('profiles').select('id, full_name, email').eq('status', 'approved').order('full_name'),
    sb.from('conversion_entries').select('*').eq('month', month),
  ])

  const entryMap = Object.fromEntries((entries ?? []).map((e: any) => [e.user_id, e]))

  const rows = (team ?? []).map((t: any) => {
    const e = entryMap[t.id] ?? { leads: 0, apps: 0, funded: 0 }
    return {
      user_id: t.id,
      name: t.full_name,
      email: t.email,
      leads: e.leads ?? 0,
      apps: e.apps ?? 0,
      funded: e.funded ?? 0,
    }
  })

  return NextResponse.json({ month, rows })
}

// POST /api/conversion — admin updates apps/funded for a person
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { user_id, month, apps, funded } = await req.json()
  if (!user_id || !month) return NextResponse.json({ error: 'user_id and month required' }, { status: 400 })

  const sb = admin()
  const { error } = await sb.from('conversion_entries').upsert(
    { user_id, month, apps: apps ?? 0, funded: funded ?? 0 },
    { onConflict: 'user_id,month', ignoreDuplicates: false },
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
