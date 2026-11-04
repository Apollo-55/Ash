#!/usr/bin/env python3
"""
Converts the NPC notes of the Uthuria vault into dsa-nsc blocks (one-off conversion, reproducible).

Usage:
  python3 systems/dsa41/tools/nsc-umwandlung/umwandeln.py <vault-dir> [--dry-run] [--force]

- Old stat lines listed under "remove" are replaced by the block (the block goes where the first of them was).
- Notes without old stats get the block at the end (or after a given line).
- A note that already contains a ```dsa-nsc block is skipped, unless --force (then its blocks are replaced in place).
- If an expected old line is not found, the note is left untouched and reported.
Rules for the values: see docs/nsc-umwandlung.md
"""
import re
import sys
from pathlib import Path

# ----------------------------------------------------------------------------------------------
# Blocks (talents/SF follow the professions in Wege der Helden; liturgies per Liber Liturgium;
# SF prerequisites checked against Wege der Helden, see docs/nsc-umwandlung.md)
# ----------------------------------------------------------------------------------------------

# Wundärztin (WdH S. 154) + ehemalige Akoluthin der Marbo
ASCHANKA = """name: Aschanka Malefsunni
rolle: Schiffsärztin
eigenschaften: { MU: 14, KL: 14, IN: 13, CH: 14, FF: 14, GE: 12, KO: 11, KK: 10 }
LeP: 27
AuP: 29
waffen: [Dolch]
talente: { Dolche: 6, Raufen: 5, Ringen: 5, Heilkunde Wunden: 13, Heilkunde Krankheiten: 15, Heilkunde Gift: 10, Heilkunde Seele: 9, Anatomie: 10, Pflanzenkunde: 11, Kochen: 7, Menschenkenntnis: 10, Überreden: 7, Gassenwissen: 6, Selbstbeherrschung: 8, Sinnenschärfe: 7, Götter/Kulte: 9, Magiekunde: 4, Rechnen: 6, Sagen/Legenden: 5, Tulamidya: 14, Garethi: 10 }
vorteile: [Resistenz gegen Krankheiten, Gutes Gedächtnis]
nachteile: [Prinzipientreue 6]
sonderfertigkeiten: [Akoluth, "Kulturkunde (Aranien)"]
notiz: "Ehemalige Akoluthin der Marbo, hat den Glauben verloren. Göttliche Begabung: Heilsegen (LkW 10) – nicht geweiht, daher keine Liturgie. Arbeitet gern mit Blutegeln."
"""

# Seefahrer, Variante Navigator (WdH S. 132 f.); früher Schmuggler (WdH S. 131)
DARION = """name: Darion Pulverberg
rolle: Navigator
eigenschaften: { MU: 13, KL: 15, IN: 15, CH: 15, FF: 15, GE: 15, KO: 14, KK: 15 }
LeP: 34
AuP: 34
waffen: [Entermesser, Dolch]
talente: { Säbel: 10, Dolche: 8, Raufen: 8, Ringen: 6, Armbrust: 6, Seefahrt: 17, Boote Fahren: 12, Orientierung: 13, Wettervorhersage: 11, Sternkunde: 12, Rechnen: 10, Kartographie: 9, Geographie: 8, Mechanik: 6, Gassenwissen: 14, Schleichen: 9, Sich Verstecken: 9, Klettern: 9, Körperbeherrschung: 8, Schwimmen: 9, Zechen: 8, Sinnenschärfe: 11, Menschenkenntnis: 9, Überreden: 10, Schätzen: 7, Fesseln/Entfesseln: 7, Garethi: 12, Tulamidya: 6 }
vorteile: [Richtungssinn]
nachteile: [Aberglaube 5, Loyalität]
sonderfertigkeiten: [Meereskundig, Standfest, Ortskenntnis]
notiz: "Ortskenntnis Ghurenia, kennt die Schmugglerverstecke. Früher Schmuggler im Dienst des Prasi Melekmar, Stoerrebrandt treu ergeben."
"""

