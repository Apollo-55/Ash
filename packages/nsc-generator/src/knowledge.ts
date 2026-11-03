/** Rulebook index built by tools/regelwerke/index.ts (stays local, never in git). */
export interface RulebookIndex {
  erstellt: string
  buecher: { datei: string; art: string; seiten: number; lesbar: boolean; gelesen: Record<string, number>; hinweis?: string }[]
  professionen: { name: string; buch: string; seite: number; text: string }[]
  liturgien: Record<string, Record<string, string[]>>
  sfVoraussetzungen: Record<string, string>
}

const GRADES = ['I', 'II', 'III', 'IV', 'V', 'VI']

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
