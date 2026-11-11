import { spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import JSZip from 'jszip'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fetchHttp, hashString, SyncClient } from '../../core/src/index.ts'

// vtf-sync serves the Foundry module so Foundry can install/update it via manifest URL

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const srv = createServer()
    srv.once('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const port = (srv.address() as { port: number }).port
      srv.close(() => resolve(port))
    })
  })

const procs: ChildProcess[] = []
const dirs: string[] = []

async function start(env: Record<string, string>) {
  const port = await freePort()
  const data = mkdtempSync(join(tmpdir(), 'vtf-sync-data-'))
  dirs.push(data)
  const proc = spawn(process.execPath, [join(__dirname, '..', 'server.mjs')], {
    env: { ...process.env, VTF_TOKEN: 'test-token-0123456789abcdef', VTF_DATA_DIR: data, VTF_PORT: String(port), VTF_PUBLIC_URL: '', ...env },
    stdio: 'ignore',
  })
  procs.push(proc)
  const url = `http://127.0.0.1:${port}`
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${url}/health`)).ok) return url
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error('Dienst startet nicht')
}

let moduleDir: string
const manifest = { id: 'vault-to-foundry', title: 'Vault to Foundry', version: '9.8.7', esmodules: ['scripts/module.js'], compatibility: { minimum: '13' } }

beforeAll(() => {
  moduleDir = mkdtempSync(join(tmpdir(), 'vtf-module-'))
  dirs.push(moduleDir)
  mkdirSync(join(moduleDir, 'scripts'))
  mkdirSync(join(moduleDir, 'lang'))
  writeFileSync(join(moduleDir, 'module.json'), JSON.stringify(manifest))
  writeFileSync(join(moduleDir, 'scripts/module.js'), 'console.log("hallo Foundry")\n'.repeat(50))
  writeFileSync(join(moduleDir, 'lang/de.json'), JSON.stringify({ gruß: 'Grüße' }))
})
afterAll(() => {
  for (const p of procs) p.kill()
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
})

describe('vtf-sync liefert das Foundry-Modul aus', () => {
  it('Manifest mit manifest/download aus VTF_PUBLIC_URL, ohne Token; health nennt die Modulversion', async () => {
    const url = await start({ VTF_MODULE_DIR: moduleDir, VTF_PUBLIC_URL: 'https://dsa.example.org/vtf-sync/' })
    expect(await (await fetch(`${url}/health`)).json()).toMatchObject({ ok: true, module: '9.8.7' })
    const res = await fetch(`${url}/module/module.json`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      ...manifest,
      manifest: 'https://dsa.example.org/vtf-sync/module/module.json',
      download: 'https://dsa.example.org/vtf-sync/module/vault-to-foundry.zip',
    })
  })

  it('ZIP: module.json oben in der ZIP, mit denselben URLs; alle Dateien unverändert', async () => {
    const url = await start({ VTF_MODULE_DIR: moduleDir, VTF_PUBLIC_URL: 'https://dsa.example.org/vtf-sync' })
    const res = await fetch(`${url}/module/vault-to-foundry.zip`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/zip')
    const bytes = new Uint8Array(await res.arrayBuffer())
    const zip = await JSZip.loadAsync(bytes)
    expect(Object.keys(zip.files).sort()).toEqual(['lang/de.json', 'module.json', 'scripts/module.js'])
    expect(JSON.parse(await zip.file('module.json')!.async('string'))).toMatchObject({
      version: '9.8.7',
      manifest: 'https://dsa.example.org/vtf-sync/module/module.json',
      download: 'https://dsa.example.org/vtf-sync/module/vault-to-foundry.zip',
    })
    expect(await zip.file('scripts/module.js')!.async('string')).toBe('console.log("hallo Foundry")\n'.repeat(50))
    expect(JSON.parse(await zip.file('lang/de.json')!.async('string'))).toEqual({ gruß: 'Grüße' })
    // same module → byte-identical zip
    expect(new Uint8Array(await (await fetch(`${url}/module/vault-to-foundry.zip`)).arrayBuffer())).toEqual(bytes)
  })

  it('ohne VTF_PUBLIC_URL: Adresse aus den Proxy-Headern', async () => {
    const url = await start({ VTF_MODULE_DIR: moduleDir })
    const res = await fetch(`${url}/module/module.json`, {
      headers: { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'dsa.example.org', 'x-forwarded-prefix': '/vtf-sync' },
    })
    expect((await res.json()).download).toBe('https://dsa.example.org/vtf-sync/module/vault-to-foundry.zip')
  })

  it('ohne Modul: 404 mit Hinweis, Sync-API läuft weiter', async () => {
    const url = await start({ VTF_MODULE_DIR: join(moduleDir, 'gibt-es-nicht') })
    const res = await fetch(`${url}/module/module.json`)
    expect(res.status).toBe(404)
    expect((await res.json()).error).toMatch(/kein Foundry-Modul/)
    expect(await (await fetch(`${url}/health`)).json()).toMatchObject({ ok: true, module: null })
    expect((await fetch(`${url}/module/anderes.zip`)).status).toBe(404)
  })
})

// … and the Obsidian plugin, so the plugin can update itself (with token)
describe('vtf-sync liefert das Obsidian-Plugin aus', () => {
  const TOKEN = 'test-token-0123456789abcdef'
  const auth = { headers: { authorization: `Bearer ${TOKEN}` } }
  const pluginManifest = JSON.stringify({ id: 'vault-to-foundry', name: 'Vault to Foundry', version: '9.8.7' })
  const mainJs = 'module.exports = "Grüße aus Obsidian"\n'.repeat(40)
  let pluginDir: string

  beforeAll(() => {
    pluginDir = mkdtempSync(join(tmpdir(), 'vtf-plugin-'))
    dirs.push(pluginDir)
    writeFileSync(join(pluginDir, 'manifest.json'), pluginManifest)
    writeFileSync(join(pluginDir, 'main.js'), mainJs)
    writeFileSync(join(pluginDir, 'styles.css'), '.vtf { color: red }\n')
    writeFileSync(join(pluginDir, 'data.json'), '{"syncToken":"geheim"}') // never served
  })

  it('nur mit Token; Info mit Prüfsummen, Dateien unverändert, health nennt die Version', async () => {
    const url = await start({ VTF_PLUGIN_DIR: pluginDir })
    expect(await (await fetch(`${url}/health`)).json()).toMatchObject({ ok: true, plugin: '9.8.7' })
    for (const path of ['/v1/plugin', '/v1/plugin/files/main.js', '/v1/plugin/vault-to-foundry.zip']) {
      expect((await fetch(url + path)).status).toBe(401)
    }
    expect(await (await fetch(`${url}/v1/plugin`, auth)).json()).toEqual({
      id: 'vault-to-foundry',
      version: '9.8.7',
      files: { 'manifest.json': hashString(pluginManifest), 'main.js': hashString(mainJs), 'styles.css': hashString('.vtf { color: red }\n') },
    })
    expect(await (await fetch(`${url}/v1/plugin/files/main.js`, auth)).text()).toBe(mainJs)
    expect((await fetch(`${url}/v1/plugin/files/data.json`, auth)).status).toBe(404)
    expect((await fetch(`${url}/v1/plugin/files/..%2Fserver.mjs`, auth)).status).toBe(404)
    expect((await fetch(`${url}/v1/plugin`, { ...auth, method: 'PUT', body: 'x' })).status).toBe(405)
  })

  it('ZIP für die Erstinstallation: Ordner <id>/ mit den drei Dateien', async () => {
    const url = await start({ VTF_PLUGIN_DIR: pluginDir })
    const res = await fetch(`${url}/v1/plugin/vault-to-foundry.zip`, auth)
    expect(res.headers.get('content-type')).toBe('application/zip')
    const zip = await JSZip.loadAsync(new Uint8Array(await res.arrayBuffer()))
    expect(Object.keys(zip.files).sort()).toEqual(['vault-to-foundry/main.js', 'vault-to-foundry/manifest.json', 'vault-to-foundry/styles.css'])
    expect(await zip.file('vault-to-foundry/main.js')!.async('string')).toBe(mainJs)
  })

  it('SyncClient: pluginInfo und geprüfte Dateien; beschädigte Datei wird abgelehnt', async () => {
    const url = await start({ VTF_PLUGIN_DIR: pluginDir })
    const client = new SyncClient(url, TOKEN, fetchHttp)
    const info = (await client.pluginInfo())!
    expect(info.version).toBe('9.8.7')
    expect(await client.pluginFile(info, 'main.js')).toBe(mainJs)
    expect(await client.pluginFile(info, 'manifest.json')).toBe(pluginManifest)
    await expect(client.pluginFile({ ...info, files: { ...info.files, 'main.js': 'falsch' } }, 'main.js')).rejects.toThrow(/Prüfsumme/)
    await expect(new SyncClient(url, 'falsches-token-0123456789', fetchHttp).pluginInfo()).rejects.toThrow(/Token falsch/)
  })

  it('ohne Plugin: 404, SyncClient meldet null, Sync-API läuft weiter', async () => {
    const url = await start({ VTF_PLUGIN_DIR: join(pluginDir, 'gibt-es-nicht') })
    expect((await fetch(`${url}/v1/plugin`, auth)).status).toBe(404)
    expect(await new SyncClient(url, TOKEN, fetchHttp).pluginInfo()).toBeNull()
    expect(await (await fetch(`${url}/health`)).json()).toMatchObject({ ok: true, plugin: null })
  })
})
