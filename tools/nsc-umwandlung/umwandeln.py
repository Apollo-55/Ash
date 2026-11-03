#!/usr/bin/env python3
"""
Converts the NPC notes of the Uthuria vault into dsa-nsc blocks (one-off conversion, reproducible).

Usage:
  python3 tools/nsc-umwandlung/umwandeln.py <vault-dir> [--dry-run] [--force]

- Old stat lines listed under "remove" are replaced by the block (the block goes where the first of them was).
- Notes without old stats get the block at the end (or after a given line).
- A note that already contains a ```dsa-nsc block is skipped, unless --force (then existing blocks are replaced).
- If an expected old line is not found, the note is left untouched and reported.
Rules for the values: see docs/nsc-umwandlung.md
"""
import re
import sys
from pathlib import Path

# ----------------------------------------------------------------------------------------------
# Blocks
# ----------------------------------------------------------------------------------------------

ASCHANKA = """name: Aschanka Malefsunni
rolle: Schiffsärztin
eigenschaften: { MU: 14, KL: 14, IN: 13, CH: 14, FF: 14, GE: 12, KO: 11, KK: 10 }
LeP: 27
AuP: 29
waffen: [Dolch]
talente: { Heilkunde Wunden: 13, Heilkunde Krankheiten: 15, Heilkunde Gift: 9, Heilkunde Seele: 7, Anatomie: 8, Pflanzenkunde: 9, Götter/Kulte: 8, Menschenkenntnis: 7, Selbstbeherrschung: 6, Sinnenschärfe: 5, Dolche: 5 }
vorteile: [Gutes Gedächtnis]
nachteile: [Prinzipientreue 6]
sonderfertigkeiten: ["Kulturkunde (Tulamidenlande)"]
notiz: "Ehemalige Akoluthin der Marbo. Göttliche Begabung: Heilsegen (LkW 10) – nicht geweiht, daher keine Liturgie. Arbeitet gern mit Blutegeln."
"""

DARION = """name: Darion Pulverberg
rolle: Navigator
eigenschaften: { MU: 13, KL: 15, IN: 15, CH: 15, FF: 15, GE: 15, KO: 14, KK: 15 }
LeP: 34
AuP: 34
waffen: [Entermesser]
talente: { Säbel: 10, Raufen: 8, Seefahrt: 17, Gassenwissen: 14, Orientierung: 12, Wettervorhersage: 10, Boote Fahren: 10, Sternkunde: 8, Schwimmen: 8, Klettern: 7, Menschenkenntnis: 8, Zechen: 6 }
vorteile: [Richtungssinn]
nachteile: [Loyalität]
sonderfertigkeiten: [Meereskundig, Ortskenntnis]
notiz: "Ortskenntnis Ghurenia, kennt Schmugglerverstecke. Früher Schmuggler im Dienst des Prasi Melekmar, Stoerrebrandt treu ergeben."
"""

DIOPTUS = """name: Dioptus aus Zwerch
rolle: Geschützmeister
eigenschaften: { MU: 11, KL: 17, IN: 16, CH: 10, FF: 15, GE: 12, KO: 11, KK: 11 }
LeP: 27
AuP: 27
waffen: [Dolch]
talente: { Belagerungswaffen: 17, Dolche: 4, Rechnen: 17, Mechanik: 16, Feinmechanik: 12, Sternkunde: 10, Kartographie: 8, Schriftlicher Ausdruck: 8, Sinnenschärfe: 8, Seefahrt: 6 }
vorteile: [Gutes Gedächtnis, Entfernungssinn]
nachteile: [Kleinwüchsig, Feste Gewohnheit]
sonderfertigkeiten: [Geschützmeister]
notiz: "Pedantisch, schreibt alles auf. Benutzt optische Geräte zum Zielen."
"""

EBBA = """name: Ebba
rolle: Smutje
eigenschaften: { MU: 12, KL: 10, IN: 12, CH: 11, FF: 13, GE: 11, KO: 14, KK: 14 }
LeP: 33
AuP: 31
waffen: [Fleischerbeil, Messer]
talente: { Hiebwaffen: 8, Dolche: 7, Raufen: 8, Kochen: 14, Fischen/Angeln: 10, Hauswirtschaft: 8, Zechen: 10, Seefahrt: 6, Menschenkenntnis: 6, Sinnenschärfe: 6 }
notiz: "Werte frei ergänzt – die Notiz hatte noch keine Angaben."
"""

