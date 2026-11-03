#!/usr/bin/env bash
# Full end-to-end run against the local Foundry (start it first: tools/foundry-local.sh).
# Uses the test vault copy only. Resets the test note, exports, imports and checks the results.
set -euo pipefail
cd "$(dirname "$0")/../.."
E2E="node tools/e2e/foundry-e2e.mjs"
EXPORT="node tools/export-cli.ts test-vault"
mkdir -p test-vault/Test dist
cp tools/e2e/fixtures/Alles.md test-vault/Test/Alles.md

node tools/build.mjs >/dev/null
$E2E enable
echo "== 1. Import";                  $EXPORT dist/e2e-1.zip --name uthuria-ob >/dev/null; $E2E import dist/e2e-1.zip | tr -d '\n '; echo
echo "== 2. Prüfen";                  $E2E inspect | tr -d '\n'; echo
echo "== 3. Überschriften-Links";     $E2E anchorclick
echo "== 4. Secret aufdecken";        $E2E reveal
sed -i 's/^Privat: %%darf nie in Foundry landen%%$/&\nNeuer Satz nach dem Aufdecken./' test-vault/Test/Alles.md
echo "== 5. Geänderte Notiz";         $EXPORT dist/e2e-2.zip --name uthuria-ob >/dev/null; $E2E import dist/e2e-2.zip | tr -d '\n '; echo
echo "   Secret noch aufgedeckt?";   $E2E check
echo "== 6. Unverändert erneut";      $E2E import dist/e2e-2.zip | tr -d '\n '; echo
echo "== 7. Verwaist + Löschen";      $EXPORT dist/e2e-3.zip --name uthuria-ob --exclude Test/ >/dev/null; $E2E orphans dist/e2e-3.zip
echo "== 8. Wiederherstellen";        $E2E import dist/e2e-2.zip | tr -d '\n '; echo
$E2E shots
echo "Screenshots: dist/e2e/"
