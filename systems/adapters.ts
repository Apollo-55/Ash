// Registry of the game systems for Obsidian and the export (plugin, export-cli, sync-cli).
// A new system: adapter in systems/<id>/adapter/src/index.ts, one entry here
// (and its Foundry hooks, if any, in ./foundry-hooks.ts). Nothing under packages/ changes.
import type { SystemAdapter } from '../packages/core/src/systems/adapter.ts'
import { dsa41Adapter } from './dsa41/adapter/src/index.ts'

export const SYSTEMS: readonly SystemAdapter<any>[] = [dsa41Adapter]