PERSIPHONE = """name: Kapitän Persiphone von Rethis
rolle: Kapitän
eigenschaften: { MU: 15, KL: 13, IN: 14, CH: 15, FF: 12, GE: 13, KO: 13, KK: 12 }
LeP: 33
AuP: 34
waffen: [Säbel]
talente: { Säbel: 14, Raufen: 8, Seefahrt: 16, Orientierung: 12, Wettervorhersage: 12, Sternkunde: 10, Kriegskunst: 10, Menschenkenntnis: 12, Überzeugen: 12, Etikette: 10, Schwimmen: 8 }
vorteile: [Richtungssinn]
sonderfertigkeiten: [Meereskundig, Finte, Ausweichen I]
notiz: "Werte frei ergänzt – die Notiz hatte noch keine Angaben."
"""

LETA = """name: Leta Sjenskoje
rolle: Zimmerfrau
eigenschaften: { MU: 13, KL: 12, IN: 13, CH: 15, FF: 15, GE: 13, KO: 13, KK: 15 }
LeP: 31
AuP: 30
AsP: 7
waffen: [Beil]
talente: { Hiebwaffen: 8, Raufen: 7, Zimmermann: 16, Bogenbau: 12, Holzbearbeitung: 14, Betören: 12, Überreden: 8, Menschenkenntnis: 7, Klettern: 8, Zechen: 8, Seefahrt: 5 }
zauber: { Bannbaladin: 3 }
vorteile: [Viertelzauberer, Meisterhandwerk, Gut Aussehend]
nachteile: [Brünstigkeit 6]
sonderfertigkeiten: ["Kulturkunde (Bornland)"]
notiz: "Halbelfe, 22. Meisterhandwerk: Zimmermann, Bogenbau."
"""

SHAHANE = """name: Shahane ay Zedrakin
rolle: Proviantmeisterin
eigenschaften: { MU: 14, KL: 14, IN: 15, CH: 13, FF: 12, GE: 13, KO: 13, KK: 11 }
SO: 6
LeP: 36
AuP: 37
RS: 0
waffen: [Säbel, Orchidee]
talente: { Säbel: 18, Raufen: 19, Selbstbeherrschung: 7, Sinnenschärfe: 10, Menschenkenntnis: 18, Überreden: 17 }
vorteile: [Soziale Anpassungsfähigkeit]
nachteile: { Brünstigkeit: 6, Eitelkeit: 7, Neid: 8 }
sonderfertigkeiten: [Aufmerksamkeit, Ausweichen I, Ausweichen II, Improvisierte Waffen, Finte, "Waffenlose Kampftechnik: Mercenario"]
notiz: "Seelentier: Schakal. Paktgeschenke: Brünstigkeit erzeugen, Lamijah, Befehl des Lamijah, Dämonische Hilfe (Herbeirufung eines Muwallaraan). Überreden (Lügen) 19. Ausrüstung: Säbel, Orchidee, einfache Kleidung."
"""

SJADJANA = """name: Sjadjana die Brutale
rolle: Erster Maat
eigenschaften: { MU: 14, KL: 11, IN: 14, CH: 12, FF: 11, GE: 12, KO: 15, KK: 15 }
LeP: 36
AuP: 34
waffen: [Entermesser, Peitsche]
talente: { Säbel: 12, Peitsche: 8, Raufen: 12, Seefahrt: 14, Sinnenschärfe: 12, Menschenkenntnis: 10, Zechen: 12, Klettern: 10, Schwimmen: 8, Gassenwissen: 8, Überzeugen: 8 }
nachteile: [Jähzorn 6, Unangenehme Stimme]
sonderfertigkeiten: [Meereskundig, Wuchtschlag]
notiz: "Stammt aus Chorhop, Goldzahn, flucht ständig."
"""

