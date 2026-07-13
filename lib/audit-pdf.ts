import type { Advisor, VisibilityAudit, AuditActionItem, AuditConflict, AuditSocialStatus, AuditQueryVisibility, AuditQueryVisibilityMap } from './types'

function scoreColor(score: number): string {
  if (score >= 70) return '#16a34a'
  if (score >= 45) return '#d97706'
  return '#dc2626'
}

function impactColor(impact: string): string {
  if (impact === 'High') return '#dc2626'
  if (impact === 'Medium') return '#d97706'
  return '#6b7280'
}

function statusColor(status: string): { bg: string; color: string } {
  if (status === 'OK') return { bg: '#dcfce7', color: '#166534' }
  if (status === 'ISSUE') return { bg: '#fef9c3', color: '#854d0e' }
  if (status === 'REMOVE') return { bg: '#fee2e2', color: '#991b1b' }
  return { bg: '#f1f5f9', color: '#475569' }
}

function bar(score: number, max: number): string {
  const pct = Math.round((score / max) * 100)
  const color = scoreColor(Math.round((score / max) * 100))
  return `
    <div style="display:flex;align-items:center;gap:10px;margin-top:4px">
      <div style="flex:1;height:8px;background:#e2e8f0;border-radius:4px;overflow:hidden">
        <div style="width:${pct}%;height:100%;background:${color};border-radius:4px"></div>
      </div>
      <span style="font-size:13px;font-weight:600;color:${color};min-width:50px;text-align:right">${score}/${max}</span>
    </div>`
}