# Söldner, Variante Artillerist (WdH S. 117)
DIOPTUS = """name: Dioptus aus Zwerch
rolle: Geschützmeister
eigenschaften: { MU: 11, KL: 17, IN: 16, CH: 10, FF: 15, GE: 12, KO: 11, KK: 11 }
LeP: 27
AuP: 27
waffen: [Dolch]
talente: { Belagerungswaffen: 17, Armbrust: 8, Dolche: 4, Rechnen: 17, Mechanik: 16, Feinmechanik: 12, Sternkunde: 10, Kartographie: 8, Kriegskunst: 6, Schriftlicher Ausdruck: 9, Sinnenschärfe: 9, Selbstbeherrschung: 6, Fesseln/Entfesseln: 6, Holzbearbeitung: 6, Seiler: 5, Seefahrt: 6, Garethi: 12, Bosparano: 6, Kusliker Zeichen: 10 }
vorteile: [Gutes Gedächtnis, Entfernungssinn]
nachteile: [Kleinwüchsig, Feste Gewohnheit]
sonderfertigkeiten: [Geschützmeister]
notiz: "Pedantisch, schreibt alles auf. Benutzt optische Geräte zum Zielen."
"""

# Seefahrerin mit Kochen (WdH S. 132)
EBBA = """name: Ebba
rolle: Smutje
eigenschaften: { MU: 12, KL: 10, IN: 12, CH: 11, FF: 13, GE: 12, KO: 14, KK: 14 }
LeP: 33
AuP: 31
waffen: [Fleischerbeil, Messer]
talente: { Hiebwaffen: 8, Dolche: 8, Raufen: 9, Kochen: 15, Fischen/Angeln: 11, Hauswirtschaft: 9, Fleischer: 8, Pflanzenkunde: 5, Zechen: 11, Seefahrt: 7, Boote Fahren: 6, Schwimmen: 6, Klettern: 6, Menschenkenntnis: 7, Überreden: 6, Sinnenschärfe: 7, Schätzen: 6, Garethi: 10 }
nachteile: [Aberglaube 5]
sonderfertigkeiten: [Meereskundig, Standfest]
notiz: "Werte frei ergänzt – die Notiz hatte noch keine Angaben."
"""

# Seefahrerin, Kapitänin (Navigator-Variante + Führung)
PERSIPHONE = """name: Kapitän Persiphone von Rethis
rolle: Kapitän
eigenschaften: { MU: 15, KL: 13, IN: 14, CH: 15, FF: 12, GE: 13, KO: 13, KK: 12 }
LeP: 33
AuP: 34
waffen: [Säbel, Dolch]
talente: { Säbel: 14, Dolche: 8, Raufen: 8, Armbrust: 7, Seefahrt: 17, Boote Fahren: 10, Orientierung: 13, Wettervorhersage: 12, Sternkunde: 11, Rechnen: 10, Kartographie: 8, Geographie: 8, Kriegskunst: 11, Menschenkenntnis: 12, Überzeugen: 13, Überreden: 9, Etikette: 10, Rechtskunde: 6, Klettern: 9, Körperbeherrschung: 8, Schwimmen: 8, Selbstbeherrschung: 11, Sinnenschärfe: 11, Zechen: 8, Garethi: 12 }
vorteile: [Richtungssinn]
nachteile: [Aberglaube 5]
sonderfertigkeiten: [Meereskundig, Standfest, Aufmerksamkeit, Finte, Ausweichen I]
notiz: "Werte frei ergänzt – die Notiz hatte noch keine Angaben."
"""

# Handwerkerin, Schiffszimmerfrau (WdH S. 150); Halbelfe, Viertelzauberin
LETA = """name: Leta Sjenskoje
rolle: Zimmerfrau
eigenschaften: { MU: 13, KL: 12, IN: 13, CH: 15, FF: 15, GE: 13, KO: 13, KK: 15 }
LeP: 31
AuP: 30
AsP: 7
waffen: [Beil]
talente: { Hiebwaffen: 8, Raufen: 7, Zimmermann: 16, Bogenbau: 12, Holzbearbeitung: 14, Seiler: 6, Mechanik: 6, Rechnen: 7, Schätzen: 6, Klettern: 10, Körperbeherrschung: 8, Seefahrt: 6, Betören: 12, Überreden: 9, Menschenkenntnis: 8, Tanzen: 8, Singen: 6, Zechen: 9, Sinnenschärfe: 9, Garethi: 12, Isdira: 4 }
zauber: { Bannbaladin: 3 }
vorteile: [Viertelzauberer, Meisterhandwerk, Gut Aussehend, Balance]
nachteile: [Brünstigkeit 6]
sonderfertigkeiten: [Meister der Improvisation, "Kulturkunde (Bornland)"]
notiz: "Halbelfe, 22, bornischer Akzent. Meisterhandwerk: Zimmermann, Bogenbau."
"""

