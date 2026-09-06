@echo off
setlocal
cd /d "%~dp0"

if not exist "spvenv\Scripts\python.exe" (
    echo First run: installing Dilagent...
    call "%~dp0setup.bat"
    exit /b %ERRORLEVEL%
)

set "PY=spvenv\Scripts\python.exe"
"%PY%" -c "import uvicorn" >nul 2>&1
if errorlevel 1 (
    echo Packages are missing. Running setup...
    call "%~dp0setup.bat"
    exit /b %ERRORLEVEL%
)

echo Starting Dilagent at http://127.0.0.1:8000
echo Next time, use run.bat again. You do not need setup.bat unless install is broken.
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://127.0.0.1:8000"
"%PY%" -m uvicorn advisor.main:app --host 127.0.0.1 --port 8000
endlocal
