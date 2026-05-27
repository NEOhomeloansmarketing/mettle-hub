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

function toDateStr(d: Date) {
  return d.toISOString().split('T')[0]
}

function getPrevRange(preset: string): { since: string; until: string } {
  const days  = preset === 'last_7d' ? 7 : preset === 'last_30d' ? 30 : 90
  const today = new Date()

  const until = new Date(today)
  until.setDate(until.getDate() - days)

  const since = new Date(today)
  since.setDate(since.getDate() - days * 2)

  return { since: toDateStr(since), until: toDateStr(until) }
}

function sumCampaigns(list: any[]) {
  const spend       = list.reduce((s, c) => s + c.spend, 0)
  const impressions = list.reduce((s, c) => s + c.impressions, 0)
  const reach       = list.reduce((s, c) => s + c.reach, 0)
  const clicks      = list.reduce((s, c) => s + c.clicks, 0)
  const leads       = list.reduce((s, c) => s + c.leads, 0)
  return {
    spend,
    impressions,
    reach,
    clicks,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
    cpc: clicks > 0 ? spend / clicks : 0,
    leads,
    cpl: leads > 0 ? spend / leads : 0,
  }
}

function parseCampaigns(data: any[]) {
  return data
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
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const preset    = req.nextUrl.searchParams.get('preset') || 'last_30d'
  const token     = process.env.META_ACCESS_TOKEN
  const accountId = process.env.META_AD_ACCOUNT_ID

  if (!token || !accountId) {
    return NextResponse.json({ error: 'Meta credentials not configured in environment variables.' }, { status: 500 })
  }

  try {
    const base      = 'https://graph.facebook.com/v21.0'
    const fields    = 'spend,impressions,reach,clicks,ctr,cpm,cpc,actions'
    const prevRange = getPrevRange(preset)
    const prevParam = encodeURIComponent(JSON.stringify(prevRange))

    // Fetch current + previous period campaigns in parallel
    const [currRes, prevRes] = await Promise.all([
      fetch(`${base}/${accountId}/campaigns?fields=name,effective_status,insights.date_preset(${preset}){${fields}}&access_token=${token}&limit=50`),
      fetch(`${base}/${accountId}/campaigns?fields=name,effective_status,insights.time_range(${prevParam}){${fields}}&access_token=${token}&limit=50`),
    ])

    const [currData, prevData] = await Promise.all([
      currRes.json(),
      prevRes.json(),
    ])

    if (currData.error) throw new Error(currData.error.message)
    if (prevData.error) throw new Error(prevData.error.message)

    // Current period
    const campaigns = parseCampaigns(currData.data ?? [])
      .filter((c: any) => c.spend > 0 || c.impressions > 0 || c.status === 'ACTIVE' || c.status === 'IN_PROCESS')
      .sort((a: any, b: any) => b.spend - a.spend)

    const overview = sumCampaigns(campaigns)

    // Previous period — same HELOC filter, any spend > 0
    const prevCampaigns = parseCampaigns(prevData.data ?? [])
      .filter((c: any) => c.spend > 0 || c.impressions > 0)

    const prev = sumCampaigns(prevCampaigns)

    return NextResponse.json({ overview, prev, campaigns })
  } catch (err: any) {
    console.error('[meta/stats]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
