import type { OwnershipLevel, WarningCode } from './types.ts'

export type NoteType = 'journal' | 'szene' | 'ignorieren'

export interface NoteConfig {
  type: NoteType
  /** Only present when the note explicitly sets foundry.sichtbar */
  ownership?: { default: OwnershipLevel }
  raw: Record<string, unknown>
}

const TYPES: Record<string, NoteType> = {
  journal: 'journal', szene: 'szene', scene: 'szene', ignorieren: 'ignorieren', ignore: 'ignorieren',
}

const VISIBILITY: Record<string, OwnershipLevel> = {
  gm: 0, sl: 0, meister: 0, spieler: 2, player: 2, players: 2,
}

/** Reads the `foundry:` frontmatter key. */
export function readNoteConfig(
  frontmatter: Record<string, unknown> | null | undefined,
  warn: (code: WarningCode, msg: string) => void
): NoteConfig {
  const raw = frontmatter?.foundry
  if (raw === undefined || raw === null) return { type: 'journal', raw: {} }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    warn('invalid-frontmatter', '„foundry:“ muss ein Objekt sein (typ, sichtbar …).')
    return { type: 'journal', raw: {} }
  }
  const cfg = raw as Record<string, unknown>
  let type: NoteType = 'journal'
  if (cfg.typ !== undefined) {
    const t = TYPES[String(cfg.typ).toLowerCase()]
    if (t) type = t
    else warn('invalid-frontmatter', `Unbekannter foundry.typ „${String(cfg.typ)}“, erlaubt: journal, szene, ignorieren.`)
  }
  let ownership: NoteConfig['ownership']
  if (cfg.sichtbar !== undefined) {
    const v = VISIBILITY[String(cfg.sichtbar).toLowerCase()]
    if (v !== undefined) ownership = { default: v }
    else warn('invalid-frontmatter', `Unbekannter Wert foundry.sichtbar „${String(cfg.sichtbar)}“, erlaubt: gm, spieler.`)
  }
  return { type, ownership, raw: cfg }
}
