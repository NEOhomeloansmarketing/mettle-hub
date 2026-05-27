import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/shell/Sidebar'
import { TopBar } from '@/components/shell/TopBar'
import { ToastProvider } from '@/components/ui/Toast'
import { ChatPopup } from '@/components/chat/ChatPopup'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: account } = await supabase
    .from('accounts')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!account || account.status !== 'approved') redirect('/login')

  // Sidebar badge counts
  const [{ count: pendingApprovals }, { count: blogPending }] = await Promise.all([
    account.role === 'admin'
      ? supabase.from('accounts').select('*', { count: 'exact', head: true }).eq('status', 'pending')
      : Promise.resolve({ count: 0 }),
    supabase.from('blog_posts').select('*', { count: 'exact', head: true }).eq('status', 'pending-review'),
  ])

  return (
    <ToastProvider>
      <div className="app">
        <Sidebar
          pendingApprovals={pendingApprovals ?? 0}
          blogPending={blogPending ?? 0}
        />
        <div className="app__main">
          <TopBar account={account} />
          <div className="app__view">
            {children}
          </div>
        </div>
      </div>
      <ChatPopup />
    </ToastProvider>
  )
}
