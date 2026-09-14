import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'gateway/src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**'],
      reporter: ['text', 'html'],
      // Per-file: pure utils must stay covered; browser-only voice pipeline body is not unit-testable in node
      thresholds: {
        'src/lib/utils.ts': { lines: 70 },
      },
    },
  },
})
