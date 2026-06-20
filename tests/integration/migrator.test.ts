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
  })),
}))

vi.mock('../../src/notion/client.js', () => ({
  createPage: vi.fn().mockResolvedValue('notion-page-123'),
  appendBlocks: vi.fn().mockResolvedValue(undefined),
  createDatabase: vi.fn().mockResolvedValue('notion-db-123'),
  createDatabaseRow: vi.fn().mockResolvedValue('notion-row-123'),
  addComment: vi.fn().mockResolvedValue(undefined),
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

beforeEach(async () => {
  tmpDb = path.join(os.tmpdir(), `migrator-test-${Date.now()}-${Math.random()}.db`)
  const { getDb, upsertMigration } = await import('../../src/state/index.js')
  getDb(tmpDb)

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
})

describe('Migrator dry-run', () => {
  it('marks pending records as success without calling Notion', async () => {
    const { Migrator } = await import('../../src/migrator.js')
    const migrator = new Migrator({ dryRun: true, concurrency: 1, targetPageId: 'target' })
    await migrator.run()

    const { getAllMigrations } = await import('../../src/state/index.js')
    const records = getAllMigrations()
    expect(records.every((r) => r.status === 'success')).toBe(true)
    expect(records[0].notionPageId).toBe('dry-run')
  })

  it('generates report files after dry-run', async () => {
    const { Migrator } = await import('../../src/migrator.js')
    const migrator = new Migrator({ dryRun: true, concurrency: 1, targetPageId: 'target' })
    await migrator.run()

    expect(fs.existsSync(path.join(process.cwd(), 'report.json'))).toBe(true)
    expect(fs.existsSync(path.join(process.cwd(), 'report.html'))).toBe(true)
  })
})
