// vtf-sync – receives bundle.json and single files from the Obsidian plugin and writes them into
// Foundry's data folder (Data/vault-to-foundry/<vault>/). No dependencies, Node ≥ 20.
//
// Environment:
//   VTF_TOKEN      required, shared secret (≥ 16 characters), sent by the plugin as "Authorization: Bearer …"
//   VTF_DATA_DIR   target folder, default /data/vault-to-foundry (= Foundry Data/vault-to-foundry)
//   VTF_PORT       default 8787
//   VTF_MAX_MB     max size of one upload, default 512
//   VTF_MODULE_DIR the built Foundry module (folder with module.json), default ./module next to server.mjs
//   VTF_PUBLIC_URL public address of this service as Foundry reaches it, e.g. https://dsa.example.org/vtf-sync
//                  (used for "manifest"/"download"; without it: X-Forwarded-Proto/Host/Prefix or Host)
//   VTF_PLUGIN_DIR the built Obsidian plugin (manifest.json, main.js, styles.css), default ./plugin next to server.mjs
//   VTF_DOWNLOAD_PASSWORD  optional, simple password for the download page /plugin (first install of the
//                  Obsidian plugin in the browser); without it the page is off
//
// API (all under /v1, all need the token):
//   GET    /health                               → { ok, version, module, plugin }    (no token needed)
//   GET    /module/module.json                   → Foundry manifest with "manifest"/"download" (no token needed)
//   GET    /module/vault-to-foundry.zip          → the module, module.json at the zip root (no token needed)
//   GET    /plugin                               → page asking for VTF_DOWNLOAD_PASSWORD; POST password=… → the plugin zip
//   GET    /v1/vaults/:vault/state               → { revision, bundleHash, updatedAt, assets: { path: hash } }
//   PUT    /v1/vaults/:vault/assets/<path>       body = file, header X-VTF-Hash (optional check)
//   PUT    /v1/vaults/:vault/bundle              body = bundle.json → { revision }
//   GET    /v1/vaults/:vault/unused              → { paths: [...] }  files not referenced by the current bundle
//   POST   /v1/vaults/:vault/cleanup             body { paths: [...] } → { deleted: [...] }  (only unused files)
//   GET    /v1/plugin                            → { id, version, files: { name: hash } }  the Obsidian plugin of this build
//   GET    /v1/plugin/files/<name>               → one plugin file (manifest.json, main.js, styles.css)
//   GET    /v1/plugin/vault-to-foundry.zip       → the plugin as zip (folder <id>/ inside), for the first install
import { createHash, timingSafeEqual } from 'node:crypto'
import { deflateRawSync } from 'node:zlib'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const VERSION = '1.0.0'
const TOKEN = process.env.VTF_TOKEN ?? ''
const DATA_DIR = process.env.VTF_DATA_DIR ?? '/data/vault-to-foundry'
const PORT = Number(process.env.VTF_PORT ?? 8787)
const MAX_BYTES = Number(process.env.VTF_MAX_MB ?? 512) * 1024 * 1024
const MAX_BUNDLE_BYTES = 64 * 1024 * 1024
const MODULE_DIR = process.env.VTF_MODULE_DIR ?? join(dirname(fileURLToPath(import.meta.url)), 'module')
const PUBLIC_URL = (process.env.VTF_PUBLIC_URL ?? '').replace(/\/+$/, '')
const MODULE_ZIP = 'vault-to-foundry.zip'
const PLUGIN_DIR = process.env.VTF_PLUGIN_DIR ?? join(dirname(fileURLToPath(import.meta.url)), 'plugin')
const PLUGIN_ZIP = 'vault-to-foundry.zip'
const DOWNLOAD_PASSWORD = process.env.VTF_DOWNLOAD_PASSWORD ?? ''
// the only files Obsidian loads from a plugin folder (styles.css is optional)
const PLUGIN_FILES = { 'manifest.json': 'application/json; charset=utf-8', 'main.js': 'text/javascript; charset=utf-8', 'styles.css': 'text/css; charset=utf-8' }

