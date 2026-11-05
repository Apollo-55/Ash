// Runs before the npm scripts that need dependencies: in a fresh clone node_modules is missing,
// so install it from the lockfile. Must not import any dependency itself.
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// npm writes this file last, so an interrupted install is detected too.
if (!existsSync(join(root, 'node_modules/.package-lock.json'))) {
  console.log('→ Abhängigkeiten fehlen, führe npm ci aus')
  execSync('npm ci', { cwd: root, stdio: 'inherit' })
}
