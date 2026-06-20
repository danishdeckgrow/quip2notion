import { Command } from 'commander'
import { Migrator } from '../../migrator.js'
import { getConfig } from '../../config.js'
import { logger } from '../../logger.js'

export function migrateCommand(): Command {
  return new Command('migrate')
    .description('Migrate discovered Quip documents to Notion')
    .option('--dry-run', 'Simulate migration without writing to Notion (default)')
    .option('--execute', 'Perform the actual migration (writes to Notion)')
    .option('--concurrency <n>', 'Concurrent API requests (1-10)', '4')
    .option('--config <path>', 'Path to .env config file', '.env')
    .option('--verbose', 'Verbose output')
    .action(async (opts) => {
      const config = getConfig()

      const dryRun = !opts.execute
      const concurrency = Math.min(10, Math.max(1, parseInt(opts.concurrency, 10) || 4))
      const targetPageId = config.NOTION_TARGET_PAGE_ID

      if (!targetPageId && !dryRun) {
        logger.error('NOTION_TARGET_PAGE_ID is required for --execute. Set it in .env.')
        process.exit(1)
      }

      if (dryRun) {
        logger.info('Running in DRY-RUN mode — no changes will be made to Notion.')
        logger.info('To perform the actual migration, run: quip2notion migrate --execute')
      } else {
        logger.warn('Running in EXECUTE mode — will write to your Notion workspace.')
      }

      const migrator = new Migrator({
        dryRun,
        concurrency,
        targetPageId: targetPageId ?? 'dry-run-target',
      })

      await migrator.run()
    })
}
