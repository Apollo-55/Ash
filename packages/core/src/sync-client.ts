import { hashString } from './ids.ts'
import type { Bundle } from './types.ts'

export interface HttpRequest {
  method: 'GET' | 'PUT' | 'POST'
  url: string
  headers: Record<string, string>
  body?: Uint8Array | string
}
export interface HttpResponse {
  status: number
  text: string
}
/** Transport: Obsidian's requestUrl in the plugin, fetch in the CLI and tests. */
export type HttpFn = (req: HttpRequest) => Promise<HttpResponse>

export interface RemoteState {
  revision: number
  bundleHash: string | null
  updatedAt: string | null
  assets: Record<string, string>
}

/** The Obsidian plugin build the service carries: file name → content hash. */
export interface PluginInfo {
  id: string
  /** display name from the plugin's manifest */
  name?: string
  version: string
  files: Record<string, string>
}

export class SyncError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

const encodePath = (p: string) => p.split('/').map(encodeURIComponent).join('/')

/** Client for the vtf-sync service. */
export class SyncClient {
  private base: string
  private token: string
  private http: HttpFn
  constructor(baseUrl: string, token: string, http: HttpFn) {
    this.base = baseUrl.replace(/\/+$/, '')
    this.token = token
    this.http = http
  }

  private async call<T>(method: HttpRequest['method'], path: string, body?: Uint8Array | string, headers: Record<string, string> = {}): Promise<T> {
    return this.request(method, path, body, headers, true) as Promise<T>
  }

  /** json: parse the answer; otherwise return its text as is */
  private async request(method: HttpRequest['method'], path: string, body: Uint8Array | string | undefined, headers: Record<string, string>, json: boolean): Promise<unknown> {
    let res: HttpResponse
    try {
      res = await this.http({ method, url: `${this.base}${path}`, headers: { Authorization: `Bearer ${this.token}`, ...headers }, body })
    } catch (e) {
      throw new SyncError(`Server nicht erreichbar (${(e as Error)?.message ?? e})`, 0)
    }
    let data: any = null
    try {
      data = res.text ? JSON.parse(res.text) : null
    } catch {
      /* not JSON (e.g. nginx error page) */
    }
    if (res.status >= 400) {
      const hint = res.status === 401 ? 'Token falsch' : res.status === 413 ? 'Datei zu groß (VTF_MAX_MB bzw. client_max_body_size)' : (data?.error ?? `HTTP ${res.status}`)
      throw new SyncError(hint, res.status)
    }
    return json ? data : res.text
  }

