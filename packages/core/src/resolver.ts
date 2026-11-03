import { basename, dirname, stripExtension } from './paths.ts'

/**
 * Resolves Obsidian link paths to vault paths. The Obsidian plugin implements this with
 * metadataCache.getFirstLinkpathDest; tests and the CLI use createSimpleResolver.
 */
export interface LinkResolver {
  /** Returns the vault path of the linked file (note or attachment) or null. */
  resolve(linkpath: string, fromPath: string): string | null
}

/**
 * Approximation of Obsidian's resolution: exact path, then path relative to the source
 * folder, then shortest path whose basename (with or without ".md") matches.
 */
export function createSimpleResolver(allPaths: string[]): LinkResolver {
  const set = new Set(allPaths)
  const byBase = new Map<string, string[]>()
  for (const p of allPaths) {
    for (const key of new Set([basename(p).toLowerCase(), stripExtension(basename(p)).toLowerCase()])) {
      const list = byBase.get(key) ?? []
      list.push(p)
      byBase.set(key, list)
    }
  }
  for (const list of byBase.values()) list.sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b))

  return {
    resolve(linkpath, fromPath) {
      const lp = linkpath.trim().replace(/^\.\//, '')
      if (!lp) return null
      for (const candidate of [lp, `${lp}.md`]) {
        if (set.has(candidate)) return candidate
        const rel = dirname(fromPath) ? `${dirname(fromPath)}/${candidate}` : candidate
        if (set.has(rel)) return rel
      }
      if (lp.includes('/')) {
        const lower = lp.toLowerCase()
        const hit = allPaths.find((p) => p.toLowerCase().endsWith('/' + lower) || p.toLowerCase().endsWith('/' + lower + '.md'))
        return hit ?? null
      }
      const hits = byBase.get(lp.toLowerCase())
      return hits?.[0] ?? null
    },
  }
}
