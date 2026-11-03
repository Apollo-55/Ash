# Auftrag: Obsidian → Foundry VTT Export (DSA 4.1)

Du baust mit mir ein Werkzeug, mit dem ich meine Obsidian-Vault nach Foundry VTT exportiere: Journals, NSCs als Actors und Szenen. Zielsystem ist zuerst **DSA 4.1** mit dem Foundry-System **dsa-41** (TheCreativeMind, Quellcode: https://gitlab.com/foundry-vtt-dsa/dsa-4.1-core/dsa-4.1-system, aktuell v13.1.4, Foundry 11–13). **D&D 5e** (System `dnd5e`) kommt später als zweiter Baustein dazu. Plane die Architektur dafür, baue es aber noch nicht.

Mein Rechner läuft mit **Bazzite** (Fedora Atomic, unveränderliches Basissystem). UI-Texte, Meldungen und Doku auf Deutsch, Code und Bezeichner auf Englisch.

## Arbeitsregeln

- Meine echte Vault und meine echten Foundry-Welten werden nur gelesen, nie verändert. Getestet wird mit einer Kopie der Vault und einer eigenen Testwelt.
- Frag, bevor du Systempakete installierst, Flatpak-Rechte änderst oder außerhalb des Projektordners und der Testorte schreibst. Kein `rpm-ostree install`.
- Sammle Rückfragen und stell sie gebündelt.
- Arbeite in Meilensteinen. Nach jedem: kurzer Bericht, was fertig ist und wie ich es teste, plus ein Git-Commit.

## Phase 0: Erkunden (nichts bauen, danach anhalten)

1. **Umgebung:** `node -v`, `npm -v`, `git --version`. Fehlt Node ≥ 20, schlag Homebrew vor (`brew install node`, auf Bazzite vorinstalliert) oder eine Distrobox.
2. **Obsidian:** Wie ist es installiert (`flatpak list | grep -i obsidian`)? Bei Flatpak mit `flatpak info --show-permissions md.obsidian.Obsidian` prüfen, ob es außerhalb der Vault schreiben darf.
3. **Foundry:** Finde den Datenordner (Linux-Standard `~/.local/share/FoundryVTT`, `dataPath` in `Config/options.json` prüfen) und die Foundry-Version. Frag mich, ob Foundry lokal läuft oder auf The Forge bzw. einem Server. Davon hängt der Transport ab (siehe unten).
4. **dsa-41-Datenmodell:** Lies `Data/systems/dsa-41/` (system.json, template.json bzw. die DataModel-Klassen, Kompendien, Sprachdateien). Halte in `docs/dsa41-datenmodell.md` fest:
   - Actor-Typen und die Feldpfade für Eigenschaften (MU, KL, IN, CH, FF, GE, KO, KK), LE/AU/AE/KE, RS, MR, INI, GS, WS
   - wie Talente, Waffen, Zauber, Sonderfertigkeiten, Vor- und Nachteile abgebildet sind: Felder oder eingebettete Items? Welche Item-Typen? Gibt es Kompendien, aus denen man per Name kopieren kann?
   - wo die Biografie gespeichert wird

   Falls das aus dem Code nicht eindeutig hervorgeht, gib mir dieses Makro, das ich in meiner DSA-Welt ausführe (Name eines NSC mit Werten, Waffen und Talenten eintragen). Es lädt `dsa41-dump.json` herunter:

   ```js
   const a = game.actors.getName("NAME_EINES_NSC");
   const dump = { foundry: game.version, system: game.system.version, actorModelle: game.model?.Actor, itemModelle: game.model?.Item, beispiel: a?.toObject() };
   (foundry.utils.saveDataToFile ?? saveDataToFile)(JSON.stringify(dump, null, 2), "application/json", "dsa41-dump.json");
   ```

5. **Vault:** Frag nach dem Pfad. Lies eine repräsentative Auswahl (nichts ändern) und halte in `docs/vault-analyse.md` fest:
   - Ordnerstruktur und Frontmatter-Gewohnheiten
   - wie NSCs bisher notiert sind (Wertekasten im Fließtext, Tabelle, Frontmatter?)
   - Bild-Einbettungen und Anhang-Ordner, Links mit Alias oder Überschrift, Callouts, `%%Kommentare%%`
   - installierte Community-Plugins in `.obsidian/plugins` (z. B. Dataview, Templater, Fantasy Statblocks)
6. **Plan:** Schlag mir die konkrete Notation für NSCs und Szenen vor (Entwurf unten, an meine bestehende Schreibweise anpassen, wo sinnvoll) und die Reihenfolge. Warte auf mein OK.

## Architektur

Monorepo (npm workspaces, TypeScript, esbuild):

- `packages/core`: reine Logik ohne Obsidian- oder Foundry-Abhängigkeiten, mit vitest getestet. Markdown → HTML (markdown-it mit eigenen Plugins), Wikilinks und Embeds, Callouts, Secrets, Parsen und Validieren der `dsa-nsc`-Blöcke, Bundle-Format, ID-Erzeugung. Link-Auflösung läuft über ein Resolver-Interface, das das Plugin mit Obsidians `metadataCache` befüllt.
- `packages/obsidian-plugin` (Arbeitstitel „Vault to Foundry“): Export-Befehle, Einstellungen, Rendering des `dsa-nsc`-Blocks.
- `packages/foundry-module` (Arbeitstitel `vault-to-foundry-import`): liest das Bundle und legt Dokumente an oder aktualisiert sie.
- Alles Systemabhängige steckt in Adaptern (`SystemAdapter`: Block-Schema, Validierung, Rendering, Umwandlung in Actor-Daten). Jetzt nur `dsa41`, später `dnd5e`. Das Modul deshalb nicht per `relationships.systems` auf ein System beschränken.

### Bundle

Das Plugin erzeugt ein versioniertes `bundle.json` (Schema-Version, Vault-Name, Zeitstempel, Dokumente mit `kind`, `id`, `sourcePath`, `folder`, `name`, Inhalt bzw. Daten) und einen Ordner `assets/` mit allen referenzierten Bildern.

### Transport (je nach Hosting aus Phase 0)

- **Foundry lokal:** Plugin-Einstellung „Foundry-Datenordner“. Der Export schreibt nach `<Data>/vault-to-foundry/<vault>/`. Das Modul lädt `bundle.json` per `fetch` (mit Cache-Buster), die Bilder liegen dann schon am richtigen Ort. Optional ein Auto-Sync, der das Bundle regelmäßig auf Änderungen prüft. Das Plugin ist dafür `isDesktopOnly`. Bei Flatpak-Obsidian ist eventuell `flatpak override --user --filesystem=<Data-Pfad> md.obsidian.Obsidian` nötig; vorher fragen.
- **Forge oder Server:** Das Plugin erzeugt eine ZIP-Datei. Das Modul hat einen Upload-Dialog, entpackt mit JSZip und lädt Bilder per `FilePicker.upload` hoch.

Baue zuerst nur den Weg, der zu meinem Hosting passt.

### Stabile IDs

- Foundry-IDs sind 16 Zeichen `[A-Za-z0-9]`. Erzeuge sie deterministisch (Hash aus Vault-Name, Quellpfad und ggf. Blockname → Base62) und lege Dokumente mit `keepId: true` an, auch eingebettete Seiten und Items.
- Umbenennen oder Verschieben in Obsidian darf keine Duplikate erzeugen. Das Plugin führt in seinen Plugin-Daten eine Zuordnung Pfad → ID und aktualisiert sie über `vault.on('rename')`. Die Notizen selbst werden dafür nicht verändert.
- Jedes erzeugte Dokument bekommt `flags["vault-to-foundry"]` mit `sourcePath`, Inhalts-Hash und Bundle-Version. Unveränderte Dokumente werden beim Sync übersprungen.

### Was ein erneuter Import überschreiben darf

Obsidian liefert die Stammdaten, Foundry behält den Spielzustand.

- **Wird überschrieben:** Name, Journal-Inhalt, Bild, Ordner, Basiswerte aus dem `dsa-nsc`-Block, vom Importer angelegte Items. Berechtigungen nur, wenn sie in Obsidian ausdrücklich angegeben sind.
- **Wird nie angefasst:** aktuelle LE/AU/AE, Wunden, Effekte, von Hand hinzugefügte Items, Wände, Lichter, Sounds, Notiz-Pins, Positionen bereits platzierter Tokens.
- Aufgedeckte Secrets (`revealed`) bleiben beim Update aufgedeckt.
- Notizen, die aus der Vault verschwunden sind, werden nicht automatisch gelöscht. Der Importbericht listet sie als verwaist, gelöscht wird nur per Knopf nach Bestätigung.

## Funktionen

### Journals

- Jede Notiz wird ein JournalEntry mit einer Textseite (HTML). Die Ordnerstruktur folgt der Vault; Foundrys maximale Ordnertiefe beachten und tiefere Ebenen zusammenfassen.
- `[[Notiz]]`, `[[Notiz|Alias]]`, `[[Notiz#Überschrift]]` → `@UUID[...]{...}`. Das Ziel kann ein Journal, ein Actor oder eine Szene sein. Nicht auflösbare Links werden normaler Text mit Warnung im Bericht.
- `![[bild.png]]` und `![](bild.png)` → Bild aus `assets/`. `![[Andere Notiz]]` vorerst als Link.
- Callouts → gestylte Blöcke (kleines CSS im Modul).
- `> [!geheim]` und `> [!secret]` → Foundry-Secret-Block `<section class="secret" id="secret-…">` mit stabiler ID.
- `%%Kommentare%%` werden immer entfernt. Das sind meine privaten Notizen, sie dürfen nie in Foundry landen. Dataview-Blöcke werden ausgelassen (mit Hinweis im Bericht).
- Frontmatter:

  ```yaml
  foundry:
    typ: journal      # journal (Standard) | szene | ignorieren
    sichtbar: gm      # gm (Standard) | spieler
  ```

- Ordner und Muster, die nie exportiert werden (z. B. `_privat/`, `Vorlagen/`), sind in den Plugin-Einstellungen festlegbar.

### NSCs (DSA 4.1)

Codeblock `dsa-nsc` mit YAML, beliebig viele pro Notiz. Entwurf, an das Datenmodell und meine Schreibweise anzupassen:

```dsa-nsc
name: Hafenwache
bild: hafenwache.webp
eigenschaften: { MU: 13, KL: 10, IN: 12, CH: 10, FF: 11, GE: 12, KO: 13, KK: 14 }
LE: 32
AU: 30
RS: 3
MR: 3
INI: 10+1W6
GS: 7
waffen:
  - { name: Säbel, AT: 13, PA: 11, TP: 1W6+3 }
talente: { Sinnenschärfe: 5, Menschenkenntnis: 3 }
```

- In Obsidian wird der Block als Wertekasten gerendert. Fehler (unbekannter Schlüssel, „KK: 1a“, unbekanntes Talent) werden direkt im Block angezeigt.
- Befehl „DSA-NSC-Vorlage einfügen“.
- In Foundry wird jeder Block ein Actor im passenden Ordner. Die Biografie enthält einen Link zurück auf das Journal der Notiz. Talente und Waffen werden gemäß dem Datenmodell aus Phase 0 übertragen; sind es Items, werden sie per Name aus den Systemkompendien kopiert und die Werte gesetzt. Unbekannte Namen erzeugen eine Warnung.
- Optional, falls die Vault-Analyse zeigt, dass ich NSCs schon als klassischen Wertekasten im Fließtext notiere („MU 13 KL 10 … LE 32 RS 3 …“): ein Parser dafür, damit ich alte Notizen nicht umschreiben muss.

### Szenen

Notiz mit `foundry.typ: szene`:

```yaml
foundry:
  typ: szene
  karte: "[[tempel.webp]]"
  raster: 100
  nscs: ["[[Hafenwache]]", "[[Kapitän Ralmir]]"]
```

- Ergebnis: Szene mit Hintergrund, Rastergröße, Abmessungen aus dem Bild und Thumbnail. Der Notiztext wird ein verknüpftes Journal (`scene.journal`).
- Tokens für die aufgeführten NSCs werden nur beim ersten Anlegen gesetzt (in einer Reihe am Rand) und danach nie wieder angefasst.

### Importbericht

Nach jedem Sync ein Dialog mit: angelegt, aktualisiert, übersprungen, verwaist, Warnungen. Jeweils mit Link auf das Dokument bzw. die Quelldatei.

## Technische Vorgaben

- Obsidian-Plugin nach der Struktur von `obsidianmd/obsidian-sample-plugin` (manifest.json, main.ts, styles.css). Frontmatter über `metadataCache`, Links über `metadataCache.getFirstLinkpathDest`.
- Foundry-Modul für die in Phase 0 ermittelte Version, `compatibility` entsprechend. Bei v13: ApplicationV2 und DialogV2, `foundry.utils.*` statt veralteter Globals, nichts, was es erst in v14 gibt.
- Dev-Skript, das die Builds in die Test-Vault (`.obsidian/plugins/…`) und nach `<Data>/modules/…` kopiert oder verlinkt.
- Tests mit vitest für core: Links, Embeds, Secrets, Entfernen von Kommentaren, ID-Stabilität, Block-Validierung, Mapping auf dsa-41. Für Foundry eine manuelle Testcheckliste in `docs/test-foundry.md`.
- README auf Deutsch: Installation, Notation, Einstellungen, Grenzen.

## Meilensteine

- **M0:** Erkunden und Plan (siehe oben), dann auf mein OK warten.
- **M1:** core und Journals Ende-zu-Ende: Export, Import, Links, Bilder, Secrets, Kommentare, erneuter Import ohne Duplikate, Importbericht.
- **M2:** `dsa-nsc`-Block (Rendering, Validierung, Vorlage) und Actor-Import für dsa-41.
- **M3:** Szenen.
- **M4:** Komfort: Auto-Sync, Aufräumen verwaister Dokumente, Feinschliff der Einstellungen, README.
- **Später:** `dnd5e`-Adapter.

Fang mit Phase 0 an.
