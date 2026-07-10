#!/usr/bin/env node
/**
 * Daily 4 PM recap — pulls today's Bee conversations + hub tasks,
 * sends a digest email to Colin via Resend.
 *
 * Runs via launchd at 4 PM Mountain Time every day.
 */

import { spawn } from 'child_process'
import { createInterface } from 'readline'

const METTLE_URL  = process.env.METTLE_URL   || 'https://mettle-hub.vercel.app'
const SYNC_SECRET = process.env.BEE_SYNC_SECRET
const RESEND_KEY  = process.env.RESEND_API_KEY
const BEE_CLI     = process.env.BEE_CLI || '/opt/homebrew/lib/node_modules/@beeai/cli/dist/platforms/mac-arm64/bee'
const TO_EMAIL    = 'Colin.jenson@neohomeloans.com'
const FROM_EMAIL  = process.env.FROM_EMAIL || 'hub@neohomeloans.com'

if (!SYNC_SECRET || !RESEND_KEY) {
  console.error('[recap] Missing BEE_SYNC_SECRET or RESEND_API_KEY')
  process.exit(1)
}

// ── MCP client ────────────────────────────────────────────────────

let msgId = 1
let proc, rl, resolvers = {}

function startMcp() {
  proc = spawn(BEE_CLI, ['mcp', 'serve'], { stdio: ['pipe', 'pipe', 'inherit'] })
  rl = createInterface({ input: proc.stdout })
  rl.on('line', line => {
    try {
      const msg = JSON.parse(line)
      if (msg.id && resolvers[msg.id]) {
        resolvers[msg.id](msg)
        delete resolvers[msg.id]
      }
    } catch {}
  })
}

function mcpCall(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = msgId++
    resolvers[id] = msg => msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)
    proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
    setTimeout(() => { delete resolvers[id]; reject(new Error(`Timeout: ${method}`)) }, 15000)
  })
}

async function beeTool(name, args = {}) {
  const res = await mcpCall('tools/call', { name, arguments: args })
  const text = res?.content?.find(c => c.type === 'text')?.text
  if (!text) return null
  try { return JSON.parse(text) } catch { return text }
}

// ── Email HTML ────────────────────────────────────────────────────

function sectionHeader(label, color = '#4f46e5') {
  return `<div style="font-size:11px;font-weight:700;color:${color};text-transform:uppercase;letter-spacing:1.2px;margin-bottom:16px;padding-bottom:8px;border-bottom:2px solid ${color}20;">${label}</div>`
}

function bulletPoints(lines) {
  if (!lines.length) return '<p style="color:#aaa;font-size:13px;margin:0;">Nothing captured.</p>'
  return `<ul style="margin:0;padding-left:18px;">${lines.map(l =>
    `<li style="font-size:14px;color:#333;line-height:1.7;margin-bottom:4px;">${l}</li>`
  ).join('')}</ul>`
}

