import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('campaign_loans')
    .select('campaign, milestone, funded_date')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Pivot: { [campaign]: { application, processing, funded, funded_this_month } }
  const result: Record<string, { application: number; processing: number; funded: number; funded_this_month: number }> = {}

  const thisMonth = new Date().toISOString().slice(0, 7) // "YYYY-MM"

  for (const row of data ?? []) {
    if (!result[row.campaign]) {
      result[row.campaign] = { application: 0, processing: 0, funded: 0, funded_this_month: 0 }
    }
    const m = row.milestone as 'application' | 'processing' | 'funded'
    if (m in result[row.campaign]) result[row.campaign][m]++
    if (m === 'funded' && row.funded_date?.startsWith(thisMonth)) {
      result[row.campaign].funded_this_month++
    }
  }

  return NextResponse.json({ campaigns: result })
}
