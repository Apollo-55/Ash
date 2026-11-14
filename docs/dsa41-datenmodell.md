# Datenmodell des Systems dsa-41 (v13.1.4)

Quelle: [gitlab.com/foundry-vtt-dsa/dsa-4.1-core/dsa-4.1-system](https://gitlab.com/foundry-vtt-dsa/dsa-4.1-core/dsa-4.1-system), Tag `v13.1.4`. Diese Notizen halten fest, worauf sich der Adapter in `systems/dsa41/adapter/` stützt.

- `system.json`: `id: dsa-41`, `compatibility: { minimum: 13, verified: 13, maximum: 13 }`. **Das System läuft nur auf Foundry v13.** Das Modul zielt deshalb auf v13.
- `template.json` ist nur ein Typ-Gerüst. Die Felder stehen in TypeDataModel-Klassen unter `src/module/data/` (Registrierung: `data/data-models.ts`).
- Kompendien liegen als YAML-Quellen in `src/packs/<name>/*.yml` und werden beim Build zu LevelDB.

## Actor-Typen

Es gibt nur **`character`**. Helden, NSCs und Kreaturen nutzen alle diesen Typ. Ein eigener NSC- oder Monster-Typ existiert nicht.

## Feldpfade (alle unter `system.`)

### Eigenschaften: `base.basicAttributes.<key>.value`

| DSA | key |
|---|---|
| MU | `courage` |
| KL | `cleverness` |
| IN | `intuition` |
| CH | `charisma` |
| FF | `dexterity` |
| GE | `agility` |
| KO | `constitution` |
| KK | `strength` |

Ein Feld für SO gibt es nicht. Es gibt nur `background.social.socialStatus.value`.

### Energien: `base.resources.<key>.{value,max,min}`

| DSA              | key                                                                           |
| ---------------- | ----------------------------------------------------------------------------- |
| LeP              | `vitality`                                                                    |
| AuP              | `endurance`                                                                   |
| AsP              | `astralEnergy` (zusätzlich `settings.hasAstralEnergy`/`showAstralTab` = true) |
| KaP              | `karmicEnergy` (zusätzlich `settings.hasKarmicEnergy`/`showKarmicTab` = true) |
| Schicksalspunkte | `special.resources.fatePoints`                                                |

`max` wird **gespeichert, nicht berechnet**. Der Import setzt `max`. `value` wird nur beim ersten Anlegen gesetzt (= max) und bleibt danach Spielzustand.

### Kampf- und abgeleitete Werte

| DSA        | Pfad                                                                                                                              | automatisch berechnet? (Schalter in `settings.`) |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| AT-Basis   | `base.combatAttributes.active.baseAttack.value`                                                                                   | `autoCalcBaseAttack`, (MU+GE+KK)/5               |
| PA-Basis   | `…active.baseParry.value`                                                                                                         | `autoCalcBaseParry`, (IN+GE+KK)/5                |
| FK-Basis   | `…active.baseRangedAttack.value`                                                                                                  | `autoCalcBaseRangedAttack`, (IN+FF+KK)/5         |
| INI-Basis  | `…active.baseInitiative.value`                                                                                                    | `autoCalcInitiative`, (MU+MU+IN+GE)/5            |
| Ausweichen | `…active.dodge.value`                                                                                                             | `autoCalcDodge`, PA-Basis − BE + Boni            |
| MR         | `…passive.magicResistance.value`, Zuschlag: `base.combatAttributes.additionalMR` (Block: `MR-Mod`)                               | `autoCalcMagicResistance`, (MU+KL+KO)/5 + `mrmod` der `species`-/`culture`-/`profession`-Items + Hohe MR − Niedrige MR + `additionalMR` |
| WS         | `…passive.woundThresholds.{first,second,third,mod}`                                                                               | `autoCalcWoundThresholds`, KO/2, KO, KO·1,5      |
| GS         | `base.movement.speed.value`                                                                                                       | `autoCalcSpeed`                                  |
| RS         | **kein gespeichertes Feld.** Summe der angelegten `armor`-Items + `modifiers.additionalRS` + Vorteil „Natürlicher Rüstungsschutz“ | immer berechnet                                  |
| BE         | **kein setzbares Feld.** Summe `encumbrance` (Zonen: `zonedEncumbrance`) der angelegten `armor`-Items + `load.encumbrance` (Last, wird vom System bei jedem Laden neu berechnet) | immer berechnet; Import: Rüstung `{ name, RS, BE }` |

Folge für den Import: Ein im Block angegebener Wert für MR, INI, GS, WS oder Ausweichen wird gesetzt **und der zugehörige autoCalc-Schalter ausgeschaltet**. Fehlt er, bleibt die Automatik an. `RS` aus dem Block geht unverändert nach `modifiers.additionalRS` und gilt zusätzlich zu den angelegten `armor`-Items. `MR-Mod` geht nach `base.combatAttributes.additionalMR`; alle MR-Zuschläge (Rasse, Kultur, Profession, Vor-/Nachteile, `additionalMR`) hängt das System erst **nach** der Berechnung an (`ruleset.after(ComputeMagicResistance)`) – bei ausgeschalteter Automatik bleibt der feste Wert unverändert, die Zuschläge verfallen. INI ebenso: `inimod` von `species`- und `profession`-Items nur bei `autoCalcInitiative`.

### Rasse und Kultur: Items `species` und `culture`

Rasse und Kultur sind eingebettete Items (Kompendien `species`, `culture` und die Varianten `uthuria*`, `myranor*`, `darkage*`). Felder: `sid` (`species-mittellaender`, `culture-festumer-ghetto`), `mrmod` (beide), `inimod` (nur `species`; `profession`-Items haben beide), `isUniquelyOwnable: true`. Der `preCreateItem`-Hook des Systems lehnt ein zweites Item mit derselben sid am selben Actor ab (nur Hinweis, kein Fehler) – deshalb leitet der Adapter die Item-ID vom Kompendiumsnamen ab, damit „Mittelländer“ und „Mittelländerin“ dasselbe Item ergeben. Die Namen tragen Geschlechtsformen („Mittelländer*in“, „Nivese/Nivesin“, „Zwerg*in - Ambosszwerge“); der Katalog kennt die Formen und Varianten als Alias (`identityVariants` in `catalog.ts`). Die Textfelder `background.species`/`.culture` setzt das System nicht automatisch; der Import schreibt den Blocktext hinein.

INI-Würfel (`+1W6`) sind nicht gespeichert. Sie kommen aus den Regeln (`ComputeInitiativeFormula`, z. B. Klingentänzer). Aus „INI 12+1W6“ wird nur die 12 übernommen.

## Talente, Waffen, Zauber, SF, Vor- und Nachteile: eingebettete Items

Alles davon sind **eingebettete Items**. Item-Typen:

`talent`, `combatTalent`, `language`, `scripture`, `spell`, `liturgy`, `advantage`, `disadvantage`, `specialAbility`, `meleeWeapon`, `rangedWeapon`, `shield`, `armor`, `genericItem`, `clothes`, `container`, `quiver`, `ammunition`, `species`, `culture`, `profession`, `alliance`, Myranor: `source`, `formula`, `formulaInstruction`.

Jedes Item hat eine stabile Kennung **`system.sid`** (z. B. `talent-sinnenschaerfe`, `talent-saebel`, `spell-blitz-dich-find`, `ability-finte`). Die Regeln suchen Items über die sid, nicht über den Namen (`actor.talent(sid)`).

| Was | Item-Typ | Wert-Feld |
|---|---|---|
| Talent | `talent` (Sprachen/Schriften: `language`/`scripture`) | `system.value` (TaW) |
| Kampftalent | `combatTalent` | `system.value` (TaW), Verteilung `system.combat.attack` / `system.combat.parry` (bzw. `rangedAttack`), `combat.category`: melee/ranged |
| Zauber | `spell` | `system.value` (ZfW) |
| Liturgie | `liturgy` | kein Wert |
| Vorteil/Nachteil | `advantage`/`disadvantage` | `system.value` (nullable, z. B. „Neid 8“) |
| Sonderfertigkeit | `specialAbility` | kein Wert, `system.type` (general, combat …) |
| Nahkampfwaffe | `meleeWeapon` | `system.talent` (= **sid** des Kampftalents), `damage` („1d6+4“), `weaponMod.{attack,parry}`, `initiativeMod`, `distanceClass`, `strengthMod`, `breakingFactor` |
| Fernkampfwaffe | `rangedWeapon` | `talent`, `damage`, `ranges`, `bonusDamages` |
| Rüstung | `armor` | `armorClass` bzw. `zonedArmorClass`, `equipped` |

### Wie AT/PA einer Waffe entstehen

```
AT(Waffe) = AT-Basis + combatTalent.system.combat.attack + weaponMod.attack − BE … (+ Manöver, SF, Schild)
PA(Waffe) = PA-Basis + combatTalent.system.combat.parry  + weaponMod.parry  − BE …
```

Auf der Waffe steht **kein AT/PA-Wert**. Für „Säbel AT 16 PA 18“ muss der Import also die Verteilung im Kampftalent so setzen, dass Foundry 16/18 ausrechnet: Das Modul legt den Actor an, liest die von Foundry berechneten Werte und gleicht die Differenz über `combat.attack/parry` aus. Führen zwei Waffen mit demselben Talent zu unterschiedlichen Werten, kommt der Rest in `weaponMod` der Waffe. So stimmen BE, SF und Regel-Einstellungen automatisch.

## Kompendien (Item-Pakete, Kopie per Name möglich)

Basis: `talent`, `combattalent`, `spell`, `liturgy`, `specialability`, `advantage`, `disadvantage`, `language`, `scripture`, `meleeweapon`, `rangedweapon`, `shield`, `armor`, `items`, `species`, `culture`, `profession`, `alliances`.

Varianten mit Präfix `darkage*`, `myranor*`, `eg_*`, `vtuu_*` und **`uthuria*`** (Rassen, Kulturen, Professionen, Nachteile, SF, Liturgien, Sprachen, Schriften, Nah-/Fernkampfwaffen, Schilde, Rüstungen, Gegenstände). Durchsucht werden zuerst die Basis-Pakete, dann `uthuria*`, dann die übrigen.

Paket-IDs in Foundry: `dsa-41.<name>`. Lookup: Name exakt (ohne Groß-/Kleinschreibung), dann normalisiert (Umlaute, Bindestriche), sonst Warnung. Waffen liegen in Unterordnern (`meleeweapon/sabers/…`), was für den Lookup egal ist.

## Biografie und Beschreibung

- **Biografie: `system.background.description`** (StringField mit HTML, Editor „Beschreibung“ im Reiter Beschreibung). Hier kommen Text und Rücklink auf das Journal hin.
- Kurzfelder (einzeilig): `background.species` (Block: `rasse`), `.culture` (`kultur`), `.profession` (`rolle`), `.background` (max. 240 Zeichen), `appearance.*`, `background.social.titles`.
- Bild: `img` (Porträt), `prototypeToken.texture.src` (Token). Primäres Token-Attribut: `base.resources.vitality`.
