import * as dsa41 from '../../adapter/src/index.ts'
import { find, findWeapon, isLanguageAndScript, KIND_LABEL, normalizeName, searchNames, splitKind, suggest, type TalentKind } from '../../adapter/src/catalog.ts'
import { SF_RULES } from '../../adapter/src/rules.ts'
import { LIST_TYPES } from '../../adapter/src/schema.ts'

export const LEVELS = ['unerfahren', 'erfahren', 'kompetent', 'meisterlich', 'brillant'] as const
export type Level = (typeof LEVELS)[number]

const LEVEL_HINT: Record<Level, { taw: string; ap: string; litGrade: number; attrSum: string; buy: [number, number] }> = {
  unerfahren: { taw: 'Haupttalente 5–8, Nebentalente 2–5', ap: 'wenige SF (1–3)', litGrade: 1, attrSum: '92–98', buy: [0, 3] },
  erfahren: { taw: 'Haupttalente 9–12, Nebentalente 4–8', ap: 'einige SF (3–6)', litGrade: 2, attrSum: '98–104', buy: [2, 6] },
  kompetent: { taw: 'Haupttalente 12–15, Nebentalente 6–10', ap: 'mehrere SF (5–9)', litGrade: 3, attrSum: '102–108', buy: [4, 9] },
  meisterlich: { taw: 'Haupttalente 15–18, Nebentalente 8–12', ap: 'viele SF (8–14), auch Ketten', litGrade: 4, attrSum: '106–114', buy: [6, 12] },
  brillant: { taw: 'Haupttalente 18–22, Nebentalente 10–14', ap: 'sehr viele SF', litGrade: 5, attrSum: '112–120', buy: [8, 15] },
}

const ATTRS = ['MU', 'KL', 'IN', 'CH', 'FF', 'GE', 'KO', 'KK'] as const

// ---- JSON schemas for structured output --------------------------------------------------------

const named = { type: 'object', properties: { name: { type: 'string' }, wert: { type: ['integer', 'null'] } }, required: ['name', 'wert'] }

export function npcSchema() {
  return {
    type: 'object',
    properties: {
      name: { type: 'string' },
      rolle: { type: 'string' },
      eigenschaften: {
        type: 'object',
        properties: Object.fromEntries(ATTRS.map((a) => [a, { type: 'integer', minimum: 8, maximum: 21 }])),
        required: [...ATTRS],
      },
      LeP: { type: 'integer' },
      AuP: { type: 'integer' },
      AsP: { type: ['integer', 'null'] },
      KaP: { type: ['integer', 'null'] },
      waffen: { type: 'array', items: { type: 'string' }, maxItems: 4 },
      ruestung: { type: 'array', items: { type: 'string' }, maxItems: 2 },
      talente: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, wert: { type: 'integer', minimum: 0, maximum: 25 } }, required: ['name', 'wert'] } },
      zauber: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, wert: { type: 'integer', minimum: 0, maximum: 25 } }, required: ['name', 'wert'] } },
      liturgien: { type: 'array', items: { type: 'string' } },
      vorteile: { type: 'array', items: named },
      nachteile: { type: 'array', items: named },
      sonderfertigkeiten: { type: 'array', items: { type: 'string' } },
      notiz: { type: 'string' },
    },
    required: ['name', 'rolle', 'eigenschaften', 'LeP', 'AuP', 'AsP', 'KaP', 'waffen', 'ruestung', 'talente', 'zauber', 'liturgien', 'vorteile', 'nachteile', 'sonderfertigkeiten', 'notiz'],
  }
}

export interface NpcJson {
  name: string
  rolle: string
  eigenschaften: Record<(typeof ATTRS)[number], number>
  LeP: number
  AuP: number
  AsP: number | null
  KaP: number | null
  waffen: string[]
  ruestung: string[]
  talente: { name: string; wert: number }[]
  zauber: { name: string; wert: number }[]
  liturgien: string[]
  vorteile: { name: string; wert: number | null }[]
  nachteile: { name: string; wert: number | null }[]
  sonderfertigkeiten: string[]
  notiz: string
}

// ---- YAML block ----------------------------------------------------------------------------

