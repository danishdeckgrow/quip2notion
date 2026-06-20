import { Command } from 'commander'
import fs from 'node:fs'
import path from 'node:path'
import { logger } from '../../logger.js'

export function initCommand(): Command {
  return new Command('init')
    .description('Interactive setup — creates a .env file from the template')
    .action(() => {
      const envTarget = path.join(process.cwd(), '.env')

      if (fs.existsSync(envTarget)) {
        logger.warn('.env already exists. Remove it first or edit it directly.')
        return
      }

      const template = [
        '# Get your Quip token at https://quip.com/dev/token',
        'QUIP_TOKEN=',
        '',
        '# Create a Notion integration at https://notion.so/my-integrations',
        'NOTION_TOKEN=',
        '',
        '# Notion page ID where content will be placed',
        'NOTION_TARGET_PAGE_ID=',
        '',
        'LOG_LEVEL=info',
        'CONCURRENCY=4',
      ].join('\n')

      fs.writeFileSync(envTarget, template)
      logger.info(
        'Created .env — fill in your QUIP_TOKEN and NOTION_TOKEN, then run: quip2notion plan'
      )
    })
}
