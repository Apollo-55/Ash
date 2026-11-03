import JSZip from 'jszip'
import { planSync, preserveRevealedSecrets, sortFoldersByDepth } from '../../core/src/sync.ts'
import { FLAG_SCOPE, type Bundle, type BundleJournal, type BundleJournalPage, type BundleWarning, type DocumentFlags } from '../../core/src/types.ts'
import { syncActors } from './actors.ts'
import { MODULE_ID, SETTINGS, SUPPORTED_SCHEMA } from './constants.ts'

export interface ReportEntry {
  id: string
  uuid: string
  name: string
  sourcePath?: string
  type: 'JournalEntry' | 'Folder' | 'Actor' | 'Scene'
}

export interface ImportReport {
  vault: { name: string; slug: string }
  importedAt: string
  bundleGeneratedAt: string
  created: ReportEntry[]
  updated: ReportEntry[]
  skipped: ReportEntry[]
  orphans: ReportEntry[]
  conflicts: ReportEntry[]
  warnings: BundleWarning[]
  errors: string[]
  assets: { uploaded: number; unchanged: number; failed: string[] }
}

export interface ImportOptions {
  /** upload all assets even if the manifest says they are unchanged */
  forceAssets?: boolean
  /** update documents even if their hash is unchanged */
  forceDocuments?: boolean
  onProgress?: (pct: number, message: string) => void
}

type AssetManifest = Record<string, string>

const flagsOf = (doc: any): Partial<DocumentFlags> | null => doc?.flags?.[FLAG_SCOPE] ?? null

function docFlags(bundle: Bundle, sourcePath: string, hash: string): DocumentFlags {
  return { vault: bundle.vault.slug, sourcePath, hash, bundleVersion: bundle.schemaVersion }
}

const dirname = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '')
const basename = (p: string) => p.slice(p.lastIndexOf('/') + 1)

export async function readBundleZip(file: Blob): Promise<{ zip: JSZip; bundle: Bundle }> {
  const zip = await JSZip.loadAsync(file)
  const entry = zip.file('bundle.json')
  if (!entry) throw new Error('Die ZIP-Datei enthält keine bundle.json. Ist das ein Export von „Vault to Foundry“?')
  const bundle = JSON.parse(await entry.async('string')) as Bundle
  if (typeof bundle.schemaVersion !== 'number' || !bundle.vault?.slug) throw new Error('bundle.json ist unvollständig.')
  if (bundle.schemaVersion > SUPPORTED_SCHEMA) {
    throw new Error(`Das Bundle hat Schema-Version ${bundle.schemaVersion}, dieses Modul kennt nur bis ${SUPPORTED_SCHEMA}. Bitte das Modul aktualisieren.`)
  }
  return { zip, bundle }
}

// ---------------------------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------------------------

const FilePicker = () => foundry.applications.apps.FilePicker.implementation

async function ensureDirectory(path: string, known: Set<string>): Promise<void> {
  const parts = path.split('/').filter(Boolean)
  for (let i = 1; i <= parts.length; i++) {
    const dir = parts.slice(0, i).join('/')
    if (known.has(dir)) continue
    try {
      await FilePicker().browse('data', dir)
    } catch {
      try {
        await FilePicker().createDirectory('data', dir, {})
      } catch (e) {
        // created concurrently or already present
        if (!/exist/i.test(String((e as Error)?.message ?? e))) throw e
      }
    }
    known.add(dir)
  }
}

const MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml',
  avif: 'image/avif', pdf: 'application/pdf', mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', mp4: 'video/mp4',
  webm: 'video/webm', m4a: 'audio/mp4',
}

/** Parallel uploads; the server handles them independently. */
const UPLOAD_CONCURRENCY = 4

