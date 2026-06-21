import { describe, it, expect } from 'vitest'
import {
  headingBlock,
  paragraphBlock,
  codeBlock,
  bulletedListBlock,
  numberedListBlock,
  dividerBlock,
  calloutBlock,
  imageBlock,
  paragraphToggle,
  commentItemBlock,
  normalizeCodeLanguage,
} from '../../src/notion/blocks.js'

describe('block builders', () => {
  it('builds headings at each level', () => {
    expect(headingBlock(1, 'a').type).toBe('heading_1')
    expect(headingBlock(2, 'b').type).toBe('heading_2')
    expect(headingBlock(3, 'c').type).toBe('heading_3')
  })

  it('builds basic blocks', () => {
    expect(paragraphBlock('p').type).toBe('paragraph')
    expect(bulletedListBlock('b').type).toBe('bulleted_list_item')
    expect(numberedListBlock('n').type).toBe('numbered_list_item')
    expect(dividerBlock().type).toBe('divider')
    expect(imageBlock('https://x/y.png').type).toBe('image')
  })

  it('callout and toggle render as paragraphs with prefixes', () => {
    const c = calloutBlock('note') as any
    expect(c.type).toBe('paragraph')
    expect(c.paragraph.rich_text[0].text.content).toContain('note')
    const t = paragraphToggle('title') as any
    expect(t.paragraph.rich_text[0].text.content).toContain('title')
  })

  it('truncates over-long content to Notion limits', () => {
    const c = calloutBlock('x'.repeat(5000)) as any
    expect(c.paragraph.rich_text[0].text.content.length).toBeLessThanOrEqual(2000)
  })

  it('normalizes code languages (valid, alias, unknown, empty)', () => {
    expect(normalizeCodeLanguage('javascript')).toBe('javascript')
    expect(normalizeCodeLanguage('JS')).toBe('javascript')
    expect(normalizeCodeLanguage('ts')).toBe('typescript')
    expect(normalizeCodeLanguage('totally-made-up')).toBe('plain text')
    expect(normalizeCodeLanguage('')).toBe('plain text')
    expect(normalizeCodeLanguage(undefined)).toBe('plain text')
  })

  it('codeBlock uses a normalized language', () => {
    const b = codeBlock('const x = 1', 'js') as any
    expect(b.type).toBe('code')
    expect(b.code.language).toBe('javascript')
  })

  it('commentItemBlock embeds author/date and supports nested replies', () => {
    const plain = commentItemBlock('Alice', '2024-01-01 00:00 UTC', 'hi') as any
    expect(plain.type).toBe('bulleted_list_item')
    expect(plain.bulleted_list_item.rich_text[0].text.content).toContain('Alice')
    const withChild = commentItemBlock('Bob', '', 'parent', [plain]) as any
    expect(withChild.bulleted_list_item.children).toHaveLength(1)
  })
})
