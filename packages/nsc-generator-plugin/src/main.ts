import { App, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, requestUrl, sanitizeHTMLToDom, type Editor } from 'obsidian'
import { dsa41, type HttpFn } from '../../core/src/index.ts'
import { generateNpc, Knowledge, LEVELS, OllamaClient, type GenerateResult, type Level } from '../../nsc-generator/src/index.ts'

interface GenSettings {
  provider: 'ollama'
  ollamaUrl: string
  model: string
  /** absolute path of .llm/regelwerk-index.json */
  indexPath: string
  /** start command shown when the LLM is not running */
  startCommand: string
  defaultLevel: Level | 'auto'
}

const nodeRequire = (id: string): any => (window as any).require(id)
const home = () => {
  try {
    return nodeRequire('os').homedir()
  } catch {
    return '~'
  }
}

const DEFAULTS = (): GenSettings => ({
  provider: 'ollama',
  ollamaUrl: 'http://127.0.0.1:11434',
  model: 'qwen3:14b',
  indexPath: `${home()}/Projekt/Ash/.llm/regelwerk-index.json`,
  startCommand: 'cd ~/Projekt/Ash && npm run llm -- start',
  defaultLevel: 'auto',
})

const http: HttpFn = async (req) => {
  const res = await requestUrl({ url: req.url, method: req.method, headers: req.headers, body: req.body as string | undefined, contentType: req.headers['Content-Type'], throw: false })
  return { status: res.status, text: res.text }
}

export default class NscGeneratorPlugin extends Plugin {
  settings: GenSettings = DEFAULTS()
  private kb: Knowledge | null = null

  async onload(): Promise<void> {
    this.settings = { ...DEFAULTS(), ...((await this.loadData()) ?? {}) }
    this.addSettingTab(new GenSettingTab(this.app, this))

    this.addCommand({
      id: 'from-selection',
      name: 'NSC aus Markierung erzeugen',
      editorCheckCallback: (checking, editor) => {
        const text = editor.getSelection().trim()
        if (checking) return Boolean(text)
        this.openForm({ description: text, insertAt: 'selection' })
        return true
      },
    })
    this.addCommand({
      id: 'from-note',
      name: 'NSC aus dieser Notiz erzeugen',
      editorCallback: (editor, view) => {
        const description = editor
          .getValue()
          .replace(/^---\n[\s\S]*?\n---\n/, '')
          .replace(/```[\s\S]*?```/g, '')
          .replace(/!\[\[[^\]]*\]\]|!\[[^\]]*\]\([^)]*\)/g, '')
          .trim()
        this.openForm({ description, name: view.file?.basename, insertAt: 'end' })
      },
    })
    this.addCommand({
      id: 'form',
      name: 'NSC-Generator öffnen',
      editorCallback: () => this.openForm({ description: '', insertAt: 'cursor' }),
    })
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings)
  }

  knowledge(): Knowledge {
    if (this.kb) return this.kb
    const fs = nodeRequire('fs')
    const path = this.settings.indexPath.replace(/^~/, home())
    if (!fs.existsSync(path)) throw new Error(`Regelwerk-Index fehlt: ${path} – im Projekt „npm run regelwerke“ ausführen.`)
    this.kb = new Knowledge(JSON.parse(fs.readFileSync(path, 'utf8')))
    return this.kb
  }

  resetKnowledge(): void {
    this.kb = null
  }

  client(): OllamaClient {
    return new OllamaClient({ url: this.settings.ollamaUrl, model: this.settings.model, http })
  }

  async llmStatus(): Promise<{ ok: boolean; models: string[]; message: string }> {
    try {
      const models = await this.client().models()
      const has = models.includes(this.settings.model) || models.includes(`${this.settings.model}:latest`)
      return { ok: has, models, message: has ? `läuft, Modell ${this.settings.model} vorhanden` : `läuft, aber Modell ${this.settings.model} fehlt (vorhanden: ${models.join(', ') || 'keins'})` }
    } catch {
      return { ok: false, models: [], message: `nicht erreichbar – starten mit: ${this.settings.startCommand}` }
    }
  }

  openForm(init: { description: string; name?: string; insertAt: 'selection' | 'end' | 'cursor' }): void {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView)
    if (!view) {
      new Notice('Bitte zuerst eine Notiz öffnen.')
      return
    }
    new GeneratorModal(this.app, this, view.editor, init).open()
  }
}

