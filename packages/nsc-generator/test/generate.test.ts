import { describe, expect, it } from 'vitest'
import { dsa41 } from '../../core/src/index.ts'
import { generateNpc, Knowledge, repair, toBlock, type LlmClient, type NpcJson, type RulebookIndex } from '../src/index.ts'

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

describe('Vorauswahl der Profession', () => {
  const kb = new Knowledge({
    erstellt: '',
    buecher: [],
    professionen: [
      { name: 'Söldner / Söldnerin', buch: 'WdH', seite: 1, text: 'Variante Artillerist …' },
      { name: 'Spätweihe zum Kor-Geweihten', buch: 'WdH', seite: 2, text: '' },
      { name: 'Geweihter des Phex', buch: 'WdH', seite: 3, text: '' },
      { name: 'Handwerker / Handwerkerin', buch: 'WdH', seite: 4, text: '' },
      { name: 'Magier: Akademie der Hohen Magie & Arcanes Institut zu Punin', buch: 'WdH', seite: 5, text: '' },
      { name: 'Magier: Halle der Macht zu Lowangen', buch: 'WdH', seite: 6, text: '' },
      { name: 'Magier: Universität von Al’Anfa', buch: 'WdH', seite: 7, text: '' },
    ],
    liturgien: { Kor: { I: ['x'] }, Phex: { I: ['y'] } },
    sfVoraussetzungen: {},
  })
  it('Gottheit + Weihe-Wort in der Überschrift (auch mit Tippfehler) schlägt den Beruf', () => {
    expect(kb.candidates('## Kor Geweit Söldner\nschuldet zwei Phex-Geweihten Geld')[0]).toBe('Spätweihe zum Kor-Geweihten')
  })
  it('Synonyme und Ortsnamen', () => {
    expect(kb.candidates('## Zwergische Tüftlerin und Schmid')[0]).toBe('Handwerker / Handwerkerin')
    expect(kb.candidates('## ehem. Akademiemagister aus Punin')[0]).toMatch(/Punin/)
    expect(kb.candidates('## Geschützmeister')[0]).toBe('Söldner / Söldnerin')
    expect(kb.candidates('Ein neuer Anfang')).toEqual([])
  })
})

