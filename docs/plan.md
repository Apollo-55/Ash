# Plan

## Entscheidungen (2026-11-03)

1. Notation wie unten, mit Item-Herkunft und eigenen Items (Abschnitt „Woher die Items kommen“).
2. Befehl „Wertekasten in dsa-nsc umwandeln“ statt Fließtext-Parser beim Export.
3. Angegebene Werte überschreiben die Automatik. Der gerenderte Block und der Umwandeln-Befehl zeigen bei jedem überschriebenen Wert den Rechenwert daneben (z. B. „MR 6 · gerechnet 7“).
4. PDFs werden mit hochgeladen. `![[x.pdf#page=181]]` wird eine PDF-Journalseite plus Link auf die Seite.
5. Leaflet-Blöcke → Kartenbild im Journal.
6. nginx ist für große Uploads eingerichtet, Bilder bleiben im Original.
7. Keine Standard-Ausschlüsse, alles wird exportiert. Ausschlüsse bleiben als Einstellung möglich.
8. Test-Vault als Kopie in `Ash/test-vault/`, Testwelt `vtf-test` auf dem Server.

## Rahmen

- **Foundry v13** auf eigenem Server. dsa-41 v13.1.4 erlaubt nur v13, deshalb `compatibility: { minimum: 13, verified: 13 }`, ApplicationV2/DialogV2.
- **Transport: ZIP-Upload.** Das Plugin schreibt `<vault>-<datum>.zip` (bundle.json + assets/) in einen wählbaren Ordner. Im Modul: Dialog „Vault importieren“ → ZIP wählen → JSZip entpackt im Browser → Bilder per `FilePicker.upload` nach `vault-to-foundry/<vault>/assets/` (nur geänderte, per Hash) → Dokumente anlegen oder aktualisieren → Bericht.
- Lokaler Datenordner-Weg und Auto-Sync entfallen vorerst. Ein „Auto-Sync“ in M4 hieße hier: Das Modul merkt sich die letzte ZIP nicht, also lieber ein schneller „Erneut importieren“-Knopf.
- Obsidian ist Flatpak mit `home`-Zugriff, ZIPs unter `~` gehen ohne Override.

## Notation `dsa-nsc` (an deine Schreibweise angepasst)

Deutsche Schlüssel und die Abkürzungen, die du schon benutzt (LeP, AuP, AsP, KaP). `LE`/`AU`/`AE`/`KE` werden als Synonyme akzeptiert. Würfel mit `W` wie gewohnt, der Import macht `d` daraus.

```dsa-nsc
name: Shahane ay Zedrakin
rolle: Proviantmeisterin            # optional, → background.profession
bild: c581da9441262801d0dc3999d7d0c831.jpg   # optional, sonst 1. Bild der Notiz
token: token_Shahane_ay_Zedrakin.png         # optional, sonst 1. Bild „token_*“
eigenschaften: { MU: 14, KL: 14, IN: 15, CH: 13, FF: 12, GE: 13, KO: 13, KK: 11 }
SO: 6
LeP: 36
AuP: 37
MR: 6          # angegeben → Automatik aus, Wert fest
RS: 0          # → modifiers.additionalRS (oder rüstung: …)
WS: 6
GS: 8
INI: 12+1W6    # nur 12 wird gespeichert, Würfel aus den Regeln
ausweichen: 13 # optional
rüstung: [Iryanleder]               # optional, aus Kompendium
waffen:
  - { name: Säbel, AT: 16, PA: 18, TP: 1W6+3, DK: N }
  - { name: Orchidee, talent: Dolche, AT: 17, PA: 15, TP: 1W6+1, DK: H }
talente: { Selbstbeherrschung: 7, Sinnenschärfe: 10, Menschenkenntnis: 18, Überreden: 17 }
zauber: { Blitz dich find: 16 }
liturgien: []
vorteile: [Soziale Anpassungsfähigkeit]
nachteile: { Brünstigkeit: 6, Eitelkeit: 7, Neid: 8 }
sonderfertigkeiten: [Aufmerksamkeit, Ausweichen I, Ausweichen II, Finte, Improvisierte Waffen]
notiz: Paktgeschenke – Brünstigkeit erzeugen, Lamijah …   # Freitext in die Biografie
```

