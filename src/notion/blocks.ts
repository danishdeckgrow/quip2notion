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

// Notion only accepts code languages from a fixed enum; anything else is rejected.
const NOTION_CODE_LANGS = new Set([
  'abap', 'abc', 'agda', 'arduino', 'ascii art', 'assembly', 'bash', 'basic', 'bnf', 'c',
  'c#', 'c++', 'clojure', 'coffeescript', 'coq', 'css', 'dart', 'dhall', 'diff', 'docker',
  'ebnf', 'elixir', 'elm', 'erlang', 'f#', 'flow', 'fortran', 'gherkin', 'glsl', 'go',
  'graphql', 'groovy', 'haskell', 'hcl', 'html', 'idris', 'java', 'javascript', 'json',
  'julia', 'kotlin', 'latex', 'less', 'lisp', 'livescript', 'llvm ir', 'lua', 'makefile',
  'markdown', 'markup', 'matlab', 'mathematica', 'mermaid', 'nix', 'notion formula',
  'objective-c', 'ocaml', 'pascal', 'perl', 'php', 'plain text', 'powershell', 'prolog',
  'protobuf', 'purescript', 'python', 'r', 'racket', 'reason', 'ruby', 'rust', 'sass',
  'scala', 'scheme', 'scss', 'shell', 'smalltalk', 'solidity', 'sql', 'swift', 'toml',
  'typescript', 'vb.net', 'verilog', 'vhdl', 'visual basic', 'webassembly', 'xml', 'yaml',
  'java/c/c++/c#',
])
const CODE_LANG_ALIASES: Record<string, string> = {
  js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript', py: 'python',
  sh: 'shell', zsh: 'shell', console: 'shell', text: 'plain text', txt: 'plain text',
  plaintext: 'plain text', html5: 'html', yml: 'yaml', 'c++': 'c++', cpp: 'c++', cs: 'c#',
  golang: 'go', rb: 'ruby', md: 'markdown',
}

export function normalizeCodeLanguage(lang: string | undefined): string {
  if (!lang) return 'plain text'
  const l = lang.toLowerCase().trim()
  if (NOTION_CODE_LANGS.has(l)) return l
  if (CODE_LANG_ALIASES[l]) return CODE_LANG_ALIASES[l]
  return 'plain text'
}

export function codeBlock(code: string, language = 'plain text'): BlockObjectRequest {
  return {
    type: 'code',
    code: {
      rich_text: [{ type: 'text', text: { content: truncate(code, 2000) } }],
      language: normalizeCodeLanguage(language) as 'plain text',
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
  // The "💡 " prefix is 3 UTF-16 units; keep the whole string within Notion's 2000 limit.
  return {
    type: 'paragraph',
    paragraph: {
      rich_text: [{ type: 'text', text: { content: `💡 ${truncate(text, 1990)}` } }],
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

/**
 * A single Quip comment rendered as a bulleted list item:
 * **Author** · date: comment text. Replies are passed as nested children.
 */
export function commentItemBlock(
  author: string,
  dateStr: string,
  text: string,
  children?: BlockObjectRequest[]
): BlockObjectRequest {
  const meta = dateStr ? `${author || 'Unknown'} · ${dateStr}: ` : `${author || 'Unknown'}: `
  const inner: Record<string, unknown> = {
    rich_text: [
      { type: 'text', text: { content: truncate(meta, 200) }, annotations: { bold: true } },
      { type: 'text', text: { content: truncate(text, 1800) } },
    ],
  }
  // Notion accepts nested children on list items (one level used here for replies).
  if (children && children.length > 0) inner.children = children.slice(0, 100)
  return { type: 'bulleted_list_item', bulleted_list_item: inner } as unknown as BlockObjectRequest
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max - 1) + '…'
}
