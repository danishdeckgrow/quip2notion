import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

// Import after each test sets up a fresh db path
let tmpDb: string

beforeEach(() => {
  tmpDb = path.join(os.tmpdir(), `quip2notion-test-${Date.now()}-${Math.random()}.db`)
})

afterEach(async () => {
  const { closeDb } = await import('../../src/state/index.js')
  closeDb()
  if (fs.existsSync(tmpDb)) fs.unlinkSync(tmpDb)
  if (fs.existsSync(tmpDb + '-shm')) fs.unlinkSync(tmpDb + '-shm')
  if (fs.existsSync(tmpDb + '-wal')) fs.unlinkSync(tmpDb + '-wal')
})

describe('upsertMigration and getMigration', () => {
  it('inserts a new record', async () => {
    const { getDb, upsertMigration, getMigration } = await import('../../src/state/index.js')
    getDb(tmpDb)

    upsertMigration({
      quipId: 'abc123',
      quipTitle: 'Test Doc',
      quipType: 'document',
      notionPageId: null,
      status: 'pending',
      errorMessage: null,
      startedAt: null,
      completedAt: null,
    })

    const rec = getMigration('abc123')
    expect(rec).not.toBeNull()
    expect(rec?.quipTitle).toBe('Test Doc')
    expect(rec?.status).toBe('pending')
    expect(rec?.retryCount).toBe(0)
  })

  it('updates status and increments retryCount on conflict', async () => {
    const { getDb, upsertMigration, getMigration } = await import('../../src/state/index.js')
    getDb(tmpDb)

    const base = {
      quipId: 'abc123',
      quipTitle: 'Test Doc',
      quipType: 'document',
      notionPageId: null,
      status: 'pending' as const,
      errorMessage: null,
      startedAt: null,
      completedAt: null,
    }
    upsertMigration(base)
    upsertMigration({ ...base, status: 'success', notionPageId: 'notion-1' })

    const rec = getMigration('abc123')
    expect(rec?.status).toBe('success')
    expect(rec?.notionPageId).toBe('notion-1')
    expect(rec?.retryCount).toBe(1)
  })

  it('returns null for missing record', async () => {
    const { getDb, getMigration } = await import('../../src/state/index.js')
    getDb(tmpDb)
    expect(getMigration('nonexistent')).toBeNull()
  })
})

describe('getAllMigrations', () => {
  it('returns all records', async () => {
    const { getDb, upsertMigration, getAllMigrations } = await import('../../src/state/index.js')
    getDb(tmpDb)

    upsertMigration({ quipId: 'a1', quipTitle: 'A', quipType: 'document', notionPageId: null, status: 'pending', errorMessage: null, startedAt: null, completedAt: null })
    upsertMigration({ quipId: 'b2', quipTitle: 'B', quipType: 'spreadsheet', notionPageId: null, status: 'failed', errorMessage: 'err', startedAt: null, completedAt: null })

    const all = getAllMigrations()
    expect(all.length).toBe(2)
    expect(all.map((r) => r.quipId).sort()).toEqual(['a1', 'b2'])
  })
})

describe('folder mapping', () => {
  it('stores and retrieves quip folder → notion page mapping', async () => {
    const { getDb, setFolderMapping, getFolderMapping } = await import('../../src/state/index.js')
    getDb(tmpDb)

    setFolderMapping('quip-folder-1', 'notion-page-1', 'My Folder')
    expect(getFolderMapping('quip-folder-1')).toBe('notion-page-1')
  })

  it('returns null for unknown folder', async () => {
    const { getDb, getFolderMapping } = await import('../../src/state/index.js')
    getDb(tmpDb)
    expect(getFolderMapping('nonexistent')).toBeNull()
  })

  it('overwrites existing mapping', async () => {
    const { getDb, setFolderMapping, getFolderMapping } = await import('../../src/state/index.js')
    getDb(tmpDb)

    setFolderMapping('folder-1', 'notion-page-old', 'Old')
    setFolderMapping('folder-1', 'notion-page-new', 'New')
    expect(getFolderMapping('folder-1')).toBe('notion-page-new')
  })
})
