import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret')
  if (!secret || secret !== process.env.BEE_SYNC_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = serviceClient()

  const { data: colin } = await supabase
    .from('accounts')
    .select('id')
    .ilike('name', '%colin%jenson%')
    .maybeSingle()

  if (!colin) return NextResponse.json({ tasks: [] })

  const { data: tasks } = await supabase
    .from('tasks')
    .select('title')
    .eq('assignee_id', colin.id)
    .neq('status', 'Done')

  return NextResponse.json({ tasks: tasks ?? [] })
}
