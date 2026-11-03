// End-to-end test against the local Foundry instance (tools/foundry-local.sh must be running).
// Usage: node tools/e2e/foundry-e2e.mjs <step> [zip] — steps: launch, enable, import <zip>, inspect, reveal, shots
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(import.meta.dirname, '../../.foundry/pw-browsers')
const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const BASE = process.env.VTF_FOUNDRY_URL ?? 'http://localhost:30013'
const WORLD = process.env.VTF_WORLD ?? 'vtf-test'
const OUT = resolve(process.env.VTF_E2E_OUT ?? 'dist/e2e')
mkdirSync(OUT, { recursive: true })

const [step, arg] = process.argv.slice(2)

async function launchWorld() {
  const status = await (await fetch(`${BASE}/api/status`)).json().catch(() => ({}))
  if (status.active && status.world === WORLD) return
  const r1 = await fetch(`${BASE}/setup`)
  const cookie = r1.headers.get('set-cookie')?.split(';')[0] ?? ''
  const res = await fetch(`${BASE}/setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ action: 'launchWorld', world: WORLD }),
  })
  if (!res.ok) throw new Error(`launchWorld: ${res.status} ${await res.text()}`)
  for (let i = 0; i < 60; i++) {
    const s = await (await fetch(`${BASE}/api/status`)).json().catch(() => ({}))
    if (s.active) return
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error('Welt startet nicht')
}

async function joinAsGM(page) {
  await page.goto(`${BASE}/join`)
  await page.waitForSelector('select[name="userid"]')
  const gm = await page.$eval('select[name="userid"]', (sel) => [...sel.options].find((o) => /gamemaster/i.test(o.textContent))?.value)
  await page.selectOption('select[name="userid"]', gm)
  await page.click('button[name="join"]')
  await page.waitForFunction(() => window.game?.ready === true, null, { timeout: 60000 })
  // close first-launch popups (tours, usage data) if any
  await page.evaluate(() => {
    for (const app of foundry.applications.instances?.values?.() ?? []) {
      if (/tour|welcome|usage/i.test(app.constructor.name)) app.close?.()
    }
    game.tours?.activeTour?.exit?.()
  })
}

async function withPage(fn) {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  // headless Chromium has no GPU: canvas rendering would starve the page (client setting → localStorage)
  await page.addInitScript(() => localStorage.setItem('core.noCanvas', 'true'))
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`)
  })
  try {
    await launchWorld()
    await joinAsGM(page)
    return await fn(page, errors)
  } finally {
    if (errors.length) console.log('Browser-Fehler:\n  ' + errors.join('\n  '))
    await browser.close()
  }
}