HAARGH = """name: Haargh-Ma-Mu
rolle: Geweihte des Kor
eigenschaften: { MU: 17, KL: 11, IN: 15, CH: 14, FF: 12, GE: 14, KO: 15, KK: 16 }
LeP: 38
AuP: 36
KaP: 30
waffen: [Korspieß]
talente: { Infanteriewaffen: 21, Raufen: 10, Liturgiekenntnis (Kor): 9, Körperbeherrschung: 10, Selbstbeherrschung: 12, Sinnenschärfe: 9, Wildnisleben: 10, Fährtensuchen: 7, Kriegskunst: 6, Garethi: 6, Tulamidya: 6 }
liturgien: [Blutschwur, Trophäe erhalten, Lohn der Unverzagten, Segnung der Schlacht, Schutzsegen, Eidsegen]
vorteile: [Geweiht, Eisern]
nachteile: [Meeresangst 6]
sonderfertigkeiten: [Liturgiekenntnis, Kampfreflexe, Wuchtschlag, Niederwerfen, Aufmerksamkeit]
notiz: "Utulu, ein Finger der linken Hand fehlt, spricht schlecht Garethi und Tulamidya."
"""

PRAIODAN = """name: Praiodan von Luring
rolle: Praios-Geweihter, Richter
eigenschaften: { MU: 15, KL: 15, IN: 14, CH: 15, FF: 11, GE: 11, KO: 13, KK: 12 }
LeP: 31
AuP: 30
KaP: 40
waffen: [Sonnenszepter]
talente: { Hiebwaffen: 10, Liturgiekenntnis (Praios): 14, Rechtskunde: 16, Götter/Kulte: 14, Sternkunde: 15, Menschenkenntnis: 14, Überzeugen: 13, Etikette: 12, Geschichtswissen: 10, Philosophie: 10, Lehren: 9, Selbstbeherrschung: 12, Zechen: 6 }
liturgien: [Eidsegen, Wille zur Wahrheit, Licht des Herrn, Praios’ Mahnung, Unantastbarkeit des Richters, Praios’ Magiebann, Seelenprüfung]
vorteile: [Geweiht, Guter Ruf]
nachteile: [Prinzipientreue 8, Neugier 6]
sonderfertigkeiten: [Liturgiekenntnis, "Kulturkunde (Mittelreich)"]
notiz: "Anfang 50, Narbe am Hals (Orkpfeil). Versierter Astronom."
"""

ZULHAMINJA = """name: Zulhaminja saba Zulyoya
rolle: Geweihte des Nandus
eigenschaften: { MU: 13, KL: 14, IN: 13, CH: 13, FF: 12, GE: 13, KO: 11, KK: 10 }
LeP: 26
AuP: 29
KaP: 26
waffen: [Dolch]
talente: { Dolche: 5, Liturgiekenntnis (Nandus): 6, Sprachenkunde: 10, Geschichtswissen: 9, Sagen/Legenden: 9, Magiekunde: 7, Götter/Kulte: 8, Rechnen: 8, Philosophie: 6, Schriftlicher Ausdruck: 7, Überreden: 6, Tulamidya: 12, Garethi: 10 }
liturgien: [Nandus’ Schriftkenntnis, Weisheitssegen, Schrifttum ferner Lande]
vorteile: [Geweiht, Gebildet]
nachteile: [Neugier 8, Impulsiv]
sonderfertigkeiten: [Liturgiekenntnis, "Kulturkunde (Tulamidenlande)"]
notiz: "19, aus Fasar, übermütig."
"""

FREDERIK = """name: Frederik Narciso
rolle: Monsterjäger
bild: Pasted image 20251024221703.jpg
token: token_Frederik_Narciso.png
verknüpft: ja
eigenschaften: { MU: 15, KL: 13, IN: 14, CH: 11, FF: 15, GE: 13, KO: 15, KK: 14 }
LeP: 36
AuP: 36
waffen: [Eisenwalder, Schwert]
rüstung: [Lederharnisch]
talente: { Armbrust: 15, Schwerter: 12, Raufen: 8, Fährtensuchen: 13, Fallenstellen: 11, Tierkunde: 12, Magiekunde: 8, Sagen/Legenden: 10, Wildnisleben: 11, Sinnenschärfe: 12, Schleichen: 9, Sich Verstecken: 8, Selbstbeherrschung: 10 }
nachteile: [Feste Gewohnheit]
sonderfertigkeiten: ["Scharfschütze (Armbrust)", "Schnellladen (Armbrust)", Aufmerksamkeit, Kampfreflexe, Rüstungsgewöhnung I]
notiz: "Großgewachsen, wettergegerbt, pedantisch, hasst es zu improvisieren. Die Eisenwalder bekam er für einen getöteten Lindwurm."
"""

