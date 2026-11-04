import { MODULE_ID, SETTINGS } from './constants.ts'
import { pendingCount } from './server-sync.ts'
import { openImportDialog, openServerSync, runImport, runServerSync, showLastReport } from './ui.ts'

Hooks.once('init', () => {
  game.settings.register(MODULE_ID, SETTINGS.assetManifest, {
    scope: 'world',
    config: false,
    type: Object,
    default: {},
  })
  game.settings.register(MODULE_ID, SETTINGS.extraPacks, {
    name: 'Zusätzliche Kompendien für NSC-Items',
    hint: 'Kompendium-IDs, durch Komma getrennt (z. B. world.hausregeln). Werden vor den System-Kompendien durchsucht, nach den Gegenständen der Welt.',
    scope: 'world',
    config: true,
    type: String,
    default: '',
  })
  game.settings.register(MODULE_ID, SETTINGS.syncRevisions, {
    scope: 'world',
    config: false,
    type: Object,
    default: {},
  })
  game.settings.register(MODULE_ID, SETTINGS.boundVault, {
    name: 'Verbundene Vault dieser Welt',
    hint: 'Wird beim ersten „Vault synchronisieren“ gesetzt; danach zeigt die Welt nur noch diese Vault. Feld leeren und speichern, um die Verbindung zu lösen.',
    scope: 'world',
    config: true,
    type: String,
    default: '',
    onChange: () => refreshPending(),
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
  if (mod) mod.api = { openImportDialog, runImport, showLastReport, openServerSync, runServerSync, pendingCount }
  if (game.user?.isGM) {
    // only shows that changes are waiting – applying always needs the button
    refreshPending()
    setInterval(refreshPending, 60_000)
  }
})

let pending = 0
async function refreshPending() {
  pending = await pendingCount().catch(() => 0)
  document.querySelectorAll<HTMLElement>('.vtf-sync').forEach(markButton)
}
function markButton(btn: HTMLElement) {
  btn.classList.toggle('vtf-pending', pending > 0)
  btn.title = pending > 0 ? 'Neue Änderungen aus Obsidian liegen bereit' : 'Stand vom Sync-Server übernehmen'
}
Hooks.on('vault-to-foundry.synced', () => refreshPending())

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
    <button type="button" class="vtf-sync"><i class="fa-solid fa-rotate"></i> Vault synchronisieren</button>
    <button type="button" class="vtf-import" title="Backup: Export-ZIP importieren"><i class="fa-solid fa-file-zipper"></i></button>
    <button type="button" class="vtf-last-report" title="Letzten Importbericht anzeigen"><i class="fa-solid fa-list-check"></i></button>`
  wrap.querySelector('.vtf-sync')!.addEventListener('click', () => openServerSync())
  markButton(wrap.querySelector('.vtf-sync')!)
  wrap.querySelector('.vtf-import')!.addEventListener('click', () => openImportDialog())
  wrap.querySelector('.vtf-last-report')!.addEventListener('click', () => showLastReport())
  target.after(wrap)
})
