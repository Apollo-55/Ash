import { describe, expect, it } from 'vitest'
import type { BetaMessage, MessageCreateParamsNonStreaming } from '@anthropic-ai/sdk/resources/beta/messages/messages'
import * as dsa41 from '../../adapter/src/index.ts'
import { bookAbbreviations, bookTitle, creatureToBlock, generateNpcClaude, reviewCreature, type CreatureJson, generateNpcOpenAI, isRegister, PageStore, type CreateMessage, type NpcJson } from '../src/index.ts'

const pages = new PageStore({
  erstellt: '',
  buecher: [{ kurz: 'WdH', titel: 'Wege der Helden', datei: 'WdH.pdf', seiten: 300 }],
  seiten: [
    { buch: 'WdH', seite: 151, text: 'Handwerker / Handwerkerin (1 GP)\nVoraussetzungen: FF 11\nTalente: Grobschmied +5, Feinmechanik +3' },
    { buch: 'WdH', seite: 280, text: 'Kampfreflexe: Der INI-Basiswert steigt um 4. Voraussetzungen: INI-Basis 10' },
  ],
})

const npc = (talente: NpcJson['talente']): NpcJson => ({
  name: 'Topasa',
  rolle: 'Schmiedin',
  eigenschaften: { MU: 13, KL: 12, IN: 12, CH: 11, FF: 14, GE: 12, KO: 14, KK: 14 },
  LeP: 33,
  AuP: 33,
  AsP: null,
  KaP: null,
  waffen: ['Schmiedehammer'],
  ruestung: [],
  talente,
  zauber: [],
  liturgien: ['Eidsegen'],
  vorteile: [],
  nachteile: [{ name: 'Neugier', wert: 6 }],
  sonderfertigkeiten: ['Aufmerksamkeit', 'Rüstungsgewöhnung I', 'Wuchtschlag'],
  notiz: 'Tüftlerin',
})

const reply = (content: any[], stop: BetaMessage['stop_reason'] = 'tool_use'): BetaMessage =>
  ({
    id: 'm',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    content,
    stop_reason: stop,
    usage: { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 500, cache_creation_input_tokens: 0 },
  }) as unknown as BetaMessage

const use = (id: string, name: string, input: unknown) => ({ type: 'tool_use', id, name, input })

describe('Cloud-Modus (simuliertes Claude)', () => {
  it('sucht, liest, prüft Namen, korrigiert nach Rückmeldung und gibt ab', async () => {
    const requests: MessageCreateParamsNonStreaming[] = []
    const answers = [
      reply([use('t1', 'regelwerk_suchen', { anfrage: 'Handwerker', buch: null })]),
      reply([use('t2', 'seiten_lesen', { buch: 'WdH', seiten: [151] }), use('t3', 'katalog_suchen', { art: 'talent', anfrage: 'Schmied' })]),
      reply([use('t4', 'nsc_abgeben', { profession: 'Handwerker (WdH S. 151)', erfahrung: 'erfahren', gottheit: null, zauberkundig: false, quellen: ['WdH 151'], npc: npc([{ name: 'Schmieden', wert: 12 }]) })]),
      reply([
        use('t5', 'nsc_abgeben', {
          profession: 'Handwerker (WdH S. 151)',
          erfahrung: 'erfahren',
          gottheit: null,
          zauberkundig: false,
          quellen: ['WdH 151'],
          npc: npc([{ name: 'Grobschmied', wert: 12 }, { name: 'Feinmechanik', wert: 10 }, { name: 'Hiebwaffen', wert: 9 }]),
        }),
      ]),
    ]
    const create: CreateMessage = async (p) => (requests.push(structuredClone(p)), answers.shift()!)
    const steps: string[] = []
    const r = await generateNpcClaude(create, pages, { description: '## Zwergische Tüftlerin und Schmid', name: 'Topasa' }, { model: 'claude-opus-5-5' }, (s) => steps.push(s))

    // tool results reach Claude
    const results = (i: number) => JSON.stringify(requests[i].messages.at(-1))
    expect(results(1)).toContain('WdH S. 151')
    expect(results(2)).toContain('=== WdH S. 151 ===')
    expect(results(2)).toContain('Grobschmied')
    // first hand-in: unknown talent → is_error with the list, second accepted
    expect(results(3)).toContain('"is_error":true')
    expect(results(3)).toContain('Talent „Schmieden“')
    expect(r.rounds).toBe(2)
    expect(r.lookups).toBe(3)
    expect(r.quellen).toEqual(['WdH 151'])
    // repairs: not consecrated → no liturgies, Neugier is a disadvantage stays, name kept
    expect(r.block).not.toContain('Eidsegen')
    expect(dsa41.parseNscBlock(r.block.replace(/^```dsa-nsc\n|\n```$/g, '')).data).toMatchObject({ name: 'Topasa' })
    // request shape: caching, adaptive thinking, fallback opt-in for Opus
    expect(requests[0]).toMatchObject({ model: 'claude-opus-5-5', thinking: { type: 'adaptive' }, fallbacks: 'default', betas: ['server-side-fallback-2026-07-01'], cache_control: { type: 'ephemeral' } })
    expect(r.dollars).toBeGreaterThan(0)
    expect(steps.some((s) => s.includes('Sucht: „Handwerker“'))).toBe(true)
  })

  it('Haiku ohne Fallback; Ablehnung wird als Fehler gemeldet', async () => {
    let params: MessageCreateParamsNonStreaming | undefined
    const create: CreateMessage = async (p) => ((params = p), reply([], 'refusal'))
    await expect(generateNpcClaude(create, pages, { description: 'x' }, { model: 'claude-haiku-5-5' })).rejects.toThrow(/abgelehnt/)
    expect(params).not.toHaveProperty('fallbacks')
  })

  it('erinnert einmal an nsc_abgeben, wenn Claude nur Text schreibt', async () => {
    const answers = [
      reply([{ type: 'text', text: 'Hier ist der NSC …' }], 'end_turn'),
      reply([use('t1', 'nsc_abgeben', { profession: 'Wache', erfahrung: 'unerfahren', gottheit: null, zauberkundig: false, quellen: [], npc: npc([{ name: 'Hiebwaffen', wert: 6 }, { name: 'Sinnenschärfe', wert: 5 }]) })]),
    ]
    const create: CreateMessage = async () => answers.shift()!
    const r = await generateNpcClaude(create, pages, { description: 'Einfache Wache' }, { model: 'claude-sonnet-5-5' })
    expect(r.level).toBe('unerfahren')
    expect(r.issues.filter((i) => /gibt es in DSA 4.1 nicht/.test(i))).toEqual([])
  })
})

