import domino from '@mixmark-io/domino'
import type { BlockObjectRequest } from '@notionhq/client/build/src/api-endpoints.js'

/**
 * DOM-based Quip HTML → Notion blocks converter.
 * Preserves tables, rich text (bold/italic/underline/strikethrough/code/links),
 * nested + checkbox lists, headings, quotes, code, and dividers.
 *
 * The previous implementation went HTML → markdown → line parser, which had no
 * table support and stripped all inline formatting. This walks the real DOM.
 */

const MAX_SEG = 2000 // Notion rich_text content limit per segment
const MAX_RT = 100 // Notion max rich_text items per block/cell
const TABLE_ROW_CHUNK = 90 // keep a single table block's nested rows well under limits

interface Anno {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strikethrough?: boolean
  code?: boolean
}
interface RT {
  type: 'text'
  text: { content: string; link?: { url: string } }
  annotations?: Anno
}

function kids(node: any): any[] {
  const out: any[] = []
  const cn = node && node.childNodes
  if (!cn) return out
  for (let i = 0; i < cn.length; i++) out.push(cn[i])
  return out
}

function queryAll(node: any, selector: string): any[] {
  try {
    const r = node.querySelectorAll(selector)
    const out: any[] = []
    for (let i = 0; i < r.length; i++) out.push(r[i])
    return out
  } catch {
    return []
  }
}

function pushText(out: RT[], content: string, anno: Anno, link?: string): void {
  if (!content) return
  for (let i = 0; i < content.length; i += MAX_SEG) {
    const seg = content.slice(i, i + MAX_SEG)
    const rt: RT = { type: 'text', text: { content: seg } }
    if (link && /^https?:\/\//i.test(link)) rt.text.link = { url: link }
    if (Object.keys(anno).length) rt.annotations = { ...anno }
    out.push(rt)
  }
}

function applyInlineStyle(el: any, a: Anno): void {
  const style = (el.getAttribute('style') || '').toLowerCase()
  const cls = (el.getAttribute('class') || '').toLowerCase()
  if (/font-weight:\s*(bold|bolder|[6-9]\d\d)/.test(style) || /\bbold\b/.test(cls)) a.bold = true
  if (/font-style:\s*italic/.test(style) || /\bitalic\b/.test(cls)) a.italic = true
  if (/text-decoration[^;]*underline/.test(style)) a.underline = true
  if (/text-decoration[^;]*line-through/.test(style)) a.strikethrough = true
  if (/font-family:[^;]*(mono|courier|consol)/.test(style) || /\b(code|monospace)\b/.test(cls)) a.code = true
}

function richInto(node: any, anno: Anno, link: string | undefined, out: RT[]): void {
  if (node.nodeType === 3) {
    // Strip Quip's zero-width-space placeholders, then collapse whitespace.
    pushText(out, (node.nodeValue || '').replace(/​/g, '').replace(/\s+/g, ' '), anno, link)
    return
  }
  if (node.nodeType !== 1) return
  const tag = (node.tagName || '').toLowerCase()
  if (tag === 'br') {
    pushText(out, '\n', anno, link)
    return
  }
  if (tag === 'img') return // images handled at block level
  const a: Anno = { ...anno }
  let l = link
  if (tag === 'b' || tag === 'strong') a.bold = true
  else if (tag === 'i' || tag === 'em') a.italic = true
  else if (tag === 'u') a.underline = true
  else if (tag === 's' || tag === 'strike' || tag === 'del') a.strikethrough = true
  else if (tag === 'code' || tag === 'tt') a.code = true
  else if (tag === 'a') {
    const href = node.getAttribute('href')
    if (href) l = href
  } else if (tag === 'span') applyInlineStyle(node, a)
  for (const c of kids(node)) richInto(c, a, l, out)
}

function richFromNodes(nodes: any[]): RT[] {
  const out: RT[] = []
  for (const n of nodes) richInto(n, {}, undefined, out)
  return out
}

function richChildren(el: any): RT[] {
  return richFromNodes(kids(el))
}

/** Trim edge whitespace, drop empty segments, clamp to Notion's per-block cap. */
function trimRich(rt: RT[]): RT[] {
  const a = rt.map((r) => ({ ...r, text: { ...r.text } }))
  // Drop whitespace-only segments at the edges (e.g. a trailing <br>), but keep
  // links even if blank.
  while (a.length && !a[0].text.content.trim() && !a[0].text.link) a.shift()
  while (a.length && !a[a.length - 1].text.content.trim() && !a[a.length - 1].text.link) a.pop()
  if (a.length === 0) return []
  a[0].text.content = a[0].text.content.replace(/^\s+/, '')
  a[a.length - 1].text.content = a[a.length - 1].text.content.replace(/\s+$/, '')
  const filtered = a.filter((r) => r.text.content.length > 0 || r.text.link)
  if (filtered.length === 0) return []
  return filtered.slice(0, MAX_RT)
}

const BLOCK_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'ul', 'ol', 'blockquote', 'pre', 'hr', 'table', 'img', 'figure'])
const CONTAINER_TAGS = new Set(['div', 'section', 'article', 'main', 'header', 'footer', 'body', 'html', 'figcaption'])

