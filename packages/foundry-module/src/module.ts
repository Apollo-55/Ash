import { MODULE_ID, SETTINGS } from './constants.ts'
import { openImportDialog, runImport, showLastReport } from './ui.ts'

Hooks.once('init', () => {
  game.settings.register(MODULE_ID, SETTINGS.assetManifest, {
    scope: 'world',
    config: false,
    type: Object,
    default: {},
  })
  game.settings.register(MODULE_ID, SETTINGS.lastReport, {
    scope: 'world',
    config: false,
    type: Object,
    default: null,
  })
})

Hooks.once('ready', () => {
  const mod = game.modules.get(MODULE_ID)
  if (mod) mod.api = { openImportDialog, runImport, showLastReport }
})

// Foundry v13 only scrolls to a link's #anchor when the page changes. A heading link into a freshly opened
// single-page journal therefore lands at the top. Scroll ourselves (next tick, after Foundry restores the scroll
// position) – only for journals made by this importer.
Hooks.on('renderJournalEntrySheet', (app: any, _el: HTMLElement, _ctx: unknown, options: { anchor?: string }) => {
  if (!options?.anchor || !app.document?.flags?.[MODULE_ID]) return
  setTimeout(() => app.getPageSheet?.(app.pageId)?.toc?.[options.anchor!]?.element?.scrollIntoView(), 0)
})

// Buttons in the journal sidebar (GM only)
Hooks.on('renderJournalDirectory', (_app: unknown, html: HTMLElement | { [0]: HTMLElement }) => {
  if (!game.user?.isGM) return
  const root = html instanceof HTMLElement ? html : html[0]
  if (!root || root.querySelector('.vtf-buttons')) return
  const target = root.querySelector('.header-actions') ?? root.querySelector('.directory-header')
  if (!target) return
  const wrap = document.createElement('div')
  wrap.className = 'vtf-buttons'
  wrap.innerHTML = `
    <button type="button" class="vtf-import"><i class="fa-solid fa-file-import"></i> Vault importieren</button>
    <button type="button" class="vtf-last-report" title="Letzten Importbericht anzeigen"><i class="fa-solid fa-list-check"></i></button>`
  wrap.querySelector('.vtf-import')!.addEventListener('click', () => openImportDialog())
  wrap.querySelector('.vtf-last-report')!.addEventListener('click', () => showLastReport())
  target.after(wrap)
})
