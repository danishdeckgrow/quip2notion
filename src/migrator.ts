import fs from 'node:fs'
import pLimit from 'p-limit'
import { QuipClient } from './quip/index.js'
import {
  createPage,
  appendBlocks,
  createDatabase,
  createDatabaseRow,
  addComment,
} from './notion/index.js'
import { htmlToBlocks } from './transform/htmlToBlocks.js'
import { renderComments } from './transform/comments.js'
import {
  parseSpreadsheetHtml,
  buildDatabaseProperties,
  buildRowProperties,
} from './transform/spreadsheetToDatabase.js'
import {
  upsertMigration,
  getAllMigrations,
  setFolderMapping,
  getFolderMapping,
} from './state/index.js'
import { buildReport, writeJsonReport, writeHtmlReport } from './report/index.js'
import { getConfig } from './config.js'
import { logger } from './logger.js'
import type { Plan, PlanFolder, PlanDoc } from './cli/commands/plan.js'

export type CommentMode = 'in-page' | 'native' | 'both' | 'none'

export interface MigrateOptions {
  dryRun: boolean
  concurrency?: number
  targetPageId: string
  comments?: CommentMode
}

export class Migrator {
  private quip = new QuipClient()
  private aborted = false
  private nativeCommentsDisabled = false
  private commentsImported = 0
  private commentMode: CommentMode

  constructor(private opts: MigrateOptions) {
    this.commentMode = opts.comments ?? 'both'
  }

  private loadPlan(): Plan {
    if (!fs.existsSync('plan.json')) {
      throw new Error('plan.json not found — run "quip2notion plan" first.')
    }
    return JSON.parse(fs.readFileSync('plan.json', 'utf8')) as Plan
  }

