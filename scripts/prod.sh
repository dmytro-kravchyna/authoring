#!/usr/bin/env bash
# Start the BIM IDE shell pointing at the Vercel production backend
# Usage: ./scripts/prod.sh
#        PROD_URL=https://my-app.vercel.app ./scripts/prod.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT=3000

PROD_URL="${PROD_URL:-https://authoring-eight.vercel.app}"

# Kill any existing process on the dev port
pids=$(lsof -ti:"$PORT" 2>/dev/null || true)
if [ -n "$pids" ]; then
  echo "Killing processes on port $PORT..."
  echo "$pids" | xargs kill -9 2>/dev/null || true
fi

cd "$ROOT"

echo ""
echo "  BIM IDE — Production Backend"
echo "  ============================="
echo ""
echo "  Backend:  $PROD_URL"
echo ""

# Start shell dev server with production store URL
VITE_STORE_URL="${PROD_URL}/api" npm run dev > /tmp/bim-ide-shell.log 2>&1 &
SHELL_PID=$!

# Wait for server to be ready
for i in {1..10}; do
  sleep 1
  if lsof -ti:"$PORT" >/dev/null 2>&1; then break; fi
done

echo "  Services:"
echo "    Shell + Viewer:    http://localhost:$PORT"
echo "    Store API (prod):  ${PROD_URL}/api/extensions"
echo ""
echo "  Logs:"
echo "    Shell:  tail -f /tmp/bim-ide-shell.log"
echo ""
echo "  Stop:  kill $SHELL_PID"
echo ""

wait
