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

function buildEmail(conversations, tasks) {
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Denver',
  })

  const meetingRows = conversations.length
    ? conversations.map(c => `
      <div style="margin-bottom:24px;padding:16px;background:#f8f9fa;border-radius:8px;border-left:3px solid #4f46e5;">
        <div style="font-weight:600;font-size:15px;color:#111;margin-bottom:8px;">${c.short_summary || 'Meeting'}</div>
        <div style="font-size:13px;color:#555;line-height:1.6;">${(c.summary || '').split('\n').filter(l => l.trim() && !l.startsWith('#')).slice(0, 5).join('<br>')}</div>
      </div>`).join('')
    : '<p style="color:#888;font-size:14px;">No meetings captured today.</p>'

  const taskRows = tasks.length
    ? `<table style="width:100%;border-collapse:collapse;">
        ${tasks.map(t => `
        <tr style="border-bottom:1px solid #eee;">
          <td style="padding:10px 8px;font-size:14px;color:#111;">${t.title}</td>
          <td style="padding:10px 8px;font-size:12px;color:#888;white-space:nowrap;">${t.priority}</td>
          <td style="padding:10px 8px;font-size:12px;color:#888;white-space:nowrap;">${t.due ? new Date(t.due).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</td>
        </tr>`).join('')}
      </table>`
    : '<p style="color:#888;font-size:14px;">No new tasks added today.</p>'

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">

    <!-- Header -->
    <div style="background:#4f46e5;padding:28px 32px;">
      <div style="font-size:12px;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Daily Recap</div>
      <div style="font-size:22px;font-weight:700;color:#fff;">${today}</div>
    </div>

    <div style="padding:32px;">

      <!-- Meetings -->
      <div style="margin-bottom:32px;">
        <div style="font-size:11px;font-weight:700;color:#4f46e5;text-transform:uppercase;letter-spacing:1px;margin-bottom:16px;">
          Today's Meetings (${conversations.length})
        </div>
        ${meetingRows}
      </div>

      <!-- Tasks Created Today -->
      <div style="margin-bottom:32px;">
        <div style="font-size:11px;font-weight:700;color:#4f46e5;text-transform:uppercase;letter-spacing:1px;margin-bottom:16px;">
          Tasks Added Today (${tasks.length})
        </div>
        ${taskRows}
      </div>

      <!-- Footer link -->
      <div style="text-align:center;padding-top:16px;border-top:1px solid #eee;">
        <a href="${METTLE_URL}/tasks" style="display:inline-block;padding:10px 24px;background:#4f46e5;color:#fff;border-radius:6px;font-size:14px;font-weight:600;text-decoration:none;">
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

  // 1. Pull today's conversations from Bee
  startMcp()
  await mcpCall('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'bee-recap', version: '1.0' },
  })

  const todayData = await beeTool('bee_get_today')
  proc.stdin.end()

  const conversations = (todayData?.recentConversations ?? []).filter(c => {
    const start = new Date(c.start_time)
    const now = new Date()
    return start.toDateString() === now.toDateString()
  })

  // 2. Fetch tasks created today from hub
  const tasksRes = await fetch(`${METTLE_URL}/api/bee/today-tasks?secret=${SYNC_SECRET}`)
  const tasksData = await tasksRes.json()
  const tasks = tasksData?.tasks ?? []

  // 3. Build and send email
  const html = buildEmail(conversations, tasks)

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
