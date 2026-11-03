/** Version of the bundle.json schema. Bump on incompatible changes. */
export const BUNDLE_SCHEMA_VERSION = 1

/** Flag scope used on every Foundry document the importer creates. Equals the module id. */
export const FLAG_SCOPE = 'vault-to-foundry'

/** Foundry v13 CONST.FOLDER_MAX_DEPTH */
export const FOUNDRY_FOLDER_MAX_DEPTH = 4

export type FolderDocumentType = 'JournalEntry' | 'Actor' | 'Scene'

export interface BundleFolder {
  kind: 'folder'
  id: string
  type: FolderDocumentType
  name: string
  parent: string | null
  /** Vault folder path this Foundry folder represents (merged levels joined by "/"). */
  sourcePath: string
}

export type OwnershipLevel = 0 | 1 | 2 | 3

export interface BundleJournalPage {
  id: string
  name: string
  type: 'text' | 'pdf' | 'image'
  /** HTML for text pages */
  html?: string
  /** Data-relative path for pdf/image pages */
  src?: string
}

export interface BundleJournal {
  kind: 'journal'
  id: string
  sourcePath: string
  folder: string | null
  name: string
  /** Only set when the note explicitly specifies visibility. */
  ownership?: { default: OwnershipLevel }
  pages: BundleJournalPage[]
  hash: string
}

/** An embedded item the importer should put on an actor. */
export interface BundleItem {
  /** stable id of the embedded item */
  id: string
  name: string
  /** Foundry item types that may satisfy this entry, in order of preference */
  types: string[]
  /** compendium hint from the offline catalog (pack name without system prefix) */
  source?: { pack: string; sid: string; type: string }
  /** values written below item.system (dot paths) after copying/creating */
  system: Record<string, unknown>
  /** used when the item exists nowhere (world, compendia): created from scratch */
  fallback: { type: string; system: Record<string, unknown> }
  /** weapons: target values the importer adjusts the combat talent / weapon to */
  combat?: { talentSid: string; AT?: number; PA?: number; FK?: number; INI?: number }
}

export interface BundleActor {
  kind: 'actor'
  id: string
  sourcePath: string
  /** name of the block inside the note */
  blockName: string
  folder: string | null
  name: string
  /** Foundry system id this actor is meant for */
  system: string
  img?: string
  tokenImg?: string
  /** prototype token linked to the actor (unique NSC) */
  linked: boolean
  /** journal of the note the block lives in */
  journal?: string
  /** dot paths below actor.system, written on create and update */
  data: Record<string, unknown>
  /** dot paths below actor.system, written only when the actor is created (current LeP etc.) */
  dataOnCreate: Record<string, unknown>
  items: BundleItem[]
  hash: string
}

export interface BundleScenePin {
  id: string
  /** pixel position on the map image (top left 0,0) */
  x: number
  y: number
  label: string
  entryId: string
  pageId?: string
}

export interface BundleScene {
  kind: 'scene'
  id: string
  sourcePath: string
  blockName: string
  folder: string | null
  name: string
  /** data path of the map image */
  img: string
  grid: { type: 'square' | 'hex' | 'none'; size: number; distance: number; units: string }
  /** journal of the note (scene.journal) */
  journal?: string
  lighting: 'tag' | 'nacht' | 'dunkel'
  fog: boolean
  navigation: boolean
  /** actor ids placed (hidden) when the scene is created */
  tokens: string[]
  pins: BundleScenePin[]
  hash: string
}

export type BundleDocument = BundleJournal | BundleActor | BundleScene

export interface BundleAsset {
  /** Path inside the ZIP and below assetsBase, e.g. "Asasets/Token/token_viper.png" */
  path: string
  sourcePath: string
  hash: string
  size: number
}

export type WarningCode =
  | 'unresolved-link'
  | 'unresolved-heading'
  | 'unresolved-embed'
  | 'dataview-skipped'
  | 'unclosed-comment'
  | 'unsupported-embed'
  | 'invalid-frontmatter'
  | 'note-type-pending'
  | 'nsc-error'
  | 'nsc-warning'
  | 'scene-error'
  | 'scene-warning'

export interface BundleWarning {
  code: WarningCode
  sourcePath: string
  message: string
}

export interface Bundle {
  schemaVersion: number
  generator: { name: string; version: string }
  vault: { name: string; slug: string }
  generatedAt: string
  /** Foundry system the actor data is meant for (e.g. "dsa-41"); absent when the bundle has no actors */
  system?: string
  /** Data-relative base directory of uploaded assets, e.g. "vault-to-foundry/uthuria-ob/assets" */
  assetsBase: string
  folders: BundleFolder[]
  documents: BundleDocument[]
  assets: BundleAsset[]
  warnings: BundleWarning[]
  /** Notes that were skipped on purpose (excluded, typ: ignorieren) */
  skipped: { sourcePath: string; reason: string }[]
}

/** Flags stored on every imported document under flags[FLAG_SCOPE]. */
export interface DocumentFlags {
  vault: string
  sourcePath: string
  hash: string
  bundleVersion: number
  /** Marks embedded documents (pages, items) the importer owns. */
  managed?: boolean
}

export const journalsOf = (b: Pick<Bundle, 'documents'>): BundleJournal[] => b.documents.filter((d): d is BundleJournal => d.kind === 'journal')
export const actorsOf = (b: Pick<Bundle, 'documents'>): BundleActor[] => b.documents.filter((d): d is BundleActor => d.kind === 'actor')
export const scenesOf = (b: Pick<Bundle, 'documents'>): BundleScene[] => b.documents.filter((d): d is BundleScene => d.kind === 'scene')
