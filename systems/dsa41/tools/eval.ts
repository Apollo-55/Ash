// Compares models on the hand-made Uthuria NSCs (docs/nsc-umwandlung.md). Every run COSTS MONEY.
// Usage: node systems/dsa41/tools/eval.ts <vault> --models claude-opus-5-5,openai:gpt-6.1-sol [--only Aschanka,Praiodan] [--effort medium] [--out dist/eval.json]
// Claude models (claude-…): key from ANTHROPIC_API_KEY or `ant auth login`. OpenAI models as openai:<model>: key from OPENAI_API_KEY.
// DeepSeek models as deepseek:<model>: key from DEEPSEEK_API_KEY.
// The description is the note text WITHOUT its dsa-nsc block; the existing block is the reference.
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { findFences } from '../../../packages/core/src/index.ts'
import * as dsa41 from '../adapter/src/index.ts'
import { normalizeName } from '../adapter/src/catalog.ts'
import { claudeClient, deepseekClient, generateNpcClaude, generateNpcDeepSeek, generateNpcOpenAI, openaiClient, PageStore } from '../nsc-generator/src/index.ts'

const args = process.argv.slice(2)
const opt = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined }
const vault = args[0]
const models = (opt('--models') ?? 'openai:gpt-6.1-sol').split(',')
const only = opt('--only')?.split(',').map((s) => s.toLowerCase())
const out = opt('--out') ?? 'dist/eval.json'
const pages = new PageStore(JSON.parse(readFileSync('.llm/regelwerk-seiten.json', 'utf8')))

/** expected profession (word in the chosen name) per NSC, from docs/nsc-umwandlung.md */
const EXPECT: Record<string, RegExp> = {
  'Aschanka Malefsunni': /wundarzt|medicus|heiler/i, 'Darion Pulverberg': /seefahrer|schmuggler|schiffer/i, 'Dioptus aus Zwerch': /söldner|artillerist|gelehrter|mechan/i,
  'Leta Sjenskoje': /handwerker/i, 'Shahane ay Zedrakin': /.*/, 'Haargh-Ma-Mu': /kor/i, 'Praiodan von Luring': /praios/i,
  'Zulhaminja saba Zulyoya': /nandus/i, 'Frederik Narciso': /jäger|kopfgeld/i, 'Sir Rondrigo von Talfenn': /ritter|krieger/i,
  'Valeriano di Salsavarda': /schwertgesell|fedorino/i, 'Arvid Frenhilddotter': /druide/i, 'Ralio Derenvay': /magier/i,
  'Topasa': /handwerker/i, 'Ebba': /seefahrer|handwerker|wirt/i, 'Kapitän Persiphone von Rethis': /seefahrer|schiffer|fähnrich zur see/i, 'Vittorio di Belhanka': /entdecker|kartograph/i, 'Sjadjana die Brutale': /seefahrer|fähnrich zur see|schiffer/i,
}

/** creatures have no profession (fixed values, see docs/nsc-umwandlung.md) */
const SKIP = new Set(['Thalassische Riff-Hydra'])

const walk = (d: string, acc: string[] = []): string[] => {
  for (const e of readdirSync(d)) {
    if (e.startsWith('.')) continue
    const f = join(d, e)
    if (statSync(f).isDirectory()) walk(f, acc)
    else if (e.endsWith('.md')) acc.push(f)
  }
  return acc
}

// one case per note with exactly one NSC block (multi-block encounters are left out)
const cases: { name: string; path: string; description: string; reference: ReturnType<typeof dsa41.parseNscBlock> }[] = []
for (const file of walk(vault)) {
  const text = readFileSync(file, 'utf8')
  const fences = findFences(text, 'dsa-nsc')
  if (fences.length !== 1) continue
  const reference = dsa41.parseNscBlock(fences[0].content)
  const name = reference.name!
  if (SKIP.has(name)) continue
  if (only && !only.some((o) => name.toLowerCase().includes(o))) continue
  const description = text
    .replace(/```dsa-nsc[\s\S]*?```/g, '')
    .replace(/!\[\[[^\]]*\]\]|!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  cases.push({ name, path: relative(vault, file).split(sep).join('/'), description, reference })
}