function heading(level: number, rt: RT[]): BlockObjectRequest {
  const type = level <= 1 ? 'heading_1' : level === 2 ? 'heading_2' : 'heading_3'
  return { type, [type]: { rich_text: rt } } as unknown as BlockObjectRequest
}

function paragraph(rt: RT[]): BlockObjectRequest {
  return { type: 'paragraph', paragraph: { rich_text: rt } } as unknown as BlockObjectRequest
}

function listItem(kind: 'bulleted' | 'numbered', rt: RT[], children: BlockObjectRequest[]): BlockObjectRequest {
  const type = kind === 'numbered' ? 'numbered_list_item' : 'bulleted_list_item'
  const inner: Record<string, unknown> = { rich_text: rt }
  if (children.length) inner.children = children.slice(0, 100)
  return { type, [type]: inner } as unknown as BlockObjectRequest
}

function todoItem(rt: RT[], checked: boolean, children: BlockObjectRequest[]): BlockObjectRequest {
  const inner: Record<string, unknown> = { rich_text: rt, checked }
  if (children.length) inner.children = children.slice(0, 100)
  return { type: 'to_do', to_do: inner } as unknown as BlockObjectRequest
}

function emitList(listEl: any, kind: 'bulleted' | 'numbered', out: BlockObjectRequest[]): void {
  for (const li of kids(listEl)) {
    if (li.nodeType !== 1 || (li.tagName || '').toLowerCase() !== 'li') continue
    const inlineNodes: any[] = []
    const childBlocks: BlockObjectRequest[] = []
    for (const c of kids(li)) {
      const t = c.nodeType === 1 ? (c.tagName || '').toLowerCase() : ''
      if (t === 'ul') emitList(c, 'bulleted', childBlocks)
      else if (t === 'ol') emitList(c, 'numbered', childBlocks)
      else if (t && BLOCK_TAGS.has(t)) emitBlock(c, t, childBlocks)
      else inlineNodes.push(c)
    }
    const rt = trimRich(richFromNodes(inlineNodes))
    const checkbox = queryAll(li, 'input[type="checkbox"]')[0]
    const cls = (li.getAttribute && li.getAttribute('class')) || ''
    if (checkbox || /\b(checked|unchecked|checkbox)\b/.test(cls.toLowerCase())) {
      const checked = (checkbox && checkbox.hasAttribute('checked')) || /\bchecked\b/.test(cls.toLowerCase())
      out.push(todoItem(rt, !!checked, childBlocks))
    } else {
      out.push(listItem(kind, rt, childBlocks))
    }
  }
}