if (TOKEN.length < 16) {
  console.error('vtf-sync: VTF_TOKEN fehlt oder ist kürzer als 16 Zeichen.')
  process.exit(1)
}

const VAULT_RE = /^[a-z0-9._-]{1,80}$/
const SEGMENT_RE = /^[A-Za-z0-9._-]{1,200}$/
const STATE_FILE = '.vtf-state.json'

const log = (...a) => console.log(new Date().toISOString(), ...a)
const hashOf = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 32)

function sameSecret(given, want) {
  const a = Buffer.from(given)
  const b = Buffer.from(want)
  return a.length === b.length && timingSafeEqual(a, b)
}

function authorized(req) {
  const h = req.headers.authorization ?? ''
  return sameSecret(h.startsWith('Bearer ') ? h.slice(7) : '', TOKEN)
}

function send(res, status, body) {
  const data = typeof body === 'string' ? body : JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(data)
}

/** Relative asset path → absolute path inside the vault's assets folder, or null if unsafe. */
function assetFile(vaultDir, relPath) {
  const segments = relPath.split('/')
  if (!segments.length || !segments.every((s) => SEGMENT_RE.test(s) && s !== '.' && s !== '..')) return null
  return join(vaultDir, 'assets', ...segments)
}

async function readBody(req, limit) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw Object.assign(new Error('zu groß'), { status: 413 })
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

async function writeAtomic(file, data) {
  await mkdir(dirname(file), { recursive: true, mode: 0o755 })
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`
  await writeFile(tmp, data, { mode: 0o644 })
  await rename(tmp, file)
}

// ---- per-vault state (serialised per vault) --------------------------------------------------

const locks = new Map()
function withLock(vault, fn) {
  const prev = locks.get(vault) ?? Promise.resolve()
  const next = prev.then(fn, fn)
  locks.set(vault, next.catch(() => {}))
  return next
}

async function walk(dir, base = dir, out = []) {
  let entries = []
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isDirectory()) await walk(full, base, out)
    else if (e.isFile() && !e.name.includes('.tmp-')) out.push(relative(base, full).split(sep).join('/'))
  }
  return out
}

async function hashFile(file) {
  const h = createHash('sha256')
  for await (const chunk of createReadStream(file)) h.update(chunk)
  return h.digest('hex').slice(0, 32)
}

/** Loads the state; if missing (first start, or files from the ZIP import), it is rebuilt from disk. */
async function loadState(vaultDir) {
  try {
    return JSON.parse(await readFile(join(vaultDir, STATE_FILE), 'utf8'))
  } catch {
    const state = { revision: 0, bundleHash: null, updatedAt: null, assets: {} }
    for (const rel of await walk(join(vaultDir, 'assets'))) state.assets[rel] = await hashFile(join(vaultDir, 'assets', rel))
    try {
      const rev = JSON.parse(await readFile(join(vaultDir, 'revision.json'), 'utf8'))
      state.revision = rev.revision ?? 0
      state.bundleHash = rev.hash ?? null
    } catch {
      /* no bundle yet */
    }
    await saveState(vaultDir, state)
    log(`state für ${vaultDir} neu aufgebaut: ${Object.keys(state.assets).length} Dateien`)
    return state
  }
}

const saveState = (vaultDir, state) => writeAtomic(join(vaultDir, STATE_FILE), JSON.stringify(state))

async function referencedAssets(vaultDir) {
  try {
    const bundle = JSON.parse(await readFile(join(vaultDir, 'bundle.json'), 'utf8'))
    return new Set((bundle.assets ?? []).map((a) => a.path))
  } catch {
    return null
  }
}

// ---- Foundry module (install/update via manifest URL) --------------------------------------
// Foundry's server fetches the manifest, then the zip from its "download" field, and later checks
// "manifest" for updates. Both URLs depend on where the service is reachable, so they are filled in
// per request – in the served module.json and in the copy inside the zip.

async function readModuleManifest() {
  try {
    return JSON.parse(await readFile(join(MODULE_DIR, 'module.json'), 'utf8'))
  } catch {
    return null
  }
}

/** Public base URL of this service: VTF_PUBLIC_URL, else from the reverse proxy's headers. */
function publicBase(req) {
  if (PUBLIC_URL) return PUBLIC_URL
  const first = (v) => String(v ?? '').split(',')[0].trim()
  const proto = first(req.headers['x-forwarded-proto']) || 'http'
  const host = first(req.headers['x-forwarded-host']) || req.headers.host || `127.0.0.1:${PORT}`
  const prefix = first(req.headers['x-forwarded-prefix']).replace(/\/+$/, '')
  return `${proto}://${host}${prefix}`
}

