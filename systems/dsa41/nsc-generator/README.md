# NSC-Generator – Logik

Der Kern des [DSA-NSC-Generators](../nsc-generator-plugin/README.md), ohne Oberfläche. Aus einer Beschreibung wird mit einem Sprachmodell ein geprüfter `dsa-nsc`-Block. Die Bibliothek kennt Obsidian nicht. Genutzt wird sie von:

- `../nsc-generator-plugin/` – dem Obsidian-Plugin (Formular, Einstellungen)
- `../tools/eval.ts` – dem Modellvergleich auf der Kommandozeile
- den Tests in `test/`

Sie hängt nur vom DSA-Adapter (`../adapter/`: Namenskatalog, Block-Format, SF-Regeln) und den SDKs von Anthropic und OpenAI ab (DeepSeek läuft über das OpenAI-SDK), nicht von Vault to Foundry.

## Ablauf

```
Beschreibung ──► Modell (Claude / OpenAI / DeepSeek)
                   │  ruft Werkzeuge auf:
                   │    regelwerk_suchen  → PageStore.search   (lokaler Seiten-Index)
                   │    seiten_lesen      → PageStore.read
                   │    katalog_suchen    → dsa-41-Namenskatalog (Adapter)
                   │    nsc_abgeben / kreatur_abgeben
                   ▼
                 Abgabe (JSON) ──► prüfen und reparieren (review / reviewCreature)
                   ▲                    │
                   └── Probleme + Vorschläge zurück (höchstens 3 Abgaben)
                                        ▼
                                 dsa-nsc-Block (toBlock / creatureToBlock)
```

Das Modell entscheidet selbst, wie oft es nachschlägt. Die PDFs bleiben lokal, nur die angefragten Seiten gehen an den Anbieter.

## Dateien

| Datei | Inhalt |
|---|---|
| `src/agent.ts` | gemeinsamer Teil aller Anbieter: Werkzeug-Beschreibungen (`toolSpecs`), Regeltext (`systemPrompt`, `userPrompt`), `ToolRunner` führt Werkzeugaufrufe aus und prüft Abgaben |
| `src/cloud.ts` | Claude über das Anthropic-SDK: `generateNpcClaude`, `checkClaude`, `CLAUDE_MODELS`, Prompt-Caching, Ausweichmodell |
| `src/openai.ts` | OpenAI über die Responses-API: `generateNpcOpenAI`, `checkOpenAI`, zustandslos (`store: false`) |
| `src/deepseek.ts` | DeepSeek über die OpenAI-kompatiblen Chat Completions (`api.deepseek.com`): `generateNpcDeepSeek`, `checkDeepSeek`, `reasoning_content` geht bei Werkzeugaufrufen zurück |
| `src/generate.ts` | Personen: JSON-Schema (`npcSchema`), Prüfen und Reparieren (`review`, `repair`: Namen, Kampftalente, SF-Ketten, Energien, Vor-/Nachteile), Block schreiben (`toBlock`), Erfahrungsstufen (`LEVELS`) |
| `src/creature.ts` | Kreaturen und einfache Gegner mit festen Werten: `creatureSchema`, `reviewCreature`, `creatureToBlock` |
| `src/pages.ts` | `PageStore`: Volltextsuche und Seitenlesen im Index `.llm/regelwerk-seiten.json`, Buchkürzel (`bookAbbreviations`) |
| `src/index.ts` | öffentliche Schnittstelle (exportiert alles oben) |

## Benutzen (Code)

```ts
import { claudeClient, generateNpcClaude, PageStore } from '../nsc-generator/src/index.ts'

const pages = new PageStore(JSON.parse(readFileSync('.llm/regelwerk-seiten.json', 'utf8')))
const result = await generateNpcClaude(
  claudeClient(apiKey),
  pages,
  { description: 'alte Kor-Geweihte, Söldnerin aus Al\'Anfa', level: 'erfahren' },   // GenerateInput
  { model: 'claude-opus-5-5', effort: 'medium' },                                      // CloudOptions
  (step) => console.log(step),                                                          // Fortschritt (optional)
)
result.block     // fertiger dsa-nsc-Block
result.repairs   // was die Prüfung korrigiert hat
result.quellen   // nachgeschlagene Seiten
result.dollars   // ungefähre Kosten
```

Die genauen Felder von Eingabe, Optionen und Ergebnis stehen in `GenerateInput`, `CloudOptions` und `CloudResult` (`generate.ts`, `agent.ts`). Die SDK-Aufrufe sind als Funktion übergeben (`CreateMessage`, `CreateResponse`). So laufen die Tests mit simulierten Antworten ohne Schlüssel und ohne Kosten. Das Plugin reicht Obsidians `requestUrl` als `fetch` hinein.

Ohne Schlüssel (`apiKey` undefined) sucht das Anthropic-SDK selbst, z. B. `ANTHROPIC_API_KEY` oder `ant auth login`. Das nutzt `eval.ts`.

## Regelwerk-Index

`npm run regelwerke` (`../tools/regelwerke.ts`) liest die PDFs aus `Regelwerke/` und schreibt nach `.llm/` (nie im Git):

- `regelwerk-seiten.json` – Volltext jeder lesbaren Seite, wird von `PageStore` geladen
- `regelwerk-index.json` – Bücherliste und welche lesbar sind

Seitenzahlen sind PDF-Seiten, nicht gedruckte.

## Testen

```bash
npm test                                   # alles, inkl. test/ hier
npx vitest run systems/dsa41/nsc-generator # nur der Generator
```

| Test | prüft |
|---|---|
| `test/generate.test.ts` | Block aus JSON, Reparaturen (Namen, Kampftalente, SF-Ketten, Energien) |
| `test/cloud.test.ts` | Claude, OpenAI und DeepSeek mit simulierten Antworten, Kreatur-Modus, Seitensuche, Buchkürzel |

Echte Modelle vergleicht `../tools/eval.ts`. **Das kostet Geld.** Aufruf und Ergebnisse stehen in [docs/nsc-generator.md](../../../docs/nsc-generator.md#modelle-vergleichen).
