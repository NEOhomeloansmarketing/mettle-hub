import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createClient } from '@/lib/supabase/server'

export const maxDuration = 30

const SITES = [
  { id: '450714709', name: 'Medical Professional' },
  { id: '450658822', name: 'CRNA' },
  { id: '493242821', name: 'Entrepreneur' },
]

const DATE_RANGES = {
  '7d':  { start: '7daysAgo',   end: 'today', prevStart: '14daysAgo',  prevEnd: '8daysAgo'   },
  '28d': { start: '28daysAgo',  end: 'today', prevStart: '56daysAgo',  prevEnd: '29daysAgo'  },
  '90d': { start: '90daysAgo',  end: 'today', prevStart: '180daysAgo', prevEnd: '91daysAgo'  },
} as const

function makeAuth() {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  )
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
  return auth
}

const MAIN_METRICS = [
  { name: 'sessions' },
  { name: 'activeUsers' },
  { name: 'screenPageViews' },
  { name: 'bounceRate' },
  { name: 'averageSessionDuration' },
  { name: 'engagementRate' },
  { name: 'newUsers' },
]

function parseMetrics(row: any) {
  const v = (row?.metricValues ?? []).map((m: any) => m?.value ?? '0')
  return {
    sessions:       parseInt(v[0]  ?? '0'),
    users:          parseInt(v[1]  ?? '0'),
    pageviews:      parseInt(v[2]  ?? '0'),
    bounceRate:     parseFloat(v[3] ?? '0'),
    avgDuration:    parseFloat(v[4] ?? '0'),
    engagementRate: parseFloat(v[5] ?? '0'),
    newUsers:       parseInt(v[6]  ?? '0'),
  }
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const presetParam = req.nextUrl.searchParams.get('preset') ?? '7d'
  const preset = presetParam in DATE_RANGES ? presetParam as keyof typeof DATE_RANGES : '7d'
  const range = DATE_RANGES[preset]

  const auth = makeAuth()
  const api  = google.analyticsdata({ version: 'v1beta', auth })

  const results = await Promise.all(
    SITES.map(async site => {
      try {
        const prop = `properties/${site.id}`

        const [
          currRes, prevRes, srcRes,
          landingRes, deviceRes, newReturnRes, topPagesRes,
        ] = await Promise.all([

          // Current period — overall metrics
          api.properties.runReport({
            property: prop,
            requestBody: {
              dateRanges: [{ startDate: range.start, endDate: range.end }],
              metrics: MAIN_METRICS,
            },
          }),

          // Previous period — overall metrics
          api.properties.runReport({
            property: prop,
            requestBody: {
              dateRanges: [{ startDate: range.prevStart, endDate: range.prevEnd }],
              metrics: MAIN_METRICS,
            },
          }),

          // Traffic by channel group
          api.properties.runReport({
            property: prop,
            requestBody: {
              dateRanges: [{ startDate: range.start, endDate: range.end }],
              dimensions: [{ name: 'sessionDefaultChannelGroup' }],
              metrics: [{ name: 'sessions' }],
              orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
              limit: '8',
            },
          }),

          // Top landing pages
          api.properties.runReport({
            property: prop,
            requestBody: {
              dateRanges: [{ startDate: range.start, endDate: range.end }],
              dimensions: [{ name: 'landingPage' }],
              metrics: [
                { name: 'sessions' },
                { name: 'bounceRate' },
                { name: 'averageSessionDuration' },
                { name: 'engagementRate' },
              ],
              orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
              limit: '8',
            },
          }),

          // Device category breakdown
          api.properties.runReport({
            property: prop,
            requestBody: {
              dateRanges: [{ startDate: range.start, endDate: range.end }],
              dimensions: [{ name: 'deviceCategory' }],
              metrics: [{ name: 'sessions' }, { name: 'engagementRate' }],
              orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
            },
          }),

          // New vs returning
          api.properties.runReport({
            property: prop,
            requestBody: {
              dateRanges: [{ startDate: range.start, endDate: range.end }],
              dimensions: [{ name: 'newVsReturning' }],
              metrics: [{ name: 'sessions' }, { name: 'engagementRate' }],
              orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
            },
          }),

          // Top content pages by views
          api.properties.runReport({
            property: prop,
            requestBody: {
              dateRanges: [{ startDate: range.start, endDate: range.end }],
              dimensions: [{ name: 'pageTitle' }],
              metrics: [
                { name: 'screenPageViews' },
                { name: 'averageSessionDuration' },
                { name: 'engagementRate' },
              ],
              orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
              limit: '8',
            },
          }),
        ])

        const current = parseMetrics(currRes.data.rows?.[0])
        const prev    = parseMetrics(prevRes.data.rows?.[0])

        const sources = (srcRes.data.rows ?? []).map((r: any) => ({
          channel:  r.dimensionValues?.[0]?.value ?? 'Unknown',
          sessions: parseInt(r.metricValues?.[0]?.value ?? '0'),
        }))

        const landingPages = (landingRes.data.rows ?? []).map((r: any) => ({
          path:           r.dimensionValues?.[0]?.value ?? '/',
          sessions:       parseInt(r.metricValues?.[0]?.value ?? '0'),
          bounceRate:     parseFloat(r.metricValues?.[1]?.value ?? '0'),
          avgDuration:    parseFloat(r.metricValues?.[2]?.value ?? '0'),
          engagementRate: parseFloat(r.metricValues?.[3]?.value ?? '0'),
        }))

        const devices = (deviceRes.data.rows ?? []).map((r: any) => ({
          device:         r.dimensionValues?.[0]?.value ?? 'unknown',
          sessions:       parseInt(r.metricValues?.[0]?.value ?? '0'),
          engagementRate: parseFloat(r.metricValues?.[1]?.value ?? '0'),
        }))

        const newVsReturning = (newReturnRes.data.rows ?? []).map((r: any) => ({
          type:           r.dimensionValues?.[0]?.value ?? 'unknown',
          sessions:       parseInt(r.metricValues?.[0]?.value ?? '0'),
          engagementRate: parseFloat(r.metricValues?.[1]?.value ?? '0'),
        }))

        const topPages = (topPagesRes.data.rows ?? []).map((r: any) => ({
          title:          r.dimensionValues?.[0]?.value ?? 'Unknown',
          views:          parseInt(r.metricValues?.[0]?.value ?? '0'),
          avgDuration:    parseFloat(r.metricValues?.[1]?.value ?? '0'),
          engagementRate: parseFloat(r.metricValues?.[2]?.value ?? '0'),
        }))

        return {
          id: site.id, name: site.name,
          current, prev,
          sources, landingPages, devices, newVsReturning, topPages,
          error: null,
        }
      } catch (err: any) {
        console.error(`[analytics/${site.name}]`, err.message)
        return {
          id: site.id, name: site.name,
          current: null, prev: null,
          sources: [], landingPages: [], devices: [], newVsReturning: [], topPages: [],
          error: err.message,
        }
      }
    })
  )

  return NextResponse.json({ sites: results, preset })
}
