import { Command } from 'commander'
import { getAllMigrations } from '../../state/index.js'
import { buildReport, writeJsonReport, writeHtmlReport } from '../../report/index.js'
import { logger } from '../../logger.js'

export function reportCommand(): Command {
  return new Command('report')
    .description('Print a summary of the latest migration run')
    .option('--open', 'Open report.html in the browser after generating')
    .action(async (opts) => {
      const records = getAllMigrations()

      if (records.length === 0) {
        logger.info('No migration records found. Run "quip2notion plan" first.')
        return
      }

      const now = Date.now()
      const summary = buildReport(records, now, now)
      writeJsonReport(records, summary)
      writeHtmlReport(records, summary)

      logger.info(summary, 'Report generated')
      logger.info('Files written: report.html, report.json')

      if (opts.open) {
        const { exec } = await import('node:child_process')
        exec('open report.html')
      }
    })
}
