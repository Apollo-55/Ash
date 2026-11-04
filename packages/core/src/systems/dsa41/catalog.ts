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
}

interface CatalogFile {
  version: string
  packs: { name: string; label: string }[]
  items: CatalogEntry[]
}

const catalog = catalogJson as unknown as CatalogFile

export const CATALOG_VERSION = catalog.version

/** Lower case, umlauts/accents folded, punctuation removed: "Waffenloser Kampfstil: Mercenario" ≈ "(Mercenario)". */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '')
}

/** Pack preference: base packs first, then Uthuria, then everything else. */
function packRank(pack: string): number {
  if (!/^(darkage|myranor|uthuria|eg_|vtuu_)/.test(pack)) return 0
  if (pack.startsWith('uthuria')) return 1
  return 2
}

const byKey = new Map<string, CatalogEntry[]>()
const bySid = new Map<string, CatalogEntry>()
for (const e of catalog.items) {
  const key = `${e.t}|${normalizeName(e.n)}`
  const list = byKey.get(key) ?? []
  list.push(e)
  byKey.set(key, list)
  if (e.s && (!bySid.has(e.s) || packRank(e.p) < packRank(bySid.get(e.s)!.p))) bySid.set(e.s, e)
}
for (const list of byKey.values()) list.sort((a, b) => packRank(a.p) - packRank(b.p))

/**
 * All entries with this name in one of the given item types (best pack first).
 * Without an exact hit a short form counts if it is the beginning of exactly one name
 * ("Gardianum" → "Gardianum Zauberschild").
 */
export function findAll(types: string[], name: string): CatalogEntry[] {
  const n = normalizeName(name)
  const exact = types.flatMap((t) => byKey.get(`${t}|${n}`) ?? [])
  if (exact.length || n.length < 4) return exact
  const words = name.trim().toLowerCase()
  const prefix = catalog.items.filter((e) => types.includes(e.t) && e.n.toLowerCase().startsWith(words + ' '))
  const names = new Set(prefix.map((e) => e.n))
  return names.size === 1 ? prefix.sort((a, b) => packRank(a.p) - packRank(b.p)) : []
}

export function find(types: string[], name: string): CatalogEntry | undefined {
  return findAll(types, name)[0]
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
