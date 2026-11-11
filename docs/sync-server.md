# Sync-Dienst einrichten (M5)

Der Dienst `vtf-sync` nimmt die Änderungen aus Obsidian entgegen und legt sie in Foundrys Datenordner (`Data/vault-to-foundry/<vault>/`). Foundry übernimmt sie erst, wenn du in der Journal-Seitenleiste auf **„Vault synchronisieren“** klickst.

```
Obsidian (speichern) ──HTTPS + Token──▶ nginx /vtf-sync/ ──▶ vtf-sync (Docker) ──▶ felddy-Volume: Data/vault-to-foundry/
Foundry: Knopf „Vault synchronisieren“ ──liest bundle.json aus dem eigenen Datenordner──┘
```

## 1. Auf dem Server

1. Der Dienst kommt als fertiges Image `ghcr.io/apollo-55/vtf-sync:latest` – GitHub baut es bei jeder Änderung auf `main` (siehe [Image von GitHub](#image-von-github)). Auf dem Server muss nichts gebaut oder entpackt werden.
2. Token erzeugen: `openssl rand -hex 32`.
3. Den Dienst aus [`docker-compose.example.yml`](../packages/sync-service/docker-compose.example.yml) in deine Compose-Datei übernehmen:
   - `user:` wie Foundry (felddy: `FOUNDRY_UID`/`FOUNDRY_GID`, Standard `421:421`), damit Foundry die Dateien lesen kann.
   - Volume: **nur** der Unterordner `Data/vault-to-foundry` aus Foundrys Volume (bzw. Bind-Mount `…/Data/vault-to-foundry:/data/vault-to-foundry`). Ordner vorher anlegen, Besitzer wie Foundry.
   - `VTF_TOKEN` setzen.
   - Optional `VTF_DOWNLOAD_PASSWORD`: einfaches Passwort für die Download-Seite des Obsidian-Plugins (`https://<deine-domain>/vtf-sync/plugin`, siehe [Plugin vom Dienst aktualisieren](#plugin-vom-dienst-aktualisieren)).
   - `VTF_PUBLIC_URL` auf die öffentliche Adresse des Dienstes setzen (z. B. `https://<deine-domain>/vtf-sync`), damit Foundry das Modul vom Dienst installieren kann (siehe [Modul vom Dienst installieren](#modul-vom-dienst-installieren)).
4. nginx: den Block aus [`nginx.example.conf`](../packages/sync-service/nginx.example.conf) in den `server { … }` von Foundry einfügen, nginx neu laden.
5. `docker compose up -d vtf-sync`, dann prüfen: `curl https://<deine-domain>/vtf-sync/health` → `{"ok":true,…}`.

**Update:** `docker compose pull vtf-sync && docker compose up -d vtf-sync`. Danach Foundry-Modul und Obsidian-Plugin wie unten beschrieben per Klick nachziehen.

## Image von GitHub

Der Workflow `.github/workflows/vtf-sync-image.yml` läuft bei jedem Push auf `main` (und von Hand unter Actions → „vtf-sync-Image“ → Run workflow): Tests, `npm run build`, dann das Image mit Dienst, Foundry-Modul und Obsidian-Plugin aus genau diesem Stand nach `ghcr.io/apollo-55/vtf-sync` (amd64 und arm64). Tags: `latest`, die Version (z. B. `1.0.0`) und `sha-<commit>` zum Festnageln oder Zurückgehen.

Das Image enthält weder Token noch Vault-Daten. Es ist zunächst **privat**, der Server muss sich dann einmal anmelden:

```bash
docker login ghcr.io -u <github-benutzer>     # Passwort: ein Personal Access Token (classic) mit „read:packages“
```

Ohne Anmeldung geht es, wenn du das Paket öffentlich machst: GitHub → dein Profil → Packages → `vtf-sync` → Package settings → Change visibility.

**Ohne GitHub:** `npm run build` erzeugt weiterhin `dist/vtf-sync.zip`. Auf dem Server neben die Compose-Datei entpacken, in der Compose-Datei `build: ./vtf-sync` statt `image:` eintragen und mit `docker compose up -d --build vtf-sync` starten.

## Modul vom Dienst installieren

Das Image enthält das Foundry-Modul aus demselben Build. Der Dienst liefert es ohne Token aus, Dienst und Modul haben also immer dieselbe Version:

- `GET /module/module.json` – Manifest, `manifest`/`download` zeigen auf diesen Dienst
- `GET /module/vault-to-foundry.zip` – das Modul (`module.json` liegt oben in der ZIP, mit denselben URLs)

In Foundry (Setup → Add-on-Module → **Modul installieren**) als Manifest-URL eintragen:

```
https://<deine-domain>/vtf-sync/module/module.json
```

Updates: `docker compose pull vtf-sync && docker compose up -d vtf-sync`, dann in Foundry bei den Modulen auf **Aktualisieren** klicken. `curl https://<deine-domain>/vtf-sync/health` zeigt unter `module` und `plugin` die Versionen, die der Dienst gerade ausliefert.

Die Adressen in `manifest`/`download` kommen aus `VTF_PUBLIC_URL`. Ohne diese Variable setzt der Dienst sie aus `X-Forwarded-Proto`, `X-Forwarded-Host`/`Host` und `X-Forwarded-Prefix` zusammen (siehe `nginx.example.conf`).

**Wichtig:** Das Manifest und die ZIP lädt der **Foundry-Server** herunter, nicht dein Browser. Der Foundry-Container muss die öffentliche Adresse also selbst erreichen. Prüfen auf dem Server:

```bash
docker exec <foundry-container> wget -qO- https://<deine-domain>/vtf-sync/module/module.json
```

Gibt das einen Fehler (z. B. weil eine Firewall Verbindungen aus Docker-Netzen zur eigenen öffentlichen IP blockt), das Modul wie bisher von Hand entpacken.

## Plugin vom Dienst aktualisieren

Das Image enthält auch das Obsidian-Plugin aus demselben Build. Obsidian kennt keine Manifest-URL, deshalb holt sich das Plugin die Dateien selbst – ein Update des Dienstes reicht also für alle drei Teile:

1. `docker compose pull vtf-sync && docker compose up -d vtf-sync`
2. Foundry: bei den Modulen **Aktualisieren**.
3. Obsidian: Beim Start (und danach alle paar Stunden) vergleicht das Plugin seine Dateien mit denen des Dienstes. Weichen sie ab, erscheint „Auf dem Server liegt Version …“ mit dem Knopf **Jetzt aktualisieren**. Jederzeit von Hand: Einstellungen → Vault to Foundry → **Plugin aktualisieren** oder Befehl „Plugin vom Foundry-Server aktualisieren“.

Das Plugin lädt `main.js`, `manifest.json` und `styles.css`, prüft jede Datei gegen ihre Prüfsumme, schreibt sie in seinen Ordner und lädt sich neu. Deine Einstellungen (`data.json`) bleiben unberührt. Es wird nie ohne Klick aktualisiert. Verglichen werden die Dateien, nicht nur die Versionsnummer – ein neuer Build mit gleicher Nummer wird also auch erkannt.

Anders als das Modul gibt der Dienst das Plugin **nur mit Token** heraus (`GET /v1/plugin`, `/v1/plugin/files/<name>`), denn das Plugin führt Code auf deinem Rechner aus.

**Erstinstallation** bleibt ein Handgriff, geht aber im Browser direkt vom Dienst:

1. Im Container `VTF_DOWNLOAD_PASSWORD` setzen (ein einfaches Passwort, **nicht** das Token) und den Dienst neu starten.
2. `https://<deine-domain>/vtf-sync/plugin` öffnen, Passwort eingeben, **Herunterladen**.
3. Die ZIP in `<vault>/.obsidian/plugins/` entpacken (Ordner `vault-to-foundry/`), Plugin in Obsidian einschalten, Server-Adresse und Token eintragen.

Das Passwort öffnet nur diese eine Seite und gibt nur die Plugin-ZIP heraus – keine Vault-Daten, kein Sync. Falsche Eingaben werden gebremst (höchstens 10 pro Minute). Ohne `VTF_DOWNLOAD_PASSWORD` ist die Seite aus. Für Skripte gibt es dieselbe ZIP weiterhin mit Token: `curl -H "Authorization: Bearer <VTF_TOKEN>" -o vault-to-foundry.zip https://<deine-domain>/vtf-sync/v1/plugin/vault-to-foundry.zip`.

Der DSA-NSC-Generator ist ein eigenes Plugin und wird nicht über den Dienst verteilt.

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

## Mehrere Kampagnen

Ein Dienst versorgt beliebig viele Vaults einer Foundry-Installation gleichzeitig; jede bekommt ihren eigenen Ordner `Data/vault-to-foundry/<vault>/`.

- **Jede Vault braucht einen eigenen Vault-Namen** (Plugin-Einstellungen). Zwei Vaults mit demselben Namen überschreiben sich gegenseitig.
- **Eine Welt merkt sich ihre Vault:** Die erste Übernahme verbindet die Welt mit der gewählten Vault, danach zeigen Dialog und Hinweispunkt nur noch diese. Lösen: Einstellungen → Vault to Foundry → „Verbundene Vault dieser Welt“ leeren und speichern.
- **Mehrere Foundry-Installationen:** Ein Dienst schreibt in genau einen Datenordner. Pro Instanz einen eigenen `vtf-sync`-Container mit eigenem Port und eigener nginx-Adresse starten.
- Der Token gilt für alle Vaults eines Dienstes.

## Speicherplatz

Der Dienst legt die echten Dateien direkt in Foundrys Datenordner. Genau von dort zeigt Foundry sie an, es gibt auf dem Server also **nur eine Kopie**; die Hashes in der Statusdatei dienen nur dazu, unveränderte Dateien nicht erneut zu übertragen. Mehrere Welten mit derselben Vault teilen sich diese Kopie. Dazu kommt je Vault eine `bundle.json` (Text). Dateien, die in der Vault gelöscht wurden, bleiben liegen, bis du sie in Obsidian mit dem Befehl zum Aufräumen entfernst.

## Sicherheit

- Ohne gültiges Token nimmt der Dienst nichts an. Das Token läuft über HTTPS (nginx).
- Das Obsidian-Plugin gibt der Dienst nur mit Token heraus. Wer den Server (oder das Token und die Adresse im Plugin) kontrolliert, bestimmt, welchen Code „Plugin aktualisieren“ in Obsidian lädt – das Update läuft deshalb nie ohne deinen Klick.
- Der Dienst sieht nur `Data/vault-to-foundry/`, er hat keinen Zugriff auf Welten, Module oder die Foundry-Konfiguration.
- Dateinamen werden geprüft (nur `A–Z a–z 0–9 . _ -`, keine `..`). Jede Datei wird gegen ihre Prüfsumme geprüft. `bundle.json` muss zum Vault passen.
- „Ungenutzte Dateien entfernen“ löscht nur Dateien, die die aktuelle `bundle.json` nicht mehr verwendet.

## Test ohne Server

```bash
VTF_TOKEN=mein-test-token-123456 VTF_DATA_DIR=$PWD/.foundry/data/Data/vault-to-foundry VTF_PORT=8787 node packages/sync-service/server.mjs
node tools/sync-cli.ts test-vault --name uthuria-ob --url http://127.0.0.1:8787 --token mein-test-token-123456
```

## Beispiel: DSA-Instanz auf manic (felddy, Bind-Mount)

Foundry läuft dort als `1001:1001`, die Daten liegen auf dem Host unter `/manic/foundry/yvtt/data`. Pro Foundry-Instanz ein eigener `vtf-sync` mit eigenem Port.

**Einmalig auf dem Host** (Ordner anlegen, gehört dem Foundry-Benutzer):

```bash
sudo mkdir -p /manic/foundry/yvtt/data/Data/vault-to-foundry
sudo chown 1001:1001 /manic/foundry/yvtt/data/Data/vault-to-foundry
```

**`.env`** neben der `docker-compose.yaml` (nicht ins Git, Rechte 600):

```
VTF_TOKEN=<Ausgabe von: openssl rand -hex 32>
VTF_DOWNLOAD_PASSWORD=<einfaches Passwort für die Download-Seite des Plugins, optional>
```

**In die bestehende `docker-compose.yaml` der DSA-Instanz** unter `services:`:

```yaml
  vtf-sync:
    image: ghcr.io/apollo-55/vtf-sync:latest
    container_name: vtf-sync-dsa
    user: 1001:1001
    restart: unless-stopped
    environment:
      - VTF_TOKEN=${VTF_TOKEN}
      - VTF_DOWNLOAD_PASSWORD=${VTF_DOWNLOAD_PASSWORD:-}   # optional: Download-Seite …/vtf-sync/plugin
      - VTF_PUBLIC_URL=https://dsa.manic-gaming.de/vtf-sync
    volumes:
      - /manic/foundry/yvtt/data/Data/vault-to-foundry:/data/vault-to-foundry
    ports:
      - 127.0.0.1:8787:8787      # nur lokal, nach außen geht es über den Reverse Proxy
```

Weitere Instanzen: gleicher Block mit anderem `container_name`, eigenem Mount auf deren Datenordner, Port `127.0.0.1:8788:8787` usw.

**Reverse Proxy** (das Token darf nur über HTTPS laufen):

- nginx im `server { … }` der Foundry-Domain:
  ```nginx
  location /vtf-sync/ {
      proxy_pass http://127.0.0.1:8787/;
      proxy_set_header X-Forwarded-Proto $scheme;
      proxy_set_header X-Forwarded-Prefix /vtf-sync;
      client_max_body_size 512m;
      proxy_request_buffering off;
  }
  ```
  Plugin-Adresse dann `https://<foundry-domain>/vtf-sync`.
- Alternativ Caddy mit eigener Subdomain (Caddyfile-Schreibweise):
  ```
  vtf-sync.manic-gaming.de {
      reverse_proxy 127.0.0.1:8787
  }
  ```
  Plugin-Adresse dann `https://vtf-sync.manic-gaming.de`.

Starten und prüfen:

```bash
docker compose up -d vtf-sync
curl -s http://127.0.0.1:8787/health          # auf dem Server
curl -s https://<domain>/vtf-sync/health       # von außen, über den Proxy
```
