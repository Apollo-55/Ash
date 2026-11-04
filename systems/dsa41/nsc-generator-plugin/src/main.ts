import { App, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, requestUrl, sanitizeHTMLToDom, type ButtonComponent, type Editor } from 'obsidian'
import * as dsa41 from '../../adapter/src/index.ts'
import {
  CLAUDE_MODELS,
  checkClaude,
  checkOpenAI,
  claudeClient,
  generateNpcOpenAI,
  openaiClient,
  generateNpcClaude,
  LEVELS,
  PageStore,
  type CloudResult,
  type Effort,
  type Level,
} from '../../nsc-generator/src/index.ts'

interface GenSettings {
  provider: 'claude' | 'openai'
  /** Anthropic API key (stored in the plugin's data.json inside the vault – user's choice) */
  claudeKey: string
  claudeModel: string
  claudeEffort: Effort
  openaiKey: string
  openaiModel: string
  /** models the key can use, from the last "Prüfen" */
  openaiModels: string[]
  /** absolute path of .llm/regelwerk-index.json (the pages file lies next to it) */
  indexPath: string
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
  provider: 'claude',
  claudeKey: '',
  claudeModel: 'claude-opus-5-5',
  claudeEffort: 'medium',
  openaiKey: '',
  openaiModel: 'gpt-6.1-sol',
  openaiModels: [],
  indexPath: `${home()}/Projekt/Ash/.llm/regelwerk-index.json`,
  defaultLevel: 'auto',
})

/** fetch for the Anthropic/OpenAI SDKs over Obsidian's requestUrl (no CORS in the app) */
const obsidianFetch = (async (url: string | URL | Request, init?: RequestInit) => {
  const headers: Record<string, string> = {}
  new Headers(init?.headers).forEach((v, k) => (headers[k] = v))
  const res = await requestUrl({
    url: typeof url === 'string' ? url : url instanceof URL ? url.href : url.url,
    method: init?.method ?? 'GET',
    headers,
    body: typeof init?.body === 'string' ? init.body : undefined,
    throw: false,
  })
  return new Response(res.arrayBuffer, { status: res.status, headers: res.headers })
}) as typeof fetch

export default class NscGeneratorPlugin extends Plugin {
  settings: GenSettings = DEFAULTS()
  private pageStore: PageStore | null = null

