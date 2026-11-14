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

  it('Wertekasten zeigt Schilde mit WM/INI aus Block oder Katalog, BF nur aus dem Block', () => {
    const render = (s: string) => dsa41Adapter.renderStatblock(parse(s), {})
    expect(render('name: X\nschilde: [Großschild]')).toContain('<p class="vtf-nsc-list"><b>Schilde:</b> Großschild (WM -2/+5, INI -2)</p>')
    expect(render('name: X\nschilde: [{ name: Großschild, WM: -1/4, INI: 0, BF: 3 }]')).toContain('<b>Schilde:</b> Großschild (WM -1/+4, INI 0, BF 3)</p>')
    expect(render('name: X\nschilde: [Buckler]')).toContain('<b>Parierwaffen:</b> Buckler (WM 0/+1)</p>')
    expect(render('name: X\nschilde: [Großschild, Linkhand]')).toContain('<b>Schilde/Parierwaffen:</b> Großschild (Schild, WM -2/+5, INI -2), Linkhand (Parierwaffe, WM 0/+2, INI +1)</p>')
    expect(render('name: X\nschilde: [{ name: Buckler, typ: Schild }]')).toContain('<b>Schilde:</b> Buckler (WM 0/+1)</p>')
    expect(render('name: X\nschilde: [Knochenschild]')).toContain('<b>Schilde:</b> Knochenschild</p>')
    expect(render('name: X\nrüstung: [Lederharnisch]')).not.toContain('Schilde')
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

describe('TP/KK der Waffen', () => {
  const ctx = { actorId: 'AAAAAAAAAAAAAAAA', sourcePath: 'NPC/X.md', journalName: 'X', resolveImage: () => null, nearbyImages: {}, linkedDefault: false }
  const block = (kk: string, name = 'Dreizack') => parse(`name: X\nwaffen:\n  - { name: ${name}, KK: ${kk} }`)
  const kkOf = (kk: string) => block(kk).data!.waffen[0].KK
  const errors = (kk: string) => block(kk).issues.filter((i) => i.level === 'error').map((i) => i.message)

  it('liest „Schwelle/Schritt“ als Text und als Liste', () => {
    expect(kkOf('13/3')).toEqual([13, 3])
    expect(kkOf('" 13 / 3 "')).toEqual([13, 3])
    expect(kkOf('[13, 3]')).toEqual([13, 3])
    expect(errors('13/3')).toEqual([])
  })

  it('Schlüssel ohne Rücksicht auf Groß-/Kleinschreibung', () => {
    expect(parse('name: X\nwaffen:\n  - { name: Dreizack, kk: 13/3 }').data!.waffen[0].KK).toEqual([13, 3])
  })

  it('meldet unlesbare Werte und übernimmt sie nicht', () => {
    for (const bad of ['13', 'stark', '[13]', '[13, 3, 1]', '[13, x]', '{ a: 1 }']) {
      expect(kkOf(bad), bad).toBeUndefined()
      expect(errors(bad).join(' '), bad).toContain('ungültig (z. B. 10/2)')
    }
  })

  it('lehnt negative Werte ab – als Liste und als Text', () => {
    for (const bad of ['[-13, 3]', '[13, -3]', '-13/3', '13/-3']) {
      expect(kkOf(bad), bad).toBeUndefined()
      expect(errors(bad).join(' '), bad).toContain('ungültig')
    }
  })

  it('schreibt Schwelle und Schritt auf die Nahkampfwaffe', () => {
    // dsa-41: Dreizack TP/KK 13/3 → strengthMod.threshold 13, strengthMod.hitPointStep 3
    const a = dsa41.nscToActor(block('14/2').data!, ctx)
    expect(a.items.find((i) => i.name === 'Dreizack')!.system).toMatchObject({ 'strengthMod.threshold': 14, 'strengthMod.hitPointStep': 2 })
  })

  it('gilt auch für Waffen, die in keinem Kompendium stehen', () => {
    const a = dsa41.nscToActor(parse('name: X\nwaffen:\n  - { name: Knochenkeule, talent: Hiebwaffen, KK: 12/3 }').data!, ctx)
    expect(a.items.find((i) => i.name === 'Knochenkeule')!.system).toMatchObject({ 'strengthMod.threshold': 12, 'strengthMod.hitPointStep': 3 })
  })

  it('ohne Angabe bleibt der Wert des Kompendiums unberührt', () => {
    const a = dsa41.nscToActor(parse('name: X\nwaffen: [Dreizack]').data!, ctx)
    const system = a.items.find((i) => i.name === 'Dreizack')!.system
    expect(Object.keys(system).filter((k) => k.startsWith('strengthMod'))).toEqual([])
  })

  it('Fernkampfwaffen bekommen kein TP/KK', () => {
    const a = dsa41.nscToActor(block('13/3', 'Kurzbogen').data!, ctx)
    const system = a.items.find((i) => i.name === 'Kurzbogen')!.system
    expect(Object.keys(system).filter((k) => k.startsWith('strengthMod'))).toEqual([])
  })
})

describe('BF der Waffen', () => {
  const ctx = { actorId: 'AAAAAAAAAAAAAAAA', sourcePath: 'NPC/X.md', journalName: 'X', resolveImage: () => null, nearbyImages: {}, linkedDefault: false }
  const block = (bf: string, name = 'Dreizack') => parse(`name: X\nwaffen:\n  - { name: ${name}, BF: ${bf} }`)
  const systemOf = (b: ReturnType<typeof parse>, name: string) => dsa41.nscToActor(b.data!, ctx).items.find((i) => i.name === name)!.system

  it('liest ganze Zahlen, auch 0 und negative', () => {
    for (const [text, value] of [['3', 3], ['0', 0], ['-2', -2], ['"4"', 4]] as const) {
      const b = block(text)
      expect(b.data!.waffen[0].BF, text).toBe(value)
      expect(b.issues, text).toEqual([])
    }
    expect(parse('name: X\nwaffen:\n  - { name: Dreizack, bf: 3 }').data!.waffen[0].BF).toBe(3)
  })

  it('meldet alles andere und übernimmt es nicht', () => {
    for (const bad of ['hoch', '2.5', '[1, 2]']) {
      const b = block(bad)
      expect(b.data!.waffen[0].BF, bad).toBeUndefined()
      expect(b.issues.map((i) => `${i.level}: ${i.message}`).join(' '), bad).toContain('error: Waffe: BF')
    }
  })

  it('schreibt den Bruchfaktor auf die Nahkampfwaffe – auch 0 und bei eigenen Waffen', () => {
    expect(systemOf(block('5'), 'Dreizack')).toMatchObject({ breakingFactor: 5 })
    expect(systemOf(block('0'), 'Dreizack')).toMatchObject({ breakingFactor: 0 })
    const own = parse('name: X\nwaffen:\n  - { name: Knochenkeule, talent: Hiebwaffen, BF: -1 }')
    expect(systemOf(own, 'Knochenkeule')).toMatchObject({ breakingFactor: -1 })
  })

  it('ohne Angabe bleibt der Wert des Kompendiums unberührt', () => {
    expect(systemOf(parse('name: X\nwaffen: [Dreizack]'), 'Dreizack')).not.toHaveProperty('breakingFactor')
  })

  it('Fernkampfwaffen: Warnung, kein Bruchfaktor', () => {
    const b = block('3', 'Kurzbogen')
    expect(b.issues).toEqual([{ level: 'warning', message: 'Waffe „Kurzbogen“ ist eine Fernkampfwaffe, BF wird ignoriert.' }])
    expect(systemOf(b, 'Kurzbogen')).not.toHaveProperty('breakingFactor')
  })

  it('Wertekasten zeigt BF nur, wenn eine Waffe es angibt', () => {
    const html = dsa41Adapter.renderStatblock(parse('name: X\nwaffen:\n  - { name: Dreizack, KK: 13/3, BF: 0 }\n  - Dolch'), {})
    expect(html).toContain('<th>TP</th><th>TP/KK</th><th>BF</th><th>DK</th>')
    expect(html).toContain('<td>13/3</td><td>0</td>')
    const only = dsa41Adapter.renderStatblock(block('4'), {})
    expect(only).toContain('<th>TP</th><th>BF</th><th>DK</th>')
    expect(only).toContain('<td>4</td>')
    expect(dsa41Adapter.renderStatblock(parse('name: X\nwaffen: [Dolch]'), {})).not.toContain('<th>BF</th>')
  })
})

// Reichweiten der Fernkampfwaffen: im Block „RW: (5/15/25/40/60) --> (1/1/0/0/-1)“ –
// links die Reichweiten in Schritt, rechts TP+ je Entfernungsklasse (sehr nah / nah / mittel / weit / sehr weit).
// dsa-41 speichert sie unter system.ranges.* und system.bonusDamages.* mit veryClose, close, medium, far, veryFar.
describe('Reichweiten der Fernkampfwaffen', () => {
  const ctx = { actorId: 'AAAAAAAAAAAAAAAA', sourcePath: 'NPC/X.md', journalName: 'X', resolveImage: () => null, nearbyImages: {}, linkedDefault: false }
  const KURZBOGEN = [[5, 1], [15, 1], [25, 0], [40, 0], [60, -1]]
  const block = (rw: string, name = 'Kurzbogen') => parse(`name: X\nwaffen:\n  - { name: ${name}, RW: ${rw} }`)
  const rwOf = (rw: string) => block(rw).data!.waffen[0].RW
  const errors = (rw: string) => block(rw).issues.filter((i) => i.level === 'error').map((i) => i.message)
  const itemOf = (b: ReturnType<typeof parse>, name: string) => dsa41.nscToActor(b.data!, ctx).items.find((i) => i.name === name)!
  const rangeKeys = (system: Record<string, unknown>) => Object.keys(system).filter((k) => k.startsWith('ranges') || k.startsWith('bonusDamages'))

  describe('Block lesen', () => {
    it('liest „(Reichweiten) --> (TP+)“ als Paare [Reichweite, TP+]', () => {
      expect(rwOf('(5/15/25/40/60) --> (1/1/0/0/-1)')).toEqual(KURZBOGEN)
      expect(rwOf('"(5/15/25/40/60) --> (1/1/0/0/-1)"')).toEqual(KURZBOGEN)
      expect(rwOf('( 5 / 15 / 25 / 40 / 60 )-->( 1 / 1 / 0 / 0 / -1 )')).toEqual(KURZBOGEN)
      expect(block('(5/15/25/40/60) --> (1/1/0/0/-1)').issues).toEqual([])
    })

    it('TP+ darf ein Vorzeichen haben', () => {
      expect(rwOf('(5/15/25/40/60) --> (+1/+1/0/0/-1)')).toEqual(KURZBOGEN)
    })

    it('liest eine Liste aus fünf Paaren', () => {
      expect(rwOf('[[5, 1], [15, 1], [25, 0], [40, 0], [60, -1]]')).toEqual(KURZBOGEN)
    })

    it('Schlüssel ohne Rücksicht auf Groß-/Kleinschreibung', () => {
      expect(parse('name: X\nwaffen:\n  - { name: Kurzbogen, rw: (5/15/25/40/60) --> (1/1/0/0/-1) }').data!.waffen[0].RW).toEqual(KURZBOGEN)
    })

    it('meldet zu wenige, zu viele und unlesbare Werte', () => {
      const bad = [
        '5/15/25/40/60', '(5/15/25/40/60)', '(5/15/25/40) --> (1/1/0/0)', '(5/15/25/40/60/80) --> (1/1/0/0/-1/-2)',
        '(5/15/25/40/60) --> (1/1/0/0)', '(5/15/x/40/60) --> (1/1/0/0/-1)', '60', 'weit',
        '[5, 15, 25, 40, 60]', '[[5, 1], [15, 1], [25, 0]]', '[[5, 1], [15, 1], [25, 0], [40, 0], [60]]', '[[5, 1], [15, 1], [25, x], [40, 0], [60, -1]]',
      ]
      for (const rw of bad) {
        expect(rwOf(rw), rw).toBeUndefined()
        expect(errors(rw).join(' '), rw).toContain('Waffe: RW')
      }
    })

    it('lehnt negative Reichweiten ab, negative TP+ nicht', () => {
      for (const rw of ['(-5/15/25/40/60) --> (1/1/0/0/-1)', '[[5, 1], [15, 1], [25, 0], [40, 0], [-60, -1]]']) {
        expect(rwOf(rw), rw).toBeUndefined()
        expect(errors(rw).join(' '), rw).toContain('Waffe: RW')
      }
      expect(rwOf('(5/15/25/40/60) --> (-1/-2/-3/-4/-5)')).toEqual([[5, -1], [15, -2], [25, -3], [40, -4], [60, -5]])
    })

    it('warnt bei einer Nahkampfwaffe', () => {
      expect(block('(5/15/25/40/60) --> (1/1/0/0/-1)', 'Dreizack').issues).toEqual([{ level: 'warning', message: 'Waffe „Dreizack“ ist eine Nahkampfwaffe, RW wird ignoriert.' }])
    })
  })

  describe('Export nach Foundry', () => {
    it('schreibt Reichweiten und TP+ auf die Fernkampfwaffe', () => {
      const system = itemOf(block('(10/20/30/50/80) --> (3/2/1/0/-1)'), 'Kurzbogen').system
      expect(system).toMatchObject({
        'ranges.veryClose': 10, 'ranges.close': 20, 'ranges.medium': 30, 'ranges.far': 50, 'ranges.veryFar': 80,
        'bonusDamages.veryClose': 3, 'bonusDamages.close': 2, 'bonusDamages.medium': 1, 'bonusDamages.far': 0, 'bonusDamages.veryFar': -1,
      })
      expect(rangeKeys(system)).toHaveLength(10) // nichts außer den zehn Feldern des Systems
    })

    it('eigene Waffe mit RW wird Fernkampfwaffe – mit und ohne FK', () => {
      for (const fk of ['FK: 12, ', '']) {
        const own = itemOf(parse(`name: X\nwaffen:\n  - { name: Knochenschleuder, talent: Schleuder, ${fk}RW: (2/5/10/20/30) --> (1/0/0/0/-1) }`), 'Knochenschleuder')
        expect(own.types, fk).toEqual(['rangedWeapon'])
        expect(own.system, fk).toMatchObject({ 'ranges.veryClose': 2, 'ranges.veryFar': 30, 'bonusDamages.veryClose': 1, 'bonusDamages.veryFar': -1 })
      }
    })

    it('ohne Angabe bleiben die Werte des Kompendiums unberührt', () => {
      expect(rangeKeys(itemOf(parse('name: X\nwaffen: [Kurzbogen]'), 'Kurzbogen').system)).toEqual([])
    })

    it('Nahkampfwaffen bekommen keine Reichweiten', () => {
      const dreizack = itemOf(block('(5/15/25/40/60) --> (1/1/0/0/-1)', 'Dreizack'), 'Dreizack')
      expect(dreizack.types).toEqual(['meleeWeapon'])
      expect(rangeKeys(dreizack.system)).toEqual([])
    })
  })

  describe('Wertekasten', () => {
    const render = (source: string) => dsa41Adapter.renderStatblock(parse(source), {})

    it('zeigt die Spalte „Reichweite“ hinter DK so, wie man sie in den Block schreibt', () => {
      const html = render('name: X\nwaffen:\n  - { name: Kurzbogen, RW: (5/15/25/40/60) --> (+1/+1/0/0/-1) }\n  - Dolch')
      expect(html).toContain('<th>DK</th><th>Reichweite</th></tr>')
      expect(html).toContain('<td>(5/15/25/40/60) --&gt; (1/1/0/0/-1)</td></tr>')
      expect(html.match(/<td><\/td><\/tr>/g)).toHaveLength(1) // Dolch: leere Zelle
    })

    it('ohne Angabe gibt es keine Spalte', () => {
      expect(render('name: X\nwaffen: [Kurzbogen, Dolch]')).not.toContain('Reichweite')
    })
  })
})

describe('Sprachen und Schriften unter talente', () => {
  const ctx = { actorId: 'AAAAAAAAAAAAAAAA', sourcePath: 'x', journalName: 'x', resolveImage: () => null, nearbyImages: {}, linkedDefault: true }
  const warnings = (r: ReturnType<typeof parse>) => r.issues.filter((i) => i.level === 'warning').map((i) => i.message)
  const items = (s: string) => dsa41.nscToActor(parse(s).data!, ctx).items.map((i) => ({ id: i.id, name: i.name, type: i.source?.type }))

  it('eindeutige Namen brauchen keinen Zusatz', () => {
    const r = parse('name: X\ntalente: { Sinnenschärfe: 10, Garethi: 12, Kusliker Zeichen: 6 }')
    expect(warnings(r)).toEqual([])
    expect(items('name: X\ntalente: { Garethi: 12, Kusliker Zeichen: 6 }')).toMatchObject([
      { name: 'Garethi', type: 'language' },
      { name: 'Kusliker Zeichen', type: 'scripture' },
    ])
  })

  it('Zusatz mit und ohne Leerzeichen trennt Sprache und Schrift gleichen Namens', () => {
    const r = parse('name: X\ntalente: { Zhayad(Sprache): 8, Zhayad (Schrift): 5, Garethi(Sprache): 12 }')
    expect(warnings(r)).toEqual([])
    expect(r.data!.talente).toEqual([
      { name: 'Zhayad', value: 8, kind: 'language' },
      { name: 'Zhayad', value: 5, kind: 'scripture' },
      { name: 'Garethi', value: 12, kind: 'language' },
    ])
    const it = items('name: X\ntalente: { Zhayad(Sprache): 8, Zhayad(Schrift): 5 }')
    expect(it).toMatchObject([{ name: 'Zhayad', type: 'language' }, { name: 'Zhayad', type: 'scripture' }])
    expect(it[0].id).not.toBe(it[1].id)
  })

  it('mehrdeutiger Name ohne Zusatz: Warnung, wird Sprache mit derselben ID wie bisher', () => {
    const r = parse('name: X\ntalente: { Tulamidya: 12 }')
    expect(warnings(r)).toEqual(['Talent „Tulamidya“ gibt es als Sprache und als Schrift – bitte „Tulamidya(Sprache)“ oder „Tulamidya(Schrift)“ angeben. Wird als Sprache übernommen.'])
    expect(items('name: X\ntalente: { Tulamidya: 12 }')).toEqual(items('name: X\ntalente: { Tulamidya(Sprache): 12 }'))
    expect(items('name: X\ntalente: { Tulamidya: 12 }')[0].type).toBe('language')
  })

  it('falscher Zusatz: Warnung, richtiger Typ', () => {
    const r = parse('name: X\ntalente: { Kusliker Zeichen(Sprache): 6 }')
    expect(warnings(r)).toEqual(['Talent „Kusliker Zeichen(Sprache)“: Kusliker Zeichen ist eine Schrift, keine Sprache. Wird als Schrift übernommen.'])
    expect(r.data!.talente[0]).toEqual({ name: 'Kusliker Zeichen', value: 6, kind: 'scripture' })
  })

  it('Wertekasten zeigt den Zusatz nur bei mehrdeutigen Namen', () => {
    const html = dsa41.renderStatblock(parse('name: X\ntalente: { Garethi(Sprache): 12, Tulamidya(Schrift): 4 }'), { showIssues: false, showCalculated: false })
    expect(html).toContain('Garethi 12, Tulamidya (Schrift) 4')
  })
})

describe('Rüstung mit eigenen Werten', () => {
  const ctx = { actorId: 'AAAAAAAAAAAAAAAA', sourcePath: 'NPC/X.md', journalName: 'X', resolveImage: () => null, nearbyImages: {}, linkedDefault: false }
  const actorOf = (s: string) => dsa41.nscToActor(parse(s).data!, ctx)
  const armorOf = (s: string, name: string) => actorOf(s).items.find((i) => i.name === name)!

  it('liest Namen, Einträge, Einzel-Eintrag und Namens-Liste', () => {
    const list = parse('name: X\nrüstung:\n  - Lederharnisch\n  - { name: Lastgeschirr, RS: 0, BE: 2 }')
    expect(list.issues).toEqual([])
    expect(list.data!.ruestung).toEqual([{ name: 'Lederharnisch' }, { name: 'Lastgeschirr', RS: 0, BE: 2 }])
    expect(parse('name: X\nrüstung: { name: Lastgeschirr, be: 2 }').data!.ruestung).toEqual([{ name: 'Lastgeschirr', BE: 2 }])
    expect(parse('name: X\nrüstung: { Lastgeschirr: { BE: 2 }, Lederhelm: }').data!.ruestung).toEqual([{ name: 'Lastgeschirr', BE: 2 }, { name: 'Lederhelm' }])
    expect(parse('name: X\nrüstung: Lederhelm').data!.ruestung).toEqual([{ name: 'Lederhelm' }])
  })

  it('unbekannte Rüstung warnt nur ohne eigene Werte', () => {
    expect(levels('name: X\nrüstung: [{ name: Lastgeschirr, BE: 2 }]', 'warning')).toEqual([])
    expect(levels('name: X\nrüstung: [Lastgeschirr]', 'warning')[0]).toMatch(/Lastgeschirr.*gib RS und BE an/)
  })

  it('meldet falsche Werte und unbekannte Schlüssel', () => {
    expect(levels('name: X\nrüstung: [{ name: A, BE: viel }]')).toEqual(['Rüstung: BE „viel“ ist keine ganze Zahl ≥ 0.'])
    expect(levels('name: X\nrüstung: [{ name: A, RS: -1 }]')).toEqual(['Rüstung: RS -1 ist keine ganze Zahl ≥ 0 (oder Zonen wie { Kopf: 3, Brust: 4 }).'])
    expect(levels('name: X\nrüstung: [{ name: A, Gewicht: 3 }]')).toEqual(['Rüstung: unbekannter Schlüssel „Gewicht“ (erlaubt: name, RS, BE).'])
    expect(levels('name: X\nrüstung: [{ BE: 2 }]')).toEqual(['Rüstung ohne „name“.'])
    expect(levels('name: X\nrüstung: [[1, 2]]')[0]).toMatch(/^Rüstung: .* ist kein Eintrag/)
  })

  it('schreibt RS und BE für einfache und Zonenrüstung, angelegt', () => {
    const a = armorOf('name: X\nrüstung: [{ name: Lastgeschirr, RS: 1, BE: 2 }]', 'Lastgeschirr')
    expect(a.source).toBeUndefined()
    expect(a.system).toMatchObject({
      equipped: true, armorClass: 1, encumbrance: 2, zonedEncumbrance: 2,
      'zonedArmorClass.head': 1, 'zonedArmorClass.rightLeg': 1, 'zonedArmorClass.total': 1,
    })
    expect(a.fallback).toEqual({ type: 'armor', system: { equipped: true, armorClass: 0, encumbrance: 0 } })
  })

  it('überschreibt Kompendiumswerte nur, wenn angegeben', () => {
    const only = armorOf('name: X\nrüstung: [{ name: Lederharnisch, BE: 1 }]', 'Lederharnisch')
    expect(only.source).toMatchObject({ sid: 'armor-ave-Lederharnisch' })
    expect(only.system).toEqual({ equipped: true, encumbrance: 1, zonedEncumbrance: 1 })
    expect(armorOf('name: X\nrüstung: [Lederharnisch]', 'Lederharnisch').system).toEqual({ equipped: true })
  })

  it('RS ist Zusatz-RS und wird nicht mit den Rüstungen verrechnet', () => {
    const rs = (s: string) => actorOf(s).data['modifiers.additionalRS']
    expect(rs('name: X\nrüstung: [Lederharnisch, { name: Lastgeschirr, RS: 1, BE: 2 }]\nRS: 5')).toBe(5)
    expect(rs('name: X\nrüstung: [{ name: Lederharnisch, RS: 4 }]\nRS: 2')).toBe(2)
    expect(rs('name: X\nrüstung: [{ name: Lastgeschirr, BE: 2 }]\nRS: 2')).toBe(2)
    expect(rs('name: X\nrüstung: [Lederharnisch]')).toBe(0)
    expect(rs('name: X\nRS: 3')).toBe(3)
  })

  it('Zonen: Kurz- und Langnamen, Arme/Beine, fehlende Zonen 0, Gesamt-RS gerundet', () => {
    const r = parse('name: X\nrüstung:\n  - { name: Platte, RS: { Kopf: 3, Brust: 5, rücken: 4, Bauch: 4, Arme: 2, linkes Bein: 2, RB: 1 }, BE: 4 }')
    expect(r.issues).toEqual([])
    expect(r.data!.ruestung[0]).toEqual({
      name: 'Platte', BE: 4, RS: 3, // (3·2 + 5·4 + 4·4 + 4·4 + 2·1 + 2·1 + 2·2 + 1·2) / 20 = 68/20 = 3,4
      zones: { head: 3, chest: 5, back: 4, torso: 4, leftArm: 2, rightArm: 2, leftLeg: 2, rightLeg: 1 },
    })
    expect(parse('name: X\nrüstung: [{ name: Helm, RS: { Kopf: 4 } }]').data!.ruestung[0]).toMatchObject({
      RS: 0, zones: { head: 4, chest: 0, leftLeg: 0 },
    })
    expect(parse('name: X\nrüstung: [{ name: A, RS: { LA: 1, rechter Arm: 1, Bein links: 1, Ruecken: 1 } }]').issues).toEqual([])
  })

  it('Zonen: Fehler bei unbekannter Zone, doppelter Zone, falschem Wert', () => {
    expect(levels('name: X\nrüstung: [{ name: A, RS: { Hals: 2 } }]')[0]).toMatch(/^Rüstung „A“: unbekannte Zone „Hals“/)
    expect(levels('name: X\nrüstung: [{ name: A, RS: { Arme: 2, LA: 3 } }]')).toEqual(['Rüstung „A“: Zone LA ist doppelt angegeben („LA“).'])
    expect(levels('name: X\nrüstung: [{ name: A, RS: { Kopf: -1 } }]')).toEqual(['Rüstung „A“: RS Kopf -1 ist keine ganze Zahl ≥ 0.'])
    expect(parse('name: X\nrüstung: [{ name: A, RS: { Kopf: x } }]').data!.ruestung[0]).toEqual({ name: 'A' })
  })

  it('Zonen: jede Zone einzeln, Gesamt-RS für einfache Rüstung, Zusatz-RS bleibt unberührt', () => {
    const a = armorOf('name: X\nrüstung: [{ name: Helm, RS: { Kopf: 4, Brust: 2 }, BE: 1 }]', 'Helm')
    expect(a.system).toMatchObject({
      armorClass: 1, 'zonedArmorClass.total': 0.8, encumbrance: 1, zonedEncumbrance: 1,
      'zonedArmorClass.head': 4, 'zonedArmorClass.chest': 2, 'zonedArmorClass.back': 0, 'zonedArmorClass.rightLeg': 0,
    })
    expect(actorOf('name: X\nrüstung: [{ name: Helm, RS: { Kopf: 4, Brust: 2 } }]\nRS: 3').data['modifiers.additionalRS']).toBe(3)
  })

  it('Wertekasten zeigt die eigenen Werte', () => {
    const html = dsa41.renderStatblock(parse('name: X\nrüstung: [Lederhelm, { name: Lastgeschirr, RS: 0, BE: 2 }]'), { showIssues: false, showCalculated: false })
    expect(html).toContain('<b>Rüstung:</b> Lederhelm, Lastgeschirr (RS 0, BE 2)</p>')
    const zoned = dsa41.renderStatblock(parse('name: X\nrüstung: [{ name: Helm, RS: { Kopf: 4 }, BE: 1 }]'), { showIssues: false, showCalculated: false })
    expect(zoned).toContain('Helm (RS 0 [Kopf 4 Brust 0 Rücken 0 Bauch 0 LA 0 RA 0 LB 0 RB 0], BE 1)')
  })
})

describe('Rasse, Kultur und MR-Mod', () => {
  const ctx = { actorId: 'AAAAAAAAAAAAAAAA', sourcePath: 'NPC/X.md', journalName: 'X', resolveImage: () => null, nearbyImages: {}, linkedDefault: false }
  const ATTRS = 'eigenschaften: { MU: 14, KL: 14, IN: 15, CH: 13, FF: 12, GE: 13, KO: 13, KK: 11 }' // MR 8, INI 11
  const itemOf = (a: ReturnType<typeof dsa41.nscToActor>, type: string) => a.items.find((i) => i.types[0] === type)

  it('liest rasse (auch spezies), kultur und MR-Mod in allen Schreibweisen', () => {
    const d = parse('name: X\nrasse: Mittelländer\nkultur: Mittelländische Städte\nMR-Mod: -1').data!
    expect(d).toMatchObject({ rasse: 'Mittelländer', kultur: 'Mittelländische Städte', mrMod: -1 })
    expect(parse('name: X\nspezies: Goblin\nmrmod: "+2"').data).toMatchObject({ rasse: 'Goblin', mrMod: 2 })
    expect(parse('name: X\nmr_mod: 1').data!.mrMod).toBe(1)
    const empty = parse('name: X\nrasse:\nkultur: ""').data!
    expect(empty.rasse).toBeUndefined()
    expect(empty.kultur).toBeUndefined()
    expect(levels('name: X\nMR-Mod: 1\nmrmod: 2')).toEqual(['„mrmod“ kommt doppelt vor (auch als Abkürzung).'])
    expect(levels('name: X\nMR-Mod: 1,5')).toEqual(['MR-Mod: „1,5“ ist keine ganze Zahl.'])
    expect(levels('name: X\nrasse: { a: 1 }')).toEqual(['„rasse“ muss Text sein.'])
    expect(dsa41Adapter.template()).toMatch(/\nrasse:\nkultur:\n/)
  })

  it('Kompendiumsnamen: Geschlechtsformen und Varianten werden erkannt, unbekannte Namen warnen', () => {
    expect(dsa41.identityVariants('Mittelländer*in')).toEqual(['Mittelländer', 'Mittelländerin'])
    expect(dsa41.identityVariants('Nivese/Nivesin')).toEqual(['Nivese', 'Nivesin'])
    expect(dsa41.identityVariants('Zwerg*in - Ambosszwerge')).toEqual(['Zwerg - Ambosszwerge', 'Zwergin - Ambosszwerge', 'Ambosszwerge'])
    expect(dsa41.identityVariants('Thorwal')).toEqual([])
    for (const n of ['Mittelländer', 'Mittelländerin', 'Mittelländer*in']) expect(dsa41.findCatalog(['species'], n)?.s).toBe('species-mittellaender')
    expect(dsa41.findCatalog(['species'], 'Ambosszwerge')?.n).toBe('Zwerg*in - Ambosszwerge')
    expect(dsa41.findCatalog(['species'], 'Nivesin')?.n).toBe('Nivese/Nivesin')
    expect(dsa41.findCatalog(['culture'], 'Gebirge')?.n).toBe('Gebirge') // eigener Eintrag schlägt die Variante von „Almada - Gebirge“
    expect(dsa41.findCatalog(['culture'], 'Drasdech')).toBeUndefined() // Orkland - Drasdech, Svellttal-Besatzer - Drasdech, …
    expect(dsa41.findCatalog(['culture'], 'Almada')?.s).toBe('culture-almada')
    const r = parse('name: X\nrasse: Mittelländer\nkultur: Mittelreich')
    expect(r.issues.filter((i) => i.level === 'info').map((i) => i.message)).toContain('Rasse „Mittelländer“ als „Mittelländer*in“ erkannt.')
    const warnings = r.issues.filter((i) => i.level === 'warning').map((i) => i.message)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatch(/^Kultur „Mittelreich“ steht in keinem dsa-41-Kompendium.*ohne MR-Modifikator angelegt\.$/)
  })

  it('Rechenwerte: Rasse und Kultur ändern MR (Rasse auch INI), dazu Hohe/Niedrige Magieresistenz und MR-Mod', () => {
    expect(dsa41.computeDerived(parse(`name: X\n${ATTRS}`).data!)).toMatchObject({ MR: 8, INI: 11 })
    const goblin = parse(`name: X\n${ATTRS}\nrasse: Goblin\nkultur: Festumer Ghetto\nMR-Mod: 1\nvorteile: { Hohe Magieresistenz: 2 }\nnachteile: { Niedrige Magieresistenz: 1 }`)
    expect(goblin.issues).toEqual([])
    // 8 − 5 (Goblin) + 1 (Festumer Ghetto) + 1 (MR-Mod) + 2 − 1; INI 11 + 2 (Goblin)
    expect(dsa41.computeDerived(goblin.data!)).toMatchObject({ MR: 6, INI: 13 })
    const fixed = parse(`name: X\n${ATTRS}\nrasse: Mittelländer\nMR: 8`)
    expect(fixed.issues.filter((i) => i.level === 'warning')).toEqual([])
    expect(dsa41.overrides(fixed.data!)).toEqual([{ key: 'MR', label: 'MR', given: 8, calculated: 4 }])
    expect(levels(`name: X\n${ATTRS}\nMR: 8\nMR-Mod: 2`, 'warning')).toEqual([
      'MR ist fest angegeben – das System verrechnet MR-Mod (wie die Modifikatoren von Rasse und Kultur) nur, wenn es die MR selbst berechnet.',
    ])
  })

  it('Actor: Textfelder, Zusatz-MR und Items aus den Kompendien', () => {
    const a = dsa41.nscToActor(parse('name: X\nrasse: Mittelländer\nkultur: Festumer Ghetto\nMR-Mod: -2').data!, ctx)
    expect(a.data).toMatchObject({
      'background.species': 'Mittelländer', 'background.culture': 'Festumer Ghetto',
      'base.combatAttributes.additionalMR': -2, 'settings.autoCalcMagicResistance': true,
    })
    expect(itemOf(a, 'species')).toMatchObject({
      name: 'Mittelländer*in', source: { pack: 'species', sid: 'species-mittellaender', type: 'species' }, system: {},
      fallback: { type: 'species', system: { mrmod: 0, inimod: 0 } },
    })
    expect(itemOf(a, 'culture')).toMatchObject({ name: 'Festumer Ghetto', source: { pack: 'culture', sid: 'culture-festumer-ghetto', type: 'culture' }, fallback: { type: 'culture', system: { mrmod: 0 } } })
    a.items.forEach((i) => expect(i.id).toMatch(FOUNDRY_ID_PATTERN))
    // another spelling of the same compendium entry keeps the item id (the system allows each sid only once per actor)
    const b = dsa41.nscToActor(parse('name: X\nrasse: Mittelländerin').data!, ctx)
    expect(itemOf(b, 'species')!.id).toBe(itemOf(a, 'species')!.id)
    const none = dsa41.nscToActor(parse('name: X').data!, ctx)
    expect(none.data).toMatchObject({ 'background.species': '', 'background.culture': '', 'base.combatAttributes.additionalMR': 0 })
    expect(itemOf(none, 'species')).toBeUndefined()
    expect(itemOf(none, 'culture')).toBeUndefined()
    const own = dsa41.nscToActor(parse('name: X\nrasse: Drache').data!, ctx)
    expect(itemOf(own, 'species')).toMatchObject({ name: 'Drache', types: ['species'], fallback: { type: 'species', system: { mrmod: 0, inimod: 0 } } })
    expect(itemOf(own, 'species')!.source).toBeUndefined()
  })

  it('Wertekasten zeigt Rasse und Kultur im Kopf und MR-Mod mit Vorzeichen', () => {
    const html = dsa41Adapter.renderStatblock(parse('name: X\nrolle: Händlerin\nrasse: Mittelländer\nkultur: Festumer Ghetto\nMR-Mod: 1'), {})
    expect(html).toContain('<span class="vtf-nsc-role">Händlerin</span> <span class="vtf-nsc-origin">(Mittelländer, Festumer Ghetto)</span>')
    expect(html).toContain('<span><b>MR-Mod</b> +1</span>')
    const other = dsa41Adapter.renderStatblock(parse('name: X\nkultur: Thorwal\nMR-Mod: -2'), {})
    expect(other).toContain('<strong class="vtf-nsc-name">X</strong> <span class="vtf-nsc-origin">(Thorwal)</span>')
    expect(other).toContain('<span><b>MR-Mod</b> -2</span>')
    expect(dsa41Adapter.renderStatblock(parse('name: X'), {})).not.toContain('vtf-nsc-origin')
  })
})

describe('Schilde und Parierwaffen', () => {
  const all = (s: string) => parse(s).issues.map((i) => `${i.level}: ${i.message}`)

  it('liest Namen, Listen- und Zuordnungs-Schreibweise, Schlüssel ohne Groß-/Kleinschreibung', () => {
    expect(parse('name: X\nschilde: [Großschild]').data!.schilde).toEqual([{ name: 'Großschild' }])
    expect(parse('name: X\nschild: Lederschild').data!.schilde).toEqual([{ name: 'Lederschild' }])
    expect(parse('name: X\nschild: { name: Lederschild, BF: 1 }').data!.schilde).toEqual([{ name: 'Lederschild', BF: 1 }])
    const r = parse('name: X\nschilde:\n  - { name: Großschild, wm: -2/5, ini: -2, bf: 2 }\n  - { name: Buckler, typ: Schild }')
    expect(r.data!.schilde).toEqual([{ name: 'Großschild', WM: [-2, 5], INI: -2, BF: 2 }, { name: 'Buckler', typ: 'shield' }])
    expect(parse('name: X\nschilde:\n  Thorwalerschild: { WM: [-1, 3] }\n  Reiterschild:').data!.schilde).toEqual([{ name: 'Thorwalerschild', WM: [-1, 3] }, { name: 'Reiterschild' }])
  })

  it('typ: Schild/Parierwaffe in mehreren Schreibweisen, sonst Fehler', () => {
    for (const [text, typ] of [['Schild', 'shield'], ['S', 'shield'], ['Parierwaffe', 'parryingWeapon'], ['parryingWeapon', 'parryingWeapon'], ['P', 'parryingWeapon']]) {
      expect(parse(`name: X\nschilde: [{ name: Buckler, typ: ${text} }]`).data!.schilde[0].typ, text).toBe(typ)
    }
    expect(levels('name: X\nschilde: [{ name: Buckler, typ: Dings }]')).toEqual(['Schild: typ „Dings“ ungültig (Schild oder Parierwaffe).'])
  })

  it('Kategorie: Block vor Kompendium, unbekannte Namen sind Schilde', () => {
    const cat = (s: string) => parse(s).data!.schilde.map(dsa41.shieldCategory)
    expect(cat('name: X\nschilde: [Großschild, Linkhand, Buckler]\nsonderfertigkeiten: [Linkhand]')).toEqual(['shield', 'parryingWeapon', 'parryingWeapon'])
    expect(cat('name: X\nschilde: [{ name: Buckler, typ: Schild }]')).toEqual(['shield'])
    // unknown items: shield, stored on the entry; a parrying weapon needs typ
    expect(parse('name: X\nschilde: [Knochenschild]').data!.schilde).toEqual([{ name: 'Knochenschild', typ: 'shield' }])
    expect(parse('name: X\nschilde: [{ name: Knochenhaken, typ: Parierwaffe }]\nsonderfertigkeiten: [Linkhand]').data!.schilde).toEqual([{ name: 'Knochenhaken', typ: 'parryingWeapon' }])
    // there is no separate list for parrying weapons
    expect(levels('name: X\nparierwaffen: [Linkhand]')[0]).toContain('Unbekannter Schlüssel „parierwaffen“')
  })

  it('schilde nimmt Schilde und Parierwaffen gemischt', () => {
    const r = parse('name: X\nschilde: [Großschild, Linkhand]\nsonderfertigkeiten: [Linkhand]')
    expect(r.data!.schilde.map((s) => s.name)).toEqual(['Großschild', 'Linkhand'])
    expect(r.issues.map((i) => i.level)).toEqual(['info'])
  })

  it('Meldungen: unbekannt, Kompendium-Kategorie abweichend, Kurzform, falsche Werte', () => {
    expect(all('name: X\nschilde: [Knochenschild]')).toEqual([
      'warning: Schild „Knochenschild“ steht in keinem dsa-41-Kompendium. Wird in Foundry in den Welt-Gegenständen gesucht, sonst als Schild ohne Werte angelegt – gib WM, INI und BF an, für eine Parierwaffe typ: Parierwaffe.',
    ])
    expect(all('name: X\nschilde: [{ name: Knochenhaken, typ: Parierwaffe }]\nsonderfertigkeiten: [Linkhand]')).toEqual([
      'warning: Parierwaffe „Knochenhaken“ steht in keinem dsa-41-Kompendium. Wird in Foundry in den Welt-Gegenständen gesucht, sonst als Parierwaffe ohne Werte angelegt – gib WM, INI und BF an.',
    ])
    expect(all('name: X\nschilde: [{ name: Buckler, typ: Schild }]')).toEqual(['info: Schild „Buckler“ ist im Kompendium eine Parierwaffe, wird als Schild angelegt.'])
    expect(all('name: X\nschilde: [Thorwaler]')[0]).toContain('warning: Schild „Thorwaler“ steht in keinem dsa-41-Kompendium (meintest du „Thorwalerschild“?)')
    expect(all('name: X\nschilde: [Linkhand mit]\nsonderfertigkeiten: [Linkhand]')).toEqual(['info: Schild „Linkhand mit“ als „Linkhand mit Klingenfänger“ erkannt.'])
    expect(levels('name: X\nschilde: [{ name: Großschild, WM: viel, INI: x, BF: 1.5, foo: 1 }]')).toEqual([
      'Schild: WM „viel“ ungültig (z. B. -2/5).',
      'Schild: INI „x“ ist keine ganze Zahl.',
      'Schild: BF 1.5 ist keine ganze Zahl.',
      'Schild: unbekannter Schlüssel „foo“ (erlaubt: name, typ, INI, WM, BF).',
    ])
    expect(levels('name: X\nschilde: [{ WM: 0/1 }]')).toEqual(['Schild ohne „name“.'])
    expect(levels('name: X\nschilde: 3')).toEqual(['„schilde“ muss eine Liste sein, z. B. - { name: Großschild, WM: -2/5, INI: -2 }'])
    expect(levels('name: X\nschilde: [Großschild]\nschild: [Lederschild]')).toEqual(['„schild“ kommt doppelt vor (auch als Abkürzung).'])
  })

  it('Parierwaffe ohne Linkhand/Parierwaffen I/II warnt, mehrere Schilde sind ein Hinweis', () => {
    expect(levels('name: X\nschilde: [Linkhand]', 'warning')).toEqual([
      'Parierwaffe „Linkhand“ ohne SF Linkhand, Parierwaffen I oder Parierwaffen II – das System verrechnet ihren WM dann nicht.',
    ])
    expect(levels('name: X\nschilde: [Linkhand]\nsonderfertigkeiten: [Parierwaffen II]', 'warning')).toEqual([])
    expect(levels('name: X\nschilde: [Großschild]', 'warning')).toEqual([])
    expect(levels('name: X\nschilde: [Großschild, Lederschild]', 'info')).toEqual(['Mehrere Schilde/Parierwaffen – in Foundry hält der Charakter nur das erste (Großschild) in der Nebenhand.'])
  })

  it('werden Items vom Typ shield: Kompendium-Hinweis, nur angegebene Werte, Kategorie aus typ', () => {
    const ctx = { actorId: 'AAAAAAAAAAAAAAAA', sourcePath: 'NPC/X.md', journalName: 'X', resolveImage: () => null, nearbyImages: {}, linkedDefault: false }
    const shields = (s: string) => dsa41.nscToActor(parse(s).data!, ctx).items.filter((i) => i.types[0] === 'shield')
    const [plain] = shields('name: X\nschilde: [Großschild]')
    expect(plain.name).toBe('Großschild')
    expect(plain.source).toEqual({ pack: 'shield', sid: 'shield-ave-Gro_schild', type: 'shield' })
    expect(plain.system).toEqual({})
    expect(plain.fallback).toEqual({ type: 'shield', system: { category: 'shield', shieldtype: 'S', 'weaponMod.attack': 0, 'weaponMod.parry': 0, initiativeMod: 0, breakingFactor: 0 } })
    expect(plain.id).toMatch(FOUNDRY_ID_PATTERN)

    const [own] = shields('name: X\nschilde: [{ name: Buckler, typ: Schild, WM: 0/2, INI: 1, BF: 3 }]')
    expect(own.system).toEqual({ category: 'shield', 'weaponMod.attack': 0, 'weaponMod.parry': 2, initiativeMod: 1, breakingFactor: 3 })

    // unknown parrying weapon: no compendium hint, the fallback is a complete parrying weapon
    const [unknown] = shields('name: X\nschilde: [{ name: Knochenhaken, typ: Parierwaffe }]\nsonderfertigkeiten: [Linkhand]')
    expect(unknown.source).toBeUndefined()
    expect(unknown.system).toEqual({ category: 'parryingWeapon' })
    expect(unknown.fallback.system).toMatchObject({ category: 'parryingWeapon', shieldtype: 'P' })

    // the hooks take the first shield into the off hand; shield items carry no combat target values
    expect(shields('name: X\nschilde: [Lederschild, Linkhand]\nsonderfertigkeiten: [Linkhand]').map((i) => [i.name, combatOf(i)])).toEqual([['Lederschild', undefined], ['Linkhand', undefined]])
  })
})
