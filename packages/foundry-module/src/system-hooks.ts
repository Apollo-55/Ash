import type { BundleActor, BundleItem, BundleWarning } from '../../core/src/types.ts'

/**
 * What the actor import needs to know about a game system in Foundry. Everything system-specific
 * (actor type, compendium order, item identity, combat values) lives behind this interface;
 * implementations sit in systems/<id>/, registered in systems/foundry-hooks.ts.
 */
export interface FoundrySystemHooks {
  /** actor document type for NPCs, e.g. "character" (dsa-41) or "npc" (dnd5e) */
  actorType: string
  /** extra fields to load in compendium indexes (e.g. "system.sid") */
  indexFields?: string[]
  /** compendium search order of the system's own packs, lower first */
  packRank?(packName: string): number
  /** does a compendium index entry match the item's catalog hint from the export? */
  matchesSource?(entry: any, source: NonNullable<BundleItem['source']>): boolean
  /** system data merged into a new actor (e.g. "armed with the first weapon") */
  onCreate?(a: BundleActor): Record<string, unknown>
  /** after create and update, when all items exist: system fixes such as AT/PA from the block */
  afterItems?(actor: any, a: BundleActor, report: { warnings: BundleWarning[] }): Promise<void>
}

/** systems without own hooks: first actor type the system defines, names only */
export function defaultHooks(): FoundrySystemHooks {
  const types = Object.keys((globalThis as any).game?.system?.documentTypes?.Actor ?? {})
  return { actorType: types.includes('npc') ? 'npc' : (types[0] ?? 'npc') }
}