function withUrls(manifest, base) {
  return { ...manifest, manifest: `${base}/module/module.json`, download: `${base}/module/${MODULE_ZIP}` }
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** Minimal zip writer (deflate, no dependencies). entries: [{ name, data }] */
function zip(entries) {
  const parts = []
  const central = []
  let offset = 0
  // fixed timestamp (2020-01-01 00:00) → same module, byte-identical zip
  const DOS_TIME = 0
  const DOS_DATE = ((2020 - 1980) << 9) | (1 << 5) | 1
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8')
    const packed = deflateRawSync(data)
    const crc = crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6) // UTF-8 names
    local.writeUInt16LE(8, 8) // deflate
    local.writeUInt16LE(DOS_TIME, 10)
    local.writeUInt16LE(DOS_DATE, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(packed.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    const head = Buffer.alloc(46)
    head.writeUInt32LE(0x02014b50, 0)
    head.writeUInt16LE(20, 4)
    head.writeUInt16LE(20, 6)
    head.writeUInt16LE(0x0800, 8)
    head.writeUInt16LE(8, 10)
    head.writeUInt16LE(DOS_TIME, 12)
    head.writeUInt16LE(DOS_DATE, 14)
    head.writeUInt32LE(crc, 16)
    head.writeUInt32LE(packed.length, 20)
    head.writeUInt32LE(data.length, 24)
    head.writeUInt16LE(nameBuf.length, 28)
    head.writeUInt32LE(offset, 42)
    parts.push(local, nameBuf, packed)
    central.push(head, nameBuf)
    offset += local.length + nameBuf.length + packed.length
  }
  const centralBuf = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralBuf.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...parts, centralBuf, end])
}

const zipCache = new Map() // base URL → zip (the module folder does not change while the service runs)
async function moduleZip(base) {
  if (zipCache.has(base)) return zipCache.get(base)
  const manifest = await readModuleManifest()
  if (!manifest) return null
  const entries = []
  for (const rel of (await walk(MODULE_DIR)).sort()) {
    const data = rel === 'module.json' ? Buffer.from(JSON.stringify(withUrls(manifest, base), null, 2)) : await readFile(join(MODULE_DIR, rel))
    entries.push({ name: rel, data })
  }
  const buf = zip(entries)
  zipCache.set(base, buf)
  return buf
}

async function handleModule(req, res, file) {
  const manifest = await readModuleManifest()
  if (!manifest) return send(res, 404, { error: 'Dieser Dienst enthält kein Foundry-Modul (VTF_MODULE_DIR)' })
  const base = publicBase(req)
  if (file === 'module.json') return send(res, 200, withUrls(manifest, base))
  if (file === MODULE_ZIP) {
    const buf = await moduleZip(base)
    res.writeHead(200, {
      'content-type': 'application/zip',
      'content-length': buf.length,
      'content-disposition': `attachment; filename="${MODULE_ZIP}"`,
      'cache-control': 'no-store',
    })
    return res.end(buf)
  }
  return send(res, 404, { error: 'unbekannter Pfad' })
}

// ---- Obsidian plugin (self-update from the service) ------------------------------------------
// Obsidian has no manifest URL. The plugin asks for the file hashes of the build this service
// carries and, if they differ from its own files, fetches them into its plugin folder. Unlike the
// module this needs the token: the plugin runs code on the user's computer.

