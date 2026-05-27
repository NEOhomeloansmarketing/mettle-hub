import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { MeetingsView } from '@/components/meetings/MeetingsView'

export default async function MeetingsPage({
  searchParams,
}: {
  searchParams: Promise<{ meeting?: string }>
}) {
  const supabase = await createClient()
  const sp = await searchParams

  const [
    { data: meetings },
    { data: sections },
    { data: team },
    { data: { user } },
  ] = await Promise.all([
    supabase
      .from('meetings')
      .select('*, meeting_attendees(account_id)')
      .order('date', { ascending: false }),
    supabase.from('sections').select('*').order('order_index', { ascending: true }),
    supabase.from('accounts').select('id,name,color,initials,email').eq('status', 'approved'),
    supabase.auth.getUser(),
  ])

  return (
    <Suspense fallback={<div className="page" style={{ padding: 40, color: 'var(--muted)' }}>Loading meetings…</div>}>
      <MeetingsView
        initialMeetings={(meetings ?? []) as any}
        sections={sections ?? []}
        team={(team ?? []) as any}
        currentUserId={user!.id}
        initialMeetingId={sp.meeting}
      />
    </Suspense>
  )
}
