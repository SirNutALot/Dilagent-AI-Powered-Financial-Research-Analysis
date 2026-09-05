@echo off
setlocal
cd /d "%~dp0"

if exist "spvenv\Scripts\python.exe" (
    set "PY=spvenv\Scripts\python.exe"
) else (
    set "PY=python"
)

echo Starting Dilagent at http://127.0.0.1:8000
start "" "http://127.0.0.1:8000"
"%PY%" -m uvicorn advisor.main:app --host 127.0.0.1 --port 8000
endlocal
