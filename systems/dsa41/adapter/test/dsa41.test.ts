import { describe, expect, it } from 'vitest'
import { actorsOf, FOUNDRY_ID_PATTERN, journalsOf } from '../../../../packages/core/src/index.ts'
import * as dsa41 from '../src/index.ts'
import { combatOf, dsa41Adapter } from '../src/index.ts'
import { build } from '../../../../packages/core/test/helpers.ts'

const SHAHANE = `name: Shahane ay Zedrakin
rolle: Proviantmeisterin
eigenschaften: { MU: 14, KL: 14, IN: 15, CH: 13, FF: 12, GE: 13, KO: 13, KK: 11 }
SO: 6
LeP: 36
AuP: 37
MR: 6
RS: 0
WS: 6
GS: 8
INI: 12+1W6
waffen:
  - { name: Säbel, INI: 12, AT: 16, PA: 18, TP: 1W6+3, DK: N }
  - { name: Orchidee, AT: 17, PA: 15, TP: 1W6+1, DK: H }
vorteile: [Soziale Anpassungsfähigkeit]
nachteile: { Brünstigkeit: 6, Eitelkeit: 7, Neid: 8 }
sonderfertigkeiten: [Aufmerksamkeit, Ausweichen I, Ausweichen II, Improvisierte Waffen, Finte]
talente: { Selbstbeherrschung: 7, Sinnenschärfe: 10, Menschenkenntnis: 18, Überreden: 17 }
notiz: Paktgeschenke – Brünstigkeit erzeugen, Lamijah`

const parse = (s: string) => dsa41.parseNscBlock(s)
const levels = (s: string, level = 'error') => parse(s).issues.filter((i) => i.level === level).map((i) => i.message)

describe('dsa-nsc: Parsen und Validieren', () => {
  it('liest Shahane vollständig', () => {
    const r = parse(SHAHANE)
    expect(levels(SHAHANE)).toEqual([])
    expect(levels(SHAHANE, 'warning')).toEqual([])
    const d = r.data!
    expect(d.attributes).toEqual({ MU: 14, KL: 14, IN: 15, CH: 13, FF: 12, GE: 13, KO: 13, KK: 11 })
    expect(d.INI).toBe(12)
    expect(d.waffen[0]).toEqual({ name: 'Säbel', INI: 12, AT: 16, PA: 18, TP: '1W6+3', DK: 'N' })
    expect(d.nachteile).toEqual([
      { name: 'Brünstigkeit', value: 6 }, { name: 'Eitelkeit', value: 7 }, { name: 'Neid', value: 8 },
    ])
    expect(r.issues.some((i) => i.level === 'info' && /Würfel/.test(i.message))).toBe(true)
  })

  it('Fehler: unbekannter Schlüssel, „KK: 1a“, fehlender Name', () => {
    expect(levels('name: X\nKraft: 3')).toEqual([expect.stringContaining('Unbekannter Schlüssel „Kraft“')])
    expect(levels('name: X\neigenschaften: { KK: 1a }')).toEqual(['KK: „1a“ ist keine ganze Zahl.'])
    expect(levels('LeP: 30')).toEqual([expect.stringContaining('„name“ fehlt')])
    expect(parse('LeP: 30').data).toBeNull()
  })

  it('YAML-Fehler mit Zeilennummer', () => {
    const msgs = levels('name: X\nwaffen: [ { name: Säbel')
    expect(msgs[0]).toMatch(/^YAML-Fehler in Zeile \d/)
  })

  it('unbekanntes Talent ist Warnung mit Vorschlag', () => {
    const w = levels('name: X\ntalente: { Sinnenscharfe: 5 }', 'warning')
    expect(w[0]).toContain('„Sinnenscharfe“ steht in keinem dsa-41-Kompendium (meintest du „Sinnenschärfe“')
  })

  it('Abkürzungen und Listen-Schreibweisen', () => {
    const r = parse('name: X\nLE: 30\nAU: 28\nMU: 12\nnachteile: [Neid 8, "Goldgier 5"]\nSF: [Finte]')
    expect(r.data).toMatchObject({ LeP: 30, AuP: 28, attributes: { MU: 12 }, nachteile: [{ name: 'Neid', value: 8 }, { name: 'Goldgier', value: 5 }] })
    expect(r.data!.sonderfertigkeiten).toEqual([{ name: 'Finte', value: null }])
    expect(levels('name: X\nLE: 1\nLeP: 2')).toEqual([expect.stringContaining('doppelt')])
  })

  it('eigene Einträge', () => {
    const r = parse(`name: Schattenweber
zauber:
  Blitz dich find: 16
  Schattenschleier: { ZfW: 12, probe: MU/IN/CH, kosten: 8 AsP, wirkung: Hüllt in Schatten }
waffen:
  - { name: Mandragora-Dolch, talent: Dolche, TP: 1W6+1, DK: H, WM: 0/-1, AT: 17, PA: 15 }`)
    expect(r.issues.filter((i) => i.level !== 'info')).toEqual([])
    expect(r.data!.zauber[1]).toEqual({ name: 'Schattenschleier', value: 12, custom: { probe: ['MU', 'IN', 'CH'], kosten: '8 AsP', wirkung: 'Hüllt in Schatten' } })
    expect(r.data!.waffen[0].WM).toEqual([0, -1])
  })

  it('unbekannte Waffe ohne Talent warnt, falsches Talent ist Fehler, DK/TP geprüft', () => {
    expect(levels('name: X\nwaffen: [{ name: Klingenfächer }]', 'warning')[0]).toContain('gib „talent:“ an')
    expect(levels('name: X\nwaffen: [{ name: Säbel, talent: Säbelchen }]')[0]).toContain('Kampftalent „Säbelchen“ gibt es nicht')
    expect(levels('name: X\nwaffen: [{ name: Säbel, DK: X }]')[0]).toContain('DK „X“ ungültig')
    expect(levels('name: X\nwaffen: [{ name: Säbel, TP: viel }]', 'warning')[0]).toContain('TP „viel“')
  })

  it('YAML-Duplikate werden gemeldet', () => {
    expect(levels('name: X\nname: Y')[0]).toMatch(/^YAML-Fehler in Zeile 2/)
  })
})

