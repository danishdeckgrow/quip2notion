import fs from 'node:fs'
import path from 'node:path'
import type { MigrationRecord } from '../state/index.js'

export interface ReportSummary {
  total: number
  success: number
  failed: number
  skipped: number
  pending: number
  durationMs: number
  generatedAt: string
}

export function buildReport(
  records: MigrationRecord[],
  startMs: number,
  endMs: number
): ReportSummary {
  return {
    total: records.length,
    success: records.filter((r) => r.status === 'success').length,
    failed: records.filter((r) => r.status === 'failed').length,
    skipped: records.filter((r) => r.status === 'skipped').length,
    pending: records.filter((r) => r.status === 'pending').length,
    durationMs: endMs - startMs,
    generatedAt: new Date(endMs).toISOString(),
  }
}

export function writeJsonReport(
  records: MigrationRecord[],
  summary: ReportSummary,
  outDir = process.cwd()
): void {
  const data = { summary, records }
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(data, null, 2))
}

export function writeHtmlReport(
  records: MigrationRecord[],
  summary: ReportSummary,
  outDir = process.cwd()
): void {
  const rows = records
    .map(
      (r) => `
      <tr class="${r.status}">
        <td>${esc(r.quipTitle)}</td>
        <td>${esc(r.quipType)}</td>
        <td><span class="badge ${r.status}">${r.status}</span></td>
        <td>${r.notionPageId ? `<a href="https://notion.so/${r.notionPageId}">${r.notionPageId}</a>` : '—'}</td>
        <td>${r.errorMessage ? esc(r.errorMessage) : '—'}</td>
        <td>${r.retryCount}</td>
      </tr>`
    )
    .join('')

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>quip2notion Migration Report</title>
<style>
  body { font-family: system-ui, sans-serif; padding: 2rem; color: #111; }
  h1 { margin-bottom: 0.5rem; }
  .summary { display: flex; gap: 1.5rem; margin: 1.5rem 0; flex-wrap: wrap; }
  .stat { background: #f4f4f4; border-radius: 8px; padding: 1rem 1.5rem; }
  .stat h2 { margin: 0; font-size: 2rem; }
  .stat p { margin: 0.25rem 0 0; color: #666; font-size: 0.9rem; }
  table { border-collapse: collapse; width: 100%; margin-top: 1.5rem; }
  th { text-align: left; padding: 0.5rem 1rem; background: #f4f4f4; }
  td { padding: 0.5rem 1rem; border-bottom: 1px solid #eee; vertical-align: top; }
  tr.failed td { background: #fff5f5; }
  .badge { padding: 2px 8px; border-radius: 12px; font-size: 0.8rem; font-weight: 600; }
  .badge.success { background: #d1fae5; color: #065f46; }
  .badge.failed { background: #fee2e2; color: #991b1b; }
  .badge.skipped { background: #fef9c3; color: #713f12; }
  .badge.pending { background: #e0e7ff; color: #3730a3; }
</style>
</head>
<body>
<h1>quip2notion Migration Report</h1>
<p>Generated: ${summary.generatedAt} | Duration: ${(summary.durationMs / 1000).toFixed(1)}s</p>
<div class="summary">
  <div class="stat"><h2>${summary.total}</h2><p>Total</p></div>
  <div class="stat"><h2 style="color:#065f46">${summary.success}</h2><p>Success</p></div>
  <div class="stat"><h2 style="color:#991b1b">${summary.failed}</h2><p>Failed</p></div>
  <div class="stat"><h2 style="color:#713f12">${summary.skipped}</h2><p>Skipped</p></div>
</div>
<table>
  <thead>
    <tr>
      <th>Title</th><th>Type</th><th>Status</th><th>Notion ID</th><th>Error</th><th>Retries</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>
</body>
</html>`

  fs.writeFileSync(path.join(outDir, 'report.html'), html)
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
