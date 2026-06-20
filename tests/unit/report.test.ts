import { describe, it, expect } from 'vitest'
import { buildReport } from '../../src/report/generator.js'
import type { MigrationRecord } from '../../src/state/index.js'

const makeRecord = (id: string, status: MigrationRecord['status']): MigrationRecord => ({
  quipId: id,
  quipTitle: `Doc ${id}`,
  quipType: 'document',
  notionPageId: status === 'success' ? 'notion-1' : null,
  status,
  errorMessage: status === 'failed' ? 'Some error' : null,
  startedAt: Date.now() - 1000,
  completedAt: Date.now(),
  retryCount: 0,
})

describe('buildReport', () => {
  it('correctly counts all statuses', () => {
    const records: MigrationRecord[] = [
      makeRecord('1', 'success'),
      makeRecord('2', 'success'),
      makeRecord('3', 'failed'),
      makeRecord('4', 'skipped'),
      makeRecord('5', 'pending'),
    ]

    const start = Date.now() - 5000
    const end = Date.now()
    const summary = buildReport(records, start, end)

    expect(summary.total).toBe(5)
    expect(summary.success).toBe(2)
    expect(summary.failed).toBe(1)
    expect(summary.skipped).toBe(1)
    expect(summary.pending).toBe(1)
    expect(summary.durationMs).toBeGreaterThan(0)
    expect(summary.generatedAt).toBeTruthy()
  })

  it('handles empty records', () => {
    const summary = buildReport([], Date.now() - 100, Date.now())
    expect(summary.total).toBe(0)
    expect(summary.success).toBe(0)
    expect(summary.failed).toBe(0)
  })

  it('calculates duration correctly', () => {
    const start = 1000
    const end = 6000
    const summary = buildReport([], start, end)
    expect(summary.durationMs).toBe(5000)
  })

  it('sets generatedAt to ISO string', () => {
    const summary = buildReport([], Date.now() - 100, Date.now())
    expect(summary.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})
