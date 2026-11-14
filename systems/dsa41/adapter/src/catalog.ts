import { normalizeName } from '../../../../packages/core/src/text.ts'
import catalogJson from './catalog.json' with { type: 'json' }

export interface CatalogEntry {
  n: string
  t: string
  s: string
  p: string
  talent?: string
  tp?: string
  dk?: string
  ini?: number
  wm?: [number, number]
  cat?: string
  rs?: number
  /** species/culture: MR modifier (mrmod) – species also use ini for the INI modifier (inimod) */
  mr?: number
}

interface CatalogFile {
  version: string
  packs: { name: string; label: string }[]
  items: CatalogEntry[]
}

const catalog = catalogJson as unknown as CatalogFile

export const CATALOG_VERSION = catalog.version

export { normalizeName }

/** Pack preference: base packs first, then Uthuria, then everything else. */
function packRank(pack: string): number {
  if (!/^(darkage|myranor|uthuria|eg_|vtuu_)/.test(pack)) return 0
  if (pack.startsWith('uthuria')) return 1
  return 2
}

/** Item types whose names carry gender forms and variants ("Mittelländer*in", "Nivese/Nivesin", "Zwerg*in - Ambosszwerge"). */
const IDENTITY_TYPES = new Set(['species', 'culture'])

/**
 * Other spellings a block may use for a species or culture name: each gender form
 * ("Mittelländer*in" → Mittelländer, Mittelländerin; "Nivese/Nivesin" → Nivese, Nivesin; "Auelf*e" → Auelf, Auelfe)
 * and, for "Volk - Variante", the variant alone ("Zwerg*in - Ambosszwerge" → Ambosszwerge). The name itself is not included.
 */
export function identityVariants(name: string): string[] {
  const parts = name.split(/\s+-\s+/)
  const genders = (s: string): string[] => {
    const star = /^(.*?)\*(\w+)$/.exec(s)
    if (star) return [star[1], star[1] + star[2]]
    const slash = /^(\S+)\/(\S+)$/.exec(s)
    if (slash) return [slash[1], slash[2]]
    return [s]
  }
  const out = new Set<string>()
  for (const g of genders(parts[0])) out.add([g, ...parts.slice(1)].join(' - '))
  if (parts.length > 1) out.add(parts.slice(1).join(' - '))
  out.delete(name)
  return [...out]
}

const byKey = new Map<string, CatalogEntry[]>()
const byAlias = new Map<string, CatalogEntry[]>()
const bySid = new Map<string, CatalogEntry>()
for (const e of catalog.items) {
  const key = `${e.t}|${normalizeName(e.n)}`
  const list = byKey.get(key) ?? []
  list.push(e)
  byKey.set(key, list)
  if (e.s && (!bySid.has(e.s) || packRank(e.p) < packRank(bySid.get(e.s)!.p))) bySid.set(e.s, e)
  if (IDENTITY_TYPES.has(e.t)) {
    for (const v of identityVariants(e.n)) {
      const k = `${e.t}|${normalizeName(v)}`
      byAlias.set(k, [...(byAlias.get(k) ?? []), e])
    }
  }
}
for (const list of byKey.values()) list.sort((a, b) => packRank(a.p) - packRank(b.p))
for (const list of byAlias.values()) list.sort((a, b) => packRank(a.p) - packRank(b.p))

/**
 * All entries with this name in one of the given item types (best pack first).
 * Species and cultures also match by gender form or variant ("Mittelländer" → "Mittelländer*in", see identityVariants)
 * when that spelling names exactly one entry. Without an exact hit a short form counts if it is the beginning of
 * exactly one name ("Gardianum" → "Gardianum Zauberschild").
 */
export function findAll(types: string[], name: string): CatalogEntry[] {
  const n = normalizeName(name)
  const exact = types.flatMap((t) => byKey.get(`${t}|${n}`) ?? [])
  if (exact.length) return exact
  const alias = types.flatMap((t) => byAlias.get(`${t}|${n}`) ?? [])
  if (alias.length) return new Set(alias.map((e) => e.n)).size === 1 ? alias : []
  if (n.length < 4) return exact
  const words = name.trim().toLowerCase()
  const prefix = catalog.items.filter((e) => types.includes(e.t) && e.n.toLowerCase().startsWith(words + ' '))
  const names = new Set(prefix.map((e) => e.n))
  return names.size === 1 ? prefix.sort((a, b) => packRank(a.p) - packRank(b.p)) : []
}

