# Blöcke: `dsa-nsc` und `szene`

Ein `dsa-nsc`-Block in einer Notiz wird in Foundry ein Charakter, ein `szene`-Block eine Szene. Diese Seite erklärt jedes Feld und zeigt, wie man es schreibt. Was beim Übernehmen im Hintergrund passiert, steht in [docs/entwicklung.md](entwicklung.md); den Kurzüberblick mit je einem Beispiel gibt die [README](../README.md#notation).

## Inhalt

1. [So schreibt man einen Block](#so-schreibt-man-einen-block)
2. [NSC: `dsa-nsc`](#nsc-dsa-nsc)
   - [Alle Schlüssel](#alle-schlüssel)
   - [Steckbrief: `name`, `rolle`, `rasse`, `kultur`, `notiz`](#steckbrief-name-rolle-rasse-kultur-notiz)
   - [Bilder: `bild`, `token`](#bilder-bild-token)
   - [`verknüpft`](#verknüpft)
   - [Eigenschaften, Energien, `SO`](#eigenschaften-energien-so)
   - [Feste Werte: `MR`, `MR-Mod`, `INI`, `GS`, `WS`, `ausweichen`](#feste-werte-mr-mr-mod-ini-gs-ws-ausweichen)
   - [Woher Items kommen](#woher-items-kommen)
   - [`rüstung` und `RS`](#rüstung-und-rs)
   - [`waffen`](#waffen)
   - [`schilde`](#schilde)
   - [`talente`, `zauber`, `liturgien`, `vorteile`, `nachteile`, `sonderfertigkeiten`](#talente-zauber-liturgien-vorteile-nachteile-sonderfertigkeiten)
   - [Eigene Definitionen](#eigene-definitionen)
   - [Mehrere NSCs, Links auf NSCs](#mehrere-nscs-links-auf-nscs)
3. [Szene: `szene`](#szene-szene)
   - [Alle Schlüssel](#alle-schlüssel-1)
   - [`karte` oder `leaflet`](#karte-oder-leaflet)
   - [`raster`](#raster)
   - [`nscs`](#nscs)
   - [`licht`, `nebel`, `navigation`](#licht-nebel-navigation)
   - [Leaflet-Karten und Pins](#leaflet-karten-und-pins)
   - [Mehrere Szenen, Links auf Szenen](#mehrere-szenen-links-auf-szenen)
4. [Vollständige Beispiele](#vollständige-beispiele)
5. [Häufige Fehler](#häufige-fehler)

---

## So schreibt man einen Block

Ein Block ist ein Codeblock mit der Sprache `dsa-nsc` oder `szene`:

~~~markdown
```dsa-nsc
name: Alrik
LeP: 30
```
~~~

Der Inhalt ist YAML. Das Wichtigste:

- **Eine Zeile pro Schlüssel**, `schlüssel: wert`. Nach dem Doppelpunkt kommt ein Leerzeichen.
- **Groß-/Kleinschreibung der Schlüssel ist egal**: `LeP`, `lep` und `LEP` sind dasselbe. Viele Schlüssel haben Kurzformen (`LE` für `LeP`); die Tabellen unten nennen sie.
- **Jeder Schlüssel nur einmal**, auch nicht einmal als Langform und einmal als Kurzform.
- **Unbekannte Schlüssel sind ein Fehler.** Der Block zeigt dann, was gemeint sein könnte.
- **Listen** und **Zuordnungen** gehen in einer Zeile oder untereinander:

  ```yaml
  vorteile: [Flink, Zäher Hund]            # Liste in einer Zeile
  vorteile:                                # Liste untereinander
    - Flink
    - Zäher Hund
  talente: { Säbel: 12, Klettern: 5 }      # Zuordnung in einer Zeile
  talente:                                 # Zuordnung untereinander
    Säbel: 12
    Klettern: 5
  ```

- **Anführungszeichen** braucht ein Wert, der mit `#`, `[`, `{`, `*`, `&`, `!`, `|`, `>`, `%` oder `@` beginnt oder `: ` enthält. Der wichtigste Fall sind Links: `"[[#Die Viper]]"`. Im Zweifel immer `"…"`.
- **Kommentare** beginnen mit ` #`: `MR: 6   # fest`.
- **Zahlen** sind ganze Zahlen, auch als `"+3"` oder `-2`. Kommazahlen gibt es nur bei `raster: schritt`.
- **Einrücken mit Leerzeichen**, nicht mit Tabs.

**Der Name ist die Kennung.** Ändert man `name:` eines NSC oder einer Szene, entsteht beim nächsten Übernehmen ein neuer Charakter bzw. eine neue Szene; der alte Eintrag erscheint im Bericht als verwaist.

**Meldungen.** In Obsidian erscheint der Block als Wertekasten. Fehler (✖, rot) verhindern, dass der Block oder der betroffene Eintrag übernommen wird. Warnungen (⚠, orange) und Hinweise (ℹ) sind nur Information; bei unbekannten Namen und Tippfehlern wird ein Vorschlag gemacht („meintest du …?“). Fehler und Warnungen stehen auch im Importbericht in Foundry.

---

## NSC: `dsa-nsc`

Gilt für DSA 4.1 (Foundry-System `dsa-41`), eingestellt unter „Inhalt → Spielsystem für NSC-Blöcke“. Der Befehl **„NSC-Vorlage einfügen“** setzt diese Vorlage ein:

~~~markdown
```dsa-nsc
name:
rolle:
rasse:
kultur:
eigenschaften: { MU: 12, KL: 12, IN: 12, CH: 12, FF: 12, GE: 12, KO: 12, KK: 12 }
LeP: 30
AuP: 30
RS: 0
waffen:
  - { name: Säbel, AT: 12, PA: 10, TP: 1W6+3 }
talente: { Sinnenschärfe: 5, Menschenkenntnis: 5 }
vorteile: []
nachteile: {}
sonderfertigkeiten: []
```
~~~

Nur `name` ist Pflicht. Alles andere kann weg; was fehlt, bleibt leer oder wird vom System gerechnet.

### Alle Schlüssel

| Schlüssel | Kurzform | Wert | ohne Angabe |
|---|---|---|---|
| `name` | | Text | **Pflicht** |
| `rolle` | | Text | leer |
| `rasse` | `spezies` | Text | leer |
| `kultur` | | Text | leer |
| `bild` | | Bild | erstes Bild im Abschnitt |
| `token` | | Bild | erstes `token_…`-Bild, sonst `bild` |
| `verknüpft` | `verknuepft` | ja/nein | ja bei einem NSC in der Notiz, sonst nein |
| `eigenschaften` | | `{ MU: 14, … }` | fehlende Eigenschaften 0 |
| `MU` `KL` `IN` `CH` `FF` `GE` `KO` `KK` | | Zahl | einzeln statt `eigenschaften` |
| `SO` | | Zahl | 0 |
| `LeP` | `LE` | Zahl | 0 |
| `AuP` | `AU` | Zahl | 0 |
| `AsP` | `AE` | Zahl | kein Magie-Reiter |
| `KaP` | `KE` | Zahl | kein Karma-Reiter |
| `MR` | | Zahl | gerechnet |
| `MR-Mod` | `mrmod`, `mr_mod` | Zahl, auch negativ | 0 |
| `INI` | | Zahl oder `12+1W6` | gerechnet |
| `GS` | | Zahl | gerechnet |
| `WS` | | Zahl | gerechnet |
| `ausweichen` | `AW` | Zahl | gerechnet |
| `RS` | | Zahl | 0 |
| `rüstung` | `ruestung`, `rüstungen` | Name, `{ name, RS, BE }` oder Liste | keine |
| `waffen` | | Liste | keine |
| `schilde` | `schild` | Name, `{ name, typ, WM, INI, BF }` oder Liste | keine |
| `talente` | | Liste / Zuordnung | keine |
| `zauber` | | Liste / Zuordnung | keine |
| `liturgien` | | Liste / Zuordnung | keine |
| `vorteile` | | Liste / Zuordnung | keine |
| `nachteile` | | Liste / Zuordnung | keine |
| `sonderfertigkeiten` | `SF` | Liste / Zuordnung | keine |
| `notiz` | `notizen` | Text | leer |

### Steckbrief: `name`, `rolle`, `rasse`, `kultur`, `notiz`

```yaml
name: Shahane ay Zedrakin
rolle: Proviantmeisterin
rasse: Tulamidin
kultur: Tulamidische Stadtstaaten
notiz: |
  Hat eine Schwäche für Glücksspiel.
  Schuldet dem Kapitän Geld.
```

- **`name`**: Name des Charakters in Foundry.
- **`rolle`**: Feld „Profession“ auf dem Bogen. Nur Text, kein Item; ein MR-Modifikator der Profession wird nicht gerechnet.
- **`rasse`** und **`kultur`**: stehen als Text auf dem Bogen und werden außerdem als Item aus den Rassen- bzw. Kulturen-Kompendien angelegt. Darüber rechnet das System ihre MR-Modifikatoren (bei Rassen auch INI, z. B. Goblin MR −5, INI +2) in die Werte ein.
  - Die Kompendien schreiben Rassen mit Geschlechtsformen („Mittelländer*in“, „Nivese/Nivesin“, „Zwerg*in - Ambosszwerge“). Im Block genügt eine Form oder die Variante: `Mittelländer`, `Nivesin`, `Ambosszwerge`.
  - Kulturen heißen wie im Kompendium: `Almada`, `Almada - Gebirge`, `Mittelländische Städte`. Eine Variante allein (`Drasdech`) zählt nur, wenn sie eindeutig ist.
  - Ein NSC hat genau eine Rasse und eine Kultur. Wer sie ändert, bekommt beim nächsten Übernehmen das neue Item, das alte wird entfernt.
- **`notiz`**: Freitext für die Biografie. Davor steht automatisch ein Link „Quelle: <Notiz>“ auf das Journal. Mehrere Zeilen mit `|` wie oben.

### Bilder: `bild`, `token`

```yaml
bild: portrait.jpg                 # Dateiname genügt
bild: "[[Shahane.webp]]"           # Wikilink, in Anführungszeichen
bild: Bilder/NSC/Shahane.webp      # Pfad
bild: https://example.org/s.png    # Webbild
token: token_Shahane.png
```

Die Datei wird wie ein Obsidian-Link gesucht. Ohne Angabe nimmt das Plugin Bilder, die im **Abschnitt** des Blocks eingebettet sind (`![[…]]` oder `![](…)`); der Abschnitt reicht vom vorigen `dsa-nsc`-Block (oder dem Anfang der Notiz) bis zum nächsten:

- **Porträt** = erstes Bild, dessen Dateiname *nicht* mit `token_` oder `token-` beginnt.
- **Token** = erstes Bild, dessen Dateiname mit `token_` oder `token-` beginnt; sonst das Porträt.

### `verknüpft`

```yaml
verknüpft: nein      # ja | nein | true | false
```

Ob der Token mit dem Charakter verknüpft ist, also Schaden am Token auch Schaden am Charakter ist. Für einen einzelnen NSC ist das sinnvoll (Standard `ja`). Für Gruppen wie „Vollstrecker“, von denen mehrere Tokens auf der Karte stehen, nicht (Standard `nein`, sobald die Notiz mehrere NSC-Blöcke hat).

### Eigenschaften, Energien, `SO`

```yaml
eigenschaften: { MU: 14, KL: 14, IN: 15, CH: 13, FF: 12, GE: 13, KO: 13, KK: 11 }
SO: 6
LeP: 36       # oder LE
AuP: 34       # oder AU
AsP: 28       # oder AE
KaP: 24       # oder KE
```

- Die acht Eigenschaften gehen gesammelt unter `eigenschaften` oder einzeln als eigene Zeilen (`MU: 14`). Werte unter 0 oder über 30 geben eine Warnung. Erst wenn alle acht da sind, kann der Wertekasten die gerechneten Werte (MR, INI, AT-Basis …) zum Vergleich zeigen.
- Energien sind das **Maximum**. Beim ersten Anlegen ist der aktuelle Wert gleich dem Maximum; später fasst das Plugin den aktuellen Wert nicht mehr an, das ist Spielzustand.
- `AsP` schaltet beim Charakter den Magie-Reiter ein, `KaP` den Karma-Reiter.
- `SO` ist der Sozialstatus.

### Feste Werte: `MR`, `MR-Mod`, `INI`, `GS`, `WS`, `ausweichen`

Diese Werte rechnet das System aus Eigenschaften, Rasse, Kultur und Vor-/Nachteilen. Wer einen davon angibt, schaltet die Rechnung für genau diesen Wert ab und trägt ihn fest ein. Der Wertekasten zeigt dann daneben, was herausgekommen wäre: „MR 6 (gerechnet 8)“.

```yaml
MR: 6
INI: 12+1W6      # gespeichert wird 12; die Würfel kommen aus den Regeln
GS: 8
WS: 7            # Wundschwellen 7 / 14 / 21
ausweichen: 9    # oder AW
```

**`MR-Mod`** ist etwas anderes: der „Zusatz-MR“ des Bogens, den das System zur **gerechneten** MR addiert, für alles, was nicht aus Rasse, Kultur oder Vor-/Nachteilen kommt. Zusammen mit einem festen `MR` ist er wirkungslos (Warnung): bei fester MR gehört alles in die Zahl hinter `MR`.

```yaml
rasse: Goblin             # MR −5, INI +2 aus dem Kompendium
kultur: Festumer Ghetto   # MR +1
MR-Mod: 1                 # Zusatz-MR
```

So rechnet das System (kaufmännisch gerundet, Behinderung nicht berücksichtigt):

| Wert | Formel |
|---|---|
| AT-Basis | (MU + GE + KK) / 5 |
| PA-Basis | (IN + GE + KK) / 5 |
| FK-Basis | (IN + FF + KK) / 5 |
| INI | (MU + MU + IN + GE) / 5, + INI-Modifikator der Rasse |
| MR | (MU + KL + KO) / 5, + MR-Modifikatoren von Rasse und Kultur, ± Hohe/Niedrige Magieresistenz, + `MR-Mod` |
| WS | KO / 2 |
| GS | 8; +1 bei GE ≥ 16, −1 bei GE ≤ 10; + Flink, − Behäbig/Kleinwüchsig/Lahm, −2 Zwergenwuchs |
| Ausweichen | PA-Basis; +3 je Ausweichen I/II/III; +1 Flink, −1 Behäbig; Akrobatik über 9: +1 je 3 Punkte |

### Woher Items kommen

Rüstungen, Waffen, Schilde, Talente, Zauber, Liturgien, Vorteile, Nachteile und Sonderfertigkeiten werden über ihren **Namen** gefunden, in dieser Reihenfolge:

1. Gegenstände der Welt in Foundry
2. zusätzliche Kompendien (Moduleinstellung „Zusätzliche Kompendien für NSC-Items“, z. B. `world.hausregeln`)
3. die dsa-41-Kompendien (Basis, dann Uthuria, Myranor, Dunkle Zeiten …)
4. eine [eigene Definition](#eigene-definitionen) im Block
5. sonst ein leeres Item plus Warnung

Beim Vergleich zählen Groß-/Kleinschreibung, Umlaute (`ä` = `ae`), Akzente, Satz- und Leerzeichen nicht: `Waffenloser Kampfstil: Mercenario` findet auch „Waffenloser Kampfstil (Mercenario)“. Der **Anfang** eines Namens reicht, wenn er mindestens 4 Zeichen hat und genau einen Eintrag trifft: `Gardianum` findet „Gardianum Zauberschild“ (Hinweis „als … erkannt“).

Für Rüstungen, Waffen und Schilde gilt zusätzlich: **Werte im Block überschreiben die des Kompendiums**, nicht angegebene bleiben, wie sie sind. Ein Name, den kein Kompendium kennt, wird mit den Werten aus dem Block als eigenes Item angelegt; ohne eigene Werte gibt es dazu eine Warnung.

### `rüstung` und `RS`

```yaml
rüstung: Lederharnisch                       # ein Stück
rüstung: [Lederharnisch, Lederhelm]          # mehrere
rüstung:
  - Lederharnisch
  - { name: Lederhelm, BE: 0 }               # Kompendium-Helm, BE überschrieben
  - { name: Lastgeschirr, RS: 0, BE: 2 }     # eigenes Teil, nur Behinderung
RS: 1                                        # Zusatz-RS, kommt zu den Rüstungen dazu
```

- Rüstungsteile werden angelegt und gelten als getragen. `RS` und `BE` sind ganze Zahlen ≥ 0, beide optional.
- **`RS`** auf oberster Ebene ist der **Zusatz-RS** des Bogens, zusätzlich zu dem, was die Rüstungen selbst mitbringen. Lederharnisch (RS 3) plus `RS: 1` ergibt Gesamt-RS 4. Ohne Rüstung ist das der natürliche Rüstungsschutz (Schuppen, Fell). Soll der NSC nur den RS seiner Rüstung haben, `RS` weglassen.
- Eine Behinderung ohne Rüstung gibt es im System nicht; dafür ein Teil mit `RS: 0` und der gewünschten `BE` anlegen (Lastgeschirr oben).

**Zonenrüstung.** Statt einer Zahl kann `RS` die Zonen einzeln nennen; nicht genannte Zonen haben 0:

```yaml
rüstung:
  - { name: Kettenhemd, RS: { Kopf: 0, Brust: 4, Rücken: 4, Bauch: 4, Arme: 3, Beine: 1 }, BE: 3 }
  - { name: Topfhelm, RS: { Kopf: 4 } }
```

| Zone | Schreibweisen |
|---|---|
| Kopf, Brust, Bauch | `Kopf`, `Brust`, `Bauch` |
| Rücken | `Rücken`, `Ruecken` |
| linker / rechter Arm | `LA`, `linker Arm`, `Arm links` / `RA`, `rechter Arm`, `Arm rechts` |
| linkes / rechtes Bein | `LB`, `linkes Bein`, `Bein links` / `RB`, `rechtes Bein`, `Bein rechts` |
| beide Arme / Beine | `Arme` / `Beine` |

Jede Zone nur einmal (nicht `Arme` und `LA` zusammen). Beide Rüstungssysteme von dsa-41 bekommen passende Werte: Im Zonensystem steht eine einzelne Zahl auf allen Zonen; im einfachen System wird aus Zonen der Gesamt-RS wie im System gerechnet (Kopf ×2, Brust/Rücken/Bauch ×4, Arme ×1, Beine ×2, Summe durch 20, gerundet). Der Topfhelm oben hat so RS 0.

### `waffen`

`waffen` ist eine Liste. Ein Eintrag ist ein Name oder ein `{ … }` mit Schlüsseln:

```yaml
waffen:
  - Säbel                                                   # aus dem Kompendium, AT/PA aus dem TaW
  - { name: Orchidee, AT: 17, PA: 15 }                      # feste Werte
  - { name: Säbel, talent: Schwerter }                      # anderes Kampftalent
  - { name: Kurzbogen, FK: 14 }                             # Fernkampf
  - { name: Mandragora-Dolch, talent: Dolche, TP: 1W+1, WM: 0/-1 }   # eigene Waffe
```

Oder als Zuordnung Name → Werte, dann ohne `-` und ohne `name:`:

```yaml
waffen:
  Säbel:
  Orchidee: { AT: 17, PA: 15 }
```

Die Mischform `- Säbel: { AT: 14 }` geht nicht (Fehler „unbekannter Schlüssel Säbel“).

| Schlüssel | Bedeutung | Schreibweisen | gilt für |
|---|---|---|---|
| `name` | Name der Waffe | Text, **Pflicht** | alle |
| `talent` | Kampftalent | `Dolche`, `Säbel`, `Bogen` … | alle |
| `AT`, `PA` | Attacke- und Paradewert, wie sie auf dem Bogen stehen sollen | Zahl | Nahkampf |
| `FK` | Fernkampfwert | Zahl | Fernkampf |
| `TP` | Trefferpunkte | `1W6+3`, `1W+4` (= 1W6+4), `2W6`, `W6-1`, `2W20` | alle |
| `DK` | Distanzklassen | `H`, `N`, `S`, `P`, auch kombiniert `NS`, `HN` | Nahkampf |
| `INI` | INI, die mit dieser Waffe herauskommen soll | Zahl | Nahkampf |
| `WM` | Waffenmodifikator AT/PA | `0/-1`, `[0, -1]`, `{ AT: 0, PA: -1 }`, oder `-1` (= beide) | Nahkampf |
| `KK` | TP/KK: Schwelle/Schritt | `13/3`, `[13, 3]` | Nahkampf |
| `BF` | Bruchfaktor | Zahl | Nahkampf |
| `RW` | Reichweiten und TP-Zuschlag | `(5/15/25/40/60) --> (1/1/0/0/-1)` oder `[[5, 1], [15, 1], [25, 0], [40, 0], [60, -1]]` | Fernkampf |

`RW` nennt für die fünf Entfernungsklassen (sehr nah, nah, mittel, weit, sehr weit) die Reichweite in Schritt und den TP-Zuschlag. Schlüssel, die nicht zur Waffenart passen, werden ignoriert.

**Welche Waffe wird angelegt?**

- Bekannter Name: die Kompendiumswaffe. Gibt es sie mit mehreren Kampftalenten (Säbel: Säbel oder Schwerter), entscheidet `talent:`, sonst das Talent, das so heißt wie die Waffe, sonst das Basis-Kompendium.
- Unbekannter Name: eine eigene Waffe. Mit `FK` oder `RW` wird sie Fernkampfwaffe, sonst Nahkampfwaffe. Ohne `talent` bekommt sie Raufen (Warnung), ohne `TP` `1W6`, ohne `DK` `N`.
- Die **erste Nahkampfwaffe** des Blocks kommt beim neuen Charakter in die Haupthand.

**AT/PA/FK.** Zwei Wege:

- *Empfohlen:* nur die Waffe nennen und den TaW unter `talente` eintragen. Das System rechnet AT/PA; der TaW wird verteilt, AT bekommt die größere Hälfte (TaW 15 → AT +8, PA +7). Fernkampftalente geben den ganzen TaW auf FK.

  ```yaml
  waffen: [Säbel]
  talente: { Säbel: 15 }
  ```

- *Feste Werte:* `AT`/`PA`/`FK` an der Waffe stehen genau so auf dem Bogen. Die erste Waffe eines Kampftalents legt die Verteilung des Talents fest; weitere Waffen mit demselben Talent bekommen die Differenz als Waffenmodifikator (ein widersprechender `WM` wird überschrieben, mit Warnung). `INI` an der Waffe wird als INI-Modifikator der Waffe eingetragen.

### `schilde`

Schilde und Parierwaffen sind in dsa-41 ein Item-Typ und stehen deshalb zusammen unter `schilde` (auch `schild`). Welches was ist, weiß das Kompendium:

```yaml
schilde: [Großschild, Linkhand]                        # Schild und Parierwaffe
schilde:
  - { name: Großschild, WM: -2/5, INI: -2, BF: 2 }     # eigene Werte
  - { name: Buckler, typ: Schild }                     # Kategorie überschreiben
  - { name: Knochenhaken, typ: Parierwaffe, WM: -1/2 } # eigene Parierwaffe
```

| Schlüssel | Bedeutung | Schreibweisen |
|---|---|---|
| `name` | Name | Text, **Pflicht** |
| `typ` (auch `art`) | Schild oder Parierwaffe | `Schild`, `S`, `Parierwaffe`, `P` |
| `WM` | Waffenmodifikator AT/PA | `-2/5`, `[-2, 5]`, `{ AT: -2, PA: 5 }`, eine Zahl (= beide) |
| `INI` | INI-Modifikator des Schilds | Zahl, auch negativ |
| `BF` | Bruchfaktor | Zahl |

- Ein unbekannter Name wird ein **Schild**. Eine eigene Parierwaffe braucht `typ: Parierwaffe`.
- Anders als bei Waffen ist `INI` ein Modifikator, kein Zielwert, und es gibt keine feste `PA`: Die Schild-PA rechnet das System. **Schild:** PA-Basis + WM(PA), dazu +1 mit Linkhand, +3 mit Schildkampf I, +5 mit Schildkampf II; WM(AT) senkt die Attacke der Hauptwaffe. **Parierwaffe:** PA der Hauptwaffe + WM(PA), dazu −4 mit Linkhand, −1 mit Parierwaffen I, +2 mit Parierwaffen II. Ohne eine dieser drei Sonderfertigkeiten verrechnet das System die Parierwaffe nicht (Warnung).
- Das **erste** Schild bzw. die erste Parierwaffe kommt in die Nebenhand.

### `talente`, `zauber`, `liturgien`, `vorteile`, `nachteile`, `sonderfertigkeiten`

| Schlüssel | Wert heißt | enthält |
|---|---|---|
| `talente` | TaW | Talente, Kampftalente, Sprachen, Schriften |
| `zauber` | ZfW | Zauber (ohne ZfW: Warnung) |
| `liturgien` | – | Liturgien |
| `vorteile`, `nachteile` | Stufe/Wert, optional | Vorteile, Nachteile |
| `sonderfertigkeiten` (auch `SF`) | – | Sonderfertigkeiten |

Alle sechs verstehen dieselben Schreibweisen:

```yaml
talente: { Säbel: 18, Sinnenschärfe: 10, Klettern: }   # Zuordnung Name → Wert; leer = ohne Wert
sonderfertigkeiten: [Finte, Ausweichen I, Wuchtschlag]  # Liste von Namen
nachteile: [Neid 8, Goldgier 5]                         # Liste „Name Zahl“
talente:                                                # Liste von Einzel-Zuordnungen
  - Sinnenschärfe: 7
  - Klettern: 5
vorteile: Flink, Zäher Hund                             # Text mit Kommas
```

- Die Form „Name Zahl“ gilt nicht für `sonderfertigkeiten` und `liturgien`: Dort gehört eine Zahl am Ende zum Namen. Römische Ziffern (`Ausweichen I`) sind überall Teil des Namens.
- **Kampftalente** (`Säbel`, `Dolche`, `Raufen`, `Bogen` …) stehen unter `talente`; ihr TaW ergibt AT/PA der Waffen, siehe [`waffen`](#waffen).
- **Sprachen und Schriften** stehen ebenfalls unter `talente`: `{ Garethi: 12, Kusliker Zeichen: 6 }`. Gibt es einen Namen als Sprache *und* als Schrift (Altes Kemi, Angram, Rogolan, Tulamidya, Urtulamidya, Wudu, Zhayad), kommt `(Sprache)` oder `(Schrift)` dahinter: `{ Zhayad(Sprache): 8, Zhayad(Schrift): 5 }`. Ohne Zusatz gilt die Sprache, mit Warnung.
- **Vorteile und Nachteile mit Wert** (`Neid 8`, `Flink 1`) bekommen diesen Wert; `Flink` mit Wert zählt bei GS entsprechend mehrfach.

### Eigene Definitionen

Steht ein Eintrag in keinem Kompendium (Hausregel, Kreaturfähigkeit), kann man ihn im Block definieren. Statt eines Namens mit Wert steht dann ein `{ … }` mit Unterschlüsseln:

```yaml
talente:
  Sternkunde: { TaW: 8, probe: KL/KL/IN, kategorie: Wissen }
zauber:
  Schattenschleier: { ZfW: 12, probe: MU/IN/CH, kosten: 8 AsP, reichweite: selbst, zauberdauer: 2 Aktionen, wirkungsdauer: ZfP* SR, wirkung: Der Zaubernde verschwimmt im Schatten. }
liturgien:
  Segen der Schlange: { grad: 2, wirkung: … }
vorteile:
  Nachtsicht: { wert: 1, beschreibung: Sieht im Dunkeln wie am Tag. }
nachteile:
  Lichtscheu: { wert: 5 }
sonderfertigkeiten:
  - { Schattenkampf: { typ: Kampf, beschreibung: Keine Abzüge durch Dunkelheit. } }
```

| Liste | Unterschlüssel |
|---|---|
| `talente` | `TaW` (oder `wert`), `probe`, `kategorie`, `beschreibung` |
| `zauber` | `ZfW` (oder `wert`), `probe`, `kosten`, `reichweite`, `zauberdauer`, `wirkungsdauer`, `wirkung`, `beschreibung` |
| `liturgien` | `grad`, `wirkung`, `beschreibung` |
| `vorteile`, `nachteile` | `wert`, `beschreibung` |
| `sonderfertigkeiten` | `typ`, `beschreibung` |

- **`probe`**: drei Eigenschaften, getrennt durch `/`, `,` oder Leerzeichen, oder als Liste: `KL/KL/IN`, `[KL, KL, IN]`.
- **`kategorie`** (Talente): `Körper`, `Gesellschaft`, `Natur`, `Wissen`, `Handwerk`, `Gabe`. Standard Wissen.
- **`typ`** (Sonderfertigkeiten): `allgemein`, `Kampf`, `waffenlos`, `Nahkampf`, `Fernkampf`, `magisch`, `Ritual`, `karmal`. Standard allgemein.
- Alle übrigen Unterschlüssel landen als Text in der Beschreibung des Items.

In Foundry wird vor dem Anlegen noch in den Welt-Gegenständen und zusätzlichen Kompendien nachgesehen; gibt es den Namen dort, wird dieses Item genommen.

### Mehrere NSCs, Links auf NSCs

- Beliebig viele `dsa-nsc`-Blöcke pro Notiz; jeder wird ein eigener Charakter. Zwei Blöcke mit gleichem Namen werden zwei Charaktere („Name“, „Name #2“); besser eindeutige Namen verwenden.
- `[[Notiz#Name]]` (in derselben Notiz `[[#Name]]`) verlinkt den Charakter direkt, auch ohne Überschrift dieses Namens.
- `![[Notiz#Abschnitt]]` mit einem Block darin zeigt den Wertekasten auch in der einbettenden Notiz.
- Im Journal steht an der Stelle des Blocks der Wertekasten mit dem Link „Zum Charakter“.

---

## Szene: `szene`

Der Befehl **„Szenen-Vorlage einfügen“** setzt diese Vorlage ein (Cursor hinter `karte:`):

~~~markdown
```szene
name:
karte:
# leaflet: <id>   # statt karte: eine Leaflet-Karte mit Markern
raster: { typ: quadrat, größe: 100, schritt: 1 }
nscs: []
licht: tag
nebel: nein
navigation: ja
```
~~~

Die Notiz, in der der Block steht, wird das verknüpfte Journal der Szene.

### Alle Schlüssel

| Schlüssel | Kurzform | Wert | ohne Angabe |
|---|---|---|---|
| `name` | | Text | Name der Notiz |
| `karte` | `bild` | Bild aus der Vault | – |
| `leaflet` | | `id` eines Leaflet-Blocks | – |
| `raster` | | `{ typ, größe, schritt, einheit }` oder `keins` | Quadrat, 100 px = 1 Schritt; bei `leaflet` keins |
| `nscs` | `tokens` | Link oder Liste von Links | keine |
| `licht` | | `tag`, `nacht`, `dunkel` | `tag` |
| `nebel` | | ja/nein | `nein` |
| `navigation` | | ja/nein | `ja` |

Genau **eins** von `karte` und `leaflet` ist Pflicht. Ja/Nein-Werte: `ja`, `nein`, `an`, `aus`, `true`, `false`.

### `karte` oder `leaflet`

```yaml
karte: "[[deck.webp]]"        # Wikilink
karte: deck.webp              # Dateiname
karte: Karten/Schiff/deck.webp
```

Die Datei wird wie ein Obsidian-Link gesucht. Die Maße der Szene kommen aus dem Bild, bei jedem Übernehmen neu. Wird das Bild nicht gefunden, wird die Szene nicht angelegt (Fehler).

```yaml
leaflet: süd-map              # id aus einem ```leaflet-Block, siehe unten
```

### `raster`

```yaml
raster: { typ: quadrat, größe: 100, schritt: 1 }
raster: { typ: hex, größe: 140, schritt: 2, einheit: Meter }
raster: keins
```

| Unterschlüssel | Kurzform | Werte | ohne Angabe |
|---|---|---|---|
| `typ` | | `quadrat`, `hex`, `keins` | `quadrat` |
| `größe` | `groesse`, `pixel` | Pixel pro Feld, 50 bis 1000 | `100` |
| `schritt` | | Entfernung pro Feld, Kommazahl erlaubt (`1.5`) | `1` |
| `einheit` | | Text | `Schritt` |

`größe` muss zur Karte passen: Hat die Karte Felder von 70 px, dann `größe: 70`.

### `nscs`

NSCs, die beim **ersten** Anlegen der Szene als versteckte Tokens am oberen Rand platziert werden. Danach fasst das Plugin die Tokens nicht mehr an; verschieben, aufdecken und löschen in Foundry bleibt erhalten.

```yaml
nscs: "[[#Die Viper]]"                                   # einer
nscs: ["[[#Die Viper]]", "[[Hinterhalt#Vollstrecker]]"]  # mehrere
nscs:
  - "[[#Die Viper]]"
  - "[[Hinterhalt#Vollstrecker]]"
  - "[[Mannschaft]]"
```

| Link | setzt |
|---|---|
| `[[#Name]]` | den NSC „Name“ aus dieser Notiz |
| `[[Notiz#Name]]` | den NSC „Name“ aus einer anderen Notiz |
| `[[Notiz]]` | alle NSCs der Notiz |
| `[[Notiz\|Alias]]` | wie ohne Alias |

Jeder Eintrag muss ein `[[…]]`-Link in Anführungszeichen sein. Ein Link ohne passenden Block gibt eine Warnung, die Szene wird trotzdem angelegt. Derselbe NSC wird nur einmal gesetzt.

### `licht`, `nebel`, `navigation`

```yaml
licht: nacht       # tag | nacht | dunkel
nebel: ja
navigation: nein
```

- **`licht`**: `tag` ist hell (globales Licht), `nacht` ist Dunkelheit 0,7 ohne globales Licht, `dunkel` ist Dunkelheit 1, es zählen nur Lichtquellen und Sicht.
- **`nebel`**: Sicht der Tokens und Nebel des Krieges an oder aus.
- **`navigation`**: ob die Szene in der Szenenleiste oben erscheint.

### Leaflet-Karten und Pins

Eine Karte des Obsidian-Leaflet-Plugins wird nur dann Szene, wenn ein `szene`-Block sie über ihre `id` nennt. Der Leaflet-Block darf in einer anderen Notiz stehen.

~~~markdown
```leaflet
id: süd-map
image: [[Südaventurien.png]]
maxZoom: 10
```

```szene
name: Reise nach Süden
leaflet: süd-map
```
~~~

- Bild der Szene ist das erste Bild unter `image:`.
- **Marker** mit Link auf eine exportierte Notiz werden Kartennotizen (Pins), die das Journal öffnen. Marker ohne Link oder auf eine nicht exportierte Notiz werden übersprungen (Hinweis). Die Position wird über `maxZoom` umgerechnet; Karten mit eigenem `bounds:` bekommen deshalb keine Pins.
- Pins werden bei jedem Übernehmen aktualisiert; von Hand in Foundry gesetzte Pins bleiben.

### Mehrere Szenen, Links auf Szenen

- Beliebig viele `szene`-Blöcke pro Notiz. Ohne `name:` heißt die Szene wie die Notiz; mehrere namenlose heißen „Notiz“, „Notiz 2“ …
- `[[Notiz#Szenenname]]` verlinkt die Szene direkt (nur mit `name:`).
- Das frühere Frontmatter `foundry: typ: szene` wird nicht mehr verwendet; die Notiz wird dann nur als Journal exportiert (Hinweis).

---

## Vollständige Beispiele

### Kämpfer, nur Kompendiumswerte

~~~markdown
```dsa-nsc
name: Alrik Söldner
rolle: Söldner
rasse: Mittelländer
kultur: Mittelländische Landbevölkerung
eigenschaften: { MU: 13, KL: 10, IN: 12, CH: 10, FF: 11, GE: 13, KO: 14, KK: 14 }
LeP: 34
AuP: 32
rüstung: [Kettenhemd, Lederhelm]
waffen: [Breitschwert, Schwerer Dolch]
schilde: [Holzschild]
talente: { Schwerter: 12, Dolche: 8, Raufen: 9, Ringen: 7, Zechen: 10, Sinnenschärfe: 6 }
sonderfertigkeiten: [Finte, Wuchtschlag, Rüstungsgewöhnung I]
nachteile: [Goldgier 5]
```
~~~

### Magierin mit festen Kampfwerten und eigenem Zauber

~~~markdown
```dsa-nsc
name: Shahane ay Zedrakin
rolle: Proviantmeisterin
bild: "[[Shahane.webp]]"
eigenschaften: { MU: 14, KL: 14, IN: 15, CH: 13, FF: 12, GE: 13, KO: 13, KK: 11 }
SO: 6
LeP: 36
AuP: 34
AsP: 28
MR: 6
INI: 12+1W6
waffen:
  - { name: Orchidee, AT: 17, PA: 15 }
  - { name: Mandragora-Dolch, talent: Dolche, TP: 1W+1, WM: 0/-1 }
talente: { Säbel: 18, Dolche: 10, Sinnenschärfe: 10, Menschenkenntnis: 12 }
zauber:
  Blitz dich find: 16
  Gardianum: 12
  Schattenschleier: { ZfW: 12, probe: MU/IN/CH, kosten: 8 AsP, wirkung: Verschwimmt im Schatten. }
vorteile: [Soziale Anpassungsfähigkeit]
nachteile: { Neid: 8 }
SF: [Finte, Ausweichen I]
notiz: Hat eine Schwäche für Glücksspiel.
```
~~~

### Kreatur mit natürlichem RS und Fernkampfangriff

~~~markdown
```dsa-nsc
name: Höhlenspinne
eigenschaften: { MU: 15, KL: 3, IN: 12, CH: 2, FF: 8, GE: 14, KO: 12, KK: 10 }
LeP: 25
RS: 2
MR: 4
GS: 10
waffen:
  - { name: Biss, talent: Raufen, TP: 1W+2, AT: 12, PA: 0 }
  - { name: Netzschuss, talent: Wurfmesser, FK: 10, TP: 1W, RW: (2/4/6/8/10) --> (0/0/0/0/0) }
sonderfertigkeiten:
  - { Gift: { typ: Kampf, beschreibung: "Biss: 1W6 SP Gift, Stufe 4." } }
```
~~~

### Szene mit Karte und NSCs

~~~markdown
```szene
name: Sabotage an Deck
karte: "[[deck.webp]]"
raster: { typ: quadrat, größe: 70, schritt: 1 }
nscs: ["[[#Die Viper]]", "[[Hinterhalt#Vollstrecker]]"]
licht: nacht
nebel: ja
```
~~~

---

## Häufige Fehler

| Geschrieben | Problem | Richtig |
|---|---|---|
| `nscs: [[#Die Viper]]` | `#` beginnt einen YAML-Kommentar | `nscs: "[[#Die Viper]]"` |
| `talente: {Säbel:12}` | YAML braucht ein Leerzeichen nach `:` | `talente: { Säbel: 12 }` |
| `eigenschaften: MU 14, KL 12` | keine Zuordnung | `eigenschaften: { MU: 14, KL: 12 }` |
| `waffen: Säbel, Dolch` | `waffen` muss eine Liste sein | `waffen: [Säbel, Dolch]` |
| `- Säbel: { AT: 14 }` unter `waffen` | Mischform aus Liste und Zuordnung | `- { name: Säbel, AT: 14 }` |
| `LeP: 30` und `LE: 30` | derselbe Schlüssel zweimal | nur einer von beiden |
| `MR: 6.5` | keine ganze Zahl | `MR: 6` |
| `MR: 8` und `MR-Mod: 2` | bei fester MR wirkt kein Modifikator | `MR: 10` oder `MR` weglassen |
| `rasse: Zwerg` | mehrere Zwergenrassen, nicht eindeutig | `rasse: Ambosszwerge` |
| `liturgien: [Bannfluch 3]` | die Zahl gehört zum Namen | `liturgien: { Bannfluch: { grad: 3 } }` |
| `bild: [[a.png]], [[b.png]]` | nur ein Bild erlaubt | `bild: "[[a.png]]"` |
| Einrückung mit Tabs | YAML erlaubt keine Tabs | Leerzeichen |
| `karte:` und `leaflet:` beide gesetzt | nur eins erlaubt | eins entfernen |
| `raster: { größe: 30 }` | unter 50 px | 50 bis 1000 |
