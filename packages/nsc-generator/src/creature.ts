// Creatures and simple opponents with fixed values (bestiary style: LeP, RS, MR, GS, INI, attacks with
// AT/PA/TP, special abilities) – the dsa-nsc block already supports this (see the Riff-Hydra), the
// human formulas (energies from attributes, talents per level) do not apply.
import { dsa41 } from '../../core/src/index.ts'
import { find, findWeapon, suggest } from '../../core/src/systems/dsa41/catalog.ts'
import { DICE_RE, LIST_TYPES } from '../../core/src/systems/dsa41/schema.ts'
import { alternatives, flowMap, q } from './generate.ts'

const ATTRS = ['MU', 'KL', 'IN', 'CH', 'FF', 'GE', 'KO', 'KK'] as const
const int = { type: 'integer' }
const intOrNull = { type: ['integer', 'null'] }
const strOrNull = { type: ['string', 'null'] }

export interface CreatureAttack {
  name: string
  /** combat talent for natural attacks (Raufen, Ringen) or weapons; null for pure creature attacks */
  talent: string | null
  AT: number | null
  PA: number | null
  FK: number | null
  TP: string
  DK: string | null
}

export interface CreatureJson {
  name: string
  rolle: string
  eigenschaften: Record<(typeof ATTRS)[number], number | null>
  LeP: number
  AuP: number | null
  AsP: number | null
  MR: number
  RS: number
  GS: number
  INI: number
  ausweichen: number | null
  angriffe: CreatureAttack[]
  talente: { name: string; wert: number }[]
  sonderfertigkeiten: string[]
  besonderheiten: { name: string; beschreibung: string }[]
  notiz: string
}

export function creatureSchema() {
  return {
    type: 'object',
    properties: {
      name: { type: 'string' },
      rolle: { type: 'string', description: 'Art oder Rolle, z. B. „Höhlenspinne“, „Räuber (Schläger)“' },
      eigenschaften: { type: 'object', properties: Object.fromEntries(ATTRS.map((a) => [a, intOrNull])), required: [...ATTRS], description: 'nur angeben, was bekannt oder nötig ist, sonst null' },
      LeP: int,
      AuP: intOrNull,
      AsP: intOrNull,
      MR: int,
      RS: int,
      GS: int,
      INI: { ...int, description: 'INI-Basis bzw. fester INI-Wert' },
      ausweichen: intOrNull,
      angriffe: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'z. B. „Biss“, „Klauen“, „Säbel“' },
            talent: { ...strOrNull, description: 'Kampftalent (Raufen, Ringen, Säbel …) oder null bei reinen Kreaturangriffen' },
            AT: intOrNull,
            PA: intOrNull,
            FK: intOrNull,
            TP: { type: 'string', description: 'Würfelausdruck wie „1W6+3“ oder „2W6+4“' },
            DK: { ...strOrNull, description: 'Distanzklasse H/N/S/P oder null' },
          },
          required: ['name', 'talent', 'AT', 'PA', 'FK', 'TP', 'DK'],
        },
      },
      talente: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, wert: int }, required: ['name', 'wert'] } },
      sonderfertigkeiten: { type: 'array', items: { type: 'string' }, description: 'offizielle SF wie Gezielter Stich, Niederwerfen' },
      besonderheiten: {
        type: 'array',
        items: { type: 'object', properties: { name: { type: 'string' }, beschreibung: { type: 'string' } }, required: ['name', 'beschreibung'] },
        description: 'Kreaturfähigkeiten mit Regeltext: Gift, Fliegen, Schwarm, Furcht, Regeneration …',
      },
      notiz: { type: 'string' },
    },
    required: ['name', 'rolle', 'eigenschaften', 'LeP', 'AuP', 'AsP', 'MR', 'RS', 'GS', 'INI', 'ausweichen', 'angriffe', 'talente', 'sonderfertigkeiten', 'besonderheiten', 'notiz'],
  }
}

/** dsa-nsc block with fixed values; not linked to an actor (several tokens of the same creature) */
export function creatureToBlock(c: CreatureJson): string {
  const lines = [`name: ${q(c.name)}`, `rolle: ${q(c.rolle)}`]
  const attrs = ATTRS.filter((a) => c.eigenschaften[a] != null)
  if (attrs.length) lines.push(`eigenschaften: ${flowMap(attrs.map((a) => [a, c.eigenschaften[a]]))}`)
  lines.push(`LeP: ${c.LeP}`)
  if (c.AuP != null) lines.push(`AuP: ${c.AuP}`)
  if (c.AsP != null) lines.push(`AsP: ${c.AsP}`)
  lines.push(`MR: ${c.MR}`, `RS: ${c.RS}`, `GS: ${c.GS}`, `INI: ${c.INI}`)
  if (c.ausweichen != null) lines.push(`ausweichen: ${c.ausweichen}`)
  if (c.angriffe.length) {
    lines.push('waffen:')
    for (const a of c.angriffe) {
      const parts = [`name: ${q(a.name)}`]
      if (a.talent) parts.push(`talent: ${q(a.talent)}`)
      for (const k of ['AT', 'PA', 'FK'] as const) if (a[k] != null) parts.push(`${k}: ${a[k]}`)
      parts.push(`TP: ${a.TP}`)
      if (a.DK) parts.push(`DK: ${a.DK}`)
      lines.push(`  - { ${parts.join(', ')} }`)
    }
  }
  if (c.talente.length) lines.push(`talente: ${flowMap(c.talente.map((t) => [t.name, t.wert]))}`)
  if (c.sonderfertigkeiten.length || c.besonderheiten.length) {
    lines.push('sonderfertigkeiten:')
    for (const s of c.sonderfertigkeiten) lines.push(`  ${q(s)}:`)
    for (const b of c.besonderheiten) lines.push(`  ${q(b.name)}: { typ: Kreatur, beschreibung: ${JSON.stringify(b.beschreibung)} }`)
  }
  lines.push('verknüpft: nein')
  if (c.notiz.trim()) lines.push(`notiz: ${JSON.stringify(c.notiz.trim())}`)
  return lines.join('\n')
}

