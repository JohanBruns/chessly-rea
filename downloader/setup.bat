@echo off
rem Einmalige Einrichtung: virtuelle Umgebung, Pakete und Chromium installieren.
cd /d "%~dp0"

echo [1/3] Virtuelle Umgebung anlegen ...
python -m venv .venv
if errorlevel 1 (
    echo Python wurde nicht gefunden. Bitte Python von python.org installieren
    echo und beim Installieren "Add python.exe to PATH" anhaken.
    pause
    exit /b 1
)

echo [2/3] Pakete installieren ...
.venv\Scripts\python -m pip install --upgrade pip
.venv\Scripts\python -m pip install --upgrade -r requirements.txt
if errorlevel 1 (
    echo Fehler beim Installieren der Pakete.
    pause
    exit /b 1
)

echo [3/3] Chromium fuer Playwright installieren ...
.venv\Scripts\python -m playwright install chromium
if errorlevel 1 (
    echo Fehler beim Installieren von Chromium.
    pause
    exit /b 1
)

echo.
echo Fertig! Starte das Tool jetzt mit start.bat
pause
