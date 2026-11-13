import { makeId } from '../../../../packages/core/src/ids.ts'
import type { BundleItem } from '../../../../packages/core/src/types.ts'
import type { ActorContext, SystemAdapter } from '../../../../packages/core/src/systems/adapter.ts'
import type { Dsa41Combat } from './combat.ts'
import { find, findBySid, findWeapon, normalizeName } from './catalog.ts'
import { diceToFoundry, entryLabel, entryTypes, LIST_TYPES, type Attr, type ListKey, type NamedEntry, type NscArmor, type NscData } from './schema.ts'

export const ATTR_KEYS: Record<Attr, string> = {
  MU: 'courage', KL: 'cleverness', IN: 'intuition', CH: 'charisma', FF: 'dexterity', GE: 'agility', KO: 'constitution', KK: 'strength',
}

const TALENT_CATEGORY: Record<string, string> = {
  koerper: 'physical', 'körper': 'physical', 'körperlich': 'physical', physisch: 'physical',
  gesellschaft: 'social', gesellschaftlich: 'social', sozial: 'social',
  natur: 'nature', wissen: 'knowledge', handwerk: 'crafting', gabe: 'gift', gaben: 'gift',
}

const SF_TYPE: Record<string, string> = {
  allgemein: 'general', kampf: 'combat', waffenlos: 'unarmed-combat', nahkampf: 'melee-combat', fernkampf: 'ranged-combat',
  magisch: 'magical', magie: 'magical', ritual: 'ritual', karmal: 'karma', klerikal: 'karma', karma: 'karma',
}

