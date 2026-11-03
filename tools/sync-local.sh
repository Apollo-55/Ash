#!/usr/bin/env bash
# Starts vtf-sync locally in front of the local test Foundry (.foundry/), port 8787.
# The token is created once in .foundry/sync-token (gitignored).
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
tokfile="$root/.foundry/sync-token"
[ -s "$tokfile" ] || openssl rand -hex 24 > "$tokfile"
mkdir -p "$root/.foundry/data/Data/vault-to-foundry"
echo "Token für Obsidian: $(cat "$tokfile")"
echo "Server-Adresse:     http://127.0.0.1:${VTF_PORT:-8787}"
VTF_TOKEN="$(cat "$tokfile")" VTF_DATA_DIR="$root/.foundry/data/Data/vault-to-foundry" VTF_PORT="${VTF_PORT:-8787}" \
  exec node "$root/packages/sync-service/server.mjs"
