# Spielsysteme

Alles, was von einem Spielsystem abhängt, liegt hier – je System ein Ordner. Der Rest des Projekts (`packages/`) kennt kein System und spricht nur über zwei Schnittstellen mit ihm:

| Schnittstelle | Datei | Wofür |
|---|---|---|
| `SystemAdapter` | `packages/core/src/systems/adapter.ts` | NSC-Block lesen und prüfen, Wertekasten (Obsidian und Journal), Actor-Daten für den Export, Vorlage |
| `FoundrySystemHooks` | `packages/foundry-module/src/system-hooks.ts` | Actor-Typ, Reihenfolge der Kompendien, Item-Erkennung, Nacharbeiten nach dem Import (z. B. AT/PA) |

Eingehängt werden Systeme nur hier in `systems/`:

| Datei | liest | Inhalt |
|---|---|---|
| `adapters.ts` | Obsidian-Plugin, `tools/export-cli.ts`, `tools/sync-cli.ts` | Liste der `SystemAdapter` |
| `foundry-hooks.ts` | Foundry-Modul | `FoundrySystemHooks` je Foundry-System-ID |

Unter `packages/` gibt es genau zwei Importe davon (`obsidian-plugin/src/main.ts`, `foundry-module/src/actors.ts`). Der Test `packages/core/test/systems.test.ts` schlägt fehl, sobald `packages/` ein System auf anderem Weg importiert oder `packages/core` irgendetwas außerhalb von sich selbst.

## Neues System hinzufügen

Beispiel D&D 5e (Foundry-System `dnd5e`):

1. **Ordner** `systems/dnd5e/adapter/` mit `package.json` (Name z. B. `@vtf/dnd5e-adapter`) und `tsconfig.json` – Vorlage: `systems/dsa41/adapter/`. Der Workspace-Eintrag `systems/*/adapter` in der Haupt-`package.json` erfasst ihn von selbst.
2. **Adapter** `src/index.ts` exportiert einen `SystemAdapter`:
   - `id` (`dnd5e`), `label` (`D&D 5e`), `foundrySystem` (`dnd5e`), `blockLanguage` (z. B. `dnd-npc`, muss eindeutig sein)
   - `parse(source)` → `{ name, data, issues }`; `data: null`, wenn der Block unbrauchbar ist
   - `renderStatblock(block, opts)` → HTML für Obsidian und das Journal
   - `toActor(data, ctx)` → Actor-Daten: `data`/`dataOnCreate` als Punkt-Pfade unter `actor.system`, `items` (`BundleItem`)
   - `template()` → leerer Block als Codeblock mit `name:` in der ersten Zeile
   - Daten nur für die eigenen Foundry-Hooks (z. B. Zielwerte für Angriffe) gehören in `BundleItem.extra`; der Kern liest das Feld nie.
3. **Foundry-Teil** (optional) `src/foundry.ts` exportiert `FoundrySystemHooks`; Pflicht ist nur `actorType` (z. B. `npc`). Ohne Eintrag gilt `defaultHooks()`: erster Actor-Typ des Systems, Items nur über den Namen. Diese Datei darf keine großen Kataloge importieren – sie landet im Foundry-Modul.
4. **Eintragen**: `dnd5eAdapter` in `adapters.ts`, `'dnd5e': dnd5eFoundryHooks` in `foundry-hooks.ts`.
5. **Prüfen**: `npm test` prüft den neuen Adapter automatisch (Vorlage lesbar, Wertekasten, Actor), dazu eigene Tests unter `systems/dnd5e/adapter/test/`. `npm run typecheck` findet den Ordner über seine `tsconfig.json` von selbst, `npm run build` baut ihn über die Registries mit.

Werkzeuge rund um ein System (z. B. der DSA-NSC-Generator unter `dsa41/nsc-generator*`) sind eigene Programme mit eigenem Build; Vault to Foundry kennt sie nicht und ein System braucht keins.

Pro Vault ist ein System aktiv (Obsidian: Einstellungen → Inhalt → Spielsystem für NSC-Blöcke). Das Foundry-Modul überspringt NSCs, deren System nicht zur Welt passt.

## Systeme

- [`dsa41/`](dsa41/README.md) – Das Schwarze Auge 4.1, Foundry-System `dsa-41`.
