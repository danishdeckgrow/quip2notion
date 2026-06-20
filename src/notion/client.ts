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

export async function createPage(params: {
  parentPageId: string
  title: string
  properties?: Record<string, unknown>
  children?: BlockObjectRequest[]
}): Promise<string> {
  const notion = getClient()
  const response = await notion.pages.create({
    parent: { page_id: params.parentPageId },
    properties: {
      title: {
        title: [{ text: { content: params.title } }],
      },
      ...(params.properties ?? {}),
    },
    children: params.children ?? [],
  })
  logger.debug({ pageId: response.id }, 'Created Notion page')
  return response.id
}

export async function appendBlocks(pageId: string, blocks: BlockObjectRequest[]): Promise<void> {
  const notion = getClient()
  // Notion allows max 100 blocks per append call
  for (let i = 0; i < blocks.length; i += 100) {
    const chunk = blocks.slice(i, i + 100)
    await notion.blocks.children.append({ block_id: pageId, children: chunk })
  }
}

export async function createDatabase(params: {
  parentPageId: string
  title: string
  properties: CreateDatabaseParameters['properties']
}): Promise<string> {
  const notion = getClient()
  const response = await notion.databases.create({
    parent: { page_id: params.parentPageId },
    title: [{ text: { content: params.title } }],
    properties: params.properties,
  })
  logger.debug({ dbId: response.id }, 'Created Notion database')
  return response.id
}

export async function createDatabaseRow(
  databaseId: string,
  properties: Record<string, unknown>
): Promise<string> {
  const notion = getClient()
  const response = await notion.pages.create({
    parent: { database_id: databaseId },
    properties: properties as Parameters<typeof notion.pages.create>[0]['properties'],
  })
  return response.id
}

export async function addComment(pageId: string, text: string): Promise<void> {
  const notion = getClient()
  await notion.comments.create({
    parent: { page_id: pageId },
    rich_text: [{ text: { content: text } }],
  })
}

export function resetClient(): void {
  _client = null
}