export function generateAuditHTML(advisor: Advisor, audit: VisibilityAudit): string {
  const score = audit.score ?? 0
  const color = scoreColor(score)
  const date = new Date(audit.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  const actionItems = (audit.action_items ?? []) as AuditActionItem[]
  const rawConflicts = audit.conflicts ?? []
  const socials = (audit.socials ?? []) as AuditSocialStatus[]
  const rawQV = audit.query_visibility
  const breakdown = audit.score_breakdown
  const raw = audit.raw_result

  const napLines = [
    advisor.name && `<div><strong>N</strong> — ${advisor.name}</div>`,
    [advisor.street_address, advisor.city, advisor.state, advisor.zip].filter(Boolean).length &&
      `<div><strong>A</strong> — ${[advisor.street_address, advisor.city, advisor.state, advisor.zip].filter(Boolean).join(', ')}</div>`,
    advisor.phone && `<div><strong>P</strong> — ${advisor.phone}</div>`,
    advisor.email && `<div><strong>E</strong> — ${advisor.email}</div>`,
    advisor.title && `<div>Title — ${advisor.title}</div>`,
    advisor.nmls_number && `<div>NMLS — #${advisor.nmls_number}</div>`,
    advisor.service_area && `<div>Top Service Area — ${advisor.service_area}</div>`,
  ].filter(Boolean).join('\n')

  const actionItemsHTML = actionItems.length ? `
    <div class="section">
      <div class="section-header">Priority Action Plan</div>
      <div class="sub-label">Ranked by priority — complete in order</div>
      ${actionItems.map((item, i) => {
        const num = item.priority ?? item.rank ?? (i + 1)
        const impactHtml = item.impact ? `
          <span class="impact-badge" style="background:${impactColor(item.impact)}1a;color:${impactColor(item.impact)};border:1px solid ${impactColor(item.impact)}40">
            ${item.impact} Impact
          </span>` : ''
        return `
          <div class="action-item">
            <div class="action-rank">${num}</div>
            <div class="action-body">
              <div class="action-top">
                <span class="action-platform">${item.platform}</span>
                ${impactHtml}
              </div>
              <div class="action-text">${item.action}</div>
              ${item.url ? `<a class="action-url" href="${item.url}">${item.url}</a>` : ''}
            </div>
          </div>`
      }).join('')}
    </div>
  ` : ''

  const conflictsHTML = rawConflicts.length ? (() => {
    const isStringConflicts = typeof rawConflicts[0] === 'string'
    if (isStringConflicts) {
      return `
        <div class="section">
          <div class="section-header">Core Identity Conflicts</div>
          ${(rawConflicts as string[]).map(c => `
            <div class="conflict-card">
              <div class="conflict-issue">⚠ ${c}</div>
            </div>
          `).join('')}
        </div>`
    }
    return `
      <div class="section">
        <div class="section-header">Core Identity Conflicts</div>
        ${(rawConflicts as AuditConflict[]).map(c => `
          <div class="conflict-card">
            <div class="conflict-field">${c.field}</div>
            <div class="conflict-canonical">Canonical: <strong>${c.canonical}</strong></div>
            ${c.issues.map(issue => `
              <div class="conflict-issue">⚠ ${issue.platform}: <em>${issue.found}</em></div>
            `).join('')}
          </div>
        `).join('')}
      </div>`
  })() : ''

  const socialsHTML = socials.length ? `
    <div class="section">
      <div class="section-header">Links / Socials Assessment</div>
      <div class="table">
        <div class="table-head">
          <div>Platform</div>
          <div>Status</div>
          <div>Notes</div>
        </div>
        ${socials.map(s => {
          const { bg, color: c } = statusColor(s.status)
          return `
            <div class="table-row">
              <div>${s.platform}</div>
              <div><span style="background:${bg};color:${c};padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600">${s.status}</span></div>
              <div style="font-size:12px;color:#475569">${s.notes ?? ''}</div>
            </div>`
        }).join('')}
      </div>
    </div>
  ` : ''

  const breakdownHTML = breakdown ? `
    <div class="section">
      <div class="section-header">Visibility Score</div>
      ${Object.entries(breakdown).map(([key, val]) => {
        const labels: Record<string, string> = {
          listingsHealth:        '1) Listings Health',
          reviews:               '2) Reviews & Reputation',
          websiteLocal:          '3) Website Local Relevance',
          websiteLocalRelevance: '3) Website Local Relevance',
          brandConsistency:      '4) Brand & Entity Consistency',
          aiSearchReadiness:     '5) AI Search Readiness',
        }
        return `
          <div class="score-row">
            <div class="score-label">${labels[key] ?? key}</div>
            ${bar(val.score, val.max)}
            ${val.notes ? `<div class="score-notes">${val.notes}</div>` : ''}
          </div>`
      }).join('')}
    </div>
  ` : ''

  const queriesHTML = (() => {
    if (!rawQV) return ''
    // New object format
    if (!Array.isArray(rawQV)) {
      const qv = rawQV as AuditQueryVisibilityMap
      const missed = (qv.missedOpportunities ?? []).map(m => `<li>${m}</li>`).join('')
      const clusters = (qv.topicClusters ?? []).map(t => `<li>${t}</li>`).join('')
      return `
        <div class="section">
          <div class="section-header">Query Visibility</div>
          <div class="query-row">
            <span class="query-type branded">Branded</span>
            <div class="query-assessment">${qv.branded ?? ''}</div>
          </div>
          <div class="query-row">
            <span class="query-type non_branded">Non-Branded</span>
            <div class="query-assessment">${qv.nonBranded ?? ''}</div>
          </div>
          ${missed ? `<div class="query-row"><span class="query-type missed">Missed</span><ul style="font-size:12px;margin:4px 0 0 16px;color:#475569">${missed}</ul></div>` : ''}
          ${clusters ? `<div class="query-row"><span class="query-type branded">Topic Clusters</span><ul style="font-size:12px;margin:4px 0 0 16px;color:#475569">${clusters}</ul></div>` : ''}
          ${qv.serviceAreaExpansion ? `<div class="query-row"><span class="query-type non_branded">Expansion</span><div class="query-assessment">${qv.serviceAreaExpansion}</div></div>` : ''}
        </div>`
    }
    // Legacy array format
    const queries = rawQV as AuditQueryVisibility[]
    return queries.length ? `
      <div class="section">
        <div class="section-header">Query Visibility Map</div>
        ${queries.map(q => `
          <div class="query-row">
            <span class="query-type ${q.type}">${q.type.replace('_', ' ')}</span>
            <span class="query-text">&ldquo;${q.query}&rdquo;</span>
            <div class="query-assessment">${q.assessment}</div>
          </div>
        `).join('')}
      </div>` : ''
  })()

  const contentThemesHTML = raw?.contentThemes?.length ? `
    <div class="section">
      <div class="section-header">Content Themes</div>
      ${raw.contentThemes.map((t, i) => `<div class="theme-item"><span class="theme-num">${i + 1}</span> ${t}</div>`).join('')}
    </div>
  ` : raw?.discoveryQueries?.length ? `
    <div class="section">
      <div class="section-header">Recommended Discovery Queries</div>
      ${raw.discoveryQueries.map((q, i) => `<div class="theme-item"><span class="theme-num">${i + 1}</span> ${q}</div>`).join('')}
    </div>
  ` : ''

  function confidenceBg(confidence: string): string {
    if (confidence === 'High')   return 'background:#dcfce7;color:#166534'
    if (confidence === 'Medium') return 'background:#fef9c3;color:#854d0e'
    return 'background:#f1f5f9;color:#475569'
  }
  function actionBg(action: string): string {
    if (action === 'Claim')  return 'background:#dbeafe;color:#1e40af'
    if (action === 'Update') return 'background:#fef3c7;color:#92400e'
    if (action === 'Remove') return 'background:#fee2e2;color:#991b1b'
    return 'background:#f1f5f9;color:#475569'
  }

  const discoveredChannelsHTML = raw?.discoveredChannels?.length ? `
    <div class="section">
      <div class="section-header">Possible Undiscovered Channels</div>
      <div class="sub-label">Profiles that likely exist but were not submitted - verify and claim or update as needed.</div>
      ${raw.discoveredChannels.map(ch => `
        <div style="border:1px solid #fde68a;background:#fffbeb;border-radius:6px;padding:12px 16px;margin-bottom:10px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap">
            <span style="font-size:13px;font-weight:700;color:#1e293b">${ch.platform}</span>
            <span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px;${confidenceBg(ch.confidence)}">${ch.confidence} confidence</span>
            <span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px;margin-left:auto;${actionBg(ch.action)}">${ch.action}</span>
          </div>
          <div style="font-size:12px;color:#475569;line-height:1.5;margin-bottom:8px">${ch.reason}</div>
          <div style="display:flex;gap:14px;flex-wrap:wrap">
            ${ch.likelyUrl ? `<a href="${ch.likelyUrl}" style="font-size:11px;color:#0369a1">View Likely Profile →</a>` : ''}
            ${ch.searchUrl ? `<a href="${ch.searchUrl}" style="font-size:11px;color:#64748b">Search to Verify →</a>` : ''}
          </div>
        </div>
      `).join('')}
    </div>
  ` : ''

  const canonicalHTML = raw?.canonicalBlock ? `
    <div class="section">
      <div class="section-header">Canonical NAP Block</div>
      <pre style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:14px 18px;font-size:13px;line-height:1.8;white-space:pre-wrap;font-family:monospace">${raw.canonicalBlock}</pre>
      ${raw.positioningStatement ? `<div style="margin-top:12px;font-size:13px;color:#334155;font-style:italic">${raw.positioningStatement}</div>` : ''}
    </div>
  ` : ''

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${advisor.name} — AI Visibility Audit</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Georgia, 'Times New Roman', serif; font-size: 14px; color: #1e293b; background: #fff; padding: 40px; max-width: 860px; margin: 0 auto; }
  a { color: #0369a1; }

  .page-header { text-align: center; margin-bottom: 32px; border-bottom: 3px solid #1e3a5f; padding-bottom: 16px; }
  .brand-name { font-size: 22px; font-weight: 700; letter-spacing: 2px; color: #1e3a5f; }
  .brand-sub { font-size: 12px; color: #64748b; letter-spacing: 1px; margin-top: 2px; }
  .report-date { font-size: 12px; color: #94a3b8; margin-top: 8px; }

  .advisor-header { margin-bottom: 32px; }
  .advisor-score-line { font-size: 32px; font-weight: 700; margin-bottom: 8px; color: #1e293b; }
  .score-num { color: ${color}; }
  .advisor-bio { font-size: 13px; color: #475569; line-height: 1.6; margin-bottom: 12px; }
  .nap-block { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 14px 18px; font-size: 13px; line-height: 1.8; }

  .section { margin-bottom: 36px; }
  .section-header { font-size: 13px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; background: #1e3a5f; color: #fff; padding: 8px 14px; margin-bottom: 16px; }
  .sub-label { font-size: 12px; color: #64748b; margin: -12px 0 16px; font-style: italic; }

  .action-item { display: flex; gap: 14px; margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid #e2e8f0; }
  .action-item:last-child { border-bottom: none; }
  .action-rank { width: 28px; height: 28px; border-radius: 50%; background: #1e3a5f; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px; flex-shrink: 0; margin-top: 2px; }
  .action-body { flex: 1; }
  .action-top { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
  .action-platform { font-size: 12px; font-weight: 600; color: #1e3a5f; }
  .impact-badge { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 4px; }
  .action-text { font-size: 13px; color: #334155; line-height: 1.5; }
  .action-url { font-size: 11px; color: #0369a1; display: block; margin-top: 4px; word-break: break-all; }

  .conflict-card { border: 1px solid #fed7aa; background: #fff7ed; border-radius: 6px; padding: 12px 16px; margin-bottom: 10px; }
  .conflict-field { font-weight: 700; font-size: 13px; color: #9a3412; margin-bottom: 4px; }
  .conflict-canonical { font-size: 13px; color: #431407; margin-bottom: 6px; }
  .conflict-issue { font-size: 12px; color: #7c2d12; padding-left: 16px; margin-top: 4px; }

  .table { border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; font-size: 13px; }
  .table-head { display: grid; grid-template-columns: 140px 80px 1fr; gap: 0; background: #f1f5f9; font-weight: 600; font-size: 11px; text-transform: uppercase; color: #64748b; padding: 8px 12px; }
  .table-row { display: grid; grid-template-columns: 140px 80px 1fr; gap: 0; padding: 10px 12px; border-top: 1px solid #e2e8f0; align-items: start; }

  .score-row { margin-bottom: 18px; }
  .score-label { font-size: 14px; font-weight: 600; color: #1e293b; }
  .score-notes { font-size: 12px; color: #64748b; margin-top: 6px; line-height: 1.5; }

  .query-row { margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid #f1f5f9; }
  .query-type { font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 3px; text-transform: uppercase; letter-spacing: 0.5px; }
  .query-type.branded { background: #dbeafe; color: #1e40af; }
  .query-type.non_branded { background: #dcfce7; color: #166534; }
  .query-type.missed { background: #fee2e2; color: #991b1b; }
  .query-text { font-size: 13px; font-weight: 600; color: #1e293b; margin-left: 8px; }
  .query-assessment { font-size: 12px; color: #475569; margin-top: 4px; line-height: 1.5; }

  .theme-item { display: flex; gap: 10px; margin-bottom: 10px; font-size: 13px; color: #334155; line-height: 1.5; }
  .theme-num { font-weight: 700; color: #1e3a5f; min-width: 20px; }

  .footer { margin-top: 48px; border-top: 1px solid #e2e8f0; padding-top: 16px; font-size: 11px; color: #94a3b8; text-align: center; }

  @media print {
    body { padding: 20px; }
    .section-header { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .action-rank { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .impact-badge { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .query-type { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>

<div class="page-header">
  <div class="brand-name">NEO HOME LOANS</div>
  <div class="brand-sub">powered by Better</div>
  <div class="report-date">${date}</div>
</div>

<div class="advisor-header">
  <div class="advisor-score-line">
    ${advisor.name} Online Trust Score: <span class="score-num">${score}/100</span>
  </div>
  <div class="advisor-bio">
    ${advisor.name}${advisor.nmls_number ? `, NMLS #${advisor.nmls_number}` : ''}${advisor.title ? `, ${advisor.title}` : ''}${advisor.city ? ` — serving ${[advisor.city, advisor.state].filter(Boolean).join(', ')} and surrounding areas.` : '.'}
  </div>
  ${napLines ? `<div class="nap-block">${napLines}</div>` : ''}
</div>

${canonicalHTML}
${actionItemsHTML}
${conflictsHTML}
${breakdownHTML}
${socialsHTML}
${queriesHTML}
${contentThemesHTML}
${discoveredChannelsHTML}

<div class="footer">
  NEO Home Loans AI Visibility Audit &nbsp;|&nbsp; ${advisor.name} &nbsp;|&nbsp; Generated ${date} &nbsp;|&nbsp; Powered by Claude AI
</div>

</body>
</html>`
}
