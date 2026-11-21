import { describe, expect, it } from 'vitest'
import { parseWikilinkInner, splitFrontmatter, stripBlockIds, stripComments } from '../src/index.ts'
import { journalsOf } from '../src/types.ts'
import { html } from './helpers.ts'

describe('Kommentare %%…%%', () => {
  it('entfernt Inline-Kommentare', () => {
    expect(stripComments('Der Wirt %%ist ein Spion%% grüßt.').text).toBe('Der Wirt  grüßt.')
  })

  it('entfernt mehrzeilige Kommentare samt Zeilen', () => {
    const r = stripComments('Oben\n%%\nGeheim 1\nGeheim 2\n%%\nUnten')
    expect(r.text).not.toContain('Geheim')
    expect(r.text).toContain('Oben')
    expect(r.text).toContain('Unten')
  })

  it('nicht geschlossener Kommentar verbirgt den Rest (wie Obsidian) und meldet es', () => {
    const r = stripComments('Sichtbar\n%% ab hier privat\nnoch privat')
    expect(r.text).toBe('Sichtbar\n')
    expect(r.unclosed).toBe(true)
  })

  it('lässt %% in Codeblöcken und Inline-Code stehen', () => {
    const src = 'Text `a %% b` mehr\n```\n%% kein Kommentar %%\n```\n%%weg%%'
    const r = stripComments(src)
    expect(r.text).toContain('`a %% b`')
    expect(r.text).toContain('%% kein Kommentar %%')
    expect(r.text).not.toContain('weg')
  })

  it('Codeblock innerhalb eines Kommentars wird mit entfernt', () => {
    const r = stripComments('A\n%%\n```\ngeheimer code\n```\n%%\nB')
    expect(r.text).not.toContain('geheimer')
  })

  it('entfernt auch HTML-Kommentare', () => {
    expect(stripComments('a <!-- privat --> b').text).toBe('a  b')
  })

  it('Kommentare landen nie im HTML', () => {
    const { html: out } = html({ 'N.md': '# Titel\nText %%privat%% weiter\n\n> [!info]\n> %%auch privat%% sichtbar' }, 'N.md')
    expect(out).not.toContain('privat')
    expect(out).toContain('sichtbar')
  })
})

describe('Frontmatter und Block-IDs', () => {
  it('trennt Frontmatter ab', () => {
    const r = splitFrontmatter('---\nfoundry:\n  typ: journal\n---\n# Hallo')
    expect(r.frontmatter).toEqual({ foundry: { typ: 'journal' } })
    expect(r.body).toBe('# Hallo')
  })
  it('kaputtes YAML wird gemeldet, nicht geworfen', () => {
    const r = splitFrontmatter('---\nfoo: [unclosed\n---\nText')
    expect(r.frontmatterError).toBeTruthy()
    expect(r.body).toBe('Text')
  })
  it('entfernt ^block-ids', () => {
    expect(stripBlockIds('Satz ^abc-1\n```\ncode ^x\n```')).toBe('Satz\n```\ncode ^x\n```')
  })
})

