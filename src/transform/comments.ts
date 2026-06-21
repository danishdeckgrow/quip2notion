import type { BlockObjectRequest } from '@notionhq/client/build/src/api-endpoints.js'
import type { QuipMessage } from '../quip/index.js'
import { commentItemBlock, headingBlock, dividerBlock } from '../notion/blocks.js'

export interface RenderedComments {
  /** Blocks for the in-page "Comments from Quip" section. */
  blocks: BlockObjectRequest[]
  /** One string per comment, for posting as native Notion comments. */
  nativeTexts: string[]
  /** Number of text comments rendered. */
  count: number
}

function fmtDate(usec?: number): string {
  if (!usec) return ''
  // Quip timestamps are microseconds since epoch.
  const d = new Date(Math.floor(usec / 1000))
  if (isNaN(d.getTime())) return ''
  return d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
}

function nameFor(m: QuipMessage, names: Record<string, string>): string {
  return m.author_name || (m.author_id ? names[m.author_id] : '') || 'Unknown'
}

/**
 * Convert Quip messages into a faithful Notion representation.
 * - Only messages that carry text are treated as comments (highlight-only
 *   annotations without text are skipped).
 * - Comments anchored to the same Quip annotation are grouped as a thread:
 *   the first is the parent, the rest become nested replies.
 * - Order is chronological by the first comment in each thread.
 * - Author name and original timestamp are preserved as visible text (Notion's
 *   API cannot set a native comment's author or time).
 */
export function renderComments(
  messages: QuipMessage[],
  authorNames: Record<string, string> = {}
): RenderedComments {
  const comments = messages
    .filter((m) => m.visible !== false && m.text && m.text.trim().length > 0)
    .sort((a, b) => (a.created_usec ?? 0) - (b.created_usec ?? 0))

  if (comments.length === 0) return { blocks: [], nativeTexts: [], count: 0 }

  const byAnnotation = new Map<string, QuipMessage[]>()
  for (const m of comments) {
    const aid = m.annotation?.id
    if (!aid) continue
    if (!byAnnotation.has(aid)) byAnnotation.set(aid, [])
    byAnnotation.get(aid)!.push(m)
  }

  const items: BlockObjectRequest[] = []
  const rendered = new Set<string>()

  for (const m of comments) {
    if (rendered.has(m.id)) continue
    const aid = m.annotation?.id
    const group = aid ? byAnnotation.get(aid)! : [m]

    if (group.length > 1) {
      const [first, ...replies] = group
      const children = replies.map((r) => {
        rendered.add(r.id)
        return commentItemBlock(nameFor(r, authorNames), fmtDate(r.created_usec), r.text ?? '')
      })
      rendered.add(first.id)
      items.push(
        commentItemBlock(nameFor(first, authorNames), fmtDate(first.created_usec), first.text ?? '', children)
      )
    } else {
      rendered.add(m.id)
      items.push(commentItemBlock(nameFor(m, authorNames), fmtDate(m.created_usec), m.text ?? ''))
    }
  }

  const blocks: BlockObjectRequest[] = [
    dividerBlock(),
    headingBlock(2, `💬 Comments from Quip (${comments.length})`),
    ...items,
  ]

  const nativeTexts = comments.map(
    (m) => `${nameFor(m, authorNames)} · ${fmtDate(m.created_usec)}: ${m.text}`
  )

  return { blocks, nativeTexts, count: comments.length }
}