MARIO = """name: Mario Du'laces
rolle: Monsterjäger
bild: Pasted image 20260117152714.jpg
token: token_Mario.png
verknüpft: ja
eigenschaften: { MU: 13, KL: 11, IN: 13, CH: 11, FF: 13, GE: 14, KO: 13, KK: 13 }
LeP: 30
AuP: 30
waffen: [Speer, Kurzbogen]
rüstung: [Lederweste]
talente: { Speere: 12, Bogen: 10, Raufen: 7, Fährtensuchen: 9, Fallenstellen: 10, Wildnisleben: 9, Sinnenschärfe: 9, Schleichen: 8 }
sonderfertigkeiten: [Aufmerksamkeit]
notiz: "Begleiter von Frederik Narciso. Werte frei ergänzt."
"""

PESIMOR = """name: Pesimor von Drol
rolle: Monsterjäger
bild: Pasted image 20260117153301.jpg
token: token_Pesimor.png
verknüpft: ja
eigenschaften: { MU: 14, KL: 10, IN: 12, CH: 10, FF: 11, GE: 12, KO: 16, KK: 17 }
LeP: 38
AuP: 33
waffen: [Kriegshammer]
rüstung: ["Kettenhemd, Halbarm"]
talente: { Zweihand-Hiebwaffen: 13, Raufen: 10, Ringen: 8, Athletik: 10, Körperbeherrschung: 7, Selbstbeherrschung: 10, Wildnisleben: 8, Fährtensuchen: 6, Zechen: 10 }
nachteile: [Jähzorn 5]
sonderfertigkeiten: [Wuchtschlag, Niederwerfen, Rüstungsgewöhnung I]
notiz: "Begleiter von Frederik Narciso. Werte frei ergänzt."
"""

RONDRIGO = """name: Sir Rondrigo von Talfenn
rolle: Ritter, Schwurträger
eigenschaften: { MU: 16, KL: 12, IN: 14, CH: 11, FF: 11, GE: 13, KO: 14, KK: 16 }
LeP: 36
AuP: 32
waffen: [Zweihänder]
rüstung: ["Kettenhemd, lang"]
talente: { Zweihandschwerter/-säbel: 24, Raufen: 10, Reiten: 10, Kriegskunst: 12, Selbstbeherrschung: 15, Sinnenschärfe: 10, Körperbeherrschung: 8, Wildnisleben: 8, Etikette: 6, Götter/Kulte: 6 }
vorteile: [Eisern]
nachteile: [Schlafstörung, Einbildungen, Verpflichtungen]
sonderfertigkeiten: [Kampfreflexe, Wuchtschlag, Hammerschlag, Niederwerfen, Meisterparade, Rüstungsgewöhnung II, Aufmerksamkeit, "Kulturkunde (Svellttal)"]
notiz: "66 Jahre. Gebunden an einen vergessenen Schwur; redet mit seinen toten Kameraden. Früher notiert: Zweihandschwert AT 25 / PA 17."
"""

VALERIANO = """name: Valeriano di Salsavarda
rolle: Schwertgeselle
eigenschaften: { MU: 15, KL: 12, IN: 15, CH: 15, FF: 14, GE: 17, KO: 12, KK: 12 }
LeP: 30
AuP: 36
waffen: [Rapier, Linkhand]
talente: { Fechtwaffen: 20, Dolche: 14, Raufen: 8, Tanzen: 14, Betören: 14, Etikette: 12, Akrobatik: 10, Körperbeherrschung: 12, Menschenkenntnis: 10, Überreden: 10, Singen: 8, Musizieren: 6, Zechen: 8, Gassenwissen: 7 }
vorteile: [Gut Aussehend, Flink]
nachteile: [Eitelkeit 6, Schulden, Gesucht]
sonderfertigkeiten: [Ausweichen I, Ausweichen II, Finte, Gezielter Stich, Todesstoß, Meisterparade, Klingentänzer, Linkhand, Parierwaffen I, "Kulturkunde (Horasreich)"]
notiz: "Der Pfau. Kopfgeld von Don Calleri (600 D für den Kopf, 500 je Hand). Hohe Schulden bei der Nordlandbank."
"""