Regeln:

- Pflicht ist nur `name`. Alles andere ist optional. Damit gehen auch Kreaturen wie die Riff-Hydra (nur GS, INI, eine Waffe).
- Unbekannte Schlüssel, Nicht-Zahlen („KK: 1a“) und Namen, die in keinem Kompendium stehen, werden im gerenderten Block rot angezeigt und im Bericht gewarnt.
- Waffen: Name zuerst im Waffen-Kompendium suchen (liefert Kampftalent, DK, INI-Mod …). Gibt es die Waffe nicht, eine generische Nahkampfwaffe anlegen, dann ist `talent:` Pflicht. `TP` überschreibt den Kompendiumwert.
- AT/PA: Das Modul gleicht das Kampftalent so ab, dass Foundry genau die angegebenen Werte zeigt (siehe Datenmodell). TaW = AT-Anteil + PA-Anteil.
- Überschriebene Rechenwerte (MR, INI, GS, WS, Ausweichen) zeigt der gerenderte Block mit dem gerechneten Wert daneben (Formeln wie im System: (MU+KL+KO)/5 gerundet usw.).
- Bei Wiederimport werden nur LeP/AuP/AsP-**Maximum** und Basiswerte überschrieben, aktuelle Werte nie.
- Biografie (`system.background.description`): Rücklink „Quelle: @UUID[Journal]“ plus `notiz`. Der Fließtext der Notiz bleibt im Journal und wird nicht kopiert.

## Woher die Items kommen

Der Actor bekommt echte eingebettete Items. Würfe für Talente, Zauber und Waffen funktionieren auf dem Bogen also wie bei einem von Hand gebauten Charakter. Suche pro Name, in dieser Reihenfolge:

1. **Items der Welt** (Seitenleiste „Gegenstände“). Deine eigenen Hausregel-Zauber oder Sonderwaffen legst du dort einmal an.
2. **Welt- und Modul-Kompendien**, die in den Moduleinstellungen ausgewählt sind.
3. **dsa-41-Kompendien** (Basis + `uthuria*`, weitere per Einstellung).
4. **Eigene Definition im Block** (siehe unten). Ein Item wird damit neu erzeugt.
5. Nichts gefunden und nichts definiert → minimales Item mit dem Namen (damit nichts verloren geht) **plus Warnung** im Block und im Bericht.

Das kopierte Item behält seine `sid`. Nur die Werte aus dem Block (TaW, ZfW, TP …) werden gesetzt.

Eigene Items im Block: statt einer Zahl eine Map mit Feldern.

```dsa-nsc
name: Schattenweber
zauber:
  Blitz dich find: 16                       # aus Kompendium
  Schattenschleier:                         # eigener Zauber
    ZfW: 12
    probe: MU/IN/CH
    kosten: 8 AsP
    wirkung: Hüllt den Zauberer in Schatten …
liturgien:
  - Mein Segen: { grad: 2, wirkung: … }
waffen:
  - name: Mandragora-Dolch                 # eigene Waffe
    talent: Dolche                          # Pflicht bei eigener Waffe
    TP: 1W6+1
    DK: H
    INI: 0
    WM: 0/-1
    AT: 17
    PA: 15
sonderfertigkeiten:
  - Finte
  - Schattenkampf: { typ: Kampf, beschreibung: … }
talente:
  Sinnenschärfe: 10
  Sternkunde: { TaW: 8, probe: KL/KL/IN, kategorie: Wissen }
```

Die Felder je Typ (Probe, Kosten, Reichweite, Wirkungsdauer usw.) lege ich in M2 anhand der DataModels fest. Was ich nicht kenne, landet in der Item-Beschreibung.

## M6: NSC-Generator (Beschreibung → `dsa-nsc`-Block) – gebaut, Modellwahl läuft (Anleitung: docs/nsc-generator.md)

Stand der Entscheidungen 2026-11-03:

