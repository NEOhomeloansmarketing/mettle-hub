'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icon } from '@/components/ui/Icon'
import { CHANNELS } from '@/lib/types'
import { cls } from '@/lib/utils'

const NAV = [
  { id: 'dashboard',  label: 'Dashboard',    icon: 'dashboard', href: '/dashboard' },
  { id: 'tasks',      label: 'Tasks',        icon: 'tasks',     href: '/tasks' },
  { id: 'meetings',   label: 'Meetings',     icon: 'meetings',  href: '/meetings' },
  { id: 'notes',      label: 'Notes',        icon: 'notes',     href: '/notes' },
  { id: 'blog',       label: 'Blog Engine',  icon: 'blog',      href: '/blog' },
  { id: 'paid',       label: 'Paid Ads',     icon: 'chart-bar',  href: '/paid' },
  { id: 'analytics',  label: 'Analytics',    icon: 'chart-line', href: '/analytics' },
  { id: 'leads',      label: 'Lead Report',  icon: 'users',      href: '/leads' },
  { id: 'agents',     label: 'AI Agents',    icon: 'agent',     href: '/agents' },
  { id: 'team',       label: 'Team',         icon: 'team',      href: '/team' },
  { id: 'settings',   label: 'Settings',     icon: 'settings',  href: '/settings' },
]

interface SidebarProps {
  pendingApprovals?: number
  taskCount?: number
  blogPending?: number
}

export function Sidebar({ pendingApprovals = 0, taskCount = 0, blogPending = 0 }: SidebarProps) {
  const pathname = usePathname()

  return (
    <aside className="sidebar">
      <div className="sidebar__top">
        <div className="wordmark">
          <div className="wordmark__mark" aria-hidden="true">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <rect x="3"  y="6" width="3" height="16" fill="currentColor" opacity="0.55"/>
              <rect x="9"  y="2" width="3" height="20" fill="currentColor" opacity="0.80"/>
              <rect x="15" y="6" width="3" height="16" fill="currentColor" opacity="0.55"/>
              <rect x="21" y="9" width="3" height="13" fill="var(--accent)"/>
              <circle cx="22.5" cy="6" r="1.6" fill="var(--accent)"/>
            </svg>
          </div>
          <div className="wordmark__text">
            <div className="wordmark__name">Mettle</div>
            <div className="wordmark__sub">Marketing Hub</div>
          </div>
        </div>
      </div>

      <nav className="sidebar__nav">
        {NAV.map(n => {
          const active = pathname.startsWith('/' + n.id)
          const badge = n.id === 'settings' && pendingApprovals > 0
            ? pendingApprovals
            : n.id === 'tasks' && taskCount > 0
            ? taskCount
            : n.id === 'blog' && blogPending > 0
            ? blogPending
            : 0

          return (
            <Link
              key={n.id}
              href={n.href}
              className={cls('nav-item', active && 'nav-item--active')}
            >
              <Icon name={n.icon} size={16} />
              <span className="nav-item__label">{n.label}</span>
              {badge > 0 && (
                <span className={cls(
                  'nav-item__count',
                  n.id === 'settings' && 'nav-item__count--warn'
                )}>
                  {badge}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      <div className="sidebar__foot">
        <div className="channel-legend">
          <div className="channel-legend__title">Channels</div>
          {['CRNA', 'Entrepreneur', 'Physician'].map(c => (
            <div key={c} className="channel-legend__row">
              <span className="channel-legend__dot" style={{ background: CHANNELS[c].color }} />
              <span>{CHANNELS[c].label}</span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  )
}
