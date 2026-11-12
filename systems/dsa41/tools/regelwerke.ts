// Builds the rulebook index for the NSC generator from the PDFs in Regelwerke/.
// Usage: node systems/dsa41/tools/regelwerke.ts [Regelwerke-Ordner] [Ausgabe.json]
//
// Every readable PDF becomes searchable page by page (regelwerk-seiten.json); regelwerk-index.json lists
// the books and whether they are readable. Regelwerke/regelwerke.json can leave books out:
//   [{ "datei": "Altes Buch.pdf", "art": "ignorieren" }]
// Both files contain rulebook text – they stay local (.llm/ is git-ignored).
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { bookAbbreviations, bookTitle, type PagesFile } from '../nsc-generator/src/pages.ts'

export interface IndexFile {
  erstellt: string
  buecher: { datei: string; kurz: string; seiten: number; lesbar: boolean; ignoriert?: boolean; hinweis?: string }[]
}

const root = resolve(process.argv[2] ?? 'Regelwerke')
const out = resolve(process.argv[3] ?? '.llm/regelwerk-index.json')
const pagesOut = join(dirname(out), 'regelwerk-seiten.json')

function pdfPages(file: string): string[] {
  const text = execFileSync('pdftotext', ['-enc', 'UTF-8', file, '-'], { maxBuffer: 512 * 1024 * 1024 }).toString('utf8')
  return text.split('\f')
}

/** Share of normal letters – CID fonts without unicode map give garbage. */
function readable(pages: string[]): boolean {
  const sample = pages.slice(5, 40).join(' ')
  const letters = (sample.match(/[A-Za-zÄÖÜäöüß]/g) ?? []).length
  const words = (sample.match(/\b(der|die|und|das|nicht|mit)\b/gi) ?? []).length
  return sample.length > 2000 && letters / sample.length > 0.5 && words > 50
}

/** soft hyphens out, whitespace tidied */
const clean = (s: string) => s.replace(/­/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()

function main() {
  if (!existsSync(root)) {
    console.error(`Ordner ${root} fehlt.`)
    process.exit(1)
  }
  const overrides: { datei: string; art: string }[] = existsSync(join(root, 'regelwerke.json')) ? JSON.parse(readFileSync(join(root, 'regelwerke.json'), 'utf8')) : []
  const index: IndexFile = { erstellt: new Date().toISOString(), buecher: [] }
  const pagesFile: PagesFile = { erstellt: index.erstellt, buecher: [], seiten: [] }
  const dateien = readdirSync(root).filter((f) => f.toLowerCase().endsWith('.pdf')).sort()
  // short names over ALL books (also unreadable/ignored ones), so adding a book never makes two share one
  const abbr = bookAbbreviations(dateien.map(bookTitle))
  dateien.forEach((datei, n) => {
    const kurz = abbr[n]
    const entry: IndexFile['buecher'][number] = { datei, kurz, seiten: 0, lesbar: false }
    index.buecher.push(entry)
    if (overrides.some((o) => o.datei === datei && o.art === 'ignorieren')) {
      entry.ignoriert = true
      console.log(`  ${datei} – ignoriert`)
      return
    }
    process.stdout.write(`  ${datei} … `)
    const pages = pdfPages(join(root, datei))
    entry.seiten = pages.length
    entry.lesbar = readable(pages)
    if (!entry.lesbar) {
      entry.hinweis = 'kein lesbarer Text (Schrift ohne Zeichenzuordnung) – bessere PDF besorgen oder OCR'
      console.log('✗ nicht lesbar')
      return
    }
    pagesFile.buecher.push({ kurz, titel: bookTitle(datei), datei, seiten: pages.length })
    let kept = 0
    pages.forEach((text, i) => {
      const t = clean(text)
      if (t.length > 40) {
        pagesFile.seiten.push({ buch: kurz, seite: i + 1, text: t })
        kept++
      }
    })
    console.log(`✓ ${kurz}, ${kept} Seiten`)
  })
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, JSON.stringify(index))
  writeFileSync(pagesOut, JSON.stringify(pagesFile))
  console.log(`\nSeiten: ${pagesOut} (${pagesFile.seiten.length} Seiten aus ${pagesFile.buecher.map((b) => b.kurz).join(', ')}, ${(statSync(pagesOut).size / 1024 / 1024).toFixed(1)} MB)`)
  console.log(`Bücher: ${out}`)
  for (const b of index.buecher.filter((b) => !b.lesbar && !b.ignoriert)) console.log(`  ⚠ ${b.datei}: ${b.hinweis}`)
}

main()