ARVID = """name: Arvid Frenhilddotter
rolle: Druide
eigenschaften: { MU: 14, KL: 12, IN: 15, CH: 15, FF: 11, GE: 12, KO: 14, KK: 13 }
LeP: 31
AuP: 30
AsP: 38
waffen: [Vulkanglasdolch]
talente: { Dolche: 8, Tierkunde: 14, Pflanzenkunde: 12, Wildnisleben: 12, Sinnenschärfe: 9, Heilkunde Wunden: 8, Überreden: 10, Überzeugen: 8, Thorwalsch: 14, Garethi: 8 }
zauber: { Tiere besprechen: 12, Sanftmut: 12, Herr über das Tierreich: 8, Krähenruf: 7, Bannbaladin: 10, Böser Blick: 6, Balsam Salabunde: 9, Abvenenum reine Speise: 8, Weisheit der Bäume: 6 }
vorteile: [Vollzauberer, Tierfreund]
nachteile: [Speisegebote]
sonderfertigkeiten: [Druidische Dolchrituale, Druidische Herrschaftsrituale, "Kulturkunde (Thorwal)"]
notiz: "54, Thorwaler, versucht andere zu überreden, vegetarisch zu leben."
"""

RALIO = """name: Ralio Derenvay
rolle: ehem. Akademiemagister aus Punin
eigenschaften: { MU: 12, KL: 16, IN: 14, CH: 12, FF: 13, GE: 11, KO: 12, KK: 10 }
LeP: 27
AuP: 28
AsP: 38
waffen: [Magierstab]
talente: { Stäbe: 8, Magiekunde: 10, Heilkunde Gift: 13, Alchimie: 11, Pflanzenkunde: 16, Tierkunde: 15, Geschichtswissen: 8, Philosophie: 9, Rechnen: 10, Sprachenkunde: 8, Bosparano: 12, Garethi: 14 }
zauber: { Odem Arcanum: 12, Analys Arkanstruktur: 12, Oculus Astralis: 9, Klarum Purum: 9, Penetrizzel Tiefenblick: 7, Exposami Lebenskraft: 6, Armatrutz: 6, Silentium: 5 }
vorteile: [Vollzauberer, Akademische Ausbildung Magier]
nachteile: [Neugier 6]
sonderfertigkeiten: [Astrale Meditation]
notiz: "43, gebildet, melancholisch, Skeptiker. Alchimie mit Schwerpunkt Gifte."
"""

TOPASA = """name: Topasa
rolle: Schmiedin und Tüftlerin
eigenschaften: { MU: 14, KL: 13, IN: 12, CH: 10, FF: 15, GE: 11, KO: 16, KK: 16 }
LeP: 37
AuP: 33
waffen: [Schmiedehammer]
rüstung: [Schürze]
talente: { Hiebwaffen: 12, Raufen: 9, Grobschmied: 16, Feinmechanik: 13, Mechanik: 12, Metallguss: 10, Hüttenkunde: 9, Gesteinskunde: 8, Schätzen: 9, Zechen: 12, Selbstbeherrschung: 9, Rogolan: 14, Garethi: 9 }
vorteile: [Zwergennase, Dämmerungssicht, Meisterhandwerk]
nachteile: [Meeresangst 7, Gerechtigkeitswahn 6]
notiz: "Zwergin, 56 (jung für eine Zwergin). Seekrank, will sich von ihrer Sippe lösen."
"""

