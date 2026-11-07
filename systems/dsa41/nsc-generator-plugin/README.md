# DSA-NSC-Generator (Obsidian-Plugin)

Schreib in Obsidian, wer jemand ist („alte Kor-Geweihte, Söldnerin aus Al'Anfa, misstrauisch“), und das Plugin macht daraus einen fertigen `dsa-nsc`-Block mit Eigenschaften, Talenten, SF, Energien und Waffen. Ein Sprachmodell (Claude oder OpenAI, eigener API-Schlüssel) schlägt dabei wie eine Spielleitung in deinen eigenen Regelwerk-PDFs nach. Der Code prüft jeden Vorschlag gegen die DSA-4.1-Regeln und die Namen in den dsa-41-Kompendien.

Das Ergebnis ist ein normaler `dsa-nsc`-Block. **Vault to Foundry** zeigt ihn als Wertekasten und bringt ihn als Actor nach Foundry. Beide Plugins sind unabhängig voneinander: Den Generator braucht man nicht, um Vault to Foundry zu nutzen, und umgekehrt.

## Zwei Ordner – warum?

| Ordner | Was | Läuft in |
|---|---|---|
| [`../nsc-generator/`](../nsc-generator/README.md) | **Die Logik**: Prompts, Werkzeuge für das Modell, Seitensuche, Prüfen und Reparieren, Anbindung an Claude und OpenAI | überall (Node, Obsidian, Tests) |
| `nsc-generator-plugin/` (dieser Ordner) | **Die Oberfläche**: Befehle, Formular, Vorschau, Einstellungen, Lesen des Regelwerk-Index von der Platte | nur Obsidian (Desktop) |

Die Logik kennt Obsidian nicht. Darum lässt sie sich ohne Obsidian testen (`npm test`) und vom Modellvergleich `../tools/eval.ts` direkt auf der Kommandozeile nutzen. Das Plugin ist eine dünne Schicht darüber.

## Installieren

Voraussetzungen: Obsidian Desktop, die Regelwerk-PDFs in `Regelwerke/` im Projekt, ein API-Schlüssel für Claude oder OpenAI.

```bash
npm run regelwerke        # einmalig und nach jedem PDF-Tausch: Seiten-Index nach .llm/
npm run build:generator   # → dist/dsa-nsc-generator-obsidian.zip
```

Die ZIP nach `<vault>/.obsidian/plugins/` entpacken (es entsteht `dsa-nsc-generator/`), Obsidian neu laden und unter „Community-Plugins“ **DSA-NSC-Generator** einschalten.

`npm run build` (Vault to Foundry) baut den Generator **nicht** mit.

## Einrichten

Einstellungen → DSA-NSC-Generator:

| Abschnitt | Einstellung | Standard |
|---|---|---|
| Sprachmodell | Anbieter | Claude |
| | API-Schlüssel, „Prüfen“ (kostenlos) | – |
| | Modell | `claude-opus-5-5` bzw. `gpt-6.1-sol` |
| | Gründlichkeit (niedrig / mittel / hoch) | mittel |
| Regelwerke | Index-Datei, „Neu laden“ | `~/Projekt/Ash/.llm/regelwerk-index.json` |
| Vorgaben | Erfahrung | automatisch |

Liegt das Projekt woanders, die Index-Datei anpassen. Die Seiten-Datei `regelwerk-seiten.json` wird im selben Ordner erwartet.

**Schlüssel:** Sie stehen im Klartext in `<vault>/.obsidian/plugins/dsa-nsc-generator/data.json`. Diese Datei nicht weitergeben und den Ordner nicht mit anderen teilen (auch nicht per Sync oder Git).

## Benutzen

Befehlspalette (`Strg+P`):

- **NSC aus Markierung erzeugen** – Beschreibung markieren, der Block kommt darunter.
- **NSC aus dieser Notiz erzeugen** – nimmt den Text der Notiz, der Block kommt ans Ende.
- **NSC-Generator öffnen** – leeres Formular, der Block kommt an den Cursor.

Im Formular Name, Beschreibung, Art (automatisch / Person / Kreatur), Erfahrung und optional Profession angeben → **Erzeugen** (≈ 10–90 s) → Vorschau mit Quellen und Korrekturen → **Einfügen**.

Das Ergebnis ist ein Vorschlag: Im Wertekasten von Vault to Foundry stehen Fehler rot und Warnungen orange.

## Was das Programm verlässt

Die PDFs bleiben auf deinem PC. An den Anbieter gehen nur die Beschreibung, der Regeltext des Generators und genau die Seiten, die das Modell nachschlägt. OpenAI wird mit `store: false` angefragt und speichert nichts. Claude zeigt nach jedem Lauf die ungefähren Kosten (Opus etwa 0,20–0,40 $ pro NSC), OpenAI die verbrauchten Tokens.

## Entwickeln

```bash
npm run dev:generator     # baut bei jeder Änderung neu und kopiert nach test-vault/.obsidian/plugins/dsa-nsc-generator
npm run typecheck
npm test                  # Tests der Logik liegen in ../nsc-generator/test/
```

| Datei | Inhalt |
|---|---|
| `src/main.ts` | Plugin: Befehle, Formular (`GeneratorModal`), Einstellungen (`GenSettingTab`), Laden des Index, `fetch` über Obsidians `requestUrl` (keine CORS-Sperre) |
| `build.mjs` | eigener Build (esbuild → `dist/nsc-generator-plugin/`, ZIP, `--deploy`, `--watch`) |
| `manifest.json` | Plugin-ID `dsa-nsc-generator`, nur Desktop |
| `styles.css` | Formular und Vorschau |

## Mehr

- Ausführliche Anleitung (Werkzeuge des Modells, Prüfregeln, Kreaturen, Regelwerke, Modellvergleich): [docs/nsc-generator.md](../../../docs/nsc-generator.md)
- Das Block-Format `dsa-nsc`: [README von Vault to Foundry](../../../README.md#nscs-der-dsa-nsc-block)
- Zurückgestellt (lokales Modell, Texterkennung): [docs/zukunft.md](../../../docs/zukunft.md)
