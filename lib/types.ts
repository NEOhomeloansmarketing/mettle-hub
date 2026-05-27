export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export type Database = {
  public: {
    Tables: {
      accounts: {
        Row: Account
        Insert: Omit<Account, 'created_at'>
        Update: Partial<Omit<Account, 'id'>>
        Relationships: []
      }
      sections: {
        Row: Section
        Insert: Omit<Section, 'id' | 'created_at'>
        Update: Partial<Omit<Section, 'id'>>
        Relationships: []
      }
      tasks: {
        Row: Task
        Insert: Omit<Task, 'id' | 'created_at'>
        Update: Partial<Omit<Task, 'id'>>
        Relationships: []
      }
      task_comments: {
        Row: TaskComment
        Insert: Omit<TaskComment, 'id' | 'created_at'>
        Update: Partial<Omit<TaskComment, 'id'>>
        Relationships: []
      }
      meetings: {
        Row: Meeting
        Insert: Omit<Meeting, 'id' | 'created_at'>
        Update: Partial<Omit<Meeting, 'id'>>
        Relationships: []
      }
      meeting_attendees: {
        Row: MeetingAttendee
        Insert: MeetingAttendee
        Update: Partial<MeetingAttendee>
        Relationships: []
      }
      notes: {
        Row: Note
        Insert: Omit<Note, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Note, 'id'>>
        Relationships: []
      }
      blog_posts: {
        Row: BlogPost
        Insert: Omit<BlogPost, 'id' | 'created_at'>
        Update: Partial<Omit<BlogPost, 'id'>>
        Relationships: []
      }
      brand_docs: {
        Row: BrandDoc
        Insert: BrandDoc
        Update: Partial<BrandDoc>
        Relationships: []
      }
      schedule_config: {
        Row: ScheduleConfig
        Insert: Partial<ScheduleConfig>
        Update: Partial<ScheduleConfig>
        Relationships: []
      }
      activity: {
        Row: Activity
        Insert: Omit<Activity, 'id' | 'ts'>
        Update: Partial<Activity>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

export interface Account {
  id: string
  email: string
  name: string
  role: 'admin' | 'team_member'
  status: 'pending' | 'approved' | 'denied'
  color?: string
  initials?: string
  approved_at: string | null
  approver_email: string | null
  created_at: string
}

export interface Section {
  id: string
  name: string
  order_index: number
  created_at: string
}

export type TaskStatus = 'To Do' | 'In Progress' | 'In Review' | 'Done'
export type TaskPriority = 'Low' | 'Medium' | 'High' | 'Urgent'
export type Channel = 'CRNA' | 'Entrepreneur' | 'Physician' | 'All' | 'Internal'

export interface Task {
  id: string
  title: string
  description: string
  assignee_id: string | null
  section_id: string | null
  status: TaskStatus
  priority: TaskPriority
  channel: Channel
  due: string | null
  meeting_id: string | null
  created_at: string
}

export interface TaskComment {
  id: string
  task_id: string
  author_id: string
  body: string
  created_at: string
}

export interface Meeting {
  id: string
  title: string
  date: string
  agenda: string
  transcript: string
  summary: string
  action_items: ActionItemDraft[]
  created_at: string
}

export interface ActionItemDraft {
  id: string
  title: string
  description: string
  assigneeName: string
  dueInDays: number
  priority: TaskPriority
  accepted: boolean
}

export interface MeetingAttendee {
  meeting_id: string
  account_id: string
}

export interface Note {
  id: string
  title: string
  body: string
  tags: string[]
  updated_at: string
  created_at: string
}

export type BlogStatus = 'pending-review' | 'approved' | 'posted'

export interface BlogPost {
  id: string
  channel: string
  status: BlogStatus
  title: string
  topic: string
  trend_note: string
  meta_description: string
  hashtags: string[]
  body: string
  linkedin_caption: string
  instagram_caption: string
  auto_generated: boolean
  created_at: string
  approved_at: string | null
  posted_at: string | null
}

export interface BrandDoc {
  id: string
  content: string
  updated_at: string
}

export interface ScheduleConfig {
  id: number
  enabled: boolean
  day_of_week: number
  hour: number
  channels: string[]
  last_runs: Record<string, string>
}

export interface Activity {
  id: string
  kind: 'ai' | 'task' | 'system'
  label: string
  ts: string
}

export type AgentOutputType = 'task' | 'blog' | 'note' | 'activity'

export interface Agent {
  id: string
  name: string
  description: string
  system_prompt: string
  output_type: AgentOutputType
  channels: string[]
  use_rosetta: boolean
  use_laws: boolean
  schedule_enabled: boolean
  day_of_week: number | null
  hour: number
  last_run: string | null
  enabled: boolean
  created_at: string
}

export const CHANNELS: Record<string, { id: string; label: string; short: string; color: string; soft: string; ink: string }> = {
  CRNA:         { id: 'CRNA',         label: 'CRNA Home Loans',         short: 'CRNA',         color: 'var(--ch-crna)',  soft: 'var(--ch-crna-soft)',  ink: 'var(--ch-crna-ink)' },
  Entrepreneur: { id: 'Entrepreneur', label: 'Entrepreneur Home Loans', short: 'Entrepreneur', color: 'var(--ch-ent)',   soft: 'var(--ch-ent-soft)',   ink: 'var(--ch-ent-ink)' },
  Physician:    { id: 'Physician',    label: 'Physician Home Loans',    short: 'Physician',    color: 'var(--ch-phys)',  soft: 'var(--ch-phys-soft)',  ink: 'var(--ch-phys-ink)' },
  All:          { id: 'All',          label: 'All Channels',            short: 'All',          color: 'var(--neutral)', soft: 'var(--neutral-soft)', ink: 'var(--neutral-ink)' },
  Internal:     { id: 'Internal',     label: 'Internal',                short: 'Internal',     color: 'var(--neutral-2)', soft: 'var(--neutral-2-soft)', ink: 'var(--neutral-2-ink)' },
}

export const STATUSES: TaskStatus[] = ['To Do', 'In Progress', 'In Review', 'Done']
export const PRIORITIES: TaskPriority[] = ['Low', 'Medium', 'High', 'Urgent']

export const CHANNEL_BRIEFS: Record<string, { audience: string; voice: string; cta: string }> = {
  CRNA: {
    audience: 'Certified Registered Nurse Anesthetists, high-earning healthcare professionals with non-traditional pay structures (W-2 + 1099 mixed), often relocating or buying first home mid-career.',
    voice: 'Clinical-respectful. Speaks to expertise. Educational, never patronizing. Anchors in financial clarity.',
    cta: 'Schedule a 15-minute call with a CRNA-specialist loan officer.',
  },
  Entrepreneur: {
    audience: 'Founders, owner-operators, and self-employed borrowers — variable income, complex tax returns, bank-statement underwriting.',
    voice: 'Confident peer-to-peer. Speaks the founder language. Acknowledges complexity and respects time.',
    cta: 'See if you qualify with a bank-statement loan — no tax returns required.',
  },
  Physician: {
    audience: 'Physicians (MD, DO), residents, fellows, attendings — high earners with student debt, often early in career.',
    voice: 'Trust-building, professional, peer-respectful. Acknowledges the unique financial profile of medicine.',
    cta: 'Get pre-qualified with a physician loan — 0% down available for qualifying borrowers.',
  },
}
