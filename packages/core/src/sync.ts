import type { Bundle, DocumentFlags } from './types.ts'

const SECTION_RE = /<section\b([^>]*)>/gi

function attr(attrs: string, name: string): string | null {
  const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(attrs)
  return m ? (m[2] ?? m[3] ?? m[4] ?? '') : null
}

/** ids of secret sections that a GM has revealed in Foundry */
export function revealedSecretIds(html: string): Set<string> {
  const ids = new Set<string>()
  for (const m of html.matchAll(SECTION_RE)) {
    const classes = (attr(m[1], 'class') ?? '').split(/\s+/)
    const id = attr(m[1], 'id')
    if (id && classes.includes('secret') && classes.includes('revealed')) ids.add(id)
  }
  return ids
}

/** Keeps secrets revealed when the journal text is replaced by a new export. */
export function preserveRevealedSecrets(oldHtml: string, newHtml: string): string {
  const revealed = revealedSecretIds(oldHtml)
  if (!revealed.size) return newHtml
  return newHtml.replace(SECTION_RE, (full, attrs: string) => {
    const id = attr(attrs, 'id')
    const cls = attr(attrs, 'class')
    if (!id || !revealed.has(id) || cls === null) return full
    const classes = cls.split(/\s+/)
    if (!classes.includes('secret') || classes.includes('revealed')) return full
    return full.replace(/\bclass\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i, `class="${[...classes, 'revealed'].join(' ')}"`)
  })
}

export interface ExistingDocument {
  id: string
  flags?: Partial<DocumentFlags> | null
  folder?: string | null
}

export interface SyncPlan {
  create: string[]
  update: string[]
  skip: string[]
  /** importer-made documents of this vault that are no longer in the bundle */
  orphans: string[]
  /** documents with our id that were not made by this importer/vault – never touched */
  conflicts: string[]
}

/**
 * Decides per bundle document what to do, given the documents of one type that exist in the world.
 * Unchanged = same content hash and same bundle schema version and same folder.
 */
export function planSync(
  bundle: Pick<Bundle, 'vault' | 'schemaVersion'>,
  docs: { id: string; hash: string; folder: string | null }[],
  existing: ExistingDocument[],
  opts: { force?: boolean } = {}
): SyncPlan {
  const byId = new Map(existing.map((e) => [e.id, e]))
  const plan: SyncPlan = { create: [], update: [], skip: [], orphans: [], conflicts: [] }
  const inBundle = new Set<string>()
  for (const doc of docs) {
    inBundle.add(doc.id)
    const ex = byId.get(doc.id)
    if (!ex) {
      plan.create.push(doc.id)
      continue
    }
    if (!ex.flags || ex.flags.vault !== bundle.vault.slug) {
      plan.conflicts.push(doc.id)
      continue
    }
    const same =
      !opts.force &&
      ex.flags.hash === doc.hash &&
      ex.flags.bundleVersion === bundle.schemaVersion &&
      (ex.folder ?? null) === doc.folder
    ;(same ? plan.skip : plan.update).push(doc.id)
  }
  for (const ex of existing) {
    if (!inBundle.has(ex.id) && ex.flags?.vault === bundle.vault.slug) plan.orphans.push(ex.id)
  }
  return plan
}

/** Orders folders so that parents are created before children. */
export function sortFoldersByDepth<T extends { id: string; parent: string | null }>(folders: T[]): T[] {
  const byId = new Map(folders.map((f) => [f.id, f]))
  const depth = (f: T): number => {
    let d = 0
    let cur: T | undefined = f
    while (cur?.parent && byId.has(cur.parent) && d < 32) {
      cur = byId.get(cur.parent)
      d++
    }
    return d
  }
  return [...folders].sort((a, b) => depth(a) - depth(b))
}