VITTORIO = """name: Vittorio di Belhanka
rolle: Kartograph
eigenschaften: { MU: 13, KL: 13, IN: 13, CH: 15, FF: 15, GE: 12, KO: 11, KK: 10 }
LeP: 26
AuP: 28
waffen: [Florett]
talente: { Fechtwaffen: 9, Kartographie: 15, Malen/Zeichnen: 14, Sagen/Legenden: 13, Geographie: 11, Orientierung: 10, Schriftlicher Ausdruck: 12, Überreden: 12, Schauspielerei: 9, Etikette: 11, Betören: 8, Sternkunde: 7, Götter/Kulte: 6 }
nachteile: [Aberglaube 7, Neugier 7, Eitelkeit 5]
sonderfertigkeiten: ["Kulturkunde (Horasreich)"]
notiz: "Horasier aus Belhanka, betet zu Aves. Zeichnet Erlebniskarten statt genauer Karten."
"""

VIPER = """name: Die Viper
eigenschaften: { MU: 15, KL: 12, IN: 16, CH: 11, FF: 15, GE: 17, KO: 13, KK: 14 }
LeP: 38
AuP: 45
waffen: [Schwert, Schwert]
rüstung: [Iryanrüstung]
talente: { Schwerter: 18, Körperbeherrschung: 12, Schleichen: 12, Sich Verstecken: 10, Klettern: 10, Sinnenschärfe: 10, Heilkunde Gift: 8 }
sonderfertigkeiten: [Beidhändiger Kampf I, Ausweichen I, Ausweichen II, Finte, Kampfreflexe]
notiz: "Klingen mit Mandragora vergiftet (siehe unten). Mit Axxeleratus INI 32."
"""

SCHATTENWEBER = """name: Schattenweber
eigenschaften: { MU: 15, KL: 17, IN: 15, CH: 12, FF: 12, GE: 11, KO: 13, KK: 9 }
LeP: 26
AuP: 30
AsP: 64
waffen: [Magierstab]
rüstung: [Tuchrüstung]
talente: { Stäbe: 12, Magiekunde: 12, Selbstbeherrschung: 10, Sinnenschärfe: 8, Schleichen: 8, Sich Verstecken: 8 }
zauber: { Blitz dich find: 16, Axxeleratus Blitzgeschwind: 14, Gardianum Zauberschild: 12, Dunkelheit: 11, Fulminictus Donnerkeil: 10, Attributo: 9, Bannbaladin: 9, Claudibus Clavistibor: 12, Psychostabilis: 9 }
vorteile: [Vollzauberer]
sonderfertigkeiten: [Ausweichen I, Astrale Meditation]
"""

VOLLSTRECKER = """name: Vollstrecker
eigenschaften: { MU: 13, KL: 10, IN: 15, CH: 12, FF: 15, GE: 16, KO: 14, KK: 13 }
LeP: 32
AuP: 41
waffen: [Schwert, Linkhand]
rüstung: ["Krokodilpanzer, Leder"]
talente: { Schwerter: 15, Dolche: 10, Schleichen: 12, Sich Verstecken: 11, Klettern: 10, Körperbeherrschung: 10, Sinnenschärfe: 9, Heilkunde Gift: 6 }
sonderfertigkeiten: [Linkhand, Ausweichen I, Finte]
notiz: "Klinge mit Wurara vergiftet (siehe unten)."
"""

# Creature: the human formulas do not fit, so its values stay fixed (exception, see docs).
HYDRA = """name: Thalassische Riff-Hydra
LeP: 60
RS: 3
MR: 10
GS: 6
INI: 13
waffen:
  - { name: Biss, talent: Raufen, AT: 15, PA: 0, TP: 2W6+4 }
verknüpft: nein
notiz: "Kreatur – feste Werte. Jeder Kopf hat eine Aktion. GS 6 an Land/Deck, 14 im Wasser. Biss SNH. Siedende Gischt: Reichweite 5 Schritt (Kegel), 2W6 SP, jeder Kopf einmal pro Tag, insgesamt einmal pro Runde. LeP/RS/MR geschätzt – mit Q02 S. 180 abgleichen."
"""

