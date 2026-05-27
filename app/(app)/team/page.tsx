import { createClient } from '@/lib/supabase/server'
import { TeamView } from '@/components/team/TeamView'

export default async function TeamPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: team } = await supabase
    .from('accounts')
    .select('*')
    .eq('status', 'approved')
    .order('created_at', { ascending: true })

  return <TeamView team={team ?? []} currentUserId={user!.id} />
}
