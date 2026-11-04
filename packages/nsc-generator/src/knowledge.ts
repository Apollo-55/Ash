/** Rulebook index built by tools/regelwerke/index.ts (stays local, never in git). */
export interface RulebookIndex {
  erstellt: string
  buecher: { datei: string; art: string; seiten: number; lesbar: boolean; gelesen: Record<string, number>; hinweis?: string }[]
  professionen: { name: string; buch: string; seite: number; text: string }[]
  liturgien: Record<string, Record<string, string[]>>
  sfVoraussetzungen: Record<string, string>
}

const GRADES = ['I', 'II', 'III', 'IV', 'V', 'VI']

/** everyday words → words in profession names (German) */
const SYNONYMS: [RegExp, string][] = [
  [/^(magister|magierin|zauberer|zauberin|gildenmagier)/, 'magier'],
  [/^(priester|geweit)/, 'geweihter'],
  [/^(schmied|schmid|tüftler|zimmer|tischler|schreiner|steinmetz|gerber|töpfer)/, 'handwerker'],
  [/^(geschütz|artiller)/, 'artillerist'],
  [/^(geschütz|artiller)/, 'söldner'],
  [/^(heiler|arzt|ärztin|medicus|feldscher)/, 'wundarzt'],
  [/^(pirat|seeräuber|matros|kapitän|steuer|bootsmann)/, 'seefahrer'],
  [/^(fährtenleser|waldläufer)/, 'jäger'],
]
/** name words too generic to count on their own */
const STOP = new Set(['schule', 'halle', 'akademie', 'variante', 'nach', 'zu', 'der', 'des', 'aventurische', 'professionen'])

export class Knowledge {
  readonly index: RulebookIndex
  constructor(index: RulebookIndex) {
    this.index = index
  }

  professionNames(): string[] {
    return [...new Set(this.index.professionen.map((p) => p.name))]
  }

  profession(name: string) {
    return this.index.professionen.find((p) => p.name === name)
  }

  gods(): string[] {
    return Object.keys(this.index.liturgien)
  }

  /** Liturgies of a god up to a grade (by experience). */
  liturgies(god: string, maxGrade: number): Record<string, string[]> {
    const g = Object.entries(this.index.liturgien).find(([k]) => k.toLowerCase() === god.toLowerCase())?.[1]
    if (!g) return {}
    return Object.fromEntries(GRADES.slice(0, maxGrade).filter((x) => g[x]).map((x) => [x, g[x]]))
  }

  /** God named in a profession ("Geweihter des Praios", "Spätweihe zum Kor-Geweihten") */
  godOf(professionName: string): string | null {
    const gods = this.gods()
    return gods.find((g) => new RegExp(`\\b${g}\\b|${g}-`, 'i').test(professionName)) ?? null
  }

  /**
   * Likely professions for a free description, by keywords: words of profession names and
   * their „Variante …“ names (prefix match, so typos like „Geweite“ still hit), a few synonyms,
   * and gods named together with a consecration word. Used as a shortlist for the LLM.
   */
  candidates(description: string, max = 8): string[] {
    const words = (s: string) => (s.toLowerCase().match(/[a-zäöüß]{4,}/g) ?? [])
    // token → weight; the first heading usually names the role („## Kor Geweit Söldner“)
    const tokens = new Map<string, number>()
    const heading = [/^#{1,6}\s+(.+)$/m, /^\W*(?:Profession|Beruf|Rolle)\W*:\W*(.+)$/im].map((re) => re.exec(description)?.[1] ?? '').join(' ')
    for (const t of words(description)) tokens.set(t, Math.max(tokens.get(t) ?? 0, 1))
    for (const t of words(heading)) tokens.set(t, 3)
    for (const [t, w] of [...tokens]) for (const [re, syn] of SYNONYMS) if (re.test(t)) tokens.set(syn, Math.max(tokens.get(syn) ?? 0, w))
    // prefix match (5 letters, catches „Geweite“/„Geweihter“); short keys must match exactly
    const weight = (key: string) => {
      let best = 0
      for (const [t, w] of tokens) if (key.length < 5 ? t === key : t.length >= 5 && t.slice(0, 5) === key.slice(0, 5)) best = Math.max(best, w)
      return best
    }
    const nameWords = this.index.professionen.map((p) => [...new Set(words(p.name).filter((w) => !STOP.has(w)))])
    const df = new Map<string, number>()
    for (const ws of nameWords) for (const w of ws) df.set(w.slice(0, 5), (df.get(w.slice(0, 5)) ?? 0) + 1)
    const idf = (w: string) => Math.log(1 + this.index.professionen.length / (df.get(w.slice(0, 5)) ?? 1))
    const godsNamed = this.gods().filter((g) => new RegExp(`(^|[^a-zäöüß])${g.toLowerCase()}($|[^a-zäöüß])`, 'i').test(description))
    // consecration word close to the god's name („Nandus Geweite“, „Priesterin des Nandus“), not „schuldet zwei Phex-Geweihten Geld“
    const consecratedTo = (g: string) =>
      new RegExp(`(geweih|geweit|priester|diener)[a-zäöüß]*\\s+(de[rs]\\s+)?${g}|${g}[-\\s]+(geweih|geweit|priester)`, 'i').test(heading) ||
      new RegExp(`(ist|als|wurde)\\s+(ein[e]?\\s+)?(geweih|geweit|priester)[a-zäöüß]*\\s+(de[rs]\\s+)?${g}`, 'i').test(description)
    const scored = this.index.professionen.map((p, i) => {
      const variants = [...p.text.matchAll(/Variante[n]?:?\s+([A-ZÄÖÜ][\wäöüß’-]+)/g)].flatMap((m) => words(m[1]))
      // name words add up; of the variants only the best match counts (half)
      let score = nameWords[i].reduce((s, w) => s + weight(w) * idf(w), 0) + Math.max(0, ...variants.map((w) => (weight(w) * idf(w)) / 2))
      const god = this.godOf(p.name)
      if (god && godsNamed.includes(god)) score += consecratedTo(god) && /geweih|spätweihe/i.test(p.name) ? 30 : 1
      return { name: p.name, score }
    })
    return [...new Set(scored.filter((s) => s.score > 0 && !/[\d;()]/.test(s.name)).sort((a, b) => b.score - a.score).map((s) => s.name))].slice(0, max)
  }

  /** Professions whose name or text contains one of the words (to shorten long lists). */
  search(words: string[], max = 40): string[] {
    const ws = words.map((w) => w.toLowerCase()).filter((w) => w.length > 3)
    const scored = this.index.professionen.map((p) => {
      const hay = `${p.name} ${p.text.slice(0, 600)}`.toLowerCase()
      return { name: p.name, score: ws.reduce((s, w) => s + (p.name.toLowerCase().includes(w) ? 5 : hay.includes(w) ? 1 : 0), 0) }
    })
    return [...new Set(scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).map((s) => s.name))].slice(0, max)
  }
}