export const q = (s: string) => (/[:,[\]{}#&*!|>'"%@`]|^\s|\s$|^(ja|nein|true|false|null|-?\d)/i.test(s) ? JSON.stringify(s) : s)
export const flowMap = (entries: [string, number | null][]) => `{ ${entries.map(([k, v]) => `${q(k)}: ${v ?? 'null'}`).join(', ')} }`
export const flowList = (items: string[]) => `[${items.map(q).join(', ')}]`

export function toBlock(n: NpcJson): string {
  const lines = [
    `name: ${q(n.name)}`,
    `rolle: ${q(n.rolle)}`,
    `eigenschaften: ${flowMap(ATTRS.map((a) => [a, n.eigenschaften[a]]))}`,
    `LeP: ${n.LeP}`,
    `AuP: ${n.AuP}`,
  ]
  if (n.AsP) lines.push(`AsP: ${n.AsP}`)
  if (n.KaP) lines.push(`KaP: ${n.KaP}`)
  if (n.waffen.length) lines.push(`waffen: ${flowList(n.waffen)}`)
  if (n.ruestung.length) lines.push(`rüstung: ${flowList(n.ruestung)}`)
  if (n.talente.length) lines.push(`talente: ${flowMap(n.talente.map((t) => [t.name, t.wert]))}`)
  if (n.zauber.length) lines.push(`zauber: ${flowMap(n.zauber.map((t) => [t.name, t.wert]))}`)
  if (n.liturgien.length) lines.push(`liturgien: ${flowList(n.liturgien)}`)
  const valued = (l: { name: string; wert: number | null }[]) => flowList(l.map((x) => (x.wert ? `${x.name} ${x.wert}` : x.name)))
  if (n.vorteile.length) lines.push(`vorteile: ${valued(n.vorteile)}`)
  if (n.nachteile.length) lines.push(`nachteile: ${valued(n.nachteile)}`)
  if (n.sonderfertigkeiten.length) lines.push(`sonderfertigkeiten: ${flowList(n.sonderfertigkeiten)}`)
  if (n.notiz.trim()) lines.push(`notiz: ${JSON.stringify(n.notiz.trim())}`)
  return lines.join('\n')
}

// ---- deterministic repairs -------------------------------------------------------------------

const R = (x: number) => Math.round(x)
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

export interface Repair {
  what: string
}

/** Replaces near-miss names by catalog names, fixes SF chains, keeps energies in a sane range. */
/** Catalog names that could be meant (for correction prompts): containing a word of the name, then similar ones. */
export function alternatives(types: string[], name: string): string[] {
  const words = name.split(/[\s()/,:-]+/).filter((w) => w.length >= 4)
  // word stems too: "Schmieden" → "schmied" finds "Grobschmied"
  const stems = words.map((w) => w.replace(/(ungen|ung|en|er|in|e|n|s)$/i, '')).filter((w) => w.length >= 4)
  const hits = [...new Set([...[...words, ...stems].flatMap((w) => searchNames(types, w, 4)), ...suggest(types, name, 3)])]
  return hits.slice(0, 5)
}

/**
 * Replaces near-miss names by catalog names, fixes SF chains, keeps energies in a sane range.
 * dropUnknown: names still unknown are removed (last round) instead of kept.
 */
export function repair(
  n: NpcJson,
  level: Level,
  consecrated: boolean,
  spellcaster: boolean,
  opts: { dropUnknown?: boolean } = {}
): { npc: NpcJson; repairs: string[]; unknown: string[]; hints: string[] } {
  const repairs: string[] = []
  const unknown: string[] = []
  const hints: string[] = []
  const fixName = (types: string[], name: string, label: string): string | null => {
    if (find(types, name)) return find(types, name)!.n
    const s = suggest(types, name, 2)
    if (s.length >= 1 && normalizeName(s[0]).slice(0, 5) === normalizeName(name).slice(0, 5)) {
      repairs.push(`${label} „${name}“ → „${s[0]}“`)
      return s[0]
    }
    if (opts.dropUnknown) {
      repairs.push(`${label} „${name}“ entfernt (kein DSA-4.1-Name)`)
      return null
    }
    unknown.push(`${label} „${name}“`)
    const alt = alternatives(types, name)
    hints.push(alt.length ? ` – meintest du: ${alt.join(', ')}? Sonst weglassen.` : ' – weglassen.')
    return name
  }
  // book notation → item names: "Sprachen Kennen [Garethi]" → Garethi, "Lesen/Schreiben [Garethi]" → Kusliker Zeichen,
  // "Lesen/Schreiben [Tulamidya]" → Tulamidya(Schrift)
  const SCRIPT_OF: Record<string, string> = { garethi: 'Kusliker Zeichen', bosparano: 'Kusliker Zeichen', 'muttersprache': 'Kusliker Zeichen' }
  n.talente = n.talente.map((t) => {
    const lang = /^Sprachen? Kennen\s*[[(](.+?)[\])]/i.exec(t.name)
    if (lang) return { ...t, name: `${lang[1].trim()}(Sprache)` }
    const script = /^Lesen\/Schreiben\s*[[(](.+?)[\])]/i.exec(t.name)
    if (script) return { ...t, name: `${SCRIPT_OF[script[1].trim().toLowerCase()] ?? script[1].trim()}(Schrift)` }
    return t
  })
  // advantages filed as disadvantages (and vice versa), e.g. Vorteil „Neugier“ → Nachteil
  const swap = (from: 'vorteile' | 'nachteile', to: 'vorteile' | 'nachteile', label: string) => {
    n[from] = n[from].filter((x) => {
      if (find(LIST_TYPES[from], x.name) || !find(LIST_TYPES[to], x.name)) return true
      n[to].push(x)
      repairs.push(`„${x.name}“ ist ein ${label}`)
      return false
    })
  }
  swap('vorteile', 'nachteile', 'Nachteil')
  swap('nachteile', 'vorteile', 'Vorteil')
  const listFix = <T extends { name: string }>(arr: T[], types: string[], label: string) =>
    arr.flatMap((x) => {
      const name = fixName(types, x.name, label)
      return name ? [{ ...x, name }] : []
    })
  const nameFix = (arr: string[], types: string[], label: string) => arr.flatMap((x) => fixName(types, x, label) ?? [])
  // talents: "(Sprache)"/"(Schrift)" only on names that are both; a second plain "Zhayad" is the script
  const kinds = new Set<string>()
  n.talente = n.talente.flatMap((t) => {
    const { base, kind } = splitKind(t.name)
    const types = kind ? [kind, kind === 'language' ? 'scripture' : 'language'] : LIST_TYPES.talente
    const name = fixName(types, base, 'Talent')
    if (!name) return []
    if (!isLanguageAndScript(name)) return [{ ...t, name }]
    const k: TalentKind = kind ?? (kinds.has(`${normalizeName(name)}|language`) ? 'scripture' : 'language')
    kinds.add(`${normalizeName(name)}|${k}`)
    return [{ ...t, name: `${name}(${KIND_LABEL[k]})` }]
  })
  n.zauber = listFix(n.zauber, LIST_TYPES.zauber, 'Zauber')
  n.vorteile = listFix(n.vorteile, LIST_TYPES.vorteile, 'Vorteil')
  n.nachteile = listFix(n.nachteile, LIST_TYPES.nachteile, 'Nachteil')
  n.liturgien = nameFix(n.liturgien, LIST_TYPES.liturgien, 'Liturgie')
  n.sonderfertigkeiten = nameFix(n.sonderfertigkeiten, LIST_TYPES.sonderfertigkeiten, 'SF')
  n.ruestung = nameFix(n.ruestung, ['armor'], 'Rüstung')
  n.waffen = n.waffen.flatMap((w) => {
    if (findWeapon(w)) return [findWeapon(w)!.n]
    // "Kurzschwert (Schmiedewerk) +2" → "Kurzschwert"
    const base = w.replace(/\s*\(.*?\)|\s*[+-]\d+$/g, '').trim()
    if (base !== w && findWeapon(base)) {
      repairs.push(`Waffe „${w}“ → „${findWeapon(base)!.n}“`)
      return [findWeapon(base)!.n]
    }
    const s = suggest(['meleeWeapon', 'rangedWeapon'], base, 1)
    if (s[0]) {
      repairs.push(`Waffe „${w}“ → „${s[0]}“`)
      return [s[0]]
    }
    if (opts.dropUnknown) {
      repairs.push(`Waffe „${w}“ entfernt (nicht im Arsenal)`)
      return []
    }
    unknown.push(`Waffe „${w}“`)
    hints.push(' – Waffe aus dem Arsenal wählen (z. B. Dolch, Säbel, Streitkolben, Kurzbogen).')
    return [w]
  })
  // dedupe
  const uniq = <T>(arr: T[], key: (x: T) => string) => arr.filter((x, i) => arr.findIndex((y) => key(y) === key(x)) === i)
  n.talente = uniq(n.talente, (t) => normalizeName(t.name))
  n.sonderfertigkeiten = uniq(n.sonderfertigkeiten, normalizeName)
  n.vorteile = uniq(n.vorteile, (x) => normalizeName(x.name))
  n.nachteile = uniq(n.nachteile, (x) => normalizeName(x.name))
  n.liturgien = uniq(n.liturgien, normalizeName)
  // small models give every advantage the same number ("Gebildet 12, Gut Aussehend 12, …") – that is no value
  for (const key of ['vorteile', 'nachteile'] as const) {
    const vals = n[key].map((x) => x.wert).filter((w) => w != null)
    if (vals.length >= 3 && vals.every((w) => w === vals[0])) {
      n[key] = n[key].map((x) => ({ ...x, wert: null }))
      repairs.push(`${key === 'vorteile' ? 'Vorteile' : 'Nachteile'}: gleicher Wert ${vals[0]} bei allen entfernt`)
    }
  }
  // NSCs rarely have more than a handful – keep the first ones the model named
  for (const [key, max, label] of [['vorteile', 6, 'Vorteile'], ['nachteile', 6, 'Nachteile']] as const) {
    if (n[key].length > max) {
      repairs.push(`${label} auf ${max} gekürzt (${n[key].slice(max).map((x) => x.name).join(', ')} entfernt)`)
      n[key] = n[key].slice(0, max)
    }
  }

  // every weapon's combat talent should be there (otherwise the weapon is "untrained")
  for (const w of n.waffen) {
    const hit = findWeapon(w)
    const talent = hit?.talent ? dsa41.findBySid(hit.talent) : undefined
    if (talent && !n.talente.some((t) => normalizeName(t.name) === normalizeName(talent.n))) {
      const main = Number(LEVEL_HINT[level].taw.match(/(\d+)–(\d+)/)?.[1] ?? 8)
      n.talente.push({ name: talent.n, wert: main })
      repairs.push(`Kampftalent „${talent.n}“ ${main} für „${w}“ ergänzt`)
    }
  }

  // SF chains: add missing SF prerequisites; drop SF whose attribute/talent requirements fail
  for (let round = 0; round < 5; round++) {
    const data = dsa41.parseNscBlock(toBlock(n)).data
    if (!data) break
    const missing = dsa41.checkSfPrerequisites(data)
    if (!missing.length) break
    for (const msg of missing) {
      const [sf, rest] = msg.split(' braucht ')
      const parts = rest.split(', ')
      const onlySf = parts.every((p) => p.startsWith('SF ') && !p.includes(' oder '))
      if (onlySf) {
        for (const p of parts) {
          const need = p.slice(3)
          if (!n.sonderfertigkeiten.some((s) => normalizeName(s) === normalizeName(need))) {
            n.sonderfertigkeiten.push(need)
            repairs.push(`SF „${need}“ ergänzt (Voraussetzung für ${sf})`)
          }
        }
      } else {
        n.sonderfertigkeiten = n.sonderfertigkeiten.filter((s) => normalizeName(s) !== normalizeName(sf))
        repairs.push(`SF „${sf}“ entfernt (${rest})`)
      }
    }
  }

  // energies: base by DSA 4.1 (human) + bought points within the level's range
  const a = n.eigenschaften
  const [lo, hi] = LEVEL_HINT[level].buy
  const lepBase = R((a.KO + a.KO + a.KK) / 2) + 10
  const aupBase = R((a.MU + a.KO + a.GE) / 2) + 10
  const fixEnergy = (key: 'LeP' | 'AuP', base: number) => {
    const v = clamp(n[key] || base + lo, base + lo, base + hi)
    if (v !== n[key]) repairs.push(`${key} ${n[key]} → ${v} (Basis ${base} + Zukauf ${lo}–${hi})`)
    n[key] = v
  }
  fixEnergy('LeP', lepBase)
  fixEnergy('AuP', aupBase)
  if (spellcaster) {
    const base = R((a.MU + a.IN + a.CH) / 2)
    const v = clamp(n.AsP ?? base + 10, base, base + 30)
    if (v !== n.AsP) repairs.push(`AsP ${n.AsP ?? '–'} → ${v}`)
    n.AsP = v
  } else if (n.AsP) {
    repairs.push(`AsP entfernt (kein Zauberkundiger)`)
    n.AsP = null
    n.zauber = []
  }
  if (consecrated) {
    const v = clamp(n.KaP ?? 18, 12, 40)
    if (v !== n.KaP) repairs.push(`KaP ${n.KaP ?? '–'} → ${v}`)
    n.KaP = v
  } else if (n.KaP || n.liturgien.length) {
    if (n.KaP || n.liturgien.length) repairs.push('KaP und Liturgien entfernt (nicht geweiht)')
    n.KaP = null
    n.liturgien = []
  }
  return { npc: n, repairs, unknown, hints }
}

// ---- pipeline -------------------------------------------------------------------------------

export interface GenerateInput {
  description: string
  level?: Level
  /** profession the model should orient itself on (free text) */
  profession?: string
  name?: string
  /** person (talents, energies by formula) or creature (fixed bestiary values); undefined = model decides */
  art?: 'person' | 'kreatur'
}

export interface GenerateResult {
  block: string
  profession: { name: string; buch: string; seite: number }
  level: Level
  god: string | null
  repairs: string[]
  issues: string[]
  rounds: number
  seconds: number
}

/**
 * Repairs a generated NPC and lists what is still wrong. needsFix = problems only the LLM can solve
 * (unknown names, values too low for the level, missing liturgies/SF, block errors).
 */
export function review(
  npc: NpcJson,
  o: { level: Level; consecrated: boolean; spellcaster: boolean; god: string | null; dropUnknown?: boolean }
): { npc: NpcJson; repairs: string[]; issues: string[]; needsFix: boolean } {
  const hint = LEVEL_HINT[o.level]
  const r = repair(npc, o.level, o.consecrated, o.spellcaster, { dropUnknown: o.dropUnknown })
  const fixed = r.npc
  const parsed = dsa41.parseNscBlock(toBlock(fixed))
  const issues = [
    ...parsed.issues.filter((i) => i.level !== 'info' && !/steht in keinem dsa-41-Kompendium/.test(i.message)).map((i) => i.message),
    ...r.unknown.map((u, i) => `${u} gibt es in DSA 4.1 nicht${r.hints[i] ?? ''}`),
  ]
  const minMain = Number(hint.taw.match(/(\d+)–/)?.[1] ?? 0)
  const top = [...fixed.talente].sort((a, b) => b.wert - a.wert).slice(0, 3)
  if (top.length && top.reduce((sum, t) => sum + t.wert, 0) / top.length < minMain) {
    issues.push(`Talentwerte zu niedrig für „${o.level}“: die wichtigsten Talente (${top.map((t) => `${t.name} ${t.wert}`).join(', ')}) sollten bei ${hint.taw.split(',')[0].replace('Haupttalente ', '')} liegen – die Paketzahlen sind nur Startboni`)
  }
  if (o.consecrated && !fixed.liturgien.length) issues.push(`Geweihte brauchen Liturgien: 4–12 aus der Liste des ${o.god ?? 'Gottes'} wählen`)
  const sfRange = /(\d+)–(\d+)/.exec(hint.ap)
  if (sfRange && fixed.sonderfertigkeiten.length < Number(sfRange[1])) {
    issues.push(
      `Zu wenige Sonderfertigkeiten für „${o.level}“ (${fixed.sonderfertigkeiten.length}, erwartet ${sfRange[0]}): ergänze passende aus Paket und Beschreibung – ` +
        'Kampf-SF (z. B. Finte, Wuchtschlag, Ausweichen I, Kampfreflexe, Rüstungsgewöhnung I), Geländekunde, Kulturkunde, Ortskenntnis usw.; Voraussetzungen beachten'
    )
  }
  const needsFix = r.unknown.length > 0 || issues.some((i) => /zu niedrig|brauchen Liturgien|Zu wenige Sonderfertigkeiten/.test(i)) || parsed.issues.some((i) => i.level === 'error')
  return { npc: fixed, repairs: r.repairs, issues, needsFix }
}

export { LEVEL_HINT }