/**
 * Checks and repairs a creature. needsFix = problems only the model can solve (unknown names, invalid
 * damage dice, impossible values). dropUnknown (last round): unknown talents removed, unknown SF kept
 * as creature abilities, invalid attack talents cleared.
 */
export function reviewCreature(c: CreatureJson, o: { dropUnknown?: boolean } = {}): { creature: CreatureJson; repairs: string[]; issues: string[]; needsFix: boolean } {
  const repairs: string[] = []
  const issues: string[] = []
  let fix = false
  const ask = (msg: string) => {
    issues.push(msg)
    fix = true
  }
  c.LeP = Math.max(1, c.LeP)
  for (const k of ['MR', 'RS', 'GS', 'INI'] as const) if (c[k] < 0) c[k] = 0

  c.angriffe = c.angriffe.map((a) => {
    const tp = String(a.TP ?? '').replace(/\s+/g, '').replace(/d/gi, 'W')
    if (!DICE_RE.test(tp)) ask(`Angriff „${a.name}“: TP „${a.TP}“ ist kein Würfelausdruck (z. B. 1W6+3)`)
    let talent = a.talent
    if (talent && !find(['combatTalent'], talent)) {
      const s = suggest(['combatTalent'], talent, 1)
      if (s[0]) {
        repairs.push(`Kampftalent „${talent}“ → „${s[0]}“`)
        talent = s[0]
      } else if (o.dropUnknown) {
        repairs.push(`Kampftalent „${talent}“ entfernt (kein Kampftalent)`)
        talent = null
      } else ask(`Kampftalent „${talent}“ gibt es nicht – Raufen, Ringen, ein Waffentalent oder null`)
    }
    // a weapon from the arsenal without own TP is fine; creature attacks need AT
    if (a.AT == null && a.FK == null && !findWeapon(a.name)) ask(`Angriff „${a.name}“ braucht AT oder FK`)
    for (const k of ['AT', 'PA', 'FK'] as const) if (a[k] != null && (a[k]! < 0 || a[k]! > 30)) ask(`Angriff „${a.name}“: ${k} ${a[k]} ist unplausibel`)
    // natural attacks (Biss, Klauen …) fight with Raufen in Foundry – say so instead of leaving it to a warning
    if (!talent && !findWeapon(a.name)) talent = 'Raufen'
    return { ...a, TP: tp, talent }
  })
  if (!c.angriffe.length) ask('Mindestens ein Angriff (z. B. Biss, Klauen, Waffe) fehlt')

  c.talente = c.talente.flatMap((t) => {
    const hit = find(LIST_TYPES.talente, t.name)
    if (hit) return [{ ...t, name: hit.n }]
    const s = suggest(LIST_TYPES.talente, t.name, 1)
    if (s[0]) {
      repairs.push(`Talent „${t.name}“ → „${s[0]}“`)
      return [{ ...t, name: s[0] }]
    }
    if (o.dropUnknown) {
      repairs.push(`Talent „${t.name}“ entfernt (kein DSA-4.1-Name)`)
      return []
    }
    const alt = alternatives(LIST_TYPES.talente, t.name)
    ask(`Talent „${t.name}“ gibt es in DSA 4.1 nicht${alt.length ? ` – meintest du: ${alt.join(', ')}?` : ''} Sonst weglassen oder als Besonderheit beschreiben.`)
    return [t]
  })

  // unknown SF are usually creature abilities → keep them as such (with the rule text the model gave nowhere: ask once)
  c.sonderfertigkeiten = c.sonderfertigkeiten.flatMap((s) => {
    const hit = find(LIST_TYPES.sonderfertigkeiten, s)
    if (hit) return [hit.n]
    if (o.dropUnknown) {
      repairs.push(`„${s}“ als Kreatur-Besonderheit übernommen`)
      c.besonderheiten.push({ name: s, beschreibung: '' })
      return []
    }
    ask(`SF „${s}“ gibt es nicht – als Besonderheit mit Regeltext angeben`)
    return [s]
  })

  const parsed = dsa41.parseNscBlock(creatureToBlock(c))
  for (const i of parsed.issues) {
    if (i.level === 'info' || /Voraussetzung fehlt|steht in keinem dsa-41-Kompendium/.test(i.message)) continue
    issues.push(i.message)
    if (i.level === 'error') fix = true
  }
  return { creature: c, repairs, issues, needsFix: fix }
}