async function readPlugin() {
  const files = {}
  for (const name of Object.keys(PLUGIN_FILES)) {
    try {
      files[name] = await readFile(join(PLUGIN_DIR, name))
    } catch {
      /* missing */
    }
  }
  if (!files['manifest.json'] || !files['main.js']) return null
  try {
    const { id, version } = JSON.parse(files['manifest.json'].toString('utf8'))
    if (typeof id !== 'string' || !SEGMENT_RE.test(id) || typeof version !== 'string') return null
    return { id, version, files }
  } catch {
    return null
  }
}

function sendFile(res, type, buf, filename) {
  res.writeHead(200, {
    'content-type': type,
    'content-length': buf.length,
    ...(filename ? { 'content-disposition': `attachment; filename="${filename}"` } : {}),
    'cache-control': 'no-store',
  })
  res.end(buf)
}

async function handlePlugin(res, rest) {
  const plugin = await readPlugin()
  if (!plugin) return send(res, 404, { error: 'Dieser Dienst enthält kein Obsidian-Plugin (VTF_PLUGIN_DIR)' })
  const names = Object.keys(plugin.files)
  if (!rest) return send(res, 200, { id: plugin.id, version: plugin.version, files: Object.fromEntries(names.map((n) => [n, hashOf(plugin.files[n])])) })
  if (rest === `/${PLUGIN_ZIP}`) {
    return sendFile(res, 'application/zip', zip(names.map((n) => ({ name: `${plugin.id}/${n}`, data: plugin.files[n] }))), PLUGIN_ZIP)
  }
  const name = rest.startsWith('/files/') ? rest.slice(7) : ''
  if (!Object.hasOwn(plugin.files, name)) return send(res, 404, { error: 'unbekannter Pfad' })
  return sendFile(res, PLUGIN_FILES[name], plugin.files[name])
}

// ---- download page for the first install (browser, simple password) --------------------------
// The sync token stays out of the browser: this page has its own password and hands out nothing
// but the plugin zip. Wrong passwords are slowed down and limited.

const PLUGIN_ZIP_NAME = (plugin) => `${plugin.id}-${plugin.version}.zip`
const failures = [] // timestamps of wrong passwords
const MAX_FAILURES = 10 // per minute, all clients together

