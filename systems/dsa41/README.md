# DSA 4.1 (Foundry-System `dsa-41`)

Unterstützung für das Foundry-System `dsa-41` in Vault to Foundry. Installation, Sync und allgemeine Bedienung stehen in der [Haupt-README](../../README.md); hier steht alles, was DSA-spezifisch ist.

## Inhalt

1. [Einrichten](#einrichten)
2. [NSCs: der `dsa-nsc`-Block](#nscs-der-dsa-nsc-block)
3. [Was beim erneuten Übernehmen passiert](#was-beim-erneuten-übernehmen-passiert)
4. [Grenzen](#grenzen)
5. [Aufbau im Code](#aufbau-im-code)

## Einrichten

- Foundry v13 mit dem System `dsa-41` (läuft nur dort) und seinen Kompendien.
- Obsidian: Einstellungen → Vault to Foundry → Inhalt → Spielsystem für NSC-Blöcke → **DSA 4.1**.
- Optional in Foundry (Moduleinstellungen): „Zusätzliche Kompendien für NSC-Items“, z. B. `world.hausregeln` für eigene Waffen, Zauber oder SF.

## NSCs: der `dsa-nsc`-Block

Alle Schlüssel und Schreibweisen zum Nachschlagen: [docs/dsa-nsc.md](docs/dsa-nsc.md).

Beliebig viele Blöcke pro Notiz. Befehl **„NSC-Vorlage einfügen“** setzt eine Vorlage ein. In Obsidian erscheint der Block als Wertekasten: Fehler rot, unbekannte Namen orange (mit Vorschlag), und bei Werten, die du selbst festlegst, steht daneben, was das System rechnen würde („MR 6 (gerechnet 8)“).

~~~markdown
```dsa-nsc
name: Shahane ay Zedrakin          # Pflicht, alles andere optional
rolle: Proviantmeisterin           # → Profession
rasse: Mittelländerin              # → Rasse aus dem Kompendium (bringt ihren MR-Modifikator mit); auch spezies
kultur: Mittelländische Städte     # → Kultur aus dem Kompendium (MR-Modifikator)
bild: portrait.jpg                 # sonst erstes Bild der Notiz
token: token_Shahane.png           # sonst erstes Bild „token_…“
verknüpft: ja                      # Token mit Actor verknüpft; Standard: ja bei einem Block pro Notiz
eigenschaften: { MU: 14, KL: 14, IN: 15, CH: 13, FF: 12, GE: 13, KO: 13, KK: 11 }
SO: 6
LeP: 36                            # auch LE; AuP/AU, AsP/AE, KaP/KE
MR: 6                              # MR, INI, GS, WS, ausweichen: angegeben = fest, sonst rechnet das System
MR-Mod: 1                          # Zusatz-MR von Hand; wirkt nur, wenn das System die MR rechnet (ohne MR:)
INI: 12+1W6                        # gespeichert wird 12, Würfel kommen aus den Regeln
rüstung: [Lederharnisch]           # aus dem Kompendium
RS: 1                              # Zusatz-RS zur Rüstung (z. B. natürlicher Rüstungsschutz)
waffen:
  - Säbel                          # Normalfall: AT/PA rechnet das System aus dem TaW
  - { name: Orchidee, AT: 17, PA: 15 }   # optional feste Werte
  - { name: Mandragora-Dolch, talent: Dolche, TP: 1W+1, WM: 0/-1 }   # eigene Waffe
schilde: [Großschild]              # auch Parierwaffen (Linkhand …); das erste kommt in die Nebenhand
talente: { Säbel: 18, Raufen: 19, Sinnenschärfe: 10, Sternkunde: { TaW: 8, probe: KL/KL/IN, kategorie: Wissen } }
zauber: { Blitz dich find: 16, Gardianum: 12, Schattenschleier: { ZfW: 12, probe: MU/IN/CH, kosten: 8 AsP, wirkung: … } }
liturgien: [Eidsegen, Wort der Wahrheit]
vorteile: [Soziale Anpassungsfähigkeit]
nachteile: { Neid: 8 }             # oder [Neid 8]
sonderfertigkeiten: [Finte, Ausweichen I, { Schattenkampf: { typ: Kampf, beschreibung: … } }]
notiz: Freitext für die Biografie
```
~~~

- **Woher die Items kommen** (je Name): Gegenstände der Welt → zusätzliche Kompendien (Moduleinstellung) → dsa-41-Kompendien (Basis, dann die übrigen) → eigene Definition im Block → sonst ein leeres Item plus Warnung. Eindeutige Kurzformen werden erkannt („Gardianum“ → „Gardianum Zauberschild“).
- **Waffenwerte:** `TP`, `DK`, `WM: 0/-1`, `KK: 13/3` (TP/KK: Schwelle/Schritt) `BF: 2` (Bruchfaktor) und `RW: (5/15/25/40/60) --> (1/1/0/0/-1)` (Reichweiten in Schritt und TP+ je Entfernungsklasse, sehr nah bis sehr weit) überschreiben den Wert aus dem Kompendium; `KK` und `BF` gelten nur für Nahkampfwaffen, `RW` nur für Fernkampfwaffen. Eine eigene Waffe mit `FK` oder `RW` wird als Fernkampfwaffe angelegt.
- **Schilde und Parierwaffen:** `schilde: [Großschild, Linkhand, { name: Buckler, typ: Schild, WM: 0/1 }]` – in dsa-41 derselbe Item-Typ, gemischt in einer Liste; `typ` (Schild/Parierwaffe) überschreibt die Kategorie des Kompendiums, unbekannte Namen sind ohne `typ` Schilde. Das erste kommt neben der ersten Nahkampfwaffe in die Nebenhand; die Schild-PA rechnet das System (Parierwaffen nur mit SF Linkhand/Parierwaffen I/II, sonst Warnung). `WM`, `INI` (Modifikator) und `BF` überschreiben die Kompendiumswerte.
- **Rasse, Kultur, MR:** `rasse` und `kultur` werden in den Rassen- und Kulturen-Kompendien gesucht (Geschlechtsformen wie „Mittelländer“ für „Mittelländer*in“ und Varianten wie „Ambosszwerge“ gehen auch) und als Item angelegt – das System rechnet ihren MR-Modifikator (Rasse auch INI) in die MR ein, solange `MR` nicht fest angegeben ist. `MR-Mod` ist der „Zusatz-MR“ des Bogens für alles Übrige. Der Wertekasten rechnet genauso („gerechnet …“).
- **Sprachen und Schriften** stehen unter `talente`: `{ Garethi: 12, Kusliker Zeichen: 6 }`. Gibt es einen Namen als Sprache und als Schrift (Altes Kemi, Angram, Rogolan, Tulamidya, Urtulamidya, Wudu, Zhayad), kommt `(Sprache)` oder `(Schrift)` dahinter: `{ Zhayad(Sprache): 8, Zhayad(Schrift): 5 }`. Ohne Zusatz gilt die Sprache, mit einer Warnung.
- **AT/PA:** Normalfall nur die Waffe und den TaW unter `talente` eintragen; das System verteilt den TaW (AT bekommt die größere Hälfte). Ohne TaW gilt das Kampftalent als untrainiert. Feste `AT`/`PA`/`FK` an der Waffe stehen genau so auf dem Bogen; weitere Waffen mit demselben Talent bekommen den Rest als Waffenmodifikator. BE aus Rüstungen zieht das System beim Wurf ab.
- Im Journal erscheint der Wertekasten mit „Zum Charakter“. `[[Notiz#Die Viper]]` verlinkt direkt den Charakter.

## Was beim erneuten Übernehmen passiert

| wird überschrieben | bleibt unberührt |
|---|---|
| Eigenschaften, Maximalwerte, feste Werte, Profession, Biografie, vom Import angelegte Items, Bild | aktuelle LeP/AuP/AsP/KaP, Wunden, Effekte, von Hand hinzugefügte Items |

## Grenzen

- Kreaturen sind normale Charaktere (`dsa-41` kennt keinen eigenen Typ).
- Nur Foundry v13 (`dsa-41` läuft nur dort).

## Aufbau im Code

| Ordner | Inhalt |
|---|---|
| `adapter/` | `dsa-nsc`-Block (`schema.ts`), Namenskatalog der dsa-41-Kompendien inkl. Rassen und Kulturen mit MR-/INI-Modifikatoren (`catalog.ts`, `catalog.json`), Regeln wie SF-Ketten und Energien (`rules.ts`, `derived.ts`), Wertekasten (`render.ts`), Actor-Daten für den Export (`actor.ts`), Kampf-Zielwerte in `BundleItem.extra` (`combat.ts`), Foundry-Teil des Imports (`foundry.ts`: Actor-Typ `character`, Kompendien-Reihenfolge, Item-Erkennung über `sid`, AT/PA aus dem Block) |
| `tools/` | `gen-catalog.mjs` (Namenskatalog neu erzeugen), `pruefen.ts` (alle `dsa-nsc`-Blöcke einer Vault prüfen) |

Weitere Dokumente: [docs/dsa-nsc.md](docs/dsa-nsc.md) (Nachschlagewerk: alle Schlüssel des `dsa-nsc`-Blocks, Beispiele, häufige Fehler), [docs/datenmodell.md](docs/datenmodell.md) (Datenmodell von `dsa-41`).

## Lizenz und Marken

Der Code steht unter der [MIT-Lizenz](../../LICENSE) des Projekts. `adapter/src/catalog.json` wurde aus den Kompendien von `dsa-41` erzeugt (Apache-2.0 / ORC), dort gelten deren Bedingungen. DAS SCHWARZE AUGE ist eine Marke der Ulisses Spiele GmbH; dieses Projekt ist kein offizielles Produkt von Ulisses. Einzelheiten: [NOTICE](../../NOTICE).
