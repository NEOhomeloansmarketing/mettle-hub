'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Icon } from '@/components/ui/Icon'
import { AILoading } from '@/components/ui/AILoading'
import { useToast } from '@/components/ui/Toast'
import { CHANNELS, CHANNEL_BRIEFS } from '@/lib/types'
import type { BlogPost, ScheduleConfig } from '@/lib/types'
import { cls, fmtDateTime } from '@/lib/utils'

const BLOG_CHANNELS = ['CRNA', 'Entrepreneur', 'Physician'] as const
type BlogChannel = typeof BLOG_CHANNELS[number]

const STATUS_INFO: Record<string, { label: string; cls: string }> = {
  'pending-review': { label: 'Pending review', cls: 'pill--pending' },
  'approved': { label: 'Approved', cls: 'pill--approved' },
  'posted': { label: 'Posted', cls: 'pill--posted' },
}

interface BlogViewProps {
  channel: BlogChannel
  initialPosts: BlogPost[]
  allPendingCounts: Record<string, number>
  scheduleConfig: ScheduleConfig | null
}

export function BlogView({ channel, initialPosts, allPendingCounts, scheduleConfig }: BlogViewProps) {
  const router = useRouter()
  const { push: toast } = useToast()
  const supabase = createClient()

  const [posts, setPosts] = useState<BlogPost[]>(initialPosts)
  const [openPostId, setOpenPostId] = useState<string | null>(null)
  const [showPosted, setShowPosted] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [pendingCounts, setPendingCounts] = useState(allPendingCounts)

  useEffect(() => {
    setPosts(initialPosts)
  }, [channel])

  const pending = posts.filter(p => p.status === 'pending-review')
  const approved = posts.filter(p => p.status === 'approved')
  const posted = posts.filter(p => p.status === 'posted')
  const openPost = posts.find(p => p.id === openPostId) ?? null

  async function generateDraft() {
    setGenerating(true)
    try {
      const res = await fetch('/api/blog/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Generation failed')
      const newPost = json.post as BlogPost
      setPosts(prev => [newPost, ...prev])
      setOpenPostId(newPost.id)
      setPendingCounts(prev => ({ ...prev, [channel]: (prev[channel] ?? 0) + 1 }))
      await supabase.from('activity').insert({
        kind: 'ai',
        label: `Drafted ${channel} blog post: ${newPost.title}`,
      })
      toast('Draft created', 'success')
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setGenerating(false)
    }
  }

  async function updatePost(id: string, patch: Partial<BlogPost>) {
    setPosts(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p))
    const { error } = await supabase.from('blog_posts').update(patch).eq('id', id)
    if (error) toast(error.message, 'error')
  }

  async function deletePost(id: string) {
    setPosts(prev => prev.filter(p => p.id !== id))
    setOpenPostId(null)
    const { error } = await supabase.from('blog_posts').delete().eq('id', id)
    if (error) toast(error.message, 'error')
  }

  const channelInfo = CHANNELS[channel]
  const brief = CHANNEL_BRIEFS[channel]

  const nextRunLabel = scheduleConfig
    ? nextTriggerLabel(scheduleConfig)
    : null

  return (
    <div className="page page--blog" style={{ '--ch-color': channelInfo.color } as any}>
      {/* Channel tabs */}
      <div className="blog-head">
        <div className="blog-head__tabs">
          {BLOG_CHANNELS.map(c => {
            const cnt = pendingCounts[c] ?? 0
            const info = CHANNELS[c]
            return (
              <button
                key={c}
                className={cls('blog-tab', channel === c && 'blog-tab--active')}
                onClick={() => router.push(`/blog/${c.toLowerCase()}`)}
                style={channel === c ? { borderBottomColor: info.color, color: 'var(--fg)' } : undefined}
              >
                <span className="blog-tab__dot" style={{ background: info.color }} />
                {info.label}
                {cnt > 0 && <span className="blog-tab__badge">{cnt}</span>}
              </button>
            )
          })}
        </div>
        <div className="blog-head__actions">
          <button className="btn btn--ghost" onClick={generateDraft} disabled={generating}>
            <Icon name="sparkle" size={14} />
            {generating ? 'Generating…' : 'Generate draft'}
          </button>
        </div>
      </div>

      {/* Schedule banner */}
      <div className="sched-banner">
        <div className="sched-banner__left">
          <span className="sched-banner__pulse" data-active="false" />
          <div>
            <div className="sched-banner__title">
              {scheduleConfig?.enabled
                ? `Auto-publish: every ${dayName(scheduleConfig.day_of_week)} at ${hourLabel(scheduleConfig.hour)}`
                : 'Auto-publish is off'}
            </div>
            <div className="sched-banner__sub">
              {scheduleConfig?.enabled && nextRunLabel
                ? `Next run: ${nextRunLabel}`
                : 'Turn it on in Settings → Schedule.'}
            </div>
          </div>
        </div>
      </div>

      {/* Channel brief */}
      {brief && (
        <section className="blog-brief">
          <div className="blog-brief__col">
            <div className="blog-brief__label">Audience</div>
            <div className="blog-brief__text">{brief.audience}</div>
          </div>
          <div className="blog-brief__col">
            <div className="blog-brief__label">Voice</div>
            <div className="blog-brief__text">{brief.voice}</div>
          </div>
          <div className="blog-brief__col">
            <div className="blog-brief__label">Default CTA</div>
            <div className="blog-brief__text">{brief.cta}</div>
          </div>
        </section>
      )}

      {generating && (
        <div className="blog-pending">
          <div className="blog-pending__pulse">
            <Icon name="globe" size={28} />
          </div>
          <div className="blog-pending__title">Drafting this week's {channelInfo.label} post…</div>
          <AILoading label="" />
        </div>
      )}

      {/* Pending review */}
      <div className="blog-section">
        <div className="blog-section__head">
          <h3>Pending review <span style={{ color: 'var(--muted)', fontWeight: 400 }}>· {pending.length}</span></h3>
        </div>
        {pending.length > 0
          ? <ul className="blog-list">{pending.map(p => <BlogListItem key={p.id} post={p} onOpen={() => setOpenPostId(p.id)} />)}</ul>
          : <div className="blog-section__empty">No drafts pending review. {scheduleConfig?.enabled && nextRunLabel && <span>Next scheduled draft: <strong>{nextRunLabel}</strong>.</span>}</div>}
      </div>

      {/* Approved */}
      {approved.length > 0 && (
        <div className="blog-section">
          <div className="blog-section__head">
            <h3>Approved <span style={{ color: 'var(--muted)', fontWeight: 400 }}>· {approved.length}</span></h3>
          </div>
          <ul className="blog-list">{approved.map(p => <BlogListItem key={p.id} post={p} onOpen={() => setOpenPostId(p.id)} />)}</ul>
        </div>
      )}

      {/* Posted */}
      {posted.length > 0 && (
        <div className="blog-section">
          <button
            className="blog-section__archive-toggle"
            onClick={() => setShowPosted(x => !x)}
          >
            <span style={{ display: 'block', transform: showPosted ? 'rotate(0)' : 'rotate(-90deg)', transition: 'transform 0.15s' }}>
              <Icon name="chev-down" size={12} />
            </span>
            <span>Posted</span>
            <span style={{ color: 'var(--muted)' }}>· {posted.length}</span>
          </button>
          {showPosted && (
            <ul className="blog-list">{posted.map(p => <BlogListItem key={p.id} post={p} onOpen={() => setOpenPostId(p.id)} />)}</ul>
          )}
        </div>
      )}

      {posts.length === 0 && !generating && (
        <div className="empty" style={{ marginTop: 40 }}>
          <div className="empty__title">No posts yet</div>
          <div className="empty__body">Generate a draft now, or wait for the next scheduled run.</div>
          <button className="btn btn--primary" onClick={generateDraft}>
            <Icon name="sparkle" size={14} /> Generate draft
          </button>
        </div>
      )}

      {openPost && (
        <PostDetail
          post={openPost}
          channelInfo={channelInfo}
          onClose={() => setOpenPostId(null)}
          onUpdate={patch => updatePost(openPost.id, patch)}
          onDelete={() => deletePost(openPost.id)}
        />
      )}
    </div>
  )
}