const steps = {
  async launch() {
    await launchWorld()
    console.log('Welt läuft')
  },

  async enable() {
    await withPage(async (page) => {
      const was = await page.evaluate(async () => {
        const cfg = game.settings.get('core', 'moduleConfiguration')
        const before = !!cfg['vault-to-foundry']
        // headless Chromium has no GPU: canvas rendering would starve the page
        await game.settings.set('core', 'noCanvas', true)
        await game.settings.set('core', 'moduleConfiguration', { ...cfg, 'vault-to-foundry': true })
        return before
      })
      console.log(was ? 'Modul war schon aktiv' : 'Modul aktiviert (Welt lädt neu)')
    })
  },

  async import() {
    if (!arg) throw new Error('ZIP fehlt')
    await withPage(async (page) => {
      const active = await page.evaluate(() => game.modules.get('vault-to-foundry')?.active)
      if (!active) throw new Error('Modul nicht aktiv – erst "enable"')
      await page.evaluate(() => { ui.sidebar.changeTab('journal', 'primary'); (ui.sidebar.toggleExpanded?.(true) ?? ui.sidebar.expand?.()) })
      await page.waitForTimeout(800)
      await page.waitForSelector('.vtf-import', { timeout: 10000 })
      await page.screenshot({ path: `${OUT}/01-sidebar.png` })
      await page.click('.vtf-import')
      await page.waitForSelector('dialog input[name="file"], .application input[name="file"]')
      await page.setInputFiles('input[name="file"]', resolve(arg))
      await page.screenshot({ path: `${OUT}/02-dialog.png` })
      await page.click('button[data-action="import"]')
      await page.waitForSelector('#vault-to-foundry-report', { timeout: 300000 })
      await page.waitForTimeout(500)
      await page.screenshot({ path: `${OUT}/03-report.png` })
      const r = await page.evaluate(() => {
        const rep = game.settings.get('vault-to-foundry', 'lastReport')
        return {
          created: rep.created.length, updated: rep.updated.length, skipped: rep.skipped.length,
          orphans: rep.orphans.map((o) => o.name), warnings: rep.warnings.length, errors: rep.errors, assets: rep.assets,
          journals: game.journal.size, folders: game.folders.size,
        }
      })
      console.log(JSON.stringify(r, null, 2))
    })
  },

  async inspect() {
    await withPage(async (page) => {
      const r = await page.evaluate(async () => {
        const out = {}
        const byName = (n) => game.journal.getName(n)
        // heading link target from "Alles"
        const alles = byName('Alles')
        const html = alles.pages.contents[0].text.content
        out.allesOwnership = alles.ownership.default
        out.commentLeak = /darf nie/.test(html)
        const m = /@UUID\[(JournalEntry\.\w+\.JournalEntryPage\.\w+)#([^\]]+)\]/.exec(html)
        if (m) {
          const page = await fromUuid(m[1])
          out.anchorWanted = m[2]
          out.anchorInToc = Object.keys(page.toc).includes(m[2])
          out.tocKeys = Object.keys(page.toc)
        }
        const enriched = await foundry.applications.ux.TextEditor.implementation.enrichHTML(html)
        out.brokenLinks = (enriched.match(/content-link broken/g) ?? []).length
        out.contentLinks = (enriched.match(/class="content-link/g) ?? []).length
        out.hasSecret = /<section class="secret" id="secret-\w{16}">/.test(html)
        out.callout = /vtf-callout-warning/.test(html)
        // all links in all journals resolvable?
        let broken = 0, total = 0
        for (const j of game.journal) for (const p of j.pages) {
          if (p.type !== 'text') continue
          const e = await foundry.applications.ux.TextEditor.implementation.enrichHTML(p.text.content)
          total += (e.match(/class="content-link/g) ?? []).length
          broken += (e.match(/content-link broken/g) ?? []).length
        }
        out.allLinks = { total, broken }
        // every heading link must point to an existing TOC entry
        const anchors = { total: 0, missing: [] }
        for (const j of game.journal) for (const p of j.pages) {
          if (p.type !== 'text') continue
          for (const m of p.text.content.matchAll(/@UUID\[([^\]#]+)#([^\]]+)\]/g)) {
            anchors.total++
            const target = await fromUuid(m[1])
            if (!target?.toc?.[m[2]]) anchors.missing.push(`${j.name} → ${m[2]}`)
          }
        }
        out.anchors = anchors
        const pdf = byName('Q02 - Efferds Wogen')
        out.pdfPage = pdf?.pages.contents[0] ? { type: pdf.pages.contents[0].type, src: pdf.pages.contents[0].src } : null
        const img = byName('Shahane ay Zedrakin').pages.contents[0].text.content.match(/src="([^"]+)"/)[1]
        out.imageStatus = (await fetch(img)).status
        out.folderDepthMax = Math.max(...game.folders.map((f) => f.depth))
        return out
      })
      console.log(JSON.stringify(r, null, 2))
    })
  },

  async reveal() {
    await withPage(async (page) => {
      const r = await page.evaluate(async () => {
        const p = game.journal.getName('Alles').pages.contents[0]
        await p.update({ 'text.content': p.text.content.replace('class="secret"', 'class="secret revealed"') })
        return /secret revealed/.test(p.text.content)
      })
      console.log('Secret aufgedeckt:', r)
    })
  },

  async check() {
    // after re-import: revealed still there? new sentence?
    await withPage(async (page) => {
      const r = await page.evaluate(() => {
        const c = game.journal.getName('Alles').pages.contents[0].text.content
        return { revealed: /secret revealed/.test(c), newSentence: /Neuer Satz/.test(c), journals: game.journal.size }
      })
      console.log(JSON.stringify(r))
    })
  },

  async orphans() {
    // import a bundle, then delete all orphans through the report UI
    await withPage(async (page) => {
      await page.evaluate(() => { ui.sidebar.changeTab('journal', 'primary'); ui.sidebar.toggleExpanded?.(true) })
      await page.waitForTimeout(800)
      await page.click('.vtf-import')
      await page.setInputFiles('input[name="file"]', resolve(arg))
      await page.click('button[data-action="import"]')
      await page.waitForSelector('#vault-to-foundry-report')
      const before = await page.evaluate(() => game.settings.get('vault-to-foundry', 'lastReport').orphans.map((o) => `${o.type}:${o.name}`))
      await page.screenshot({ path: `${OUT}/20-orphans.png` })
      await page.click('#vault-to-foundry-report button[data-action="deleteOrphans"]')
      await page.waitForSelector('dialog button[data-action="yes"]')
      await page.screenshot({ path: `${OUT}/21-confirm.png` })
      await page.click('dialog button[data-action="yes"]')
      await page.waitForTimeout(1500)
      const after = await page.evaluate(() => ({
        alles: !!game.journal.getName('Alles'), testFolder: !!game.folders.find((f) => f.name === 'Test'),
        journals: game.journal.size, orphansLeft: game.settings.get('vault-to-foundry', 'lastReport').orphans.length,
      }))
      console.log(JSON.stringify({ before, after }))
    })
  },

  async anchorclick() {
    // click both heading links in "Alles"; the target heading must end up inside the visible area
    await withPage(async (page) => {
      await page.evaluate(() => { ui.sidebar.changeTab('journal', 'primary'); ui.sidebar.toggleExpanded?.(true) })
      const results = []
      for (const [label, id] of [['Valeriano', 'der-hintergrund-(der-skandal):'], ['Gerüchte', 'wahre-gerüchte-(oder-nah-an-der-wahrheit):']]) {
        await page.evaluate(() => Object.values(ui.windows).concat([...foundry.applications.instances.values()]).forEach((a) => a.document?.documentName === 'JournalEntry' && a.close()))
        await page.waitForTimeout(500)
        await page.evaluate(() => game.journal.getName('Alles').sheet.render(true))
        await page.waitForTimeout(1500)
        await page.locator('a.content-link', { hasText: label }).first().click()
        await page.waitForTimeout(1500)
        results.push(await page.evaluate(([id]) => {
          const sheet = game.journal.getName('Valeriano di Salsavarda').sheet
          const el = sheet.element?.querySelector(`[id="${CSS.escape(id)}"]`)
          const scroller = sheet.element?.querySelector('.journal-entry-pages')
          if (!el) return { id, ok: false, reason: 'heading not found' }
          const top = Math.round(el.getBoundingClientRect().top - scroller.getBoundingClientRect().top)
          return { id, ok: top >= 0 && top < scroller.clientHeight, top }
        }, [id]))
      }
      await page.screenshot({ path: `${OUT}/13-heading-link.png` })
      console.log(JSON.stringify(results))
    })
  },

  async eval() {
    // run an expression in the GM client: node foundry-e2e.mjs eval "game.folders.map(f=>f.name)"
    await withPage(async (page) => console.log(JSON.stringify(await page.evaluate(`(async () => (${arg}))()`), null, 1)))
  },

  async shots() {
    await withPage(async (page) => {
      await page.evaluate(() => { ui.sidebar.changeTab('journal', 'primary'); (ui.sidebar.toggleExpanded?.(true) ?? ui.sidebar.expand?.()) })
      await page.waitForTimeout(800)
      for (const [name, file] of [['Encounter', '10-encounter'], ['Alles', '11-alles'], ['Shahane ay Zedrakin', '12-shahane']]) {
        await page.evaluate((n) => game.journal.getName(n).sheet.render(true), name)
        await page.waitForTimeout(1500)
        const sel = await page.evaluate((n) => `#${game.journal.getName(n).sheet.id}`, name)
        await page.locator(sel).screenshot({ path: `${OUT}/${file}.png` })
        await page.evaluate((n) => game.journal.getName(n).sheet.close(), name)
      }
      // follow heading link in "Alles"
      await page.evaluate(() => game.journal.getName('Alles').sheet.render(true))
      await page.waitForTimeout(1500)
      const link = page.locator('a.content-link', { hasText: 'Valeriano' }).first()
      await link.click()
      await page.waitForTimeout(2000)
      await page.screenshot({ path: `${OUT}/13-heading-link.png` })
    })
  },
}

if (!steps[step]) {
  console.error(`Schritte: ${Object.keys(steps).join(', ')}`)
  process.exit(1)
}
await steps[step]()
