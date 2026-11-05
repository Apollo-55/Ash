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
   - `VTF_PUBLIC_URL` auf die öffentliche Adresse des Dienstes setzen (z. B. `https://<deine-domain>/vtf-sync`), damit Foundry das Modul vom Dienst installieren kann (siehe [Modul vom Dienst installieren](#modul-vom-dienst-installieren)).
4. nginx: den Block aus `vtf-sync/nginx.example.conf` in den `server { … }` von Foundry einfügen, nginx neu laden.
5. `docker compose up -d --build vtf-sync`, dann prüfen: `curl https://<deine-domain>/vtf-sync/health` → `{"ok":true,…}`.

## Modul vom Dienst installieren

`vtf-sync.zip` enthält das Foundry-Modul aus demselben Build. Der Dienst liefert es ohne Token aus, Dienst und Modul haben also immer dieselbe Version:

- `GET /module/module.json` – Manifest, `manifest`/`download` zeigen auf diesen Dienst
- `GET /module/vault-to-foundry.zip` – das Modul (`module.json` liegt oben in der ZIP, mit denselben URLs)

In Foundry (Setup → Add-on-Module → **Modul installieren**) als Manifest-URL eintragen:

```
https://<deine-domain>/vtf-sync/module/module.json
```

Updates: neue `vtf-sync.zip` einspielen, `docker compose up -d --build vtf-sync`, dann in Foundry bei den Modulen auf **Aktualisieren** klicken. `curl https://<deine-domain>/vtf-sync/health` zeigt unter `module` die Version, die der Dienst gerade ausliefert.

Die Adressen in `manifest`/`download` kommen aus `VTF_PUBLIC_URL`. Ohne diese Variable setzt der Dienst sie aus `X-Forwarded-Proto`, `X-Forwarded-Host`/`Host` und `X-Forwarded-Prefix` zusammen (siehe `nginx.example.conf`).

**Wichtig:** Das Manifest und die ZIP lädt der **Foundry-Server** herunter, nicht dein Browser. Der Foundry-Container muss die öffentliche Adresse also selbst erreichen. Prüfen auf dem Server:

```bash
docker exec <foundry-container> wget -qO- https://<deine-domain>/vtf-sync/module/module.json
```

Gibt das einen Fehler (z. B. weil eine Firewall Verbindungen aus Docker-Netzen zur eigenen öffentlichen IP blockt), das Modul wie bisher von Hand entpacken.

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
```

**In die bestehende `docker-compose.yaml` der DSA-Instanz** unter `services:` (der Ordner `vtf-sync/` aus `dist/vtf-sync.zip` liegt daneben):

```yaml
  vtf-sync:
    build: ./vtf-sync
    container_name: vtf-sync-dsa
    user: 1001:1001
    restart: unless-stopped
    environment:
      - VTF_TOKEN=${VTF_TOKEN}
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
docker compose up -d --build vtf-sync
curl -s http://127.0.0.1:8787/health          # auf dem Server
curl -s https://<domain>/vtf-sync/health       # von außen, über den Proxy
```
