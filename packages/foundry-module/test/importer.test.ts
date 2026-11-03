import JSZip from 'jszip'
import { beforeEach, describe, expect, it } from 'vitest'
import { buildBundle, createSimpleResolver, type Bundle } from '../../core/src/index.ts'
import { deleteOrphans, importBundle, readBundleZip } from '../src/importer.ts'
import { installFakeFoundry, type FakeWorld } from './fake-foundry.ts'

let world: FakeWorld

async function makeZip(notes: Record<string, string>, files: Record<string, string> = {}, idMap: Record<string, string> = {}) {
  const paths = [...Object.keys(notes), ...Object.keys(files)]
  const { bundle, assetFiles, idMap: newMap } = buildBundle({
    vaultName: 'uthuria-ob',
    notes: Object.entries(notes).map(([path, content]) => ({ path, content })),
    attachments: Object.keys(files),
    resolver: createSimpleResolver(paths),
    idMap,
  })
  const zip = new JSZip()
  for (const [zipPath, vaultPath] of assetFiles) {
    const asset = bundle.assets.find((a) => `assets/${a.path}` === zipPath)!
    asset.hash = `h-${files[vaultPath]}`
    zip.file(zipPath, files[vaultPath])
  }
  zip.file('bundle.json', JSON.stringify(bundle))
  const blob = new Blob([await zip.generateAsync({ type: 'arraybuffer' })])
  return { ...(await readBundleZip(blob)), idMap: newMap }
}

async function run(notes: Record<string, string>, files: Record<string, string> = {}, idMap: Record<string, string> = {}) {
  const { zip, bundle, idMap: map } = await makeZip(notes, files, idMap)
  const report = await importBundle(zip, bundle)
  return { report, bundle: bundle as Bundle, idMap: map }
}

beforeEach(() => {
  world = installFakeFoundry()
})

