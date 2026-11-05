// Packs a directory into a ZIP under a top-level folder name (shared by the build scripts).
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import JSZip from 'jszip'

export async function zipDir(dir, prefix, out) {
  const zip = new JSZip()
  const walk = (rel) => {
    for (const e of readdirSync(join(dir, rel))) {
      const r = rel ? `${rel}/${e}` : e
      if (statSync(join(dir, r)).isDirectory()) walk(r)
      else zip.file(`${prefix}/${r}`, readFileSync(join(dir, r)))
    }
  }
  walk('')
  writeFileSync(out, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }))
}
