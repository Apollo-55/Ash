# Spielsysteme

Alles, was von einem Spielsystem abhängt, liegt hier – je System ein Ordner. Der Rest des Projekts (`packages/`) kennt kein System und spricht nur über zwei Schnittstellen mit ihm:

| Schnittstelle | Datei | Wofür |
|---|---|---|
| `SystemAdapter` | `packages/core/src/systems/adapter.ts` | NSC-Block lesen und prüfen, Wertekasten (Obsidian und Journal), Actor-Daten für den Export, Vorlage |
| `FoundrySystemHooks` | `packages/foundry-module/src/system-hooks.ts` | Actor-Typ, Reihenfolge der Kompendien, Item-Erkennung, Nacharbeiten nach dem Import (z. B. AT/PA) |

Eingehängt werden Systeme an genau zwei Stellen: `packages/obsidian-plugin/src/systems.ts` und `packages/foundry-module/src/systems.ts` (dazu die Kommandozeilen-Werkzeuge `tools/export-cli.ts`, `tools/sync-cli.ts`).

## Systeme

- [`dsa41/`](dsa41/README.md) – Das Schwarze Auge 4.1, Foundry-System `dsa-41`.
