// Builds Vault to Foundry: the Obsidian plugin, the Foundry module and the sync service ZIP.
// The DSA-NSC-Generator is a separate plugin with its own build (npm run build:generator).
//   node tools/build.mjs             → dist/
//   node tools/build.mjs --deploy    → also copy plugin into test-vault and module into $VTF_FOUNDRY_MODULES (if set),
//                                      and pack dist/vault-to-foundry-module.zip for upload to the server
//   node tools/build.mjs --watch --deploy
import { context } from 'esbuild'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { zipDir } from './zip-dir.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const watch = process.argv.includes('--watch')
const deploy = process.argv.includes('--deploy')
const testVault = process.env.VTF_TEST_VAULT ?? join(root, 'test-vault')
const foundryModules = process.env.VTF_FOUNDRY_MODULES // e.g. a mounted <Data>/modules

const pluginOut = join(root, 'dist/obsidian-plugin')
const moduleOut = join(root, 'dist/foundry-module/vault-to-foundry')

function copyStatic() {
  mkdirSync(pluginOut, { recursive: true })
  for (const f of ['manifest.json', 'styles.css']) cpSync(join(root, 'packages/obsidian-plugin', f), join(pluginOut, f))
  mkdirSync(moduleOut, { recursive: true })
  for (const f of ['module.json', 'styles', 'lang']) cpSync(join(root, 'packages/foundry-module', f), join(moduleOut, f), { recursive: true })
}

async function doDeploy() {
  const pluginDir = join(testVault, '.obsidian/plugins/vault-to-foundry')
  if (existsSync(join(testVault, '.obsidian'))) {
    mkdirSync(pluginDir, { recursive: true })
    for (const f of ['main.js', 'manifest.json', 'styles.css']) cpSync(join(pluginOut, f), join(pluginDir, f))
    const cp = join(testVault, '.obsidian/community-plugins.json')
    const list = existsSync(cp) ? JSON.parse(readFileSync(cp, 'utf8')) : []
    if (!list.includes('vault-to-foundry')) writeFileSync(cp, JSON.stringify([...list, 'vault-to-foundry'], null, 2))
    console.log(`→ Plugin in ${pluginDir}`)
  } else {
    console.warn(`! Test-Vault ${testVault} nicht gefunden, Plugin nicht kopiert`)
  }
  if (foundryModules) {
    const target = join(foundryModules, 'vault-to-foundry')
    rmSync(target, { recursive: true, force: true })
    cpSync(moduleOut, target, { recursive: true })
    console.log(`→ Modul in ${target}`)
  }

}

let deployTimer = null
const after = {
  name: 'after-build',
  setup(build) {
    build.onEnd((result) => {
      if (result.errors.length) return
      console.log(`✓ ${build.initialOptions.outfile.replace(root + '/', '')}`)
      if (!watch) return
      // in watch mode: copy/deploy once both outputs have settled
      clearTimeout(deployTimer)
      deployTimer = setTimeout(() => finish().catch((e) => console.error(e)), 300)
    })
  },
}

function packSyncService() {
  const out = join(root, 'dist/vtf-sync')
  mkdirSync(out, { recursive: true })
  for (const f of ['server.mjs', 'Dockerfile', 'docker-compose.example.yml', 'nginx.example.conf']) cpSync(join(root, 'packages/sync-service', f), join(out, f))
}

async function packZips() {
  await zipDir(moduleOut, 'vault-to-foundry', join(root, 'dist/vault-to-foundry-module.zip'))
  await zipDir(pluginOut, 'vault-to-foundry', join(root, 'dist/vault-to-foundry-obsidian.zip'))
  await zipDir(join(root, 'dist/vtf-sync'), 'vtf-sync', join(root, 'dist/vtf-sync.zip'))
  console.log('→ dist/vault-to-foundry-obsidian.zip  (Obsidian: nach <vault>/.obsidian/plugins/ entpacken)')
  console.log('→ dist/vault-to-foundry-module.zip    (Foundry: nach <Data>/modules/ entpacken)')
  console.log('→ dist/vtf-sync.zip                   (Server: neben die docker-compose.yaml entpacken)')
}

async function finish() {
  copyStatic()
  packSyncService()
  if (deploy) await doDeploy()
  await packZips()
}

const common = { bundle: true, sourcemap: watch ? 'inline' : false, logLevel: 'warning', target: 'es2022', plugins: [after] }

const plugin = await context({
  ...common,
  entryPoints: [join(root, 'packages/obsidian-plugin/src/main.ts')],
  outfile: join(pluginOut, 'main.js'),
  format: 'cjs',
  platform: 'browser',
  external: ['obsidian', 'electron', ...builtinModules, ...builtinModules.map((m) => `node:${m}`)],
})
const mod = await context({
  ...common,
  entryPoints: [join(root, 'packages/foundry-module/src/module.ts')],
  outfile: join(moduleOut, 'scripts/module.js'),
  format: 'esm',
  platform: 'browser',
})

if (watch) {
  await Promise.all([plugin.watch(), mod.watch()])
  console.log('Beobachte Änderungen … (Strg+C beendet)')
} else {
  await Promise.all([plugin.rebuild(), mod.rebuild()])
  await Promise.all([plugin.dispose(), mod.dispose()])
  await finish()
}
