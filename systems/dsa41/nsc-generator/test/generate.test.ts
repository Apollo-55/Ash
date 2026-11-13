import { describe, expect, it } from 'vitest'
import * as dsa41 from '../../adapter/src/index.ts'
import { repair, toBlock, type NpcJson } from '../src/index.ts'

const base = (): NpcJson => ({
  name: 'Testa',
  rolle: 'Wache',
  eigenschaften: { MU: 13, KL: 11, IN: 12, CH: 11, FF: 12, GE: 13, KO: 13, KK: 13 },
  LeP: 30,
  AuP: 30,
  AsP: null,
  KaP: null,
  waffen: ['Säbel'],
  ruestung: [],
  talente: [{ name: 'Sinnenschärfe', wert: 7 }],
  zauber: [],
  liturgien: [],
  vorteile: [],
  nachteile: [{ name: 'Jähzorn', wert: 5 }],
  sonderfertigkeiten: [],
  notiz: '',
})

describe('Block aus JSON', () => {
  it('ergibt einen gültigen dsa-nsc-Block', () => {
    const block = toBlock(base())
    const r = dsa41.parseNscBlock(block)
    expect(r.issues.filter((i) => i.level !== 'info')).toEqual([])
    expect(r.data).toMatchObject({ name: 'Testa', LeP: 30, nachteile: [{ name: 'Jähzorn', value: 5 }] })
  })
  it('setzt Namen mit Sonderzeichen in Anführungszeichen', () => {
    const n = base()
    n.sonderfertigkeiten = ['Waffenlose Kampftechnik: Mercenario']
    n.notiz = 'Sagt: "Hallo"'
    expect(dsa41.parseNscBlock(toBlock(n)).data!.sonderfertigkeiten[0].name).toBe('Waffenlose Kampftechnik: Mercenario')
  })
})

describe('Reparaturen', () => {
  it('ähnliche Namen werden zu Kompendium-Namen, Unbekanntes gemeldet', () => {
    const n = base()
    n.talente.push({ name: 'Sinnenscharfe', wert: 3 }, { name: 'Wolkenlesen', wert: 5 })
    n.waffen.push('Säbbel')
    const r = repair(n, 'erfahren', false, false)
    expect(r.repairs).toContain('Waffe „Säbbel“ → „Säbel“')
    expect(r.unknown).toEqual(['Talent „Wolkenlesen“'])
    expect(r.npc.talente.filter((t) => t.name === 'Sinnenschärfe')).toHaveLength(1)
  })
  it('Vor- und Nachteile in der falschen Liste werden umsortiert', () => {
    const n = base()
    n.vorteile = [{ name: 'Neugier', wert: 6 }]
    const r = repair(n, 'erfahren', false, false)
    expect(r.npc.vorteile).toEqual([])
    expect(r.npc.nachteile.map((x) => x.name)).toEqual(['Jähzorn', 'Neugier'])
    expect(r.unknown).toEqual([])
  })
  it('unbekannte Namen: Vorschläge für die Korrektur, in der letzten Runde entfernt', () => {
    const n = base()
    n.talente.push({ name: 'Schmieden', wert: 12 }, { name: 'Common', wert: 10 })
    n.waffen.push('Kurzschwert (Schmiedewerk) +2')
    const r = repair(structuredClone(n), 'erfahren', false, false)
    expect(r.repairs).toContain('Waffe „Kurzschwert (Schmiedewerk) +2“ → „Kurzschwert“')
    expect(r.unknown).toContain('Talent „Schmieden“')
    expect(r.hints[r.unknown.indexOf('Talent „Schmieden“')]).toMatch(/meintest du: Grobschmied/)
    const d = repair(structuredClone(n), 'erfahren', false, false, { dropUnknown: true })
    expect(d.unknown).toEqual([])
    expect(d.npc.talente.map((t) => t.name)).not.toContain('Common')
    expect(d.repairs).toContain('Talent „Common“ entfernt (kein DSA-4.1-Name)')
  })
  it('Vor-/Nachteile: Dubletten, Einheitswerte und zu viele werden bereinigt', () => {
    const n = base()
    n.vorteile = ['Gebildet', 'Gut Aussehend', 'Gutes Gedächtnis', 'Eidetisches Gedächtnis', 'Herausragendes Gehör', 'Magiegespür', 'Schutzgeist', 'Gebildet'].map((name) => ({ name, wert: 12 }))
    n.nachteile.push({ name: 'Jähzorn', wert: 5 })
    const r = repair(n, 'erfahren', false, false)
    expect(r.npc.nachteile).toEqual([{ name: 'Jähzorn', wert: 5 }])
    expect(r.npc.vorteile).toHaveLength(6)
    expect(r.npc.vorteile.every((v) => v.wert === null)).toBe(true)
  })
  it('Kampftalent der Waffe wird ergänzt', () => {
    const r = repair(base(), 'erfahren', false, false)
    expect(r.npc.talente.find((t) => t.name === 'Säbel')).toEqual({ name: 'Säbel', wert: 9 })
  })
  it('SF-Ketten: fehlende SF ergänzt, unerfüllbare entfernt', () => {
    const n = base()
    n.sonderfertigkeiten = ['Ausweichen II', 'Todesstoß']
    const r = repair(n, 'erfahren', false, false)
    expect(r.npc.sonderfertigkeiten).toEqual(['Ausweichen II', 'Ausweichen I', 'Aufmerksamkeit'])
    expect(r.repairs).toContain('SF „Todesstoß“ entfernt (MU 15, SF Gezielter Stich)')
    expect(dsa41.checkSfPrerequisites(dsa41.parseNscBlock(toBlock(r.npc)).data!)).toEqual([])
  })
  it('Energien nach Formel, Zauber/Liturgien nur mit Begabung/Weihe', () => {
    const n = base()
    n.LeP = 80
    n.AsP = 30
    n.zauber = [{ name: 'Balsam', wert: 5 }]
    n.liturgien = ['Eidsegen']
    const r = repair(n, 'erfahren', false, false)
    expect(r.npc.LeP).toBe(Math.round((13 + 13 + 13) / 2) + 10 + 6)
    expect(r.npc).toMatchObject({ AsP: null, zauber: [], KaP: null, liturgien: [] })
  })
})

describe('Sprachen und Schriften', () => {
  it('Buch-Schreibweise und doppelte Namen bekommen den Zusatz nur wo nötig', () => {
    const n = base()
    n.talente.push(
      { name: 'Sprachen Kennen [Garethi]', wert: 12 },
      { name: 'Lesen/Schreiben [Garethi]', wert: 6 },
      { name: 'Sprachen Kennen [Tulamidya]', wert: 10 },
      { name: 'Lesen/Schreiben [Tulamidya]', wert: 4 },
      { name: 'Zhayad', wert: 7 },
      { name: 'Zhayad', wert: 3 },
    )
    const r = repair(n, 'erfahren', false, false)
    expect(r.npc.talente.map((t) => t.name)).toEqual(
      expect.arrayContaining(['Garethi', 'Kusliker Zeichen', 'Tulamidya(Sprache)', 'Tulamidya(Schrift)', 'Zhayad(Sprache)', 'Zhayad(Schrift)']),
    )
    const p = dsa41.parseNscBlock(toBlock(r.npc))
    expect(p.issues.filter((i) => i.level === 'warning')).toEqual([])
    expect(p.data!.talente.filter((t) => t.name === 'Tulamidya').map((t) => [t.kind, t.value])).toEqual([['language', 10], ['scripture', 4]])
  })
})
