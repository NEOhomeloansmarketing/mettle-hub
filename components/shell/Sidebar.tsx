'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icon } from '@/components/ui/Icon'
import { CHANNELS } from '@/lib/types'
import { cls } from '@/lib/utils'

const NAV_SECTIONS = [
  {
    section: null,
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', href: '/dashboard' },
    ],
  },
  {
    section: 'Workspace',
    items: [
      { id: 'tasks',    label: 'Tasks',    icon: 'tasks',    href: '/tasks' },
      { id: 'meetings', label: 'Meetings', icon: 'meetings', href: '/meetings' },
      { id: 'notes',    label: 'Notes',    icon: 'notes',    href: '/notes' },
    ],
  },
  {
    section: 'Marketing',
    items: [
      { id: 'blog',      label: 'Blog Engine', icon: 'blog',       href: '/blog'      },
      { id: 'paid',      label: 'Paid Ads',    icon: 'chart-bar',  href: '/paid'      },
      { id: 'analytics', label: 'Analytics',   icon: 'chart-line', href: '/analytics' },
      { id: 'leads',     label: 'Lead Report', icon: 'users',      href: '/leads'     },
    ],
  },
  {
    section: 'Intelligence',
    items: [
      { id: 'agents', label: 'AI Agents', icon: 'agent', href: '/agents' },
    ],
  },
]

const BOTTOM_NAV = [
  { id: 'team',     label: 'Team',     icon: 'team',     href: '/team'     },
  { id: 'settings', label: 'Settings', icon: 'settings', href: '/settings' },
]

interface SidebarProps {
  pendingApprovals?: number
  taskCount?: number
  blogPending?: number
}

export function Sidebar({ pendingApprovals = 0, taskCount = 0, blogPending = 0 }: SidebarProps) {
  const pathname = usePathname()

  function badge(id: string) {
    if (id === 'settings' && pendingApprovals > 0) return pendingApprovals
    if (id === 'tasks'    && taskCount > 0)        return taskCount
    if (id === 'blog'     && blogPending > 0)       return blogPending
    return 0
  }

  function NavLink({ id, label, icon, href }: { id: string; label: string; icon: string; href: string }) {
    const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
    const b = badge(id)
    return (
      <Link href={href} className={cls('nav-item', active && 'nav-item--active')}>
        <span className="nav-item__icon"><Icon name={icon} size={15} /></span>
        <span className="nav-item__label">{label}</span>
        {b > 0 && (
          <span className={cls('nav-item__count', id === 'settings' && 'nav-item__count--warn')}>
            {b}
          </span>
        )}
      </Link>
    )
  }

  return (
    <aside className="sidebar">

      {/* Wordmark */}
      <div className="sidebar__top">
        <div className="wordmark">
          <Image
            src="/ninja-logo.png"
            alt="Mettle Ninja"
            width={48}
            height={32}
            className="wordmark__ninja"
            priority
          />
          <div className="wordmark__text">
            <div className="wordmark__name">Mettle</div>
            <div className="wordmark__sub">Marketing Hub</div>
          </div>
        </div>
      </div>

      {/* Main nav */}
      <nav className="sidebar__nav">
        {NAV_SECTIONS.map((sec, si) => (
          <div key={si} className="nav-section">
            {sec.section && (
              <div className="nav-section__label">{sec.section}</div>
            )}
            {sec.items.map(n => <NavLink key={n.id} {...n} />)}
          </div>
        ))}
      </nav>

      {/* Bottom: Team + Settings */}
      <div className="sidebar__foot">
        <div className="nav-divider" />
        <div className="nav-section">
          {BOTTOM_NAV.map(n => <NavLink key={n.id} {...n} />)}
        </div>

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
