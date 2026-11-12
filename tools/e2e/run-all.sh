#!/usr/bin/env bash
# Full end-to-end run against the local Foundry (start it first: npm run foundry).
# Works on a fresh copy of the test vault in tools/e2e/vault/, so the run is repeatable and needs
# no private data. Exports, imports and prints the results; screenshots go to dist/e2e/.
set -euo pipefail
cd "$(dirname "$0")/../.."
VAULT=dist/e2e-vault
NAME=e2e-vault
E2E="node tools/e2e/foundry-e2e.mjs"
EXPORT="node tools/export-cli.ts $VAULT"
mkdir -p dist/e2e
rm -rf "$VAULT"
cp -r tools/e2e/vault "$VAULT"
NSC="$VAULT/NSC/Besatzung/Mira Dornhag.md"

node tools/build.mjs >/dev/null
# put the fresh module into the local Foundry (unless that folder is a link to dist/ already)
MODULES="${VTF_FOUNDRY_MODULES:-.foundry/data/Data/modules}"
if [ -d "$MODULES" ] && [ ! -L "$MODULES/vault-to-foundry" ]; then
  rm -rf "$MODULES/vault-to-foundry"
  cp -r dist/foundry-module/vault-to-foundry "$MODULES/vault-to-foundry"
fi

$E2E enable
echo "== 1. Import";                  $EXPORT dist/e2e-1.zip --name $NAME >/dev/null; $E2E import dist/e2e-1.zip | tr -d '\n '; echo
echo "== 2. Prüfen";                  $E2E inspect | tr -d '\n'; echo
echo "== 3. Überschriften-Links";     $E2E anchorclick
echo "== 3b. NSCs";                   $E2E actors > dist/e2e/actors.json; grep -c '"weapons"' dist/e2e/actors.json | sed 's/^/   NSCs mit Waffen: /'
echo "== 3d. Szenen";                 $E2E scenes
echo "== 3c. Spielstand + geänderter Block"
$E2E play
sed -i 's/^LeP: 36$/LeP: 40/; s/Säbel: 18,/Säbel: 19,/; s/, Finte, /, /; s/Neid: 8/Neid: 9/' "$NSC"
$EXPORT dist/e2e-nsc.zip --name $NAME >/dev/null; $E2E import dist/e2e-nsc.zip | tr -d '\n '; echo
echo "   erwartet LeP 20/40, Hand-Item + Effekt da, Säbel-TaW 19, Finte weg, Neid 9:"; $E2E playcheck
cp "tools/e2e/vault/NSC/Besatzung/Mira Dornhag.md" "$NSC"
echo "== 4. Secret aufdecken";        $E2E reveal
sed -i 's/^Privat: %%darf nie in Foundry landen%%$/&\nNeuer Satz nach dem Aufdecken./' "$VAULT/Test/Alles.md"
echo "== 5. Geänderte Notiz";         $EXPORT dist/e2e-2.zip --name $NAME >/dev/null; $E2E import dist/e2e-2.zip | tr -d '\n '; echo
echo "   Secret noch aufgedeckt?";    $E2E check
echo "== 6. Unverändert erneut";      $E2E import dist/e2e-2.zip | tr -d '\n '; echo
echo "== 7. Verwaist + Löschen";      $EXPORT dist/e2e-3.zip --name $NAME --exclude Test/ >/dev/null; $E2E orphans dist/e2e-3.zip
echo "== 8. Wiederherstellen";        $E2E import dist/e2e-2.zip | tr -d '\n '; echo
$E2E shots
$E2E actorshots
echo "Screenshots: dist/e2e/"
