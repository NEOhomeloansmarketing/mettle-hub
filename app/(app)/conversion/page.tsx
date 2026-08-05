import { createClient } from '@/lib/supabase/server'
import { ConversionView } from '@/components/conversion/ConversionView'

export default async function ConversionPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: account } = await supabase
    .from('accounts')
    .select('role')
    .eq('id', user!.id)
    .single()

  return <ConversionView isAdmin={account?.role === 'admin'} />
}
