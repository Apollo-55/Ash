// Cloud mode: Claude builds the NPC like a game master with the books on the table – it searches
// the local page index, reads single pages, looks up official names in the dsa-41 catalog and
// hands in the result. The PDFs stay local; only the pages Claude asks for are sent.
import Anthropic from '@anthropic-ai/sdk'
import type { BetaMessage, BetaMessageParam, BetaTool, BetaToolResultBlockParam, BetaToolUseBlock, MessageCreateParamsNonStreaming } from '@anthropic-ai/sdk/resources/beta/messages/messages'
import { LIST_TYPES } from '../../core/src/systems/dsa41/schema.ts'
import { searchNames } from '../../core/src/systems/dsa41/catalog.ts'
import { LEVEL_HINT, LEVELS, npcSchema, review, toBlock, type GenerateInput, type GenerateResult, type Level, type NpcJson } from './generate.ts'
import type { PageStore } from './pages.ts'

export const CLAUDE_MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (beste Qualität)', input: 4, output: 20, cacheRead: 0.2 },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (gut, günstiger)', input: 2, output: 10, cacheRead: 0.2 },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (schnell, sehr günstig)', input: 0.1, output: 0.5, cacheRead: 0.01 },
] as const

export type Effort = 'low' | 'medium' | 'high'

/** what the generator needs from the SDK – injectable for tests */
export type CreateMessage = (params: MessageCreateParamsNonStreaming) => Promise<BetaMessage>

/** apiKey undefined → the SDK's usual chain (ANTHROPIC_API_KEY, `ant auth login` profile) – for the CLI tools */
export function claudeClient(apiKey: string | undefined, fetchFn?: typeof fetch): CreateMessage {
  // dangerouslyAllowBrowser: the Obsidian plugin runs in Electron's renderer; the key is the user's own.
  const client = new Anthropic({ ...(apiKey ? { apiKey } : {}), fetch: fetchFn, dangerouslyAllowBrowser: true, maxRetries: 2 })
  return (params) => client.beta.messages.create(params)
}

/** Checks key and model without generating anything (the models endpoint is free). */
export async function checkClaude(apiKey: string, model: string, fetchFn?: typeof fetch): Promise<string> {
  try {
    const client = new Anthropic({ apiKey, fetch: fetchFn, dangerouslyAllowBrowser: true, maxRetries: 0 })
    const m = await client.models.retrieve(model)
    return `verbunden, Modell ${m.display_name ?? model} verfügbar`
  } catch (e) {
    throw explain(e)
  }
}

/** API errors in plain German */
export function explain(e: unknown): Error {
  if (e instanceof Anthropic.AuthenticationError) return new Error('API-Schlüssel ungültig – in den Einstellungen prüfen (console.anthropic.com → API Keys).')
  if (e instanceof Anthropic.PermissionDeniedError) return new Error('Kein Zugriff auf dieses Modell mit diesem Schlüssel.')
  if (e instanceof Anthropic.NotFoundError) return new Error('Modell nicht gefunden – Modellname in den Einstellungen prüfen.')
  if (e instanceof Anthropic.RateLimitError) return new Error('Zu viele Anfragen oder Guthaben/Limit erreicht – kurz warten oder Konto prüfen.')
  if (e instanceof Anthropic.APIConnectionError) return new Error('Keine Verbindung zu Anthropic – Internet prüfen.')
  if (e instanceof Anthropic.APIError) return new Error(`Anthropic-Fehler ${e.status ?? ''}: ${e.message}`)
  return e instanceof Error ? e : new Error(String(e))
}

export interface CloudOptions {
  model: string
  effort?: Effort
  /** max. model turns (each lookup is one turn) */
  maxTurns?: number
}

export interface CloudResult extends GenerateResult {
  quellen: string[]
  lookups: number
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number }
  /** approximate cost in US dollars (list prices) */
  dollars: number
}

const ART: Record<string, string[]> = {
  talent: LIST_TYPES.talente,
  zauber: LIST_TYPES.zauber,
  liturgie: LIST_TYPES.liturgien,
  vorteil: LIST_TYPES.vorteile,
  nachteil: LIST_TYPES.nachteile,
  sonderfertigkeit: LIST_TYPES.sonderfertigkeiten,
  waffe: ['meleeWeapon', 'rangedWeapon'],
  ruestung: ['armor'],
}

