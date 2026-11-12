# DSA-NSC-Generator

Erzeugt aus einer Beschreibung einen `dsa-nsc`-Block – für Personen (Talente, SF, Energien nach DSA-4.1-Formel) und für Kreaturen und einfache Gegner (feste Bestiarium-Werte). Ein Sprachmodell schlägt dabei wie ein Spielleiter in deinen Regelwerken nach. Drei Anbieter, in den Plugin-Einstellungen umschaltbar:

- **Claude** (Anthropic, Standard `claude-opus-5-5`) – Kosten werden nach jedem Lauf angezeigt.
- **OpenAI** (Standard `gpt-6.1-sol`) – das Ergebnis nennt die verbrauchten Tokens.
- **DeepSeek** (Standard `deepseek-reasoner`) – das Ergebnis nennt die verbrauchten Tokens. Die Server stehen in China.

Die PDFs bleiben auf deinem PC; an den Anbieter gehen die Beschreibung, der Regeltext des Generators und genau die Seiten, die das Modell nachschlägt.

Aufbau im Code: [Plugin](../systems/dsa41/nsc-generator-plugin/README.md) (Oberfläche in Obsidian) und [Logik](../systems/dsa41/nsc-generator/README.md) (Prompts, Werkzeuge, Prüfung, ohne Obsidian).

## Einrichten

1. **Regelwerke:** die eigenen PDFs in den Ordner `Regelwerke/` im Projektordner legen (nie im Git) und den Index bauen – einmalig und nach jedem PDF-Tausch: `npm run regelwerke`. Das erzeugt `.llm/regelwerk-seiten.json` (Volltext aller lesbaren Seiten) und `.llm/regelwerk-index.json` (welche Bücher lesbar sind) – beides nur lokal. Braucht `pdftotext` (poppler-utils).
2. **Plugin installieren:**
   - mit Sync-Dienst: in Obsidian unter Einstellungen → Vault to Foundry → „Plugin-Updates“ auf **Installieren** klicken (oder die ZIP von `https://<domain>/vtf-sync/plugin` holen); Updates kommen danach zusammen mit denen von Vault to Foundry.
   - von Hand: `npm run build:generator` (nicht in `npm run build` enthalten), dann `dist/dsa-nsc-generator-obsidian.zip` nach `<vault>/.obsidian/plugins/` entpacken.

   Danach unter „Community-Plugins“ **DSA-NSC-Generator** einschalten und in dessen Einstellungen unter „Regelwerke“ den Pfad zur Index-Datei eintragen (`<projektordner>/.llm/regelwerk-index.json`).