  async run(): Promise<void> {
    const startMs = Date.now()
    const { CONCURRENCY } = getConfig()
    const limit = pLimit(this.opts.concurrency ?? CONCURRENCY)

    const sigintHandler = () => {
      logger.info('Interrupted — finishing in-flight requests and saving state...')
      this.aborted = true
    }
    process.once('SIGINT', sigintHandler)

    const plan = this.loadPlan()
    logger.info(
      { dryRun: this.opts.dryRun, folders: plan.folders.length, docs: plan.docs.length, comments: this.commentMode },
      'Starting migration'
    )

    const user = await this.quip.getCurrentUser()
    logger.info({ userId: user.id, name: user.name }, 'Authenticated as Quip user')

    if (this.opts.dryRun) {
      this.printTree(plan)
      process.removeListener('SIGINT', sigintHandler)
      return
    }

    // ---- Phase 1: recreate the folder tree as Notion pages (top-down) ----
    const folderNotion = new Map<string, string>()
    const resolveParent = (folderId: string | null): string | undefined =>
      folderId === null
        ? this.opts.targetPageId
        : folderNotion.get(folderId) ?? getFolderMapping(folderId) ?? undefined

    logger.info({ count: plan.folders.length }, 'Creating folder pages')
    for (const f of plan.folders) {
      if (this.aborted) break
      const existing = getFolderMapping(f.id)
      if (existing) {
        folderNotion.set(f.id, existing)
        continue
      }
      const parentNotion = resolveParent(f.parent)
      if (!parentNotion) {
        logger.warn({ folder: f.title, id: f.id }, 'No Notion parent resolved — skipping folder')
        continue
      }
      const pageId = await createPage({ parentPageId: parentNotion, title: f.title })
      folderNotion.set(f.id, pageId)
      setFolderMapping(f.id, pageId, f.title)
      logger.debug({ folder: f.title, pageId }, 'Folder page created')
    }

    // ---- Phase 2: migrate documents under their folders ----
    const statusById = new Map(getAllMigrations().map((r) => [r.quipId, r]))
    const pending = plan.docs.filter((d) => statusById.get(d.id)?.status !== 'success')
    logger.info({ count: pending.length }, 'Migrating documents')

    const tasks = pending.map((doc) =>
      limit(async () => {
        if (this.aborted) return
        const rec = statusById.get(doc.id)
        try {
          upsertMigration({
            quipId: doc.id,
            quipTitle: doc.title,
            quipType: doc.type,
            notionPageId: rec?.notionPageId ?? null,
            status: 'in_progress',
            errorMessage: null,
            startedAt: Date.now(),
            completedAt: null,
          })

          const parentNotion =
            (doc.parent ? resolveParent(doc.parent) : this.opts.targetPageId) ?? this.opts.targetPageId

          const thread = await this.quip.getThread(doc.id)
          const html = thread.html ?? ''

          let notionPageId: string
          if (thread.thread.type === 'spreadsheet') {
            notionPageId = await this.migrateSpreadsheet(doc.title, html, parentNotion)
            await this.importComments(doc, parentNotion, null) // companion page for sheet comments
          } else {
            notionPageId = await this.migrateDocument(doc.title, html, parentNotion)
            await this.importComments(doc, parentNotion, notionPageId)
          }

          upsertMigration({
            quipId: doc.id,
            quipTitle: doc.title,
            quipType: doc.type,
            notionPageId,
            status: 'success',
            errorMessage: null,
            startedAt: Date.now(),
            completedAt: Date.now(),
          })
          logger.info({ title: doc.title, notionPageId }, 'Migrated')
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          logger.error({ quipId: doc.id, title: doc.title, error: msg }, 'Migration failed')
          upsertMigration({
            quipId: doc.id,
            quipTitle: doc.title,
            quipType: doc.type,
            notionPageId: rec?.notionPageId ?? null,
            status: 'failed',
            errorMessage: msg,
            startedAt: Date.now(),
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
    logger.info({ ...summary, commentsImported: this.commentsImported }, 'Migration complete')
  }

  private async migrateDocument(title: string, html: string, parentPageId: string): Promise<string> {
    const blocks = htmlToBlocks(html)
    // Create the page empty, then append in size-aware chunks. Tables carry many
    // nested rows, so seeding children at create time can exceed Notion's limits.
    const pageId = await createPage({ parentPageId, title })
    if (blocks.length > 0) await appendBlocks(pageId, blocks)
    return pageId
  }

  private async migrateSpreadsheet(title: string, html: string, parentPageId: string): Promise<string> {
    const { headers, rows } = parseSpreadsheetHtml(html)
    const properties = buildDatabaseProperties(headers)
    const dbId = await createDatabase({ parentPageId, title, properties })
    for (const row of rows) {
      await createDatabaseRow(dbId, buildRowProperties(headers, row.cells))
    }
    return dbId
  }

  /**
   * Fetch Quip comments for a doc and write them per the chosen mode.
   * For text documents, pageId is the doc's Notion page.
   * For spreadsheets, pageId is null and a companion "(comments)" page is created
   * under the same folder (Notion databases can't hold body blocks or comments).
   */
  private async importComments(
    doc: PlanDoc,
    parentNotion: string,
    pageId: string | null
  ): Promise<void> {
    if (this.commentMode === 'none') return
    try {
      const messages = await this.quip.getMessages(doc.id)
      const rendered = renderComments(messages)
      if (rendered.count === 0) return

      let targetPage = pageId
      if (targetPage === null) {
        // Spreadsheet: put comments on a companion page next to the database.
        targetPage = await createPage({
          parentPageId: parentNotion,
          title: `${doc.title} (comments)`,
          children: rendered.blocks.slice(0, 100),
        })
        if (rendered.blocks.length > 100) await appendBlocks(targetPage, rendered.blocks.slice(100))
      } else if (this.commentMode === 'in-page' || this.commentMode === 'both') {
        await appendBlocks(targetPage, rendered.blocks)
      }

      if (this.commentMode === 'native' || this.commentMode === 'both') {
        if (!this.nativeCommentsDisabled) {
          for (const text of rendered.nativeTexts) {
            const ok = await addComment(targetPage, text)
            if (!ok) {
              this.nativeCommentsDisabled = true
              logger.warn(
                'Notion integration lacks "Insert comments" capability — keeping comments as in-page sections only. ' +
                  'Enable it at notion.so/my-integrations to also post native comments.'
              )
              break
            }
          }
        }
      }

      this.commentsImported += rendered.count
      logger.debug({ title: doc.title, comments: rendered.count }, 'Comments imported')
    } catch (err) {
      // Never fail a doc because its comments couldn't be imported — the body is already saved.
      logger.warn(
        { quipId: doc.id, title: doc.title, error: err instanceof Error ? err.message : String(err) },
        'Comment import failed (document body was migrated)'
      )
    }
  }

  private printTree(plan: Plan): void {
    const childrenOf = new Map<string, PlanFolder[]>()
    for (const f of plan.folders) {
      const key = f.parent ?? '__root__'
      if (!childrenOf.has(key)) childrenOf.set(key, [])
      childrenOf.get(key)!.push(f)
    }
    const docCount = new Map<string, number>()
    for (const d of plan.docs) docCount.set(d.parent, (docCount.get(d.parent) ?? 0) + 1)

    const lines: string[] = []
    const walk = (folder: PlanFolder, depth: number) => {
      const indent = '  '.repeat(depth)
      const n = docCount.get(folder.id) ?? 0
      lines.push(`${indent}📁 ${folder.title}${n ? `  (${n} docs)` : ''}`)
      for (const sub of childrenOf.get(folder.id) ?? []) walk(sub, depth + 1)
    }
    for (const root of childrenOf.get('__root__') ?? []) walk(root, 0)

    const byType = plan.docs.reduce<Record<string, number>>((a, d) => {
      a[d.type] = (a[d.type] ?? 0) + 1
      return a
    }, {})

    logger.info('DRY RUN — this is the structure that will be created under your Notion target page:')
    // eslint-disable-next-line no-console
    console.log('\n' + lines.join('\n') + '\n')
    logger.info(
      { topLevelPages: (childrenOf.get('__root__') ?? []).length, totalFolders: plan.folders.length, totalDocs: plan.docs.length, byType },
      'Dry-run summary'
    )
    logger.info(`Comments mode on execute: ${this.commentMode}. Run "quip2notion migrate --execute" to perform the migration.`)
  }
}
