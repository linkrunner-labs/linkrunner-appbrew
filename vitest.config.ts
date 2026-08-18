import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      // @gauntlet/* lives on Appbrew's private registry and cannot be installed
      // in CI. Only src/events.ts touches it, and only for AnalyticsEvent.
      '@gauntlet/types': path.resolve(__dirname, 'tests/stubs/gauntlet-types.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