const jaccard = (a: string[], b: string[]) => {
  const A = new Set(a.map(normalizeName)), B = new Set(b.map(normalizeName))
  const inter = [...A].filter((x) => B.has(x)).length
  return A.size + B.size ? inter / new Set([...A, ...B]).size : 1
}

const results: any[] = []
for (const model of models) {
  const oai = model.startsWith('openai:')
  const ds = model.startsWith('deepseek:')
  if (!oai && !ds && !model.startsWith('claude-')) throw new Error(`Unbekanntes Modell „${model}“ – claude-…, openai:<modell> oder deepseek:<modell>`)
  console.log(`\n=== ${model} (${cases.length} NSCs)`)
  for (const c of cases) {
    process.stdout.write(`  ${c.name.padEnd(30)} `)
    try {
      const effort = (opt('--effort') as any) ?? 'medium'
      const input = { description: c.description, name: c.name }
      const r = oai
        ? await generateNpcOpenAI(openaiClient(undefined), pages, input, { model: model.slice(7), effort })
        : ds
        ? await generateNpcDeepSeek(deepseekClient(undefined), pages, input, { model: model.slice(9) })
        : await generateNpcClaude(claudeClient(undefined), pages, input, { model, effort })
      const gen = dsa41.parseNscBlock(r.block.replace(/^```dsa-nsc\n|\n```$/g, '')).data!
      const ref = c.reference.data!
      const row = {
        model, npc: c.name, profession: r.profession.name, level: r.level, god: r.god,
        professionOk: (EXPECT[c.name] ?? /.*/).test(r.profession.name),
        valid: !dsa41.parseNscBlock(r.block.replace(/^```dsa-nsc\n|\n```$/g, '')).issues.some((i) => i.level === 'error'),
        openIssues: r.issues.length, repairs: r.repairs.length, rounds: r.rounds, seconds: Math.round(r.seconds),
        talente: Math.round(jaccard(gen.talente.map((t) => t.name), ref.talente.map((t) => t.name)) * 100),
        sf: Math.round(jaccard(gen.sonderfertigkeiten.map((t) => t.name), ref.sonderfertigkeiten.map((t) => t.name)) * 100),
        dollars: r.dollars ?? 0,
        quellen: r.quellen,
        block: r.block,
      }
      results.push(row)
      console.log(`${row.professionOk ? '✓' : '✗'} ${r.profession.name.slice(0, 32).padEnd(32)} ${row.level.padEnd(11)} gültig ${row.valid ? 'ja ' : 'NEIN'} Talente ${String(row.talente).padStart(3)}% SF ${String(row.sf).padStart(3)}% ${row.seconds}s, ${row.rounds} Rd.`)
    } catch (e) {
      results.push({ model, npc: c.name, error: (e as Error).message })
      console.log(`✗ Fehler: ${(e as Error).message}`)
    }
  }
}

writeFileSync(out, JSON.stringify(results, null, 2))
console.log('\n=== Zusammenfassung')
for (const model of models) {
  const rs = results.filter((r) => r.model === model && !r.error)
  const avg = (k: string) => Math.round(rs.reduce((s, r) => s + r[k], 0) / Math.max(1, rs.length))
  console.log(`  ${model.padEnd(18)} Profession ${rs.filter((r) => r.professionOk).length}/${rs.length}, gültig ${rs.filter((r) => r.valid).length}/${rs.length}, Talente Ø ${avg('talente')}%, SF Ø ${avg('sf')}%, Ø ${avg('seconds')} s${rs.some((r) => r.dollars) ? `, Kosten ${rs.reduce((s, r) => s + r.dollars, 0).toFixed(2)} $` : ''}, Fehler ${results.filter((r) => r.model === model && r.error).length}`)
}
console.log(`Details mit allen Blöcken: ${out}`)
