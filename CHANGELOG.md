# Änderungen

## Unveröffentlicht

- **Systeme modular:** Systeme werden nur noch in `systems/adapters.ts` und `systems/foundry-hooks.ts` eingetragen, `packages/` ändert sich für ein neues System nicht. Der Kern kennt keine Kampfwerte mehr (`BundleItem.combat` → freies Feld `extra`, das nur die Foundry-Hooks des Systems lesen). Ein Test hält `packages/` systemfrei und prüft jeden eingetragenen Adapter. Anleitung in `systems/README.md`.
- **Build:** `npm run build` baut nur noch Vault to Foundry (Plugin, Modul, Sync-Dienst). Der DSA-NSC-Generator hat einen eigenen Build: `npm run build:generator` bzw. `npm run dev:generator`.
- **Typecheck:** `npm run typecheck` (`tools/typecheck.mjs`) findet alle Projekte mit `tsconfig.json` unter `packages/` und `systems/` selbst.
- Obsidian-Befehl heißt „NSC-Vorlage einfügen“ (ID unverändert, Tastenkürzel bleiben) und meldet, wenn kein System eingestellt ist.
- `export-cli.ts` und `sync-cli.ts`: `--system <id>` (Standard: erstes eingetragenes System), `--no-system`.
- Hinweis: Durch das geänderte Datenformat gelten alle NSCs beim nächsten Sync einmal als geändert und werden aktualisiert (Spielstand bleibt erhalten). Obsidian-Plugin und Foundry-Modul zusammen aktualisieren.
- **Sync:** Eine Welt merkt sich ihre Vault (erste Übernahme verbindet, Dialog und Hinweispunkt zeigen nur noch diese, Feld „Verbundene Vault dieser Welt“ in den Modul-Einstellungen leeren löst die Verbindung).
- **Projektaufbau:** systemunabhängig unter `packages/` (core, obsidian-plugin, foundry-module, sync-service), DSA 4.1 unter `systems/dsa41/` (adapter, nsc-generator, nsc-generator-plugin, tools). Der Kern exportiert kein System mehr; Systeme hängen an `SystemAdapter` und neu `FoundrySystemHooks` (Actor-Typ, Kompendien, AT/PA), eingehängt in je einer `systems.ts`.
- **NSC-Generator, Cloud-Modus (Claude):** Claude schlägt über Werkzeuge in einem lokalen Seiten-Index der Regelwerke nach (Suche, Seiten lesen, offizielle Namen im dsa-41-Katalog) und gibt den NSC ab; der Code prüft und meldet Probleme zurück. Modell (Opus/Sonnet/Haiku 5.5) und Gründlichkeit einstellbar, Quellen und ungefähre Kosten im Ergebnis. Nur nachgeschlagene Seiten verlassen den PC.
- **NSC-Generator, lokaler Modus (Ollama) entfernt:** im Vergleich deutlich schwächer als die Cloud-Modelle; Stand und Erkenntnisse in `docs/zukunft.md` (letzter Stand Commit `5577dc6`). `npm run llm` entfällt, `npm run regelwerke` schreibt nur noch Seiten-Index und Bücherliste.
- **NSC-Generator, OpenAI-Modus:** dritter Anbieter mit denselben Werkzeugen und Prüfungen wie Claude (gemeinsames Modul `agent.ts`), Responses-API (zustandslos), Modellliste per „Prüfen“, Standard gpt-6.1-sol nach Modellvergleich.
- **NSC-Generator, Kreaturen:** Feld „Art“ (automatisch / Person / Kreatur); Kreaturen und einfache Gegner mit festen Bestiarium-Werten (Angriffe mit AT/PA/TP, Besonderheiten mit Regeltext, nicht verknüpft), eigenes Werkzeug `kreatur_abgeben` mit Prüfung. Nur Cloud-Modi.
- **Regelwerke:** eindeutige Buchkürzel auch bei gleichen Initialen.
- **Regelwerk-Suche:** Seiten, die einen Begriff erklären („Meisterparade: …“, „Handwerker / Handwerkerin (1 GP)“), stehen vor bloßen Erwähnungen; das Stichwortregister wird herabgestuft.
- `npm run regelwerke` schreibt zusätzlich `.llm/regelwerk-seiten.json` (Volltext pro Seite).

## 1.0.0 (2026-11-03)

Erste vollständige Fassung.

- **Journale (M1):** Notizen → Journale mit Ordnerstruktur, Wikilinks/Alias/Überschrift → `@UUID`, Bilder/Audio/Video, PDFs als PDF-Journale mit Seitenlink, Callouts, `[!geheim]` → Foundry-Secrets (aufgedeckt bleibt aufgedeckt), `%%Kommentare%%` und HTML-Kommentare immer entfernt, Leaflet-Karten als Bild, Dataview ausgelassen, Aufgabenlisten, `==Markierung==`, Fußnoten, eingebettete Notizen und Abschnitte (`![[Notiz]]`, `![[Notiz#Abschnitt]]`), stabile IDs auch beim Umbenennen, Importbericht mit Verwaisten und Löschen nach Bestätigung.
- **NSCs (M2, DSA 4.1 / dsa-41):** `dsa-nsc`-Block mit Wertekasten, Validierung gegen die dsa-41-Kompendien, Vorschlägen und „gerechnet“-Hinweisen; Actor-Import mit Items aus Welt → Zusatz-Kompendien → System-Kompendien → eigener Definition; AT/PA aus TaW oder fest; Spielstand bleibt beim erneuten Import erhalten.
- **Szenen (M3):** `szene`-Block, Leaflet-Karten mit Markern als Pins, NSC-Tokens versteckt beim ersten Anlegen; Tokens, Wände, Lichter bleiben unberührt.
- **Sync (M5):** Dienst `vtf-sync` (Docker) neben Foundry; Obsidian synchronisiert beim Speichern nur geänderte Dateien; Foundry übernimmt per Knopf „Vault synchronisieren“; ungenutzte Dateien per Befehl entfernen; ZIP-Import als Backup.
- **Komfort (M4):** gegliederte Einstellungen, fester Vault-Name (Ordner umbenennen erzeugt keine Duplikate), Warnung bei Duplikaten durch anderen Vault-Namen, fertige ZIPs für Plugin, Modul und Dienst.
