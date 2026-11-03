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
