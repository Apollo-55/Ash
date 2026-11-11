# Änderungen

## Unveröffentlicht

- **Sync-Dienst als fertiges Image:** GitHub Actions baut bei jedem Push auf `main` das Image `ghcr.io/apollo-55/vtf-sync` (Dienst, Foundry-Modul und Obsidian-Plugin aus demselben Stand; amd64 und arm64; Tags `latest`, Version, `sha-<commit>`). Auf dem Server entfällt Bauen und Entpacken, ein Update ist `docker compose pull vtf-sync && docker compose up -d vtf-sync`. Die Compose-Beispiele nutzen `image:` statt `build:`; der Weg über `vtf-sync.zip` bleibt möglich.
- **Sync-Dienst liefert das Obsidian-Plugin aus:** `vtf-sync.zip` enthält das Plugin aus demselben Build. Das Plugin vergleicht beim Start seine Dateien mit denen des Dienstes und holt sich die neue Fassung per Klick („Jetzt aktualisieren“, Einstellungen → „Plugin aktualisieren“, Befehl „Plugin vom Foundry-Server aktualisieren“), mit Prüfsummen und nur mit Token (`/v1/plugin`). Ein Update muss damit nur noch im Docker-Container eingespielt werden. `/health` nennt die Plugin-Version; der Build prüft, dass Dienst, Modul und Plugin dieselbe Version haben. Einmalig nötig: dieses Plugin noch von Hand installieren.
- **NSC-Generator:** README für Plugin (`systems/dsa41/nsc-generator-plugin/`) und Logik (`systems/dsa41/nsc-generator/`) – was wohin gehört, Installieren, Einrichten, Entwickeln. Plugin-Beschreibung nennt nicht mehr das entfernte lokale Modell.
- **Build:** `npm run build` und die anderen Skripte (`dev`, `deploy`, `build:generator`, `dev:generator`, `test`, `typecheck`) installieren in einem frischen Clone die Abhängigkeiten selbst (`tools/ensure-deps.mjs`).
- **Systeme modular:** Systeme werden nur noch in `systems/adapters.ts` und `systems/foundry-hooks.ts` eingetragen, `packages/` ändert sich für ein neues System nicht. Der Kern kennt keine Kampfwerte mehr (`BundleItem.combat` → freies Feld `extra`, das nur die Foundry-Hooks des Systems lesen). Ein Test hält `packages/` systemfrei und prüft jeden eingetragenen Adapter. Anleitung in `systems/README.md`.
- **Build:** `npm run build` baut nur noch Vault to Foundry (Plugin, Modul, Sync-Dienst). Der DSA-NSC-Generator hat einen eigenen Build: `npm run build:generator` bzw. `npm run dev:generator`.
- **Typecheck:** `npm run typecheck` (`tools/typecheck.mjs`) findet alle Projekte mit `tsconfig.json` unter `packages/` und `systems/` selbst.
- Obsidian-Befehl heißt „NSC-Vorlage einfügen“ (ID unverändert, Tastenkürzel bleiben) und meldet, wenn kein System eingestellt ist.
- `export-cli.ts` und `sync-cli.ts`: `--system <id>` (Standard: erstes eingetragenes System), `--no-system`.
- Hinweis: Durch das geänderte Datenformat gelten alle NSCs beim nächsten Sync einmal als geändert und werden aktualisiert (Spielstand bleibt erhalten). Obsidian-Plugin und Foundry-Modul zusammen aktualisieren.
- **Sync-Dienst liefert das Foundry-Modul aus:** `vtf-sync.zip` enthält das Modul aus demselben Build; Foundry installiert und aktualisiert es per Manifest-URL `<VTF_PUBLIC_URL>/module/module.json` (ohne Token). `/health` nennt die ausgelieferte Modulversion; der Build bricht ab, wenn `module.json` und `server.mjs` verschiedene Versionen haben.
- **Obsidian:** Befehl „Szenen-Vorlage einfügen“ setzt einen `szene`-Block ein (Cursor hinter `karte:`). Leeres `karte:`/`leaflet:` zählt als nicht angegeben.
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