class GeneratorModal extends Modal {
  private result: GenerateResult | null = null
  private running = false
  constructor(
    app: App,
    private plugin: NscGeneratorPlugin,
    private editor: Editor,
    private init: { description: string; name?: string; insertAt: 'selection' | 'end' | 'cursor' }
  ) {
    super(app)
  }

  async onOpen(): Promise<void> {
    this.titleEl.setText('NSC erzeugen')
    this.modalEl.addClass('dsa-gen-modal')
    const c = this.contentEl
    const status = c.createDiv({ cls: 'dsa-gen-status', text: 'Prüfe lokales LLM …' })
    this.plugin.llmStatus().then((s) => {
      status.setText(`LLM: ${s.message}`)
      status.toggleClass('dsa-gen-bad', !s.ok)
    })

    let name = this.init.name ?? ''
    let description = this.init.description
    let level: Level | 'auto' = this.plugin.settings.defaultLevel
    let profession = ''

    new Setting(c).setName('Name').addText((t) => t.setValue(name).setPlaceholder('aus der Beschreibung').onChange((v) => (name = v)))
    new Setting(c)
      .setName('Beschreibung')
      .setDesc('Wer ist die Figur, was kann sie, wie kämpft sie? Je konkreter, desto passender die Werte.')
      .addTextArea((t) => {
        t.inputEl.rows = 8
        t.inputEl.addClass('dsa-gen-desc')
        t.setValue(description).onChange((v) => (description = v))
      })
    new Setting(c).setName('Erfahrung').addDropdown((d) => {
      d.addOption('auto', 'aus der Beschreibung')
      for (const l of LEVELS) d.addOption(l, l)
      d.setValue(level).onChange((v) => (level = v as Level | 'auto'))
    })
    let names: string[] = []
    try {
      names = this.plugin.knowledge().professionNames()
    } catch (e) {
      c.createDiv({ cls: 'dsa-gen-bad', text: (e as Error).message })
    }
    new Setting(c)
      .setName('Profession')
      .setDesc('Optional – sonst wählt das LLM aus „Wege der Helden“.')
      .addText((t) => {
        const list = c.createEl('datalist', { attr: { id: 'dsa-gen-professions' } })
        for (const n of names) list.createEl('option', { attr: { value: n } })
        t.inputEl.setAttr('list', 'dsa-gen-professions')
        t.setPlaceholder('automatisch').onChange((v) => (profession = v))
      })

    const progress = c.createDiv({ cls: 'dsa-gen-progress' })
    const out = c.createDiv({ cls: 'dsa-gen-result' })
    const buttons = new Setting(c)
    let insertBtn: HTMLButtonElement | null = null

    const run = async () => {
      if (this.running) return
      if (!description.trim()) {
        new Notice('Bitte eine Beschreibung eingeben.')
        return
      }
      this.running = true
      out.empty()
      progress.setText('Starte …')
      if (insertBtn) insertBtn.disabled = true
      try {
        const kb = this.plugin.knowledge()
        const prof = profession && kb.profession(profession) ? profession : undefined
        this.result = await generateNpc(
          this.plugin.client(),
          kb,
          { description, name: name || undefined, level: level === 'auto' ? undefined : level, profession: prof },
          (m) => progress.setText(m)
        )
        const r = this.result
        progress.setText(`Fertig in ${Math.round(r.seconds)} s · ${r.profession.name} (${r.profession.buch}, S. ${r.profession.seite}) · ${r.level}${r.god ? ` · ${r.god}` : ''}`)
        const parsed = dsa41.parseNscBlock(r.block.replace(/^```dsa-nsc\n|\n```$/g, ''))
        out.appendChild(sanitizeHTMLToDom(dsa41.renderStatblock(parsed, { showIssues: true, showCalculated: true })))
        if (r.repairs.length) {
          const d = out.createEl('details')
          d.createEl('summary', { text: `${r.repairs.length} automatische Korrekturen` })
          const ul = d.createEl('ul')
          for (const x of r.repairs) ul.createEl('li', { text: x })
        }
        if (insertBtn) insertBtn.disabled = false
      } catch (e) {
        progress.setText('')
        out.createDiv({ cls: 'dsa-gen-bad', text: (e as Error).message })
      } finally {
        this.running = false
      }
    }

    buttons
      .addButton((b) => b.setButtonText('Erzeugen').setCta().onClick(run))
      .addButton((b) => {
        insertBtn = b.buttonEl
        b.setButtonText('Einfügen').setDisabled(true).onClick(() => {
          if (!this.result) return
          this.insert(this.result.block)
          this.close()
        })
      })
      .addButton((b) => b.setButtonText('Schließen').onClick(() => this.close()))
  }

