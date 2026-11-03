// In-memory stand-in for the parts of the Foundry v13 API the importer uses.
// It enforces keepId, flags and embedded-page semantics closely enough to test sync behaviour.
/* eslint-disable @typescript-eslint/no-explicit-any */

const ID_RE = /^[A-Za-z0-9]{16}$/
let counter = 0
const randomId = () => `rnd${String(++counter).padStart(13, '0')}`

function setProperty(obj: any, key: string, value: unknown) {
  const parts = key.split('.')
  let o = obj
  for (const p of parts.slice(0, -1)) o = o[p] ??= {}
  o[parts.at(-1)!] = value
}

function applyUpdate(target: any, data: Record<string, unknown>) {
  for (const [k, v] of Object.entries(data)) {
    if (k === '_id') continue
    if (k.includes('.')) setProperty(target, k, structuredClone(v))
    else if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object') {
      Object.assign(target[k], structuredClone(v))
    } else target[k] = structuredClone(v)
  }
}

class Collection<T extends { id: string }> extends Map<string, T> {
  get contents(): T[] {
    return [...this.values()]
  }
}

export class FakePage {
  id: string
  name: string
  type: string
  text?: { content: string; format: number }
  src?: string
  flags: any
  constructor(data: any, keepId: boolean) {
    if (data._id && keepId && !ID_RE.test(data._id)) throw new Error(`invalid id ${data._id}`)
    this.id = keepId && data._id ? data._id : randomId()
    this.name = data.name
    this.type = data.type
    this.text = data.text ? structuredClone(data.text) : undefined
    this.src = data.src
    this.flags = structuredClone(data.flags ?? {})
  }
}

export class FakeJournal {
  static world: FakeWorld
  id: string
  name: string
  folderId: string | null
  flags: any
  ownership: any
  pages = new Collection<FakePage>()
  constructor(data: any, keepId: boolean) {
    if (keepId && !ID_RE.test(data._id)) throw new Error(`invalid id ${data._id}`)
    this.id = keepId && data._id ? data._id : randomId()
    this.name = data.name
    this.folderId = data.folder ?? null
    this.flags = structuredClone(data.flags ?? {})
    this.ownership = structuredClone(data.ownership ?? { default: 0 })
    for (const p of data.pages ?? []) {
      const page = new FakePage(p, keepId)
      this.pages.set(page.id, page)
    }
  }
  get uuid() {
    return `JournalEntry.${this.id}`
  }
  get folder() {
    return this.folderId ? FakeJournal.world.folders.get(this.folderId) ?? null : null
  }
  static async createDocuments(data: any[], opts: any = {}) {
    return data.map((d) => {
      const j = new FakeJournal(d, !!opts.keepId)
      if (FakeJournal.world.journal.has(j.id)) throw new Error(`duplicate id ${j.id}`)
      FakeJournal.world.journal.set(j.id, j)
      FakeJournal.world.log.push(`create JournalEntry ${j.name}`)
      return j
    })
  }
  async update(data: any) {
    const { folder, ...rest } = data
    if ('folder' in data) this.folderId = folder ?? null
    applyUpdate(this, rest)
    FakeJournal.world.log.push(`update JournalEntry ${this.name}`)
  }
  async updateEmbeddedDocuments(_type: string, updates: any[]) {
    for (const u of updates) applyUpdate(this.pages.get(u._id)!, u)
  }
  async createEmbeddedDocuments(_type: string, data: any[], opts: any = {}) {
    for (const d of data) {
      const p = new FakePage(d, !!opts.keepId)
      this.pages.set(p.id, p)
    }
  }
  async deleteEmbeddedDocuments(_type: string, ids: string[]) {
    for (const id of ids) this.pages.delete(id)
  }
  async delete() {
    FakeJournal.world.journal.delete(this.id)
  }
}

export class FakeFolder {
  static world: FakeWorld
  id: string
  name: string
  type: string
  parentId: string | null
  flags: any
  constructor(data: any, keepId: boolean) {
    this.id = keepId ? data._id : randomId()
    this.name = data.name
    this.type = data.type
    this.parentId = data.folder ?? null
    this.flags = structuredClone(data.flags ?? {})
  }
  get uuid() {
    return `Folder.${this.id}`
  }
  get folder(): FakeFolder | null {
    return this.parentId ? FakeFolder.world.folders.get(this.parentId) ?? null : null
  }
  get contents() {
    return FakeFolder.world.journal.contents.filter((j) => j.folderId === this.id)
  }
  get children() {
    return FakeFolder.world.folders.contents.filter((f) => f.parentId === this.id)
  }
  static async create(data: any, opts: any = {}) {
    if (data.folder && !FakeFolder.world.folders.has(data.folder)) throw new Error('parent folder missing')
    const f = new FakeFolder(data, !!opts.keepId)
    FakeFolder.world.folders.set(f.id, f)
    return f
  }
  async update(data: any) {
    if ('folder' in data) this.parentId = data.folder
    if ('name' in data) this.name = data.name
  }
  async delete() {
    FakeFolder.world.folders.delete(this.id)
  }
}

export interface FakeWorld {
  journal: Collection<FakeJournal>
  folders: Collection<FakeFolder>
  files: Map<string, number>
  dirs: Set<string>
  settings: Map<string, unknown>
  log: string[]
}

export function installFakeFoundry(): FakeWorld {
  const world: FakeWorld = {
    journal: new Collection(),
    folders: new Collection(),
    files: new Map(),
    dirs: new Set(),
    settings: new Map(),
    log: [],
  }
  FakeJournal.world = world
  FakeFolder.world = world
  const FilePicker = {
    async browse(_src: string, dir: string) {
      if (!world.dirs.has(dir)) throw new Error(`Directory ${dir} does not exist`)
      return { dirs: [], files: [] }
    },
    async createDirectory(_src: string, dir: string) {
      const parent = dir.includes('/') ? dir.slice(0, dir.lastIndexOf('/')) : ''
      if (parent && !world.dirs.has(parent)) throw new Error('parent missing')
      if (world.dirs.has(dir)) throw new Error('EEXIST: already exists')
      world.dirs.add(dir)
    },
    async upload(_src: string, dir: string, file: File) {
      if (!world.dirs.has(dir)) throw new Error(`upload target ${dir} missing`)
      world.files.set(`${dir}/${file.name}`, (world.files.get(`${dir}/${file.name}`) ?? 0) + 1)
      return { status: 'success', path: `${dir}/${file.name}` }
    },
  }
  const g = globalThis as any
  g.game = {
    journal: world.journal,
    folders: world.folders,
    user: { isGM: true },
    settings: {
      get: (_m: string, k: string) => structuredClone(world.settings.get(k) ?? (k === 'assetManifest' ? {} : null)),
      set: async (_m: string, k: string, v: unknown) => void world.settings.set(k, structuredClone(v)),
    },
  }
  g.CONFIG = { JournalEntry: { documentClass: FakeJournal }, Folder: { documentClass: FakeFolder } }
  g.CONST = { JOURNAL_ENTRY_PAGE_FORMATS: { HTML: 1 } }
  g.foundry = {
    utils: {
      deepClone: structuredClone,
      fromUuid: async (uuid: string) => {
        const [type, id] = uuid.split('.')
        return type === 'Folder' ? world.folders.get(id) : world.journal.get(id)
      },
    },
    applications: { apps: { FilePicker: { implementation: FilePicker } } },
  }
  return world
}
