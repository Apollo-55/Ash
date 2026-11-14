import { parseDocument } from 'yaml'
import type { BlockIssue, ParsedBlock } from '../../../../packages/core/src/systems/adapter.ts'
import { find, findWeapon, isLanguageAndScript, KIND_LABEL, normalizeName, splitKind, suggest, type TalentKind } from './catalog.ts'
import { checkSfPrerequisites } from './rules.ts'

export const ATTRIBUTES = ['MU', 'KL', 'IN', 'CH', 'FF', 'GE', 'KO', 'KK'] as const
export type Attr = (typeof ATTRIBUTES)[number]

export interface NscWeapon {
  name: string
  talent?: string
  AT?: number
  PA?: number
  FK?: number
  TP?: string // dice as written ("1W6+3")
  DK?: string
  INI?: number
  WM?: [number, number]
  KK?: [number, number]
  BF?: number  // Bruchfaktor (melee weapons)
  RW?: [[number,number],[number,number],[number,number],[number,number],[number,number]]
}


enum shieldType {shield,parrying}

export interface NscShield {
  name: string
  type?: shieldType
  INI?: number
  WM?: [number, number]
  BF?: number
}


export const ARMOR_ZONES = ['head', 'chest', 'back', 'torso', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'] as const
export type ArmorZone = (typeof ARMOR_ZONES)[number]
/** weights of dsa-41's zoned total: sum(zone × weight) / zoned-armor-factor (default 20 = sum of weights) */
export const ZONE_WEIGHT: Record<ArmorZone, number> = { head: 2, chest: 4, back: 4, torso: 4, leftArm: 1, rightArm: 1, leftLeg: 2, rightLeg: 2 }
export const ZONE_LABEL: Record<ArmorZone, string> = {
  head: 'Kopf', chest: 'Brust', back: 'Rücken', torso: 'Bauch', leftArm: 'LA', rightArm: 'RA', leftLeg: 'LB', rightLeg: 'RB',
}

export interface NscArmor {
  name: string
  /** overrides the compendium value; with zones: the rounded zoned total */
  RS?: number
  /** RS per zone (zones not given are 0) */
  zones?: Record<ArmorZone, number>
  BE?: number
}

/** Gesamt-RS of zones as dsa-41 computes it with the default factor (exact, may be fractional). */
export const zonedTotal = (z: Record<ArmorZone, number>) => ARMOR_ZONES.reduce((s, k) => s + z[k] * ZONE_WEIGHT[k], 0) / 20

export interface NamedEntry {
  name: string
  value: number | null
  /** own definition (probe, beschreibung …) when the entry is not taken from a compendium */
  custom?: Record<string, unknown>
  /** talente: "Zhayad(Schrift)" → name Zhayad, kind scripture (catalog lookup only in that type) */
  kind?: TalentKind
}

/** Name as written in the block: the suffix only where the name is both language and script. */
export function entryLabel(e: NamedEntry): string {
  return e.kind && isLanguageAndScript(e.name) ? `${e.name} (${KIND_LABEL[e.kind]})` : e.name
}

/** Catalog types to look an entry up in. */
export function entryTypes(key: ListKey, e: NamedEntry): string[] {
  return e.kind ? [e.kind] : LIST_TYPES[key]
}

export type ListKey = 'talente' | 'zauber' | 'liturgien' | 'vorteile' | 'nachteile' | 'sonderfertigkeiten'

export interface NscData {
  name: string
  rolle?: string
  /** species as written in the block (item from the species compendia, text field on the sheet) */
  rasse?: string
  /** culture as written in the block (item from the culture compendia, text field on the sheet) */
  kultur?: string
  bild?: string
  token?: string
  verknuepft?: boolean
  attributes: Partial<Record<Attr, number>>
  SO?: number
  LeP?: number
  AuP?: number
  AsP?: number
  KaP?: number
  MR?: number
  /** manual MR modifier (Zusatz-MR of the sheet); the system adds it only while MR is calculated */
  mrMod?: number
  RS?: number
  WS?: number
  GS?: number
  INI?: number
  ausweichen?: number
  ruestung: NscArmor[]
  waffen: NscWeapon[]
  schilde: NscShield[]
  talente: NamedEntry[]
  zauber: NamedEntry[]
  liturgien: NamedEntry[]
  vorteile: NamedEntry[]
  nachteile: NamedEntry[]
  sonderfertigkeiten: NamedEntry[]
  notiz?: string
}

/** Foundry item types a list maps to (catalog lookup). */
export const LIST_TYPES: Record<ListKey, string[]> = {
  talente: ['talent', 'combatTalent', 'language', 'scripture'],
  zauber: ['spell'],
  liturgien: ['liturgy'],
  vorteile: ['advantage'],
  nachteile: ['disadvantage'],
  sonderfertigkeiten: ['specialAbility'],
}

const LIST_LABEL: Record<ListKey, string> = {
  talente: 'Talent', zauber: 'Zauber', liturgien: 'Liturgie', vorteile: 'Vorteil', nachteile: 'Nachteil', sonderfertigkeiten: 'Sonderfertigkeit',
}

/** Allowed sub keys of own definitions per list ("Sternkunde: { TaW: 8, probe: KL/KL/IN }"). */
const CUSTOM_KEYS: Record<ListKey, Record<string, string>> = {
  talente: { taw: 'value', wert: 'value', probe: 'probe', kategorie: 'kategorie', beschreibung: 'beschreibung' },
  zauber: { zfw: 'value', wert: 'value', probe: 'probe', kosten: 'kosten', reichweite: 'reichweite', zauberdauer: 'zauberdauer', wirkungsdauer: 'wirkungsdauer', wirkung: 'wirkung', beschreibung: 'beschreibung' },
  liturgien: { grad: 'grad', wirkung: 'wirkung', beschreibung: 'beschreibung' },
  vorteile: { wert: 'value', beschreibung: 'beschreibung' },
  nachteile: { wert: 'value', beschreibung: 'beschreibung' },
  sonderfertigkeiten: { typ: 'typ', beschreibung: 'beschreibung' },
}

/** Top-level keys (lower-cased) → canonical. */
const KEYS: Record<string, string> = {
  name: 'name', rolle: 'rolle', rasse: 'rasse', spezies: 'rasse', kultur: 'kultur', bild: 'bild', token: 'token',
  'verknüpft': 'verknuepft', verknuepft: 'verknuepft',
  eigenschaften: 'eigenschaften', so: 'SO',
  lep: 'LeP', le: 'LeP', aup: 'AuP', au: 'AuP', asp: 'AsP', ae: 'AsP', kap: 'KaP', ke: 'KaP',
  mr: 'MR', rs: 'RS', ws: 'WS', gs: 'GS', ini: 'INI', ausweichen: 'ausweichen', aw: 'ausweichen',
  'mr-mod': 'mrMod', mrmod: 'mrMod', mr_mod: 'mrMod', 'mr mod': 'mrMod', 'mr-modifikator': 'mrMod', mrmodifikator: 'mrMod',
  'rüstung': 'ruestung', ruestung: 'ruestung', 'rüstungen': 'ruestung',
  waffen: 'waffen', talente: 'talente', zauber: 'zauber', liturgien: 'liturgien', vorteile: 'vorteile', nachteile: 'nachteile',
  sonderfertigkeiten: 'sonderfertigkeiten', sf: 'sonderfertigkeiten', notiz: 'notiz', notizen: 'notiz',
  ...Object.fromEntries(ATTRIBUTES.map((a) => [a.toLowerCase(), a])),
}

const WEAPON_KEYS: Record<string, string> = {
  name: 'name', talent: 'talent', at: 'AT', pa: 'PA', fk: 'FK', tp: 'TP', dk: 'DK', ini: 'INI', wm: 'WM', kk: 'KK', bf: 'BF', rw: 'RW'
}

const SHIELD_KEYS: Record<string, string> = {
  name: 'name', type: 'typ', pa: 'PA', ini: 'INI', wm: 'WM', bf: 'BF'
}

const ARMOR_KEYS: Record<string, 'name' | 'RS' | 'BE'> = { name: 'name', rs: 'RS', be: 'BE' }

/** zone names in the block (lower-cased, without spaces/dots/hyphens) → zones */
const ZONE_KEYS: Record<string, ArmorZone[]> = {
  kopf: ['head'], brust: ['chest'], 'rücken': ['back'], ruecken: ['back'], bauch: ['torso'],
  la: ['leftArm'], linkerarm: ['leftArm'], armlinks: ['leftArm'],
  ra: ['rightArm'], rechterarm: ['rightArm'], armrechts: ['rightArm'],
  lb: ['leftLeg'], linkesbein: ['leftLeg'], beinlinks: ['leftLeg'],
  rb: ['rightLeg'], rechtesbein: ['rightLeg'], beinrechts: ['rightLeg'],
  arme: ['leftArm', 'rightArm'], beine: ['leftLeg', 'rightLeg'],
}
const ZONE_NAMES = 'Kopf, Brust, Rücken, Bauch, LA/linker Arm, RA/rechter Arm, LB/linkes Bein, RB/rechtes Bein, Arme, Beine'

function parseZones(v: Record<string, unknown>, name: string, error: (m: string) => void): Record<ArmorZone, number> | undefined {
  const zones = Object.fromEntries(ARMOR_ZONES.map((z) => [z, 0])) as Record<ArmorZone, number>
  const seen = new Set<ArmorZone>()
  let ok = true
  for (const [k, raw] of Object.entries(v)) {
    const targets = ZONE_KEYS[k.toLowerCase().replace(/[\s.\-_]/g, '')]
    if (!targets) {
      error(`Rüstung „${name}“: unbekannte Zone „${k}“ (erlaubt: ${ZONE_NAMES}).`)
      ok = false
      continue
    }
    const n = toInt(raw)
    if (n === undefined || n < 0) {
      error(`Rüstung „${name}“: RS ${k} ${show(raw)} ist keine ganze Zahl ≥ 0.`)
      ok = false
      continue
    }
    for (const z of targets) {
      if (seen.has(z)) {
        error(`Rüstung „${name}“: Zone ${ZONE_LABEL[z]} ist doppelt angegeben („${k}“).`)
        ok = false
      }
      seen.add(z)
      zones[z] = n
    }
  }
  return ok ? zones : undefined
}

const NUMERIC_TOP = ['SO', 'LeP', 'AuP', 'AsP', 'KaP', 'MR', 'mrMod', 'RS', 'WS', 'GS', 'ausweichen'] as const

/** rasse/kultur → catalog item type and label */
const IDENTITY: Record<'rasse' | 'kultur', { type: 'species' | 'culture'; label: string }> = {
  rasse: { type: 'species', label: 'Rasse' },
  kultur: { type: 'culture', label: 'Kultur' },
}

function toInt(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isInteger(v)) return v
  if (typeof v === 'string' && /^\s*[+-]?\d+\s*$/.test(v)) return parseInt(v, 10)
  return undefined
}