  async onload(): Promise<void> {
    this.settings = { ...DEFAULTS(), ...((await this.loadData()) ?? {}) }
    // the local mode (Ollama) was removed – old settings fall back to Claude (docs/zukunft.md)
    if (!['claude', 'openai'].includes(this.settings.provider)) this.settings.provider = 'claude'
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

  /** books and whether they are readable (regelwerk-index.json) */
  bookStatus(): { erstellt: string; buecher: { datei: string; kurz?: string; lesbar: boolean; ignoriert?: boolean }[] } {
    const fs = nodeRequire('fs')
    const path = this.settings.indexPath.replace(/^~/, home())
    if (!fs.existsSync(path)) throw new Error(`Regelwerk-Index fehlt: ${path} – im Projekt „npm run regelwerke“ ausführen.`)
    return JSON.parse(fs.readFileSync(path, 'utf8'))
  }

  /** full pages for the cloud mode, next to the index (.llm/regelwerk-seiten.json) */
  pages(): PageStore {
    if (this.pageStore) return this.pageStore
    const fs = nodeRequire('fs')
    const path = this.settings.indexPath.replace(/^~/, home()).replace(/[^/\\]+$/, 'regelwerk-seiten.json')
    if (!fs.existsSync(path)) throw new Error(`Seiten-Index fehlt: ${path} – im Projekt „npm run regelwerke“ ausführen.`)
    this.pageStore = new PageStore(JSON.parse(fs.readFileSync(path, 'utf8')))
    return this.pageStore
  }

  resetPages(): void {
    this.pageStore = null
  }

  modelLabel(): string {
    return CLAUDE_MODELS.find((m) => m.id === this.settings.claudeModel)?.label.replace(/ \(.*\)$/, '') ?? this.settings.claudeModel
  }

  async providerStatus(): Promise<{ ok: boolean; message: string }> {
    if (this.settings.provider === 'claude') {
      if (!this.settings.claudeKey) return { ok: false, message: 'Claude – API-Schlüssel fehlt (Einstellungen)' }
      return { ok: true, message: `Claude (${this.modelLabel()})` }
    }
    if (!this.settings.openaiKey) return { ok: false, message: 'OpenAI – API-Schlüssel fehlt (Einstellungen)' }
    return { ok: true, message: `OpenAI (${this.settings.openaiModel})` }
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
  private result: CloudResult | null = null
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
    const status = c.createDiv({ cls: 'dsa-gen-status', text: 'Prüfe Sprachmodell …' })
    this.plugin.providerStatus().then((s) => {
      status.setText(`Sprachmodell: ${s.message}`)
      status.toggleClass('dsa-gen-bad', !s.ok)
    })

    let name = this.init.name ?? ''
    let description = this.init.description
    let level: Level | 'auto' = this.plugin.settings.defaultLevel
    let profession = ''
    let art: 'auto' | 'person' | 'kreatur' = 'auto'

    new Setting(c).setName('Name').addText((t) => t.setValue(name).setPlaceholder('aus der Beschreibung').onChange((v) => (name = v)))
    new Setting(c)
      .setName('Beschreibung')
      .setDesc('Wer ist die Figur, was kann sie, wie kämpft sie? Je konkreter, desto passender die Werte.')
      .addTextArea((t) => {
        t.inputEl.rows = 8
        t.inputEl.addClass('dsa-gen-desc')
        t.setValue(description).onChange((v) => (description = v))
      })
    new Setting(c)
      .setName('Art')
      .setDesc('Person: Talente und Werte nach Formel. Kreatur: feste Werte wie im Bestiarium (Tiere, Monster, namenlose Gegner).')
      .addDropdown((d) => {
        d.addOption('auto', 'automatisch').addOption('person', 'Person (NSC)').addOption('kreatur', 'Kreatur / einfacher Gegner')
        d.setValue(art).onChange((v) => (art = v as typeof art))
      })
    new Setting(c).setName('Erfahrung').addDropdown((d) => {
      d.addOption('auto', 'aus der Beschreibung')
      for (const l of LEVELS) d.addOption(l, l)
      d.setValue(level).onChange((v) => (level = v as Level | 'auto'))
    })
    new Setting(c)
      .setName('Profession')
      .setDesc('Optional, freier Text (z. B. „Söldner“, „Magier aus Punin“) – das Modell orientiert sich daran, die Beschreibung hat Vorrang.')
      .addText((t) => t.setPlaceholder('automatisch').onChange((v) => (profession = v)))

    const progress = c.createDiv({ cls: 'dsa-gen-progress' })
    const out = c.createDiv({ cls: 'dsa-gen-result' })
    const buttons = new Setting(c)
    // Obsidian's ButtonComponent ignores clicks while its own `disabled` flag is set – always toggle via setDisabled()
    let insertBtn: ButtonComponent | null = null

    const run = async () => {
      if (this.running) return
      if (!description.trim()) {
        new Notice('Bitte eine Beschreibung eingeben.')
        return
      }
      this.running = true
      out.empty()
      progress.setText('Starte …')
      insertBtn?.setDisabled(true)
      try {
        const input = { description, name: name || undefined, level: level === 'auto' ? undefined : level, art: art === 'auto' ? undefined : art }
        const st = this.plugin.settings
        if (st.provider === 'claude') {
          if (!st.claudeKey) throw new Error('Kein API-Schlüssel – in den Plugin-Einstellungen eintragen.')
          this.result = await generateNpcClaude(
            claudeClient(st.claudeKey, obsidianFetch),
            this.plugin.pages(),
            { ...input, profession: profession || undefined },
            { model: st.claudeModel, effort: st.claudeEffort },
            (m) => progress.setText(m)
          )
        } else {
          if (!st.openaiKey) throw new Error('Kein OpenAI-Schlüssel – in den Plugin-Einstellungen eintragen.')
          this.result = await generateNpcOpenAI(
            openaiClient(st.openaiKey, obsidianFetch),
            this.plugin.pages(),
            { ...input, profession: profession || undefined },
            { model: st.openaiModel, effort: st.claudeEffort },
            (m) => progress.setText(m)
          )
        }
        const r = this.result!
        const cost = r.dollars != null ? `ca. ${r.dollars.toFixed(2).replace('.', ',')} $` : `${Math.round((r.tokens.input + r.tokens.cacheRead) / 1000)}k Tokens rein, ${Math.round(r.tokens.output / 1000)}k raus`
        const what = r.art === 'kreatur' ? 'Kreatur' : r.level
        progress.setText(`Fertig in ${Math.round(r.seconds)} s · ${r.profession.name} · ${what}${r.god ? ` · ${r.god}` : ''} · ${r.lookups}× nachgeschlagen · ${cost}`)
        const parsed = dsa41.parseNscBlock(r.block.replace(/^```dsa-nsc\n|\n```$/g, ''))
        out.appendChild(sanitizeHTMLToDom(dsa41.renderStatblock(parsed, { showIssues: true, showCalculated: true })))
        if (r.quellen.length) {
          const d = out.createEl('details')
          d.createEl('summary', { text: `Quellen (${r.quellen.length})` })
          const ul = d.createEl('ul')
          for (const x of r.quellen) ul.createEl('li', { text: x })
        }
        if (r.repairs.length) {
          const d = out.createEl('details')
          d.createEl('summary', { text: `${r.repairs.length} automatische Korrekturen` })
          const ul = d.createEl('ul')
          for (const x of r.repairs) ul.createEl('li', { text: x })
        }
        insertBtn?.setDisabled(false)
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
        insertBtn = b
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
    new Setting(containerEl)
      .setName('Anbieter')
      .setDesc('Beide schlagen in deinen Regelwerken nach; die Bücher bleiben auf dem PC, nur nachgeschlagene Seiten werden gesendet. Abrechnung pro Nutzung über den eigenen API-Schlüssel.')
      .addDropdown((d) =>
        d
          .addOption('claude', 'Claude (Anthropic)')
          .addOption('openai', 'OpenAI')
          .setValue(s.provider)
          .onChange(async (v) => {
            s.provider = v as GenSettings['provider']
            await save()
            this.display()
          })
      )
    const status = containerEl.createEl('p', { cls: 'setting-item-description', text: '' })
    if (s.provider === 'claude') {
      const check = async () => {
        if (!s.claudeKey) {
          status.setText('Status: kein API-Schlüssel')
          status.addClass('dsa-gen-bad')
          return
        }
        status.setText('Prüfe …')
        try {
          status.setText(`Status: ${await checkClaude(s.claudeKey, s.claudeModel, obsidianFetch)}`)
          status.removeClass('dsa-gen-bad')
        } catch (e) {
          status.setText(`Status: ${(e as Error).message}`)
          status.addClass('dsa-gen-bad')
        }
      }
      new Setting(containerEl)
        .setName('API-Schlüssel')
        .setDesc('Von console.anthropic.com → API Keys (Abrechnung pro Nutzung; ein Claude.ai-Abo enthält keinen API-Zugang). Wird in den Plugin-Daten dieser Vault gespeichert – Vault nicht mit diesem Ordner teilen.')
        .addText((t) => {
          t.inputEl.type = 'password'
          t.setPlaceholder('sk-ant-…')
            .setValue(s.claudeKey)
            .onChange(async (v) => {
              s.claudeKey = v.trim()
              await save()
            })
        })
        .addButton((b) => b.setButtonText('Prüfen').onClick(check))
      new Setting(containerEl)
        .setName('Modell')
        .setDesc('Opus: beste Qualität (ca. 0,20–0,40 $ pro NSC). Sonnet: gut und günstiger. Haiku: sehr günstig, für einfache Gegner.')
        .addDropdown((d) => {
          for (const m of CLAUDE_MODELS) d.addOption(m.id, m.label)
          if (!CLAUDE_MODELS.some((m) => m.id === s.claudeModel)) d.addOption(s.claudeModel, s.claudeModel)
          d.setValue(s.claudeModel).onChange(async (v) => {
            s.claudeModel = v
            await save()
          })
        })
      new Setting(containerEl)
        .setName('Gründlichkeit')
        .setDesc('Wie viel Claude nachdenkt und nachschlägt. Höher = sorgfältiger, langsamer und teurer.')
        .addDropdown((d) =>
          d
            .addOption('low', 'niedrig')
            .addOption('medium', 'mittel')
            .addOption('high', 'hoch')
            .setValue(s.claudeEffort)
            .onChange(async (v) => {
              s.claudeEffort = v as Effort
              await save()
            })
        )
      check()
    } else {
      let modelDropdown: import('obsidian').DropdownComponent | null = null
      const fillModels = () => {
        if (!modelDropdown) return
        modelDropdown.selectEl.empty()
        const list = s.openaiModels.length ? s.openaiModels : [s.openaiModel]
        for (const m of list.includes(s.openaiModel) ? list : [s.openaiModel, ...list]) modelDropdown.addOption(m, m)
        modelDropdown.setValue(s.openaiModel)
      }
      const check = async () => {
        if (!s.openaiKey) {
          status.setText('Status: kein API-Schlüssel')
          status.addClass('dsa-gen-bad')
          return
        }
        status.setText('Prüfe …')
        try {
          s.openaiModels = await checkOpenAI(s.openaiKey, obsidianFetch)
          await save()
          fillModels()
          const has = s.openaiModels.includes(s.openaiModel)
          status.setText(`Status: verbunden, ${s.openaiModels.length} Modelle verfügbar${has ? '' : ` – „${s.openaiModel}“ ist nicht dabei, bitte eins wählen`}`)
          status.toggleClass('dsa-gen-bad', !has)
        } catch (e) {
          status.setText(`Status: ${(e as Error).message}`)
          status.addClass('dsa-gen-bad')
        }
      }
      new Setting(containerEl)
        .setName('API-Schlüssel')
        .setDesc('Von platform.openai.com → API keys (Abrechnung pro Nutzung; ein ChatGPT-Abo enthält keinen API-Zugang). Wird in den Plugin-Daten dieser Vault gespeichert.')
        .addText((t) => {
          t.inputEl.type = 'password'
          t.setPlaceholder('sk-…')
            .setValue(s.openaiKey)
            .onChange(async (v) => {
              s.openaiKey = v.trim()
              await save()
            })
        })
        .addButton((b) => b.setButtonText('Prüfen').onClick(check))
      new Setting(containerEl)
        .setName('Modell')
        .setDesc('„Prüfen“ lädt die Modelle, die dein Schlüssel nutzen darf. Getestet (Nov. 2026): gpt-6.1-sol (schnell, sehr gut), gpt-6-astra und gpt-5.5 (am gründlichsten), gpt-5.6-terra (gut). Nicht geeignet: gpt-5.4-mini (gibt nicht ab).')
        .addDropdown((d) => {
          modelDropdown = d
          fillModels()
          d.onChange(async (v) => {
            s.openaiModel = v
            await save()
          })
        })
      new Setting(containerEl)
        .setName('Gründlichkeit')
        .setDesc('Nur bei Reasoning-Modellen: wie viel das Modell nachdenkt. Höher = sorgfältiger, langsamer und teurer.')
        .addDropdown((d) =>
          d
            .addOption('low', 'niedrig')
            .addOption('medium', 'mittel')
            .addOption('high', 'hoch')
            .setValue(s.claudeEffort)
            .onChange(async (v) => {
              s.claudeEffort = v as Effort
              await save()
            })
        )
      if (s.openaiKey) check()
    }

    new Setting(containerEl).setName('Regelwerke').setHeading()
    const idx = containerEl.createEl('p', { cls: 'setting-item-description' })
    const showIndex = () => {
      try {
        const st = this.plugin.bookStatus()
        const pages = this.plugin.pages()
        idx.setText(
          `Index vom ${new Date(st.erstellt).toLocaleString('de-DE')}, ${pages.file.seiten.length} durchsuchbare Seiten. ` +
            st.buecher.map((x) => `${x.kurz ? `${x.kurz} ` : ''}${x.datei.replace(/^DSA 4\.1 - |\.pdf$/g, '')}: ${x.ignoriert ? 'ignoriert' : x.lesbar ? '✓' : '✗ nicht lesbar'}`).join(' · ')
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
          this.plugin.resetPages()
          await save()
        })
      )
      .addButton((b) =>
        b.setButtonText('Neu laden').onClick(() => {
          this.plugin.resetPages()
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
