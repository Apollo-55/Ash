# Entwicklung

Voraussetzung: Node ≥ 22. Die Skripte installieren die Abhängigkeiten in einem frischen Clone selbst.

## Aufbau

Das Projekt ist in **systemunabhängig** und **systemabhängig** geteilt. Alles unter `packages/` kennt kein Spielsystem; es spricht mit einem System nur über die Schnittstellen `SystemAdapter` (Obsidian/Export: Block lesen, Wertekasten, Actor-Daten) und `FoundrySystemHooks` (Foundry: Actor-Typ, Kompendien, Kampfwerte). Alles für DSA 4.1 liegt unter `systems/dsa41/`.

```
packages/                       systemunabhängig – „Vault to Foundry“
  core/                         Markdown → HTML, Links, IDs, Bundle, Szenen, Sync, System-Schnittstelle
  obsidian-plugin/              Obsidian-Plugin „Vault to Foundry“
  foundry-module/               Foundry-Modul vault-to-foundry (v13)
  sync-service/                 Sync-Dienst vtf-sync (Node, Docker)
systems/                        systemabhängig – je Spielsystem ein Ordner
  adapters.ts                   Liste der Systeme für Obsidian und Export
  foundry-hooks.ts              Liste der Foundry-Teile (nach Foundry-System-ID)
  dsa41/                        DSA 4.1 (Foundry-System dsa-41), siehe systems/dsa41/README.md
tools/                          Build, Typecheck, Kommandozeilen-Export, lokale Testumgebung
  e2e/                          End-to-End-Test mit eigener Test-Vault (e2e/vault/)
docs/                           Anleitungen
```

Ein neues System (z. B. D&D 5e) bekommt `systems/<id>/adapter/` und je einen Eintrag in `systems/adapters.ts` und `systems/foundry-hooks.ts` – unter `packages/` ändert sich nichts. Anleitung: [systems/README.md](../systems/README.md). Der Test `packages/core/test/systems.test.ts` wacht darüber, dass `packages/` systemfrei bleibt, und prüft jeden eingetragenen Adapter.

## Befehle

```bash
npm test                  # vitest: packages/*/test und systems/*/*/test
npm run typecheck         # findet alle tsconfig.json unter packages/ und systems/ selbst
npm run build             # → dist/ (Plugin, Modul, Sync-Dienst, jeweils auch als ZIP)
npm run deploy            # wie build, kopiert das Plugin zusätzlich nach test-vault/
npm run dev               # wie deploy, bei jeder Änderung
npm run build:generator   # DSA-NSC-Generator, eigenes Plugin (nicht in build enthalten); dev:generator wie dev
npm run regelwerke        # DSA-Regelwerke: Seiten-Index aus Regelwerke/*.pdf → .llm/
```

Weitere Werkzeuge:

| Werkzeug | Zweck |
|---|---|
| `tools/export-cli.ts <vault> <zip>` | Export ohne Obsidian (`--name`, `--exclude`, `--system <id>` / `--no-system`) |
| `tools/sync-cli.ts <vault> --url … --token …` | Push an den Sync-Dienst ohne Obsidian |
| `systems/dsa41/tools/pruefen.ts <vault>` | prüft alle `dsa-nsc`-Blöcke einer Vault |
| `systems/dsa41/tools/gen-catalog.mjs` | Namenskatalog aus den Quellen des Systems dsa-41 neu erzeugen |
| `systems/dsa41/tools/eval.ts` | Modellvergleich des NSC-Generators (kostet Geld) |

## Lokale Testumgebung

Diese Ordner sind nicht im Git und werden nur für die jeweilige Aufgabe gebraucht:

| Ordner | Inhalt |
|---|---|
| `test-vault/` | eine eigene Obsidian-Vault zum Ausprobieren; `npm run deploy` kopiert das Plugin hinein |
| `.foundry/app/` | eine entpackte Foundry-Node-Version (eigene Lizenz nötig), Daten in `.foundry/data/` |
| `Regelwerke/` | eigene Regelwerk-PDFs für den NSC-Generator (urheberrechtlich geschützt, nie einchecken) |

```bash
npm run foundry       # lokale Foundry auf http://localhost:30013
npm run sync-local    # lokaler vtf-sync davor (Token in .foundry/sync-token)
```

## End-to-End-Test

`npm run e2e` spielt einen kompletten Durchlauf im Browser (Playwright) gegen die lokale Foundry: Export, Import, Links, NSCs, Szenen, geänderte Notiz, Secrets, Verwaiste. Die Testdaten liegen im Projekt: `tools/e2e/vault/` ist eine kleine, erfundene Vault (Notizen, Bilder, Karte mit Leaflet-Markern, PDF). Jeder Lauf arbeitet auf einer frischen Kopie in `dist/e2e-vault/`.

Einmalig vorbereiten:

1. Foundry v13 (Node-Version) nach `.foundry/app/FoundryVTT-Node-<version>/` entpacken, `npm run foundry` starten, Lizenz eintragen.
2. Im Setup das System **dsa-41** installieren und eine Welt mit der ID `vtf-test` anlegen (andere ID: `VTF_WORLD=…`).
3. In der Welt einen Benutzer „E2E“ mit der Rolle Spielleiter und ohne Passwort anlegen (oder den Gamemaster ohne Passwort lassen und abgemeldet sein).
4. Browser für Playwright laden: `PLAYWRIGHT_BROWSERS_PATH=.foundry/pw-browsers npx playwright install chromium` (das Skript sucht dort, solange `PLAYWRIGHT_BROWSERS_PATH` nicht gesetzt ist).

Dann, während `npm run foundry` läuft:

```bash
npm run e2e
```

Das Skript baut das Modul, kopiert es nach `.foundry/data/Data/modules/` (anderer Ort: `VTF_FOUNDRY_MODULES=…`), aktiviert es in der Welt und gibt je Schritt die gefundenen Werte aus; Screenshots landen in `dist/e2e/`. Welche Punkte der Checkliste damit abgedeckt sind, steht in [testen.md](testen.md) (**[auto]**). Weitere Variablen: `VTF_FOUNDRY_URL` (Standard `http://localhost:30013`), `VTF_E2E_OUT`.

## Versionen

Dienst (`packages/sync-service/server.mjs`), Modul (`module.json`) und Plugin (`manifest.json`) tragen dieselbe Versionsnummer; der Build bricht ab, wenn sie voneinander abweichen. Der Workflow `.github/workflows/vtf-sync-image.yml` baut bei jedem Push auf `main` das Image `ghcr.io/<owner>/vtf-sync`.
