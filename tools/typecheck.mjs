// Type-checks every project with its own tsconfig.json under packages/ and systems/ (new systems are found automatically).
//   node tools/typecheck.mjs          → all projects
//   node tools/typecheck.mjs systems  → only projects below the given folder(s)
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const tsc = join(root, 'node_modules/typescript/bin/tsc')
const bases = process.argv.slice(2).length ? process.argv.slice(2) : ['packages', 'systems']

function find(dir, out = []) {
  if (!existsSync(dir)) return out
  if (existsSync(join(dir, 'tsconfig.json'))) out.push(dir)
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e.startsWith('.')) continue
    const f = join(dir, e)
    if (statSync(f).isDirectory()) find(f, out)
  }
  return out
}

const projects = bases.flatMap((b) => find(resolve(root, b)))
const failed = []
for (const p of projects) {
  const name = relative(root, p)
  const r = spawnSync(process.execPath, [tsc, '-p', p], { stdio: 'inherit' })
  console.log(`${r.status === 0 ? '✓' : '✗'} ${name}`)
  if (r.status !== 0) failed.push(name)
}
if (!projects.length) console.log('keine Projekte gefunden')
if (failed.length) {
  console.error(`\nTypfehler in: ${failed.join(', ')}`)
  process.exit(1)
}
