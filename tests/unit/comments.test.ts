import { describe, it, expect } from 'vitest'
import { renderComments } from '../../src/transform/comments.js'
import type { QuipMessage } from '../../src/quip/index.js'

const usec = (ms: number) => ms * 1000

describe('renderComments', () => {
  it('returns nothing for no messages', () => {
    const r = renderComments([])
    expect(r.count).toBe(0)
    expect(r.blocks).toEqual([])
    expect(r.nativeTexts).toEqual([])
  })

  it('ignores messages without text (highlight-only annotations)', () => {
    const msgs: QuipMessage[] = [
      { id: 'a', annotation: { id: 'x' } },
      { id: 'b', text: '   ' },
    ]
    expect(renderComments(msgs).count).toBe(0)
  })

  it('renders standalone comments chronologically with a header + divider', () => {
    const msgs: QuipMessage[] = [
      { id: 'a', author_name: 'Alice', created_usec: usec(1_700_000_000_000), text: 'first' },
      { id: 'b', author_name: 'Bob', created_usec: usec(1_700_000_100_000), text: 'second' },
    ]
    const r = renderComments(msgs)
    expect(r.count).toBe(2)
    expect(r.blocks[0].type).toBe('divider')
    expect(r.blocks[1].type).toBe('heading_2')
    const items = r.blocks.slice(2)
    expect(items).toHaveLength(2)
    expect(items.every((b) => b.type === 'bulleted_list_item')).toBe(true)
  })

  it('groups comments sharing an annotation into a thread with nested replies', () => {
    const msgs: QuipMessage[] = [
      { id: 'a', author_name: 'Alice', created_usec: usec(1_700_000_000_000), text: 'parent', annotation: { id: 'x' } },
      { id: 'b', author_name: 'Bob', created_usec: usec(1_700_000_100_000), text: 'reply', annotation: { id: 'x' } },
    ]
    const r = renderComments(msgs)
    expect(r.count).toBe(2)
    const items = r.blocks.slice(2)
    expect(items).toHaveLength(1) // one top-level item, reply nested
    const parent = items[0] as { bulleted_list_item: { children?: unknown[] } }
    expect(parent.bulleted_list_item.children).toHaveLength(1)
  })

  it('preserves author name and original date in native comment text', () => {
    const msgs: QuipMessage[] = [
      { id: 'a', author_name: 'Alice', created_usec: usec(1_700_000_000_000), text: 'hello world' },
    ]
    const r = renderComments(msgs)
    expect(r.nativeTexts).toHaveLength(1)
    expect(r.nativeTexts[0]).toContain('Alice')
    expect(r.nativeTexts[0]).toContain('hello world')
    expect(r.nativeTexts[0]).toContain('UTC')
  })

  it('falls back to author_id lookup when author_name is missing', () => {
    const msgs: QuipMessage[] = [{ id: 'a', author_id: 'u1', created_usec: usec(1_700_000_000_000), text: 'hi' }]
    const r = renderComments(msgs, { u1: 'Charlie' })
    expect(r.nativeTexts[0]).toContain('Charlie')
  })

  it('uses "Unknown" when neither name nor id resolves', () => {
    const msgs: QuipMessage[] = [{ id: 'a', created_usec: usec(1_700_000_000_000), text: 'hi' }]
    expect(renderComments(msgs).nativeTexts[0]).toContain('Unknown')
  })
})
