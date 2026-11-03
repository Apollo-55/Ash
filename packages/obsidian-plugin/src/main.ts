import { App, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, type TAbstractFile } from 'obsidian'
import JSZip from 'jszip'
import { buildBundle, hashBytes, vaultSlug, type Bundle, type LinkResolver, type NoteInput } from '../../core/src/index.ts'

interface VtfSettings {
  outputDir: string
  excludePatterns: string[]
  rootFolder: string
  includeUnreferencedAttachments: boolean
  /** sourcePath → Foundry id; kept up to date on rename so ids survive moves */
  idMap: Record<string, string>
}

const nodeRequire = (id: string): any => (window as any).require(id)

function defaultOutputDir(): string {
  try {
    return nodeRequire('path').join(nodeRequire('os').homedir(), 'Downloads')
  } catch {
    return ''
  }
}

const DEFAULTS: VtfSettings = {
  outputDir: '',
  excludePatterns: [],
  rootFolder: '',
  includeUnreferencedAttachments: true,
  idMap: {},
}

export default class VaultToFoundryPlugin extends Plugin {
  settings: VtfSettings = { ...DEFAULTS }

  async onload(): Promise<void> {
    await this.loadSettings()

    this.addCommand({
      id: 'export-zip',
      name: 'Nach Foundry exportieren (ZIP)',
      callback: () => this.exportZip(),
    })
    this.addRibbonIcon('package', 'Vault to Foundry: exportieren', () => this.exportZip())

    // Keep ids stable when notes or folders are renamed/moved
    this.registerEvent(
      this.app.vault.on('rename', async (file: TAbstractFile, oldPath: string) => {
        const map = this.settings.idMap
        let changed = false
        for (const key of Object.keys(map)) {
          if (key === oldPath || key.startsWith(oldPath + '/')) {
            const newKey = file.path + key.slice(oldPath.length)
            map[newKey] = map[key]
            delete map[key]
            changed = true
          }
        }
        if (changed) await this.saveSettings()
      })
    )

    this.addSettingTab(new VtfSettingTab(this.app, this))
  }

  async loadSettings(): Promise<void> {
    this.settings = { ...DEFAULTS, outputDir: defaultOutputDir(), ...((await this.loadData()) ?? {}) }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings)
  }

  outputFileName(): string {
    return `${vaultSlug(this.app.vault.getName())}-foundry.zip`
  }

  async exportZip(): Promise<void> {
    const outDir = this.settings.outputDir.trim()
    if (!outDir) {
      new Notice('Vault to Foundry: Bitte zuerst in den Einstellungen einen Exportordner angeben.')
      return
    }
    const notice = new Notice('Vault to Foundry: exportiere …', 0)
    try {
      const vault = this.app.vault
      const cache = this.app.metadataCache
      const files = vault.getFiles()
      const notes: NoteInput[] = []
      for (const f of files) {
        if (f.extension !== 'md') continue
        notes.push({ path: f.path, content: await vault.cachedRead(f), frontmatter: cache.getFileCache(f)?.frontmatter ?? null })
      }
      const attachments = files.filter((f) => f.extension !== 'md').map((f) => f.path)
      const resolver: LinkResolver = {
        resolve: (linkpath, from) => cache.getFirstLinkpathDest(linkpath, from)?.path ?? null,
      }

      const { bundle, idMap, assetFiles } = buildBundle({
        vaultName: vault.getName(),
        notes,
        attachments,
        resolver,
        idMap: this.settings.idMap,
        excludePatterns: this.settings.excludePatterns,
        rootFolder: this.settings.rootFolder.trim() || undefined,
        includeUnreferencedAttachments: this.settings.includeUnreferencedAttachments,
        generator: { name: 'vault-to-foundry-obsidian', version: this.manifest.version },
      })

      const zip = new JSZip()
      const byZip = new Map(bundle.assets.map((a) => [`assets/${a.path}`, a]))
      let i = 0
      for (const [zipPath, vaultPath] of assetFiles) {
        notice.setMessage(`Vault to Foundry: packe Dateien … ${++i}/${assetFiles.size}`)
        const file = vault.getAbstractFileByPath(vaultPath)
        if (!(file instanceof TFile)) continue
        const data = new Uint8Array(await vault.readBinary(file))
        const asset = byZip.get(zipPath)!
        asset.hash = hashBytes(data)
        asset.size = data.byteLength
        // images and PDFs are already compressed
        zip.file(zipPath, data, { compression: 'STORE' })
      }
      zip.file('bundle.json', JSON.stringify(bundle, null, 2))
      notice.setMessage('Vault to Foundry: schreibe ZIP …')
      const buf = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } })

      const fs = nodeRequire('fs')
      const path = nodeRequire('path')
      await fs.promises.mkdir(outDir, { recursive: true })
      const target = path.join(outDir, this.outputFileName())
      await fs.promises.writeFile(target, buf)

      this.settings.idMap = idMap
      await this.saveSettings()
      notice.hide()
      new ExportResultModal(this.app, bundle, target, buf.byteLength).open()
    } catch (e) {
      notice.hide()
      console.error('vault-to-foundry', e)
      new Notice(`Vault to Foundry: Export fehlgeschlagen – ${(e as Error)?.message ?? e}`, 10000)
    }
  }
}

