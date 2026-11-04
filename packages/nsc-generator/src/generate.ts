import { dsa41 } from '../../core/src/index.ts'
import { find, findWeapon, normalizeName, suggest } from '../../core/src/systems/dsa41/catalog.ts'
import { SF_RULES } from '../../core/src/systems/dsa41/rules.ts'
import { LIST_TYPES } from '../../core/src/systems/dsa41/schema.ts'
import type { Knowledge } from './knowledge.ts'
import type { ChatMessage, LlmClient } from './llm.ts'

export const LEVELS = ['unerfahren', 'erfahren', 'kompetent', 'meisterlich', 'brillant'] as const
export type Level = (typeof LEVELS)[number]

const LEVEL_HINT: Record<Level, { taw: string; ap: string; litGrade: number; attrSum: string; buy: [number, number] }> = {
  unerfahren: { taw: 'Haupttalente 5–8, Nebentalente 2–5', ap: 'wenige SF (1–3)', litGrade: 1, attrSum: '92–98', buy: [0, 3] },
  erfahren: { taw: 'Haupttalente 9–12, Nebentalente 4–8', ap: 'einige SF (3–6)', litGrade: 2, attrSum: '98–104', buy: [2, 6] },
  kompetent: { taw: 'Haupttalente 12–15, Nebentalente 6–10', ap: 'mehrere SF (5–9)', litGrade: 3, attrSum: '102–108', buy: [4, 9] },
  meisterlich: { taw: 'Haupttalente 15–18, Nebentalente 8–12', ap: 'viele SF (8–14), auch Ketten', litGrade: 4, attrSum: '106–114', buy: [6, 12] },
  brillant: { taw: 'Haupttalente 18–22, Nebentalente 10–14', ap: 'sehr viele SF', litGrade: 5, attrSum: '112–120', buy: [8, 15] },
}

const ATTRS = ['MU', 'KL', 'IN', 'CH', 'FF', 'GE', 'KO', 'KK'] as const

// ---- JSON schemas for structured output --------------------------------------------------------

const named = { type: 'object', properties: { name: { type: 'string' }, wert: { type: ['integer', 'null'] } }, required: ['name', 'wert'] }

export function npcSchema() {
  return {
    type: 'object',
    properties: {
      name: { type: 'string' },
      rolle: { type: 'string' },
      eigenschaften: {
        type: 'object',
        properties: Object.fromEntries(ATTRS.map((a) => [a, { type: 'integer', minimum: 8, maximum: 21 }])),
        required: [...ATTRS],
      },
      LeP: { type: 'integer' },
      AuP: { type: 'integer' },
      AsP: { type: ['integer', 'null'] },
      KaP: { type: ['integer', 'null'] },
      waffen: { type: 'array', items: { type: 'string' }, maxItems: 4 },
      ruestung: { type: 'array', items: { type: 'string' }, maxItems: 2 },
      talente: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, wert: { type: 'integer', minimum: 0, maximum: 25 } }, required: ['name', 'wert'] } },
      zauber: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, wert: { type: 'integer', minimum: 0, maximum: 25 } }, required: ['name', 'wert'] } },
      liturgien: { type: 'array', items: { type: 'string' } },
      vorteile: { type: 'array', items: named },
      nachteile: { type: 'array', items: named },
      sonderfertigkeiten: { type: 'array', items: { type: 'string' } },
      notiz: { type: 'string' },
    },
    required: ['name', 'rolle', 'eigenschaften', 'LeP', 'AuP', 'AsP', 'KaP', 'waffen', 'ruestung', 'talente', 'zauber', 'liturgien', 'vorteile', 'nachteile', 'sonderfertigkeiten', 'notiz'],
  }
}

export interface NpcJson {
  name: string
  rolle: string
  eigenschaften: Record<(typeof ATTRS)[number], number>
  LeP: number
  AuP: number
  AsP: number | null
  KaP: number | null
  waffen: string[]
  ruestung: string[]
  talente: { name: string; wert: number }[]
  zauber: { name: string; wert: number }[]
  liturgien: string[]
  vorteile: { name: string; wert: number | null }[]
  nachteile: { name: string; wert: number | null }[]
  sonderfertigkeiten: string[]
  notiz: string
}

