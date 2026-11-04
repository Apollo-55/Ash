// dsa-41 specifics of the Foundry actor import (see packages/foundry-module/src/system-hooks.ts).
import type { BundleActor, BundleWarning } from '../../../../packages/core/src/types.ts'
import type { FoundrySystemHooks } from '../../../../packages/foundry-module/src/system-hooks.ts'

/** first melee weapon of the block – the actor holds it */
const firstWeapon = (a: BundleActor) => a.items.find((i) => i.combat && i.types[0] === 'meleeWeapon')

/**
 * Makes the sheet show the AT/PA/FK/INI values written in the block:
 * the first weapon of a combat talent sets the talent's AT/PA share (talent value = AT share + PA share),
 * further weapons with the same talent get the remaining difference as weapon modifier.
 */
async function adjustCombat(actor: any, a: BundleActor, report: { warnings: BundleWarning[] }) {
  const base = actor.system?.base?.combatAttributes?.active ?? {}
  const baseAT = base.baseAttack?.value ?? 0
  const basePA = base.baseParry?.value ?? 0
  const baseFK = base.baseRangedAttack?.value ?? 0
  const baseINI = base.baseInitiative?.value ?? 0
  const updates = new Map<string, Record<string, unknown>>()
  const upd = (id: string, data: Record<string, unknown>) => updates.set(id, { ...(updates.get(id) ?? { _id: id }), ...data })
  const talentShares = new Map<string, { at?: number; pa?: number; fk?: number }>()

  for (const bi of a.items) {
    const c = bi.combat
    if (!c) continue
    const weapon = actor.items.get(bi.id)
    const talent = actor.items.find((i: any) => i.type === 'combatTalent' && i.system?.sid === c.talentSid)
    if (!weapon) continue
    if (c.INI !== undefined && weapon.type === 'meleeWeapon') upd(weapon.id, { 'system.initiativeMod': c.INI - baseINI })
    if (!talent) {
      if (c.AT !== undefined || c.PA !== undefined || c.FK !== undefined) {
        report.warnings.push({ code: 'nsc-warning', sourcePath: a.sourcePath, message: `NSC „${a.name}“: Kampftalent für „${weapon.name}“ fehlt, AT/PA nicht angepasst.` })
      }
      continue
    }
    const wmGiven = 'weaponMod.attack' in bi.system
    const wmAT = wmGiven ? Number(bi.system['weaponMod.attack']) : 0
    const wmPA = wmGiven ? Number(bi.system['weaponMod.parry']) : 0
    const shares = talentShares.get(talent.id)

    if (weapon.type === 'rangedWeapon') {
      if (c.FK === undefined) continue
      if (!shares) {
        talentShares.set(talent.id, { fk: c.FK - baseFK })
        upd(talent.id, { 'system.combat.rangedAttack': c.FK - baseFK, 'system.value': c.FK - baseFK })
      }
      continue
    }
    if (c.AT === undefined && c.PA === undefined) continue
    if (!shares) {
      const at = c.AT !== undefined ? c.AT - baseAT - wmAT : talent.system.combat?.attack
      const pa = c.PA !== undefined ? c.PA - basePA - wmPA : talent.system.combat?.parry
      talentShares.set(talent.id, { at, pa })
      upd(talent.id, { 'system.combat.attack': at, 'system.combat.parry': pa, 'system.value': Math.max(0, (at ?? 0) + (pa ?? 0)) })
      if (!wmGiven) upd(weapon.id, { 'system.weaponMod.attack': 0, 'system.weaponMod.parry': 0 })
    } else {
      const dAT = c.AT !== undefined ? c.AT - baseAT - (shares.at ?? 0) : 0
      const dPA = c.PA !== undefined ? c.PA - basePA - (shares.pa ?? 0) : 0
      upd(weapon.id, { 'system.weaponMod.attack': dAT, 'system.weaponMod.parry': dPA })
      if (wmGiven && (dAT !== wmAT || dPA !== wmPA)) {
        report.warnings.push({
          code: 'nsc-warning',
          sourcePath: a.sourcePath,
          message: `NSC „${a.name}“: „${weapon.name}“ – WM ${wmAT}/${wmPA} passt nicht zu AT/PA, verwendet ${dAT}/${dPA}.`,
        })
      }
    }
  }
  if (updates.size) await actor.updateEmbeddedDocuments('Item', [...updates.values()])
}

export const dsa41FoundryHooks: FoundrySystemHooks = {
  actorType: 'character',
  // items are identified by the system's stable id (sid), not only by name
  indexFields: ['system.sid'],
  // base rules first, then Uthuria, then Myranor/Dark Age/extra packs
  packRank: (name) => (/^(darkage|myranor|uthuria|eg_|vtuu_)/.test(name) ? (name.startsWith('uthuria') ? 1 : 2) : 0),
  matchesSource: (entry, source) => entry.system?.sid === source.sid && entry.type === source.type,
  onCreate(a) {
    const w = firstWeapon(a)
    return w ? { base: { combatState: { isArmed: true, primaryHand: w.id } } } : {}
  },
  async afterItems(actor, a, report) {
    // armed with the first weapon if the held one is gone (updates; new actors get it in onCreate)
    const combatState = actor.system?.base?.combatState
    const w = firstWeapon(a)
    if (w && combatState && (!combatState.primaryHand || !actor.items.get(combatState.primaryHand))) {
      await actor.update({ 'system.base.combatState.isArmed': true, 'system.base.combatState.primaryHand': w.id })
    }
    await adjustCombat(actor, a, report)
  },
}