const show = (v: unknown) => (typeof v === 'string' ? `„${v}“` : JSON.stringify(v))

export const DICE_RE = /^\s*(\d*)\s*[Ww](\d*)\s*([+-]\s*\d+)?\s*$/

/** "1W6+3" → "1d6+3", "1W+4" → "1d6+4", "2W6" → "2d6". Returns null if not a dice expression. */
export function diceToFoundry(tp: string): string | null {
  const m = DICE_RE.exec(tp)
  if (!m) return null
  return `${m[1] || '1'}d${m[2] || '6'}${m[3] ? m[3].replace(/\s+/g, '') : ''}`
}

export function parseNscBlock(source: string): ParsedBlock<NscData> {
  const issues: BlockIssue[] = []
  const error = (message: string) => issues.push({ level: 'error', message })
  const warn = (message: string) => issues.push({ level: 'warning', message })
  const info = (message: string) => issues.push({ level: 'info', message })

  const doc = parseDocument(source, { uniqueKeys: true, prettyErrors: true })
  if (doc.errors.length) {
    for (const e of doc.errors) {
      const line = e.linePos?.[0]?.line
      error(`YAML-Fehler${line ? ` in Zeile ${line}` : ''}: ${e.message.split('\n')[0].replace(/ at line \d+, column \d+:?$/, '')}`)
    }
    return { name: null, data: null, issues }
  }
  const raw = doc.toJS() as unknown
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    error('Der Block muss aus „Schlüssel: Wert“-Zeilen bestehen.')
    return { name: null, data: null, issues }
  }

  const data: NscData = {
    name: '', attributes: {}, ruestung: [], waffen: [], schilde: [],
    talente: [], zauber: [], liturgien: [], vorteile: [], nachteile: [], sonderfertigkeiten: [],
  }
  const seen = new Set<string>()

  for (const [rawKey, value] of Object.entries(raw as Record<string, unknown>)) {
    const key = KEYS[rawKey.trim().toLowerCase()]
    if (!key) {
      const hint = Object.keys(KEYS).find((k) => k.startsWith(rawKey.trim().toLowerCase().slice(0, 3)))
      error(`Unbekannter Schlüssel „${rawKey}“${hint ? ` – meintest du „${hint}“?` : ''}`)
      continue
    }
    if (seen.has(key)) {
      error(`„${rawKey}“ kommt doppelt vor (auch als Abkürzung).`)
      continue
    }
    seen.add(key)

    switch (key) {
      case 'name':
      case 'rolle':
      case 'bild':
      case 'token':
      case 'notiz':
        if (value === null || value === undefined || value === '') break
        if (typeof value === 'object') error(`„${rawKey}“ muss Text sein.`)
        else (data as unknown as Record<string, unknown>)[key] = String(value)
        break
      case 'rasse':
      case 'kultur': {
        if (value === null || value === undefined || value === '') break
        if (typeof value === 'object') {
          error(`„${rawKey}“ muss Text sein.`)
          break
        }
        const name = String(value).trim()
        if (!name) break
        data[key] = name
        const { type, label } = IDENTITY[key]
        const known = find([type], name)
        if (known && normalizeName(known.n) !== normalizeName(name)) info(`${label} „${name}“ als „${known.n}“ erkannt.`)
        if (!known) warn(`${label} „${name}“ steht in keinem dsa-41-Kompendium${didYouMean([type], name)}. Wird in Foundry in den Welt-Gegenständen gesucht, sonst ohne MR-Modifikator angelegt.`)
        break
      }
      case 'verknuepft':
        if (typeof value === 'boolean') data.verknuepft = value
        else if (['ja', 'nein'].includes(String(value).toLowerCase())) data.verknuepft = String(value).toLowerCase() === 'ja'
        else error(`„${rawKey}“ muss ja/nein (true/false) sein, nicht ${show(value)}.`)
        break
      case 'eigenschaften':
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          error('„eigenschaften“ muss eine Liste wie { MU: 13, KL: 10, … } sein.')
          break
        }
        for (const [a, v] of Object.entries(value as Record<string, unknown>)) {
          const attr = ATTRIBUTES.find((x) => x === a.toUpperCase())
          if (!attr) {
            error(`Unbekannte Eigenschaft „${a}“ (erlaubt: ${ATTRIBUTES.join(', ')}).`)
            continue
          }
          const n = toInt(v)
          if (n === undefined) error(`${attr}: ${show(v)} ist keine ganze Zahl.`)
          else data.attributes[attr] = n
        }
        break
      case 'INI': {
        const n = toInt(value)
        if (n !== undefined) data.INI = n
        else if (typeof value === 'string' && /^\s*\d+\s*\+\s*\d*W\d*\s*$/i.test(value)) {
          data.INI = parseInt(value, 10)
          info(`INI: Nur der Basiswert ${data.INI} wird gespeichert, die Würfel kommen aus den Regeln des Systems.`)
        } else error(`INI: ${show(value)} ist keine Zahl (erlaubt: 12 oder 12+1W6).`)
        break
      }
      case 'ruestung':
        parseArmor(value, data, error, warn)
        break
      case 'waffen':
        parseWeapons(value, data, error, warn)
        break
      case 'shilde':
        parseShields(value, data, error, warn)
        break
      case 'talente':
      case 'zauber':
      case 'liturgien':
      case 'vorteile':
      case 'nachteile':
      case 'sonderfertigkeiten':
        parseList(key, value, data, error, warn, info)
        break
      default: {
        // single attributes at top level and numeric values
        const n = toInt(value)
        if (n === undefined) {
          error(`${rawKey}: ${show(value)} ist keine ganze Zahl.`)
          break
        }
        if ((ATTRIBUTES as readonly string[]).includes(key)) data.attributes[key as Attr] = n
        else if ((NUMERIC_TOP as readonly string[]).includes(key)) (data as unknown as Record<string, number>)[key] = n
      }
    }
  }

  if (!data.name) {
    error('„name“ fehlt – ohne Namen kann kein Charakter angelegt werden.')
    return { name: null, data: null, issues }
  }
  const missing = ATTRIBUTES.filter((a) => data.attributes[a] === undefined)
  if (missing.length && missing.length < ATTRIBUTES.length) {
    info(`Eigenschaften ohne Wert (bleiben auf 0): ${missing.join(', ')}.`)
  }
  for (const [a, v] of Object.entries(data.attributes)) {
    if (v < 0 || v > 30) warn(`${a} ${v} ist ungewöhnlich (Tippfehler?).`)
  }
  if (data.MR !== undefined && data.mrMod !== undefined) {
    warn('MR ist fest angegeben – das System verrechnet MR-Mod (wie die Modifikatoren von Rasse und Kultur) nur, wenn es die MR selbst berechnet.')
  }
  for (const m of checkSfPrerequisites(data)) warn(`Voraussetzung fehlt: ${m}.`)
  return { name: data.name, data, issues }
}