async function uploadAssets(zip: JSZip, bundle: Bundle, report: ImportReport, opts: ImportOptions): Promise<void> {
  const manifest: AssetManifest = foundry.utils.deepClone(game.settings.get(MODULE_ID, SETTINGS.assetManifest) ?? {})
  const pending = bundle.assets.filter((a) => {
    const unchanged = !opts.forceAssets && a.hash && manifest[`${bundle.assetsBase}/${a.path}`] === a.hash
    if (unchanged) report.assets.unchanged++
    return !unchanged
  })
  if (!pending.length) return

  // create all directories first (sequentially, avoids races between parallel uploads)
  const known = new Set<string>()
  for (const dir of new Set(pending.map((a) => dirname(`${bundle.assetsBase}/${a.path}`)))) await ensureDirectory(dir, known)

  let done = 0
  let sinceSave = 0
  const uploadOne = async (asset: (typeof pending)[number]) => {
    const key = `${bundle.assetsBase}/${asset.path}`
    try {
      const entry = zip.file(`assets/${asset.path}`)
      if (!entry) throw new Error('fehlt in der ZIP')
      const blob = await entry.async('blob')
      const ext = asset.path.split('.').pop()?.toLowerCase() ?? ''
      const file = new File([blob], basename(asset.path), { type: MIME[ext] ?? 'application/octet-stream' })
      const result = await FilePicker().upload('data', dirname(key), file, {}, { notify: false })
      if (!result || (result.status && result.status !== 'success')) throw new Error(result?.message ?? 'Upload abgelehnt')
      manifest[key] = asset.hash
      report.assets.uploaded++
      // persist progress regularly so an aborted import does not start from zero
      if (++sinceSave >= 20) {
        sinceSave = 0
        await game.settings.set(MODULE_ID, SETTINGS.assetManifest, manifest)
      }
    } catch (e) {
      report.assets.failed.push(`${asset.path}: ${(e as Error)?.message ?? e}`)
    }
    done++
    opts.onProgress?.((done / pending.length) * 0.6, `Dateien ${done}/${pending.length}`)
  }

  const queue = [...pending]
  const worker = async () => {
    for (let a = queue.shift(); a; a = queue.shift()) await uploadOne(a)
  }
  await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, queue.length) }, worker))
  await game.settings.set(MODULE_ID, SETTINGS.assetManifest, manifest)
}

// ---------------------------------------------------------------------------------------------
// Folders
// ---------------------------------------------------------------------------------------------