describe('Buchkürzel', () => {
  it('Initialen, bei Gleichstand längere Form für alle Beteiligten, sonst Nummern', () => {
    expect(bookAbbreviations(['Wege der Helden', 'Liber Liturgium', 'Wege der Zauberei', 'Wege des Schwerts', 'Liber Cantiones'])).toEqual(['WdH', 'LL', 'WdZ', 'WdS', 'LC'])
    expect(bookAbbreviations(['Aventurische Magie', 'Wege der Helden', 'Aventurische Meisterschaft'])).toEqual(['AvMa', 'WdH', 'AvMe'])
    expect(bookAbbreviations(['Wege der Helden', 'Wege der Heiligen', 'Wege der Helden'])).toEqual(['WedHe', 'WedHe2', 'WedHe3'])
    expect(bookTitle('DSA 4.1 - Wege des Schwerts (1).pdf')).toBe('Wege des Schwerts')
    const dupe = { erstellt: '', buecher: [{ kurz: 'AM', titel: 'A', datei: 'a.pdf', seiten: 1 }, { kurz: 'AM', titel: 'B', datei: 'b.pdf', seiten: 1 }], seiten: [] }
    expect(() => new PageStore(dupe)).toThrow(/doppelte Buchkürzel \(am\)/)
  })
})

describe('Seitensuche: Erklärseite vor Erwähnungen', () => {
  const register = Array.from({ length: 20 }, (_, i) => `Eintrag ${i} (SF)\n${200 + i}`).join('\n') + '\nMeisterparade (SF)\n281'
  const store = new PageStore({
    erstellt: '',
    buecher: [{ kurz: 'WdH', titel: 'Wege der Helden', datei: 'WdH.pdf', seiten: 400 }],
    seiten: [
      { buch: 'WdH', seite: 102, text: 'Söldner (GP je nach Einheit)\nSonderfertigkeiten: Meisterparade, Finte\nVerbilligt: Meisterparade, Binden, Meisterparade' },
      { buch: 'WdH', seite: 213, text: 'Talente: Kochen +1; Sonderfertigkeiten:\nMeisterparade; Verbilligte Sonderfertigkeiten: Binden' },
      { buch: 'WdH', seite: 281, text: 'Meisterparade: Erlaubt eine Parade mit Ansage. Voraussetzungen: PA-Basis 8' },
      { buch: 'WdH', seite: 61, text: 'Handwerker, Handwerker und nochmals Handwerker. Grobschmied, Grobschmied.' },
      { buch: 'WdH', seite: 151, text: 'Handwerker / Handwerkerin (1 GP)\nVoraussetzungen: FF 11\nGrobschmied +5' },
      { buch: 'WdH', seite: 329, text: register },
    ],
  })
  it('Regelseite mit „Begriff:“ und Professionskopf „Name (… GP)“ zuerst; Register und Aufzählungen dahinter', () => {
    expect(store.search('Meisterparade')[0].seite).toBe(281)
    expect(store.search('Handwerker Grobschmied')[0].seite).toBe(151)
    expect(store.search('Meisterparade').map((h) => h.seite).indexOf(329)).toBeGreaterThan(0)
  })
  it('erkennt Registerseiten', () => {
    expect(isRegister(register)).toBe(true)
    expect(isRegister('Meisterparade: Erlaubt eine Parade.')).toBe(false)
  })
})

