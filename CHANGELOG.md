# Änderungen

## Unveröffentlicht

**Vault to Foundry**

- `dsa-nsc`: Neue Liste `schilde` (auch `schild`) für Schilde und Parierwaffen gemischt – in dsa-41 ein Item-Typ. Einträge wie bei `rüstung`: Name oder `{ name, typ, WM, INI, BF }`; `typ` (Schild/Parierwaffe) überschreibt die Kategorie des Kompendiums, unbekannte Namen sind ohne `typ` Schilde. Das erste Schild kommt neben der ersten Nahkampfwaffe in die Nebenhand, sodass das System Schild-PA, AT-Abzug und INI-Modifikator selbst rechnet. Prüfungen: unbekannte Namen (mit Vorschlag), abweichende Kompendiumskategorie, Parierwaffe ohne SF Linkhand/Parierwaffen I/II (das System verrechnet sie dann nicht), mehrere Schilde (nur das erste in der Hand). Wertekasten: Zeile „Schilde“/„Parierwaffen“ mit WM und INI aus Block oder Kompendium. Namenskatalog: Schilde tragen Kategorie, WM und INI.
- `dsa-nsc`: Neue Schlüssel `rasse` (auch `spezies`) und `kultur`. Der Name wird in den Rassen- bzw. Kulturen-Kompendien von dsa-41 gesucht – Geschlechtsformen („Mittelländer“, „Mittelländerin“ für „Mittelländer*in“) und eindeutige Varianten („Ambosszwerge“) genügen – und als Item angelegt, sodass das System dessen MR-Modifikator (Rasse auch INI) in die berechnete MR einrechnet. Zusätzlich stehen beide als Text in „Rasse“ und „Kultur“ des Bogens. Unbekannte Namen: Warnung mit Vorschlag, Suche in den Welt-Gegenständen, sonst Item ohne Modifikator.
- `dsa-nsc`: Neuer Schlüssel `MR-Mod` (auch `mrmod`, `mr_mod`) für den „Zusatz-MR“ des Bogens, auch negativ. Wie die Modifikatoren von Rasse und Kultur wirkt er nur, solange das System die MR berechnet; zusammen mit festem `MR` gibt es eine Warnung.
- Wertekasten: Rasse und Kultur stehen im Kopf, `MR-Mod` in der Wertezeile; „gerechnet …“ für MR und INI berücksichtigt jetzt Rasse, Kultur, Hohe/Niedrige Magieresistenz und `MR-Mod` wie das System.
- Vorlage „NSC-Vorlage einfügen“ enthält `rasse:` und `kultur:`. Namenskatalog um Rassen und Kulturen (mit MR-/INI-Modifikatoren) erweitert, Stand dsa-41 13.1.4.

## 1.0.8 (2026-11-13)

**Vault to Foundry**

- `dsa-nsc`: `RS` ist jetzt der **Zusatz-RS** und wird unverändert in „Zusatz-RS“ des Bogens eingetragen – zusätzlich zum RS der angelegten Rüstungen. Bisher war `RS` der Gesamt-RS, von dem der RS der Rüstungen abgezogen wurde. Blöcke mit Rüstung **und** `RS`, bei denen `RS` den Gesamtwert meinte, nennen jetzt nur noch den Zusatz (bei reiner Rüstung: `RS` weglassen oder `RS: 0`).

## 1.0.7 (2026-11-13)

**Vault to Foundry**

- `dsa-nsc`: Rüstungen können wie Waffen eigene Werte bekommen: `rüstung: [Lederharnisch, { name: Lastgeschirr, RS: 0, BE: 2 }]`. RS und BE überschreiben die Werte des Kompendiums (einfache und Zonenrüstung) und gehen in die Verrechnung mit dem Gesamt-`RS` ein; Rüstungen, die in keinem Kompendium stehen, werden mit diesen Werten angelegt.
- `dsa-nsc`: Zonenrüstung: `RS` einer Rüstung kann die Zonen einzeln angeben, z. B. `{ name: Topfhelm, RS: { Kopf: 4 } }` (Kopf, Brust, Rücken, Bauch, LA/linker Arm, RA, LB, RB, Arme, Beine). Für das einfache Rüstungssystem wird daraus der Gesamt-RS wie in dsa-41 berechnet.

## 1.0.6 (2026-11-13)

**Sync-Dienst**

