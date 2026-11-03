#!/usr/bin/env bash
# Leerlauf-Wächter für tools/llm.sh: stoppt den Ollama-Container, wenn IDLE_MIN Minuten lang
# kein Modell geladen war UND kein Netzwerk-/CPU-Verkehr lief (Downloads zählen als Aktivität).
NAME=${1:-vtf-ollama}; URL=${2:-http://127.0.0.1:11434}; IDLE_MIN=${3:-15}
idle=0; last=""
while podman container exists "$NAME"; do
  sleep 60
  stats=$(podman stats --no-stream --format '{{.NetIO}}|{{.CPUPerc}}' "$NAME" 2>/dev/null)
  net=${stats%%|*}; cpu=${stats##*|}; cpu=${cpu%%.*}; cpu=${cpu%\%}
  if curl -sf "$URL/api/ps" | grep -q '"name"' || [ "$net" != "$last" ] || [ "${cpu:-0}" -ge 5 ] 2>/dev/null; then idle=0; else idle=$((idle+1)); fi
  last=$net
  if [ $idle -ge "$IDLE_MIN" ]; then podman stop "$NAME" >/dev/null 2>&1; exit 0; fi
done