class ExportResultModal extends Modal {
  constructor(
    app: App,
    private bundle: Bundle,
    private target: string,
    private size: number
  ) {
    super(app)
  }

  onOpen(): void {
    const { contentEl, bundle } = this
    this.titleEl.setText('Export für Foundry')
    contentEl.addClass('vtf-export-result')
    contentEl.createEl('p', {
      text: `${bundle.documents.length} Journale, ${bundle.folders.length} Ordner, ${bundle.assets.length} Dateien (${(this.size / 1048576).toFixed(1)} MB).`,
    })
    const p = contentEl.createEl('p')
    p.createSpan({ text: 'Gespeichert unter: ' })
    p.createEl('code', { text: this.target })
    contentEl.createEl('p', { text: 'In Foundry: Journal-Seitenleiste → „Vault importieren“ → diese Datei wählen.', cls: 'vtf-hint' })

    if (bundle.skipped.length) {
      const d = contentEl.createEl('details')
      d.createEl('summary', { text: `Übersprungen: ${bundle.skipped.length}` })
      const ul = d.createEl('ul')
      for (const s of bundle.skipped) ul.createEl('li', { text: `${s.sourcePath} (${s.reason})` })
    }

    const d = contentEl.createEl('details', { attr: bundle.warnings.length ? { open: '' } : {} })
    d.createEl('summary', { text: `Warnungen: ${bundle.warnings.length}` })
    const ul = d.createEl('ul')
    for (const w of bundle.warnings) {
      const li = ul.createEl('li')
      const link = li.createEl('a', { text: w.sourcePath, href: '#' })
      link.addEventListener('click', (ev) => {
        ev.preventDefault()
        this.app.workspace.openLinkText(w.sourcePath, '', false)
        this.close()
      })
      li.createSpan({ text: `: ${w.message}` })
    }

    new Setting(contentEl)
      .addButton((b) =>
        b.setButtonText('Ordner öffnen').onClick(() => {
          try {
            nodeRequire('electron').shell.showItemInFolder(this.target)
          } catch {
            new Notice(this.target)
          }
        })
      )
      .addButton((b) => b.setButtonText('Schließen').setCta().onClick(() => this.close()))
  }

  onClose(): void {
    this.contentEl.empty()
  }
}

class VtfSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private plugin: VaultToFoundryPlugin
  ) {
    super(app, plugin)
  }

  display(): void {
    const { containerEl } = this
    const s = this.plugin.settings
    containerEl.empty()

    new Setting(containerEl)
      .setName('Exportordner')
      .setDesc(`Hierhin wird „${this.plugin.outputFileName()}“ geschrieben (wird bei jedem Export überschrieben).`)
      .addText((t) =>
        t.setPlaceholder('/home/…/Downloads').setValue(s.outputDir).onChange(async (v) => {
          s.outputDir = v
          await this.plugin.saveSettings()
        })
      )

    new Setting(containerEl)
      .setName('Nie exportieren')
      .setDesc('Ein Muster pro Zeile. „Ordner/“ schließt einen Ordner aus, „*“ steht für beliebige Zeichen, „*.canvas“ wirkt überall. Beispiel: _privat/, Vorlagen/, *TODO*')
      .addTextArea((t) => {
        t.inputEl.rows = 5
        t.setValue(s.excludePatterns.join('\n')).onChange(async (v) => {
          s.excludePatterns = v.split('\n').map((x) => x.trim()).filter(Boolean)
          await this.plugin.saveSettings()
        })
      })

    new Setting(containerEl)
      .setName('Wurzelordner in Foundry')
      .setDesc('Optional. Legt alles in einen gemeinsamen Ordner. Foundry erlaubt 4 Ebenen, tiefere werden zusammengefasst.')
      .addText((t) =>
        t.setPlaceholder('(keiner)').setValue(s.rootFolder).onChange(async (v) => {
          s.rootFolder = v
          await this.plugin.saveSettings()
        })
      )

    new Setting(containerEl)
      .setName('Auch nicht verlinkte Dateien hochladen')
      .setDesc('Bilder, Tokens und PDFs, auf die keine Notiz verweist, trotzdem mitnehmen (z. B. für Tiles).')
      .addToggle((t) =>
        t.setValue(s.includeUnreferencedAttachments).onChange(async (v) => {
          s.includeUnreferencedAttachments = v
          await this.plugin.saveSettings()
        })
      )

    new Setting(containerEl)
      .setName('ID-Zuordnung')
      .setDesc(`${Object.keys(s.idMap).length} Notizen haben eine feste Foundry-ID. Zurücksetzen erzeugt beim nächsten Import Duplikate für umbenannte Notizen.`)
      .addButton((b) =>
        b.setButtonText('Zurücksetzen').setWarning().onClick(async () => {
          s.idMap = {}
          await this.plugin.saveSettings()
          this.display()
        })
      )
  }
}
