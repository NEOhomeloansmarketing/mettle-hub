import { createClient } from '@/lib/supabase/server'
import { LeadsView } from '@/components/leads/LeadsView'

export default async function LeadsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: account } = await supabase
    .from('accounts')
    .select('role')
    .eq('id', user!.id)
    .single()

  return <LeadsView isAdmin={account?.role === 'admin'} />
}
