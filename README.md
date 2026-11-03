# Vault to Foundry

Exportiert eine Obsidian-Vault nach Foundry VTT: Notizen werden Journale, `dsa-nsc`-Blöcke werden spielbare Charaktere (DSA 4.1, System `dsa-41`), `szene`-Blöcke werden Szenen.

Stand: **M3**. Journale, Ordner, Links, Bilder, PDFs, Callouts, Secrets, Kommentare, NSCs mit Items aus den Kompendien, erneuter Import ohne Duplikate, Importbericht.

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

Lokale Foundry zum Testen (gitignored in `.foundry/`, Foundry 13.351 + dsa-41 v13.1.4, Welt `vtf-test`):

```bash
npm run foundry     # startet http://localhost:30013 (eigenes Terminal)
npm run e2e         # kompletter Durchlauf im Browser (Playwright), Screenshots in dist/e2e/
```

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

### NSCs: der `dsa-nsc`-Block

Beliebig viele Blöcke pro Notiz. Befehl **„DSA-NSC-Vorlage einfügen“** setzt eine Vorlage ein. In Obsidian erscheint der Block als Wertekasten: Fehler rot, unbekannte Namen orange, und bei Werten, die du selbst festlegst, steht daneben, was das System rechnen würde („MR 6 (gerechnet 8)“).

~~~markdown
```dsa-nsc
name: Shahane ay Zedrakin          # Pflicht, alles andere optional
rolle: Proviantmeisterin           # → Profession
bild: portrait.jpg                 # sonst erstes Bild der Notiz
token: token_Shahane.png           # sonst erstes Bild „token_…“
verknüpft: ja                      # Token mit Actor verknüpft; Standard: ja bei einem Block pro Notiz
eigenschaften: { MU: 14, KL: 14, IN: 15, CH: 13, FF: 12, GE: 13, KO: 13, KK: 11 }
SO: 6
LeP: 36                            # auch LE; AuP/AU, AsP/AE, KaP/KE
MR: 6                              # MR, INI, GS, WS, ausweichen: angegeben = fest, sonst rechnet das System
RS: 0
WS: 6
GS: 8
INI: 12+1W6                        # gespeichert wird 12, Würfel kommen aus den Regeln
ausweichen: 14
rüstung: [Lederharnisch]           # aus dem Kompendium; RS oben ist dann der Gesamtwert
waffen:
  - Säbel                         # Normalfall: Werte rechnet das System aus dem TaW
  - { name: Orchidee, AT: 17, PA: 15 }   # optional: feste Werte
  - { name: Mandragora-Dolch, talent: Dolche, AT: 17, PA: 15, TP: 1W+1, WM: 0/-1 }   # eigene Waffe
talente: { Säbel: 18, Sinnenschärfe: 10, Menschenkenntnis: 18, Sternkunde: { TaW: 8, probe: KL/KL/IN, kategorie: Wissen } }
zauber: { Blitz dich find: 16, Gardianum: 12, Schattenschleier: { ZfW: 12, probe: MU/IN/CH, kosten: 8 AsP, wirkung: … } }
liturgien: [Segen der Heiligen Noiona]
vorteile: [Soziale Anpassungsfähigkeit]
nachteile: { Neid: 8 }             # oder [Neid 8]
sonderfertigkeiten: [Finte, Ausweichen I, { Schattenkampf: { typ: Kampf, beschreibung: … } }]
notiz: Freitext für die Biografie
```
~~~

**Woher die Items kommen** (je Name, in dieser Reihenfolge): Gegenstände der Welt → zusätzliche Kompendien aus den Moduleinstellungen → dsa-41-Kompendien (Basis, dann Uthuria, dann die übrigen) → eigene Definition im Block → sonst ein leeres Item mit dem Namen plus Warnung. Eindeutige Kurzformen werden erkannt („Gardianum“ → „Gardianum Zauberschild“).

**AT/PA:** Normalfall: nur die Waffe eintragen (`waffen: [Säbel]`) und den TaW unter `talente` (`Säbel: 14`). Dann rechnet das System AT/PA selbst (AT-Basis + Talentanteil, der TaW wird halbiert, die AT bekommt die größere Hälfte). Ohne TaW gilt das Kampftalent als untrainiert (0). Optional, wenn du feste Werte willst (z. B. aus einem Abenteuerband): `AT`/`PA`/`FK` an der Waffe. Dann stehen genau diese Werte auf dem Bogen. Die erste Waffe eines Kampftalents legt die AT/PA-Verteilung des Talents fest, weitere Waffen mit demselben Talent bekommen den Rest als Waffenmodifikator (wirkt beim Wurf). BE aus Rüstungen wird beim Wurf zusätzlich abgezogen.

