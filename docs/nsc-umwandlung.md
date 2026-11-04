# NSC-Umwandlung der Uthuria-Vault (2026-11-03)

Einmalige Umwandlung aller Charakter- und Begegnungsnotizen in `dsa-nsc`-Blöcke. Skript: `systems/dsa41/tools/nsc-umwandlung/umwandeln.py` (reproduzierbar). Prüfung der Namen: `node systems/dsa41/tools/nsc-umwandlung/pruefen.ts <vault>`. Prüfung der SF-Voraussetzungen: `python3 systems/dsa41/tools/nsc-umwandlung/sf_check.py`.

**Überarbeitung (2. Durchgang):** Talente, SF, Vor- und Nachteile, Liturgien und Zauber folgen jetzt den Professionen in *Wege der Helden* (Pakete, Varianten, automatische Vor- und Nachteile). Liturgien sind nach Gottheit und Grad aus dem *Liber Liturgium*, Zauber nach Tradition (Haindruide, Akademie Punin). Die SF-Voraussetzungen stammen aus *Wege der Helden*, weil die PDF von *Wege des Schwerts* keinen lesbaren Text enthält. Mit `--force` ersetzt das Skript bereits vorhandene Blöcke an Ort und Stelle.

```bash
python3 systems/dsa41/tools/nsc-umwandlung/umwandeln.py <vault> --dry-run   # zeigt nur, was passieren würde
python3 systems/dsa41/tools/nsc-umwandlung/umwandeln.py <vault>             # schreibt; Notizen mit vorhandenem Block bleiben unberührt
```

Alte Wertezeilen (z. B. „Seefahrt (TaW 17, 15/15/15)“) werden durch den Block ersetzt. Beschreibungen, Gerüchte, Bilder und Giftbeschreibungen bleiben stehen. Fehlt eine erwartete alte Zeile, bleibt die Notiz unverändert und das Skript meldet es.

## Regeln

- **Rechenwerte:** Keine MR, INI, GS, WS, Ausweichen und kein AT/PA im Block. Das System rechnet sie aus Eigenschaften, Talenten und SF, auch wenn das von den alten Notizen abweicht.
- **Kampftalent aus altem AT/PA:** TaW = (AT − AT-Basis) + (PA − PA-Basis), mit dem Waffenmodifikator der Kompendiumwaffe. Das System verteilt den TaW wieder gleichmäßig.
- **Eigenschaften** aus den Probenwerten der Notizen (z. B. Seefahrt FF/GE/KK 15/15/15, Liturgiekenntnis MU/IN/CH 17/15/14), sonst passend zu Rolle und Beschreibung.
- **LeP/AuP/AsP/KaP:** Werte aus der Notiz, wo vorhanden. Sonst Basis nach DSA 4.1 (LeP (KO+KO+KK)/2 + 10, AuP (MU+KO+GE)/2 + 10) plus etwas Zugekauftes. AsP bei Vollzauberern um 38. KaP nach Kirche: Praios 24 Basis (Praiodan 32), Kor und Nandus als nichtalveranische Götter nur 12 Basis (Haargh 18, Zulhaminja 14).
- **Ausnahme Kreatur:** Die Riff-Hydra behält feste Werte (GS, INI, Biss AT 15 / PA 0), weil die Menschen-Formeln nicht passen. LeP/RS/MR sind geschätzt.
- Alle Namen stehen so in den dsa-41-Kompendien (geprüft: 0 Fehler, 0 Warnungen).

## Übersicht