async function syncFolders(bundle: Bundle, report: ImportReport): Promise<void> {
  const FolderCls = CONFIG.Folder.documentClass
  for (const f of sortFoldersByDepth(bundle.folders)) {
    const existing = game.folders.get(f.id)
    const flags = { [FLAG_SCOPE]: docFlags(bundle, f.sourcePath, '') }
    if (!existing) {
      await FolderCls.create({ _id: f.id, name: f.name, type: f.type, folder: f.parent, sorting: 'a', flags }, { keepId: true })
    } else if (existing.name !== f.name || (existing.folder?.id ?? null) !== f.parent) {
      await existing.update({ name: f.name, folder: f.parent })
    }
  }
  const ids = new Set(bundle.folders.map((f) => f.id))
  for (const folder of game.folders.contents) {
    if (!ids.has(folder.id) && flagsOf(folder)?.vault === bundle.vault.slug) {
      report.orphans.push({ id: folder.id, uuid: folder.uuid, name: folder.name, sourcePath: flagsOf(folder)?.sourcePath, type: 'Folder' })
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Journals
// ---------------------------------------------------------------------------------------------

function pageData(page: BundleJournalPage): Record<string, unknown> {
  const base = { _id: page.id, name: page.name, type: page.type, flags: { [FLAG_SCOPE]: { managed: true } } }
  if (page.type === 'text') return { ...base, text: { content: page.html ?? '', format: CONST.JOURNAL_ENTRY_PAGE_FORMATS?.HTML ?? 1 } }
  return { ...base, src: page.src }
}

async function updateJournal(entry: any, doc: BundleJournal, bundle: Bundle): Promise<void> {
  const update: Record<string, unknown> = {
    name: doc.name,
    folder: doc.folder,
    [`flags.${FLAG_SCOPE}`]: docFlags(bundle, doc.sourcePath, doc.hash),
  }
  if (doc.ownership) update['ownership.default'] = doc.ownership.default
  await entry.update(update)

  const toCreate: Record<string, unknown>[] = []
  const toUpdate: Record<string, unknown>[] = []
  for (const page of doc.pages) {
    const existing = entry.pages.get(page.id)
    if (!existing) {
      toCreate.push(pageData(page))
      continue
    }
    const u: Record<string, unknown> = { _id: page.id, name: page.name }
    if (page.type === 'text') u['text.content'] = preserveRevealedSecrets(existing.text?.content ?? '', page.html ?? '')
    else u.src = page.src
    toUpdate.push(u)
  }
  const keep = new Set(doc.pages.map((p) => p.id))
  // only pages the importer made; hand-written pages stay
  const toDelete = entry.pages.contents.filter((p: any) => !keep.has(p.id) && p.flags?.[FLAG_SCOPE]?.managed).map((p: any) => p.id)
  if (toUpdate.length) await entry.updateEmbeddedDocuments('JournalEntryPage', toUpdate)
  if (toCreate.length) await entry.createEmbeddedDocuments('JournalEntryPage', toCreate, { keepId: true })
  if (toDelete.length) await entry.deleteEmbeddedDocuments('JournalEntryPage', toDelete)
}

async function syncJournals(bundle: Bundle, report: ImportReport, opts: ImportOptions): Promise<void> {
  const JournalCls = CONFIG.JournalEntry.documentClass
  const docs = bundle.documents.filter((d): d is BundleJournal => d.kind === 'journal')
  const existing = game.journal.contents.map((j: any) => ({ id: j.id, flags: flagsOf(j), folder: j.folder?.id ?? null }))
  const plan = planSync(bundle, docs, existing, { force: opts.forceDocuments })
  const byId = new Map(docs.map((d) => [d.id, d]))
  const entry = (d: BundleJournal): ReportEntry => ({ id: d.id, uuid: `JournalEntry.${d.id}`, name: d.name, sourcePath: d.sourcePath, type: 'JournalEntry' })

  if (plan.create.length) {
    const data = plan.create.map((id) => {
      const d = byId.get(id)!
      return {
        _id: d.id,
        name: d.name,
        folder: d.folder,
        ...(d.ownership ? { ownership: { default: d.ownership.default } } : {}),
        flags: { [FLAG_SCOPE]: docFlags(bundle, d.sourcePath, d.hash) },
        pages: d.pages.map(pageData),
      }
    })
    // chunks keep single requests small
    for (let i = 0; i < data.length; i += 50) {
      opts.onProgress?.(0.6 + 0.2 * (i / data.length), 'Lege Journale an …')
      await JournalCls.createDocuments(data.slice(i, i + 50), { keepId: true })
    }
    report.created.push(...plan.create.map((id) => entry(byId.get(id)!)))
  }

  let n = 0
  for (const id of plan.update) {
    opts.onProgress?.(0.8 + 0.1 * (n++ / plan.update.length), `Aktualisiere ${byId.get(id)!.name}`)
    try {
      await updateJournal(game.journal.get(id), byId.get(id)!, bundle)
      report.updated.push(entry(byId.get(id)!))
    } catch (e) {
      report.errors.push(`${byId.get(id)!.name}: ${(e as Error)?.message ?? e}`)
    }
  }
  report.skipped.push(...plan.skip.map((id) => entry(byId.get(id)!)))
  for (const id of plan.conflicts) {
    const d = byId.get(id)!
    report.conflicts.push(entry(d))
    report.errors.push(`„${d.name}“: In der Welt gibt es schon ein Journal mit derselben ID, das nicht aus dieser Vault stammt. Nicht verändert.`)
  }
  for (const id of plan.orphans) {
    const j = game.journal.get(id)
    report.orphans.push({ id, uuid: j.uuid, name: j.name, sourcePath: flagsOf(j)?.sourcePath, type: 'JournalEntry' })
  }
}

// ---------------------------------------------------------------------------------------------

export async function importBundle(zip: JSZip, bundle: Bundle, opts: ImportOptions = {}): Promise<ImportReport> {
  const report: ImportReport = {
    vault: bundle.vault,
    importedAt: new Date().toISOString(),
    bundleGeneratedAt: bundle.generatedAt,
    created: [],
    updated: [],
    skipped: [],
    orphans: [],
    conflicts: [],
    warnings: [...bundle.warnings],
    errors: [],
    assets: { uploaded: 0, unchanged: 0, failed: [] },
  }
  await uploadAssets(zip, bundle, report, opts)
  opts.onProgress?.(0.6, 'Ordner …')
  await syncFolders(bundle, report)
  await syncJournals(bundle, report, opts)
  await syncActors(bundle, report, opts)
  opts.onProgress?.(1, 'Fertig')
  await game.settings.set(MODULE_ID, SETTINGS.lastReport, report)
  return report
}

/** Deletes orphaned documents chosen in the report (after confirmation in the UI). */
export async function deleteOrphans(entries: ReportEntry[]): Promise<number> {
  let deleted = 0
  // documents first, then folders from the deepest level up (so emptied parents can go too)
  const depth = (e: ReportEntry): number => {
    if (e.type !== 'Folder') return -1
    let d = 0
    for (let f = game.folders.get(e.id); f?.folder && d < 32; f = f.folder) d++
    return d
  }
  const order = [...entries].sort((a, b) => depth(b) - depth(a)).sort((a, b) => Number(a.type === 'Folder') - Number(b.type === 'Folder'))
  for (const e of order) {
    const doc = await foundry.utils.fromUuid(e.uuid)
    if (!doc || !flagsOf(doc)) continue // only importer-made documents
    if (e.type === 'Folder') {
      if (doc.contents?.length || doc.children?.length) continue // never delete non-empty folders
    }
    await doc.delete()
    deleted++
  }
  return deleted
}
