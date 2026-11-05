# Zukünftige Pläne

Dinge, die bewusst zurückgestellt sind. Jeder Punkt sagt, warum er wartet, was es schon gab und wie man ihn wieder aufnimmt.

## Lokaler Modus für den NSC-Generator (pausiert seit 2026-11-04)

**Warum pausiert:** Die Cloud-Modelle sind deutlich besser. Im Vergleich auf denselben drei NSCs (Topasa, Ralio, Haargh) traf das beste lokale Modell (qwen3:14b auf der RX 6900 XT) die Talente deiner Blöcke zu ≈ 25 % und die SF zu ≈ 7 %, OpenAI gpt-6.1-sol zu ≈ 56 % bzw. 38 % – in halber Zeit. Lokale 14B-Modelle kennen die DSA-4.1-Begriffe kaum, erfinden Namen („Geschicklichkeit“ als Talent, „Common“ als Sprache) und wählen bei der Ausstattung oft daneben. Mit 16 GB VRAM ist kein größeres Modell sinnvoll möglich.

**Was es gab** (letzter Stand: Commit `5577dc6`, im Git-Verlauf vollständig erhalten):

- `tools/llm.sh` + `tools/llm-idle.sh`: Ollama (ROCm) als Podman-Container `vtf-ollama`, nur bei Bedarf gestartet, Leerlauf-Wächter stoppt nach 15 Min. ohne Anfrage oder Download. Modelle in `.llm/ollama/`.
- `packages/nsc-generator/src/llm.ts`: Ollama-Client mit JSON-Schema-Ausgabe, Kontext 24k.
- `packages/nsc-generator/src/knowledge.ts`: Professionsliste aus dem Regelwerk-Index, Vorauswahl nach Stichworten (Überschrift dreifach, seltene Wörter höher, Synonyme wie „Schmid“ → Handwerker, Götter + Weihe-Wort).
- `generateNpc` in `generate.ts`: Profession zweistufig wählen (8 Kandidaten mit Textauszug, sonst alle 252), dann Werte mit Professionspaket, Liturgien des Gottes und Listen gültiger Namen im Prompt, bis 3 Korrekturrunden.
- `tools/regelwerke/index.ts` las dafür zusätzlich Professionen (252 inkl. Akademien), Liturgien je Gott und Grad (1047) und SF-Voraussetzungen (66) aus WdH und Liber Liturgium.
- Modellvergleich: qwen3:14b (gewählt), gemma3:12b, mistral-nemo:12b – Ergebnisse in `docs/nsc-generator.md` im Stand `5577dc6`.

**Erkenntnisse, die beim Wiederaufnehmen helfen:**

- Namen als Enum im Ausgabeschema (≈ 1000 Alternativen) macht Ollama unbrauchbar langsam: die Grammatik läuft auf der CPU, > 5 Minuten pro Antwort.
- Gültige Namen als Liste im Prompt (≈ 4–6k Tokens) + Korrektur mit Vorschlägen + Entfernen am Ende wirkt gut gegen erfundene Namen.
- Die Profession war das größte Problem; die Vorauswahl nach Stichworten hob die Trefferquote deutlich.
- Rootless Podman zeigt in `podman stats` keinen Netzverkehr – Aktivität besser an API-Anfragen im Log und wachsenden Modelldateien erkennen.

**Wieder aufnehmen:** Wenn ein lokales Modell DSA-Begriffe besser kennt (größere Karte, besseres Modell) – Dateien aus `5577dc6` zurückholen (`git show 5577dc6:<pfad>`), als dritten Anbieter neben Claude/OpenAI in `agent.ts` einhängen. Sinnvoller Zwischenschritt: lokales Modell nur für Kreaturen/einfache Gegner, die kaum Fachbegriffe brauchen.

**Aufräumen auf dem PC:** Modell und Container-Image liegen noch auf der Platte, solange du sie nicht löschst: `.llm/ollama/` (qwen3:14b, ≈ 9 GB) und das Podman-Image `docker.io/ollama/ollama:rocm` (≈ 3 GB).

## Texterkennung (OCR) für gescannte PDFs

*Wege des Schwerts* und *Liber Cantiones* enthalten keinen lesbaren Text (nur Glyphen). Bessere PDFs lösen das ohne Code. Alternative: OCR (z. B. Tesseract mit deutschem Sprachpaket) im Indexer für Bücher, die `readable()` ablehnt. Braucht ein Systempaket – vorher fragen.

## Server-Einrichtung testen

Der Sync-Dienst ist für den Manic-Server vorbereitet (`deploy/manic/EINRICHTEN.md`), aber noch nicht auf dem echten Server getestet.

## Weiteres Spielsystem (z. B. D&D 5e)

**Warum es wartet:** Derzeit wird nur DSA 4.1 gespielt. Die Vorarbeit ist erledigt (2026-11-05): Der Kern unter `packages/` kennt kein System, Systeme werden nur in `systems/adapters.ts` und `systems/foundry-hooks.ts` eingetragen, Typecheck, Tests und Build finden sie von selbst.

**Wieder aufnehmen:**

1. Block-Format festlegen (Name, z. B. `dnd-npc`, und Felder: Werte, HP, AC, Angriffe, Zauber) – wie für DSA in `docs/plan.md`.
2. Adapter in `systems/<id>/adapter/` nach der Anleitung in [systems/README.md](../systems/README.md); Foundry-Teil nur, wenn Items über mehr als den Namen gefunden werden sollen.
3. In beide Registries eintragen; `npm test` prüft den Adapter automatisch.
4. Für den E2E-Durchlauf: eigene Test-Notiz in `tools/e2e/fixtures/` und eine Test-Welt mit dem neuen System.
5. Was am Kern hakt, verbessern (Kandidaten: `dataOnCreate`, `BundleItem.source`, `linkedDefault`).

**Bewusst offen:** mehrere Systeme in einer Vault (heute eins pro Vault) und ein Generator für andere Systeme (der DSA-NSC-Generator ist ein eigenes Werkzeug).

## Kleinere Ideen

- Seitenzahlen der Regelwerke als gedruckte statt PDF-Seiten (Versatz je Buch ermitteln).
- Kreaturen aus mehreren gleichen Gegnern („5 Banditen“) als Gruppe erzeugen.
- Kosten für OpenAI-Modelle anzeigen, sobald die Preise je Modell bekannt sind.
