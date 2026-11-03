# Analyse der Vault `uthuria-ob`

Pfad: `~/Obsidian/uthuria-ob`. Nur gelesen, nichts geändert. Stand: 2026-11-03.

## Umfang und Struktur

95 Dateien: 26 Notizen (`.md`), 60 Bilder (35 png, 22 jpg, 2 webp, 1 jpeg), 7 PDFs, 1 `.canvas`, 1 `.base` (beide leere Standarddateien).

```
Abenteurer/                      (leer)
Asasets/                         Bilder (Porträts), 13 MB
  Token/                         Token-Bilder (token_<Name>.png)
  Tiles/, images/
Maps/                            4 große Karten, 20 MB (bis 3624×1962 bzw. 3508×4961, Südaventurien.png 10,7 MB)
NPC/
  Besatzung/                     7 NSCs
  Expedition/{Geweite,Krieger,Magier,Spezialisten}/   10 NSCs
Uthuria/
  Act1 Überfahrt/                Zufallstabellen, Begegnungen
    Entcounter/<Begegnung>/      je eine Notiz + Bilder/Tokens daneben
  Act3 Grüne Hölle/              (leer)
Welcome.md                       Standard-Begrüßung
```

Maximale Tiefe: 4 Ebenen (`Uthuria/Act1 Überfahrt/Entcounter/Alanfaner Sabotage`). Foundry erlaubt 4 Ordnerebenen (`CONST.FOLDER_MAX_DEPTH`), es passt also gerade.

## Frontmatter und Properties

**Keine einzige Notiz hat Frontmatter.** Auch das Core-Plugin „Properties“ ist aus. Alle Steuerung über Frontmatter (`foundry: …`) ist also neu. Der Standard muss ohne Frontmatter sinnvoll funktionieren.

## Wie NSCs notiert sind

Drei Stile, keiner davon einheitlich:

1. **Nur Beschreibung, gar keine Werte** (die meisten NSC-Notizen, z. B. Praiodan, Valeriano). Muster: `## <Rolle>` als erste Überschrift (z. B. „Der Pfau“, „Proviantmeisterin“), dann Porträt-Embed, dann Token-Embed, dann Fließtext mit fetten Labels (`**Archetyp:**`, `**Profession:**`) und einer Gerüchte-Liste.
2. **Klassischer Wertekasten im Fließtext** (Shahane ay Zedrakin):
   ```
   MU 14 KL 14 IN 15 CH 13 GE 13 FF 12 KO 13 KK 11 SO 6 LeP 36 AuP 37 MR 6 RS 0 WS 6 GS 8
   Säbel: INI 12+1W6 AT 16 PA 18 TP 1W6+3 DK N
   Vorteile / Nachteile: … / Brünstigkeit 6, Eitelkeit 7, Neid 8  Sonderfertigkeiten: …  Talente: Selbstbeherrschung 7, …
   ```
3. **Fett-Label-Stil, mehrere Gegner pro Notiz** (Alanfaner Sabotage):
   ```
   **LeP:** 38 | **AuP:** 45 | **MR:** 8 | **INI:** 22 (Axxeleratus 32)
   **Eigenschaften:** MU 15, KL 12, IN 16, CH 11, FF 15, GE 17, KO 13, KK 14
   **Rüstung:** Iryanleder-Rüstung (RS 3 / BE 0)
   Schwert(Haupt): AT: 19 PA: 17  Tp: (1W+4) + (1W6 (Gift) **N**
   Zauber: Blitz dich find - ZfW 16
   ```
   Dazu Einzelzeilen wie „Zweihandschwert: AT 25 PA 17“ (Rondrigo) oder Kreaturen ohne Eigenschaften (Riff-Hydra: GS, INI, AT 15 / 0, TP).

Gemeinsam: Abkürzungen **LeP/AuP/AsP** (nicht LE/AU), **TP mit „W“** (`1W6+3`, auch `1W+4`), DK als Buchstabe. Die Schreibweise ist uneinheitlich (`Tp`, `AT:`/`AT`, `/` zwischen AT und PA, Zusätze in Klammern). Ein Fließtext-Parser würde viele Sonderfälle raten müssen.

**Bild-Konvention:** In jeder NSC-Notiz kommt zuerst das Porträt, dann ein `token_<Name>.png` (liegt in `Asasets/Token/` oder neben der Begegnung). Das lässt sich automatisch nutzen.

## Links, Einbettungen, Markup

- **43 Embeds**, fast alle Bilder als `![[datei.png]]`, ohne Pfad, ohne Größe. Basenamen sind eindeutig (keine Duplikate).
- **1 PDF-Embed mit Seite**: `![[Q02 - Efferds Wogen.pdf#page=181]]`. Die 7 PDFs sind Regel- und Quellenbände.
- **Nur 8 Wikilinks**, ohne Alias, ohne `#Überschrift` (z. B. `[[Besondere Ereignisse]]` in der Zufallstabelle). Einer läuft ins Leere (`[[create a link]]` in Welcome.md).
- **Keine** Markdown-Links/-Bilder `[]()`, **keine Callouts**, **keine `%%Kommentare%%`**, **keine Tags**, **kein Frontmatter**.
- **Tabellen**: große Markdown-Tabelle (Zufallsbegegnungen 2W20) mit Links und Fettdruck in den Zellen.
- **Zitate** (`> _„…“_`) für NSC-Zitate, normale Listen, Überschriften `##`/`###`/`####`.
- **Codeblöcke**: nur 3 × ` ```leaflet ` (Karten mit `image: [[Südaventurien.png]]`).

## Plugins

- Community: nur **obsidian-leaflet-plugin** (interaktive Karten). Kein Dataview, Templater oder Fantasy Statblocks.
- Core: u. a. Templates, Bases, Canvas, Sync (Obsidian Sync aktiv), Properties aus.
- `app.json`: `alwaysUpdateLinks: true`. Kein eigener Anhang-Ordner eingestellt, Bilder liegen manuell in `Asasets/` oder neben der Notiz.

## Folgerungen

- Callouts, Secrets, Kommentare und Alias-Links trotzdem vollständig bauen (Auftrag). Sie werden aber nur in Testdaten vorkommen, bis ich sie in der Vault benutze.
- **Leaflet-Blöcke** → im Journal als Bild der Karte (`image:`) ausgeben statt still verwerfen.
- **PDF-Embeds** werden hochgeladen und als PDF-Journalseite mit Link auf die Seite verknüpft.
- Keine Standard-Ausschlüsse (Entscheidung: alles exportieren). `.base`/`.canvas` sind keine Notizen und werden übersprungen, weil Foundry sie nicht darstellen kann.
- Bildgröße: 33 MB insgesamt, Upload je Datei. nginx ist für große Uploads eingerichtet.