- **Eigenes, optionales Obsidian-Plugin** („DSA-NSC-Generator“), nutzt den vorhandenen core (Schema, Katalog, Validierung, SF-Voraussetzungen, Rechenwerte).
- **LLM-Anbieter einstellbar:** lokal (bevorzugt, Ollama) oder Cloud (API-Schlüssel), umschaltbar in den Einstellungen.
- **Lokales LLM: keine Ressourcen, wenn ungenutzt** (einzige harte Anforderung, Weg egal). Plan: Ollama als Podman-Container, der **nur bei Bedarf läuft** – Start/Stopp per Befehl (`npm run llm:start` / `llm:stop`) oder per Knopf in Obsidian, falls das Flatpak-Recht später gewünscht ist. Der Container beendet sich zusätzlich selbst nach einer einstellbaren Leerlaufzeit (z. B. 15 Min.). Obsidian zeigt den Status („läuft / gestoppt“) und den Startbefehl zum Kopieren.
  **Analyse** beim ersten Start: Grafikkarte/Speicher erkennen, passendes Modell vorschlagen und laden, Erreichbarkeit prüfen.
  Rechner: AMD RX 6800/6900 (Navi 21, 16 GB VRAM), 46 GB RAM → Modelle bis ca. 14 B ganz auf der GPU.
- **Regelwerke austauschbar:** Ordner `Regelwerke/` mit einer Liste der Bücher (Datei, Titel, Ausgabe, wofür: Professionen, Liturgien, Zauber, SF). Bücher hinzufügen, entfernen oder durch bessere PDFs ersetzen → „Index neu aufbauen“. Je Buchart ein Extraktor (Professionspakete, Liturgielisten nach Gottheit/Grad, Zauber nach Tradition, SF-Voraussetzungen), dazu ein Prüfbericht, was aus jedem Buch gelesen wurde. PDFs ohne lesbaren Text werden erkannt und gemeldet (statt still ignoriert); OCR nur als Option.
- **Eingabe:** alle drei Wege – markierter Text, ganze Notiz, Formular (Dialog, vorbefüllt mit Markierung bzw. Notiz; Erfahrungsstufe, Rolle).
- **Ablauf:** LLM wählt die Profession aus einer Liste → Code liefert das Professionspaket (Wege der Helden), Liturgien nach Gottheit/Grad (Liber Liturgium), Zauber nach Tradition → LLM füllt den Block als JSON nach Schema → Validierung (Namen, Werte, SF-Voraussetzungen) → Fehler zurück ans LLM (bis 3 Runden) → Block unter die Beschreibung. Formeln (LeP, AuP …) rechnet der Code.
- **Testmenge:** die 24 umgewandelten NSCs (docs/nsc-umwandlung.md) als Vergleich für die Modellauswahl.
- **Später:** bessere PDF von *Wege des Schwerts* (die vorhandene hat keinen lesbaren Text) einfach in `Regelwerke/` tauschen und den Index neu aufbauen.
- Regelwerke bleiben lokal; bei Cloud-Anbietern gehen nur Auszüge der Professionspakete hinaus (Hinweis in den Einstellungen).

## ✅ M5: Sync über eigenen Dienst – Entscheidungen 2026-11-03

- Ansatz A: eigener kleiner Dienst `vtf-sync` (Docker) neben Foundry (felddy) hinter nginx. Er mountet nur `Data/vault-to-foundry/`, nimmt Einzeldateien und `bundle.json` an, führt eine Revision und kennt die Hashes der Dateien. Zugriff per Token.
- Obsidian synchronisiert **automatisch beim Speichern** (verzögert, nur geänderte Dateien), zusätzlich per Befehl. Statusleiste zeigt den Stand.
- Foundry übernimmt **nur per Knopf**, nie automatisch. Der Knopf zeigt an, wenn neue Änderungen bereitliegen. Das Modul liest `bundle.json` direkt aus Foundrys Datenordner (gleiche Domain), es spricht nicht mit dem Dienst.
- Ungenutzte Dateien auf dem Server: Befehl in Obsidian mit Bestätigungsliste.
- Die ZIP-Variante bleibt als Backup.

## Szenen (M3) – Entscheidungen 2026-11-03

