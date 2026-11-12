# DSA 4.1 (Foundry-System `dsa-41`)

| Ordner | Inhalt |
|---|---|
| `adapter/` | `dsa-nsc`-Block (`schema.ts`), Namenskatalog der dsa-41-Kompendien (`catalog.ts`, `catalog.json`), Regeln wie SF-Ketten und Energien (`rules.ts`, `derived.ts`), Wertekasten (`render.ts`), Actor-Daten für den Export (`actor.ts`), Kampf-Zielwerte in `BundleItem.extra` (`combat.ts`), Foundry-Teil des Imports (`foundry.ts`: Actor-Typ `character`, Kompendien-Reihenfolge, Item-Erkennung über `sid`, AT/PA aus dem Block) |
| [`nsc-generator/`](nsc-generator/README.md) | NSC- und Kreatur-Generator: Seitensuche in den Regelwerken (`pages.ts`), gemeinsame Werkzeuge und Prüfung (`agent.ts`, `generate.ts`, `creature.ts`), Anbieter Claude (`cloud.ts`), OpenAI (`openai.ts`) und DeepSeek (`deepseek.ts`) |
| [`nsc-generator-plugin/`](nsc-generator-plugin/README.md) | Obsidian-Plugin „DSA-NSC-Generator“, eigener Build (`build.mjs`, `npm run build:generator`) – unabhängig von Vault to Foundry, nutzt nur den Adapter |
| `tools/` | `regelwerke.ts` (Seiten-Index aus `Regelwerke/*.pdf`, `npm run regelwerke`), `gen-catalog.mjs` (Namenskatalog neu erzeugen), `pruefen.ts` (alle `dsa-nsc`-Blöcke einer Vault prüfen), `eval.ts` (Modellvergleich, kostet Geld) |

Anleitungen: [docs/nsc-generator.md](../../docs/nsc-generator.md), [docs/dsa41-datenmodell.md](../../docs/dsa41-datenmodell.md).
