# Der `szene`-Block

Ein `szene`-Block in einer Notiz wird in Foundry eine Szene. Er gilt für jedes Spielsystem. Diese Seite erklärt jedes Feld und zeigt, wie man es schreibt. Den Kurzüberblick mit einem Beispiel gibt die [README](../README.md#szenen-der-szene-block); was beim Übernehmen im Hintergrund passiert, steht in [entwicklung.md](entwicklung.md).

## Inhalt

1. [So schreibt man den Block](#so-schreibt-man-den-block)
2. [Vorlage](#vorlage)
3. [Alle Schlüssel](#alle-schlüssel)
4. [`karte` oder `leaflet`](#karte-oder-leaflet)
5. [`raster`](#raster)
6. [`nscs`](#nscs)
7. [`licht`, `nebel`, `navigation`](#licht-nebel-navigation)
8. [Leaflet-Karten und Pins](#leaflet-karten-und-pins)
9. [Mehrere Szenen, Links auf Szenen](#mehrere-szenen-links-auf-szenen)
10. [Vollständiges Beispiel](#vollständiges-beispiel)
11. [Häufige Fehler](#häufige-fehler)

---

## So schreibt man den Block

Der Inhalt ist YAML, eine Zeile pro Schlüssel (`schlüssel: wert`, Leerzeichen nach dem Doppelpunkt). Groß-/Kleinschreibung der Schlüssel ist egal, jeder Schlüssel darf nur einmal vorkommen, unbekannte Schlüssel sind ein Fehler. Eingerückt wird mit Leerzeichen, nicht mit Tabs.

- **Anführungszeichen** braucht ein Wert, der mit `#`, `[`, `{` usw. beginnt oder `: ` enthält – vor allem Links: `"[[#Die Viper]]"`. Im Zweifel immer `"…"`.
- **Kommentare** beginnen mit ` #`.
- **Der Name ist die Kennung.** Ändert man `name:`, entsteht beim nächsten Übernehmen eine neue Szene; die alte erscheint im Bericht als verwaist.
- **Meldungen:** In Obsidian erscheint der Block als Karte mit Vorschaubild. Fehler (✖, rot) verhindern das Anlegen der Szene, Warnungen (⚠) und Hinweise (ℹ) sind nur Information. Beides steht auch im Importbericht in Foundry.

---

## Vorlage

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

## Alle Schlüssel

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

## `karte` oder `leaflet`

```yaml
karte: "[[deck.webp]]"        # Wikilink
karte: deck.webp              # Dateiname
karte: Karten/Schiff/deck.webp
```

Die Datei wird wie ein Obsidian-Link gesucht. Die Maße der Szene kommen aus dem Bild, bei jedem Übernehmen neu. Wird das Bild nicht gefunden, wird die Szene nicht angelegt (Fehler).

```yaml
leaflet: süd-map              # id aus einem ```leaflet-Block, siehe unten
```

## `raster`

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

## `nscs`

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

## `licht`, `nebel`, `navigation`

```yaml
licht: nacht       # tag | nacht | dunkel
nebel: ja
navigation: nein
```

- **`licht`**: `tag` ist hell (globales Licht), `nacht` ist Dunkelheit 0,7 ohne globales Licht, `dunkel` ist Dunkelheit 1, es zählen nur Lichtquellen und Sicht.
- **`nebel`**: Sicht der Tokens und Nebel des Krieges an oder aus.
- **`navigation`**: ob die Szene in der Szenenleiste oben erscheint.

## Leaflet-Karten und Pins

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

## Mehrere Szenen, Links auf Szenen

- Beliebig viele `szene`-Blöcke pro Notiz. Ohne `name:` heißt die Szene wie die Notiz; mehrere namenlose heißen „Notiz“, „Notiz 2“ …
- `[[Notiz#Szenenname]]` verlinkt die Szene direkt (nur mit `name:`).
- Das frühere Frontmatter `foundry: typ: szene` wird nicht mehr verwendet; die Notiz wird dann nur als Journal exportiert (Hinweis).

---

## Vollständiges Beispiel

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
| Einrückung mit Tabs | YAML erlaubt keine Tabs | Leerzeichen |
| `karte:` und `leaflet:` beide gesetzt | nur eins erlaubt | eins entfernen |
| `raster: { größe: 30 }` | unter 50 px | 50 bis 1000 |
