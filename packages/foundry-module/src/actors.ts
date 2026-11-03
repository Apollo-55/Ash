import { planSync } from '../../core/src/sync.ts'
import { actorsOf, FLAG_SCOPE, type Bundle, type BundleActor, type BundleItem, type DocumentFlags } from '../../core/src/types.ts'
import { normalizeName } from '../../core/src/systems/dsa41/catalog.ts'
import { MODULE_ID, SETTINGS } from './constants.ts'
import type { ImportOptions, ImportReport, ReportEntry } from './importer.ts'

const flagsOf = (doc: any): Partial<DocumentFlags> | null => doc?.flags?.[FLAG_SCOPE] ?? null

type ItemOrigin = 'welt' | 'kompendium' | 'neu'

/** Finds items by name in world items, extra compendia and the system's compendia (indexes cached per import). */
class ItemResolver {
  private indexCache = new Map<string, any[]>()
  private systemId: string
  private extraPacks: string[]
  constructor(systemId: string) {
    this.systemId = systemId
    this.extraPacks = String(game.settings.get(MODULE_ID, SETTINGS.extraPacks) ?? '')
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
  }

  private async index(packId: string): Promise<any[]> {
    if (!this.indexCache.has(packId)) {
      const pack = game.packs.get(packId)
      const idx = pack ? await pack.getIndex({ fields: ['system.sid'] }) : []
      this.indexCache.set(packId, [...idx])
    }
    return this.indexCache.get(packId)!
  }

  private systemPacks(): string[] {
    const rank = (name: string) => (/^(darkage|myranor|uthuria|eg_|vtuu_)/.test(name) ? (name.startsWith('uthuria') ? 1 : 2) : 0)
    return game.packs
      .filter((p: any) => p.documentName === 'Item' && p.metadata.packageType === 'system' && p.metadata.packageName === this.systemId)
      .sort((a: any, b: any) => rank(a.metadata.name) - rank(b.metadata.name))
      .map((p: any) => p.collection)
  }

  async resolve(bi: BundleItem): Promise<{ data: any; origin: ItemOrigin; from?: string }> {
    const wanted = normalizeName(bi.name)
    const matches = (name: string, type: string) => bi.types.includes(type) && normalizeName(name) === wanted

    // 1. world items (own house-rule items win)
    const world = game.items.find((i: any) => matches(i.name, i.type))
    if (world) return { data: world.toObject(), origin: 'welt', from: world.uuid }

    // 2. compendia chosen in the settings, 3. compendium hinted by the catalog (by sid), 4. all system compendia
    const candidates: [string, (e: any) => boolean][] = [
      ...this.extraPacks.map((p) => [p, (e: any) => matches(e.name, e.type)] as [string, (e: any) => boolean]),
    ]
    if (bi.source) {
      candidates.push([`${this.systemId}.${bi.source.pack}`, (e: any) => e.system?.sid === bi.source!.sid && e.type === bi.source!.type])
    }
    for (const p of this.systemPacks()) candidates.push([p, (e: any) => matches(e.name, e.type)])

    for (const [packId, test] of candidates) {
      const hit = (await this.index(packId)).find(test)
      if (!hit) continue
      const doc = await game.packs.get(packId).getDocument(hit._id)
      if (doc) return { data: doc.toObject(), origin: 'kompendium', from: doc.uuid }
    }
    // 5. nothing found → create from the block's definition
    return { data: { name: bi.name, type: bi.fallback.type, system: {} }, origin: 'neu' }
  }
}

function applyPaths(target: Record<string, unknown>, paths: Record<string, unknown>) {
  for (const [path, value] of Object.entries(paths)) foundry.utils.setProperty(target, path, value)
}

async function buildItem(resolver: ItemResolver, bi: BundleItem, report: ImportReport, actor: BundleActor) {
  const { data, origin, from } = await resolver.resolve(bi)
  const system = data.system ?? {}
  if (origin === 'neu') applyPaths(system, bi.fallback.system)
  applyPaths(system, bi.system)
  if (origin === 'neu') {
    report.warnings.push({
      code: 'nsc-warning',
      sourcePath: actor.sourcePath,
      message: `NSC „${actor.name}“: „${bi.name}“ gibt es weder in der Welt noch in einem Kompendium – neu angelegt.`,
    })
  }
  delete data._id
  delete data.folder
  delete data.sort
  delete data.ownership
  delete data._stats
  return {
    ...data,
    _id: bi.id,
    system,
    flags: { ...(data.flags ?? {}), [FLAG_SCOPE]: { managed: true, ...(from ? { from } : {}) } },
  }
}

function actorFlags(a: BundleActor, bundle: Bundle) {
  return { vault: bundle.vault.slug, sourcePath: a.sourcePath, hash: a.hash, bundleVersion: bundle.schemaVersion, block: a.blockName }
}

/**
 * Makes the sheet show the AT/PA/FK/INI values written in the block:
 * the first weapon of a combat talent sets the talent's AT/PA share (talent value = AT share + PA share),
 * further weapons with the same talent get the remaining difference as weapon modifier.
 */