function downloadPage(plugin, error = '') {
  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Vault to Foundry – Obsidian-Plugin</title>
<style>
  body { font: 16px/1.5 system-ui, sans-serif; background: #1e1e2e; color: #e6e6ef; display: grid; place-items: center; min-height: 100vh; margin: 0; }
  form { background: #2a2a3c; padding: 28px; border-radius: 12px; width: min(92vw, 380px); box-shadow: 0 10px 40px #0006; }
  h1 { font-size: 20px; margin: 0 0 4px; } p { margin: 0 0 16px; color: #b4b4c8; font-size: 14px; }
  input, button { font: inherit; width: 100%; box-sizing: border-box; padding: 10px 12px; border-radius: 8px; border: 1px solid #50506a; }
  input { background: #1e1e2e; color: inherit; margin-bottom: 12px; } button { background: #7c5cff; color: #fff; border: 0; cursor: pointer; }
  .error { color: #ff8080; } ol { margin: 16px 0 0; padding-left: 20px; color: #b4b4c8; font-size: 13px; }
</style></head><body>
<form method="post">
  <h1>Vault to Foundry</h1>
  <p>Obsidian-Plugin ${plugin.version} herunterladen</p>
  ${error ? `<p class="error">${error}</p>` : ''}
  <input type="password" name="password" placeholder="Passwort" autofocus required autocomplete="current-password">
  <button type="submit">Herunterladen</button>
  <ol><li>ZIP nach <code>&lt;Vault&gt;/.obsidian/plugins/</code> entpacken</li><li>In Obsidian unter „Community-Plugins“ einschalten</li><li>Spätere Updates holt das Plugin selbst</li></ol>
</form></body></html>`
}

function sendHtml(res, status, html) {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
  res.end(html)
}

async function handleDownloadPage(req, res) {
  const plugin = DOWNLOAD_PASSWORD ? await readPlugin() : null
  if (!plugin) return send(res, 404, { error: 'Download-Seite ist aus (VTF_DOWNLOAD_PASSWORD nicht gesetzt oder kein Obsidian-Plugin im Dienst)' })
  if (req.method === 'GET') return sendHtml(res, 200, downloadPage(plugin))
  if (req.method !== 'POST') return send(res, 405, { error: 'Methode nicht erlaubt' })
  const now = Date.now()
  while (failures.length && failures[0] < now - 60_000) failures.shift()
  if (failures.length >= MAX_FAILURES) return sendHtml(res, 429, downloadPage(plugin, 'Zu viele Versuche. Bitte in einer Minute noch einmal.'))
  const password = new URLSearchParams((await readBody(req, 4096)).toString('utf8')).get('password') ?? ''
  if (!sameSecret(password, DOWNLOAD_PASSWORD)) {
    failures.push(now)
    log('Download-Seite: falsches Passwort')
    await new Promise((r) => setTimeout(r, 1000))
    return sendHtml(res, 401, downloadPage(plugin, 'Das Passwort stimmt nicht.'))
  }
  log(`Download-Seite: Plugin ${plugin.version} heruntergeladen`)
  const names = Object.keys(plugin.files)
  return sendFile(res, 'application/zip', zip(names.map((n) => ({ name: `${plugin.id}/${n}`, data: plugin.files[n] }))), PLUGIN_ZIP_NAME(plugin))
}

// ---- handlers --------------------------------------------------------------------------------

async function handle(req, res) {
  const url = new URL(req.url, 'http://x')
  const path = decodeURIComponent(url.pathname).replace(/\/+$/, '')
  if (req.method === 'GET' && (path === '/health' || path === '')) {
    return send(res, 200, { ok: true, version: VERSION, module: (await readModuleManifest())?.version ?? null, plugin: (await readPlugin())?.version ?? null })
  }
  const mod = /^\/module\/([^/]+)$/.exec(path)
  if (req.method === 'GET' && mod) return handleModule(req, res, mod[1])

  if (path === '/plugin') return handleDownloadPage(req, res)

  const plug = /^\/v1\/plugin(\/.+)?$/.exec(path)
  if (plug) {
    if (!authorized(req)) return send(res, 401, { error: 'Token fehlt oder ist falsch' })
    if (req.method !== 'GET') return send(res, 405, { error: 'Methode nicht erlaubt' })
    return handlePlugin(res, plug[1] ?? '')
  }

  const m = /^\/v1\/vaults\/([^/]+)\/(state|bundle|unused|cleanup|assets\/(.+))$/.exec(path)
  if (!m) return send(res, 404, { error: 'unbekannter Pfad' })
  if (!authorized(req)) return send(res, 401, { error: 'Token fehlt oder ist falsch' })
  const [, vault, action, assetPath] = m
  if (!VAULT_RE.test(vault)) return send(res, 400, { error: 'ungültiger Vault-Name' })
  const vaultDir = join(DATA_DIR, vault)

  if (req.method === 'GET' && action === 'state') {
    const state = await withLock(vault, () => loadState(vaultDir))
    return send(res, 200, state)
  }

  if (req.method === 'PUT' && assetPath) {
    const file = assetFile(vaultDir, assetPath)
    if (!file) return send(res, 400, { error: `ungültiger Dateipfad „${assetPath}“` })
    const body = await readBody(req, MAX_BYTES)
    const hash = hashOf(body)
    const expected = req.headers['x-vtf-hash']
    if (expected && expected !== hash) return send(res, 400, { error: `Prüfsumme stimmt nicht (${hash} ≠ ${expected})` })
    await writeAtomic(file, body)
    await withLock(vault, async () => {
      const state = await loadState(vaultDir)
      state.assets[assetPath] = hash
      await saveState(vaultDir, state)
    })
    log(`${vault}: ${assetPath} (${body.length} B)`)
    return send(res, 200, { path: assetPath, hash, size: body.length })
  }

  if (req.method === 'PUT' && action === 'bundle') {
    const body = await readBody(req, MAX_BUNDLE_BYTES)
    let bundle
    try {
      bundle = JSON.parse(body.toString('utf8'))
    } catch {
      return send(res, 400, { error: 'bundle.json ist kein gültiges JSON' })
    }
    if (typeof bundle.schemaVersion !== 'number' || bundle.vault?.slug !== vault) {
      return send(res, 400, { error: `bundle.json passt nicht zum Vault „${vault}“` })
    }
    const result = await withLock(vault, async () => {
      const state = await loadState(vaultDir)
      // content hash without the creation time, so an unchanged vault does not create a new revision
      const hash = hashOf(Buffer.from(JSON.stringify({ ...bundle, generatedAt: null })))
      if (hash === state.bundleHash) return { revision: state.revision, unchanged: true }
      state.revision += 1
      state.bundleHash = hash
      state.updatedAt = new Date().toISOString()
      await writeAtomic(join(vaultDir, 'bundle.json'), body)
      await writeAtomic(
        join(vaultDir, 'revision.json'),
        JSON.stringify({ revision: state.revision, hash, updatedAt: state.updatedAt, generatedAt: bundle.generatedAt, vault: bundle.vault })
      )
      await saveState(vaultDir, state)
      return { revision: state.revision, unchanged: false }
    })
    log(`${vault}: bundle.json → Revision ${result.revision}${result.unchanged ? ' (unverändert)' : ''}`)
    return send(res, 200, result)
  }

  if (req.method === 'GET' && action === 'unused') {
    const used = await referencedAssets(vaultDir)
    if (!used) return send(res, 409, { error: 'noch keine bundle.json auf dem Server' })
    const all = await walk(join(vaultDir, 'assets'))
    return send(res, 200, { paths: all.filter((p) => !used.has(p)).sort() })
  }

  if (req.method === 'POST' && action === 'cleanup') {
    const { paths = [] } = JSON.parse((await readBody(req, 1024 * 1024)).toString('utf8') || '{}')
    const deleted = await withLock(vault, async () => {
      const used = await referencedAssets(vaultDir)
      if (!used) return []
      const state = await loadState(vaultDir)
      const done = []
      for (const p of paths) {
        const file = assetFile(vaultDir, String(p))
        if (!file || used.has(p)) continue // never delete what the current bundle uses
        try {
          await stat(file)
          await rm(file)
          delete state.assets[p]
          done.push(p)
        } catch {
          /* already gone */
        }
      }
      await saveState(vaultDir, state)
      return done
    })
    log(`${vault}: ${deleted.length} ungenutzte Dateien gelöscht`)
    return send(res, 200, { deleted })
  }

  return send(res, 405, { error: 'Methode nicht erlaubt' })
}

const server = createServer((req, res) => {
  handle(req, res).catch((e) => {
    log('Fehler:', e?.message ?? e)
    if (!res.headersSent) send(res, e?.status ?? 500, { error: e?.message ?? 'Serverfehler' })
  })
}).listen(PORT, async () => {
  log(`vtf-sync ${VERSION} auf Port ${PORT}, Ziel ${DATA_DIR}`)
  const m = await readModuleManifest()
  const p = await readPlugin()
  log(p ? `Obsidian-Plugin ${p.version}: aktualisiert sich über diesen Dienst` : `kein Obsidian-Plugin in ${PLUGIN_DIR}`)
  if (p) log(DOWNLOAD_PASSWORD ? `Download-Seite für die Erstinstallation: ${PUBLIC_URL || '<öffentliche Adresse>'}/plugin` : 'Download-Seite aus (VTF_DOWNLOAD_PASSWORD nicht gesetzt)')
  log(m ? `Foundry-Modul ${m.version}: Manifest-URL ${PUBLIC_URL || '<öffentliche Adresse>'}/module/module.json` : `kein Foundry-Modul in ${MODULE_DIR}`)
})

// as PID 1 in a container Node ignores SIGTERM by default → stop cleanly on "docker stop"
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    log(`${sig}, beende …`)
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 3000).unref()
  })
}
