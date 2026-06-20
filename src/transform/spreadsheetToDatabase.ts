import type { CreateDatabaseParameters } from '@notionhq/client/build/src/api-endpoints.js'

export interface SpreadsheetRow {
  cells: string[]
}

export interface SpreadsheetData {
  headers: string[]
  rows: SpreadsheetRow[]
}

export function parseSpreadsheetHtml(html: string): SpreadsheetData {
  const headerMatches = html.match(/<th[^>]*>(.*?)<\/th>/gi) ?? []
  const headers = headerMatches.map((h) => h.replace(/<[^>]+>/g, '').trim() || 'Column')

  const rowMatches = html.match(/<tr[^>]*>(.*?)<\/tr>/gis) ?? []
  const rows: SpreadsheetRow[] = []

  for (const row of rowMatches.slice(1)) {
    const cellMatches = row.match(/<td[^>]*>(.*?)<\/td>/gi) ?? []
    const cells = cellMatches.map((c) => c.replace(/<[^>]+>/g, '').trim())
    if (cells.length > 0) rows.push({ cells })
  }

  return { headers: headers.length > 0 ? headers : ['Column 1'], rows }
}

export function buildDatabaseProperties(
  headers: string[]
): CreateDatabaseParameters['properties'] {
  const props: CreateDatabaseParameters['properties'] = {}

  headers.forEach((header, idx) => {
    const key = header || `Column ${idx + 1}`
    if (idx === 0) {
      props[key] = { title: {} }
    } else {
      props[key] = { rich_text: {} }
    }
  })

  return props
}

export function buildRowProperties(
  headers: string[],
  cells: string[]
): Record<string, unknown> {
  const props: Record<string, unknown> = {}

  headers.forEach((header, idx) => {
    const key = header || `Column ${idx + 1}`
    const value = cells[idx] ?? ''

    if (idx === 0) {
      props[key] = { title: [{ text: { content: value.slice(0, 2000) } }] }
    } else {
      props[key] = { rich_text: [{ text: { content: value.slice(0, 2000) } }] }
    }
  })

  return props
}
