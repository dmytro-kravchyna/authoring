#!/usr/bin/env bash
# Start all BIM IDE services for local development
# Usage: ./scripts/dev.sh [--kill]

set -euo pipefail

PORTS=(3000 4000)
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

kill_servers() {
  for port in "${PORTS[@]}"; do
    pids=$(lsof -ti:"$port" 2>/dev/null || true)
    if [ -n "$pids" ]; then
      echo "Killing processes on port $port..."
      echo "$pids" | xargs kill -9 2>/dev/null || true
    fi
  done
  echo "All servers stopped."
}

if [ "${1:-}" = "--kill" ]; then
  kill_servers
  exit 0
fi

# Kill any existing processes on our ports
kill_servers

cd "$ROOT"

echo ""
echo "  BIM IDE — Local Development"
echo "  ==========================="
echo ""

# Start store server in background
echo "  Starting Extension Store server (port 4000)..."
npm run dev:store > /tmp/bim-ide-store.log 2>&1 &
STORE_PID=$!

# Start shell dev server in background
echo "  Starting Shell + Viewer (port 3000)..."
npm run dev > /tmp/bim-ide-shell.log 2>&1 &
SHELL_PID=$!

# Wait for servers to be ready
for i in {1..10}; do
  sleep 1
  READY=true
  for port in "${PORTS[@]}"; do
    if ! lsof -ti:"$port" >/dev/null 2>&1; then
      READY=false
    fi
  done
  if $READY; then break; fi
done

echo ""
echo "  Services:"
echo "    Shell + Viewer:    http://localhost:3000"
echo "    Extension Store:   http://localhost:4000"
echo "    Store API:         http://localhost:4000/api/extensions"
echo "    Health Check:      http://localhost:4000/api/health"
echo ""
echo "  Logs:"
echo "    Shell:  tail -f /tmp/bim-ide-shell.log"
echo "    Store:  tail -f /tmp/bim-ide-store.log"
echo ""
echo "  Stop all:  ./scripts/dev.sh --kill"
echo ""

# Wait for any child to exit
wait