# alter Wertekasten aus der Notiz, ergänzt um Talente einer Hochstaplerin/Paktiererin
SHAHANE = """name: Shahane ay Zedrakin
rolle: Proviantmeisterin
eigenschaften: { MU: 14, KL: 14, IN: 15, CH: 13, FF: 12, GE: 13, KO: 13, KK: 11 }
SO: 6
LeP: 36
AuP: 37
RS: 0
waffen: [Säbel, Orchidee]
talente: { Säbel: 18, Raufen: 19, Dolche: 8, Selbstbeherrschung: 7, Sinnenschärfe: 10, Menschenkenntnis: 18, Überreden: 17, Betören: 14, Etikette: 9, Gassenwissen: 10, Handel: 9, Rechnen: 8, Schätzen: 8, Sich Verkleiden: 7, Schleichen: 8, Körperbeherrschung: 10, Tanzen: 9, Zechen: 6, Kochen: 5, Tulamidya: 14, Garethi: 10 }
vorteile: [Soziale Anpassungsfähigkeit]
nachteile: { Brünstigkeit: 6, Eitelkeit: 7, Neid: 8 }
sonderfertigkeiten: [Aufmerksamkeit, Ausweichen I, Ausweichen II, Improvisierte Waffen, Finte, "Waffenlose Kampftechnik: Mercenario"]
notiz: "Seelentier: Schakal. Paktgeschenke: Brünstigkeit erzeugen, Lamijah, Befehl des Lamijah, Dämonische Hilfe (Herbeirufung eines Muwallaraan). Überreden (Lügen) 19. Ausrüstung: Säbel, Orchidee, einfache Kleidung."
"""

# Seefahrerin, Variante Pirat (WdH S. 132) – stammt aus Chorhop
SJADJANA = """name: Sjadjana die Brutale
rolle: Erster Maat
eigenschaften: { MU: 14, KL: 11, IN: 14, CH: 12, FF: 12, GE: 12, KO: 15, KK: 15 }
LeP: 36
AuP: 34
waffen: [Entermesser, Peitsche, Wurfmesser]
talente: { Säbel: 13, Hiebwaffen: 10, Raufen: 12, Peitsche: 9, Wurfmesser: 8, Seefahrt: 14, Boote Fahren: 10, Klettern: 11, Akrobatik: 6, Körperbeherrschung: 9, Schwimmen: 9, Zechen: 12, Sinnenschärfe: 12, Menschenkenntnis: 10, Überzeugen: 9, Gassenwissen: 9, Kriegskunst: 6, Fesseln/Entfesseln: 8, Wettervorhersage: 7, Orientierung: 6, Garethi: 10, Tulamidya: 6 }
nachteile: [Jähzorn 6, Goldgier 5, Unangenehme Stimme]
sonderfertigkeiten: [Meereskundig, Standfest, Wuchtschlag]
notiz: "Stammt aus Chorhop, Goldzahn, flucht ständig."
"""

# Kor-Geweihte nach Spätweihe (WdH S. 227): 12 KaP Basis, Moralkodex (Kor), Verpflichtungen
HAARGH = """name: Haargh-Ma-Mu
rolle: Geweihte des Kor
eigenschaften: { MU: 17, KL: 11, IN: 15, CH: 14, FF: 12, GE: 14, KO: 15, KK: 16 }
LeP: 38
AuP: 38
KaP: 18
waffen: [Korspieß]
talente: { Infanteriewaffen: 21, Raufen: 10, Ringen: 8, Wurfspeere: 8, Athletik: 9, Körperbeherrschung: 11, Selbstbeherrschung: 14, Sinnenschärfe: 9, Wildnisleben: 10, Fährtensuchen: 8, Kriegskunst: 10, Götter/Kulte: 8, Menschenkenntnis: 7, Überzeugen: 6, Heilkunde Wunden: 6, Liturgiekenntnis (Kor): 9, Mohisch: 14, Garethi: 6, Tulamidya: 6 }
liturgien: [Neun Streiche in Einem, Der über das Schlachtfeld schreitet, Märtyrersegen, Schutzsegen, Eidsegen, Grabsegen, Heiliger Befehl]
vorteile: [Geweiht, Eisern]
nachteile: [Moralkodex 3, Verpflichtungen, Meeresangst 6]
sonderfertigkeiten: [Liturgiekenntnis, Spätweihe, Kampfreflexe, Wuchtschlag, Niederwerfen, Aufmerksamkeit, Rüstungsgewöhnung I]
notiz: "Utulu, spricht schlecht Garethi und Tulamidya. Der fehlende kleine Finger der linken Hand ist das Weiheopfer an Kor."
"""

