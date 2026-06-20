import { logger } from '../logger.js'

const ALLOWED_HOSTS = new Set([
  'platform.quip.com',
  'quip.com',
  'api.notion.com',
])

const S3_PATTERN = /^([a-z0-9.-]+\.)?s3(\.[a-z0-9-]+)?\.amazonaws\.com$/

// Patterns matching Quip and Notion token formats for redaction
const TOKEN_PATTERNS = [
  /QUIP[A-Za-z0-9]{20,}/g,
  /secret_[A-Za-z0-9]{43}/g,
  /ntn_[A-Za-z0-9]{43}/g,
]

export function redactTokens(input: string): string {
  let out = input
  for (const pattern of TOKEN_PATTERNS) {
    out = out.replace(pattern, '[REDACTED]')
  }
  return out
}

export function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname
    if (ALLOWED_HOSTS.has(host)) return true
    if (S3_PATTERN.test(host)) return true
    return false
  } catch {
    return false
  }
}

export function assertSafeUrl(url: string): void {
  if (!isSafeUrl(url)) {
    const msg = `Blocked request to disallowed host: ${new URL(url).hostname}`
    logger.error(msg)
    throw new Error(msg)
  }
}
