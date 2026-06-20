import { fetch } from 'undici'
import { z } from 'zod'
import { getConfig } from '../config.js'
import { logger } from '../logger.js'
import { assertSafeUrl } from '../safety/index.js'

const QUIP_BASE = 'https://platform.quip.com/1'

const QuipUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  emails: z.array(z.string()).optional(),
  private_folder_id: z.string().optional(),
  desktop_folder_id: z.string().optional(),
  archive_folder_id: z.string().optional(),
  starred_folder_id: z.string().optional(),
  trash_folder_id: z.string().optional(),
  group_folder_ids: z.array(z.string()).optional(),
  shared_folder_ids: z.array(z.string()).optional(),
})

const QuipThreadSchema = z.object({
  thread: z.object({
    id: z.string(),
    title: z.string(),
    type: z.enum(['document', 'spreadsheet', 'slides', 'chat']),
    created_usec: z.number(),
    updated_usec: z.number(),
    author_id: z.string().optional(),
    link: z.string(),
    document_id: z.string().optional(),
  }),
  html: z.string().optional(),
})

const QuipFolderSchema = z.object({
  folder: z.object({
    id: z.string(),
    title: z.string(),
    creator_id: z.string().optional(),
    created_usec: z.number(),
    updated_usec: z.number(),
    color: z.string().optional(),
  }),
  children: z.array(
    z.union([
      z.object({ thread_id: z.string() }),
      z.object({ folder_id: z.string() }),
    ])
  ),
})

const QuipBlobSchema = z.object({
  url: z.string(),
})

// Quip comments/annotations come from the messages endpoint. We keep the schema
// permissive (passthrough) because Quip returns many optional fields.
const QuipMessageSchema = z
  .object({
    id: z.string(),
    author_id: z.string().optional(),
    author_name: z.string().optional(),
    created_usec: z.number().optional(),
    updated_usec: z.number().optional(),
    text: z.string().optional(),
    visible: z.boolean().optional(),
    annotation: z
      .object({ id: z.string().optional() })
      .passthrough()
      .optional(),
  })
  .passthrough()

const QuipMessageListSchema = z.array(QuipMessageSchema)

const QuipUserListSchema = z.record(z.string(), z.object({ name: z.string().optional() }))

export type QuipThread = z.infer<typeof QuipThreadSchema>
export type QuipFolder = z.infer<typeof QuipFolderSchema>
export type QuipUser = z.infer<typeof QuipUserSchema>
export type QuipMessage = z.infer<typeof QuipMessageSchema>

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  options: { method?: string; body?: Record<string, unknown> } = {}
): Promise<T> {
  const url = `${QUIP_BASE}${path}`
  assertSafeUrl(url)

  const { QUIP_TOKEN } = getConfig()
  let attempt = 0
  // Quip's company rate limit can hand out very large Retry-After values (~27 min).
  // We cap the wait and re-probe instead, and allow many attempts so a request can
  // outlast a rate-limit window without giving up.
  const maxAttempts = 24
  const MAX_BACKOFF_MS = 300_000 // 5 minutes

  while (attempt < maxAttempts) {
    const res = await fetch(url, {
      method: options.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${QUIP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    })

    if (res.status === 429 || res.status >= 500) {
      const retryAfter = Number(res.headers.get('Retry-After') ?? 0)
      const raw = Math.max(retryAfter * 1000, Math.pow(2, attempt) * 1000)
      const delay = Math.min(raw, MAX_BACKOFF_MS)
      logger.warn(
        `Quip rate limit / server error (status ${res.status}), retrying in ${Math.round(delay / 1000)}s (attempt ${attempt + 1}/${maxAttempts})...`
      )
      await sleep(delay)
      attempt++
      continue
    }

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Quip API error ${res.status} at ${path}: ${body}`)
    }

    const json = await res.json()
    return schema.parse(json)
  }

  throw new Error(`Quip API: exhausted ${maxAttempts} retries for ${path}`)
}

export class QuipClient {
  async getCurrentUser(): Promise<QuipUser> {
    return request('/users/current', QuipUserSchema)
  }

  async getFolder(folderId: string): Promise<QuipFolder> {
    return request(`/folders/${folderId}`, QuipFolderSchema)
  }

  async getThread(threadId: string): Promise<QuipThread> {
    return request(`/threads/${threadId}`, QuipThreadSchema)
  }

  async getThreadHtml(threadId: string): Promise<string> {
    const thread = await request(`/threads/${threadId}`, QuipThreadSchema)
    return thread.html ?? ''
  }

  async listFolders(folderIds: string[]): Promise<Record<string, QuipFolder>> {
    const ids = folderIds.join(',')
    const schema = z.record(z.string(), QuipFolderSchema)
    return request(`/folders/?ids=${ids}`, schema)
  }

  async listThreads(threadIds: string[]): Promise<Record<string, QuipThread>> {
    const ids = threadIds.join(',')
    const schema = z.record(z.string(), QuipThreadSchema)
    return request(`/threads/?ids=${ids}`, schema)
  }

  async getBlobUrl(threadId: string, blobId: string): Promise<string> {
    const result = await request(`/blob/${threadId}/${blobId}`, QuipBlobSchema)
    return result.url
  }

  /**
   * Fetch ALL messages (comments/annotations) for a thread, oldest-first.
   * The Quip API returns messages newest-first in pages of up to 100; we page
   * backwards with max_created_usec until exhausted (capped to avoid runaways).
   */
  async getMessages(threadId: string): Promise<QuipMessage[]> {
    const all: QuipMessage[] = []
    const seen = new Set<string>()
    let cursor: number | undefined
    const MAX_PAGES = 50 // 50 * 100 = up to 5000 comments per doc

    for (let page = 0; page < MAX_PAGES; page++) {
      const qs = `count=100${cursor !== undefined ? `&max_created_usec=${cursor}` : ''}`
      const batch = await request(`/messages/${threadId}?${qs}`, QuipMessageListSchema)
      if (batch.length === 0) break

      let added = 0
      let minCreated = Number.POSITIVE_INFINITY
      for (const m of batch) {
        if (typeof m.created_usec === 'number') minCreated = Math.min(minCreated, m.created_usec)
        if (seen.has(m.id)) continue
        seen.add(m.id)
        all.push(m)
        added++
      }

      if (batch.length < 100 || added === 0 || !Number.isFinite(minCreated)) break
      cursor = minCreated - 1
    }

    all.sort((a, b) => (a.created_usec ?? 0) - (b.created_usec ?? 0))
    return all
  }

  /** Resolve user ids to display names (best-effort, for older docs lacking author_name). */
  async getUsers(userIds: string[]): Promise<Record<string, { name?: string }>> {
    if (userIds.length === 0) return {}
    const ids = userIds.join(',')
    return request(`/users/?ids=${ids}`, QuipUserListSchema)
  }
}
