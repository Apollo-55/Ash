// Picks the game system adapter for the command-line tools: --system <id> (default: first registered), --no-system for none.
import { indexSystems, type SystemAdapter } from '../packages/core/src/index.ts'
import { SYSTEMS } from '../systems/adapters.ts'

export function systemFromArgs(args: string[]): SystemAdapter<any> | undefined {
  if (args.includes('--no-system')) return undefined
  const i = args.indexOf('--system')
  if (i < 0) return SYSTEMS[0]
  const id = args[i + 1]
  const adapter = indexSystems(SYSTEMS)[id]
  if (!adapter) {
    console.error(`Unbekanntes System „${id ?? ''}“. Vorhanden: ${SYSTEMS.map((s) => s.id).join(', ') || '(keins)'}`)
    process.exit(1)
  }
  return adapter
}
