/**
 * Full text of the readable rulebook pages (built by tools/regelwerke/index.ts into
 * .llm/regelwerk-seiten.json – stays local). Lets an LLM search and read single pages
 * instead of whole books. Page numbers are PDF pages.
 */
export interface PagesFile {
  erstellt: string
  buecher: { kurz: string; titel: string; datei: string; seiten: number }[]
  seiten: { buch: string; seite: number; text: string }[]
}

export interface PageHit {
  buch: string
  seite: number
  auszug: string
}

const words = (s: string) => s.toLowerCase().match(/[a-zäöüß0-9]{3,}/g) ?? []

export class PageStore {
  readonly file: PagesFile
  private lower: string[]
  private df = new Map<string, number>()

  constructor(file: PagesFile) {
    this.file = file
    this.lower = file.seiten.map((p) => p.text.toLowerCase())
    for (const text of this.lower) for (const w of new Set(words(text))) this.df.set(w, (this.df.get(w) ?? 0) + 1)
  }

  books() {
    return this.file.buecher
  }

  /** Pages ranked by the query words (word prefixes count, rare words weigh more, the exact phrase most). */
  search(query: string, book?: string | null, max = 8): PageHit[] {
    const q = query.toLowerCase().trim()
    const terms = [...new Set(words(q))]
    if (!terms.length) return []
    const n = this.lower.length
    // document frequency of a term = pages with a word starting with it
    const idf = (t: string) => {
      let df = 0
      for (const [w, c] of this.df) if (w.startsWith(t)) df += c
      return Math.log(1 + n / Math.max(1, df))
    }
    const weights = terms.map((t) => [t, idf(t)] as const)
    const hits: { i: number; score: number }[] = []
    this.lower.forEach((text, i) => {
      const page = this.file.seiten[i]
      if (book && page.buch.toLowerCase() !== book.toLowerCase()) return
      let score = 0
      let matched = 0
      for (const [t, w] of weights) {
        const count = text.split(new RegExp(`(?:^|[^a-zäöüß0-9])${escape(t)}`)).length - 1
        if (count) {
          matched++
          score += w * Math.min(1 + Math.log(count), 3)
        }
      }
      if (!matched) return
      score *= matched / terms.length // pages with all words first
      if (terms.length > 1 && text.includes(q)) score *= 2
      hits.push({ i, score })
    })
    return hits
      .sort((a, b) => b.score - a.score)
      .slice(0, max)
      .map(({ i }) => {
        const page = this.file.seiten[i]
        const at = Math.max(0, this.lower[i].indexOf(q) >= 0 ? this.lower[i].indexOf(q) : this.lower[i].indexOf(terms[0]))
        const auszug = page.text.slice(Math.max(0, at - 120), at + 280).replace(/\s+/g, ' ').trim()
        return { buch: page.buch, seite: page.seite, auszug }
      })
  }

  read(book: string, page: number): string | undefined {
    return this.file.seiten.find((p) => p.buch.toLowerCase() === book.toLowerCase() && p.seite === page)?.text
  }
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
