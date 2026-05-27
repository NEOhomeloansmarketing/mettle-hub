import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { BlogView } from '@/components/blog/BlogView'

const VALID_CHANNELS = ['crna', 'entrepreneur', 'physician'] as const
type SlugChannel = typeof VALID_CHANNELS[number]

const SLUG_TO_CHANNEL: Record<SlugChannel, string> = {
  crna: 'CRNA',
  entrepreneur: 'Entrepreneur',
  physician: 'Physician',
}

export default async function BlogChannelPage({
  params,
}: {
  params: Promise<{ channel: string }>
}) {
  const { channel: slug } = await params
  if (!VALID_CHANNELS.includes(slug as SlugChannel)) notFound()

  const channel = SLUG_TO_CHANNEL[slug as SlugChannel]
  const supabase = await createClient()

  const [
    { data: posts },
    { data: allBlogPosts },
    { data: scheduleRows },
  ] = await Promise.all([
    supabase
      .from('blog_posts')
      .select('*')
      .eq('channel', channel)
      .order('created_at', { ascending: false }),
    supabase
      .from('blog_posts')
      .select('channel,status')
      .in('channel', ['CRNA', 'Entrepreneur', 'Physician'])
      .eq('status', 'pending-review'),
    supabase.from('schedule_config').select('*').eq('id', 1).maybeSingle(),
  ])

  const pendingCounts: Record<string, number> = {}
  ;(allBlogPosts ?? []).forEach(p => {
    pendingCounts[p.channel] = (pendingCounts[p.channel] ?? 0) + 1
  })

  return (
    <BlogView
      channel={channel as any}
      initialPosts={posts ?? []}
      allPendingCounts={pendingCounts}
      scheduleConfig={scheduleRows ?? null}
    />
  )
}

export function generateStaticParams() {
  return VALID_CHANNELS.map(channel => ({ channel }))
}