# Praios-Geweihter (WdH S. 207): 24 KaP Basis, Moralkodex 12, Verpflichtungen; Liturgien nach Liber Liturgium
PRAIODAN = """name: Praiodan von Luring
rolle: Praios-Geweihter, Richter
eigenschaften: { MU: 15, KL: 15, IN: 14, CH: 15, FF: 11, GE: 11, KO: 13, KK: 12 }
LeP: 31
AuP: 30
KaP: 32
waffen: [Sonnenszepter]
talente: { Hiebwaffen: 10, Liturgiekenntnis (Praios): 14, Rechtskunde: 16, Götter/Kulte: 14, Sternkunde: 15, Geschichtswissen: 11, Staatskunst: 9, Heraldik: 8, Magiekunde: 8, Rechnen: 10, Sagen/Legenden: 8, Geographie: 7, Philosophie: 10, Menschenkenntnis: 14, Überzeugen: 14, Etikette: 12, Lehren: 10, Selbstbeherrschung: 13, Sinnenschärfe: 8, Singen: 6, Reiten: 7, Zechen: 7, Heilkunde Seele: 8, Garethi: 14, Bosparano: 12, Kusliker Zeichen: 12 }
liturgien: [Eidsegen, Heilungssegen, Speisesegen, Des Herren Goldener Mittag, Göttliches Zeichen, Innere Ruhe, Wort der Wahrheit, Ucuris Geleit, Großer Eidsegen, Licht des Herrn, Praios’ Mahnung, Seelenprüfung, Exorzismus (Dämonen), Wille zur Wahrheit]
vorteile: [Geweiht, Guter Ruf]
nachteile: [Moralkodex 12, Verpflichtungen, Neugier 6]
sonderfertigkeiten: [Liturgiekenntnis, Karmalqueste, "Kulturkunde (Mittelreich)"]
notiz: "Anfang 50, Narbe am Hals (Orkpfeil aus dem Svelltland). Versierter Astronom, sucht Zeichen Praios’ am Südhimmel."
"""

# Nandus-Geweihte (WdH S. 228): 12 KaP Basis, Akad. Ausbildung (Gelehrter), Neugier 7, Moralkodex 3
ZULHAMINJA = """name: Zulhaminja saba Zulyoya
rolle: Geweihte des Nandus
eigenschaften: { MU: 13, KL: 14, IN: 13, CH: 13, FF: 12, GE: 13, KO: 11, KK: 10 }
LeP: 26
AuP: 29
KaP: 14
waffen: [Dolch]
talente: { Stäbe: 4, Dolche: 5, Liturgiekenntnis (Nandus): 6, Sprachenkunde: 10, Geschichtswissen: 8, Sagen/Legenden: 9, Magiekunde: 6, Götter/Kulte: 9, Rechnen: 10, Philosophie: 7, Kryptographie: 6, Rechtskunde: 5, Schätzen: 5, Lehren: 8, Menschenkenntnis: 8, Überzeugen: 8, Überreden: 7, Schriftlicher Ausdruck: 9, Etikette: 6, Gassenwissen: 6, Sinnenschärfe: 8, Selbstbeherrschung: 5, Malen/Zeichnen: 6, Tulamidya: 14, Garethi: 10, Urtulamidya: 7, Bosparano: 5, Nanduria: 8, Kusliker Zeichen: 6 }
liturgien: [Weisheitssegen, Harmoniesegen, Heilungssegen, Sterne funkeln immerfort, Ein Bild für die Ewigkeit, Göttliche Verständigung, Nandus’ Schriftkenntnis]
vorteile: [Geweiht, Akademische Ausbildung Gelehrter, Gebildet]
nachteile: [Neugier 8, Moralkodex 3, Verpflichtungen, Impulsiv]
sonderfertigkeiten: [Liturgiekenntnis, "Kulturkunde (Tulamidenlande)"]
notiz: "19, aus Fasar, übermütig. Hat in Khunchom versucht, einen Dämon zu belehren, statt ihn auszutreiben."
"""

