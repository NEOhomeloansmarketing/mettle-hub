'use client'

import { Icon } from './Icon'

interface EmptyProps {
  icon?: string
  title: string
  body?: string
  action?: React.ReactNode
}

export function Empty({ icon = 'sparkle', title, body, action }: EmptyProps) {
  return (
    <div className="empty">
      <div className="empty__icon"><Icon name={icon} size={22} /></div>
      <div className="empty__title">{title}</div>
      {body && <div className="empty__body">{body}</div>}
      {action}
    </div>
  )
}
