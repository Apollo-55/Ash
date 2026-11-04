import { describe, expect, it } from 'vitest'
import { actorsOf, journalsOf, leafletToPixel, parseLeafletBlock, parseSceneBlock, scenesOf } from '../src/index.ts'
// integration test: NPC tokens on scenes need a real game system
import { dsa41Adapter } from '../../../systems/dsa41/adapter/src/index.ts'
import { build } from './helpers.ts'

const errors = (s: string) => parseSceneBlock(s).issues.filter((i) => i.level === 'error').map((i) => i.message)

describe('szene-Block', () => {
  it('liest alle Schlüssel', () => {
    const r = parseSceneBlock('name: Deck\nkarte: "[[deck.webp]]"\nraster: { typ: hex, größe: 140, schritt: 2 }\nnscs: ["[[#Die Viper]]", "[[Sabotage#Vollstrecker]]"]\nlicht: nacht\nnebel: ja\nnavigation: nein')
    expect(r.issues).toEqual([])
    expect(r.data).toEqual({
      name: 'Deck', karte: '[[deck.webp]]', grid: { type: 'hex', size: 140, distance: 2, units: 'Schritt' },
      nscs: ['[[#Die Viper]]', '[[Sabotage#Vollstrecker]]'], licht: 'nacht', nebel: true, navigation: false,
    })
  })

  it('unzitierte Wikilinks (YAML-Listen) werden verstanden', () => {
    const r = parseSceneBlock('karte: [[deck.webp]]\nnscs: [[Hafenwache]]')
    expect(r.data).toMatchObject({ karte: '[[deck.webp]]', nscs: ['[[Hafenwache]]'] })
  })

  it('Standardwerte', () => {
    expect(parseSceneBlock('leaflet: süd-map').data).toEqual({ leaflet: 'süd-map', nscs: [], licht: 'tag', nebel: false, navigation: true })
    expect(parseSceneBlock('karte: a.png\nraster: keins').data!.grid!.type).toBe('none')
  })

  it('Fehler', () => {
    expect(errors('name: X')).toEqual(['Es fehlt „karte:“ oder „leaflet:“ – ohne Bild keine Szene.'])
    expect(errors('karte: a.png\nleaflet: x')[0]).toContain('nicht beides')
    expect(errors('karte: a.png\nlicht: mittag')[0]).toContain('licht: „mittag“ ungültig')
    expect(errors('karte: a.png\nraster: { größe: 20 }')[0]).toContain('50 bis 1000')
    expect(errors('karte: a.png\nfarbe: rot')[0]).toContain('Unbekannter Schlüssel „farbe“')
    expect(errors('karte: a.png\nnscs: [Viper]')[0]).toContain('kein Link')
  })
})

describe('Leaflet', () => {
  it('liest id, Bild, maxZoom', () => {
    expect(parseLeafletBlock('id: süd-map\nimage: [[Südaventurien.png]]')).toEqual({ id: 'süd-map', images: ['[[Südaventurien.png]]'], maxZoom: 10, hasBounds: false })
    expect(parseLeafletBlock('id: x\nmaxZoom: 8\nimage:\n  - [[a.png]]\n  - [[b.png]]')).toMatchObject({ images: ['[[a.png]]', '[[b.png]]'], maxZoom: 8 })
  })
  it('rechnet Marker in Pixel um (wie das Leaflet-Plugin: unproject mit maxZoom-1)', () => {
    expect(leafletToPixel([-1.0364583432674408, 4.636393308639526], 10)).toEqual({ x: 2374, y: 531 })
    expect(leafletToPixel([-3.0703125, 3.3828125], 10)).toEqual({ x: 1732, y: 1572 })
  })
})

