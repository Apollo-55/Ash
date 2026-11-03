import { App, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, requestUrl, sanitizeHTMLToDom, type Editor, type TAbstractFile } from 'obsidian'
import JSZip from 'jszip'
import { actorsOf, buildBundle, dsa41Adapter, hashBytes, journalsOf, LEAFLET_DATA_PATH, leafletMarkersFromPluginData, parseLeafletBlock, parseSceneBlock, renderSceneCard, SCENE_BLOCK, scenesOf, vaultSlug, type Bundle, type HttpFn, type LinkResolver, type NoteInput, type SystemAdapter, pushBundle, SyncClient } from '../../core/src/index.ts'

const ADAPTERS: Record<string, SystemAdapter<any>> = { dsa41: dsa41Adapter }

interface VtfSettings {
  /** name of the vault in Foundry; part of every document id. Fixed on first use, independent of the folder name. */
  vaultName: string
  outputDir: string
  excludePatterns: string[]
  rootFolder: string
  includeUnreferencedAttachments: boolean
  /** game system adapter for NPC blocks ("dsa41") or "" for none */
  system: string
  /** sourcePath → Foundry id; kept up to date on rename so ids survive moves */
  idMap: Record<string, string>
  /** vtf-sync service, e.g. https://foundry.example.org/vtf-sync */
  syncUrl: string
  syncToken: string
  /** sync automatically after saving */
  autoSync: boolean
  /** seconds after the last change */
  autoSyncDelay: number
  /** file hashes by modification time, so unchanged files are not read again */
  hashCache: Record<string, { mtime: number; size: number; hash: string }>
}

/** Obsidian's requestUrl as transport (no CORS restrictions). */
const obsidianHttp: HttpFn = async (req) => {
  const body = req.body instanceof Uint8Array ? req.body.buffer.slice(req.body.byteOffset, req.body.byteOffset + req.body.byteLength) as ArrayBuffer : req.body
  const res = await requestUrl({ url: req.url, method: req.method, headers: req.headers, body, contentType: req.headers['Content-Type'], throw: false })
  return { status: res.status, text: res.text }
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
  vaultName: '',
  outputDir: '',
  excludePatterns: [],
  rootFolder: '',
  includeUnreferencedAttachments: true,
  system: 'dsa41',
  idMap: {},
  syncUrl: '',
  syncToken: '',
  autoSync: true,
  autoSyncDelay: 10,
  hashCache: {},
}

export default class VaultToFoundryPlugin extends Plugin {
  settings: VtfSettings = { ...DEFAULTS }
  private statusEl!: HTMLElement
  private syncTimer: number | null = null
  private syncRunning = false
  private syncAgain = false

