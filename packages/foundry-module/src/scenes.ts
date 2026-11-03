import { planSync } from '../../core/src/sync.ts'
import { FLAG_SCOPE, scenesOf, type Bundle, type BundleScene, type DocumentFlags } from '../../core/src/types.ts'
import { MODULE_ID } from './constants.ts'
import type { ImportOptions, ImportReport, ReportEntry } from './importer.ts'

const flagsOf = (doc: any): Partial<DocumentFlags> | null => doc?.flags?.[FLAG_SCOPE] ?? null

/** Natural size of an image in the data folder (the browser loads it). */
function imageSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => reject(new Error(`Kartenbild „${src}“ lässt sich nicht laden`))
    img.src = encodeURI(src)
  })
}

const GRID = () => ({
  square: CONST.GRID_TYPES.SQUARE,
  hex: CONST.GRID_TYPES.HEXODDR,
  none: CONST.GRID_TYPES.GRIDLESS,
})

const LIGHT = { tag: { darknessLevel: 0, globalLight: true }, nacht: { darknessLevel: 0.7, globalLight: false }, dunkel: { darknessLevel: 1, globalLight: false } }

function sceneFlags(s: BundleScene, bundle: Bundle, imgSize?: { width: number; height: number }) {
  return { vault: bundle.vault.slug, sourcePath: s.sourcePath, hash: s.hash, bundleVersion: bundle.schemaVersion, block: s.blockName, img: s.img, ...(imgSize ?? {}) }
}

/** Fields that Obsidian owns (written on create and update). */
function sceneData(s: BundleScene) {
  const light = LIGHT[s.lighting]
  return {
    name: s.name,
    folder: s.folder,
    navigation: s.navigation,
    'background.src': s.img,
    'grid.type': GRID()[s.grid.type],
    'grid.size': s.grid.size,
    'grid.distance': s.grid.distance,
    'grid.units': s.grid.units,
    journal: s.journal ?? null,
    'environment.darknessLevel': light.darknessLevel,
    'environment.globalLight.enabled': light.globalLight,
    tokenVision: s.fog,
    'fog.exploration': s.fog,
  }
}

/** Offset of the image inside the scene canvas (Foundry adds padding around the background). */
function origin(scene: any): { x: number; y: number } {
  const d = scene.dimensions
  return d ? { x: d.sceneX, y: d.sceneY } : { x: 0, y: 0 }
}

function pinData(scene: any, pin: BundleScene['pins'][number]) {
  const o = origin(scene)
  return {
    _id: pin.id,
    entryId: pin.entryId,
    ...(pin.pageId ? { pageId: pin.pageId } : {}),
    x: o.x + pin.x,
    y: o.y + pin.y,
    text: pin.label,
    iconSize: 48,
    fontSize: 32,
    texture: { src: 'icons/svg/book.svg' },
    flags: { [FLAG_SCOPE]: { managed: true } },
  }
}

async function syncPins(scene: any, s: BundleScene) {
  const keep = new Set(s.pins.map((p) => p.id))
  const existing = scene.notes
  const toCreate = s.pins.filter((p) => !existing.get(p.id)).map((p) => pinData(scene, p))
  const toUpdate = s.pins.filter((p) => existing.get(p.id)).map((p) => pinData(scene, p))
  const toDelete = existing.filter((n: any) => !keep.has(n.id) && n.flags?.[FLAG_SCOPE]?.managed).map((n: any) => n.id)
  if (toUpdate.length) await scene.updateEmbeddedDocuments('Note', toUpdate)
  if (toCreate.length) await scene.createEmbeddedDocuments('Note', toCreate, { keepId: true })
  if (toDelete.length) await scene.deleteEmbeddedDocuments('Note', toDelete)
}

