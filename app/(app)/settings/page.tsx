import { createClient } from '@/lib/supabase/server'
import { SettingsView } from '@/components/settings/SettingsView'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [
    { data: account },
    { data: pendingAccounts },
    { data: allAccounts },
    { data: brandDocs },
    { data: scheduleRow },
  ] = await Promise.all([
    supabase.from('accounts').select('*').eq('id', user!.id).single(),
    supabase.from('accounts').select('*').eq('status', 'pending'),
    supabase.from('accounts').select('*').eq('status', 'approved'),
    supabase.from('brand_docs').select('*'),
    supabase.from('schedule_config').select('*').eq('id', 1).maybeSingle(),
  ])

  return (
    <SettingsView
      account={account!}
      pendingAccounts={pendingAccounts ?? []}
      approvedAccounts={allAccounts ?? []}
      brandDocs={brandDocs ?? []}
      scheduleConfig={scheduleRow ?? null}
    />
  )
}
