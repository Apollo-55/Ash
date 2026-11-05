import type { BundleActor } from '../types.ts'

export type IssueLevel = 'error' | 'warning' | 'info'

export interface BlockIssue {
  level: IssueLevel
  message: string
}

export interface ParsedBlock<T> {
  /** block name (actor name) if it could be read */
  name: string | null
  /** null when the block is unusable (YAML broken, name missing) */
  data: T | null
  issues: BlockIssue[]
}

export interface ActorContext {
  actorId: string
  sourcePath: string
  journalId?: string
  journalName: string
  /** resolves an image reference ("bild.png", "[[bild.png]]") to a Foundry data path */
  resolveImage(ref: string): string | null
  /** images found in the note around the block (vault paths), used as defaults */
  nearbyImages: { portrait?: string; token?: string }
  /** default for prototypeToken.actorLink */
  linkedDefault: boolean
}

export interface StatblockOptions {
  /** link to the Foundry actor (journal rendering) */
  actorUuid?: string
  /** show validation problems (Obsidian) */
  showIssues?: boolean
  /** show calculated values next to overridden ones (Obsidian, GM only) */
  showCalculated?: boolean
}

/** Everything that depends on the game system lives behind this interface. */
export interface SystemAdapter<T = unknown> {
  /** adapter id, e.g. "dsa41" */
  id: string
  /** name shown in settings, e.g. "DSA 4.1" */
  label: string
  /** Foundry system id, e.g. "dsa-41" */
  foundrySystem: string
  /** code block language, e.g. "dsa-nsc" */
  blockLanguage: string
  parse(source: string): ParsedBlock<T>
  renderStatblock(block: ParsedBlock<T>, opts: StatblockOptions): string
  toActor(block: T, ctx: ActorContext): Omit<BundleActor, 'hash' | 'folder' | 'sourcePath' | 'blockName' | 'kind' | 'id'>
  /** empty block for the "insert template" command */
  template(): string
}

/**
 * Indexes registered adapters by id. Throws on duplicate ids or block languages,
 * so a misconfigured registry fails loudly at load time instead of silently shadowing a system.
 */
export function indexSystems(list: readonly SystemAdapter<any>[]): Record<string, SystemAdapter<any>> {
  const byId: Record<string, SystemAdapter<any>> = {}
  const languages = new Map<string, string>()
  for (const a of list) {
    if (!a.id) throw new Error('System adapter without id')
    if (byId[a.id]) throw new Error(`System adapter "${a.id}" registered twice`)
    const other = languages.get(a.blockLanguage)
    if (other) throw new Error(`Block language "${a.blockLanguage}" used by "${other}" and "${a.id}"`)
    byId[a.id] = a
    languages.set(a.blockLanguage, a.id)
  }
  return byId
}
