import { Command } from 'commander'
import fs from 'node:fs'
import { QuipClient } from '../../quip/index.js'
import { getConfig } from '../../config.js'
import { upsertMigration, getAllMigrations } from '../../state/index.js'
import { logger } from '../../logger.js'

export interface PlanFolder {
  id: string
  title: string
  parent: string | null
}

export interface PlanDoc {
  id: string
  title: string
  type: string
  parent: string
}

export interface Plan {
  roots: string[]
  folders: PlanFolder[]
  docs: PlanDoc[]
}

export function planCommand(): Command {
  return new Command('plan')
    .description('Discover your Quip workspace and create a migration plan')
    .option('--folder-id <id>', 'Limit discovery to a single Quip folder (default: all your folders)')
    .option('--include-trash', 'Include the Trash folder (excluded by default)', false)
    .option('--include-system', 'Include Quip system folders (Desktop/Archive/Starred)', true)
    .option('--config <path>', 'Path to .env config file', '.env')
    .option('--verbose', 'Verbose output')
    .action(async (opts) => {
      getConfig()
      const quip = new QuipClient()

      logger.info('Discovering Quip workspace...')
      const user = await quip.getCurrentUser()
      logger.info({ name: user.name, userId: user.id }, 'Authenticated')

      // Assemble root folders. Order matters: real/shared content is discovered
      // first so that shortcut-only folders (Starred) dedupe to empty afterwards.
      let roots: string[]
      if (opts.folderId) {
        roots = [opts.folderId]
      } else {
        const sys = opts.includeSystem
        roots = [
          user.private_folder_id,
          ...(user.shared_folder_ids ?? []),
          ...(user.group_folder_ids ?? []),
          ...(sys ? [user.desktop_folder_id, user.archive_folder_id] : []),
          ...(sys ? [user.starred_folder_id] : []), // last: shortcuts dedupe away
          ...(opts.includeTrash ? [user.trash_folder_id] : []),
        ].filter((x): x is string => typeof x === 'string' && x.length > 0)
      }
      // De-duplicate while preserving order.
      roots = [...new Set(roots)]
      logger.info({ rootCount: roots.length }, 'Root folders to scan')

      const ctx: DiscoverCtx = {
        quip,
        folders: [],
        docs: [],
        seenFolders: new Set(),
        seenDocs: new Set(),
        processed: 0,
      }
      for (const r of roots) {
        await discoverFolder(ctx, r, null, 0)
      }

      logger.info(
        { folders: ctx.folders.length, docs: ctx.docs.length },
        'Raw discovery complete — pruning empty folders'
      )

      const { folders, docs } = pruneEmpty(ctx.folders, ctx.docs, roots)
      const keptRoots = roots.filter((r) => folders.some((f) => f.id === r))

      // Persist plan.json (drives the migrator) and seed the state DB for status tracking.
      const plan: Plan = { roots: keptRoots, folders, docs }
      fs.writeFileSync('plan.json', JSON.stringify(plan, null, 2))

      const existing = new Map(getAllMigrations().map((r) => [r.quipId, r]))
      for (const doc of docs) {
        if (existing.get(doc.id)?.status === 'success') continue
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

      const byType = docs.reduce<Record<string, number>>((acc, d) => {
        acc[d.type] = (acc[d.type] ?? 0) + 1
        return acc
      }, {})

      logger.info(
        { folders: folders.length, documents: docs.length, byType, stateFile: 'plan.json' },
        'Plan created'
      )
      logger.info('Next: quip2notion migrate --dry-run   (preview the tree, no writes)')
    })
}

interface DiscoverCtx {
  quip: InstanceType<typeof QuipClient>
  folders: PlanFolder[]
  docs: PlanDoc[]
  seenFolders: Set<string>
  seenDocs: Set<string>
  processed: number
}

async function discoverFolder(
  ctx: DiscoverCtx,
  folderId: string,
  parentId: string | null,
  depth: number
): Promise<void> {
  if (depth > 25) return
  if (ctx.seenFolders.has(folderId)) return
  ctx.seenFolders.add(folderId)

  let folder
  try {
    folder = await ctx.quip.getFolder(folderId)
  } catch (err) {
    logger.warn({ folderId, error: err instanceof Error ? err.message : String(err) }, 'Skipping unreadable folder')
    return
  }

  ctx.folders.push({ id: folderId, title: folder.folder.title || '(untitled folder)', parent: parentId })
  ctx.processed++
  if (ctx.processed % 10 === 0) logger.info({ folders: ctx.processed, docs: ctx.docs.length }, 'Discovering...')

  const threadIds: string[] = []
  const subFolderIds: string[] = []
  for (const child of folder.children) {
    if ('thread_id' in child) threadIds.push(child.thread_id)
    if ('folder_id' in child) subFolderIds.push(child.folder_id)
  }

  const BATCH = 50
  for (let i = 0; i < threadIds.length; i += BATCH) {
    const batch = threadIds.slice(i, i + BATCH)
    let threads: Record<string, { thread: { id: string; title: string; type: string } }>
    try {
      threads = await ctx.quip.listThreads(batch)
    } catch (err) {
      logger.warn({ error: err instanceof Error ? err.message : String(err) }, 'Batch fetch failed; trying individually')
      threads = {}
      for (const id of batch) {
        try {
          const t = await ctx.quip.getThread(id)
          threads[id] = t
        } catch {
          logger.warn({ threadId: id }, 'Skipping unreadable thread')
        }
      }
    }
    for (const t of Object.values(threads)) {
      const id = t.thread.id
      if (ctx.seenDocs.has(id)) continue // dedupe across folders (e.g. Starred shortcuts)
      ctx.seenDocs.add(id)
      ctx.docs.push({ id, title: t.thread.title || 'Untitled', type: t.thread.type, parent: folderId })
    }
  }

  for (const subId of subFolderIds) {
    await discoverFolder(ctx, subId, folderId, depth + 1)
  }
}

/** Remove folders whose entire subtree contains no documents. */
function pruneEmpty(folders: PlanFolder[], docs: PlanDoc[], roots: string[]): { folders: PlanFolder[]; docs: PlanDoc[] } {
  const childrenOf = new Map<string, string[]>()
  for (const f of folders) {
    if (f.parent) {
      if (!childrenOf.has(f.parent)) childrenOf.set(f.parent, [])
      childrenOf.get(f.parent)!.push(f.id)
    }
  }
  const docCount = new Map<string, number>()
  for (const d of docs) docCount.set(d.parent, (docCount.get(d.parent) ?? 0) + 1)

  const hasDocs = new Map<string, boolean>()
  function subtreeHasDocs(id: string): boolean {
    if (hasDocs.has(id)) return hasDocs.get(id)!
    hasDocs.set(id, false) // guard against cycles
    let result = (docCount.get(id) ?? 0) > 0
    for (const c of childrenOf.get(id) ?? []) {
      if (subtreeHasDocs(c)) result = true
    }
    hasDocs.set(id, result)
    return result
  }
  for (const r of roots) subtreeHasDocs(r)

  const keptFolders = folders.filter((f) => hasDocs.get(f.id))
  const keptIds = new Set(keptFolders.map((f) => f.id))
  const keptDocs = docs.filter((d) => keptIds.has(d.parent))
  return { folders: keptFolders, docs: keptDocs }
}
