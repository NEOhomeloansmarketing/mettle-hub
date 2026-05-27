-- ================================================================
-- Mettle Marketing Hub — Initial Schema
-- Run this in the Supabase SQL Editor for a new project.
-- ================================================================

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ── accounts ──────────────────────────────────────────────────────
create table if not exists accounts (
  id           uuid primary key default gen_random_uuid(),
  email        text not null unique,
  name         text not null default '',
  role         text not null default 'team_member' check (role in ('admin','team_member')),
  status       text not null default 'pending' check (status in ('pending','approved','denied')),
  color        text,
  initials     text,
  approved_at  timestamptz,
  approver_email text,
  created_at   timestamptz not null default now()
);

-- ── sections ─────────────────────────────────────────────────────
create table if not exists sections (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default 'Section',
  order_index integer not null default 0,
  created_at  timestamptz not null default now()
);

-- ── tasks ─────────────────────────────────────────────────────────
create table if not exists tasks (
  id           uuid primary key default gen_random_uuid(),
  title        text not null default '',
  description  text not null default '',
  assignee_id  uuid references accounts(id) on delete set null,
  section_id   uuid references sections(id) on delete set null,
  status       text not null default 'To Do'
               check (status in ('To Do','In Progress','In Review','Done')),
  priority     text not null default 'Medium'
               check (priority in ('Low','Medium','High','Urgent')),
  channel      text not null default 'All'
               check (channel in ('CRNA','Entrepreneur','Physician','All','Internal')),
  due          date,
  meeting_id   uuid,
  created_at   timestamptz not null default now()
);

-- ── task_comments ─────────────────────────────────────────────────
create table if not exists task_comments (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references tasks(id) on delete cascade,
  author_id  uuid not null references accounts(id) on delete cascade,
  body       text not null default '',
  created_at timestamptz not null default now()
);

-- ── meetings ──────────────────────────────────────────────────────
create table if not exists meetings (
  id           uuid primary key default gen_random_uuid(),
  title        text not null default 'Untitled meeting',
  date         timestamptz not null default now(),
  agenda       text not null default '',
  transcript   text not null default '',
  summary      text not null default '',
  action_items jsonb not null default '[]'::jsonb,
  created_at   timestamptz not null default now()
);