describe('Wikilinks', () => {
  const notes = {
    'NPC/Sir Rondrigo.md': '## Schwurträger\nText\n### Der Hintergrund (Der Skandal):\nmehr',
    'Start.md': [
      'Plain [[Sir Rondrigo]]',
      'Alias [[Sir Rondrigo|der Ritter]]',
      'Heading [[Sir Rondrigo#Der Hintergrund (Der Skandal):]]',
      'Missing heading [[Sir Rondrigo#Gibt es nicht]]',
      'Broken [[Niemand]]',
      'Self [[#Lokal]]',
      '# Lokal',
    ].join('\n\n'),
  }

  it('parst Ziel, Überschrift und Alias', () => {
    expect(parseWikilinkInner('Note#Kopf|Anzeige', false)).toEqual({ embed: false, target: 'Note', subpath: 'Kopf', alias: 'Anzeige' })
    expect(parseWikilinkInner('Note\\|Alias', false).alias).toBe('Alias')
  })

  it('wird zu @UUID mit Label', () => {
    const { html: out, bundle } = html(notes, 'Start.md')
    const target = journalsOf(bundle).find((d) => d.sourcePath === 'NPC/Sir Rondrigo.md')!
    expect(out).toContain(`@UUID[JournalEntry.${target.id}]{Sir Rondrigo}`)
    expect(out).toContain(`@UUID[JournalEntry.${target.id}]{der Ritter}`)
  })

  it('Überschriften-Links zeigen auf Seite + Anker', () => {
    const { html: out, bundle } = html(notes, 'Start.md')
    const target = journalsOf(bundle).find((d) => d.sourcePath === 'NPC/Sir Rondrigo.md')!
    const page = target.pages[0].id
    expect(out).toContain(`@UUID[JournalEntry.${target.id}.JournalEntryPage.${page}#der-hintergrund-(der-skandal):]{Sir Rondrigo › Der Hintergrund (Der Skandal):}`)
    expect(target.pages[0].html).toContain('id="der-hintergrund-(der-skandal):"')
  })

  it('unbekannte Überschrift verlinkt die Notiz und warnt', () => {
    const { html: out, bundle } = html(notes, 'Start.md')
    expect(out).toContain('{Sir Rondrigo › Gibt es nicht}')
    expect(bundle.warnings.some((w) => w.code === 'unresolved-heading')).toBe(true)
  })

  it('nicht auflösbare Links werden Text mit Warnung', () => {
    const { html: out, bundle } = html(notes, 'Start.md')
    expect(out).toContain('<span class="vtf-unresolved">Niemand</span>')
    expect(out).not.toContain('[[Niemand]]')
    expect(bundle.warnings).toContainEqual(expect.objectContaining({ code: 'unresolved-link', sourcePath: 'Start.md' }))
  })

  it('Link auf eigene Überschrift', () => {
    const { html: out, doc } = html(notes, 'Start.md')
    expect(out).toContain(`JournalEntryPage.${doc.pages[0].id}#lokal]`)
  })

  it('Links in Tabellen mit escaptem Pipe', () => {
    const { html: out } = html({ 'T.md': '| a | b |\n|---|---|\n| [[Z\\|Ziel]] | x |', 'Z.md': 'z' }, 'T.md')
    expect(out).toContain('{Ziel}')
    expect(out).toContain('<table>')
  })

  it('Markdown-Links auf Notizen werden ebenfalls @UUID', () => {
    const { html: out } = html({ 'A.md': '[zum Ziel](Z.md) und [extern](https://example.org)', 'Z.md': 'z' }, 'A.md')
    expect(out).toMatch(/@UUID\[JournalEntry\.[A-Za-z0-9]{16}\]\{zum Ziel\}/)
    expect(out).toContain('href="https://example.org"')
  })

  it('Links auf ausgeschlossene Notizen werden Text', () => {
    const { bundle } = (() => {
      const r = html({ 'A.md': '[[Geheim]]', '_privat/Geheim.md': 'x' }, 'A.md')
      return r
    })()
    expect(journalsOf(bundle).length).toBe(2) // without excludes both are exported
  })
})

