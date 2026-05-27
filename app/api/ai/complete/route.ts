import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  // Auth gate — only approved users can call AI
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { data: account } = await supabase
    .from('accounts')
    .select('status')
    .eq('id', user.id)
    .single()
  if (!account || account.status !== 'approved') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { system, user: userMsg, maxTokens = 1024 } = body as {
    system?: string
    user: string
    maxTokens?: number
  }

  if (!userMsg) {
    return NextResponse.json({ error: 'user message required' }, { status: 400 })
  }

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: Math.min(maxTokens, 8192),
      system: system ?? 'You are a helpful assistant for a marketing operations team.',
      messages: [{ role: 'user', content: userMsg }],
    })

    const text = msg.content
      .filter(b => b.type === 'text')
      .map(b => (b as { type: 'text'; text: string }).text)
      .join('')

    return NextResponse.json({ text })
  } catch (err: any) {
    console.error('AI complete error:', err)
    return NextResponse.json({ error: err.message ?? 'AI error' }, { status: 500 })
  }
}
