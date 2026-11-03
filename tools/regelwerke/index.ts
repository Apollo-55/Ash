// Builds the rulebook index for the NSC generator from the PDFs in Regelwerke/.
// Usage: node tools/regelwerke/index.ts [Regelwerke-Ordner] [Ausgabe.json]
//
// Books are recognised by their title (file name); Regelwerke/regelwerke.json can override:
//   [{ "datei": "Mein Buch.pdf", "art": "professionen" | "liturgien" | "zauber" | "kampf" | "ignorieren" }]
// The index contains extracted rulebook text – it stays local (.llm/ is git-ignored).
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

type Art = 'professionen' | 'liturgien' | 'zauber' | 'kampf' | 'magie' | 'ignorieren' | 'unbekannt'

export interface Profession {
  name: string
  buch: string
  seite: number
  /** text of the package incl. variants (as in the book) */
  text: string
}
export interface IndexFile {
  erstellt: string
  buecher: { datei: string; art: Art; seiten: number; lesbar: boolean; gelesen: Record<string, number>; hinweis?: string }[]
  professionen: Profession[]
  /** god → grade (I–VI) → liturgy names */
  liturgien: Record<string, Record<string, string[]>>
  /** SF name → prerequisites as written */
  sfVoraussetzungen: Record<string, string>
}

const root = resolve(process.argv[2] ?? 'Regelwerke')
const out = resolve(process.argv[3] ?? '.llm/regelwerk-index.json')

const ART_NACH_TITEL: [RegExp, Art][] = [
  [/wege der helden/i, 'professionen'],
  [/liber liturgium/i, 'liturgien'],
  [/liber cantiones/i, 'zauber'],
  [/wege der zauberei/i, 'magie'],
  [/wege des schwerts/i, 'kampf'],
]

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

const clean = (s: string) => s.replace(/­/g, '').replace(/­/g, '')

/** Professions: a "Voraussetzungen:" line with a "(… GP …)" heading shortly before it. */
function extractProfessions(pages: string[], buch: string): Profession[] {
  const lines: { t: string; page: number }[] = []
  pages.forEach((p, i) => clean(p).split('\n').forEach((t) => lines.push({ t: t.trim(), page: i + 1 })))
  const heads: { name: string; start: number; page: number }[] = []
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].t.startsWith('Voraussetzungen:')) continue
    for (let j = i - 1; j >= Math.max(0, i - 4); j--) {
      // "(12 GP)", "(GP je nach Variante)", late consecrations "(900 AP)"
      const m = /^(.*?)\s*\((?:[^)]*\b[GA]P\b)/.exec(lines[j].t)
      if (!m) continue
      let name = m[1].trim()
      // headings over two lines: "Schwertgeselle / Schwertgesellin nach" + "Fedorino (22 GP)"
      let k = j - 1
      while (k >= 0 && k >= j - 2 && (!name || /^[a-zäöü/(-]|^(nach|zu|der|des|von|aus)\b/.test(name) || /( nach| zu| der| des| von|\/)$/.test(lines[k].t)) && lines[k].t && !/[.:;]$/.test(lines[k].t)) {
        name = `${lines[k].t.trim()} ${name}`.trim()
        k--
      }
      name = name.replace(/\s+/g, ' ').replace(/ \/ -/g, ' / ')
      if (name && name.length < 90 && !/^(Mögliche|Varianten|Die folgenden)/.test(name)) heads.push({ name, start: j, page: lines[j].page })
      break
    }
  }
  // academies of the guild mages: heading lines, then "Genauer Name der Akademie:"
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].t.startsWith('Genauer Name der Akademie:')) continue
    const parts: string[] = []
    for (let j = i - 1; j >= Math.max(0, i - 5) && lines[j].t && !/[.:;,]$/.test(lines[j].t) && !/^\d+$/.test(lines[j].t); j--) parts.unshift(lines[j].t)
    if (parts.length) heads.push({ name: `Magier: ${parts.join(' ').replace(/\s+/g, ' ')}`, start: i - parts.length, page: lines[i].page })
  }
  heads.sort((a, b) => a.start - b.start)
  return heads.map((h, k) => {
    const end = Math.min(heads[k + 1]?.start ?? lines.length, h.start + 140)
    const text = lines
      .slice(h.start, end)
      .map((l) => l.t)
      .filter((t) => t && !/^Wege der Helden \d|^\d+$|^Aventurische$|^Professionen$|indd/.test(t))
      .join('\n')
    return { name: h.name, buch, seite: h.page, text }
  })
}

const GRADE = ['I', 'II', 'III', 'IV', 'V', 'VI']

