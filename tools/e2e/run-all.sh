#!/usr/bin/env bash
# Full end-to-end run against the local Foundry (start it first: tools/foundry-local.sh).
# Uses the test vault copy only. Resets the test note, exports, imports and checks the results.
set -euo pipefail
cd "$(dirname "$0")/../.."
E2E="node tools/e2e/foundry-e2e.mjs"
EXPORT="node tools/export-cli.ts test-vault"
mkdir -p test-vault/Test dist
cp tools/e2e/fixtures/Alles.md test-vault/Test/Alles.md
cp tools/e2e/fixtures/Szenen.md test-vault/Test/Szenen.md
cp "tools/e2e/fixtures/Sabotage NSC.md" "test-vault/Test/Sabotage NSC.md"
SH="test-vault/NPC/Besatzung/Shahane ay Zedrakin.md"
grep -q '```dsa-nsc' "$SH" || cat tools/e2e/fixtures/shahane-block.md >> "$SH"

node tools/build.mjs >/dev/null
$E2E enable
echo "== 1. Import";                  $EXPORT dist/e2e-1.zip --name kampagne >/dev/null; $E2E import dist/e2e-1.zip | tr -d '\n '; echo
echo "== 2. Prüfen";                  $E2E inspect | tr -d '\n'; echo
echo "== 3. Überschriften-Links";     $E2E anchorclick
echo "== 3b. NSCs";                   $E2E actors > dist/e2e/actors.json; grep -c '"weapons"' dist/e2e/actors.json | sed 's/^/   NSCs mit Waffen: /'
echo "== 3d. Szenen";                  $E2E scenes
echo "== 3c. Spielstand + geänderter Block"
$E2E play
SH="test-vault/NPC/Besatzung/Shahane ay Zedrakin.md"; mkdir -p dist; cp "$SH" dist/shahane.md.bak
sed -i 's/^LeP: 36$/LeP: 40/; s/Säbel: 18,/Säbel: 19,/; s/, Finte, /, /; s/Neid: 8/Neid: 9/' "$SH"
$EXPORT dist/e2e-nsc.zip --name kampagne >/dev/null; $E2E import dist/e2e-nsc.zip | tr -d '\n '; echo
echo "   erwartet LeP 20/40, Hand-Item + Effekt da, Säbel-TaW 19, Finte weg, Neid 9:"; $E2E playcheck
mv dist/shahane.md.bak "$SH"
echo "== 4. Secret aufdecken";        $E2E reveal
sed -i 's/^Privat: %%darf nie in Foundry landen%%$/&\nNeuer Satz nach dem Aufdecken./' test-vault/Test/Alles.md
echo "== 5. Geänderte Notiz";         $EXPORT dist/e2e-2.zip --name kampagne >/dev/null; $E2E import dist/e2e-2.zip | tr -d '\n '; echo
echo "   Secret noch aufgedeckt?";   $E2E check
echo "== 6. Unverändert erneut";      $E2E import dist/e2e-2.zip | tr -d '\n '; echo
echo "== 7. Verwaist + Löschen";      $EXPORT dist/e2e-3.zip --name kampagne --exclude Test/ >/dev/null; $E2E orphans dist/e2e-3.zip
echo "== 8. Wiederherstellen";        $E2E import dist/e2e-2.zip | tr -d '\n '; echo
$E2E shots
$E2E actorshots
echo "Screenshots: dist/e2e/"
