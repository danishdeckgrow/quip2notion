import { describe, it, expect } from 'vitest'
import { htmlToBlocks } from '../../src/transform/htmlToBlocks.js'
import {
  parseSpreadsheetHtml,
  buildDatabaseProperties,
  buildRowProperties,
} from '../../src/transform/spreadsheetToDatabase.js'

describe('htmlToBlocks', () => {
  it('returns empty array for empty input', () => {
    expect(htmlToBlocks('')).toEqual([])
    expect(htmlToBlocks('   ')).toEqual([])
  })

  it('converts H1 headings', () => {
    const blocks = htmlToBlocks('<h1>Hello World</h1>')
    expect(blocks.some((b) => b.type === 'heading_1')).toBe(true)
  })

  it('converts H2 headings', () => {
    const blocks = htmlToBlocks('<h2>Section</h2>')
    expect(blocks.some((b) => b.type === 'heading_2')).toBe(true)
  })

  it('converts H3 headings', () => {
    const blocks = htmlToBlocks('<h3>Subsection</h3>')
    expect(blocks.some((b) => b.type === 'heading_3')).toBe(true)
  })

  it('converts paragraphs', () => {
    const blocks = htmlToBlocks('<p>Some text here</p>')
    expect(blocks.some((b) => b.type === 'paragraph')).toBe(true)
  })

  it('converts unordered lists', () => {
    const blocks = htmlToBlocks('<ul><li>Item one</li><li>Item two</li></ul>')
    expect(blocks.some((b) => b.type === 'bulleted_list_item')).toBe(true)
  })

  it('converts ordered lists', () => {
    const blocks = htmlToBlocks('<ol><li>First</li><li>Second</li></ol>')
    expect(blocks.some((b) => b.type === 'numbered_list_item')).toBe(true)
  })

  it('converts code blocks', () => {
    const blocks = htmlToBlocks('<pre><code>const x = 1</code></pre>')
    expect(blocks.some((b) => b.type === 'code')).toBe(true)
  })

  it('converts blockquotes to native quote blocks', () => {
    const blocks = htmlToBlocks('<blockquote>Important note</blockquote>')
    expect(blocks.some((b) => b.type === 'quote')).toBe(true)
  })

  it('converts tables to Notion table blocks preserving cells', () => {
    const html = '<table><thead><tr><th>A</th><th>B</th></tr></thead>' +
      '<tbody><tr><td>1</td><td>2</td></tr><tr><td>3</td><td>4</td></tr></tbody></table>'
    const blocks = htmlToBlocks(html) as any[]
    const table = blocks.find((b) => b.type === 'table')
    expect(table).toBeTruthy()
    expect(table.table.table_width).toBe(2)
    expect(table.table.has_column_header).toBe(true)
    expect(table.table.children).toHaveLength(3) // header + 2 rows
    const firstData = table.table.children[1].table_row.cells
    expect(firstData[0][0].text.content).toBe('1')
    expect(firstData[1][0].text.content).toBe('2')
  })

  it('preserves inline formatting (bold, italic, links)', () => {
    const blocks = htmlToBlocks('<p>plain <b>bold</b> <i>italic</i> <a href="https://x.com">link</a></p>') as any[]
    const rt = blocks[0].paragraph.rich_text
    const all = rt.map((r: any) => r.text.content).join('')
    expect(all).toContain('bold')
    expect(rt.some((r: any) => r.annotations?.bold)).toBe(true)
    expect(rt.some((r: any) => r.annotations?.italic)).toBe(true)
    expect(rt.some((r: any) => r.text.link?.url === 'https://x.com')).toBe(true)
  })

  it('normalizes ragged table rows to a fixed width', () => {
    const html = '<table><tr><td>a</td><td>b</td><td>c</td></tr><tr><td>x</td></tr></table>'
    const table = (htmlToBlocks(html) as any[]).find((b) => b.type === 'table')
    expect(table.table.table_width).toBe(3)
    for (const row of table.table.children) {
      expect(row.table_row.cells).toHaveLength(3)
    }
  })

  it('nests sub-lists under their parent list item', () => {
    const blocks = htmlToBlocks('<ul><li>parent<ul><li>child</li></ul></li></ul>') as any[]
    const item = blocks.find((b) => b.type === 'bulleted_list_item')
    expect(item).toBeTruthy()
    expect(item.bulleted_list_item.children?.[0]?.type).toBe('bulleted_list_item')
  })

  it('converts checkbox list items to to_do blocks', () => {
    const checked = htmlToBlocks('<ul><li><input type="checkbox" checked/>done</li></ul>') as any[]
    const todo = checked.find((b) => b.type === 'to_do')
    expect(todo).toBeTruthy()
    expect(todo.to_do.checked).toBe(true)
    const open = htmlToBlocks('<ul><li><input type="checkbox"/>todo</li></ul>') as any[]
    expect(open.find((b) => b.type === 'to_do')?.to_do.checked).toBe(false)
  })

  it('emits a placeholder for images and a divider for hr', () => {
    expect(htmlToBlocks('<p><img src="/blob/x/y"/>caption</p>').some((b) => b.type === 'paragraph')).toBe(true)
    expect(htmlToBlocks('<hr/>').some((b) => b.type === 'divider')).toBe(true)
  })

  it('maps h4-h6 down to heading_3', () => {
    expect(htmlToBlocks('<h4>x</h4>').some((b) => b.type === 'heading_3')).toBe(true)
    expect(htmlToBlocks('<h6>y</h6>').some((b) => b.type === 'heading_3')).toBe(true)
  })

  it('recurses into container divs/sections', () => {
    const blocks = htmlToBlocks('<div data-section-style="1"><p>inside</p></div><section><h2>Sec</h2></section>')
    expect(blocks.some((b) => b.type === 'paragraph')).toBe(true)
    expect(blocks.some((b) => b.type === 'heading_2')).toBe(true)
  })

  it('handles complex mixed content', () => {
    const html = '<h1>Title</h1><p>Intro</p><ul><li>A</li><li>B</li></ul>'
    const blocks = htmlToBlocks(html)
    expect(blocks.length).toBeGreaterThan(2)
  })
})

