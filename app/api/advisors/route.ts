import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as serviceClient } from '@supabase/supabase-js'

function svc() {
  return serviceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function GET() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('advisors')
    .select(`
      *,
      advisor_channels (*),
      visibility_audits (id, status, score, created_at, completed_at)
    `)
    .order('name', { ascending: true })
    .order('created_at', { ascending: false, referencedTable: 'visibility_audits' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { channels, ...advisorData } = body as {
    channels?: { platform: string; url: string; label?: string }[]
    [key: string]: unknown
  }

  const db = svc()
  const { data: advisor, error } = await db
    .from('advisors')
    .insert(advisorData)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (channels?.length) {
    const rows = channels.map(c => ({ ...c, advisor_id: advisor.id }))
    await db.from('advisor_channels').insert(rows)
  }

  return NextResponse.json(advisor, { status: 201 })
}