/** NPC tokens: once, hidden, in a row along the top edge of the map. */
async function placeTokens(scene: any, s: BundleScene, report: ImportReport) {
  const o = origin(scene)
  const size = scene.grid?.size ?? 100
  const tokens = []
  let i = 0
  for (const actorId of s.tokens) {
    const actor = game.actors.get(actorId)
    if (!actor) {
      report.warnings.push({ code: 'scene-warning', sourcePath: s.sourcePath, message: `Szene „${s.name}“: NSC ${actorId} fehlt in der Welt, kein Token.` })
      continue
    }
    const td = await actor.getTokenDocument({ x: o.x + size * i++, y: o.y, hidden: true })
    tokens.push(td.toObject())
  }
  if (tokens.length) await scene.createEmbeddedDocuments('Token', tokens)
}

async function createScene(s: BundleScene, bundle: Bundle, report: ImportReport) {
  const SceneCls = CONFIG.Scene.documentClass
  const size = await imageSize(s.img)
  const data = foundry.utils.expandObject({
    _id: s.id,
    ...sceneData(s),
    width: size.width,
    height: size.height,
    padding: s.grid.type === 'none' ? 0 : 0.1,
    [`flags.${FLAG_SCOPE}`]: sceneFlags(s, bundle, size),
  })
  const scene = await SceneCls.create(data, { keepId: true })
  // Foundry renders a thumbnail when possible; failure (e.g. no canvas) is harmless
  try {
    const thumb = await scene.createThumbnail?.()
    if (thumb?.thumb) await scene.update({ thumb: thumb.thumb })
  } catch {
    /* no thumbnail */
  }
  await syncPins(scene, s)
  await placeTokens(scene, s, report)
}

async function updateScene(scene: any, s: BundleScene, bundle: Bundle) {
  const update: Record<string, unknown> = { ...sceneData(s) }
  const prev = flagsOf(scene) as Record<string, any>
  let size = prev?.width ? { width: prev.width, height: prev.height } : undefined
  if (!size || prev?.img !== s.img) {
    size = await imageSize(s.img)
    update.width = size.width
    update.height = size.height
  }
  update[`flags.${FLAG_SCOPE}`] = sceneFlags(s, bundle, size)
  await scene.update(update)
  await syncPins(scene, s)
}

export async function syncScenes(bundle: Bundle, report: ImportReport, opts: ImportOptions): Promise<void> {
  const scenes = scenesOf(bundle)
  const existing = game.scenes.contents.map((x: any) => ({ id: x.id, flags: flagsOf(x), folder: x.folder?.id ?? null }))
  const plan = planSync(bundle, scenes, existing, { force: opts.forceDocuments })
  const byId = new Map(scenes.map((s) => [s.id, s]))
  const entry = (s: BundleScene): ReportEntry => ({ id: s.id, uuid: `Scene.${s.id}`, name: s.name, sourcePath: s.sourcePath, type: 'Scene' })

  for (const id of plan.create) {
    const s = byId.get(id)!
    opts.onProgress?.(0.95, `Szene ${s.name}`)
    try {
      await createScene(s, bundle, report)
      report.created.push(entry(s))
    } catch (e) {
      console.error(MODULE_ID, e)
      report.errors.push(`Szene „${s.name}“: ${(e as Error)?.message ?? e}`)
    }
  }
  for (const id of plan.update) {
    const s = byId.get(id)!
    try {
      await updateScene(game.scenes.get(id), s, bundle)
      report.updated.push(entry(s))
    } catch (e) {
      console.error(MODULE_ID, e)
      report.errors.push(`Szene „${s.name}“: ${(e as Error)?.message ?? e}`)
    }
  }
  report.skipped.push(...plan.skip.map((id) => entry(byId.get(id)!)))
  for (const id of plan.conflicts) {
    report.conflicts.push(entry(byId.get(id)!))
    report.errors.push(`„${byId.get(id)!.name}“: In der Welt gibt es schon eine Szene mit derselben ID, die nicht aus dieser Vault stammt. Nicht verändert.`)
  }
  for (const id of plan.orphans) {
    const x = game.scenes.get(id)
    report.orphans.push({ id, uuid: x.uuid, name: x.name, sourcePath: flagsOf(x)?.sourcePath, type: 'Scene' })
  }
}
