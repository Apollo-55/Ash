// The only place where the Foundry module knows concrete game systems (keyed by Foundry system id).
// A new system: hooks in systems/<id>/adapter/src/foundry.ts, one line here (and in packages/obsidian-plugin/src/systems.ts).
import { dsa41FoundryHooks } from '../../../systems/dsa41/adapter/src/foundry.ts'
import type { FoundrySystemHooks } from './system-hooks.ts'

export const SYSTEM_HOOKS: Record<string, FoundrySystemHooks> = { 'dsa-41': dsa41FoundryHooks }
