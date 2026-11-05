import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildBundle, createSimpleResolver, fetchHttp, hashBytes, pushBundle, SyncClient } from '../../core/src/index.ts'

const TOKEN = 'test-token-0123456789abcdef'
let PORT = 0
let URL = ''
let dir: string
let proc: ChildProcess

/** a port the OS reports as free – a random one could hit a leftover service from an earlier run */
const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const srv = createServer()
    srv.once('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const port = (srv.address() as { port: number }).port
      srv.close(() => resolve(port))
    })
  })

beforeAll(async () => {
  PORT = await freePort()
  URL = `http://127.0.0.1:${PORT}`
  dir = mkdtempSync(join(tmpdir(), 'vtf-sync-'))
  proc = spawn(process.execPath, [join(__dirname, '..', 'server.mjs')], { env: { ...process.env, VTF_TOKEN: TOKEN, VTF_DATA_DIR: dir, VTF_PORT: String(PORT) }, stdio: 'ignore' })
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${URL}/health`)).ok) return
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error('Dienst startet nicht')
})
afterAll(() => {
  proc?.kill()
  rmSync(dir, { recursive: true, force: true })
})

// a tiny in-memory vault
const files: Record<string, Uint8Array> = {
  'Notiz.md': new TextEncoder().encode('Hallo ![[bild.png]]'),
  'bild.png': new Uint8Array([1, 2, 3]),
  'Maps/Karte groß.webp': new Uint8Array([4, 5, 6, 7]),
}
function push(client = new SyncClient(URL, TOKEN, fetchHttp)) {
  const paths = Object.keys(files)
  const { bundle, assetFiles } = buildBundle({
    vaultName: 'Test Vault',
    notes: paths.filter((p) => p.endsWith('.md')).map((p) => ({ path: p, content: new TextDecoder().decode(files[p]) })),
    attachments: paths.filter((p) => !p.endsWith('.md')),
    resolver: createSimpleResolver(paths),
  })
  let reads = 0
  return pushBundle({
    client,
    bundle,
    assetFiles,
    fileInfo: async (p) => ({ hash: hashBytes(files[p]), size: files[p].length }),
    read: async (p) => {
      reads++
      return files[p]
    },
  }).then((r) => ({ ...r, reads }))
}

describe('vtf-sync Dienst + pushBundle', () => {
  it('lehnt falsches Token ab', async () => {
    await expect(new SyncClient(URL, 'falsch', fetchHttp).state('test_vault')).rejects.toThrow('Token falsch')
  })

  it('erster Push lädt alles hoch und schreibt bundle.json + revision.json in Foundrys Ordnerstruktur', async () => {
    const r = await push()
    // uploads run in parallel, so their order in r.uploaded is not deterministic
    expect([...r.uploaded].sort()).toEqual(['Maps/Karte_gross.webp', 'bild.png'])
    expect(r).toMatchObject({ unchanged: 0, failed: [], revision: 1, bundleUnchanged: false })
    expect(readFileSync(join(dir, 'test_vault/assets/Maps/Karte_gross.webp'))).toEqual(Buffer.from([4, 5, 6, 7]))
    const bundle = JSON.parse(readFileSync(join(dir, 'test_vault/bundle.json'), 'utf8'))
    expect(bundle.assets.find((a: { path: string }) => a.path === 'bild.png').hash).toBe(hashBytes(files['bild.png']))
    expect(JSON.parse(readFileSync(join(dir, 'test_vault/revision.json'), 'utf8'))).toMatchObject({ revision: 1, vault: { slug: 'test_vault' } })
  })

  it('unveränderter Vault: nichts hochgeladen, keine neue Revision', async () => {
    const r = await push()
    expect(r).toMatchObject({ uploaded: [], unchanged: 2, revision: 1, bundleUnchanged: true, reads: 0 })
  })

  it('geänderte Datei: nur sie wird hochgeladen, neue Revision', async () => {
    files['bild.png'] = new Uint8Array([9, 9, 9, 9])
    const r = await push()
    expect(r).toMatchObject({ uploaded: ['bild.png'], unchanged: 1, revision: 2, bundleUnchanged: false, reads: 1 })
  })

  it('ungenutzte Dateien: auflisten und nur diese löschen', async () => {
    delete files['Maps/Karte groß.webp']
    files['Notiz.md'] = new TextEncoder().encode('ohne Karte ![[bild.png]]')
    await push()
    const client = new SyncClient(URL, TOKEN, fetchHttp)
    expect(await client.unused('test_vault')).toEqual(['Maps/Karte_gross.webp'])
    // a still referenced file is never deleted, even if asked
    expect(await client.cleanup('test_vault', ['Maps/Karte_gross.webp', 'bild.png'])).toEqual(['Maps/Karte_gross.webp'])
    expect(await client.unused('test_vault')).toEqual([])
  })

  it('Prüfsumme und unsichere Pfade werden abgelehnt', async () => {
    const client = new SyncClient(URL, TOKEN, fetchHttp)
    await expect(client.putAsset('test_vault', 'x.png', new Uint8Array([1]), 'falsch')).rejects.toThrow(/Prüfsumme/)
    await expect(client.putAsset('test_vault', '../../etc/passwd', new Uint8Array([1]), hashBytes(new Uint8Array([1])))).rejects.toThrow(/ungültiger Dateipfad|unbekannter Pfad/)
    await expect(client.putBundle('anderer', JSON.stringify({ schemaVersion: 1, vault: { slug: 'test_vault' } }))).rejects.toThrow(/passt nicht/)
  })

  it('Server nicht erreichbar → verständlicher Fehler', async () => {
    await expect(new SyncClient('http://127.0.0.1:1', TOKEN, fetchHttp).health()).rejects.toThrow(/nicht erreichbar/)
  })
})
