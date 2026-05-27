import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: account } = await supabase.from('accounts').select('role,status').eq('id', user.id).single()
  if (!account || account.status !== 'approved' || account.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const [
    { data: accounts },
    { data: sections },
    { data: tasks },
    { data: meetings },
    { data: notes },
    { data: blogPosts },
    { data: brandDocs },
    { data: activity },
  ] = await Promise.all([
    supabase.from('accounts').select('*'),
    supabase.from('sections').select('*'),
    supabase.from('tasks').select('*'),
    supabase.from('meetings').select('*'),
    supabase.from('notes').select('*'),
    supabase.from('blog_posts').select('*'),
    supabase.from('brand_docs').select('*'),
    supabase.from('activity').select('*').order('ts', { ascending: false }).limit(500),
  ])

  const dump = {
    exported_at: new Date().toISOString(),
    accounts, sections, tasks, meetings, notes,
    blog_posts: blogPosts, brand_docs: brandDocs, activity,
  }

  return new NextResponse(JSON.stringify(dump, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': 'attachment; filename="mettle-hub-export.json"',
    },
  })
}