# ----------------------------------------------------------------------------------------------
# Where the blocks go
# ----------------------------------------------------------------------------------------------
# remove: old lines (prefix match after whitespace normalisation, searched in order)
# after:  insert after this line instead of at the end
NOTES = {
    'NPC/Besatzung/Aschanka Malefsunni.md': [dict(block=ASCHANKA, remove=['Heilkunde Wunden (TaW 13', 'Götliche Begabung: Heilsegen'])],
    'NPC/Besatzung/Darion Pulverberg.md': [dict(block=DARION, remove=['Er Kennt sich in Ghurenia aus', 'Seefahrt (TaW 17'])],
    'NPC/Besatzung/Dioptus aus Zwerch.md': [dict(block=DIOPTUS, remove=['Rechnen (TaW 17'])],
    'NPC/Besatzung/Ebba.md': [dict(block=EBBA)],
    'NPC/Besatzung/Kapitän Persiphone von Rethis TODO.md': [dict(block=PERSIPHONE)],
    'NPC/Besatzung/Leta Sjenskoje.md': [dict(block=LETA, remove=['Zimmermann (TaW 16', 'Virtelzauberer, Meisterhandwerk'])],
    'NPC/Besatzung/Shahane ay Zedrakin.md': [dict(block=SHAHANE, remove=[
        'Shahane', 'Eigenschaften:', 'MU 14 KL 14 IN 15', 'Säbel: INI 12+1W6', 'Orchidee: INI 12+1W6',
        'Vorteile / Nachteile:', 'Paktgeschenke:', 'Ausrüstung: Säbel'])],
    'NPC/Besatzung/Sjadjana die brutale.md': [dict(block=SJADJANA)],
    'NPC/Expedition/Geweite/Haargh-Ma-Mu.md': [dict(block=HAARGH, remove=['Kampf (AT 23', 'Liturgien (LkW 9'])],
    'NPC/Expedition/Geweite/Praiodan von Luring.md': [dict(block=PRAIODAN)],
    'NPC/Expedition/Geweite/Zulhaminja saba Zulyoya.md': [dict(block=ZULHAMINJA, remove=['Liturgien (LkW 6'])],
    'NPC/Expedition/Krieger/Frederik Narciso.md': [
        dict(block=FREDERIK, after='Er wir von 2 Seiner Monsterjäger Kameraden begleitet'),
        dict(block=MARIO, after='![[token_Mario.png]]'),
        dict(block=PESIMOR, after='![[token_Pesimor.png]]'),
    ],
    'NPC/Expedition/Krieger/Sir Rondrigo von Talfenn.md': [dict(block=RONDRIGO, remove=['Zweihandschwert: AT 25 PA 17'])],
    'NPC/Expedition/Krieger/Valeriano di Salsavarda.md': [dict(block=VALERIANO)],
    'NPC/Expedition/Magier/Arvid Frenhilddotter.md': [dict(block=ARVID)],
    'NPC/Expedition/Magier/Ralio Derenvay.md': [dict(block=RALIO, remove=['Odem Arcanum 12', 'Magiekunde: 10', '15'])],
    'NPC/Expedition/Spezialisten/Topasa.md': [dict(block=TOPASA)],
    'NPC/Expedition/Spezialisten/Vittorio di Belhanka.md': [dict(block=VITTORIO)],
    'Uthuria/Act1 Überfahrt/Entcounter/Alanfaner Sabotage/Alanfaner Sabotage.md': [
        dict(block=VIPER, remove=['**"Die Viper"**', '**LeP:** 38', '**Eigenschaften:** MU 15, KL 12', '**Rüstung:** Iryanleder',
                                  '**Ausweichen:** 15', '**Attacken**:', 'Schwert(Haupt):', 'Schwert(Neben):']),
        dict(block=SCHATTENWEBER, remove=['**Schattenweber**', '**LeP:** 26', '**Eigenschaften:** MU 15, KL 17', '**Rüstung:** Tuchrüstung',
                                          '**Ausweichen:** 9', '**Attacken:**', '**Stab:**', '**Zauber:**', 'Blitz dich find - ZfW', 'Axxeleratus Blitzgeschwind - ZfW',
                                          'Gardianum - ZfW', 'Dunkelheit - ZfW', 'Fulminictus - ZfW', 'Attributo - ZfW', 'Bannbaladin - ZfW', 'Claudibus - ZfW', 'Psychostabilis - ZfW']),
        dict(block=VOLLSTRECKER, remove=['**Vollstrecker**:', '**LeP:** 32', '**Eigenschaften:** MU 13, KL 10', '**RS:** 2 (Leder)',
                                         '**Ausweichen:** 13', '**Attacken:**', '**Schwert:**']),
    ],
    'Uthuria/Act1 Überfahrt/Entcounter/Die Singenden Inseln/Die Singenden Inseln.md': [
        dict(block=HYDRA, remove=['**Thalassische Riff-Hydra**', '**GS:** 6', '**INI:** 13 + 1W6', 'Jeder Kopf hat eine Aktion', '**Biss:**',
                                  'AT 15 / 0 TP:', '**Siedende Gischt:**', 'Reichweite 5 Schritt', 'Jeder Kopf nur einmal pro Tag']),
    ],
}