describe('Szenen im Bundle', () => {
  const notes = {
    'Abenteuer/Sabotage.md': [
      '```dsa-nsc\nname: Die Viper\n```', '```dsa-nsc\nname: Vollstrecker\n```',
      '```szene\nname: Deck\nkarte: "[[deck.webp]]"\nnscs: ["[[#Die Viper]]", "[[Sabotage#Vollstrecker]]", "[[#Niemand]]"]\nlicht: nacht\nnebel: ja\n```',
    ].join('\n\n'),
    'Uthuria/Encounter.md': '```leaflet\nid: süd-map\nimage: [[Südaventurien.png]]\n```',
    'Uthuria/Reise.md': '```szene\nname: Südaventurien\nleaflet: süd-map\n```',
    'Uthuria/Die Singenden Inseln.md': 'Insel',
    'Start.md': '[[Sabotage#Deck]]',
  }
  const files = ['deck.webp', 'Maps/Südaventurien.png']
  const markers = { 'süd-map': [
    { loc: [-1.036, 4.636] as [number, number], link: 'Sabotage' },
    { loc: [-3.07, 3.38] as [number, number], link: 'Die Singenden Inseln' },
    { loc: [-2, 2] as [number, number], link: null },
    { loc: [-2, 2] as [number, number], link: 'A193 - An fremden Gestaden' },
  ] }
  const run = () => build(notes, files, { system: dsa41Adapter, leafletMarkers: markers })

  it('Szene mit Karte, Raster-Standard, Tokens und Journal', () => {
    const { bundle } = run()
    const deck = scenesOf(bundle).find((s) => s.name === 'Deck')!
    const sab = journalsOf(bundle).find((j) => j.name === 'Sabotage')!
    const actors = actorsOf(bundle)
    expect(deck).toMatchObject({
      img: 'vault-to-foundry/test_vault/assets/deck.webp', grid: { type: 'square', size: 100, distance: 1, units: 'Schritt' },
      journal: sab.id, lighting: 'nacht', fog: true, navigation: true, pins: [],
      tokens: [actors.find((a) => a.name === 'Die Viper')!.id, actors.find((a) => a.name === 'Vollstrecker')!.id],
    })
    expect(bundle.folders.find((f) => f.id === deck.folder)).toMatchObject({ type: 'Scene', name: 'Abenteuer' })
    expect(bundle.warnings).toContainEqual(expect.objectContaining({ code: 'scene-warning', message: 'Szene „Deck“: NSC [[#Niemand]]: kein Block mit diesem Namen.' }))
  })

  it('Leaflet-Szene: Bild aus dem Leaflet-Block, Marker als Pins, ohne Raster', () => {
    const { bundle } = run()
    const s = scenesOf(bundle).find((x) => x.name === 'Südaventurien')!
    expect(s.img).toBe('vault-to-foundry/test_vault/assets/Maps/Suedaventurien.png')
    expect(s.grid.type).toBe('none')
    const inseln = journalsOf(bundle).find((j) => j.name === 'Die Singenden Inseln')!
    expect(s.pins.map((p) => ({ ...p, id: undefined }))).toEqual([
      { id: undefined, x: 2374, y: 530, label: 'Sabotage', entryId: journalsOf(bundle).find((j) => j.name === 'Sabotage')!.id },
      { id: undefined, x: 1731, y: 1572, label: 'Die Singenden Inseln', entryId: inseln.id },
    ])
    expect(bundle.warnings.filter((w) => w.message.startsWith('Szene „Südaventurien“')).map((w) => w.message)).toEqual([
      'Szene „Südaventurien“: Leaflet-Marker „A193 - An fremden Gestaden“: Ziel wird nicht exportiert, kein Pin.',
      'Szene „Südaventurien“: 1 Leaflet-Marker ohne Link übersprungen.',
    ])
  })

  it('Journal zeigt Szenen-Karte, [[Notiz#Szene]] verlinkt die Szene, IDs stabil', () => {
    const a = run()
    const deck = scenesOf(a.bundle).find((s) => s.name === 'Deck')!
    const sab = journalsOf(a.bundle).find((j) => j.name === 'Sabotage')!.pages[0].html!
    expect(sab).toContain(`@UUID[Scene.${deck.id}]{Szene öffnen}`)
    expect(sab).toContain('<img class="vtf-scene-preview" src="vault-to-foundry/test_vault/assets/deck.webp"')
    expect(journalsOf(a.bundle).find((j) => j.name === 'Start')!.pages[0].html).toContain(`@UUID[Scene.${deck.id}]{Deck}`)
    expect(scenesOf(run().bundle).map((s) => [s.id, s.hash])).toEqual(scenesOf(a.bundle).map((s) => [s.id, s.hash]))
  })

  it('fehlendes Bild oder unbekannte Leaflet-Karte → Szene übersprungen mit Fehler', () => {
    const { bundle } = build({ 'A.md': '```szene\nkarte: fehlt.png\n```\n```szene\nname: L\nleaflet: gibtsnicht\n```' }, [])
    expect(scenesOf(bundle)).toEqual([])
    expect(bundle.warnings.map((w) => w.message)).toEqual([
      'Szene „A“: Kartenbild nicht gefunden – Szene übersprungen.',
      'Szene „L“: Leaflet-Karte „gibtsnicht“ nicht gefunden – Szene übersprungen.',
    ])
  })
})
