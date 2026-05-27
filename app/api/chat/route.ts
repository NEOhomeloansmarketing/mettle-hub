import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: account } = await supabase.from('accounts').select('status').eq('id', user.id).single()
  if (!account || account.status !== 'approved') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { messages } = await req.json() as { messages: { role: 'user' | 'assistant'; content: string }[] }
  if (!messages?.length) return NextResponse.json({ error: 'Messages required' }, { status: 400 })

  // Load all brand docs
  const { data: docs } = await supabase.from('brand_docs').select('*')
  const docMap = Object.fromEntries((docs ?? []).map(d => [d.id, d.content]))

  const crna         = docMap['crna'] ?? ''
  const entrepreneur = docMap['entrepreneur'] ?? ''
  const physician    = docMap['physician'] ?? ''
  const laws         = docMap['lawsofmarketing'] ?? ''

  const system = `You are the NEO Home Loans marketing AI assistant — an expert on brand voice, mortgage marketing strategy, content creation, and the three loan channels: CRNA Home Loans, Entrepreneur Home Loans, and Physician Home Loans.

You have deep knowledge of:
- The audiences, pain points, emotional journeys, and messaging for each channel
- Neo Home Loans' brand voice, positioning, and competitive advantages
- Content strategy, copywriting, social media, SEO, and marketing best practices
- The Five Laws of Marketing strategic framework

You give direct, actionable answers. You never make up specific rate or APR numbers. When writing copy or content, you always match the brand voice for the relevant channel.

${crna ? `CRNA HOME LOANS ROSETTA STONE:\n${crna.slice(0, 3000)}\n` : ''}
${entrepreneur ? `ENTREPRENEUR HOME LOANS ROSETTA STONE:\n${entrepreneur.slice(0, 3000)}\n` : ''}
${physician ? `PHYSICIAN HOME LOANS ROSETTA STONE:\n${physician.slice(0, 3000)}\n` : ''}
${laws ? `FIVE LAWS OF MARKETING:\n${laws.slice(0, 4000)}\n` : ''}`

  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    system,
    messages,
  })

  const text = msg.content.filter(b => b.type === 'text').map(b => (b as any).text).join('')
  return NextResponse.json({ text })
}
