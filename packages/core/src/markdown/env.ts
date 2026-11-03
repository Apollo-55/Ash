import type { LinkResolver } from '../resolver.ts'
import type { BundleWarning, WarningCode } from '../types.ts'

export interface HeadingInfo {
  /** Plain text of the heading */
  text: string
  /** Anchor used in Foundry (data-anchor) */
  slug: string
}

/** Something a wikilink can point to inside Foundry. */
export interface LinkTarget {
  /** Foundry UUID of the document, e.g. "JournalEntry.abc…" */
  uuid: string
  /** UUID of the text page that holds the note's headings (for #heading links) */
  pageUuid?: string
  name: string
  headings?: HeadingInfo[]
  /** Named sub-targets (e.g. NPC blocks → Actor) reachable via [[Note#Name]] */
  anchors?: Map<string, { uuid: string; name: string }>
}

export type FenceHandler = (content: string, env: RenderEnv, info: string) => string

export interface RenderEnv {
  sourcePath: string
  resolver: LinkResolver
  /** vault path of a note or pdf → Foundry target */
  targets: Map<string, LinkTarget>
  /** vault path of an attachment → URL relative to Foundry's data root, or null if not exported */
  assetUrl(vaultPath: string): string | null
  warn(code: WarningCode, message: string): void
  /** Stable id for the n-th secret in this note */
  secretId(index: number): string
  fenceHandlers: Record<string, FenceHandler>
  /** filled during parsing */
  headings: HeadingInfo[]
  secretCount: number
}

export function makeWarningCollector(list: BundleWarning[], sourcePath: string) {
  return (code: WarningCode, message: string) => list.push({ code, sourcePath, message })
}

/** Normalises heading text for matching link text against headings. */
export function normalizeHeading(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
}

/** Mirrors Foundry's JournalEntryPage.slugifyHeading (v13). */
export function slugifyHeading(text: string): string {
  return text
    .replace(/\s+/g, '-')
    .trim()
    .toLowerCase()
    .replace(/["']/g, '')
    .substring(0, 64)
}
