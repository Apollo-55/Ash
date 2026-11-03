# Testcheckliste Foundry (M1: Journale, M2: NSCs, M3: Szenen, M5: Sync)

Die Import-Logik ist dreifach getestet:

1. `npm test`: vitest gegen eine nachgebaute Foundry-API (`packages/foundry-module/test`).
2. `npm run e2e`: automatisch im Browser gegen die **lokale** Foundry 13.351 (`.foundry/`, gitignored, Welt `vtf-test` mit dsa-41 v13.1.4). Vorher in einem zweiten Terminal `npm run foundry` starten. Das Skript deckt die mit **[auto]** markierten Punkte ab. Screenshots landen in `dist/e2e/`.
3. Von Hand auf dem Server: die restlichen Punkte unten.

Testwelt: `vtf-test` (dsa-41 v13.1.4, Foundry v13).

Erkenntnisse aus dem Test gegen die echte Foundry 13.351:
- Foundry nimmt als Anker im Inhaltsverzeichnis das **`id`-Attribut** der Überschrift (`data-anchor` wird ignoriert). Ohne `id` würde Foundry selbst umschreiben (ü → u), Links mit Umlaut-Überschriften wären dann kaputt.
- Foundry scrollt bei einem `#Anker`-Link nur, wenn die Seite wechselt. Bei einem frisch geöffneten Journal mit einer einzigen Seite landet man oben. Das Modul scrollt deshalb bei seinen eigenen Journalen selbst.

## Vorbereitung

1. `npm run deploy` → `dist/vault-to-foundry-module.zip`.
2. Auf dem Server entpacken nach `<Data>/modules/` (ergibt `<Data>/modules/vault-to-foundry/`), Foundry neu laden.
3. Testwelt starten → Einstellungen → Module verwalten → „Vault to Foundry – Import“ aktivieren.
4. Test-Vault in Obsidian öffnen (`Ash/test-vault`), Plugin „Vault to Foundry“ unter Community-Plugins einschalten, Befehl „Vault to Foundry: Nach Foundry exportieren (ZIP)“ → ZIP in `~/Downloads/uthuria-ob-foundry.zip`.

## Erster Import

