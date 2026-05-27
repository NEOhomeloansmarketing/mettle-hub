import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { TasksView } from '@/components/tasks/TasksView'

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ task?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const sp = await searchParams

  const [
    { data: sections },
    { data: tasks },
    { data: team },
  ] = await Promise.all([
    supabase.from('sections').select('*').order('order_index', { ascending: true }),
    supabase
      .from('tasks')
      .select('*, accounts!tasks_assignee_id_fkey(id,name,color,initials)')
      .order('created_at', { ascending: false }),
    supabase
      .from('accounts')
      .select('id,name,color,initials,email')
      .eq('status', 'approved'),
  ])

  return (
    <Suspense fallback={<div className="page" style={{ padding: 40, color: 'var(--muted)' }}>Loading tasks…</div>}>
      <TasksView
        initialSections={sections ?? []}
        initialTasks={(tasks ?? []) as any}
        team={(team ?? []) as any}
        currentUserId={user!.id}
        initialTaskId={sp.task}
      />
    </Suspense>
  )
}