**Erneuter Import:** überschreibt Eigenschaften, Maximalwerte, die festen Werte, Profession, Biografie und die vom Import angelegten Items. **Nie angefasst:** aktuelle LeP/AuP/AsP/KaP, Wunden, Effekte, von Hand hinzugefügte Items.

In der Notiz zeigt das Journal den Wertekasten mit „Zum Charakter“. `[[Notiz#Die Viper]]` verlinkt direkt den Charakter.

### Szenen: der `szene`-Block

Beliebig viele pro Notiz. Die Notiz wird das verknüpfte Journal der Szene. In Obsidian erscheint der Block als Karte mit Vorschaubild und Fehlern.

~~~markdown
```szene
name: Sabotage an Deck                   # optional, sonst Notizname
karte: "[[deck.webp]]"                   # Bild aus der Vault …
leaflet: süd-map                         # … oder eine Leaflet-Karte (Bild + Marker)
raster: { typ: quadrat, größe: 100, schritt: 1 }   # quadrat | hex | keins; Standard: quadrat 100 (karte) bzw. keins (leaflet)
nscs: ["[[#Die Viper]]", "[[Alanfaner Sabotage#Vollstrecker]]"]   # Tokens, versteckt am oberen Rand
licht: nacht                             # tag (Standard) | nacht | dunkel
nebel: ja                                # Sicht und Nebel des Krieges; Standard nein
navigation: ja                           # in der Szenenleiste; Standard ja
```
~~~

- **Leaflet:** Eine Leaflet-Karte wird nur Szene, wenn ein `szene`-Block sie mit `leaflet: <id>` nennt. Deine Marker mit Link auf eine Notiz werden Kartennotizen (Pins), die das Journal öffnen. Marker ohne Link oder mit Link auf nicht exportierte Notizen werden übersprungen und gemeldet.
- **Erneuter Import** überschreibt Name, Ordner, Bild (Maße neu), Raster, Journal, Licht, Nebel, Navigation und die Pins aus Leaflet. **Nie angefasst:** Tokens nach dem ersten Anlegen (auch verschobene oder aufgedeckte), Wände, Lichter, Sounds, Zeichnungen, von Hand gesetzte Pins.
- `[[Notiz#Szenenname]]` verlinkt direkt die Szene.

## Einstellungen (Obsidian)

- **Exportordner**: wohin die ZIP geschrieben wird.
- **Nie exportieren**: Muster pro Zeile, z. B. `_privat/`, `Vorlagen/`, `*TODO*`.
- **Wurzelordner in Foundry**: optional ein gemeinsamer Oberordner.
- **Spielsystem für NSC-Blöcke**: DSA 4.1 (Standard) oder keins.
- **Auch nicht verlinkte Dateien hochladen**: Standard an.
- **ID-Zuordnung**: Notizen behalten ihre Foundry-ID beim Umbenennen/Verschieben in Obsidian. Zurücksetzen nur, wenn du alles neu willst.

**Foundry:** Moduleinstellung „Zusätzliche Kompendien für NSC-Items“ (z. B. `world.hausregeln`).

## Grenzen (M3)

- Foundry erlaubt 4 Ordnerebenen. Tiefere Ebenen werden zu „A / B“ zusammengefasst.
- Umbenennen wird nur erkannt, wenn Obsidian mit aktivem Plugin umbenennt (nicht im Dateimanager).
- `==Markierung==`, Fußnoten, Mermaid, Mathe und eingebettete Notizinhalte werden noch nicht umgewandelt.
- Gelöschte Notizen werden nie automatisch gelöscht, nur auf Knopfdruck im Bericht.
- Dateien, die Foundry nicht annimmt (z. B. `.bak`, `.exe`), werden übersprungen und im Export-Dialog genannt.
- NSCs: Kreaturen sind normale Charaktere (dsa-41 kennt keinen eigenen Typ). BE aus Rüstungen wird nicht in AT/PA eingerechnet. Ein umbenannter Block (anderer `name:`) wird ein neuer Charakter, der alte erscheint als verwaist.
- Szenen: keine Wände/Türen/Lichter aus der Vault, keine Musik. Leaflet-Karten mit eigenen `bounds` bekommen keine Pins.
