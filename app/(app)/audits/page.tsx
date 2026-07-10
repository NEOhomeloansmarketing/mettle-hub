import { createClient } from '@/lib/supabase/server'
import { AuditsView } from '@/components/audits/AuditsView'

export const metadata = { title: 'Marketing Audits — Mettle Hub' }

export default async function AuditsPage() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('advisors')
    .select(`
      *,
      advisor_channels (*),
      visibility_audits (id, status, score, created_at, completed_at)
    `)
    .order('name', { ascending: true })

  return <AuditsView initialAdvisors={data ?? []} />
}
