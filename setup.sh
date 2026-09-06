#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

echo
echo " Dilagent first-time setup"
echo " -------------------------"
echo " Use this once. After it works, start Dilagent with ./run.sh"
echo

PY=""
if command -v python3 >/dev/null 2>&1; then
  PY=python3
elif command -v python >/dev/null 2>&1; then
  PY=python
else
  echo "Python 3.10 or newer is required."
  echo "Install Python, then run this script again."
  exit 1
fi

"$PY" -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)" || {
  echo "Python 3.10 or newer is required. Found: $("$PY" -V)"
  exit 1
}

if [[ ! -x spvenv/bin/python ]]; then
  echo "Creating a local virtual environment in spvenv..."
  "$PY" -m venv spvenv
fi

echo "Installing Dilagent packages. This can take a few minutes the first time..."
spvenv/bin/python -m pip install --upgrade pip --disable-pip-version-check
spvenv/bin/python -m pip install -r requirements.txt --disable-pip-version-check

if [[ ! -f .env && -f .env.example ]]; then
  cp .env.example .env
  echo "Created .env from .env.example. Add a Groq or OpenAI key later if you want a written briefing."
fi

echo
echo " Setup finished."
echo " Starting Dilagent at http://127.0.0.1:8000"
echo " Next time, run ./run.sh instead of ./setup.sh."
echo " Leave this terminal open. Press Ctrl+C to stop the desk."
echo

if command -v open >/dev/null 2>&1; then
  (sleep 2 && open "http://127.0.0.1:8000") &
elif command -v xdg-open >/dev/null 2>&1; then
  (sleep 2 && xdg-open "http://127.0.0.1:8000") &
fi

exec spvenv/bin/python -m uvicorn advisor.main:app --host 127.0.0.1 --port 8000
