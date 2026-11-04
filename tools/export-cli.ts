// Exports a vault folder to a bundle ZIP without Obsidian (for testing and CI).
// Usage: node tools/export-cli.ts <vault-dir> [out.zip] [--name "Vault Name"] [--exclude pattern]...
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, join, relative, sep } from 'node:path'
import JSZip from 'jszip'
import { actorsOf, buildBundle, createSimpleResolver, hashBytes, journalsOf, LEAFLET_DATA_PATH, leafletMarkersFromPluginData, scenesOf } from '../packages/core/src/index.ts'
import { existsSync } from 'node:fs'
import { dsa41Adapter } from '../systems/dsa41/adapter/src/index.ts'

const args = process.argv.slice(2)
const positional: string[] = []
const excludes: string[] = []
let name: string | undefined
let withSystem = true
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--name') name = args[++i]
  else if (args[i] === '--no-system') withSystem = false
  else if (args[i] === '--exclude') excludes.push(args[++i])
  else positional.push(args[i])
}
const [vaultDir, outFile = 'bundle.zip'] = positional
if (!vaultDir) {
  console.error('Aufruf: node tools/export-cli.ts <vault-ordner> [ausgabe.zip] [--name "Name"] [--exclude muster]')
  process.exit(1)
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === '.obsidian' || entry === '.trash' || entry === '.git') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else out.push(relative(vaultDir, full).split(sep).join('/'))
  }
  return out
}

const files = walk(vaultDir)
const notes = files.filter((f) => f.endsWith('.md')).map((path) => ({ path, content: readFileSync(join(vaultDir, path), 'utf8') }))
const attachments = files.filter((f) => !f.endsWith('.md'))
const vaultName = name ?? basename(vaultDir.replace(/\/+$/, ''))

const leafletFile = join(vaultDir, '.obsidian', LEAFLET_DATA_PATH)
const leafletMarkers = existsSync(leafletFile) ? leafletMarkersFromPluginData(JSON.parse(readFileSync(leafletFile, 'utf8'))) : {}

const { bundle, assetFiles } = buildBundle({
  vaultName,
  notes,
  attachments,
  resolver: createSimpleResolver(files),
  excludePatterns: excludes,
  generator: { name: 'vault-to-foundry-cli', version: '0.1.0' },
  system: withSystem ? dsa41Adapter : undefined,
  leafletMarkers,
})

const zip = new JSZip()
const byZipPath = new Map(bundle.assets.map((a) => [`assets/${a.path}`, a]))
for (const [zipPath, vaultPath] of assetFiles) {
  const data = readFileSync(join(vaultDir, vaultPath))
  const asset = byZipPath.get(zipPath)!
  asset.hash = hashBytes(data)
  asset.size = data.length
  zip.file(zipPath, data, { compression: 'STORE' })
}
zip.file('bundle.json', JSON.stringify(bundle, null, 2))
const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } })
writeFileSync(outFile, buf)

console.log(`Vault „${vaultName}“ → ${outFile} (${(buf.length / 1048576).toFixed(1)} MB)`)
console.log(`  ${journalsOf(bundle).length} Journale, ${actorsOf(bundle).length} NSCs, ${scenesOf(bundle).length} Szenen, ${bundle.folders.length} Ordner, ${bundle.assets.length} Anhänge, ${bundle.skipped.length} übersprungen`)
console.log(`  ${bundle.warnings.length} Warnungen`)
for (const w of bundle.warnings) console.log(`   - [${w.code}] ${w.sourcePath}: ${w.message}`)