describe('Seitensuche', () => {
  it('findet Seiten nach Wortanfängen und liest Seiten', () => {
    expect(pages.search('Kampfreflex')[0]).toMatchObject({ buch: 'WdH', seite: 280 })
    expect(pages.search('handwerker voraussetzungen', 'WdH')[0].seite).toBe(151)
    expect(pages.search('Handwerker', 'LL')).toEqual([])
    expect(pages.read('wdh', 151)).toContain('Grobschmied')
  })
})

describe('OpenAI-Modus (simuliert, Responses-API)', () => {
  const response = (output: any[], status = 'completed') =>
    ({ id: 'r', object: 'response', status, error: null, incomplete_details: null, output, usage: { input_tokens: 900, output_tokens: 100, total_tokens: 1000, input_tokens_details: { cached_tokens: 400 }, output_tokens_details: { reasoning_tokens: 0 } } }) as any
  const call = (id: string, name: string, args: unknown) => ({ type: 'function_call', id: 'fc_' + id, call_id: id, name, arguments: JSON.stringify(args), status: 'completed' })

  it('gleiche Werkzeuge, Verlauf zustandslos mitgeschickt, reasoning nur bei Reasoning-Modellen', async () => {
    const reqs: any[] = []
    const answers = [
      response([{ type: 'reasoning', id: 'rs_1', summary: [], encrypted_content: 'xyz' }, call('a', 'regelwerk_suchen', { anfrage: 'Handwerker', buch: null })]),
      response([call('b', 'nsc_abgeben', { profession: 'Handwerker', erfahrung: 'erfahren', gottheit: null, zauberkundig: false, quellen: ['WdH 151'], npc: npc([{ name: 'Grobschmied', wert: 12 }, { name: 'Feinmechanik', wert: 10 }, { name: 'Hiebwaffen', wert: 9 }]) })]),
    ]
    const create = async (p: any) => (reqs.push(structuredClone(p)), answers.shift())
    const r = await generateNpcOpenAI(create, pages, { description: 'Schmiedin', name: 'Topasa' }, { model: 'gpt-6-sol', effort: 'low' })
    expect(reqs[0]).toMatchObject({ model: 'gpt-6-sol', store: false, reasoning: { effort: 'low' }, include: ['reasoning.encrypted_content'] })
    expect(reqs[0].tools.map((t: any) => t.name)).toEqual(['regelwerk_suchen', 'seiten_lesen', 'katalog_suchen', 'nsc_abgeben', 'kreatur_abgeben'])
    expect(reqs[0].tools.every((t: any) => t.strict && t.type === 'function')).toBe(true)
    // second request carries reasoning item, the call and its output
    expect(reqs[1].input.map((i: any) => i.type ?? i.role)).toEqual(['user', 'reasoning', 'function_call', 'function_call_output'])
    expect(reqs[1].input.at(-1)).toMatchObject({ call_id: 'a' })
    expect(reqs[1].input.at(-1).output).toContain('WdH S. 151')
    expect(r.lookups).toBe(1)
    expect(r.tokens).toMatchObject({ input: 1000, cacheRead: 800, output: 200 })
    expect(r.block).toContain('name: Topasa')

    const plain: any[] = []
    await generateNpcOpenAI(async (p: any) => (plain.push(p), response([call('x', 'nsc_abgeben', { profession: 'Wache', erfahrung: 'unerfahren', gottheit: null, zauberkundig: false, quellen: [], npc: npc([{ name: 'Hiebwaffen', wert: 6 }]) })])), pages, { description: 'Wache' }, { model: 'gpt-4.1' })
    expect(plain[0]).not.toHaveProperty('reasoning')
  })

  it('abgeschnittene oder gefilterte Antwort wird als Fehler gemeldet', async () => {
    const create = async () => ({ ...response([], 'incomplete'), incomplete_details: { reason: 'content_filter' } })
    await expect(generateNpcOpenAI(create as any, pages, { description: 'x' }, { model: 'gpt-5.5' })).rejects.toThrow(/gefiltert/)
  })
})

