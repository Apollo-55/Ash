# Sync-Dienst einrichten (M5)

Der Dienst `vtf-sync` nimmt die Änderungen aus Obsidian entgegen und legt sie in Foundrys Datenordner (`Data/vault-to-foundry/<vault>/`). Foundry übernimmt sie erst, wenn du in der Journal-Seitenleiste auf **„Vault synchronisieren“** klickst.

```
Obsidian (speichern) ──HTTPS + Token──▶ nginx /vtf-sync/ ──▶ vtf-sync (Docker) ──▶ felddy-Volume: Data/vault-to-foundry/
Foundry: Knopf „Vault synchronisieren“ ──liest bundle.json aus dem eigenen Datenordner──┘
```

## 1. Auf dem Server

1. `npm run deploy` erzeugt `dist/vtf-sync.zip`. Auf den Server kopieren und neben deine `docker-compose.yml` entpacken (Ordner `vtf-sync/`).
2. Token erzeugen: `openssl rand -hex 32`.
3. Den Dienst aus `vtf-sync/docker-compose.example.yml` in deine Compose-Datei übernehmen:
   - `user:` wie Foundry (felddy: `FOUNDRY_UID`/`FOUNDRY_GID`, Standard `421:421`), damit Foundry die Dateien lesen kann.
   - Volume: **nur** der Unterordner `Data/vault-to-foundry` aus Foundrys Volume (bzw. Bind-Mount `…/Data/vault-to-foundry:/data/vault-to-foundry`). Ordner vorher anlegen, Besitzer wie Foundry.
   - `VTF_TOKEN` setzen.
4. nginx: den Block aus `vtf-sync/nginx.example.conf` in den `server { … }` von Foundry einfügen, nginx neu laden.
5. `docker compose up -d --build vtf-sync`, dann prüfen: `curl https://<deine-domain>/vtf-sync/health` → `{"ok":true,…}`.

## 2. In Obsidian

Einstellungen → Vault to Foundry → **Sync-Server**:
- Server-Adresse: `https://<deine-domain>/vtf-sync`
- Token: wie `VTF_TOKEN`
- „Verbindung testen“ → zeigt Revision und Anzahl Dateien auf dem Server.

Danach synchronisiert Obsidian **automatisch** kurz nach dem Speichern (Wartezeit einstellbar). Die Statusleiste unten rechts zeigt den Stand: `Foundry ⏳` wartet, `Foundry ⟳ 3/12` lädt, `Foundry ✓` fertig, `Foundry ✗` Fehler (Maus drüber zeigt den Grund). Ein Klick darauf synchronisiert sofort. Befehle: „Mit Foundry-Server synchronisieren“, „Ungenutzte Dateien auf dem Foundry-Server entfernen“.

Hochgeladen werden nur geänderte Dateien. Die Hashes merkt sich das Plugin anhand des Änderungsdatums, große PDFs werden also nicht bei jedem Speichern neu gelesen. Dateien, die schon über den ZIP-Import auf den Server kamen, erkennt der Dienst und lädt sie nicht noch einmal.

## 3. In Foundry

Journal-Seitenleiste:
- **Vault synchronisieren**: Ein orangefarbener Punkt zeigt, dass neue Änderungen bereitliegen (das Modul prüft jede Minute). Der Klick öffnet einen Dialog mit Vault, Revision und Zeitpunkt. Erst **„Übernehmen“** ändert etwas in der Welt.
- ZIP-Symbol: der bisherige ZIP-Import als Backup.
- Listen-Symbol: letzter Bericht.

## Sicherheit

- Ohne gültiges Token nimmt der Dienst nichts an. Das Token läuft über HTTPS (nginx).
- Der Dienst sieht nur `Data/vault-to-foundry/`, er hat keinen Zugriff auf Welten, Module oder die Foundry-Konfiguration.
- Dateinamen werden geprüft (nur `A–Z a–z 0–9 . _ -`, keine `..`). Jede Datei wird gegen ihre Prüfsumme geprüft. `bundle.json` muss zum Vault passen.
- „Ungenutzte Dateien entfernen“ löscht nur Dateien, die die aktuelle `bundle.json` nicht mehr verwendet.

## Test ohne Server

```bash
VTF_TOKEN=mein-test-token-123456 VTF_DATA_DIR=$PWD/.foundry/data/Data/vault-to-foundry VTF_PORT=8787 node packages/sync-service/server.mjs
node tools/sync-cli.ts test-vault --name uthuria-ob --url http://127.0.0.1:8787 --token mein-test-token-123456
```
