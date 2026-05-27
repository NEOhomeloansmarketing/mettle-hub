import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { title, description, assignee_id } = await req.json()
  if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 })

  const { data, error } = await supabase.from('tasks').insert({
    title,
    description: description ?? '',
    priority: 'Medium',
    channel: 'All',
    status: 'To Do',
    assignee_id: assignee_id || null,
    due: null,
    section_id: null,
    meeting_id: null,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.from('activity').insert({
    kind: 'task',
    label: `Task created from analytics: "${title}"`,
  })

  return NextResponse.json({ ok: true, task_id: data?.id })
}