describe('Embeds', () => {
  const att = ['Asasets/Token/token_viper.png', 'Maps/Südaventurien.png', 'Q02 - Efferds Wogen.pdf', 'Asasets/bild mit leer.jpg']

  it('![[bild.png]] wird <img> aus assets/', () => {
    const { html: out } = html({ 'N.md': '![[token_viper.png]]' }, 'N.md', att)
    expect(out).toContain('<img src="vault-to-foundry/test_vault/assets/Asasets/Token/token_viper.png" alt="">')
  })

  it('Dateinamen werden URL-sicher', () => {
    const { html: out, bundle } = html({ 'N.md': '![[Südaventurien.png]] ![[bild mit leer.jpg|300]]' }, 'N.md', att)
    expect(out).toContain('assets/Maps/Suedaventurien.png')
    expect(out).toContain('assets/Asasets/bild_mit_leer.jpg" alt="" width="300"')
    expect(bundle.assets.map((a) => a.path)).toContain('Maps/Suedaventurien.png')
  })

  it('![](bild.png) im Markdown-Stil', () => {
    const { html: out } = html({ 'N.md': '![Viper](Asasets/Token/token_viper.png)' }, 'N.md', att)
    expect(out).toContain('assets/Asasets/Token/token_viper.png" alt="Viper"')
  })

  it('PDF mit Seite → PDF-Journal + Direktlink', () => {
    const { html: out, bundle } = html({ 'N.md': '![[Q02 - Efferds Wogen.pdf#page=181]]' }, 'N.md', att)
    const pdf = journalsOf(bundle).find((d) => d.sourcePath === 'Q02 - Efferds Wogen.pdf')!
    expect(pdf.pages[0]).toMatchObject({ type: 'pdf', src: 'vault-to-foundry/test_vault/assets/Q02_-_Efferds_Wogen.pdf' })
    expect(out).toContain(`@UUID[JournalEntry.${pdf.id}.JournalEntryPage.${pdf.pages[0].id}]{Q02 - Efferds Wogen, S. 181}`)
    expect(out).toContain('Q02_-_Efferds_Wogen.pdf#page=181')
  })

  it('![[Andere Notiz]] wird Link', () => {
    const { html: out } = html({ 'N.md': '![[Andere]]', 'Andere.md': 'x' }, 'N.md')
    expect(out).toMatch(/@UUID\[JournalEntry\.\w{16}\]\{Andere\}/)
  })

  it('fehlendes Bild → Warnung', () => {
    const { bundle } = html({ 'N.md': '![[fehlt.png]]' }, 'N.md')
    expect(bundle.warnings[0].code).toBe('unresolved-embed')
  })

  it('Leaflet-Block wird Kartenbild', () => {
    const { html: out } = html({ 'N.md': '```leaflet\nid: süd-map\nimage: [[Südaventurien.png]]\n```' }, 'N.md', att)
    expect(out).toContain('<figure class="vtf-map"><img src="vault-to-foundry/test_vault/assets/Maps/Suedaventurien.png"')
  })

  it('Dataview wird ausgelassen und gemeldet', () => {
    const { html: out, bundle } = html({ 'N.md': '```dataview\nTABLE x FROM ""\n```\nRest' }, 'N.md')
    expect(out).not.toContain('TABLE')
    expect(bundle.warnings[0].code).toBe('dataview-skipped')
  })
})

describe('Callouts und Secrets', () => {
  it('Callout mit Titel', () => {
    const { html: out } = html({ 'N.md': '> [!warning] Achtung Falle\n> Die Planke ist morsch [[Z]].', 'Z.md': '' }, 'N.md')
    expect(out).toContain('<div class="vtf-callout vtf-callout-warning" data-callout="warning">')
    expect(out).toContain('<div class="vtf-callout-title">Achtung Falle</div>')
    expect(out).toContain('Die Planke ist morsch @UUID[')
    expect(out).not.toContain('[!warning]')
  })

  it('Callout ohne Titel bekommt Standardtitel, Aliase werden normalisiert', () => {
    const { html: out } = html({ 'N.md': '> [!tipp]\n> Inhalt' }, 'N.md')
    expect(out).toContain('vtf-callout-tip')
    expect(out).toContain('<div class="vtf-callout-title">Tipp</div>')
  })

  it('[!geheim] und [!secret] werden Foundry-Secrets', () => {
    const { html: out } = html({ 'N.md': '> [!geheim]\n> Alrike ist eine Schmugglerin.\n\n> [!secret]- Wahr\n> **fett**' }, 'N.md')
    expect(out).toMatch(/<section class="secret" id="secret-[A-Za-z0-9]{16}">\n<p>Alrike ist eine Schmugglerin.<\/p>\n<\/section>/)
    expect(out).toContain('<p class="vtf-secret-title"><strong>Wahr</strong></p>')
    expect(out).toContain('<strong>fett</strong>')
  })

  it('verschachtelte Callouts', () => {
    const { html: out } = html({ 'N.md': '> [!note] Außen\n> Text\n> > [!geheim]\n> > Innen' }, 'N.md')
    expect(out).toContain('vtf-callout-note')
    expect(out).toContain('<section class="secret"')
    expect(out.indexOf('<section')).toBeGreaterThan(out.indexOf('vtf-callout-note'))
  })

  it('normale Zitate bleiben Zitate', () => {
    const { html: out } = html({ 'N.md': '> _„Beruhigt euch.“_' }, 'N.md')
    expect(out).toContain('<blockquote>')
  })
})

