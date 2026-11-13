# Änderungen

## Unveröffentlicht

**Sync-Dienst**

- Fertiges Image `ghcr.io/apollo-55/vtf-sync` (amd64 und arm64), gebaut von GitHub Actions. Versionen per Knopf: GitHub → Actions → „Version veröffentlichen“ erhöht die Nummer überall (`tools/release.mjs`), schließt diesen Abschnitt im Changelog, taggt `v<Version>` und baut erst dann das Image als `latest` und `<Version>`, dazu ein GitHub-Release mit den ZIPs. Ein Push auf `main` baut nur das Image `dev` (und `sha-<commit>`); `latest` ändert sich dadurch nicht. Ein Update ist `docker compose pull vtf-sync && docker compose up -d vtf-sync`; der Weg über `vtf-sync.zip` bleibt möglich.
- Der Dienst liefert das Foundry-Modul aus: Installation und Update per Manifest-URL `<VTF_PUBLIC_URL>/module/module.json` (ohne Token).
- Der Dienst liefert die Obsidian-Plugins aus (Vault to Foundry, DSA-NSC-Generator): Das Plugin vergleicht seine Dateien mit denen des Dienstes und aktualisiert sich per Klick, mit Prüfsummen und nur mit Token (`/v1/plugins`, `/v1/plugins/<id>/files/<name>`; `/v1/plugin` bleibt für ältere Fassungen).
- Download-Seite `<VTF_PUBLIC_URL>/plugin` für die Erstinstallation, geschützt durch `VTF_DOWNLOAD_PASSWORD` (unabhängig vom Sync-Token); ohne die Variable ist die Seite aus.
- `/health` nennt die ausgelieferten Versionen; der Build bricht ab, wenn Dienst, Modul und Plugin verschiedene Versionen haben.

**Vault to Foundry**

- Eine Welt merkt sich ihre Vault: Die erste Übernahme verbindet, danach zeigen Dialog und Hinweispunkt nur noch diese (lösen in den Modul-Einstellungen).
- Befehl „Szenen-Vorlage einfügen“; leeres `karte:`/`leaflet:` zählt als nicht angegeben.
- Befehl „NSC-Vorlage einfügen“ (ID unverändert) meldet, wenn kein System eingestellt ist.
- Projektaufbau: systemunabhängig unter `packages/`, DSA 4.1 unter `systems/dsa41/`. Systeme werden nur in `systems/adapters.ts` und `systems/foundry-hooks.ts` eingetragen; ein Test hält `packages/` systemfrei. Der Kern kennt keine Kampfwerte mehr (`BundleItem.combat` → freies Feld `extra`).
- Hinweis: Durch das geänderte Datenformat gelten alle NSCs beim nächsten Sync einmal als geändert und werden aktualisiert (Spielstand bleibt erhalten). Obsidian-Plugin und Foundry-Modul zusammen aktualisieren.
- `export-cli.ts` und `sync-cli.ts`: `--system <id>` (Standard: erstes eingetragenes System), `--no-system`.
- Build: Die Skripte installieren in einem frischen Clone die Abhängigkeiten selbst; `npm run typecheck` findet alle Projekte selbst.

**DSA-NSC-Generator** (neues, eigenes Obsidian-Plugin; `npm run build:generator`)

- Erzeugt aus einer Beschreibung einen geprüften `dsa-nsc`-Block. Das Modell schlägt über Werkzeuge in einem lokalen Seiten-Index der eigenen Regelwerk-PDFs nach (`npm run regelwerke`); der Code prüft und repariert jede Abgabe.
- Anbieter: Claude, OpenAI und DeepSeek, mit denselben Werkzeugen und Prüfungen.
- Personen und Kreaturen/einfache Gegner (feste Werte, Angriffe mit AT/PA/TP, Kreaturfähigkeiten mit Regeltext).
- Regelwerk-Suche: Seiten, die einen Begriff erklären, stehen vor bloßen Erwähnungen; eindeutige Buchkürzel auch bei gleichen Initialen.

## 1.0.0 (2026-11-03)

Erste vollständige Fassung.

- **Journale:** Notizen → Journale mit Ordnerstruktur, Wikilinks/Alias/Überschrift → `@UUID`, Bilder/Audio/Video, PDFs als PDF-Journale mit Seitenlink, Callouts, `[!geheim]` → Foundry-Secrets (aufgedeckt bleibt aufgedeckt), `%%Kommentare%%` und HTML-Kommentare immer entfernt, Leaflet-Karten als Bild, Dataview ausgelassen, Aufgabenlisten, `==Markierung==`, Fußnoten, eingebettete Notizen und Abschnitte, stabile IDs auch beim Umbenennen, Importbericht mit Verwaisten und Löschen nach Bestätigung.
- **NSCs (DSA 4.1 / dsa-41):** `dsa-nsc`-Block mit Wertekasten, Validierung gegen die dsa-41-Kompendien, Vorschlägen und „gerechnet“-Hinweisen; Actor-Import mit Items aus Welt → Zusatz-Kompendien → System-Kompendien → eigener Definition; AT/PA aus TaW oder fest; Spielstand bleibt beim erneuten Import erhalten.
- **Szenen:** `szene`-Block, Leaflet-Karten mit Markern als Pins, NSC-Tokens versteckt beim ersten Anlegen; Tokens, Wände, Lichter bleiben unberührt.
- **Sync:** Dienst `vtf-sync` (Docker) neben Foundry; Obsidian synchronisiert beim Speichern nur geänderte Dateien; Foundry übernimmt per Knopf „Vault synchronisieren“; ungenutzte Dateien per Befehl entfernen; ZIP-Import als Backup.
- **Komfort:** gegliederte Einstellungen, fester Vault-Name, Warnung bei Duplikaten durch anderen Vault-Namen, fertige ZIPs für Plugin, Modul und Dienst.
