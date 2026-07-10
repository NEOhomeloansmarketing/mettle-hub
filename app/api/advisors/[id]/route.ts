import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as serviceClient } from '@supabase/supabase-js'

function svc() {
  return serviceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

interface Ctx { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('advisors')
    .select(`
      *,
      advisor_channels (*),
      visibility_audits (*)
    `)
    .eq('id', id)
    .order('created_at', { ascending: false, referencedTable: 'visibility_audits' })
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const body = await req.json() as Record<string, unknown>
  const { channels, ...advisorData } = body as {
    channels?: { id?: string; platform: string; url: string; label?: string }[]
    [key: string]: unknown
  }

  const db = svc()

  // Update advisor fields
  if (Object.keys(advisorData).length) {
    const { error } = await db.from('advisors').update(advisorData).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Replace channels if provided
  if (channels !== undefined) {
    await db.from('advisor_channels').delete().eq('advisor_id', id)
    if (channels.length) {
      const rows = channels.map(({ id: _cid, ...c }) => ({ ...c, advisor_id: id }))
      await db.from('advisor_channels').insert(rows)
    }
  }

  const { data, error } = await db
    .from('advisors')
    .select('*, advisor_channels (*)')
    .eq('id', id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const db = svc()
  const { error } = await db.from('advisors').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
