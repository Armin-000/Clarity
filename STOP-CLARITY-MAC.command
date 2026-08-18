#!/bin/bash
set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$SCRIPT_DIR/.clarity.pid"
PORT_FILE="$SCRIPT_DIR/.clarity.port"

force_stop_pid() {
  local pid="$1"
  [ -n "$pid" ] || return 0
  kill -0 "$pid" 2>/dev/null || return 0

  kill "$pid" 2>/dev/null || true
  for _ in $(seq 1 15); do
    kill -0 "$pid" 2>/dev/null || return 0
    sleep 0.1
  done

  kill -KILL "$pid" 2>/dev/null || true
}

printf '\nClarity — zaustavljanje\n\n'

STOPPED=0
if [ -f "$PID_FILE" ]; then
  PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
    force_stop_pid "$PID"
    STOPPED=1
  fi
fi

# Rezervno pronađi Clarity proces na zapamćenom portu ako je PID datoteka zastarjela.
if [ "$STOPPED" -eq 0 ] && [ -f "$PORT_FILE" ] && command -v lsof >/dev/null 2>&1; then
  PORT="$(cat "$PORT_FILE" 2>/dev/null || true)"
  if [[ "$PORT" =~ ^[0-9]+$ ]]; then
    PIDS="$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)"
    while IFS= read -r PID; do
      if [ -n "$PID" ]; then
        force_stop_pid "$PID"
        STOPPED=1
      fi
    done <<< "$PIDS"
  fi
fi

rm -f "$PID_FILE" "$PORT_FILE"

if [ "$STOPPED" -eq 1 ]; then
  echo "Clarity je zaustavljen i lokalni port je oslobođen."
else
  echo "Clarity trenutačno nije pokrenut."
fi
