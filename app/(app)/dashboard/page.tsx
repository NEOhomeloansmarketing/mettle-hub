import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Icon } from '@/components/ui/Icon'
import { Avatar } from '@/components/ui/Avatar'
import { ChannelChip } from '@/components/ui/ChannelChip'
import { StatusDot } from '@/components/ui/StatusDot'
import { CHANNELS } from '@/lib/types'
import { fmtDate, fmtDateTime, relTime } from '@/lib/utils'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [
    { data: account },
    { data: tasks },
    { data: meetings },
    { data: activity },
    { data: blogPosts },
    { data: team },
  ] = await Promise.all([
    supabase.from('accounts').select('*').eq('id', user!.id).single(),
    supabase.from('tasks').select('*, accounts!tasks_assignee_id_fkey(name,color,initials)')
      .neq('status', 'Done').order('due', { ascending: true }).limit(6),
    supabase.from('meetings').select('*').order('date', { ascending: true }).limit(4),
    supabase.from('activity').select('*').order('ts', { ascending: false }).limit(5),
    supabase.from('blog_posts').select('channel,status').in('channel', ['CRNA','Entrepreneur','Physician']),
    supabase.from('accounts').select('*').eq('status', 'approved'),
  ])

  const now = Date.now()
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const firstName = account?.name?.split(' ')[0] ?? ''

  const openTasks = tasks?.length ?? 0
  const overdueTasks = tasks?.filter(t => t.due && new Date(t.due).getTime() < now).length ?? 0
  const upcomingMeetings = meetings?.filter(m => new Date(m.date).getTime() > now).length ?? 0

  const channelStats = ['CRNA','Entrepreneur','Physician'].map(ch => ({
    ch,
    pending: blogPosts?.filter(p => p.channel === ch && p.status === 'pending-review').length ?? 0,
    posted: blogPosts?.filter(p => p.channel === ch && p.status === 'posted').length ?? 0,
  }))

  const teamMap = Object.fromEntries((team ?? []).map(a => [a.id, a]))

  return (
    <div className="page page--dashboard">
      <div className="page__head">
        <div>
          <div className="page__kicker">{greeting}</div>
          <h1 className="page__title">{firstName ? `${greeting}, ${firstName}.` : greeting + '.'}</h1>
          <p className="page__sub">Here&apos;s what&apos;s happening across your channels today.</p>
        </div>
      </div>

      <div className="kpis">
        <div className="kpi">
          <div className="kpi__k">Open tasks</div>
          <div className="kpi__v">{openTasks}</div>
          <div className="kpi__sub">across all channels</div>
        </div>
        <div className="kpi">
          <div className="kpi__k">Pending review</div>
          <div className="kpi__v">{blogPosts?.filter(p => p.status === 'pending-review').length ?? 0}</div>
          <div className="kpi__sub">blog drafts awaiting approval</div>
        </div>
        <div className="kpi">
          <div className="kpi__k">Overdue</div>
          <div className="kpi__v" style={{ color: overdueTasks > 0 ? 'oklch(0.78 0.13 22)' : undefined }}>{overdueTasks}</div>
          <div className="kpi__sub">tasks past due date</div>
        </div>
        <div className="kpi">
          <div className="kpi__k">Upcoming meetings</div>
          <div className="kpi__v">{upcomingMeetings}</div>
          <div className="kpi__sub">scheduled ahead</div>
        </div>
      </div>

      <div className="dash-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Your tasks */}
          <div className="card">
            <div className="card__head">
              <h3>Your tasks</h3>
              <Link href="/tasks" className="link-btn">View all <Icon name="arrow-r" size={12} /></Link>
            </div>
            {!tasks?.length ? (
              <div className="empty">
                <div className="empty__title">No open tasks</div>
                <div className="empty__body">You&apos;re all caught up.</div>
              </div>
            ) : (
              <ul className="task-list">
                {tasks.map(t => {
                  const assignee = t.accounts as any
                  const isLate = t.due && new Date(t.due).getTime() < now
                  return (
                    <li key={t.id}>
                      <Link href={`/tasks/${t.id}`} className="task-row">
                        <StatusDot status={t.status as any} />
                        <div className="task-row__main">
                          <div className="task-row__title">{t.title}</div>
                          <div className="task-row__meta">
                            <ChannelChip channel={t.channel} size="sm" />
                            {t.due && (
                              <>
                                <span className="dot-sep">·</span>
                                <span className={`task-row__due${isLate ? ' task-row__due--late' : ''}`}>
                                  <Icon name="calendar" size={11} />
                                  {fmtDate(t.due)}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        {assignee && (
                          <div className="task-row__assignee">
                            <Avatar user={assignee} size={20} />
                            <span>{assignee.name.split(' ')[0]}</span>
                          </div>
                        )}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {/* Channel content status */}
          <div className="card">
            <div className="card__head">
              <h3>Channel content status</h3>
              <Link href="/blog" className="link-btn">Blog Engine <Icon name="arrow-r" size={12} /></Link>
            </div>
            <div className="ch-status-grid">
              {channelStats.map(({ ch, pending, posted }) => (
                <div key={ch} className="ch-status" style={{ borderLeftColor: CHANNELS[ch].color }}>
                  <div className="ch-status__head">
                    <span className="ch-status__name">{ch} Home Loans</span>
                    {pending > 0 && (
                      <span className="ch-status__badge pill--pending">{pending} pending</span>
                    )}
                  </div>
                  <div className="ch-status__num">{posted}</div>
                  <div className="ch-status__lbl">posts published</div>
                  <Link href={`/blog/${ch.toLowerCase()}`} className="ch-status__cta">
                    View posts <Icon name="arrow-r" size={12} />
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Upcoming meetings */}
          <div className="card">
            <div className="card__head">
              <h3>Upcoming meetings</h3>
              <Link href="/meetings" className="link-btn">View all <Icon name="arrow-r" size={12} /></Link>
            </div>
            {!meetings?.length ? (
              <div className="empty">
                <div className="empty__title">No meetings</div>
              </div>
            ) : (
              <ul className="mtg-list">
                {meetings.map(m => {
                  const d = new Date(m.date)
                  return (
                    <li key={m.id}>
                      <Link href={`/meetings/${m.id}`} className="mtg-row">
                        <div className="mtg-row__date">
                          <div className="mtg-row__day">{d.getDate()}</div>
                          <div className="mtg-row__mon">{d.toLocaleDateString(undefined, { month: 'short' })}</div>
                        </div>
                        <div className="mtg-row__main">
                          <div className="mtg-row__title">{m.title}</div>
                          <div className="mtg-row__sub">{fmtDateTime(m.date)}</div>
                        </div>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {/* Recent AI activity */}
          <div className="card">
            <div className="card__head"><h3>Recent AI activity</h3></div>
            {!activity?.length ? (
              <div className="empty">
                <div className="empty__title">No activity yet</div>
              </div>
            ) : (
              <ul className="activity">
                {activity.map(a => (
                  <li key={a.id} className="activity__row">
                    <span className={`activity__kind activity__kind--${a.kind}`}>
                      <Icon name={a.kind === 'ai' ? 'sparkle' : a.kind === 'task' ? 'tasks' : 'lightning'} size={12} />
                    </span>
                    <span className="activity__label">{a.label}</span>
                    <span className="activity__time">{relTime(a.ts)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