  async onload(): Promise<void> {
    await this.loadSettings()

    // ---- server sync ----
    this.statusEl = this.addStatusBarItem()
    this.statusEl.addClass('vtf-status')
    this.statusEl.addEventListener('click', () => this.syncNow(true))
    this.setStatus(this.syncConfigured() ? 'idle' : 'off')
    this.addCommand({ id: 'sync-server', name: 'Mit Foundry-Server synchronisieren', callback: () => this.syncNow(true) })
    this.addCommand({ id: 'cleanup-server', name: 'Ungenutzte Dateien auf dem Foundry-Server entfernen', callback: () => this.cleanupServer() })
    this.app.workspace.onLayoutReady(() => {
      // registered after startup, otherwise every file of the vault fires a "create" event
      const trigger = (file: TAbstractFile) => {
        if (!file.path.startsWith(this.app.vault.configDir)) this.scheduleSync()
      }
      this.registerEvent(this.app.vault.on('modify', trigger))
      this.registerEvent(this.app.vault.on('create', trigger))
      this.registerEvent(this.app.vault.on('delete', trigger))
      this.registerEvent(this.app.vault.on('rename', trigger))
    })

    this.addCommand({
      id: 'export-zip',
      name: 'Nach Foundry exportieren (ZIP)',
      callback: () => this.exportZip(),
    })
    this.addRibbonIcon('package', 'Vault to Foundry: exportieren', () => this.exportZip())

    // NPC blocks: rendered as stat box with validation and calculated values
    for (const adapter of Object.values(ADAPTERS)) {
      this.registerMarkdownCodeBlockProcessor(adapter.blockLanguage, (source, el) => {
        const html = adapter.renderStatblock(adapter.parse(source), { showIssues: true, showCalculated: true })
        el.appendChild(sanitizeHTMLToDom(html))
      })
    }
    // scene blocks: card with map preview and validation
    this.registerMarkdownCodeBlockProcessor(SCENE_BLOCK, async (source, el, ctx) => {
      const parsed = parseSceneBlock(source)
      let imageSrc: string | null = null
      const d = parsed.data
      const toFile = (ref: string, from: string) => {
        const clean = ref.replace(/^["']|["']$/g, '').replace(/^!?\[\[|\]\]$/g, '').split('|')[0].trim()
        return this.app.metadataCache.getFirstLinkpathDest(clean, from)
      }
      if (d?.karte) {
        const f = toFile(d.karte, ctx.sourcePath)
        if (f) imageSrc = this.app.vault.getResourcePath(f)
        else parsed.issues.push({ level: 'error', message: `Kartenbild ${d.karte} nicht gefunden.` })
      } else if (d?.leaflet) {
        const lb = await this.findLeafletBlock(d.leaflet)
        const f = lb?.images[0] ? toFile(lb.images[0], lb.sourcePath) : null
        if (f) imageSrc = this.app.vault.getResourcePath(f)
        else parsed.issues.push({ level: 'error', message: `Leaflet-Karte „${d.leaflet}“ nicht gefunden.` })
      }
      el.appendChild(sanitizeHTMLToDom(renderSceneCard(parsed, { showIssues: true, imageSrc, fallbackName: ctx.sourcePath.split('/').pop()?.replace(/\.md$/, '') })))
    })

    this.addCommand({
      id: 'insert-nsc-template',
      name: 'DSA-NSC-Vorlage einfügen',
      editorCallback: (editor: Editor) => {
        const adapter = ADAPTERS[this.settings.system] ?? dsa41Adapter
        const cursor = editor.getCursor()
        const prefix = cursor.ch > 0 ? '\n\n' : ''
        editor.replaceSelection(prefix + adapter.template())
        // place the cursor behind "name: "
        const line = cursor.line + (prefix ? 2 : 0) + 1
        editor.setCursor({ line, ch: editor.getLine(line).length })
      },
    })

    // Keep ids stable when notes or folders are renamed/moved
    this.registerEvent(
      this.app.vault.on('rename', async (file: TAbstractFile, oldPath: string) => {
        const map = this.settings.idMap
        let changed = false
        for (const key of Object.keys(map)) {
          // "note.md", "folder/…" and NPC keys "note.md#Name"
          if (key === oldPath || key.startsWith(oldPath + '/') || key.startsWith(oldPath + '#')) {
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
    if (!this.settings.vaultName.trim()) {
      // remember the name once, so renaming the vault folder later does not create duplicates in Foundry
      this.settings.vaultName = this.app.vault.getName()
      await this.saveSettings()
    }
  }

  /** name used for ids and the server folder */
  foundryVaultName(): string {
    return this.settings.vaultName.trim() || this.app.vault.getName()
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings)
  }

  async findLeafletBlock(id: string): Promise<(ReturnType<typeof parseLeafletBlock> & { sourcePath: string }) | null> {
    for (const f of this.app.vault.getMarkdownFiles()) {
      const text = await this.app.vault.cachedRead(f)
      if (!text.includes('```leaflet')) continue
      for (const m of text.matchAll(/```leaflet\n([\s\S]*?)```/g)) {
        const lb = parseLeafletBlock(m[1])
        if (lb?.id === id) return { ...lb, sourcePath: f.path }
      }
    }
    return null
  }

  async leafletMarkers() {
    try {
      const raw = await this.app.vault.adapter.read(`${this.app.vault.configDir}/${LEAFLET_DATA_PATH}`)
      return leafletMarkersFromPluginData(JSON.parse(raw))
    } catch {
      return {}
    }
  }

  /** Builds the bundle from the current vault (shared by ZIP export and server sync). */
  async buildFromVault() {
    const vault = this.app.vault
    const cache = this.app.metadataCache
    const files = vault.getFiles()
    const notes: NoteInput[] = []
    for (const f of files) {
      if (f.extension !== 'md') continue
      notes.push({ path: f.path, content: await vault.cachedRead(f), frontmatter: cache.getFileCache(f)?.frontmatter ?? null })
    }
    const resolver: LinkResolver = { resolve: (linkpath, from) => cache.getFirstLinkpathDest(linkpath, from)?.path ?? null }
    return buildBundle({
      vaultName: this.foundryVaultName(),
      notes,
      attachments: files.filter((f) => f.extension !== 'md').map((f) => f.path),
      resolver,
      idMap: this.settings.idMap,
      excludePatterns: this.settings.excludePatterns,
      rootFolder: this.settings.rootFolder.trim() || undefined,
      includeUnreferencedAttachments: this.settings.includeUnreferencedAttachments,
      generator: { name: 'vault-to-foundry-obsidian', version: this.manifest.version },
      system: ADAPTERS[this.settings.system],
      leafletMarkers: await this.leafletMarkers(),
    })
  }

  // ---- server sync ---------------------------------------------------------------------------

  syncConfigured(): boolean {
    return Boolean(this.settings.syncUrl.trim() && this.settings.syncToken.trim())
  }

  client(): SyncClient {
    return new SyncClient(this.settings.syncUrl.trim(), this.settings.syncToken.trim(), obsidianHttp)
  }

  setStatus(state: 'off' | 'idle' | 'waiting' | 'busy' | 'ok' | 'error', detail = ''): void {
    const text: Record<typeof state, string> = {
      off: '', idle: 'Foundry ○', waiting: 'Foundry ⏳', busy: `Foundry ⟳ ${detail}`, ok: `Foundry ✓`, error: 'Foundry ✗',
    }
    this.statusEl.setText(text[state])
    this.statusEl.setAttr('title', detail || (state === 'waiting' ? 'Synchronisiert gleich' : 'Klicken: jetzt mit Foundry synchronisieren'))
    this.statusEl.toggleClass('vtf-status-error', state === 'error')
  }

  scheduleSync(): void {
    if (!this.settings.autoSync || !this.syncConfigured()) return
    if (this.syncTimer) window.clearTimeout(this.syncTimer)
    this.setStatus('waiting')
    this.syncTimer = window.setTimeout(() => {
      this.syncTimer = null
      this.syncNow(false)
    }, Math.max(2, this.settings.autoSyncDelay) * 1000)
  }

  private async fileInfo(path: string): Promise<{ hash: string; size: number }> {
    const file = this.app.vault.getAbstractFileByPath(path)
    if (!(file instanceof TFile)) throw new Error(`${path} fehlt`)
    const cached = this.settings.hashCache[path]
    if (cached && cached.mtime === file.stat.mtime && cached.size === file.stat.size) return cached
    const data = new Uint8Array(await this.app.vault.readBinary(file))
    const entry = { mtime: file.stat.mtime, size: data.byteLength, hash: hashBytes(data) }
    this.settings.hashCache[path] = entry
    return entry
  }

  async syncNow(manual: boolean): Promise<void> {
    if (!this.syncConfigured()) {
      if (manual) new Notice('Vault to Foundry: Bitte in den Einstellungen Server-Adresse und Token eintragen.')
      return
    }
    if (this.syncRunning) {
      this.syncAgain = true
      return
    }
    this.syncRunning = true
    this.setStatus('busy', '…')
    try {
      const { bundle, idMap, assetFiles } = await this.buildFromVault()
      const r = await pushBundle({
        client: this.client(),
        bundle,
        assetFiles,
        fileInfo: (p) => this.fileInfo(p),
        read: async (p) => new Uint8Array(await this.app.vault.readBinary(this.app.vault.getAbstractFileByPath(p) as TFile)),
        onProgress: (done, total) => this.setStatus('busy', `${done}/${total}`),
      })
      // forget hashes of files that are gone
      const current = new Set(assetFiles.values())
      for (const k of Object.keys(this.settings.hashCache)) if (!current.has(k)) delete this.settings.hashCache[k]
      this.settings.idMap = idMap
      await this.saveSettings()
      if (r.failed.length) throw new Error(`${r.failed.length} Datei(en) nicht hochgeladen: ${r.failed[0]}`)
      const summary = `Revision ${r.revision}${r.bundleUnchanged ? ' (unverändert)' : ''}, ${r.uploaded.length} Datei(en) hochgeladen`
      this.setStatus('ok', `Zuletzt ${new Date().toLocaleTimeString('de-DE')}: ${summary}`)
      if (manual) new Notice(`Vault to Foundry: ${summary}. In Foundry „Vault synchronisieren“ klicken.`)
    } catch (e) {
      const msg = (e as Error)?.message ?? String(e)
      this.setStatus('error', `Sync fehlgeschlagen: ${msg}`)
      if (manual) new Notice(`Vault to Foundry: Sync fehlgeschlagen – ${msg}`, 10000)
      console.error('vault-to-foundry sync', e)
    } finally {
      this.syncRunning = false
      if (this.syncAgain) {
        this.syncAgain = false
        this.syncNow(false)
      }
    }
  }

  async cleanupServer(): Promise<void> {
    if (!this.syncConfigured()) {
      new Notice('Vault to Foundry: Bitte zuerst Server-Adresse und Token eintragen.')
      return
    }
    try {
      const slug = vaultSlug(this.foundryVaultName())
      const unused = await this.client().unused(slug)
      if (!unused.length) {
        new Notice('Vault to Foundry: Auf dem Server liegen keine ungenutzten Dateien.')
        return
      }
      new CleanupModal(this.app, unused, async () => {
        const deleted = await this.client().cleanup(slug, unused)
        new Notice(`Vault to Foundry: ${deleted.length} Datei(en) auf dem Server gelöscht.`)
      }).open()
    } catch (e) {
      new Notice(`Vault to Foundry: ${(e as Error)?.message ?? e}`, 10000)
    }
  }

  outputFileName(): string {
    return `${vaultSlug(this.foundryVaultName())}-foundry.zip`
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
      const { bundle, idMap, assetFiles } = await this.buildFromVault()

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

class CleanupModal extends Modal {
  constructor(
    app: App,
    private paths: string[],
    private onConfirm: () => Promise<void>
  ) {
    super(app)
  }
  onOpen(): void {
    this.titleEl.setText('Ungenutzte Dateien auf dem Server')
    this.contentEl.createEl('p', { text: `${this.paths.length} Datei(en) auf dem Foundry-Server gehören zu keiner Notiz mehr und werden gelöscht. Szenen oder Charaktere in Foundry, die sie noch benutzen, zeigen danach kein Bild mehr.` })
    const ul = this.contentEl.createEl('ul', { cls: 'vtf-cleanup-list' })
    for (const p of this.paths.slice(0, 200)) ul.createEl('li', { text: p })
    if (this.paths.length > 200) this.contentEl.createEl('p', { text: `… und ${this.paths.length - 200} weitere` })
    new Setting(this.contentEl)
      .addButton((b) => b.setButtonText('Abbrechen').onClick(() => this.close()))
      .addButton((b) =>
        b.setButtonText('Löschen').setWarning().onClick(async () => {
          b.setDisabled(true)
          await this.onConfirm()
          this.close()
        })
      )
  }
  onClose(): void {
    this.contentEl.empty()
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
      text: `${journalsOf(bundle).length} Journale, ${actorsOf(bundle).length} NSCs, ${scenesOf(bundle).length} Szenen, ${bundle.folders.length} Ordner, ${bundle.assets.length} Dateien (${(this.size / 1048576).toFixed(1)} MB).`,
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
    const save = () => this.plugin.saveSettings()
    containerEl.empty()

    // ---- Sync ----
    new Setting(containerEl).setName('Sync mit Foundry').setHeading()
    containerEl.createEl('p', {
      cls: 'setting-item-description',
      text: 'Geänderte Notizen und Bilder gehen an den Sync-Dienst auf deinem Server. Foundry übernimmt sie erst, wenn du dort „Vault synchronisieren“ klickst. Einrichtung: docs/sync-server.md.',
    })
    new Setting(containerEl)
      .setName('Server-Adresse')
      .setDesc('z. B. https://dsa.manic-gaming.de/vtf-sync')
      .addText((t) =>
        t.setPlaceholder('https://…/vtf-sync').setValue(s.syncUrl).onChange(async (v) => {
          s.syncUrl = v.trim()
          await save()
          this.plugin.setStatus(this.plugin.syncConfigured() ? 'idle' : 'off')
        })
      )
    new Setting(containerEl)
      .setName('Token')
      .setDesc('Derselbe Wert wie VTF_TOKEN im Container.')
      .addText((t) => {
        t.inputEl.type = 'password'
        t.setValue(s.syncToken).onChange(async (v) => {
          s.syncToken = v.trim()
          await save()
          this.plugin.setStatus(this.plugin.syncConfigured() ? 'idle' : 'off')
        })
      })
    new Setting(containerEl)
      .setName('Beim Speichern automatisch synchronisieren')
      .setDesc('Sonst nur per Befehl „Mit Foundry-Server synchronisieren“ oder Klick auf „Foundry“ in der Statusleiste.')
      .addToggle((t) =>
        t.setValue(s.autoSync).onChange(async (v) => {
          s.autoSync = v
          await save()
        })
      )
    new Setting(containerEl)
      .setName('Wartezeit nach dem Speichern')
      .setDesc('Sekunden ohne weitere Änderung, bevor synchronisiert wird.')
      .addSlider((sl) =>
        sl.setLimits(2, 60, 1).setValue(s.autoSyncDelay).setDynamicTooltip().onChange(async (v) => {
          s.autoSyncDelay = v
          await save()
        })
      )
    new Setting(containerEl)
      .addButton((b) =>
        b.setButtonText('Verbindung testen').onClick(async () => {
          try {
            const c = this.plugin.client()
            const h = await c.health()
            const st = await c.state(vaultSlug(this.plugin.foundryVaultName()))
            new Notice(`Verbunden mit vtf-sync ${h.version}. Auf dem Server: Revision ${st.revision}, ${Object.keys(st.assets).length} Dateien.`)
          } catch (e) {
            new Notice(`Keine Verbindung: ${(e as Error)?.message ?? e}`, 10000)
          }
        })
      )
      .addButton((b) => b.setButtonText('Jetzt synchronisieren').setCta().onClick(() => this.plugin.syncNow(true)))
      .addButton((b) => b.setButtonText('Ungenutzte Dateien entfernen …').onClick(() => this.plugin.cleanupServer()))

    // ---- Inhalt ----
    new Setting(containerEl).setName('Inhalt').setHeading()
    new Setting(containerEl)
      .setName('Spielsystem für NSC-Blöcke')
      .setDesc('Welche Codeblöcke als NSC gelten und wie sie nach Foundry übertragen werden.')
      .addDropdown((d) =>
        d
          .addOption('dsa41', 'DSA 4.1 (dsa-41) – ```dsa-nsc')
          .addOption('', 'keins (NSC-Blöcke bleiben Codeblöcke)')
          .setValue(s.system)
          .onChange(async (v) => {
            s.system = v
            await save()
          })
      )
    new Setting(containerEl)
      .setName('Nie exportieren')
      .setDesc('Ein Muster pro Zeile. „Ordner/“ schließt einen Ordner aus, „*“ steht für beliebige Zeichen, „*.canvas“ wirkt überall. Beispiel: _privat/, Vorlagen/, *TODO*')
      .addTextArea((t) => {
        t.inputEl.rows = 5
        t.setValue(s.excludePatterns.join('\n')).onChange(async (v) => {
          s.excludePatterns = v.split('\n').map((x) => x.trim()).filter(Boolean)
          await save()
        })
      })
    new Setting(containerEl)
      .setName('Auch nicht verlinkte Dateien mitnehmen')
      .setDesc('Bilder, Tokens und PDFs, auf die keine Notiz verweist, trotzdem übertragen (z. B. für Tiles).')
      .addToggle((t) =>
        t.setValue(s.includeUnreferencedAttachments).onChange(async (v) => {
          s.includeUnreferencedAttachments = v
          await save()
        })
      )
    new Setting(containerEl)
      .setName('Wurzelordner in Foundry')
      .setDesc('Optional. Legt alles in einen gemeinsamen Ordner. Foundry erlaubt 4 Ebenen, tiefere werden zusammengefasst.')
      .addText((t) =>
        t.setPlaceholder('(keiner)').setValue(s.rootFolder).onChange(async (v) => {
          s.rootFolder = v
          await save()
        })
      )

    // ---- ZIP ----
    new Setting(containerEl).setName('ZIP-Backup').setHeading()
    new Setting(containerEl)
      .setName('Exportordner')
      .setDesc(`Hierhin schreibt der Befehl „Nach Foundry exportieren (ZIP)“ die Datei „${this.plugin.outputFileName()}“ (wird jedes Mal überschrieben). Import in Foundry über das ZIP-Symbol.`)
      .addText((t) =>
        t.setPlaceholder('/home/…/Downloads').setValue(s.outputDir).onChange(async (v) => {
          s.outputDir = v
          await save()
        })
      )
      .addButton((b) => b.setButtonText('Jetzt exportieren').onClick(() => this.plugin.exportZip()))

    // ---- Fortgeschritten ----
    new Setting(containerEl).setName('Fortgeschritten').setHeading()
    new Setting(containerEl)
      .setName('Vault-Name in Foundry')
      .setDesc('Steckt in den IDs aller Dokumente und im Ordner auf dem Server. Wird beim ersten Start vom Ordnernamen übernommen und bleibt fest, auch wenn du den Vault-Ordner umbenennst. Nur ändern, wenn Foundry einen anderen Namen kennt – sonst entstehen in Foundry Duplikate. Ändern setzt die ID-Zuordnung zurück.')
      .addText((t) =>
        t.setValue(s.vaultName).onChange(async (v) => {
          if (v.trim() === s.vaultName) return
          s.vaultName = v.trim()
          // the stored ids belong to the old name → recompute them under the new one
          s.idMap = {}
          await save()
        })
      )
    new Setting(containerEl)
      .setName('ID-Zuordnung')
      .setDesc(`${Object.keys(s.idMap).length} Notizen und NSCs haben eine feste Foundry-ID, die beim Umbenennen und Verschieben erhalten bleibt. Zurücksetzen nur, wenn Foundry neu befüllt wird – sonst entstehen Duplikate für umbenannte Notizen.`)
      .addButton((b) =>
        b.setButtonText('Zurücksetzen …').setWarning().onClick(async () => {
          if (!window.confirm('ID-Zuordnung wirklich zurücksetzen? Umbenannte Notizen erscheinen in Foundry danach doppelt.')) return
          s.idMap = {}
          await save()
          this.display()
        })
      )
  }
}