function didYouMean(types: string[], name: string): string {
  const s = suggest(types, name)
  return s.length ? ` (meintest du ${s.map((x) => `„${x}“`).join(', ')}?)` : ''
}

function parseWeapons(value: unknown, data: NscData, error: (m: string) => void, warn: (m: string) => void) {
  const list = Array.isArray(value) ? value : value && typeof value === 'object' ? Object.entries(value).map(([name, v]) => ({ name, ...(v as object) })) : null
  if (!list) {
    error('„waffen“ muss eine Liste sein, z. B. - { name: Säbel, AT: 13, PA: 11, TP: 1W6+3 }')
    return
  }
  for (const entry of list) {
    if (typeof entry === 'string') {
      data.waffen.push({ name: entry })
      if (!findWeapon(entry)) warn(`Waffe „${entry}“ unbekannt – gib „talent:“ an.`)
      continue
    }
    if (!entry || typeof entry !== 'object') {
      error(`Waffe ${show(entry)} ist kein Eintrag.`)
      continue
    }
    const w: Partial<NscWeapon> = {}
    for (const [k, v] of Object.entries(entry as Record<string, unknown>)) {
      const key = WEAPON_KEYS[k.toLowerCase()]
      if (!key) {
        error(`Waffe: unbekannter Schlüssel „${k}“ (erlaubt: name, talent, AT, PA, FK, TP, DK, INI, WM, KK, BF, RW).`)
        continue
      }
      if (key === 'name' || key === 'talent') {
        if (v !== null && v !== undefined) (w as Record<string, unknown>)[key] = String(v).trim()
      } else if (key === 'TP') {
        const tp = String(v ?? '').trim()
        if (!diceToFoundry(tp)) warn(`Waffe: TP ${show(v)} sieht nicht wie „1W6+3“ aus – wird so übernommen.`)
        w.TP = tp
      } else if (key === 'DK') {
        const dk = String(v ?? '').toUpperCase().replace(/[^A-Z]/g, '')
        if (!/^[HNSP]+$/.test(dk)) error(`Waffe: DK ${show(v)} ungültig (H, N, S, P).`)
        else w.DK = dk
      } else if (key === 'WM') {
        const wm = parseWM(v)
        if (!wm) error(`Waffe: WM ${show(v)} ungültig (z. B. 0/-1).`)
        else w.WM = wm
      } else if (key === 'KK') {
        const kk = parseTPKK(v)
        if (!kk) error(`Waffe: KK ${show(v)} ungültig (z. B. 10/2).`)
        else w.KK = kk
      } else if (key === 'RW') {
        const rw = parseRanges(v)
        if (!rw) error(`Waffe: RW ${show(v)} ungültig (z. B. (0/5/10/15/20) --> (1/0/0/0/-1)).`)
        else w.RW = rw
      }
      else {
        const n = toInt(v)
        if (n === undefined) error(`Waffe: ${key} ${show(v)} ist keine ganze Zahl.`)
        else (w as Record<string, unknown>)[key] = n
      }
    }
    if (!w.name) {
      error('Waffe ohne „name“.')
      continue
    }
    const known = findWeapon(w.name, w.talent)
    if (w.talent && !find(['combatTalent'], w.talent)) error(`Waffe „${w.name}“: Kampftalent „${w.talent}“ gibt es nicht${didYouMean(['combatTalent'], w.talent)}.`)
    if (!known && !w.talent) warn(`Waffe „${w.name}“ steht in keinem Kompendium – gib „talent:“ an (z. B. talent: Dolche), sonst wird Raufen verwendet.`)
    if (known && w.FK !== undefined && known.t === 'meleeWeapon') warn(`Waffe „${w.name}“ ist eine Nahkampfwaffe, FK wird ignoriert.`)
    if (known && w.RW && known.t === 'meleeWeapon') warn(`Waffe „${w.name}“ ist eine Nahkampfwaffe, RW wird ignoriert.`)
    if (known && w.BF !== undefined && known.t === 'rangedWeapon') warn(`Waffe „${w.name}“ ist eine Fernkampfwaffe, BF wird ignoriert.`)
    data.waffen.push(w as NscWeapon)
  }
}

