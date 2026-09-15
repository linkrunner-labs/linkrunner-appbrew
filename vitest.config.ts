import path from 'node:path'
import { defineConfig } from 'vitest/config'

const stub = (name: string) => path.resolve(__dirname, `tests/stubs/${name}.ts`)

export default defineConfig({
  resolve: {
    alias: {
      // @gauntlet/* lives on Appbrew's private registry and cannot be installed
      // in CI. The stubs cover only what this package touches.
      '@gauntlet/types': stub('gauntlet-types'),
      '@gauntlet/analytics': stub('gauntlet-analytics'),
      '@gauntlet/state': stub('gauntlet-state'),
      '@gauntlet/local-storage': stub('gauntlet-local-storage'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
