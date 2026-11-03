#!/usr/bin/env bash
# Starts the local Foundry test instance (.foundry/, gitignored) on port 30013.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
app="$(ls -d "$root"/.foundry/app/FoundryVTT-Node-*/ | sort -V | tail -1)"; app="${app%/}"
exec node "$app/main.js" --dataPath="$root/.foundry/data" --port="${VTF_FOUNDRY_PORT:-30013}" --noupnp