describe('parseSpreadsheetHtml', () => {
  const sampleHtml = `
    <table>
      <tr><th>Name</th><th>Value</th><th>Notes</th></tr>
      <tr><td>Row 1</td><td>42</td><td>First</td></tr>
      <tr><td>Row 2</td><td>99</td><td>Second</td></tr>
    </table>
  `

  it('parses headers from th elements', () => {
    const { headers } = parseSpreadsheetHtml(sampleHtml)
    expect(headers).toEqual(['Name', 'Value', 'Notes'])
  })

  it('parses data rows from td elements', () => {
    const { rows } = parseSpreadsheetHtml(sampleHtml)
    expect(rows).toHaveLength(2)
    expect(rows[0].cells).toEqual(['Row 1', '42', 'First'])
    expect(rows[1].cells).toEqual(['Row 2', '99', 'Second'])
  })

  it('handles empty table gracefully', () => {
    const { headers, rows } = parseSpreadsheetHtml('<table></table>')
    expect(Array.isArray(headers)).toBe(true)
    expect(Array.isArray(rows)).toBe(true)
  })

  it('returns default header when no headers present', () => {
    const { headers } = parseSpreadsheetHtml('<table><tr><td>data</td></tr></table>')
    expect(headers).toEqual(['Column 1'])
  })
})

describe('buildDatabaseProperties', () => {
  it('makes first column a title property', () => {
    const props = buildDatabaseProperties(['Name', 'Amount', 'Notes'])
    expect(props['Name']).toEqual({ title: {} })
  })

  it('makes subsequent columns rich_text', () => {
    const props = buildDatabaseProperties(['Name', 'Amount'])
    expect(props['Amount']).toEqual({ rich_text: {} })
  })

  it('handles single-column spreadsheet', () => {
    const props = buildDatabaseProperties(['Title'])
    expect(props['Title']).toEqual({ title: {} })
  })
})

describe('buildRowProperties', () => {
  it('maps first cell to title', () => {
    const props = buildRowProperties(['Name', 'Amount'], ['Widget', '100'])
    expect(props['Name']).toEqual({ title: [{ text: { content: 'Widget' } }] })
  })

  it('maps subsequent cells to rich_text', () => {
    const props = buildRowProperties(['Name', 'Amount'], ['Widget', '100'])
    expect(props['Amount']).toEqual({ rich_text: [{ text: { content: '100' } }] })
  })

  it('handles fewer cells than headers with empty string', () => {
    const props = buildRowProperties(['A', 'B', 'C'], ['only-one'])
    expect(props['B']).toEqual({ rich_text: [{ text: { content: '' } }] })
    expect(props['C']).toEqual({ rich_text: [{ text: { content: '' } }] })
  })

  it('truncates values exceeding 2000 chars', () => {
    const longValue = 'x'.repeat(3000)
    const props = buildRowProperties(['Name', 'Big'], ['title', longValue])
    const richText = props['Big'] as { rich_text: { text: { content: string } }[] }
    expect(richText.rich_text[0].text.content.length).toBeLessThanOrEqual(2000)
  })
})
