import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

vi.mock('../../src/quip/client.js', () => ({
  QuipClient: vi.fn().mockImplementation(() => ({
    getCurrentUser: vi.fn().mockResolvedValue({
      id: 'user1',
      name: 'Test User',
      emails: ['test@example.com'],
    }),
    getThread: vi.fn().mockResolvedValue({
      thread: {
        id: 'thread1',
        title: 'Test Document',
        type: 'document',
        created_usec: 1_000_000,
        updated_usec: 2_000_000,
        link: 'https://quip.com/thread1',
      },
      html: '<h1>Hello World</h1><p>Some content.</p>',
    }),
    getMessages: vi.fn().mockResolvedValue([]),
  })),
}))

vi.mock('../../src/notion/client.js', () => ({
  createPage: vi.fn().mockResolvedValue('notion-page-123'),
  appendBlocks: vi.fn().mockResolvedValue(undefined),
  createDatabase: vi.fn().mockResolvedValue('notion-db-123'),
  createDatabaseRow: vi.fn().mockResolvedValue('notion-row-123'),
  addComment: vi.fn().mockResolvedValue(true),
  resetClient: vi.fn(),
}))

vi.mock('../../src/config.js', () => ({
  getConfig: vi.fn().mockReturnValue({
    QUIP_TOKEN: 'test-token',
    NOTION_TOKEN: 'test-notion-token',
    NOTION_TARGET_PAGE_ID: 'target-page',
    LOG_LEVEL: 'silent',
    CONCURRENCY: 2,
  }),
  resetConfig: vi.fn(),
}))

let tmpDb: string
const planPath = path.join(process.cwd(), 'plan.json')

const PLAN = {
  roots: ['folder1'],
  folders: [{ id: 'folder1', title: 'Test Folder', parent: null }],
  docs: [{ id: 'thread1', title: 'Test Document', type: 'document', parent: 'folder1' }],
}

beforeEach(async () => {
  tmpDb = path.join(os.tmpdir(), `migrator-test-${Date.now()}-${Math.random()}.db`)
  const { getDb, upsertMigration } = await import('../../src/state/index.js')
  getDb(tmpDb)
  fs.writeFileSync(planPath, JSON.stringify(PLAN))

  upsertMigration({
    quipId: 'thread1',
    quipTitle: 'Test Document',
    quipType: 'document',
    notionPageId: null,
    status: 'pending',
    errorMessage: null,
    startedAt: null,
    completedAt: null,
  })
})

afterEach(async () => {
  const { closeDb } = await import('../../src/state/index.js')
  closeDb()
  for (const suffix of ['', '-shm', '-wal']) {
    const p = tmpDb + suffix
    if (fs.existsSync(p)) fs.unlinkSync(p)
  }
  for (const f of ['plan.json', 'report.json', 'report.html']) {
    const p = path.join(process.cwd(), f)
    if (fs.existsSync(p)) fs.unlinkSync(p)
  }
  vi.clearAllMocks()
})

describe('Migrator dry-run', () => {
  it('previews the tree without writing to Notion or mutating state', async () => {
    const { Migrator } = await import('../../src/migrator.js')
    const notion = await import('../../src/notion/client.js')

    const migrator = new Migrator({ dryRun: true, concurrency: 1, targetPageId: 'target', comments: 'none' })
    await migrator.run()

    expect(vi.mocked(notion.createPage)).not.toHaveBeenCalled()

    const { getAllMigrations } = await import('../../src/state/index.js')
    const records = getAllMigrations()
    // Dry-run must not mark anything as migrated.
    expect(records.every((r) => r.status === 'pending')).toBe(true)
  })
})

describe('Migrator execute', () => {
  it('creates folder + document pages and writes report files', async () => {
    const { Migrator } = await import('../../src/migrator.js')
    const notion = await import('../../src/notion/client.js')

    const migrator = new Migrator({ dryRun: false, concurrency: 1, targetPageId: 'target', comments: 'none' })
    await migrator.run()

    // One call for the folder page, one for the document page.
    expect(vi.mocked(notion.createPage).mock.calls.length).toBeGreaterThanOrEqual(2)

    const { getAllMigrations } = await import('../../src/state/index.js')
    const records = getAllMigrations()
    expect(records[0].status).toBe('success')
    expect(records[0].notionPageId).toBe('notion-page-123')

    expect(fs.existsSync(path.join(process.cwd(), 'report.json'))).toBe(true)
    expect(fs.existsSync(path.join(process.cwd(), 'report.html'))).toBe(true)
  })
})
