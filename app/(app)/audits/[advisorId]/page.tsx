import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AdvisorProfile } from '@/components/audits/AdvisorProfile'

interface Props { params: Promise<{ advisorId: string }> }

export async function generateMetadata({ params }: Props) {
  const { advisorId } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('advisors').select('name').eq('id', advisorId).single()
  return { title: data ? `${data.name} — Marketing Audit` : 'Advisor' }
}

export default async function AdvisorPage({ params }: Props) {
  const { advisorId } = await params
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('advisors')
    .select(`
      *,
      advisor_channels (*),
      visibility_audits (*)
    `)
    .eq('id', advisorId)
    .order('created_at', { ascending: false, referencedTable: 'visibility_audits' })
    .single()

  if (error || !data) notFound()

  return <AdvisorProfile advisor={data} />
}