# ----------------------------------------------------------------------------------------------

norm = lambda s: re.sub(r'\s+', ' ', s.strip())
FENCE = '```'


def strip_blocks(lines):
    out, skip = [], False
    for line in lines:
        if not skip and line.strip().lower().startswith('```dsa-nsc'):
            skip = True
            continue
        if skip:
            if line.strip() == FENCE:
                skip = False
            continue
        out.append(line)
    return out


def convert(text, segments):
    lines = text.split('\n')
    lines = strip_blocks(lines)
    removed = set()
    insert_at = {}  # index -> list of block texts (before line) ; key -1 = end
    after = {}
    for seg in segments:
        block = f"{FENCE}dsa-nsc\n{seg['block'].rstrip()}\n{FENCE}"
        if seg.get('remove'):
            pos, first = 0, None
            for target in seg['remove']:
                t = norm(target)
                idx = next((i for i in range(pos, len(lines)) if i not in removed and norm(lines[i]).startswith(t)), None)
                if idx is None:
                    raise ValueError(f'Zeile nicht gefunden: {target!r}')
                removed.add(idx)
                first = idx if first is None else first
                pos = idx + 1
            insert_at.setdefault(first, []).append(block)
        elif seg.get('after'):
            t = norm(seg['after'])
            idx = next((i for i, l in enumerate(lines) if norm(l).startswith(t)), None)
            if idx is None:
                raise ValueError(f'Zeile nicht gefunden: {seg["after"]!r}')
            after.setdefault(idx, []).append(block)
        else:
            insert_at.setdefault(-1, []).append(block)
    out = []
    for i, line in enumerate(lines):
        if i in insert_at:
            out.extend(['', *'\n\n'.join(insert_at[i]).split('\n'), ''])
        if i not in removed:
            out.append(line)
        if i in after:
            out.extend(['', *'\n\n'.join(after[i]).split('\n'), ''])
    if -1 in insert_at:
        while out and not out[-1].strip():
            out.pop()
        out.extend(['', *'\n\n'.join(insert_at[-1]).split('\n')])
    # collapse runs of more than two blank lines the edit may have produced
    result = re.sub(r'\n{4,}', '\n\n\n', '\n'.join(out)).rstrip('\n') + '\n'
    return result


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if not args:
        print(__doc__)
        sys.exit(1)
    vault = Path(args[0])
    dry = '--dry-run' in sys.argv
    force = '--force' in sys.argv
    ok = skipped = failed = 0
    for rel, segments in NOTES.items():
        path = vault / rel
        if not path.exists():
            print(f'  ✗ fehlt: {rel}')
            failed += 1
            continue
        text = path.read_text(encoding='utf-8')
        if '```dsa-nsc' in text and not force:
            print(f'  – hat schon einen Block: {rel}')
            skipped += 1
            continue
        try:
            new = convert(text, segments)
        except ValueError as e:
            print(f'  ✗ {rel}: {e} – Notiz unverändert')
            failed += 1
            continue
        if not dry:
            path.write_text(new, encoding='utf-8')
        print(f'  ✓ {rel} ({len(segments)} Block/Blöcke)')
        ok += 1
    print(f'{ok} umgewandelt, {skipped} übersprungen, {failed} Fehler{" (Probelauf, nichts geschrieben)" if dry else ""}')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
