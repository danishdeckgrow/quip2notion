import type { BlockObjectRequest } from '@notionhq/client/build/src/api-endpoints.js'

export function headingBlock(level: 1 | 2 | 3, text: string): BlockObjectRequest {
  const t = truncate(text, 2000)
  const rt = [{ type: 'text' as const, text: { content: t } }]
  if (level === 1) return { type: 'heading_1', heading_1: { rich_text: rt } }
  if (level === 2) return { type: 'heading_2', heading_2: { rich_text: rt } }
  return { type: 'heading_3', heading_3: { rich_text: rt } }
}

export function paragraphBlock(text: string): BlockObjectRequest {
  return {
    type: 'paragraph',
    paragraph: {
      rich_text: [{ type: 'text', text: { content: truncate(text, 2000) } }],
    },
  }
}

export function codeBlock(code: string, language = 'plain text'): BlockObjectRequest {
  return {
    type: 'code',
    code: {
      rich_text: [{ type: 'text', text: { content: truncate(code, 2000) } }],
      language: language as 'plain text',
    },
  }
}

export function bulletedListBlock(text: string): BlockObjectRequest {
  return {
    type: 'bulleted_list_item',
    bulleted_list_item: {
      rich_text: [{ type: 'text', text: { content: truncate(text, 2000) } }],
    },
  }
}

export function numberedListBlock(text: string): BlockObjectRequest {
  return {
    type: 'numbered_list_item',
    numbered_list_item: {
      rich_text: [{ type: 'text', text: { content: truncate(text, 2000) } }],
    },
  }
}

export function dividerBlock(): BlockObjectRequest {
  return { type: 'divider', divider: {} }
}

export function calloutBlock(text: string): BlockObjectRequest {
  return {
    type: 'paragraph',
    paragraph: {
      rich_text: [{ type: 'text', text: { content: `💡 ${truncate(text, 1998)}` } }],
    },
  }
}

export function imageBlock(url: string): BlockObjectRequest {
  return {
    type: 'image',
    image: { type: 'external', external: { url } },
  }
}

export function paragraphToggle(title: string): BlockObjectRequest {
  return paragraphBlock(`▶ ${title}`)
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max - 1) + '…'
}
