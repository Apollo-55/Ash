# DSA-NSC-Generator (M6)

Erzeugt aus einer Beschreibung einen `dsa-nsc`-Block. Läuft mit einem **lokalen** Sprachmodell (Ollama auf deiner AMD-Grafikkarte) und deinen Regelwerken. Nichts verlässt den PC.

## Einmalig einrichten

```bash
cd ~/Projekt/Ash
npm run regelwerke                 # Index aus den PDFs in Regelwerke/ bauen (≈10 s)
npm run llm -- start               # lokales LLM starten (Podman-Container, ROCm)
npm run llm -- pull qwen3:14b      # Modell laden (einmalig, ≈9 GB)
```

In Obsidian: `dist/dsa-nsc-generator-obsidian.zip` nach `<vault>/.obsidian/plugins/` entpacken, Plugin „DSA-NSC-Generator“ einschalten. In den Einstellungen das Modell prüfen (Status zeigt „läuft, Modell … vorhanden“).

## Benutzen

1. LLM starten: `npm run llm -- start` (der Startbefehl steht auch in den Plugin-Einstellungen zum Kopieren).
2. In Obsidian einer der Befehle:
   - **„NSC aus Markierung erzeugen“** – Beschreibung markieren, Block kommt darunter.
   - **„NSC aus dieser Notiz erzeugen“** – nimmt den Text der Notiz (ohne Bilder und Codeblöcke), Block kommt ans Ende.
   - **„NSC-Generator öffnen“** – leeres Formular, Block kommt an die Cursorposition.
3. Im Formular: Name, Beschreibung, Erfahrung (oder automatisch), Profession (oder automatisch) → **Erzeugen** (≈ 30–90 s) → Vorschau als Wertekasten mit den automatischen Korrekturen → **Einfügen**. Nicht gefallen? Einfach nochmal „Erzeugen“.
4. Fertig: Das LLM beendet sich nach 15 Minuten ohne Anfrage selbst (`npm run llm -- stop` beendet es sofort). Ungenutzt braucht es keine Ressourcen.

## Wie es arbeitet

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

Erzeugt jeden NSC deiner Vault aus seiner Beschreibung neu und vergleicht mit dem vorhandenen Block (Profession, Gültigkeit, Übereinstimmung von Talenten und SF, Zeit). Die Vault wird nur gelesen.