export function find(types: string[], name: string): CatalogEntry | undefined {
  return findAll(types, name)[0]
}

export type TalentKind = 'language' | 'scripture'
export const KIND_LABEL: Record<TalentKind, string> = { language: 'Sprache', scripture: 'Schrift' }

/** "Zhayad(Schrift)" / "Zhayad (Schrift)" → { base: 'Zhayad', kind: 'scripture' }; without suffix only base. */
export function splitKind(name: string): { base: string; kind?: TalentKind } {
  const m = /^(.*?)\s*\(\s*(sprache|schrift)\s*\)\s*$/i.exec(name)
  if (!m) return { base: name.trim() }
  return { base: m[1].trim(), kind: m[2].toLowerCase() === 'sprache' ? 'language' : 'scripture' }
}

/** Names that exist as language and as script (Tulamidya, Zhayad …) – these need "(Sprache)"/"(Schrift)". */
export function isLanguageAndScript(name: string): boolean {
  const n = normalizeName(name)
  return byKey.has(`language|${n}`) && byKey.has(`scripture|${n}`)
}

export function findBySid(sid: string): CatalogEntry | undefined {
  return bySid.get(sid)
}

/**
 * Weapons can exist several times with different combat talents (Säbel → Säbel or Schwerter).
 * Preference: explicit talent > talent named like the weapon > base pack order.
 */
export function findWeapon(name: string, talentName?: string): CatalogEntry | undefined {
  const all = findAll(['meleeWeapon', 'rangedWeapon'], name)
  if (!all.length) return undefined
  if (talentName) {
    const talent = find(['combatTalent'], talentName)
    const hit = all.find((w) => w.talent === talent?.s)
    if (hit) return hit
  }
  const sameName = all.find((w) => findBySid(w.talent ?? '')?.n && normalizeName(findBySid(w.talent!)!.n) === normalizeName(name))
  return sameName ?? all[0]
}

/** All distinct names of the given types; baseOnly drops Myranor/Dark-Age/extra packs (Uthuria stays). */
export function namesOf(types: string[], baseOnly = true): string[] {
  const out = new Set<string>()
  for (const e of catalog.items) if (types.includes(e.t) && (!baseOnly || packRank(e.p) < 2)) out.add(e.n)
  return [...out].sort((a, b) => a.localeCompare(b, 'de'))
}

/**
 * Names of the given types that contain every word of the query (normalized), best first:
 * whole-name match, then names starting with the query, then shorter names. For lookups by an LLM.
 */
export function searchNames(types: string[], query: string, max = 25): string[] {
  const words = query.split(/\s+/).map(normalizeName).filter(Boolean)
  const q = normalizeName(query)
  if (!words.length) return []
  const hits = new Map<string, number>()
  for (const e of catalog.items) {
    if (!types.includes(e.t) || hits.has(e.n)) continue
    const m = normalizeName(e.n)
    if (!words.every((w) => m.includes(w))) continue
    hits.set(e.n, (m === q ? 0 : m.startsWith(q) ? 1 : 2) * 1000 + m.length + packRank(e.p) * 100)
  }
  const found = [...hits].sort((a, b) => a[1] - b[1]).map(([n]) => n)
  return found.length ? found.slice(0, max) : suggest(types, query, Math.min(max, 5))
}

/** Closest catalog names (for "did you mean …") – cheap edit distance on normalized names. */
export function suggest(types: string[], name: string, max = 3): string[] {
  const n = normalizeName(name)
  if (n.length < 3) return []
  const scored: [number, string][] = []
  for (const e of catalog.items) {
    if (!types.includes(e.t)) continue
    const m = normalizeName(e.n)
    if (Math.abs(m.length - n.length) > 3 && !m.includes(n) && !n.includes(m)) continue
    const d = m.includes(n) || n.includes(m) ? 1 : distance(n, m)
    if (d <= Math.max(2, Math.floor(n.length / 4))) scored.push([d, e.n])
  }
  return [...new Set(scored.sort((a, b) => a[0] - b[0]).map((s) => s[1]))].slice(0, max)
}

function distance(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]
    dp[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j]
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = tmp
    }
  }
  return dp[b.length]
}