// ---- YAML block ----------------------------------------------------------------------------

const q = (s: string) => (/[:,[\]{}#&*!|>'"%@`]|^\s|\s$|^(ja|nein|true|false|null|-?\d)/i.test(s) ? JSON.stringify(s) : s)
const flowMap = (entries: [string, number | null][]) => `{ ${entries.map(([k, v]) => `${q(k)}: ${v ?? 'null'}`).join(', ')} }`
const flowList = (items: string[]) => `[${items.map(q).join(', ')}]`

export function toBlock(n: NpcJson): string {
  const lines = [
    `name: ${q(n.name)}`,
    `rolle: ${q(n.rolle)}`,
    `eigenschaften: ${flowMap(ATTRS.map((a) => [a, n.eigenschaften[a]]))}`,
    `LeP: ${n.LeP}`,
    `AuP: ${n.AuP}`,
  ]
  if (n.AsP) lines.push(`AsP: ${n.AsP}`)
  if (n.KaP) lines.push(`KaP: ${n.KaP}`)
  if (n.waffen.length) lines.push(`waffen: ${flowList(n.waffen)}`)
  if (n.ruestung.length) lines.push(`rüstung: ${flowList(n.ruestung)}`)
  if (n.talente.length) lines.push(`talente: ${flowMap(n.talente.map((t) => [t.name, t.wert]))}`)
  if (n.zauber.length) lines.push(`zauber: ${flowMap(n.zauber.map((t) => [t.name, t.wert]))}`)
  if (n.liturgien.length) lines.push(`liturgien: ${flowList(n.liturgien)}`)
  const valued = (l: { name: string; wert: number | null }[]) => flowList(l.map((x) => (x.wert ? `${x.name} ${x.wert}` : x.name)))
  if (n.vorteile.length) lines.push(`vorteile: ${valued(n.vorteile)}`)
  if (n.nachteile.length) lines.push(`nachteile: ${valued(n.nachteile)}`)
  if (n.sonderfertigkeiten.length) lines.push(`sonderfertigkeiten: ${flowList(n.sonderfertigkeiten)}`)
  if (n.notiz.trim()) lines.push(`notiz: ${JSON.stringify(n.notiz.trim())}`)
  return lines.join('\n')
}

// ---- deterministic repairs -------------------------------------------------------------------

const R = (x: number) => Math.round(x)
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

export interface Repair {
  what: string
}

/** Replaces near-miss names by catalog names, fixes SF chains, keeps energies in a sane range. */
export function repair(n: NpcJson, level: Level, consecrated: boolean, spellcaster: boolean): { npc: NpcJson; repairs: string[]; unknown: string[] } {
  const repairs: string[] = []
  const unknown: string[] = []
  const fixName = (types: string[], name: string, label: string): string | null => {
    if (find(types, name)) return find(types, name)!.n
    const s = suggest(types, name, 2)
    if (s.length >= 1 && normalizeName(s[0]).slice(0, 5) === normalizeName(name).slice(0, 5)) {
      repairs.push(`${label} „${name}“ → „${s[0]}“`)
      return s[0]
    }
    unknown.push(`${label} „${name}“`)
    return name
  }
  // book notation → item names: "Sprachen Kennen [Garethi]" → Garethi, "Lesen/Schreiben [Garethi]" → Kusliker Zeichen
  const SCRIPT_OF: Record<string, string> = { garethi: 'Kusliker Zeichen', bosparano: 'Kusliker Zeichen', 'muttersprache': 'Kusliker Zeichen' }
  n.talente = n.talente.map((t) => {
    const lang = /^Sprachen? Kennen\s*[[(](.+?)[\])]/i.exec(t.name)
    if (lang) return { ...t, name: lang[1].trim() }
    const script = /^Lesen\/Schreiben\s*[[(](.+?)[\])]/i.exec(t.name)
    if (script) return { ...t, name: SCRIPT_OF[script[1].trim().toLowerCase()] ?? script[1].trim() }
    return t
  })
  // advantages filed as disadvantages (and vice versa), e.g. Vorteil „Neugier“ → Nachteil
  const swap = (from: 'vorteile' | 'nachteile', to: 'vorteile' | 'nachteile', label: string) => {
    n[from] = n[from].filter((x) => {
      if (find(LIST_TYPES[from], x.name) || !find(LIST_TYPES[to], x.name)) return true
      n[to].push(x)
      repairs.push(`„${x.name}“ ist ein ${label}`)
      return false
    })
  }
  swap('vorteile', 'nachteile', 'Nachteil')
  swap('nachteile', 'vorteile', 'Vorteil')
  const listFix = <T extends { name: string }>(arr: T[], types: string[], label: string) =>
    arr.map((x) => ({ ...x, name: fixName(types, x.name, label) ?? x.name }))
  n.talente = listFix(n.talente, LIST_TYPES.talente, 'Talent')
  n.zauber = listFix(n.zauber, LIST_TYPES.zauber, 'Zauber')
  n.vorteile = listFix(n.vorteile, LIST_TYPES.vorteile, 'Vorteil')
  n.nachteile = listFix(n.nachteile, LIST_TYPES.nachteile, 'Nachteil')
  n.liturgien = n.liturgien.map((l) => fixName(LIST_TYPES.liturgien, l, 'Liturgie') ?? l)
  n.sonderfertigkeiten = n.sonderfertigkeiten.map((s) => fixName(LIST_TYPES.sonderfertigkeiten, s, 'SF') ?? s)
  n.ruestung = n.ruestung.map((r) => fixName(['armor'], r, 'Rüstung') ?? r)
  n.waffen = n.waffen.map((w) => {
    if (findWeapon(w)) return findWeapon(w)!.n
    const s = suggest(['meleeWeapon', 'rangedWeapon'], w, 1)
    if (s[0]) {
      repairs.push(`Waffe „${w}“ → „${s[0]}“`)
      return s[0]
    }
    unknown.push(`Waffe „${w}“`)
    return w
  })
  // dedupe
  const uniq = <T>(arr: T[], key: (x: T) => string) => arr.filter((x, i) => arr.findIndex((y) => key(y) === key(x)) === i)
  n.talente = uniq(n.talente, (t) => normalizeName(t.name))
  n.sonderfertigkeiten = uniq(n.sonderfertigkeiten, normalizeName)

  // every weapon's combat talent should be there (otherwise the weapon is "untrained")
  for (const w of n.waffen) {
    const hit = findWeapon(w)
    const talent = hit?.talent ? dsa41.findBySid(hit.talent) : undefined
    if (talent && !n.talente.some((t) => normalizeName(t.name) === normalizeName(talent.n))) {
      const main = Number(LEVEL_HINT[level].taw.match(/(\d+)–(\d+)/)?.[1] ?? 8)
      n.talente.push({ name: talent.n, wert: main })
      repairs.push(`Kampftalent „${talent.n}“ ${main} für „${w}“ ergänzt`)
    }
  }

  // SF chains: add missing SF prerequisites; drop SF whose attribute/talent requirements fail
  for (let round = 0; round < 5; round++) {
    const data = dsa41.parseNscBlock(toBlock(n)).data
    if (!data) break
    const missing = dsa41.checkSfPrerequisites(data)
    if (!missing.length) break
    for (const msg of missing) {
      const [sf, rest] = msg.split(' braucht ')
      const parts = rest.split(', ')
      const onlySf = parts.every((p) => p.startsWith('SF ') && !p.includes(' oder '))
      if (onlySf) {
        for (const p of parts) {
          const need = p.slice(3)
          if (!n.sonderfertigkeiten.some((s) => normalizeName(s) === normalizeName(need))) {
            n.sonderfertigkeiten.push(need)
            repairs.push(`SF „${need}“ ergänzt (Voraussetzung für ${sf})`)
          }
        }
      } else {
        n.sonderfertigkeiten = n.sonderfertigkeiten.filter((s) => normalizeName(s) !== normalizeName(sf))
        repairs.push(`SF „${sf}“ entfernt (${rest})`)
      }
    }
  }

  // energies: base by DSA 4.1 (human) + bought points within the level's range
  const a = n.eigenschaften
  const [lo, hi] = LEVEL_HINT[level].buy
  const lepBase = R((a.KO + a.KO + a.KK) / 2) + 10
  const aupBase = R((a.MU + a.KO + a.GE) / 2) + 10
  const fixEnergy = (key: 'LeP' | 'AuP', base: number) => {
    const v = clamp(n[key] || base + lo, base + lo, base + hi)
    if (v !== n[key]) repairs.push(`${key} ${n[key]} → ${v} (Basis ${base} + Zukauf ${lo}–${hi})`)
    n[key] = v
  }
  fixEnergy('LeP', lepBase)
  fixEnergy('AuP', aupBase)
  if (spellcaster) {
    const base = R((a.MU + a.IN + a.CH) / 2)
    const v = clamp(n.AsP ?? base + 10, base, base + 30)
    if (v !== n.AsP) repairs.push(`AsP ${n.AsP ?? '–'} → ${v}`)
    n.AsP = v
  } else if (n.AsP) {
    repairs.push(`AsP entfernt (kein Zauberkundiger)`)
    n.AsP = null
    n.zauber = []
  }
  if (consecrated) {
    const v = clamp(n.KaP ?? 18, 12, 40)
    if (v !== n.KaP) repairs.push(`KaP ${n.KaP ?? '–'} → ${v}`)
    n.KaP = v
  } else if (n.KaP || n.liturgien.length) {
    if (n.KaP || n.liturgien.length) repairs.push('KaP und Liturgien entfernt (nicht geweiht)')
    n.KaP = null
    n.liturgien = []
  }
  return { npc: n, repairs, unknown }
}

// ---- pipeline -------------------------------------------------------------------------------

export interface GenerateInput {
  description: string
  level?: Level
  /** forces a profession from the index instead of letting the LLM choose */
  profession?: string
  name?: string
}

export interface GenerateResult {
  block: string
  profession: { name: string; buch: string; seite: number }
  level: Level
  god: string | null
  repairs: string[]
  issues: string[]
  rounds: number
  seconds: number
}

const SPELLCASTER_RE = /magier|druide|hexe|geode|schelm|elf|scharlatan|kristallomant|alchimist|zibilja|majuna|derwisch|tänzer|zauber/i

export async function generateNpc(llm: LlmClient, kb: Knowledge, input: GenerateInput, onStep?: (msg: string) => void): Promise<GenerateResult> {
  const t0 = Date.now()
  const step = (m: string) => onStep?.(m)

  // 1. profession, level, god
  let profession = input.profession ? kb.profession(input.profession) : undefined
  let level: Level = input.level ?? 'erfahren'
  let god: string | null = null
  if (!profession) {
    step('Profession wählen …')
    const names = kb.professionNames()
    const shortlist = kb.candidates(input.description)
    const system =
      'Du bist Spielleiter für Das Schwarze Auge 4.1. Ordne einen Nichtspielercharakter der passendsten Profession aus „Wege der Helden“ zu. ' +
      'Geweihte nur, wenn die Figur heute geweiht ist (nicht bei ehemaligen Novizen/Akoluthen oder bloßer Verehrung); gottheit nur für Geweihte, sonst null. ' +
      'Erfahrung: unerfahren = Anfänger; erfahren = solide im Beruf; kompetent = sehr gut, bekannt; meisterlich = Meister, berühmt, Lehrer oder Anführer seines Fachs; brillant = legendär. Alter und Ruf beachten. ' +
      'Gerüchte, die als falsch markiert sind ((F), falsch, FALSCH), sind nicht wahr. ' +
      'Überschrift und Zeilen wie „Profession:“ nennen meist die Rolle – nimm sie ernst (z. B. „Kor Geweit Söldner“ = Kor-Geweihter, „Akademiemagister“ = Magier dieser Akademie, „Geschützmeister“ = Söldner/Artillerist, „Smutje“ = Seefahrer). ' +
      'Der Beruf zählt, nicht Charakterzüge (eine lüsterne Zimmerfrau ist Handwerkerin, keine Kurtisane). Antworte nur mit JSON.'
    const ask = async (options: string[], list: string) =>
      JSON.parse(
        await llm.chat(
          [
            { role: 'system', content: system },
            { role: 'user', content: `Beschreibung:\n${input.description}\n\n${list}\n\nGottheiten: ${kb.gods().join(', ')}` },
          ],
          {
            schema: {
              type: 'object',
              properties: {
                profession: { type: 'string', enum: options },
                erfahrung: { type: 'string', enum: [...LEVELS] },
                gottheit: { type: ['string', 'null'], enum: [...kb.gods(), null] },
              },
              required: ['profession', 'erfahrung', 'gottheit'],
            },
            temperature: 0.1,
          }
        )
      )
    // first a short choice (candidates with a snippet of their rulebook text), the full list only if none fits
    const OTHER = 'keine davon passt'
    let pick = shortlist.length
      ? await ask(
          [...shortlist, OTHER],
          'Kandidaten (nach Stichworten der Beschreibung):\n' +
            shortlist.map((n) => `- ${n}: ${kb.profession(n)!.text.replace(/\s+/g, ' ').slice(0, 220)}`).join('\n') +
            `\n\nWähle den passendsten Kandidaten oder „${OTHER}“.`
        )
      : { profession: OTHER }
    if (pick.profession === OTHER) {
      step('Profession aus allen wählen …')
      pick = await ask(names, `Alle Professionen:\n${names.join('; ')}`)
    }
    profession = kb.profession(pick.profession)
    if (!input.level && LEVELS.includes(pick.erfahrung)) level = pick.erfahrung
    god = pick.gottheit
  }
  if (!profession) throw new Error('Keine passende Profession gefunden.')
  const consecrated = /geweiht|spätweihe/i.test(profession.name) || /Automatische[^\n]*Geweiht/i.test(profession.text.slice(0, 800))
  god = consecrated ? (kb.godOf(profession.name) ?? god) : null
  const spellcaster = SPELLCASTER_RE.test(profession.name) || /Vollzauberer|Halbzauberer|Viertelzauberer|Hauszauber/i.test(profession.text.slice(0, 1500))
  const hint = LEVEL_HINT[level]
  step(`Profession: ${profession.name} (${level}${god ? `, ${god}` : ''})`)

  // 2. values
  const liturgies = consecrated && god ? kb.liturgies(god, hint.litGrade) : {}
  const system = [
    'Du bist ein erfahrener Spielleiter für Das Schwarze Auge 4.1 und erstellst Werte für einen Nichtspielercharakter.',
    'Regeln:',
    '- Halte dich an das Professionspaket aus „Wege der Helden“ (unten): Talente, Kampftalente, Sonderfertigkeiten, Vor- und Nachteile von dort, angepasst an die Beschreibung.',
    '- WICHTIG: Die Zahlen im Paket („Fechtwaffen +7“) sind nur Startboni bei Spielbeginn, KEINE Endwerte. Die Talentwerte (TaW) ergeben sich aus der Erfahrung (siehe unten) – das Paket sagt nur, welche Talente wichtig sind.',
    '- Gerüchte, die als falsch markiert sind ((F), falsch, FALSCH), sind nicht wahr und dürfen die Werte nicht prägen. Als wahr markierte ((W), WAHR) schon.',
    '- Verwende nur die offiziellen DSA-4.1-Namen (z. B. „Heilkunde Wunden“, „Sinnenschärfe“, „Ausweichen I“, „Zweihandschwerter/-säbel“).',
    `- Erfahrung „${level}“: ${hint.taw}; ${hint.ap}; Summe der Eigenschaften ${hint.attrSum}. Eigenschaften 8–18, nur Ausnahmen höher.`,
    '- Eigenschaften passend zu den Probenwerten wichtiger Talente (z. B. Seefahrt FF/GE/KK, Liturgiekenntnis MU/IN/CH).',
    '- 12–25 Talente: Kampftalente der Waffen, Berufstalente, Sprachen (Talentname ist nur die Sprache, z. B. „Garethi“, „Tulamidya“; Schriften z. B. „Kusliker Zeichen“), Wissen. Keine Zauber ohne Zauberbegabung, keine Liturgien ohne Weihe (dann liturgien leer, KaP null).',
    '- LeP und AuP als Gesamtwert (Mensch: LeP etwa (KO+KO+KK)/2 + 10 + Zukauf).',
    '- Waffen: 1–3 passende Waffen mit Namen aus dem Arsenal (z. B. Säbel, Dolch, Kurzbogen). Keine AT/PA – das System rechnet sie aus dem Talentwert.',
    '- notiz: 1–2 Sätze, was die Werte prägt (kein Ersatz für die Beschreibung).',
    'Antworte nur mit JSON nach Schema.',
  ].join('\n')
  const user = [
    `Beschreibung des NSC:\n${input.description}`,
    input.name ? `Name: ${input.name}` : '',
    `\nProfessionspaket „${profession.name}“ (${profession.buch}, S. ${profession.seite}):\n${profession.text.slice(0, 5000)}`,
    consecrated && god
      ? `\nDie Figur ist geweiht (${god}). Liturgien des ${god} bis Grad ${hint.litGrade}:\n${Object.entries(liturgies).map(([g, l]) => `Grad ${g}: ${l.join(', ')}`).join('\n')}\nWähle 4–12 passende davon für „liturgien“ (Pflicht). KaP: 12–40. Talent „Liturgiekenntnis (${god})“ nicht vergessen.`
      : '\nDie Figur ist NICHT geweiht: liturgien leer, KaP null.',
  ].filter(Boolean).join('\n')

  const messages: ChatMessage[] = [{ role: 'system', content: system }, { role: 'user', content: user }]
  let npc: NpcJson | null = null
  let repairs: string[] = []
  let issues: string[] = []
  let rounds = 0
  for (; rounds < 3; rounds++) {
    step(rounds === 0 ? 'Werte erzeugen …' : `Korrektur ${rounds} …`)
    const raw = await llm.chat(messages, { schema: npcSchema(), temperature: rounds === 0 ? 0.5 : 0.2 })
    npc = JSON.parse(raw) as NpcJson
    if (input.name) npc.name = input.name
    const r = repair(npc, level, consecrated, spellcaster)
    npc = r.npc
    repairs = [...repairs, ...r.repairs]
    const parsed = dsa41.parseNscBlock(toBlock(npc))
    issues = [...parsed.issues.filter((i) => i.level !== 'info').map((i) => i.message), ...r.unknown.map((u) => `${u} gibt es in DSA 4.1 nicht`)]
    const minMain = Number(hint.taw.match(/(\d+)–/)?.[1] ?? 0)
    const top = [...npc.talente].sort((a, b) => b.wert - a.wert).slice(0, 3)
    if (top.length && top.reduce((sum, t) => sum + t.wert, 0) / top.length < minMain) {
      issues.push(`Talentwerte zu niedrig für „${level}“: die wichtigsten Talente (${top.map((t) => `${t.name} ${t.wert}`).join(', ')}) sollten bei ${hint.taw.split(',')[0].replace('Haupttalente ', '')} liegen – die Paketzahlen sind nur Startboni`)
    }
    if (consecrated && !npc.liturgien.length) issues.push(`Geweihte brauchen Liturgien: 4–12 aus der Liste des ${god ?? 'Gottes'} wählen`)
    const sfRange = /(\d+)–(\d+)/.exec(hint.ap)
    if (sfRange && npc.sonderfertigkeiten.length < Number(sfRange[1])) {
      issues.push(
        `Zu wenige Sonderfertigkeiten für „${level}“ (${npc.sonderfertigkeiten.length}, erwartet ${sfRange[0]}): ergänze passende aus Paket und Beschreibung – ` +
          'Kampf-SF (z. B. Finte, Wuchtschlag, Ausweichen I, Kampfreflexe, Rüstungsgewöhnung I), Geländekunde, Kulturkunde, Ortskenntnis usw.; Voraussetzungen beachten'
      )
    }
    const needsLlm = r.unknown.length || issues.some((i) => /zu niedrig|brauchen Liturgien|Zu wenige Sonderfertigkeiten/.test(i)) || parsed.issues.some((i) => i.level === 'error')
    if (!needsLlm) break
    messages.push({ role: 'assistant', content: JSON.stringify(npc) })
    messages.push({
      role: 'user',
      content: `Bitte korrigieren:\n- ${issues.join('\n- ')}\nErsetze unbekannte Namen durch offizielle DSA-4.1-Namen oder lass sie weg. Gib das vollständige JSON zurück.`,
    })
  }
  return {
    block: '```dsa-nsc\n' + toBlock(npc!) + '\n```',
    profession: { name: profession.name, buch: profession.buch, seite: profession.seite },
    level,
    god,
    repairs,
    issues,
    rounds: Math.min(rounds + 1, 3),
    seconds: (Date.now() - t0) / 1000,
  }
}
