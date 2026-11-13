// Shared part of the cloud modes (Claude, OpenAI): the model builds the NPC like a game master with
// the books on the table – it searches the local page index, reads single pages, looks up official
// names in the dsa-41 catalog and hands in the result, which is checked and repaired here.
// The PDFs stay local; only the pages the model asks for are sent.
import { searchNames } from '../../adapter/src/catalog.ts'
import { LIST_TYPES } from '../../adapter/src/schema.ts'
import { LEVEL_HINT, LEVELS, npcSchema, review, toBlock, type GenerateInput, type GenerateResult, type Level, type NpcJson } from './generate.ts'
import type { PageStore } from './pages.ts'
import { creatureSchema, creatureToBlock, reviewCreature, type CreatureJson } from './creature.ts'

export type Effort = 'low' | 'medium' | 'high'

export interface CloudOptions {
  model: string
  effort?: Effort
  /** max. model turns (each lookup is one turn) */
  maxTurns?: number
}

export interface CloudResult extends GenerateResult {
  art: 'person' | 'kreatur'
  quellen: string[]
  lookups: number
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number }
  /** approximate cost in US dollars (list prices); undefined when the price of the model is unknown */
  dollars?: number
}

/** a tool independent of the provider: name, description, JSON schema (strict: closed objects, all required) */
export interface ToolSpec {
  name: string
  description: string
  parameters: Record<string, unknown>
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
export function strictify(s: any): any {
  if (Array.isArray(s)) return s.map(strictify)
  if (!s || typeof s !== 'object') return s
  const out: any = {}
  for (const [k, v] of Object.entries(s)) if (!['minimum', 'maximum', 'maxItems', 'minItems'].includes(k)) out[k] = strictify(v)
  if (out.type === 'object') out.additionalProperties = false
  return out
}

export function toolSpecs(pages: PageStore, art?: 'person' | 'kreatur'): ToolSpec[] {
  const books = pages.books().map((b) => b.kurz)
  const all: ToolSpec[] = [
    {
      name: 'regelwerk_suchen',
      description:
        'Volltextsuche in den Regelwerken (DSA 4.1). Liefert bis zu 8 Seiten mit Auszug. Nutze genaue Begriffe aus den Büchern (z. B. „Handwerker Voraussetzungen“, „Kampfreflexe“, „Spätweihe Kor“).',
      parameters: {
        type: 'object',
        properties: { anfrage: { type: 'string' }, buch: { type: ['string', 'null'], enum: [...books, null], description: 'nur in diesem Buch suchen' } },
        required: ['anfrage', 'buch'],
        additionalProperties: false,
      },
    },
    {
      name: 'seiten_lesen',
      description: 'Liest bis zu 4 Seiten eines Buchs im Volltext (PDF-Seitenzahlen wie in den Suchergebnissen).',
      parameters: {
        type: 'object',
        properties: { buch: { type: 'string', enum: books }, seiten: { type: 'array', items: { type: 'integer' } } },
        required: ['buch', 'seiten'],
        additionalProperties: false,
      },
    },
    {
      name: 'katalog_suchen',
      description: 'Sucht offizielle Namen im Kompendium des Foundry-Systems dsa-41 (nur diese Namen werden erkannt). Gibt bis zu 25 Treffer, die alle Suchwörter enthalten.',
      parameters: {
        type: 'object',
        properties: { art: { type: 'string', enum: Object.keys(ART) }, anfrage: { type: 'string' } },
        required: ['art', 'anfrage'],
        additionalProperties: false,
      },
    },
    {
      name: 'nsc_abgeben',
      description: 'Gibt den fertigen NSC ab. Wird geprüft; bei Problemen kommt eine Liste zurück, dann korrigieren und erneut abgeben.',
      parameters: strictify({
        type: 'object',
        properties: {
          profession: { type: 'string', description: 'Profession/Rolle, an der du dich orientiert hast, mit Fundstelle, z. B. „Handwerker (WdH S. 151)“' },
          erfahrung: { type: 'string', enum: [...LEVELS] },
          gottheit: { type: ['string', 'null'], description: 'nur wenn die Figur heute geweiht ist' },
          zauberkundig: { type: 'boolean' },
          quellen: { type: 'array', items: { type: 'string' }, description: 'genutzte Fundstellen, z. B. „WdH 280: Kampfreflexe“' },
          npc: npcSchema(),
        },
        required: ['profession', 'erfahrung', 'gottheit', 'zauberkundig', 'quellen', 'npc'],
      }),
    },
    {
      name: 'kreatur_abgeben',
      description:
        'Gibt eine Kreatur oder einen einfachen Gegner mit FESTEN Werten ab (wie im Bestiarium: LeP, RS, MR, GS, INI, Angriffe mit AT/PA/TP, Besonderheiten). Wird geprüft; bei Problemen korrigieren und erneut abgeben.',
      parameters: strictify({
        type: 'object',
        properties: {
          quellen: { type: 'array', items: { type: 'string' }, description: 'genutzte Fundstellen, z. B. „ZBA 120: Höhlenspinne“' },
          kreatur: creatureSchema(),
        },
        required: ['quellen', 'kreatur'],
      }),
    },
  ]
  return all.filter((t) => (art === 'kreatur' ? t.name !== 'nsc_abgeben' : art === 'person' ? t.name !== 'kreatur_abgeben' : true))
}

export function systemPrompt(pages: PageStore): string {
  const books = pages.books().map((b) => `${b.kurz} = ${b.titel}`).join(', ')
  const levels = LEVELS.map((l) => `- ${l}: ${LEVEL_HINT[l].taw}; ${LEVEL_HINT[l].ap}; Eigenschaftssumme ${LEVEL_HINT[l].attrSum}`).join('\n')
  return `Du bist ein erfahrener Spielleiter für Das Schwarze Auge 4.1 und erstellst Spielwerte für Nichtspielercharaktere und Gegner aus einer Beschreibung.

Dir liegen diese Regelwerke als Seiten vor: ${books}. Seitenzahlen sind PDF-Seiten. Wege des Schwerts und Liber Cantiones sind nicht lesbar – dafür dein eigenes Regelwissen nutzen.

Vorgehen:
1. Beschreibung verstehen: Was macht die Figur, wie gut ist sie darin, kämpft sie, zaubert sie, ist sie heute geweiht? Die Beschreibung hat Vorrang. Eine Profession aus „Wege der Helden“ ist nur Orientierung, kein Korsett – bei einfachen Gegnern (Wache, Bandit, Schläger, Tier) reicht oft gar keine.
2. Gezielt nachschlagen, was du nicht sicher weißt (Professionspaket, SF-Voraussetzungen, Liturgien eines Gottes, Zauber). Sparsam: meist reichen 2–6 Abfragen, bei einfachen Gegnern 0–2.
3. Offizielle Namen mit katalog_suchen prüfen, wenn du unsicher bist – nur Namen aus dem Katalog werden in Foundry erkannt (Sprachen heißen z. B. „Garethi“, Schriften „Kusliker Zeichen“; gibt es einen Namen als Sprache und als Schrift, „Tulamidya(Sprache)“ bzw. „Tulamidya(Schrift)“ schreiben).
4. Mit nsc_abgeben abgeben. Kommen Probleme zurück, korrigieren und erneut abgeben.

Regeln:
- Talentwerte (TaW) nach Erfahrung, nicht die Startboni aus dem Paket übernehmen:
${levels}
- 12–25 Talente bei vollwertigen NSCs (Kampftalente der Waffen, Berufs- und Wissenstalente, Sprachen), bei einfachen Gegnern die kampfrelevanten.
- Sonderfertigkeiten passend zu Rolle und Erfahrung, Voraussetzungen und Ketten beachten (Ausweichen II braucht Ausweichen I usw.).
- LeP/AuP als Gesamtwert (Mensch: LeP ≈ (KO+KO+KK)/2 + 10 + Zukauf). AsP nur für Zauberkundige, KaP und Liturgien nur für heute Geweihte (Liturgien des eigenen Gottes, Grad passend zur Erfahrung).
- Waffen mit Namen aus dem Arsenal, ohne AT/PA – das System rechnet sie aus dem Talentwert.
- Vor- und Nachteile: nur Zahl angeben, wo der Vor-/Nachteil eine Stufe hat (z. B. „Jähzorn 6“), sonst null.
- Gerüchte mit (F)/falsch sind nicht wahr und prägen die Werte nicht; (W)/wahr schon.
- notiz: 1–2 Sätze, was die Werte prägt.
- Antworte knapp; dein Ergebnis ist ausschließlich der Aufruf von nsc_abgeben bzw. kreatur_abgeben.

Person oder Kreatur:
- nsc_abgeben: Personen mit Beruf, Geschichte und Talenten (NSCs, benannte Gegner). Werte nach den Formeln oben.
- kreatur_abgeben: Tiere, Monster, Dämonen, Untote, Elementare – und namenlose einfache Gegner (Wache, Räuber, Schläger), wenn keine Talente gebraucht werden. FESTE Werte wie im Bestiarium: LeP, AuP, RS, MR, GS, INI, Ausweichen, Angriffe mit AT/PA (bzw. FK), TP als Würfelausdruck und Distanzklasse; Besonderheiten (Gift, Fliegen, Schwarm, Furcht, Regeneration …) mit kurzem Regeltext. Steht die Kreatur in einem Regelwerk, übernimm dessen Werte und gib die Fundstelle an. Eigenschaften nur, wenn bekannt oder für Proben nötig (sonst null). Kampftalent nur für Waffen und Raufen/Ringen, sonst null.`
}

export function artHint(art?: 'person' | 'kreatur'): string {
  return art === 'kreatur' ? 'Vorgabe: als Kreatur mit festen Werten abgeben (kreatur_abgeben).' : art === 'person' ? 'Vorgabe: als Person abgeben (nsc_abgeben).' : ''
}

export function userPrompt(input: GenerateInput): string {
  return [
    `Beschreibung des NSC:\n${input.description}`,
    input.name ? `Name: ${input.name}` : '',
    input.level ? `Erfahrung (vorgegeben): ${input.level}` : '',
    input.profession ? `Profession (vorgegeben): ${input.profession}` : '',
    artHint(input.art),
  ]
    .filter(Boolean)
    .join('\n\n')
}

export interface ToolOutcome {
  content: string
  isError: boolean
  /** the NPC was accepted – the loop can stop */
  done: boolean
}

/** Executes the tools for one NPC and keeps the state (lookups, hand-ins, last result). */
export class ToolRunner {
  lookups = 0
  submissions = 0
  last: { block: string; profession: string; level: Level; god: string | null; repairs: string[]; issues: string[]; quellen: string[]; art: 'person' | 'kreatur' } | null = null

