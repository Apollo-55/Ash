# vtf-sync auf manic einrichten (DSA-Instanz)

Ausgangslage: Foundry (felddy, `1001:1001`) auf `localhost:30000`, Daten unter `/manic/foundry/yvtt/data`, nginx auf dem Host mit `dsa.manic-gaming.de` (Certbot).

```bash
# 1. Ordner für die Vault-Daten (gehört dem Foundry-Benutzer)
sudo mkdir -p /manic/foundry/yvtt/data/Data/vault-to-foundry
sudo chown 1001:1001 /manic/foundry/yvtt/data/Data/vault-to-foundry

# 2. Dienst neben die docker-compose.yaml der DSA-Instanz legen
cd <Ordner der DSA-docker-compose.yaml>
unzip vtf-sync.zip                      # ergibt ./vtf-sync/
echo "VTF_TOKEN=$(openssl rand -hex 32)" >> .env && chmod 600 .env
#    Block aus docker-compose.vtf-sync.yaml unter "services:" einfügen
docker compose up -d --build vtf-sync
curl -s http://127.0.0.1:8787/health   # → {"ok":true,...}

# 3. nginx: Block "location /vtf-sync/" aus dsa.manic-gaming.conf in die bestehende Datei übernehmen
sudo cp /etc/nginx/sites-enabled/dsa.manic-gaming.conf ~/dsa.manic-gaming.conf.bak
sudo nano /etc/nginx/sites-enabled/dsa.manic-gaming.conf
sudo nginx -t && sudo systemctl reload nginx
curl -s https://dsa.manic-gaming.de/vtf-sync/health   # → {"ok":true,...}
```

4. Obsidian → Einstellungen → Vault to Foundry → Sync-Server:
   - Server-Adresse: `https://dsa.manic-gaming.de/vtf-sync`
   - Token: Wert aus `.env` (`grep VTF_TOKEN .env`)
   - „Verbindung testen“

5. Modul in Foundry installieren – direkt vom Dienst, immer passend zu dessen Version:
   ```bash
   # prüfen, ob der Foundry-Container den Dienst über die öffentliche Adresse erreicht
   docker exec <foundry-container> wget -qO- https://dsa.manic-gaming.de/vtf-sync/module/module.json
   ```
   Foundry-Setup → Add-on-Module → **Modul installieren** → Manifest-URL `https://dsa.manic-gaming.de/vtf-sync/module/module.json` → Installieren, dann in der Welt aktivieren.
   **Update:** neue `vtf-sync.zip` entpacken, `docker compose up -d --build vtf-sync`, in Foundry bei den Modulen **Aktualisieren**. Obsidian meldet danach von selbst „Auf dem Server liegt Version …“ → **Jetzt aktualisieren** (oder Einstellungen → Vault to Foundry → „Plugin aktualisieren“).
   Klappt der `wget` nicht: wie bisher `dist/vault-to-foundry-module.zip` nach `/manic/foundry/yvtt/data/Data/modules/` entpacken (ersetzt `vault-to-foundry/`), Foundry neu laden.

**D&D-Instanz später:** gleicher Ablauf mit `dnd.manic-gaming.de`, eigenem Container (`vtf-sync-dnd`, Port `127.0.0.1:8788:8787`, Mount auf deren Datenordner) und eigenem Token.
