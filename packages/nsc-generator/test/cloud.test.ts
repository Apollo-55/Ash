import { describe, expect, it } from 'vitest'
import type { BetaMessage, MessageCreateParamsNonStreaming } from '@anthropic-ai/sdk/resources/beta/messages/messages'
import { dsa41 } from '../../core/src/index.ts'
import { generateNpcClaude, generateNpcOpenAI, PageStore, type CreateMessage, type NpcJson } from '../src/index.ts'

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

describe('Seitensuche', () => {
  it('findet Seiten nach Wortanfängen und liest Seiten', () => {
    expect(pages.search('Kampfreflex')[0]).toMatchObject({ buch: 'WdH', seite: 280 })
    expect(pages.search('handwerker voraussetzungen', 'WdH')[0].seite).toBe(151)
    expect(pages.search('Handwerker', 'LL')).toEqual([])
    expect(pages.read('wdh', 151)).toContain('Grobschmied')
  })
})

describe('OpenAI-Modus (simuliert)', () => {
  const completion = (message: any, finish = 'tool_calls') =>
    ({ id: 'c', object: 'chat.completion', created: 0, model: 'gpt-x', choices: [{ index: 0, finish_reason: finish, message: { role: 'assistant', content: null, refusal: null, ...message } }], usage: { prompt_tokens: 900, completion_tokens: 100, total_tokens: 1000, prompt_tokens_details: { cached_tokens: 400 } } }) as any
  const call = (id: string, name: string, args: unknown) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } })

  it('gleiche Werkzeuge, Ergebnisse als tool-Nachrichten, reasoning_effort nur bei Reasoning-Modellen', async () => {
    const reqs: any[] = []
    const answers = [
      completion({ tool_calls: [call('a', 'regelwerk_suchen', { anfrage: 'Handwerker', buch: null })] }),
      completion({ tool_calls: [call('b', 'nsc_abgeben', { profession: 'Handwerker', erfahrung: 'erfahren', gottheit: null, zauberkundig: false, quellen: ['WdH 151'], npc: npc([{ name: 'Grobschmied', wert: 12 }, { name: 'Feinmechanik', wert: 10 }, { name: 'Hiebwaffen', wert: 9 }]) })] }),
    ]
    const create = async (p: any) => (reqs.push(structuredClone(p)), answers.shift())
    const r = await generateNpcOpenAI(create, pages, { description: 'Schmiedin', name: 'Topasa' }, { model: 'gpt-5-mini', effort: 'low' })
    expect(reqs[0]).toMatchObject({ model: 'gpt-5-mini', reasoning_effort: 'low', parallel_tool_calls: true })
    expect(reqs[0].tools.map((t: any) => t.function.name)).toEqual(['regelwerk_suchen', 'seiten_lesen', 'katalog_suchen', 'nsc_abgeben'])
    expect(reqs[0].tools.every((t: any) => t.function.strict)).toBe(true)
    expect(reqs[1].messages.at(-1)).toMatchObject({ role: 'tool', tool_call_id: 'a' })
    expect(reqs[1].messages.at(-1).content).toContain('WdH S. 151')
    expect(r.lookups).toBe(1)
    expect(r.tokens).toMatchObject({ input: 1000, cacheRead: 800, output: 200 })
    expect(r.dollars).toBeUndefined()
    expect(r.block).toContain('name: Topasa')

    const plain: any[] = []
    await generateNpcOpenAI(async (p: any) => (plain.push(p), completion({ tool_calls: [call('x', 'nsc_abgeben', { profession: 'Wache', erfahrung: 'unerfahren', gottheit: null, zauberkundig: false, quellen: [], npc: npc([{ name: 'Hiebwaffen', wert: 6 }]) })] })), pages, { description: 'Wache' }, { model: 'gpt-4.1' })
    expect(plain[0]).not.toHaveProperty('reasoning_effort')
  })
})
