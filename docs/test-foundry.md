# Manuelle Testcheckliste Foundry (M1: Journale)

Die Import-Logik ist mit einer nachgebauten Foundry-API getestet (`packages/foundry-module/test`). Was die echte Foundry anders machen könnte, steht hier. Testwelt: `vtf-test` (dsa-41 v13.1.4, Foundry v13).

## Vorbereitung

1. `npm run deploy` → `dist/vault-to-foundry-module.zip`.
2. Auf dem Server entpacken nach `<Data>/modules/` (ergibt `<Data>/modules/vault-to-foundry/`), Foundry neu laden.
3. Testwelt starten → Einstellungen → Module verwalten → „Vault to Foundry – Import“ aktivieren.
4. Test-Vault in Obsidian öffnen (`Ash/test-vault`), Plugin „Vault to Foundry“ unter Community-Plugins einschalten, Befehl „Vault to Foundry: Nach Foundry exportieren (ZIP)“ → ZIP in `~/Downloads/uthuria-ob-foundry.zip`.

## Erster Import

- [ ] Journal-Seitenleiste zeigt „Vault importieren“ und das Bericht-Symbol (nur als GM, als Spieler nicht).
- [ ] Dialog: ZIP wählen → Fortschrittsanzeige → Importbericht öffnet sich.
- [ ] Bericht: 33 angelegt, 0 aktualisiert, 0 übersprungen, 1 Warnung („create a link“ in Welcome). Keine Upload-Fehler.
- [ ] Ordner wie in der Vault: NPC › Besatzung, NPC › Expedition › Geweite …, Uthuria › Act1 Überfahrt › Entcounter › Alanfaner Sabotage (4 Ebenen).
- [ ] Ordner alphabetisch sortiert.
- [ ] „Shahane ay Zedrakin“: Porträt und Token-Bild werden angezeigt, Zeilenumbrüche im Wertekasten wie in Obsidian.
- [ ] „Encounter“: drei Kartenbilder (Leaflet), Tabelle, Links „Besondere Ereignisse“ usw. springen zum jeweiligen Journal.
- [ ] „Die Singenden Inseln“: Link „Q02 - Efferds Wogen, S. 181“ öffnet das PDF-Journal. „S. 181 öffnen“ öffnet das PDF im neuen Tab auf Seite 181.
- [ ] Dateibrowser: `vault-to-foundry/uthuria-ob/assets/…` enthält Asasets/Token, Maps, PDFs (Namen ohne Umlaute/Leerzeichen).
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

- [ ] Export + Import: „Alles“ hat Standard-Berechtigung „Beobachter“.
- [ ] Alias-Link zeigt „die Proviantmeisterin“. Der Überschriften-Link springt in Valerianos Journal zur Überschrift (**prüfen: `data-anchor` wird von Foundry übernommen**).
- [ ] „darf nie in Foundry landen“ steht nirgends, auch nicht im HTML-Quelltext der Seite (Seite bearbeiten → Quelltext).
- [ ] Callout farbig mit Titel „Achtung“.
- [ ] Secret: Spieler sehen es nicht. GM kann es aufdecken (Seite bearbeiten → Secret → „Aufdecken“).
- [ ] Bericht warnt „Dataview ausgelassen“.

## Erneuter Import

- [ ] Ohne Änderung erneut exportieren und importieren: 0 angelegt, alles „übersprungen“, Dateien „unverändert“, keine Duplikate.
- [ ] Secret in „Alles“ aufdecken, dann in Obsidian einen Satz in „Alles“ ändern, exportieren, importieren: 1 aktualisiert, Secret **bleibt aufgedeckt**, neuer Satz da.
- [ ] Im Journal „Alles“ von Hand eine zweite Seite anlegen → nach dem nächsten Import ist sie noch da.
- [ ] Berechtigung eines Journals ohne `sichtbar:` von Hand ändern → bleibt nach Import erhalten.
- [ ] In Obsidian „Ebba“ nach `NPC/Expedition/` verschieben und umbenennen → Import: kein Duplikat, Journal heißt neu und liegt im neuen Ordner. Ein leerer Ordner erscheint als verwaist.
- [ ] Notiz in Obsidian löschen → Import: Journal bleibt, steht unter „Verwaist“. „Ausgewählte löschen …“ → Rückfrage → gelöscht. Nicht leere Ordner bleiben.
- [ ] Bild in Obsidian austauschen (gleicher Name) → Import lädt genau diese Datei neu hoch. Eventuell Browser-Cache leeren (Strg+F5), um das neue Bild zu sehen.
- [ ] Bericht-Symbol in der Seitenleiste öffnet den letzten Bericht wieder.

## Fehlerfälle

- [ ] Beliebige andere ZIP wählen → Meldung „enthält keine bundle.json“.
- [ ] Als Spieler (Nicht-GM): kein Knopf sichtbar.
