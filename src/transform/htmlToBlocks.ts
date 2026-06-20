import TurndownService from 'turndown'
import type { BlockObjectRequest } from '@notionhq/client/build/src/api-endpoints.js'
import {
  headingBlock,
  paragraphBlock,
  codeBlock,
  bulletedListBlock,
  numberedListBlock,
  dividerBlock,
  calloutBlock,
  imageBlock,
} from '../notion/blocks.js'

const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' })

export function htmlToBlocks(html: string): BlockObjectRequest[] {
  if (!html.trim()) return []

  const blocks: BlockObjectRequest[] = []
  const markdown = td.turndown(html)
  const lines = markdown.split('\n')

  let inCodeBlock = false
  let codeLines: string[] = []
  let codeLang = 'plain text'

  for (const line of lines) {
    if (line.startsWith('```')) {
      if (!inCodeBlock) {
        inCodeBlock = true
        codeLang = line.slice(3).trim() || 'plain text'
        codeLines = []
      } else {
        blocks.push(codeBlock(codeLines.join('\n'), codeLang))
        inCodeBlock = false
        codeLines = []
      }
      continue
    }

    if (inCodeBlock) {
      codeLines.push(line)
      continue
    }

    if (line.startsWith('# ')) {
      blocks.push(headingBlock(1, line.slice(2)))
    } else if (line.startsWith('## ')) {
      blocks.push(headingBlock(2, line.slice(3)))
    } else if (line.startsWith('### ')) {
      blocks.push(headingBlock(3, line.slice(4)))
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      blocks.push(bulletedListBlock(line.slice(2)))
    } else if (/^\d+\./.test(line)) {
      blocks.push(numberedListBlock(line.replace(/^\d+\.\s*/, '')))
    } else if (line === '---' || line === '***' || line === '___') {
      blocks.push(dividerBlock())
    } else if (line.startsWith('> ')) {
      blocks.push(calloutBlock(line.slice(2)))
    } else if (line.trim() === '') {
      // skip blank lines
    } else {
      const imgMatch = line.match(/^!\[.*?\]\((https?:\/\/.+?)\)$/)
      if (imgMatch) {
        blocks.push(imageBlock(imgMatch[1]))
      } else {
        const plain = line
          .replace(/\*\*(.+?)\*\*/g, '$1')
          .replace(/\*(.+?)\*/g, '$1')
          .replace(/`(.+?)`/g, '$1')
          .replace(/\[(.+?)\]\(.+?\)/g, '$1')
        if (plain.trim()) blocks.push(paragraphBlock(plain))
      }
    }
  }

  return blocks
}