describe('Rechenwerte', () => {
  it('wie das System gerechnet, überschriebene Werte erkannt', () => {
    const d = parse(SHAHANE).data!
    expect(dsa41.computeDerived(d)).toEqual({ atBasis: 8, paBasis: 8, fkBasis: 8, INI: 11, MR: 8, WS: 7, GS: 8, ausweichen: 14 })
    expect(dsa41.overrides(d)).toEqual([
      { key: 'MR', label: 'MR', given: 6, calculated: 8 },
      { key: 'INI', label: 'INI', given: 12, calculated: 11 },
      { key: 'WS', label: 'WS', given: 6, calculated: 7 },
    ])
  })

  it('Wertekasten zeigt „gerechnet“ nur in Obsidian', () => {
    const block = parse(SHAHANE)
    const obs = dsa41Adapter.renderStatblock(block, { showIssues: true, showCalculated: true })
    expect(obs).toContain('<b>MR</b> 6 <span class="vtf-nsc-calc" title="vom System berechnet">(gerechnet 8)</span>')
    expect(obs).toContain('<td>Orchidee <span class="vtf-nsc-calc">(Raufen)</span></td>')
    const journal = dsa41Adapter.renderStatblock(block, { actorUuid: 'Actor.abc' })
    expect(journal).not.toContain('gerechnet')
    expect(journal).toContain('@UUID[Actor.abc]{Zum Charakter}')
  })

  it('Wertekasten zeigt TP/KK nur, wenn eine Waffe es angibt', () => {
    const html = dsa41Adapter.renderStatblock(parse('name: X\nwaffen:\n  - { name: Dreizack, KK: 13/3 }\n  - { name: Dolch }'), {})
    expect(html).toContain('<th>TP</th><th>TP/KK</th><th>DK</th>')
    expect(html).toContain('<td>13/3</td>')
    expect(html.match(/<td><\/td><td>[A-Z]*<\/td><\/tr>/g)).toHaveLength(1) // Dolch: leere TP/KK-Zelle
    const without = dsa41Adapter.renderStatblock(parse('name: X\nwaffen:\n  - { name: Dolch }'), {})
    expect(without).not.toContain('TP/KK')
    expect(without).toContain('<th>TP</th><th>DK</th>')
  })

  it('Fehler im Wertekasten', () => {
    const html = dsa41Adapter.renderStatblock(parse('name: X\nKK: 1a'), { showIssues: true })
    expect(html).toContain('<li class="vtf-nsc-error">✖ KK: „1a“ ist keine ganze Zahl.</li>')
  })
})