// ── BlogListItem ──────────────────────────────────────────────────
function BlogListItem({ post, onOpen }: { post: BlogPost; onOpen: () => void }) {
  const s = STATUS_INFO[post.status] ?? { label: post.status, cls: '' }
  const words = Math.round((post.body ?? '').split(/\s+/).filter(Boolean).length)
  return (
    <li className="blog-list-item" onClick={onOpen}>
      <button
        className="blog-list-item__check"
        onClick={e => { e.stopPropagation(); onOpen() }}
        aria-label="Open post"
      >
        {post.status === 'posted'
          ? <Icon name="check-circle" size={16} />
          : <Icon name="circle" size={16} />}
      </button>
      <div className="blog-list-item__main">
        <div className="blog-list-item__title">{post.title}</div>
        <div className="blog-list-item__meta">
          <span className={cls('pill', s.cls)}>{s.label}</span>
          <span className="dot-sep">·</span>
          <span>{words} words</span>
          <span className="dot-sep">·</span>
          <span>{new Date(post.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
          {post.auto_generated && (
            <><span className="dot-sep">·</span><span><Icon name="sparkle" size={10} /> Auto</span></>
          )}
        </div>
        {post.meta_description && (
          <div className="blog-list-item__preview">{post.meta_description.slice(0, 200)}</div>
        )}
      </div>
      {(post.hashtags ?? []).length > 0 && (
        <div className="blog-list-item__tags">
          {(post.hashtags ?? []).slice(0, 3).map(t => <span key={t} className="kw">{t}</span>)}
        </div>
      )}
    </li>
  )
}

// ── PostDetail ────────────────────────────────────────────────────
function PostDetail({
  post, channelInfo, onClose, onUpdate, onDelete,
}: {
  post: BlogPost
  channelInfo: typeof CHANNELS[string]
  onClose: () => void
  onUpdate: (patch: Partial<BlogPost>) => void
  onDelete: () => void
}) {
  const { push: toast } = useToast()
  const supabase = createClient()
  const [draft, setDraft] = useState(post)
  const [activeTab, setActiveTab] = useState<'body' | 'linkedin' | 'instagram'>('body')

  useEffect(() => setDraft(post), [post.id])

  function commit(patch: Partial<BlogPost>) {
    setDraft(d => ({ ...d, ...patch }))
    onUpdate(patch)
  }

  async function approve() {
    commit({ status: 'approved', approved_at: new Date().toISOString() })
    toast('Approved', 'success')
  }

  async function markPosted() {
    commit({ status: 'posted', posted_at: new Date().toISOString() })
    await supabase.from('activity').insert({
      kind: 'task',
      label: `Posted ${channelInfo.label} blog: ${draft.title}`,
    })
    toast('Marked as posted', 'success')
    onClose()
  }

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text)
    toast(`${label} copied`)
  }

  const s = STATUS_INFO[draft.status] ?? { label: draft.status, cls: '' }
  const words = Math.round((draft.body ?? '').split(/\s+/).filter(Boolean).length)

  const tabContent = {
    body: draft.body ?? '',
    linkedin: draft.linkedin_caption ?? '',
    instagram: draft.instagram_caption ?? '',
  }
  const tabField: Record<string, keyof BlogPost> = {
    body: 'body',
    linkedin: 'linkedin_caption',
    instagram: 'instagram_caption',
  }

  return (
    <div className="post-detail-scrim" onClick={onClose}>
      <div className="post-detail" onClick={e => e.stopPropagation()}>
        <header className="post-detail__head">
          <div className="post-detail__head-l">
            <div className="post-detail__crumb">
              <span
                className="post-detail__channel"
                style={{ background: channelInfo.soft, color: channelInfo.ink }}
              >
                <span style={{ width: 6, height: 6, borderRadius: 2, background: channelInfo.color, display: 'inline-block' }} />
                {channelInfo.label}
              </span>
              <span className={cls('pill', s.cls)}>{s.label}</span>
              {draft.auto_generated && (
                <span className="pill pill--auto"><Icon name="sparkle" size={10} /> Auto-drafted</span>
              )}
              <span style={{ color: 'var(--muted)', fontSize: 11 }}>
                {words} words · {new Date(draft.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>
          <div className="post-detail__actions">
            {draft.status === 'pending-review' && (
              <button className="btn btn--ghost btn--sm" onClick={approve}>
                <Icon name="check" size={13} /> Approve
              </button>
            )}
            {draft.status !== 'posted' && (
              <button className="btn btn--primary btn--sm" onClick={markPosted}>
                <Icon name="check-circle" size={13} /> Mark as posted
              </button>
            )}
            {draft.status === 'posted' && (
              <button className="btn btn--ghost btn--sm" onClick={() => commit({ status: 'pending-review' })}>
                <Icon name="refresh" size={13} /> Move to review
              </button>
            )}
            <button
              className="icon-btn"
              onClick={() => { if (window.confirm('Delete this post?')) onDelete() }}
              title="Delete"
            >
              <Icon name="trash" size={14} />
            </button>
            <button className="icon-btn" onClick={onClose} title="Close">
              <Icon name="x" size={15} />
            </button>
          </div>
        </header>

        <div className="post-detail__body">
          <div className="post-detail__title-row">
            <label className="post-detail__lbl">Title</label>
            <input
              className="post-detail__title"
              value={draft.title}
              onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
              onBlur={e => commit({ title: e.target.value })}
            />
          </div>

          <div className="post-detail__field">
            <label className="post-detail__lbl">Description</label>
            <textarea
              className="input"
              rows={2}
              value={draft.meta_description ?? ''}
              onChange={e => setDraft(d => ({ ...d, meta_description: e.target.value }))}
              onBlur={e => commit({ meta_description: e.target.value })}
              placeholder="SEO meta description, 150–160 characters."
              style={{ resize: 'vertical' }}
            />
            <div className="muted post-detail__counter" style={{ fontSize: 11 }}>
              {(draft.meta_description ?? '').length} / 160
            </div>
          </div>

          <div className="post-detail__field">
            <label className="post-detail__lbl">Keywords</label>
            <KeywordEditor
              value={draft.hashtags ?? []}
              onChange={next => commit({ hashtags: next })}
            />
          </div>

          {draft.trend_note && (
            <div className="post-detail__field">
              <label className="post-detail__lbl">Why this topic</label>
              <div className="post-detail__trendnote">{draft.trend_note}</div>
            </div>
          )}

          <div className="post-detail__tabs">
            {(['body', 'linkedin', 'instagram'] as const).map(t => (
              <button
                key={t}
                className={cls('tab', activeTab === t && 'tab--active')}
                onClick={() => setActiveTab(t)}
              >
                {t === 'body' ? 'Blog post' : t === 'linkedin' ? 'LinkedIn caption' : 'Instagram caption'}
              </button>
            ))}
            <button
              className="link-btn post-detail__tabs-copy"
              onClick={() => copy(
                tabContent[activeTab],
                activeTab === 'body' ? 'Post' : activeTab === 'linkedin' ? 'LinkedIn caption' : 'Instagram caption',
              )}
            >
              <Icon name="copy" size={11} /> Copy
            </button>
          </div>

          <div className="post-detail__editor">
            <textarea
              key={activeTab}
              className={cls('input', activeTab === 'body' && 'post-detail__body-text')}
              rows={activeTab === 'body' ? 22 : 10}
              value={tabContent[activeTab]}
              onChange={e => {
                const field = tabField[activeTab]
                setDraft(d => ({ ...d, [field]: e.target.value }))
              }}
              onBlur={e => {
                const field = tabField[activeTab]
                commit({ [field]: e.target.value } as Partial<BlogPost>)
              }}
              style={{ resize: 'vertical' }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── KeywordEditor ─────────────────────────────────────────────────
function KeywordEditor({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [input, setInput] = useState('')

  function add() {
    const t = input.trim().replace(/^#?/, '#')
    if (!t || t === '#') return
    if (!value.includes(t)) onChange([...value, t])
    setInput('')
  }

  return (
    <div className="kw-editor">
      <div className="kw-row">
        {value.map(kw => (
          <span key={kw} className="kw kw--editable">
            {kw}
            <button onClick={() => onChange(value.filter(x => x !== kw))} aria-label={`Remove ${kw}`}>
              <Icon name="x" size={10} />
            </button>
          </span>
        ))}
        <input
          className="kw-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ',' || e.key === ' ') { e.preventDefault(); add() }
            if (e.key === 'Backspace' && !input && value.length) onChange(value.slice(0, -1))
          }}
          onBlur={add}
          placeholder={value.length ? 'Add another…' : 'mortgage, refinance, …'}
        />
      </div>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────
function dayName(n: number) {
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][n] ?? 'Monday'
}

function hourLabel(h: number) {
  const d = new Date()
  d.setHours(h, 0, 0, 0)
  return d.toLocaleTimeString(undefined, { hour: 'numeric' })
}

function nextTriggerLabel(cfg: ScheduleConfig): string {
  const now = new Date()
  const next = new Date()
  const daysUntil = (cfg.day_of_week - now.getDay() + 7) % 7 || 7
  next.setDate(now.getDate() + daysUntil)
  next.setHours(cfg.hour, 0, 0, 0)
  return next.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) +
    ' at ' + hourLabel(cfg.hour)
}