| NSC | Profession (Quelle) | Aus der Backstory abgeleitet |
|---|---|---|
| Aschanka Malefsunni | Wundärztin (WdH 154) | Akoluth (Marbo), Resistenz gegen Krankheiten, Heilkunde-Werte aus der Notiz |
| Darion Pulverberg | Seefahrer/Navigator (WdH 132 f.), früher Schmuggler | Seefahrt 17, Gassenwissen 14, Sternkunde, Schleichen; Loyalität |
| Dioptus aus Zwerch | Söldner/Artillerist (WdH 117) | Geschützmeister, Rechnen/Mechanik aus der Notiz, Kleinwüchsig, Feste Gewohnheit |
| Ebba | Seefahrerin mit Kochen (frei) | Kochen 15, Fischen, Fleischer |
| Kapitän Persiphone von Rethis | Seefahrerin/Kapitänin (frei) | Seefahrt 17, Kriegskunst, Überzeugen, Aufmerksamkeit |
| Leta Sjenskoje | Handwerkerin/Schiffszimmerfrau (WdH 150) | Halbelfe, Viertelzauberin, Meisterhandwerk, Balance, Meister der Improvisation |
| Shahane ay Zedrakin | alter Wertekasten | + Betören, Handel, Sich Verkleiden (Hochstaplerin, Belkelel) |
| Sjadjana die Brutale | Seefahrerin/Pirat (WdH 132), aus Chorhop | Entermesser, Peitsche, Wurfmesser; Jähzorn, Goldgier, Unangenehme Stimme |
| Haargh-Ma-Mu | Kor-Geweihte nach Spätweihe (WdH 227) | Kor-Liturgien (Liber Liturgium), Moralkodex, fehlender Finger = Weiheopfer, Meeresangst |
| Praiodan von Luring | Praios-Geweihter (WdH 207) | 14 Praios-Liturgien bis Grad IV, Moralkodex 12 statt Prinzipientreue, Rechtskunde 16, Sternkunde 15 |
| Zulhaminja saba Zulyoya | Nandus-Geweihte (WdH 228) | Nandus-Liturgien, Akad. Ausbildung (Gelehrter), Neugier, Impulsiv, Nanduria |
| Frederik Narciso | Großwildjäger (WdH 127) | Scharfschütze/Schnellladen (Armbrust), Waldkundig, Gefahreninstinkt, Feste Gewohnheit |
| Mario Du'laces | Jäger (frei) | Speer, Kurzbogen, Scharfschütze (Bogen) |
| Pesimor von Drol | Söldner (frei) | Kriegshammer, Wuchtschlag, Niederwerfen, Zäher Hund |
| Sir Rondrigo von Talfenn | Ritter (WdH 107) | Prinzipientreue 10 (Ritterkodex), Reiterkampf, Hammerschlag, Meisterparade, Schlafstörung, Einbildungen |
| Valeriano di Salsavarda | Schwertgeselle nach Fedorino, Vinsalter Vaganten (WdH 110) | Rapier + Linkhand, SF-Kette bis Klingentänzer, Schulden/Arroganz/Eitelkeit (automatisch), Gesucht |
| Arvid Frenhilddotter | Haindruide (WdH 160) | Druidenzauber (Eins mit der Natur, Herr über das Tierreich …), Unverträglichkeit mit verarbeitetem Metall, Speisegebote |
| Ralio Derenvay | Gildenmagier, Academia der Hohen Magie Punin (WdH 173 f.) | Zauber aus der Notiz + Puniner Lehrplan (Klarum Purum, Abvenenum …), Lehren 11 (Magister) |
| Topasa | Handwerkerin/Grobschmiedin, zwergisch (WdH 150 f.) | Grobschmied 16, Metallguss, Hitzeresistenz, Gerechtigkeitswahn, Meeresangst |
| Vittorio di Belhanka | Entdecker (WdH 124) | Kartographie 15, Malen/Zeichnen 14, Schauspielerei, Aberglaube (Aves) |
| Die Viper | alter Wertekasten | + Linkhand, Aufmerksamkeit (Voraussetzungen für Beidhändiger Kampf I / Ausweichen II) |
| Schattenweber | alter Wertekasten | + Ritualkenntnis, Stabzauber |
| Vollstrecker | alter Wertekasten | + Dolche, Wurfmesser |
| Thalassische Riff-Hydra | Kreatur | feste Werte |

Nicht umgewandelt: die Zufallstabellen (Meeresungeheuer, Maritime Völker, Schiffe, Besondere Ereignisse). Sie nennen nur Namen, keine Gegner.