  health() {
    return this.call<{ ok: boolean; version: string; module?: string | null; plugin?: string | null }>('GET', '/health')
  }
  /** null: the service carries no plugin (or is older than this feature) */
  async pluginInfo(): Promise<PluginInfo | null> {
    try {
      const info = await this.call<PluginInfo>('GET', '/v1/plugin')
      return info && typeof info.id === 'string' && typeof info.version === 'string' && info.files ? info : null
    } catch (e) {
      if (e instanceof SyncError && e.status === 404) return null
      throw e
    }
  }
  /** All Obsidian plugins the service carries: the one of its build first. Older services know only that one. */
  async plugins(): Promise<PluginInfo[]> {
    try {
      const list = await this.call<PluginInfo[]>('GET', '/v1/plugins')
      if (Array.isArray(list)) return list.filter((i) => i && typeof i.id === 'string' && typeof i.version === 'string' && i.files)
    } catch (e) {
      if (!(e instanceof SyncError && e.status === 404)) throw e
    }
    const main = await this.pluginInfo()
    return main ? [main] : []
  }
  /** One plugin file as text, checked against the hash from plugins(); main: the plugin of the service's build. */
  async pluginFile(info: PluginInfo, name: string, main = true): Promise<string> {
    const path = main ? `/v1/plugin/files/${encodeURIComponent(name)}` : `/v1/plugins/${encodeURIComponent(info.id)}/files/${encodeURIComponent(name)}`
    const text = (await this.request('GET', path, undefined, {}, false)) as string
    if (hashString(text) !== info.files[name]) throw new SyncError(`${name} kam beschädigt an (Prüfsumme stimmt nicht)`, 0)
    return text
  }
  state(vault: string) {
    return this.call<RemoteState>('GET', `/v1/vaults/${encodeURIComponent(vault)}/state`)
  }
  putAsset(vault: string, path: string, data: Uint8Array, hash: string) {
    return this.call<{ hash: string }>('PUT', `/v1/vaults/${encodeURIComponent(vault)}/assets/${encodePath(path)}`, data, {
      'X-VTF-Hash': hash,
      'Content-Type': 'application/octet-stream',
    })
  }
  putBundle(vault: string, json: string) {
    return this.call<{ revision: number; unchanged: boolean }>('PUT', `/v1/vaults/${encodeURIComponent(vault)}/bundle`, json, {
      'Content-Type': 'application/json',
    })
  }
  async unused(vault: string) {
    return (await this.call<{ paths: string[] }>('GET', `/v1/vaults/${encodeURIComponent(vault)}/unused`)).paths
  }
  async cleanup(vault: string, paths: string[]) {
    return (await this.call<{ deleted: string[] }>('POST', `/v1/vaults/${encodeURIComponent(vault)}/cleanup`, JSON.stringify({ paths }), {
      'Content-Type': 'application/json',
    })).deleted
  }
}

export interface PushOptions {
  client: SyncClient
  bundle: Bundle
  /** ZIP path ("assets/…") → vault path, as returned by buildBundle */
  assetFiles: Map<string, string>
  /** hash and size of a vault file (the caller caches by modification time) */
  fileInfo(vaultPath: string): Promise<{ hash: string; size: number }>
  read(vaultPath: string): Promise<Uint8Array>
  concurrency?: number
  onProgress?(done: number, total: number, message: string): void
}

export interface PushResult {
  uploaded: string[]
  unchanged: number
  failed: string[]
  revision: number
  bundleUnchanged: boolean
}

/** Uploads changed files, then bundle.json (only if all files arrived). */
export async function pushBundle(opts: PushOptions): Promise<PushResult> {
  const { client, bundle } = opts
  const vault = bundle.vault.slug
  const byZip = new Map(bundle.assets.map((a) => [`assets/${a.path}`, a]))
  for (const [zipPath, vaultPath] of opts.assetFiles) {
    const info = await opts.fileInfo(vaultPath)
    const asset = byZip.get(zipPath)!
    asset.hash = info.hash
    asset.size = info.size
  }
  const remote = await client.state(vault)
  const todo = bundle.assets.filter((a) => remote.assets[a.path] !== a.hash)
  const result: PushResult = { uploaded: [], unchanged: bundle.assets.length - todo.length, failed: [], revision: remote.revision, bundleUnchanged: false }
  let done = 0
  const queue = [...todo]
  const worker = async () => {
    for (let a = queue.shift(); a; a = queue.shift()) {
      try {
        await client.putAsset(vault, a.path, await opts.read(a.sourcePath), a.hash)
        result.uploaded.push(a.path)
      } catch (e) {
        result.failed.push(`${a.path}: ${(e as Error).message}`)
      }
      opts.onProgress?.(++done, todo.length, a.path)
    }
  }
  await Promise.all(Array.from({ length: Math.min(opts.concurrency ?? 3, Math.max(1, todo.length)) }, worker))
  if (result.failed.length) return result // bundle.json only once every referenced file is on the server
  const r = await client.putBundle(vault, JSON.stringify(bundle))
  result.revision = r.revision
  result.bundleUnchanged = r.unchanged
  return result
}

/** fetch-based transport (Node ≥ 18, browsers) */
export const fetchHttp: HttpFn = async (req) => {
  const res = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body as BodyInit | undefined })
  return { status: res.status, text: await res.text() }
}