# Großwildjäger (WdH S. 127) – Monsterjäger
FREDERIK = """name: Frederik Narciso
rolle: Monsterjäger
bild: Pasted image 20251024221703.jpg
token: token_Frederik_Narciso.png
verknüpft: ja
eigenschaften: { MU: 15, KL: 13, IN: 14, CH: 11, FF: 15, GE: 13, KO: 15, KK: 14 }
LeP: 36
AuP: 36
waffen: [Eisenwalder, Schwert, Dolch]
rüstung: [Lederharnisch]
talente: { Armbrust: 15, Schwerter: 12, Dolche: 7, Raufen: 8, Ringen: 7, Speere: 6, Fährtensuchen: 13, Fallenstellen: 12, Fesseln/Entfesseln: 8, Orientierung: 10, Wildnisleben: 12, Wettervorhersage: 7, Tierkunde: 13, Magiekunde: 9, Sagen/Legenden: 11, Pflanzenkunde: 6, Heilkunde Gift: 7, Heilkunde Wunden: 8, Sinnenschärfe: 13, Schleichen: 10, Sich Verstecken: 9, Klettern: 8, Körperbeherrschung: 8, Selbstbeherrschung: 11, Reiten: 6, Götter/Kulte: 6, Garethi: 12 }
vorteile: [Eisern, Gefahreninstinkt]
nachteile: [Feste Gewohnheit]
sonderfertigkeiten: ["Scharfschütze (Armbrust)", "Schnellladen (Armbrust)", Aufmerksamkeit, Kampfreflexe, Rüstungsgewöhnung I, Waldkundig]
notiz: "Großgewachsen, wettergegerbt, pedantisch, hasst es zu improvisieren. Hat einen Vampir in Festum gejagt; die Eisenwalder bekam er für einen getöteten Lindwurm."
"""

MARIO = """name: Mario Du'laces
rolle: Monsterjäger
bild: Pasted image 20260117152714.jpg
token: token_Mario.png
verknüpft: ja
eigenschaften: { MU: 13, KL: 11, IN: 13, CH: 11, FF: 13, GE: 14, KO: 13, KK: 13 }
LeP: 30
AuP: 30
waffen: [Speer, Kurzbogen, Dolch]
rüstung: [Lederweste]
talente: { Speere: 12, Bogen: 11, Dolche: 7, Raufen: 7, Ringen: 6, Fährtensuchen: 10, Fallenstellen: 10, Wildnisleben: 10, Orientierung: 8, Tierkunde: 8, Pflanzenkunde: 5, Sinnenschärfe: 10, Schleichen: 9, Sich Verstecken: 8, Klettern: 8, Körperbeherrschung: 7, Heilkunde Wunden: 5, Kochen: 5, Garethi: 10 }
sonderfertigkeiten: [Aufmerksamkeit, "Scharfschütze (Bogen)", Waldkundig]
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
talente: { Zweihand-Hiebwaffen: 13, Hiebwaffen: 9, Raufen: 10, Ringen: 9, Athletik: 10, Körperbeherrschung: 7, Klettern: 6, Selbstbeherrschung: 10, Zechen: 11, Wildnisleben: 8, Fährtensuchen: 6, Tierkunde: 6, Sinnenschärfe: 7, Grobschmied: 5, Garethi: 10 }
vorteile: [Zäher Hund]
nachteile: [Jähzorn 5]
sonderfertigkeiten: [Wuchtschlag, Niederwerfen, Rüstungsgewöhnung I, Standfest]
notiz: "Begleiter von Frederik Narciso. Werte frei ergänzt."
"""

# Ritter (WdH S. 107): Prinzipientreue 10 (Ritterkodex), Verpflichtungen
RONDRIGO = """name: Sir Rondrigo von Talfenn
rolle: Ritter, Schwurträger
eigenschaften: { MU: 16, KL: 12, IN: 14, CH: 11, FF: 11, GE: 13, KO: 14, KK: 16 }
LeP: 36
AuP: 35
waffen: [Zweihänder, Dolch]
rüstung: ["Kettenhemd, lang"]
talente: { Zweihandschwerter/-säbel: 24, Schwerter: 12, Dolche: 7, Lanzenreiten: 10, Armbrust: 6, Raufen: 10, Ringen: 8, Athletik: 7, Körperbeherrschung: 8, Reiten: 12, Selbstbeherrschung: 16, Sinnenschärfe: 10, Etikette: 7, Menschenkenntnis: 9, Kriegskunst: 13, Heraldik: 8, Geschichtswissen: 6, Götter/Kulte: 7, Rechnen: 6, Rechtskunde: 6, Orientierung: 8, Wildnisleben: 9, Heilkunde Wunden: 7, Abrichten: 5, Garethi: 12 }
vorteile: [Adlige Abstammung, Eisern, Zäher Hund]
nachteile: [Prinzipientreue 10, Verpflichtungen, Schlafstörung, Einbildungen]
sonderfertigkeiten: [Aufmerksamkeit, Kampfreflexe, Wuchtschlag, Niederwerfen, Hammerschlag, Meisterparade, Linkhand, Reiterkampf, Rüstungsgewöhnung I, Rüstungsgewöhnung II, "Kulturkunde (Svellttal)"]
notiz: "66 Jahre, Grenzkrieger aus dem Svellt. Gebunden an einen vergessenen Schwur; redet mit seinen toten Kameraden. Früher notiert: Zweihandschwert AT 25 / PA 17."
"""

