// Keeps packages/ free of game systems and checks every registered system adapter.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { indexSystems, type SystemAdapter } from '../src/index.ts'
import { SYSTEMS } from '../../../systems/adapters.ts'
import { SYSTEM_HOOKS } from '../../../systems/foundry-hooks.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const sources = (dir: string, out: string[] = []): string[] => {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules') continue
    const f = join(dir, e)
    if (statSync(f).isDirectory()) sources(f, out)
    else if (/\.(ts|mjs|js)$/.test(e)) out.push(f)
  }
  return out
}
const importsOf = (file: string) =>
  [...readFileSync(file, 'utf8').matchAll(/(?:^|\n)\s*(?:import|export)[^'"\n]*?from\s+['"]([^'"]+)['"]/g)].map((m) => resolve(dirname(file), m[1]))

describe('package boundaries', () => {
  // the two places where the apps load the system registries
  const allowed: Record<string, string> = {
    'packages/obsidian-plugin/src/main.ts': 'systems/adapters.ts',
    'packages/foundry-module/src/actors.ts': 'systems/foundry-hooks.ts',
  }

  it('packages/ imports game systems only through the registries', () => {
    const bad: string[] = []
    for (const f of sources(join(root, 'packages'))) {
      const rel = relative(root, f)
      if (rel.includes('/test/')) continue
      for (const target of importsOf(f).map((t) => relative(root, t))) {
        if (!target.startsWith('systems/')) continue
        if (allowed[rel] !== target) bad.push(`${rel} → ${target}`)
      }
    }
    expect(bad).toEqual([])
  })

  it('packages/core imports nothing outside packages/core', () => {
    const core = join(root, 'packages/core/src')
    const bad = sources(core).flatMap((f) => importsOf(f).filter((t) => t.startsWith(root) && !t.startsWith(core)).map((t) => `${relative(root, f)} → ${relative(root, t)}`))
    expect(bad).toEqual([])
  })
})

describe('system registry', () => {
  it('ids and block languages are unique', () => {
    expect(() => indexSystems(SYSTEMS)).not.toThrow()
    const a = SYSTEMS[0]
    if (a) {
      expect(() => indexSystems([a, a])).toThrow(/twice/)
      expect(() => indexSystems([a, { ...a, id: 'other' }])).toThrow(/Block language/)
    }
  })

  it('Foundry hooks belong to a registered system', () => {
    const foundrySystems = new Set(SYSTEMS.map((s) => s.foundrySystem))
    for (const id of Object.keys(SYSTEM_HOOKS)) expect(foundrySystems.has(id), id).toBe(true)
  })

  describe.each(SYSTEMS.map((s) => [s.id, s] as [string, SystemAdapter<any>]))('adapter %s', (_id, adapter) => {
    it('has the required fields', () => {
      expect(adapter.label).toBeTruthy()
      expect(adapter.foundrySystem).toBeTruthy()
      expect(adapter.blockLanguage).toMatch(/^[a-z0-9-]+$/)
    })

    it('template is a fence of its block language', () => {
      expect(adapter.template()).toMatch(new RegExp('^```' + adapter.blockLanguage + '\\n[\\s\\S]*\\n```\\n?$'))
    })

    it('template parses, renders and converts to an actor', () => {
      const inner = adapter.template().replace(/^```[^\n]*\n/, '').replace(/\n```\n?$/, '').replace(/^name:\s*$/m, 'name: Test')
      const block = adapter.parse(inner)
      expect(block.issues.filter((i) => i.level === 'error')).toEqual([])
      expect(block.name).toBe('Test')
      expect(adapter.renderStatblock(block, {})).toContain('Test')
      const actor = adapter.toActor(block.data, {
        actorId: 'a'.repeat(16), sourcePath: 'Test.md', journalName: 'Test', resolveImage: () => null, nearbyImages: {}, linkedDefault: false,
      })
      expect(actor.name).toBe('Test')
      expect(actor.system).toBe(adapter.foundrySystem)
    })
  })
})