async function adjustCombat(actor: any, a: BundleActor, report: ImportReport) {
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

async function createActor(a: BundleActor, bundle: Bundle, resolver: ItemResolver, report: ImportReport) {
  const ActorCls = CONFIG.Actor.documentClass
  const system = foundry.utils.expandObject({ ...a.data, ...a.dataOnCreate })
  const items = []
  for (const bi of a.items) items.push(await buildItem(resolver, bi, report, a))
  const firstWeapon = a.items.find((i) => i.combat && i.types[0] === 'meleeWeapon')
  if (firstWeapon) foundry.utils.mergeObject(system, { base: { combatState: { isArmed: true, primaryHand: firstWeapon.id } } })
  const actor = await ActorCls.create(
    {
      _id: a.id,
      name: a.name,
      type: 'character',
      folder: a.folder,
      ...(a.img ? { img: a.img } : {}),
      system,
      items,
      prototypeToken: { name: a.name, actorLink: a.linked, ...(a.tokenImg ? { texture: { src: a.tokenImg } } : {}) },
      flags: { [FLAG_SCOPE]: actorFlags(a, bundle) },
    },
    { keepId: true }
  )
  await adjustCombat(actor, a, report)
}

async function updateActor(actor: any, a: BundleActor, bundle: Bundle, resolver: ItemResolver, report: ImportReport) {
  const update: Record<string, unknown> = {
    name: a.name,
    folder: a.folder,
    'prototypeToken.name': a.name,
    'prototypeToken.actorLink': a.linked,
    [`flags.${FLAG_SCOPE}`]: actorFlags(a, bundle),
  }
  if (a.img) update.img = a.img
  if (a.tokenImg) update['prototypeToken.texture.src'] = a.tokenImg
  for (const [path, value] of Object.entries(a.data)) update[`system.${path}`] = value
  await actor.update(update)

  const toCreate = []
  const toUpdate = []
  for (const bi of a.items) {
    const existing = actor.items.get(bi.id)
    if (!existing) toCreate.push(await buildItem(resolver, bi, report, a))
    else if (Object.keys(bi.system).length) toUpdate.push({ _id: bi.id, ...Object.fromEntries(Object.entries(bi.system).map(([p, v]) => [`system.${p}`, v])) })
  }
  const keep = new Set(a.items.map((i) => i.id))
  // only items the importer made; hand-added items, effects and the current state stay
  const toDelete = actor.items.filter((i: any) => !keep.has(i.id) && i.flags?.[FLAG_SCOPE]?.managed).map((i: any) => i.id)
  if (toUpdate.length) await actor.updateEmbeddedDocuments('Item', toUpdate)
  if (toCreate.length) await actor.createEmbeddedDocuments('Item', toCreate, { keepId: true })
  if (toDelete.length) await actor.deleteEmbeddedDocuments('Item', toDelete)
  const combatState = actor.system?.base?.combatState
  const firstWeapon = a.items.find((i) => i.combat && i.types[0] === 'meleeWeapon')
  if (firstWeapon && combatState && (!combatState.primaryHand || !actor.items.get(combatState.primaryHand))) {
    await actor.update({ 'system.base.combatState.isArmed': true, 'system.base.combatState.primaryHand': firstWeapon.id })
  }
  await adjustCombat(actor, a, report)
}

export async function syncActors(bundle: Bundle, report: ImportReport, opts: ImportOptions): Promise<void> {
  const actors = actorsOf(bundle)
  if (!actors.length) {
    // still report orphans: actors of this vault that are no longer in the bundle
  } else if (bundle.system && bundle.system !== game.system.id) {
    report.errors.push(`Die NSCs sind für das System „${bundle.system}“ exportiert, diese Welt nutzt „${game.system.id}“. NSCs wurden übersprungen.`)
    return
  }
  const existing = game.actors.contents.map((x: any) => ({ id: x.id, flags: flagsOf(x), folder: x.folder?.id ?? null }))
  const plan = planSync(bundle, actors, existing, { force: opts.forceDocuments })
  const byId = new Map(actors.map((a) => [a.id, a]))
  const entry = (a: BundleActor): ReportEntry => ({ id: a.id, uuid: `Actor.${a.id}`, name: a.name, sourcePath: a.sourcePath, type: 'Actor' })
  const resolver = new ItemResolver(game.system.id)

  let n = 0
  const total = plan.create.length + plan.update.length
  for (const id of plan.create) {
    const a = byId.get(id)!
    opts.onProgress?.(0.9 + 0.1 * (n++ / Math.max(1, total)), `NSC ${a.name}`)
    try {
      await createActor(a, bundle, resolver, report)
      report.created.push(entry(a))
    } catch (e) {
      console.error(MODULE_ID, e)
      report.errors.push(`NSC „${a.name}“: ${(e as Error)?.message ?? e}`)
    }
  }
  for (const id of plan.update) {
    const a = byId.get(id)!
    opts.onProgress?.(0.9 + 0.1 * (n++ / Math.max(1, total)), `NSC ${a.name}`)
    try {
      await updateActor(game.actors.get(id), a, bundle, resolver, report)
      report.updated.push(entry(a))
    } catch (e) {
      console.error(MODULE_ID, e)
      report.errors.push(`NSC „${a.name}“: ${(e as Error)?.message ?? e}`)
    }
  }
  report.skipped.push(...plan.skip.map((id) => entry(byId.get(id)!)))
  for (const id of plan.conflicts) {
    report.conflicts.push(entry(byId.get(id)!))
    report.errors.push(`„${byId.get(id)!.name}“: In der Welt gibt es schon einen Actor mit derselben ID, der nicht aus dieser Vault stammt. Nicht verändert.`)
  }
  for (const id of plan.orphans) {
    const x = game.actors.get(id)
    report.orphans.push({ id, uuid: x.uuid, name: x.name, sourcePath: flagsOf(x)?.sourcePath, type: 'Actor' })
  }
}
