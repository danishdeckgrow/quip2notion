import pLimit from 'p-limit'
import { QuipClient } from './quip/index.js'
import { createPage, appendBlocks, createDatabase, createDatabaseRow } from './notion/index.js'
import { htmlToBlocks } from './transform/htmlToBlocks.js'
import {
  parseSpreadsheetHtml,
  buildDatabaseProperties,
  buildRowProperties,
} from './transform/spreadsheetToDatabase.js'
import { upsertMigration, getAllMigrations } from './state/index.js'
import { buildReport, writeJsonReport, writeHtmlReport } from './report/index.js'
import { getConfig } from './config.js'
import { logger } from './logger.js'

export interface MigrateOptions {
  dryRun: boolean
  concurrency?: number
  targetPageId: string
}

export class Migrator {
  private quip = new QuipClient()
  private aborted = false

  constructor(private opts: MigrateOptions) {}

  async run(): Promise<void> {
    const startMs = Date.now()
    const { CONCURRENCY } = getConfig()
    const limit = pLimit(this.opts.concurrency ?? CONCURRENCY)

    const sigintHandler = () => {
      logger.info('Interrupted — finishing in-flight requests and saving state...')
      this.aborted = true
    }
    process.once('SIGINT', sigintHandler)

    logger.info({ dryRun: this.opts.dryRun, targetPageId: this.opts.targetPageId }, 'Starting migration')

    const user = await this.quip.getCurrentUser()
    logger.info({ userId: user.id, name: user.name }, 'Authenticated as Quip user')

    const pending = getAllMigrations().filter(
      (r) => r.status === 'pending' || r.status === 'in_progress'
    )

    if (pending.length === 0) {
      logger.info('No pending migrations found. Run "quip2notion plan" first.')
      process.removeListener('SIGINT', sigintHandler)
      return
    }

    logger.info({ count: pending.length, dryRun: this.opts.dryRun }, 'Migrating documents')

    const tasks = pending.map((rec) =>
      limit(async () => {
        if (this.aborted) return

        try {
          upsertMigration({ ...rec, status: 'in_progress', startedAt: Date.now(), completedAt: null })

          if (this.opts.dryRun) {
            logger.info({ quipId: rec.quipId, title: rec.quipTitle }, '[dry-run] Would migrate')
            upsertMigration({
              ...rec,
              status: 'success',
              startedAt: Date.now(),
              completedAt: Date.now(),
              notionPageId: 'dry-run',
            })
            return
          }

          const thread = await this.quip.getThread(rec.quipId)
          const html = thread.html ?? ''

          let notionPageId: string

          if (thread.thread.type === 'spreadsheet') {
            notionPageId = await this.migrateSpreadsheet(rec.quipTitle, html, this.opts.targetPageId)
          } else {
            notionPageId = await this.migrateDocument(rec.quipTitle, html, this.opts.targetPageId)
          }

          upsertMigration({
            ...rec,
            status: 'success',
            notionPageId,
            startedAt: rec.startedAt ?? Date.now(),
            completedAt: Date.now(),
          })
          logger.info({ quipId: rec.quipId, notionPageId }, 'Migrated')
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          logger.error({ quipId: rec.quipId, error: msg }, 'Migration failed')
          upsertMigration({
            ...rec,
            status: 'failed',
            errorMessage: msg,
            startedAt: rec.startedAt ?? Date.now(),
            completedAt: Date.now(),
          })
        }
      })
    )

    await Promise.all(tasks)
    process.removeListener('SIGINT', sigintHandler)

    const allRecords = getAllMigrations()
    const summary = buildReport(allRecords, startMs, Date.now())
    writeJsonReport(allRecords, summary)
    writeHtmlReport(allRecords, summary)

    logger.info(summary, 'Migration complete')
  }

  private async migrateDocument(
    title: string,
    html: string,
    parentPageId: string
  ): Promise<string> {
    const blocks = htmlToBlocks(html)

    const pageId = await createPage({
      parentPageId,
      title,
      children: blocks.slice(0, 100),
    })

    if (blocks.length > 100) {
      await appendBlocks(pageId, blocks.slice(100))
    }

    return pageId
  }

  private async migrateSpreadsheet(
    title: string,
    html: string,
    parentPageId: string
  ): Promise<string> {
    const { headers, rows } = parseSpreadsheetHtml(html)
    const properties = buildDatabaseProperties(headers)

    const dbId = await createDatabase({ parentPageId, title, properties })

    for (const row of rows) {
      const rowProps = buildRowProperties(headers, row.cells)
      await createDatabaseRow(dbId, rowProps)
    }

    return dbId
  }
}