# Schwertgeselle nach Fedorino, Vinsalter Vaganten (WdH S. 110): Rapier + Linkhand;
# automatisch Arroganz 5, Eitelkeit 5, Prinzipientreue 10, Schulden 1.500 D
VALERIANO = """name: Valeriano di Salsavarda
rolle: Schwertgeselle
eigenschaften: { MU: 15, KL: 12, IN: 15, CH: 15, FF: 14, GE: 17, KO: 12, KK: 12 }
LeP: 30
AuP: 36
waffen: [Rapier, Linkhand]
talente: { Fechtwaffen: 20, Dolche: 14, Säbel: 8, Armbrust: 6, Raufen: 8, Ringen: 6, Tanzen: 15, Betören: 15, Etikette: 13, Menschenkenntnis: 11, Überreden: 11, Akrobatik: 10, Athletik: 8, Körperbeherrschung: 13, Selbstbeherrschung: 10, Sinnenschärfe: 9, Reiten: 7, Zechen: 9, Musizieren: 9, Singen: 9, Gassenwissen: 7, Brett-/Kartenspiel: 7, Geschichtswissen: 5, Heraldik: 6, Götter/Kulte: 6, Kriegskunst: 6, Heilkunde Wunden: 5, Garethi: 14, Bosparano: 6, Kusliker Zeichen: 8 }
vorteile: [Gut Aussehend, Balance]
nachteile: [Arroganz 5, Eitelkeit 6, Prinzipientreue 10, Schulden, Verschwendungssucht 5, Gesucht]
sonderfertigkeiten: [Aufmerksamkeit, Kampfreflexe, Kampfgespür, Ausweichen I, Ausweichen II, Finte, Gezielter Stich, Todesstoß, Linkhand, Parierwaffen I, Meisterparade, Binden, Entwaffnen, Defensiver Kampfstil, Klingenwand, Ausfall, Klingensturm, Klingentänzer, "Kulturkunde (Horasreich)"]
notiz: "Der Pfau. Lehrte das Fechten als Gottesdienst für Rahja. Kopfgeld von Don Calleri (600 D für den Kopf, 500 je Hand). Schulden bei der Nordlandbank und zwei Phex-Geweihten."
"""

# Haindruide (WdH S. 160): Gutes Gedächtnis, Vollzauberer, Unverträglichkeit mit verarbeitetem Metall
ARVID = """name: Arvid Frenhilddotter
rolle: Druide
eigenschaften: { MU: 15, KL: 12, IN: 15, CH: 15, FF: 11, GE: 12, KO: 14, KK: 13 }
LeP: 31
AuP: 31
AsP: 38
waffen: [Vulkanglasdolch]
talente: { Dolche: 8, Hiebwaffen: 5, Tierkunde: 15, Pflanzenkunde: 13, Gesteinskunde: 7, Magiekunde: 9, Sternkunde: 7, Sagen/Legenden: 9, Götter/Kulte: 5, Rechnen: 5, Philosophie: 6, Wildnisleben: 12, Orientierung: 9, Wettervorhersage: 9, Fährtensuchen: 7, Selbstbeherrschung: 10, Sinnenschärfe: 10, Schleichen: 8, Sich Verstecken: 6, Klettern: 6, Schwimmen: 7, Heilkunde Wunden: 8, Heilkunde Krankheiten: 7, Heilkunde Gift: 6, Feuersteinbearbeitung: 8, Holzbearbeitung: 8, Kochen: 6, Überreden: 10, Überzeugen: 9, Thorwalsch: 14, Garethi: 8 }
zauber: { Eins mit der Natur: 12, Herr über das Tierreich: 10, Weisheit der Bäume: 11, Tiergedanken: 9, Sanftmut: 11, Böser Blick: 7, Ängste lindern: 6, Abvenenum reine Speise: 7, Balsam Salabunde: 8, Manifesto Element: 5, Odem Arcanum: 5 }
vorteile: [Vollzauberer, Gutes Gedächtnis, Tierfreund]
nachteile: [Unverträglichkeit mit verarbeitetem Metall, Speisegebote]
sonderfertigkeiten: [Ritualkenntnis, Druidische Dolchrituale, Druidenrache, Große Meditation, Verbotene Pforten, Waldkundig, "Kulturkunde (Thorwal)"]
notiz: "54, Thorwaler Haindruide, liebt Tiere, versucht andere zu überreden, vegetarisch zu leben."
"""

