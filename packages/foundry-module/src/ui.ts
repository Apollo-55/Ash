import { MODULE_ID, SETTINGS } from './constants.ts'
import { deleteOrphans, importBundle, readBundleZip, type ImportReport, type ReportEntry } from './importer.ts'

const esc = (s: unknown) => foundry.utils.escapeHTML?.(String(s ?? '')) ?? String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

const WARNING_LABELS: Record<string, string> = {
  'unresolved-link': 'Link ohne Ziel',
  'unresolved-heading': 'Überschrift nicht gefunden',
  'unresolved-embed': 'Eingebettete Datei fehlt',
  'dataview-skipped': 'Dataview ausgelassen',
  'unclosed-comment': 'Kommentar nicht geschlossen',
  'unsupported-embed': 'Einbettung nicht unterstützt',
  'invalid-frontmatter': 'Frontmatter',
  'note-type-pending': 'Noch nicht unterstützt',
}

function obsidianLink(vault: string, sourcePath?: string): string {
  if (!sourcePath) return ''
  const href = `obsidian://open?vault=${encodeURIComponent(vault)}&file=${encodeURIComponent(sourcePath)}`
  return `<a class="vtf-source" href="${esc(href)}" title="In Obsidian öffnen"><i class="fa-solid fa-file-lines"></i> ${esc(sourcePath)}</a>`
}

function entryList(report: ImportReport, entries: ReportEntry[], withCheckbox = false): string {
  if (!entries.length) return '<p class="vtf-empty">–</p>'
  return `<ul class="vtf-list">${entries
    .map(
      (e) => `<li>${withCheckbox ? `<input type="checkbox" name="orphan" value="${esc(e.uuid)}" checked> ` : ''}${
        e.type === 'Folder' ? `<i class="fa-solid fa-folder"></i> ${esc(e.name)}` : `@UUID[${e.uuid}]{${esc(e.name).replace(/[{}]/g, '')}}`
      } ${obsidianLink(report.vault.name, e.sourcePath)}</li>`
    )
    .join('')}</ul>`
}

function section(title: string, count: number, body: string, open = false): string {
  return `<details class="vtf-section"${open ? ' open' : ''}><summary>${esc(title)} <span class="vtf-count">${count}</span></summary>${body}</details>`
}

