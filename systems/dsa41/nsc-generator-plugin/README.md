# DSA-NSC-Generator (Obsidian-Plugin)

Schreib in Obsidian, wer jemand ist („alte Kor-Geweihte, Söldnerin aus Al'Anfa, misstrauisch“), und das Plugin macht daraus einen fertigen `dsa-nsc`-Block mit Eigenschaften, Talenten, SF, Energien und Waffen. Ein Sprachmodell (Claude, OpenAI oder DeepSeek, eigener API-Schlüssel) schlägt dabei wie eine Spielleitung in deinen eigenen Regelwerk-PDFs nach. Der Code prüft jeden Vorschlag gegen die DSA-4.1-Regeln und die Namen in den dsa-41-Kompendien.

Das Ergebnis ist ein normaler `dsa-nsc`-Block. **Vault to Foundry** zeigt ihn als Wertekasten und bringt ihn als Actor nach Foundry. Beide Plugins sind unabhängig voneinander: Den Generator braucht man nicht, um Vault to Foundry zu nutzen, und umgekehrt.

## Zwei Ordner – warum?

| Ordner | Was | Läuft in |
|---|---|---|
| [`../nsc-generator/`](../nsc-generator/README.md) | **Die Logik**: Prompts, Werkzeuge für das Modell, Seitensuche, Prüfen und Reparieren, Anbindung an Claude, OpenAI und DeepSeek | überall (Node, Obsidian, Tests) |
| `nsc-generator-plugin/` (dieser Ordner) | **Die Oberfläche**: Befehle, Formular, Vorschau, Einstellungen, Lesen des Regelwerk-Index von der Platte | nur Obsidian (Desktop) |

Die Logik kennt Obsidian nicht. Darum lässt sie sich ohne Obsidian testen (`npm test`) und vom Modellvergleich `../tools/eval.ts` direkt auf der Kommandozeile nutzen. Das Plugin ist eine dünne Schicht darüber.

## Installieren, Einrichten, Benutzen

Die Anleitung für Anwender steht in [docs/nsc-generator.md](../../../docs/nsc-generator.md): Regelwerk-Index bauen, Plugin installieren, Anbieter und Schlüssel, Befehle, Prüfregeln, Kreaturen.

Kurzfassung von Hand:

```bash
npm run regelwerke        # einmalig und nach jedem PDF-Tausch: Seiten-Index aus Regelwerke/*.pdf nach .llm/
npm run build:generator   # → dist/dsa-nsc-generator-obsidian.zip
```

Die ZIP nach `<vault>/.obsidian/plugins/` entpacken, **DSA-NSC-Generator** einschalten, in den Einstellungen API-Schlüssel und den Pfad zu `.llm/regelwerk-index.json` eintragen. `npm run build` (Vault to Foundry) baut den Generator **nicht** mit.

**Schlüssel:** Sie stehen im Klartext in `<vault>/.obsidian/plugins/dsa-nsc-generator/data.json`. Diese Datei nicht weitergeben und den Ordner nicht mit anderen teilen (auch nicht per Sync oder Git).

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

- Das Block-Format `dsa-nsc`: [README von Vault to Foundry](../../../README.md#nscs-der-dsa-nsc-block)
