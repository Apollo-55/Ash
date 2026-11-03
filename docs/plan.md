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

## Szenen

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
4. **M3** Szenen.
5. **M4** Aufräumen verwaister Dokumente, Einstellungen, README.
6. Später `dnd5e`-Adapter.

## Testorte

- Test-Vault: Kopie nach `Ash/test-vault/` (gitignored), zusätzlich ein synthetisches Beispiel mit Callouts, Secrets, Kommentaren und Alias-Links für die Tests.
- Testwelt `vtf-test` auf deinem Server (dsa-41 v13.1.4).
