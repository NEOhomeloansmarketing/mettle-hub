'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { Avatar } from '@/components/ui/Avatar'
import { createClient } from '@/lib/supabase/client'
import type { Account } from '@/lib/types'
import { cls } from '@/lib/utils'

const TITLE_MAP: Record<string, string> = {
  dashboard: 'Dashboard', tasks: 'Tasks', meetings: 'Meetings',
  notes: 'Notes', blog: 'Blog Engine', team: 'Team', settings: 'Settings',
}

interface TopBarProps {
  account: Account
}

export function TopBar({ account }: TopBarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [createOpen, setCreateOpen] = useState(false)
  const [userOpen, setUserOpen] = useState(false)

  const segment = pathname.split('/')[1] || 'dashboard'
  const title = TITLE_MAP[segment] || segment

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <header className="topbar">
      <div className="topbar__crumb">
        <span className="topbar__crumb-pill">Workspace</span>
        <Icon name="chevron" size={12} />
        <span className="topbar__crumb-current">{title}</span>
      </div>

      <div className="topbar__right">
        <div className="topbar__search">
          <Icon name="search" size={14} />
          <span>Search workspace</span>
          <kbd>⌘K</kbd>
        </div>

        <div className="topbar__create">
          <button
            className={cls('btn', 'btn--primary')}
            onClick={() => setCreateOpen(x => !x)}
          >
            <Icon name="plus" size={14} />
            Create
          </button>
          {createOpen && (
            <div className="popover" onMouseLeave={() => setCreateOpen(false)}>
              <button className="popover__item" onClick={() => { setCreateOpen(false); router.push('/tasks') }}>
                <Icon name="tasks" size={14} /> New task
              </button>
              <button className="popover__item" onClick={() => { setCreateOpen(false); router.push('/meetings') }}>
                <Icon name="meetings" size={14} /> New meeting
              </button>
              <button className="popover__item" onClick={() => { setCreateOpen(false); router.push('/blog') }}>
                <Icon name="sparkle" size={14} /> Open Blog Engine
              </button>
            </div>
          )}
        </div>

        <div className="topbar__user">
          <button className="user-chip" onClick={() => setUserOpen(x => !x)}>
            <Avatar user={account} size={28} />
            <span className="user-chip__text">
              <span className="user-chip__name">{account.name.split(' ')[0]}</span>
              <span className="user-chip__role">{account.role === 'admin' ? 'Admin' : 'Team Member'}</span>
            </span>
          </button>
          {userOpen && (
            <div className="popover" onClick={() => setUserOpen(false)}>
              <div className="popover__head">{account.email}</div>
              <button className="popover__item" onClick={signOut}>
                <Icon name="arrow-r" size={14} /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
