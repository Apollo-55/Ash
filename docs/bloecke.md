# Blöcke: Nachschlagewerk

Alles, was in einem `dsa-nsc`- oder `szene`-Block stehen darf: jeder Schlüssel, jede Abkürzung, jede erlaubte Schreibweise, Standardwerte und was daraus in Foundry wird. Den Überblick mit je einem Beispiel gibt die [README](../README.md#notation); diese Seite ist zum Nachschlagen.

## Inhalt

1. [Grundregeln für alle Blöcke](#grundregeln-für-alle-blöcke)
2. [`dsa-nsc` – Nichtspielercharaktere](#dsa-nsc--nichtspielercharaktere)
   - [Alle Schlüssel auf einen Blick](#alle-schlüssel-auf-einen-blick)
   - [Name, Rolle, Notiz](#name-rolle-notiz)
   - [Bilder: `bild`, `token`](#bilder-bild-token)
   - [`verknüpft`](#verknüpft)
   - [Eigenschaften](#eigenschaften)
   - [Energien und Sozialstatus](#energien-und-sozialstatus)
   - [Berechnete Werte: MR, INI, GS, WS, Ausweichen](#berechnete-werte-mr-ini-gs-ws-ausweichen)
   - [Rüstung und RS](#rüstung-und-rs)
   - [Waffen](#waffen)
   - [Listen: Talente, Zauber, Liturgien, Vorteile, Nachteile, Sonderfertigkeiten](#listen-talente-zauber-liturgien-vorteile-nachteile-sonderfertigkeiten)
   - [Eigene Definitionen](#eigene-definitionen)
   - [Wie Namen gefunden werden](#wie-namen-gefunden-werden)
   - [Prüfungen und Meldungen](#prüfungen-und-meldungen)
   - [Mehrere NSCs in einer Notiz, Links auf NSCs](#mehrere-nscs-in-einer-notiz-links-auf-nscs)
3. [`szene` – Szenen](#szene--szenen)
   - [Alle Schlüssel auf einen Blick](#alle-schlüssel-auf-einen-blick-1)
   - [Karte: `karte` oder `leaflet`](#karte-karte-oder-leaflet)
   - [`raster`](#raster)
   - [`nscs`](#nscs)
   - [`licht`, `nebel`, `navigation`](#licht-nebel-navigation)
   - [Leaflet-Karten und Pins](#leaflet-karten-und-pins)
   - [Mehrere Szenen in einer Notiz, Links auf Szenen](#mehrere-szenen-in-einer-notiz-links-auf-szenen)
4. [Vollständige Beispiele](#vollständige-beispiele)
5. [Häufige Fehler](#häufige-fehler)

---

## Grundregeln für alle Blöcke

- Ein Block ist ein Codeblock mit der Sprache `dsa-nsc` bzw. `szene`. Drei (oder mehr) Backticks oder Tilden gehen beide:

  ~~~markdown
  ```dsa-nsc
  name: Alrik
  ```
  ~~~

- Der Inhalt ist **YAML**: eine Zeile pro Schlüssel, `schlüssel: wert`. Groß-/Kleinschreibung der Schlüssel ist egal (`LeP`, `lep`, `LEP` sind gleich). Werte wie Namen behalten ihre Schreibweise.
- Kommentare mit `#` (mit Leerzeichen davor) sind erlaubt: `MR: 6   # fest`.
- Jeder Schlüssel darf **nur einmal** vorkommen – auch nicht zusätzlich als Abkürzung (`LeP` und `LE` zusammen ist ein Fehler).
- Leere Werte (`rolle:` ohne etwas dahinter) zählen als „nicht angegeben“.
- Unbekannte Schlüssel sind ein **Fehler**; der Block zeigt, was erlaubt ist oder was gemeint sein könnte.
- **Listen** kann man in zwei YAML-Formen schreiben, beide sind gleichwertig:

  ```yaml
  vorteile: [Flink, Zäher Hund]          # in einer Zeile
  vorteile:                              # untereinander
    - Flink
    - Zäher Hund
  ```

  Ebenso **Zuordnungen** (Name → Wert):

  ```yaml
  talente: { Säbel: 12, Klettern: 5 }    # in einer Zeile
  talente:                               # untereinander
    Säbel: 12
    Klettern: 5
  ```

- **Anführungszeichen** braucht man, wenn ein Wert mit `#`, `[`, `{`, `*`, `&`, `!`, `|`, `>`, `%` oder `@` beginnt oder `: ` bzw. ` #` enthält. Im Zweifel: `"…"`. Wichtigster Fall: Links wie `"[[#Die Viper]]"`.
- **Ganze Zahlen** dürfen auch als Text mit Vorzeichen stehen (`"+3"`, `-2`). Kommazahlen sind bei NSC-Werten nicht erlaubt.

Fehler (rot ✖) verhindern, dass der Block bzw. der betroffene Eintrag übernommen wird. Warnungen (orange ⚠) und Hinweise (ℹ) sind nur Information. Fehler und Warnungen erscheinen auch im Importbericht in Foundry, Hinweise nur in Obsidian.

---

## `dsa-nsc` – Nichtspielercharaktere

Gilt für das Spielsystem DSA 4.1 (Foundry-System `dsa-41`); es muss in den Plugin-Einstellungen unter „Inhalt → Spielsystem für NSC-Blöcke“ gewählt sein. Befehl **„NSC-Vorlage einfügen“** setzt diese Vorlage ein:

~~~markdown
```dsa-nsc
name:
rolle:
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

### Alle Schlüssel auf einen Blick

| Schlüssel | auch | Wert | Pflicht / Standard |
|---|---|---|---|
| `name` | – | Text | **Pflicht** |
| `rolle` | – | Text | → Profession |
| `bild` | – | Bild | sonst erstes Bild im Abschnitt |
| `token` | – | Bild | sonst erstes `token_…`-Bild, sonst `bild` |
| `verknüpft` | `verknuepft` | ja/nein | ja bei genau einem NSC in der Notiz, sonst nein |
| `eigenschaften` | – | `{ MU: 14, … }` | fehlende bleiben 0 |
| `MU` `KL` `IN` `CH` `FF` `GE` `KO` `KK` | – | Zahl | einzeln statt `eigenschaften` |
| `SO` | – | Zahl | Sozialstatus |
| `LeP` | `LE` | Zahl | Lebensenergie (Maximum) |
| `AuP` | `AU` | Zahl | Ausdauer |
| `AsP` | `AE` | Zahl | Astralenergie, schaltet Magie-Reiter ein |
| `KaP` | `KE` | Zahl | Karmaenergie, schaltet Karma-Reiter ein |
| `MR` | – | Zahl | sonst gerechnet |
| `INI` | – | Zahl oder `12+1W6` | Basis-INI, sonst gerechnet |
| `GS` | – | Zahl | sonst gerechnet |
| `WS` | – | Zahl | Wundschwelle, sonst gerechnet |
| `ausweichen` | `AW` | Zahl | sonst gerechnet |
| `RS` | – | Zahl | Gesamt-RS |
| `rüstung` | `ruestung`, `rüstungen` | Name, `{ name, RS, BE }` (RS auch als Zonen) oder Liste davon | aus dem Kompendium, RS/BE überschreibbar |
| `waffen` | – | Liste | |
| `talente` | – | Liste / Zuordnung | inkl. Kampftalente, Sprachen, Schriften |
| `zauber` | – | Liste / Zuordnung | |
| `liturgien` | – | Liste / Zuordnung | |
| `vorteile` | – | Liste / Zuordnung | |
| `nachteile` | – | Liste / Zuordnung | |
| `sonderfertigkeiten` | `SF` | Liste / Zuordnung | |
| `notiz` | `notizen` | Text | → Biografie |

### Name, Rolle, Notiz

```yaml
name: Shahane ay Zedrakin
rolle: Proviantmeisterin
notiz: Hat eine Schwäche für Glücksspiel und schuldet dem Kapitän Geld.
```

- **`name`** ist der Name des Charakters in Foundry und zugleich seine Kennung: Ändert man den Namen, entsteht beim nächsten Übernehmen ein **neuer** Charakter, der alte erscheint als verwaist.
- **`rolle`** landet im Feld „Profession“.
- **`notiz`** landet in der Biografie, hinter einem automatisch erzeugten Link „Quelle: <Notiz>“ auf das Journal. Für mehrere Zeilen YAML-Blocktext verwenden:

  ```yaml
  notiz: |
    Erste Zeile.
    Zweite Zeile.
  ```

### Bilder: `bild`, `token`

```yaml
bild: portrait.jpg                 # Dateiname
bild: "[[Shahane.webp]]"          # Wikilink (Anführungszeichen!)
bild: Bilder/NSC/Shahane.webp      # Pfad
bild: https://example.org/s.png    # Webbild, wird direkt verwendet
token: token_Shahane.png
```

Die Datei wird wie ein Obsidian-Link aufgelöst (Dateiname genügt). Wird sie nicht gefunden, gibt es eine Warnung im Bericht.

**Ohne Angabe** sucht das Plugin im **Abschnitt** des Blocks nach eingebetteten Bildern (`![[…]]` oder `![](…)`):

- Abschnitt = beim ersten Block vom Anfang der Notiz, sonst ab dem Block selbst, jeweils bis zum nächsten `dsa-nsc`-Block.
- **Porträt** = erstes Bild, dessen Dateiname *nicht* mit `token_` oder `token-` beginnt.
- **Token** = erstes Bild, dessen Dateiname mit `token_` oder `token-` beginnt; sonst das Porträt.

### `verknüpft`

```yaml
verknüpft: ja      # ja | nein | true | false
```

Ob der Token mit dem Actor verknüpft ist (Schaden am Token = Schaden am Charakter). Standard: `ja`, wenn die Notiz genau einen gültigen NSC-Block hat, sonst `nein` (typisch für Gruppen wie „Vollstrecker“, bei denen mehrere Tokens unabhängig sein sollen).

### Eigenschaften

Gesammelt:

```yaml
eigenschaften: { MU: 14, KL: 14, IN: 15, CH: 13, FF: 12, GE: 13, KO: 13, KK: 11 }
```

oder einzeln auf oberster Ebene:

```yaml
MU: 14
KL: 14
KK: 11
```

- Erlaubt sind genau `MU KL IN CH FF GE KO KK` (Groß-/Kleinschreibung egal).
- Werte unter 0 oder über 30 erzeugen eine Warnung („Tippfehler?“).
- Fehlen einzelne Eigenschaften, bleiben sie 0 (Hinweis). Erst wenn **alle acht** angegeben sind, kann das Plugin abgeleitete Werte (MR, INI, AT-/PA-Basis …) zum Vergleich rechnen.
- Eine Eigenschaft nicht gleichzeitig in `eigenschaften` und einzeln angeben – der spätere Wert gewinnt.

### Energien und Sozialstatus

```yaml
LeP: 36       # oder LE
AuP: 34       # oder AU
AsP: 28       # oder AE
KaP: 24       # oder KE
SO: 6
```

- Angegeben wird das **Maximum**. Beim ersten Anlegen wird der aktuelle Wert gleich dem Maximum gesetzt; danach bleibt der aktuelle Wert in Foundry unberührt (Spielzustand).
- `AsP` schaltet beim Charakter Astralenergie und den Magie-Reiter ein, `KaP` Karmaenergie und den Karma-Reiter.

### Berechnete Werte: MR, INI, GS, WS, Ausweichen

Das System dsa-41 rechnet diese Werte selbst. **Ohne Angabe** bleibt die Berechnung an. **Mit Angabe** wird sie für genau diesen Wert abgeschaltet und der Wert fest eingetragen.

```yaml
MR: 6
INI: 12          # oder 12+1W6 – nur die 12 wird gespeichert, die Würfel kommen aus den Regeln
GS: 8
WS: 7            # Wundschwellen 7 / 14 / 21
ausweichen: 9    # oder AW
```

Der Wertekasten in Obsidian zeigt bei Abweichungen den gerechneten Wert daneben, z. B. „MR 6 (gerechnet 8)“. Gerechnet wird wie im System:

| Wert | Formel |
|---|---|
| AT-Basis | (MU + GE + KK) / 5 |
| PA-Basis | (IN + GE + KK) / 5 |
| FK-Basis | (IN + FF + KK) / 5 |
| INI | (MU + MU + IN + GE) / 5 |
| MR | (MU + KL + KO) / 5 |
| WS | KO / 2 |
| GS | 8; +1 bei GE ≥ 16, −1 bei GE ≤ 10; + Flink, − Behäbig/Kleinwüchsig/Lahm, −2 Zwergenwuchs |
| Ausweichen | PA-Basis; +3 je Ausweichen I/II/III; +1 Flink, −1 Behäbig; Akrobatik über 9: +1 je 3 Punkte |

(kaufmännisch gerundet; Behinderung ist nicht berücksichtigt)

### Rüstung und RS

```yaml
rüstung: Lederharnisch                       # ein Stück
rüstung: [Lederharnisch, Lederhelm]          # mehrere
rüstung:                                     # mit eigenen Werten
  - Lederharnisch
  - { name: Lastgeschirr, RS: 0, BE: 2 }     # nur Behinderung
  - { name: Lederhelm, BE: 0 }               # Kompendium-Rüstung, BE überschrieben
RS: 4
```

- Rüstungsteile werden aus dem Kompendium geholt und angelegt (angelegt = getragen).
- **Eigene Werte** wie bei Waffen: `{ name: …, RS: …, BE: … }` (ganze Zahlen ≥ 0, beide optional; `RS` auch als Zonen, siehe unten). Angegebene Werte überschreiben die des Kompendiums bzw. Welt-Gegenstands; nicht angegebene bleiben, wie sie sind. So lässt sich auch ein Rüstungsteil anlegen, das in keinem Kompendium steht – etwa eine reine Behinderung `{ name: Lastgeschirr, RS: 0, BE: 2 }`.
- **Zonenrüstung:** Statt einer Zahl kann `RS` die Zonen einzeln angeben. Nicht genannte Zonen haben RS 0.

  ```yaml
  rüstung:
    - { name: Kettenhemd, RS: { Kopf: 0, Brust: 4, Rücken: 4, Bauch: 4, Arme: 3, Beine: 1 }, BE: 3 }
    - { name: Topfhelm, RS: { Kopf: 4 } }
  ```

  | Zone | Schreibweisen | Gewicht |
  |---|---|---|
  | Kopf | `Kopf` | 2 |
  | Brust | `Brust` | 4 |
  | Rücken | `Rücken`, `Ruecken` | 4 |
  | Bauch | `Bauch` | 4 |
  | linker / rechter Arm | `LA`, `linker Arm`, `Arm links` / `RA`, `rechter Arm`, `Arm rechts` | je 1 |
  | linkes / rechtes Bein | `LB`, `linkes Bein`, `Bein links` / `RB`, `rechtes Bein`, `Bein rechts` | je 2 |
  | beide Arme / Beine | `Arme` / `Beine` | |

  Groß-/Kleinschreibung und Leerzeichen sind egal; jede Zone darf nur einmal vorkommen (also nicht `Arme` und `LA` zusammen).
- Beide Rüstungssysteme von dsa-41 (Welt-Einstellung „Rüstungssystem“) bekommen passende Werte:
  - **Zonen:** jede Zone ihren RS, die Zonen-BE die BE. Eine einzelne Zahl bei `RS` steht auf allen Zonen.
  - **Einfach:** RS und BE direkt. Aus Zonen wird der Gesamt-RS wie im System berechnet – Summe aus Zone × Gewicht, geteilt durch 20 – und kaufmännisch gerundet. Der Topfhelm oben hat damit RS 0 (4 · 2 / 20 = 0,4).
  - Bei einem anderen Zonenfaktor als 20 rechnet das System selbst um; der Import geht immer von 20 aus.
- **`RS`** ist der **Gesamt-RS**, den der NSC haben soll. Das Plugin zieht den RS der genannten Rüstungen ab (eigener `RS` vor Kompendium, bei Zonen der gerundete Gesamt-RS); der Rest wird als „Zusatz-RS“ eingetragen (nie negativ). Beispiel: Lederharnisch (RS 3) + `RS: 4` → Zusatz-RS 1.
- Nur `RS` ohne Rüstung = natürlicher Rüstungsschutz (z. B. Kreaturen mit Schuppen).
- Eine BE ohne Rüstung gibt es im System nicht als eigenes Feld – dafür ein Rüstungsteil mit `RS: 0` und der gewünschten `BE` anlegen.
- Unbekannte Rüstungen ohne `RS`/`BE`: Warnung; in Foundry wird in den Welt-Gegenständen gesucht, sonst ein Rüstungsteil ohne Werte (RS 0, BE 0) angelegt. Mit eigenen Werten gibt es keine Warnung.

### Waffen

`waffen` ist eine **Liste**. Jeder Eintrag ist entweder nur ein Name oder ein `{ … }` mit Schlüsseln:

```yaml
waffen:
  - Säbel                                                  # 1. nur der Name
  - { name: Orchidee, AT: 17, PA: 15 }                     # 2. feste Werte
  - { name: Säbel, talent: Schwerter }                     # 3. anderes Kampftalent
  - { name: Mandragora-Dolch, talent: Dolche, TP: 1W+1, WM: 0/-1 }   # 4. eigene Waffe
  - { name: Kurzbogen, FK: 14 }                            # 5. Fernkampf
```

Alternativ als Zuordnung Name → Werte (dann ohne `-` und ohne `name:`):

```yaml
waffen:
  Säbel:
  Orchidee: { AT: 17, PA: 15 }
```

> Nicht möglich ist die Mischform `- Säbel: { AT: 14 }` (Listenpunkt **und** Name als Schlüssel) – das gibt den Fehler „unbekannter Schlüssel „Säbel““.

#### Schlüssel einer Waffe

| Schlüssel | Bedeutung | Schreibweisen | gilt für |
|---|---|---|---|
| `name` | Name der Waffe | Text | **Pflicht** |
| `talent` | Kampftalent | Name aus dem Kompendium, z. B. `Dolche`, `Säbel`, `Bogen` | alle |
| `AT` | Attackewert, wie er auf dem Bogen stehen soll | Zahl | Nahkampf |
| `PA` | Paradewert | Zahl | Nahkampf |
| `FK` | Fernkampfwert | Zahl | Fernkampf |
| `TP` | Trefferpunkte | `1W6+3`, `1W+4` (= 1W6+4), `2W6`, `W6-1`, `2W20` | alle |
| `DK` | Distanzklasse(n) | Buchstaben `H`, `N`, `S`, `P`, auch kombiniert: `N`, `NS`, `HN` | Nahkampf |
| `INI` | INI, die mit dieser Waffe herauskommen soll | Zahl | Nahkampf |
| `WM` | Waffenmodifikator AT/PA | `0/-1`, `[0, -1]`, `{ AT: 0, PA: -1 }`, oder eine Zahl `-1` (= beide) | Nahkampf |
| `KK` | TP/KK: Schwelle/Schritt | `13/3`, `[13, 3]` | Nahkampf |
| `BF` | Bruchfaktor | Zahl | Nahkampf |
| `RW` | Reichweiten und TP+ | siehe unten | Fernkampf |

Schlüssel, die nicht zur Waffenart passen, werden ignoriert (mit Warnung, wenn die Waffe aus dem Kompendium bekannt ist).

**Reichweiten `RW`** – fünf Entfernungsklassen (sehr nah, nah, mittel, weit, sehr weit): Reichweite in Schritt und TP-Zuschlag je Klasse.

```yaml
RW: (5/15/25/40/60) --> (1/1/0/0/-1)
RW: [[5, 1], [15, 1], [25, 0], [40, 0], [60, -1]]   # gleichwertig
```

#### Welche Waffe wird genommen?

- Name gefunden (Kompendium der Welt, zusätzliche Kompendien, dsa-41-Kompendien) → die Waffe mit allen Kompendiumswerten. Angegebene `TP`, `DK`, `WM`, `KK`, `BF`, `RW` **überschreiben** nur diese Werte.
- Gibt es die Waffe mehrfach mit verschiedenen Kampftalenten (Säbel: Säbel oder Schwerter), gewinnt: `talent:` aus dem Block → das Talent, das so heißt wie die Waffe → die Basis-Kompendien.
- Name **nicht** gefunden → eigene Waffe. Ohne `talent:` gibt es eine Warnung und das Talent **Raufen**. Eine eigene Waffe mit `FK` oder `RW` wird Fernkampfwaffe, sonst Nahkampfwaffe. Ohne `TP` bekommt sie `1W6`, ohne `DK` die Distanzklasse `N`.
- Das zugehörige **Kampftalent** wird automatisch angelegt, falls es nicht unter `talente` steht (dann untrainiert).
- Die **erste Nahkampfwaffe** des Blocks ist beim neuen Charakter in der Hand.

#### AT/PA/FK – zwei Wege

**Normalfall (empfohlen):** nur die Waffe nennen und den TaW unter `talente` eintragen. Das System rechnet AT/PA selbst; das Plugin verteilt den TaW, AT bekommt die größere Hälfte (TaW 15 → AT +8, PA +7). Fernkampftalente bekommen den ganzen TaW auf FK.

```yaml
waffen: [Säbel]
talente: { Säbel: 15 }
```

**Feste Werte:** `AT`/`PA`/`FK` an der Waffe stehen genau so auf dem Bogen. Das Plugin rechnet dafür beim Übernehmen in Foundry die Talentverteilung zurück:

- Die **erste** Waffe eines Kampftalents legt die AT-/PA-Anteile des Talents fest (TaW = Summe).
- **Weitere** Waffen mit demselben Talent bekommen die Differenz als Waffenmodifikator. Steht dort zusätzlich ein `WM`, der nicht passt, gewinnen AT/PA (Warnung im Bericht).
- `INI` an einer Waffe wird als INI-Modifikator der Waffe eingetragen (Differenz zur Basis-INI).
- Behinderung (BE) aus Rüstungen zieht das System beim Wurf ab – nicht vorher abziehen.

### Listen: Talente, Zauber, Liturgien, Vorteile, Nachteile, Sonderfertigkeiten

| Schlüssel | Wert heißt | sucht in |
|---|---|---|
| `talente` | TaW | Talente, Kampftalente, Sprachen, Schriften |
| `zauber` | ZfW | Zauber |
| `liturgien` | – (Grad nur in eigener Definition) | Liturgien |
| `vorteile` | Stufe/Wert (optional) | Vorteile |
| `nachteile` | Stufe/Wert (optional) | Nachteile |
| `sonderfertigkeiten` / `SF` | – | Sonderfertigkeiten |

Alle sechs Listen verstehen dieselben Schreibweisen:

```yaml
# 1. Zuordnung Name → Wert (empfohlen für Talente und Zauber)
talente: { Säbel: 18, Sinnenschärfe: 10, Klettern: }   # leerer Wert = ohne Wert

# 2. Liste von Namen
sonderfertigkeiten: [Finte, Ausweichen I, Wuchtschlag]

# 3. Liste „Name Zahl“ – die Zahl am Ende wird der Wert
nachteile: [Neid 8, Goldgier 5]

# 4. Liste von Einzel-Zuordnungen
talente:
  - Sinnenschärfe: 7
  - Klettern: 5

# 5. ein Text mit Kommas
vorteile: Flink, Zäher Hund
nachteile: Neid 8, Jähzorn 6
```

Feinheiten:

- Die „Name Zahl“-Form (3 und 5) gilt **nicht** für `sonderfertigkeiten` und `liturgien` – dort gehört eine Zahl am Ende zum Namen. `Ausweichen I` bleibt so oder so ein Name (römische Ziffern sind keine Zahl).
- Bei `zauber` ohne ZfW gibt es eine Warnung.
- Kampftalente (`Säbel`, `Dolche`, `Raufen`, `Bogen` …) stehen ebenfalls unter `talente`; ihr TaW wird wie oben beschrieben auf AT/PA verteilt.
- Vorteile/Nachteile mit Wert (`Neid 8`, `Flink 1`) bekommen diesen Wert; `Flink` mit Wert zählt bei GS entsprechend mehrfach.

### Eigene Definitionen

Gibt es einen Eintrag in keinem Kompendium (Hausregel, Kreaturfähigkeit), kann man ihn im Block selbst definieren. Dann wird **nicht** im Kompendium gesucht, sondern ein neues Item mit diesen Angaben angelegt (genauer: In Foundry wird erst in den Welt-Gegenständen und zusätzlichen Kompendien gesucht; nur wenn dort nichts ist, wird neu angelegt).

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

Erlaubte Unterschlüssel je Liste:

| Liste | Schlüssel |
|---|---|
| `talente` | `TaW` (oder `wert`), `probe`, `kategorie`, `beschreibung` |
| `zauber` | `ZfW` (oder `wert`), `probe`, `kosten`, `reichweite`, `zauberdauer`, `wirkungsdauer`, `wirkung`, `beschreibung` |
| `liturgien` | `grad`, `wirkung`, `beschreibung` |
| `vorteile`, `nachteile` | `wert`, `beschreibung` |
| `sonderfertigkeiten` | `typ`, `beschreibung` |

Werte:

- **`probe`**: drei Eigenschaften, getrennt durch `/`, `,` oder Leerzeichen, oder als Liste: `KL/KL/IN`, `KL, KL, IN`, `[KL, KL, IN]`.
- **`kategorie`** (Talente): `Körper` (auch `koerper`, `körperlich`, `physisch`), `Gesellschaft` (`gesellschaftlich`, `sozial`), `Natur`, `Wissen`, `Handwerk`, `Gabe` (`Gaben`). Standard: Wissen.
- **`typ`** (Sonderfertigkeiten): `allgemein`, `Kampf`, `waffenlos`, `Nahkampf`, `Fernkampf`, `magisch` (`Magie`), `Ritual`, `karmal` (`klerikal`, `Karma`). Standard: allgemein.
- `kosten`, `reichweite`, `zauberdauer`, `wirkungsdauer`, `wirkung`, `grad`, `beschreibung` erscheinen in der Beschreibung des Items.

### Wie Namen gefunden werden

Für jeden Namen (Rüstung, Waffe, Talent, Zauber …) gilt in Foundry diese Reihenfolge:

1. Gegenstände der Welt
2. zusätzliche Kompendien (Moduleinstellung „Zusätzliche Kompendien für NSC-Items“, z. B. `world.hausregeln`)
3. dsa-41-Kompendien: erst die Basis, dann Uthuria, dann Myranor/Dark Age/weitere
4. eigene Definition im Block
5. sonst ein leeres Item plus Warnung

Beim Vergleich zählen Groß-/Kleinschreibung, Umlaute (`ä` = `ae`), Akzente, Satz- und Leerzeichen nicht: `Waffenloser Kampfstil: Mercenario` findet auch `Waffenloser Kampfstil (Mercenario)`.

**Kurzformen:** Gibt es keinen exakten Treffer, genügt der **Anfang** eines Namens, wenn er genau einen Eintrag trifft und mindestens 4 Zeichen hat: `Gardianum` → „Gardianum Zauberschild“, `Blitz` → „Blitz dich find“ (Hinweis „als … erkannt“). Mehrdeutige Kurzformen werden nicht aufgelöst.

Bei Tippfehlern schlägt der Wertekasten ähnliche Namen vor („meintest du …?“).

### Prüfungen und Meldungen

| Meldung | Bedeutung |
|---|---|
| ✖ `„name“ fehlt` | ohne Namen kein Charakter |
| ✖ `Unbekannter Schlüssel „…“ – meintest du „…“?` | Tippfehler im Schlüssel |
| ✖ `„…“ kommt doppelt vor (auch als Abkürzung)` | z. B. `LeP` und `LE` |
| ✖ `… ist keine ganze Zahl` | z. B. `MR: sechs` oder `MR: 6.5` |
| ✖ `YAML-Fehler in Zeile …` | Einrückung, fehlende `]`/`}`, `#` ohne Anführungszeichen … |
| ⚠ `… steht in keinem dsa-41-Kompendium` | wird in Foundry in Welt-Gegenständen gesucht, sonst neu angelegt |
| ⚠ `Voraussetzung fehlt: Finte braucht GE 12` | Sonderfertigkeit ohne Voraussetzungen (Eigenschaften, Basiswerte, andere SF, TaW) |
| ⚠ `… ist ungewöhnlich (Tippfehler?)` | Eigenschaft unter 0 oder über 30 |
| ℹ `… als „…“ erkannt` | Kurzform aufgelöst |
| ℹ `Eigenschaften ohne Wert (bleiben auf 0)` | nicht alle acht angegeben |

Alle Blöcke einer Vault auf einmal prüfen: siehe `systems/dsa41/tools/pruefen.ts` in [docs/entwicklung.md](entwicklung.md).

### Mehrere NSCs in einer Notiz, Links auf NSCs

- Beliebig viele `dsa-nsc`-Blöcke pro Notiz; jeder wird ein eigener Charakter.
- Zwei Blöcke mit **gleichem Namen** in derselben Notiz werden zwei Charaktere (intern „Name“, „Name #2“) – besser eindeutige Namen verwenden.
- `[[Notiz#Name]]` (bzw. `[[#Name]]` in derselben Notiz) verlinkt direkt den Charakter, auch wenn es keine Überschrift mit diesem Namen gibt.
- `![[Notiz#Abschnitt]]` mit einem Block darin zeigt den Wertekasten auch in der einbettenden Notiz.
- Im Journal steht an der Stelle des Blocks der Wertekasten mit dem Link „Zum Charakter“.

---

## `szene` – Szenen

Befehl **„Szenen-Vorlage einfügen“** setzt diese Vorlage ein (Cursor hinter `karte:`):

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

### Alle Schlüssel auf einen Blick

| Schlüssel | auch | Wert | Standard |
|---|---|---|---|
| `name` | – | Text | Name der Notiz |
| `karte` | `bild` | Bild aus der Vault | – |
| `leaflet` | – | ID einer Leaflet-Karte | – |
| `raster` | – | `{ typ, größe, schritt, einheit }` oder `keins` | Quadrat 100 px = 1 Schritt (bei `karte`), kein Raster (bei `leaflet`) |
| `nscs` | `tokens` | Link oder Liste von Links | keine |
| `licht` | – | `tag`, `nacht`, `dunkel` | `tag` |
| `nebel` | – | ja/nein | `nein` |
| `navigation` | – | ja/nein | `ja` |

Genau **eins** von `karte` und `leaflet` ist Pflicht – beides oder keins ist ein Fehler, die Szene wird dann nicht angelegt.

### Karte: `karte` oder `leaflet`

```yaml
karte: "[[deck.webp]]"        # Wikilink (Anführungszeichen empfohlen)
karte: [[deck.webp]]          # geht auch ohne
karte: deck.webp              # nur Dateiname
karte: Karten/Schiff/deck.webp
```

Die Datei wird wie ein Obsidian-Link aufgelöst. Die Maße der Szene kommen aus dem Bild (bei jedem Übernehmen neu). Wird das Bild nicht gefunden, wird die Szene übersprungen (Fehler im Bericht).

```yaml
leaflet: süd-map              # die id: aus einem ```leaflet-Block
```

Siehe [Leaflet-Karten und Pins](#leaflet-karten-und-pins).

### `raster`

```yaml
raster: { typ: quadrat, größe: 100, schritt: 1 }
raster: { typ: hex, größe: 140, schritt: 2, einheit: Meter }
raster: keins
```

| Unterschlüssel | auch | Werte | Standard |
|---|---|---|---|
| `typ` | – | `quadrat` (`quadratisch`, `square`), `hex` (`hexagon`), `keins` (`kein`, `none`, `ohne`) | `quadrat` |
| `größe` | `groesse`, `pixel` | Pixel pro Feld, 50 bis 1000 | `100` |
| `schritt` | – | Entfernung pro Feld (positive Zahl, Kommazahl erlaubt: `1.5`) | `1` |
| `einheit` | – | Text | `Schritt` |

Nicht angegebene Unterschlüssel behalten den Standard. `größe` sollte zur Karte passen: Hat die Karte Felder von 70 px, dann `größe: 70`.

### `nscs`

Tokens, die beim **ersten** Anlegen der Szene versteckt am oberen Rand platziert werden. Danach fasst das Plugin Tokens nicht mehr an (verschieben, aufdecken, löschen in Foundry bleibt erhalten).

```yaml
nscs: "[[#Die Viper]]"                                   # ein NSC
nscs: ["[[#Die Viper]]", "[[Hinterhalt#Vollstrecker]]"]  # mehrere
nscs:
  - "[[#Die Viper]]"
  - "[[Hinterhalt#Vollstrecker]]"
  - "[[Mannschaft]]"
```

| Link | setzt |
|---|---|
| `[[#Name]]` | den Block „Name“ aus **dieser** Notiz |
| `[[Notiz#Name]]` | den Block „Name“ aus einer anderen Notiz |
| `[[Notiz]]` | **alle** NSC-Blöcke der Notiz (bei mehreren mit Hinweis) |
| `[[Notiz\|Alias]]` | Alias wird ignoriert |

- Links, die mit `#` beginnen, **müssen** in Anführungszeichen stehen, sonst liest YAML den Rest als Kommentar. Am einfachsten immer `"…"` verwenden.
- Jeder Eintrag muss ein `[[…]]`-Link sein.
- Findet sich kein passender Block, gibt es eine Warnung, die Szene wird trotzdem angelegt.
- Derselbe NSC wird nur einmal gesetzt, auch wenn er mehrfach verlinkt ist.

### `licht`, `nebel`, `navigation`

```yaml
licht: nacht       # tag | nacht | dunkel
nebel: ja          # Sicht der Tokens und Nebel des Krieges
navigation: nein   # nicht in der Szenenleiste oben
```

- `licht`: `tag` = hell (globales Licht, Dunkelheit 0), `nacht` = Dunkelheit 0,7 ohne globales Licht, `dunkel` = Dunkelheit 1 ohne globales Licht (nur Lichtquellen und Sicht).
- Ja/Nein-Werte: `ja`, `nein`, `an`, `aus`, `yes`, `no`, `true`, `false`.

### Leaflet-Karten und Pins

Eine Karte aus dem Obsidian-Leaflet-Plugin wird **nur** Szene, wenn ein `szene`-Block sie nennt:

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

- Der Leaflet-Block darf in einer anderen Notiz stehen; gefunden wird er über `id:`.
- Bild der Szene = erstes Bild unter `image:` (einzeln oder als Liste `- [[…]]`).
- Standard-Raster ist hier `keins`.
- **Marker** mit Link auf eine exportierte Notiz werden Kartennotizen (Pins), die das Journal öffnen. Marker ohne Link oder mit Link auf eine nicht exportierte Notiz werden übersprungen (Hinweis im Bericht). Die Position wird aus `maxZoom` umgerechnet.
- Leaflet-Karten mit eigenem `bounds:` bekommen keine Pins (Umrechnung nicht möglich).
- Pins werden bei jedem Übernehmen aktualisiert; von Hand in Foundry gesetzte Pins bleiben.

### Mehrere Szenen in einer Notiz, Links auf Szenen

- Beliebig viele `szene`-Blöcke pro Notiz.
- Ohne `name:` heißt die Szene wie die Notiz; mehrere namenlose Szenen heißen „Notiz“, „Notiz 2“ …
- `[[Notiz#Szenenname]]` verlinkt direkt die Szene (nur mit `name:`).
- Wie beim NSC: Wer den Namen ändert, erzeugt eine neue Szene; die alte erscheint als verwaist.
- Das frühere Frontmatter `foundry: typ: szene` wird nicht mehr verwendet; die Notiz wird dann nur als Journal exportiert (Hinweis im Bericht).

---

## Vollständige Beispiele

### Kämpfer, nur Kompendiumswerte

~~~markdown
```dsa-nsc
name: Alrik Söldner
rolle: Söldner
eigenschaften: { MU: 13, KL: 10, IN: 12, CH: 10, FF: 11, GE: 13, KO: 14, KK: 14 }
LeP: 34
AuP: 32
rüstung: [Kettenhemd, Lederhelm]
waffen: [Breitschwert, Schwerer Dolch]
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

### Kreatur mit natürlichem RS und Fernkampfwaffe

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
| `nscs: [[#Die Viper]]` | `#` startet einen YAML-Kommentar → YAML-Fehler | `nscs: "[[#Die Viper]]"` |
| `bild: [[a.png]], [[b.png]]` | nur ein Bild erlaubt | `bild: "[[a.png]]"` |
| `- Säbel: { AT: 14 }` unter `waffen` | Mischform | `- { name: Säbel, AT: 14 }` |
| `LeP: 30` und `LE: 30` | doppelt | nur einer von beiden |
| `MR: 6,5` / `MR: 6.5` | keine ganze Zahl | `MR: 6` |
| `liturgien: [Bannfluch 3]` | Zahl gehört zum Namen | `liturgien: { Bannfluch: { grad: 3 } }` |
| `waffen: Säbel, Dolch` | `waffen` muss eine Liste sein | `waffen: [Säbel, Dolch]` |
| `eigenschaften: MU 14, KL 12` | keine Zuordnung | `eigenschaften: { MU: 14, KL: 12 }` |
| `talente: {Säbel:12}` | YAML braucht Leerzeichen nach `:` | `talente: { Säbel: 12 }` |
| Einrückung mit Tabs | YAML erlaubt keine Tabs | Leerzeichen verwenden |
| `karte:` und `leaflet:` beide gesetzt | nur eins erlaubt | eins entfernen |
| `raster: { größe: 30 }` | unter 50 px | 50 bis 1000 |
| `name:` geändert | neuer Charakter/neue Szene, alter verwaist | Namen stabil halten oder Verwaistes im Bericht löschen |
