import { hashObject, hashString, makeId } from './ids.ts'
import { makeWarningCollector, type FenceHandler, type HeadingInfo, type LinkTarget, type RenderEnv } from './markdown/env.ts'
import { splitFrontmatter, stripBlockIds, stripComments } from './markdown/preprocess.ts'
import { renderBody } from './markdown/render.ts'
import { readNoteConfig } from './note-config.ts'
import { assetKind, basename, dirname, extname, folderLevels, isExcluded, isVaultInternal, safePath, stripExtension, vaultSlug } from './paths.ts'
import type { LinkResolver } from './resolver.ts'
import {
  BUNDLE_SCHEMA_VERSION,
  type Bundle,
  type BundleAsset,
  type BundleFolder,
  type BundleJournal,
  type BundleWarning,
  type FolderDocumentType,
} from './types.ts'

export interface NoteInput {
  /** vault-relative path with ".md" */
  path: string
  content: string
  /** Frontmatter as parsed by Obsidian (metadataCache); parsed from content when omitted */
  frontmatter?: Record<string, unknown> | null
}

export interface BuildOptions {
  vaultName: string
  notes: NoteInput[]
  /** vault-relative paths of all non-markdown files */
  attachments: string[]
  resolver: LinkResolver
  /** persisted mapping sourcePath → document id (survives renames) */
  idMap?: Record<string, string>
  excludePatterns?: string[]
  /** optional top-level folder in Foundry */
  rootFolder?: string
  /** upload attachments even if no note references them (default true) */
  includeUnreferencedAttachments?: boolean
  fenceHandlers?: Record<string, FenceHandler>
  generator?: { name: string; version: string }
  now?: Date
}

export interface BuildResult {
  bundle: Bundle
  /** updated id map to persist */
  idMap: Record<string, string>
  /** ZIP path ("assets/…") → vault path; the caller adds file contents and fills asset hashes */
  assetFiles: Map<string, string>
}

export function assetsBaseFor(vaultName: string): string {
  return `vault-to-foundry/${vaultSlug(vaultName)}/assets`
}

class IdAllocator {
  private used = new Map<string, string>() // id → path
  private vault: string
  private map: Record<string, string>
  constructor(vault: string, map: Record<string, string>) {
    this.vault = vault
    this.map = map
    for (const [path, id] of Object.entries(map)) this.used.set(id, path)
  }
  get(path: string): string {
    const known = this.map[path]
    if (known && this.used.get(known) === path) return known
    let salt = 0
    let id = makeId(this.vault, path)
    while (this.used.has(id) && this.used.get(id) !== path) id = makeId(this.vault, path, String(++salt))
    this.map[path] = id
    this.used.set(id, path)
    return id
  }
  result(): Record<string, string> {
    return { ...this.map }
  }
}

