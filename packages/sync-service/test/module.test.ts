import { spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import JSZip from 'jszip'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

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
