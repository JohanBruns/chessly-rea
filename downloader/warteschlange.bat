@echo off
rem Arbeitet die Kurse ab, die in der App hinzugefuegt wurden. Fenster offen lassen.
cd /d "%~dp0"

if not exist .venv\Scripts\python.exe (
    echo Bitte zuerst setup.bat ausfuehren.
    pause
    exit /b 1
)

.venv\Scripts\python.exe queue_worker.py
pause
