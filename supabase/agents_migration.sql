-- Run in Supabase SQL Editor after initial migration

create table if not exists agents (
  id               uuid primary key default gen_random_uuid(),
  name             text not null default 'New Agent',
  description      text not null default '',
  system_prompt    text not null default '',
  output_type      text not null default 'task'
                   check (output_type in ('task', 'blog', 'note', 'activity')),
  channels         text[] not null default '{}',
  use_rosetta      boolean not null default true,
  use_laws         boolean not null default true,
  schedule_enabled boolean not null default false,
  day_of_week      integer,  -- null = every day, 0=Sun..6=Sat
  hour             integer not null default 8,
  last_run         timestamptz,
  enabled          boolean not null default true,
  created_at       timestamptz not null default now()
);

alter table agents enable row level security;
create policy "approved read"  on agents for select using (is_approved());
create policy "approved write" on agents for all    using (is_approved());

create index if not exists agents_schedule_idx on agents(enabled, schedule_enabled, hour);