describe('Ablauf mit Fake-LLM', () => {
  const index: RulebookIndex = {
    erstellt: '',
    buecher: [],
    professionen: [
      { name: 'Seefahrer / Seefahrerin', buch: 'WdH', seite: 132, text: 'Kampf: Säbel +2 …' },
      { name: 'Geweihter des Praios', buch: 'WdH', seite: 207, text: 'Liturgien: …' },
    ],
    liturgien: { Praios: { I: ['Eidsegen', 'Innere Ruhe'], II: ['Wort der Wahrheit'], III: ['Licht des Herrn'] } },
    sfVoraussetzungen: {},
  }
  const kb = new Knowledge(index)

  it('wählt Profession, erzeugt Werte, korrigiert unbekannte Namen in einer zweiten Runde', async () => {
    const answers = [
      JSON.stringify({ profession: 'Seefahrer / Seefahrerin', erfahrung: 'kompetent', gottheit: null }),
      JSON.stringify({ ...base(), sonderfertigkeiten: ['Ausweichen I', 'Aufmerksamkeit', 'Rüstungsgewöhnung I', 'Finte', 'Wuchtschlag'], talente: [{ name: 'Seefahrt', wert: 14 }, { name: 'Wolkenlesen', wert: 5 }] }),
      JSON.stringify({ ...base(), sonderfertigkeiten: ['Ausweichen I', 'Aufmerksamkeit', 'Rüstungsgewöhnung I', 'Finte', 'Wuchtschlag'], talente: [{ name: 'Seefahrt', wert: 14 }, { name: 'Wettervorhersage', wert: 12 }] }),
    ]
    const prompts: string[] = []
    const llm: LlmClient = { label: 'fake', chat: async (m) => (prompts.push(m.at(-1)!.content), answers.shift()!) }
    const r = await generateNpc(llm, kb, { description: 'Alte Seebärin mit Säbel' })
    expect(r.profession.name).toBe('Seefahrer / Seefahrerin')
    expect(r.level).toBe('kompetent')
    expect(r.rounds).toBe(2)
    expect(prompts[2]).toContain('Talent „Wolkenlesen“ gibt es in DSA 4.1 nicht')
    expect(r.issues).toEqual([])
    expect(r.block).toMatch(/^```dsa-nsc\nname: Testa/)
    expect(r.block).toContain('Wettervorhersage: 12')
  })

  it('wählt zuerst aus der Vorauswahl, die volle Liste nur bei „keine davon passt“', async () => {
    const sf = ['Ausweichen I', 'Aufmerksamkeit', 'Rüstungsgewöhnung I']
    const values = JSON.stringify({ ...base(), sonderfertigkeiten: sf, talente: [{ name: 'Seefahrt', wert: 11 }, { name: 'Säbel', wert: 10 }, { name: 'Wettervorhersage', wert: 9 }] })
    const prompts: string[] = []
    const run = async (answers: string[]) => {
      prompts.length = 0
      const llm: LlmClient = { label: 'fake', chat: async (m) => (prompts.push(m.at(-1)!.content), answers.shift()!) }
      return generateNpc(llm, kb, { description: '## Seefahrerin\nAlte Seebärin' })
    }
    const short = await run([JSON.stringify({ profession: 'Seefahrer / Seefahrerin', erfahrung: 'erfahren', gottheit: null }), values])
    expect(prompts[0]).toContain('Kandidaten (nach Stichworten der Beschreibung):\n- Seefahrer / Seefahrerin: Kampf: Säbel')
    expect(prompts[0]).not.toContain('Alle Professionen')
    expect(short.profession.name).toBe('Seefahrer / Seefahrerin')
    const full = await run([
      JSON.stringify({ profession: 'keine davon passt', erfahrung: 'erfahren', gottheit: null }),
      JSON.stringify({ profession: 'Seefahrer / Seefahrerin', erfahrung: 'erfahren', gottheit: null }),
      values,
    ])
    expect(prompts[1]).toContain('Alle Professionen:\nSeefahrer / Seefahrerin; Geweihter des Praios')
    expect(full.profession.name).toBe('Seefahrer / Seefahrerin')
  })

  it('Geweihte bekommen Liturgien ihres Gottes bis zum Grad der Erfahrung', async () => {
    const answers = [
      JSON.stringify({ profession: 'Geweihter des Praios', erfahrung: 'erfahren', gottheit: 'Praios' }),
      JSON.stringify({ ...base(), sonderfertigkeiten: ['Ausweichen I', 'Aufmerksamkeit', 'Rüstungsgewöhnung I', 'Finte', 'Wuchtschlag'], KaP: 28, talente: [{ name: 'Menschenkenntnis', wert: 11 }, { name: 'Götter/Kulte', wert: 12 }], liturgien: ['Eidsegen', 'Wort der Wahrheit'] }),
    ]
    const prompts: string[] = []
    const llm: LlmClient = { label: 'fake', chat: async (m) => (prompts.push(m.at(-1)!.content), answers.shift()!) }
    const r = await generateNpc(llm, kb, { description: 'Strenger Richter des Sonnengottes' })
    expect(prompts[1]).toContain('Grad I: Eidsegen, Innere Ruhe')
    expect(prompts[1]).toContain('Grad II: Wort der Wahrheit')
    expect(prompts[1]).not.toContain('Licht des Herrn')
    expect(r.god).toBe('Praios')
    expect(r.block).toContain('KaP: 28')
    expect(r.block).toContain('liturgien: [Eidsegen, Wort der Wahrheit]')
  })
})
