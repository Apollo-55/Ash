# Vault to Foundry

Exportiert eine Obsidian-Vault nach Foundry VTT: Notizen werden Journale, später kommen NSCs als Actors (DSA 4.1, System `dsa-41`) und Szenen dazu.

Stand: **M1**. Journale, Ordner, Links, Bilder, PDFs, Callouts, Secrets, Kommentare, erneuter Import ohne Duplikate, Importbericht.

## Bestandteile

| Paket | Zweck |
|---|---|
| `packages/core` | Logik ohne Obsidian/Foundry: Markdown → HTML, Links, IDs, Bundle, Sync-Planung |
| `packages/obsidian-plugin` | Obsidian-Plugin „Vault to Foundry“: Befehl „Nach Foundry exportieren (ZIP)“ |
| `packages/foundry-module` | Foundry-Modul `vault-to-foundry` (v13): Knopf „Vault importieren“ in der Journal-Seitenleiste |

## Bauen

```bash
npm install
npm test            # vitest
npm run build       # → dist/
npm run deploy      # baut, kopiert das Plugin in test-vault/, packt dist/vault-to-foundry-module.zip
npm run dev         # wie deploy, aber bei jeder Änderung
```

Umgebungsvariablen für `deploy`: `VTF_TEST_VAULT` (Standard `./test-vault`), `VTF_FOUNDRY_MODULES` (falls der Modulordner des Servers eingehängt ist, wird dorthin kopiert).

Ohne Obsidian exportieren (zum Testen): `node tools/export-cli.ts <vault-ordner> ausgabe.zip --name uthuria-ob`

## Installation

**Obsidian:** Ordner `dist/obsidian-plugin/` als `<vault>/.obsidian/plugins/vault-to-foundry/` kopieren, in Obsidian unter Community-Plugins aktivieren. Nur Desktop.

**Foundry (Server):** `dist/vault-to-foundry-module.zip` in `<Data>/modules/` entpacken, Foundry neu laden, Modul in der Welt aktivieren.

## Ablauf

1. Obsidian: Befehl „Vault to Foundry: Nach Foundry exportieren (ZIP)“ (oder Paket-Symbol links). Die ZIP landet im Exportordner (Standard `~/Downloads/<vault>-foundry.zip`).
2. Foundry (als GM): Journal-Seitenleiste → „Vault importieren“ → ZIP wählen.
3. Der Importbericht zeigt Angelegtes, Aktualisiertes, Übersprungenes, Verwaistes und Warnungen.

Bilder und PDFs landen auf dem Server unter `vault-to-foundry/<vault>/assets/` (Ordnerstruktur der Vault, Dateinamen ohne Umlaute und Leerzeichen). Hochgeladen wird nur, was sich geändert hat.

## Notation

### Frontmatter (optional)

```yaml
foundry:
  typ: journal      # journal (Standard) | szene (ab M3) | ignorieren
  sichtbar: gm      # gm | spieler (= Beobachter). Ohne Angabe bleibt die Berechtigung in Foundry, wie sie ist.
```

### Was umgewandelt wird

| Obsidian | Foundry |
|---|---|
| `[[Notiz]]`, `[[Notiz\|Alias]]`, `[[Notiz#Überschrift]]`, `[Text](Notiz.md)` | `@UUID[…]{…}`-Link. Nicht auflösbar → Text + Warnung |
| `![[bild.png]]`, `![[bild.png\|300]]`, `![](bild.png)` | Bild |
| `![[buch.pdf#page=12]]` | Link auf PDF-Journal + Direktlink auf die Seite |
| `![[Andere Notiz]]` | Link (noch keine eingebettete Darstellung) |
| `> [!warning] Titel` (alle Obsidian-Callouts, auch `[!tipp]`, `[!hinweis]` …) | farbiger Block |
| `> [!geheim]` / `> [!secret]` | Foundry-Secret (nur GM, aufdeckbar). Aufgedeckt bleibt aufgedeckt |
| `%%Kommentar%%`, `<!-- … -->` | **immer entfernt** |
| ` ```leaflet ` | das Kartenbild |
| ` ```dataview ` | ausgelassen (Hinweis im Bericht) |
| `- [ ] Aufgabe` | ☐ / ☑ |

## Einstellungen (Obsidian)

- **Exportordner**: wohin die ZIP geschrieben wird.
- **Nie exportieren**: Muster pro Zeile, z. B. `_privat/`, `Vorlagen/`, `*TODO*`.
- **Wurzelordner in Foundry**: optional ein gemeinsamer Oberordner.
- **Auch nicht verlinkte Dateien hochladen**: Standard an.
- **ID-Zuordnung**: Notizen behalten ihre Foundry-ID beim Umbenennen/Verschieben in Obsidian. Zurücksetzen nur, wenn du alles neu willst.

## Grenzen (M1)

- Foundry erlaubt 4 Ordnerebenen. Tiefere Ebenen werden zu „A / B“ zusammengefasst.
- Umbenennen wird nur erkannt, wenn Obsidian mit aktivem Plugin umbenennt (nicht im Dateimanager).
- `==Markierung==`, Fußnoten, Mermaid, Mathe und eingebettete Notizinhalte werden noch nicht umgewandelt.
- Gelöschte Notizen werden nie automatisch gelöscht, nur auf Knopfdruck im Bericht.
- NSCs (`dsa-nsc`) ab M2, Szenen ab M3.