3. **Anbieter wählen** (Einstellungen → Sprachmodell):
   - **Claude:** Schlüssel von [console.anthropic.com](https://console.anthropic.com) → *API Keys* (Abrechnung pro Nutzung; ein Claude.ai-Abo enthält keinen API-Zugang). **Prüfen** zeigt „verbunden, Modell … verfügbar“ und kostet nichts. Modelle: Opus 5.5 (beste Qualität, ca. 0,20–0,40 $ pro NSC), Sonnet 5.5 (etwa die Hälfte), Haiku 5.5 (sehr günstig, für einfache Gegner).
   - **OpenAI:** Schlüssel von [platform.openai.com](https://platform.openai.com) → *API keys* (ein ChatGPT-Abo enthält keinen API-Zugang). **Prüfen** lädt kostenlos die Modelle, die der Schlüssel nutzen darf.
   - **DeepSeek:** Schlüssel von [platform.deepseek.com](https://platform.deepseek.com) → *API keys* (Guthaben vorab aufladen). **Prüfen** lädt kostenlos die Modelle. `deepseek-reasoner` denkt vor jeder Antwort nach, `deepseek-chat` antwortet direkt. Noch nicht mit echtem Schlüssel verglichen.
   - *Gründlichkeit* (niedrig/mittel/hoch) steuert, wie viel das Modell nachdenkt; mittel ist Standard (bei DeepSeek nicht einstellbar).

Die Schlüssel stehen in `<vault>/.obsidian/plugins/dsa-nsc-generator/data.json`. Diese Datei nicht weitergeben und die Vault nicht mit diesem Ordner teilen.

## Benutzen

1. Einer der Befehle (`Strg+P`):
   - **„NSC aus Markierung erzeugen“** – Beschreibung markieren, Block kommt darunter.
   - **„NSC aus dieser Notiz erzeugen“** – nimmt den Text der Notiz (ohne Bilder und Codeblöcke), Block kommt ans Ende.
   - **„NSC-Generator öffnen“** – leeres Formular, Block kommt an die Cursorposition.
2. Im Formular: Name, Beschreibung, **Art** (automatisch / Person / Kreatur), Erfahrung (oder automatisch), Profession (optional, freier Text) → **Erzeugen**. Der Fortschritt zeigt, was gerade nachgeschlagen wird (≈ 10–90 s).
3. Vorschau als Wertekasten mit Quellen und automatischen Korrekturen → **Einfügen**. Nicht gefallen? Nochmal „Erzeugen“.

Das Ergebnis ist ein Vorschlag. Prüf es wie jeden Wertekasten: Fehler rot, Warnungen orange.

## Wie es arbeitet

Das Modell bekommt deine Beschreibung, die Regeln des Generators und fünf Werkzeuge. Wie oft es nachschlägt, entscheidet es selbst – bei einfachen Gegnern kaum, bei einer Kor-Geweihten gezielt Spätweihe und Liturgien.

| Werkzeug | Was es tut |
|---|---|
| `regelwerk_suchen` | Volltextsuche über alle lesbaren Seiten, bis zu 8 Treffer mit Auszug. Seiten, die einen Begriff erklären („Meisterparade: …“, „Handwerker / Handwerkerin (1 GP)“), stehen vor bloßen Erwähnungen; das Stichwortregister wird herabgestuft. |
| `seiten_lesen` | bis zu 4 Seiten im Volltext (PDF-Seitenzahlen) |
| `katalog_suchen` | offizielle Namen im dsa-41-Kompendium (nur die erkennt Foundry) |
| `nsc_abgeben` | Person abgeben |
| `kreatur_abgeben` | Kreatur oder einfachen Gegner mit festen Werten abgeben |

Jede Abgabe wird geprüft und repariert; was nicht passt, geht mit Vorschlägen an das Modell zurück (höchstens 3 Abgaben, bei der dritten wird Unbekanntes entfernt).

**Prüfung bei Personen:**

- Namen: „Sinnenscharfe“ → „Sinnenschärfe“, „Sprachen Kennen [Garethi]“ → „Garethi“, „Kurzschwert (Schmiedewerk) +2“ → „Kurzschwert“; Unbekanntes mit Vorschlägen („meintest du: Grobschmied?“).
- Kampftalente zu jeder Waffe, SF-Ketten (fehlende Voraussetzungen ergänzt, unerfüllbare SF entfernt).
- LeP/AuP nach DSA-4.1-Formel plus Zukauf; AsP nur für Zauberkundige, KaP und Liturgien nur für Geweihte.
- Vor-/Nachteile: falsche Liste umsortiert, Dubletten und Einheitswerte entfernt, höchstens sechs je Liste.
- Zu niedrige Talentwerte oder zu wenige SF für die Erfahrung lösen eine Korrektur aus.

## Kreaturen und einfache Gegner

- **Person:** Eigenschaften, Talente, SF, Energien nach Formel.
- **Kreatur:** feste Werte wie im Bestiarium – LeP, AuP, RS, MR, GS, INI, Ausweichen, Angriffe mit AT/PA (bzw. FK), TP und Distanzklasse; Kreaturfähigkeiten (Gift, Fliegen, Regeneration, Furcht …) mit kurzem Regeltext, die in Foundry als eigene Sonderfertigkeiten erscheinen. Eigenschaften nur, wenn bekannt oder für Proben nötig. Der Block bekommt `verknüpft: nein`, damit mehrere Tokens derselben Kreatur eigene Lebenspunkte haben. Natürliche Angriffe kämpfen mit Raufen.
- **Automatisch:** Tiere, Monster, Dämonen und namenlose Gegner (Wache, Räuber) werden Kreaturen, benannte Figuren mit Geschichte Personen. Im Test (gpt-6.1-sol) wurden Hydra und Wegelagerer als Kreatur, ein Wachhauptmann als Person erkannt.

Steht die Kreatur in einem deiner Regelwerke (z. B. einem Bestiarium in `Regelwerke/`), übernimmt das Modell die Werte mit Fundstelle. Die Prüfung achtet auf gültige TP („2d6“ wird „2W6“), echte Kampftalente, plausible AT/PA und offizielle Talentnamen; unbekannte SF werden Kreaturfähigkeiten.

## Regelwerke

Die PDFs liegen in `Regelwerke/` im Projektordner (nie im Git, siehe `.gitignore`). Neues Buch dazulegen oder ersetzen → `npm run regelwerke` → in den Plugin-Einstellungen „Neu laden“.

- **Jedes lesbare PDF** wird Seite für Seite durchsuchbar – auch unbekannte Bücher wie Bestiarien oder Regionalbände mit neuen Professionen.
- **Kürzel:** Initialen des Titels (WdH, LL, WdZ). Teilen sich zwei Bücher Initialen, bekommen beide eine längere Form („Aventurische Magie“ → `AvMa`, „Aventurische Meisterschaft“ → `AvMe`).
- **Nicht lesbar** sind gescannte PDFs ohne Textebene (nur Bilder der Schrift). `npm run regelwerke` meldet sie; für diese Bücher nutzen die Modelle ihr eigenes Regelwissen. Texterkennung (OCR) ist nicht eingebaut.
- Bücher auslassen: `Regelwerke/regelwerke.json` mit `[{ "datei": "Altes Buch.pdf", "art": "ignorieren" }]`.

## Technik

- **Claude:** offizielles Anthropic-SDK, Anfragen über Obsidians `requestUrl`, Prompt-Caching für Regeltext und Gesprächsverlauf, bei Opus/Sonnet automatisches Ausweichmodell, falls eine Anfrage abgelehnt wird (`fallbacks: "default"`).
- **OpenAI:** offizielles `openai`-SDK, Responses-API mit Function Calling (`strict`) – neuere Modelle (gpt-5.4 bis gpt-6.1) erlauben Werkzeuge zusammen mit Nachdenken nur dort. Zustandslos (`store: false`): OpenAI speichert nichts.
- **DeepSeek:** `openai`-SDK mit `baseURL` `https://api.deepseek.com`, Chat Completions mit Function Calling (ohne `strict` – das gibt es bei DeepSeek nur auf dem Beta-Endpunkt mit eingeschränkten Schemas; falsche Argumente meldet der Code ans Modell zurück). Im Denkmodus geht `reasoning_content` bei Werkzeugaufrufen mit zurück. Caching macht DeepSeek automatisch (gleicher Anfang jeder Anfrage).
- Werkzeuge, Regeltext und Prüfung sind für alle Anbieter dieselben (`agent.ts`).

## Modelle vergleichen

```bash
OPENAI_API_KEY=… node systems/dsa41/tools/eval.ts <vault> --models openai:gpt-6.1-sol,claude-opus-5-5 --only Name1,Name2
```

Erzeugt die NSCs einer Vault aus ihrer Beschreibung neu und vergleicht mit dem vorhandenen `dsa-nsc`-Block (Gültigkeit, Übereinstimmung von Talenten und SF, Zeit, Kosten). Mit `--expect datei.json` (`{ "<Name>": "<Regex für die erwartete Profession>" }`) wird zusätzlich die gewählte Profession geprüft. Die Vault wird nur gelesen. **Jeder Lauf kostet Geld.** Claude-Schlüssel aus `ANTHROPIC_API_KEY` oder `ant auth login`, OpenAI aus `OPENAI_API_KEY`, DeepSeek als `deepseek:<modell>` mit `DEEPSEEK_API_KEY`.

Ein Vergleich im November 2026 (drei handgebaute NSCs, Gründlichkeit mittel) ergab für OpenAI:

| Modell | Profession richtig | Talente ≈ Referenz | SF ≈ Referenz | Ø Zeit | Anmerkung |
|---|---|---|---|---|---|
| **gpt-6.1-sol** (Standard) | 3/3 | 56 % | 38 % | 33 s | schnell, schlüssige Werte, gibt meist beim ersten Mal korrekt ab |
| gpt-6-astra | 3/3 | 59 % | 44 % | 51 s | sehr gut, etwas langsamer |
| gpt-5.5 | 3/3 | 60 % | 28 % | 78 s | am ausführlichsten, langsam |
| gpt-5.6-terra | 3/3 | 58 % | 30 % | 34 s | gut, braucht öfter Korrekturrunden |
| gpt-6-luna | 3/3 | 47 % | 15 % | 39 s | dünner (13–15 Talente) |
| gpt-5.4-mini | – | – | – | – | gibt nie ab |

Claude und DeepSeek sind noch nicht auf dieselbe Weise verglichen.
