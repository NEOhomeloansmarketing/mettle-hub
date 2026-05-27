-- ================================================================
-- Lead tracking — storage-efficient weekly tallies
-- ================================================================

-- Weekly totals per source channel
create table if not exists lead_weekly_totals (
  id             uuid primary key default gen_random_uuid(),
  week_start     date not null,
  source_channel text not null,
  count          integer not null default 0,
  created_at     timestamptz not null default now(),
  unique(week_start, source_channel)
);

-- BNTouch source string → display channel name
create table if not exists lead_source_mappings (
  id              uuid primary key default gen_random_uuid(),
  bntouch_source  text not null unique,
  display_channel text not null,
  created_at      timestamptz not null default now()
);

-- Unmapped sources that arrived via webhook — admin assigns them
create table if not exists lead_source_queue (
  id             uuid primary key default gen_random_uuid(),
  bntouch_source text not null unique,
  sample_count   integer not null default 1,
  first_seen     timestamptz not null default now()
);

-- Atomic increment function (avoids race conditions)
create or replace function increment_lead_count(p_week_start date, p_channel text)
returns void language plpgsql security definer as $$
begin
  insert into lead_weekly_totals (week_start, source_channel, count)
  values (p_week_start, p_channel, 1)
  on conflict (week_start, source_channel)
  do update set count = lead_weekly_totals.count + 1;
end;
$$;

-- Increment unmapped source sample count
create or replace function increment_source_queue_count(p_source text)
returns void language plpgsql security definer as $$
begin
  insert into lead_source_queue (bntouch_source, sample_count)
  values (p_source, 1)
  on conflict (bntouch_source)
  do update set sample_count = lead_source_queue.sample_count + 1;
end;
$$;

-- RLS
alter table lead_weekly_totals   enable row level security;
alter table lead_source_mappings enable row level security;
alter table lead_source_queue    enable row level security;

create policy "approved read"  on lead_weekly_totals   for select using (is_approved());
create policy "approved write" on lead_weekly_totals   for all    using (is_approved());
create policy "approved read"  on lead_source_mappings for select using (is_approved());
create policy "approved write" on lead_source_mappings for all    using (is_approved());
create policy "approved read"  on lead_source_queue    for select using (is_approved());
create policy "approved write" on lead_source_queue    for all    using (is_approved());

-- Seed known source mappings
-- Keyword matching handles most sources automatically in the webhook.
-- These exact mappings are kept as fallbacks / user-assigned overrides.
insert into lead_source_mappings (bntouch_source, display_channel) values
  ('NEOxBETR',         'Better Leads'),
  ('Past Client',      'Past Client / Referral'),
  ('Partner Referral', 'Past Client / Referral')
on conflict (bntouch_source) do nothing;