function parseArmor(value: unknown, data: NscData, error: (m: string) => void, warn: (m: string) => void) {
  // "rüstung: X", "[X, { name: Y, BE: 2 }]", "{ name: Y, BE: 2 }" or "{ Y: { BE: 2 } }"
  const isEntry = (v: unknown) => !!v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).some((k) => k.trim().toLowerCase() === 'name')
  const list = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && !isEntry(value)
      ? Object.entries(value).map(([name, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? { name, ...v } : v === null ? name : { name, _bad: v }))
      : [value]
  const unknown = (name: string) =>
    warn(`Rüstung „${name}“ steht in keinem dsa-41-Kompendium${didYouMean(['armor'], name)}. Wird in Foundry in den Welt-Gegenständen gesucht, sonst ohne Werte angelegt – gib RS und BE an, z. B. { name: ${name}, RS: 2, BE: 1 }.`)
  for (const entry of list) {
    if (typeof entry === 'string') {
      if (!entry.trim()) {
        error(`Rüstung: ${show(entry)} ist kein Name.`)
        continue
      }
      const name = entry.trim()
      data.ruestung.push({ name })
      if (!find(['armor'], name)) unknown(name)
      continue
    }
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      error(`Rüstung: ${show(entry)} ist kein Eintrag (z. B. Lederharnisch oder { name: Lastgeschirr, RS: 0, BE: 2 }).`)
      continue
    }
    const a: Partial<NscArmor> = {}
    for (const [k, v] of Object.entries(entry as Record<string, unknown>)) {
      if (k === '_bad') {
        error(`Rüstung „${(entry as { name: string }).name}“: ${show(v)} ist kein Eintrag (z. B. { RS: 0, BE: 2 }).`)
        continue
      }
      const key = ARMOR_KEYS[k.trim().toLowerCase()]
      if (!key) {
        error(`Rüstung: unbekannter Schlüssel „${k}“ (erlaubt: name, RS, BE).`)
        continue
      }
      if (key === 'name') {
        if (typeof v === 'string' && v.trim()) a.name = v.trim()
        continue
      }
      if (key === 'RS' && v && typeof v === 'object' && !Array.isArray(v)) {
        const zones = parseZones(v as Record<string, unknown>, String((entry as Record<string, unknown>).name ?? '?'), error)
        if (zones) Object.assign(a, { zones, RS: Math.round(zonedTotal(zones)) })
        continue
      }
      const n = toInt(v)
      if (n === undefined || n < 0) error(`Rüstung: ${key} ${show(v)} ist keine ganze Zahl ≥ 0${key === 'RS' ? ' (oder Zonen wie { Kopf: 3, Brust: 4 })' : ''}.`)
      else a[key] = n
    }
    if (!a.name) {
      error('Rüstung ohne „name“.')
      continue
    }
    data.ruestung.push(a as NscArmor)
    if (!find(['armor'], a.name) && a.RS === undefined && a.BE === undefined) {
      unknown(a.name)
    }
  }
}