function emitTable(tableEl: any, out: BlockObjectRequest[]): void {
  const trs = queryAll(tableEl, 'tr')
  if (!trs.length) return
  const rows: RT[][][] = trs.map((tr) =>
    kids(tr)
      .filter((n) => n.nodeType === 1 && ['td', 'th'].includes((n.tagName || '').toLowerCase()))
      .map((cell) => trimRich(richChildren(cell)))
  )
  let width = Math.max(1, ...rows.map((r) => r.length))
  width = Math.min(width, 100)
  const norm = (r: RT[][]): RT[][] => {
    const c = r.slice(0, width)
    while (c.length < width) c.push([])
    return c
  }
  const hasHeader = queryAll(tableEl, 'thead th').length > 0 || (queryAll(tableEl, 'thead').length > 0)
  const headerRow = hasHeader ? rows[0] : null
  const bodyRows = hasHeader ? rows.slice(1) : rows

  const makeTable = (rs: RT[][][]): BlockObjectRequest =>
    ({
      type: 'table',
      table: {
        table_width: width,
        has_column_header: hasHeader,
        has_row_header: false,
        children: rs.map((r) => ({ type: 'table_row', table_row: { cells: norm(r) } })),
      },
    }) as unknown as BlockObjectRequest

  if (bodyRows.length === 0) {
    out.push(makeTable(headerRow ? [headerRow] : rows.slice(0, 1)))
    return
  }
  for (let i = 0; i < bodyRows.length; i += TABLE_ROW_CHUNK) {
    const chunk = bodyRows.slice(i, i + TABLE_ROW_CHUNK)
    out.push(makeTable(headerRow ? [headerRow, ...chunk] : chunk))
  }
}

function emitBlock(el: any, tag: string, out: BlockObjectRequest[]): void {
  switch (tag) {
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6': {
      const rt = trimRich(richChildren(el))
      if (rt.length) out.push(heading(Number(tag[1]), rt))
      break
    }
    case 'p': {
      const rt = trimRich(richChildren(el))
      if (rt.length) out.push(paragraph(rt))
      break
    }
    case 'blockquote': {
      const rt = trimRich(richChildren(el))
      if (rt.length) out.push({ type: 'quote', quote: { rich_text: rt } } as unknown as BlockObjectRequest)
      break
    }
    case 'pre': {
      const code = (el.textContent || '').slice(0, MAX_SEG)
      out.push({
        type: 'code',
        code: { rich_text: code ? [{ type: 'text', text: { content: code } }] : [], language: 'plain text' },
      } as unknown as BlockObjectRequest)
      break
    }
    case 'hr':
      out.push({ type: 'divider', divider: {} } as unknown as BlockObjectRequest)
      break
    case 'ul':
      emitList(el, 'bulleted', out)
      break
    case 'ol':
      emitList(el, 'numbered', out)
      break
    case 'table':
      emitTable(el, out)
      break
    case 'figure':
      walk(el, out)
      break
    case 'img':
      out.push(paragraph([{ type: 'text', text: { content: '🖼️ [Image not migrated — see original in Quip]' }, annotations: { italic: true } }]))
      break
  }
}

function walk(parent: any, out: BlockObjectRequest[]): void {
  let inline: any[] = []
  const flush = () => {
    const rt = trimRich(richFromNodes(inline))
    if (rt.length) out.push(paragraph(rt))
    inline = []
  }
  for (const child of kids(parent)) {
    if (child.nodeType === 3) {
      if ((child.nodeValue || '').trim()) inline.push(child)
    } else if (child.nodeType === 1) {
      const tag = (child.tagName || '').toLowerCase()
      if (BLOCK_TAGS.has(tag)) {
        flush()
        emitBlock(child, tag, out)
      } else if (CONTAINER_TAGS.has(tag)) {
        flush()
        walk(child, out)
      } else {
        inline.push(child) // inline element (span, a, b, i, code, …)
      }
    }
  }
  flush()
}

export function htmlToBlocks(html: string): BlockObjectRequest[] {
  if (!html || !html.trim()) return []
  const doc = domino.createDocument(`<body>${html}</body>`, true)
  const out: BlockObjectRequest[] = []
  walk(doc.body, out)
  return out
}

/** Number of nested children a block carries (rows for tables, sub-items for lists). */
export function blockChildCount(b: BlockObjectRequest): number {
  const type = (b as { type?: string }).type
  if (!type) return 0
  const inner = (b as Record<string, any>)[type]
  const children = inner && inner.children
  return Array.isArray(children) ? children.length : 0
}