- [ ] Journal-Seitenleiste zeigt „Vault importieren“ und das Bericht-Symbol (nur als GM, als Spieler nicht).
- [ ] **[auto]** Dialog: ZIP wählen → Fortschrittsanzeige → Importbericht öffnet sich.
- [ ] Bericht: 33 angelegt, 0 aktualisiert, 0 übersprungen, 1 Warnung („create a link“ in Welcome). Keine Upload-Fehler.
- [ ] **[auto]** Ordner wie in der Vault: NPC › Besatzung, NPC › Expedition › Geweite …, Uthuria › Act1 Überfahrt › Entcounter › Alanfaner Sabotage (4 Ebenen).
- [ ] Ordner alphabetisch sortiert.
- [ ] „Shahane ay Zedrakin“: Porträt und Token-Bild werden angezeigt, Zeilenumbrüche im Wertekasten wie in Obsidian.
- [ ] **[auto]** „Encounter“: drei Kartenbilder (Leaflet), Tabelle, Links „Besondere Ereignisse“ usw. springen zum jeweiligen Journal.
- [ ] „Die Singenden Inseln“: Link „Q02 - Efferds Wogen, S. 181“ öffnet das PDF-Journal. „S. 181 öffnen“ öffnet das PDF im neuen Tab auf Seite 181.
- [ ] **[auto]** Dateibrowser: `vault-to-foundry/uthuria-ob/assets/…` enthält Asasets/Token, Maps, PDFs (Namen ohne Umlaute/Leerzeichen).
- [ ] Bericht: Link auf eine Quelldatei öffnet die Notiz in Obsidian (Browser fragt nach „obsidian://“). Klappt nur auf dem Rechner mit Obsidian.

## Testnotiz mit allen Sonderfällen

Im Test-Vault eine Notiz `Test/Alles.md` anlegen:

~~~markdown
---
foundry:
  sichtbar: spieler
---
# Titel
Link mit Alias [[Shahane ay Zedrakin|die Proviantmeisterin]] und Überschrift [[Valeriano di Salsavarda#Der Hintergrund (Der Skandal):]].
Privat: %%darf nie in Foundry landen%%

> [!warning] Achtung
> Gestylter Block

> [!geheim]
> Nur für die SL: Shahane ist Paktiererin.

```dataview
LIST
```
~~~

- [ ] **[auto]** Export + Import: „Alles“ hat Standard-Berechtigung „Beobachter“.
- [ ] **[auto]** Alias-Link zeigt „die Proviantmeisterin“. Der Überschriften-Link springt in Valerianos Journal zur Überschrift (Anker = `id` der Überschrift, automatisch geprüft in `tools/e2e`).
- [ ] **[auto]** „darf nie in Foundry landen“ steht nirgends, auch nicht im HTML-Quelltext der Seite (Seite bearbeiten → Quelltext).
- [ ] **[auto]** Callout farbig mit Titel „Achtung“.
- [ ] Secret: Spieler sehen es nicht. GM kann es aufdecken (Seite bearbeiten → Secret → „Aufdecken“).
- [ ] **[auto]** Bericht warnt „Dataview ausgelassen“.

## Erneuter Import

- [ ] **[auto]** Ohne Änderung erneut exportieren und importieren: 0 angelegt, alles „übersprungen“, Dateien „unverändert“, keine Duplikate.
- [ ] **[auto]** Secret in „Alles“ aufdecken, dann in Obsidian einen Satz in „Alles“ ändern, exportieren, importieren: 1 aktualisiert, Secret **bleibt aufgedeckt**, neuer Satz da.
- [ ] Im Journal „Alles“ von Hand eine zweite Seite anlegen → nach dem nächsten Import ist sie noch da.
- [ ] Berechtigung eines Journals ohne `sichtbar:` von Hand ändern → bleibt nach Import erhalten.
- [ ] In Obsidian „Ebba“ nach `NPC/Expedition/` verschieben und umbenennen → Import: kein Duplikat, Journal heißt neu und liegt im neuen Ordner. Ein leerer Ordner erscheint als verwaist.
- [ ] **[auto]** Notiz in Obsidian löschen → Import: Journal bleibt, steht unter „Verwaist“. „Ausgewählte löschen …“ → Rückfrage → gelöscht. Nicht leere Ordner bleiben.
- [ ] Bild in Obsidian austauschen (gleicher Name) → Import lädt genau diese Datei neu hoch. Eventuell Browser-Cache leeren (Strg+F5), um das neue Bild zu sehen.
- [ ] Bericht-Symbol in der Seitenleiste öffnet den letzten Bericht wieder.

## Fehlerfälle

- [ ] **[auto]** Beliebige andere ZIP wählen → Meldung „enthält keine bundle.json“.
- [ ] Als Spieler (Nicht-GM): kein Knopf sichtbar.

## NSCs (M2)

Testdaten: `tools/e2e/fixtures/Sabotage NSC.md` (Viper, Schattenweber, Vollstrecker, Riff-Hydra) und der Block in „Shahane ay Zedrakin“. `npm run e2e` kopiert sie in die Test-Vault.

- [ ] **[auto]** Jeder Block wird ein Actor (Typ `character`) im Actor-Ordner wie in der Vault.
- [ ] **[auto]** Eigenschaften, LeP/AuP/AsP (Maximum und beim Anlegen aktuell), feste Werte mit ausgeschalteter Automatik, sonst Automatik an.
- [ ] **[auto]** Items aus den Kompendien (per sid), eigene/unbekannte neu angelegt und im Bericht gewarnt.
- [ ] **[auto]** AT/PA auf dem Bogen = Werte aus dem Block, zweite Waffe mit demselben Talent über den Waffenmodifikator.
- [ ] **[auto]** Porträt, Token, Verknüpfung (einzelner NSC verknüpft, mehrere pro Notiz nicht), Biografie mit Link aufs Journal.
- [ ] **[auto]** Erneuter Import nach Änderung: Maximum neu, aktuelle LeP bleiben, Hand-Item und Effekt bleiben, entfernte SF verschwinden.
- [ ] **[auto]** Unverändert erneut: alles übersprungen. Verwaiste NSCs löschbar.
- [ ] Von Hand: Würfe vom Bogen (Talentprobe, Attacke mit Säbel, Zauber) funktionieren.
- [ ] Von Hand in Obsidian: Wertekasten wird angezeigt, Fehler (z. B. `KK: 1a`) erscheinen rot, „gerechnet“ steht neben MR/INI/WS. Befehl „DSA-NSC-Vorlage einfügen“.

## Szenen (M3)

Testdaten: `tools/e2e/fixtures/Szenen.md` (Leaflet-Karte `süd-map` aus „Encounter“, Kampfszene auf `Ship_full.png` mit drei Gegnern).

- [ ] **[auto]** Leaflet-Szene: Bild und Maße aus der Leaflet-Karte, kein Raster, Marker als Pins an der richtigen Stelle, Pins öffnen das Journal.
- [ ] **[auto]** Kampfszene: Raster, Licht, Nebel, Journal; NSC-Tokens versteckt am oberen Rand.
- [ ] **[auto]** Erneuter Import nach Änderung: Licht neu; verschobene/aufgedeckte Tokens und von Hand gezogene Wände bleiben; keine doppelten Tokens.
- [ ] **[auto]** Unverändert erneut: übersprungen.
- [ ] Von Hand im Browser: Vorschaubild in der Szenenleiste vorhanden (entsteht nur mit Canvas), Pins anklicken, Szene aktivieren, Spieler sehen nur aufgedeckte Tokens.
- [ ] Von Hand in Obsidian: `szene`-Block erscheint als Karte mit Vorschau; ein Tippfehler (z. B. `licht: mittag`) erscheint rot.

## Sync-Dienst (M5)

Automatisch: `npm test` startet den Dienst und prüft Push, unveränderten Push, Einzeländerung, ungenutzte Dateien, Prüfsummen und Pfade.

- [ ] **[auto]** Push über den Dienst, Knopf zeigt Punkt, Dialog nennt Revision, „Übernehmen“ ändert das Journal, Punkt verschwindet.
- [ ] **[auto]** Dateien aus einem früheren ZIP-Import werden erkannt und nicht erneut hochgeladen.
- [ ] Von Hand auf dem Server: Container läuft als Foundry-Benutzer, `curl …/vtf-sync/health`, Foundry kann hochgeladene Bilder anzeigen.
- [ ] Von Hand in Obsidian: „Verbindung testen“, eine Notiz ändern → Statusleiste ⏳ → ⟳ → ✓; falsches Token → ✗ mit Grund.
- [ ] Von Hand: „Ungenutzte Dateien entfernen“ zeigt die Liste, löscht nach Bestätigung.
