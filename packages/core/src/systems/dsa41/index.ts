import type { SystemAdapter } from '../adapter.ts'
import { nscToActor } from './actor.ts'
import { renderStatblock } from './render.ts'
import { parseNscBlock, type NscData } from './schema.ts'

export const DSA41_TEMPLATE = `\`\`\`dsa-nsc
name:
rolle:
eigenschaften: { MU: 12, KL: 12, IN: 12, CH: 12, FF: 12, GE: 12, KO: 12, KK: 12 }
LeP: 30
AuP: 30
RS: 0
waffen:
  - { name: Säbel, AT: 12, PA: 10, TP: 1W6+3 }
talente: { Sinnenschärfe: 5, Menschenkenntnis: 5 }
vorteile: []
nachteile: {}
sonderfertigkeiten: []
\`\`\`
`

export const dsa41Adapter: SystemAdapter<NscData> = {
  id: 'dsa41',
  foundrySystem: 'dsa-41',
  blockLanguage: 'dsa-nsc',
  parse: parseNscBlock,
  renderStatblock,
  toActor: nscToActor,
  template: () => DSA41_TEMPLATE,
}

export { parseNscBlock, renderStatblock, nscToActor }
export { computeDerived, overrides } from './derived.ts'
export { findWeapon, find as findCatalog, findBySid, normalizeName, suggest, CATALOG_VERSION } from './catalog.ts'
export type { NscData, NscWeapon, NamedEntry } from './schema.ts'
export { checkSfPrerequisites, baseEnergies, SF_RULES } from './rules.ts'
