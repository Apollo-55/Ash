// Pushes a vault folder to a vtf-sync service (same code path as the Obsidian plugin's auto-sync).
// Usage: node tools/sync-cli.ts <vault-dir> --url http://localhost:8787 --token … [--name uthuria-ob] [--unused] [--cleanup]
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, join, relative, sep } from 'node:path'
import { actorsOf, buildBundle, createSimpleResolver, dsa41Adapter, fetchHttp, hashBytes, journalsOf, LEAFLET_DATA_PATH, leafletMarkersFromPluginData, pushBundle, scenesOf, SyncClient } from '../packages/core/src/index.ts'

const args = process.argv.slice(2)
const opt = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined }
const vaultDir = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'))!
const url = opt('--url') ?? 'http://localhost:8787'
const token = opt('--token') ?? process.env.VTF_TOKEN ?? ''
const vaultName = opt('--name') ?? basename(vaultDir.replace(/\/+$/, ''))
const client = new SyncClient(url, token, fetchHttp)

const walk = (d: string, out: string[] = []): string[] => {
  for (const e of readdirSync(d)) {
    if (['.obsidian', '.trash', '.git'].includes(e)) continue
    const f = join(d, e)
    if (statSync(f).isDirectory()) walk(f, out)
    else out.push(relative(vaultDir, f).split(sep).join('/'))
  }
  return out
}

const files = walk(vaultDir)
const leafletFile = join(vaultDir, '.obsidian', LEAFLET_DATA_PATH)
const { bundle, assetFiles } = buildBundle({
  vaultName,
  notes: files.filter((f) => f.endsWith('.md')).map((path) => ({ path, content: readFileSync(join(vaultDir, path), 'utf8') })),
  attachments: files.filter((f) => !f.endsWith('.md')),
  resolver: createSimpleResolver(files),
  system: dsa41Adapter,
  leafletMarkers: existsSync(leafletFile) ? leafletMarkersFromPluginData(JSON.parse(readFileSync(leafletFile, 'utf8'))) : {},
  generator: { name: 'vault-to-foundry-sync-cli', version: '0.1.0' },
})

if (args.includes('--unused') || args.includes('--cleanup')) {
  const unused = await client.unused(bundle.vault.slug)
  console.log(`${unused.length} ungenutzte Dateien auf dem Server${unused.length ? ':\n  ' + unused.join('\n  ') : ''}`)
  if (args.includes('--cleanup') && unused.length) console.log('gelöscht:', (await client.cleanup(bundle.vault.slug, unused)).length)
  process.exit(0)
}

const t0 = Date.now()
const r = await pushBundle({
  client,
  bundle,
  assetFiles,
  fileInfo: async (p) => { const d = readFileSync(join(vaultDir, p)); return { hash: hashBytes(d), size: d.length } },
  read: async (p) => new Uint8Array(readFileSync(join(vaultDir, p))),
  onProgress: (done, total, msg) => process.stdout.write(`\r  ${done}/${total} ${msg.slice(0, 60).padEnd(60)}`),
})
if (r.uploaded.length) process.stdout.write('\n')
console.log(`${journalsOf(bundle).length} Journale, ${actorsOf(bundle).length} NSCs, ${scenesOf(bundle).length} Szenen → ${url}`)
console.log(`  ${r.uploaded.length} Dateien hochgeladen, ${r.unchanged} unverändert, ${r.failed.length} Fehler; Revision ${r.revision}${r.bundleUnchanged ? ' (bundle unverändert)' : ''} in ${((Date.now() - t0) / 1000).toFixed(1)} s`)
for (const f of r.failed) console.log('  ✗', f)
