'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Icon } from '@/components/ui/Icon'
import { Avatar } from '@/components/ui/Avatar'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import type { Account } from '@/lib/types'
import { cls } from '@/lib/utils'

const TEAM_COLORS = ['#4D7FFF', '#7B8CFF', '#3DBFB3', '#E1A058', '#C26EB4', '#6BD49A', '#FF8E8E', '#A5A8AE']

type TeamMember = Pick<Account, 'id' | 'name' | 'email' | 'role' | 'color' | 'initials' | 'created_at'>

export function TeamView({ team: initialTeam, currentUserId }: {
  team: TeamMember[]
  currentUserId: string
}) {
  const { push: toast } = useToast()
  const supabase = createClient()
  const [team, setTeam] = useState<TeamMember[]>(initialTeam)
  const [editing, setEditing] = useState<TeamMember | null>(null)

  async function saveEdit(patch: { name: string; role: string; color: string; initials: string }) {
    if (!editing) return
    const updated = { ...editing, ...patch }
    setTeam(prev => prev.map(m => m.id === editing.id ? updated as TeamMember : m))
    const { error } = await supabase
      .from('accounts')
      .update({ name: patch.name, color: patch.color, initials: patch.initials })
      .eq('id', editing.id)
    if (error) toast(error.message, 'error')
    else toast('Saved', 'success')
    setEditing(null)
  }

  return (
    <div className="page page--team">
      <div className="page__head">
        <div>
          <div className="page__kicker">Team</div>
          <h1 className="page__title">Workspace members</h1>
          <p className="page__sub">People you can assign tasks to and @mention across all modules.</p>
        </div>
      </div>

      <div className="team-grid">
        {team.map(m => (
          <div key={m.id} className="team-card">
            <div className="team-card__top">
              <Avatar user={m} size={48} />
              <div>
                <div className="team-card__name">{m.name}</div>
                <div className="team-card__role">{m.role === 'admin' ? 'Admin' : 'Team Member'}</div>
              </div>
            </div>
            <div className="team-card__email">{m.email}</div>
            <div className="team-card__actions">
              {m.id === currentUserId && (
                <span className="pill pill--current">Active session</span>
              )}
              <button className="link-btn" onClick={() => setEditing(m)}>
                <Icon name="edit" size={12} /> Edit
              </button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <EditModal
          member={editing}
          onClose={() => setEditing(null)}
          onSave={saveEdit}
        />
      )}
    </div>
  )
}

function EditModal({
  member, onClose, onSave,
}: {
  member: TeamMember
  onClose: () => void
  onSave: (patch: { name: string; role: string; color: string; initials: string }) => void
}) {
  const [form, setForm] = useState({
    name: member.name,
    role: member.role,
    color: member.color ?? TEAM_COLORS[0],
    initials: member.initials ?? '',
  })

  useEffect(() => {
    if (!form.initials && form.name) {
      const parts = form.name.trim().split(/\s+/)
      const inits = ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase()
      setForm(f => ({ ...f, initials: inits }))
    }
  }, [form.name])

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit member"
      footer={
        <>
          <button className="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn btn--primary"
            disabled={!form.name.trim()}
            onClick={() => onSave(form)}
          >
            Save
          </button>
        </>
      }
    >
      <div className="form-stack">
        <label>Name</label>
        <input
          className="input"
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          autoFocus
        />
        <label>Initials</label>
        <input
          className="input"
          value={form.initials}
          onChange={e => setForm(f => ({ ...f, initials: e.target.value.toUpperCase().slice(0, 2) }))}
          placeholder="JD"
          maxLength={2}
        />
        <label>Avatar color</label>
        <div className="color-row">
          {TEAM_COLORS.map(c => (
            <button
              key={c}
              className={cls('swatch', form.color === c && 'swatch--on')}
              style={{ background: c }}
              onClick={() => setForm(f => ({ ...f, color: c }))}
            />
          ))}
        </div>
      </div>
    </Modal>
  )
}
