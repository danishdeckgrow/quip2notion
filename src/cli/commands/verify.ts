import { Command } from 'commander'
import { QuipClient } from '../../quip/index.js'
import { getAllMigrations } from '../../state/index.js'
import { logger } from '../../logger.js'

export function verifyCommand(): Command {
  return new Command('verify')
    .description('Spot-check N random migrated pages against their Quip source')
    .option('-n, --count <n>', 'Number of pages to verify', '5')
    .action(async (opts) => {
      const quip = new QuipClient()
      const count = parseInt(opts.count, 10) || 5

      const succeeded = getAllMigrations().filter(
        (r) => r.status === 'success' && r.notionPageId && r.notionPageId !== 'dry-run'
      )

      if (succeeded.length === 0) {
        logger.info('No successfully migrated pages to verify.')
        return
      }

      const sample = [...succeeded].sort(() => Math.random() - 0.5).slice(0, count)

      logger.info({ count: sample.length }, 'Verifying sample...')

      let passed = 0
      let failed = 0

      for (const rec of sample) {
        try {
          const thread = await quip.getThread(rec.quipId)
          const titleMatch = thread.thread.title === rec.quipTitle

          if (titleMatch) {
            logger.info({ quipId: rec.quipId, title: rec.quipTitle }, 'PASS: Title matches')
            passed++
          } else {
            logger.warn(
              { quipId: rec.quipId, quipTitle: thread.thread.title, migratedTitle: rec.quipTitle },
              'WARN: Title mismatch'
            )
            failed++
          }
        } catch (err) {
          logger.error({ quipId: rec.quipId, error: String(err) }, 'FAIL: Could not fetch from Quip')
          failed++
        }
      }

      logger.info({ passed, failed, total: sample.length }, 'Verification complete')
    })
}