  private insert(block: string): void {
    const e = this.editor
    if (this.init.insertAt === 'selection') {
      const to = e.getCursor('to')
      e.replaceRange(`\n\n${block}\n`, { line: to.line, ch: e.getLine(to.line).length })
    } else if (this.init.insertAt === 'end') {
      const last = e.lastLine()
      e.replaceRange(`\n\n${block}\n`, { line: last, ch: e.getLine(last).length })
    } else {
      e.replaceSelection(`${block}\n`)
    }
    new Notice('NSC-Block eingefügt.')
  }

  onClose(): void {
    this.contentEl.empty()
  }
}

class GenSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private plugin: NscGeneratorPlugin
  ) {
    super(app, plugin)
  }

  display(): void {
    const { containerEl } = this
    const s = this.plugin.settings
    const save = () => this.plugin.saveSettings()
    containerEl.empty()

    new Setting(containerEl).setName('Sprachmodell').setHeading()
    const status = containerEl.createEl('p', { cls: 'setting-item-description', text: 'Prüfe …' })
    const refresh = () =>
      this.plugin.llmStatus().then((r) => {
        status.setText(`Status: ${r.message}`)
        status.toggleClass('dsa-gen-bad', !r.ok)
      })
    refresh()
    new Setting(containerEl)
      .setName('Anbieter')
      .setDesc('Vorerst nur lokal (Ollama). Ein Cloud-Anbieter kann später dazukommen.')
      .addDropdown((d) => d.addOption('ollama', 'Lokal (Ollama)').setValue(s.provider))
    new Setting(containerEl)
      .setName('Adresse')
      .addText((t) =>
        t.setValue(s.ollamaUrl).onChange(async (v) => {
          s.ollamaUrl = v.trim()
          await save()
        })
      )
    new Setting(containerEl)
      .setName('Modell')
      .setDesc('Name wie in „npm run llm -- list“, z. B. qwen3:14b.')
      .addText((t) =>
        t.setValue(s.model).onChange(async (v) => {
          s.model = v.trim()
          await save()
        })
      )
      .addButton((b) => b.setButtonText('Prüfen').onClick(refresh))
    new Setting(containerEl)
      .setName('Startbefehl')
      .setDesc('Das LLM läuft nur bei Bedarf und beendet sich nach 15 Minuten Leerlauf selbst. Diesen Befehl im Terminal ausführen, wenn es nicht läuft.')
      .addText((t) =>
        t.setValue(s.startCommand).onChange(async (v) => {
          s.startCommand = v
          await save()
        })
      )
      .addButton((b) =>
        b.setButtonText('Kopieren').onClick(() => {
          navigator.clipboard.writeText(s.startCommand)
          new Notice('Startbefehl kopiert.')
        })
      )

    new Setting(containerEl).setName('Regelwerke').setHeading()
    const idx = containerEl.createEl('p', { cls: 'setting-item-description' })
    const showIndex = () => {
      try {
        const kb = this.plugin.knowledge()
        const b = kb.index.buecher
        idx.setText(
          `Index vom ${new Date(kb.index.erstellt).toLocaleString('de-DE')}: ${kb.index.professionen.length} Professionen, ${Object.keys(kb.index.liturgien).length} Gottheiten. ` +
            b.map((x) => `${x.datei.replace(/^DSA 4\.1 - |\.pdf$/g, '')}: ${x.lesbar ? '✓' : '✗ nicht lesbar'}`).join(' · ')
        )
      } catch (e) {
        idx.setText((e as Error).message)
      }
    }
    showIndex()
    new Setting(containerEl)
      .setName('Index-Datei')
      .setDesc('Wird im Projekt mit „npm run regelwerke“ aus den PDFs in Regelwerke/ gebaut. Bücher tauschen → neu bauen → hier „Neu laden“.')
      .addText((t) =>
        t.setValue(s.indexPath).onChange(async (v) => {
          s.indexPath = v.trim()
          this.plugin.resetKnowledge()
          await save()
        })
      )
      .addButton((b) =>
        b.setButtonText('Neu laden').onClick(() => {
          this.plugin.resetKnowledge()
          showIndex()
        })
      )

    new Setting(containerEl).setName('Vorgaben').setHeading()
    new Setting(containerEl).setName('Erfahrung').addDropdown((d) => {
      d.addOption('auto', 'aus der Beschreibung')
      for (const l of LEVELS) d.addOption(l, l)
      d.setValue(s.defaultLevel).onChange(async (v) => {
        s.defaultLevel = v as Level | 'auto'
        await save()
      })
    })
  }
}
