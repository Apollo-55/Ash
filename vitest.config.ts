import { defineConfig } from 'vitest/config'
// packages/*: system-independent, systems/<id>/*: per game system
export default defineConfig({ test: { include: ['packages/*/test/**/*.test.ts', 'systems/*/*/test/**/*.test.ts'] } })
