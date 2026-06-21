import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 72,
        statements: 85,
      },
      // Coverage gate applies to the pure transformation + data logic that is
      // unit-tested. HTTP clients (notion/quip), the migrator orchestrator, and
      // CLI wiring are exercised via the integration test and real runs rather
      // than unit coverage, so they're excluded from the gate.
      include: [
        'src/transform/**/*.ts',
        'src/safety/**/*.ts',
        'src/report/generator.ts',
        'src/state/db.ts',
        'src/notion/blocks.ts',
      ],
      exclude: ['**/index.ts'],
    },
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
})