describe('Umwandlung in Actor-Daten', () => {
  const ctx = {
    actorId: 'AAAAAAAAAAAAAAAA', sourcePath: 'NPC/S.md', journalId: 'JJJJJJJJJJJJJJJJ', journalName: 'Shahane',
    resolveImage: (r: string) => `assets/${r}`, nearbyImages: { portrait: 'p.jpg', token: 'token_s.png' }, linkedDefault: true,
  }
  const actor = dsa41.nscToActor(parse(SHAHANE).data!, ctx)

  it('Basiswerte mit Feldpfaden', () => {
    expect(actor.data).toMatchObject({
      'base.basicAttributes.courage.value': 14,
      'base.basicAttributes.strength.value': 11,
      'base.resources.vitality.max': 36,
      'base.resources.endurance.max': 37,
      'settings.autoCalcMagicResistance': false,
      'base.combatAttributes.passive.magicResistance.value': 6,
      'settings.autoCalcInitiative': false,
      'base.combatAttributes.active.baseInitiative.value': 12,
      'settings.autoCalcWoundThresholds': false,
      'base.combatAttributes.passive.woundThresholds.second': 12,
      'settings.autoCalcDodge': true,
      'modifiers.additionalRS': 0,
      'background.social.socialStatus.value': 6,
      'background.profession': 'Proviantmeisterin',
    })
    expect(actor.data['background.description']).toContain('@UUID[JournalEntry.JJJJJJJJJJJJJJJJ]{Shahane}')
    expect(actor.dataOnCreate).toEqual({ 'base.resources.vitality.value': 36, 'base.resources.endurance.value': 37 })
    expect(actor.data).not.toHaveProperty('settings.hasAstralEnergy')
  })

  it('Items aus dem Katalog mit Werten', () => {
    const by = (n: string) => actor.items.find((i) => i.name === n)!
    expect(by('Sinnenschärfe')).toMatchObject({ types: ['talent'], source: { pack: 'talent', sid: 'talent-sinnenschaerfe' }, system: { value: 10 } })
    expect(by('Neid')).toMatchObject({ types: ['disadvantage'], system: { value: 8 } })
    expect(by('Finte')).toMatchObject({ types: ['specialAbility'], source: { sid: 'ability-finte' } })
    expect(by('Säbel')).toMatchObject({ types: ['meleeWeapon'], source: { pack: 'meleeweapon' }, system: { damage: '1d6+3', distanceClass: 'N' }, extra: { combat: { talentSid: 'talent-saebel', AT: 16, PA: 18, INI: 12 } } })
    expect(combatOf(by('Orchidee'))!.talentSid).toBe('talent-raufen')
    // combat talents needed by the weapons are added
    expect(actor.items.filter((i) => i.types[0] === 'combatTalent').map((i) => i.name).sort()).toEqual(['Raufen', 'Säbel'])
    actor.items.forEach((i) => expect(i.id).toMatch(FOUNDRY_ID_PATTERN))
    expect(new Set(actor.items.map((i) => i.id)).size).toBe(actor.items.length)
  })

  it('Bilder und Verknüpfung', () => {
    expect(actor).toMatchObject({ img: 'assets/p.jpg', tokenImg: 'assets/token_s.png', linked: true })
  })

  it('eigene Einträge bekommen ein vollständiges Ersatz-Item', () => {
    const a = dsa41.nscToActor(
      parse('name: S\nzauber: { Schattenschleier: { ZfW: 12, probe: MU/IN/CH, wirkung: Schatten } }\ntalente: { Sternkunde: { TaW: 8, kategorie: Wissen } }\nwaffen: [{ name: Mandragora-Dolch, talent: Dolche, TP: 1W+1, AT: 17, PA: 15 }]').data!,
      ctx
    )
    const z = a.items.find((i) => i.name === 'Schattenschleier')!
    expect(z.source).toBeUndefined()
    expect(z.fallback).toEqual({
      type: 'spell',
      system: { description: '<p><b>Wirkung:</b> Schatten</p>', 'test.firstAttribute': 'courage', 'test.secondAttribute': 'intuition', 'test.thirdAttribute': 'charisma', value: 12, effect: 'Schatten' },
    })
    expect(a.items.find((i) => i.name === 'Sternkunde')!.fallback.system).toMatchObject({ value: 8, category: 'knowledge' })
    const dolch = a.items.find((i) => i.name === 'Mandragora-Dolch')!
    expect(dolch.fallback).toEqual({ type: 'meleeWeapon', system: { talent: 'talent-dolche', damage: '1d6+1', distanceClass: 'N' } })
    expect(dolch.system.talent).toBe('talent-dolche')
  })

  it('Waffe ohne AT/PA: Talent aus der Liste, sonst untrainiert (0 statt -1)', () => {
    const a = dsa41.nscToActor(parse('name: S\nwaffen: [Säbel, Kurzbogen]\ntalente: { Säbel: 12 }').data!, ctx)
    expect(a.items.find((i) => i.name === 'Säbel' && i.types[0] === 'combatTalent')!.system).toEqual({ value: 12, 'combat.attack': 6, 'combat.parry': 6 })
    expect(a.items.find((i) => i.name === 'Bogen')!.system).toEqual({ value: 0, 'combat.rangedAttack': 0 })
    expect(a.items.find((i) => i.name === 'Säbel' && i.types[0] === 'meleeWeapon')!.extra?.combat).toEqual({ talentSid: 'talent-saebel', AT: undefined, PA: undefined, FK: undefined, INI: undefined })
  })

  it('Kampftalent ohne Waffe: TaW wird aufgeteilt', () => {
    const a = dsa41.nscToActor(parse('name: S\ntalente: { Säbel: 9, Bogen: 7 }').data!, ctx)
    expect(a.items.find((i) => i.name === 'Säbel')!.system).toEqual({ value: 9, 'combat.attack': 5, 'combat.parry': 4 })
    expect(a.items.find((i) => i.name === 'Bogen')!.system).toEqual({ value: 7, 'combat.rangedAttack': 7 })
  })
})