- Fertiges Image `ghcr.io/apollo-55/vtf-sync` (amd64 und arm64), gebaut von GitHub Actions. Versionen per Knopf: GitHub → Actions → „Version veröffentlichen“ erhöht die Nummer überall (`tools/release.mjs`), schließt diesen Abschnitt im Changelog, taggt `v<Version>` und baut erst dann das Image als `latest` und `<Version>`, dazu ein GitHub-Release mit den ZIPs. Ein Push auf `main` baut nur das Image `dev` (und `sha-<commit>`); `latest` ändert sich dadurch nicht. Ein Update ist `docker compose pull vtf-sync && docker compose up -d vtf-sync`; der Weg über `vtf-sync.zip` bleibt möglich.
- Der Dienst liefert das Foundry-Modul aus: Installation und Update per Manifest-URL `<VTF_PUBLIC_URL>/module/module.json` (ohne Token).
- Der Dienst liefert die Obsidian-Plugins aus (Vault to Foundry, DSA-NSC-Generator): Das Plugin vergleicht seine Dateien mit denen des Dienstes und aktualisiert sich per Klick, mit Prüfsummen und nur mit Token (`/v1/plugins`, `/v1/plugins/<id>/files/<name>`; `/v1/plugin` bleibt für ältere Fassungen).
- Download-Seite `<VTF_PUBLIC_URL>/plugin` für die Erstinstallation, geschützt durch `VTF_DOWNLOAD_PASSWORD` (unabhängig vom Sync-Token); ohne die Variable ist die Seite aus.
- `/health` nennt die ausgelieferten Versionen; der Build bricht ab, wenn Dienst, Modul und Plugin verschiedene Versionen haben.

**Vault to Foundry**

- Eine Welt merkt sich ihre Vault: Die erste Übernahme verbindet, danach zeigen Dialog und Hinweispunkt nur noch diese (lösen in den Modul-Einstellungen).
- Befehl „Szenen-Vorlage einfügen“; leeres `karte:`/`leaflet:` zählt als nicht angegeben.
- Befehl „NSC-Vorlage einfügen“ (ID unverändert) meldet, wenn kein System eingestellt ist.
- Projektaufbau: systemunabhängig unter `packages/`, DSA 4.1 unter `systems/dsa41/`. Systeme werden nur in `systems/adapters.ts` und `systems/foundry-hooks.ts` eingetragen; ein Test hält `packages/` systemfrei. Der Kern kennt keine Kampfwerte mehr (`BundleItem.combat` → freies Feld `extra`).
- Hinweis: Durch das geänderte Datenformat gelten alle NSCs beim nächsten Sync einmal als geändert und werden aktualisiert (Spielstand bleibt erhalten). Obsidian-Plugin und Foundry-Modul zusammen aktualisieren.
- `export-cli.ts` und `sync-cli.ts`: `--system <id>` (Standard: erstes eingetragenes System), `--no-system`.
- Build: Die Skripte installieren in einem frischen Clone die Abhängigkeiten selbst; `npm run typecheck` findet alle Projekte selbst.

**DSA-NSC-Generator** (neues, eigenes Obsidian-Plugin; `npm run build:generator`)

- Erzeugt aus einer Beschreibung einen geprüften `dsa-nsc`-Block. Das Modell schlägt über Werkzeuge in einem lokalen Seiten-Index der eigenen Regelwerk-PDFs nach (`npm run regelwerke`); der Code prüft und repariert jede Abgabe.
- Anbieter: Claude, OpenAI und DeepSeek, mit denselben Werkzeugen und Prüfungen.
- Personen und Kreaturen/einfache Gegner (feste Werte, Angriffe mit AT/PA/TP, Kreaturfähigkeiten mit Regeltext).
- Regelwerk-Suche: Seiten, die einen Begriff erklären, stehen vor bloßen Erwähnungen; eindeutige Buchkürzel auch bei gleichen Initialen.

## 1.0.0 (2026-11-03)

Erste vollständige Fassung.

- **Journale:** Notizen → Journale mit Ordnerstruktur, Wikilinks/Alias/Überschrift → `@UUID`, Bilder/Audio/Video, PDFs als PDF-Journale mit Seitenlink, Callouts, `[!geheim]` → Foundry-Secrets (aufgedeckt bleibt aufgedeckt), `%%Kommentare%%` und HTML-Kommentare immer entfernt, Leaflet-Karten als Bild, Dataview ausgelassen, Aufgabenlisten, `==Markierung==`, Fußnoten, eingebettete Notizen und Abschnitte, stabile IDs auch beim Umbenennen, Importbericht mit Verwaisten und Löschen nach Bestätigung.
- **NSCs (DSA 4.1 / dsa-41):** `dsa-nsc`-Block mit Wertekasten, Validierung gegen die dsa-41-Kompendien, Vorschlägen und „gerechnet“-Hinweisen; Actor-Import mit Items aus Welt → Zusatz-Kompendien → System-Kompendien → eigener Definition; AT/PA aus TaW oder fest; Spielstand bleibt beim erneuten Import erhalten.
- **Szenen:** `szene`-Block, Leaflet-Karten mit Markern als Pins, NSC-Tokens versteckt beim ersten Anlegen; Tokens, Wände, Lichter bleiben unberührt.
- **Sync:** Dienst `vtf-sync` (Docker) neben Foundry; Obsidian synchronisiert beim Speichern nur geänderte Dateien; Foundry übernimmt per Knopf „Vault synchronisieren“; ungenutzte Dateien per Befehl entfernen; ZIP-Import als Backup.
- **Komfort:** gegliederte Einstellungen, fester Vault-Name, Warnung bei Duplikaten durch anderen Vault-Namen, fertige ZIPs für Plugin, Modul und Dienst.
