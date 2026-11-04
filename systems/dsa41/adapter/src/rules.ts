import { normalizeName } from './catalog.ts'
import type { Attr, NscData } from './schema.ts'

/**
 * Prerequisites of special abilities (DSA 4.1, Wege der Helden). Only the ones that are
 * checkable from a dsa-nsc block: attributes, base values, other SF, talent values.
 */
export interface SfRule {
  attr?: Partial<Record<Attr, number>>
  base?: Partial<Record<'AT' | 'PA' | 'INI', number>>
  sf?: string[]
  /** at least one of these SF */
  sfAny?: string[]
  talent?: Record<string, number>
}

export const SF_RULES: Record<string, SfRule> = {
  'Klingentänzer': { attr: { GE: 15 }, sf: ['Kampfgespür', 'Klingensturm', 'Klingenwand'] },
  'Todesstoß': { attr: { MU: 15 }, sf: ['Gezielter Stich'] },
  'Gezielter Stich': { sf: ['Finte'] },
  'Hammerschlag': { attr: { MU: 15 }, sf: ['Niederwerfen'] },
  'Meisterparade': { base: { PA: 8 } },
  'Kampfreflexe': { base: { INI: 10 } },
  'Beidhändiger Kampf I': { attr: { GE: 12 }, sf: ['Linkhand'] },
  'Niederwerfen': { sf: ['Wuchtschlag'] },
  'Wuchtschlag': { attr: { KK: 12 } },
  'Ausweichen I': { attr: { GE: 10 } },
  'Ausweichen II': { attr: { GE: 12 }, sf: ['Ausweichen I', 'Aufmerksamkeit'] },
  'Rüstungsgewöhnung I': { attr: { KK: 10 } },
  'Rüstungsgewöhnung II': { attr: { KK: 12 }, sf: ['Rüstungsgewöhnung I'] },
  'Entwaffnen': { attr: { KK: 12 }, sf: ['Binden'] },
  'Binden': { attr: { IN: 12, GE: 12 }, sfAny: ['Meisterparade', 'Parierwaffen I'] },
  'Parierwaffen I': { attr: { GE: 12 }, sf: ['Linkhand'] },
  'Finte': { attr: { GE: 12 } },
  'Meister der Improvisation': { attr: { IN: 12, FF: 12 } },
  'Geschützmeister': { attr: { FF: 12 }, talent: { Belagerungswaffen: 10, Mechanik: 7 } },
  'Kampfgespür': { attr: { IN: 15 }, sf: ['Aufmerksamkeit', 'Kampfreflexe'] },
  'Aufmerksamkeit': { attr: { IN: 12 } },
  'Standfest': { attr: { GE: 12 } },
  'Klingenwand': { base: { PA: 9 }, sf: ['Defensiver Kampfstil', 'Kampfreflexe'] },
  'Klingensturm': { base: { AT: 9 }, sf: ['Ausfall', 'Kampfreflexe'] },
  'Defensiver Kampfstil': { attr: { GE: 12 }, sf: ['Meisterparade'] },
  'Astrale Meditation': { attr: { IN: 13 } },
  'Druidenrache': { attr: { MU: 15 } },
  'Karmalqueste': { talent: { 'Götter/Kulte': 7 } },
  'Kampf im Wasser': { attr: { IN: 15 }, sf: ['Aufmerksamkeit', 'Kampfreflexe'] },
  'Scharfschütze (Armbrust)': { talent: { Armbrust: 7 } },
  'Scharfschütze (Bogen)': { talent: { Bogen: 7 } },
  'Scharfschütze (Wurfmesser)': { talent: { Wurfmesser: 7 } },
  'Scharfschütze (Wurfspeere)': { talent: { Wurfspeere: 7 } },
  'Schnellladen (Armbrust)': { attr: { FF: 12, KK: 12 }, talent: { Armbrust: 7 } },
  'Schnellladen (Bogen)': { attr: { FF: 12, KK: 12 }, talent: { Bogen: 7 } },
}

const R = (x: number) => Math.round(x)

/** Missing prerequisites per SF, e.g. ["Klingentänzer braucht SF Kampfgespür, GE 15"]. */
export function checkSfPrerequisites(d: NscData): string[] {
  const a = d.attributes
  const complete = (['MU', 'KL', 'IN', 'CH', 'FF', 'GE', 'KO', 'KK'] as Attr[]).every((k) => a[k] !== undefined)
  const base = complete
    ? { AT: R((a.MU! + a.GE! + a.KK!) / 5), PA: R((a.IN! + a.GE! + a.KK!) / 5), INI: R((2 * a.MU! + a.IN! + a.GE!) / 5) }
    : null
  const sfs = new Set(d.sonderfertigkeiten.map((s) => normalizeName(s.name)))
  const has = (n: string) => sfs.has(normalizeName(n))
  const taw = (n: string) => d.talente.find((t) => normalizeName(t.name) === normalizeName(n))?.value ?? 0
  const out: string[] = []
  for (const sf of d.sonderfertigkeiten) {
    const rule = Object.entries(SF_RULES).find(([k]) => normalizeName(k) === normalizeName(sf.name))?.[1]
    if (!rule) continue
    const miss: string[] = []
    for (const [k, v] of Object.entries(rule.attr ?? {})) if (a[k as Attr] !== undefined && a[k as Attr]! < v!) miss.push(`${k} ${v}`)
    if (base) for (const [k, v] of Object.entries(rule.base ?? {})) if (base[k as 'AT'] < v!) miss.push(`${k}-Basis ${v}`)
    for (const r of rule.sf ?? []) if (!has(r)) miss.push(`SF ${r}`)
    if (rule.sfAny && !rule.sfAny.some(has)) miss.push(`SF ${rule.sfAny.join(' oder ')}`)
    for (const [t, v] of Object.entries(rule.talent ?? {})) if (taw(t) < v) miss.push(`TaW ${t} ${v}`)
    if (miss.length) out.push(`${sf.name} braucht ${miss.join(', ')}`)
  }
  return out
}

/** Base values by DSA 4.1 (human): what LeP/AuP/AsP would be without bought points. */
export function baseEnergies(d: NscData): { LeP?: number; AuP?: number; AsP?: number } {
  const a = d.attributes
  const out: { LeP?: number; AuP?: number; AsP?: number } = {}
  if (a.KO !== undefined && a.KK !== undefined) out.LeP = R((a.KO + a.KO + a.KK) / 2)
  if (a.MU !== undefined && a.KO !== undefined && a.GE !== undefined) out.AuP = R((a.MU + a.KO + a.GE) / 2)
  if (a.MU !== undefined && a.IN !== undefined && a.CH !== undefined) out.AsP = R((a.MU + a.IN + a.CH) / 2)
  return out
}