function parseWM(v: unknown): [number, number] | null {
  if (Array.isArray(v) && v.length === 2) {
    const a = toInt(v[0]), b = toInt(v[1])

    return (a !== undefined && b !== undefined)? [a, b] : null
  }
  if (typeof v === 'number') return [v, v]
  if (typeof v === 'string') {
    const m = /^\s*([+-]?\d+)\s*\/\s*([+-]?\d+)\s*$/.exec(v)
    if (m) return [parseInt(m[1], 10), parseInt(m[2], 10)]
  }
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    const a = toInt(o.AT ?? o.at), b = toInt(o.PA ?? o.pa)
    if (a !== undefined && b !== undefined) return [a, b]
  }
  return null
}

function parseTPKK(v: unknown): [number, number] | null{
    if (Array.isArray(v) && v.length === 2) {
      const a = toInt(v[0]), b = toInt(v[1])
      return (a !== undefined && b !== undefined) && (a >= 0 && b >= 0)? [a, b] : null
    }
    if (typeof v === 'string') {
      const m = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(v)
      if (m) return [parseInt(m[1], 10), parseInt(m[2], 10)]
    }
    return null
  }

type Range = [number, number]
type Ranges = [Range, Range, Range, Range, Range]

const RANGES_RE = /^\(\s*(\d+)\s*\/\s*(\d+)\s*\/\s*(\d+)\s*\/\s*(\d+)\s*\/\s*(\d+)\s*\)\s*-->\s*\(\s*([+-]?\d+)\s*\/\s*([+-]?\d+)\s*\/\s*([+-]?\d+)\s*\/\s*([+-]?\d+)\s*\/\s*([+-]?\d+)\s*\)$/

