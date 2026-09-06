@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo.
echo  Dilagent first-time setup
echo  -------------------------
echo  Use this once. After it works, start Dilagent with run.bat
echo.

set "PY_CMD="
where py >nul 2>&1
if not errorlevel 1 (
    py -3 -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)" >nul 2>&1
    if not errorlevel 1 set "PY_CMD=py -3"
)
if not defined PY_CMD (
    where python >nul 2>&1
    if errorlevel 1 goto :nopython
    python -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)" >nul 2>&1
    if errorlevel 1 goto :oldpython
    set "PY_CMD=python"
)

if not exist "spvenv\Scripts\python.exe" (
    echo Creating a local virtual environment in spvenv...
    %PY_CMD% -m venv spvenv
    if errorlevel 1 (
        echo Could not create the virtual environment.
        pause
        exit /b 1
    )
)

set "PY=spvenv\Scripts\python.exe"
if not exist "%PY%" (
    echo Virtual environment is missing python.exe.
    pause
    exit /b 1
)

echo Installing Dilagent packages. This can take a few minutes the first time...
"%PY%" -m pip install --upgrade pip --disable-pip-version-check
if errorlevel 1 goto :pipfail
"%PY%" -m pip install -r requirements.txt --disable-pip-version-check
if errorlevel 1 goto :pipfail

if not exist ".env" if exist ".env.example" (
    copy /y ".env.example" ".env" >nul
    echo Created .env from .env.example. Add a Groq or OpenAI key later if you want a written briefing.
)

echo.
echo  Setup finished.
echo  Starting Dilagent at http://127.0.0.1:8000
echo  Next time, double-click run.bat instead of setup.bat.
echo  Leave this window open. Close it to stop the desk.
echo.
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://127.0.0.1:8000"
"%PY%" -m uvicorn advisor.main:app --host 127.0.0.1 --port 8000
set "ERR=%ERRORLEVEL%"
endlocal & exit /b %ERR%

:nopython
echo Python 3.10 or newer is required and was not found on PATH.
echo Install it from https://www.python.org/downloads/ and tick "Add python.exe to PATH".
pause
exit /b 1

:oldpython
echo Python 3.10 or newer is required.
echo Install it from https://www.python.org/downloads/ and tick "Add python.exe to PATH".
pause
exit /b 1

:pipfail
echo Package install failed. Check your internet connection and try setup.bat again.
pause
exit /b 1
