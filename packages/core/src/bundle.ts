import { hashObject, hashString, makeId } from './ids.ts'
import { makeWarningCollector, normalizeHeading, type FenceHandler, type HeadingInfo, type LinkTarget, type RenderEnv } from './markdown/env.ts'
import { splitFrontmatter, stripBlockIds, stripComments } from './markdown/preprocess.ts'
import { renderBody } from './markdown/render.ts'
import { readNoteConfig } from './note-config.ts'
import { assetKind, basename, dirname, extname, folderLevels, isExcluded, isUploadable, isVaultInternal, safePath, stripExtension, vaultSlug } from './paths.ts'
import type { LinkResolver } from './resolver.ts'
import type { ParsedBlock, SystemAdapter } from './systems/adapter.ts'
import { leafletToPixel, parseLeafletBlock, parseSceneBlock, renderSceneCard, SCENE_BLOCK, type LeafletBlock, type LeafletMarker, type SceneBlockData } from './scenes.ts'
import {
  BUNDLE_SCHEMA_VERSION,
  type Bundle,
  type BundleActor,
  type BundleAsset,
  type BundleDocument,
  type BundleScene,
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
  /** game system adapter for NPC blocks (e.g. dsa41Adapter); without it NPC blocks stay code blocks */
  system?: SystemAdapter<any>
  /** markers of the Leaflet plugin (data.json → mapMarkers), keyed by map id */
  leafletMarkers?: Record<string, LeafletMarker[]>
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
  const adapter = opts.system

  // ---- attachments → zip paths ------------------------------------------------------------
  const attachmentZipPath = new Map<string, string>()
  const takenZip = new Set<string>()
  for (const path of [...opts.attachments].sort()) {
    if (isVaultInternal(path)) continue
    if (isExcluded(path, excludes)) {
      skipped.push({ sourcePath: path, reason: 'Ausschlussmuster' })
      continue
    }
    if (!isUploadable(path)) {
      skipped.push({ sourcePath: path, reason: `Dateityp „.${extname(path) || '?'}“ nimmt Foundry nicht an` })
      continue
    }
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
    blocks: { name: string; actorId: string; parsed: ParsedBlock<unknown>; startLine: number }[]
    images: { line: number; ref: string }[]
    scenes: { name: string; sceneId: string; parsed: ParsedBlock<SceneBlockData> }[]
  }
  const prepared: Prepared[] = []
  const leafletBlocks = new Map<string, LeafletBlock & { sourcePath: string }>()
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
    const target: LinkTarget = {
      uuid: `JournalEntry.${id}`,
      pageUuid: `JournalEntry.${id}.JournalEntryPage.${pageId}`,
      name,
    }
    const blocks: Prepared['blocks'] = []
    if (adapter) {
      const seenNames = new Map<string, number>()
      for (const fence of findFences(body, adapter.blockLanguage)) {
        const parsed = adapter.parse(fence.content)
        const label = parsed.name ?? `Block ${blocks.length + 1}`
        for (const issue of parsed.issues) {
          if (issue.level === 'info') continue
          warn(issue.level === 'error' ? 'nsc-error' : 'nsc-warning', `NSC „${label}“: ${issue.message}`)
        }
        if (!parsed.data || !parsed.name) {
          blocks.push({ name: label, actorId: '', parsed, startLine: fence.startLine })
          continue
        }
        const n = seenNames.get(parsed.name) ?? 0
        seenNames.set(parsed.name, n + 1)
        const actorId = ids.get(`${note.path}#${parsed.name}${n ? `#${n + 1}` : ''}`)
        blocks.push({ name: parsed.name, actorId, parsed, startLine: fence.startLine })
        target.anchors ??= new Map()
        target.anchors.set(normalizeHeading(parsed.name), { uuid: `Actor.${actorId}`, name: parsed.name })
      }
    }
    // scene blocks
    const scenes: Prepared['scenes'] = []
    const sceneNames = new Map<string, number>()
    for (const fence of findFences(body, SCENE_BLOCK)) {
      const parsed = parseSceneBlock(fence.content)
      const sName = parsed.name ?? name
      for (const issue of parsed.issues) {
        if (issue.level !== 'info') warn(issue.level === 'error' ? 'scene-error' : 'scene-warning', `Szene „${sName}“: ${issue.message}`)
      }
      const n = sceneNames.get(sName) ?? 0
      sceneNames.set(sName, n + 1)
      const label = n ? `${sName} ${n + 1}` : sName
      const sceneId = parsed.data ? ids.get(`${note.path}#szene:${label}`) : ''
      scenes.push({ name: label, sceneId, parsed })
      if (sceneId && parsed.name) {
        target.anchors ??= new Map()
        target.anchors.set(normalizeHeading(parsed.name), { uuid: `Scene.${sceneId}`, name: label })
      }
    }
    for (const fence of findFences(body, 'leaflet')) {
      const lb = parseLeafletBlock(fence.content)
      if (lb && !leafletBlocks.has(lb.id)) leafletBlocks.set(lb.id, { ...lb, sourcePath: note.path })
    }
    prepared.push({ note, name, id, pageId, body, ownership: config.ownership, blocks, images: findImageEmbeds(body), scenes })
    targets.set(note.path, target)
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

  const fenceHandlers: Record<string, FenceHandler> = { ...(opts.fenceHandlers ?? {}) }
  const blocksByNote = new Map(prepared.map((p) => [p.note.path, p.blocks]))
  const scenesByNote = new Map(prepared.map((p) => [p.note.path, p.scenes]))
  const resolveImageRef = (ref: string, from: string): string | null => {
    const clean = ref.replace(/^["']|["']$/g, '').replace(/^!?\[\[|\]\]$/g, '').split('|')[0].trim()
    const path = opts.resolver.resolve(clean, from)
    return path ? assetUrl(path) : null
  }
  const sceneImage = (d: SceneBlockData, from: string): string | null => {
    if (d.karte) return resolveImageRef(d.karte, from)
    const lb = d.leaflet ? leafletBlocks.get(d.leaflet) : undefined
    return lb?.images[0] ? resolveImageRef(lb.images[0], lb.sourcePath) : null
  }
  fenceHandlers[SCENE_BLOCK] = (content, env) => {
    const idx = (env as RenderEnv & { sceneCount?: number }).sceneCount ?? 0
    ;(env as RenderEnv & { sceneCount?: number }).sceneCount = idx + 1
    const s = scenesByNote.get(env.sourcePath)?.[idx]
    const parsed = s?.parsed ?? parseSceneBlock(content)
    return renderSceneCard(parsed, {
      sceneUuid: s?.sceneId ? `Scene.${s.sceneId}` : undefined,
      fallbackName: s?.name,
      imageSrc: parsed.data ? sceneImage(parsed.data, env.sourcePath) : null,
    })
  }
  if (adapter) {
    fenceHandlers[adapter.blockLanguage] = (content, env) => {
      const b = blocksByNote.get(env.sourcePath)?.[env.blockCount++]
      const parsed = b?.parsed ?? adapter.parse(content)
      return adapter.renderStatblock(parsed, { actorUuid: b?.actorId ? `Actor.${b.actorId}` : undefined })
    }
  }
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
    blockCount: 0,
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
  const documents: BundleDocument[] = []
  for (const p of prepared) {
    const env = makeEnv(p.note.path, makeWarningCollector(warnings, p.note.path), p.id, targets)
    const html = renderBody(p.body, env)
    const folder = folderFor('JournalEntry', dirname(p.note.path))
    const pages = [{ id: p.pageId, name: p.name, type: 'text' as const, html }]
    const hash = hashObject({ v: BUNDLE_SCHEMA_VERSION, name: p.name, folder, ownership: p.ownership, pages })
    documents.push({ kind: 'journal', id: p.id, sourcePath: p.note.path, folder, name: p.name, ownership: p.ownership, pages, hash })
  }
  documents.push(...pdfJournals)

  // ---- actors from NPC blocks ---------------------------------------------------------------
  const actors: BundleActor[] = []
  if (adapter) {
    for (const p of prepared) {
      const valid = p.blocks.filter((b) => b.actorId)
      valid.forEach((b, i) => {
        const next = valid[i + 1]?.startLine ?? Infinity
        const from = i === 0 ? 0 : b.startLine
        const near = p.images.filter((img) => img.line >= from && img.line < next)
        const isToken = (ref: string) => /^token[_-]/i.test(basename(ref))
        const resolveImage = (ref: string): string | null => {
          const clean = ref.replace(/^!?\[\[|\]\]$/g, '').split('|')[0].trim()
          // web images (e.g. ![](https://…)) are used directly
          if (/^https?:\/\//i.test(clean)) return clean
          const path = opts.resolver.resolve(clean, p.note.path)
          if (!path) {
            warnings.push({ code: 'nsc-warning', sourcePath: p.note.path, message: `NSC „${b.name}“: Bild „${clean}“ nicht gefunden.` })
            return null
          }
          return assetUrl(path)
        }
        const partial = adapter.toActor(b.parsed.data, {
          actorId: b.actorId,
          sourcePath: p.note.path,
          journalId: p.id,
          journalName: p.name,
          resolveImage,
          nearbyImages: {
            portrait: near.find((img) => !isToken(img.ref) && assetKind(img.ref) === 'image')?.ref,
            token: near.find((img) => isToken(img.ref))?.ref,
          },
          linkedDefault: valid.length === 1,
        })
        const folder = folderFor('Actor', dirname(p.note.path))
        const actor: Omit<BundleActor, 'hash'> = { kind: 'actor', id: b.actorId, sourcePath: p.note.path, blockName: b.name, folder, ...partial }
        actors.push({ ...actor, hash: hashObject({ v: BUNDLE_SCHEMA_VERSION, ...actor }) })
      })
    }
  }
  documents.push(...actors)

  // ---- scenes from szene blocks -------------------------------------------------------------
  const scenes: BundleScene[] = []
  const actorIdsOf = (link: string, from: string, warnScene: (m: string) => void): string[] => {
    const inner = link.replace(/^\[\[|\]\]$/g, '')
    const [targetRaw, sub] = inner.split('|')[0].split('#')
    const notePath = targetRaw.trim() ? opts.resolver.resolve(targetRaw.trim(), from) : from
    const blocks = (notePath && blocksByNote.get(notePath)?.filter((b) => b.actorId)) || []
    if (!blocks.length) {
      warnScene(`NSC ${link}: keine NSC-Blöcke gefunden.`)
      return []
    }
    if (sub) {
      const hit = blocks.find((b) => normalizeHeading(b.name) === normalizeHeading(sub))
      if (!hit) warnScene(`NSC ${link}: kein Block mit diesem Namen.`)
      return hit ? [hit.actorId] : []
    }
    if (blocks.length > 1) warnScene(`NSC ${link}: die Notiz hat ${blocks.length} NSC-Blöcke – alle werden gesetzt (oder gezielt mit [[Notiz#Name]]).`)
    return blocks.map((b) => b.actorId)
  }
  for (const p of prepared) {
    for (const s of p.scenes) {
      const d = s.parsed.data
      if (!d || !s.sceneId) continue
      const warnScene = (m: string) => warnings.push({ code: 'scene-warning', sourcePath: p.note.path, message: `Szene „${s.name}“: ${m}` })
      const img = sceneImage(d, p.note.path)
      if (!img) {
        warnings.push({ code: 'scene-error', sourcePath: p.note.path, message: `Szene „${s.name}“: ${d.leaflet && !leafletBlocks.has(d.leaflet) ? `Leaflet-Karte „${d.leaflet}“ nicht gefunden` : 'Kartenbild nicht gefunden'} – Szene übersprungen.` })
        continue
      }
      const grid = d.grid ?? (d.leaflet ? { type: 'none' as const, size: 100, distance: 1, units: 'Schritt' } : { type: 'square' as const, size: 100, distance: 1, units: 'Schritt' })
      const tokens = [...new Set(d.nscs.flatMap((l) => actorIdsOf(l, p.note.path, warnScene)))]
      // Leaflet markers with a link to an exported note become map pins
      const pins: BundleScene['pins'] = []
      if (d.leaflet) {
        const lb = leafletBlocks.get(d.leaflet)!
        const markers = opts.leafletMarkers?.[d.leaflet] ?? []
        if (lb.hasBounds && markers.length) warnScene('Leaflet-Karte mit eigenen „bounds“ – Marker können nicht umgerechnet werden, keine Pins.')
        else {
          let skipped = 0
          markers.forEach((m, i) => {
            const linkPath = m.link ? opts.resolver.resolve(String(m.link).replace(/^\[\[|\]\]$/g, ''), lb.sourcePath) : null
            const t = linkPath ? targets.get(linkPath) : undefined
            const entry = t ? /^JournalEntry\.([A-Za-z0-9]{16})(?:\.JournalEntryPage\.([A-Za-z0-9]{16}))?/.exec(t.uuid) : null
            if (!entry) {
              if (m.link) warnScene(`Leaflet-Marker „${m.link}“: Ziel wird nicht exportiert, kein Pin.`)
              else skipped++
              return
            }
            const { x, y } = leafletToPixel(m.loc, lb.maxZoom)
            pins.push({ id: makeId(s.sceneId, 'pin', String(i), String(m.link)), x, y, label: t!.name, entryId: entry[1], ...(entry[2] ? { pageId: entry[2] } : {}) })
          })
          if (skipped) warnScene(`${skipped} Leaflet-Marker ohne Link übersprungen.`)
        }
      }
      const scene: Omit<BundleScene, 'hash'> = {
        kind: 'scene', id: s.sceneId, sourcePath: p.note.path, blockName: s.name,
        folder: folderFor('Scene', dirname(p.note.path)), name: s.name, img, grid, journal: p.id,
        lighting: d.licht, fog: d.nebel, navigation: d.navigation, tokens, pins,
      }
      scenes.push({ ...scene, hash: hashObject({ v: BUNDLE_SCHEMA_VERSION, ...scene }) })
    }
  }
  documents.push(...scenes)

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
    ...(actors.length && adapter ? { system: adapter.foundrySystem } : {}),
    assetsBase,
    folders: [...folders.values()].sort((a, b) => a.sourcePath.localeCompare(b.sourcePath)),
    documents,
    assets,
    warnings,
    skipped,
  }
  return { bundle, idMap: ids.result(), assetFiles }
}

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})\s*([^\s`]*)/

/** Top-level fenced code blocks of one language (line-based, like Obsidian). */
export function findFences(body: string, lang: string): { content: string; startLine: number }[] {
  const lines = body.split('\n')
  const out: { content: string; startLine: number }[] = []
  for (let i = 0; i < lines.length; i++) {
    const m = FENCE_OPEN.exec(lines[i])
    if (!m) continue
    const marker = m[1]
    let j = i + 1
    const isClose = (line: string) => {
      const t = line.trim()
      return t.length >= marker.length && /^(`+|~+)$/.test(t) && t[0] === marker[0]
    }
    while (j < lines.length && !isClose(lines[j])) j++
    if (m[2].toLowerCase() === lang) out.push({ content: lines.slice(i + 1, j).join('\n'), startLine: i })
    i = j
  }
  return out
}

/** Image embeds with their line numbers ("![[x.png]]", "![](x.png)"). */
export function findImageEmbeds(body: string): { line: number; ref: string }[] {
  const out: { line: number; ref: string }[] = []
  body.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(/!\[\[([^\]|#]+)[^\]]*\]\]|!\[[^\]]*\]\(([^)\s]+)\)/g)) out.push({ line: i, ref: (m[1] ?? decodeURIComponent(m[2])).trim() })
  })
  return out
}
