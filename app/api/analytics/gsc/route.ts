import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createClient } from '@/lib/supabase/server'

export const maxDuration = 30

// Set these in Vercel env vars once you run discovery to find the exact URLs.
// Values can be "sc-domain:yourdomain.com" or "https://www.yourdomain.com/"
const SITE_MAP: Record<string, string | undefined> = {
  'Medical Professional': process.env.GSC_SITE_MEDICAL,
  'CRNA':                 process.env.GSC_SITE_CRNA,
  'Entrepreneur':         process.env.GSC_SITE_ENTREPRENEUR,
}

function makeAuth() {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  )
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
  return auth
}

function daysAgoStr(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

const PRESET_DAYS: Record<string, number> = { '7d': 7, '28d': 28, '90d': 90 }

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const discover  = req.nextUrl.searchParams.get('discover') === '1'
  const siteName  = req.nextUrl.searchParams.get('site') ?? ''
  const preset    = req.nextUrl.searchParams.get('preset') ?? '7d'
  const days      = PRESET_DAYS[preset] ?? 7

  const auth = makeAuth()
  const gsc  = google.webmasters({ version: 'v3', auth })

  // ── Discovery mode: list every GSC property the token can see ──────────────
  if (discover) {
    try {
      const res   = await gsc.sites.list()
      const sites = (res.data.siteEntry ?? []).map(s => s.siteUrl ?? '').filter(Boolean)
      return NextResponse.json({ sites })
    } catch (err: any) {
      const scopeNeeded = err.code === 403 || err.message?.includes('403')
      return NextResponse.json({ error: err.message, scopeNeeded }, { status: 403 })
    }
  }

  // ── Not yet configured for this site ────────────────────────────────────────
  if (!siteName) {
    return NextResponse.json({ error: 'site param required' }, { status: 400 })
  }

  const siteUrl = SITE_MAP[siteName]
  if (!siteUrl) {
    return NextResponse.json({ notConfigured: true, siteName })
  }

  const startDate = daysAgoStr(days)
  const endDate   = daysAgoStr(0)

  try {
    const [queriesRes, pagesRes] = await Promise.all([
      gsc.searchanalytics.query({
        siteUrl,
        requestBody: {
          startDate,
          endDate,
          dimensions: ['query'],
          rowLimit: 50,
        },
      }),
      gsc.searchanalytics.query({
        siteUrl,
        requestBody: {
          startDate,
          endDate,
          dimensions: ['page'],
          rowLimit: 15,
        },
      }),
    ])

    const queries = (queriesRes.data.rows ?? [])
      .map((r: any) => ({
        query:       r.keys?.[0] ?? '',
        clicks:      Math.round(r.clicks      ?? 0),
        impressions: Math.round(r.impressions ?? 0),
        ctr:         r.ctr      ?? 0,
        position:    r.position ?? 0,
      }))
      .filter(q => q.position <= 30)

    const pages = (pagesRes.data.rows ?? []).map((r: any) => ({
      page:        r.keys?.[0] ?? '',
      clicks:      Math.round(r.clicks      ?? 0),
      impressions: Math.round(r.impressions ?? 0),
      ctr:         r.ctr      ?? 0,
      position:    r.position ?? 0,
    }))

    const totalImpressions = queries.reduce((s, q) => s + q.impressions, 0)
    const totalClicks      = queries.reduce((s, q) => s + q.clicks,      0)
    const avgPosition      = queries.length
      ? queries.reduce((s, q) => s + q.position, 0) / queries.length
      : 0
    const avgCtr = totalImpressions > 0 ? totalClicks / totalImpressions : 0

    // Near-miss: position 4–20 with meaningful impressions — highest-ROI targets
    const nearMiss = queries
      .filter(q => q.position >= 4 && q.position <= 20 && q.impressions >= 15)
      .sort((a, b) => a.position - b.position)
      .slice(0, 10)

    return NextResponse.json({
      queries,
      pages,
      nearMiss,
      summary: { totalImpressions, totalClicks, avgPosition, avgCtr },
    })
  } catch (err: any) {
    console.error('[gsc]', err.message)
    const scopeNeeded = err.code === 403 || err.message?.includes('403') || err.message?.includes('permission')
    return NextResponse.json({ error: err.message, scopeNeeded }, { status: 500 })
  }
}
