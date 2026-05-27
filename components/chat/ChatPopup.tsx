'use client'

import { useState, useRef, useEffect } from 'react'
import { Icon } from '@/components/ui/Icon'
import { cls } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

function TypingDots() {
  return (
    <div className="chat-typing">
      <span /><span /><span />
    </div>
  )
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user'
  return (
    <div className={cls('chat-msg', isUser ? 'chat-msg--user' : 'chat-msg--ai')}>
      {!isUser && (
        <div className="chat-msg__avatar">
          <Icon name="sparkle" size={12} />
        </div>
      )}
      <div className="chat-msg__bubble">
        {msg.content.split('\n').map((line, i) => (
          <span key={i}>{line}{i < msg.content.split('\n').length - 1 && <br />}</span>
        ))}
      </div>
    </div>
  )
}

export function ChatPopup() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [savedNote, setSavedNote] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const supabase = createClient()

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus()
  }, [open])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function send() {
    const text = input.trim()
    if (!text || loading) return

    const userMsg: Message = { role: 'user', content: text }
    const next = [...messages, userMsg]
    setMessages(next)
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setMessages([...next, { role: 'assistant', content: data.text }])
    } catch (err: any) {
      setMessages([...next, { role: 'assistant', content: `Sorry, something went wrong: ${err.message}` }])
    } finally {
      setLoading(false)
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  async function saveAsNote() {
    if (!messages.length) return
    const title = `AI Chat — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
    const body = messages.map(m => `**${m.role === 'user' ? 'You' : 'AI'}:** ${m.content}`).join('\n\n')
    await supabase.from('notes').insert({ title, body, tags: [] })
    setSavedNote(true)
    setTimeout(() => setSavedNote(false), 2500)
  }

  function clearChat() {
    setMessages([])
    setSavedNote(false)
  }

  return (
    <>
      {/* Floating button */}
      <button
        className={cls('chat-fab', open && 'chat-fab--open')}
        onClick={() => setOpen(o => !o)}
        aria-label="AI Assistant"
      >
        {open
          ? <Icon name="x" size={20} />
          : <>
              <Icon name="sparkle" size={18} />
              <span className="chat-fab__label">Ask AI</span>
            </>
        }
      </button>

      {/* Chat panel */}
      {open && (
        <div className="chat-panel">
          {/* Header */}
          <div className="chat-panel__head">
            <div className="chat-panel__head-left">
              <div className="chat-panel__avatar">
                <Icon name="sparkle" size={14} />
              </div>
              <div>
                <div className="chat-panel__title">Marketing AI</div>
                <div className="chat-panel__sub">Brand-aware · All channels</div>
              </div>
            </div>
            <div className="chat-panel__head-actions">
              {messages.length > 0 && (
                <>
                  <button
                    className="icon-btn"
                    onClick={saveAsNote}
                    title="Save conversation as a note"
                  >
                    {savedNote ? <Icon name="check" size={14} /> : <Icon name="doc" size={14} />}
                  </button>
                  <button className="icon-btn" onClick={clearChat} title="Clear chat">
                    <Icon name="trash" size={14} />
                  </button>
                </>
              )}
              <button className="icon-btn" onClick={() => setOpen(false)}>
                <Icon name="x" size={14} />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="chat-panel__messages">
            {messages.length === 0 && (
              <div className="chat-empty">
                <div className="chat-empty__icon"><Icon name="sparkle" size={28} /></div>
                <div className="chat-empty__title">What can I help with?</div>
                <div className="chat-empty__sub">Ask anything about your brand, channels, content strategy, or get copy written in your brand voice.</div>
                <div className="chat-empty__prompts">
                  {[
                    'Write a LinkedIn post for a CRNA considering buying their first home',
                    'What makes our Entrepreneur channel different from competitors?',
                    'Give me 5 blog post ideas for the Physician channel this month',
                    'Rewrite this headline in our brand voice: "Get a mortgage today"',
                  ].map(p => (
                    <button key={p} className="chat-prompt-chip" onClick={() => { setInput(p) }}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}
            {loading && (
              <div className="chat-msg chat-msg--ai">
                <div className="chat-msg__avatar"><Icon name="sparkle" size={12} /></div>
                <div className="chat-msg__bubble"><TypingDots /></div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="chat-panel__input-area">
            <textarea
              ref={inputRef}
              className="chat-panel__input"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask anything… (Enter to send, Shift+Enter for new line)"
              rows={1}
              disabled={loading}
            />
            <button
              className={cls('chat-send-btn', (!input.trim() || loading) && 'chat-send-btn--off')}
              onClick={send}
              disabled={!input.trim() || loading}
            >
              <Icon name="send" size={15} />
            </button>
          </div>
        </div>
      )}
    </>
  )
}
