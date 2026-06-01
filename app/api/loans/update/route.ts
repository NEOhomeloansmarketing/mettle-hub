import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Normalise milestone strings coming from BNTouch to our three canonical values
function normaliseMilestone(raw: string): string | null {
  const s = (raw ?? '').toLowerCase().trim()
  if (s.includes('funded') || s.includes('closed') || s.includes('fund'))       return 'funded'
  if (s.includes('process'))                                                      return 'processing'
  if (s.includes('app') || s.includes('new') || s.includes('lead') || s.includes('submitted')) return 'application'
  return null
}

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function POST(req: NextRequest) {
  // Verify webhook secret
  const secret = req.nextUrl.searchParams.get('secret')
  if (!secret || secret !== process.env.LOANS_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const {
    loan_id,
    campaign,
    borrower_name,
    milestone: milestoneRaw,
    loan_amount,
  } = body

  if (!loan_id || !campaign || !milestoneRaw) {
    return NextResponse.json({ error: 'loan_id, campaign, and milestone are required' }, { status: 400 })
  }

  const milestone = normaliseMilestone(String(milestoneRaw))
  if (!milestone) {
    // Unrecognised milestone — ignore silently so Zapier doesn't retry
    return NextResponse.json({ ok: true, skipped: true, reason: `Unrecognised milestone: ${milestoneRaw}` })
  }

  const supabase = serviceClient()

  const { error } = await supabase
    .from('campaign_loans')
    .upsert(
      {
        loan_id:       String(loan_id),
        campaign:      String(campaign),
        borrower_name: borrower_name ? String(borrower_name) : null,
        milestone,
        loan_amount:   loan_amount ? Number(loan_amount) : null,
        updated_at:    new Date().toISOString(),
      },
      { onConflict: 'loan_id' }
    )

  if (error) {
    console.error('[loans/update]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, milestone, loan_id, campaign })
}