# Gildenmagier der Academia der Hohen Magie zu Punin (WdH S. 173 f.), ehemaliger Magister
RALIO = """name: Ralio Derenvay
rolle: ehem. Akademiemagister aus Punin
eigenschaften: { MU: 12, KL: 16, IN: 14, CH: 12, FF: 13, GE: 11, KO: 12, KK: 10 }
LeP: 27
AuP: 28
AsP: 38
waffen: [Magierstab]
talente: { Stäbe: 8, Dolche: 5, Magiekunde: 10, Heilkunde Gift: 13, Alchimie: 11, Pflanzenkunde: 16, Tierkunde: 15, Geschichtswissen: 9, Philosophie: 10, Rechnen: 11, Sprachenkunde: 9, Lehren: 11, Götter/Kulte: 6, Sternkunde: 6, Anatomie: 7, Heilkunde Krankheiten: 7, Schriftlicher Ausdruck: 9, Etikette: 8, Selbstbeherrschung: 9, Sinnenschärfe: 8, Garethi: 14, Bosparano: 13, Tulamidya: 6, Kusliker Zeichen: 12 }
zauber: { Odem Arcanum: 12, Analys Arkanstruktur: 12, Oculus Astralis: 9, Klarum Purum: 10, Abvenenum reine Speise: 9, Balsam Salabunde: 7, Respondami Wahrheitszwang: 6, Psychostabilis: 6, Penetrizzel Tiefenblick: 7, Armatrutz: 6, Silentium: 5 }
vorteile: [Vollzauberer, Akademische Ausbildung Magier, Gebildet]
nachteile: [Neugier 6]
sonderfertigkeiten: [Ritualkenntnis, Stabzauber, Astrale Meditation]
notiz: "43, gebildet, melancholisch, Skeptiker. Kleidung gepflegt, aber alt, voller Harz, Tinte und Blütenstaub. Alchimie mit Schwerpunkt Gifte."
"""

# Handwerkerin, Grobschmiedin, zwergische Variante (WdH S. 150 f.)
TOPASA = """name: Topasa
rolle: Schmiedin und Tüftlerin
eigenschaften: { MU: 14, KL: 13, IN: 12, CH: 10, FF: 15, GE: 11, KO: 16, KK: 16 }
LeP: 37
AuP: 33
waffen: [Schmiedehammer]
rüstung: [Schürze]
talente: { Hiebwaffen: 12, Zweihand-Hiebwaffen: 9, Raufen: 9, Ringen: 7, Armbrust: 6, Grobschmied: 16, Feinmechanik: 13, Mechanik: 12, Metallguss: 11, Hüttenkunde: 10, Gesteinskunde: 9, Bergbau: 6, Schätzen: 9, Rechnen: 9, Handel: 6, Holzbearbeitung: 5, Zechen: 12, Selbstbeherrschung: 9, Sinnenschärfe: 8, Körperbeherrschung: 5, Lehren: 5, Menschenkenntnis: 6, Überzeugen: 7, Rogolan: 14, Garethi: 9, Angram: 8 }
vorteile: [Zwergennase, Dämmerungssicht, Meisterhandwerk, Hitzeresistenz]
nachteile: [Meeresangst 7, Gerechtigkeitswahn 6]
sonderfertigkeiten: [Meister der Improvisation]
notiz: "Zwergin, 56 (jung für eine Zwergin). Seekrank, will sich von ihrer Sippe lösen; setzt sich für Gleichheit ein."
"""

# Entdecker (WdH S. 124): Neugier 5 automatisch; Kartographie und Malen/Zeichnen als Kern
VITTORIO = """name: Vittorio di Belhanka
rolle: Kartograph
eigenschaften: { MU: 13, KL: 13, IN: 13, CH: 15, FF: 15, GE: 12, KO: 11, KK: 10 }
LeP: 26
AuP: 28
waffen: [Florett]
talente: { Fechtwaffen: 9, Armbrust: 5, Kartographie: 15, Malen/Zeichnen: 14, Sagen/Legenden: 13, Geographie: 12, Geschichtswissen: 9, Götter/Kulte: 7, Magiekunde: 6, Rechnen: 9, Sprachenkunde: 8, Sternkunde: 8, Schätzen: 6, Orientierung: 10, Wettervorhersage: 6, Fährtensuchen: 5, Wildnisleben: 6, Schriftlicher Ausdruck: 12, Überreden: 13, Schauspielerei: 10, Etikette: 11, Betören: 8, Menschenkenntnis: 7, Reiten: 8, Klettern: 6, Sinnenschärfe: 9, Heilkunde Wunden: 5, Garethi: 14, Bosparano: 8, Tulamidya: 6, Kusliker Zeichen: 10 }
vorteile: [Soziale Anpassungsfähigkeit]
nachteile: [Neugier 7, Aberglaube 7, Eitelkeit 5]
sonderfertigkeiten: ["Kulturkunde (Horasreich)"]
notiz: "Horasier aus Belhanka, betet zu Aves um gute Geschichten. Zeichnet Erlebniskarten statt genauer Karten."
"""

