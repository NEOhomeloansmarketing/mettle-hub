import { createClient } from '@/lib/supabase/server'
import { AgentsView } from '@/components/agents/AgentsView'
import type { Agent } from '@/lib/types'

export default async function AgentsPage() {
  const supabase = await createClient()
  const { data: agents } = await supabase
    .from('agents')
    .select('*')
    .order('created_at', { ascending: false })

  return <AgentsView initialAgents={(agents ?? []) as Agent[]} />
}
