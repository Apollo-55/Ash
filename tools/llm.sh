#!/usr/bin/env bash
# Lokales LLM (Ollama, AMD-GPU über ROCm) – läuft nur bei Bedarf.
#   tools/llm.sh start            Container starten (+ Leerlauf-Wächter)
#   tools/llm.sh stop             Container beenden
#   tools/llm.sh status           läuft er? welche Modelle sind geladen?
#   tools/llm.sh pull <modell>    Modell laden (z. B. qwen3:14b)
#   tools/llm.sh list             geladene Modelle auf der Platte
# Umgebung: LLM_IDLE_MIN (Standard 15) – nach so vielen Minuten ohne Anfrage beendet sich der Container selbst.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
NAME=vtf-ollama
IMAGE=docker.io/ollama/ollama:rocm
PORT=${LLM_PORT:-11434}
IDLE_MIN=${LLM_IDLE_MIN:-15}
URL="http://127.0.0.1:$PORT"

running() { podman container exists "$NAME" && [ "$(podman inspect -f '{{.State.Running}}' "$NAME")" = "true" ]; }

case "${1:-status}" in
  start)
    if running; then echo "läuft bereits auf $URL"; exit 0; fi
    mkdir -p "$root/.llm/ollama"
    podman run -d --rm --name "$NAME" \
      --device /dev/kfd --device /dev/dri --security-opt label=disable \
      -v "$root/.llm/ollama:/root/.ollama" \
      -p "127.0.0.1:$PORT:11434" \
      -e OLLAMA_KEEP_ALIVE=5m \
      "$IMAGE" >/dev/null
    for i in $(seq 1 60); do curl -sf "$URL/api/version" >/dev/null && break; sleep 0.5; done
    echo "läuft auf $URL (beendet sich nach $IDLE_MIN Min. ohne Anfrage)"
    # Leerlauf-Wächter (zählt API-Anfragen und laufende Downloads als Aktivität)
    nohup setsid "$root/tools/llm-idle.sh" "$NAME" "$URL" "$IDLE_MIN" "$root/.llm/ollama/models" >/dev/null 2>&1 &
    ;;
  stop)
    if running; then podman stop "$NAME" >/dev/null && echo "gestoppt"; else echo "lief nicht"; fi
    ;;
  status)
    if running; then
      echo "läuft auf $URL"
      curl -sf "$URL/api/ps" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const m=JSON.parse(s).models||[];console.log(m.length?"geladen: "+m.map(x=>x.name+" ("+(x.size_vram/1e9).toFixed(1)+" GB VRAM)").join(", "):"kein Modell geladen")})'
    else echo "gestoppt"; fi
    ;;
  pull)
    running || "$0" start
    podman exec "$NAME" ollama pull "${2:?Modellname fehlt, z. B. qwen3:14b}"
    ;;
  list)
    running || { echo "Container läuft nicht – erst: $0 start"; exit 1; }
    podman exec "$NAME" ollama list
    ;;
  *) echo "Befehle: start | stop | status | pull <modell> | list"; exit 1 ;;
esac
