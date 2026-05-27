'use client'

export function AILoading({ label = 'Thinking…' }: { label?: string }) {
  return (
    <div className="ai-loading">
      <span className="ai-loading__dot" />
      <span className="ai-loading__dot" />
      <span className="ai-loading__dot" />
      <span className="ai-loading__label">{label}</span>
    </div>
  )
}