VIPER = """name: Die Viper
eigenschaften: { MU: 15, KL: 12, IN: 16, CH: 11, FF: 15, GE: 17, KO: 13, KK: 14 }
LeP: 38
AuP: 45
waffen: [Schwert, Schwert]
rüstung: [Iryanrüstung]
talente: { Schwerter: 18, Dolche: 9, Wurfmesser: 8, Körperbeherrschung: 12, Akrobatik: 9, Schleichen: 12, Sich Verstecken: 11, Klettern: 10, Sinnenschärfe: 11, Selbstbeherrschung: 9, Heilkunde Gift: 9, Gassenwissen: 8, Menschenkenntnis: 7, Sich Verkleiden: 6 }
sonderfertigkeiten: [Aufmerksamkeit, Kampfreflexe, Linkhand, Beidhändiger Kampf I, Ausweichen I, Ausweichen II, Finte]
notiz: "Klingen mit Mandragora vergiftet (siehe unten). Mit Axxeleratus INI 32."
"""

SCHATTENWEBER = """name: Schattenweber
eigenschaften: { MU: 15, KL: 17, IN: 15, CH: 12, FF: 12, GE: 11, KO: 13, KK: 9 }
LeP: 26
AuP: 30
AsP: 64
waffen: [Magierstab]
rüstung: [Tuchrüstung]
talente: { Stäbe: 12, Magiekunde: 13, Selbstbeherrschung: 11, Sinnenschärfe: 9, Schleichen: 8, Sich Verstecken: 9, Menschenkenntnis: 8, Überreden: 7, Etikette: 6, Rechnen: 8, Sternkunde: 5, Götter/Kulte: 5, Garethi: 12, Bosparano: 10 }
zauber: { Blitz dich find: 16, Axxeleratus Blitzgeschwind: 14, Gardianum Zauberschild: 12, Dunkelheit: 11, Fulminictus Donnerkeil: 10, Attributo: 9, Bannbaladin: 9, Claudibus Clavistibor: 12, Psychostabilis: 9 }
vorteile: [Vollzauberer]
sonderfertigkeiten: [Ausweichen I, Ritualkenntnis, Stabzauber, Astrale Meditation]
"""

VOLLSTRECKER = """name: Vollstrecker
eigenschaften: { MU: 13, KL: 10, IN: 15, CH: 12, FF: 15, GE: 16, KO: 14, KK: 13 }
LeP: 32
AuP: 41
waffen: [Schwert, Linkhand]
rüstung: ["Krokodilpanzer, Leder"]
talente: { Schwerter: 15, Dolche: 10, Wurfmesser: 7, Raufen: 8, Akrobatik: 6, Schleichen: 12, Sich Verstecken: 11, Klettern: 10, Körperbeherrschung: 10, Sinnenschärfe: 9, Heilkunde Gift: 6 }
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


def replace_existing(text, segments):
    """Replaces the existing dsa-nsc blocks in order (used with --force on converted notes)."""
    lines = text.split('\n')
    out, i, n = [], 0, 0
    while i < len(lines):
        if lines[i].strip().lower().startswith('```dsa-nsc'):
            j = i + 1
            while j < len(lines) and lines[j].strip() != FENCE:
                j += 1
            if n >= len(segments):
                raise ValueError('mehr Blöcke in der Notiz als im Skript')
            out.extend([f'{FENCE}dsa-nsc', *segments[n]['block'].rstrip().split('\n'), FENCE])
            n += 1
            i = j + 1
            continue
        out.append(lines[i])
        i += 1
    if n != len(segments):
        raise ValueError(f'{n} Blöcke in der Notiz, {len(segments)} im Skript')
    return '\n'.join(out)


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
            new = replace_existing(text, segments) if '```dsa-nsc' in text else convert(text, segments)
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