export function renderReportHTML(report: ImportReport): string {
  const warnings = report.warnings
    .map(
      (w) => `<li><span class="vtf-tag">${esc(WARNING_LABELS[w.code] ?? w.code)}</span> ${esc(w.message)} ${obsidianLink(report.vault.name, w.sourcePath)}</li>`
    )
    .join('')
  const errors = [...report.errors, ...report.assets.failed.map((f) => `Upload fehlgeschlagen: ${f}`)]
  const when = new Date(report.importedAt).toLocaleString('de-DE')
  return `
  <div class="vtf-report-body">
    <p class="vtf-meta">Vault <strong>${esc(report.vault.name)}</strong> · importiert ${esc(when)} · Dateien: ${report.assets.uploaded} hochgeladen, ${report.assets.unchanged} unverändert</p>
    ${errors.length ? `<div class="vtf-errors"><strong>Fehler</strong><ul>${errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>` : ''}
    ${section('Angelegt', report.created.length, entryList(report, report.created), report.created.length > 0 && report.created.length <= 30)}
    ${section('Aktualisiert', report.updated.length, entryList(report, report.updated), report.updated.length > 0 && report.updated.length <= 30)}
    ${section('Übersprungen (unverändert)', report.skipped.length, entryList(report, report.skipped))}
    ${section(
      'Verwaist (nicht mehr in der Vault)',
      report.orphans.length,
      report.orphans.length
        ? `<form class="vtf-orphans">${entryList(report, report.orphans, true)}
           <button type="button" data-action="deleteOrphans"><i class="fa-solid fa-trash"></i> Ausgewählte löschen …</button></form>`
        : '<p class="vtf-empty">–</p>',
      report.orphans.length > 0
    )}
    ${section('Warnungen', report.warnings.length, report.warnings.length ? `<ul class="vtf-list">${warnings}</ul>` : '<p class="vtf-empty">–</p>', report.warnings.length > 0)}
  </div>`
}

let ReportAppClass: any = null

function getReportApp(): any {
  if (ReportAppClass) return ReportAppClass
  const { ApplicationV2 } = foundry.applications.api
  ReportAppClass = class ImportReportApp extends ApplicationV2 {
    report: ImportReport
    constructor(report: ImportReport, options = {}) {
      super(options)
      this.report = report
    }
    static DEFAULT_OPTIONS = {
      id: `${MODULE_ID}-report`,
      classes: ['vtf-report'],
      tag: 'div',
      window: { title: 'Importbericht', icon: 'fa-solid fa-file-import', resizable: true },
      position: { width: 640, height: 640 },
      actions: {
        deleteOrphans: async function (this: any) {
          const boxes = this.element.querySelectorAll('input[name="orphan"]:checked') as NodeListOf<HTMLInputElement>
          const uuids = new Set([...boxes].map((b) => b.value))
          const chosen = this.report.orphans.filter((o: ReportEntry) => uuids.has(o.uuid))
          if (!chosen.length) return
          const ok = await foundry.applications.api.DialogV2.confirm({
            window: { title: 'Verwaiste Dokumente löschen' },
            content: `<p>${chosen.length} Dokument(e) endgültig löschen? Das lässt sich nicht rückgängig machen.</p><ul>${chosen
              .map((c: ReportEntry) => `<li>${esc(c.name)}</li>`)
              .join('')}</ul><p>Nicht leere Ordner bleiben erhalten.</p>`,
            rejectClose: false,
          })
          if (!ok) return
          const n = await deleteOrphans(chosen)
          this.report.orphans = this.report.orphans.filter((o: ReportEntry) => !uuids.has(o.uuid) || !!game.folders.get(o.id) || !!game.journal.get(o.id))
          await game.settings.set(MODULE_ID, SETTINGS.lastReport, this.report)
          ui.notifications.info(`${n} verwaiste(s) Dokument(e) gelöscht.`)
          this.render()
        },
      },
    }
    async _renderHTML() {
      return foundry.applications.ux.TextEditor.implementation.enrichHTML(renderReportHTML(this.report))
    }
    _replaceHTML(result: string, content: HTMLElement) {
      content.innerHTML = result
    }
  }
  return ReportAppClass
}

export function showReport(report: ImportReport): void {
  const App = getReportApp()
  new App(report).render({ force: true })
}

export function showLastReport(): void {
  const report = game.settings.get(MODULE_ID, SETTINGS.lastReport) as ImportReport | null
  if (!report?.vault) {
    ui.notifications.warn('Es gibt noch keinen Importbericht.')
    return
  }
  showReport(report)
}

export async function openImportDialog(): Promise<void> {
  if (!game.user.isGM) {
    ui.notifications.warn('Nur die Spielleitung kann eine Vault importieren.')
    return
  }
  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: 'Vault importieren', icon: 'fa-solid fa-file-import' },
    position: { width: 480 },
    content: `
      <p>ZIP-Datei aus Obsidian („Vault to Foundry: Nach Foundry exportieren“) wählen.</p>
      <div class="form-group"><label>Export-ZIP</label><div class="form-fields"><input type="file" name="file" accept=".zip,application/zip" required></div></div>
      <div class="form-group"><label>Alle Dateien neu hochladen</label><div class="form-fields"><input type="checkbox" name="forceAssets"></div>
        <p class="hint">Sonst werden nur geänderte Bilder und PDFs hochgeladen.</p></div>
      <div class="form-group"><label>Alle Journale neu schreiben</label><div class="form-fields"><input type="checkbox" name="forceDocuments"></div>
        <p class="hint">Sonst werden unveränderte Notizen übersprungen.</p></div>`,
    buttons: [
      {
        action: 'import',
        label: 'Importieren',
        icon: 'fa-solid fa-file-import',
        default: true,
        callback: (_event: Event, button: HTMLButtonElement) => {
          const form = button.form as HTMLFormElement
          const el = form.elements as any
          return { file: el.file.files?.[0] as File | undefined, forceAssets: el.forceAssets.checked, forceDocuments: el.forceDocuments.checked }
        },
      },
      { action: 'cancel', label: 'Abbrechen' },
    ],
    rejectClose: false,
  })
  if (!result || typeof result !== 'object' || !result.file) return
  await runImport(result.file, { forceAssets: result.forceAssets, forceDocuments: result.forceDocuments })
}

export async function runImport(file: Blob, opts: { forceAssets?: boolean; forceDocuments?: boolean } = {}): Promise<ImportReport | null> {
  const note = ui.notifications.info('Vault-Import: lese ZIP …', { progress: true, permanent: true })
  const progress = (pct: number, message: string) => note?.update?.({ pct, message: `Vault-Import: ${message}` })
  try {
    const { zip, bundle } = await readBundleZip(file)
    const report = await importBundle(zip, bundle, { ...opts, onProgress: progress })
    progress(1, 'fertig')
    setTimeout(() => note?.remove?.(), 1500)
    showReport(report)
    return report
  } catch (e) {
    note?.remove?.()
    console.error(`${MODULE_ID} |`, e)
    ui.notifications.error(`Vault-Import fehlgeschlagen: ${(e as Error)?.message ?? e}`)
    return null
  }
}
