import { NextRequest, NextResponse } from 'next/server'
import { createClient as serviceClient } from '@supabase/supabase-js'
import { runVisibilityAudit } from '@/lib/visibility-audit'
import type { Advisor, AdvisorChannel } from '@/lib/types'

// Edge runtime gives us 30s instead of the 10s serverless limit.
// Both GET and POST use the service-role client (no cookies needed here).
export const runtime = 'edge'
export const maxDuration = 60

function svc() {
  return serviceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

interface Ctx { params: Promise<{ id: string }> }

// GET /api/advisors/[id]/audit — list audit history
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const db = svc()
  const { data, error } = await db
    .from('visibility_audits')
    .select('*')
    .eq('advisor_id', id)
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST /api/advisors/[id]/audit — run a new audit
export async function POST(_req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const db = svc()

  // Load advisor + channels
  const { data: advisor, error: aErr } = await db
    .from('advisors')
    .select('*, advisor_channels(*)')
    .eq('id', id)
    .single()

  if (aErr || !advisor) return NextResponse.json({ error: 'Advisor not found' }, { status: 404 })

  // Create a RUNNING audit record
  const { data: auditRow, error: insertErr } = await db
    .from('visibility_audits')
    .insert({ advisor_id: id, status: 'RUNNING' })
    .select()
    .single()

  if (insertErr || !auditRow) {
    return NextResponse.json({ error: 'Failed to create audit record' }, { status: 500 })
  }

  try {
    const result = await runVisibilityAudit(
      advisor as Advisor,
      (advisor.advisor_channels ?? []) as AdvisorChannel[],
    )

    const { error: updateErr } = await db
      .from('visibility_audits')
      .update({
        status: 'COMPLETE',
        score: result.score,
        extracted_nap: result.extractedNap,
        score_breakdown: result.scoreBreakdown,
        action_items: result.actionItems,
        conflicts: result.conflicts,
        socials: result.socials,
        query_visibility: result.queryVisibility,
        raw_result: result,
        completed_at: new Date().toISOString(),
      })
      .eq('id', auditRow.id)

    if (updateErr) throw updateErr

    const { data: final } = await db
      .from('visibility_audits')
      .select('*')
      .eq('id', auditRow.id)
      .single()

    return NextResponse.json(final)
  } catch (err) {
    await db
      .from('visibility_audits')
      .update({ status: 'FAILED' })
      .eq('id', auditRow.id)

    const msg = err instanceof Error ? err.message : 'Audit failed'
    console.error('[audit] Failed:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