-- ── meeting_attendees ─────────────────────────────────────────────
create table if not exists meeting_attendees (
  meeting_id uuid not null references meetings(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  primary key (meeting_id, account_id)
);

-- ── notes ─────────────────────────────────────────────────────────
create table if not exists notes (
  id         uuid primary key default gen_random_uuid(),
  title      text not null default 'Untitled note',
  body       text not null default '',
  tags       text[] not null default '{}',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- ── blog_posts ────────────────────────────────────────────────────
create table if not exists blog_posts (
  id                 uuid primary key default gen_random_uuid(),
  channel            text not null check (channel in ('CRNA','Entrepreneur','Physician')),
  status             text not null default 'pending-review'
                     check (status in ('pending-review','approved','posted')),
  title              text not null default '',
  topic              text not null default '',
  trend_note         text not null default '',
  meta_description   text not null default '',
  hashtags           text[] not null default '{}',
  body               text not null default '',
  linkedin_caption   text not null default '',
  instagram_caption  text not null default '',
  auto_generated     boolean not null default false,
  approved_at        timestamptz,
  posted_at          timestamptz,
  created_at         timestamptz not null default now()
);

-- ── brand_docs ────────────────────────────────────────────────────
-- id is the doc key: 'crna', 'entrepreneur', 'physician', 'rosettastone', 'lawsofmarketing'
create table if not exists brand_docs (
  id         text primary key,
  content    text not null default '',
  updated_at timestamptz not null default now()
);

-- ── schedule_config ───────────────────────────────────────────────
create table if not exists schedule_config (
  id          integer primary key default 1,
  enabled     boolean not null default false,
  day_of_week integer not null default 1, -- 0=Sun … 6=Sat
  hour        integer not null default 8,
  channels    text[] not null default '{"CRNA","Entrepreneur","Physician"}',
  last_runs   jsonb not null default '{}'::jsonb,
  constraint only_one_row check (id = 1)
);

-- Ensure a single config row
insert into schedule_config (id) values (1) on conflict (id) do nothing;

-- ── activity ─────────────────────────────────────────────────────
create table if not exists activity (
  id    uuid primary key default gen_random_uuid(),
  kind  text not null check (kind in ('ai','task','system')),
  label text not null default '',
  ts    timestamptz not null default now()
);

-- ================================================================
-- Row Level Security
-- ================================================================

alter table accounts           enable row level security;
alter table sections           enable row level security;
alter table tasks              enable row level security;
alter table task_comments      enable row level security;
alter table meetings           enable row level security;
alter table meeting_attendees  enable row level security;
alter table notes              enable row level security;
alter table blog_posts         enable row level security;
alter table brand_docs         enable row level security;
alter table schedule_config    enable row level security;
alter table activity           enable row level security;

-- Helper: is the calling user an approved account?
create or replace function is_approved()
returns boolean
language sql security definer
as $$
  select exists (
    select 1 from accounts
    where id = auth.uid() and status = 'approved'
  )
$$;

-- Helper: is the calling user an admin?
create or replace function is_admin()
returns boolean
language sql security definer
as $$
  select exists (
    select 1 from accounts
    where id = auth.uid() and status = 'approved' and role = 'admin'
  )
$$;

-- accounts: users can read all approved accounts; can update their own
create policy "read approved accounts" on accounts for select using (is_approved());
create policy "update own account"    on accounts for update using (auth.uid() = id);
create policy "insert own account"    on accounts for insert with check (auth.uid() = id);
-- admin can update any account (for approvals/denials)
create policy "admin update any account" on accounts for update using (is_admin());

-- sections, tasks, task_comments, meetings, meeting_attendees, notes, blog_posts, brand_docs, schedule_config, activity
-- all approved users can read and write; no row-owner restriction needed for this internal tool
create policy "approved read"   on sections          for select using (is_approved());
create policy "approved write"  on sections          for all    using (is_approved());

create policy "approved read"   on tasks             for select using (is_approved());
create policy "approved write"  on tasks             for all    using (is_approved());

create policy "approved read"   on task_comments     for select using (is_approved());
create policy "approved write"  on task_comments     for all    using (is_approved());

create policy "approved read"   on meetings          for select using (is_approved());
create policy "approved write"  on meetings          for all    using (is_approved());

create policy "approved read"   on meeting_attendees for select using (is_approved());
create policy "approved write"  on meeting_attendees for all    using (is_approved());

create policy "approved read"   on notes             for select using (is_approved());
create policy "approved write"  on notes             for all    using (is_approved());

create policy "approved read"   on blog_posts        for select using (is_approved());
create policy "approved write"  on blog_posts        for all    using (is_approved());

create policy "approved read"   on brand_docs        for select using (is_approved());
create policy "approved write"  on brand_docs        for all    using (is_approved());

create policy "approved read"   on schedule_config   for select using (is_approved());
create policy "admin write"     on schedule_config   for all    using (is_admin());

create policy "approved read"   on activity          for select using (is_approved());
create policy "approved write"  on activity          for insert with check (is_approved());

-- ================================================================
-- Email domain trigger — block non-@neohomeloans.com signups
-- ================================================================
create or replace function enforce_email_domain()
returns trigger
language plpgsql security definer
as $$
begin
  if lower(new.email) not like '%@neohomeloans.com' then
    raise exception 'Only @neohomeloans.com email addresses are allowed.';
  end if;
  return new;
end;
$$;

create trigger check_email_domain
  before insert on accounts
  for each row
  execute function enforce_email_domain();

-- ================================================================
-- Seed data
-- ================================================================

-- Default sections (only seed if empty)
insert into sections (name, order_index)
select * from (values
  ('This week', 0),
  ('Up next',   1),
  ('Backlog',   2)
) as v(name, order_index)
where not exists (select 1 from sections);

-- Seed schedule_config row already done above
-- Brand doc placeholders
insert into brand_docs (id, content) values
  ('crna',            ''),
  ('entrepreneur',    ''),
  ('physician',       ''),
  ('rosettastone',    ''),
  ('lawsofmarketing', '')
on conflict (id) do nothing;

-- ================================================================
-- Indexes for common queries
-- ================================================================
create index if not exists tasks_assignee_id_idx  on tasks(assignee_id);
create index if not exists tasks_section_id_idx   on tasks(section_id);
create index if not exists tasks_status_idx       on tasks(status);
create index if not exists tasks_due_idx          on tasks(due);
create index if not exists blog_posts_channel_idx on blog_posts(channel);
create index if not exists blog_posts_status_idx  on blog_posts(status);
create index if not exists activity_ts_idx        on activity(ts desc);