  private pages: PageStore
  private input: GenerateInput
  private step: (msg: string) => void

  // explicit fields: Node's type stripping (CLI tools) does not support parameter properties
  constructor(pages: PageStore, input: GenerateInput, step: (msg: string) => void = () => {}) {
    this.pages = pages
    this.input = input
    this.step = step
  }

  run(name: string, args: any): ToolOutcome {
    try {
      return this.exec(name, args ?? {})
    } catch (e) {
      return { content: `Fehler: ${(e as Error).message}`, isError: true, done: false }
    }
  }

  private exec(name: string, args: any): ToolOutcome {
    const ok = (content: string): ToolOutcome => ({ content, isError: false, done: false })
    if (name === 'regelwerk_suchen') {
      this.lookups++
      this.step(`Sucht: „${args.anfrage}“${args.buch ? ` in ${args.buch}` : ''}`)
      const hits = this.pages.search(String(args.anfrage ?? ''), args.buch, 8)
      return ok(hits.length ? hits.map((h) => `${h.buch} S. ${h.seite}: …${h.auszug}…`).join('\n\n') : 'Keine Treffer.')
    }
    if (name === 'seiten_lesen') {
      this.lookups++
      const nums = (Array.isArray(args.seiten) ? args.seiten : []).slice(0, 4).map(Number)
      this.step(`Liest ${args.buch} S. ${nums.join(', ')}`)
      return ok(nums.map((n: number) => `=== ${args.buch} S. ${n} ===\n${this.pages.read(String(args.buch), n) ?? '(Seite nicht vorhanden oder nicht lesbar)'}`).join('\n\n'))
    }
    if (name === 'katalog_suchen') {
      this.lookups++
      const types = ART[String(args.art)]
      if (!types) throw new Error(`unbekannte Art „${args.art}“`)
      const names = searchNames(types, String(args.anfrage ?? ''), 25)
      return ok(names.length ? names.join('\n') : 'Kein passender Name im Katalog.')
    }
    if (name === 'nsc_abgeben') {
      this.submissions++
      this.step(this.submissions === 1 ? 'Prüft das Ergebnis …' : `Prüft die Korrektur ${this.submissions - 1} …`)
      if (!args.npc || typeof args.npc !== 'object') throw new Error('Feld npc fehlt')
      const level: Level = this.input.level ?? (LEVELS.includes(args.erfahrung) ? args.erfahrung : 'erfahren')
      const god: string | null = args.gottheit || null
      const npc = args.npc as NpcJson
      if (this.input.name) npc.name = this.input.name
      const last = this.submissions >= 3
      const r = review(npc, { level, consecrated: !!god, spellcaster: !!args.zauberkundig, god, dropUnknown: last })
      this.last = {
        block: '```dsa-nsc\n' + toBlock(r.npc) + '\n```',
        profession: String(args.profession ?? ''),
        level,
        god,
        repairs: r.repairs,
        issues: r.issues,
        quellen: Array.isArray(args.quellen) ? args.quellen.map(String) : [],
        art: 'person',
      }
      if (r.needsFix && !last) return { content: `Bitte korrigieren und erneut abgeben:\n- ${r.issues.join('\n- ')}`, isError: true, done: false }
      return { content: 'Angenommen.', isError: false, done: true }
    }
    if (name === 'kreatur_abgeben') {
      this.submissions++
      this.step(this.submissions === 1 ? 'Prüft die Kreatur …' : `Prüft die Korrektur ${this.submissions - 1} …`)
      if (!args.kreatur || typeof args.kreatur !== 'object') throw new Error('Feld kreatur fehlt')
      const c = args.kreatur as CreatureJson
      if (this.input.name) c.name = this.input.name
      const last = this.submissions >= 3
      const r = reviewCreature(c, { dropUnknown: last })
      this.last = {
        block: '```dsa-nsc\n' + creatureToBlock(r.creature) + '\n```',
        profession: String(r.creature.rolle ?? ''),
        level: this.input.level ?? 'erfahren',
        god: null,
        repairs: r.repairs,
        issues: r.issues,
        quellen: Array.isArray(args.quellen) ? args.quellen.map(String) : [],
        art: 'kreatur',
      }
      if (r.needsFix && !last) return { content: `Bitte korrigieren und erneut abgeben:\n- ${r.issues.join('\n- ')}`, isError: true, done: false }
      return { content: 'Angenommen.', isError: false, done: true }
    }
    throw new Error(`unbekanntes Werkzeug ${name}`)
  }

  result(t0: number, tokens: CloudResult['tokens'], dollars: number | undefined): CloudResult {
    const last = this.last
    if (!last) throw new Error('Das Modell hat nichts abgegeben (zu viele Nachschlage-Runden). Bitte erneut versuchen.')
    return {
      block: last.block,
      profession: { name: last.profession, buch: '', seite: 0 },
      level: last.level,
      god: last.god,
      repairs: last.repairs,
      issues: last.issues,
      rounds: this.submissions,
      seconds: (Date.now() - t0) / 1000,
      quellen: last.quellen,
      art: last.art,
      lookups: this.lookups,
      tokens,
      dollars,
    }
  }
}