describe('Sonstiges Markup', () => {
  it('Zeilenumbrüche wie in Obsidian', () => {
    const { html: out } = html({ 'N.md': 'MU 14 KL 14\nLeP 36' }, 'N.md')
    expect(out).toContain('MU 14 KL 14<br>\nLeP 36')
  })
  it('Aufgabenlisten', () => {
    const { html: out } = html({ 'N.md': '- [ ] offen\n- [x] erledigt' }, 'N.md')
    expect(out).toContain('☐ offen')
    expect(out).toContain('☑ erledigt')
  })
})

describe('Markierung, Fußnoten, eingebettete Notizen', () => {
  it('==Markierung== wird <mark>', () => {
    const { html: out } = html({ 'N.md': 'Das ist ==wichtig== hier.' }, 'N.md')
    expect(out).toContain('<mark>wichtig</mark>')
  })

  it('Fußnoten mit Nummer, ohne Sprunglinks', () => {
    const { html: out } = html({ 'N.md': 'Text[^1] und mehr[^b].\n\n[^1]: Erste Quelle.\n[^b]: Zweite.' }, 'N.md')
    expect(out).toContain('<sup class="vtf-footnote-ref">[1]</sup>')
    expect(out).toContain('<sup class="vtf-footnote-ref">[2]</sup>')
    expect(out).toContain('<section class="vtf-footnotes">')
    expect(out).toContain('Erste Quelle.')
    expect(out).not.toContain('href="#fn')
  })

  it('![[Notiz]] bettet den Inhalt ein, mit Link als Titel', () => {
    const notes = { 'A.md': 'Vorher\n\n![[Wetter]]\n\nNachher', 'Wetter.md': '# Wetter\nSturm aus **Süd**.' }
    const { html: out } = html(notes, 'A.md')
    expect(out).toMatch(/<div class="vtf-embed"><div class="vtf-embed-title">@UUID\[JournalEntry\.\w{16}\]\{Wetter\}<\/div>/)
    expect(out).toContain('Sturm aus <strong>Süd</strong>.')
    expect(out).not.toContain('<p></p>')
  })

  it('![[Notiz#Abschnitt]] bettet nur den Abschnitt ein', () => {
    const notes = { 'A.md': '![[Regeln#Sturm]]', 'Regeln.md': '# Regeln\n## Flaute\nRuhig.\n## Sturm\nSeefahrt-Probe +5.\n### Folgen\nSchaden.\n## Nebel\nSicht 10.' }
    const { html: out } = html(notes, 'A.md')
    expect(out).toContain('Seefahrt-Probe +5.')
    expect(out).toContain('Schaden.')
    expect(out).not.toContain('Ruhig.')
    expect(out).not.toContain('Sicht 10.')
  })

  it('Kommentare und Secrets der eingebetteten Notiz: Kommentare weg, Secrets bleiben Secrets', () => {
    const notes = { 'A.md': '![[B]]', 'B.md': 'Sichtbar %%privat%%\n\n> [!geheim]\n> Nur SL.' }
    const { html: out } = html(notes, 'A.md')
    expect(out).not.toContain('privat')
    expect(out).toMatch(/<section class="secret" id="secret-\w{16}">/)
  })

  it('Rekursion begrenzt, fehlender Abschnitt → Link + Warnung', () => {
    const { html: out, bundle } = html({ 'A.md': '![[B]]\n\n![[B#Gibts nicht]]', 'B.md': 'B ![[A]]' }, 'A.md')
    expect(out.match(/vtf-embed"/g)!.length).toBeLessThanOrEqual(3)
    expect(bundle.warnings.some((w) => /Eingebettete Überschrift „Gibts nicht“/.test(w.message))).toBe(true)
  })
})
