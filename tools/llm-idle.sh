#!/usr/bin/env bash
# Leerlauf-Wächter für tools/llm.sh: stoppt den Ollama-Container, wenn IDLE_MIN Minuten lang
# kein Modell geladen war, keine API-Anfrage kam und kein Modell-Download lief.
# (podman stats zeigt bei rootless-Netz keinen Netzverkehr – daher Log + Dateigröße als Signal.)
NAME=${1:-vtf-ollama}; URL=${2:-http://127.0.0.1:11434}; IDLE_MIN=${3:-15}; MODELS=${4:-}
idle=0; last=""
while podman container exists "$NAME" && [ "$(podman inspect -f '{{.State.Running}}' "$NAME" 2>/dev/null)" = true ]; do
  sleep 60
  # API-Anfragen der letzten Minute, ohne den eigenen /api/ps-Abruf
  requests=$(podman logs --since 65s "$NAME" 2>&1 | grep '\[GIN\]' | grep -vc '/api/ps')
  # Downloads: Größe des Modellordners ändert sich
  size=""; [ -n "$MODELS" ] && size=$(du -sb "$MODELS" 2>/dev/null | cut -f1)
  if curl -sf "$URL/api/ps" | grep -q '"name"' || [ "${requests:-0}" -gt 0 ] || [ "$size" != "$last" ]; then idle=0; else idle=$((idle+1)); fi
  last=$size
  if [ $idle -ge "$IDLE_MIN" ]; then podman stop "$NAME" >/dev/null 2>&1; exit 0; fi
done
