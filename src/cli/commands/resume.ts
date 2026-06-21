import { Command } from 'commander'
import { Migrator } from '../../migrator.js'
import type { CommentMode } from '../../migrator.js'
import { getConfig } from '../../config.js'
import { getAllMigrations, upsertMigration } from '../../state/index.js'
import { logger } from '../../logger.js'

export function resumeCommand(): Command {
  return new Command('resume')
    .description('Resume an interrupted migration from where it left off')
    .option('--concurrency <n>', 'Concurrent API requests (1-10)', '4')
    .option('--comments <mode>', 'Comment import: in-page | native | both | none', 'both')
    .action(async (opts) => {
      const config = getConfig()
      const targetPageId = config.NOTION_TARGET_PAGE_ID

      if (!targetPageId) {
        logger.error('NOTION_TARGET_PAGE_ID is required. Set it in .env.')
        process.exit(1)
      }

      const inProgress = getAllMigrations().filter((r) => r.status === 'in_progress')
      for (const rec of inProgress) {
        upsertMigration({ ...rec, status: 'pending', startedAt: null, completedAt: null })
      }

      if (inProgress.length > 0) {
        logger.info({ count: inProgress.length }, 'Reset interrupted records to pending')
      }

      const concurrency = Math.min(10, Math.max(1, parseInt(opts.concurrency, 10) || 4))
      const validModes: CommentMode[] = ['in-page', 'native', 'both', 'none']
      const comments: CommentMode = validModes.includes(opts.comments) ? opts.comments : 'both'

      const migrator = new Migrator({ dryRun: false, concurrency, targetPageId, comments })
      await migrator.run()
    })
}
