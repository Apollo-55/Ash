// Validates every dsa-nsc block in a vault: node tools/nsc-umwandlung/pruefen.ts <vault-dir> [--info]
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { dsa41, findFences } from '../../packages/core/src/index.ts'

const [dir] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const showInfo = process.argv.includes('--info')
const walk = (d: string, out: string[] = []): string[] => {
  for (const e of readdirSync(d)) {
    if (e.startsWith('.')) continue
    const f = join(d, e)
    if (statSync(f).isDirectory()) walk(f, out)
    else if (e.endsWith('.md')) out.push(f)
  }
  return out
}
let blocks = 0, errors = 0, warnings = 0
for (const file of walk(dir)) {
  for (const fence of findFences(readFileSync(file, 'utf8'), 'dsa-nsc')) {
    blocks++
    const r = dsa41.parseNscBlock(fence.content)
    const shown = r.issues.filter((i) => i.level !== 'info' || showInfo)
    errors += r.issues.filter((i) => i.level === 'error').length
    warnings += r.issues.filter((i) => i.level === 'warning').length
    if (shown.length) {
      console.log(`${relative(dir, file)} – ${r.name ?? '?'}`)
      for (const i of shown) console.log(`   ${i.level === 'error' ? '✖' : i.level === 'warning' ? '⚠' : 'ℹ'} ${i.message}`)
    }
  }
}
console.log(`${blocks} Blöcke, ${errors} Fehler, ${warnings} Warnungen`)