/** strict tool schemas: every object closed, no numeric/length constraints */
function strictify(s: any): any {
  if (Array.isArray(s)) return s.map(strictify)
  if (!s || typeof s !== 'object') return s
  const out: any = {}
  for (const [k, v] of Object.entries(s)) if (!['minimum', 'maximum', 'maxItems', 'minItems'].includes(k)) out[k] = strictify(v)
  if (out.type === 'object') out.additionalProperties = false
  return out
}

function tools(pages: PageStore): BetaTool[] {
  const books = pages.books().map((b) => b.kurz)
  const npc = npcSchema()
  return [
    {
      name: 'regelwerk_suchen',
      description:
        'Volltextsuche in den Regelwerken (DSA 4.1). Liefert bis zu 8 Seiten mit Auszug. Nutze genaue Begriffe aus den Büchern (z. B. „Handwerker Voraussetzungen“, „Kampfreflexe“, „Spätweihe Kor“).',
      strict: true,
      input_schema: {
        type: 'object',
        properties: { anfrage: { type: 'string' }, buch: { type: ['string', 'null'], enum: [...books, null], description: 'nur in diesem Buch suchen' } },
        required: ['anfrage', 'buch'],
        additionalProperties: false,
      },
    },
    {
      name: 'seiten_lesen',
      description: 'Liest bis zu 4 Seiten eines Buchs im Volltext (PDF-Seitenzahlen wie in den Suchergebnissen).',
      strict: true,
      input_schema: {
        type: 'object',
        properties: { buch: { type: 'string', enum: books }, seiten: { type: 'array', items: { type: 'integer' } } },
        required: ['buch', 'seiten'],
        additionalProperties: false,
      },
    },
    {
      name: 'katalog_suchen',
      description:
        'Sucht offizielle Namen im Kompendium des Foundry-Systems dsa-41 (nur diese Namen werden erkannt). Gibt bis zu 25 Treffer, die alle Suchwörter enthalten.',
      strict: true,
      input_schema: {
        type: 'object',
        properties: { art: { type: 'string', enum: Object.keys(ART) }, anfrage: { type: 'string' } },
        required: ['art', 'anfrage'],
        additionalProperties: false,
      },
    },
    {
      name: 'nsc_abgeben',
      description: 'Gibt den fertigen NSC ab. Wird geprüft; bei Problemen kommt eine Liste zurück, dann korrigieren und erneut abgeben.',
      strict: true,
      input_schema: strictify({
        type: 'object',
        properties: {
          profession: { type: 'string', description: 'Profession/Rolle, an der du dich orientiert hast, mit Fundstelle, z. B. „Handwerker (WdH S. 151)“' },
          erfahrung: { type: 'string', enum: [...LEVELS] },
          gottheit: { type: ['string', 'null'], description: 'nur wenn die Figur heute geweiht ist' },
          zauberkundig: { type: 'boolean' },
          quellen: { type: 'array', items: { type: 'string' }, description: 'genutzte Fundstellen, z. B. „WdH 280: Kampfreflexe“' },
          npc,
        },
        required: ['profession', 'erfahrung', 'gottheit', 'zauberkundig', 'quellen', 'npc'],
      }),
    },
  ]
}