/** Liber Liturgium: per god "Grad I: a, b, c Grad II: …" after "<Gott> Beinamen:". */
function extractLiturgies(pages: string[]): Record<string, Record<string, string[]>> {
  const flat = clean(pages.join(' ')).replace(/\s+/g, ' ')
  const out: Record<string, Record<string, string[]>> = {}
  for (const m of flat.matchAll(/(?:^|\s)([A-ZÄÖÜ][\wäöüß’' -]{1,40}?) Beinamen: /g)) {
    const god = m[1].trim()
    const chunk = flat.slice(m.index!, m.index! + 4000)
    const grades: Record<string, string[]> = {}
    for (const g of GRADE) {
      const gm = new RegExp(`Grad ${g}: (.*?)(?= Grad (?:${GRADE.join('|')}):| [A-ZÄÖÜ][\\wäöüß’' -]{1,40}? Beinamen:|$)`).exec(chunk)
      if (!gm) continue
      const names = gm[1]
        .replace(/\d+ Chris Baumann.*$/, '')
        .split(/,\s*/)
        .map((n) => n.replace(/\s*\(nur\s*$/, '').trim())
        .filter((n) => n && n.length < 70 && /^[A-ZÄÖÜ]/.test(n))
      if (names.length) grades[g] = names
    }
    if (Object.keys(grades).length && !out[god]) out[god] = grades
  }
  return out
}

/** "Name: … Voraussetzungen: … Verbreitung" in the SF chapter. */
function extractSfPrerequisites(pages: string[]): Record<string, string> {
  const flat = clean(pages.join(' ')).replace(/-\s+/g, '').replace(/\s+/g, ' ')
  const out: Record<string, string> = {}
  for (const m of flat.matchAll(/([A-ZÄÖÜ][\wäöüß()’' -]{2,50}?): (?:Diese|Erlaubt|Der|Die|Mit|Ein|Hiermit)[^:]{0,1400}?Voraussetzungen?: (.{1,220}?) (?:Verbreitung|Kosten)/g)) {
    const name = m[1].trim()
    if (!out[name]) out[name] = m[2].trim()
  }
  return out
}

function main() {
  if (!existsSync(root)) {
    console.error(`Ordner ${root} fehlt.`)
    process.exit(1)
  }
  const overrides: { datei: string; art: Art }[] = existsSync(join(root, 'regelwerke.json')) ? JSON.parse(readFileSync(join(root, 'regelwerke.json'), 'utf8')) : []
  const index: IndexFile = { erstellt: new Date().toISOString(), buecher: [], professionen: [], liturgien: {}, sfVoraussetzungen: {} }
  for (const datei of readdirSync(root).filter((f) => f.toLowerCase().endsWith('.pdf')).sort()) {
    const art: Art = overrides.find((o) => o.datei === datei)?.art ?? ART_NACH_TITEL.find(([re]) => re.test(datei))?.[1] ?? 'unbekannt'
    const entry: IndexFile['buecher'][number] = { datei, art, seiten: 0, lesbar: false, gelesen: {} }
    index.buecher.push(entry)
    if (art === 'ignorieren') continue
    process.stdout.write(`  ${datei} … `)
    const pages = pdfPages(join(root, datei))
    entry.seiten = pages.length
    entry.lesbar = readable(pages)
    if (!entry.lesbar) {
      entry.hinweis = 'kein lesbarer Text (Schrift ohne Zeichenzuordnung) – bessere PDF besorgen oder OCR'
      console.log('✗ nicht lesbar')
      continue
    }
    if (art === 'professionen') {
      const p = extractProfessions(pages, datei)
      index.professionen.push(...p)
      entry.gelesen.professionen = p.length
      const sf = extractSfPrerequisites(pages)
      Object.assign(index.sfVoraussetzungen, sf)
      entry.gelesen.sfVoraussetzungen = Object.keys(sf).length
    }
    if (art === 'liturgien') {
      const l = extractLiturgies(pages)
      index.liturgien = { ...index.liturgien, ...l }
      entry.gelesen.gottheiten = Object.keys(l).length
      entry.gelesen.liturgien = Object.values(l).reduce((s, g) => s + Object.values(g).flat().length, 0)
    }
    if (art === 'kampf' || art === 'magie') {
      const sf = extractSfPrerequisites(pages)
      Object.assign(index.sfVoraussetzungen, sf)
      entry.gelesen.sfVoraussetzungen = Object.keys(sf).length
    }
    console.log('✓', JSON.stringify(entry.gelesen))
  }
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, JSON.stringify(index))
  console.log(`\nIndex: ${out} (${(statSync(out).size / 1024).toFixed(0)} KB)`)
  console.log(`  ${index.professionen.length} Professionen/Varianten, ${Object.keys(index.liturgien).length} Gottheiten, ${Object.keys(index.sfVoraussetzungen).length} SF-Voraussetzungen`)
  for (const b of index.buecher.filter((b) => !b.lesbar && b.art !== 'ignorieren')) console.log(`  ⚠ ${b.datei}: ${b.hinweis ?? b.art}`)
  void basename
}

main()
