# NSC-Umwandlung der Uthuria-Vault (2026-11-03)

Einmalige Umwandlung aller Charakter- und Begegnungsnotizen in `dsa-nsc`-Blöcke. Skript: `tools/nsc-umwandlung/umwandeln.py` (reproduzierbar). Prüfung: `node tools/nsc-umwandlung/pruefen.ts <vault>`.

```bash
python3 tools/nsc-umwandlung/umwandeln.py <vault> --dry-run   # zeigt nur, was passieren würde
python3 tools/nsc-umwandlung/umwandeln.py <vault>             # schreibt; Notizen mit vorhandenem Block bleiben unberührt
```

Alte Wertezeilen (z. B. „Seefahrt (TaW 17, 15/15/15)“) werden durch den Block ersetzt. Beschreibungen, Gerüchte, Bilder und Giftbeschreibungen bleiben stehen. Fehlt eine erwartete alte Zeile, bleibt die Notiz unverändert und das Skript meldet es.

## Regeln

- **Rechenwerte:** Keine MR, INI, GS, WS, Ausweichen und kein AT/PA im Block. Das System rechnet sie aus Eigenschaften, Talenten und SF, auch wenn das von den alten Notizen abweicht.
- **Kampftalent aus altem AT/PA:** TaW = (AT − AT-Basis) + (PA − PA-Basis), mit dem Waffenmodifikator der Kompendiumwaffe. Das System verteilt den TaW wieder gleichmäßig.
- **Eigenschaften** aus den Probenwerten der Notizen (z. B. Seefahrt FF/GE/KK 15/15/15, Liturgiekenntnis MU/IN/CH 17/15/14), sonst passend zu Rolle und Beschreibung.
- **LeP/AuP/AsP/KaP:** Werte aus der Notiz, wo vorhanden. Sonst Basis nach DSA 4.1 (LeP (KO+KO+KK)/2 + 10, AuP (MU+KO+GE)/2 + 10) plus etwas Zugekauftes. AsP bei Vollzauberern um 38, KaP bei Geweihten 26 bis 40.
- **Ausnahme Kreatur:** Die Riff-Hydra behält feste Werte (GS, INI, Biss AT 15 / PA 0), weil die Menschen-Formeln nicht passen. LeP/RS/MR sind geschätzt.
- Alle Namen stehen so in den dsa-41-Kompendien (geprüft: 0 Fehler, 0 Warnungen).

## Übersicht

| NSC | Notiz | Kern | Woher die Werte |
|---|---|---|---|
| Aschanka Malefsunni | Besatzung | Heilkunde Wunden 13, Krankheiten 15, Dolch | Probenwerte aus der Notiz; Heilsegen nur als Notiz (nicht geweiht) |
| Darion Pulverberg | Besatzung | Seefahrt 17, Gassenwissen 14, Entermesser | Probenwerte aus der Notiz |
| Dioptus aus Zwerch | Besatzung | Belagerungswaffen 17 (→ FK 25), Rechnen 17, Mechanik 16 | Probenwerte aus der Notiz |
| Ebba | Besatzung | Kochen 14, Fleischerbeil | frei ergänzt (Notiz war leer) |
| Kapitän Persiphone von Rethis | Besatzung | Seefahrt 16, Säbel 14 | frei ergänzt (Notiz war leer) |
| Leta Sjenskoje | Besatzung | Zimmermann 16, Bogenbau 12, Viertelzauberin (Bannbaladin 3) | Probenwerte aus der Notiz |
| Shahane ay Zedrakin | Besatzung | Säbel 18, Raufen 19 (Orchidee), Menschenkenntnis 18 | alter Wertekasten; TaW aus AT/PA |
| Sjadjana die Brutale | Besatzung | Seefahrt 14, Entermesser, Peitsche | frei ergänzt |
| Haargh-Ma-Mu | Geweihte | Kor, Infanteriewaffen 21 (Korspieß), LkW 9, 6 Liturgien | AT 23/PA 16 → TaW 21; Proben 17/15/14 |
| Praiodan von Luring | Geweihte | Praios, LkW 14, Rechtskunde 16, Sternkunde 15, 7 Liturgien | frei ergänzt nach Beschreibung |
| Zulhaminja saba Zulyoya | Geweihte | Nandus, LkW 6, 3 Liturgien | Proben 13/13/13 |
| Frederik Narciso | Krieger | Eisenwalder (Armbrust 15), Schwert | frei ergänzt |
| Mario Du'laces | Krieger | Speer, Kurzbogen | frei ergänzt (nur Name in der Notiz) |
| Pesimor von Drol | Krieger | Kriegshammer | frei ergänzt (nur Name in der Notiz) |
| Sir Rondrigo von Talfenn | Krieger | Zweihänder (TaW 24) | AT 25/PA 17 → TaW 24 |
| Valeriano di Salsavarda | Krieger | Rapier + Linkhand, Fechtwaffen 20, Klingentänzer | frei ergänzt nach Beschreibung |
| Arvid Frenhilddotter | Magier | Druide, 9 Zauber (Tiere besprechen, Sanftmut …) | frei ergänzt |
| Ralio Derenvay | Magier | Odem 12, Analys 12, Oculus 9 + 5 weitere, Pflanzenkunde 16 | Werte aus der Notiz + ergänzt |
| Topasa | Spezialisten | Zwergin, Grobschmied 16, Schmiedehammer | frei ergänzt |
| Vittorio di Belhanka | Spezialisten | Kartographie 15, Malen/Zeichnen 14, Florett | frei ergänzt nach Beschreibung |
| Die Viper | Alanfaner Sabotage | Schwerter 18 (zwei Schwerter), Iryanrüstung | alter Wertekasten; TaW aus AT/PA |
| Schattenweber | Alanfaner Sabotage | Stäbe 12, 9 Zauber, AsP 64 | alter Wertekasten |
| Vollstrecker | Alanfaner Sabotage | Schwerter 15, Linkhand | alter Wertekasten |
| Thalassische Riff-Hydra | Singende Inseln | Biss AT 15 / PA 0, 2W6+4 | Kreatur, feste Werte |

Nicht umgewandelt: die Zufallstabellen (Meeresungeheuer, Maritime Völker, Schiffe, Besondere Ereignisse). Sie nennen nur Namen, keine Gegner.
