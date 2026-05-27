import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { NotesView } from '@/components/notes/NotesView'

export default async function NotesPage() {
  const supabase = await createClient()

  const { data: notes } = await supabase
    .from('notes')
    .select('*')
    .order('updated_at', { ascending: false })

  return (
    <Suspense fallback={<div className="page" style={{ padding: 40, color: 'var(--muted)' }}>Loading notes…</div>}>
      <NotesView initialNotes={notes ?? []} />
    </Suspense>
  )
}
