// The only place where Vault to Foundry (Obsidian) knows concrete game systems.
// A new system: adapter in systems/<id>/adapter, one line here (and in packages/foundry-module/src/systems.ts).
import type { SystemAdapter } from '../../core/src/index.ts'
import { dsa41Adapter } from '../../../systems/dsa41/adapter/src/index.ts'

export const SYSTEMS: Record<string, SystemAdapter<any>> = { dsa41: dsa41Adapter }