function parseRanges(v: unknown): Ranges | null {
  if (Array.isArray(v) && v.length === 5) {
    const result: Range[] = []
    for (const x of v) {
      if (!(Array.isArray(x) && x.length === 2)) return null

      const a = toInt(x[0]), b = toInt(x[1])

      if (a === undefined || b === undefined) return null
      if (a < 0) return null

      result.push([a, b])
    }
    return result as Ranges
  }

  if (typeof v === 'string') {
    const m = RANGES_RE.exec(v)
    if (!m) return null

    const result: Range[] = []
    for (let i = 0; i < 5; i++) {
      result.push([parseInt(m[1 + i], 10), parseInt(m[6 + i], 10)])
    }
    return result as Ranges
  }

  return null
}


function parseList(key: ListKey, value: unknown, data: NscData, error: (m: string) => void, warn: (m: string) => void, info: (m: string) => void) {
  const label = LIST_LABEL[key]
  const out = data[key]
  const add = (name: string, v: unknown) => {
    name = name.trim()
    if (!name) return
    const entry: NamedEntry = { name, value: null }
    if (key === 'talente') {
      const { base, kind } = splitKind(name)
      const other: TalentKind = kind === 'language' ? 'scripture' : 'language'
      if (kind && !find([kind], base) && find([other], base)) {
        warn(`Talent „${name}“: ${find([other], base)!.n} ist eine ${KIND_LABEL[other]}, keine ${KIND_LABEL[kind]}. Wird als ${KIND_LABEL[other]} übernommen.`)
        entry.kind = other
      } else if (kind) entry.kind = kind
      else if (isLanguageAndScript(base)) {
        warn(`Talent „${base}“ gibt es als Sprache und als Schrift – bitte „${base}(Sprache)“ oder „${base}(Schrift)“ angeben. Wird als Sprache übernommen.`)
        entry.kind = 'language'
      }
      entry.name = name = base
    }
    if (v === null || v === undefined || v === '') {
      // name only
    } else if (typeof v === 'object' && !Array.isArray(v)) {
      const custom: Record<string, unknown> = {}
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        const ck = CUSTOM_KEYS[key][k.toLowerCase()]
        if (!ck) {
          error(`${label} „${name}“: unbekannter Schlüssel „${k}“ (erlaubt: ${[...new Set(Object.keys(CUSTOM_KEYS[key]))].join(', ')}).`)
          continue
        }
        if (ck === 'value' || ck === 'grad') {
          const n = toInt(x)
          if (n === undefined) error(`${label} „${name}“: ${k} ${show(x)} ist keine ganze Zahl.`)
          else if (ck === 'value') entry.value = n
          else custom.grad = n
        } else if (ck === 'probe') {
          const p = parseProbe(x)
          if (!p) error(`${label} „${name}“: Probe ${show(x)} ungültig (z. B. MU/IN/CH).`)
          else custom.probe = p
        } else custom[ck] = String(x)
      }
      entry.custom = custom
    } else {
      const n = toInt(v)
      if (n === undefined) {
        error(`${label} „${name}“: ${show(v)} ist keine ganze Zahl.`)
        return
      }
      entry.value = n
    }
    const known = find(entryTypes(key, entry), name)
    if (known && normalizeName(known.n) !== normalizeName(name)) info(`${label} „${name}“ als „${known.n}“ erkannt.`)
    if (!known && !entry.custom) {
      warn(`${label} „${name}“ steht in keinem dsa-41-Kompendium${didYouMean(entryTypes(key, entry), name)}. Wird in Foundry in den Welt-Gegenständen gesucht, sonst neu angelegt.`)
    }
    if (key === 'zauber' && entry.value === null && !entry.custom) warn(`Zauber „${name}“ ohne ZfW.`)
    out.push(entry)
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === 'string') {
        // "Neid 8" → Neid, 8 (only for lists with values)
        const m = key !== 'sonderfertigkeiten' && key !== 'liturgien' ? /^(.*?)\s+([+-]?\d+)$/.exec(item.trim()) : null
        if (m) add(m[1], parseInt(m[2], 10))
        else add(item, null)
      } else if (item && typeof item === 'object' && !Array.isArray(item) && Object.keys(item).length === 1) {
        const [[name, v]] = Object.entries(item as Record<string, unknown>)
        add(name, v)
      } else error(`${label}: ${show(item)} ist kein gültiger Eintrag.`)
    }
  } else if (value && typeof value === 'object') {
    for (const [name, v] of Object.entries(value as Record<string, unknown>)) add(name, v)
  } else if (typeof value === 'string') {
    for (const part of value.split(',')) {
      const m = /^(.*?)\s+([+-]?\d+)$/.exec(part.trim())
      if (m && key !== 'sonderfertigkeiten' && key !== 'liturgien') add(m[1], parseInt(m[2], 10))
      else add(part, null)
    }
  } else if (value !== null && value !== undefined) {
    error(`„${key}“ muss eine Liste oder { Name: Wert } sein.`)
  }
}

function parseProbe(v: unknown): [Attr, Attr, Attr] | null {
  const parts = (Array.isArray(v) ? v.map(String) : String(v).split(/[/,\s]+/)).map((s) => s.trim().toUpperCase()).filter(Boolean)
  if (parts.length !== 3 || !parts.every((p) => (ATTRIBUTES as readonly string[]).includes(p))) return null
  return parts as [Attr, Attr, Attr]
}