function system(pages: PageStore): string {
  const books = pages.books().map((b) => `${b.kurz} = ${b.titel}`).join(', ')
  const levels = LEVELS.map((l) => `- ${l}: ${LEVEL_HINT[l].taw}; ${LEVEL_HINT[l].ap}; Eigenschaftssumme ${LEVEL_HINT[l].attrSum}`).join('\n')
  return `Du bist ein erfahrener Spielleiter für Das Schwarze Auge 4.1 und erstellst Spielwerte für Nichtspielercharaktere und Gegner aus einer Beschreibung.

Dir liegen diese Regelwerke als Seiten vor: ${books}. Seitenzahlen sind PDF-Seiten. Wege des Schwerts und Liber Cantiones sind nicht lesbar – dafür dein eigenes Regelwissen nutzen.

Vorgehen:
1. Beschreibung verstehen: Was macht die Figur, wie gut ist sie darin, kämpft sie, zaubert sie, ist sie heute geweiht? Die Beschreibung hat Vorrang. Eine Profession aus „Wege der Helden“ ist nur Orientierung, kein Korsett – bei einfachen Gegnern (Wache, Bandit, Schläger, Tier) reicht oft gar keine.
2. Gezielt nachschlagen, was du nicht sicher weißt (Professionspaket, SF-Voraussetzungen, Liturgien eines Gottes, Zauber). Sparsam: meist reichen 2–6 Abfragen, bei einfachen Gegnern 0–2.
3. Offizielle Namen mit katalog_suchen prüfen, wenn du unsicher bist – nur Namen aus dem Katalog werden in Foundry erkannt (Sprachen heißen z. B. „Garethi“, Schriften „Kusliker Zeichen“).
4. Mit nsc_abgeben abgeben. Kommen Probleme zurück, korrigieren und erneut abgeben.

Regeln:
- Talentwerte (TaW) nach Erfahrung, nicht die Startboni aus dem Paket übernehmen:
${levels}
- 12–25 Talente bei vollwertigen NSCs (Kampftalente der Waffen, Berufs- und Wissenstalente, Sprachen), bei einfachen Gegnern die kampfrelevanten.
- Sonderfertigkeiten passend zu Rolle und Erfahrung, Voraussetzungen und Ketten beachten (Ausweichen II braucht Ausweichen I usw.).
- LeP/AuP als Gesamtwert (Mensch: LeP ≈ (KO+KO+KK)/2 + 10 + Zukauf). AsP nur für Zauberkundige, KaP und Liturgien nur für heute Geweihte (Liturgien des eigenen Gottes, Grad passend zur Erfahrung).
- Waffen mit Namen aus dem Arsenal, ohne AT/PA – das System rechnet sie aus dem Talentwert.
- Gerüchte mit (F)/falsch sind nicht wahr und prägen die Werte nicht; (W)/wahr schon.
- notiz: 1–2 Sätze, was die Werte prägt.
- Antworte knapp; dein Ergebnis ist ausschließlich der Aufruf von nsc_abgeben.`
}

const PER_MILLION = (model: string) => CLAUDE_MODELS.find((m) => m.id === model) ?? CLAUDE_MODELS[0]

