import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const maxDuration = 30

const LEAD_TYPES = [
  'lead',
  'onsite_conversion.lead',
  'offsite_conversion.fb_pixel_lead',
  'onsite_conversion.messaging_conversation_started_7d',
]

function getLeads(actions: { action_type: string; value: string }[] = []): number {
  return actions
    .filter(a => LEAD_TYPES.includes(a.action_type))
    .reduce((sum, a) => sum + parseInt(a.value || '0'), 0)
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const preset = req.nextUrl.searchParams.get('preset') || 'last_30d'
  const token = process.env.META_ACCESS_TOKEN
  const accountId = process.env.META_AD_ACCOUNT_ID

  if (!token || !accountId) {
    return NextResponse.json({ error: 'Meta credentials not configured in environment variables.' }, { status: 500 })
  }

  try {
    const base   = 'https://graph.facebook.com/v21.0'
    const fields = 'spend,impressions,reach,clicks,ctr,cpm,cpc,actions'

    const campaignsRes  = await fetch(`${base}/${accountId}/campaigns?fields=name,effective_status,insights.date_preset(${preset}){${fields}}&access_token=${token}&limit=50`)
    const campaignsData = await campaignsRes.json()

    if (campaignsData.error) throw new Error(campaignsData.error.message)

    const campaigns = (campaignsData.data ?? [])
      .map((c: any) => {
        const ins    = c.insights?.data?.[0] ?? {}
        const cLeads = getLeads(ins.actions)
        const cSpend = parseFloat(ins.spend ?? '0')
        return {
          id:          c.id,
          name:        c.name,
          status:      c.effective_status,
          spend:       cSpend,
          impressions: parseInt(ins.impressions ?? '0'),
          reach:       parseInt(ins.reach       ?? '0'),
          clicks:      parseInt(ins.clicks      ?? '0'),
          ctr:         parseFloat(ins.ctr       ?? '0'),
          cpm:         parseFloat(ins.cpm       ?? '0'),
          cpc:         parseFloat(ins.cpc       ?? '0'),
          leads:       cLeads,
          cpl:         cLeads > 0 ? cSpend / cLeads : 0,
        }
      })
      .filter((c: any) => !c.name.toLowerCase().includes('heloc'))
      .filter((c: any) => c.spend > 0 || c.impressions > 0 || c.status === 'ACTIVE' || c.status === 'IN_PROCESS')
      .sort((a: any, b: any) => b.spend - a.spend)

    // Build overview from filtered campaigns so HELOC is excluded from totals
    const totSpend       = campaigns.reduce((s: number, c: any) => s + c.spend, 0)
    const totImpressions = campaigns.reduce((s: number, c: any) => s + c.impressions, 0)
    const totReach       = campaigns.reduce((s: number, c: any) => s + c.reach, 0)
    const totClicks      = campaigns.reduce((s: number, c: any) => s + c.clicks, 0)
    const totLeads       = campaigns.reduce((s: number, c: any) => s + c.leads, 0)

    const overview = {
      spend:       totSpend,
      impressions: totImpressions,
      reach:       totReach,
      clicks:      totClicks,
      ctr:         totImpressions > 0 ? (totClicks / totImpressions) * 100 : 0,
      cpm:         totImpressions > 0 ? (totSpend / totImpressions) * 1000 : 0,
      cpc:         totClicks > 0 ? totSpend / totClicks : 0,
      leads:       totLeads,
      cpl:         totLeads > 0 ? totSpend / totLeads : 0,
    }

    return NextResponse.json({ overview, campaigns })
  } catch (err: any) {
    console.error('[meta/stats]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