- Markierung über einen eigenen Codeblock `szene`, beliebig viele pro Notiz. Die Notiz bleibt ein Journal und wird das verknüpfte Journal der Szene. Kein `foundry: typ: szene` im Frontmatter.
- Leaflet-Karten werden nur Szenen, wenn ein `szene`-Block sie über `leaflet: <id>` nennt. Bild und Marker kommen aus Leaflet, der Leaflet-Block selbst bleibt unverändert. Marker mit Link auf eine Notiz werden Kartennotizen (Pins) in Foundry. Umrechnung: x = lng · 2^(maxZoom−1), y = −lat · 2^(maxZoom−1), Standard maxZoom 10.
- NSC-Tokens nur für die in `nscs:` genannten NSCs, versteckt in einer Reihe am oberen Rand, nur beim ersten Anlegen. Niedrige Priorität.
- Nicht geplant: Wände aus Universal VTT (vielleicht später), Pins per Koordinate im Block, Musik.

~~~markdown
```szene
name: Alanfaner Sabotage – Deck          # optional, sonst Notizname
karte: "[[deck.webp]]"                   # Bild aus der Vault …
leaflet: süd-map                         # … oder eine Leaflet-Karte (Bild + Marker)
raster: { typ: quadrat, größe: 100, schritt: 1 }   # quadrat | hex | keins; Pixel pro Feld; Schritt pro Feld
nscs: ["[[#Die Viper]]", "[[Sabotage NSC#Vollstrecker]]"]
licht: nacht                             # tag (Standard) | nacht | dunkel
nebel: ja                                # Sicht + Nebel des Krieges; Standard nein
navigation: ja                           # in der Szenenleiste; Standard ja
```
~~~

Erneuter Import überschreibt Name, Ordner, Bild (Maße neu), Raster, Journal, Licht, Nebel, Navigation und die vom Import angelegten Pins. Nie angefasst: Tokens nach dem ersten Anlegen, Wände, Lichter, Sounds, Zeichnungen, von Hand gesetzte Pins.

## Szenen (ursprünglicher Entwurf)

Wie im Auftrag. Dazu: `karte` darf auch ein Bild aus einem Leaflet-Block der Notiz sein.

```yaml
---
foundry:
  typ: szene
  karte: "[[Kap-Aventus.png]]"
  raster: 100
  nscs: ["[[Shahane ay Zedrakin]]", "[[Sir Rondrigo von Talfenn]]"]
---
```

Ein Link in `nscs` auf eine Notiz mit mehreren Blöcken (Alanfaner Sabotage) setzt alle Blöcke, mit `"[[Alanfaner Sabotage#Die Viper]]"` nur den Block mit dem Namen.

## Bestehende Wertekästen

Statt eines Parsers, der bei jedem Export rät: ein Befehl **„Wertekasten in dsa-nsc umwandeln“**. Er wird auf die markierte Textstelle angewandt, erzeugt einen Block-Entwurf darunter und markiert unsichere Stellen. Du prüfst einmal und hast danach eindeutige Daten. Der Befehl ändert Notizen nur, wenn du ihn selbst aufrufst (Strg+Z geht).

## Reihenfolge

1. ✅ **M1** core (Markdown, Links, Embeds, Callouts, Secrets, Kommentare, IDs, Bundle) + Plugin-Export als ZIP + Modul-Import für Journals + Bericht.
2. ✅ **M2** dsa-nsc (Schema, Validierung, Rendering, Vorlage), Kompendium-Lookup, Actor-Import, AT/PA-Abgleich.
3. **M2b** Befehl „Wertekasten umwandeln“ für Stil 2 und 3.
4. ✅ **M3** Szenen.
5. ✅ **M4** Aufräumen verwaister Dokumente, Einstellungen, README, Markierung/Fußnoten/eingebettete Notizen, Version 1.0.0 mit fertigen ZIPs.
6. Später `dnd5e`-Adapter.

## Testorte

- Test-Vault: Kopie nach `Ash/test-vault/` (gitignored), zusätzlich ein synthetisches Beispiel mit Callouts, Secrets, Kommentaren und Alias-Links für die Tests.
- Testwelt `vtf-test` auf deinem Server (dsa-41 v13.1.4).
