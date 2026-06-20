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

/**
 * Build unique, non-empty column keys. Notion databases require every property
 * name to be distinct AND exactly one property of type `title`; duplicate or
 * empty headers (common in Quip exports) would otherwise overwrite the title.
 */
export function uniqueColumnKeys(headers: string[]): string[] {
  const src = headers.length > 0 ? headers : ['Name']
  const seen = new Map<string, number>()
  return src.map((h, idx) => {
    let key = (h && h.trim()) || `Column ${idx + 1}`
    if (key.length > 200) key = key.slice(0, 200)
    const count = seen.get(key) ?? 0
    seen.set(key, count + 1)
    return count === 0 ? key : `${key} (${count + 1})`
  })
}

export function buildDatabaseProperties(
  headers: string[]
): CreateDatabaseParameters['properties'] {
  const keys = uniqueColumnKeys(headers)
  const props: CreateDatabaseParameters['properties'] = {}
  keys.forEach((key, idx) => {
    props[key] = idx === 0 ? { title: {} } : { rich_text: {} }
  })
  return props
}

export function buildRowProperties(
  headers: string[],
  cells: string[]
): Record<string, unknown> {
  const keys = uniqueColumnKeys(headers)
  const props: Record<string, unknown> = {}
  keys.forEach((key, idx) => {
    const value = cells[idx] ?? ''
    props[key] =
      idx === 0
        ? { title: [{ text: { content: value.slice(0, 2000) } }] }
        : { rich_text: [{ text: { content: value.slice(0, 2000) } }] }
  })
  return props
}