describe('Import in Foundry (Fake-API)', () => {
  const notes = {
    'NPC/Besatzung/Ebba.md': '## Köchin\n![[token_ebba.png]]\nSiehe [[Schiffe]].\n\n> [!geheim]\n> Sie ist eine Spionin.',
    'Uthuria/Act1 Überfahrt/Schiffe.md': '# Schiffe\nTabelle',
  }
  const files = { 'Asasets/Token/token_ebba.png': 'PNG1' }

  it('legt Journale, Ordner und Dateien an', async () => {
    const { report } = await run(notes, files)
    expect(report.created.map((c) => c.name).sort()).toEqual(['Ebba', 'Schiffe'])
    expect(world.folders.contents.map((f) => f.name).sort()).toEqual(['Act1 Überfahrt', 'Besatzung', 'NPC', 'Uthuria'])
    const ebba = world.journal.contents.find((j) => j.name === 'Ebba')!
    expect(ebba.folder!.name).toBe('Besatzung')
    expect(ebba.folder!.folder!.name).toBe('NPC')
    expect(ebba.flags['vault-to-foundry']).toMatchObject({ vault: 'uthuria-ob', sourcePath: 'NPC/Besatzung/Ebba.md' })
    expect(ebba.pages.contents[0].text!.content).toContain('<section class="secret"')
    expect(world.files.get('vault-to-foundry/uthuria-ob/assets/Asasets/Token/token_ebba.png')).toBe(1)
    expect(report.assets).toEqual({ uploaded: 1, unchanged: 0, failed: [] })
  })

  it('zweiter Import ohne Änderungen: keine Duplikate, alles übersprungen, kein Upload', async () => {
    await run(notes, files)
    const { report } = await run(notes, files)
    expect(world.journal.size).toBe(2)
    expect(report.created).toEqual([])
    expect(report.updated).toEqual([])
    expect(report.skipped).toHaveLength(2)
    expect(report.assets).toEqual({ uploaded: 0, unchanged: 1, failed: [] })
    expect(world.files.get('vault-to-foundry/uthuria-ob/assets/Asasets/Token/token_ebba.png')).toBe(1)
  })

  it('geänderte Notiz wird aktualisiert, aufgedeckte Secrets bleiben aufgedeckt', async () => {
    await run(notes, files)
    const ebba = world.journal.contents.find((j) => j.name === 'Ebba')!
    const page = ebba.pages.contents[0]
    page.text!.content = page.text!.content.replace('class="secret"', 'class="secret revealed"')

    const changed = { ...notes, 'NPC/Besatzung/Ebba.md': notes['NPC/Besatzung/Ebba.md'] + '\n\nNeuer Absatz.' }
    const { report } = await run(changed, files)
    expect(report.updated.map((u) => u.name)).toEqual(['Ebba'])
    expect(report.skipped.map((u) => u.name)).toEqual(['Schiffe'])
    expect(page.text!.content).toContain('Neuer Absatz.')
    expect(page.text!.content).toContain('class="secret revealed"')
    expect(world.journal.size).toBe(2)
  })

  it('Umbenennen in Obsidian (mit ID-Zuordnung) verschiebt statt zu duplizieren', async () => {
    const first = await run(notes, files)
    const oldId = first.bundle.documents.find((d) => d.name === 'Ebba')!.id
    const idMap: Record<string, string> = { ...first.idMap, 'NPC/Expedition/Ebba Sturmfels.md': first.idMap['NPC/Besatzung/Ebba.md'] }
    delete idMap['NPC/Besatzung/Ebba.md']
    const renamed = { 'NPC/Expedition/Ebba Sturmfels.md': notes['NPC/Besatzung/Ebba.md'], 'Uthuria/Act1 Überfahrt/Schiffe.md': notes['Uthuria/Act1 Überfahrt/Schiffe.md'] }
    const { report } = await run(renamed, files, idMap)
    expect(world.journal.size).toBe(2)
    const j = world.journal.get(oldId)!
    expect(j.name).toBe('Ebba Sturmfels')
    expect(j.folder!.name).toBe('Expedition')
    // the now empty folder "Besatzung" is reported as orphan, not deleted
    expect(report.orphans.map((o) => o.name)).toEqual(['Besatzung'])
    expect(world.folders.contents.some((f) => f.name === 'Besatzung')).toBe(true)
  })

  it('gelöschte Notiz wird verwaist gemeldet und erst auf Knopfdruck gelöscht', async () => {
    await run(notes, files)
    const { report } = await run({ 'NPC/Besatzung/Ebba.md': notes['NPC/Besatzung/Ebba.md'] }, files)
    expect(report.orphans.map((o) => o.name).sort()).toEqual(['Act1 Überfahrt', 'Schiffe', 'Uthuria'])
    expect(world.journal.size).toBe(2)

    const n = await deleteOrphans(report.orphans)
    expect(world.journal.size).toBe(1)
    expect(world.folders.contents.map((f) => f.name).sort()).toEqual(['Besatzung', 'NPC'])
    expect(n).toBe(3)
  })

  it('von Hand angelegte Seiten und Journale bleiben unberührt', async () => {
    await run(notes, files)
    const ebba = world.journal.contents.find((j) => j.name === 'Ebba')!
    await ebba.createEmbeddedDocuments('JournalEntryPage', [{ name: 'Spielnotizen', type: 'text', text: { content: 'x', format: 1 } }])
    await (globalThis as any).CONFIG.JournalEntry.documentClass.createDocuments([{ name: 'Handgemacht' }])

    const changed = { ...notes, 'NPC/Besatzung/Ebba.md': 'komplett neu' }
    const { report } = await run(changed, files)
    expect(ebba.pages.contents.map((p) => p.name)).toEqual(['Ebba', 'Spielnotizen'])
    expect(report.orphans.map((o) => o.name)).not.toContain('Handgemacht')
    expect(world.journal.contents.some((j) => j.name === 'Handgemacht')).toBe(true)
  })

  it('Berechtigung nur setzen, wenn in Obsidian angegeben', async () => {
    await run({ 'A.md': 'x', 'B.md': '---\nfoundry:\n  sichtbar: spieler\n---\nx' })
    const a = world.journal.contents.find((j) => j.name === 'A')!
    const b = world.journal.contents.find((j) => j.name === 'B')!
    expect(b.ownership.default).toBe(2)
    a.ownership = { default: 2, user1: 3 } // set by hand in Foundry
    await run({ 'A.md': 'x geändert', 'B.md': '---\nfoundry:\n  sichtbar: spieler\n---\nx' })
    expect(a.ownership).toEqual({ default: 2, user1: 3 })
  })

  it('geändertes Bild wird neu hochgeladen', async () => {
    await run(notes, files)
    const { report } = await run(notes, { 'Asasets/Token/token_ebba.png': 'PNG2' })
    expect(report.assets.uploaded).toBe(1)
    expect(world.files.get('vault-to-foundry/uthuria-ob/assets/Asasets/Token/token_ebba.png')).toBe(2)
  })

  it('warnt, wenn dieselben Notizen schon unter anderem Vault-Namen existieren', async () => {
    await run({ 'A.md': 'x' })
    const { zip, bundle } = await makeZip({ 'A.md': 'x' })
    bundle.vault = { name: 'test-vault', slug: 'test-vault' }
    const report = await importBundle(zip, bundle)
    expect(report.errors[0]).toContain('aus einem Vault namens „uthuria-ob“, dieser Import heißt „test-vault“')
  })

  it('lehnt fremde ZIPs und zu neue Bundles ab', async () => {
    const zip = new JSZip()
    zip.file('x.txt', 'x')
    await expect(readBundleZip(new Blob([await zip.generateAsync({ type: 'arraybuffer' })]))).rejects.toThrow(/bundle.json/)
    const z2 = new JSZip()
    z2.file('bundle.json', JSON.stringify({ schemaVersion: 99, vault: { slug: 'x' } }))
    await expect(readBundleZip(new Blob([await z2.generateAsync({ type: 'arraybuffer' })]))).rejects.toThrow(/Schema-Version 99/)
  })
})
