import { describe, it, expect } from 'vitest'
import { redactTokens, isSafeUrl, assertSafeUrl } from '../../src/safety/index.js'

describe('redactTokens', () => {
  it('redacts Quip token format', () => {
    const input = 'Authorization: Bearer QUIPabcdefghijklmnop12345'
    expect(redactTokens(input)).toContain('[REDACTED]')
    expect(redactTokens(input)).not.toContain('QUIPabcdefghijklmnop12345')
  })

  it('redacts Notion secret_ token', () => {
    const input = 'token=secret_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXY1'
    expect(redactTokens(input)).toContain('[REDACTED]')
    expect(redactTokens(input)).not.toContain('secret_abcdefghijklmnop')
  })

  it('passes clean strings through unchanged', () => {
    const input = 'Hello, world!'
    expect(redactTokens(input)).toBe('Hello, world!')
  })

  it('handles multiple tokens in one string', () => {
    const input = 'a=QUIPabcdefghijklmnop12345 b=QUIPzyxwvutsrqponmlkji54321'
    const out = redactTokens(input)
    expect(out).not.toContain('QUIPabcdefghijklmnop12345')
    expect(out).not.toContain('QUIPzyxwvutsrqponmlkji54321')
  })
})

describe('isSafeUrl', () => {
  it('allows platform.quip.com', () => {
    expect(isSafeUrl('https://platform.quip.com/1/threads/abc')).toBe(true)
  })

  it('allows quip.com', () => {
    expect(isSafeUrl('https://quip.com/dev/token')).toBe(true)
  })

  it('allows api.notion.com', () => {
    expect(isSafeUrl('https://api.notion.com/v1/pages')).toBe(true)
  })

  it('allows S3 URLs for Notion uploads', () => {
    expect(isSafeUrl('https://notion-uploads.s3.amazonaws.com/file.pdf')).toBe(true)
    expect(isSafeUrl('https://bucket.s3.us-east-1.amazonaws.com/file.pdf')).toBe(true)
  })

  it('blocks unknown hosts', () => {
    expect(isSafeUrl('https://evil.com/steal?data=x')).toBe(false)
    expect(isSafeUrl('https://google.com')).toBe(false)
    expect(isSafeUrl('https://notnotion.com')).toBe(false)
  })

  it('blocks malformed URLs', () => {
    expect(isSafeUrl('not-a-url')).toBe(false)
    expect(isSafeUrl('')).toBe(false)
  })
})

describe('assertSafeUrl', () => {
  it('throws for blocked hosts', () => {
    expect(() => assertSafeUrl('https://evil.com')).toThrow('Blocked request')
  })

  it('does not throw for allowed hosts', () => {
    expect(() => assertSafeUrl('https://api.notion.com/v1/pages')).not.toThrow()
    expect(() => assertSafeUrl('https://platform.quip.com/1/users/current')).not.toThrow()
  })
})
