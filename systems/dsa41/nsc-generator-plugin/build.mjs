// Builds the Obsidian plugin "DSA-NSC-Generator" – separate from Vault to Foundry (npm run build does not include it).
//   npm run build:generator             → dist/nsc-generator-plugin/ + dist/dsa-nsc-generator-obsidian.zip
//   npm run build:generator -- --deploy → also copy into <test-vault>/.obsidian/plugins/dsa-nsc-generator
//   npm run build:generator -- --watch --deploy
import { context } from 'esbuild'
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { zipDir } from '../../../tools/zip-dir.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../../..')
const watch = process.argv.includes('--watch')
const deploy = process.argv.includes('--deploy')
const testVault = process.env.VTF_TEST_VAULT ?? join(root, 'test-vault')
const out = join(root, 'dist/nsc-generator-plugin')
const PLUGIN_ID = 'dsa-nsc-generator'

async function finish() {
  mkdirSync(out, { recursive: true })
  for (const f of ['manifest.json', 'styles.css']) cpSync(join(here, f), join(out, f))
  for (const f of ['LICENSE', 'NOTICE']) cpSync(join(root, f), join(out, f))
  if (deploy) {
    if (existsSync(join(testVault, '.obsidian'))) {
      const dir = join(testVault, '.obsidian/plugins', PLUGIN_ID)
      mkdirSync(dir, { recursive: true })
      for (const f of ['main.js', 'manifest.json', 'styles.css']) cpSync(join(out, f), join(dir, f))
      console.log(`→ Plugin in ${dir}`)
    } else {
      console.warn(`! Test-Vault ${testVault} nicht gefunden, Plugin nicht kopiert`)
    }
  }
  await zipDir(out, PLUGIN_ID, join(root, 'dist/dsa-nsc-generator-obsidian.zip'))
  console.log('→ dist/dsa-nsc-generator-obsidian.zip (Obsidian: nach <vault>/.obsidian/plugins/ entpacken)')
}

const ctx = await context({
  entryPoints: [join(here, 'src/main.ts')],
  outfile: join(out, 'main.js'),
  bundle: true,
  sourcemap: watch ? 'inline' : false,
  logLevel: 'warning',
  target: 'es2022',
  format: 'cjs',
  platform: 'browser',
  external: ['obsidian', 'electron', ...builtinModules, ...builtinModules.map((m) => `node:${m}`)],
  plugins: [{
    name: 'after-build',
    setup(build) {
      build.onEnd((result) => {
        if (result.errors.length) return
        console.log('✓ dist/nsc-generator-plugin/main.js')
        if (watch) finish().catch((e) => console.error(e))
      })
    },
  }],
})

if (watch) {
  await ctx.watch()
  console.log('Beobachte Änderungen … (Strg+C beendet)')
} else {
  await ctx.rebuild()
  await ctx.dispose()
  await finish()
}
