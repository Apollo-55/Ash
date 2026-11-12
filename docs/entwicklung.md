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
tools/                          Build, Typecheck, Kommandozeilen-Export, lokale Testumgebung, E2E
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

Folgende Ordner sind nicht im Git und müssen selbst angelegt werden:

| Ordner | Inhalt |
|---|---|
| `test-vault/` | eine Obsidian-Vault zum Ausprobieren; `npm run deploy` kopiert das Plugin hinein |
| `.foundry/app/` | eine entpackte Foundry-Node-Version (eigene Lizenz nötig), Daten in `.foundry/data/` |
| `Regelwerke/` | eigene Regelwerk-PDFs für den NSC-Generator (urheberrechtlich geschützt, nie einchecken) |

```bash
npm run foundry       # lokale Foundry auf http://localhost:30013
npm run sync-local    # lokaler vtf-sync davor (Token in .foundry/sync-token)
npm run e2e           # Durchlauf im Browser (Playwright), Screenshots in dist/e2e/
```

`npm run e2e` erwartet eine Welt `vtf-test` mit dem System dsa-41 und in `test-vault/` einige Notizen, auf die sich `tools/e2e/foundry-e2e.mjs` und die Fixtures in `tools/e2e/fixtures/` beziehen (u. a. `NPC/Besatzung/Shahane ay Zedrakin.md`, „Valeriano di Salsavarda“, „Encounter“ mit der Leaflet-Karte `süd-map`, „Alanfaner Sabotage“). Diese Vault liegt dem Projekt nicht bei; ohne sie laufen nur `npm test` und die Checkliste in [testen.md](testen.md).

## Versionen

Dienst (`packages/sync-service/server.mjs`), Modul (`module.json`) und Plugin (`manifest.json`) tragen dieselbe Versionsnummer; der Build bricht ab, wenn sie voneinander abweichen. Der Workflow `.github/workflows/vtf-sync-image.yml` baut bei jedem Push auf `main` das Image `ghcr.io/<owner>/vtf-sync`.
