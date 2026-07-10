import { NextRequest, NextResponse } from 'next/server'
import postgres from 'postgres'

export async function POST(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret')
  if (secret !== process.env.MIGRATE_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const dbUrl = process.env.SUPABASE_DB_URL
  if (!dbUrl) return NextResponse.json({ error: 'SUPABASE_DB_URL not set' }, { status: 500 })

  const sql = postgres(dbUrl, { ssl: 'require', max: 1 })

  try {
    await sql`
      create table if not exists advisors (
        id              uuid primary key default gen_random_uuid(),
        name            text not null,
        title           text,
        email           text,
        phone           text,
        nmls_number     text,
        street_address  text,
        city            text,
        state           text,
        zip             text,
        service_area    text,
        bio             text,
        headshot_url    text,
        nap_form_url    text,
        metadata        jsonb,
        created_at      timestamptz not null default now(),
        updated_at      timestamptz not null default now()
      )
    `

    await sql`
      create table if not exists advisor_channels (
        id          uuid primary key default gen_random_uuid(),
        advisor_id  uuid not null references advisors(id) on delete cascade,
        platform    text not null,
        label       text,
        url         text not null,
        created_at  timestamptz not null default now()
      )
    `

    await sql`
      create table if not exists visibility_audits (
        id               uuid primary key default gen_random_uuid(),
        advisor_id       uuid not null references advisors(id) on delete cascade,
        status           text not null default 'PENDING',
        score            int,
        extracted_nap    jsonb,
        score_breakdown  jsonb,
        action_items     jsonb,
        conflicts        jsonb,
        socials          jsonb,
        query_visibility jsonb,
        raw_result       jsonb,
        created_at       timestamptz not null default now(),
        completed_at     timestamptz
      )
    `

    await sql`create index if not exists advisor_channels_advisor_id_idx on advisor_channels(advisor_id)`
    await sql`create index if not exists visibility_audits_advisor_id_idx on visibility_audits(advisor_id)`
    await sql`create index if not exists visibility_audits_created_at_idx on visibility_audits(advisor_id, created_at desc)`

    await sql`
      create or replace function update_updated_at_column()
      returns trigger language plpgsql as $$
      begin new.updated_at = now(); return new; end;
      $$
    `
    await sql`drop trigger if exists advisors_updated_at on advisors`
    await sql`
      create trigger advisors_updated_at
        before update on advisors
        for each row execute function update_updated_at_column()
    `

    await sql`alter table advisors enable row level security`
    await sql`alter table advisor_channels enable row level security`
    await sql`alter table visibility_audits enable row level security`

    for (const stmt of [
      `drop policy if exists "Authenticated read advisors" on advisors`,
      `drop policy if exists "Authenticated read channels" on advisor_channels`,
      `drop policy if exists "Authenticated read audits" on visibility_audits`,
      `create policy "Authenticated read advisors" on advisors for select using (auth.role() = 'authenticated')`,
      `create policy "Authenticated read channels" on advisor_channels for select using (auth.role() = 'authenticated')`,
      `create policy "Authenticated read audits" on visibility_audits for select using (auth.role() = 'authenticated')`,
    ]) { await sql.unsafe(stmt) }

    // Seed advisors (skip if already exist)
    const existing = await sql`select count(*) as n from advisors`
    let seeded = 0
    if (Number(existing[0].n) === 0) {
      await sql`
        insert into advisors (name, title, email, phone, nmls_number) values
          ('Justin Padron',        'Branch Leader / Mortgage Advisor',       'Justin.Padron@neohomeloans.com',   '817-504-8373', null),
          ('Scott DiGregorio',     'Branch Leader / Mortgage Advisor',       'scott@teamfq.com',                 '239-887-0088', null),
          ('Josh Mettle',          'Division President / Branch Leader',     'josh.mettle@neohomeloans.com',     '801-699-4287', '2677444'),
          ('Anthony Alfonso-Soto', 'Mortgage Advisor',                       'anthony@teamfq.com',               '702-675-0487', null),
          ('Ashley Roberts',       'Mortgage Advisor',                       'ashley.roberts@neohomeloans.com',  '512-963-9929', null),
          ('Ben Kyle',             'Mortgage Advisor',                       'ben.kyle@neohomeloans.com',        '415-341-3393', null),
          ('Bryon Wensel',         'Mortgage Advisor',                       'bryon.wensel@neohomeloans.com',    '801-703-4677', null),
          ('David Nelson',         'Mortgage Advisor',                       'david.nelson@neohomeloans.com',    '801-699-9148', null),
          ('Drake Bloebaum',       'Mortgage Advisor',                       'drake.bloebaum@neohomeloans.com',  '801-633-1167', null),
          ('Edgardo Ballentine',   'Mortgage Advisor',                       'edgardo@teamfq.com',               '239-244-5871', null),
          ('Kaytlin Collins',      'Mortgage Advisor',                       'kaytlin.collins@neohomeloans.com', '936-827-9717', null),
          ('Matt McNally',         'Mortgage Advisor (Part Time)',            'matthew.mcnally@neohomeloans.com', '801-386-6418', null),
          ('Matt Smith',           'Mortgage Advisor',                       'matt.smith@neohomeloans.com',      '801-815-7077', null),
          ('Scott Breen',          'Mortgage Advisor',                       'scott.breen@neohomeloans.com',     '801-558-5817', null),
          ('Mike Jones',           'Mortgage Advisor',                       'mike.jones@neohomeloans.com',      '801-403-3190', null),
          ('Ross Zimmerman',       'Mortgage Advisor',                       'rossz@neohomeloans.com',           '801-502-3947', null),
          ('Skyler Ford',          'Mortgage Advisor',                       'skyler.ford@neohomeloans.com',     '385-377-7550', null),
          ('Aaron Thomas',         'Mortgage Advisor / Branch Leader',       'aaron.thomas@neohomeloans.com',    '830-613-7337', null),
          ('Greg Allen',           'Mortgage Advisor / Branch Leader',       'greg.allen@neohomeloans.com',      '937-620-0271', null),
          ('Jason Drobeck',        'Mortgage Advisor / Branch Leader',       'jason.drobeck@neohomeloans.com',   '720-436-3356', null),
          ('Katrinka Condie',      'Mortgage Advisor / Branch Leader',       'katrinka@teamkatrinka.com',        '801-995-2206', null)
      `
      seeded = 21
    }

    await sql.end()
    return NextResponse.json({ ok: true, tablesCreated: true, advisorsSeeded: seeded })
  } catch (err) {
    await sql.end().catch(() => {})
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
