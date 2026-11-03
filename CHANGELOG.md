# Änderungen

## 1.0.0 (2026-11-03)

Erste vollständige Fassung.

- **Journale (M1):** Notizen → Journale mit Ordnerstruktur, Wikilinks/Alias/Überschrift → `@UUID`, Bilder/Audio/Video, PDFs als PDF-Journale mit Seitenlink, Callouts, `[!geheim]` → Foundry-Secrets (aufgedeckt bleibt aufgedeckt), `%%Kommentare%%` und HTML-Kommentare immer entfernt, Leaflet-Karten als Bild, Dataview ausgelassen, Aufgabenlisten, `==Markierung==`, Fußnoten, eingebettete Notizen und Abschnitte (`![[Notiz]]`, `![[Notiz#Abschnitt]]`), stabile IDs auch beim Umbenennen, Importbericht mit Verwaisten und Löschen nach Bestätigung.
- **NSCs (M2, DSA 4.1 / dsa-41):** `dsa-nsc`-Block mit Wertekasten, Validierung gegen die dsa-41-Kompendien, Vorschlägen und „gerechnet“-Hinweisen; Actor-Import mit Items aus Welt → Zusatz-Kompendien → System-Kompendien → eigener Definition; AT/PA aus TaW oder fest; Spielstand bleibt beim erneuten Import erhalten.
- **Szenen (M3):** `szene`-Block, Leaflet-Karten mit Markern als Pins, NSC-Tokens versteckt beim ersten Anlegen; Tokens, Wände, Lichter bleiben unberührt.
- **Sync (M5):** Dienst `vtf-sync` (Docker) neben Foundry; Obsidian synchronisiert beim Speichern nur geänderte Dateien; Foundry übernimmt per Knopf „Vault synchronisieren“; ungenutzte Dateien per Befehl entfernen; ZIP-Import als Backup.
- **Komfort (M4):** gegliederte Einstellungen, fester Vault-Name (Ordner umbenennen erzeugt keine Duplikate), Warnung bei Duplikaten durch anderen Vault-Namen, fertige ZIPs für Plugin, Modul und Dienst.
