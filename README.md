# Vault to Foundry

Bringt eine Obsidian-Vault nach Foundry VTT: Notizen werden Journale, `dsa-nsc`-Blöcke werden spielbare Charaktere (DSA 4.1, System `dsa-41`), `szene`-Blöcke werden Szenen. Änderungen gehen beim Speichern automatisch an einen kleinen Dienst auf deinem Server; in Foundry übernimmst du sie per Knopf.

Version 1.0.0 – Änderungen siehe [CHANGELOG.md](CHANGELOG.md).

## Inhalt

1. [Installation](#installation)
2. [Alltag](#alltag)
3. [Notation](#notation) – Frontmatter, was umgewandelt wird, NSCs, Szenen
4. [Einstellungen](#einstellungen)
5. [Was beim erneuten Übernehmen passiert](#was-beim-erneuten-übernehmen-passiert)
6. [Grenzen](#grenzen)
7. [Probleme lösen](#probleme-lösen)
8. [Entwicklung](#entwicklung)

## Installation

`npm run build` legt drei Pakete in `dist/` ab:

| Datei | wohin |
|---|---|
| `vault-to-foundry-obsidian.zip` | in `<vault>/.obsidian/plugins/` entpacken, dann in Obsidian unter „Community-Plugins“ einschalten (nur Desktop) |
| `vault-to-foundry-module.zip` | auf dem Server in `<Foundry-Data>/modules/` entpacken, Foundry neu laden, Modul in der Welt aktivieren |
| `vtf-sync.zip` | Sync-Dienst: auf dem Server neben die `docker-compose.yaml` entpacken, siehe [docs/sync-server.md](docs/sync-server.md); fertige Dateien für manic: [deploy/manic/EINRICHTEN.md](deploy/manic/EINRICHTEN.md) |

Danach in Obsidian: Einstellungen → Vault to Foundry → **Sync mit Foundry** → Server-Adresse und Token eintragen → „Verbindung testen“.

Ohne Sync-Dienst geht alles auch per ZIP (siehe unten).

## Alltag

**Mit Sync-Dienst (Normalfall)**

1. In Obsidian schreiben und speichern. Kurz danach (Standard 10 s) gehen geänderte Notizen und Bilder an den Server. Die Statusleiste unten rechts zeigt `Foundry ⏳` (wartet), `Foundry ⟳ 3/12` (lädt), `Foundry ✓` (fertig) oder `Foundry ✗` (Fehler, Maus drüber zeigt den Grund). Ein Klick darauf synchronisiert sofort.
2. In Foundry (als Spielleitung): Journal-Seitenleiste → **„Vault synchronisieren“**. Ein orangefarbener Punkt zeigt, dass neue Änderungen bereitliegen. Erst „Übernehmen“ im Dialog ändert die Welt – nie automatisch, also auch nicht mitten in der Sitzung.
3. Der Importbericht zeigt Angelegtes, Aktualisiertes, Übersprungenes, Verwaistes und Warnungen, jeweils mit Link auf das Dokument und die Notiz in Obsidian. Verwaiste Dokumente (Notiz in Obsidian gelöscht) lassen sich dort nach Rückfrage löschen.

**Per ZIP (Backup)**

1. Obsidian: Befehl „Nach Foundry exportieren (ZIP)“ (oder Paket-Symbol links) → `~/Downloads/<vault>-foundry.zip`.
2. Foundry: ZIP-Symbol neben „Vault synchronisieren“ → Datei wählen → Importieren.

**NSC-Generator (optional):** Beschreibung schreiben → „NSC aus Markierung erzeugen“ → Claude oder OpenAI (eigener API-Schlüssel) schlägt Werte nach deinen Regelwerken vor. Einrichtung und Bedienung: [docs/nsc-generator.md](docs/nsc-generator.md).

**Befehle in Obsidian** (Befehlspalette): „Mit Foundry-Server synchronisieren“, „Nach Foundry exportieren (ZIP)“, „DSA-NSC-Vorlage einfügen“, „Ungenutzte Dateien auf dem Foundry-Server entfernen“.

## Notation

### Frontmatter (optional)

```yaml
foundry:
  typ: journal      # journal (Standard) | ignorieren
  sichtbar: gm      # gm | spieler (= Beobachter). Ohne Angabe bleibt die Berechtigung in Foundry, wie sie ist.
```

### Was umgewandelt wird

| Obsidian | Foundry |
|---|---|
| `[[Notiz]]`, `[[Notiz\|Alias]]`, `[[Notiz#Überschrift]]`, `[Text](Notiz.md)` | Link (`@UUID`), Überschriften-Links springen an die Stelle. Nicht auflösbar → Text + Warnung |
| `![[bild.png]]`, `![[bild.png\|300]]`, `![](bild.png)`, `![](https://…)` | Bild |
| `![[Notiz]]`, `![[Notiz#Abschnitt]]` | Inhalt der Notiz bzw. des Abschnitts, eingerahmt mit Link (bis 2 Ebenen tief) |
| `![[buch.pdf#page=12]]` | Link auf das PDF-Journal + Direktlink auf die Seite |
| `> [!warning] Titel` (alle Obsidian-Callouts, auch `[!tipp]`, `[!hinweis]` …) | farbiger Block |
| `> [!geheim]` / `> [!secret]` | Foundry-Secret (nur Spielleitung, aufdeckbar) |
| `%%Kommentar%%`, `<!-- … -->` | **immer entfernt**, auch in eingebetteten Notizen |
| `==Markierung==` | hervorgehoben |
| `Text[^1]` … `[^1]: Quelle` | Fußnote |
| `- [ ] Aufgabe` | ☐ / ☑ |
| ` ```leaflet ` | das Kartenbild (Szene nur über einen `szene`-Block) |
| ` ```dataview ` | ausgelassen (Hinweis im Bericht) |

### NSCs: der `dsa-nsc`-Block

Beliebig viele Blöcke pro Notiz. Befehl **„DSA-NSC-Vorlage einfügen“** setzt eine Vorlage ein. In Obsidian erscheint der Block als Wertekasten: Fehler rot, unbekannte Namen orange (mit Vorschlag), und bei Werten, die du selbst festlegst, steht daneben, was das System rechnen würde („MR 6 (gerechnet 8)“).

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
INI: 12+1W6                        # gespeichert wird 12, Würfel kommen aus den Regeln
rüstung: [Lederharnisch]           # aus dem Kompendium
RS: 3                              # Gesamt-RS; Rüstungen werden abgezogen, der Rest ist Zusatz-RS
waffen:
  - Säbel                          # Normalfall: AT/PA rechnet das System aus dem TaW
  - { name: Orchidee, AT: 17, PA: 15 }   # optional feste Werte
  - { name: Mandragora-Dolch, talent: Dolche, TP: 1W+1, WM: 0/-1 }   # eigene Waffe
talente: { Säbel: 18, Raufen: 19, Sinnenschärfe: 10, Sternkunde: { TaW: 8, probe: KL/KL/IN, kategorie: Wissen } }
zauber: { Blitz dich find: 16, Gardianum: 12, Schattenschleier: { ZfW: 12, probe: MU/IN/CH, kosten: 8 AsP, wirkung: … } }
liturgien: [Eidsegen, Wort der Wahrheit]
vorteile: [Soziale Anpassungsfähigkeit]
nachteile: { Neid: 8 }             # oder [Neid 8]
sonderfertigkeiten: [Finte, Ausweichen I, { Schattenkampf: { typ: Kampf, beschreibung: … } }]
notiz: Freitext für die Biografie
```
~~~

- **Woher die Items kommen** (je Name): Gegenstände der Welt → zusätzliche Kompendien (Moduleinstellung) → dsa-41-Kompendien (Basis, dann Uthuria, dann die übrigen) → eigene Definition im Block → sonst ein leeres Item plus Warnung. Eindeutige Kurzformen werden erkannt („Gardianum“ → „Gardianum Zauberschild“).
- **AT/PA:** Normalfall nur die Waffe und den TaW unter `talente` eintragen; das System verteilt den TaW (AT bekommt die größere Hälfte). Ohne TaW gilt das Kampftalent als untrainiert. Feste `AT`/`PA`/`FK` an der Waffe stehen genau so auf dem Bogen; weitere Waffen mit demselben Talent bekommen den Rest als Waffenmodifikator. BE aus Rüstungen zieht das System beim Wurf ab.
- Im Journal erscheint der Wertekasten mit „Zum Charakter“. `[[Notiz#Die Viper]]` verlinkt direkt den Charakter.

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

- Eine Leaflet-Karte wird nur Szene, wenn ein `szene`-Block sie mit `leaflet: <id>` nennt. Marker mit Link auf eine Notiz werden Kartennotizen (Pins), die das Journal öffnen.
- `[[Notiz#Szenenname]]` verlinkt direkt die Szene.

## Einstellungen

**Obsidian** (Einstellungen → Vault to Foundry)

| Abschnitt | Einstellung |
|---|---|
| Sync mit Foundry | Server-Adresse, Token, automatisch beim Speichern (an/aus), Wartezeit; Knöpfe „Verbindung testen“, „Jetzt synchronisieren“, „Ungenutzte Dateien entfernen …“ |
| Inhalt | Spielsystem für NSC-Blöcke (DSA 4.1 oder keins), Muster „Nie exportieren“ (z. B. `_privat/`, `Vorlagen/`, `*TODO*`), nicht verlinkte Dateien mitnehmen, Wurzelordner in Foundry |
| ZIP-Backup | Exportordner, „Jetzt exportieren“ |
| Fortgeschritten | Vault-Name in Foundry (fest, unabhängig vom Ordnernamen), ID-Zuordnung zurücksetzen |

**Foundry** (Moduleinstellungen): „Zusätzliche Kompendien für NSC-Items“, z. B. `world.hausregeln`.

## Was beim erneuten Übernehmen passiert

Obsidian liefert die Stammdaten, Foundry behält den Spielzustand.

| | wird überschrieben | bleibt unberührt |
|---|---|---|
| Journale | Name, Ordner, Inhalt, vom Import angelegte Seiten; Berechtigung nur mit `sichtbar:` | von Hand angelegte Seiten, aufgedeckte Secrets bleiben aufgedeckt |
| NSCs | Eigenschaften, Maximalwerte, feste Werte, Profession, Biografie, vom Import angelegte Items, Bild | aktuelle LeP/AuP/AsP/KaP, Wunden, Effekte, von Hand hinzugefügte Items |
| Szenen | Name, Ordner, Bild (Maße neu), Raster, Journal, Licht, Nebel, Navigation, Pins aus Leaflet | Tokens nach dem ersten Anlegen, Wände, Lichter, Sounds, Zeichnungen, von Hand gesetzte Pins |
| alles | – | Dokumente aus anderen Quellen; gelöschte Notizen werden nur auf Knopfdruck gelöscht |

Unveränderte Notizen werden übersprungen. Umbenennen und Verschieben in Obsidian erzeugt keine Duplikate, solange es in Obsidian geschieht (nicht im Dateimanager).

## Grenzen

- Foundry erlaubt 4 Ordnerebenen; tiefere Ebenen werden zu „A / B“ zusammengefasst.
- Mermaid, Mathe, Dataview und Block-Einbettungen (`![[Notiz#^block]]`) werden nicht umgewandelt.
- Dateien, die Foundry nicht annimmt (z. B. `.bak`, `.exe`), werden übersprungen und gemeldet.
- NSCs: Kreaturen sind normale Charaktere (dsa-41 kennt keinen eigenen Typ). Ein Block mit geändertem `name:` wird ein neuer Charakter, der alte erscheint als verwaist.
- Szenen: keine Wände/Türen/Lichter aus der Vault. Leaflet-Karten mit eigenen `bounds` bekommen keine Pins.
- Foundry v13 (dsa-41 läuft nur dort).

## Probleme lösen

| Symptom | Ursache / Lösung |
|---|---|
| Statusleiste `Foundry ✗` „Token falsch“ | Token im Plugin ≠ `VTF_TOKEN` im Container |
| `Foundry ✗` „Server nicht erreichbar“ | Dienst läuft nicht oder nginx-`location` fehlt: `curl https://<domain>/vtf-sync/health` |
| `Foundry ✗` „Datei zu groß“ | `VTF_MAX_MB` bzw. `client_max_body_size` erhöhen |
| Alles erscheint in Foundry doppelt | Vault-Name im Plugin passt nicht zu dem, den Foundry kennt (der Bericht warnt davor). Unter „Fortgeschritten“ den alten Namen eintragen, Duplikate löschen |
| Knopf „Vault synchronisieren“ ohne Punkt, obwohl synchronisiert | Foundry prüft einmal pro Minute; Seite neu laden |
| Bild in Foundry fehlt | Datei im Bericht unter Warnungen? Rechte im Server-Ordner (gleicher Benutzer wie Foundry)? |

## Entwicklung

| Paket | Zweck |
|---|---|
| `packages/core` | Logik ohne Obsidian/Foundry: Markdown → HTML, Links, IDs, Bundle, NSC- und Szenen-Blöcke, Sync-Planung, Sync-Client |
| `packages/obsidian-plugin` | Obsidian-Plugin |
| `packages/foundry-module` | Foundry-Modul `vault-to-foundry` (v13) |
| `packages/sync-service` | Sync-Dienst `vtf-sync` (Node, ohne Abhängigkeiten, Docker) |
| `packages/nsc-generator` | NSC-Generator: Regelwerk- und Seiten-Index, Claude (Anthropic-SDK) und OpenAI mit gemeinsamen Werkzeugen, Prüfung und Reparatur, Kreaturen |
| `packages/nsc-generator-plugin` | Obsidian-Plugin „DSA-NSC-Generator“ |

```bash
npm install
npm test              # vitest (core, Modul gegen nachgebaute Foundry-API, Sync-Dienst)
npm run typecheck
npm run build         # → dist/ (inkl. der drei ZIPs)
npm run deploy        # wie build, kopiert das Plugin zusätzlich in test-vault/
npm run dev           # wie deploy, bei jeder Änderung

npm run foundry       # lokale Test-Foundry auf http://localhost:30013 (.foundry/, gitignored)
npm run sync-local    # lokaler vtf-sync vor der Test-Foundry (Token in .foundry/sync-token)
npm run e2e           # kompletter Durchlauf im Browser (Playwright), Screenshots in dist/e2e/
npm run regelwerke    # Regelwerk-Index aus Regelwerke/*.pdf → .llm/regelwerk-index.json
```

Weitere Werkzeuge: `tools/export-cli.ts` (Export ohne Obsidian), `tools/sync-cli.ts` (Push ohne Obsidian), `tools/gen-dsa41-catalog.mjs` (Namenskatalog aus den dsa-41-Quellen), `tools/nsc-umwandlung/` (einmalige Umwandlung der Uthuria-NSCs).

Dokumentation: [docs/plan.md](docs/plan.md) (Entscheidungen), [docs/dsa41-datenmodell.md](docs/dsa41-datenmodell.md), [docs/vault-analyse.md](docs/vault-analyse.md), [docs/sync-server.md](docs/sync-server.md), [docs/test-foundry.md](docs/test-foundry.md), [docs/nsc-umwandlung.md](docs/nsc-umwandlung.md).
