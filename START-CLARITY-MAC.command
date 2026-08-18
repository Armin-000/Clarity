#!/bin/bash
set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

APP_VERSION="3.5.2"
BASE_PORT=8768
MAX_PORT=8798
PID_FILE="$SCRIPT_DIR/.clarity.pid"
PORT_FILE="$SCRIPT_DIR/.clarity.port"
LOG_FILE="$SCRIPT_DIR/clarity.log"

port_has_listener() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
  else
    # macOS standardno ima lsof. Ovaj rezervni test koristi bash TCP samo ako postoji.
    (echo >/dev/tcp/127.0.0.1/"$port") >/dev/null 2>&1
  fi
}

health_matches() {
  local port="$1"
  curl -fsS --max-time 2 "http://127.0.0.1:${port}/clarity-health.json" 2>/dev/null \
    | grep -q "\"version\":\"${APP_VERSION}\""
}

health_is_clarity() {
  local port="$1"
  curl -fsS --max-time 2 "http://127.0.0.1:${port}/clarity-health.json" 2>/dev/null \
    | grep -q '"app":"Clarity Accessibility"'
}

open_clarity() {
  local port="$1"
  local url="http://127.0.0.1:${port}/?v=${APP_VERSION}"
  if [ -d "/Applications/Google Chrome.app" ]; then
    open -a "Google Chrome" "$url"
  else
    open "$url"
  fi
}

force_stop_pid() {
  local pid="$1"
  [ -n "$pid" ] || return 0
  kill -0 "$pid" 2>/dev/null || return 0

  kill "$pid" 2>/dev/null || true
  for _ in $(seq 1 15); do
    kill -0 "$pid" 2>/dev/null || return 0
    sleep 0.1
  done

  # Chrome može držati otvorenu vezu, zbog čega Nodeov uredan shutdown ponekad čeka.
  # U tom slučaju proces prisilno završavamo kako bi se port sigurno oslobodio.
  kill -KILL "$pid" 2>/dev/null || true
  for _ in $(seq 1 10); do
    kill -0 "$pid" 2>/dev/null || return 0
    sleep 0.1
  done
}

stop_clarity_on_port() {
  local port="$1"
  command -v lsof >/dev/null 2>&1 || return 0

  local pids
  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  [ -n "$pids" ] || return 0

  while IFS= read -r pid; do
    [ -n "$pid" ] && force_stop_pid "$pid"
  done <<< "$pids"
}

find_free_port() {
  local port
  for port in $(seq "$BASE_PORT" "$MAX_PORT"); do
    if ! port_has_listener "$port"; then
      echo "$port"
      return 0
    fi
  done
  return 1
}

printf '\n====================================================\n'
printf '  Clarity 3.5.2 — Privatnost i pristupačnost\n'
printf '====================================================\n\n'

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js nije pronađen. Instaliraj aktualni Node.js i ponovno pokreni ovu datoteku."
  echo "Clarity ne koristi npm, node_modules ni esbuild — Node služi samo kao mali lokalni server."
  echo
  read -r -p "Pritisni Enter za zatvaranje..." _
  exit 1
fi

if [ ! -f "$SCRIPT_DIR/server.mjs" ] || [ ! -f "$SCRIPT_DIR/build/index.html" ]; then
  echo "Nedostaju datoteke aplikacije. Ponovno raspakiraj cijeli Clarity ZIP u novu mapu."
  echo
  read -r -p "Pritisni Enter za zatvaranje..." _
  exit 1
fi

# Ako je upravo ova kopija već pokrenuta, samo je ponovno otvaramo.
if [ -f "$PID_FILE" ] && [ -f "$PORT_FILE" ]; then
  SAVED_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  SAVED_PORT="$(cat "$PORT_FILE" 2>/dev/null || true)"
  if [ -n "$SAVED_PID" ] && kill -0 "$SAVED_PID" 2>/dev/null \
      && [[ "$SAVED_PORT" =~ ^[0-9]+$ ]] && health_matches "$SAVED_PORT"; then
    echo "Clarity je već pokrenut na portu $SAVED_PORT. Otvaram Google Chrome..."
    open_clarity "$SAVED_PORT"
    exit 0
  fi
  rm -f "$PID_FILE" "$PORT_FILE"
fi

PORT="$BASE_PORT"

# Ako je osnovni port zauzela starija Clarity kopija, ugasimo je.
if port_has_listener "$PORT" && health_is_clarity "$PORT"; then
  echo "Pronađena je ranije pokrenuta Clarity verzija na portu $PORT. Zaustavljam je..."
  stop_clarity_on_port "$PORT"
  sleep 0.2
fi

# Ako port još uvijek koristi druga aplikacija, Clarity sam bira sljedeći slobodan port.
if port_has_listener "$PORT"; then
  PORT="$(find_free_port || true)"
  if [ -z "$PORT" ]; then
    echo "Nije pronađen slobodan lokalni port između $BASE_PORT i $MAX_PORT."
    echo "Zatvori druge lokalne servere i ponovno pokušaj."
    echo
    read -r -p "Pritisni Enter za zatvaranje..." _
    exit 1
  fi
  echo "Port $BASE_PORT koristi druga aplikacija. Clarity će se pokrenuti na portu $PORT."
fi

rm -f "$LOG_FILE"
CLARITY_PORT="$PORT" nohup node "$SCRIPT_DIR/server.mjs" > "$LOG_FILE" 2>&1 &
SERVER_PID=$!
echo "$SERVER_PID" > "$PID_FILE"
echo "$PORT" > "$PORT_FILE"

for _ in $(seq 1 40); do
  if health_matches "$PORT"; then
    echo "Clarity je uspješno pokrenut na portu $PORT. Otvaram Google Chrome..."
    open_clarity "$PORT"
    echo
    echo "Terminal sada možeš zatvoriti. Za potpuno gašenje koristi STOP-CLARITY-MAC.command."
    exit 0
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then break; fi
  sleep 0.2
done

echo "Clarity se nije mogao pokrenuti. Detalji:"
echo "----------------------------------------------------"
cat "$LOG_FILE" 2>/dev/null || true
echo "----------------------------------------------------"
force_stop_pid "$SERVER_PID"
rm -f "$PID_FILE" "$PORT_FILE"
echo
read -r -p "Pritisni Enter za zatvaranje..." _
exit 1
