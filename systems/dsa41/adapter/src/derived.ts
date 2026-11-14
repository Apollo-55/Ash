import { find, normalizeName } from './catalog.ts'
import { ATTRIBUTES, type NscData } from './schema.ts'

/** Values the dsa-41 system calculates by itself (same formulas and rounding as the system, v13.1.4). */
export interface Derived {
  atBasis?: number
  paBasis?: number
  fkBasis?: number
  INI?: number
  MR?: number
  WS?: number
  GS?: number
  ausweichen?: number
}

const has = (list: { name: string }[], name: string) => list.some((e) => normalizeName(e.name) === normalizeName(name))

export function computeDerived(d: NscData): Derived {
  const a = d.attributes
  const all = ATTRIBUTES.every((x) => a[x] !== undefined)
  const r = (sum: number, div: number) => Math.round(sum / div)
  if (!all) return {}
  const MU = a.MU!, KL = a.KL!, IN = a.IN!, FF = a.FF!, GE = a.GE!, KO = a.KO!, KK = a.KK!
  // species and culture from the compendia modify MR (species also INI); the system adds them to the calculated value,
  // as it does Hohe/Niedrige Magieresistenz and the manual modifier (additionalMR)
  const species = d.rasse ? find(['species'], d.rasse) : undefined
  const culture = d.kultur ? find(['culture'], d.kultur) : undefined
  const hoheMR = d.vorteile.find((v) => normalizeName(v.name) === 'hohemagieresistenz')?.value ?? 0
  const niedrigeMR = d.nachteile.find((v) => normalizeName(v.name) === 'niedrigemagieresistenz')?.value ?? 0
  const out: Derived = {
    atBasis: r(MU + GE + KK, 5),
    paBasis: r(IN + GE + KK, 5),
    fkBasis: r(IN + FF + KK, 5),
    INI: r(MU + MU + IN + GE, 5) + (species?.ini ?? 0),
    MR: r(MU + KL + KO, 5) + (species?.mr ?? 0) + (culture?.mr ?? 0) + hoheMR - niedrigeMR + (d.mrMod ?? 0),
    WS: r(KO, 2),
  }
  // speed: 8, ±1 for GE ≥ 16 / ≤ 10, Flink/Behäbig/Kleinwüchsig … (without encumbrance)
  let gs = 8
  if (GE >= 16) gs += 1
  if (GE <= 10) gs -= 1
  const flink = d.vorteile.find((v) => normalizeName(v.name) === 'flink')
  if (flink) gs += flink.value ?? 1
  if (has(d.nachteile, 'Behäbig')) gs -= 1
  if (has(d.nachteile, 'Kleinwüchsig')) gs -= 1
  if (has(d.nachteile, 'Lahm')) gs -= 1
  if (has(d.nachteile, 'Zwergenwuchs')) gs -= 2
  out.GS = gs
  // dodge: PA-Basis + 3 per Ausweichen I–III, Flink +1, Behäbig −1 (without encumbrance and Akrobatik)
  let aw = out.paBasis!
  for (const sf of ['Ausweichen I', 'Ausweichen II', 'Ausweichen III']) if (has(d.sonderfertigkeiten, sf)) aw += 3
  if (flink) aw += 1
  if (has(d.nachteile, 'Behäbig')) aw -= 1
  const akrobatik = d.talente.find((t) => normalizeName(t.name) === 'akrobatik')?.value
  if (akrobatik && akrobatik > 9) aw += Math.floor((akrobatik - 9) / 3)
  out.ausweichen = aw
  return out
}

/** Overridden values that differ from the calculation (for the "gerechnet" hint). */
export function overrides(d: NscData): { key: keyof Derived; label: string; given: number; calculated: number }[] {
  const der = computeDerived(d)
  const pairs: [keyof Derived, string, number | undefined][] = [
    ['MR', 'MR', d.MR], ['INI', 'INI', d.INI], ['WS', 'WS', d.WS], ['GS', 'GS', d.GS], ['ausweichen', 'Ausweichen', d.ausweichen],
  ]
  return pairs
    .filter(([k, , v]) => v !== undefined && der[k] !== undefined && der[k] !== v)
    .map(([k, label, v]) => ({ key: k, label, given: v!, calculated: der[k]! }))
}
