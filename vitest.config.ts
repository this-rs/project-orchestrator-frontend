import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: [],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    coverage: {
      provider: 'v8',
      // json → coverage/coverage-final.json, consumed by the patch-coverage
      // gate (scripts/check-patch-coverage.mjs). text-summary for CI logs.
      reporter: ['text-summary', 'json'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/__tests__/**',
        'src/**/*.d.ts',
        'src/main.tsx',
        'src/vite-env.d.ts',
      ],
      // Only files exercised by the test suite are reported; the patch gate
      // therefore enforces coverage on changed lines in already-tested
      // modules without forcing tests onto every untested file on first touch.
      all: false,
    },
  },
})
