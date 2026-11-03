import { describe, expect, it } from 'vitest'
import { folderLevels, isExcluded, matchesPattern, planSync, preserveRevealedSecrets, revealedSecretIds, sortFoldersByDepth } from '../src/index.ts'
import { build } from './helpers.ts'

describe('Ordner', () => {
  it('folgen der Vault-Struktur', () => {
    const { bundle } = build({ 'NPC/Besatzung/Ebba.md': 'x', 'NPC/Topasa.md': 'y', 'Welcome.md': 'z' })
    expect(bundle.folders.map((f) => f.sourcePath)).toEqual(['NPC', 'NPC/Besatzung'])
    const ebba = bundle.documents.find((d) => d.name === 'Ebba')!
    const besatzung = bundle.folders.find((f) => f.name === 'Besatzung')!
    expect(ebba.folder).toBe(besatzung.id)
    expect(besatzung.parent).toBe(bundle.folders.find((f) => f.name === 'NPC')!.id)
    expect(bundle.documents.find((d) => d.name === 'Welcome')!.folder).toBeNull()
  })

  it('fasst Ebenen tiefer als 4 zusammen', () => {
    expect(folderLevels('a/b/c/d/e/f')).toEqual(['a', 'b', 'c', 'd / e / f'])
    expect(folderLevels('a/b/c/d')).toEqual(['a', 'b', 'c', 'd'])
    expect(folderLevels('b/c/d/e', 'Vault')).toEqual(['Vault', 'b', 'c', 'd / e'])
  })

  it('Eltern vor Kindern', () => {
    const sorted = sortFoldersByDepth([
      { id: 'c', parent: 'b' },
      { id: 'a', parent: null },
      { id: 'b', parent: 'a' },
    ])
    expect(sorted.map((f) => f.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('Ausschlüsse und Frontmatter', () => {
  it('Muster', () => {
    expect(matchesPattern('_privat/x.md', '_privat/')).toBe(true)
    expect(matchesPattern('a/_privat/x.md', '_privat/')).toBe(false)
    expect(matchesPattern('Vorlagen/NSC.md', 'Vorlagen/**')).toBe(true)
    expect(matchesPattern('x/y.canvas', '*.canvas')).toBe(true)
    expect(matchesPattern('NPC/Ebba TODO.md', '*TODO*')).toBe(true)
    expect(isExcluded('NPC/Ebba.md', ['_privat/', '*.canvas'])).toBe(false)
  })

  it('ausgeschlossene Notizen erscheinen nicht und Links darauf werden Text', () => {
    const { bundle } = build({ 'A.md': '[[Geheim]]', '_privat/Geheim.md': 'x' }, [], { excludePatterns: ['_privat/'] })
    expect(bundle.documents.map((d) => d.sourcePath)).toEqual(['A.md'])
    expect(bundle.documents[0].pages[0].html).toContain('vtf-unresolved')
    expect(bundle.skipped).toEqual([{ sourcePath: '_privat/Geheim.md', reason: 'Ausschlussmuster' }])
  })

  it('foundry.typ: ignorieren', () => {
    const { bundle } = build({ 'A.md': '---\nfoundry:\n  typ: ignorieren\n---\nx' })
    expect(bundle.documents).toHaveLength(0)
  })

  it('sichtbar setzt Berechtigung nur wenn angegeben', () => {
    const { bundle } = build({
      'A.md': '---\nfoundry:\n  sichtbar: spieler\n---\nx',
      'B.md': 'x',
      'C.md': '---\nfoundry:\n  sichtbar: gm\n---\nx',
    })
    const by = Object.fromEntries(bundle.documents.map((d) => [d.name, d.ownership]))
    expect(by).toEqual({ A: { default: 2 }, B: undefined, C: { default: 0 } })
  })

  it('unbekannte Werte erzeugen Warnungen', () => {
    const { bundle } = build({ 'A.md': '---\nfoundry:\n  typ: karte\n  sichtbar: alle\n---\nx' })
    expect(bundle.warnings.filter((w) => w.code === 'invalid-frontmatter')).toHaveLength(2)
  })

  it('Frontmatter erscheint nicht im Journal', () => {
    const { bundle } = build({ 'A.md': '---\ntags: [npc]\n---\nText' })
    expect(bundle.documents[0].pages[0].html).toBe('<p>Text</p>\n')
  })

  it('.canvas/.base werden nicht als Anhang hochgeladen, alles andere schon', () => {
    const { bundle } = build({ 'A.md': 'x' }, ['Untitled.canvas', 'Untitled.base', 'Asasets/Tiles/Ship_full.png'])
    expect(bundle.assets.map((a) => a.sourcePath)).toEqual(['Asasets/Tiles/Ship_full.png'])
  })

  it('nur verlinkte Anhänge, wenn eingestellt', () => {
    const { bundle } = build({ 'A.md': '![[a.png]]' }, ['a.png', 'b.png'], { includeUnreferencedAttachments: false })
    expect(bundle.assets.map((a) => a.sourcePath)).toEqual(['a.png'])
  })
})

describe('Sync-Planung', () => {
  const bundle = { vault: { name: 'V', slug: 'v' }, schemaVersion: 1 }
  const flags = (hash: string, vault = 'v') => ({ vault, hash, bundleVersion: 1, sourcePath: 'x' })

  it('legt an, aktualisiert, überspringt, findet Verwaiste', () => {
    const plan = planSync(
      bundle,
      [
        { id: 'new', hash: 'h', folder: null },
        { id: 'same', hash: 'h1', folder: 'f' },
        { id: 'changed', hash: 'h2', folder: null },
        { id: 'moved', hash: 'h3', folder: 'g' },
      ],
      [
        { id: 'same', flags: flags('h1'), folder: 'f' },
        { id: 'changed', flags: flags('old'), folder: null },
        { id: 'moved', flags: flags('h3'), folder: 'f' },
        { id: 'gone', flags: flags('x'), folder: null },
        { id: 'handmade', flags: null },
        { id: 'othervault', flags: flags('x', 'w') },
      ]
    )
    expect(plan).toEqual({ create: ['new'], update: ['changed', 'moved'], skip: ['same'], orphans: ['gone'], conflicts: [] })
  })

  it('fremde Dokumente mit gleicher ID werden nicht angefasst', () => {
    const plan = planSync(bundle, [{ id: 'a', hash: 'h', folder: null }], [{ id: 'a', flags: null }])
    expect(plan.conflicts).toEqual(['a'])
  })

  it('neue Bundle-Version erzwingt Update', () => {
    const plan = planSync({ ...bundle, schemaVersion: 2 }, [{ id: 'a', hash: 'h', folder: null }], [{ id: 'a', flags: flags('h') }])
    expect(plan.update).toEqual(['a'])
  })
})

describe('Aufgedeckte Secrets', () => {
  it('bleiben nach Update aufgedeckt', () => {
    const old = '<section class="secret revealed" id="secret-AAAA"><p>alt</p></section><section class="secret" id="secret-BBBB"></section>'
    const neu = '<section class="secret" id="secret-AAAA"><p>neu</p></section><section class="secret" id="secret-BBBB"></section>'
    expect(revealedSecretIds(old)).toEqual(new Set(['secret-AAAA']))
    expect(preserveRevealedSecrets(old, neu)).toBe(
      '<section class="secret revealed" id="secret-AAAA"><p>neu</p></section><section class="secret" id="secret-BBBB"></section>'
    )
  })
  it('id vor class und einfache Anführungszeichen', () => {
    const old = `<section id='secret-X' class='revealed secret'>`
    expect(preserveRevealedSecrets(old, '<section id="secret-X" class="secret">')).toBe('<section id="secret-X" class="secret revealed">')
  })
})
