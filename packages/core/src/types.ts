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

export type BundleDocument = BundleJournal

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
