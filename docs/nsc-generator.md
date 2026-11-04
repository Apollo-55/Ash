# DSA-NSC-Generator (M6)

Erzeugt aus einer Beschreibung einen `dsa-nsc`-Block. Drei Anbieter, in den Plugin-Einstellungen umschaltbar:

- **Claude (Cloud, Standard):** beste Werte. Claude schlägt wie ein Spielleiter in deinen Regelwerken nach und gibt den NSC ab. Kostet pro NSC einige Cent (Anzeige nach jedem Lauf). Die PDFs bleiben auf deinem PC – nur die Seiten, die Claude nachschlägt, werden an Anthropic gesendet.
- **OpenAI (Cloud):** gleiche Arbeitsweise wie Claude (dieselben Werkzeuge und Prüfungen), mit deinem OpenAI-API-Guthaben. Statt Kosten zeigt das Ergebnis die verbrauchten Tokens.
- **Lokal (Ollama):** kostenlos, nichts verlässt den PC, aber deutlich schwächer (erfindet öfter Namen, wählt manchmal die falsche Profession).

## Cloud-Modus (Claude) einrichten

1. API-Schlüssel anlegen: [console.anthropic.com](https://console.anthropic.com) → *API Keys*. Abrechnung pro Nutzung, Guthaben aufladen. Ein Claude.ai-Abo (Pro/Max) enthält **keinen** API-Zugang.
2. Index bauen (einmalig und nach jedem PDF-Tausch): `cd ~/Projekt/Ash && npm run regelwerke`. Das erzeugt `.llm/regelwerk-index.json` und `.llm/regelwerk-seiten.json` (Volltext aller lesbaren Seiten, nur lokal).
3. In Obsidian: `dist/dsa-nsc-generator-obsidian.zip` nach `<vault>/.obsidian/plugins/` entpacken, Plugin einschalten. Einstellungen → Anbieter „Claude (Cloud)“ → API-Schlüssel eintragen → **Prüfen** (zeigt „verbunden, Modell … verfügbar“; die Prüfung kostet nichts).
4. Modell wählen: **Opus 5.5** (beste Qualität, ca. 0,20–0,40 $ pro NSC), **Sonnet 5.5** (gut, etwa die Hälfte), **Haiku 5.5** (sehr günstig, für einfache Gegner). *Gründlichkeit* steuert, wie viel Claude nachdenkt (mittel ist Standard).

Der Schlüssel steht in `<vault>/.obsidian/plugins/dsa-nsc-generator/data.json`. Diese Datei nicht weitergeben und die Vault nicht mit diesem Ordner teilen (z. B. Vault-Sync mit anderen).

## OpenAI-Modus einrichten

1. API-Schlüssel: [platform.openai.com](https://platform.openai.com) → *API keys* (Abrechnung pro Nutzung; ein ChatGPT-Abo enthält keinen API-Zugang).
2. Index bauen wie oben (`npm run regelwerke`).
3. Plugin-Einstellungen → Anbieter „OpenAI (Cloud)“ → Schlüssel eintragen → **Prüfen**: lädt die Modelle, die der Schlüssel nutzen darf (kostenlos), danach Modell wählen. Reasoning-Modelle (`gpt-5…`, `o…`) nutzen die *Gründlichkeit*, andere ignorieren sie.

Technik: offizielles `openai`-SDK, Chat Completions mit Function Calling (`strict`), Anfragen über Obsidians `requestUrl`.

### Wie die Cloud-Modi arbeiten

Claude bzw. das OpenAI-Modell bekommt deine Beschreibung und vier Werkzeuge:

| Werkzeug | Was es tut |
|---|---|
| `regelwerk_suchen` | Volltextsuche über alle lesbaren Seiten (WdH, Liber Liturgium, WdZ), liefert Seite + Auszug |
| `seiten_lesen` | liest bis zu 4 Seiten im Volltext (PDF-Seitenzahlen) |
| `katalog_suchen` | sucht offizielle Namen im dsa-41-Kompendium (nur die erkennt Foundry) |
| `nsc_abgeben` | gibt den NSC ab; der Code prüft und repariert wie im lokalen Modus und meldet Probleme zurück (bis zu 3 Abgaben) |

Die Beschreibung hat Vorrang, eine Profession ist nur Orientierung; einfache Gegner brauchen kaum Nachschlagen. Im Ergebnis stehen die genutzten **Quellen**, die Zahl der Nachschlage-Schritte und die ungefähren Kosten. *Wege des Schwerts* und *Liber Cantiones* sind nicht lesbar – dafür nutzt Claude sein eigenes Regelwissen.

Technik: offizielles Anthropic-SDK, Anfragen über Obsidians `requestUrl`, Prompt-Caching für Systemtext und Gesprächsverlauf, bei Opus/Sonnet automatisches Ausweichmodell, falls eine Anfrage abgelehnt wird (`fallbacks: "default"`).

## Lokalen Modus einrichten

```bash
cd ~/Projekt/Ash
npm run regelwerke                 # Index aus den PDFs in Regelwerke/ bauen (≈10 s)
npm run llm -- start               # lokales LLM starten (Podman-Container, ROCm)
npm run llm -- pull qwen3:14b      # Modell laden (einmalig, ≈9 GB)
```

In Obsidian: `dist/dsa-nsc-generator-obsidian.zip` nach `<vault>/.obsidian/plugins/` entpacken, Plugin „DSA-NSC-Generator“ einschalten. In den Einstellungen das Modell prüfen (Status zeigt „läuft, Modell … vorhanden“).

## Benutzen

1. Nur im lokalen Modus: LLM starten mit `npm run llm -- start` (der Startbefehl steht auch in den Plugin-Einstellungen zum Kopieren).
2. In Obsidian einer der Befehle:
   - **„NSC aus Markierung erzeugen“** – Beschreibung markieren, Block kommt darunter.
   - **„NSC aus dieser Notiz erzeugen“** – nimmt den Text der Notiz (ohne Bilder und Codeblöcke), Block kommt ans Ende.
   - **„NSC-Generator öffnen“** – leeres Formular, Block kommt an die Cursorposition.
3. Im Formular: Name, Beschreibung, Erfahrung (oder automatisch), Profession (oder automatisch) → **Erzeugen** (≈ 30–90 s; der Fortschritt zeigt, was Claude gerade nachschlägt) → Vorschau als Wertekasten mit den automatischen Korrekturen → **Einfügen**. Nicht gefallen? Einfach nochmal „Erzeugen“.
4. Lokal: Das LLM beendet sich nach 15 Minuten ohne Anfrage selbst (`npm run llm -- stop` beendet es sofort). Ungenutzt braucht es keine Ressourcen.

## Wie der lokale Modus arbeitet

1. Das LLM wählt aus den Professionen des Index (Wege der Helden, 252 Einträge inkl. Akademien) die passendste, dazu Erfahrung und ggf. Gottheit.
2. Es bekommt das Professionspaket aus dem Buch (und bei Geweihten die Liturgien ihres Gottes bis zum Grad der Erfahrung) und füllt die Werte als JSON nach festem Schema.
3. Der Code korrigiert ohne LLM:
   - Namen, die fast stimmen → offizieller Name („Sinnenscharfe“ → „Sinnenschärfe“),
   - fehlende Kampftalente zu Waffen ergänzen,
   - SF-Ketten: fehlende Voraussetzungs-SF ergänzen, unerfüllbare SF entfernen,
   - LeP/AuP/AsP/KaP nach DSA-4.1-Formel plus Zukauf passend zur Erfahrung,
   - Zauber nur für Zauberkundige, Liturgien nur für Geweihte.
4. Bleiben unbekannte Namen, bekommt das LLM die Liste zurück (bis zu 3 Runden).

Das Ergebnis ist ein Vorschlag. Prüf es wie jeden Wertekasten: Fehler rot, Warnungen orange.

## Regelwerke tauschen

Die PDFs liegen in `~/Projekt/Ash/Regelwerke/` (nie im Git: `.gitignore` und ein Commit-Hook verhindern das). Bessere PDF dazulegen oder alte ersetzen → `npm run regelwerke` → in den Plugin-Einstellungen „Neu laden“. Die Einstellungen zeigen, welche Bücher lesbar sind. Derzeit **nicht lesbar**: *Wege des Schwerts* und *Liber Cantiones* (die PDFs haben keinen Text, nur Bilder der Schrift).

Bücher werden am Dateinamen erkannt. Anders benannte Bücher in `Regelwerke/regelwerke.json` zuordnen:

```json
[{ "datei": "Mein WdH.pdf", "art": "professionen" }, { "datei": "Altes Buch.pdf", "art": "ignorieren" }]
```

## Modelle vergleichen

```bash
node tools/nsc-generator/eval.ts ~/Obsidian/uthuria-ob --models qwen3:14b,gemma3:12b
```

Mit Claude-Modellen (`--models claude-opus-5-5`, optional `--effort high`) läuft der Cloud-Modus; Schlüssel aus `ANTHROPIC_API_KEY` oder `ant auth login`. OpenAI-Modelle als `--models openai:<modell>`, Schlüssel aus `OPENAI_API_KEY`. **Das kostet Geld** (≈ 17 NSCs × Preis pro NSC).

Erzeugt jeden NSC deiner Vault aus seiner Beschreibung neu und vergleicht mit dem vorhandenen Block (Profession, Gültigkeit, Übereinstimmung von Talenten und SF, Zeit). Die Vault wird nur gelesen.

Vor einem Vergleich die Modelle laden (`npm run llm -- pull <modell>`), danach wieder löschen (`podman exec vtf-ollama ollama rm <modell>`). Ein Vergleich lastet GPU und CPU für längere Zeit voll aus (≈ 1 Minute pro NSC und Modell).

### Ergebnis (November 2026, 17 NSCs aus Uthuria, RX 6900 XT)

| Modell | Profession richtig | gültige Blöcke | Talente ≈ Referenz | Ø Zeit |
|---|---|---|---|---|
| **qwen3:14b** (gewählt) | 16/17 | 17/17 | 42 % | 64 s |
| gemma3:12b | 9/13 (Lauf abgebrochen) | 13/13 | 28 % | 47 s |
| mistral-nemo:12b (erster Lauf, ohne Vorauswahl) | 11/18 | 18/18 | 28 % | 46 s |

qwen3:14b trifft Profession, Weihe (Kor, Nandus, Praios) und Magier-Akademie am zuverlässigsten und vergibt die meisten und höchsten Talente; gemma3 ist schneller, wählt aber öfter falsch (Haargh als Söldnerin ohne Weihe, Dioptus als Schreiber). Nur qwen3:14b bleibt installiert (≈ 9 GB in `.llm/ollama`).