describe('Bundle mit NSCs', () => {
  const notes = {
    'NPC/Besatzung/Shahane ay Zedrakin.md': `## Proviantmeisterin\n![[c581.jpg]]\n![[token_Shahane.png]]\n\nText\n\n\`\`\`dsa-nsc\n${SHAHANE}\n\`\`\``,
    'Abenteuer/Sabotage.md': [
      '```dsa-nsc\nname: Die Viper\nLeP: 38\n```', '![[token_viper.png]]',
      '```dsa-nsc\nname: Schattenweber\nLeP: 26\nAsP: 64\n```', '![[token_mage.png]]',
      '```dsa-nsc\nname: Kaputt\nKK: 1a\n```',
    ].join('\n\n'),
    'Start.md': 'Siehe [[Sabotage#Die Viper]] und [[Shahane ay Zedrakin]].',
  }
  const files = ['c581.jpg', 'token_Shahane.png', 'token_viper.png', 'token_mage.png']
  const run = () => build(notes, files, { system: dsa41Adapter })

  it('jeder Block wird ein Actor im passenden Ordner', () => {
    const { bundle } = run()
    const actors = actorsOf(bundle)
    expect(actors.map((a) => a.name)).toEqual(['Die Viper', 'Schattenweber', 'Kaputt', 'Shahane ay Zedrakin'])
    const folder = bundle.folders.find((f) => f.id === actors[3].folder)!
    expect(folder).toMatchObject({ type: 'Actor', name: 'Besatzung' })
    expect(bundle.system).toBe('dsa-41')
  })

  it('Bilder pro Block, Verknüpfung nur bei Einzel-NSC', () => {
    const actors = actorsOf(run().bundle)
    const by = (n: string) => actors.find((a) => a.name === n)!
    expect(by('Shahane ay Zedrakin')).toMatchObject({ img: expect.stringContaining('c581.jpg'), tokenImg: expect.stringContaining('token_Shahane.png'), linked: true })
    expect(by('Die Viper').tokenImg).toContain('token_viper.png')
    expect(by('Schattenweber').tokenImg).toContain('token_mage.png')
    expect(by('Die Viper').linked).toBe(false)
    expect(by('Schattenweber').data['settings.hasAstralEnergy']).toBe(true)
  })

  it('Journal zeigt Wertekasten mit Link, [[Notiz#NSC]] verlinkt den Actor', () => {
    const { bundle } = run()
    const viper = actorsOf(bundle).find((a) => a.name === 'Die Viper')!
    const sab = journalsOf(bundle).find((j) => j.name === 'Sabotage')!.pages[0].html!
    expect(sab).toContain(`@UUID[Actor.${viper.id}]{Zum Charakter}`)
    expect(sab).not.toContain('```')
    const start = journalsOf(bundle).find((j) => j.name === 'Start')!.pages[0].html!
    expect(start).toContain(`@UUID[Actor.${viper.id}]{Die Viper}`)
  })

  it('Fehler und Warnungen landen im Bericht, IDs sind stabil', () => {
    const a = run()
    expect(a.bundle.warnings).toContainEqual(expect.objectContaining({ code: 'nsc-error', sourcePath: 'Abenteuer/Sabotage.md', message: 'NSC „Kaputt“: KK: „1a“ ist keine ganze Zahl.' }))
    const b = run()
    expect(actorsOf(b.bundle).map((x) => [x.id, x.hash])).toEqual(actorsOf(a.bundle).map((x) => [x.id, x.hash]))
    expect(a.idMap['Abenteuer/Sabotage.md#Die Viper']).toBe(actorsOf(a.bundle)[0].id)
  })

  it('Bild aus dem Netz wird direkt verwendet', () => {
    const { bundle } = build({ 'D.md': '![Bild](https://example.org/d.jpg)\n```dsa-nsc\nname: D\n```' }, [], { system: dsa41Adapter })
    expect(actorsOf(bundle)[0].img).toBe('https://example.org/d.jpg')
    expect(bundle.warnings).toEqual([])
  })

  it('ohne System-Adapter bleibt der Block ein Codeblock', () => {
    const { bundle } = build(notes, files)
    expect(actorsOf(bundle)).toEqual([])
    expect(journalsOf(bundle).find((j) => j.name === 'Sabotage')!.pages[0].html).toContain('language-dsa-nsc')
  })
})