export async function generateNpcClaude(
  create: CreateMessage,
  pages: PageStore,
  input: GenerateInput,
  opts: CloudOptions,
  onStep?: (msg: string) => void
): Promise<CloudResult> {
  const t0 = Date.now()
  const step = (m: string) => onStep?.(m)
  const maxTurns = opts.maxTurns ?? 16
  const toolList = tools(pages)
  const fallback = /opus|sonnet/.test(opts.model)
  const user = [
    `Beschreibung des NSC:\n${input.description}`,
    input.name ? `Name: ${input.name}` : '',
    input.level ? `Erfahrung (vorgegeben): ${input.level}` : '',
    input.profession ? `Profession (vorgegeben): ${input.profession}` : '',
  ].filter(Boolean).join('\n\n')
  const messages: BetaMessageParam[] = [{ role: 'user', content: user }]
  const tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
  let lookups = 0
  let submissions = 0
  let nudged = false
  let last: { block: string; profession: string; level: Level; god: string | null; repairs: string[]; issues: string[]; quellen: string[] } | null = null

  for (let turn = 0; turn < maxTurns; turn++) {
    step(turn === 0 ? `Claude liest die Beschreibung …` : `Claude arbeitet … (${lookups} Nachschlagen)`)
    let res: BetaMessage
    try {
      res = await create({
      model: opts.model,
      max_tokens: 16000,
      system: [{ type: 'text', text: system(pages), cache_control: { type: 'ephemeral' } }],
      tools: toolList,
      messages,
      cache_control: { type: 'ephemeral' }, // caches the growing conversation between turns
      thinking: { type: 'adaptive' },
      output_config: { effort: opts.effort ?? 'medium' },
      ...(fallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
      })
    } catch (e) {
      throw explain(e)
    }
    tokens.input += res.usage.input_tokens
    tokens.output += res.usage.output_tokens
    tokens.cacheRead += res.usage.cache_read_input_tokens ?? 0
    tokens.cacheWrite += res.usage.cache_creation_input_tokens ?? 0

    if (res.stop_reason === 'refusal') throw new Error('Claude hat die Anfrage abgelehnt. Beschreibung umformulieren und erneut versuchen.')
    if (res.stop_reason === 'max_tokens') throw new Error('Claudes Antwort war zu lang (max_tokens). Bitte erneut versuchen.')
    messages.push({ role: 'assistant', content: res.content })
    if (res.stop_reason === 'pause_turn') continue

    const calls = res.content.filter((b): b is BetaToolUseBlock => b.type === 'tool_use')
    if (!calls.length) {
      if (last || nudged) break
      nudged = true
      messages.push({ role: 'user', content: 'Bitte gib den NSC jetzt mit nsc_abgeben ab.' })
      continue
    }
    const results: BetaToolResultBlockParam[] = []
    let done = false
    for (const call of calls) {
      const args = call.input as any
      try {
        if (call.name === 'regelwerk_suchen') {
          lookups++
          step(`Sucht: „${args.anfrage}“${args.buch ? ` in ${args.buch}` : ''}`)
          const hits = pages.search(String(args.anfrage ?? ''), args.buch, 8)
          results.push({ type: 'tool_result', tool_use_id: call.id, content: hits.length ? hits.map((h) => `${h.buch} S. ${h.seite}: …${h.auszug}…`).join('\n\n') : 'Keine Treffer.' })
        } else if (call.name === 'seiten_lesen') {
          lookups++
          const nums = (Array.isArray(args.seiten) ? args.seiten : []).slice(0, 4).map(Number)
          step(`Liest ${args.buch} S. ${nums.join(', ')}`)
          const text = nums.map((n: number) => `=== ${args.buch} S. ${n} ===\n${pages.read(String(args.buch), n) ?? '(Seite nicht vorhanden oder nicht lesbar)'}`).join('\n\n')
          results.push({ type: 'tool_result', tool_use_id: call.id, content: text })
        } else if (call.name === 'katalog_suchen') {
          lookups++
          const types = ART[String(args.art)]
          if (!types) throw new Error(`unbekannte Art „${args.art}“`)
          const names = searchNames(types, String(args.anfrage ?? ''), 25)
          results.push({ type: 'tool_result', tool_use_id: call.id, content: names.length ? names.join('\n') : 'Kein passender Name im Katalog.' })
        } else if (call.name === 'nsc_abgeben') {
          submissions++
          step(submissions === 1 ? 'Prüft das Ergebnis …' : `Prüft die Korrektur ${submissions - 1} …`)
          if (!args?.npc || typeof args.npc !== 'object') throw new Error('Feld npc fehlt')
          const level: Level = input.level ?? (LEVELS.includes(args.erfahrung) ? args.erfahrung : 'erfahren')
          const god: string | null = args.gottheit || null
          const npc = args.npc as NpcJson
          if (input.name) npc.name = input.name
          const r = review(npc, { level, consecrated: !!god, spellcaster: !!args.zauberkundig, god })
          last = {
            block: '```dsa-nsc\n' + toBlock(r.npc) + '\n```',
            profession: String(args.profession ?? ''),
            level,
            god,
            repairs: r.repairs,
            issues: r.issues,
            quellen: Array.isArray(args.quellen) ? args.quellen.map(String) : [],
          }
          if (r.needsFix && submissions < 3) {
            results.push({ type: 'tool_result', tool_use_id: call.id, is_error: true, content: `Bitte korrigieren und erneut abgeben:\n- ${r.issues.join('\n- ')}` })
          } else {
            results.push({ type: 'tool_result', tool_use_id: call.id, content: 'Angenommen.' })
            done = true
          }
        } else {
          throw new Error(`unbekanntes Werkzeug ${call.name}`)
        }
      } catch (e) {
        results.push({ type: 'tool_result', tool_use_id: call.id, is_error: true, content: `Fehler: ${(e as Error).message}` })
      }
    }
    messages.push({ role: 'user', content: results })
    if (done) break
  }
  if (!last) throw new Error('Claude hat keinen NSC abgegeben (zu viele Nachschlage-Runden). Bitte erneut versuchen.')
  const price = PER_MILLION(opts.model)
  const dollars = (tokens.input * price.input + tokens.cacheWrite * price.input * 1.25 + tokens.cacheRead * price.cacheRead + tokens.output * price.output) / 1e6
  return {
    block: last.block,
    profession: { name: last.profession, buch: '', seite: 0 },
    level: last.level,
    god: last.god,
    repairs: last.repairs,
    issues: last.issues,
    rounds: submissions,
    seconds: (Date.now() - t0) / 1000,
    quellen: last.quellen,
    lookups,
    tokens,
    dollars,
  }
}
