import { describe, expect, it } from 'vitest'
import { FOUNDRY_ID_PATTERN, hashObject, makeId } from '../src/index.ts'
import { build } from './helpers.ts'

describe('makeId', () => {
  it('erzeugt gültige, deterministische Foundry-IDs', () => {
    const a = makeId('Vault', 'NPC/Ebba.md')
    expect(a).toMatch(FOUNDRY_ID_PATTERN)
    expect(makeId('Vault', 'NPC/Ebba.md')).toBe(a)
    expect(makeId('Vault', 'NPC/Ebba2.md')).not.toBe(a)
    expect(makeId('Other', 'NPC/Ebba.md')).not.toBe(a)
  })

  it('unterscheidet Teilgrenzen', () => {
    expect(makeId('a/b', 'c')).not.toBe(makeId('a', 'b/c'))
  })

  it('ist über viele Eingaben kollisionsfrei und immer 16 Zeichen', () => {
    const ids = new Set<string>()
    for (let i = 0; i < 5000; i++) {
      const id = makeId('v', `note-${i}.md`)
      expect(id).toMatch(FOUNDRY_ID_PATTERN)
      ids.add(id)
    }
    expect(ids.size).toBe(5000)
  })

  it('hashObject ist unabhängig von der Schlüsselreihenfolge', () => {
    expect(hashObject({ a: 1, b: [1, { c: 2, d: 3 }] })).toBe(hashObject({ b: [1, { d: 3, c: 2 }], a: 1 }))
  })
})

describe('ID-Stabilität im Bundle', () => {
  it('gleicher Export → gleiche IDs und Hashes', () => {
    const notes = { 'A/Eins.md': 'Hallo [[Zwei]]', 'Zwei.md': '# Zwei' }
    const r1 = build(notes)
    const r2 = build(notes)
    expect(r2.bundle.documents.map((d) => [d.id, d.hash])).toEqual(r1.bundle.documents.map((d) => [d.id, d.hash]))
  })

  it('Umbenennen mit Zuordnung behält die ID', () => {
    const first = build({ 'NPC/Ebba.md': 'Text' })
    const oldId = first.bundle.documents[0].id
    // plugin rename handler moves the key
    const idMap = { 'NPC/Besatzung/Ebba Sturmfels.md': first.idMap['NPC/Ebba.md'] }
    const second = build({ 'NPC/Besatzung/Ebba Sturmfels.md': 'Text' }, [], { idMap })
    expect(second.bundle.documents[0].id).toBe(oldId)
    expect(second.bundle.documents[0].name).toBe('Ebba Sturmfels')
  })

  it('neue Notiz am alten Pfad bekommt keine doppelte ID', () => {
    const first = build({ 'Ebba.md': 'alt' })
    const idMap = { 'Neu/Ebba.md': first.idMap['Ebba.md'] }
    const second = build({ 'Neu/Ebba.md': 'alt', 'Ebba.md': 'neu' }, [], { idMap })
    const ids = second.bundle.documents.map((d) => d.id)
    expect(new Set(ids).size).toBe(2)
    expect(second.bundle.documents.find((d) => d.sourcePath === 'Neu/Ebba.md')!.id).toBe(first.bundle.documents[0].id)
  })

  it('Seiten- und Secret-IDs sind stabil und gültig', () => {
    const notes = { 'S.md': '> [!geheim]\n> Der Kapitän lügt.\n\n> [!secret] Zweites\n> x' }
    const a = build(notes).bundle.documents[0]
    const b = build(notes).bundle.documents[0]
    expect(a.pages[0].id).toMatch(FOUNDRY_ID_PATTERN)
    expect(a.pages[0].html).toBe(b.pages[0].html)
    const secretIds = [...a.pages[0].html!.matchAll(/id="secret-([A-Za-z0-9]+)"/g)].map((m) => m[1])
    expect(secretIds).toHaveLength(2)
    secretIds.forEach((id) => expect(id).toMatch(FOUNDRY_ID_PATTERN))
  })
})