describe('Kreatur-Modus', () => {
  const spider = (): CreatureJson => ({
    name: 'Höhlenspinne',
    rolle: 'Riesenspinne',
    eigenschaften: { MU: 14, KL: null, IN: 12, CH: null, FF: null, GE: 13, KO: 12, KK: 11 },
    LeP: 25,
    AuP: 30,
    AsP: null,
    MR: 4,
    RS: 2,
    GS: 8,
    INI: 12,
    ausweichen: 6,
    angriffe: [{ name: 'Biss', talent: null, AT: 12, PA: 0, FK: null, TP: '1W6+2', DK: 'H' }],
    talente: [{ name: 'Schleichen', wert: 10 }],
    sonderfertigkeiten: ['Gezielter Stich'],
    besonderheiten: [{ name: 'Giftbiss', beschreibung: 'Spinnengift Stufe 5, bei SP' }],
    notiz: 'Lauert in Höhlen.',
  })

  it('Block mit festen Werten, eigene Fähigkeiten als Sonderfertigkeit, nicht verknüpft – gültig', () => {
    const block = creatureToBlock(spider())
    const r = dsa41.parseNscBlock(block)
    expect(r.issues.filter((i) => i.level === 'error')).toEqual([])
    expect(r.data).toMatchObject({ name: 'Höhlenspinne', LeP: 25, MR: 4, RS: 2, GS: 8, INI: 12, verknuepft: false, attributes: { MU: 14, KK: 11 } })
    expect(r.data!.attributes).not.toHaveProperty('KL')
    expect(r.data!.waffen).toEqual([{ name: 'Biss', AT: 12, PA: 0, TP: '1W6+2', DK: 'H' }])
    const reviewed = reviewCreature(spider())
    expect(reviewed.creature.angriffe[0].talent).toBe('Raufen')
    expect(reviewed.issues).toEqual([])
    expect(r.data!.sonderfertigkeiten).toContainEqual({ name: 'Giftbiss', value: null, custom: { typ: 'Kreatur', beschreibung: 'Spinnengift Stufe 5, bei SP' } })
  })

  it('Prüfung: TP-Schreibweise, falsches Kampftalent, unbekannte Talente/SF', () => {
    const c = spider()
    c.angriffe = [{ name: 'Klaue', talent: 'Raufn', AT: 11, PA: 5, FK: null, TP: '1d6 + 1', DK: null }, { name: 'Schwanz', talent: 'Schwanzschlag', AT: 9, PA: null, FK: null, TP: 'viel', DK: null }]
    c.talente.push({ name: 'Netzbau', wert: 8 })
    c.sonderfertigkeiten.push('Netzschuss')
    const r = reviewCreature(structuredClone(c))
    expect(r.creature.angriffe[0]).toMatchObject({ talent: 'Raufen', TP: '1W6+1' })
    expect(r.needsFix).toBe(true)
    expect(r.issues.join('\n')).toMatch(/TP „viel“/)
    expect(r.issues.join('\n')).toMatch(/Kampftalent „Schwanzschlag“/)
    expect(r.issues.join('\n')).toMatch(/Talent „Netzbau“/)
    expect(r.issues.join('\n')).toMatch(/SF „Netzschuss“/)
    // last round: unknown removed or turned into creature abilities
    const d = reviewCreature(structuredClone(c), { dropUnknown: true })
    expect(d.creature.angriffe[1].talent).toBe('Raufen') // unknown talent dropped → natural attack
    expect(d.creature.talente.map((t) => t.name)).not.toContain('Netzbau')
    expect(d.creature.besonderheiten.map((b) => b.name)).toContain('Netzschuss')
  })

  it('Ablauf: Vorgabe Kreatur zeigt nur kreatur_abgeben, Ergebnis ist ein Kreaturblock', async () => {
    const reqs: MessageCreateParamsNonStreaming[] = []
    const answers = [reply([use('k1', 'kreatur_abgeben', { quellen: ['ZBA 120: Höhlenspinne'], kreatur: spider() })])]
    const create: CreateMessage = async (p) => (reqs.push(structuredClone(p)), answers.shift()!)
    const r = await generateNpcClaude(create, pages, { description: 'Riesige Spinne in einer Höhle', art: 'kreatur' }, { model: 'claude-sonnet-5-5' })
    expect((reqs[0].tools as any[]).map((t) => t.name)).toEqual(['regelwerk_suchen', 'seiten_lesen', 'katalog_suchen', 'kreatur_abgeben'])
    expect(JSON.stringify(reqs[0].messages[0])).toContain('Vorgabe: als Kreatur')
    expect(r.art).toBe('kreatur')
    expect(r.profession.name).toBe('Riesenspinne')
    expect(r.block).toContain('verknüpft: nein')
    expect(r.quellen).toEqual(['ZBA 120: Höhlenspinne'])
  })
})
