#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if [[ ! -x spvenv/bin/python ]]; then
  echo "First run: installing Dilagent..."
  exec ./setup.sh
fi

if ! spvenv/bin/python -c "import uvicorn" >/dev/null 2>&1; then
  echo "Packages are missing. Running setup..."
  exec ./setup.sh
fi

echo "Starting Dilagent at http://127.0.0.1:8000"
echo "Next time, use ./run.sh again. You do not need ./setup.sh unless install is broken."
if command -v open >/dev/null 2>&1; then
  (sleep 2 && open "http://127.0.0.1:8000") &
elif command -v xdg-open >/dev/null 2>&1; then
  (sleep 2 && xdg-open "http://127.0.0.1:8000") &
fi

exec spvenv/bin/python -m uvicorn advisor.main:app --host 127.0.0.1 --port 8000