describe('Kurzformen', () => {
  it('eindeutige Kurzform wird erkannt und gemeldet', () => {
    const r = parse('name: X\nzauber: { Gardianum: 12, Fulminictus: 10 }')
    expect(r.issues.filter((i) => i.level === 'warning')).toEqual([])
    expect(r.issues.filter((i) => i.level === 'info').map((i) => i.message)).toEqual([
      'Zauber „Gardianum“ als „Gardianum Zauberschild“ erkannt.',
      'Zauber „Fulminictus“ als „Fulminictus Donnerkeil“ erkannt.',
    ])
    const a = dsa41.nscToActor(r.data!, { actorId: 'AAAAAAAAAAAAAAAA', sourcePath: 'x', journalName: 'x', resolveImage: () => null, nearbyImages: {}, linkedDefault: true })
    expect(a.items.map((i) => i.name)).toEqual(['Gardianum Zauberschild', 'Fulminictus Donnerkeil'])
  })
  it('mehrdeutige Kurzform bleibt unbekannt', () => {
    expect(parse('name: X\nsonderfertigkeiten: [Ausweichen]').issues.some((i) => i.level === 'warning')).toBe(true)
  })
})

describe('SF-Voraussetzungen', () => {
  it('fehlende Voraussetzungen sind Warnungen im Wertekasten', () => {
    const r = parse('name: X\neigenschaften: { MU: 12, KL: 12, IN: 11, CH: 12, FF: 12, GE: 14, KO: 12, KK: 11 }\nsonderfertigkeiten: [Ausweichen II, Todesstoß, Aufmerksamkeit]')
    const w = r.issues.filter((i) => i.level === 'warning').map((i) => i.message)
    expect(w).toContain('Voraussetzung fehlt: Ausweichen II braucht SF Ausweichen I.')
    expect(w).toContain('Voraussetzung fehlt: Todesstoß braucht MU 15, SF Gezielter Stich.')
    expect(w).toContain('Voraussetzung fehlt: Aufmerksamkeit braucht IN 12.')
  })
  it('Basiswerte und Talentwerte', () => {
    expect(dsa41.checkSfPrerequisites(parse('name: X\neigenschaften: { MU: 10, KL: 10, IN: 10, CH: 10, FF: 13, GE: 10, KO: 10, KK: 10 }\nsonderfertigkeiten: [Kampfreflexe, Geschützmeister]\ntalente: { Belagerungswaffen: 12, Mechanik: 3 }').data!))
      .toEqual(['Kampfreflexe braucht INI-Basis 10', 'Geschützmeister braucht TaW Mechanik 7'])
  })
  it('die 24 umgewandelten NSCs (Shahane) erfüllen alles', () => {
    expect(dsa41.checkSfPrerequisites(parse(SHAHANE).data!)).toEqual([])
  })
})
