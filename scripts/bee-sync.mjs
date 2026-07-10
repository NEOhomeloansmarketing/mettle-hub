#!/usr/bin/env node
/**
 * Bee → Mettle Hub daily task sync
 * Reads todos + recent conversation summaries from Bee MCP,
 * deduplicates against existing open tasks, pushes only new work items.
 *
 * Runs via launchd every morning at 8 AM Mountain Time.
 * Requires: METTLE_URL and BEE_SYNC_SECRET env vars (set in launchd plist)
 */

import { spawn } from 'child_process'
import { createInterface } from 'readline'

const METTLE_URL   = process.env.METTLE_URL   || 'https://mettle-hub.vercel.app'
const SYNC_SECRET  = process.env.BEE_SYNC_SECRET
const BEE_CLI      = process.env.BEE_CLI || '/opt/homebrew/lib/node_modules/@beeai/cli/dist/platforms/mac-arm64/bee'

if (!SYNC_SECRET) {
  console.error('BEE_SYNC_SECRET is not set')
  process.exit(1)
}

// ── MCP client (stdio JSON-RPC) ───────────────────────────────────

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
    const req = JSON.stringify({ jsonrpc: '2.0', id, method, params })
    proc.stdin.write(req + '\n')
    setTimeout(() => { delete resolvers[id]; reject(new Error(`Timeout: ${method}`)) }, 15000)
  })
}

async function beeTool(name, args = {}) {
  const res = await mcpCall('tools/call', { name, arguments: args })
  const text = res?.content?.find(c => c.type === 'text')?.text
  if (!text) return null
  try { return JSON.parse(text) } catch { return text }
}

// ── Main ──────────────────────────────────────────────────────────

async function main() {
  console.log(`[bee-sync] Starting — ${new Date().toISOString()}`)

  startMcp()

  // Wait for MCP to be ready
  await mcpCall('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'bee-sync', version: '1.0' },
  })

  // 1. Pull todos (active + suggestions)
  const [todosData, suggestionsData, conversationsData] = await Promise.all([
    beeTool('bee_list_todos', { limit: 50 }),
    beeTool('bee_get_todo_suggestions', { limit: 20 }),
    beeTool('bee_list_conversations', { limit: 5 }),
  ])

  const todos = todosData?.todos ?? []
  const suggestions = suggestionsData?.todoSuggestions ?? []
  const conversations = conversationsData?.conversations ?? []

  // 2. Get conversation summaries from last 48 hours
  const cutoff = Date.now() - 48 * 60 * 60 * 1000
  const recentConvos = conversations.filter(c => c.end_time > cutoff)

  proc.stdin.end()

  // 3. Build candidate task list
  const candidates = [
    ...todos.map(t => ({ source: 'todo', text: t.text.replace(/^[\p{Emoji}\s]+/u, '').trim(), details: '' })),
    ...suggestions.map(t => ({ source: 'suggestion', text: t.text, details: t.details ?? '' })),
    ...recentConvos.flatMap(c =>
      (c.summary ?? '').split('\n')
        .filter(l => l.match(/^[-*]\s+\*\*[^*]+\*\*:/))
        .map(l => ({
          source: 'conversation',
          text: l.replace(/^[-*]\s+\*\*[^*]+\*\*:\s*/, '').trim(),
          details: `From conversation: ${c.short_summary}`,
        }))
    ),
  ].filter(c => c.text.length > 5)

  if (!candidates.length) {
    console.log('[bee-sync] No candidates found, exiting.')
    return
  }

  // 4. Fetch existing open tasks from hub for dedup
  const existingRes = await fetch(`${METTLE_URL}/api/bee/existing-tasks?secret=${SYNC_SECRET}`)
  const existingData = await existingRes.json()
  const existingTasks = existingData?.tasks ?? []

  // 5. POST to sync endpoint — it handles AI filtering + dedup
  const syncRes = await fetch(`${METTLE_URL}/api/bee/sync?secret=${SYNC_SECRET}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ todos: candidates, existingTasks }),
  })
  const result = await syncRes.json()

  console.log(`[bee-sync] Done — inserted: ${result.inserted ?? 0}, skipped: ${result.skipped ?? 0}`)
}

main().catch(err => { console.error('[bee-sync] Error:', err.message); process.exit(1) })
