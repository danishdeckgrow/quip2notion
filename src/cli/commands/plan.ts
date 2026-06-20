import { Command } from 'commander'
import fs from 'node:fs'
import { QuipClient } from '../../quip/index.js'
import { getConfig } from '../../config.js'
import { upsertMigration, getAllMigrations } from '../../state/index.js'
import { logger } from '../../logger.js'
import type { QuipClient as QuipClientType } from '../../quip/index.js'

export function planCommand(): Command {
  return new Command('plan')
    .description('Discover your Quip workspace and create a migration plan')
    .option('--folder-id <id>', 'Quip folder ID to start discovery from')
    .option('--config <path>', 'Path to .env config file', '.env')
    .option('--verbose', 'Verbose output')
    .action(async (opts) => {
      getConfig()
      const quip = new QuipClient()

      logger.info('Discovering Quip workspace...')

      const user = await quip.getCurrentUser()
      logger.info({ name: user.name, email: user.emails[0] }, 'Authenticated')

      const folderId: string | undefined = opts.folderId
      if (!folderId) {
        logger.info('Tip: specify --folder-id <id> to start discovery from a specific Quip folder.')
        logger.info('You can find folder IDs in the Quip URL: https://quip.com/<FOLDER_ID>')
        return
      }

      const discovered: { id: string; title: string; type: string }[] = []
      await discoverFolder(quip, folderId, discovered)

      const existing = new Map(getAllMigrations().map((r) => [r.quipId, r]))

      for (const doc of discovered) {
        const prev = existing.get(doc.id)
        if (prev?.status === 'success') continue
        upsertMigration({
          quipId: doc.id,
          quipTitle: doc.title,
          quipType: doc.type,
          notionPageId: null,
          status: 'pending',
          errorMessage: null,
          startedAt: null,
          completedAt: null,
        })
      }

      const plan = getAllMigrations()
      fs.writeFileSync('plan.json', JSON.stringify(plan, null, 2))

      logger.info({ documents: discovered.length, stateFile: 'plan.json' }, 'Plan created')
      logger.info('Review plan.json, then run: quip2notion migrate --dry-run')
    })
}

async function discoverFolder(
  quip: InstanceType<typeof QuipClientType>,
  folderId: string,
  acc: { id: string; title: string; type: string }[],
  depth = 0
): Promise<void> {
  if (depth > 20) return

  const folder = await quip.getFolder(folderId)
  logger.debug({ folderId, title: folder.folder.title, depth }, 'Discovered folder')

  const threadIds: string[] = []
  const subFolderIds: string[] = []

  for (const child of folder.children) {
    if ('thread_id' in child) threadIds.push(child.thread_id)
    if ('folder_id' in child) subFolderIds.push(child.folder_id)
  }

  if (threadIds.length > 0) {
    const BATCH = 50
    for (let i = 0; i < threadIds.length; i += BATCH) {
      const batch = threadIds.slice(i, i + BATCH)
      const threads = await quip.listThreads(batch)
      for (const [, t] of Object.entries(threads)) {
        acc.push({ id: t.thread.id, title: t.thread.title || 'Untitled', type: t.thread.type })
      }
    }
  }

  for (const subId of subFolderIds) {
    await discoverFolder(quip, subId, acc, depth + 1)
  }
}