function buildEmail(conversations, tasks, personalItems, daySummary) {
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Denver',
  })

  // ── Day recap ──────────────────────────────────────────────────
  const dayRecapHtml = daySummary
    ? `<p style="font-size:14px;color:#444;line-height:1.8;margin:0;">${daySummary}</p>`
    : '<p style="font-size:14px;color:#aaa;margin:0;">No summary available.</p>'

  // ── Meeting recaps ─────────────────────────────────────────────
  const meetingsHtml = conversations.length
    ? conversations.map(c => {
        const bullets = (c.summary ?? '')
          .split('\n')
          .map(l => l.replace(/^[-*•]\s*/, '').replace(/\*\*/g, '').trim())
          .filter(l => l && !l.startsWith('#') && !l.startsWith('##') && l.length > 10)
          .slice(0, 6)

        const startTime = c.start_time
          ? new Date(c.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Denver' })
          : ''

        return `
          <div style="margin-bottom:20px;padding:16px;background:#fafafa;border-radius:8px;border-left:3px solid #4f46e5;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
              <div style="font-weight:600;font-size:14px;color:#111;">${c.short_summary || 'Meeting'}</div>
              ${startTime ? `<div style="font-size:12px;color:#aaa;">${startTime}</div>` : ''}
            </div>
            ${bulletPoints(bullets)}
          </div>`
      }).join('')
    : '<p style="color:#aaa;font-size:14px;">No meetings captured today.</p>'

  // ── Personal highlights ────────────────────────────────────────
  const personalHtml = personalItems.length
    ? personalItems.map(p =>
        `<div style="display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid #f5f5f5;">
          <span style="font-size:18px;line-height:1.3;">${p.emoji || '✦'}</span>
          <span style="font-size:14px;color:#444;line-height:1.6;">${p.text}</span>
        </div>`
      ).join('')
    : '<p style="color:#aaa;font-size:14px;">Nothing personal captured today.</p>'

  // ── Tasks created today ────────────────────────────────────────
  const tasksHtml = tasks.length
    ? tasks.map(t => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f5f5f5;">
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="width:8px;height:8px;border-radius:50%;background:#4f46e5;flex-shrink:0;display:inline-block;"></span>
            <span style="font-size:14px;color:#222;">${t.title}</span>
          </div>
          <span style="font-size:12px;color:#aaa;white-space:nowrap;margin-left:12px;">${t.priority}</span>
        </div>`
      ).join('')
    : '<p style="color:#aaa;font-size:14px;">No new tasks added today.</p>'

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:620px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">

    <!-- Header -->
    <div style="background:#4f46e5;padding:28px 32px;">
      <div style="font-size:11px;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px;">Daily Recap</div>
      <div style="font-size:24px;font-weight:700;color:#fff;">${today}</div>
    </div>

    <div style="padding:32px;">

      <!-- 1. Day Recap -->
      <div style="margin-bottom:32px;">
        ${sectionHeader('📋 Day Recap')}
        ${dayRecapHtml}
      </div>

      <!-- 2. Meeting Recaps -->
      <div style="margin-bottom:32px;">
        ${sectionHeader(`🗓 Meeting Recaps (${conversations.length})`)}
        ${meetingsHtml}
      </div>

      <!-- 3. Personal Highlights -->
      <div style="margin-bottom:32px;">
        ${sectionHeader('🌿 Personal Highlights', '#059669')}
        ${personalHtml}
      </div>

      <!-- 4. Tasks Created Today -->
      <div style="margin-bottom:32px;">
        ${sectionHeader(`✅ Tasks Created Today (${tasks.length})`, '#d97706')}
        ${tasksHtml}
      </div>

      <!-- Footer -->
      <div style="text-align:center;padding-top:20px;border-top:1px solid #eee;">
        <a href="${METTLE_URL}/tasks" style="display:inline-block;padding:11px 28px;background:#4f46e5;color:#fff;border-radius:6px;font-size:14px;font-weight:600;text-decoration:none;">
          Open Task Board →
        </a>
      </div>

    </div>
  </div>
</body>
</html>`
}

// ── Main ──────────────────────────────────────────────────────────

async function main() {
  console.log(`[recap] Starting — ${new Date().toISOString()}`)

  // 1. Pull today's conversations + todos from Bee
  startMcp()
  await mcpCall('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'bee-recap', version: '1.0' },
  })

  const [todayData, todosData] = await Promise.all([
    beeTool('bee_get_today'),
    beeTool('bee_list_todos', { limit: 50 }),
  ])
  proc.stdin.end()

  const conversations = (todayData?.recentConversations ?? []).filter(c => {
    const start = new Date(c.start_time)
    const now = new Date()
    return start.toDateString() === now.toDateString()
  })

  // 2. AI analysis — day summary + personal highlights
  const allTodos = (todosData?.todos ?? []).map(t => t.text.replace(/^[\p{Emoji}\s]+/u, '').trim())
  const conversationText = conversations.map(c =>
    `[${c.short_summary || 'Meeting'}]\n${c.summary ?? ''}`
  ).join('\n\n')

  let personalItems = []
  let daySummary = ''

  if (allTodos.length || conversationText || conversations.length) {
    const { Anthropic } = await import('@anthropic-ai/sdk')
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const context = `Todos:\n${allTodos.join('\n') || 'none'}\n\nMeetings today:\n${conversationText.slice(0, 4000) || 'none'}`

    const [summaryMsg, personalMsg] = await Promise.all([
      anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system: `Write a concise 2-4 sentence summary of the person's work day based on their meetings and todos. Focus on what was accomplished, decisions made, and key themes. Write in second person (You...). Plain text only, no markdown.`,
        messages: [{ role: 'user', content: context }],
      }),
      anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        system: `Extract personal highlights from a person's day — family moments, personal wins, health, hobbies, social interactions, personal reminders. Keep each one short (under 15 words). Return ONLY a JSON array: [{"emoji":"🏠","text":"..."},{"emoji":"👨‍👩‍👧","text":"..."}]. Return [] if nothing personal is present.`,
        messages: [{ role: 'user', content: context }],
      }),
    ])

    daySummary = summaryMsg.content[0].text.trim()
    try {
      const raw = personalMsg.content[0].text.trim()
      const match = raw.match(/\[[\s\S]*\]/)
      if (match) personalItems = JSON.parse(match[0])
    } catch {}
  }

  // 3. Fetch tasks created today from hub
  const tasksRes = await fetch(`${METTLE_URL}/api/bee/today-tasks?secret=${SYNC_SECRET}`)
  const tasksData = await tasksRes.json()
  const tasks = tasksData?.tasks ?? []

  // 4. Build and send email
  const html = buildEmail(conversations, tasks, personalItems, daySummary)

  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [TO_EMAIL],
      subject: `Daily Recap — ${new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/Denver' })}`,
      html,
    }),
  })

  const emailResult = await emailRes.json()
  if (!emailRes.ok) throw new Error(`Resend error: ${JSON.stringify(emailResult)}`)

  console.log(`[recap] Email sent — ${conversations.length} meetings, ${tasks.length} tasks`)
}

main().catch(err => { console.error('[recap] Error:', err.message); process.exit(1) })