export function buildBundle(opts: BuildOptions): BuildResult {
  const vault = opts.vaultName
  const slug = vaultSlug(vault)
  const assetsBase = assetsBaseFor(vault)
  const excludes = opts.excludePatterns ?? []
  const warnings: BundleWarning[] = []
  const skipped: Bundle['skipped'] = []
  const ids = new IdAllocator(vault, { ...(opts.idMap ?? {}) })
  const includeAll = opts.includeUnreferencedAttachments ?? true

  // ---- attachments → zip paths ------------------------------------------------------------
  const attachmentZipPath = new Map<string, string>()
  const takenZip = new Set<string>()
  for (const path of [...opts.attachments].sort()) {
    if (isVaultInternal(path) || isExcluded(path, excludes)) continue
    let zip = safePath(path)
    if (takenZip.has(zip.toLowerCase())) {
      const ext = extname(zip)
      zip = `${stripExtension(zip)}-${hashString(path).slice(0, 6)}${ext ? '.' + ext : ''}`
    }
    takenZip.add(zip.toLowerCase())
    attachmentZipPath.set(path, zip)
  }
  const usedAssets = new Set<string>()
  const assetUrl = (vaultPath: string): string | null => {
    const zip = attachmentZipPath.get(vaultPath)
    if (!zip) return null
    usedAssets.add(vaultPath)
    return `${assetsBase}/${zip}`
  }

  // ---- folders ------------------------------------------------------------------------------
  const folders = new Map<string, BundleFolder>()
  const folderFor = (type: FolderDocumentType, folderPath: string): string | null => {
    const levels = folderLevels(folderPath, opts.rootFolder)
    let parent: string | null = null
    for (let i = 0; i < levels.length; i++) {
      const key = levels.slice(0, i + 1).join('\u0001')
      const id = makeId(vault, 'folder', type, key)
      if (!folders.has(id)) {
        folders.set(id, { kind: 'folder', id, type, name: levels[i], parent, sourcePath: levels.slice(0, i + 1).join('/') })
      }
      parent = id
    }
    return parent
  }

  // ---- pass 1: decide which notes are exported, allocate ids --------------------------------
  interface Prepared {
    note: NoteInput
    name: string
    id: string
    pageId: string
    body: string
    ownership?: BundleJournal['ownership']
  }
  const prepared: Prepared[] = []
  const targets = new Map<string, LinkTarget>()

  for (const note of [...opts.notes].sort((a, b) => a.path.localeCompare(b.path))) {
    if (isExcluded(note.path, excludes)) {
      skipped.push({ sourcePath: note.path, reason: 'Ausschlussmuster' })
      continue
    }
    const split = splitFrontmatter(note.content)
    const fm = note.frontmatter !== undefined ? note.frontmatter : split.frontmatter
    const warn = makeWarningCollector(warnings, note.path)
    if (split.frontmatterError) warn('invalid-frontmatter', `Frontmatter nicht lesbar: ${split.frontmatterError}`)
    const config = readNoteConfig(fm, warn)
    if (config.type === 'ignorieren') {
      skipped.push({ sourcePath: note.path, reason: 'foundry.typ: ignorieren' })
      continue
    }
    if (config.type === 'szene') warn('note-type-pending', 'Szenen kommen in M3, die Notiz wird vorerst als Journal exportiert.')

    const stripped = stripComments(split.body)
    if (stripped.unclosed) warn('unclosed-comment', 'Kommentar „%%“ nicht geschlossen: der Rest der Notiz wird (wie in Obsidian) ausgeblendet.')
    const body = stripBlockIds(stripped.text)
    const id = ids.get(note.path)
    const pageId = makeId(id, 'page', 'text')
    const name = stripExtension(basename(note.path))
    prepared.push({ note, name, id, pageId, body, ownership: config.ownership })
    targets.set(note.path, {
      uuid: `JournalEntry.${id}`,
      pageUuid: `JournalEntry.${id}.JournalEntryPage.${pageId}`,
      name,
    })
  }

  // PDFs become their own journal with a PDF page
  const pdfJournals: BundleJournal[] = []
  for (const [path] of attachmentZipPath) {
    if (assetKind(path) !== 'pdf') continue
    const id = ids.get(path)
    const pageId = makeId(id, 'page', 'pdf')
    const name = stripExtension(basename(path))
    targets.set(path, { uuid: `JournalEntry.${id}.JournalEntryPage.${pageId}`, name })
    const src = assetUrl(path)!
    const pages = [{ id: pageId, name, type: 'pdf' as const, src }]
    const folder = folderFor('JournalEntry', dirname(path))
    pdfJournals.push({ kind: 'journal', id, sourcePath: path, folder, name, pages, hash: hashObject({ v: BUNDLE_SCHEMA_VERSION, name, folder, pages }) })
  }

  const fenceHandlers = opts.fenceHandlers ?? {}
  const makeEnv = (sourcePath: string, warn: RenderEnv['warn'], id: string, map: Map<string, LinkTarget>): RenderEnv => ({
    sourcePath,
    resolver: opts.resolver,
    targets: map,
    assetUrl,
    warn,
    secretId: (n) => makeId(id, 'secret', String(n)),
    fenceHandlers,
    headings: [],
    secretCount: 0,
  })

  // headings of every note (for [[Note#Heading]]) – throwaway render without warnings
  for (const p of prepared) {
    const env = makeEnv(p.note.path, () => {}, p.id, new Map())
    renderBody(p.body, env)
    targets.get(p.note.path)!.headings = env.headings as HeadingInfo[]
  }
  usedAssets.clear()
  for (const pdf of pdfJournals) usedAssets.add(pdf.sourcePath)

  // ---- pass 2: render ---------------------------------------------------------------------
  const documents: BundleJournal[] = []
  for (const p of prepared) {
    const env = makeEnv(p.note.path, makeWarningCollector(warnings, p.note.path), p.id, targets)
    const html = renderBody(p.body, env)
    const folder = folderFor('JournalEntry', dirname(p.note.path))
    const pages = [{ id: p.pageId, name: p.name, type: 'text' as const, html }]
    const hash = hashObject({ v: BUNDLE_SCHEMA_VERSION, name: p.name, folder, ownership: p.ownership, pages })
    documents.push({ kind: 'journal', id: p.id, sourcePath: p.note.path, folder, name: p.name, ownership: p.ownership, pages, hash })
  }
  documents.push(...pdfJournals)

  // ---- assets -----------------------------------------------------------------------------
  const assetFiles = new Map<string, string>()
  const assets: BundleAsset[] = []
  for (const [path, zip] of attachmentZipPath) {
    if (!includeAll && !usedAssets.has(path)) continue
    assetFiles.set(`assets/${zip}`, path)
    assets.push({ path: zip, sourcePath: path, hash: '', size: 0 })
  }

  const bundle: Bundle = {
    schemaVersion: BUNDLE_SCHEMA_VERSION,
    generator: opts.generator ?? { name: 'vault-to-foundry', version: '0.0.0' },
    vault: { name: vault, slug },
    generatedAt: (opts.now ?? new Date()).toISOString(),
    assetsBase,
    folders: [...folders.values()].sort((a, b) => a.sourcePath.localeCompare(b.sourcePath)),
    documents,
    assets,
    warnings,
    skipped,
  }
  return { bundle, idMap: ids.result(), assetFiles }
}
