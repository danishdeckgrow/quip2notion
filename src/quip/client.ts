import { fetch } from 'undici'
import { z } from 'zod'
import { getConfig } from '../config.js'
import { logger } from '../logger.js'
import { assertSafeUrl } from '../safety/index.js'

const QUIP_BASE = 'https://platform.quip.com/1'

const QuipUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  emails: z.array(z.string()),
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

export type QuipThread = z.infer<typeof QuipThreadSchema>
export type QuipFolder = z.infer<typeof QuipFolderSchema>
export type QuipUser = z.infer<typeof QuipUserSchema>

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
  const maxAttempts = 5

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
      const delay = Math.max(retryAfter * 1000, Math.pow(2, attempt) * 1000)
      logger.warn(`Quip rate limit / server error (status ${res.status}), retrying in ${delay}ms...`)
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
}
