#!/bin/bash
cd "$(dirname "$0")"
export VIRTUAL_ENV="$(pwd)/.venv"
export PATH="$VIRTUAL_ENV/bin:$PATH"
exec python -m uvicorn src.main:app --reload --host 0.0.0.0 --port 8000
