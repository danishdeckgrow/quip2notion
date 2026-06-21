import Database from 'better-sqlite3'
import path from 'node:path'
import { logger } from '../logger.js'

export type MigrationStatus = 'pending' | 'in_progress' | 'success' | 'failed' | 'skipped'

export interface MigrationRecord {
  quipId: string
  quipTitle: string
  quipType: string
  notionPageId: string | null
  status: MigrationStatus
  errorMessage: string | null
  startedAt: number | null
  completedAt: number | null
  retryCount: number
}

let _db: Database.Database | null = null

export function getDb(dbPath?: string): Database.Database {
  if (_db) return _db
  const file = dbPath ?? path.join(process.cwd(), 'migration-state.db')
  _db = new Database(file)
  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')
  initSchema(_db)
  logger.debug({ file }, 'State database opened')
  return _db
}

export function closeDb(): void {
  if (_db) {
    _db.close()
    _db = null
  }
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      quip_id TEXT PRIMARY KEY,
      quip_title TEXT NOT NULL,
      quip_type TEXT NOT NULL,
      notion_page_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      error_message TEXT,
      started_at INTEGER,
      completed_at INTEGER,
      retry_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS folder_map (
      quip_folder_id TEXT PRIMARY KEY,
      notion_page_id TEXT NOT NULL,
      quip_title TEXT NOT NULL
    );
  `)
}

export function upsertMigration(rec: Omit<MigrationRecord, 'retryCount'>): void {
  const db = getDb()
  db.prepare(`
    INSERT INTO migrations (quip_id, quip_title, quip_type, notion_page_id, status, error_message, started_at, completed_at, retry_count)
    VALUES (@quipId, @quipTitle, @quipType, @notionPageId, @status, @errorMessage, @startedAt, @completedAt, 0)
    ON CONFLICT(quip_id) DO UPDATE SET
      notion_page_id = excluded.notion_page_id,
      status = excluded.status,
      error_message = excluded.error_message,
      started_at = COALESCE(migrations.started_at, excluded.started_at),
      completed_at = excluded.completed_at,
      retry_count = migrations.retry_count + 1
  `).run(rec)
}

export function getMigration(quipId: string): MigrationRecord | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM migrations WHERE quip_id = ?').get(quipId) as Record<string, unknown> | undefined
  if (!row) return null
  return rowToRecord(row)
}

export function getAllMigrations(): MigrationRecord[] {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM migrations ORDER BY quip_id').all() as Record<string, unknown>[]
  return rows.map(rowToRecord)
}

export function setFolderMapping(quipFolderId: string, notionPageId: string, title: string): void {
  const db = getDb()
  db.prepare(`
    INSERT OR REPLACE INTO folder_map (quip_folder_id, notion_page_id, quip_title) VALUES (?, ?, ?)
  `).run(quipFolderId, notionPageId, title)
}

export function getFolderMapping(quipFolderId: string): string | null {
  const db = getDb()
  const row = db.prepare('SELECT notion_page_id FROM folder_map WHERE quip_folder_id = ?').get(quipFolderId) as { notion_page_id: string } | undefined
  return row?.notion_page_id ?? null
}

function rowToRecord(row: Record<string, unknown>): MigrationRecord {
  return {
    quipId: row.quip_id as string,
    quipTitle: row.quip_title as string,
    quipType: row.quip_type as string,
    notionPageId: row.notion_page_id as string | null,
    status: row.status as MigrationStatus,
    errorMessage: row.error_message as string | null,
    startedAt: row.started_at as number | null,
    completedAt: row.completed_at as number | null,
    retryCount: row.retry_count as number,
  }
}
