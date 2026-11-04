import { planSync } from '../../core/src/sync.ts'
import { actorsOf, FLAG_SCOPE, type Bundle, type BundleActor, type BundleItem, type DocumentFlags } from '../../core/src/types.ts'
import { normalizeName } from '../../core/src/text.ts'
import { defaultHooks, type FoundrySystemHooks } from './system-hooks.ts'
import { SYSTEM_HOOKS } from './systems.ts'
import { MODULE_ID, SETTINGS } from './constants.ts'
import type { ImportOptions, ImportReport, ReportEntry } from './importer.ts'

const flagsOf = (doc: any): Partial<DocumentFlags> | null => doc?.flags?.[FLAG_SCOPE] ?? null

type ItemOrigin = 'welt' | 'kompendium' | 'neu'

/** Finds items by name in world items, extra compendia and the system's compendia (indexes cached per import). */
class ItemResolver {
  private indexCache = new Map<string, any[]>()
  private systemId: string
  private hooks: FoundrySystemHooks
  private extraPacks: string[]
  constructor(systemId: string, hooks: FoundrySystemHooks) {
    this.systemId = systemId
    this.hooks = hooks
    this.extraPacks = String(game.settings.get(MODULE_ID, SETTINGS.extraPacks) ?? '')
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
  }

  private async index(packId: string): Promise<any[]> {
    if (!this.indexCache.has(packId)) {
      const pack = game.packs.get(packId)
      const idx = pack ? await pack.getIndex({ fields: this.hooks.indexFields ?? [] }) : []
      this.indexCache.set(packId, [...idx])
    }
    return this.indexCache.get(packId)!
  }

  private systemPacks(): string[] {
    const rank = (name: string) => this.hooks.packRank?.(name) ?? 0
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

    // 2. compendia chosen in the settings, 3. compendium hinted by the system's catalog, 4. all system compendia
    const candidates: [string, (e: any) => boolean][] = [
      ...this.extraPacks.map((p) => [p, (e: any) => matches(e.name, e.type)] as [string, (e: any) => boolean]),
    ]
    if (bi.source && this.hooks.matchesSource) {
      const source = bi.source
      candidates.push([`${this.systemId}.${source.pack}`, (e: any) => this.hooks.matchesSource!(e, source)])
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

async function createActor(a: BundleActor, bundle: Bundle, resolver: ItemResolver, report: ImportReport, hooks: FoundrySystemHooks) {
  const ActorCls = CONFIG.Actor.documentClass
  const system = foundry.utils.expandObject({ ...a.data, ...a.dataOnCreate })
  const items = []
  for (const bi of a.items) items.push(await buildItem(resolver, bi, report, a))
  const extra = hooks.onCreate?.(a)
  if (extra) foundry.utils.mergeObject(system, extra)
  const actor = await ActorCls.create(
    {
      _id: a.id,
      name: a.name,
      type: hooks.actorType,
      folder: a.folder,
      ...(a.img ? { img: a.img } : {}),
      system,
      items,
      prototypeToken: { name: a.name, actorLink: a.linked, ...(a.tokenImg ? { texture: { src: a.tokenImg } } : {}) },
      flags: { [FLAG_SCOPE]: actorFlags(a, bundle) },
    },
    { keepId: true }
  )
  await hooks.afterItems?.(actor, a, report)
}

async function updateActor(actor: any, a: BundleActor, bundle: Bundle, resolver: ItemResolver, report: ImportReport, hooks: FoundrySystemHooks) {
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
  await hooks.afterItems?.(actor, a, report)
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
  const hooks = SYSTEM_HOOKS[game.system.id] ?? defaultHooks()
  const resolver = new ItemResolver(game.system.id, hooks)

  let n = 0
  const total = plan.create.length + plan.update.length
  for (const id of plan.create) {
    const a = byId.get(id)!
    opts.onProgress?.(0.9 + 0.1 * (n++ / Math.max(1, total)), `NSC ${a.name}`)
    try {
      await createActor(a, bundle, resolver, report, hooks)
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
      await updateActor(game.actors.get(id), a, bundle, resolver, report, hooks)
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