const ARMOR_ZONES = ['head', 'chest', 'back', 'torso', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'] as const

/**
 * RS/BE from the block for both armor systems of dsa-41 (world setting "armor-system"):
 * basic reads armorClass/encumbrance, zoned reads zonedArmorClass/zonedEncumbrance.
 * The same RS on every zone gives a zoned total of RS (zone weights add up to the default factor 20).
 */
function armorValues(r: NscArmor): Record<string, unknown> {
  const system: Record<string, unknown> = {}
  if (r.RS !== undefined) {
    system.armorClass = r.RS
    for (const z of ARMOR_ZONES) system[`zonedArmorClass.${z}`] = r.RS
    system['zonedArmorClass.total'] = r.RS
  }
  if (r.BE !== undefined) {
    system.encumbrance = r.BE
    system.zonedEncumbrance = r.BE
  }
  return system
}

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function customDescription(c: Record<string, unknown> | undefined): string {
  if (!c) return ''
  const labels: Record<string, string> = {
    kosten: 'Kosten', reichweite: 'Reichweite', zauberdauer: 'Zauberdauer', wirkungsdauer: 'Wirkungsdauer', wirkung: 'Wirkung', grad: 'Grad',
  }
  const parts = Object.entries(labels)
    .filter(([k]) => c[k] !== undefined)
    .map(([k, l]) => `<p><b>${l}:</b> ${esc(c[k])}</p>`)
  if (c.beschreibung) parts.push(`<p>${esc(c.beschreibung)}</p>`)
  return parts.join('')
}

function testFields(c: Record<string, unknown> | undefined): Record<string, unknown> {
  const probe = c?.probe as Attr[] | undefined
  if (!probe) return {}
  return {
    'test.firstAttribute': ATTR_KEYS[probe[0]],
    'test.secondAttribute': ATTR_KEYS[probe[1]],
    'test.thirdAttribute': ATTR_KEYS[probe[2]],
  }
}

/** Distribution of a combat talent value without weapon values: attack gets the larger half. */
function splitTaW(value: number, category: string | undefined): Record<string, unknown> {
  if (category === 'ranged') return { value, 'combat.rangedAttack': value }
  return { value, 'combat.attack': Math.ceil(value / 2), 'combat.parry': Math.floor(value / 2) }
}

export function nscToActor(d: NscData, ctx: ActorContext): ReturnType<SystemAdapter<NscData>['toActor']> {
  const data: Record<string, unknown> = {}
  const dataOnCreate: Record<string, unknown> = {}

  for (const [attr, key] of Object.entries(ATTR_KEYS) as [Attr, string][]) {
    if (d.attributes[attr] !== undefined) data[`base.basicAttributes.${key}.value`] = d.attributes[attr]
  }
  const resources: [keyof NscData, string][] = [['LeP', 'vitality'], ['AuP', 'endurance'], ['AsP', 'astralEnergy'], ['KaP', 'karmicEnergy']]
  for (const [k, res] of resources) {
    const v = d[k] as number | undefined
    if (v === undefined) continue
    data[`base.resources.${res}.max`] = v
    dataOnCreate[`base.resources.${res}.value`] = v
  }
  if (d.AsP !== undefined) Object.assign(data, { 'settings.hasAstralEnergy': true, 'settings.showAstralTab': true })
  if (d.KaP !== undefined) Object.assign(data, { 'settings.hasKarmicEnergy': true, 'settings.showKarmicTab': true })

  // values the system calculates: a given value switches the calculation off
  data['settings.autoCalcMagicResistance'] = d.MR === undefined
  if (d.MR !== undefined) data['base.combatAttributes.passive.magicResistance.value'] = d.MR
  data['settings.autoCalcInitiative'] = d.INI === undefined
  if (d.INI !== undefined) data['base.combatAttributes.active.baseInitiative.value'] = d.INI
  data['settings.autoCalcSpeed'] = d.GS === undefined
  if (d.GS !== undefined) data['base.movement.speed.value'] = d.GS
  data['settings.autoCalcDodge'] = d.ausweichen === undefined
  if (d.ausweichen !== undefined) data['base.combatAttributes.active.dodge.value'] = d.ausweichen
  data['settings.autoCalcWoundThresholds'] = d.WS === undefined
  if (d.WS !== undefined) {
    data['base.combatAttributes.passive.woundThresholds.first'] = d.WS
    data['base.combatAttributes.passive.woundThresholds.second'] = d.WS * 2
    data['base.combatAttributes.passive.woundThresholds.third'] = d.WS * 3
  }
  // RS: total from the block minus what listed armor already gives
  const armorRS = d.ruestung.reduce((s, r) => s + (r.RS ?? find(['armor'], r.name)?.rs ?? 0), 0)
  data['modifiers.additionalRS'] = d.RS !== undefined ? Math.max(0, d.RS - armorRS) : 0
  if (d.SO !== undefined) data['background.social.socialStatus.value'] = d.SO
  data['background.profession'] = d.rolle ?? ''
  data['background.description'] =
    `<p><b>Quelle:</b> ${ctx.journalId ? `@UUID[JournalEntry.${ctx.journalId}]{${esc(ctx.journalName).replace(/[{}]/g, '')}}` : esc(ctx.journalName)}</p>` +
    (d.notiz ? `<p>${esc(d.notiz)}</p>` : '')

  // ---- items ----------------------------------------------------------------------------------
  const items: BundleItem[] = []
  const used = new Map<string, number>()
  const itemId = (group: string, name: string) => {
    const key = `${group}|${normalizeName(name)}`
    const n = used.get(key) ?? 0
    used.set(key, n + 1)
    return makeId(ctx.actorId, 'item', key, String(n))
  }

  const listItem = (key: ListKey, e: NamedEntry): BundleItem => {
    const types = entryTypes(key, e)
    const hit = find(types, e.name)
    const type = hit?.t ?? types[0]
    const system: Record<string, unknown> = {}
    const fallbackSystem: Record<string, unknown> = { description: customDescription(e.custom) }
    switch (key) {
      case 'talente': {
        if (type === 'combatTalent') Object.assign(system, splitTaW(e.value ?? 0, hit?.cat))
        else if (e.value !== null) system.value = e.value
        Object.assign(fallbackSystem, testFields(e.custom), {
          value: e.value ?? 0,
          category: TALENT_CATEGORY[String(e.custom?.kategorie ?? '').toLowerCase()] ?? 'knowledge',
          type: 'special',
        })
        break
      }
      case 'zauber':
        if (e.value !== null) system.value = e.value
        Object.assign(fallbackSystem, testFields(e.custom), { value: e.value ?? 0, effect: String(e.custom?.wirkung ?? '') })
        break
      case 'vorteile':
      case 'nachteile':
        if (e.value !== null) system.value = e.value
        fallbackSystem.value = e.value
        break
      case 'sonderfertigkeiten':
        fallbackSystem.type = SF_TYPE[String(e.custom?.typ ?? '').toLowerCase()] ?? 'general'
        break
      case 'liturgien':
        break
    }
    return {
      // language keeps the plain id (blocks written before the suffix existed), the script gets its own
      id: itemId(key, e.kind === 'scripture' ? entryLabel(e) : e.name),
      name: hit?.n ?? e.name,
      types: hit ? [hit.t] : types,
      source: hit && !e.custom ? { pack: hit.p, sid: hit.s, type: hit.t } : undefined,
      system,
      fallback: { type, system: fallbackSystem },
    }
  }

  for (const key of Object.keys(LIST_TYPES) as ListKey[]) for (const e of d[key]) items.push(listItem(key, e))

  for (const r of d.ruestung) {
    const hit = find(['armor'], r.name)
    items.push({
      id: itemId('armor', r.name),
      name: hit?.n ?? r.name,
      types: ['armor'],
      source: hit ? { pack: hit.p, sid: hit.s, type: 'armor' } : undefined,
      system: { equipped: true, ...armorValues(r) },
      fallback: { type: 'armor', system: { equipped: true, armorClass: 0, encumbrance: 0 } },
    })
  }

  // weapons + the combat talents they need
  const talentSids = new Set(items.filter((i) => i.types.includes('combatTalent')).map((i) => i.source?.sid).filter(Boolean))
  for (const w of d.waffen) {
    const explicitTalent = w.talent ? find(['combatTalent'], w.talent) : undefined
    const hit = findWeapon(w.name, w.talent)
    const talentSid = explicitTalent?.s ?? hit?.talent ?? 'talent-raufen'
    const type = hit?.t ?? (w.FK !== undefined || w.RW ? 'rangedWeapon' : 'meleeWeapon')
    const system: Record<string, unknown> = {}
    if (w.TP) system.damage = diceToFoundry(w.TP) ?? w.TP
    if (w.DK && type === 'meleeWeapon') system.distanceClass = w.DK
    if (explicitTalent) system.talent = talentSid
    if (w.WM && type === 'meleeWeapon') Object.assign(system, { 'weaponMod.attack': w.WM[0], 'weaponMod.parry': w.WM[1] })
    if (w.KK && type === 'meleeWeapon') Object.assign(system, { 'strengthMod.threshold': w.KK[0], 'strengthMod.hitPointStep': w.KK[1] })
    if (w.BF !== undefined && type === 'meleeWeapon') system.breakingFactor = w.BF
    if (w.RW && type === 'rangedWeapon') {
      Object.assign(system, { 'ranges.veryClose': w.RW[0][0], 'ranges.close': w.RW[1][0], 'ranges.medium': w.RW[2][0], 'ranges.far': w.RW[3][0], 'ranges.veryFar': w.RW[4][0]})
      Object.assign(system, { 'bonusDamages.veryClose': w.RW[0][1], 'bonusDamages.close': w.RW[1][1], 'bonusDamages.medium': w.RW[2][1], 'bonusDamages.far': w.RW[3][1], 'bonusDamages.veryFar': w.RW[4][1]})
    }
    items.push({
      id: itemId('weapon', w.name),
      name: hit?.n ?? w.name,
      types: [type],
      source: hit ? { pack: hit.p, sid: hit.s, type } : undefined,
      system,
      fallback: { type, system: { talent: talentSid, damage: diceToFoundry(w.TP ?? '') ?? w.TP ?? '1d6', distanceClass: w.DK ?? 'N' } },
      extra: { combat: { talentSid, AT: w.AT, PA: w.PA, FK: w.FK, INI: w.INI } satisfies Dsa41Combat },
    })
    if (!talentSids.has(talentSid)) {
      talentSids.add(talentSid)
      const t = findBySid(talentSid)
      items.push({
        id: itemId('talente', t?.n ?? talentSid),
        name: t?.n ?? talentSid,
        types: ['combatTalent'],
        source: t ? { pack: t.p, sid: t.s, type: 'combatTalent' } : undefined,
        // not listed under talente: untrained (compendium entries carry -1 placeholders)
        system: splitTaW(0, t?.cat),
        fallback: { type: 'combatTalent', system: { sid: talentSid, ...splitTaW(0, t?.cat) } },
      })
    }
  }

  const img = (d.bild && ctx.resolveImage(d.bild)) || (ctx.nearbyImages.portrait && ctx.resolveImage(ctx.nearbyImages.portrait)) || undefined
  const tokenImg = (d.token && ctx.resolveImage(d.token)) || (ctx.nearbyImages.token && ctx.resolveImage(ctx.nearbyImages.token)) || img

  return {
    name: d.name,
    system: 'dsa-41',
    img,
    tokenImg,
    linked: d.verknuepft ?? ctx.linkedDefault,
    journal: ctx.journalId,
    data,
    dataOnCreate,
    items,
  }
}
