import { Client } from '@notionhq/client'
import type {
  BlockObjectRequest,
  CreateDatabaseParameters,
} from '@notionhq/client/build/src/api-endpoints.js'
import { getConfig } from '../config.js'
import { logger } from '../logger.js'

let _client: Client | null = null

function getClient(): Client {
  if (_client) return _client
  const { NOTION_TOKEN } = getConfig()
  _client = new Client({ auth: NOTION_TOKEN })
  return _client
}

/** Retry Notion calls on rate limits / transient errors with exponential backoff. */
async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  const max = 6
  let attempt = 0
  for (;;) {
    try {
      return await fn()
    } catch (err: unknown) {
      const e = err as { code?: string; status?: number; headers?: Record<string, string> }
      const status = e?.status
      const code = e?.code
      const retriable =
        code === 'rate_limited' ||
        code === 'conflict_error' ||
        code === 'internal_server_error' ||
        code === 'service_unavailable' ||
        status === 429 ||
        status === 409 ||
        (typeof status === 'number' && status >= 500)
      if (!retriable || attempt >= max) throw err
      const retryAfter = Number(e?.headers?.['retry-after'] ?? 0)
      const delay = Math.max(retryAfter * 1000, Math.pow(2, attempt) * 500)
      logger.warn(`Notion ${label} ${code ?? status} — retrying in ${delay}ms`)
      await new Promise((r) => setTimeout(r, delay))
      attempt++
    }
  }
}

export async function createPage(params: {
  parentPageId: string
  title: string
  properties?: Record<string, unknown>
  children?: BlockObjectRequest[]
}): Promise<string> {
  const notion = getClient()
  const response = await withRetry(
    () =>
      notion.pages.create({
        parent: { page_id: params.parentPageId },
        properties: {
          title: {
            title: [{ text: { content: truncate(params.title || 'Untitled', 2000) } }],
          },
          ...(params.properties ?? {}),
        },
        children: params.children ?? [],
      }),
    'pages.create'
  )
  logger.debug({ pageId: response.id }, 'Created Notion page')
  return response.id
}

/** Nested children a block carries (table rows, sub-list items). */
function childUnits(b: BlockObjectRequest): number {
  const type = (b as { type?: string }).type
  if (!type) return 0
  const inner = (b as Record<string, unknown>)[type] as { children?: unknown[] } | undefined
  return inner && Array.isArray(inner.children) ? inner.children.length : 0
}

/**
 * Chunk blocks so each request stays under Notion's limits: max 100 top-level
 * blocks AND a conservative total-block budget (a table can carry ~90 nested rows,
 * so counting only top-level blocks could blow past the per-request block cap).
 */
function chunkBlocks(blocks: BlockObjectRequest[], maxUnits = 400, maxLen = 90): BlockObjectRequest[][] {
  const chunks: BlockObjectRequest[][] = []
  let cur: BlockObjectRequest[] = []
  let units = 0
  for (const b of blocks) {
    const u = 1 + childUnits(b)
    if (cur.length > 0 && (units + u > maxUnits || cur.length >= maxLen)) {
      chunks.push(cur)
      cur = []
      units = 0
    }
    cur.push(b)
    units += u
  }
  if (cur.length) chunks.push(cur)
  return chunks
}

export async function appendBlocks(pageId: string, blocks: BlockObjectRequest[]): Promise<void> {
  const notion = getClient()
  for (const chunk of chunkBlocks(blocks)) {
    await withRetry(
      () => notion.blocks.children.append({ block_id: pageId, children: chunk }),
      'blocks.append'
    )
  }
}

export async function createDatabase(params: {
  parentPageId: string
  title: string
  properties: CreateDatabaseParameters['properties']
}): Promise<string> {
  const notion = getClient()
  const response = await withRetry(
    () =>
      notion.databases.create({
        parent: { page_id: params.parentPageId },
        title: [{ text: { content: truncate(params.title || 'Untitled', 2000) } }],
        properties: params.properties,
      }),
    'databases.create'
  )
  logger.debug({ dbId: response.id }, 'Created Notion database')
  return response.id
}

export async function createDatabaseRow(
  databaseId: string,
  properties: Record<string, unknown>
): Promise<string> {
  const notion = getClient()
  const response = await withRetry(
    () =>
      notion.pages.create({
        parent: { database_id: databaseId },
        properties: properties as Parameters<typeof notion.pages.create>[0]['properties'],
      }),
    'rows.create'
  )
  return response.id
}

/**
 * Add a native Notion comment to a page. Returns false (without throwing) if the
 * integration lacks comment-insert capability, so the caller can stop trying.
 * Notion limits rich_text content to 2000 chars per item, so long comments are chunked.
 */
export async function addComment(pageId: string, text: string): Promise<boolean> {
  const notion = getClient()
  const content = text.trim() || '(empty comment)'
  const chunks: { text: { content: string } }[] = []
  for (let i = 0; i < content.length; i += 2000) {
    chunks.push({ text: { content: content.slice(i, i + 2000) } })
  }
  try {
    await withRetry(
      () => notion.comments.create({ parent: { page_id: pageId }, rich_text: chunks }),
      'comments.create'
    )
    return true
  } catch (err: unknown) {
    const e = err as { code?: string; status?: number }
    // 403 / restricted_resource => integration has no "Insert comments" capability
    if (e?.status === 403 || e?.code === 'restricted_resource' || e?.code === 'unauthorized') {
      return false
    }
    throw err
  }
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…'
}

export function resetClient(): void {
  _client = null
}
