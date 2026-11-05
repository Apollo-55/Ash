// Registry of the game systems for the Foundry module, keyed by Foundry system id (game.system.id).
// Import only the small Foundry part of a system here, not its whole adapter (catalogs would end up in module.js).
// Systems without an entry get defaultHooks() (first actor type, items by name only).
import type { FoundrySystemHooks } from '../packages/foundry-module/src/system-hooks.ts'
import { dsa41FoundryHooks } from './dsa41/adapter/src/foundry.ts'

export const SYSTEM_HOOKS: Readonly<Record<string, FoundrySystemHooks>> = {
  'dsa-41': dsa41FoundryHooks,
}
