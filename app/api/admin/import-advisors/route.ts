import { NextRequest, NextResponse } from 'next/server'
import { createClient as serviceClient } from '@supabase/supabase-js'

export const maxDuration = 60

interface AdvisorRow {
  Name: string
  'NMLS #': string
  'Business Name': string
  'Team or Brand Name': string
  'Business Address': string
  'Business Phone Number': string
  'Business Email Address': string
  Title: string
  'Top 5 Markets or areas you serve': string
  'Who you typically serve / the types of clients your market is largely made up of': string
  'Top 3 competitors in your market you typically go up against': string
  'Do you have a micro-website/LinkTree/Lynkspot Site? Webinar Landing Page or any other custom sites? If so, put domains here': string
  'Facebook Page Link': string
  'Instagram Page Link': string
  'X (twitter) Page Link': string
  'Tiktok Page Link': string
  'Google Business Page Link': string
  'Personal Website Link': string
  'Personal Youtube Link': string
  'Zillow Link': string
  'Yelp Link': string
  'Linkedin Link': string
  'ANY OTHER LINKS TO SHARE? ': string
}

interface ImportResult {
  created: number
  updated: number
  errors: number
  total: number
  details: Array<{
    name: string
    nmls?: string
    status: 'created' | 'updated' | 'error'
    message: string
  }>
}

function svc() {
  return serviceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function POST(req: NextRequest) {
  try {
    const { records } = (await req.json()) as { records: AdvisorRow[] }

    if (!Array.isArray(records) || records.length === 0) {
      return NextResponse.json({ error: 'No records provided' }, { status: 400 })
    }

    const db = svc()
    const result: ImportResult = {
      created: 0,
      updated: 0,
      errors: 0,
      total: records.length,
      details: [],
    }

    for (const row of records) {
      try {
        const name = row.Name?.trim()
        const nmls = row['NMLS #']?.trim()
        const email = row['Business Email Address']?.trim()
        const phone = row['Business Phone Number']?.trim()

        if (!name) {
          result.errors++
          result.details.push({
            name: 'Unknown',
            status: 'error',
            message: 'No name provided',
          })
          continue
        }

        // Parse address
        const addressParts = row['Business Address']?.split(',') || []
        const street = addressParts[0]?.trim() || null
        const city = addressParts[1]?.trim() || null
        const stateZip = addressParts[2]?.trim() || ''
        const [state, zip] = stateZip.split(/\s+/).filter(Boolean)

        // Collect channels
        const channels: Array<{
          platform: string
          url: string
          label?: string
        }> = []
        const linkMappings = [
          { url: row['Personal Website Link'], platform: 'website' },
          { url: row['Google Business Page Link'], platform: 'google_business' },
          { url: row['Facebook Page Link'], platform: 'facebook' },
          { url: row['Instagram Page Link'], platform: 'instagram' },
          { url: row['X (twitter) Page Link'], platform: 'twitter' },
          { url: row['Tiktok Page Link'], platform: 'tiktok' },
          { url: row['Zillow Link'], platform: 'zillow' },
          { url: row['Yelp Link'], platform: 'yelp' },
          { url: row['Linkedin Link'], platform: 'linkedin' },
          { url: row['Personal Youtube Link'], platform: 'youtube' },
          {
            url: row[
              'Do you have a micro-website/LinkTree/Lynkspot Site? Webinar Landing Page or any other custom sites? If so, put domains here'
            ],
            platform: 'other',
            label: 'LinkTree/Landing Page',
          },
        ]

        for (const mapping of linkMappings) {
          if (
            mapping.url &&
            mapping.url.trim() &&
            mapping.url.toLowerCase() !== 'no'
          ) {
            channels.push({
              platform: mapping.platform,
              url: mapping.url.trim(),
              label: mapping.label,
            })
          }
        }

        // Check if advisor exists
        const { data: existing } = await db
          .from('advisors')
          .select('id')
          .eq('name', name)
          .eq('nmls_number', nmls)
          .single()

        const metadata: Record<string, string> = {}
        if (row['Team or Brand Name']?.trim()) metadata.team_name = row['Team or Brand Name'].trim()
        if (row['Business Name']?.trim()) metadata.business_name = row['Business Name'].trim()
        if (row['Top 3 competitors in your market you typically go up against']?.trim())
          metadata.competitors = row['Top 3 competitors in your market you typically go up against'].trim()

        const advisorData = {
          name,
          title: row.Title?.trim() || null,
          email: email || null,
          phone: phone || null,
          nmls_number: nmls || null,
          street_address: street || null,
          city: city || null,
          state: state || null,
          zip: zip || null,
          service_area: row['Top 5 Markets or areas you serve']?.trim() || null,
          bio: row['Who you typically serve / the types of clients your market is largely made up of']?.trim() || null,
          metadata: Object.keys(metadata).length > 0 ? metadata : null,
        }

        if (existing) {
          // Update existing
          const { error: updateErr } = await db
            .from('advisors')
            .update(advisorData)
            .eq('id', existing.id)

          if (updateErr) throw updateErr

          // Update channels: delete old, add new
          await db.from('advisor_channels').delete().eq('advisor_id', existing.id)

          if (channels.length > 0) {
            const { error: channelErr } = await db
              .from('advisor_channels')
              .insert(
                channels.map(c => ({
                  advisor_id: existing.id,
                  platform: c.platform,
                  url: c.url,
                  label: c.label || null,
                })),
              )
            if (channelErr) throw channelErr
          }

          result.updated++
          result.details.push({
            name,
            nmls,
            status: 'updated',
            message: `Updated with ${channels.length} channels`,
          })
        } else {
          // Create new
          const { data: newAdvisor, error: createErr } = await db
            .from('advisors')
            .insert([advisorData])
            .select()
            .single()

          if (createErr || !newAdvisor)
            throw createErr || new Error('Failed to create advisor')

          // Add channels
          if (channels.length > 0) {
            const { error: channelErr } = await db
              .from('advisor_channels')
              .insert(
                channels.map(c => ({
                  advisor_id: newAdvisor.id,
                  platform: c.platform,
                  url: c.url,
                  label: c.label || null,
                })),
              )
            if (channelErr) throw channelErr
          }

          result.created++
          result.details.push({
            name,
            nmls,
            status: 'created',
            message: `Created with ${channels.length} channels`,
          })
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        result.errors++
        result.details.push({
          name: row.Name || 'Unknown',
          nmls: row['NMLS #'],
          status: 'error',
          message: errorMsg,
        })
      }
    }

    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Import failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
